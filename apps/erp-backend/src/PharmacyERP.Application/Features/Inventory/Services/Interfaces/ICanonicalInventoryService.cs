namespace PharmacyERP.Application.Features.Inventory.Services.Interfaces;

public interface ICanonicalInventoryService
{
    Task<Result<PagedResult<CanonicalInventoryItemDto>>> GetCanonicalInventoryAsync(
        Guid organizationId,
        Guid branchId,
        Guid? productId,
        DateTimeOffset? updatedSince,
        long? cursor,
        int pageSize,
        CancellationToken ct);
}