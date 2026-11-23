---
description: Execute a Stage 2 or Stage 3 backend developer task through a strict 6-phase pipeline (prerequisite gate, plan, clean implementation, exhaustive tests + live boot check, self-review, and Arabic debrief)
---

# `/execute-stage-task` — Stage 2 & Stage 3 Backend Task Execution Pipeline

Before starting, load and strictly enforce:
1. `.agent/rules/00-backend-guardrails.md` (always-on OS/workspace containment, Wave 0, zero contract drift, RLS, readability, Arabic debrief)
2. `.agent/skills/pharmacy-stage1-baseline/SKILL.md` (protected Stage 1 baseline & cross-module contracts)
3. `.agent/skills/pharmacy-backend-engineering/SKILL.md` (Domain, EF Core, Application, API, and Testing patterns)

Execute the following **6 phases strictly in order**. Do NOT skip any phase.

---

## Phase 1 — Hard Prerequisite Gate (STOP IF MISSING)

1. Read the developer's assigned task specification in full and locate its **`Prerequisites`** checklist (upstream entities, interfaces, repositories, services, DTOs, EF Core configurations, migrations, DI registrations, or teammate PRs).
2. **Physically inspect the workspace** inside `apps/erp-backend/` to verify that **EVERY** listed prerequisite actually exists:
   - Confirm required files, classes, interfaces, methods, `DbSet<T>` partial properties, configurations, migrations, and DI registrations are present in `src/`.
   - If uncertain whether the existing baseline compiles cleanly, run `dotnet build PharmacyERP.sln --no-restore`.
3. **HARD STOP RULE:** If **ANY** prerequisite is missing, incomplete, or does not compile:
   - **REFUSE to implement the task.** Do NOT stub, mock around, or partially build missing teammate code, and do NOT modify any file.
   - Stop immediately and reply in **Arabic** (keeping technical identifiers in English) clearly listing:
     - Every missing prerequisite (exact class/interface/file/migration).
     - Which exact teammate task / PR must be pulled and merged into the branch first before re-running `/execute-stage-task`.

---

## Phase 2 — Deep Implementation Plan

Only after Phase 1 passes 100%:
1. Inspect the referenced Stage 1 files (`Program.cs`, `PharmacyDbContext.*.cs`, `DependencyInjection.cs`, `RlsAndAuditProtectionSql.cs`, `DatabaseRoleSecuritySql.cs`, `RuntimeModeGuardMiddleware.cs`, neighboring controllers/services/configurations/tests) so every pattern matches the live codebase.
2. Formulate a concise, concrete implementation plan before editing any code:
   - **Exact files to create / update** (Domain, Application, Infrastructure, Migrations, Api, UnitTests, IntegrationTests).
   - **Data & Security design:** composite alternate keys & tenant-scoped FKs, PostgreSQL `CHECK` constraints, RLS (`ENABLE` + `FORCE` + policy + `erp_app` grants), immutability triggers, RBAC policy & `CanAccessBranch` checks, and `RuntimeModeGuardMiddleware` (`Cloud` vs. `BranchLocal`).
   - **Concurrency, Idempotency & Math edge cases:** `RowVersion` / deterministic `FOR UPDATE` locking, `Idempotency-Key` scope & payload hashing (`CanonicalJsonHasher`), UOM/tax/discount rounding (`numeric(18,4)` / `numeric(18,2)` / `numeric(18,6)` / `numeric(9,4)`), and invalid state transitions.
   - **Test matrix:** exact Unit Test and Integration Test cases to write.

---

## Phase 3 — Clean Implementation

Implement strictly within the task's defined scope following `.agent/rules/00-backend-guardrails.md` and `.agent/skills/pharmacy-backend-engineering/SKILL.md`:
- **Zero unrelated edits, zero scope creep, zero broken Stage 1 contracts.**
- Preserve Wave 0 clean root files (`src/PharmacyERP.Api/Program.cs` and `src/PharmacyERP.Infrastructure/Persistence/Database/PharmacyDbContext.cs` remain untouched).
- Register new services/repositories in `DependencyInjection.cs` (or feature DI extensions), add `DbSet<T>`s in module partial `PharmacyDbContext.<Module>.cs`, and add one `IEntityTypeConfiguration<T>` per entity.
- Use `Result` / `Result<T>` + `ApiResultMapper` + `[AllowHeaderIdempotencyKey]` (never throw raw exceptions for expected business errors).
- Wrap all read and write queries in explicit `IUnitOfWork` transactions (`BeginTransactionAsync` -> `RollbackTransactionAsync` / `CommitTransactionAsync`).
- Maintain `GlobalUsings.cs` hygiene, descriptive variable names, guard clauses, and concise XML `<summary>` + inline `//` comments explaining *why* non-trivial invariants exist.
- If EF Core model changes are part of the task, create the migration cleanly (`dotnet ef migrations add ...`), include `RlsAndAuditProtectionSql` + `DatabaseRoleSecuritySql.GenerateAppRoleGrantsSql()` + any immutability triggers in `Up(...)`, and verify `PharmacyDbContextModelSnapshot.cs` is in sync.

---

## Phase 4 — Exhaustive Testing & Live Verification

1. **Write Comprehensive Unit Tests (`tests/PharmacyERP.UnitTests`):**
   - Cover every happy path, domain invariant, math/rounding boundary, validator rule, unauthorized role/branch scope (`403 FORBIDDEN_BRANCH`), missing entity (`404`), invalid state transition (`409`), insufficient stock (`409 OUT_OF_STOCK`), expiry policy violation (`422`), idempotency replay & mismatch (`409 IDEMPOTENCY_MISMATCH`), and transaction rollback on error.
2. **Write Real Integration Tests (`tests/PharmacyERP.IntegrationTests`):**
   - Cover PostgreSQL `FORCE ROW LEVEL SECURITY` cross-tenant isolation, composite FK rejection, immutability triggers, concurrency/locking (`409 CONFLICT`), idempotency replay & mismatch, and full HTTP endpoint contracts (header `Idempotency-Key`, `ApiErrorEnvelopeDto`, RBAC, branch scope, and `Cloud` vs. `BranchLocal` runtime mode).
3. **Strict Compilation Gate (Zero Warnings):**
   ```powershell
   dotnet build PharmacyERP.sln --no-restore
   ```
   - Must report **`0 Error(s), 0 Warning(s)`**. Fix every warning or error before continuing.
4. **Full Solution Test Gate (100% Pass):**
   ```powershell
   dotnet test PharmacyERP.sln --no-restore
   ```
   - Must report **`100% Passed, 0 Failed, 0 Skipped`** across both `PharmacyERP.UnitTests` and `PharmacyERP.IntegrationTests`.
5. **Live API Boot-Check (Mandatory whenever API endpoints, DI registrations, middleware, or migrations changed):**
   - Start `src/PharmacyERP.Api` locally (`dotnet run --project src/PharmacyERP.Api/PharmacyERP.Api.csproj --no-build`) and probe `GET /.well-known/jwks.json` and `/swagger/v1/swagger.json` (and/or the newly added endpoint) to confirm DI container resolution, `DatabaseSecurityStartupCheck`, routing, and Swagger generation succeed cleanly.
   - **Always stop/terminate the API process cleanly** immediately after the smoke check completes.

---

## Phase 5 — Self-Review Check

Run read-only `git status` and `git diff` inside `apps/erp-backend/` and verify every single item:
- [ ] **Security:** RLS `ENABLE` + `FORCE` + `tenant_isolation_policy` + `erp_app` grants on all new tenant tables; composite tenant-scoped FKs; explicit `IUnitOfWork` transactions on all reads & writes; RBAC policies & `CanAccessBranch`; `RuntimeModeGuardMiddleware` updated; zero client-trusted `organization_id`; zero logged/hardcoded secrets.
- [ ] **Performance & Concurrency:** `.AsNoTracking()` on all read queries; proper composite/partial indexes; zero N+1 query loops; deterministic `FOR UPDATE` locking / `RowVersion` concurrency; `CancellationToken` propagated cleanly.
- [ ] **Architecture & Contracts:** Onion boundaries preserved; `Program.cs` & `PharmacyDbContext.cs` untouched (Wave 0); `Result<T>` + `ApiResultMapper`; `[AllowHeaderIdempotencyKey]` on mutating endpoints; zero breaking DTO/route changes; migrations 100% synced with model.
- [ ] **Readability:** `GlobalUsings.cs` clean; descriptive variable names; XML `<summary>` & *why* comments in place; `0 Warnings`, `0 Failed`, `0 Skipped`.

If any issue is spotted during self-review, fix it and re-run Phase 4 verification gates.

---

## Phase 6 — Arabic Explanation in Chat

Deliver a clear, structured summary in **Arabic** (keeping technical terms, class names, routes, SQL constructs, and file paths in English):
1. **الملخص وما تم بناؤه (What Was Built):** Exact feature implemented and clickable links to all created/modified files.
2. **القرارات المعمارية والأمنية (Why It Was Designed This Way):** Concise explanation of RLS, composite FKs, transactions, idempotency, concurrency/locking, rounding, or runtime-mode decisions and how this piece integrates with Stage 1 & teammates' modules.
3. **التغطية الاختبارية والتحقق (Testing & Verification Proof):** Exact edge cases proven by Unit + Integration tests, build verdict (`0 Errors, 0 Warnings`), test pass counts, and API boot-check result.
4. **الخطوة التالية (Next Task):** State the exact next task ID/title in the developer's Stage roadmap to execute next.
