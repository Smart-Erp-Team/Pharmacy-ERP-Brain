---
name: execute-stage-task
description: Execute a Stage 2 or Stage 3 backend developer task through a true 3-agent pipeline (Preflight script -> Agent 1 Gatekeeper & Planner [read-only] -> Smart Risk Approval Gate -> Agent 2 Implementer [clean context] -> Agent 3 Independent Adversarial Reviewer & Verifier [fresh context] with bounded fix loop -> Arabic Debrief & PR Handoff).
---

# `/execute-stage-task` — Multi-Agent Stage 2 & Stage 3 Task Pipeline

You are the **Thin Orchestrator** for this task. Your job is to coordinate **3 isolated subagents** cleanly — do **NOT** cram planning, coding, and self-review into one bloated context window!

Always enforce `.agent/rules/00-backend-guardrails.md`, `.agent/rules/audit-guidelines.md`, and `.agent/skills/pharmacy-stage1-baseline/SKILL.md`.

---

## Step 0 — Deterministic Preflight & Surgical Task Extraction

Run from `apps/erp-backend/` (extracts ONLY the document header + target task section so we never dump 100KB+ task files into context):
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\.agent\skills\execute-stage-task\scripts\check-preflight.ps1 -TaskFile <task-file-path> -TaskId <TASK-ID>
```
- **If the script exits non-zero (`[BLOCK]` — e.g., on `main`, Wave 0 file dirty, or task ID missing):** STOP immediately and inform the developer in Arabic without modifying any file.
- **If `[WARN]` says current branch is `stage2-dev` (for non-`*-01` tasks):** Pause and remind the developer in Arabic to switch to their feature branch (`git switch -c stage2/<dev>/<task-id>-<slug>`) or ask if they explicitly want to continue.

---

## Agent 1 — Gatekeeper & Planner (Read-Only Subagent)

Invoke the built-in **`research`** subagent (`invoke_subagent`, `TypeName: "research"`, `Role: "Stage Task Gatekeeper & Planner"`) and pass it:
1. The exact extracted **Document Header + Target Task Spec** from Step 0.
2. Instruction to read `.agent/skills/pharmacy-backend-engineering/SKILL.md` and ONLY the specific `references/*.md` files relevant to this task.
3. Instruction to execute **Phase 1 (Hard Prerequisite Gate)** and **Phase 2 (Deep Implementation Plan)**:
   - **Hard Prerequisite Gate:** Physically verify EVERY item in the task's `Prerequisites` checklist exists in `src/` (classes, interfaces, methods, `DbSet<T>` partials, EF configurations, migrations, DI registrations). If ANY prerequisite is missing or broken, return **`STATUS: BLOCKED_PREREQUISITE`** listing exact missing symbols/files and which teammate task/PR must be merged and pulled from `stage2-dev` first.
   - **Deep Implementation Plan (only if Gate passes 100%):**
     - Inspect relevant neighboring Stage 1 / Stage 2 files so patterns match live code.
     - Produce a concise **Plan Contract** covering:
       1. Exact files to create/update (strictly within the developer's `Owned Files` & Wave 0 rules).
       2. Data, Security & Wire Contract design (composite AK/FKs, RLS + `DatabaseRoleSecuritySql`, immutability triggers, RBAC + `CanAccessBranch`, `RuntimeModeGuardMiddleware`, `snake_case`, `[ProducesResponseType]`, `ContractsArtifactSyncTests` / `openapi.v1.json` impact).
       3. Concurrency, Idempotency & Math/Rounding edge cases (`RowVersion`, deterministic `FOR UPDATE`, `Idempotency-Key`, `numeric(18,4)`/`(18,2)`/`(18,6)`/`(9,4)`).
       4. Exact Unit + Integration Test matrix & Tier 1 `--filter` expression + whether Tier 2 requires `-BootCheck` and `-CheckMigrations`.
       5. **Risk Tier Classification:**
          - **`STANDARD`:** DTOs, Validators, pure Domain Enums/Exceptions, Unit Tests, simple read queries with no schema/security/contract breaks.
          - **`HIGH`:** Any EF Core Migration, PostgreSQL RLS / Trigger / Schema change, Auth/RBAC/Middleware change, Sync Engine logic, FEFO/Atomic Checkout/Stock mutation, or New Public HTTP Endpoints / OpenAPI Contract changes.

### Gate Handling After Agent 1 Returns
- **If `STATUS: BLOCKED_PREREQUISITE`:** STOP immediately. Do NOT spawn Agent 2. Reply to the developer in **Arabic** listing the missing prerequisites and the exact teammate PR to pull first.
- **Smart Human-in-the-Loop Checkpoint:**
  - If **Risk Tier = `HIGH`**: Write the Plan Contract to a Plan Artifact (`RequestFeedback: true`, `UserFacing: true`) and **PAUSE for explicit developer approval** (summarize the risk points concisely in Arabic and wait for the developer's go-ahead before spawning Agent 2).
  - If **Risk Tier = `STANDARD`**: Proceed directly to Agent 2 (no unnecessary friction).

---

## Agent 2 — Clean-Context Implementer (Write-Enabled Subagent)

Define (once per conversation) and invoke a write-enabled subagent:
- `define_subagent`:
  - `Name: "backend-implementer"`
  - `EnableWriteTools: true`
  - `SystemPrompt`: Enforces `.agent/rules/00-backend-guardrails.md`, Wave 0 untouched (`Program.cs`, `PharmacyDbContext.cs`), strict `Owned Files` scope, clean `GlobalUsings.cs`, XML `<summary>` & *why* comments, explicit `IUnitOfWork` transactions, `Result<T>` + `ApiResultMapper`, strict `snake_case` + `[ProducesResponseType]` + `ContractsArtifactSyncTests`/`openapi.v1.json` sync, and high-signal anti-tautology tests.
- `invoke_subagent` (`TypeName: "backend-implementer"`, `Role: "Stage Task Implementer"`):
  - Pass **ONLY**: (a) Extracted Task Header + Spec, (b) Agent 1's frozen **Plan Contract**, and (c) the exact `pharmacy-backend-engineering/references/*.md` paths to read.
  - Instruct Agent 2 to:
    1. Implement strictly per the Plan Contract (zero unrelated edits, zero Stage 3 code).
    2. Write all planned Unit and Integration tests (proving real invariants, not tautological mock tests).
    3. If `ErrorCode`, routes, DTOs, or `/canonical/capabilities` changed: update `ContractsArtifactSyncTests.cs`, `apps/erp-backend/contracts/schemas/*.json`, regenerate `apps/erp-backend/contracts/openapi.v1.json` (`$env:UPDATE_OPENAPI_SNAPSHOT="true"`), and update `apps/erp-backend/contracts/README.md`.
    4. Run **Tier 1 Fast Verification** from `apps/erp-backend/`:
       ```powershell
       powershell -NoProfile -ExecutionPolicy Bypass -File .\.agent\skills\execute-stage-task\scripts\verify-task.ps1 -FastFilter "<filter-from-plan>"
       ```
    5. Fix any compile warnings or fast-test failures until Tier 1 passes 100%, then return a concise summary of created/modified files and test results.

---

## Agent 3 — Independent Adversarial Reviewer & Verifier (Fresh Context Subagent)

Never let Agent 2 review its own work. Spawn a **brand-new** independent subagent that never saw Agent 2's reasoning:
- `define_subagent`:
  - `Name: "backend-reviewer"`
  - `EnableWriteTools: true` *(ONLY to run read-only `git` inspection and `verify-task.ps1` — MUST NEVER call `write_file` or `edit_file`!)*
  - `SystemPrompt`: "You are an adversarial Principal Backend Reviewer & Verifier for PharmacyERP. You NEVER edit or write source/test files. You inspect `git status --short -- .` and `git diff -- .`, verify Spec <-> Plan <-> Diff fidelity, audit Security, Performance/Concurrency, Architecture/Wire Contracts, and Test Quality (anti-tautology), and run the deterministic Tier 2 verification harness (`verify-task.ps1`). Report strictly `VERDICT: PASS` or `VERDICT: CHANGES_REQUESTED` with exact P0/P1/P2 findings (`file:line`, root cause, required fix)."
- `invoke_subagent` (`TypeName: "backend-reviewer"`, `Role: "Independent Reviewer & Verifier"`):
  - Pass: (a) Extracted Task Spec & `Owned Files` list, (b) Frozen Plan Contract, (c) Instruction to read `.agent/skills/backend-security-audit/SKILL.md`, `.agent/skills/performance-concurrency-guard/SKILL.md`, and `.agent/skills/architecture-unifier/SKILL.md`.
  - Instruct Agent 3 to:
    1. Run `git status --short -- .` and `git diff -- .` (and read all newly created files in full).
    2. Audit every changed/created file against:
       - **Spec & Plan Fidelity + Owned Files boundary** (no missing requirements, no scope creep, no teammate file edits).
       - **Security (`backend-security-audit`), Concurrency (`performance-concurrency-guard`), Architecture & Wire Contracts (`architecture-unifier`)**.
       - **Test Quality:** Verify assertions prove real behavior, exact `ErrorCode` + `snake_case` `Field` names, RLS/FK/trigger/idempotency behavior (flag any tautological tests).
    3. Run **Tier 2 Full Verification** from `apps/erp-backend/` (add `-BootCheck` if API/DI/middleware/migrations changed; add `-CheckMigrations` if Domain/Persistence changed):
       ```powershell
       powershell -NoProfile -ExecutionPolicy Bypass -File .\.agent\skills\execute-stage-task\scripts\verify-task.ps1 -Full [-CheckMigrations] [-BootCheck]
       ```
    4. Return structured verdict (`PASS` or `CHANGES_REQUESTED`), exact build/test/boot-check numbers, and P0/P1/P2 findings.

---

## Bounded Fix Loop (Maximum 2 Iterations)

- **If Agent 3 returns `VERDICT: CHANGES_REQUESTED` with any P0 or P1 finding:**
  1. Message the existing **`backend-implementer`** (`send_message`) with ONLY Agent 3's exact P0/P1 findings and required fixes.
  2. Once Agent 2 finishes fixing and passes Tier 1, message the existing **`backend-reviewer`** (`send_message`) to re-inspect the updated diff and re-run Tier 2 verification (`verify-task.ps1 -Full ...`).
  3. Repeat at most **2 fix iterations**. If still `CHANGES_REQUESTED` after iteration 2, **STOP immediately** and escalate to the developer in Arabic with the unresolved P0/P1 findings — never loop indefinitely.
- **If Agent 3 returns `VERDICT: PASS`** (with zero P0/P1 findings and `0 Errors, 0 Warnings, 0 Failed, 0 Skipped`): proceed to Final Delivery.

---

## Final Delivery — Arabic Debrief & PR Handoff (Main Agent)

Deliver a concise, clear response in **Arabic** (keeping technical identifiers, routes, SQL constructs, and file paths in English) with these 4 sections:
1. **ما تم بناؤه (What Was Built):** Exact feature implemented + clickable links to every created/modified file.
2. **القرارات المعمارية والأمنية (Why It Was Designed This Way):** Key RLS, composite FK, transaction, idempotency, concurrency/locking, rounding, runtime-mode, or wire-contract decisions and how this connects to Stage 1 / teammates.
3. **إثبات التحقق والمراجعة المستقلة (Independent Verification Proof):** Exact verdict from Agent 3 (build: `0 Errors, 0 Warnings`, exact Unit + Integration pass counts with `0 Failed, 0 Skipped`, `ContractsArtifactSyncTests` & boot-check status, and any findings caught & fixed in the review loop).
4. **جاهز للـ PR والخطوة التالية (PR Handoff & Next Task):**
   - Suggested commit message + short ready-to-paste PR summary targeting `stage2-dev` (reminding the developer to review `git diff -- .` and `git push` manually).
   - Which downstream tasks/teammates are now unblocked + the exact next task ID in this developer's roadmap.
