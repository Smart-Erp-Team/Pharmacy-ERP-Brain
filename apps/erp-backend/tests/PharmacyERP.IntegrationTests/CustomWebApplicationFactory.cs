using PharmacyERP.Infrastructure.Persistence.Triggers;

namespace PharmacyERP.IntegrationTests;

public static class ThrowawayPostgresDatabaseProvisioner
{
    public const string IntegrationTestAppRoleName = "erp_it_app";
    public const string DefaultTestAppPassword = "DevItAppPass123!";
    private const long RoleProvisionAdvisoryLockKey = 7482910421983412L;
    private static readonly SemaphoreSlim RoleProvisionLock = new(1, 1);

    public static string? ResolveAdminConnectionString()
    {
        var processVar = Environment.GetEnvironmentVariable("ERP_IT_POSTGRES", EnvironmentVariableTarget.Process);
        if (string.Equals(processVar, "DISABLED", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(processVar, "NONE", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(processVar, "SKIP", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var rawConnStr = !string.IsNullOrWhiteSpace(processVar)
            ? processVar
            : (Environment.GetEnvironmentVariable("ERP_IT_POSTGRES", EnvironmentVariableTarget.User)
               ?? Environment.GetEnvironmentVariable("ERP_IT_POSTGRES", EnvironmentVariableTarget.Machine));

        return string.IsNullOrWhiteSpace(rawConnStr) ? null : rawConnStr;
    }

    public static async Task<(string MaintenanceConnectionString, string AdminConnectionString, string AppConnectionString)> CreateAndProvisionDatabaseAsync(
        string rawAdminConnStr,
        string databaseName)
    {
        var maintenanceBuilder = new NpgsqlConnectionStringBuilder(rawAdminConnStr);
        var maintenanceConnStr = maintenanceBuilder.ConnectionString;

        await using (var maintenanceConn = new NpgsqlConnection(maintenanceConnStr))
        {
            await maintenanceConn.OpenAsync();
            await using var cmd = maintenanceConn.CreateCommand();
            cmd.CommandText = $"CREATE DATABASE \"{databaseName}\" TEMPLATE template0;";
            await cmd.ExecuteNonQueryAsync();
        }

        var adminBuilder = new NpgsqlConnectionStringBuilder(rawAdminConnStr)
        {
            Database = databaseName
        };
        var adminConnStr = adminBuilder.ConnectionString;

        var baseAppRoleName = DatabaseRoleSecuritySql.AppRoleName;
        var testAppRoleName = IntegrationTestAppRoleName;
        var testAppPassword = DefaultTestAppPassword;

        try
        {
            var options = new DbContextOptionsBuilder<PharmacyDbContext>()
                .UseNpgsql(adminConnStr)
                .Options;

            var tenant = new TenantContext();
            tenant.AllowSystemBypass();

            await using (var db = new PharmacyDbContext(options, tenant))
            {
                var created = await db.Database.EnsureCreatedAsync();
                if (!created)
                {
                    throw new InvalidOperationException($"Database.EnsureCreatedAsync() returned false for '{databaseName}'.");
                }

                await db.Database.ExecuteSqlRawAsync(RlsAndAuditProtectionSql.GenerateCompleteStage1SecuritySql(db.Model));
                await db.Database.ExecuteSqlRawAsync(InventoryLedgerImmutabilitySql.CreateFunctionAndTriggerSql);
            }

            await using (var adminConn = new NpgsqlConnection(adminConnStr))
            {
                await adminConn.OpenAsync();
                await EnsureLeastPrivilegeAppRoleAndGrantsAsync(
                    adminConn,
                    databaseName,
                    baseAppRoleName,
                    testAppRoleName,
                    testAppPassword);
            }

            var appBuilder = new NpgsqlConnectionStringBuilder(rawAdminConnStr)
            {
                Database = databaseName,
                Username = testAppRoleName,
                Password = testAppPassword
            };

            return (maintenanceConnStr, adminConnStr, appBuilder.ConnectionString);
        }
        catch
        {
            await DropDatabaseAsync(maintenanceConnStr, databaseName);
            throw;
        }
    }

    public static async Task DropDatabaseAsync(string? maintenanceConnStr, string? databaseName)
    {
        if (string.IsNullOrWhiteSpace(maintenanceConnStr) || string.IsNullOrWhiteSpace(databaseName))
        {
            return;
        }

        NpgsqlConnection.ClearAllPools();

        await using var conn = new NpgsqlConnection(maintenanceConnStr);
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = $"DROP DATABASE IF EXISTS \"{databaseName}\" WITH (FORCE);";
        await cmd.ExecuteNonQueryAsync();

        await using var verifyCmd = conn.CreateCommand();
        verifyCmd.CommandText = $"SELECT 1 FROM pg_database WHERE datname = '{databaseName}';";
        var exists = await verifyCmd.ExecuteScalarAsync();
        if (exists != null)
        {
            throw new InvalidOperationException(
                $"Failed to drop throwaway integration test database '{databaseName}'. It still exists in pg_database.");
        }
    }

    private static async Task EnsureLeastPrivilegeAppRoleAndGrantsAsync(
        NpgsqlConnection adminConn,
        string databaseName,
        string baseAppRoleName,
        string testAppRoleName,
        string testAppPassword)
    {
        var escapedPassword = testAppPassword.Replace("'", "''", StringComparison.Ordinal);
        var escapedDbName = databaseName.Replace("\"", "\"\"", StringComparison.Ordinal);

        await RoleProvisionLock.WaitAsync();
        try
        {
            await using (var lockCmd = adminConn.CreateCommand())
            {
                lockCmd.CommandText = $"SELECT pg_advisory_lock({RoleProvisionAdvisoryLockKey});";
                await lockCmd.ExecuteNonQueryAsync();
            }

            try
            {
                await using var roleCmd = adminConn.CreateCommand();
                roleCmd.CommandText = $@"
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{baseAppRoleName}') THEN
        CREATE ROLE {baseAppRoleName} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{testAppRoleName}') THEN
        CREATE ROLE {testAppRoleName} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB INHERIT PASSWORD '{escapedPassword}';
    ELSE
        ALTER ROLE {testAppRoleName} WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB INHERIT PASSWORD '{escapedPassword}';
    END IF;

    GRANT {baseAppRoleName} TO {testAppRoleName};
END
$$;
GRANT CONNECT ON DATABASE ""{escapedDbName}"" TO {testAppRoleName};";
                await roleCmd.ExecuteNonQueryAsync();
            }
            finally
            {
                await using var unlockCmd = adminConn.CreateCommand();
                unlockCmd.CommandText = $"SELECT pg_advisory_unlock({RoleProvisionAdvisoryLockKey});";
                await unlockCmd.ExecuteNonQueryAsync();
            }
        }
        finally
        {
            RoleProvisionLock.Release();
        }

        await using (var grantsCmd = adminConn.CreateCommand())
        {
            grantsCmd.CommandText = DatabaseRoleSecuritySql.GenerateAppRoleGrantsSql();
            await grantsCmd.ExecuteNonQueryAsync();
        }
    }
}

public class CustomWebApplicationFactory : WebApplicationFactory<PharmacyERP.Api.Program>, IAsyncLifetime
{
    private string? _maintenanceConnStr;

    public string DatabaseName { get; private set; } = string.Empty;
    public string AdminConnectionString { get; private set; } = string.Empty;
    public string AppConnectionString { get; private set; } = string.Empty;

    public Guid DefaultOrganizationId { get; } = Guid.NewGuid();
    public Guid DefaultBranchId { get; } = Guid.NewGuid();
    public Guid DefaultEmployeeId { get; } = Guid.NewGuid();
    public Guid DefaultCategoryId { get; } = Guid.NewGuid();
    public Guid DefaultProductId { get; } = Guid.NewGuid();
    public Guid DefaultProductUomId { get; } = Guid.NewGuid();
    public Guid DefaultLocationId { get; } = Guid.NewGuid();
    public Guid DefaultBatchId { get; } = Guid.NewGuid();

    public async Task InitializeAsync()
    {
        var rawConnStr = ThrowawayPostgresDatabaseProvisioner.ResolveAdminConnectionString();
        if (string.IsNullOrWhiteSpace(rawConnStr))
        {
            return;
        }

        DatabaseName = "erp_custom_it_" + Guid.NewGuid().ToString("N");
        var provisioned = await ThrowawayPostgresDatabaseProvisioner.CreateAndProvisionDatabaseAsync(rawConnStr, DatabaseName);
        _maintenanceConnStr = provisioned.MaintenanceConnectionString;
        AdminConnectionString = provisioned.AdminConnectionString;
        AppConnectionString = provisioned.AppConnectionString;

        await SeedDefaultFixtureDataAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        if (!string.IsNullOrWhiteSpace(AppConnectionString))
        {
            builder.UseSetting("ConnectionStrings:DefaultConnection", AppConnectionString);
        }

        builder.UseSetting("Outbox:WorkerEnabled", "false");
        builder.ConfigureLogging(logging => logging.ClearProviders());
    }

    private async Task SeedDefaultFixtureDataAsync()
    {
        var options = new DbContextOptionsBuilder<PharmacyDbContext>()
            .UseNpgsql(AdminConnectionString)
            .Options;

        var tenant = new TenantContext();
        tenant.AllowSystemBypass();

        await using var db = new PharmacyDbContext(options, tenant);

        var addr = new Address("10 Tahrir St", null, "Cairo", "Cairo", "11511", "EG");
        var org = Organization.Create("ORGCUST", "Custom Fixture Org", "EGP", "Africa/Cairo", addr);
        typeof(Organization).GetProperty(nameof(Organization.OrganizationId))!.SetValue(org, DefaultOrganizationId);
        db.Organizations.Add(org);

        var branch = Branch.Create(DefaultOrganizationId, "BRCUST1", "Custom Main Branch", addr);
        typeof(Branch).GetProperty(nameof(Branch.BranchId))!.SetValue(branch, DefaultBranchId);
        db.Branches.Add(branch);

        var employee = Employee.Create(
            DefaultOrganizationId,
            DefaultBranchId,
            "EMPCUST1",
            "Dr. Custom Pharmacist",
            "custom@pharmacy.test",
            "+201000000001",
            "Pharmacist",
            addr,
            new DateOnly(2025, 1, 1));
        typeof(Employee).GetProperty(nameof(Employee.EmployeeId))!.SetValue(employee, DefaultEmployeeId);
        db.Employees.Add(employee);

        var category = ProductCategory.Create(
            DefaultOrganizationId,
            "CATCUST",
            "Custom Category",
            null,
            null,
            DefaultCategoryId);
        db.ProductCategories.Add(category);

        var product = Product.Create(
            DefaultOrganizationId,
            DefaultCategoryId,
            "SKUCUST1",
            "BARCUST1",
            "Custom Test Product",
            "Generic",
            "Manufacturer",
            "BOX",
            0.14m,
            null,
            true,
            30,
            new[] { new InitialUomDefinition("BOX", "Box", 1m, 50m, true, true, true) },
            DefaultProductId);
        var createdUom = System.Linq.Enumerable.Single(product.Uoms);
        typeof(ProductUom).GetProperty(nameof(ProductUom.ProductUomId))!.SetValue(createdUom, DefaultProductUomId);
        db.Products.Add(product);

        var location = InventoryLocation.CreateDefaultSellable(
            DefaultOrganizationId,
            DefaultBranchId,
            DateTimeOffset.UtcNow);
        typeof(InventoryLocation).GetProperty(nameof(InventoryLocation.LocationId))!.SetValue(location, DefaultLocationId);
        db.InventoryLocations.Add(location);

        var batch = InventoryBatch.CreateDatedBatch(
            DefaultOrganizationId,
            DefaultProductId,
            "BATCH-CUST-1",
            new DateOnly(2028, 12, 31),
            new DateOnly(2025, 1, 1),
            BatchQualityStatus.AVAILABLE,
            DateTimeOffset.UtcNow);
        typeof(InventoryBatch).GetProperty(nameof(InventoryBatch.BatchId))!.SetValue(batch, DefaultBatchId);
        db.InventoryBatches.Add(batch);

        await db.SaveChangesAsync();
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await ThrowawayPostgresDatabaseProvisioner.DropDatabaseAsync(_maintenanceConnStr, DatabaseName);
    }
}

