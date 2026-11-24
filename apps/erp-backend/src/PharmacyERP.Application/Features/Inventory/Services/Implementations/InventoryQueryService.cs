namespace PharmacyERP.Application.Features.Inventory.Services.Implementations;

/// <summary>
/// Provides read-only queries for inventory batches, stock balances, product summaries,
/// and ledger transaction history under explicit tenant RLS read transactions.
/// </summary>
public class InventoryQueryService : IInventoryQueryService
{
    private readonly IStockBalanceRepository _stockRepo;
    private readonly IInventoryTxnRepository _txnRepo;
    private readonly IInventoryBatchRepository _batchRepo;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenantContext;
    private readonly ICurrentUser _currentUser;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IOrganizationRepository? _organizationRepo;

    public InventoryQueryService(
        IStockBalanceRepository stockRepo,
        IInventoryTxnRepository txnRepo,
        IInventoryBatchRepository batchRepo,
        IUnitOfWork unitOfWork,
        ITenantContext tenantContext,
        ICurrentUser currentUser,
        IDateTimeProvider dateTimeProvider,
        IOrganizationRepository? organizationRepo = null)
    {
        _stockRepo = stockRepo;
        _txnRepo = txnRepo;
        _batchRepo = batchRepo;
        _unitOfWork = unitOfWork;
        _tenantContext = tenantContext;
        _currentUser = currentUser;
        _dateTimeProvider = dateTimeProvider;
        _organizationRepo = organizationRepo;
    }

    public async Task<Result<PagedResult<InventoryBatchDto>>> GetBatchesAsync(
        Guid? productId,
        BatchQualityStatus? status,
        DateOnly? expiringBefore,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue || _tenantContext.OrganizationId.Value == Guid.Empty)
            return Result<PagedResult<InventoryBatchDto>>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        var pageErrors = ValidatePagination(page, pageSize);
        if (pageErrors.Count > 0)
            return Result<PagedResult<InventoryBatchDto>>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, pageErrors);

        Guid organizationId = _tenantContext.OrganizationId.Value;
        // Explicit read transaction binds the tenant GUC for PostgreSQL FORCE ROW LEVEL SECURITY.
        var ownsTransaction = !_unitOfWork.HasActiveTransaction;

        try
        {
            if (ownsTransaction)
            {
                await _unitOfWork.BeginTransactionAsync(ct);
            }

            var pagedBatches = await _batchRepo.GetPagedAsync(organizationId, productId, status, expiringBefore, page, pageSize, ct);
            var batchDtos = pagedBatches.Items.Select(batch => new InventoryBatchDto(
                batch.BatchId,
                batch.OrganizationId,
                batch.ProductId,
                batch.BatchNumber,
                batch.ManufacturedOn,
                batch.ExpiresOn,
                batch.QualityStatus,
                batch.UpdatedAt)).ToList();

            return Result<PagedResult<InventoryBatchDto>>.Success(
                new PagedResult<InventoryBatchDto>(
                    Items: batchDtos,
                    Page: pagedBatches.Page,
                    PageSize: pagedBatches.PageSize,
                    TotalCount: pagedBatches.TotalCount));
        }
        finally
        {
            if (ownsTransaction && _unitOfWork.HasActiveTransaction)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            }
        }
    }

    public async Task<Result<IReadOnlyList<StockBalanceDto>>> GetBalancesAsync(Guid branchId, Guid? productId, Guid? locationId, Guid? batchId, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue || _tenantContext.OrganizationId.Value == Guid.Empty)
            return Result<IReadOnlyList<StockBalanceDto>>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (branchId == Guid.Empty)
            return Result<IReadOnlyList<StockBalanceDto>>.Failure(
                ErrorCode.VALIDATION_ERROR,
                ErrorMessages.ValidationError,
                new[] { new ApiErrorDetailDto("branch_id", "BranchId is required.") });

        if (!_currentUser.CanAccessBranch(branchId))
            return Result<IReadOnlyList<StockBalanceDto>>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        Guid orgId = _tenantContext.OrganizationId.Value;
        var ownsTransaction = !_unitOfWork.HasActiveTransaction;

        try
        {
            if (ownsTransaction)
            {
                await _unitOfWork.BeginTransactionAsync(ct);
            }

            var timeZoneId = await ResolveOrganizationTimeZoneIdAsync(orgId, ct);
            var balances = await _stockRepo.GetBalancesWithDetailsAsync(orgId, branchId, productId, locationId, batchId, ct);
            var businessDate = _dateTimeProvider.GetOrganizationBusinessDate(timeZoneId);

            var balanceDtos = balances.Select(balance => MapToStockBalanceDto(balance, businessDate)).ToList();
            return Result<IReadOnlyList<StockBalanceDto>>.Success(balanceDtos);
        }
        finally
        {
            if (ownsTransaction && _unitOfWork.HasActiveTransaction)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            }
        }
    }

    public async Task<Result<InventorySummaryDto>> GetProductSummaryAsync(Guid branchId, Guid productId, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue || _tenantContext.OrganizationId.Value == Guid.Empty)
            return Result<InventorySummaryDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        var validationErrors = new List<ApiErrorDetailDto>();
        if (branchId == Guid.Empty)
            validationErrors.Add(new ApiErrorDetailDto("branch_id", "BranchId is required."));
        if (productId == Guid.Empty)
            validationErrors.Add(new ApiErrorDetailDto("product_id", "ProductId is required."));
        if (validationErrors.Count > 0)
            return Result<InventorySummaryDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        if (!_currentUser.CanAccessBranch(branchId))
            return Result<InventorySummaryDto>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        Guid orgId = _tenantContext.OrganizationId.Value;
        var ownsTransaction = !_unitOfWork.HasActiveTransaction;

        try
        {
            if (ownsTransaction)
            {
                await _unitOfWork.BeginTransactionAsync(ct);
            }

            var timeZoneId = await ResolveOrganizationTimeZoneIdAsync(orgId, ct);
            var balances = await _stockRepo.GetBalancesWithDetailsAsync(orgId, branchId, productId, null, null, ct);
            var businessDate = _dateTimeProvider.GetOrganizationBusinessDate(timeZoneId);

            var balanceDtos = balances.Select(balance => MapToStockBalanceDto(balance, businessDate)).ToList();

            decimal totalOnHand = balanceDtos.Sum(dto => dto.OnHandQtyBase);
            decimal totalAvailable = balanceDtos.Sum(dto => dto.AvailableQtyBase);
            decimal weightedAverageCost = totalOnHand > 0
                ? balanceDtos.Sum(dto => dto.OnHandQtyBase * dto.AverageUnitCost) / totalOnHand
                : 0m;

            string baseUomCode = balanceDtos.FirstOrDefault()?.BaseUomCode ?? "PCS";

            return Result<InventorySummaryDto>.Success(new InventorySummaryDto(
                orgId, branchId, productId, baseUomCode, totalOnHand, totalAvailable, Math.Round(weightedAverageCost, 4), balanceDtos));
        }
        finally
        {
            if (ownsTransaction && _unitOfWork.HasActiveTransaction)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            }
        }
    }

    public async Task<Result<PagedResult<InventoryTxnDto>>> GetTransactionsAsync(Guid branchId, InventoryTransactionType? type, Guid? productId, DateTimeOffset? fromDate, DateTimeOffset? toDate, int page, int pageSize, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue || _tenantContext.OrganizationId.Value == Guid.Empty)
            return Result<PagedResult<InventoryTxnDto>>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        var validationErrors = new List<ApiErrorDetailDto>();
        if (branchId == Guid.Empty)
            validationErrors.Add(new ApiErrorDetailDto("branch_id", "BranchId is required."));
        validationErrors.AddRange(ValidatePagination(page, pageSize));
        if (validationErrors.Count > 0)
            return Result<PagedResult<InventoryTxnDto>>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        if (!_currentUser.CanAccessBranch(branchId))
            return Result<PagedResult<InventoryTxnDto>>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        Guid orgId = _tenantContext.OrganizationId.Value;
        var ownsTransaction = !_unitOfWork.HasActiveTransaction;

        try
        {
            if (ownsTransaction)
            {
                await _unitOfWork.BeginTransactionAsync(ct);
            }

            var pagedTxns = await _txnRepo.GetPagedAsync(orgId, branchId, type, productId, fromDate, toDate, page, pageSize, ct);
            var dtos = pagedTxns.Items.Select(MapToTxnDto).ToList();

            return Result<PagedResult<InventoryTxnDto>>.Success(
                new PagedResult<InventoryTxnDto>(
                    Items: dtos,
                    Page: pagedTxns.Page,
                    PageSize: pagedTxns.PageSize,
                    TotalCount: pagedTxns.TotalCount));
        }
        finally
        {
            if (ownsTransaction && _unitOfWork.HasActiveTransaction)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            }
        }
    }

    private async Task<string> ResolveOrganizationTimeZoneIdAsync(Guid organizationId, CancellationToken ct)
    {
        if (_organizationRepo is null)
        {
            return "UTC";
        }

        var organization = await _organizationRepo.GetByIdAsync(organizationId, ct);
        return string.IsNullOrWhiteSpace(organization?.TimeZoneId) ? "UTC" : organization.TimeZoneId;
    }

    private static List<ApiErrorDetailDto> ValidatePagination(int page, int pageSize)
    {
        var errors = new List<ApiErrorDetailDto>();
        if (page < 1)
            errors.Add(new ApiErrorDetailDto("page", "Page must be at least 1."));
        if (pageSize is < 1 or > 200)
            errors.Add(new ApiErrorDetailDto("page_size", "PageSize must be between 1 and 200."));
        return errors;
    }

    private static StockBalanceDto MapToStockBalanceDto(StockBalance stockBalance, DateOnly businessDate)
    {
        bool isLocationAvailable = stockBalance.Location != null && stockBalance.Location.IsSellable && stockBalance.Location.IsActive;
        bool isBatchAvailable = stockBalance.Batch != null && stockBalance.Batch.IsEligibleForSale(businessDate);
        decimal availableQuantity = (isLocationAvailable && isBatchAvailable) ? stockBalance.OnHandQtyBase : 0m;

        return new StockBalanceDto(
            stockBalance.OrganizationId,
            stockBalance.Location?.BranchId ?? Guid.Empty,
            stockBalance.Batch?.ProductId ?? Guid.Empty,
            stockBalance.Batch?.Product?.Sku ?? string.Empty,
            stockBalance.Batch?.Product?.Name ?? string.Empty,
            stockBalance.Batch?.Product?.BaseUomCode ?? "PCS",
            stockBalance.LocationId,
            stockBalance.Location?.LocationCode ?? string.Empty,
            stockBalance.Location?.LocationType ?? LocationType.SELLABLE,
            stockBalance.Location?.IsSellable ?? false,
            stockBalance.BatchId,
            stockBalance.Batch?.BatchNumber ?? "NON-LOT",
            stockBalance.Batch?.ManufacturedOn,
            stockBalance.Batch?.ExpiresOn,
            stockBalance.Batch?.QualityStatus ?? BatchQualityStatus.AVAILABLE,
            stockBalance.OnHandQtyBase,
            availableQuantity,
            stockBalance.AverageUnitCost,
            stockBalance.UpdatedAt);
    }

    private static InventoryTxnDto MapToTxnDto(InventoryTxn transaction) =>
        new(
            transaction.InventoryTxnId, transaction.OrganizationId, transaction.BranchId, transaction.TransactionNo, transaction.TransactionType, transaction.Status,
            transaction.ReasonCode, transaction.Note, transaction.IdempotencyKey, transaction.CreatedByEmployeeId, transaction.ReversesInventoryTxnId, transaction.PostedAt,
            transaction.Lines.Select(line => new InventoryTxnLineDto(
                line.InventoryTxnLineId, line.ProductId, line.LocationId, line.BatchId,
                line.Batch?.BatchNumber ?? "NON-LOT", line.ProductUomId, line.EnteredQty,
                line.ConversionSnapshot, line.QuantityDeltaBase, line.UnitCostBase)).ToList());
}
