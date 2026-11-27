# PharmacyERP — Stage 1 (Live) + Stage 2 (Target) Frontend ↔ Backend Integration Guide

> **Authoritative Source:**
> - **Stage 1 (`x-stage: 1`, 48 Live Endpoints):** Matches the live Stage 1 backend contract in [`../apps/erp-backend/contracts/openapi.v1.json`](../apps/erp-backend/contracts/openapi.v1.json), [`../apps/erp-backend/contracts/README.md`](../apps/erp-backend/contracts/README.md), and [`../apps/erp-backend/FRONTEND_TEST_DATA_GUIDE.md`](../apps/erp-backend/FRONTEND_TEST_DATA_GUIDE.md) **100% verbatim**.
> - **Stage 2 (`x-stage: 2`, 18 Target Endpoints):** Appended verbatim from the 4 reconciled Stage 2 backend specs (`ahmed-hassan.md`, `el-hosseiny.md`, `yassin.md`, `ahmed-salah.md`) covering POS Sales Orders, Atomic Checkout, Invoices, Cash Payments, Sales Returns/Refunds, Offline Sync, and Stage 2 Canonical Read APIs (**66 total endpoints**: `48` live Stage 1 + `18` target Stage 2).
> - **ZERO Stage 3 Purchasing Scope:** Stage 3 (`suppliers`, `purchase-orders`, `supplier-payments`, `vendor-returns`) is excluded.

---

## 1. Package Layout & Client Type Generation

| Path | Contents |
| --- | --- |
| [`openapi.erp.yaml`](./openapi.erp.yaml) | Combined Stage 1 (Live) + Stage 2 (Target) OpenAPI 3.0.4 specification — **66 total endpoints** (**48 live Stage 1** + **18 target Stage 2** [`11` `erp-pos`, `4` `sync`, `3` `canonical`]), annotated with `x-stage`, `x-surface` (on Stage 2), `x-runtime`, and `x-roles`. |
| [`schemas/*.json`](./schemas/) | Draft 2020-12 JSON Schema definitions: Stage 1 (`common.json`, `auth.json`, `identity.json`, `catalog.json`, `inventory.json`, `canonical.json`, `api-error-envelope.schema.json`, `canonical-capabilities.schema.json`) + Stage 2 (`sales.json`, `sync.json`, and Stage 2 canonical read `$defs` appended in `canonical.json`). |
| [`fixtures/*.json`](./fixtures/) | Mock/test payloads matching DTO shapes and `MEDCARE` seeded IDs from `FRONTEND_TEST_DATA_GUIDE.md`: 6 untouched Stage 1 fixtures + 3 Stage 2 fixtures (`sales-order-draft.json`, `sales-invoice-completed.json`, `sales-return.json`). |

- Generate frontend TypeScript types into `apps/erp-frontend/src/types/generated` directly from `openapi.erp.yaml` and `schemas/*.json`. Never hand-write divergent DTO types.

---

## 2. Runtime Split (`ERP_RUNTIME_MODE`: `Cloud` vs `BranchLocal`)

Enforced by `RuntimeModeGuardMiddleware` **before authentication and authorization**. Calling a route unavailable in the active runtime returns **`404 NOT_FOUND`** (`ApiErrorEnvelopeDto`) — never `405`. Gate UI actions using `runtime_mode` from `LoginResponse.user` or `GET /api/v1/auth/me` (or `GET /api/v1/canonical/capabilities`).

| Route / Route Group | `Cloud` | `BranchLocal` | Notes |
| --- | :---: | :---: | --- |
| `GET /.well-known/jwks.json` | ✅ | ✅ | Public RS256 JWKS (`application/jwk-set+json`) |
| `POST /api/v1/auth/login`, `/refresh`, `/logout`, `GET /api/v1/auth/me` | ✅ | ✅ | **Auth IS allowed on `BranchLocal`** (branch-locked to `ENROLLED_BRANCH_ID`) |
| `GET /api/v1/canonical/capabilities` | ✅ | ✅ | Public. `Cloud`: `reads: 2, writes: 2`; `BranchLocal`: `reads: [], writes: []` |
| `POST /api/v1/organizations` | ✅ | ❌ (`404`) | `PlatformProvisionerOnly` |
| `POST /api/v1/branch-enrollment` | ✅ | ❌ (`404`) | Public single-use enrollment token redemption |
| `GET /api/v1/branches`, `GET /api/v1/branches/{id}` | ✅ | ✅ | All 3 roles within authorized branches |
| `POST /api/v1/branches`, `PATCH /api/v1/branches/{id}`, `POST /api/v1/branches/{branchId}/enrollment-tokens` | ✅ | ❌ (`404`) | Cloud administration only |
| `GET /api/v1/users`, `GET /api/v1/users/{id}`, `GET /api/v1/employees`, `GET /api/v1/employees/{id}` | ✅ | ✅ | `AdminOnly` (+ hierarchy / branch scope) |
| `POST/PATCH /api/v1/users*`, `POST /api/v1/users/{id}/password-reset`, `POST /api/v1/users/{id}/revoke-sessions`, `POST/PATCH /api/v1/employees*` | ✅ | ❌ (`404`) | Cloud administration only |
| `GET /api/v1/product-categories*`, `GET /api/v1/products*`, `GET /api/v1/branches/{branchId}/products/{productId}/reorder-rule` | ✅ | ✅ | All 3 roles (reorder rule requires branch access) |
| `POST/PATCH /api/v1/product-categories*`, `POST/PATCH /api/v1/products*`, `PUT /api/v1/branches/{branchId}/products/{productId}/reorder-rule` | ✅ | ❌ (`404`) | `Admin,Pharmacist` on Cloud |
| `GET/POST/PATCH /api/v1/inventory/locations*` | ✅ | ✅ | Reads: all 3 roles; Writes: `Admin,Pharmacist` |
| `GET /api/v1/inventory/batches`, `/balances`, `/summary` | ✅ | ✅ | All 3 roles (`batches` is org-scoped; `balances`/`summary` branch-scoped) |
| `GET /api/v1/inventory/transactions` | ✅ | ✅ | `Admin,Pharmacist` only (`Cashier` -> `403 FORBIDDEN`) |
| `POST /api/v1/inventory/adjustments` | ❌ (`404`) | ✅ | **`BranchLocal`-only**; `Admin,Pharmacist` + branch access |
| `GET /api/v1/canonical/products`, `GET /api/v1/canonical/inventory`, `POST /api/v1/canonical/configuration/products`, `PUT /api/v1/canonical/configuration/reorder-rules` | ✅ | ❌ (`404`) | External/Brain boundary; `Admin,Pharmacist` only (`Cashier` -> `403 FORBIDDEN`) |

---

## 3. Authentication, `LoginResponse` vs Flat `/auth/me`, & Emitted Scopes

### 3.1 `POST /api/v1/auth/login` & `POST /api/v1/auth/refresh` -> `LoginResponse`
Both endpoints return `LoginResponse`:
```json
{
  "access_token": "<rs256-jwt>",
  "access_token_expires_at": "2026-11-25T18:15:00+00:00",
  "refresh_token": "<b64url-32-bytes>",
  "user": {
    "user_id": "11111111-4444-4111-8111-000000000001",
    "employee_id": "11111111-3333-4111-8111-000000000001",
    "organization_id": "11111111-1111-4111-8111-111111111101",
    "username": "admin@medcare.test",
    "role": "Admin",
    "branch_scope": "ALL",
    "branch_ids": [],
    "scopes": ["user:admin", "inventory:read", "inventory:write", "sales:read", "sales:write"],
    "runtime_mode": "Cloud"
  },
  "token_type": "Bearer",
  "issuer": "PharmacyERP",
  "audience": "PharmacyERP.Api",
  "key_id": "<32-hex>"
}
```
- Access token TTL: `15 minutes` (`Cloud`) / `24 hours` (`BranchLocal`). Clock skew: `30s`.
- Refresh token TTL: `30 days`, rotated on every `/auth/refresh`. Reusing an already-consumed refresh token revokes the entire token family and returns `401 UNAUTHORIZED`.
- `POST /api/v1/auth/logout` requires `[Authorize]` + `{ "refresh_token": "..." }` and returns `204 No Content`.
- Inactive or locked users receive `403 FORBIDDEN` on `/auth/login` (checked before password verification). `5` consecutive bad passwords lock the account for `15 minutes`.
- Password creation/reset minimum length is **`12` characters**.

### 3.2 `GET /api/v1/auth/me` -> Flat `CurrentUserDto`
Returns **`CurrentUserDto` directly at the root** (exact same 9 fields as `LoginResponse.user` — no nested `user` wrapper, no `issuance_context`, no `terminal_id`):
`user_id`, `employee_id`, `organization_id`, `username`, `role`, `branch_scope`, `branch_ids`, `scopes`, `runtime_mode`.

- **`BranchLocal` Scope Downgrade:** In `BranchLocal` mode, even an `ALL`-scope Org Admin receives `branch_scope: "ASSIGNED"`, `branch_ids: [ENROLLED_BRANCH_ID]`, and `runtime_mode: "BranchLocal"` in both `LoginResponse.user` and `GET /api/v1/auth/me`. Non-`ALL` users without access to `ENROLLED_BRANCH_ID` receive `403 FORBIDDEN_BRANCH` on login/refresh.

### 3.3 Exact Emitted JWT `scopes[]` per Role (Stage 1 Closed Vocabulary)

| Role | Exact Emitted `scopes[]` | Important Notes |
| --- | --- | --- |
| `Admin` | `["user:admin", "inventory:read", "inventory:write", "sales:read", "sales:write"]` | Does **not** emit `branch:admin` or `employee:admin`. |
| `Pharmacist` | `["inventory:read", "inventory:write", "sales:read"]` | **Excludes `sales:write`**; denied (`403`) on `/employees`. |
| `Cashier` | `["inventory:read", "sales:read", "sales:write"]` | Denied (`403`) on `/employees`, `/inventory/transactions`, `/canonical/inventory`, and all catalog/inventory writes. |

---

## 4. Stage 1 RBAC Matrix

| Endpoint / Capability | `Admin` | `Pharmacist` | `Cashier` | Scope / Notes |
| --- | :---: | :---: | :---: | --- |
| `POST /api/v1/organizations` | ❌ | ❌ | ❌ | `PlatformProvisioner` role only (`Cloud`) |
| `GET /api/v1/branches`, `GET /api/v1/branches/{id}` | ✅ | ✅ | ✅ | Filtered / checked by authorized branches |
| `POST /api/v1/branches` | ✅ (`ALL` only) | ❌ | ❌ | `OrgAdminOnly` (`Cloud`) |
| `PATCH /api/v1/branches/{id}`, `POST .../enrollment-tokens` | ✅ | ❌ | ❌ | `AdminOnly` + branch access (`is_active` requires `ALL`) (`Cloud`) |
| `GET/POST/PATCH /api/v1/users*`, `password-reset`, `revoke-sessions` | ✅ | ❌ | ❌ | `AdminOnly` + hierarchical rules (cannot modify own `role`/`branch_scope`/`is_active`) |
| `GET/POST/PATCH /api/v1/employees*` | ✅ | ❌ (`403`) | ❌ (`403`) | **`AdminOnly`** + branch scope (`GET` Both; `POST/PATCH` Cloud) |
| `GET /api/v1/product-categories*`, `GET /api/v1/products*`, `GET /api/v1/products/{id}/uoms` | ✅ | ✅ | ✅ | Both runtimes (`GET .../uoms` defaults `include_inactive=false`) |
| `POST/PATCH /api/v1/product-categories*`, `POST/PATCH /api/v1/products*`, `POST/PATCH /api/v1/products/{id}/uoms*` | ✅ | ✅ | ❌ (`403`) | `Cloud`-only |
| `GET /api/v1/branches/{branchId}/products/{productId}/reorder-rule` | ✅ | ✅ | ✅ | Direct `ReorderRuleDto` (no `{ rule }` wrapper) + branch access |
| `PUT /api/v1/branches/{branchId}/products/{productId}/reorder-rule` | ✅ | ✅ | ❌ (`403`) | `Cloud`-only + branch access |
| `GET /api/v1/inventory/locations` | ✅ | ✅ | ✅ | Branch access required (`branch_id` required query param) |
| `POST/PATCH /api/v1/inventory/locations*` | ✅ | ✅ | ❌ (`403`) | Both runtimes + branch access |
| `GET /api/v1/inventory/batches` | ✅ | ✅ | ✅ | Org-scoped (no `branch_id` filter) |
| `GET /api/v1/inventory/balances`, `GET /api/v1/inventory/summary` | ✅ | ✅ | ✅ | Branch access required (`balances` is `PagedResult<StockBalanceDto>` with `row_version`) |
| `GET /api/v1/inventory/transactions` | ✅ | ✅ | ❌ (`403`) | Protects `unit_cost_base`; branch access required |
| `POST /api/v1/inventory/adjustments` | ✅ | ✅ | ❌ (`403`) | **`BranchLocal`-only** (`Cloud` returns `404`); supports `OPENING_BALANCE`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `REVERSAL` |
| `GET /api/v1/canonical/products`, `GET /api/v1/canonical/inventory`, `POST/PUT /api/v1/canonical/configuration/*` | ✅ | ✅ | ❌ (`403`) | `Cloud`-only; external/Brain contract |

---

## 5. Wire Conventions, Pagination & `Idempotency-Key`

### 5.1 Wire Format & Numeric Serialization
- **Strict `snake_case`** for all JSON properties and query parameters (`include_inactive`, `page`, `page_size`, `branch_id`, `expiring_before`, `updated_since`).
- **Native JSON `number`** for all decimals (`tax_rate`, `conversion_to_base`, `sale_unit_price`, `on_hand_qty_base`, `available_qty_base`, `average_unit_cost`, `entered_qty`, `unit_cost_entered`, `unit_cost_base`, `reorder_point_base`, `reorder_quantity_base`, `max_quantity_base`). **Never send string-encoded decimals.**
- **String-only enums:** Integer enum values are rejected with `422 VALIDATION_ERROR`.
  - `LocationType`: `"SELLABLE"`, `"QUARANTINE"`, `"DAMAGED"`, `"SCRAP"` (`is_sellable: true` allowed only for `"SELLABLE"`).
  - `BatchQualityStatus`: `"AVAILABLE"`, `"QUARANTINED"`, `"EXPIRED"`, `"RECALLED"`.
  - `InventoryTransactionType`: `"OPENING_BALANCE"`, `"ADJUSTMENT_IN"`, `"ADJUSTMENT_OUT"`, `"SALE_ISSUE"`, `"SALES_RETURN_IN"`, `"PURCHASE_RECEIPT"`, `"VENDOR_RETURN_OUT"`, `"SCRAP_OUT"`, `"REVERSAL"` (`POST /inventory/adjustments` accepts only `OPENING_BALANCE`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `REVERSAL`).
  - `InventoryTransactionStatus`: `"DRAFT"`, `"POSTED"`, `"CANCELLED"`.
- **Trace headers:** Attach W3C `traceparent` (or `X-Trace-Id`); echoed in response headers and `error.trace_id`.

### 5.2 Pagination Rules
- **Standard ERP Lists (`PagedResult<T>`):** `{ "items": T[], "page": int, "page_size": int, "total_count": int, "next_cursor": string | null }`.
  - Query params: `page` (default `1`, min `1`), `page_size` (default `25`, `1..200`). Out-of-range values return **`422 VALIDATION_ERROR`**.
  - Applies to: `GET /branches`, `/users`, `/employees`, `/product-categories`, `/products`, `/inventory/locations`, `/inventory/batches`, `/inventory/balances`, `/inventory/transactions`.
- **Unpaginated ERP List:** `GET /api/v1/products/{id}/uoms` returns raw `ProductUomDto[]` (`include_inactive` defaults to `false`).
- **Canonical Lists:** `GET /api/v1/canonical/products` (`cursor`, `limit` default `50`, `1..1000`, returns `CanonicalProductFeedPageDto`) and `GET /api/v1/canonical/inventory` (`cursor`, `limit` default `100`, `1..1000`, returns `PagedResult<CanonicalInventoryItemDto>`).

### 5.3 `Idempotency-Key` Rules
- **17 body-bearing mutating endpoints:** Accept `Idempotency-Key` HTTP header **or** optional `idempotency_key` JSON body property (maxLength `100`). If both are supplied, the trimmed HTTP header wins.
- **2 bodyless mutating endpoints:** `POST /api/v1/branches/{branchId}/enrollment-tokens` and `POST /api/v1/users/{id}/revoke-sessions` **require** the `Idempotency-Key` HTTP header.
- **Exempt:** `POST /api/v1/auth/login`, `/auth/refresh`, `/auth/logout`, and `POST /api/v1/branch-enrollment`.
- **Responses:**
  - Missing in both header and body -> **`400 MALFORMED_REQUEST`** (`details: [{ "field": "Idempotency-Key", "issue": "The idempotency key is required." }]`).
  - Length `> 100` -> **`422 VALIDATION_ERROR`** (`field: "idempotency_key"`).
  - Same key + identical payload hash -> replays original response (`200`/`201`/`204`).
  - Same key + different payload hash -> **`409 IDEMPOTENCY_MISMATCH`**.

### 5.4 `POST /api/v1/inventory/adjustments` (`BranchLocal`-only)
- Line inputs use `batch_number` (not `batch_id`), optional `manufactured_on`, `expires_on`, `entered_qty`, and `unit_cost_entered` (required & `>= 0` for `OPENING_BALANCE` and `ADJUSTMENT_IN`).
- For `transaction_type: "REVERSAL"`, provide `reverses_inventory_txn_id`; both `lines` and `reason_code` are optional and may be omitted.
- Returns `201 Created` + `Location: /api/v1/inventory/transactions/{inventory_txn_id}` with base-UOM normalized `InventoryTxnLineDto[]`.

---

## 6. Error Contract (`400` vs `422` & All Error Codes)

Every error response returns `ApiErrorEnvelopeDto`:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more validation errors occurred. Please check the request details.",
    "details": [
      { "field": "lines[0].entered_qty", "issue": "EnteredQty must be greater than zero." }
    ],
    "trace_id": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
  }
}
```

### `400` vs `422` Boundary
- **`400 MALFORMED_REQUEST`**: Invalid JSON syntax, empty/null body, or missing `Idempotency-Key`.
- **`422 VALIDATION_ERROR`**: Valid JSON syntax failing type conversion (including integer enum values), data-annotation constraints (`[Required]`, `[StringLength]`, `[MinLength]`, `[EmailAddress]`), pagination bounds, or domain validation. `details[].field` uses wire `snake_case` paths.

| `error.code` | HTTP | When Emitted / FE Handling |
| --- | :---: | --- |
| `MALFORMED_REQUEST` | **400** | Broken JSON, empty body, or missing `Idempotency-Key`. Fix request serialization/header. |
| `UNAUTHORIZED` | **401** | Missing/invalid/expired/revoked JWT, failed security stamp, bad credentials, invalid/reused refresh token, or invalid/expired/used enrollment token. Refresh or re-login. |
| `FORBIDDEN` | **403** | Role/policy denial, inactive or locked account at login, hierarchical user-management violation, or `organization_id` mismatch on `/canonical/inventory`. |
| `FORBIDDEN_BRANCH` | **403** | Target `branch_id` outside user's authorized branches (or `BranchLocal` login by unassigned user). |
| `NOT_FOUND` | **404** | Missing entity (including cross-tenant RLS isolation) **or** route blocked by current `ERP_RUNTIME_MODE`. |
| `CONFLICT` | **409** | Duplicate unique key, historical UOM/lot-tracking lock, base UOM deactivation lock, or optimistic concurrency (`row_version`). |
| `INVALID_STATE_TRANSITION` | **409** | `OPENING_BALANCE` on existing stock/history, or `REVERSAL` of non-`POSTED`/already-reversed/`REVERSAL` txn. |
| `OUT_OF_STOCK` | **409** | `ADJUSTMENT_OUT` or outbound `REVERSAL` exceeding `on_hand_qty_base`. |
| `IDEMPOTENCY_MISMATCH` | **409** | Same `Idempotency-Key` reused with a different payload. Generate a fresh key for a new request. |
| `VALIDATION_ERROR` | **422** | Field, type, enum, pagination, or domain invariant validation failure. Map `details[].field` to form controls. |
| `EXPIRY_POLICY_VIOLATION` | **422** | Expiry/shelf-life policy violation. |
| `INTERNAL_SERVER_ERROR` | **500** | Unhandled server exception. Retry safely with the same `Idempotency-Key`. |

*(Note: `410 GONE` does not exist in Stage 1.)*

---

## 7. Local QA & Seeded Test Data

See [`../apps/erp-backend/FRONTEND_TEST_DATA_GUIDE.md`](../apps/erp-backend/FRONTEND_TEST_DATA_GUIDE.md) for deterministic multi-tenant seed credentials (`MEDCARE`, `ALNOUR`, `GREENLEAF`), branch IDs, enrollment tokens, location IDs, SKU/barcode/UOM test cases, and copy-paste `BranchLocal` adjustment and reversal payloads.

---

## 8. Stage 2 — POS Sales, Checkout, Invoices, Returns, Offline Sync & Canonical Reads (`18` Endpoints)

All Stage 2 endpoints follow the exact same Stage 1 wire conventions: strict `snake_case` JSON properties, query parameters, and `error.details[].field` paths; native JSON numbers for all prices, quantities, taxes, costs, and totals; string-only enums (`allowIntegerValues: false`); optional trailing `idempotency_key` body field + `Idempotency-Key` HTTP header precedence (`400 MALFORMED_REQUEST` if absent in both, `422` if `> 100` chars, `409 IDEMPOTENCY_MISMATCH` on hash conflict); and uniform ERP pagination (`page = 1`, `page_size = 25`, valid bounds `page >= 1` & `1 <= page_size <= 200`, `422 VALIDATION_ERROR` on out-of-range values).

### 8.1 Stage 2 Runtime Split & RBAC Matrix

| Endpoint (`x-stage: 2`) | Surface | `Cloud` | `BranchLocal` | Auth / Policy / Roles | Success |
| --- | :---: | :---: | :---: | --- | --- |
| `POST /api/v1/sales-orders` | `erp-pos` | ❌ (`404`) | ✅ | `PosCashierOrAdmin` (`Cashier`, `Admin`) + branch + `Idempotency-Key` | `201 Created` `SalesOrderDto` + `Location` |
| `GET /api/v1/sales-orders` | `erp-pos` | ✅ | ✅ | `SalesReadAccess` (`Admin`, `Pharmacist`, `Cashier`) + branch | `200 OK` `PagedResult<SalesOrderSummaryDto>` |
| `GET /api/v1/sales-orders/{id}` | `erp-pos` | ✅ | ✅ | `SalesReadAccess` + branch | `200 OK` `SalesOrderDto` |
| `PUT /api/v1/sales-orders/{id}/lines` | `erp-pos` | ❌ (`404`) | ✅ | `PosCashierOrAdmin` + branch + `Idempotency-Key` | `200 OK` `SalesOrderDto` |
| `POST /api/v1/sales-orders/{id}/complete` | `erp-pos` | ❌ (`404`) | ✅ | `PosCashierOrAdmin` + branch + `Idempotency-Key` | `200 OK` `CompleteSalesOrderResultDto` |
| `POST /api/v1/sales-orders/{id}/cancel` | `erp-pos` | ❌ (`404`) | ✅ | `PosCashierOrAdmin` + branch + `Idempotency-Key` | `200 OK` `SalesOrderDto` |
| `GET /api/v1/sales-invoices` | `erp-pos` | ✅ | ✅ | `SalesReadAccess` + branch | `200 OK` `PagedResult<SalesInvoiceSummaryDto>` |
| `GET /api/v1/sales-invoices/{id}` | `erp-pos` | ✅ | ✅ | `SalesReadAccess` + branch | `200 OK` `SalesInvoiceDto` |
| `POST /api/v1/sales-returns` | `erp-pos` | ❌ (`404`) | ✅ | `SalesReturnWriteAccess` (`Cashier`, `Pharmacist`, `Admin`) + branch + `Idempotency-Key` | `201 Created` `SalesReturnDto` + `Location` |
| `GET /api/v1/sales-returns` | `erp-pos` | ✅ | ✅ | `SalesReadAccess` + branch | `200 OK` `PagedResult<SalesReturnSummaryDto>` |
| `GET /api/v1/sales-returns/{id}` | `erp-pos` | ✅ | ✅ | `SalesReadAccess` + branch | `200 OK` `SalesReturnDetailDto` |
| `POST /api/v1/sync/operations` | `sync` | ✅ | ❌ (`404`) | `security: []` + `X-Branch-Enrollment-Token` header | `200 OK` `SyncOperationBatchResponse` |
| `POST /api/v1/sync/operations/{operationId}/retry` | `sync` | ✅ | ❌ (`404`) | `SyncAdminOnly` (`Admin` + `sync:retry` scope) + branch | `200 OK` `SyncOperationResultDto` |
| `GET /api/v1/sync/bootstrap` | `sync` | ✅ | ❌ (`404`) | `security: []` + `X-Branch-Enrollment-Token` header | `200 OK` `SyncBootstrapResponse` |
| `GET /api/v1/sync/changes` | `sync` | ✅ | ❌ (`404`) | `security: []` + `X-Branch-Enrollment-Token` header | `200 OK` `SyncChangesResponse` (`409 SYNC_CURSOR_EXPIRED`) |
| `GET /api/v1/canonical/sales` | `canonical` | ✅ | ❌ (`404`) | `CanonicalRead` (`Admin`, `Pharmacist`, `CanonicalReader`) + branch | `200 OK` `PagedResult<CanonicalSaleDto>` |
| `GET /api/v1/canonical/orders` | `canonical` | ✅ | ❌ (`404`) | `CanonicalRead` + branch | `200 OK` `PagedResult<CanonicalSalesOrderDto>` |
| `GET /api/v1/canonical/returns` | `canonical` | ✅ | ❌ (`404`) | `CanonicalRead` + branch | `200 OK` `PagedResult<CanonicalSaleReturnDto>` |

### 8.2 POS Draft Orders & Server-Authoritative Pricing
- `POST /api/v1/sales-orders` and `PUT /api/v1/sales-orders/{id}/lines` accept only `product_id`, `product_uom_id`, and `entered_qty` per line (**never** client-supplied prices, discounts, tax rates, or totals).
- The server loads authoritative `PRODUCT_UOM.sale_unit_price` (`is_sellable = true`) and `PRODUCT.tax_rate`, computing `quantity_base`, `tax_amount_snapshot`, and `line_total` using `MidpointRounding.AwayFromZero`.
- Draft orders (`DRAFT`) are non-posting: they **never** reserve or deduct `STOCK_BALANCE` and never write `SYNC_OUTBOX`.
- Calling `PUT .../lines` or `POST .../cancel` on a `COMPLETED` or `CANCELLED` order returns **`409 INVALID_STATE_TRANSITION`**.

### 8.3 Atomic POS Checkout (`POST /api/v1/sales-orders/{id}/complete`)
- Request body: `{ "cash_tendered_amount": number, "method": "CASH", "note": string | null, "idempotency_key"?: string | null }` + optional `Idempotency-Key` header.
- **Full Cash Settlement Only:** `cash_tendered_amount` must be `>= grand_total` (max 2 decimal places); partial payments or unpaid credit return **`422 VALIDATION_ERROR`** (`field: "cash_tendered_amount"`).
- **FEFO Allocation:** Server allocates eligible sellable batches (`quality_status == "AVAILABLE"`, `expires_on IS NULL OR expires_on > orgBusinessDate` in `Organization.TimeZoneId`) ordered by `expires_on ASC`, `batch_id ASC`, `location_id ASC` with `NULL`/`NON-LOT` batches last.
- **Stock Shortage (`409 OUT_OF_STOCK`):** If any line lacks sufficient eligible sellable stock, the entire checkout rolls back and returns **`409 OUT_OF_STOCK`** with `error.details[]` listing every affected line using `field: "lines[i].quantity"`.
- **Single Atomic Commit:** Marks order `COMPLETED`, issues immutable `SALES_INVOICE` (`ISSUED`/`PAID`), records `SALES_PAYMENT`, posts base-UOM `SALE_ISSUE` `INVENTORY_TXN`, logs audit, and enqueues outbox + `SYNC_OUTBOX` (`COMPLETE_SALES_ORDER`).

### 8.4 Sales Invoices (`GET /api/v1/sales-invoices*`)
- Filter query params: `branch_id`, `invoice_no`, `payment_status` (`PAID` | `PARTIALLY_REFUNDED` | `REFUNDED`), `from_date`, `to_date`, `page` (`1`), `page_size` (`25`, `1..200`).
- Issued invoices are immutable except for settlement projections (`paid_amount`, `refunded_amount`, `payment_status`) updated when returns/refunds post. Detail view (`SalesInvoiceDto`) preserves deactivated products, UOMs, and employees.

### 8.5 Sales Returns & Refunds (`POST /api/v1/sales-returns`, `GET /api/v1/sales-returns*`)
- Request body: `{ "invoice_id", "reason_code", "lines": [{ "invoice_line_id", "quantity_base", "disposition": "RESTOCK" | "QUARANTINE" | "SCRAP" }], "approved_by_employee_id"?: uuid | null, "refund_method"?: "CASH", "issue_cash_refund"?: true, "idempotency_key"?: string | null }`.
- **Never send `batch_id` or `destination_location_id`:** Server derives batch splits from the original posted `SALE_ISSUE` ledger lines and selects branch destination locations (`MAIN-SELLABLE` / original sellable location for `RESTOCK`, `MAIN-QUARANTINE` for `QUARANTINE`, `MAIN-SCRAP` for `SCRAP`).
- **14-Day Return Window:** Evaluated in `Organization.TimeZoneId` (`currentBusinessDate <= issuedBusinessDate.AddDays(14)`); expired invoices fail with **`422 VALIDATION_ERROR`** (`field: "invoice_id"`). Must be processed at the original invoice branch (`403 FORBIDDEN_BRANCH` otherwise).
- **Distinct Approver Policy:** When `approved_by_employee_id` is provided, it must differ from the receiving employee (`422` `field: "approved_by_employee_id"` on self-approval) and must reference an active `Admin` or `Pharmacist` authorized for the invoice branch (`403 FORBIDDEN` otherwise).
- **Dispositions & §8.9.12 Cent-Residual Refunds:** `RESTOCK` restores stock at the original sale `unit_cost_base`; `QUARANTINE` receives into non-sellable quarantine; `SCRAP` atomically posts `SALES_RETURN_IN` (+qty) and `SCRAP_OUT` (-qty) so `MAIN-SCRAP` ending balance returns to `0`. Partial refunds are proportional to tax-inclusive `line_total`, assigning any cent residual to the final returned unit so cumulative refunds equal `line_total` exactly.
- `GET /api/v1/sales-returns` filters by `branch_id`, `invoice_id`, `from_date`, `to_date`, `page` (`1`), `page_size` (`25`, `1..200`). `GET /api/v1/sales-returns/{id}` returns `SalesReturnDetailDto` (including `stock_movements[]` and `refunds[]`).

### 8.6 Offline Sync (`POST/GET /api/v1/sync/*`, `Cloud`-only)
- `POST /api/v1/sync/operations`, `GET /api/v1/sync/bootstrap`, and `GET /api/v1/sync/changes` use **`security: []`** and require the **`X-Branch-Enrollment-Token`** HTTP header (redeemed runtime credential verified against `identity."BRANCH_ENROLLMENT".runtime_credential_hash`; invalid/expired/inactive -> `401 UNAUTHORIZED`, branch mismatch -> `403 FORBIDDEN_BRANCH`).
- `GET /api/v1/sync/bootstrap?branch_id=...` delivers reference/catalog/pricing/tax/authorized-branch-identity snapshots and **explicitly excludes stock balances, inventory transactions, and opening balances**.
- `GET /api/v1/sync/changes?branch_id=...&since_cursor=...&limit=100` (`limit` `1..200`) streams commit-ordered `OUTBOX_EVENT.event_sequence` changes and returns **`409 SYNC_CURSOR_EXPIRED`** when `since_cursor` falls behind the retention floor (triggering controlled `/sync/bootstrap` resnapshot).
- `POST /api/v1/sync/operations/{operationId}/retry` requires Bearer JWT with **`SyncAdminOnly`** (`Admin` role + `sync:retry` scope) + `reason` (`3..500` chars) to retry a head-of-line `CONFLICT` inbox item without editing its stored payload.

### 8.7 Stage 2 Canonical Read Feeds (`GET /api/v1/canonical/sales|orders|returns`, `Cloud`-only)
- Strictly **read-only** and **non-PII** (zero customer, delivery, reservation, terminal, or employee email/phone fields).
- Query parameters: `organization_id` (must match token tenant or `403 FORBIDDEN`), `branch_id`, `from_date`, `to_date`, `updated_since`, `cursor` (opaque Base64Url `CanonicalOutboxCursor`; malformed -> `422` `field: "cursor"`), `limit` (default `100`, clamped `1..1000`).
- Authorized via **`CanonicalRead`** (`Admin`, `Pharmacist`, or short-lived `.NET` `CanonicalReader` service token; `Cashier` receives `403 FORBIDDEN`).

---

## 9. Stage 2 Activation Deltas (Effective When `stage2-dev` Launches)

All 48 Stage 1 endpoints, 76 Stage 1 schemas, and 6 Stage 1 fixtures in this package remain **100% compatible with the live Stage 1 backend (`main`) today**. When `stage2-dev` launches, the following 4 Stage 1 → Stage 2 evolutions take effect on the live API:

| # | Contract Area | Live Stage 1 (`main`) Behavior | Effective When `stage2-dev` Launches |
| :---: | :--- | :--- | :--- |
| **1** | **Error Codes** (`ApiErrorEnvelopeDto.error.code`) | 11 `ErrorCode` values + `INTERNAL_SERVER_ERROR` | Adds **`"SYNC_CURSOR_EXPIRED"`** (`HTTP 409 Conflict`) for expired pull cursors on `GET /api/v1/sync/changes` (`AH-01`, `AH-06`). |
| **2** | **`GET /api/v1/canonical/capabilities`** | `stage: 1`; `Cloud`: `2` reads (`products`, `inventory`), `2` writes (`configuration.products`, `configuration.reorder-rules`); `BranchLocal`: `[]` / `[]` | **`stage: 2`**; `Cloud`: **`5` reads** (`products`, `inventory`, `sales`, `orders`, `returns`), `2` writes (unchanged — zero Stage 2 canonical writes); `BranchLocal`: stays `[]` / `[]` (`AS-07`). |
| **3** | **Stage 1 Canonical Unification** (`/canonical/products`, `/canonical/inventory`, `/canonical/configuration/*`) | `/products` returns `CanonicalProductFeedPageDto` (`limit=50`); `/inventory` takes `int64 cursor`; config writes return `status: "APPLIED"`; `Admin,Pharmacist` only | All 5 canonical reads unify onto **`OUTBOX_EVENT.event_sequence` `string? cursor` + `PagedResult<T>`** (`limit=100`, `1..1000`, `422` on malformed cursor) under `CanonicalRead` (`Admin`, `Pharmacist`, `CanonicalReader`); config writes return **`status: "succeeded"`** (`DTO-DIFF-034`) and remain `Admin,Pharmacist` only (`AS-05`..`AS-07`). |
| **4** | **Emitted JWT `scopes[]`** (`LoginResponse.user.scopes` & `GET /api/v1/auth/me`) | `Admin` (5), `Pharmacist` (3), `Cashier` (3) | Adds **`"return:read"`** and **`"return:write"`** to `Admin`, `Pharmacist`, and `Cashier`, plus **`"sync:retry"`** exclusively for `Admin` (`BranchScope.ALL` on `Cloud` only) (`AH-06`). |
