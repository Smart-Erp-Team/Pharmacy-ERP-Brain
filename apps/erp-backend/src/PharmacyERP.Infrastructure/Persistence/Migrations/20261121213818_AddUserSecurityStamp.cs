using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PharmacyERP.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddUserSecurityStamp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_USER_REFRESH_TOKEN_organization_id_token_family_id",
                schema: "identity",
                table: "USER_REFRESH_TOKEN");

            migrationBuilder.DropIndex(
                name: "IX_USER_REFRESH_TOKEN_organization_id_user_id_revoked_at",
                schema: "identity",
                table: "USER_REFRESH_TOKEN");

            migrationBuilder.DropIndex(
                name: "IX_OUTBOX_EVENT_published_at_occurred_at",
                schema: "integration",
                table: "OUTBOX_EVENT");

            migrationBuilder.AddColumn<Guid>(
                name: "security_stamp",
                schema: "identity",
                table: "USER_ACCOUNT",
                type: "uuid",
                nullable: false,
                defaultValueSql: "gen_random_uuid()");

            migrationBuilder.CreateIndex(
                name: "IX_USER_REFRESH_TOKEN_active_family",
                schema: "identity",
                table: "USER_REFRESH_TOKEN",
                columns: new[] { "organization_id", "token_family_id", "expires_at" },
                filter: "revoked_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_USER_REFRESH_TOKEN_active_user",
                schema: "identity",
                table: "USER_REFRESH_TOKEN",
                columns: new[] { "organization_id", "user_id", "expires_at" },
                filter: "revoked_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_STOCK_BALANCE_organization_id_updated_at",
                schema: "inventory",
                table: "STOCK_BALANCE",
                columns: new[] { "organization_id", "updated_at" });

            migrationBuilder.CreateIndex(
                name: "IX_OUTBOX_EVENT_pending_org_seq",
                schema: "integration",
                table: "OUTBOX_EVENT",
                columns: new[] { "organization_id", "event_sequence" },
                filter: "published_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_INVENTORY_TXN_LINE_organization_id_branch_id_product_id_inv~",
                schema: "inventory",
                table: "INVENTORY_TXN_LINE",
                columns: new[] { "organization_id", "branch_id", "product_id", "inventory_txn_id" });

            migrationBuilder.CreateIndex(
                name: "IX_INVENTORY_BATCH_organization_id_expires_on_batch_number",
                schema: "inventory",
                table: "INVENTORY_BATCH",
                columns: new[] { "organization_id", "expires_on", "batch_number" },
                filter: "expires_on IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_USER_REFRESH_TOKEN_active_family",
                schema: "identity",
                table: "USER_REFRESH_TOKEN");

            migrationBuilder.DropIndex(
                name: "IX_USER_REFRESH_TOKEN_active_user",
                schema: "identity",
                table: "USER_REFRESH_TOKEN");

            migrationBuilder.DropIndex(
                name: "IX_STOCK_BALANCE_organization_id_updated_at",
                schema: "inventory",
                table: "STOCK_BALANCE");

            migrationBuilder.DropIndex(
                name: "IX_OUTBOX_EVENT_pending_org_seq",
                schema: "integration",
                table: "OUTBOX_EVENT");

            migrationBuilder.DropIndex(
                name: "IX_INVENTORY_TXN_LINE_organization_id_branch_id_product_id_inv~",
                schema: "inventory",
                table: "INVENTORY_TXN_LINE");

            migrationBuilder.DropIndex(
                name: "IX_INVENTORY_BATCH_organization_id_expires_on_batch_number",
                schema: "inventory",
                table: "INVENTORY_BATCH");

            migrationBuilder.DropColumn(
                name: "security_stamp",
                schema: "identity",
                table: "USER_ACCOUNT");

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
                name: "IX_OUTBOX_EVENT_published_at_occurred_at",
                schema: "integration",
                table: "OUTBOX_EVENT",
                columns: new[] { "published_at", "occurred_at" },
                filter: "published_at IS NULL");
        }
    }
}
