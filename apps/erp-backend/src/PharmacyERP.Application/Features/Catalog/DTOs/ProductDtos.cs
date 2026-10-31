namespace PharmacyERP.Application.Features.Catalog.DTOs;

public sealed record CreateProductRequest(
    Guid CategoryId,
    string Sku,
    string? Barcode,
    string Name,
    string? GenericName,
    string? BrandName,
    string BaseUomCode,
    decimal TaxRate,
    string? ImageUrl,
    bool LotTrackingRequired,
    int ExpiryAlertDays,
    IReadOnlyList<CreateProductUomItemRequest> Uoms,
    string IdempotencyKey);

public sealed record UpdateProductRequest(
    Guid? CategoryId,
    string? Sku,
    string? Barcode,
    string? Name,
    string? GenericName,
    string? BrandName,
    string? BaseUomCode,
    decimal? TaxRate,
    string? ImageUrl,
    bool? LotTrackingRequired,
    int? ExpiryAlertDays,
    bool? IsActive,
    string IdempotencyKey);

public sealed record ProductDto(
    Guid ProductId,
    Guid OrganizationId,
    Guid CategoryId,
    string Sku,
    string? Barcode,
    string Name,
    string? GenericName,
    string? BrandName,
    string BaseUomCode,
    decimal TaxRate,
    string? ImageUrl,
    bool LotTrackingRequired,
    int ExpiryAlertDays,
    bool IsActive,
    IReadOnlyList<ProductUomDto> Uoms,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

