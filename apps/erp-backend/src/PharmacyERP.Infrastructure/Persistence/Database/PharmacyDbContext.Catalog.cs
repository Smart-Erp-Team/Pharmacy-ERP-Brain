using Microsoft.EntityFrameworkCore;
using PharmacyERP.Domain.Entities.Catalog;

namespace PharmacyERP.Infrastructure.Persistence.Database;

public partial class PharmacyDbContext
{
    public DbSet<ProductCategory> ProductCategories => Set<ProductCategory>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductUom> ProductUoms => Set<ProductUom>();
    public DbSet<ProductReorderRule> ProductReorderRules => Set<ProductReorderRule>();
}
