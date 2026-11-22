namespace PharmacyERP.Application.Features.Inventory.Interfaces;

public interface IInventoryBatchRepository
{
    Task<InventoryBatch?> GetByIdAsync(Guid organizationId, Guid productId, Guid batchId, CancellationToken ct = default);
    Task<InventoryBatch> GetOrCreateBatchAsync(Guid organizationId, Guid productId, string batchNumber, DateOnly? expiresOn, DateOnly? manufacturedOn, CancellationToken ct = default);
    Task<IReadOnlyDictionary<Guid, InventoryBatch>> GetOrCreateBatchesAsync(
        Guid organizationId,
        IReadOnlyCollection<(Guid ProductId, string BatchNumber, DateOnly? ExpiresOn, DateOnly? ManufacturedOn)> requests,
        CancellationToken ct = default);
    Task<PagedResult<InventoryBatch>> GetPagedAsync(Guid organizationId, Guid? productId, BatchQualityStatus? status, DateOnly? expiringBefore, int page, int pageSize, CancellationToken ct = default);
    Task AddAsync(InventoryBatch batch, CancellationToken ct = default);
}
