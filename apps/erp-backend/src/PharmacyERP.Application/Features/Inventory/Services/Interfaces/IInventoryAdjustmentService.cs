namespace PharmacyERP.Application.Features.Inventory.Services.Interfaces;

public interface IInventoryAdjustmentService
{
	Task<Result<InventoryTxnDto>> PostAdjustmentAsync(CreateInventoryAdjustmentRequest request, CancellationToken ct = default);
}