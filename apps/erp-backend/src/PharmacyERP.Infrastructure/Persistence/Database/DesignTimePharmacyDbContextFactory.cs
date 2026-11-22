using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using PharmacyERP.Infrastructure.Services.Context;

namespace PharmacyERP.Infrastructure.Persistence.Database;

public sealed class DesignTimePharmacyDbContextFactory : IDesignTimeDbContextFactory<PharmacyDbContext>
{
    public PharmacyDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("ERP_MIGRATOR_CONNECTION")
            ?? Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=erp_db;Username=erp_migrator";

        var optionsBuilder = new DbContextOptionsBuilder<PharmacyDbContext>();
        optionsBuilder.UseNpgsql(connectionString);

        var tenantContext = new TenantContext();
        tenantContext.AllowSystemBypass();

        return new PharmacyDbContext(optionsBuilder.Options, tenantContext);
    }
}
