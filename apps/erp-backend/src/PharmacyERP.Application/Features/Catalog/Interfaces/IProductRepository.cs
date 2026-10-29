using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Domain.Entities.Catalog;

namespace PharmacyERP.Application.Features.Catalog.Interfaces;

/// <summary>
/// Repository interface for catalog products and medications.
/// Inherits generic persistence operations from IGenericRepository&lt;Product&gt;.
/// </summary>
public interface IProductRepository : IGenericRepository<Product>
{
    Task<Product?> GetByIdAsync(Guid organizationId, Guid productId, CancellationToken ct = default);
    Task<Product?> GetByIdWithUomsAsync(Guid organizationId, Guid productId, CancellationToken ct = default);
    Task<bool> ExistsBySkuAsync(Guid organizationId, string sku, Guid? excludeProductId = null, CancellationToken ct = default);
    Task<bool> ExistsByBarcodeAsync(Guid organizationId, string barcode, Guid? excludeProductId = null, CancellationToken ct = default);
    Task<PagedResult<Product>> GetPagedAsync(
        Guid organizationId,
        Guid? categoryId,
        bool includeInactive,
        string? search,
        int page,
        int pageSize,
        CancellationToken ct = default);
    Task<IReadOnlyList<Product>> GetCanonicalFeedPageAsync(
        Guid organizationId,
        DateTimeOffset? updatedSince,
        long? afterEventSequence,
        int limit,
        CancellationToken ct = default);
}

