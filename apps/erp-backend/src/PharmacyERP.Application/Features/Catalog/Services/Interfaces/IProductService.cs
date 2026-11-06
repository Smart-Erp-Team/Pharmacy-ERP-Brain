using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Catalog.DTOs;

namespace PharmacyERP.Application.Features.Catalog.Services.Interfaces;

public interface IProductService
{
    Task<Result<PagedResult<ProductDto>>> GetProductsAsync(
        Guid? categoryId,
        bool includeInactive,
        string? search,
        int page,
        int pageSize,
        CancellationToken ct = default);

    Task<Result<ProductDto>> GetProductByIdAsync(Guid productId, CancellationToken ct = default);

    Task<Result<ProductDto>> CreateProductAsync(CreateProductRequest request, CancellationToken ct = default);

    Task<Result<ProductDto>> UpdateProductAsync(Guid productId, UpdateProductRequest request, CancellationToken ct = default);
}

