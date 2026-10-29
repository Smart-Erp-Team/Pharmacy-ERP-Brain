using Microsoft.EntityFrameworkCore;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Catalog.Interfaces;
using PharmacyERP.Domain.Entities.Catalog;
using PharmacyERP.Infrastructure.Persistence.Database;

namespace PharmacyERP.Infrastructure.Persistence.Repositories.Catalog;

public class ProductCategoryRepository : GenericRepository<ProductCategory>, IProductCategoryRepository
{
    private const int DefaultPageSize = 10;
    private const int MaxPageSize = 100;

    public ProductCategoryRepository(PharmacyDbContext dbContext) : base(dbContext)
    {
    }

    public async Task<ProductCategory?> GetByIdAsync(Guid organizationId, Guid categoryId, CancellationToken ct = default)
    {
        return await _dbSet
            .FirstOrDefaultAsync(c => c.OrganizationId == organizationId && c.CategoryId == categoryId, ct);
    }

    public async Task<bool> ExistsByCodeAsync(Guid organizationId, string code, Guid? excludeCategoryId = null, CancellationToken ct = default)
    {
        var query = _dbSet.Where(c => c.OrganizationId == organizationId && c.Code == code);
        if (excludeCategoryId.HasValue)
        {
            query = query.Where(c => c.CategoryId != excludeCategoryId.Value);
        }

        return await query.AnyAsync(ct);
    }

    public async Task<bool> ExistsAndActiveAsync(Guid organizationId, Guid categoryId, CancellationToken ct = default)
    {
        return await _dbSet
            .AnyAsync(c => c.OrganizationId == organizationId && c.CategoryId == categoryId && c.IsActive, ct);
    }

    public async Task<PagedResult<ProductCategory>> GetPagedAsync(
        Guid organizationId,
        Guid? parentCategoryId,
        bool includeInactive,
        string? search,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var resolvedPage = page < 1 ? 1 : page;
        var resolvedPageSize = pageSize <= 0 ? DefaultPageSize : Math.Min(pageSize, MaxPageSize);

        var query = _dbSet.Where(c => c.OrganizationId == organizationId);

        if (!includeInactive)
        {
            query = query.Where(c => c.IsActive);
        }

        if (parentCategoryId.HasValue)
        {
            query = query.Where(c => c.ParentCategoryId == parentCategoryId.Value);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(c => c.Name.ToLower().Contains(term) || c.Code.ToLower().Contains(term));
        }

        var totalCount = await query.CountAsync(ct);

        var items = await query
            .OrderBy(c => c.Name)
            .ThenBy(c => c.CategoryId)
            .Skip((resolvedPage - 1) * resolvedPageSize)
            .Take(resolvedPageSize)
            .ToListAsync(ct);

        return new PagedResult<ProductCategory>(items, resolvedPage, resolvedPageSize, totalCount);
    }
}
