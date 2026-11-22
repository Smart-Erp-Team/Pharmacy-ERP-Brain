namespace PharmacyERP.Application.Features.Inventory.Services.Implementations;

public class CanonicalInventoryService : ICanonicalInventoryService
{
    private readonly ICurrentUser _currentUser;
    private readonly IStockBalanceRepository _stockBalanceRepository;
    private readonly IBranchRepository _branchRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ITenantContext _tenantContext;
    private readonly IUnitOfWork _unitOfWork;

    public CanonicalInventoryService(
        ICurrentUser currentUser,
        IStockBalanceRepository stockBalanceRepository,
        IBranchRepository branchRepository,
        IDateTimeProvider dateTimeProvider,
        ITenantContext tenantContext,
        IUnitOfWork unitOfWork)
    {
        _currentUser = currentUser;
        _stockBalanceRepository = stockBalanceRepository;
        _branchRepository = branchRepository;
        _dateTimeProvider = dateTimeProvider;
        _tenantContext = tenantContext;
        _unitOfWork = unitOfWork;
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

        var tenantOrgId = _tenantContext.OrganizationId.Value;
        if (organizationId != Guid.Empty && organizationId != tenantOrgId)
        {
            return Result<PagedResult<CanonicalInventoryItemDto>>.Failure(
                ErrorCode.FORBIDDEN,
                ErrorMessages.Forbidden);
        }

        if (branchId == Guid.Empty)
        {
            return Result<PagedResult<CanonicalInventoryItemDto>>.Failure(
                ErrorCode.VALIDATION_ERROR,
                ErrorMessages.InvalidBranchId);
        }

        var resolvedPageSize = pageSize <= 0 ? 100 : Math.Min(pageSize, 1000);
        var offset = cursor.HasValue && cursor.Value > 0 ? (int)Math.Min(cursor.Value, int.MaxValue) : 0;

        var ownsTransaction = !_unitOfWork.HasActiveTransaction;
        try
        {
            if (ownsTransaction)
            {
                await _unitOfWork.BeginTransactionAsync(ct);
            }

            // Verify branch belongs to the authenticated tenant before checking branch scope
            // (ALL-scope Admins pass CanAccessBranch for any GUID).
            var branch = await _branchRepository.GetByIdAsync(tenantOrgId, branchId, ct);
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

            var businessDate = _dateTimeProvider.GetOrganizationBusinessDate("UTC");

            var (balances, totalGroups, hasMore) = await _stockBalanceRepository.GetCanonicalInventoryPageAsync(
                tenantOrgId, branchId, productId, updatedSince, offset, resolvedPageSize, ct);

            var items = balances
                .GroupBy(b => new { b.OrganizationId, b.Location.BranchId, b.Batch.ProductId, b.LocationId })
                .Select(g =>
                {
                    var firstBalance = g.First();

                    var lots = g.Select(b =>
                    {
                        bool isAvailable = b.Location.IsSellable && b.Location.IsActive && b.Batch.IsEligibleForSale(businessDate);
                        return new CanonicalInventoryLotDto(
                            BatchId: b.BatchId,
                            BatchNumber: b.Batch.BatchNumber,
                            QuantityOnHandBase: b.OnHandQtyBase,
                            AvailableQuantityBase: isAvailable ? b.OnHandQtyBase : 0m,
                            ManufacturedOn: b.Batch.ManufacturedOn,
                            ExpiresOn: b.Batch.ExpiresOn,
                            QualityStatus: b.Batch.QualityStatus.ToString()
                        );
                    }).ToList();

                    var totalOnHand = lots.Sum(l => l.QuantityOnHandBase);
                    var totalAvailable = lots.Sum(l => l.AvailableQuantityBase);

                    var averageUnitCostBase = totalOnHand > 0
                        ? Math.Round(g.Sum(b => b.OnHandQtyBase * b.AverageUnitCost) / totalOnHand, 4, MidpointRounding.AwayFromZero)
                        : 0m;

                    return new CanonicalInventoryItemDto(
                        OrganizationId: g.Key.OrganizationId,
                        BranchId: g.Key.BranchId,
                        ProductId: g.Key.ProductId,
                        LocationId: g.Key.LocationId,
                        BaseUomCode: firstBalance.Batch.Product.BaseUomCode,
                        QuantityOnHandBase: totalOnHand,
                        AvailableQuantityBase: totalAvailable,
                        AverageUnitCostBase: averageUnitCostBase,
                        ReorderPointBase: firstBalance.Batch.Product.ReorderRules
                            .FirstOrDefault(r => r.BranchId == branchId && r.IsActive)?.ReorderPointBase,
                        Lots: lots,
                        UpdatedAt: g.Max(b => b.UpdatedAt)
                    );
                })
                .OrderBy(x => x.ProductId).ThenBy(x => x.LocationId)
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