namespace PharmacyERP.Application.Features.Integration.DTOs;

/// <summary>
/// Canonical representation of a product unit of measure conversion in Stage 1 integration contracts.
/// </summary>
public sealed record CanonicalUomConversionDto(
    Guid ProductUomId,
    string UomCode,
    string DisplayName,
    decimal ConversionToBase,
    decimal? SaleUnitPrice,
    bool IsBase,
    bool IsSellable,
    bool IsPurchasable,
    bool IsActive
);

/// <summary>
/// Canonical product read contract matching schema canonical.Product v1.0.
/// </summary>
public sealed record CanonicalProductDto(
    Guid OrganizationId,
    Guid Id,
    string Sku,
    string? Barcode,
    string Name,
    Guid CategoryId,
    string CategoryName,
    string BaseUomCode,
    decimal TaxRate,
    bool LotTrackingRequired,
    bool IsActive,
    IReadOnlyList<CanonicalUomConversionDto> SupportedConversions,
    DateTimeOffset UpdatedAt,
    string Schema = "canonical.Product",
    string Version = "1.0"
);

