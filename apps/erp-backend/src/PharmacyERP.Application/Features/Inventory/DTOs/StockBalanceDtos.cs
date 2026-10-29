using PharmacyERP.Domain.Enums;

namespace PharmacyERP.Application.Features.Inventory.DTOs;

public record StockBalanceDto(
    Guid OrganizationId,
    Guid BranchId,
    Guid ProductId,
    string ProductSku,
    string ProductName,
    string BaseUomCode,
    Guid LocationId,
    string LocationCode,
    LocationType LocationType,
    bool IsLocationSellable,
    Guid BatchId,
    string BatchNumber,
    DateOnly? ManufacturedOn,
    DateOnly? ExpiresOn,
    BatchQualityStatus QualityStatus,
    decimal OnHandQtyBase,
    decimal AvailableQtyBase,
    decimal AverageUnitCost,
    DateTimeOffset UpdatedAt);

public record InventorySummaryDto(
    Guid OrganizationId,
    Guid BranchId,
    Guid ProductId,
    string BaseUomCode,
    decimal TotalOnHandQtyBase,
    decimal TotalAvailableQtyBase,
    decimal WeightedAverageUnitCostBase,
    IReadOnlyList<StockBalanceDto> LocationsAndLots);