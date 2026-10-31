namespace PharmacyERP.Application.Features.Catalog.DTOs;

public sealed record CreateProductUomItemRequest(
    string UomCode,
    string DisplayName,
    decimal ConversionToBase,
    decimal? SaleUnitPrice,
    bool IsBase,
    bool IsSellable,
    bool IsPurchasable);

public sealed record CreateProductUomRequest(
    string UomCode,
    string DisplayName,
    decimal ConversionToBase,
    decimal? SaleUnitPrice,
    bool IsBase,
    bool IsSellable,
    bool IsPurchasable,
    string IdempotencyKey);

public sealed record UpdateProductUomRequest(
    string? DisplayName,
    decimal? ConversionToBase,
    decimal? SaleUnitPrice,
    bool? IsSellable,
    bool? IsPurchasable,
    bool? IsActive,
    string IdempotencyKey);

public sealed record ProductUomDto(
    Guid ProductUomId,
    Guid ProductId,
    string UomCode,
    string DisplayName,
    decimal ConversionToBase,
    decimal? SaleUnitPrice,
    bool IsBase,
    bool IsSellable,
    bool IsPurchasable,
    bool IsActive,
    DateTimeOffset UpdatedAt);

