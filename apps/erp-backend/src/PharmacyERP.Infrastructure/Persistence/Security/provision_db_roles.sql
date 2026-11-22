-- Run as DBA during database bootstrap with secret passwords injected via psql variables:
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
