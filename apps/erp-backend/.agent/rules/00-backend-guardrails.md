---
trigger: always_on
description: Always-on backend safety, architecture, security/RLS, contract, and code-quality guardrails for all developers and AI agents working inside apps/erp-backend/.
---

# PharmacyERP Backend Guardrails (`apps/erp-backend/`)

These rules apply automatically to every backend developer and AI agent operating in `apps/erp-backend/` across Stage 1, Stage 2 (Sales), and Stage 3 (Purchasing).

---

## 1. Turbo-Safe OS, Workspace & Terminal Containment (ALWAYS-ON SAFETY)

### 1.1 Strict Workspace Sandbox (Relative Path — Applies to All Teammates)
- Your working scope is confined **EXCLUSIVELY** to `apps/erp-backend/` relative to the repository root.
- **NEVER** read, create, modify, move, or delete any file outside `apps/erp-backend/`:
  - No frontend folders (`apps/erp-frontend/`), Brain folders (`apps/brain/`), or repository-root frontend files.
  - No OS/System directories (`C:\Windows`, `Program Files`, `/etc`, etc.), user profile/Desktop/Documents files, Windows Registry keys, or system/machine environment variables.

### 1.2 Strict Monorepo Boundary
- **ALWAYS ignore** repository-root `00-router.md` and `MEMORY.md` (they belong exclusively to `apps/erp-frontend/`).
- Never ask to read or update `MEMORY.md` when working on backend tasks.
- Treat `apps/erp-backend/_audit_docs/01_master_spec/ERP-Backend-Blueprint-v1.1.md` as **frozen reference-only**; never edit it.

### 1.3 Allowed Terminal Commands Only
Execute commands strictly with working directory inside `apps/erp-backend/`:
- **Build & Test:** `dotnet build`, `dotnet test`, `dotnet restore` (only when explicitly needed).
- **EF Core CLI:** `dotnet ef migrations add`, `dotnet ef migrations script`, `dotnet ef database update` (using `erp_migrator` or local dev DB).
- **Local Smoke Checks:** `dotnet run` strictly for local verification (e.g., `GET /.well-known/jwks.json`, `/swagger/v1/swagger.json`, or target endpoint), and **always terminate the process cleanly** once verified.
- **Read-Only Inspection:** `git status`, `git diff`, `git log`, `git check-ignore`, `git show`, `Get-Content`, `Select-String`, `Get-ChildItem`.
- **Safe Local Git State Changes:** `git checkout -b`, `git switch`, `git add`, `git commit` **ONLY** when explicitly requested by the developer.
- **Onboarding Script:** `setup-local-db.ps1` **ONLY** during initial local environment onboarding.

### 1.4 STRICTLY FORBIDDEN COMMANDS (Even Under `Turbo` / Auto-Approve Mode)
- **Destructive / Remote Git:** NEVER run `git push`, `git push --force`, `git reset --hard`, `git clean -fd` / `-fdx`, `git checkout -- .`, or `git branch -D`.
- **Recursive / Bulk Deletion:** NEVER run `rm -rf`, `Remove-Item -Recurse -Force`, `del /f /s`, or `rmdir /s /q`. Only delete a specific, explicitly named file inside `apps/erp-backend/` when directly required by the task.
- **OS / Global Installs & System Changes:** NEVER run `winget`, `choco`, `scoop`, `npm -g`, `pip install`, `dotnet tool install -g`, or modify Windows services, firewall rules, network settings, or OS configuration.
- **Destructive SQL:** NEVER execute `DROP DATABASE`, `DROP SCHEMA`, `TRUNCATE`, or destructive DDL/DML against any persistent database. Ephemeral database creation/teardown is permitted **only** inside isolated Testcontainers or `ThrowawayPostgresDatabaseProvisioner` integration test fixtures.
- **Secret Protection:** NEVER print, log, commit, or exfiltrate database passwords, `ConnectionStrings:DefaultConnection`, `ERP_MIGRATOR_CONNECTION`, private RSA signing keys, JWTs, or refresh tokens.

---

## 2. Wave 0 & Onion / N-Tier Architecture Discipline

- **Strict Layer Dependencies:** Preserve clean inward dependencies:
  `PharmacyERP.Domain` <- `PharmacyERP.Application` <- `PharmacyERP.Infrastructure` <- `PharmacyERP.Api`.
  - `Domain` has zero EF Core, ASP.NET Core, or Npgsql dependencies.
  - `Application` depends only on `Domain` and abstractions (`IUnitOfWork`, repositories, context/integration interfaces).
  - `Infrastructure` implements persistence, repositories, interceptors, security checks, and background services.
  - `Api` hosts thin controllers, filters, auth policies, and HTTP middleware only.
- **Wave 0 Clean Root Files:**
  - Keep `src/PharmacyERP.Api/Program.cs` untouched — register DI services in `DependencyInjection.cs` (or modular feature DI extension methods invoked from `DependencyInjection.cs`) and register HTTP middleware in `src/PharmacyERP.Api/Middleware/MiddlewareExtensions.cs`.
  - Keep `src/PharmacyERP.Infrastructure/Persistence/Database/PharmacyDbContext.cs` minimal and untouched — add module `DbSet<T>` properties in partial classes (`PharmacyDbContext.Sales.cs`, `PharmacyDbContext.Purchasing.cs`, matching `.Identity.cs`, `.Catalog.cs`, `.Inventory.cs`, `.Integration.cs`).
  - Use **one `IEntityTypeConfiguration<T>` per entity** under `src/PharmacyERP.Infrastructure/Persistence/Configurations/<Module>/` (discovered via `ApplyConfigurationsFromAssembly`).
  - Maintain a **single database (`erp_db`)**, a **single `PharmacyDbContext`**, and unified EF Core migrations under `src/PharmacyERP.Infrastructure/Persistence/Migrations/`.
- **Protect Approved Stage 1 Baseline:** Apply `.agent/skills/pharmacy-stage1-baseline/SKILL.md` whenever touching Stage 1 modules or cross-module contracts (`IBranchDefaultLocationSeeder`, `INonLotBatchInitializer`/`2`, `IProductInventoryUsageChecker`/`2`).

---

## 3. Zero Contract Drift

- **NEVER** alter existing public API routes, HTTP verbs, query-parameter names, HTTP status-code mappings (`400`/`401`/`403`/`404`/`409`/`422`), `ApiErrorEnvelopeDto`, `ApiResultMapper`, or approved Blueprint DTO property names without explicit architectural approval.
- All expected business errors MUST flow through `Result` / `Result<T>` (`src/PharmacyERP.Application/Common/DTOs/Result.cs`) and `ErrorCode` (`src/PharmacyERP.Domain/Enums/ErrorCode.cs`), mapped in controllers via `ApiResultMapper`.
- All idempotent write endpoints MUST preserve `[AllowHeaderIdempotencyKey]` (`src/PharmacyERP.Api/Filters/AllowHeaderIdempotencyKeyAttribute.cs`) so clients can pass `Idempotency-Key` via HTTP header or request body.

---

## 4. Mandatory Security, Multi-Tenancy & PostgreSQL RLS

- **Tenant-Scoped Tables & RLS:** Every tenant-owned table MUST:
  1. Include non-null `organization_id` (`OrganizationId`).
  2. Enforce `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` with `tenant_isolation_policy` (via `RlsAndAuditProtectionSql` and the EF Core migration).
  3. Use composite organization-aware foreign keys (`(organization_id, <foreign_id>)` referencing a composite alternate key on the principal table) with `DeleteBehavior.Restrict`.
  4. Receive explicit least-privilege grants for `erp_app` (and be covered by `DatabaseRoleSecuritySql.TableRlsStatusCheckSql` & `DatabaseSecurityStartupCheck`).
- **Explicit Transactions for ALL Queries (Read & Write):** Because `TenantRlsConnectionInterceptor` rejects commands outside an active transaction and `UnitOfWork` binds transaction-local `set_config('app.organization_id', ..., true)`:
  - Every **read** query MUST run inside `BeginTransactionAsync` -> query -> `RollbackTransactionAsync(CancellationToken.None)`.
  - Every **write** operation MUST run inside `BeginTransactionAsync` -> mutations + audit + outbox + idempotency -> `CommitTransactionAsync` (or `RollbackTransactionAsync` on error).
- **Never Trust Client Tenant Identity:** Always derive `OrganizationId` from `ITenantContext` / authenticated JWT claims (`ICurrentUser`). If a canonical/query parameter includes `organization_id`, verify exact equality with `ITenantContext.OrganizationId` or return `403 FORBIDDEN`.
- **RBAC, Branch Scope & Runtime Mode:** Enforce `[Authorize]` / role policies (`AuthorizationPoliciesExtensions.cs`), verify `_currentUser.CanAccessBranch(branchId)` (`403 FORBIDDEN_BRANCH` on mismatch), never bypass `IUserSecurityStampValidator`, and enforce `Cloud` vs. `BranchLocal` route boundaries in `RuntimeModeGuardMiddleware`.
- **Immutability:** Posted financial/ledger records and `integration."AUDIT_LOG"` are append-only; protect them with PostgreSQL triggers and `erp_app` `REVOKE UPDATE, DELETE` grants where applicable.

---

## 5. Readability & Clean Code Standards

- **Per-Project `GlobalUsings.cs`:** Keep shared imports in each project's root `GlobalUsings.cs`, sorted alphabetically by group (`System.*`, `Microsoft.*`, third-party, `PharmacyERP.*`) without duplicating SDK implicit usings; keep ambiguous namespaces local.
- **Self-Documenting Naming:** Use clear, descriptive English variable and parameter names (`organizationId`, `inventoryTransaction`, `requestedLine`, `businessDate`, `location`); avoid cryptic abbreviations (`orgId`, `txn`, `loc`, single-letter lambdas outside trivial inline selectors).
- **Guard Clauses & Early Returns:** Validate preconditions and return `Result.Failure(...)` early instead of deep nesting.
- **Intent-Focused Comments:** Add concise English XML `<summary>` docs on services, controllers, interceptors, and non-trivial helpers, plus inline `//` comments explaining **why** subtle RLS, concurrency/locking, idempotency, UOM/tax/rounding, or state-transition invariants exist.
- **Zero-Warning Policy:** Every build MUST succeed with `0 Error(s), 0 Warning(s)`.

---

## 6. Mandatory Arabic Post-Task Debrief

At the end of **EVERY** completed backend task, always write a clear, educational debrief in **Arabic** (keeping technical terms, class names, routes, SQL concepts, and file paths in English) covering:
1. **What was built** and which files were added or modified.
2. **Why** key architectural, security (RLS/authz), concurrency, or financial design decisions were made.
3. **How** the work connects to the rest of PharmacyERP (Stage 1 foundation, teammates' modules, or frontend contracts).
4. **Verification proof** (build warnings/errors, unit & integration test results, and smoke check outcome).
