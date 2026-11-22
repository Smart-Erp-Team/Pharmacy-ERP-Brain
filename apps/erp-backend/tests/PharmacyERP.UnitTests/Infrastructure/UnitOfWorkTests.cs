using PharmacyERP.Infrastructure.Persistence.Triggers;
using PharmacyERP.Infrastructure.Persistence.UoW;

namespace PharmacyERP.UnitTests.Infrastructure;

public class UnitOfWorkTests
{
    private static PharmacyDbContext CreateInMemoryContext(TenantContext tenantContext)
    {
        var options = new DbContextOptionsBuilder<PharmacyDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options;

        return new PharmacyDbContext(options, tenantContext);
    }

    [Fact]
    public async Task BeginAndCommitTransaction_ManagesActiveTransactionStateCorrectly()
    {
        var tenantContext = new TenantContext();
        tenantContext.SetTenant(Guid.NewGuid());

        await using var dbContext = CreateInMemoryContext(tenantContext);
        await using var uow = new UnitOfWork(dbContext, tenantContext);

        Assert.False(uow.HasActiveTransaction);

        await uow.BeginTransactionAsync();
        Assert.True(uow.HasActiveTransaction);

        await Assert.ThrowsAsync<InvalidOperationException>(() => uow.BeginTransactionAsync());

        await uow.CommitTransactionAsync();
        Assert.False(uow.HasActiveTransaction);
    }

    [Fact]
    public async Task RollbackTransaction_ClearsActiveTransactionState()
    {
        var tenantContext = new TenantContext();
        tenantContext.SetTenant(Guid.NewGuid());

        await using var dbContext = CreateInMemoryContext(tenantContext);
        await using var uow = new UnitOfWork(dbContext, tenantContext);

        await uow.BeginTransactionAsync();
        Assert.True(uow.HasActiveTransaction);

        await uow.RollbackTransactionAsync();
        Assert.False(uow.HasActiveTransaction);
    }

    [Fact]
    public void RlsAndAuditProtectionSql_GeneratesValidForceRlsAndImmutableAuditSql()
    {
        var sql = RlsAndAuditProtectionSql.GenerateCompleteStage1SecuritySql();

        Assert.Contains("ENABLE ROW LEVEL SECURITY", sql);
        Assert.Contains("FORCE ROW LEVEL SECURITY", sql);
        Assert.Contains("current_setting('app.organization_id', true)", sql);
        Assert.Contains("current_setting('app.system_bypass', true)", sql);
        Assert.Contains("prevent_audit_log_mutation", sql);
        Assert.Contains("catalog.\"PRODUCT_CATEGORY\"", sql);
        Assert.Contains("inventory.\"INVENTORY_LOCATION\"", sql);
        Assert.Contains("inventory.\"INVENTORY_BATCH\"", sql);
        Assert.DoesNotContain("STORAGE_LOCATION", sql);
        Assert.DoesNotContain("PRODUCT_BATCH", sql);
    }

    [Fact]
    public void RlsAndAuditProtectionSql_TenantBoundTables_MatchesAllEfEntitiesWithOrganizationId()
    {
        var tenantContext = new TenantContext();
        var options = new DbContextOptionsBuilder<PharmacyDbContext>()
            .UseNpgsql("Host=localhost;Database=erp_db;Username=erp_app")
            .Options;

        using var dbContext = new PharmacyDbContext(options, tenantContext);

        var modelTables = RlsAndAuditProtectionSql.GetTenantBoundTablesFromModel(dbContext.Model);
        var configuredTables = RlsAndAuditProtectionSql.TenantBoundTables
            .OrderBy(t => t.Schema, StringComparer.Ordinal)
            .ThenBy(t => t.Table, StringComparer.Ordinal)
            .ToArray();

        Assert.Equal(20, modelTables.Count);
        Assert.Equal(modelTables, configuredTables);
    }
}