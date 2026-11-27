---
name: triage-api-logs
description: Triage, classify, minimally fix, and regression-test backend errors captured in apps/erp-backend/logs/dev-requests.log during frontend integration testing, while producing actionable frontend integration notes for expected security/validation guardrails.
---

# `/triage-api-logs` — Backend Development Error Triage Skill

Apply `.agent/rules/00-backend-guardrails.md` and `.agent/skills/pharmacy-stage1-baseline/SKILL.md` throughout. Preserve Clean/Onion Architecture, Wave 0 clean root files (`Program.cs` and `PharmacyDbContext.cs` untouched), PostgreSQL RLS isolation, and approved DTO/OpenAPI contracts.

---

## Step 1: Read & Deduplicate `apps/erp-backend/logs/dev-requests.log`

1. Check whether `apps/erp-backend/logs/dev-requests.log` exists and contains non-whitespace entries. If missing or empty, report that no runtime errors were captured and stop cleanly.
2. Parse every JSON-lines record (skip blank or malformed lines without failing, noting any malformed lines).
3. Extract per entry:
   - `method`, `path`, `queryString`, `statusCode`, `traceId`, `timestampUtc`, `durationMs`
   - `runtimeMode`, `organizationId`, `branchId`, `userId`, `role`, `branchScope`
   - `errorCode`: parse `error.code` from `responseBody` JSON when present (otherwise `NONE`)
   - `exceptionType`: `exception.type` (and `exception.sqlState` if present)
4. Group duplicate failures by `(method, path, statusCode, errorCode/exceptionType)`, recording total count, up to 3 sample `traceId` values, representative `runtimeMode` / `role` / `branchScope`, and concise excerpts of `responseBody` and `exception`.
5. Order groups strictly by severity:
   1. **Priority 1 — `500` Internal Server Errors:** Unhandled exceptions, PostgreSQL/RLS errors (`25P01`, `42501`), concurrency/deadlock (`40001`, `40P01`), or JSON/EF serialization exceptions.
   2. **Priority 2 — `404` / `405` Routing & Runtime Mode Mismatches:** Route template mismatches, CORS preflight failures, or `RuntimeModeGuardMiddleware` blocks (`Cloud` vs. `BranchLocal`).
   3. **Priority 3 — `422` / `400` Validation & Binding Errors:** Model binding failures, `snake_case` query/field mismatches, enum serialization mismatches, or `ApiErrorEnvelopeDto` validation errors.
   4. **Priority 4 — `401` / `403` Auth & Scope Errors:** JWT validation failures, `SecurityStamp` revocations, role policy denials, or branch-scope (`FORBIDDEN_BRANCH`) rejections.

---

## Step 2: Classify Each Issue (Backend Bug vs. Expected Guardrail)

- **Backend Bug -> Fix in Backend:**
  - Missing explicit transaction for PostgreSQL RLS (`25P01` / `42501` or missing `SET LOCAL` tenant GUC).
  - Unhandled null reference, invalid cast, or unexpected server exception.
  - Incorrect HTTP status mapping in `ExceptionHandlingMiddleware` or controllers.
  - DTO property / `snake_case` / enum serialization or model-binding bug on the backend.
  - Missing `[AllowHeaderIdempotencyKey]`, CORS misconfiguration, or broken endpoint contract.
- **Expected Security / Validation Guardrail -> Record Frontend Integration Note (Do NOT weaken backend):**
  - Missing required header (`Idempotency-Key`, `Authorization: Bearer ...`).
  - Insufficient role calling privileged endpoint (`403`) or unauthorized branch (`403 FORBIDDEN_BRANCH`).
  - Calling `BranchLocal`-only mutation against `Cloud` or `Cloud`-only write against `BranchLocal` (`404`).
  - Invalid business payload or malformed JSON (`400` / `422 VALIDATION_ERROR`).
  - **Hard Rule:** NEVER weaken backend security, JWT/`SecurityStamp`, PostgreSQL RLS, `RuntimeModeGuardMiddleware`, or domain validation to silence a frontend error.

---

## Step 3: Iterative One-by-One Fix & Regression Test Loop

Process **one confirmed Backend Bug at a time**, strictly in Priority 1 -> 4 order:
1. **Inspect:** Read the exact controller, application service, repository, middleware, and EF configuration involved.
2. **Fix Minimally:** Resolve root cause while preserving Onion boundaries, Wave 0 clean root files, explicit `IUnitOfWork` RLS transactions, and DTO/OpenAPI contracts.
3. **Add Regression Test:** Add/update a targeted Unit or Integration test reproducing the exact scenario.
4. **Verify Before Moving On:** Run from `apps/erp-backend/`:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\.agent\skills\execute-stage-task\scripts\verify-task.ps1 -Full
   ```
   Confirm **`0 Error(s), 0 Warning(s)`** and **`0 Failed, 0 Skipped`** before moving to the next bug.

---

## Step 4: Archive & Report (Arabic Debrief + Structured Summary)

1. **Archive Processed Logs:**
   - Append processed entries from `apps/erp-backend/logs/dev-requests.log` to `apps/erp-backend/logs/resolved-archive.log` (creating it if absent) and clear `apps/erp-backend/logs/dev-requests.log`.
2. **Deliver Final Report (Arabic summary + English technical tables):**
   - **(A) Backend Fixes Applied:** Severity, grouped endpoint + error code/exception, occurrence count, sample `traceId`s, root cause, clickable modified file links, regression tests added, and `verify-task.ps1` verdict.
   - **(B) Frontend Integration Notes:** Grouped endpoint, HTTP status, `error.code`, count, sample `traceId`s, why backend rejected it (expected guardrail), and exact header/auth/runtime-mode/JSON changes needed by the frontend team.
