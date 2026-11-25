# PharmacyERP — Stage 1 Frontend & Integration Contracts Package

> **Authoritative Parity Notice:** Every endpoint, HTTP method, route parameter, `snake_case` query parameter, header, JSON property name, native JSON number type, nullability rule, string-only enum, RBAC policy, runtime-mode guard, and HTTP status code in this folder matches the live Stage 1 backend contract in [`../contracts/openapi.v1.json`](../contracts/openapi.v1.json) and [`../contracts/README.md`](../contracts/README.md) **100% verbatim**.
>
> **Stage 1 Scope Only:** This package covers the **48 live Stage 1 HTTP endpoints** (47 controller actions across 13 controllers + `GET /.well-known/jwks.json`) and **76 OpenAPI component schemas**. Stage 2 (Sales / POS) and Stage 3 (Purchasing) artifacts are intentionally excluded until implemented in the live backend.

---

## Directory Index

| Path | Description | Status |
| --- | --- | --- |
| [`openapi.erp.yaml`](./openapi.erp.yaml) | Complete Stage 1 OpenAPI 3.0.4 specification generated verbatim from `contracts/openapi.v1.json` (**48 live endpoints**, **76 component schemas**), annotated with accurate `x-stage: 1`, `x-runtime` (`Cloud` \| `BranchLocal` \| `Both`), and `x-roles` extensions. | Active (Stage 1) |
| [`FRONTEND.md`](./FRONTEND.md) | Complete Stage 1 Frontend integration guide: runtime split, auth flows, `LoginResponse` vs flat `CurrentUserDto`, RBAC matrix, `Idempotency-Key`, `400` vs `422`, pagination, and QA seed references. | Active (Stage 1) |
| [`schemas/`](./schemas/) | JSON Schema (Draft 2020-12) definitions covering all 76 live Stage 1 OpenAPI schemas (`common.json`, `auth.json`, `identity.json`, `catalog.json`, `inventory.json`, `canonical.json`) plus synced `api-error-envelope.schema.json` and `canonical-capabilities.schema.json`. | Active (Stage 1) |
| [`fixtures/`](./fixtures/) | Realistic Stage 1 JSON fixtures grounded in `FRONTEND_TEST_DATA_GUIDE.md` (`MEDCARE` seeded tenant) validating 100% against `openapi.erp.yaml` and `schemas/*.json`. | Active (Stage 1) |
| `canonical/` | Reserved placeholder (`.gitkeep`) for standalone canonical event/document artifacts. Stage 1 canonical HTTP schemas live in `schemas/canonical.json` and `schemas/canonical-capabilities.schema.json`. | Placeholder |
| `events/` | Reserved placeholder (`.gitkeep`) for outbox event schemas. | Placeholder |
| `ai-output/` | Reserved placeholder (`.gitkeep`) for Brain AI output schemas. | Placeholder |

---

## Live Stage 1 Wire-Format Invariants

1. **Strict `snake_case` Everywhere:**
   - All JSON request/response properties and all query parameters use strict `snake_case` (`next_cursor`, `branch_code`, `branch_ids`, `page_size`, `include_inactive`, `updated_since`). Sending `camelCase` fails validation.
   - Nullable properties are serialized explicitly as `"field": null` (`JsonIgnoreCondition.Never`).
2. **Native JSON Numbers (NEVER String Decimals):**
   - All monetary prices, unit costs, quantities, conversion factors, and fractional tax rates (`0.0..1.0`) serialize and deserialize as **native JSON `number`** values (e.g., `10.5`, `0.14`, `1`, `280`).
   - Counts and optimistic concurrency tokens (`row_version`, `page`, `page_size`, `total_count`, `expiry_alert_days`, `access_failed_count`) serialize as JSON `integer`.
3. **String-Only Enums (`allowIntegerValues: false`):**
   - Responses emit exact C# enum member names as JSON strings; requests reject integer enum values with **`422 VALIDATION_ERROR`**.
   - `LocationType` includes `"SELLABLE"`, `"QUARANTINE"`, `"DAMAGED"`, `"SCRAP"`.
   - `ErpRuntimeMode` is `"Cloud"` or `"BranchLocal"`.
4. **Timestamps & Calendar Dates:**
   - `DateTimeOffset` fields use ISO 8601 UTC timestamps with offset (e.g., `"2026-11-25T18:15:00+00:00"`).
   - `DateOnly` fields (`hired_on`, `manufactured_on`, `expires_on`) use ISO 8601 calendar dates (`"YYYY-MM-DD"`).
5. **Pagination:**
   - Standard paginated ERP list endpoints (including `GET /api/v1/inventory/balances`) use query parameters `page` (default `1`, min `1`) and `page_size` (default `25`, `1..200`), returning `PagedResult<T>` (`{ items, page, page_size, total_count, next_cursor }`).
   - `GET /api/v1/products/{id}/uoms` returns a raw JSON array `ProductUomDto[]` (unpaginated, `include_inactive` defaults to `false`).
   - Canonical list endpoints use `cursor` + `limit` (`GET /api/v1/canonical/products` returns `CanonicalProductFeedPageDto`; `GET /api/v1/canonical/inventory` returns `PagedResult<CanonicalInventoryItemDto>`).
6. **Idempotency (`Idempotency-Key`):**
   - All 17 body-bearing business write endpoints accept `Idempotency-Key` via HTTP header **or** optional `idempotency_key` body field (trimmed header takes precedence; max 100 chars).
   - Both bodyless write endpoints (`POST /api/v1/branches/{branchId}/enrollment-tokens` and `POST /api/v1/users/{id}/revoke-sessions`) require the `Idempotency-Key` HTTP header.
   - `POST /api/v1/auth/login`, `/auth/refresh`, `/auth/logout`, and `POST /api/v1/branch-enrollment` are exempt.
   - Missing key -> **`400 MALFORMED_REQUEST`**; key > 100 chars -> **`422 VALIDATION_ERROR`**; reused key with different payload -> **`409 IDEMPOTENCY_MISMATCH`**.
7. **Single Error Envelope (`ApiErrorEnvelopeDto`):**
   - Every error response (`400`, `401`, `403`, `404`, `409`, `422`, `500`) returns `{ "error": { "code", "message", "details": [{ "field", "issue" }], "trace_id" } }`.
   - There is **no `410 GONE`** in Stage 1; expired or consumed enrollment tokens return **`401 UNAUTHORIZED`**.
8. **Runtime Mode Enforcement:**
   - `RuntimeModeGuardMiddleware` enforces `Cloud` vs `BranchLocal` before authentication/authorization and returns **`404 NOT_FOUND`** (`ApiErrorEnvelopeDto`) for routes unavailable in the active mode.
   - Authentication (`/api/v1/auth/*`), JWKS (`/.well-known/jwks.json`), and `/api/v1/canonical/capabilities` are served in **both** `Cloud` and `BranchLocal` modes.

---

## Schema Files Summary (`schemas/`)

| File | Live Stage 1 Schemas Covered |
| --- | --- |
| [`schemas/common.json`](./schemas/common.json) | `AddressDto`, `ApiErrorDetailDto`, `ApiErrorBodyDto`, `ApiErrorEnvelopeDto`, `UserRole`, `BranchScope`, `ErpRuntimeMode`, plus `ErrorCode`, `PermissionScope`, `PagedResult`, and scalar primitives |
| [`schemas/auth.json`](./schemas/auth.json) | `JwkKey`, `JwksDocument`, `LoginRequest`, `LoginResponse`, `RefreshTokenRequest`, `LogoutRequest`, `CurrentUserDto` |
| [`schemas/identity.json`](./schemas/identity.json) | `OrganizationDto`, `CreateOrganizationRequest`, `BranchDto`, `BranchDtoPagedResult`, `CreateBranchRequest`, `UpdateBranchRequest`, `EnrollmentTokenResponse`, `RedeemBranchEnrollmentRequest`, `RedeemBranchEnrollmentResponse`, `EmployeeDto`, `EmployeeDtoPagedResult`, `CreateEmployeeRequest`, `UpdateEmployeeRequest`, `UserDto`, `UserDtoPagedResult`, `CreateUserRequest`, `UpdateUserRequest`, `ResetPasswordRequest` |
| [`schemas/catalog.json`](./schemas/catalog.json) | `ProductCategoryDto`, `ProductCategoryDtoPagedResult`, `CreateProductCategoryRequest`, `UpdateProductCategoryRequest`, `ProductUomDto`, `CreateProductUomItemRequest`, `CreateProductUomRequest`, `UpdateProductUomRequest`, `ProductDto`, `ProductDtoPagedResult`, `CreateProductRequest`, `UpdateProductRequest`, `ReorderRuleDto`, `UpsertReorderRuleRequest` |
| [`schemas/inventory.json`](./schemas/inventory.json) | `LocationType`, `BatchQualityStatus`, `InventoryTransactionType`, `InventoryTransactionStatus`, `InventoryLocationDto`, `InventoryLocationDtoPagedResult`, `CreateInventoryLocationRequest`, `UpdateInventoryLocationRequest`, `InventoryBatchDto`, `InventoryBatchDtoPagedResult`, `StockBalanceDto`, `StockBalanceDtoPagedResult`, `InventorySummaryDto`, `InventoryTxnLineDto`, `InventoryTxnDto`, `InventoryTxnDtoPagedResult`, `CreateInventoryAdjustmentLineRequest`, `CreateInventoryAdjustmentRequest` |
| [`schemas/canonical.json`](./schemas/canonical.json) | `CatalogConfigurationAction`, `CanonicalCapabilitiesDto`, `CanonicalUomConversionDto`, `CanonicalProductDto`, `CanonicalProductFeedPageDto`, `CanonicalUomItemDto`, `CanonicalProductConfigurationRequest`, `CanonicalReorderRuleConfigurationRequest`, `CanonicalWriteResultDto`, `CanonicalInventoryLotDto`, `CanonicalInventoryItemDto`, `CanonicalInventoryItemDtoPagedResult` |
| [`schemas/api-error-envelope.schema.json`](./schemas/api-error-envelope.schema.json) | Exact copy of `contracts/schemas/api-error-envelope.schema.json` |
| [`schemas/canonical-capabilities.schema.json`](./schemas/canonical-capabilities.schema.json) | Exact copy of `contracts/schemas/canonical-capabilities.schema.json` |

---

## Fixtures Summary (`fixtures/`)

| File | Schema | Seeded Reference (`FRONTEND_TEST_DATA_GUIDE.md`) |
| --- | --- | --- |
| [`fixtures/auth-token-pair.json`](./fixtures/auth-token-pair.json) | `LoginResponse` | `sarah.pharm@medcare.test` (`Pharmacist`, `ASSIGNED`, Downtown) |
| [`fixtures/current-user-context.json`](./fixtures/current-user-context.json) | `CurrentUserDto` | `admin@medcare.test` (`Admin`, `ALL`, flat `GET /api/v1/auth/me` payload) |
| [`fixtures/organization.json`](./fixtures/organization.json) | `OrganizationDto` | `MEDCARE` (`MedCare Wellness Pharmacies`, `enrollment_setup_state: "PENDING"`) |
| [`fixtures/branch.json`](./fixtures/branch.json) | `BranchDto` | `MED-DT` (`MedCare - Downtown Flagship`, uses `branch_code`) |
| [`fixtures/product.json`](./fixtures/product.json) | `ProductDto` | `MED-AUG-1000` (`Augmentin 1g Film-Coated Tablets`, 3 UOMs, native JSON numbers) |
| [`fixtures/inventory-balance.json`](./fixtures/inventory-balance.json) | `StockBalanceDto` | `MED-AUG-1000` in `MAIN-SELLABLE`, batch `MEDCARE-LOT-2601`, with `row_version` |
