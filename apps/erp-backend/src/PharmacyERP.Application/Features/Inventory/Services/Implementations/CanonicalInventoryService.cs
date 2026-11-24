namespace PharmacyERP.Application.Features.Inventory.Services.Implementations;

/// <summary>
/// Projects tenant- and branch-scoped stock balances into the canonical inventory read feed,
/// computing sellable availability and weighted-average base unit costs per (product, location).
/// </summary>
public class CanonicalInventoryService : ICanonicalInventoryService
{
    private readonly ICurrentUser _currentUser;
    private readonly IStockBalanceRepository _stockBalanceRepository;
    private readonly IBranchRepository _branchRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ITenantContext _tenantContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IOrganizationRepository? _organizationRepository;

    public CanonicalInventoryService(
        ICurrentUser currentUser,
        IStockBalanceRepository stockBalanceRepository,
        IBranchRepository branchRepository,
        IDateTimeProvider dateTimeProvider,
        ITenantContext tenantContext,
        IUnitOfWork unitOfWork,
        IOrganizationRepository? organizationRepository = null)
    {
        _currentUser = currentUser;
        _stockBalanceRepository = stockBalanceRepository;
        _branchRepository = branchRepository;
        _dateTimeProvider = dateTimeProvider;
        _tenantContext = tenantContext;
        _unitOfWork = unitOfWork;
        _organizationRepository = organizationRepository;
    }

    public async Task<Result<PagedResult<CanonicalInventoryItemDto>>> GetCanonicalInventoryAsync(
        Guid organizationId,
        Guid branchId,
        Guid? productId,
        DateTimeOffset? updatedSince,
        long? cursor,
        int pageSize,
        CancellationToken ct)
    {
        if (!_tenantContext.OrganizationId.HasValue || _tenantContext.OrganizationId.Value == Guid.Empty)
        {
            return Result<PagedResult<CanonicalInventoryItemDto>>.Failure(
                ErrorCode.UNAUTHORIZED,
                ErrorMessages.Unauthorized);
        }

        var tenantOrganizationId = _tenantContext.OrganizationId.Value;
        if (organizationId != Guid.Empty && organizationId != tenantOrganizationId)
        {
            return Result<PagedResult<CanonicalInventoryItemDto>>.Failure(
                ErrorCode.FORBIDDEN,
                ErrorMessages.Forbidden);
        }

        if (branchId == Guid.Empty)
        {
            return Result<PagedResult<CanonicalInventoryItemDto>>.Failure(
                ErrorCode.VALIDATION_ERROR,
                ErrorMessages.InvalidBranchId,
                new[] { new ApiErrorDetailDto("branch_id", ErrorMessages.InvalidBranchId) });
        }

        var resolvedPageSize = pageSize <= 0 ? 100 : Math.Min(pageSize, 1000);
        var offset = cursor.HasValue && cursor.Value > 0 ? (int)Math.Min(cursor.Value, int.MaxValue) : 0;

        // Explicit read transaction ensures TenantRlsConnectionInterceptor sets the tenant GUC for PostgreSQL FORCE RLS.
        var ownsTransaction = !_unitOfWork.HasActiveTransaction;
        try
        {
            if (ownsTransaction)
            {
                await _unitOfWork.BeginTransactionAsync(ct);
            }

            // Verify branch belongs to the authenticated tenant before checking branch scope
            // (ALL-scope Admins pass CanAccessBranch for any GUID).
            var branch = await _branchRepository.GetByIdAsync(tenantOrganizationId, branchId, ct);
            if (branch is null)
            {
                return Result<PagedResult<CanonicalInventoryItemDto>>.Failure(
                    ErrorCode.NOT_FOUND,
                    ErrorMessages.NotFound);
            }

            if (!_currentUser.CanAccessBranch(branchId))
            {
                return Result<PagedResult<CanonicalInventoryItemDto>>.Failure(
                    ErrorCode.FORBIDDEN_BRANCH,
                    ErrorMessages.ForbiddenBranchAccess);
            }

            var organization = _organizationRepository is not null
                ? await _organizationRepository.GetByIdAsync(tenantOrganizationId, ct)
                : null;
            var timeZoneId = string.IsNullOrWhiteSpace(organization?.TimeZoneId) ? "UTC" : organization.TimeZoneId;
            var businessDate = _dateTimeProvider.GetOrganizationBusinessDate(timeZoneId);

            var (balances, totalGroups, hasMore) = await _stockBalanceRepository.GetCanonicalInventoryPageAsync(
                tenantOrganizationId, branchId, productId, updatedSince, offset, resolvedPageSize, ct);

            var items = balances
                .GroupBy(balance => new { balance.OrganizationId, balance.Location.BranchId, balance.Batch.ProductId, balance.LocationId })
                .Select(group =>
                {
                    var firstBalance = group.First();

                    var lots = group.Select(balance =>
                    {
                        bool isAvailable = balance.Location.IsSellable && balance.Location.IsActive && balance.Batch.IsEligibleForSale(businessDate);
                        return new CanonicalInventoryLotDto(
                            BatchId: balance.BatchId,
                            BatchNumber: balance.Batch.BatchNumber,
                            QuantityOnHandBase: balance.OnHandQtyBase,
                            AvailableQuantityBase: isAvailable ? balance.OnHandQtyBase : 0m,
                            ManufacturedOn: balance.Batch.ManufacturedOn,
                            ExpiresOn: balance.Batch.ExpiresOn,
                            QualityStatus: balance.Batch.QualityStatus.ToString()
                        );
                    }).ToList();

                    var totalOnHand = lots.Sum(lot => lot.QuantityOnHandBase);
                    var totalAvailable = lots.Sum(lot => lot.AvailableQuantityBase);

                    var averageUnitCostBase = totalOnHand > 0
                        ? Math.Round(group.Sum(balance => balance.OnHandQtyBase * balance.AverageUnitCost) / totalOnHand, 4, MidpointRounding.AwayFromZero)
                        : 0m;

                    return new CanonicalInventoryItemDto(
                        OrganizationId: group.Key.OrganizationId,
                        BranchId: group.Key.BranchId,
                        ProductId: group.Key.ProductId,
                        LocationId: group.Key.LocationId,
                        BaseUomCode: firstBalance.Batch.Product.BaseUomCode,
                        QuantityOnHandBase: totalOnHand,
                        AvailableQuantityBase: totalAvailable,
                        AverageUnitCostBase: averageUnitCostBase,
                        ReorderPointBase: firstBalance.Batch.Product.ReorderRules
                            .FirstOrDefault(rule => rule.BranchId == branchId && rule.IsActive)?.ReorderPointBase,
                        Lots: lots,
                        UpdatedAt: group.Max(balance => balance.UpdatedAt)
                    );
                })
                .OrderBy(item => item.ProductId).ThenBy(item => item.LocationId)
                .ToList();

            var page = (offset / resolvedPageSize) + 1;
            string? nextCursor = hasMore
                ? (offset + items.Count).ToString()
                : null;

            var pagedResult = new PagedResult<CanonicalInventoryItemDto>(
                Items: items,
                Page: page,
                PageSize: resolvedPageSize,
                TotalCount: totalGroups,
                NextCursor: nextCursor
            );

            return Result<PagedResult<CanonicalInventoryItemDto>>.Success(pagedResult);
        }
        finally
        {
            if (ownsTransaction && _unitOfWork.HasActiveTransaction)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            }
        }
    }
}