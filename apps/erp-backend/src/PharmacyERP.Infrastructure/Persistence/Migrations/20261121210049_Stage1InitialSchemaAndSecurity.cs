using System;
using Microsoft.EntityFrameworkCore.Migrations;
using PharmacyERP.Infrastructure.Persistence.Security;
using PharmacyERP.Infrastructure.Persistence.Triggers;

#nullable disable

namespace PharmacyERP.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Stage1InitialSchemaAndSecurity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "integration");

            migrationBuilder.EnsureSchema(
                name: "identity");

            migrationBuilder.EnsureSchema(
                name: "inventory");

            migrationBuilder.EnsureSchema(
                name: "catalog");

            migrationBuilder.CreateTable(
                name: "ORGANIZATION",
                schema: "identity",
                columns: table => new
                {
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_code = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    name = table.Column<string>(type: "varchar(150)", maxLength: 150, nullable: false),
                    base_currency = table.Column<string>(type: "char(3)", maxLength: 3, nullable: false, defaultValue: "EGP"),
                    time_zone_id = table.Column<string>(type: "varchar(64)", maxLength: 64, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    address_city = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false),
                    address_country_code = table.Column<string>(type: "char(2)", maxLength: 2, nullable: false),
                    address_line1 = table.Column<string>(type: "varchar(200)", maxLength: 200, nullable: false),
                    address_line2 = table.Column<string>(type: "varchar(200)", maxLength: 200, nullable: true),
                    address_postal_code = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: true),
                    address_region = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ORGANIZATION", x => x.organization_id);
                });

            migrationBuilder.CreateTable(
                name: "PRODUCT_CATEGORY",
                schema: "catalog",
                columns: table => new
                {
                    category_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    parent_category_id = table.Column<Guid>(type: "uuid", nullable: true),
                    code = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    name = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false),
                    description = table.Column<string>(type: "varchar(250)", maxLength: 250, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PRODUCT_CATEGORY", x => x.category_id);
                    table.UniqueConstraint("AK_PRODUCT_CATEGORY_organization_id_category_id", x => new { x.organization_id, x.category_id });
                    table.CheckConstraint("CK_PRODUCT_CATEGORY_no_self_parent", "parent_category_id IS NULL OR parent_category_id <> category_id");
                    table.ForeignKey(
                        name: "FK_PRODUCT_CATEGORY_PRODUCT_CATEGORY_organization_id_parent_ca~",
                        columns: x => new { x.organization_id, x.parent_category_id },
                        principalSchema: "catalog",
                        principalTable: "PRODUCT_CATEGORY",
                        principalColumns: new[] { "organization_id", "category_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "BRANCH",
                schema: "identity",
                columns: table => new
                {
                    branch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    branch_code = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    name = table.Column<string>(type: "varchar(150)", maxLength: 150, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    address_city = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false),
                    address_country_code = table.Column<string>(type: "char(2)", maxLength: 2, nullable: false),
                    address_line1 = table.Column<string>(type: "varchar(200)", maxLength: 200, nullable: false),
                    address_line2 = table.Column<string>(type: "varchar(200)", maxLength: 200, nullable: true),
                    address_postal_code = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: true),
                    address_region = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BRANCH", x => x.branch_id);
                    table.UniqueConstraint("AK_BRANCH_organization_id_branch_id", x => new { x.organization_id, x.branch_id });
                    table.ForeignKey(
                        name: "FK_BRANCH_ORGANIZATION_organization_id",
                        column: x => x.organization_id,
                        principalSchema: "identity",
                        principalTable: "ORGANIZATION",
                        principalColumn: "organization_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OUTBOX_EVENT_CURSOR",
                schema: "integration",
                columns: table => new
                {
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    last_event_sequence = table.Column<long>(type: "bigint", nullable: false, defaultValue: 0L),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OUTBOX_EVENT_CURSOR", x => x.organization_id);
                    table.CheckConstraint("CK_OUTBOX_EVENT_CURSOR_nonnegative", "last_event_sequence >= 0");
                    table.ForeignKey(
                        name: "FK_OUTBOX_EVENT_CURSOR_ORGANIZATION_organization_id",
                        column: x => x.organization_id,
                        principalSchema: "identity",
                        principalTable: "ORGANIZATION",
                        principalColumn: "organization_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PRODUCT",
                schema: "catalog",
                columns: table => new
                {
                    product_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    category_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sku = table.Column<string>(type: "varchar(40)", maxLength: 40, nullable: false),
                    barcode = table.Column<string>(type: "varchar(80)", maxLength: 80, nullable: true),
                    name = table.Column<string>(type: "varchar(180)", maxLength: 180, nullable: false),
                    generic_name = table.Column<string>(type: "varchar(180)", maxLength: 180, nullable: true),
                    brand_name = table.Column<string>(type: "varchar(180)", maxLength: 180, nullable: true),
                    base_uom_code = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    tax_rate = table.Column<decimal>(type: "numeric(9,4)", nullable: false, defaultValue: 0m),
                    image_url = table.Column<string>(type: "varchar(300)", maxLength: 300, nullable: true),
                    lot_tracking_required = table.Column<bool>(type: "boolean", nullable: false),
                    expiry_alert_days = table.Column<int>(type: "integer", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PRODUCT", x => x.product_id);
                    table.UniqueConstraint("AK_PRODUCT_organization_id_product_id", x => new { x.organization_id, x.product_id });
                    table.CheckConstraint("CK_PRODUCT_expiry_alert_days_nonnegative", "expiry_alert_days >= 0");
                    table.CheckConstraint("CK_PRODUCT_tax_rate_range", "tax_rate >= 0 AND tax_rate <= 1");
                    table.ForeignKey(
                        name: "FK_PRODUCT_PRODUCT_CATEGORY_organization_id_category_id",
                        columns: x => new { x.organization_id, x.category_id },
                        principalSchema: "catalog",
                        principalTable: "PRODUCT_CATEGORY",
                        principalColumns: new[] { "organization_id", "category_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "BRANCH_ENROLLMENT",
                schema: "identity",
                columns: table => new
                {
                    enrollment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    branch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_hash = table.Column<byte[]>(type: "bytea", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    used_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BRANCH_ENROLLMENT", x => x.enrollment_id);
                    table.ForeignKey(
                        name: "FK_BRANCH_ENROLLMENT_BRANCH_organization_id_branch_id",
                        columns: x => new { x.organization_id, x.branch_id },
                        principalSchema: "identity",
                        principalTable: "BRANCH",
                        principalColumns: new[] { "organization_id", "branch_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "EMPLOYEE",
                schema: "identity",
                columns: table => new
                {
                    employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    branch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    employee_no = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    full_name = table.Column<string>(type: "varchar(150)", maxLength: 150, nullable: false),
                    email = table.Column<string>(type: "varchar(254)", maxLength: 254, nullable: true),
                    phone = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: true),
                    job_title = table.Column<string>(type: "varchar(80)", maxLength: 80, nullable: false),
                    hired_on = table.Column<DateOnly>(type: "date", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    address_city = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false),
                    address_country_code = table.Column<string>(type: "char(2)", maxLength: 2, nullable: false),
                    address_line1 = table.Column<string>(type: "varchar(200)", maxLength: 200, nullable: false),
                    address_line2 = table.Column<string>(type: "varchar(200)", maxLength: 200, nullable: true),
                    address_postal_code = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: true),
                    address_region = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EMPLOYEE", x => x.employee_id);
                    table.UniqueConstraint("AK_EMPLOYEE_organization_id_branch_id_employee_id", x => new { x.organization_id, x.branch_id, x.employee_id });
                    table.UniqueConstraint("AK_EMPLOYEE_organization_id_employee_id", x => new { x.organization_id, x.employee_id });
                    table.ForeignKey(
                        name: "FK_EMPLOYEE_BRANCH_organization_id_branch_id",
                        columns: x => new { x.organization_id, x.branch_id },
                        principalSchema: "identity",
                        principalTable: "BRANCH",
                        principalColumns: new[] { "organization_id", "branch_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "IDEMPOTENCY_RECORD",
                schema: "integration",
                columns: table => new
                {
                    idempotency_record_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    branch_id = table.Column<Guid>(type: "uuid", nullable: true),
                    operation_scope = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    idempotency_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    payload_hash = table.Column<string>(type: "char(64)", fixedLength: true, maxLength: 64, nullable: false),
                    response_body = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IDEMPOTENCY_RECORD", x => x.idempotency_record_id);
                    table.ForeignKey(
                        name: "FK_IDEMPOTENCY_RECORD_BRANCH_organization_id_branch_id",
                        columns: x => new { x.organization_id, x.branch_id },
                        principalSchema: "identity",
                        principalTable: "BRANCH",
                        principalColumns: new[] { "organization_id", "branch_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "INVENTORY_LOCATION",
                schema: "inventory",
                columns: table => new
                {
                    location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    branch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    location_code = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    location_type = table.Column<string>(type: "character varying(25)", maxLength: 25, nullable: false),
                    is_sellable = table.Column<bool>(type: "boolean", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_INVENTORY_LOCATION", x => x.location_id);
                    table.UniqueConstraint("AK_INVENTORY_LOCATION_organization_id_branch_id_location_id", x => new { x.organization_id, x.branch_id, x.location_id });
                    table.UniqueConstraint("AK_INVENTORY_LOCATION_organization_id_location_id", x => new { x.organization_id, x.location_id });
                    table.CheckConstraint("CK_INVENTORY_LOCATION_sellable_rule", "NOT is_sellable OR location_type = 'SELLABLE'");
                    table.CheckConstraint("CK_INVENTORY_LOCATION_type", "location_type IN ('SELLABLE', 'QUARANTINE', 'DAMAGED', 'SCRAP')");
                    table.ForeignKey(
                        name: "FK_INVENTORY_LOCATION_BRANCH_organization_id_branch_id",
                        columns: x => new { x.organization_id, x.branch_id },
                        principalSchema: "identity",
                        principalTable: "BRANCH",
                        principalColumns: new[] { "organization_id", "branch_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OUTBOX_EVENT",
                schema: "integration",
                columns: table => new
                {
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    branch_id = table.Column<Guid>(type: "uuid", nullable: true),
                    event_sequence = table.Column<long>(type: "bigint", nullable: false),
                    event_type = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    schema_version = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    payload = table.Column<string>(type: "jsonb", nullable: false),
                    occurred_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    published_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: true),
                    attempt_count = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    last_error = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    trace_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OUTBOX_EVENT", x => x.event_id);
                    table.CheckConstraint("CK_OUTBOX_EVENT_attempt_count", "attempt_count >= 0");
                    table.ForeignKey(
                        name: "FK_OUTBOX_EVENT_BRANCH_organization_id_branch_id",
                        columns: x => new { x.organization_id, x.branch_id },
                        principalSchema: "identity",
                        principalTable: "BRANCH",
                        principalColumns: new[] { "organization_id", "branch_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OUTBOX_EVENT_OUTBOX_EVENT_CURSOR_organization_id",
                        column: x => x.organization_id,
                        principalSchema: "integration",
                        principalTable: "OUTBOX_EVENT_CURSOR",
                        principalColumn: "organization_id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "INVENTORY_BATCH",
                schema: "inventory",
                columns: table => new
                {
                    batch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    product_id = table.Column<Guid>(type: "uuid", nullable: false),
                    batch_number = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    manufactured_on = table.Column<DateOnly>(type: "date", nullable: true),
                    expires_on = table.Column<DateOnly>(type: "date", nullable: true),
                    quality_status = table.Column<string>(type: "character varying(25)", maxLength: 25, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_INVENTORY_BATCH", x => x.batch_id);
                    table.UniqueConstraint("AK_INVENTORY_BATCH_organization_id_batch_id", x => new { x.organization_id, x.batch_id });
                    table.UniqueConstraint("AK_INVENTORY_BATCH_organization_id_product_id_batch_id", x => new { x.organization_id, x.product_id, x.batch_id });
                    table.CheckConstraint("CK_INVENTORY_BATCH_dates", "manufactured_on IS NULL OR expires_on IS NULL OR manufactured_on <= expires_on");
                    table.CheckConstraint("CK_INVENTORY_BATCH_quality_status", "quality_status IN ('AVAILABLE', 'QUARANTINED', 'EXPIRED', 'RECALLED')");
                    table.ForeignKey(
                        name: "FK_INVENTORY_BATCH_PRODUCT_organization_id_product_id",
                        columns: x => new { x.organization_id, x.product_id },
                        principalSchema: "catalog",
                        principalTable: "PRODUCT",
                        principalColumns: new[] { "organization_id", "product_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PRODUCT_REORDER_RULE",
                schema: "catalog",
                columns: table => new
                {
                    reorder_rule_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    product_id = table.Column<Guid>(type: "uuid", nullable: false),
                    branch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reorder_point_base = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    reorder_quantity_base = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    max_quantity_base = table.Column<decimal>(type: "numeric(18,4)", nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PRODUCT_REORDER_RULE", x => x.reorder_rule_id);
                    table.UniqueConstraint("AK_PRODUCT_REORDER_RULE_organization_id_reorder_rule_id", x => new { x.organization_id, x.reorder_rule_id });
                    table.CheckConstraint("CK_PRODUCT_REORDER_RULE_max_ge_point", "max_quantity_base IS NULL OR max_quantity_base >= reorder_point_base");
                    table.CheckConstraint("CK_PRODUCT_REORDER_RULE_nonnegative", "reorder_point_base >= 0 AND reorder_quantity_base >= 0");
                    table.ForeignKey(
                        name: "FK_PRODUCT_REORDER_RULE_BRANCH_organization_id_branch_id",
                        columns: x => new { x.organization_id, x.branch_id },
                        principalSchema: "identity",
                        principalTable: "BRANCH",
                        principalColumns: new[] { "organization_id", "branch_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PRODUCT_REORDER_RULE_PRODUCT_organization_id_product_id",
                        columns: x => new { x.organization_id, x.product_id },
                        principalSchema: "catalog",
                        principalTable: "PRODUCT",
                        principalColumns: new[] { "organization_id", "product_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PRODUCT_UOM",
                schema: "catalog",
                columns: table => new
                {
                    product_uom_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    product_id = table.Column<Guid>(type: "uuid", nullable: false),
                    uom_code = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    display_name = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    conversion_to_base = table.Column<decimal>(type: "numeric(18,6)", nullable: false),
                    sale_unit_price = table.Column<decimal>(type: "numeric(18,4)", nullable: true),
                    is_base = table.Column<bool>(type: "boolean", nullable: false),
                    is_sellable = table.Column<bool>(type: "boolean", nullable: false),
                    is_purchasable = table.Column<bool>(type: "boolean", nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PRODUCT_UOM", x => x.product_uom_id);
                    table.UniqueConstraint("AK_PRODUCT_UOM_organization_id_product_id_product_uom_id", x => new { x.organization_id, x.product_id, x.product_uom_id });
                    table.CheckConstraint("CK_PRODUCT_UOM_base_conversion_one", "NOT is_base OR conversion_to_base = 1");
                    table.CheckConstraint("CK_PRODUCT_UOM_conversion_positive", "conversion_to_base > 0");
                    table.CheckConstraint("CK_PRODUCT_UOM_sellable_price", "NOT is_sellable OR (sale_unit_price IS NOT NULL AND sale_unit_price >= 0)");
                    table.ForeignKey(
                        name: "FK_PRODUCT_UOM_PRODUCT_organization_id_product_id",
                        columns: x => new { x.organization_id, x.product_id },
                        principalSchema: "catalog",
                        principalTable: "PRODUCT",
                        principalColumns: new[] { "organization_id", "product_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "INVENTORY_TXN",
                schema: "inventory",
                columns: table => new
                {
                    inventory_txn_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    branch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    transaction_no = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    transaction_type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    reason_code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    idempotency_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    created_by_employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reverses_inventory_txn_id = table.Column<Guid>(type: "uuid", nullable: true),
                    sales_order_id = table.Column<Guid>(type: "uuid", nullable: true),
                    sales_return_id = table.Column<Guid>(type: "uuid", nullable: true),
                    purchase_order_id = table.Column<Guid>(type: "uuid", nullable: true),
                    vendor_return_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    posted_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_INVENTORY_TXN", x => x.inventory_txn_id);
                    table.UniqueConstraint("AK_INVENTORY_TXN_organization_id_inventory_txn_id", x => new { x.organization_id, x.inventory_txn_id });
                    table.UniqueConstraint("AK_INVENTORY_TXN_organization_id_inventory_txn_id_branch_id", x => new { x.organization_id, x.inventory_txn_id, x.branch_id });
                    table.CheckConstraint("CK_INVENTORY_TXN_status", "status IN ('DRAFT', 'POSTED', 'CANCELLED')");
                    table.CheckConstraint("CK_INVENTORY_TXN_type", "transaction_type IN ('OPENING_BALANCE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'SALE_ISSUE', 'SALES_RETURN_IN', 'PURCHASE_RECEIPT', 'VENDOR_RETURN_OUT', 'SCRAP_OUT', 'REVERSAL')");
                    table.ForeignKey(
                        name: "FK_INVENTORY_TXN_BRANCH_organization_id_branch_id",
                        columns: x => new { x.organization_id, x.branch_id },
                        principalSchema: "identity",
                        principalTable: "BRANCH",
                        principalColumns: new[] { "organization_id", "branch_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_INVENTORY_TXN_EMPLOYEE_organization_id_created_by_employee_~",
                        columns: x => new { x.organization_id, x.created_by_employee_id },
                        principalSchema: "identity",
                        principalTable: "EMPLOYEE",
                        principalColumns: new[] { "organization_id", "employee_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_INVENTORY_TXN_INVENTORY_TXN_organization_id_reverses_invent~",
                        columns: x => new { x.organization_id, x.reverses_inventory_txn_id },
                        principalSchema: "inventory",
                        principalTable: "INVENTORY_TXN",
                        principalColumns: new[] { "organization_id", "inventory_txn_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "USER_ACCOUNT",
                schema: "identity",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    employee_id = table.Column<Guid>(type: "uuid", nullable: false),
                    username = table.Column<string>(type: "varchar(80)", maxLength: 80, nullable: false),
                    normalized_username = table.Column<string>(type: "varchar(80)", maxLength: 80, nullable: false),
                    password_hash = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: false),
                    role = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    branch_scope = table.Column<string>(type: "varchar(10)", maxLength: 10, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    access_failed_count = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    lockout_end = table.Column<DateTimeOffset>(type: "timestamptz", nullable: true),
                    last_login_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_USER_ACCOUNT", x => x.user_id);
                    table.UniqueConstraint("AK_USER_ACCOUNT_organization_id_user_id", x => new { x.organization_id, x.user_id });
                    table.CheckConstraint("CK_USER_ACCOUNT_branch_scope", "branch_scope IN ('ALL', 'ASSIGNED')");
                    table.CheckConstraint("CK_USER_ACCOUNT_role", "role IN ('Admin', 'Pharmacist', 'Cashier')");
                    table.CheckConstraint("CK_USER_ACCOUNT_scope_admin_only", "branch_scope <> 'ALL' OR role = 'Admin'");
                    table.ForeignKey(
                        name: "FK_USER_ACCOUNT_EMPLOYEE_organization_id_employee_id",
                        columns: x => new { x.organization_id, x.employee_id },
                        principalSchema: "identity",
                        principalTable: "EMPLOYEE",
                        principalColumns: new[] { "organization_id", "employee_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "STOCK_BALANCE",
                schema: "inventory",
                columns: table => new
                {
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    batch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    on_hand_qty_base = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    average_unit_cost = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    row_version = table.Column<long>(type: "bigint", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_STOCK_BALANCE", x => new { x.organization_id, x.location_id, x.batch_id });
                    table.CheckConstraint("CK_STOCK_BALANCE_nonnegative_cost", "average_unit_cost >= 0");
                    table.CheckConstraint("CK_STOCK_BALANCE_nonnegative_qty", "on_hand_qty_base >= 0");
                    table.ForeignKey(
                        name: "FK_STOCK_BALANCE_INVENTORY_BATCH_organization_id_batch_id",
                        columns: x => new { x.organization_id, x.batch_id },
                        principalSchema: "inventory",
                        principalTable: "INVENTORY_BATCH",
                        principalColumns: new[] { "organization_id", "batch_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_STOCK_BALANCE_INVENTORY_LOCATION_organization_id_location_id",
                        columns: x => new { x.organization_id, x.location_id },
                        principalSchema: "inventory",
                        principalTable: "INVENTORY_LOCATION",
                        principalColumns: new[] { "organization_id", "location_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "INVENTORY_TXN_LINE",
                schema: "inventory",
                columns: table => new
                {
                    inventory_txn_line_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    inventory_txn_id = table.Column<Guid>(type: "uuid", nullable: false),
                    branch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    product_id = table.Column<Guid>(type: "uuid", nullable: false),
                    location_id = table.Column<Guid>(type: "uuid", nullable: false),
                    batch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    product_uom_id = table.Column<Guid>(type: "uuid", nullable: false),
                    entered_qty = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    conversion_snapshot = table.Column<decimal>(type: "numeric(18,6)", nullable: false),
                    quantity_delta_base = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    unit_cost_base = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    sales_order_line_id = table.Column<Guid>(type: "uuid", nullable: true),
                    sales_return_line_id = table.Column<Guid>(type: "uuid", nullable: true),
                    purchase_order_line_id = table.Column<Guid>(type: "uuid", nullable: true),
                    vendor_return_line_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_INVENTORY_TXN_LINE", x => x.inventory_txn_line_id);
                    table.CheckConstraint("CK_INVENTORY_TXN_LINE_delta_math", "abs(quantity_delta_base) = round(entered_qty * conversion_snapshot, 4)");
                    table.CheckConstraint("CK_INVENTORY_TXN_LINE_positive_factors", "entered_qty > 0 AND conversion_snapshot > 0 AND quantity_delta_base <> 0 AND unit_cost_base >= 0");
                    table.ForeignKey(
                        name: "FK_INVENTORY_TXN_LINE_INVENTORY_BATCH_organization_id_product_~",
                        columns: x => new { x.organization_id, x.product_id, x.batch_id },
                        principalSchema: "inventory",
                        principalTable: "INVENTORY_BATCH",
                        principalColumns: new[] { "organization_id", "product_id", "batch_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_INVENTORY_TXN_LINE_INVENTORY_LOCATION_organization_id_branc~",
                        columns: x => new { x.organization_id, x.branch_id, x.location_id },
                        principalSchema: "inventory",
                        principalTable: "INVENTORY_LOCATION",
                        principalColumns: new[] { "organization_id", "branch_id", "location_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_INVENTORY_TXN_LINE_INVENTORY_TXN_organization_id_inventory_~",
                        columns: x => new { x.organization_id, x.inventory_txn_id, x.branch_id },
                        principalSchema: "inventory",
                        principalTable: "INVENTORY_TXN",
                        principalColumns: new[] { "organization_id", "inventory_txn_id", "branch_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_INVENTORY_TXN_LINE_PRODUCT_UOM_organization_id_product_id_p~",
                        columns: x => new { x.organization_id, x.product_id, x.product_uom_id },
                        principalSchema: "catalog",
                        principalTable: "PRODUCT_UOM",
                        principalColumns: new[] { "organization_id", "product_id", "product_uom_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AUDIT_LOG",
                schema: "integration",
                columns: table => new
                {
                    audit_log_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    branch_id = table.Column<Guid>(type: "uuid", nullable: true),
                    actor_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    actor_employee_id = table.Column<Guid>(type: "uuid", nullable: true),
                    actor_type = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    action = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    entity_schema = table.Column<string>(type: "character varying(63)", maxLength: 63, nullable: false),
                    entity_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    entity_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_prompt_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    before_data = table.Column<string>(type: "jsonb", nullable: true),
                    after_data = table.Column<string>(type: "jsonb", nullable: true),
                    trace_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AUDIT_LOG", x => x.audit_log_id);
                    table.CheckConstraint("CK_AUDIT_LOG_actor_type", "actor_type IN ('USER', 'SYSTEM', 'AI_ASSISTED')");
                    table.ForeignKey(
                        name: "FK_AUDIT_LOG_BRANCH_organization_id_branch_id",
                        columns: x => new { x.organization_id, x.branch_id },
                        principalSchema: "identity",
                        principalTable: "BRANCH",
                        principalColumns: new[] { "organization_id", "branch_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AUDIT_LOG_EMPLOYEE_organization_id_actor_employee_id",
                        columns: x => new { x.organization_id, x.actor_employee_id },
                        principalSchema: "identity",
                        principalTable: "EMPLOYEE",
                        principalColumns: new[] { "organization_id", "employee_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AUDIT_LOG_USER_ACCOUNT_organization_id_actor_user_id",
                        columns: x => new { x.organization_id, x.actor_user_id },
                        principalSchema: "identity",
                        principalTable: "USER_ACCOUNT",
                        principalColumns: new[] { "organization_id", "user_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "USER_BRANCH_ACCESS",
                schema: "identity",
                columns: table => new
                {
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    branch_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_USER_BRANCH_ACCESS", x => new { x.organization_id, x.user_id, x.branch_id });
                    table.ForeignKey(
                        name: "FK_USER_BRANCH_ACCESS_BRANCH_organization_id_branch_id",
                        columns: x => new { x.organization_id, x.branch_id },
                        principalSchema: "identity",
                        principalTable: "BRANCH",
                        principalColumns: new[] { "organization_id", "branch_id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_USER_BRANCH_ACCESS_USER_ACCOUNT_organization_id_user_id",
                        columns: x => new { x.organization_id, x.user_id },
                        principalSchema: "identity",
                        principalTable: "USER_ACCOUNT",
                        principalColumns: new[] { "organization_id", "user_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "USER_REFRESH_TOKEN",
                schema: "identity",
                columns: table => new
                {
                    refresh_token_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_hash = table.Column<byte[]>(type: "bytea", nullable: false),
                    token_family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    issued_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false),
                    consumed_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: true),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamptz", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_USER_REFRESH_TOKEN", x => x.refresh_token_id);
                    table.CheckConstraint("CK_USER_REFRESH_TOKEN_expiry", "expires_at > issued_at");
                    table.ForeignKey(
                        name: "FK_USER_REFRESH_TOKEN_USER_ACCOUNT_organization_id_user_id",
                        columns: x => new { x.organization_id, x.user_id },
                        principalSchema: "identity",
                        principalTable: "USER_ACCOUNT",
                        principalColumns: new[] { "organization_id", "user_id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AUDIT_LOG_organization_id_actor_employee_id",
                schema: "integration",
                table: "AUDIT_LOG",
                columns: new[] { "organization_id", "actor_employee_id" });

            migrationBuilder.CreateIndex(
                name: "IX_AUDIT_LOG_organization_id_actor_user_id_created_at",
                schema: "integration",
                table: "AUDIT_LOG",
                columns: new[] { "organization_id", "actor_user_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_AUDIT_LOG_organization_id_branch_id_created_at",
                schema: "integration",
                table: "AUDIT_LOG",
                columns: new[] { "organization_id", "branch_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_AUDIT_LOG_organization_id_created_at",
                schema: "integration",
                table: "AUDIT_LOG",
                columns: new[] { "organization_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_AUDIT_LOG_organization_id_entity_schema_entity_name_entity_~",
                schema: "integration",
                table: "AUDIT_LOG",
                columns: new[] { "organization_id", "entity_schema", "entity_name", "entity_id" });

            migrationBuilder.CreateIndex(
                name: "IX_BRANCH_organization_id_branch_code",
                schema: "identity",
                table: "BRANCH",
                columns: new[] { "organization_id", "branch_code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BRANCH_organization_id_is_active_name",
                schema: "identity",
                table: "BRANCH",
                columns: new[] { "organization_id", "is_active", "name" });

            migrationBuilder.CreateIndex(
                name: "IX_BRANCH_ENROLLMENT_organization_id_branch_id_expires_at",
                schema: "identity",
                table: "BRANCH_ENROLLMENT",
                columns: new[] { "organization_id", "branch_id", "expires_at" });

            migrationBuilder.CreateIndex(
                name: "IX_BRANCH_ENROLLMENT_token_hash",
                schema: "identity",
                table: "BRANCH_ENROLLMENT",
                column: "token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EMPLOYEE_organization_id_branch_id_employee_no",
                schema: "identity",
                table: "EMPLOYEE",
                columns: new[] { "organization_id", "branch_id", "employee_no" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EMPLOYEE_organization_id_branch_id_is_active",
                schema: "identity",
                table: "EMPLOYEE",
                columns: new[] { "organization_id", "branch_id", "is_active" });

            migrationBuilder.CreateIndex(
                name: "IX_EMPLOYEE_organization_id_email",
                schema: "identity",
                table: "EMPLOYEE",
                columns: new[] { "organization_id", "email" });

            migrationBuilder.CreateIndex(
                name: "IX_EMPLOYEE_organization_id_full_name",
                schema: "identity",
                table: "EMPLOYEE",
                columns: new[] { "organization_id", "full_name" });

            migrationBuilder.CreateIndex(
                name: "IX_EMPLOYEE_organization_id_phone",
                schema: "identity",
                table: "EMPLOYEE",
                columns: new[] { "organization_id", "phone" });

            migrationBuilder.CreateIndex(
                name: "IX_IDEMPOTENCY_RECORD_organization_id_branch_id_operation_scop~",
                schema: "integration",
                table: "IDEMPOTENCY_RECORD",
                columns: new[] { "organization_id", "branch_id", "operation_scope", "idempotency_key" },
                unique: true,
                filter: "branch_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_IDEMPOTENCY_RECORD_organization_id_operation_scope_idempote~",
                schema: "integration",
                table: "IDEMPOTENCY_RECORD",
                columns: new[] { "organization_id", "operation_scope", "idempotency_key" },
                unique: true,
                filter: "branch_id IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_INVENTORY_BATCH_organization_id_product_id_batch_number",
                schema: "inventory",
                table: "INVENTORY_BATCH",
                columns: new[] { "organization_id", "product_id", "batch_number" },
                unique: true,
                filter: "expires_on IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_INVENTORY_BATCH_organization_id_product_id_batch_number_exp~",
                schema: "inventory",
                table: "INVENTORY_BATCH",
                columns: new[] { "organization_id", "product_id", "batch_number", "expires_on" },
                unique: true,
                filter: "expires_on IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_INVENTORY_BATCH_organization_id_product_id_quality_status_e~",
                schema: "inventory",
                table: "INVENTORY_BATCH",
                columns: new[] { "organization_id", "product_id", "quality_status", "expires_on", "batch_id" });

            migrationBuilder.CreateIndex(
                name: "IX_INVENTORY_LOCATION_organization_id_branch_id_is_sellable_lo~",
                schema: "inventory",
                table: "INVENTORY_LOCATION",
                columns: new[] { "organization_id", "branch_id", "is_sellable", "location_id" });

            migrationBuilder.CreateIndex(
                name: "IX_INVENTORY_LOCATION_organization_id_branch_id_location_code",
                schema: "inventory",
                table: "INVENTORY_LOCATION",
                columns: new[] { "organization_id", "branch_id", "location_code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_INVENTORY_TXN_organization_id_branch_id_posted_at_inventory~",
                schema: "inventory",
                table: "INVENTORY_TXN",
                columns: new[] { "organization_id", "branch_id", "posted_at", "inventory_txn_id" });

            migrationBuilder.CreateIndex(
                name: "IX_INVENTORY_TXN_organization_id_branch_id_transaction_no",
                schema: "inventory",
                table: "INVENTORY_TXN",
                columns: new[] { "organization_id", "branch_id", "transaction_no" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_INVENTORY_TXN_organization_id_branch_id_transaction_type_id~",
                schema: "inventory",
                table: "INVENTORY_TXN",
                columns: new[] { "organization_id", "branch_id", "transaction_type", "idempotency_key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_INVENTORY_TXN_organization_id_created_by_employee_id",
                schema: "inventory",
                table: "INVENTORY_TXN",
                columns: new[] { "organization_id", "created_by_employee_id" });

            migrationBuilder.CreateIndex(
                name: "IX_INVENTORY_TXN_organization_id_reverses_inventory_txn_id",
                schema: "inventory",
                table: "INVENTORY_TXN",
                columns: new[] { "organization_id", "reverses_inventory_txn_id" });

            migrationBuilder.CreateIndex(
                name: "IX_INVENTORY_TXN_LINE_organization_id_branch_id_location_id",
                schema: "inventory",
                table: "INVENTORY_TXN_LINE",
                columns: new[] { "organization_id", "branch_id", "location_id" });

            migrationBuilder.CreateIndex(
                name: "IX_INVENTORY_TXN_LINE_organization_id_inventory_txn_id_branch_~",
                schema: "inventory",
                table: "INVENTORY_TXN_LINE",
                columns: new[] { "organization_id", "inventory_txn_id", "branch_id" });

            migrationBuilder.CreateIndex(
                name: "IX_INVENTORY_TXN_LINE_organization_id_product_id_batch_id",
                schema: "inventory",
                table: "INVENTORY_TXN_LINE",
                columns: new[] { "organization_id", "product_id", "batch_id" });

            migrationBuilder.CreateIndex(
                name: "IX_INVENTORY_TXN_LINE_organization_id_product_id_product_uom_id",
                schema: "inventory",
                table: "INVENTORY_TXN_LINE",
                columns: new[] { "organization_id", "product_id", "product_uom_id" });

            migrationBuilder.CreateIndex(
                name: "IX_ORGANIZATION_is_active",
                schema: "identity",
                table: "ORGANIZATION",
                column: "is_active");

            migrationBuilder.CreateIndex(
                name: "IX_ORGANIZATION_name",
                schema: "identity",
                table: "ORGANIZATION",
                column: "name");

            migrationBuilder.CreateIndex(
                name: "IX_ORGANIZATION_organization_code",
                schema: "identity",
                table: "ORGANIZATION",
                column: "organization_code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OUTBOX_EVENT_organization_id_branch_id_event_sequence",
                schema: "integration",
                table: "OUTBOX_EVENT",
                columns: new[] { "organization_id", "branch_id", "event_sequence" });

            migrationBuilder.CreateIndex(
                name: "IX_OUTBOX_EVENT_organization_id_event_sequence",
                schema: "integration",
                table: "OUTBOX_EVENT",
                columns: new[] { "organization_id", "event_sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OUTBOX_EVENT_published_at_occurred_at",
                schema: "integration",
                table: "OUTBOX_EVENT",
                columns: new[] { "published_at", "occurred_at" },
                filter: "published_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PRODUCT_organization_id_barcode",
                schema: "catalog",
                table: "PRODUCT",
                columns: new[] { "organization_id", "barcode" },
                unique: true,
                filter: "barcode IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PRODUCT_organization_id_category_id_is_active",
                schema: "catalog",
                table: "PRODUCT",
                columns: new[] { "organization_id", "category_id", "is_active" });

            migrationBuilder.CreateIndex(
                name: "IX_PRODUCT_organization_id_generic_name",
                schema: "catalog",
                table: "PRODUCT",
                columns: new[] { "organization_id", "generic_name" });

            migrationBuilder.CreateIndex(
                name: "IX_PRODUCT_organization_id_name",
                schema: "catalog",
                table: "PRODUCT",
                columns: new[] { "organization_id", "name" });

            migrationBuilder.CreateIndex(
                name: "IX_PRODUCT_organization_id_sku",
                schema: "catalog",
                table: "PRODUCT",
                columns: new[] { "organization_id", "sku" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PRODUCT_organization_id_updated_at_product_id",
                schema: "catalog",
                table: "PRODUCT",
                columns: new[] { "organization_id", "updated_at", "product_id" });

            migrationBuilder.CreateIndex(
                name: "IX_PRODUCT_CATEGORY_organization_id_code",
                schema: "catalog",
                table: "PRODUCT_CATEGORY",
                columns: new[] { "organization_id", "code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PRODUCT_CATEGORY_organization_id_name",
                schema: "catalog",
                table: "PRODUCT_CATEGORY",
                columns: new[] { "organization_id", "name" });

            migrationBuilder.CreateIndex(
                name: "IX_PRODUCT_CATEGORY_organization_id_parent_category_id_is_acti~",
                schema: "catalog",
                table: "PRODUCT_CATEGORY",
                columns: new[] { "organization_id", "parent_category_id", "is_active" });

            migrationBuilder.CreateIndex(
                name: "IX_PRODUCT_REORDER_RULE_organization_id_branch_id_is_active",
                schema: "catalog",
                table: "PRODUCT_REORDER_RULE",
                columns: new[] { "organization_id", "branch_id", "is_active" });

            migrationBuilder.CreateIndex(
                name: "IX_PRODUCT_REORDER_RULE_organization_id_product_id_branch_id",
                schema: "catalog",
                table: "PRODUCT_REORDER_RULE",
                columns: new[] { "organization_id", "product_id", "branch_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PRODUCT_UOM_organization_id_product_id",
                schema: "catalog",
                table: "PRODUCT_UOM",
                columns: new[] { "organization_id", "product_id" },
                unique: true,
                filter: "is_base = true AND is_active = true");

            migrationBuilder.CreateIndex(
                name: "IX_PRODUCT_UOM_organization_id_product_id_uom_code",
                schema: "catalog",
                table: "PRODUCT_UOM",
                columns: new[] { "organization_id", "product_id", "uom_code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_STOCK_BALANCE_organization_id_batch_id_location_id",
                schema: "inventory",
                table: "STOCK_BALANCE",
                columns: new[] { "organization_id", "batch_id", "location_id" });

            migrationBuilder.CreateIndex(
                name: "IX_USER_ACCOUNT_organization_id_employee_id",
                schema: "identity",
                table: "USER_ACCOUNT",
                columns: new[] { "organization_id", "employee_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_USER_ACCOUNT_organization_id_normalized_username",
                schema: "identity",
                table: "USER_ACCOUNT",
                columns: new[] { "organization_id", "normalized_username" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_USER_ACCOUNT_organization_id_role_is_active",
                schema: "identity",
                table: "USER_ACCOUNT",
                columns: new[] { "organization_id", "role", "is_active" });

            migrationBuilder.CreateIndex(
                name: "IX_USER_BRANCH_ACCESS_organization_id_branch_id_user_id",
                schema: "identity",
                table: "USER_BRANCH_ACCESS",
                columns: new[] { "organization_id", "branch_id", "user_id" });

            migrationBuilder.CreateIndex(
                name: "IX_USER_REFRESH_TOKEN_organization_id_token_family_id",
                schema: "identity",
                table: "USER_REFRESH_TOKEN",
                columns: new[] { "organization_id", "token_family_id" });

            migrationBuilder.CreateIndex(
                name: "IX_USER_REFRESH_TOKEN_organization_id_user_id_revoked_at",
                schema: "identity",
                table: "USER_REFRESH_TOKEN",
                columns: new[] { "organization_id", "user_id", "revoked_at" });

            migrationBuilder.CreateIndex(
                name: "IX_USER_REFRESH_TOKEN_token_hash",
                schema: "identity",
                table: "USER_REFRESH_TOKEN",
                column: "token_hash",
                unique: true);

            // Stage 1 PostgreSQL RLS (all 20 tenant-bound tables), AUDIT_LOG immutability,
            // POSTED inventory ledger immutability triggers, and erp_app least-privilege grants.
            migrationBuilder.Sql(RlsAndAuditProtectionSql.GenerateCompleteStage1SecuritySql());
            migrationBuilder.Sql(InventoryLedgerImmutabilitySql.CreateFunctionAndTriggerSql);
            migrationBuilder.Sql(DatabaseRoleSecuritySql.GenerateAppRoleGrantsSql());
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(RlsAndAuditProtectionSql.GenerateDropStage1SecuritySql());

            migrationBuilder.DropTable(
                name: "AUDIT_LOG",
                schema: "integration");

            migrationBuilder.DropTable(
                name: "BRANCH_ENROLLMENT",
                schema: "identity");

            migrationBuilder.DropTable(
                name: "IDEMPOTENCY_RECORD",
                schema: "integration");

            migrationBuilder.DropTable(
                name: "INVENTORY_TXN_LINE",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "OUTBOX_EVENT",
                schema: "integration");

            migrationBuilder.DropTable(
                name: "PRODUCT_REORDER_RULE",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "STOCK_BALANCE",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "USER_BRANCH_ACCESS",
                schema: "identity");

            migrationBuilder.DropTable(
                name: "USER_REFRESH_TOKEN",
                schema: "identity");

            migrationBuilder.DropTable(
                name: "INVENTORY_TXN",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "PRODUCT_UOM",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "OUTBOX_EVENT_CURSOR",
                schema: "integration");

            migrationBuilder.DropTable(
                name: "INVENTORY_BATCH",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "INVENTORY_LOCATION",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "USER_ACCOUNT",
                schema: "identity");

            migrationBuilder.DropTable(
                name: "PRODUCT",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "EMPLOYEE",
                schema: "identity");

            migrationBuilder.DropTable(
                name: "PRODUCT_CATEGORY",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "BRANCH",
                schema: "identity");

            migrationBuilder.DropTable(
                name: "ORGANIZATION",
                schema: "identity");
        }
    }
}
