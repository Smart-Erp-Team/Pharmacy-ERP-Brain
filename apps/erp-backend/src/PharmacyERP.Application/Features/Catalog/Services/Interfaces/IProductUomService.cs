using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Catalog.DTOs;

namespace PharmacyERP.Application.Features.Catalog.Services.Interfaces;

public interface IProductUomService
{
    Task<Result<IReadOnlyList<ProductUomDto>>> GetProductUomsAsync(Guid productId, CancellationToken ct = default);

    Task<Result<ProductUomDto>> CreateProductUomAsync(Guid productId, CreateProductUomRequest request, CancellationToken ct = default);

    Task<Result<ProductUomDto>> UpdateProductUomAsync(Guid productId, Guid uomId, UpdateProductUomRequest request, CancellationToken ct = default);
}

