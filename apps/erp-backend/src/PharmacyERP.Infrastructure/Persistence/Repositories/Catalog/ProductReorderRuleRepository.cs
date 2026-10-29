using Microsoft.EntityFrameworkCore;
using PharmacyERP.Application.Features.Catalog.Interfaces;
using PharmacyERP.Domain.Entities.Catalog;
using PharmacyERP.Infrastructure.Persistence.Database;

namespace PharmacyERP.Infrastructure.Persistence.Repositories.Catalog;

public class ProductReorderRuleRepository : GenericRepository<ProductReorderRule>, IProductReorderRuleRepository
{
    public ProductReorderRuleRepository(PharmacyDbContext dbContext) : base(dbContext)
    {
    }

    public async Task<ProductReorderRule?> GetByBranchAndProductAsync(
        Guid organizationId,
        Guid branchId,
        Guid productId,
        CancellationToken ct = default)
    {
        return await _dbSet
            .FirstOrDefaultAsync(r => r.OrganizationId == organizationId 
                                   && r.BranchId == branchId 
                                   && r.ProductId == productId, ct);
    }
}

