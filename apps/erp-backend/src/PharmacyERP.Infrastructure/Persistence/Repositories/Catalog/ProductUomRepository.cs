using Microsoft.EntityFrameworkCore;
using PharmacyERP.Application.Features.Catalog.Interfaces;
using PharmacyERP.Domain.Entities.Catalog;
using PharmacyERP.Infrastructure.Persistence.Database;

namespace PharmacyERP.Infrastructure.Persistence.Repositories.Catalog;

public class ProductUomRepository : GenericRepository<ProductUom>, IProductUomRepository
{
    public ProductUomRepository(PharmacyDbContext dbContext) : base(dbContext)
    {
    }

    public async Task<IReadOnlyList<ProductUom>> GetByProductIdAsync(
        Guid organizationId,
        Guid productId,
        bool includeInactive = false,
        CancellationToken ct = default)
    {
        var query = _dbSet.Where(u => u.OrganizationId == organizationId && u.ProductId == productId);

        if (!includeInactive)
        {
            query = query.Where(u => u.IsActive);
        }

        return await query
            .OrderBy(u => u.IsBase ? 0 : 1)
            .ThenBy(u => u.ConversionToBase)
            .ToListAsync(ct);
    }

    public async Task<ProductUom?> GetByIdAsync(
        Guid organizationId,
        Guid productId,
        Guid productUomId,
        CancellationToken ct = default)
    {
        return await _dbSet
            .FirstOrDefaultAsync(u => u.OrganizationId == organizationId 
                                   && u.ProductId == productId 
                                   && u.ProductUomId == productUomId, ct);
    }

    public async Task<bool> ExistsByUomCodeAsync(
        Guid organizationId,
        Guid productId,
        string uomCode,
        Guid? excludeUomId = null,
        CancellationToken ct = default)
    {
        var query = _dbSet.Where(u => u.OrganizationId == organizationId 
                                   && u.ProductId == productId 
                                   && u.UomCode == uomCode);

        if (excludeUomId.HasValue)
        {
            query = query.Where(u => u.ProductUomId != excludeUomId.Value);
        }

        return await query.AnyAsync(ct);
    }
}

