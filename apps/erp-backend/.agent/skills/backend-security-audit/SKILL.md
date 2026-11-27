---
name: backend-security-audit
description: Deep security audit checklist for PharmacyERP ASP.NET Core Web API and EF Core across Stage 1, Stage 2 (Sales & Sync), and Stage 3 (Purchasing). Use when auditing controllers, auth/sync endpoints, JWT/JWKS, multi-tenancy, PostgreSQL RLS, least-privilege grants, immutability triggers, idempotency, DTOs, logging, or raw SQL.
---

# Backend Security Audit (Stage 1 / Stage 2 / Stage 3)

## 1. Authentication, Authorization & Runtime Mode
- [ ] **Controller & Endpoint Attributes:** Every controller/action in `PharmacyERP.Api/Controllers/` enforces `[Authorize]` or explicit policy (`AdminOnly`, `OrgAdminOnly`, `PlatformProvisionerOnly`, or approved Stage 2/3 Sales/Sync policies) unless intentionally anonymous (`login`, `refresh`, `branch-enrollment`, `/.well-known/jwks.json`, `/canonical/capabilities`).
- [ ] **Runtime Mode Guard:** `RuntimeModeGuardMiddleware` blocks Cloud-only endpoints in `BranchLocal` mode (`404`) and BranchLocal-only mutations (stock adjustments, POS orders/checkout, sales returns, shift operations) in `Cloud` mode (`404`). `BranchLocal` tokens enforce `BranchScope.ASSIGNED` scoped to `EnrolledBranchId`.
- [ ] **JWT, SecurityStamp & Branch Credentials:** `DependencyInjection.cs` validates `Issuer`, `Audience`, `Lifetime`, `RequireExpirationTime`, `RequireSignedTokens`, `SecurityAlgorithms.RsaSha256`, `MapInboundClaims = false`, and preserves `IUserSecurityStampValidator`. Branch runtime sync credentials are stored hashed only.

## 2. Multi-Tenancy, Branch IDOR & PostgreSQL RLS
- [ ] **Never Trust Client Tenant Identity:** Every tenant-scoped query/command derives `OrganizationId` exclusively from `ITenantContext.OrganizationId` (JWT claim). If a canonical/query parameter passes `organization_id`, verify exact equality with `ITenantContext.OrganizationId` or return `403 FORBIDDEN`.
- [ ] **Branch Scope Enforcement:** Every branch-scoped read/write checks `_currentUser.CanAccessBranch(branchId)` and returns `403 FORBIDDEN_BRANCH` on mismatch.
- [ ] **PostgreSQL RLS & Least-Privilege Grants (`erp_app`):** Every new tenant-owned table has:
  - Non-null `organization_id` (`OrganizationId`).
  - `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and `tenant_isolation_policy` in both `RlsAndAuditProtectionSql.cs` and the EF Core migration.
  - Coverage in `DatabaseRoleSecuritySql.cs` (`TableRlsStatusCheckSql`, `GenerateRoleProvisioningTemplateSql()`, `GenerateAppRoleGrantsSql()`).
  - Composite tenant-scoped FKs (`(organization_id, <fk>)` -> composite AK) with `DeleteBehavior.Restrict`.
- [ ] **Explicit RLS Transactions:** Every read and write runs inside `IUnitOfWork.BeginTransactionAsync(...)` with `RollbackTransactionAsync(CancellationToken.None)` on reads/errors and `CommitTransactionAsync` on writes (`TenantRlsConnectionInterceptor` active).
- [ ] **Bypass Audit:** Flag any `IgnoreQueryFilters()` or `ITenantContext.AllowSystemBypass()` outside anonymous discovery (`login`, `refresh`, `branch-enrollment`, `organizations`) or `OutboxPublisherWorker` / authorized sync bootstrap; confirm `SetTenant(orgId)` immediately clears bypass.

## 3. Immutability, Idempotency & Mass Assignment
- [ ] **Append-Only Immutability:** Posted financial/ledger/audit/sync records are protected by PostgreSQL `BEFORE UPDATE OR DELETE` immutability triggers (and `REVOKE UPDATE, DELETE` where applicable) in both migrations and `ThrowawayPostgresDatabaseProvisioner`.
- [ ] **Idempotency Hardening:** Every mutating endpoint carries `[AllowHeaderIdempotencyKey]`, gives HTTP header `Idempotency-Key` precedence over trailing optional body `IdempotencyKey`, returns `400 MALFORMED_REQUEST` when both are missing, `422` when length `> 100`, and `409 IDEMPOTENCY_MISMATCH` on canonical payload hash mismatch.
- [ ] **No EF Entities or Over-Posting:** Controllers never accept/return `PharmacyERP.Domain.Entities.*`. Request DTOs never accept server-computed financial totals (`Subtotal`, `TaxTotal`, `GrandTotal`, `AmountDue`, `ChangeAmount`), `OrganizationId`, `RowVersion`, or `PasswordHash`.

## 4. Secrets & Raw SQL Injection Safety
- [ ] **No Secrets in Logs or Error Responses:** `ILogger` never logs passwords, JWTs, refresh/enrollment tokens, sync secrets, or connection strings. `ExceptionHandlingMiddleware` never leaks stack traces or SQL text in `ApiErrorEnvelopeDto`.
- [ ] **Parameterized SQL Only:** Search all `FromSqlRaw`, `ExecuteSqlRaw`, `ExecuteSqlRawAsync`, `CommandText`, and interpolated SQL strings. Any unparameterized concatenation/interpolation is a **P0** finding.
