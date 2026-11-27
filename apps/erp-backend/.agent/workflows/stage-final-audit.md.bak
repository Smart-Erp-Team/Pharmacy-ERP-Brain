---
description: Perform an end-of-stage Security, Performance, and Architecture audit for a developer's Stage 2 or Stage 3 work, fix any defects, verify 100% passing tests, and generate a per-developer delivery report
---

# `/stage-final-audit` — End-of-Stage Final Audit & Delivery Report Workflow

Use this workflow for each developer's **final audit & documentation task** at the end of Stage 2 (Sales) or Stage 3 (Purchasing).

Load and strictly enforce:
1. `.agent/rules/00-backend-guardrails.md`
2. `.agent/skills/pharmacy-stage1-baseline/SKILL.md`
3. `.agent/skills/pharmacy-backend-engineering/SKILL.md`
4. Existing audit checklists inside `apps/erp-backend/.agent/skills/`:
   - `.agent/skills/backend-security-audit/SKILL.md`
   - `.agent/skills/performance-concurrency-guard/SKILL.md`
   - `.agent/skills/architecture-unifier/SKILL.md`

---

## Step 1 — Inventory Developer Scope & Stage Commits

1. Identify the developer name (e.g., `dev1`, `dev2`, `dev3`, `dev4` or the exact slug specified in the task) and the active stage (`stage2` or `stage3`).
2. Inspect all commits and files owned by that developer during the stage using read-only commands inside `apps/erp-backend/`:
   - `git log --stat` (scoped to the stage branch/commits)
   - `git status` and `git diff`
   - Complete file inventory across `src/PharmacyERP.Domain`, `src/PharmacyERP.Application`, `src/PharmacyERP.Infrastructure` (configurations, repositories, triggers, security, migrations), `src/PharmacyERP.Api` (controllers, middleware, filters, auth), `tests/PharmacyERP.UnitTests`, and `tests/PharmacyERP.IntegrationTests`.

---

## Step 2 — Structured 3-Pillar Audit Checkup

Audit every owned file rigorously across all three pillars and record every finding (severity, file/line, root cause, fix):

### Pillar A — Security & Multi-Tenancy Audit
- [ ] **PostgreSQL RLS:** Every new tenant-owned table has `organization_id NOT NULL`, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and `tenant_isolation_policy` in both `RlsAndAuditProtectionSql.cs` and EF Core migrations.
- [ ] **Least-Privilege DB Roles:** New schemas/tables are covered by `DatabaseRoleSecuritySql.TableRlsStatusCheckSql`, `GenerateRoleProvisioningTemplateSql()`, and `GenerateAppRoleGrantsSql()` (`erp_app` grants; no superuser or `BYPASSRLS` reliance).
- [ ] **Composite Tenant-Scoped FKs:** Every cross-table FK includes `organization_id` (and `branch_id` / `product_id` where cross-field integrity applies) with `DeleteBehavior.Restrict`.
- [ ] **Explicit RLS Transactions:** Every read and write query executes inside `IUnitOfWork.BeginTransactionAsync(...)` with guaranteed `RollbackTransactionAsync(CancellationToken.None)` on reads/errors and `CommitTransactionAsync` on writes.
- [ ] **AuthZ, RBAC & Branch Scope:** Every endpoint enforces `[Authorize]` / role policy (`AdminOnly`, `OrgAdminOnly`, etc.); every branch-scoped read/write checks `_currentUser.CanAccessBranch(branchId)` (`403 FORBIDDEN_BRANCH`); never trusts client-supplied `organization_id`; preserves `IUserSecurityStampValidator`.
- [ ] **Immutability & Idempotency:** Append-only / posted financial & ledger tables have PostgreSQL immutability triggers (`BEFORE UPDATE OR DELETE`); every mutating endpoint supports `[AllowHeaderIdempotencyKey]`, atomic `IIdempotencyService.CheckAsync` + `PersistResponseAsync`, and rejects payload mismatches with `409 IDEMPOTENCY_MISMATCH`.
- [ ] **Runtime Mode & Secrets:** `RuntimeModeGuardMiddleware` enforces `Cloud` vs. `BranchLocal` boundaries; zero hardcoded or logged secrets/tokens/passwords.

### Pillar B — Performance & Concurrency Audit
- [ ] **Read Query Hygiene:** `.AsNoTracking()` applied to all read-only EF Core queries; pagination bounds enforced; lean projections where full entity graphs are unnecessary.
- [ ] **Indexes & Query Plans:** Composite/partial indexes in `IEntityTypeConfiguration<T>` align with `WHERE`, `JOIN`, and `ORDER BY` clauses (prefixed by `organization_id` / `branch_id`).
- [ ] **Zero N+1 Queries:** Related products/UOMs/batches/stock balances are batch pre-fetched (`GetByIdsAsync`, `GetOrCreateForUpdateBatchAsync`) or cleanly split-queried (`AsSplitQuery()` where multiple collections are included).
- [ ] **Concurrency & Deadlock Prevention:** Mutable stock/cash/order balances use `RowVersion` (`.IsConcurrencyToken()`) and/or deterministic `FOR UPDATE` lock ordering; `DbUpdateConcurrencyException` and PostgreSQL `40001`/`40P01` map cleanly to `409 CONFLICT`.
- [ ] **Async Hygiene:** No `.Result` / `.Wait()` deadlocks; `CancellationToken` propagated through controllers, services, and repositories (with `CancellationToken.None` reserved for rollbacks).

### Pillar C — Architecture, Contracts & Readability Audit
- [ ] **Onion Boundaries & Wave 0:** `src/PharmacyERP.Api/Program.cs` and `src/PharmacyERP.Infrastructure/Persistence/Database/PharmacyDbContext.cs` remain untouched; module `DbSet<T>`s live in partial classes; DI lifetimes (`Scoped` vs. `Singleton`) have zero captive-dependency bugs.
- [ ] **Result & Error Contracts:** Services return `Result` / `Result<T>` (zero raw exception leaks for expected failures); controllers are thin and use `ApiResultMapper`; all error responses match `ApiErrorEnvelopeDto`.
- [ ] **Zero Contract Drift:** DTO JSON property names, enum string values, routes, HTTP verbs, and status codes (`400`/`401`/`403`/`404`/`409`/`422`) match the Blueprint and Stage 1 contracts 100%.
- [ ] **EF Core Model ↔ Migrations Sync:** Every entity configuration and index change matches `PharmacyDbContextModelSnapshot.cs` and committed migrations (zero pending model drift).
- [ ] **Readability & `GlobalUsings.cs`:** Clean per-project `GlobalUsings.cs`, descriptive variable names, concise XML `<summary>` and *why* inline comments.

---

## Step 3 — Fix Defects & Re-Verify Full Solution

1. Fix **every** defect discovered in Step 2 cleanly and minimally within the developer's owned scope (do not break Stage 1 baseline or other teammates' contracts).
2. Add targeted Unit and/or Integration regression tests proving each fix.
3. Run full build and test gates from `apps/erp-backend/`:
   ```powershell
   dotnet build PharmacyERP.sln --no-restore
   dotnet test PharmacyERP.sln --no-restore
   ```
   - Confirm **`0 Error(s), 0 Warning(s)`** and **`100% Passed, 0 Failed, 0 Skipped`**.
4. If API endpoints, DI registrations, middleware, or migrations were modified during remediation, perform a local API boot-check (`GET /.well-known/jwks.json` / `/swagger/v1/swagger.json`) and terminate the process cleanly.

---

## Step 4 — Generate Per-Developer Stage Delivery Report

Create a clean, structured Markdown delivery report inside `apps/erp-backend/`:
- **Stage 2 path:** `apps/erp-backend/docs/stage2-reports/<developer-name>-stage2-report.md`
- **Stage 3 path (when running for Stage 3):** `apps/erp-backend/docs/stage3-reports/<developer-name>-stage3-report.md`

Include these exact sections in the report:
1. **Header Metadata Table:** Developer name, stage, date, branch/commits audited, build verdict (`0 Errors, 0 Warnings`), and automated test counts (`UnitTests` + `IntegrationTests`, `0 Failed, 0 Skipped`).
2. **Implemented Components Inventory:**
   - Domain entities, enums, value objects, exceptions
   - EF Core configurations, partial `PharmacyDbContext`, migrations, RLS policies, and triggers
   - Application services, repositories, validators, DTOs, and cross-module integrations
   - API controllers, endpoints (HTTP verb, route, auth policy, runtime mode, idempotency)
3. **Audit Findings & Remediations (Security, Performance, Architecture):**
   - Table summarizing each finding (ID, Pillar, Severity, File, Root Cause, Fix Applied, Regression Test).
   - Explicit confirmation of Wave 0 compliance, RLS/FK coverage, and zero contract drift.
4. **Tests Added & Verification Results:**
   - Summary of Unit Tests and Integration Tests added during the stage (grouped by scenario: happy paths, RLS isolation, composite FKs, immutability, concurrency, idempotency, RBAC/branch scope, runtime mode).
   - Final `dotnet build` and `dotnet test` pass matrix.
5. **Cross-Module & Frontend Handoff Notes:**
   - Any new routes, headers, roles/policies, runtime-mode behaviors, or seed/test notes teammates or frontend developers should know.

---

## Step 5 — Mandatory Arabic Debrief in Chat

Conclude with a clear summary in **Arabic** (keeping technical terms, class names, routes, and file paths in English) covering:
1. Link to the generated delivery report (`docs/stage2-reports/<developer-name>-stage2-report.md`).
2. Key Security, Performance, and Architecture findings identified and fixed during the audit.
3. Final build & test verification proof (`0 Errors, 0 Warnings`, exact pass counts).
4. Overall readiness verdict for merging into the shared stage integration branch.
