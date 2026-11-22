using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace PharmacyERP.Infrastructure.Persistence.Triggers;

public static class RlsAndAuditProtectionSql
{
    public static readonly IReadOnlyList<(string Schema, string Table)> TenantBoundTables = new List<(string, string)>
    {
        ("identity", "ORGANIZATION"),
        ("identity", "BRANCH"),
        ("identity", "EMPLOYEE"),
        ("identity", "USER_ACCOUNT"),
        ("identity", "USER_BRANCH_ACCESS"),
        ("identity", "USER_REFRESH_TOKEN"),
        ("identity", "BRANCH_ENROLLMENT"),
        ("catalog", "PRODUCT_CATEGORY"),
        ("catalog", "PRODUCT"),
        ("catalog", "PRODUCT_UOM"),
        ("catalog", "PRODUCT_REORDER_RULE"),
        ("inventory", "INVENTORY_LOCATION"),
        ("inventory", "INVENTORY_BATCH"),
        ("inventory", "STOCK_BALANCE"),
        ("inventory", "INVENTORY_TXN"),
        ("inventory", "INVENTORY_TXN_LINE"),
        ("integration", "OUTBOX_EVENT_CURSOR"),
        ("integration", "OUTBOX_EVENT"),
        ("integration", "IDEMPOTENCY_RECORD"),
        ("integration", "AUDIT_LOG")
    };

    public static IReadOnlyList<(string Schema, string Table)> GetTenantBoundTablesFromModel(IModel model)
    {
        ArgumentNullException.ThrowIfNull(model);

        return model.GetEntityTypes()
            .Where(et =>
            {
                var prop = et.FindProperty("OrganizationId");
                return prop != null && prop.ClrType == typeof(Guid) && !string.IsNullOrWhiteSpace(et.GetTableName());
            })
            .Select(et => (Schema: et.GetSchema() ?? "public", Table: et.GetTableName()!))
            .Distinct()
            .OrderBy(t => t.Schema, StringComparer.Ordinal)
            .ThenBy(t => t.Table, StringComparer.Ordinal)
            .ToArray();
    }

    public static string GenerateEnableRlsSql(string schema, string tableName)
    {
        if (string.IsNullOrWhiteSpace(schema)) throw new ArgumentException("Schema is required.", nameof(schema));
        if (string.IsNullOrWhiteSpace(tableName)) throw new ArgumentException("Table name is required.", nameof(tableName));

        return $@"
ALTER TABLE {schema}.""{tableName}"" ENABLE ROW LEVEL SECURITY;
ALTER TABLE {schema}.""{tableName}"" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON {schema}.""{tableName}"";
CREATE POLICY tenant_isolation_policy ON {schema}.""{tableName}""
    USING (
        COALESCE(current_setting('app.system_bypass', true), 'false') = 'true'
        OR organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    )
    WITH CHECK (
        COALESCE(current_setting('app.system_bypass', true), 'false') = 'true'
        OR organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid
    );";
    }

    public static string GenerateAuditLogImmutabilityTriggerSql()
    {
        return @"
CREATE OR REPLACE FUNCTION integration.prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'integration.AUDIT_LOG is append-only. UPDATE and DELETE operations are strictly forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON integration.""AUDIT_LOG"";
CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON integration.""AUDIT_LOG""
FOR EACH ROW EXECUTE FUNCTION integration.prevent_audit_log_mutation();";
    }

    public static string GenerateCompleteStage1SecuritySql()
        => GenerateCompleteStage1SecuritySql(TenantBoundTables);

    public static string GenerateCompleteStage1SecuritySql(IModel model)
        => GenerateCompleteStage1SecuritySql(GetTenantBoundTablesFromModel(model));

    private static string GenerateCompleteStage1SecuritySql(IEnumerable<(string Schema, string Table)> tables)
    {
        var scripts = tables
            .Select(t => GenerateEnableRlsSql(t.Schema, t.Table))
            .ToList();

        scripts.Add(GenerateAuditLogImmutabilityTriggerSql());
        return string.Join(Environment.NewLine, scripts);
    }

    public static string GenerateDropStage1SecuritySql()
    {
        return @"
DROP TRIGGER IF EXISTS trg_audit_log_immutable ON integration.""AUDIT_LOG"";
DROP FUNCTION IF EXISTS integration.prevent_audit_log_mutation();
DROP TRIGGER IF EXISTS trg_prevent_posted_inventory_txn_line_mutation ON inventory.""INVENTORY_TXN_LINE"";
DROP TRIGGER IF EXISTS trg_prevent_posted_inventory_txn_mutation ON inventory.""INVENTORY_TXN"";
DROP FUNCTION IF EXISTS inventory.fn_prevent_posted_inventory_txn_line_mutation();
DROP FUNCTION IF EXISTS inventory.fn_prevent_posted_inventory_txn_mutation();";
    }
}