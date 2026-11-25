namespace PharmacyERP.Application.Features.Inventory.DTOs;

public record CreateInventoryLocationRequest(
    Guid BranchId,
    string LocationCode,
    string Name,
    LocationType LocationType,
    bool IsSellable,
    string? IdempotencyKey = null);

public record UpdateInventoryLocationRequest(
    string? Name,
    bool? IsSellable,
    bool? IsActive,
    string? IdempotencyKey = null);

public record InventoryLocationDto(
    Guid LocationId,
    Guid OrganizationId,
    Guid BranchId,
    string LocationCode,
    string Name,
    LocationType LocationType,
    bool IsSellable,
    bool IsActive,
    DateTimeOffset UpdatedAt);