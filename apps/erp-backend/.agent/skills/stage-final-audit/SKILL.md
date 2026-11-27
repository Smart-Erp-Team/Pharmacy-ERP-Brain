---
name: stage-final-audit
description: Perform an end-of-stage Security, Performance/Concurrency, and Architecture/Contracts audit for a developer's Stage 2 or Stage 3 work using parallel read-only specialist auditors, fix any defects, verify 100% passing tests via verify-task.ps1, generate a per-developer delivery report, and deliver an Arabic debrief.
---

# `/stage-final-audit` — End-of-Stage Multi-Pillar Audit & Delivery Report

Use this skill for each developer's **final audit & delivery report task** (`*-FINAL`) at the end of Stage 2 (Sales) or Stage 3 (Purchasing).

Always enforce `.agent/rules/00-backend-guardrails.md`, `.agent/rules/audit-guidelines.md`, and `.agent/skills/pharmacy-stage1-baseline/SKILL.md`.

---

## Step 1 — Inventory Developer Scope & Stage Commits

1. Identify the developer slug (`ahmed-hassan`, `el-hosseiny`, `yassin`, `ahmed-salah`, or specified slug) and active stage (`stage2` or `stage3`).
2. Inspect all commits and files owned by that developer during the stage (scoped strictly to `apps/erp-backend/` via `-- .`):
   - `git log --stat stage2-dev..HEAD -- .` (or stage commit range)
   - `git status --short -- .` and `git diff -- .`
   - Complete file inventory across `Domain`, `Application`, `Infrastructure` (configurations, repositories, triggers, security, migrations), `Api` (controllers, middleware, filters, auth), `contracts/`, `UnitTests`, and `IntegrationTests`.

---

## Step 2 — Parallel 3-Pillar Specialist Audit (Isolated Subagents)

Launch **3 read-only `research` subagents in parallel** (`invoke_subagent`, `TypeName: "research"`), passing each the developer's file inventory and its dedicated audit skill so each pillar gets an unpolluted context window:
1. **Security Auditor (`Role: "Security & RLS Auditor"`):** Loads `.agent/skills/backend-security-audit/SKILL.md` and audits every owned file for RLS (`ENABLE` + `FORCE` + policy), `DatabaseRoleSecuritySql` (`erp_app`), composite tenant FKs, explicit `IUnitOfWork` transactions, RBAC + `CanAccessBranch`, `RuntimeModeGuardMiddleware`, immutability triggers, idempotency, mass assignment, secrets, and raw SQL.
2. **Performance & Concurrency Auditor (`Role: "Performance & Concurrency Auditor"`):** Loads `.agent/skills/performance-concurrency-guard/SKILL.md` and audits `.AsNoTracking()`, indexes, zero N+1, pagination `1..200`, `RowVersion` & deterministic `FOR UPDATE` lock ordering, `409 CONFLICT` mapping, decimal rounding, null safety, and `CancellationToken` hygiene.
3. **Architecture & Wire Contract Auditor (`Role: "Architecture & Contracts Auditor"`):** Loads `.agent/skills/architecture-unifier/SKILL.md` and audits Wave 0 untouched root files, Onion boundaries, modular DI lifetimes, `Result<T>` + `ApiResultMapper`, strict `snake_case`, `[ProducesResponseType]`, `ContractsArtifactSyncTests` + `openapi.v1.json` sync, EF migrations sync, Outbox/Audit atomicity, and `GlobalUsings.cs` readability.

Each subagent returns a structured list of findings: `(ID, Pillar, Severity P0/P1/P2, File:Line, Root Cause, Recommended Fix)`.

---

## Step 3 — Fix Defects & Verify Full Solution

1. Consolidate all findings from the 3 auditors.
2. Fix **every confirmed P0 and P1 defect** cleanly and minimally within the developer's owned scope (preserving Stage 1 baseline and teammates' contracts).
3. Add targeted Unit and/or Integration regression tests proving each fix.
4. Run the deterministic full verification harness from `apps/erp-backend/`:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\.agent\skills\execute-stage-task\scripts\verify-task.ps1 -Full -CheckMigrations -BootCheck
   ```
   Confirm **`0 Error(s), 0 Warning(s)`**, **`100% Passed, 0 Failed, 0 Skipped`**, EF model sync, Wave 0 compliance, and clean API boot-check (`/.well-known/jwks.json` + `/swagger/v1/swagger.json`).

---

## Step 4 — Generate Per-Developer Stage Delivery Report

Create a clean Markdown delivery report inside `apps/erp-backend/`:
- **Stage 2 path:** `apps/erp-backend/docs/stage2-reports/<developer-name>-stage2-report.md`
- **Stage 3 path:** `apps/erp-backend/docs/stage3-reports/<developer-name>-stage3-report.md`

Include these exact sections:
1. **Header Metadata Table:** Developer name, stage, date, branch/commits audited, build verdict (`0 Errors, 0 Warnings`), and automated test counts (`UnitTests` + `IntegrationTests`, `0 Failed, 0 Skipped`).
2. **Implemented Components Inventory:**
   - Domain entities, enums, value objects, exceptions
   - EF Core configurations, partial `PharmacyDbContext`, migrations, RLS policies, `DatabaseRoleSecuritySql`, and triggers
   - Application services, repositories, validators, DTOs, and cross-module integrations
   - API controllers, endpoints (HTTP verb, route, auth policy, runtime mode, idempotency, OpenAPI sync)
3. **Audit Findings & Remediations (Security, Performance, Architecture):**
   - Table summarizing each finding (ID, Pillar, Severity, File, Root Cause, Fix Applied, Regression Test).
   - Explicit confirmation of Wave 0 compliance, RLS/FK coverage, `ContractsArtifactSyncTests`, and zero contract drift.
4. **Tests Added & Verification Results:**
   - Summary of Unit & Integration tests grouped by scenario (happy paths, RLS isolation, composite FKs, immutability, concurrency, idempotency, RBAC/branch scope, runtime mode, OpenAPI contracts).
   - Final `verify-task.ps1` verification matrix.
5. **Cross-Module & Frontend Handoff Notes:**
   - New routes, headers, roles/policies, runtime-mode behaviors, or seed/test notes for teammates and frontend developers.

---

## Step 5 — Mandatory Arabic Debrief in Chat

Conclude with a clear summary in **Arabic** (keeping technical identifiers, routes, and file paths in English):
1. Clickable link to the generated delivery report (`docs/stage2-reports/<developer-name>-stage2-report.md`).
2. Key Security, Performance, and Architecture findings identified and fixed.
3. Final build, test, migration-sync, and boot-check verification proof (`0 Errors, 0 Warnings`, exact pass counts).
4. Overall merge-readiness verdict for `stage2-dev` (or final `main` integration gate).
