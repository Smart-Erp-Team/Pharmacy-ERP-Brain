---
name: review-stage-task
description: Standalone read-only adversarial code review and verification for any Stage 2 or Stage 3 backend task, feature branch, commit range, or teammate PR in apps/erp-backend/. Audits Security, Performance/Concurrency, Architecture/Wire Contracts, and Test Quality, runs full verification scripts, and outputs a P0/P1/P2 verdict in Arabic.
---

# `/review-stage-task` — Standalone Independent Backend Review & Verification

Use this skill whenever a developer wants an **independent, strictly read-only** adversarial review of local changes, a feature branch, or a teammate's PR before merging into `stage2-dev`.

**Hard Rule:** NEVER modify source or test files during `/review-stage-task`. You are an auditor and verifier only.

---

## Step 1 — Load Audit Checklists & Inspect Diff Scope

1. Read the 3 unified audit skills in parallel:
   - `.agent/skills/backend-security-audit/SKILL.md`
   - `.agent/skills/performance-concurrency-guard/SKILL.md`
   - `.agent/skills/architecture-unifier/SKILL.md`
2. Inspect the target diff cleanly (always scoped with `-- .` inside `apps/erp-backend/`):
   - If reviewing uncommitted/staged local work: `git status --short -- .` and `git diff -- .` (plus read untracked new files).
   - If reviewing a branch vs `stage2-dev`: `git log --stat stage2-dev..HEAD -- .` and `git diff stage2-dev...HEAD -- .`.
   - If a `<TASK-ID>` and `<task-file>` were provided, extract ONLY that task spec using:
     ```powershell
     powershell -NoProfile -ExecutionPolicy Bypass -File .\.agent\skills\execute-stage-task\scripts\check-preflight.ps1 -ExtractOnly -TaskFile <task-file> -TaskId <TASK-ID>
     ```

---

## Step 2 — Run Deterministic Verification Harness

Run from `apps/erp-backend/` (include `-BootCheck` if controllers, DI, middleware, or migrations changed; include `-CheckMigrations` if entities or persistence configurations changed):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\.agent\skills\execute-stage-task\scripts\verify-task.ps1 -Full [-CheckMigrations] [-BootCheck]
```
Capture exact exit status, Wave 0 compliance, compiler warning count (`0 Warning(s)`), EF pending model changes status, test counts (`0 Failed, 0 Skipped`), and live boot-check status.

---

## Step 3 — Adversarial 4-Axis Review

Audit every modified/created file rigorously:
1. **Spec Fidelity & Ownership:** Does the implementation satisfy 100% of the task spec without scope creep, Stage 3 leakage, Wave 0 violations (`Program.cs`, `PharmacyDbContext.cs`), or unauthorized edits to teammates' owned files?
2. **Security & Multi-Tenancy (`backend-security-audit`):** RLS (`ENABLE` + `FORCE` + policy), `DatabaseRoleSecuritySql` (`erp_app`), composite tenant FKs, explicit `IUnitOfWork` transactions on reads & writes, RBAC + `CanAccessBranch`, `RuntimeModeGuardMiddleware`, immutability triggers, `[AllowHeaderIdempotencyKey]`, no secrets/raw SQL injection.
3. **Performance & Concurrency (`performance-concurrency-guard`):** `.AsNoTracking()`, zero N+1, pagination `1..200`, composite indexes, deterministic `FOR UPDATE` locking, `RowVersion`, `409 CONFLICT` mapping, rounding (`numeric(18,4)` / `(18,2)`), `CancellationToken`, zero sync-over-async.
4. **Architecture, Wire Contracts & Test Quality (`architecture-unifier`):** Onion layers, modular DI, `Result<T>` + `ApiResultMapper`, strict `snake_case` (`[FromQuery(Name = "...")]`, `ApiErrorDetailDto.Field`), `[ProducesResponseType]`, `ContractsArtifactSyncTests` + `openapi.v1.json` sync, anti-tautology tests (real assertions, not mock-mirrors-implementation).

Classify every finding strictly:
- **P0 (Blocker — Must Fix Before Merge):** Security/RLS hole, data corruption/race condition, Wave 0 violation, failing build/tests/contracts, missing requirement.
- **P1 (Important — Should Fix Before Merge):** Missing edge-case test, N+1 query, missing `.AsNoTracking()`, missing rollback on error branch, contract/wire mismatch.
- **P2 (Nit / Suggestion):** Naming, readability, minor refactor (does not block merge).

---

## Step 4 — Arabic Review Verdict in Chat

Output a concise, actionable report in **Arabic** (keeping identifiers, routes, SQL constructs, and file paths in English):
1. **القرار النهائي (Merge Verdict):** `✅ APPROVE (Ready for stage2-dev)` or `❌ CHANGES REQUESTED (Blocked by X P0 / Y P1)`.
2. **نتائج التحقق الآلي (Deterministic Harness Results):** Wave 0 status, Build verdict, EF migration sync, Unit + Integration pass counts (`0 Failed, 0 Skipped`), Boot-check status.
3. **الملاحظات مصنّفة حسب الأولوية (Findings Table):** Severity (`P0`/`P1`/`P2`), Pillar, clickable `file:line`, Root Cause, and exact Fix Required.
4. **ملخص جودة الاختبارات (Test Quality Assessment):** What real guarantees the tests prove and any missing edge cases.
