namespace PharmacyERP.Infrastructure.Persistence.Security;

public static class DatabaseRoleSecuritySql
{
    public const string MigratorRoleName = "erp_migrator";
    public const string AppRoleName = "erp_app";

    public const string CurrentRoleSecurityCheckSql =
        "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;";

    public const string TableRlsStatusCheckSql = @"
SELECT n.nspname AS schema_name,
       c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
INNER JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname IN ('identity', 'catalog', 'inventory', 'integration');";

    /// <summary>
    /// Provisioning template to be executed by a DBA/provisioning script with secret passwords
    /// supplied externally (never hard-coded in source control).
    /// </summary>
    public static string GenerateRoleProvisioningTemplateSql()
    {
        return @"
-- Run as DBA during database bootstrap with passwords injected via psql variables:
--   psql -v migrator_password='...' -v app_password='...' -f provision_db_roles.sql

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_migrator') THEN
        CREATE ROLE erp_migrator LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
        CREATE ROLE erp_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
    END IF;
END
$$;

ALTER ROLE erp_migrator WITH PASSWORD :'migrator_password';
ALTER ROLE erp_app WITH PASSWORD :'app_password';

CREATE SCHEMA IF NOT EXISTS identity AUTHORIZATION erp_migrator;
CREATE SCHEMA IF NOT EXISTS catalog AUTHORIZATION erp_migrator;
CREATE SCHEMA IF NOT EXISTS inventory AUTHORIZATION erp_migrator;
CREATE SCHEMA IF NOT EXISTS integration AUTHORIZATION erp_migrator;

GRANT CREATE, USAGE ON SCHEMA public TO erp_migrator;
REVOKE CREATE ON SCHEMA public FROM erp_app;

GRANT USAGE ON SCHEMA identity, catalog, inventory, integration TO erp_app;

ALTER DEFAULT PRIVILEGES FOR ROLE erp_migrator IN SCHEMA identity, catalog, inventory
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE erp_migrator IN SCHEMA integration
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app;
";
    }

    /// <summary>
    /// Idempotent least-privilege grants applied during migrations when the erp_app role exists.
    /// Ensures erp_app does not own tables and has INSERT/SELECT only on integration.AUDIT_LOG.
    /// </summary>
    public static string GenerateAppRoleGrantsSql()
    {
        return @"
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app') THEN
        GRANT USAGE ON SCHEMA identity, catalog, inventory, integration TO erp_app;

        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity TO erp_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA catalog TO erp_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA inventory TO erp_app;

        GRANT SELECT, INSERT, UPDATE, DELETE ON
            integration.""OUTBOX_EVENT_CURSOR"",
            integration.""OUTBOX_EVENT"",
            integration.""IDEMPOTENCY_RECORD""
        TO erp_app;

        REVOKE ALL ON integration.""AUDIT_LOG"" FROM erp_app;
        GRANT SELECT, INSERT ON integration.""AUDIT_LOG"" TO erp_app;
    END IF;
END
$$;";
    }
}
