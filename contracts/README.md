# PharmacyERP — Stage 1 (Live) + Stage 2 (Target) Frontend & Integration Contracts Package

> **Authoritative Parity Notice:**
> - **Stage 1 (`x-stage: 1`, 48 Live Endpoints, 76 Schemas):** Every endpoint, HTTP method, route parameter, `snake_case` query parameter, header, JSON property name, native JSON number type, nullability rule, string-only enum, RBAC policy, runtime-mode guard, and HTTP status code matches the live Stage 1 backend contract in [`../apps/erp-backend/contracts/openapi.v1.json`](../apps/erp-backend/contracts/openapi.v1.json) and [`../apps/erp-backend/contracts/README.md`](../apps/erp-backend/contracts/README.md) **100% verbatim** with zero regressions.
> - **Stage 2 (`x-stage: 2`, 18 Target Endpoints):** Appended strictly verbatim from the 4 reconciled Stage 2 backend task specifications (`ahmed-hassan.md`, `el-hosseiny.md`, `yassin.md`, `ahmed-salah.md`) for POS Sales Orders, Atomic Checkout, Invoices, Cash Payments, Returns/Refunds, Offline Sync, and Stage 2 Canonical Read APIs (**66 total endpoints**: `48` Stage 1 live + `18` Stage 2 target).
> - **ZERO Stage 3 Purchasing Scope:** Stage 3 (`suppliers`, `purchase-orders`, `supplier-payments`, `vendor-returns`) endpoints, schemas, and fixtures are intentionally excluded.

---

## Directory Index

| Path | Description | Status |
| --- | --- | --- |
| [`openapi.erp.yaml`](./openapi.erp.yaml) | Complete Stage 1 + Stage 2 OpenAPI 3.0.4 specification (**66 total endpoints**: **48 live Stage 1** + **18 target Stage 2** [`11` `erp-pos`, `4` `sync`, `3` `canonical`]), annotated with `x-stage` (`1` \| `2`), `x-surface` (`erp-pos` \| `sync` \| `canonical` on Stage 2), `x-runtime` (`Cloud` \| `BranchLocal` \| `Both`), and `x-roles` extensions. | Active (Stage 1 Live + Stage 2 Target) |
| [`FRONTEND.md`](./FRONTEND.md) | Complete Stage 1 + Stage 2 Frontend integration guide: runtime split, auth flows, `LoginResponse` vs flat `CurrentUserDto`, RBAC matrices, `Idempotency-Key`, `400` vs `422`, pagination, POS checkout/returns/sync/canonical rules, Stage 2 activation deltas, and QA seed references. | Active (Stage 1 + Stage 2) |
| [`schemas/`](./schemas/) | JSON Schema (Draft 2020-12) definitions covering all 76 live Stage 1 OpenAPI schemas (`common.json`, `auth.json`, `identity.json`, `catalog.json`, `inventory.json`, `canonical.json`), synced Stage 1 `api-error-envelope.schema.json` & `canonical-capabilities.schema.json`, plus Stage 2 `sales.json`, `sync.json`, and appended Stage 2 canonical read `$defs` in `canonical.json`. | Active (Stage 1 + Stage 2) |
| [`fixtures/`](./fixtures/) | Realistic JSON fixtures grounded in `FRONTEND_TEST_DATA_GUIDE.md` (`MEDCARE` seeded tenant): 6 untouched Stage 1 fixtures + 3 Stage 2 fixtures (`sales-order-draft.json`, `sales-invoice-completed.json`, `sales-return.json`) validating 100% against `openapi.erp.yaml` and `schemas/*.json`. | Active (Stage 1 + Stage 2) |
| `canonical/` | Reserved placeholder (`.gitkeep`) for standalone canonical event/document artifacts. Stage 1 & Stage 2 canonical HTTP schemas live in `schemas/canonical.json` and `schemas/canonical-capabilities.schema.json`. | Placeholder |
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
| [`schemas/canonical.json`](./schemas/canonical.json) | Stage 1: `CatalogConfigurationAction`, `CanonicalCapabilitiesDto`, `CanonicalUomConversionDto`, `CanonicalProductDto`, `CanonicalProductFeedPageDto`, `CanonicalUomItemDto`, `CanonicalProductConfigurationRequest`, `CanonicalReorderRuleConfigurationRequest`, `CanonicalWriteResultDto`, `CanonicalInventoryLotDto`, `CanonicalInventoryItemDto`, `CanonicalInventoryItemDtoPagedResult` · Stage 2 Appended: `CanonicalSaleLineDto`, `CanonicalSaleDto`, `CanonicalSaleDtoPagedResult`, `CanonicalSalesOrderLineDto`, `CanonicalSalesOrderDto`, `CanonicalSalesOrderDtoPagedResult`, `CanonicalSaleReturnLineDto`, `CanonicalSaleReturnDto`, `CanonicalSaleReturnDtoPagedResult` |
| [`schemas/sales.json`](./schemas/sales.json) | Stage 2 Sales Enums (`OrderChannel`, `SalesOrderStatus`, `SalesInvoiceStatus`, `SalesPaymentStatus`, `PaymentMethod`, `SalesReturnStatus`, `SalesRefundStatus`, `ReturnDisposition`), Draft Order DTOs (`CreateSalesOrderRequest`, `ReplaceSalesOrderLinesRequest`, `CancelSalesOrderRequest`, `SalesOrderDto`, `SalesOrderSummaryDto`, `SalesOrderSummaryDtoPagedResult`), Checkout DTOs (`CompleteSalesOrderRequest`, `CompleteSalesOrderResultDto`, `CompletedSaleLineDto`, `SalesPaymentDto`), Invoice DTOs (`SalesInvoiceDto`, `SalesInvoiceSummaryDto`, `SalesInvoiceSummaryDtoPagedResult`), and Return/Refund DTOs (`CreateSalesReturnRequest`, `SalesReturnDto`, `SalesRefundDto`, `SalesReturnSummaryDto`, `SalesReturnSummaryDtoPagedResult`, `SalesReturnDetailDto`) |
| [`schemas/sync.json`](./schemas/sync.json) | Stage 2 Sync Enums (`SyncOperationType`, `SyncProcessingStatus`, `SyncResultCode`, `SyncDeliveryOutcome`, `AuditActorType`), HTTP DTOs (`SyncOperationBatchRequest`, `SyncOperationBatchResponse`, `SyncOperationResultDto`, `RetrySyncOperationRequest`, `SyncBootstrapResponse` + bootstrap sub-DTOs, `SyncChangesResponse`, `SyncChangeItemDto`), and immutable versioned `v1` payloads (`SyncAuditFactDto`, `PostInventoryAdjustmentSyncPayloadV1`, `CompleteSalesOrderSyncPayloadV1`, `PostSalesReturnSyncPayloadV1`) |
| [`schemas/api-error-envelope.schema.json`](./schemas/api-error-envelope.schema.json) | Exact copy of Stage 1 `contracts/schemas/api-error-envelope.schema.json` *(adds `"SYNC_CURSOR_EXPIRED"` on Stage 2 launch)* |
| [`schemas/canonical-capabilities.schema.json`](./schemas/canonical-capabilities.schema.json) | Exact copy of Stage 1 `contracts/schemas/canonical-capabilities.schema.json` *(transitions to `"const": 2` on Stage 2 launch)* |

---

## Fixtures Summary (`fixtures/`)

| File | Stage | Schema | Seeded Reference (`FRONTEND_TEST_DATA_GUIDE.md`) |
| --- | :---: | --- | --- |
| [`fixtures/auth-token-pair.json`](./fixtures/auth-token-pair.json) | 1 | `LoginResponse` | `sarah.pharm@medcare.test` (`Pharmacist`, `ASSIGNED`, Downtown) |
| [`fixtures/current-user-context.json`](./fixtures/current-user-context.json) | 1 | `CurrentUserDto` | `admin@medcare.test` (`Admin`, `ALL`, flat `GET /api/v1/auth/me` payload) |
| [`fixtures/organization.json`](./fixtures/organization.json) | 1 | `OrganizationDto` | `MEDCARE` (`MedCare Wellness Pharmacies`, `enrollment_setup_state: "PENDING"`) |
| [`fixtures/branch.json`](./fixtures/branch.json) | 1 | `BranchDto` | `MED-DT` (`MedCare - Downtown Flagship`, uses `branch_code`) |
| [`fixtures/product.json`](./fixtures/product.json) | 1 | `ProductDto` | `MED-AUG-1000` (`Augmentin 1g Film-Coated Tablets`, 3 UOMs, native JSON numbers) |
| [`fixtures/inventory-balance.json`](./fixtures/inventory-balance.json) | 1 | `StockBalanceDto` | `MED-AUG-1000` in `MAIN-SELLABLE`, batch `MEDCARE-LOT-2601`, with `row_version` |
| [`fixtures/sales-order-draft.json`](./fixtures/sales-order-draft.json) | 2 | `SalesOrderDto` | `POS-MED-DT-0003` (`DRAFT` POS order by `Youssef Adel`, `MED-AUG-1000` 0% VAT + `MED-OMR-M3BP` 14% VAT) |
| [`fixtures/sales-invoice-completed.json`](./fixtures/sales-invoice-completed.json) | 2 | `SalesInvoiceDto` | `INV-MED-DT-0001` (`ISSUED`/`PAID`, full `CASH` payment `400.0`, change `64.0`, `MED-AUG-1000` + `MED-PAN-500X`) |
| [`fixtures/sales-return.json`](./fixtures/sales-return.json) | 2 | `SalesReturnDto` | `RET-MED-DT-0001` (`POSTED`/`REFUNDED`, partial `RESTOCK` return approved by `Dr. Sarah Nabil`, received by `Youssef Adel`) |

---

## Stage 2 Surface Overview (`18` Appended Endpoints — `66` Total)

All 18 Stage 2 endpoints preserve 100% Stage 1 wire continuity (`snake_case` JSON & query params, native JSON numbers, string-only enums, optional trailing `idempotency_key` + `Idempotency-Key` header precedence on the 5 POS mutating endpoints, `400` on missing key, `422` on out-of-range ERP pagination `page >= 1` / `1 <= page_size <= 200` with defaults `page=1`, `page_size=25`):

- **11 ERP/POS Sales & Returns Endpoints (`x-stage: 2`, `x-surface: erp-pos`):**
  - Draft Orders (`BranchLocal` writes, `Both` reads): `POST /api/v1/sales-orders` (`201 Created` + `Location`), `GET /api/v1/sales-orders`, `GET /api/v1/sales-orders/{id}`, `PUT /api/v1/sales-orders/{id}/lines`, `POST /api/v1/sales-orders/{id}/cancel`. Non-posting drafts never reserve or mutate stock; prices and tax rates are loaded strictly server-side.
  - Atomic POS Checkout (`BranchLocal`): `POST /api/v1/sales-orders/{id}/complete` (`200 OK` `CompleteSalesOrderResultDto`) — FEFO allocation (`expires_on > orgBusinessDate`, `NULL`/`NON-LOT` last), full `CASH` payment (`cash_tendered_amount >= grand_total`), base-UOM `SALE_ISSUE` ledger, immutable `SALES_INVOICE`, and `409 OUT_OF_STOCK` with affected-line `error.details` (`field: "lines[i].quantity"`).
  - Sales Invoices (`Both`): `GET /api/v1/sales-invoices`, `GET /api/v1/sales-invoices/{id}` (immutable except settlement projections `paid_amount`/`refunded_amount`/`payment_status`).
  - Sales Returns & Refunds (`BranchLocal` write, `Both` reads): `POST /api/v1/sales-returns` (`201 Created` + `Location` `SalesReturnDto`), `GET /api/v1/sales-returns`, `GET /api/v1/sales-returns/{id}` (`SalesReturnDetailDto`) — same invoice branch, 14-day window in `Organization.TimeZoneId`, distinct active `Admin`/`Pharmacist` approver when supplied, server-derived `SALE_ISSUE` batch splits, `RESTOCK`/`QUARANTINE`/`SCRAP` (dual `SALES_RETURN_IN` + `SCRAP_OUT` with `0` ending scrap balance), and §8.9.12 cent-residual cash refund rounding.
- **4 Offline Sync Endpoints (`x-stage: 2`, `x-surface: sync`, `Cloud`-only):**
  - Enrolled-branch routes (`security: []`, `X-Branch-Enrollment-Token` header verified against `BRANCH_ENROLLMENT.runtime_credential_hash`): `POST /api/v1/sync/operations`, `GET /api/v1/sync/bootstrap` (excludes stock balances & opening balances), `GET /api/v1/sync/changes` (`since_cursor`, `limit` `1..200`, `409 SYNC_CURSOR_EXPIRED`).
  - Authorized conflict retry (`Bearer`, `SyncAdminOnly` = `Admin` + `sync:retry` scope): `POST /api/v1/sync/operations/{operationId}/retry`.
- **3 Stage 2 Canonical Read Endpoints (`x-stage: 2`, `x-surface: canonical`, `Cloud`-only):**
  - `GET /api/v1/canonical/sales`, `GET /api/v1/canonical/orders`, `GET /api/v1/canonical/returns` — strictly read-only, non-PII, `CanonicalRead` policy (`Admin`, `Pharmacist`, `CanonicalReader`), unified `CanonicalOutboxCursor` `string? cursor` (`limit` default `100`, `1..1000`), uniform `PagedResult<T>`.

---

## Stage 2 Activation Deltas (Effective When `stage2-dev` Launches)

To guarantee **100% zero regression** against the live Stage 1 backend (`main`) today, all 48 Stage 1 OpenAPI operations, all 76 Stage 1 schemas, and all 6 Stage 1 fixtures remain untouched. The 4 planned Stage 1 → Stage 2 behavioral deltas below activate when `stage2-dev` launches:

| # | Area / Endpoint | Live Stage 1 (`main`) Today | Effective on Stage 2 Launch (`stage2-dev`) |
| :---: | :--- | :--- | :--- |
| **1** | **Error Codes** (`api-error-envelope.schema.json` / `common.json`) | 11 `ErrorCode` values + `INTERNAL_SERVER_ERROR` | Adds **`"SYNC_CURSOR_EXPIRED"`** (`HTTP 409 Conflict`, emitted by `GET /api/v1/sync/changes` when cursor expires; `AH-01`/`AH-06`). |
| **2** | **`GET /api/v1/canonical/capabilities`** (`canonical-capabilities.schema.json`) | `stage: 1`; `Cloud`: `supported_reads: ["products", "inventory"]`, `supported_writes: ["configuration.products", "configuration.reorder-rules"]`; `BranchLocal`: `[]` / `[]` | **`stage: 2`**; `Cloud`: `supported_reads: ["products", "inventory", "sales", "orders", "returns"]` (5 reads), `supported_writes` unchanged (2 writes, zero Stage 2 canonical writes); `BranchLocal`: stays `[]` / `[]` (`AS-07`). |
| **3** | **Stage 1 Canonical Unification** (`/canonical/products`, `/canonical/inventory`, `/canonical/configuration/*`) | `/products` returns `CanonicalProductFeedPageDto` (`limit` default `50`); `/inventory` accepts `int64 cursor`; config writes emit `CanonicalWriteResultDto.status: "APPLIED"`; `Admin,Pharmacist` only | All 5 canonical read feeds share unified `OUTBOX_EVENT.event_sequence` `string? cursor` + `PagedResult<T>` (`limit` default `100`, `1..1000`, `422` on malformed cursor) and `CanonicalRead` policy (`Admin`, `Pharmacist`, `.NET` `CanonicalReader` service token); config writes emit **`status: "succeeded"`** (`DTO-DIFF-034`) and remain `Admin,Pharmacist` only (`AS-05`..`AS-07`). |
| **4** | **Emitted JWT `scopes[]`** (`LoginResponse.user.scopes` & `GET /api/v1/auth/me`) | `Admin`: 5 scopes · `Pharmacist`: 3 scopes · `Cashier`: 3 scopes | Adds **`"return:read"`** and **`"return:write"`** to `Admin`, `Pharmacist`, and `Cashier`, plus **`"sync:retry"`** exclusively for `Admin` with `BranchScope.ALL` on `Cloud` (`AH-06`). |
