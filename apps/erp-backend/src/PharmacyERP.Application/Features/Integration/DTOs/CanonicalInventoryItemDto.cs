using System;
using System.Collections.Generic;

namespace PharmacyERP.Application.Features.Integration.DTOs;

public record CanonicalInventoryLotDto(
    Guid BatchId,
    string BatchNumber,
    decimal QuantityOnHandBase,
    decimal AvailableQuantityBase,
    DateOnly? ManufacturedOn,
    DateOnly? ExpiresOn,
    string QualityStatus
);

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