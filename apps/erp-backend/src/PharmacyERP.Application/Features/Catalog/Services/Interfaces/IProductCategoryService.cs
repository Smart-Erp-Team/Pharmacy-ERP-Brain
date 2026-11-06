using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Catalog.DTOs;

namespace PharmacyERP.Application.Features.Catalog.Services.Interfaces;

public interface IProductCategoryService
{
    Task<Result<PagedResult<ProductCategoryDto>>> GetCategoriesAsync(
        Guid? parentCategoryId,
        bool includeInactive,
        string? search,
        int page,
        int pageSize,
        CancellationToken ct = default);

    Task<Result<ProductCategoryDto>> GetCategoryByIdAsync(Guid categoryId, CancellationToken ct = default);

    Task<Result<ProductCategoryDto>> CreateCategoryAsync(CreateProductCategoryRequest request, CancellationToken ct = default);

    Task<Result<ProductCategoryDto>> UpdateCategoryAsync(Guid categoryId, UpdateProductCategoryRequest request, CancellationToken ct = default);
}

