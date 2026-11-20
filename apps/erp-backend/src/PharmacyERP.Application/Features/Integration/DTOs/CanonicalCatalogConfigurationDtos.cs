using PharmacyERP.Domain.Enums;

namespace PharmacyERP.Application.Features.Integration.DTOs;

/// <summary>
/// Status constants for canonical AI configuration write operations.
/// </summary>
public static class CanonicalWriteStatuses
{
    public const string Applied = "APPLIED";
    public const string Success = "SUCCESS";
}

/// <summary>
/// Result of an approved canonical configuration write execution.
/// </summary>
public sealed record CanonicalWriteResultDto(
    Guid RequestId,
    string Status,
    Guid TargetEntityId,
    string EntityType,
    DateTimeOffset ExecutedAt
);

/// <summary>
/// Line item definition for initial UOMs when creating a product via canonical configuration.
/// </summary>
public sealed record CanonicalUomItemDto(
    string UomCode,
    string DisplayName,
    decimal ConversionToBase,
    decimal? SaleUnitPrice,
    bool IsBase,
    bool IsSellable,
    bool IsPurchasable
);

/// <summary>
/// Request payload for approved AI product configuration writes (POST /api/v1/canonical/configuration/products).
/// Supports actions defined in <see cref="CatalogConfigurationAction"/>.
/// </summary>
public sealed record CanonicalProductConfigurationRequest(
    Guid RequestId,
    string SourcePromptId,
    string IdempotencyKey,
    CatalogConfigurationAction Action,
    Guid? ProductId = null,
    Guid? ProductUomId = null,
    Guid? CategoryId = null,
    string? Sku = null,
    string? Barcode = null,
    string? Name = null,
    string? GenericName = null,
    string? BrandName = null,
    string? BaseUomCode = null,
    decimal? TaxRate = null,
    string? ImageUrl = null,
    bool? LotTrackingRequired = null,
    int? ExpiryAlertDays = null,
    bool? IsActive = null,
    IReadOnlyList<CanonicalUomItemDto>? Uoms = null,
    string? UomCode = null,
    string? DisplayName = null,
    decimal? ConversionToBase = null,
    decimal? SaleUnitPrice = null,
    bool? IsBase = null,
    bool? IsSellable = null,
    bool? IsPurchasable = null
);

/// <summary>
/// Request payload for approved AI reorder rule configuration writes (PUT /api/v1/canonical/configuration/reorder-rules).
/// </summary>
public sealed record CanonicalReorderRuleConfigurationRequest(
    Guid RequestId,
    string SourcePromptId,
    string IdempotencyKey,
    Guid BranchId,
    Guid ProductId,
    decimal ReorderPointBase,
    decimal ReorderQuantityBase,
    decimal? MaxQuantityBase,
    bool IsActive = true
);

/// <summary>
/// Paged feed response for canonical product queries supporting cursor-based paging.
/// </summary>
public sealed record CanonicalProductFeedPageDto(
    IReadOnlyList<CanonicalProductDto> Items,
    string? NextCursor
);

