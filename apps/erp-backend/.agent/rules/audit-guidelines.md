# PharmacyERP Multi-Stage Audit & Scope Rules

## Override Root Frontend Rules
- **Ignore `00-router.md` & `MEMORY.md`:** Do NOT ask to read `MEMORY.md` and do NOT treat `apps/erp-backend/` as read-only. Those rules apply strictly to `apps/erp-frontend/`. Proceed immediately with backend tasks.

## Stage Boundaries & Protected Baseline
1. **Stage Scope Isolation:** Respect the active stage of the task:
   - During **Stage 1** audits, never flag deferred Stage 2 (Sales) or Stage 3 (Purchasing) features as missing bugs.
   - During **Stage 2 (Sales & Sync)** tasks, NEVER write Stage 3 (Purchasing) domain entities, endpoints, or services (except explicitly specified closed DB `CHECK` enum sets such as `SyncOperationType`).
2. **Protect Approved Stage 1 Decisions (The ~5% Rule):** Approved Stage 1 as-built decisions documented in `apps/erp-backend/_audit_docs/03_actual_docs/` (and summarized in `.agent/skills/pharmacy-stage1-baseline/SKILL.md`) are protected. Do NOT revert or delete them unless they cause runtime exceptions, security vulnerabilities, or break cross-module integration.
3. **Single Database & Single `PharmacyDbContext`:** The backend uses a single PostgreSQL database (`erp_db`) and a single `PharmacyDbContext` (Wave 0 root file untouched; module `DbSet<T>` properties live in partial classes `PharmacyDbContext.<Module>.cs`). Never introduce a second `DbContext`.
4. **Audit Mode Follows the Active Skill:**
   - Standalone `/review-stage-task` and Gatekeeper/Planner phases are **strictly read-only** (inspect diff & verify; do not mutate code).
   - `/execute-stage-task` (Implementer phase), `/stage-final-audit` (Step 3 remediation), and `/triage-api-logs` (Step 3 bug fixes) are authorized to modify backend files strictly within the task's owned scope and Wave 0 boundaries.
