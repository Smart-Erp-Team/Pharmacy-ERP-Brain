namespace PharmacyERP.Application.Features.Integration.DTOs;

/// <summary>
/// Canonical lot-level inventory breakdown matching Blueprint §8.2 (<c>available_quantity_base</c>).
/// Intentionally omits <c>reserved_quantity</c> per Blueprint §5.7.
/// </summary>
public record CanonicalInventoryLotDto(
    Guid BatchId,
    string BatchNumber,
    decimal QuantityOnHandBase,
    decimal AvailableQuantityBase,
    DateOnly? ManufacturedOn,
    DateOnly? ExpiresOn,
    string QualityStatus
);

/// <summary>
/// Canonical inventory read contract matching <c>canonical.InventoryItem</c> v1.0.
/// Pins <c>available_quantity_base</c> (Blueprint §8.2) and <c>organization_id</c> (Blueprint §5.7)
/// with no <c>reserved_quantity</c> field.
/// </summary>
public record CanonicalInventoryItemDto(
    Guid OrganizationId,
    Guid BranchId,
    Guid ProductId,
    Guid LocationId,
    string BaseUomCode,
    decimal QuantityOnHandBase,
    decimal AvailableQuantityBase,
    decimal AverageUnitCostBase,
    decimal? ReorderPointBase,
    IReadOnlyList<CanonicalInventoryLotDto> Lots,
    DateTimeOffset UpdatedAt
)
{
    public string Schema { get; init; } = "canonical.InventoryItem";
    public string Version { get; init; } = "1.0";
}