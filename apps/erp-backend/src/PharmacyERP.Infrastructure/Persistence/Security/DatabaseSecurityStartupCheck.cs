using System.Data;
using PharmacyERP.Infrastructure.Persistence.Triggers;

namespace PharmacyERP.Infrastructure.Persistence.Security;

/// <summary>
/// Fail-fast startup hosted service that verifies PostgreSQL is connected using a least-privilege
/// role (<c>NOSUPERUSER</c>, <c>NOBYPASSRLS</c>) and that every tenant-bound table in the EF Core
/// model has both <c>ENABLE</c> and <c>FORCE ROW LEVEL SECURITY</c> active.
/// </summary>
public sealed class DatabaseSecurityStartupCheck : IHostedService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public DatabaseSecurityStartupCheck(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();

        if (!dbContext.Database.IsRelational())
        {
            return;
        }

        var expectedTenantTables = RlsAndAuditProtectionSql.GetTenantBoundTablesFromModel(dbContext.Model);
        var connection = dbContext.Database.GetDbConnection();
        var shouldClose = connection.State != ConnectionState.Open;

        if (shouldClose)
        {
            await connection.OpenAsync(cancellationToken);
        }

        try
        {
            await VerifyDatabaseRoleIsLeastPrivilegeAsync(connection, cancellationToken);
            await VerifyForceRlsOnAllTenantTablesAsync(connection, expectedTenantTables, cancellationToken);
        }
        finally
        {
            if (shouldClose && connection.State == ConnectionState.Open)
            {
                await connection.CloseAsync();
            }
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static async Task VerifyDatabaseRoleIsLeastPrivilegeAsync(
        System.Data.Common.DbConnection connection,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = DatabaseRoleSecuritySql.CurrentRoleSecurityCheckSql;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            throw new InvalidOperationException("Database role security check failed: could not resolve current_user in pg_roles.");
        }

        var isSuperuser = reader.GetBoolean(0);
        var canBypassRls = reader.GetBoolean(1);

        if (isSuperuser || canBypassRls)
        {
            throw new InvalidOperationException(
                $"Database role security check failed: current_user has insecure privileges (rolsuper={isSuperuser}, rolbypassrls={canBypassRls}). " +
                $"Connect using a least-privilege role such as '{DatabaseRoleSecuritySql.AppRoleName}' with NOSUPERUSER NOBYPASSRLS.");
        }
    }

    private static async Task VerifyForceRlsOnAllTenantTablesAsync(
        System.Data.Common.DbConnection connection,
        IReadOnlyList<(string Schema, string Table)> expectedTenantTables,
        CancellationToken cancellationToken)
    {
        var rlsByTable = new Dictionary<(string Schema, string Table), (bool Enabled, bool Forced)>();

        await using var command = connection.CreateCommand();
        command.CommandText = DatabaseRoleSecuritySql.TableRlsStatusCheckSql;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var schema = reader.GetString(0);
            var table = reader.GetString(1);
            var enabled = reader.GetBoolean(2);
            var forced = reader.GetBoolean(3);
            rlsByTable[(schema, table)] = (enabled, forced);
        }

        var unprotectedTables = expectedTenantTables
            .Where(tableKey => !rlsByTable.TryGetValue(tableKey, out var status) || !status.Enabled || !status.Forced)
            .Select(tableKey => $"{tableKey.Schema}.\"{tableKey.Table}\"")
            .ToArray();

        if (unprotectedTables.Length > 0)
        {
            throw new InvalidOperationException(
                $"Database RLS security check failed: ENABLE + FORCE ROW LEVEL SECURITY is missing on tenant tables: {string.Join(", ", unprotectedTables)}.");
        }
    }
}
