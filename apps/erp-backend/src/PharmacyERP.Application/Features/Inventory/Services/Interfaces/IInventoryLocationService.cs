namespace PharmacyERP.Application.Features.Inventory.Services.Interfaces;

public interface IInventoryLocationService
{
    Task<Result<InventoryLocationDto>> CreateAsync(CreateInventoryLocationRequest request, CancellationToken ct = default);
    Task<Result<InventoryLocationDto>> UpdateAsync(Guid locationId, UpdateInventoryLocationRequest request, CancellationToken ct = default);
    Task<Result<InventoryLocationDto>> GetByIdAsync(Guid locationId, CancellationToken ct = default);
    Task<Result<PagedResult<InventoryLocationDto>>> GetPagedAsync(Guid branchId, bool? isSellable, bool includeInactive, int page, int pageSize, CancellationToken ct = default);
}