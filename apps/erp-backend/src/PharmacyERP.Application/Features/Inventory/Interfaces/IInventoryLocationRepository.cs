namespace PharmacyERP.Application.Features.Inventory.Interfaces;

public interface IInventoryLocationRepository
{
    Task<InventoryLocation?> GetByIdAsync(Guid organizationId, Guid branchId, Guid locationId, CancellationToken ct = default);
    Task<InventoryLocation?> GetByIdAsync(Guid organizationId, Guid locationId, CancellationToken ct = default);
    Task<IReadOnlyList<InventoryLocation>> GetByIdsAsync(Guid organizationId, Guid branchId, IReadOnlyCollection<Guid> locationIds, CancellationToken ct = default);
    Task<IReadOnlySet<string>> GetExistingCodesAsync(Guid organizationId, Guid branchId, IReadOnlyCollection<string> locationCodes, CancellationToken ct = default);
    Task<bool> ExistsByCodeAsync(Guid organizationId, Guid branchId, string locationCode, Guid? excludeLocationId = null, CancellationToken ct = default);
    Task<PagedResult<InventoryLocation>> GetPagedAsync(Guid organizationId, Guid branchId, bool? isSellable, bool includeInactive, int page, int pageSize, CancellationToken ct = default);
    Task AddRangeAsync(IEnumerable<InventoryLocation> locations, CancellationToken ct = default);
    Task AddAsync(InventoryLocation location, CancellationToken ct = default);
}
