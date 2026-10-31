namespace PharmacyERP.Application.Features.Catalog.DTOs;

public sealed record CreateProductCategoryRequest(
    Guid? ParentCategoryId,
    string Code,
    string Name,
    string? Description,
    string IdempotencyKey);

public sealed record UpdateProductCategoryRequest(
    Guid? ParentCategoryId,
    string Name,
    string? Description,
    bool? IsActive,
    string IdempotencyKey);

public sealed record ProductCategoryDto(
    Guid CategoryId,
    Guid OrganizationId,
    Guid? ParentCategoryId,
    string Code,
    string Name,
    string? Description,
    bool IsActive,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

