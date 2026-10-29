using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Domain.Entities.Catalog;

namespace PharmacyERP.Application.Features.Catalog.Interfaces;

/// <summary>
/// Repository interface for catalog product categories.
/// Inherits generic persistence operations from IGenericRepository&lt;ProductCategory&gt;.
/// </summary>
public interface IProductCategoryRepository : IGenericRepository<ProductCategory>
{
    Task<ProductCategory?> GetByIdAsync(Guid organizationId, Guid categoryId, CancellationToken ct = default);
    Task<bool> ExistsByCodeAsync(Guid organizationId, string code, Guid? excludeCategoryId = null, CancellationToken ct = default);
    Task<bool> ExistsAndActiveAsync(Guid organizationId, Guid categoryId, CancellationToken ct = default);
    Task<PagedResult<ProductCategory>> GetPagedAsync(
        Guid organizationId,
        Guid? parentCategoryId,
        bool includeInactive,
        string? search,
        int page,
        int pageSize,
        CancellationToken ct = default);
}

