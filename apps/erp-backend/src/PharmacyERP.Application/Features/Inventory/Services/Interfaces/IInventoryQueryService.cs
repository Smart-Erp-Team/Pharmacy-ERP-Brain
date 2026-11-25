namespace PharmacyERP.Application.Features.Inventory.Services.Interfaces;

public interface IInventoryQueryService
{
    Task<Result<PagedResult<InventoryBatchDto>>> GetBatchesAsync(Guid? productId, BatchQualityStatus? status, DateOnly? expiringBefore, int page, int pageSize, CancellationToken ct = default);
    Task<Result<PagedResult<StockBalanceDto>>> GetBalancesAsync(Guid branchId, Guid? productId, Guid? locationId, Guid? batchId, int page = 1, int pageSize = 25, CancellationToken ct = default);
    Task<Result<InventorySummaryDto>> GetProductSummaryAsync(Guid branchId, Guid productId, CancellationToken ct = default);
    Task<Result<PagedResult<InventoryTxnDto>>> GetTransactionsAsync(Guid branchId, InventoryTransactionType? type, Guid? productId, DateTimeOffset? fromDate, DateTimeOffset? toDate, int page, int pageSize, CancellationToken ct = default);
}