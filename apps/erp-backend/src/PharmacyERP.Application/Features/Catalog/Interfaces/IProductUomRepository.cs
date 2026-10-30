using PharmacyERP.Domain.Entities.Catalog;

namespace PharmacyERP.Application.Features.Catalog.Interfaces;

/// <summary>
/// Repository interface for catalog product units of measure.
/// </summary>
public interface IProductUomRepository
{
    Task<IReadOnlyList<ProductUom>> GetByProductIdAsync(
        Guid organizationId,
        Guid productId,
        bool includeInactive = false,
        CancellationToken ct = default);

    Task<ProductUom?> GetByIdAsync(
        Guid organizationId,
        Guid productId,
        Guid productUomId,
        CancellationToken ct = default);

    Task<bool> ExistsByUomCodeAsync(
        Guid organizationId,
        Guid productId,
        string uomCode,
        Guid? excludeUomId = null,
        CancellationToken ct = default);

    Task AddAsync(ProductUom uom, CancellationToken ct = default);
}

