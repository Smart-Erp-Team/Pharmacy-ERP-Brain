using Microsoft.EntityFrameworkCore;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Catalog.Interfaces;
using PharmacyERP.Domain.Entities.Catalog;
using PharmacyERP.Infrastructure.Persistence.Database;

namespace PharmacyERP.Infrastructure.Persistence.Repositories.Catalog;

public class ProductRepository : GenericRepository<Product>, IProductRepository
{
    private const int DefaultPageSize = 10;
    private const int MaxPageSize = 100;

    public ProductRepository(PharmacyDbContext dbContext) : base(dbContext)
    {
    }

    public async Task<Product?> GetByIdAsync(Guid organizationId, Guid productId, CancellationToken ct = default)
    {
        return await _dbSet
            .FirstOrDefaultAsync(p => p.OrganizationId == organizationId && p.ProductId == productId, ct);
    }

    public async Task<Product?> GetByIdWithUomsAsync(Guid organizationId, Guid productId, CancellationToken ct = default)
    {
        return await _dbSet
            .Include(p => p.Uoms)
            .Include(p => p.Category)
            .FirstOrDefaultAsync(p => p.OrganizationId == organizationId && p.ProductId == productId, ct);
    }

    public async Task<bool> ExistsBySkuAsync(Guid organizationId, string sku, Guid? excludeProductId = null, CancellationToken ct = default)
    {
        var query = _dbSet.Where(p => p.OrganizationId == organizationId && p.Sku == sku);
        if (excludeProductId.HasValue)
        {
            query = query.Where(p => p.ProductId != excludeProductId.Value);
        }

        return await query.AnyAsync(ct);
    }

    public async Task<bool> ExistsByBarcodeAsync(Guid organizationId, string barcode, Guid? excludeProductId = null, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(barcode))
        {
            return false;
        }

        var query = _dbSet.Where(p => p.OrganizationId == organizationId && p.Barcode == barcode);
        if (excludeProductId.HasValue)
        {
            query = query.Where(p => p.ProductId != excludeProductId.Value);
        }

        return await query.AnyAsync(ct);
    }

    public async Task<PagedResult<Product>> GetPagedAsync(
        Guid organizationId,
        Guid? categoryId,
        bool includeInactive,
        string? search,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var resolvedPage = page < 1 ? 1 : page;
        var resolvedPageSize = pageSize <= 0 ? DefaultPageSize : Math.Min(pageSize, MaxPageSize);

        var query = _dbSet
            .Include(p => p.Uoms)
            .Include(p => p.Category)
            .Where(p => p.OrganizationId == organizationId);

        if (!includeInactive)
        {
            query = query.Where(p => p.IsActive);
        }

        if (categoryId.HasValue)
        {
            query = query.Where(p => p.CategoryId == categoryId.Value);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(p => p.Name.ToLower().Contains(term)
                                  || p.Sku.ToLower().Contains(term)
                                  || (p.Barcode != null && p.Barcode.ToLower().Contains(term)));
        }

        var totalCount = await query.CountAsync(ct);

        var items = await query
            .OrderBy(p => p.Name)
            .ThenBy(p => p.ProductId)
            .Skip((resolvedPage - 1) * resolvedPageSize)
            .Take(resolvedPageSize)
            .ToListAsync(ct);

        return new PagedResult<Product>(items, resolvedPage, resolvedPageSize, totalCount);
    }

    public async Task<IReadOnlyList<Product>> GetCanonicalFeedPageAsync(
        Guid organizationId,
        DateTimeOffset? updatedSince,
        long? afterEventSequence,
        int limit,
        CancellationToken ct = default)
    {
        var take = limit <= 0 ? 50 : Math.Min(limit, 1000);

        var query = _dbSet
            .Include(p => p.Uoms)
            .Include(p => p.Category)
            .Where(p => p.OrganizationId == organizationId);

        if (updatedSince.HasValue)
        {
            query = query.Where(p => p.UpdatedAt >= updatedSince.Value);
        }

        query = query
            .OrderBy(p => p.UpdatedAt)
            .ThenBy(p => p.ProductId)
            .Take(take);

        return await query.ToListAsync(ct);
    }
}
