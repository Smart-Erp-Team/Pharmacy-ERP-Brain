# PharmacyERP — Stage 1 Frontend ↔ Backend Integration Guide

> **Authoritative Source:** Generated to match the live Stage 1 backend contract in [`../contracts/openapi.v1.json`](../contracts/openapi.v1.json), [`../contracts/README.md`](../contracts/README.md), and [`../FRONTEND_TEST_DATA_GUIDE.md`](../FRONTEND_TEST_DATA_GUIDE.md) **100% verbatim**.
>
> **Stage 1 Scope (48 Live Endpoints):** Covers Auth & JWKS, Organization Provisioning, Branches & Branch Enrollment, Users, Employees, Catalog (Categories, Products, Multi-UOM, Reorder Rules), Inventory (Locations, Batches, Paginated Balances, Summary, Ledger Transactions, BranchLocal Adjustments/Reversals), and Canonical Stage 1 Integration. Stage 2 (Sales / POS) and Stage 3 (Purchasing) will be added to this package only once implemented in the live backend.

---

## 1. Package Layout & Client Type Generation

| Path | Contents |
| --- | --- |
| [`openapi.erp.yaml`](./openapi.erp.yaml) | Live Stage 1 OpenAPI 3.0.4 specification — **48 live endpoints** (47 controller actions + `GET /.well-known/jwks.json`) and **76 component schemas**, annotated with `x-stage: 1`, `x-runtime`, and `x-roles`. |
| [`schemas/*.json`](./schemas/) | Draft 2020-12 JSON Schema definitions: `common.json`, `auth.json`, `identity.json`, `catalog.json`, `inventory.json`, `canonical.json`, plus exact synced `api-error-envelope.schema.json` and `canonical-capabilities.schema.json`. |
| [`fixtures/*.json`](./fixtures/) | Stage 1 mock/test payloads matching live DTO shapes and `MEDCARE` seeded IDs from `FRONTEND_TEST_DATA_GUIDE.md`. |

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

See [`../FRONTEND_TEST_DATA_GUIDE.md`](../FRONTEND_TEST_DATA_GUIDE.md) for deterministic multi-tenant seed credentials (`MEDCARE`, `ALNOUR`, `GREENLEAF`), branch IDs, enrollment tokens, location IDs, SKU/barcode/UOM test cases, and copy-paste `BranchLocal` adjustment and reversal payloads.
