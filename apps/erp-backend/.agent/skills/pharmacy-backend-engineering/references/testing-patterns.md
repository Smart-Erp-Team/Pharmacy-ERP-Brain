# Testing & Verification Patterns Reference

## 1. Two-Tier Testing Discipline

To keep development fast without sacrificing safety:
- **Tier 1 (Implementer Fast Inner Loop):** Run build + targeted tests for the feature under development:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\.agent\skills\execute-stage-task\scripts\verify-task.ps1 -FastFilter "FullyQualifiedName~<FeatureOrClass>"
  ```
- **Tier 2 (Independent Reviewer & Final Gate):** Run full solution verification (plus `-BootCheck` whenever API endpoints, DI registrations, middleware, or migrations changed):
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File .\.agent\skills\execute-stage-task\scripts\verify-task.ps1 -Full -BootCheck
  ```
- **Hard Gate:** `0 Error(s), 0 Warning(s)` and **`100% Passed, 0 Failed, 0 Skipped`**. Never accept silently skipped PostgreSQL tests (`[SkipWhenPostgresUnavailableFact]` skipping means `ERP_IT_POSTGRES` / local Postgres is broken!).

---

## 2. Unit Tests (`tests/PharmacyERP.UnitTests`)

Mirror source layout (`Domain/<Module>/`, `Application/<Module>/`, `Infrastructure/`, `API/`). Every task MUST prove:
- **Domain invariants:** invalid IDs (`Guid.Empty`), negative amounts/quantities, illegal state transitions, exact case-sensitive enum names.
- **Math & rounding boundaries:** multi-UOM conversions (`numeric(18,6)` -> `numeric(18,4)`), unit cost division, tax/discount/line total rounding (`numeric(18,2)` `MidpointRounding.AwayFromZero`), zero/fractional edges.
- **Application service branches:** happy path, missing tenant (`401`), unauthorized branch (`403 FORBIDDEN_BRANCH`), missing entity (`404`), idempotency replay & payload mismatch (`409 IDEMPOTENCY_MISMATCH`), insufficient stock (`409 OUT_OF_STOCK`), expiry policy violation (`422 EXPIRY_POLICY_VIOLATION`), pagination bounds (`page < 1` / `page_size > 200` -> `422`), transaction rollback on failure, and verified `IAuditLogger` + `IOutboxService` calls.
- **EF Core model configuration tests:** column names/types/precisions, check constraints, composite/partial indexes, composite AKs & FKs, `DeleteBehavior.Restrict`.

---

## 3. Integration Tests (`tests/PharmacyERP.IntegrationTests`)

Use `ThrowawayPostgresDatabaseProvisioner` (`CustomWebApplicationFactory.cs`) and `[SkipWhenPostgresUnavailableFact]` against least-privilege **`erp_it_app`** (`erp_app` member, `NOSUPERUSER NOBYPASSRLS`) with `FORCE ROW LEVEL SECURITY` and triggers active. Every Stage 2/3 feature touching persistence or HTTP MUST prove:
1. **Cross-Tenant PostgreSQL RLS Isolation:** Tenant B cannot read, update, or delete Tenant A rows even with raw SQL when bound to Tenant B.
2. **Composite FK Enforcement:** Inserting a child row referencing another `organization_id` (or mismatched `branch_id`/`product_id`) fails at the PostgreSQL FK constraint layer.
3. **Immutability Triggers:** Attempting `UPDATE` or `DELETE` on posted immutable records raises a PostgreSQL trigger exception.
4. **Concurrency & Locking:** Stale `row_version` or concurrent conflicting writes surface `409 CONFLICT` without negative stock or corrupted balances.
5. **Idempotency Replay & Mismatch:** Replaying same `Idempotency-Key` + equivalent payload returns the stored response without duplicating ledger/audit/outbox rows; mutated payload returns `409 IDEMPOTENCY_MISMATCH`.
6. **HTTP Endpoint Contracts:** Real `WebApplicationFactory` tests verifying routes, status codes (`200`/`201`/`400`/`401`/`403`/`404`/`409`/`422`), `snake_case` JSON & error fields, `ApiErrorEnvelopeDto`, header-only `Idempotency-Key`, RBAC policies, branch scope (`403 FORBIDDEN_BRANCH`), `RuntimeModeGuardMiddleware`, and `ContractsArtifactSyncTests`.

---

## 4. Anti-Tautology Test Quality Rules (Enforced by Reviewer Agent)
- **Never test mocks instead of behavior:** Mocking a service to return `X` and asserting it returned `X` proves nothing. Assert real domain state, SQL/EF configuration metadata, rounding outputs, error codes, field names, and rollback calls.
- **Never weaken assertions to make a test pass:** If `ContractsArtifactSyncTests` fails, fix the controller `[ProducesResponseType]` / DTO / OpenAPI snapshot — never weaken the contract test.
- **Test failure paths with exact `ErrorCode` and `ApiErrorDetailDto.Field`:** Don't just assert `result.IsFailure`; assert the exact `ErrorCode` and `snake_case` field name!
