---
description: Triage, fix, and regression-test backend errors captured in logs/dev-requests.log during frontend integration testing
---

# `/triage-api-logs` — Backend Development Error Triage Workflow

Apply `.agent/skills/pharmacy-stage1-baseline/SKILL.md` throughout this workflow. Preserve Clean / Onion Architecture, Wave 0 clean root files (`Program.cs` and `PharmacyDbContext.cs` remain untouched), PostgreSQL RLS isolation, and approved Stage 1 DTO contracts.

---

## Step 1: Read & Deduplicate `apps/erp-backend/logs/dev-requests.log`

1. Check whether `apps/erp-backend/logs/dev-requests.log` exists and contains non-whitespace entries.
   - If the file is missing or empty, report that no runtime errors were captured and stop cleanly.
2. Parse every JSON-lines record from `apps/erp-backend/logs/dev-requests.log` (skip blank or malformed lines without failing, noting any malformed lines).
3. For each entry, extract:
   - `method`, `path`, `queryString`, `statusCode`, `traceId`, `timestampUtc`, `durationMs`
   - `runtimeMode`, `organizationId`, `branchId`, `userId`, `role`, `branchScope`
   - `errorCode`: parse `error.code` from `responseBody` JSON when present (otherwise `NONE`)
   - `exceptionType`: `exception.type` (and `exception.sqlState` if present)
4. Group duplicate failures by `(method, path, statusCode, errorCode/exceptionType)`.
   - Record total occurrence count per group.
   - Collect up to 3 sample `traceId` values, representative `runtimeMode` / `role` / `branchScope`, and concise excerpts of `responseBody` and `exception`.
5. Order all deduplicated groups strictly by severity:
   1. **Priority 1 — `500` Internal Server Errors:** Unhandled exceptions, PostgreSQL / RLS errors (`25P01`, `42501`), concurrency/deadlock errors, or JSON/EF Core serialization exceptions.
   2. **Priority 2 — `404` / `405` Routing & Runtime Mode Mismatches:** Route template mismatches, CORS preflight failures, or `RuntimeModeGuardMiddleware` blocks (`Cloud` vs. `BranchLocal`).
   3. **Priority 3 — `422` / `400` Validation & Binding Errors:** Model binding failures, enum serialization mismatches, or `ApiErrorEnvelopeDto` validation errors.
   4. **Priority 4 — `401` / `403` Auth & Scope Errors:** JWT validation failures, `SecurityStamp` revocations, role policy denials, or branch-scope (`FORBIDDEN_BRANCH`) rejections.

---

## Step 2: Classify Each Issue (Backend Bug vs. Expected Guardrail)

Evaluate each deduplicated group against Stage 1 backend code and contracts:

- **Backend Bug -> Fix in Backend:**
  - Missing explicit read transaction for PostgreSQL RLS (`25P01` / `42501` or missing `SET LOCAL` tenant GUC).
  - Unhandled null reference, invalid cast, or unexpected server exception.
  - Incorrect HTTP status mapping in `ExceptionHandlingMiddleware` or controllers.
  - DTO property / enum serialization or model-binding bug on the backend.
  - Missing expected header support, CORS misconfiguration, or broken Stage 1 endpoint contract.

- **Expected Security / Validation Guardrail -> Record Frontend Integration Note (Do NOT weaken backend):**
  - Frontend omitted a required header (e.g., `Idempotency-Key` on mutating endpoints, `Authorization: Bearer ...`).
  - Lower-privilege role (e.g., `Cashier`, `Pharmacist`, `Manager`) called an `AdminOnly` or `PlatformProvisionerOnly` endpoint (`403`).
  - User requested a branch outside their authorized `branch_ids` / `branch_scope` (`403 FORBIDDEN_BRANCH`).
  - Frontend called a `BranchLocal`-only stock mutation against a `Cloud` instance or a `Cloud`-only catalog/org write against a `BranchLocal` instance (`404` from `RuntimeModeGuardMiddleware`).
  - Frontend sent invalid business data or malformed JSON (`400` / `422 VALIDATION_ERROR`).
  - **Hard Rule:** NEVER weaken backend security, JWT/`SecurityStamp` checks, PostgreSQL RLS policies, `RuntimeModeGuardMiddleware`, or domain validation rules to silence a frontend error. Instead, record exact, actionable integration notes for the frontend developer.

---

## Step 3: Iterative One-by-One Fix & Regression Test Loop

Process **one confirmed Backend Bug at a time**, strictly in Priority 1 -> 4 order:

1. **Inspect:** Read the exact controller, application service, repository, middleware, and EF Core configuration involved in the failure.
2. **Fix Minimally:** Implement the smallest clean fix that resolves the root cause while preserving:
   - Clean / Onion Architecture layer boundaries.
   - Wave 0 rule (`src/PharmacyERP.Api/Program.cs` and `PharmacyDbContext.cs` untouched; register services in `DependencyInjection.cs` and middleware in `MiddlewareExtensions.cs`).
   - PostgreSQL RLS explicit transactions (`IUnitOfWork`) and `TenantContext` discipline.
   - Approved Stage 1 DTO property names and `ApiErrorEnvelopeDto` structure.
3. **Add Regression Test:** Add or update a targeted test in `tests/PharmacyERP.UnitTests` (or `tests/PharmacyERP.IntegrationTests` when PostgreSQL/RLS/pipeline behavior is involved) that reproduces the exact scenario from the log entry.
4. **Verify Before Moving On:** Run from `apps/erp-backend/`:
   ```bash
   dotnet test PharmacyERP.sln --no-restore
   ```
   Confirm **0 failures and 0 warnings** before starting the next bug.

---

## Step 4: Archive & Report

1. **Archive Processed Logs:**
   - Append the processed entries from `apps/erp-backend/logs/dev-requests.log` to `apps/erp-backend/logs/resolved-archive.log` (creating the archive file if it does not exist).
   - Clear `apps/erp-backend/logs/dev-requests.log` so the next frontend integration test session starts clean.
2. **Output Structured Final Report** divided clearly into two sections:
   - **(A) Backend Fixes Applied:**
     - Severity, grouped endpoint + error code/exception, occurrence count, sample `traceId`s
     - Root cause and exact modified file paths
     - New/updated regression test names and `dotnet test PharmacyERP.sln --no-restore` verification result
   - **(B) Frontend Integration Notes:**
     - Grouped endpoint, HTTP status, `error.code`, occurrence count, sample `traceId`s
     - Why the backend rejected the request (expected guardrail)
     - Exact headers, auth role/branch scope, runtime mode, or JSON payload changes needed by the frontend teammate
