# PharmacyERP Stage 1 — Authoritative Live API & Wire Contract

> **Source of Truth Notice:** Every route, header, query parameter, JSON field, enum value, validation bound, status code, RBAC rule, and runtime-mode guard in this handbook is extracted directly from the **live C# implementation** in `apps/erp-backend/src/` and verified automatically against `/swagger/v1/swagger.json` by `tests/PharmacyERP.IntegrationTests/Api/ContractsArtifactSyncTests.cs`.

## Authoritative Artifacts in `apps/erp-backend/contracts/`

| File | Description | Verification |
| --- | --- | --- |
| [`openapi.v1.json`](./openapi.v1.json) | Complete OpenAPI 3.0.4 specification exported directly from live `/swagger/v1/swagger.json` covering **all 48 live HTTP endpoints** (47 controller actions across 13 controllers + `GET /.well-known/jwks.json`), 74 component schemas, Bearer JWT security, and `Idempotency-Key` headers. | Asserted byte/tree-equal to live Swagger in `ContractsArtifactSyncTests`. |
| [`schemas/api-error-envelope.schema.json`](./schemas/api-error-envelope.schema.json) | JSON Schema (Draft 2020-12) for `ApiErrorEnvelopeDto`, enumerating all 11 `ErrorCode` values plus `"INTERNAL_SERVER_ERROR"`. | Asserted against `ErrorCode` enum in `ContractsArtifactSyncTests`. |
| [`schemas/canonical-capabilities.schema.json`](./schemas/canonical-capabilities.schema.json) | JSON Schema (Draft 2020-12) for `GET /api/v1/canonical/capabilities` in strict `snake_case`. | Asserted against live `Cloud` and `BranchLocal` responses in `ContractsArtifactSyncTests`. |
| [`README.md`](./README.md) | This complete developer & frontend/Brain wire-contract reference. | Synchronized with live C# code. |

---

## 1. Global Wire-Format Rules

### 1.1 JSON Casing, Nullability, Dates, and Decimals (`DependencyInjection.cs`)
All controllers, middlewares (`ExceptionHandlingMiddleware`, `RuntimeModeGuardMiddleware`), and auth handlers (`ApiErrorAuthorizationMiddlewareResultHandler`, `JwtBearerEvents`) share `DependencyInjection.ApiJsonSerializerOptions`:
- **Property Naming Policy:** `JsonNamingPolicy.SnakeCaseLower` — **all JSON request and response properties are strictly `snake_case`** (`organization_code`, `branch_id`, `sale_unit_price`, `on_hand_qty_base`, `last_login_at`, `trace_id`). Sending `camelCase` fails validation because `organizationCode` does not match `organization_code`.
- **Property Name Case Insensitivity:** `PropertyNameCaseInsensitive = true` (matches `snake_case` case-insensitively, e.g., `branch_id`, not `branchId`).
- **Query Parameters:** **All query parameters across all 13 controllers are strictly `snake_case`** via `[FromQuery(Name = "...")]` (`include_inactive`, `page_size`, `branch_id`, `expiring_before`, `updated_since`, etc.).
- **Route Parameters:** Route GUID segments (`{id}`, `{branchId}`, `{productId}`, `{uomId}`) are positional path segments (names are OpenAPI/routing metadata only).
- **Null Serialization:** Default `JsonIgnoreCondition.Never` — nullable properties are always serialized explicitly as `"field": null` (e.g., `"next_cursor": null`, `"barcode": null`, `"last_login_at": null`).
- **Timestamps & Dates:**
  - `DateTimeOffset` -> ISO 8601 UTC timestamp with offset (e.g., `"2026-11-25T00:00:00+00:00"`).
  - `DateOnly` -> ISO 8601 calendar date (`"YYYY-MM-DD"`).
  - Business-date expiry eligibility (`available_qty_base` / `available_quantity_base`) evaluates against the organization's configured IANA `time_zone_id` (falling back to `"UTC"` if absent).
- **Decimals:** Native JSON numbers (`10.50`, `0.14`, `1`).

### 1.2 String-Only Enums (`allowIntegerValues: false`)
Configured via `new JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false)`.
- **Responses** emit exact C# enum member names as JSON strings.
- **Requests** accept string enum names (case-insensitive) and **reject integer values** (e.g., `1`, `2`) with **`422 VALIDATION_ERROR`** (`ApiErrorEnvelopeDto`).

| Enum | Exact Wire String Values | Used In |
| --- | --- | --- |
| `UserRole` | `"Admin"`, `"Pharmacist"`, `"Cashier"` | `CurrentUserDto.role`, `UserDto.role`, `CreateUserRequest.role`, `UpdateUserRequest.role`, `GET /users?role=` |
| `BranchScope` | `"ALL"`, `"ASSIGNED"` | `CurrentUserDto.branch_scope`, `UserDto.branch_scope`, `CreateUserRequest.branch_scope`, `UpdateUserRequest.branch_scope`, JWT `branch_scope` |
| `LocationType` | `"SELLABLE"`, `"QUARANTINE"`, `"DAMAGED"`, `"SCRAP"` | `InventoryLocationDto.location_type`, `CreateInventoryLocationRequest.location_type`, `StockBalanceDto.location_type` |
| `BatchQualityStatus` | `"AVAILABLE"`, `"QUARANTINED"`, `"EXPIRED"`, `"RECALLED"` | `InventoryBatchDto.quality_status`, `StockBalanceDto.quality_status`, `CanonicalInventoryLotDto.quality_status`, `GET /inventory/batches?status=` |
| `InventoryTransactionType` | `"OPENING_BALANCE"`, `"ADJUSTMENT_IN"`, `"ADJUSTMENT_OUT"`, `"SALE_ISSUE"`, `"SALES_RETURN_IN"`, `"PURCHASE_RECEIPT"`, `"VENDOR_RETURN_OUT"`, `"SCRAP_OUT"`, `"REVERSAL"` *(explicitly NO `TRANSFER`)* | `InventoryTxnDto.transaction_type`, `CreateInventoryAdjustmentRequest.transaction_type` *(restricted to `OPENING_BALANCE`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `REVERSAL`)*, `GET /inventory/transactions?type=` |
| `InventoryTransactionStatus` | `"DRAFT"`, `"POSTED"`, `"CANCELLED"` *(no `REVERSED`)* | `InventoryTxnDto.status` |
| `CatalogConfigurationAction` | `"CreateProduct"`, `"UpdateProduct"`, `"AddUom"`, `"UpdateUom"`, `"DeactivateUom"` *(PascalCase)* | `CanonicalProductConfigurationRequest.action` |
| `ErpRuntimeMode` | `"Cloud"`, `"BranchLocal"` | `CanonicalCapabilitiesDto.runtime_mode` |
| `ErrorCode` | `"MALFORMED_REQUEST"`, `"UNAUTHORIZED"`, `"FORBIDDEN"`, `"FORBIDDEN_BRANCH"`, `"NOT_FOUND"`, `"CONFLICT"`, `"INVALID_STATE_TRANSITION"`, `"OUT_OF_STOCK"`, `"IDEMPOTENCY_MISMATCH"`, `"VALIDATION_ERROR"`, `"EXPIRY_POLICY_VIOLATION"` *(plus `"INTERNAL_SERVER_ERROR"` for 500s)* | `ApiErrorEnvelopeDto.error.code` |
| `AuditActorType` *(DB-only)* | `"USER"`, `"SYSTEM"`, `"AI_ASSISTED"` | Internal audit log only (not emitted on HTTP DTOs) |
| `CanonicalWriteStatuses` *(const)* | `"APPLIED"` *(emitted on canonical write success)* | `CanonicalWriteResultDto.status` |

### 1.3 Trace Propagation Headers (`TraceparentMiddleware.cs`)
- Incoming `traceparent` (W3C) or fallback `X-Trace-Id` is propagated; if omitted, a W3C `00-<32hex>-<16hex>-01` value is generated.
- Every HTTP response includes both `traceparent` and `X-Trace-Id` response headers, and every error envelope carries the same value in `error.trace_id`.

### 1.4 Standard Error Envelope & Status Code Mapping (`ApiResultMapper.cs`, `ExceptionHandlingMiddleware.cs`, `DependencyInjection.cs`)
Every error response (including `[Authorize]` 401/403, `RuntimeModeGuardMiddleware` 404, malformed JSON 400, validation 422, conflicts 409, and unhandled 500s) returns `Content-Type: application/json` matching `ApiErrorEnvelopeDto`:

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

| `error.code` | HTTP Status | When Emitted |
| --- | :---: | --- |
| `MALFORMED_REQUEST` | **400** | Broken JSON syntax (`JsonReaderException`), root `$` parse failure, empty/null request body, or missing `Idempotency-Key` (both header and body blank; emits `details: [{ "field": "Idempotency-Key", "issue": "The idempotency key is required." }]`). |
| `UNAUTHORIZED` | **401** | Missing/invalid/expired/revoked JWT (includes `WWW-Authenticate: Bearer`), failed security-stamp validation, invalid login credentials, invalid/expired/reused refresh token, or invalid/expired/used enrollment token. |
| `FORBIDDEN` | **403** | Role/policy denial (`[Authorize(Roles/Policy)]`), inactive or locked account during login, hierarchical user-management violation, or `organization_id` mismatch on `/canonical/inventory`. |
| `FORBIDDEN_BRANCH` | **403** | Caller's `branch_scope` / `branch_ids` does not authorize the target `branch_id` (or `BranchLocal` login/refresh by a user not assigned to `ENROLLED_BRANCH_ID`). |
| `NOT_FOUND` | **404** | Missing entity (including cross-tenant entities hidden by PostgreSQL `FORCE ROW LEVEL SECURITY`) OR route unavailable in current `ERP_RUNTIME_MODE` (`Cloud` vs `BranchLocal`). |
| `CONFLICT` | **409** | Duplicate unique keys (org code, branch code, employee no, username, employee already has account, category code, SKU, barcode, UOM code, location code), historical UOM/lot-tracking modification lock, base UOM deactivation attempt, EF Core optimistic concurrency (`row_version`), or PostgreSQL serialization/deadlock/unique violations (`40001`/`40P01`/`23505`). |
| `INVALID_STATE_TRANSITION` | **409** | `OPENING_BALANCE` on a `(location, batch)` with non-zero stock, existing ledger history, or duplicate lines; `REVERSAL` targeting a non-`POSTED`, already-reversed, or `REVERSAL` transaction. |
| `OUT_OF_STOCK` | **409** | `ADJUSTMENT_OUT` or outbound `REVERSAL` where `on_hand_qty_base < requested_qty_base`. |
| `IDEMPOTENCY_MISMATCH` | **409** | Reusing an existing `Idempotency-Key` with a different canonical request payload hash. |
| `VALIDATION_ERROR` | **422** | Syntactically valid JSON failing field, type, string-only enum, range, length, pagination, branch-selection, or domain invariant validation. `details[].field` uses wire `snake_case` paths (`lines[0].entered_qty`, `uoms[0].sale_unit_price`, `page_size`). |
| `EXPIRY_POLICY_VIOLATION` | **422** | Expiry/shelf-life policy violation. |
| `INTERNAL_SERVER_ERROR` | **500** | Unhandled server exception (`ExceptionHandlingMiddleware`). |

#### `400` vs `422` Rule (`DependencyInjection.IsMalformedJsonOrProtocolRequest`)
- **`400 MALFORMED_REQUEST`**: Invalid JSON syntax, empty/null body, or missing `Idempotency-Key`.
- **`422 VALIDATION_ERROR`**: Valid JSON syntax with wrong JSON value type (e.g., string for GUID/number, integer for string-only enum), failed `[Required]`/`[StringLength]`/`[MinLength]`/`[EmailAddress]`, or application/domain validator failure.

### 1.5 `201 Created` + `Location` Header Rules
All 11 resource-creation `POST` endpoints return **`201 Created`** with a `Location` header:
1. `POST /api/v1/organizations` -> `/api/v1/organizations/{organization_id}`
2. `POST /api/v1/branches` -> `/api/v1/branches/{branch_id}`
3. `POST /api/v1/branches/{branchId}/enrollment-tokens` -> `/api/v1/branches/{branchId}/enrollment-tokens`
4. `POST /api/v1/users` -> `/api/v1/users/{user_id}`
5. `POST /api/v1/employees` -> `/api/v1/employees/{employee_id}`
6. `POST /api/v1/product-categories` -> `/api/v1/product-categories/{category_id}`
7. `POST /api/v1/products` -> `/api/v1/products/{product_id}`
8. `POST /api/v1/products/{id}/uoms` -> `/api/v1/products/{id}/uoms/{product_uom_id}`
9. `POST /api/v1/inventory/locations` -> `/api/v1/inventory/locations/{location_id}`
10. `POST /api/v1/inventory/adjustments` -> `/api/v1/inventory/transactions/{inventory_txn_id}`
11. `POST /api/v1/canonical/configuration/products` -> **`201 Created`** (`Location: /api/v1/products/{id}` or `/api/v1/products/{product_id}/uoms/{uom_id}`) when `action` is `CreateProduct` or `AddUom`; **`200 OK`** when `action` is `UpdateProduct`, `UpdateUom`, or `DeactivateUom`.

### 1.6 `Idempotency-Key` Protocol Rules
- **Header vs Body (`[AllowHeaderIdempotencyKey]`):** All 17 body-bearing mutating business endpoints accept `Idempotency-Key` in the HTTP header **or** as the optional `idempotency_key` JSON body field. If both are provided, the **trimmed HTTP header takes precedence** over the body field.
- **Header-Only Idempotent Endpoints (2):** `POST /api/v1/branches/{branchId}/enrollment-tokens` and `POST /api/v1/users/{id}/revoke-sessions` have no request body, so the `Idempotency-Key` HTTP header is **required**.
- **Exempt Endpoints:** `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, and `POST /api/v1/branch-enrollment`.
- **Validation & Replay:**
  - Blank in both header and body -> **`400 MALFORMED_REQUEST`** (`details: [{ "field": "Idempotency-Key", "issue": "The idempotency key is required." }]`).
  - Length `> 100` characters -> **`422 VALIDATION_ERROR`** (`field: "idempotency_key"`).
  - Exact same key + same payload hash -> replays original response (`200`/`201`/`204`) without side effects.
  - Same key + different payload hash -> **`409 IDEMPOTENCY_MISMATCH`**.

### 1.7 Pagination Rules
- **Standard ERP Lists (`PagedResult<T>`):** `{ "items": T[], "page": int, "page_size": int, "total_count": int, "next_cursor": string | null }`.
  - Uniform defaults across Identity, Catalog, and Inventory: `page = 1`, `page_size = 25`.
  - Uniform bounds: `page >= 1`, `1 <= page_size <= 200`. Out-of-range values return **`422 VALIDATION_ERROR`** (`field: "page"` / `"page_size"`).
- **Unpaginated ERP List Endpoints (Live Quirks):**
  - `GET /api/v1/products/{id}/uoms` returns raw `ProductUomDto[]` (defaults `include_inactive=false`).
  - `GET /api/v1/inventory/balances` returns raw `StockBalanceDto[]` (unpaginated array).
- **Canonical Lists (Divergent Shapes):**
  - `GET /api/v1/canonical/products`: keyset cursor (`cursor` = opaque Base64Url `UtcTicks:ProductIdN`, `limit` default `50`, clamped `1..1000`, invalid `<= 0` falls back to `50`), returns `CanonicalProductFeedPageDto` (`{ "items": CanonicalProductDto[], "next_cursor": string | null }`).
  - `GET /api/v1/canonical/inventory`: integer offset cursor (`cursor` = `long?` row offset, `limit` default `100`, clamped `1..1000`, invalid `<= 0` falls back to `100`), returns `PagedResult<CanonicalInventoryItemDto>` (`next_cursor` is stringified next offset or `null`).

---

## 2. Authentication, JWT Structure, Scopes & RBAC

### 2.1 Token Issuance, Lifetimes & JWKS (`JwtTokenGenerator.cs`, `JwksKeyProvider.cs`, `AuthService.cs`)
- **Signing:** RS256 (`3072`-bit RSA process key). Public key exposed anonymously at `GET /.well-known/jwks.json` (`Content-Type: application/jwk-set+json`) as `{ "keys": [{ "kty": "RSA", "use": "sig", "alg": "RS256", "kid": "<32-hex>", "n": "<b64url>", "e": "<b64url>" }] }`.
- **Access Token Lifetime:** `15 minutes` (`Cloud`) / `24 hours` (`BranchLocal`). Validation `ClockSkew`: `30 seconds`.
- **Refresh Token Lifetime:** `30 days`. Refresh rotates the token (consuming the old token in the same `token_family_id`). Presenting an already-consumed refresh token triggers **reuse detection**, revoking the entire token family and returning `401 UNAUTHORIZED`.
- **Account Lockout & Inactive Enforcement:**
  - `5` consecutive failed passwords lock the user for `15 minutes`.
  - On `POST /api/v1/auth/login`, inactive user/employee (`403 FORBIDDEN`, `"The user account is inactive."`) and active lockout (`403 FORBIDDEN`, `"The user account is locked."`) are checked **before** password verification.
  - Password creation/reset minimum length: **`12` characters** (`[MinLength(12)]`).
- **Immediate Revocation (`IUserSecurityStampValidator`):** Every authenticated request validates `(organization_id, sub, security_stamp)` against active user state. Role/scope/branch changes, deactivation, password reset, and session revocation rotate `security_stamp`, immediately invalidating existing JWTs (`401 UNAUTHORIZED`). Only deployment `PlatformProvisioner` tokens (role `PlatformProvisioner`, empty `organization_id` and `sub`) bypass this check.

### 2.2 `LoginResponse` vs Flat `GET /api/v1/auth/me`
- `POST /api/v1/auth/login` and `POST /api/v1/auth/refresh` return **`LoginResponse`**:
  ```json
  {
    "access_token": "<jwt>",
    "access_token_expires_at": "2026-11-25T00:15:00+00:00",
    "refresh_token": "<b64url-32-bytes>",
    "user": {
      "user_id": "<guid>",
      "employee_id": "<guid>",
      "organization_id": "<guid>",
      "username": "admin@medcare.test",
      "role": "Admin",
      "branch_scope": "ALL",
      "branch_ids": [],
      "scopes": ["user:admin", "branch:admin", "employee:admin", "inventory:read", "inventory:write", "sales:read", "sales:write"]
    }
  }
  ```
- `GET /api/v1/auth/me` returns **`CurrentUserDto`** directly at the root (flat object with the exact same 8 fields as `LoginResponse.user`, including the real `username` from the JWT `username` claim).
- **`BranchLocal` Scope Downgrade:** When running in `BranchLocal` mode, even an `ALL`-scope Org Admin receives `branch_scope: "ASSIGNED"` and `branch_ids: [ENROLLED_BRANCH_ID]` identically in the JWT, `LoginResponse.user`, and `GET /api/v1/auth/me`. Non-`ALL` users not assigned to `ENROLLED_BRANCH_ID` receive `403 FORBIDDEN_BRANCH` on login/refresh.

### 2.3 Exact JWT Claims & Emitted Scopes per Role
- **Header:** `{ "alg": "RS256", "kid": "<32-hex>", "typ": "JWT" }`
- **Payload Claims:** `iss` (default `"PharmacyERP"`), `aud` (default `"PharmacyERP.Api"`), `sub` (`user_id`), `employee_id`, `username`, `roles` (**JSON string array**, e.g. `["Pharmacist"]`), `organization_id`, `branch_scope` (`"ALL"` or `"ASSIGNED"`), `branch_ids` (**JSON string array** of GUIDs), `scopes` (**JSON string array**), `security_stamp` (GUID), `iat`, `exp`.

| Role | Exact Emitted `scopes[]` (in JWT & `CurrentUserDto`) | Notes |
| --- | --- | --- |
| `Admin` | `["user:admin", "branch:admin", "employee:admin", "inventory:read", "inventory:write", "sales:read", "sales:write"]` | Includes additive `branch:admin`, `employee:admin`. |
| `Pharmacist` | `["inventory:read", "inventory:write", "sales:read"]` | **Excludes `sales:write`** per Blueprint §8.5/§9.1. |
| `Cashier` | `["inventory:read", "sales:read", "sales:write"]` | Read-only on catalog/inventory/branches; denied on `/employees` and all catalog/inventory writes. |

### 2.4 Hierarchical User Management Rules (`UserManagementAuthorizer.cs`)
- Only `Admin` (`AdminOnly` policy) may call `/api/v1/users*`.
- Only `Admin` with `branch_scope = "ALL"` (`OrgAdminOnly`) may create/read/update/reset/revoke `Admin` or `ALL`-scope users, or list `/api/v1/users` without `?branch_id=`.
- An `ASSIGNED` Admin may only manage non-`Admin`, `ASSIGNED`-scope users whose branches are a subset of the caller's `branch_ids` (and may read their own user record).
- **No user (not even an Org Admin) may change their own `role`, `branch_scope`, or `is_active` state** via `PATCH /api/v1/users/{id}` (`403 FORBIDDEN`).

---

## 3. Runtime Modes (`Cloud` vs `BranchLocal`)

Enforced at the HTTP pipeline edge by `RuntimeModeGuardMiddleware` **before authentication and authorization** (and mirrored in application services). Blocked routes return **`404 NOT_FOUND`** (`ApiErrorEnvelopeDto`).

| Route / Route Group | `Cloud` Mode | `BranchLocal` Mode |
| --- | :---: | :---: |
| `GET /.well-known/jwks.json` | Allowed | Allowed |
| `POST /api/v1/auth/login`, `/refresh`, `/logout`, `GET /me` | Allowed | Allowed *(branch-locked to `ENROLLED_BRANCH_ID`)* |
| `GET /api/v1/canonical/capabilities` | Allowed *(returns `reads: 2, writes: 2`)* | Allowed *(returns `reads: [], writes: []`)* |
| `POST /api/v1/organizations` | Allowed | **`404 NOT_FOUND`** |
| `POST /api/v1/branch-enrollment` | Allowed | **`404 NOT_FOUND`** |
| `GET /api/v1/branches`, `GET /api/v1/branches/{id}` | Allowed | Allowed |
| `POST /api/v1/branches`, `PATCH /api/v1/branches/{id}`, `POST /api/v1/branches/{branchId}/enrollment-tokens` | Allowed | **`404 NOT_FOUND`** |
| `GET /api/v1/users`, `GET /api/v1/users/{id}`, `GET /api/v1/employees`, `GET /api/v1/employees/{id}` | Allowed | Allowed |
| `POST/PATCH /api/v1/users*`, `POST/PATCH /api/v1/employees*` | Allowed | **`404 NOT_FOUND`** |
| `GET /api/v1/product-categories*`, `GET /api/v1/products*`, `GET .../reorder-rule` | Allowed | Allowed |
| `POST/PATCH /api/v1/product-categories*`, `POST/PATCH /api/v1/products*`, `PUT .../reorder-rule` | Allowed | **`404 NOT_FOUND`** |
| `GET/POST/PATCH /api/v1/inventory/locations*` | Allowed | Allowed |
| `GET /api/v1/inventory/batches`, `/balances`, `/summary`, `/transactions` | Allowed | Allowed |
| `POST /api/v1/inventory/adjustments` | **`404 NOT_FOUND`** | Allowed |
| `GET /api/v1/canonical/products`, `GET /api/v1/canonical/inventory`, `POST /api/v1/canonical/configuration/products`, `PUT /api/v1/canonical/configuration/reorder-rules` | Allowed | **`404 NOT_FOUND`** |

### `GET /api/v1/canonical/capabilities` Payloads
- **`Cloud`:** `{ "stage": 1, "runtime_mode": "Cloud", "supported_reads": ["products", "inventory"], "supported_writes": ["configuration.products", "configuration.reorder-rules"] }`
- **`BranchLocal`:** `{ "stage": 1, "runtime_mode": "BranchLocal", "supported_reads": [], "supported_writes": [] }`

---

## 4. Complete Endpoint Inventory (All 48 Live HTTP Endpoints)

| # | Module | Method & Route | Auth / Roles / Branch Scope | Runtime | Idempotency | Success Response | Error Codes |
| :-: | --- | --- | --- | --- | --- | --- | --- |
| 1 | Auth | `GET /.well-known/jwks.json` | Public | Both | None | `200` `JwksDocument` (`application/jwk-set+json`) | — |
| 2 | Auth | `POST /api/v1/auth/login` | Public | Both | None | `200` `LoginResponse` | `400`, `401`, `403`, `422` |
| 3 | Auth | `POST /api/v1/auth/refresh` | Public | Both | None | `200` `LoginResponse` | `400`, `401`, `403`, `422` |
| 4 | Auth | `POST /api/v1/auth/logout` | `[Authorize]` | Both | None | `204 No Content` | `400`, `401`, `422` |
| 5 | Auth | `GET /api/v1/auth/me` | `[Authorize]` | Both | None | `200` `CurrentUserDto` | `401` |
| 6 | Orgs | `POST /api/v1/organizations` | `PlatformProvisionerOnly` | Cloud | Header/Body | `201` `OrganizationDto` + `Location` | `400`, `401`, `403`, `404`, `409`, `422` |
| 7 | Branches | `GET /api/v1/branches` | `[Authorize]` (branch-scoped) | Both | None | `200` `PagedResult<BranchDto>` | `401`, `422` |
| 8 | Branches | `POST /api/v1/branches` | `OrgAdminOnly` (`Admin` + `ALL`) | Cloud | Header/Body | `201` `BranchDto` + `Location` | `400`, `401`, `403`, `404`, `409`, `422` |
| 9 | Branches | `GET /api/v1/branches/{id}` | `[Authorize]` + branch access | Both | None | `200` `BranchDto` | `401`, `403`, `404` |
| 10 | Branches | `PATCH /api/v1/branches/{id}` | `AdminOnly` + branch access (`is_active` requires `ALL`) | Cloud | Header/Body | `200` `BranchDto` | `400`, `401`, `403`, `404`, `409`, `422` |
| 11 | Branches | `POST /api/v1/branches/{branchId}/enrollment-tokens` | `AdminOnly` + branch access | Cloud | **Header-only** | `201` `EnrollmentTokenResponse` + `Location` | `400`, `401`, `403`, `404`, `409`, `422` |
| 12 | Branches | `POST /api/v1/branch-enrollment` | Public | Cloud | None | `200` `RedeemBranchEnrollmentResponse` | `400`, `401`, `404`, `422` |
| 13 | Users | `GET /api/v1/users` | `AdminOnly` + hierarchy | Both | None | `200` `PagedResult<UserDto>` | `401`, `403`, `422` |
| 14 | Users | `POST /api/v1/users` | `AdminOnly` + hierarchy | Cloud | Header/Body | `201` `UserDto` + `Location` | `400`, `401`, `403`, `404`, `409`, `422` |
| 15 | Users | `GET /api/v1/users/{id}` | `AdminOnly` + hierarchy | Both | None | `200` `UserDto` | `401`, `403`, `404` |
| 16 | Users | `PATCH /api/v1/users/{id}` | `AdminOnly` + hierarchy | Cloud | Header/Body | `200` `UserDto` | `400`, `401`, `403`, `404`, `409`, `422` |
| 17 | Users | `POST /api/v1/users/{id}/password-reset` | `AdminOnly` + hierarchy | Cloud | Header/Body | `204 No Content` | `400`, `401`, `403`, `404`, `409`, `422` |
| 18 | Users | `POST /api/v1/users/{id}/revoke-sessions` | `AdminOnly` + hierarchy | Cloud | **Header-only** | `204 No Content` | `400`, `401`, `403`, `404`, `409`, `422` |
| 19 | Employees | `GET /api/v1/employees` | `Admin,Pharmacist` + branch scope | Both | None | `200` `PagedResult<EmployeeDto>` | `401`, `403`, `422` |
| 20 | Employees | `POST /api/v1/employees` | `AdminOnly` + branch scope | Cloud | Header/Body | `201` `EmployeeDto` + `Location` | `400`, `401`, `403`, `404`, `409`, `422` |
| 21 | Employees | `GET /api/v1/employees/{id}` | `Admin,Pharmacist` + branch scope | Both | None | `200` `EmployeeDto` | `401`, `403`, `404` |
| 22 | Employees | `PATCH /api/v1/employees/{id}` | `AdminOnly` + branch scope | Cloud | Header/Body | `200` `EmployeeDto` | `400`, `401`, `403`, `404`, `409`, `422` |
| 23 | Catalog | `GET /api/v1/product-categories` | `Admin,Pharmacist,Cashier` | Both | None | `200` `PagedResult<ProductCategoryDto>` | `401`, `403`, `422` |
| 24 | Catalog | `POST /api/v1/product-categories` | `Admin,Pharmacist` | Cloud | Header/Body | `201` `ProductCategoryDto` + `Location` | `400`, `401`, `403`, `404`, `409`, `422` |
| 25 | Catalog | `GET /api/v1/product-categories/{id}` | `Admin,Pharmacist,Cashier` | Both | None | `200` `ProductCategoryDto` | `401`, `403`, `404` |
| 26 | Catalog | `PATCH /api/v1/product-categories/{id}` | `Admin,Pharmacist` | Cloud | Header/Body | `200` `ProductCategoryDto` | `400`, `401`, `403`, `404`, `409`, `422` |
| 27 | Catalog | `GET /api/v1/products` | `Admin,Pharmacist,Cashier` | Both | None | `200` `PagedResult<ProductDto>` | `401`, `403`, `422` |
| 28 | Catalog | `POST /api/v1/products` | `Admin,Pharmacist` | Cloud | Header/Body | `201` `ProductDto` + `Location` | `400`, `401`, `403`, `404`, `409`, `422` |
| 29 | Catalog | `GET /api/v1/products/{id}` | `Admin,Pharmacist,Cashier` | Both | None | `200` `ProductDto` | `401`, `403`, `404` |
| 30 | Catalog | `PATCH /api/v1/products/{id}` | `Admin,Pharmacist` | Cloud | Header/Body | `200` `ProductDto` | `400`, `401`, `403`, `404`, `409`, `422` |
| 31 | Catalog | `GET /api/v1/products/{id}/uoms` | `Admin,Pharmacist,Cashier` | Both | None | `200` `ProductUomDto[]` | `401`, `403`, `404` |
| 32 | Catalog | `POST /api/v1/products/{id}/uoms` | `Admin,Pharmacist` | Cloud | Header/Body | `201` `ProductUomDto` + `Location` | `400`, `401`, `403`, `404`, `409`, `422` |
| 33 | Catalog | `PATCH /api/v1/products/{id}/uoms/{uomId}` | `Admin,Pharmacist` | Cloud | Header/Body | `200` `ProductUomDto` | `400`, `401`, `403`, `404`, `409`, `422` |
| 34 | Catalog | `GET /api/v1/branches/{branchId}/products/{productId}/reorder-rule` | `Admin,Pharmacist,Cashier` + branch | Both | None | `200` `ReorderRuleDto` | `401`, `403`, `404` |
| 35 | Catalog | `PUT /api/v1/branches/{branchId}/products/{productId}/reorder-rule` | `Admin,Pharmacist` + branch | Cloud | Header/Body | `200` `ReorderRuleDto` | `400`, `401`, `403`, `404`, `409`, `422` |
| 36 | Inventory | `GET /api/v1/inventory/locations` | `Admin,Pharmacist,Cashier` + branch | Both | None | `200` `PagedResult<InventoryLocationDto>` | `401`, `403`, `422` |
| 37 | Inventory | `POST /api/v1/inventory/locations` | `Admin,Pharmacist` + branch | Both | Header/Body | `201` `InventoryLocationDto` + `Location` | `400`, `401`, `403`, `409`, `422` |
| 38 | Inventory | `PATCH /api/v1/inventory/locations/{id}` | `Admin,Pharmacist` + branch | Both | Header/Body | `200` `InventoryLocationDto` | `400`, `401`, `403`, `404`, `409`, `422` |
| 39 | Inventory | `GET /api/v1/inventory/batches` | `[Authorize]` (org-scoped) | Both | None | `200` `PagedResult<InventoryBatchDto>` | `401`, `422` |
| 40 | Inventory | `GET /api/v1/inventory/balances` | `[Authorize]` + branch | Both | None | `200` `StockBalanceDto[]` *(array!)* | `401`, `403`, `422` |
| 41 | Inventory | `GET /api/v1/inventory/summary` | `[Authorize]` + branch | Both | None | `200` `InventorySummaryDto` | `401`, `403`, `422` |
| 42 | Inventory | `GET /api/v1/inventory/transactions` | `[Authorize]` + branch | Both | None | `200` `PagedResult<InventoryTxnDto>` | `401`, `403`, `422` |
| 43 | Inventory | `POST /api/v1/inventory/adjustments` | `Admin,Pharmacist` + branch | **BranchLocal** | Header/Body | `201` `InventoryTxnDto` + `Location` | `400`, `401`, `403`, `404`, `409`, `422` |
| 44 | Canonical | `GET /api/v1/canonical/capabilities` | Public | Both | None | `200` `CanonicalCapabilitiesDto` | — |
| 45 | Canonical | `GET /api/v1/canonical/products` | `Admin,Pharmacist` | Cloud | None | `200` `CanonicalProductFeedPageDto` | `401`, `403`, `404`, `422` |
| 46 | Canonical | `POST /api/v1/canonical/configuration/products` | `Admin,Pharmacist` | Cloud | Header/Body | `201`/`200` `CanonicalWriteResultDto` | `400`, `401`, `403`, `404`, `409`, `422` |
| 47 | Canonical | `PUT /api/v1/canonical/configuration/reorder-rules` | `Admin,Pharmacist` + branch | Cloud | Header/Body | `200` `CanonicalWriteResultDto` | `400`, `401`, `403`, `404`, `409`, `422` |
| 48 | Canonical | `GET /api/v1/canonical/inventory` | `[Authorize]` + branch | Cloud | None | `200` `PagedResult<CanonicalInventoryItemDto>` | `401`, `403`, `404`, `422` |

---

## 5. Endpoint-by-Endpoint Exact Field & Behavior Details

### 5.1 Auth & JWKS

#### 1. `GET /.well-known/jwks.json`
- **Auth:** Public. **Runtime:** `Cloud` & `BranchLocal`.
- **Response (`200 OK`, `application/jwk-set+json`):** `{ "keys": [{ "kty": "RSA", "use": "sig", "alg": "RS256", "kid": string, "n": string, "e": string }] }`.

#### 2. `POST /api/v1/auth/login`
- **Auth:** Public (`[AllowAnonymous]`). **Runtime:** Both.
- **Request (`LoginRequest`):**
  - `organization_code`: `string`, required, maxLength `30`.
  - `username`: `string`, required, maxLength `80` (trimmed & matched case-insensitively).
  - `password`: `string`, required.
- **Response (`200 OK`):** `LoginResponse` (`access_token`, `access_token_expires_at`, `refresh_token`, `user: CurrentUserDto`).
- **Errors:** `400` malformed JSON; `401 UNAUTHORIZED` unknown org/user or wrong password; `403 FORBIDDEN` inactive user/employee or locked account (checked before password); `403 FORBIDDEN_BRANCH` in `BranchLocal` if user lacks access to `ENROLLED_BRANCH_ID`; `422 VALIDATION_ERROR`.

#### 3. `POST /api/v1/auth/refresh`
- **Auth:** Public (`[AllowAnonymous]`). **Runtime:** Both.
- **Request (`RefreshTokenRequest`):** `refresh_token` (`string`, required).
- **Response (`200 OK`):** `LoginResponse` (rotates refresh token within same `token_family_id`).
- **Errors:** `400`, `401 UNAUTHORIZED` (unknown, expired, revoked, inactive user/employee, or already-consumed token -> revokes entire family), `403 FORBIDDEN_BRANCH` (`BranchLocal`), `422`.

#### 4. `POST /api/v1/auth/logout`
- **Auth:** `[Authorize]`. **Runtime:** Both.
- **Request (`LogoutRequest`):** `refresh_token` (`string`, required).
- **Response (`204 No Content`):** Revokes entire `token_family_id` for the presented token owned by the caller.
- **Errors:** `400`, `401 UNAUTHORIZED` (unauthenticated or token not owned by caller), `422`.

#### 5. `GET /api/v1/auth/me`
- **Auth:** `[Authorize]`. **Runtime:** Both.
- **Response (`200 OK`):** Flat `CurrentUserDto` (`user_id`, `employee_id`, `organization_id`, `username`, `role: UserRole`, `branch_scope: BranchScope`, `branch_ids: Guid[]`, `scopes: string[]`).
- **Errors:** `401 UNAUTHORIZED`.

---

### 5.2 Organizations

#### 6. `POST /api/v1/organizations`
- **Auth:** `PlatformProvisionerOnly` (`roles` contains `"PlatformProvisioner"`). **Runtime:** `Cloud`-only (`404` on `BranchLocal`). **Idempotency:** Header or body.
- **Request (`CreateOrganizationRequest`):**
  - `organization_code`: `string`, required, maxLength `30`.
  - `name`: `string`, required, maxLength `150`.
  - `base_currency`: `string`, optional (default `"EGP"`), length `3..3`.
  - `time_zone_id`: `string`, required (default `"Africa/Cairo"`), maxLength `64` (validated via `TimeZoneInfo`).
  - `address`: `AddressDto`, required (`line1`: req 1..200, `line2`: string? <=200, `city`: req 1..100, `region`: string? <=100, `postal_code`: string? <=20, `country_code`: req 2..2).
  - `initial_branch`: `CreateBranchRequest`, required (`branch_code`, `name`, `address`).
  - `initial_employee`: `CreateEmployeeRequest`, required (`employee_no`, `full_name`, `email?`, `phone?`, `job_title`, `address`, `hired_on`; note `branch_id` is ignored/overwritten with the newly created `initial_branch`).
  - `initial_admin`: `CreateUserRequest`, required (`username`, `password` minLength `12`; note `employee_id`, `role`, `branch_scope`, `branch_ids` are ignored/overwritten with `Admin` + `ALL`).
  - `idempotency_key`: `string?`, optional if header sent, maxLength `100`.
- **Response (`201 Created`, `Location: /api/v1/organizations/{organization_id}`):** `OrganizationDto` (`organization_id`, `organization_code`, `name`, `base_currency`, `time_zone_id`, `initial_branch_id`, `initial_employee_id`, `initial_admin_user_id`). Also seeds `OUTBOX_EVENT_CURSOR` and the 3 default inventory locations on the initial branch atomically.
- **Errors:** `400`, `401`, `403`, `404` (BranchLocal), `409 CONFLICT` (duplicate `organization_code`) / `IDEMPOTENCY_MISMATCH`, `422`.

---

### 5.3 Branches & Enrollment

#### 7. `GET /api/v1/branches`
- **Auth:** `[Authorize]` (all roles; `Admin+ALL` sees all org branches, others see only `branch_ids`). **Runtime:** Both.
- **Query Params:** `include_inactive` (`bool`, default `false`), `search` (`string?`, matches `name` or `branch_code`), `page` (`int`, default `1`, min `1`), `page_size` (`int`, default `25`, `1..200`).
- **Response (`200 OK`):** `PagedResult<BranchDto>`.
- **Errors:** `401`, `422` (invalid pagination).

#### 8. `POST /api/v1/branches`
- **Auth:** `OrgAdminOnly` (`Admin` + `ALL`). **Runtime:** `Cloud`-only. **Idempotency:** Header or body.
- **Request (`CreateBranchRequest`):** `branch_code` (req, <=30), `name` (req, <=150), `address` (`AddressDto`, req), `idempotency_key` (`string?`, <=100).
- **Response (`201 Created`, `Location: /api/v1/branches/{branch_id}`):** `BranchDto` (`branch_id`, `organization_id`, `branch_code`, `name`, `address`, `is_active`). Seeds 3 default inventory locations atomically.
- **Errors:** `400`, `401`, `403`, `404` (BranchLocal), `409 CONFLICT` (duplicate `branch_code`) / `IDEMPOTENCY_MISMATCH`, `422`.

#### 9. `GET /api/v1/branches/{id}`
- **Auth:** `[Authorize]` + branch access. **Runtime:** Both.
- **Response (`200 OK`):** `BranchDto`.
- **Errors:** `401`, `403 FORBIDDEN_BRANCH`, `404 NOT_FOUND`.

#### 10. `PATCH /api/v1/branches/{id}`
- **Auth:** `AdminOnly` + branch access; changing `is_active` requires `Admin` + `ALL` (`403 FORBIDDEN` for `ASSIGNED` Admin). **Runtime:** `Cloud`-only. **Idempotency:** Header or body.
- **Request (`UpdateBranchRequest`, true partial PATCH):** `name` (`string?`, <=150, non-blank when provided), `address` (`AddressDto?`), `is_active` (`bool?`), `idempotency_key` (`string?`, <=100). Omitted fields retain existing values.
- **Response (`200 OK`):** `BranchDto`.
- **Errors:** `400`, `401`, `403 FORBIDDEN`/`FORBIDDEN_BRANCH`, `404`, `409 IDEMPOTENCY_MISMATCH`, `422`.

#### 11. `POST /api/v1/branches/{branchId}/enrollment-tokens`
- **Auth:** `AdminOnly` + branch access. **Runtime:** `Cloud`-only. **Idempotency:** **Header-only required** (`Idempotency-Key`, <=100). No request body.
- **Response (`201 Created`, `Location: /api/v1/branches/{branchId}/enrollment-tokens`):** `EnrollmentTokenResponse` (`token: string`, `expires_at: DateTimeOffset` — 15 minutes TTL).
- **Errors:** `400` (missing header), `401`, `403`, `404` (branch not found/inactive or BranchLocal), `409 IDEMPOTENCY_MISMATCH`, `422` (`idempotency_key` > 100).

#### 12. `POST /api/v1/branch-enrollment`
- **Auth:** Public (`[AllowAnonymous]`). **Runtime:** `Cloud`-only (`404` on `BranchLocal`). **Idempotency:** None (single-use token).
- **Request (`RedeemBranchEnrollmentRequest`):** `token` (`string`, required).
- **Response (`200 OK`):** `RedeemBranchEnrollmentResponse` (`organization_id`, `branch_id`, `runtime_credential`, `initial_sync_cursor` from real `OUTBOX_EVENT_CURSOR.last_event_sequence`, `credential_expiry` — 24h TTL).
- **Errors:** `400`, `401 UNAUTHORIZED` (invalid/expired/already-used token or inactive branch), `404` (BranchLocal), `422`.

---

### 5.4 Users

#### 13. `GET /api/v1/users`
- **Auth:** `AdminOnly` + hierarchy (`ASSIGNED` Admin MUST pass an authorized `branch_id`, else `403 FORBIDDEN_BRANCH`). **Runtime:** Both.
- **Query Params:** `branch_id` (`Guid?`), `role` (`UserRole?`), `include_inactive` (`bool`, default `false`), `page` (`int`, default `1`, min `1`), `page_size` (`int`, default `25`, `1..200`).
- **Response (`200 OK`):** `PagedResult<UserDto>`.
- **Errors:** `401`, `403 FORBIDDEN`/`FORBIDDEN_BRANCH`, `422`.

#### 14. `POST /api/v1/users`
- **Auth:** `AdminOnly` + hierarchy. **Runtime:** `Cloud`-only. **Idempotency:** Header or body.
- **Request (`CreateUserRequest`):** `employee_id` (`Guid`, req), `username` (req, <=80), `password` (req, **minLength `12`**), `role` (`UserRole`, req), `branch_scope` (`BranchScope`, default `ASSIGNED`; only `Admin` may use `ALL`), `branch_ids` (`Guid[]`; MUST be empty when `ALL`, MUST be non-empty distinct active org branches when `ASSIGNED`), `idempotency_key` (`string?`, <=100).
- **Response (`201 Created`, `Location: /api/v1/users/{user_id}`):** `UserDto` (`user_id`, `employee_id`, `organization_id`, `username`, `role`, `branch_scope`, `is_active`, `branch_ids`, `last_login_at: DateTimeOffset?`, `lockout_end: DateTimeOffset?`).
- **Errors:** `400`, `401`, `403`, `404` (employee not found/inactive or BranchLocal), `409 CONFLICT` (duplicate username / employee already has account) / `IDEMPOTENCY_MISMATCH`, `422`.

#### 15. `GET /api/v1/users/{id}`
- **Auth:** `AdminOnly` + hierarchy. **Runtime:** Both.
- **Response (`200 OK`):** `UserDto` (includes `last_login_at` and `lockout_end`).
- **Errors:** `401`, `403`, `404`.

#### 16. `PATCH /api/v1/users/{id}`
- **Auth:** `AdminOnly` + hierarchy (cannot change own `role`, `branch_scope`, or `is_active`). **Runtime:** `Cloud`-only. **Idempotency:** Header or body.
- **Request (`UpdateUserRequest`, true partial PATCH):** `role` (`UserRole?`), `branch_scope` (`BranchScope?`), `branch_ids` (`Guid[]?`), `is_active` (`bool?`), `idempotency_key` (`string?`, <=100). Omitted fields (including `branch_ids`) retain existing values! Changing role/scope/branches or deactivating rotates `security_stamp` and revokes all refresh tokens.
- **Response (`200 OK`):** `UserDto`.
- **Errors:** `400`, `401`, `403`, `404`, `409 IDEMPOTENCY_MISMATCH`, `422`.

#### 17. `POST /api/v1/users/{id}/password-reset`
- **Auth:** `AdminOnly` + hierarchy. **Runtime:** `Cloud`-only. **Idempotency:** Header or body.
- **Request (`ResetPasswordRequest`):** `new_password` (`string`, required, **minLength `12`**), `idempotency_key` (`string?`, <=100).
- **Response (`204 No Content`):** Updates hash, rotates `security_stamp`, revokes all refresh tokens.
- **Errors:** `400`, `401`, `403`, `404`, `409 IDEMPOTENCY_MISMATCH`, `422`.

#### 18. `POST /api/v1/users/{id}/revoke-sessions`
- **Auth:** `AdminOnly` + hierarchy. **Runtime:** `Cloud`-only. **Idempotency:** **Header-only required** (`Idempotency-Key`, <=100). No request body.
- **Response (`204 No Content`):** Rotates `security_stamp` and revokes all refresh tokens.
- **Errors:** `400`, `401`, `403`, `404`, `409 IDEMPOTENCY_MISMATCH`, `422`.

---

### 5.5 Employees

#### 19. `GET /api/v1/employees`
- **Auth:** `Admin,Pharmacist` (**`Cashier` receives `403 FORBIDDEN`**) + branch scope (multi-branch `ASSIGNED` users omitting `branch_id` receive all employees across their assigned branches). **Runtime:** Both.
- **Query Params:** `branch_id` (`Guid?`, empty GUID -> `422`), `include_inactive` (`bool`, default `false`), `search` (`string?`, matches `full_name`, `employee_no`, `email`), `page` (`int`, default `1`, min `1`), `page_size` (`int`, default `25`, `1..200`).
- **Response (`200 OK`):** `PagedResult<EmployeeDto>`.
- **Errors:** `401`, `403 FORBIDDEN`/`FORBIDDEN_BRANCH`, `422`.

#### 20. `POST /api/v1/employees`
- **Auth:** `AdminOnly` + branch scope. **Runtime:** `Cloud`-only. **Idempotency:** Header or body.
- **Request (`CreateEmployeeRequest`):** `branch_id` (`Guid`, non-empty req), `employee_no` (req, <=30), `full_name` (req, <=150), `email` (`string?`, EmailAddress, <=254), `phone` (`string?`, <=30), `job_title` (req, <=80), `address` (`AddressDto`, req), `hired_on` (`DateOnly`, default UTC today), `idempotency_key` (`string?`, <=100).
- **Response (`201 Created`, `Location: /api/v1/employees/{employee_id}`):** `EmployeeDto`.
- **Errors:** `400`, `401`, `403`, `404` (branch not found/inactive or BranchLocal), `409 CONFLICT` (duplicate `employee_no` in branch) / `IDEMPOTENCY_MISMATCH`, `422`.

#### 21. `GET /api/v1/employees/{id}`
- **Auth:** `Admin,Pharmacist` (`Cashier` -> `403 FORBIDDEN`) + branch scope. **Runtime:** Both.
- **Response (`200 OK`):** `EmployeeDto`.
- **Errors:** `401`, `403`, `404`.

#### 22. `PATCH /api/v1/employees/{id}`
- **Auth:** `AdminOnly` + branch scope. **Runtime:** `Cloud`-only. **Idempotency:** Header or body.
- **Request (`UpdateEmployeeRequest`, true partial PATCH):** `full_name` (`string?`, <=150, non-blank when set), `email` (`string?`, EmailAddress, <=254), `phone` (`string?`, <=30), `job_title` (`string?`, <=80, non-blank when set), `address` (`AddressDto?`), `is_active` (`bool?`), `idempotency_key` (`string?`, <=100).
- **Response (`200 OK`):** `EmployeeDto`.
- **Errors:** `400`, `401`, `403`, `404`, `409 IDEMPOTENCY_MISMATCH`, `422`.

---

### 5.6 Catalog — Product Categories, Products, UOMs & Reorder Rules

#### 23. `GET /api/v1/product-categories`
- **Auth:** `Admin,Pharmacist,Cashier`. **Runtime:** Both.
- **Query Params:** `parent_category_id` (`Guid?`), `include_inactive` (`bool`, default `false`), `search` (`string?`, case-insensitive match on `name` or `code`), `page` (`int`, default `1`, min `1`), `page_size` (`int`, default `25`, `1..200`).
- **Response (`200 OK`):** `PagedResult<ProductCategoryDto>`.
- **Errors:** `401`, `403`, `422`.

#### 24. `POST /api/v1/product-categories`
- **Auth:** `Admin,Pharmacist`. **Runtime:** `Cloud`-only. **Idempotency:** Header or body.
- **Request (`CreateProductCategoryRequest`):** `parent_category_id` (`Guid?`), `code` (req, <=30), `name` (req, <=100), `description` (`string?`, <=250), `idempotency_key` (`string?`, <=100).
- **Response (`201 Created`, `Location: /api/v1/product-categories/{category_id}`):** `ProductCategoryDto` (`category_id`, `organization_id`, `parent_category_id`, `code`, `name`, `description`, `is_active`, `created_at`, `updated_at`).
- **Errors:** `400`, `401`, `403`, `404` (parent missing/inactive or BranchLocal), `409 CONFLICT` (duplicate `code`) / `IDEMPOTENCY_MISMATCH`, `422`.

#### 25. `GET /api/v1/product-categories/{id}`
- **Auth:** `Admin,Pharmacist,Cashier`. **Runtime:** Both.
- **Response (`200 OK`):** `ProductCategoryDto`.
- **Errors:** `401`, `403`, `404`.

#### 26. `PATCH /api/v1/product-categories/{id}`
- **Auth:** `Admin,Pharmacist`. **Runtime:** `Cloud`-only. **Idempotency:** Header or body.
- **Request (`UpdateProductCategoryRequest`, true partial PATCH):** `parent_category_id` (`Guid?`; cannot equal `{id}` -> `422`; omitted retains existing parent), `name` (`string?`, <=100, non-blank when set), `description` (`string?`, <=250), `is_active` (`bool?`), `idempotency_key` (`string?`, <=100).
- **Response (`200 OK`):** `ProductCategoryDto`.
- **Errors:** `400`, `401`, `403`, `404`, `409 IDEMPOTENCY_MISMATCH`, `422`.

#### 27. `GET /api/v1/products`
- **Auth:** `Admin,Pharmacist,Cashier`. **Runtime:** Both.
- **Query Params:** `category_id` (`Guid?`), `include_inactive` (`bool`, default `false`), `search` (`string?`, case-insensitive match on `name`, `sku`, or `barcode`), `page` (`int`, default `1`, min `1`), `page_size` (`int`, default `25`, `1..200`).
- **Response (`200 OK`):** `PagedResult<ProductDto>` *(each `ProductDto` includes its `uoms[]` collection)*.
- **Errors:** `401`, `403`, `422`.

#### 28. `POST /api/v1/products`
- **Auth:** `Admin,Pharmacist`. **Runtime:** `Cloud`-only. **Idempotency:** Header or body.
- **Request (`CreateProductRequest`):**
  - `category_id` (`Guid`, non-empty req), `sku` (req, <=40), `barcode` (`string?`, <=80), `name` (req, <=180), `generic_name` (`string?`, <=180), `brand_name` (`string?`, <=180), `base_uom_code` (req, <=20), `tax_rate` (`decimal`, `0.0..1.0`), `image_url` (`string?`, <=300), `lot_tracking_required` (`bool`), `expiry_alert_days` (`int`, `>= 0`), `idempotency_key` (`string?`, <=100).
  - `uoms` (`CreateProductUomItemRequest[]`, min 1): each has `uom_code` (req, <=20, unique within request), `display_name` (req, <=50), `conversion_to_base` (`decimal > 0`, MUST be `1` when `is_base=true`), `sale_unit_price` (`decimal?`, required & `>= 0` when `is_sellable=true`, non-negative if set), `is_base` (`bool`, **exactly one** item must have `is_base=true` and `uom_code == base_uom_code`), `is_sellable` (`bool`), `is_purchasable` (`bool`).
- **Response (`201 Created`, `Location: /api/v1/products/{product_id}`):** `ProductDto`. When `lot_tracking_required=false`, initializes the deterministic `NON-LOT` system batch automatically.
- **Errors:** `400`, `401`, `403`, `404` (category missing/inactive or BranchLocal), `409 CONFLICT` (duplicate `sku`/`barcode`) / `IDEMPOTENCY_MISMATCH`, `422`.

#### 29. `GET /api/v1/products/{id}`
- **Auth:** `Admin,Pharmacist,Cashier`. **Runtime:** Both.
- **Response (`200 OK`):** `ProductDto`.
- **Errors:** `401`, `403`, `404`.

#### 30. `PATCH /api/v1/products/{id}`
- **Auth:** `Admin,Pharmacist`. **Runtime:** `Cloud`-only. **Idempotency:** Header or body.
- **Request (`UpdateProductRequest`, true partial PATCH):** All fields nullable (`category_id?`, `sku?`, `barcode?`, `name?`, `generic_name?`, `brand_name?`, `base_uom_code?`, `tax_rate?`, `image_url?`, `lot_tracking_required?`, `expiry_alert_days?`, `is_active?`, `idempotency_key?`). Changing `base_uom_code` or `lot_tracking_required` is rejected with **`409 CONFLICT`** if the product has any stock balance or posted transaction history.
- **Response (`200 OK`):** `ProductDto`.
- **Errors:** `400`, `401`, `403`, `404`, `409 CONFLICT`/`IDEMPOTENCY_MISMATCH`, `422`.

#### 31. `GET /api/v1/products/{id}/uoms`
- **Auth:** `Admin,Pharmacist,Cashier`. **Runtime:** Both.
- **Query Params:** `include_inactive` (`bool`, **default `false`** — returns active UOMs only unless `include_inactive=true`).
- **Response (`200 OK`):** Raw JSON array `ProductUomDto[]` (unpaginated).
- **Errors:** `401`, `403`, `404` (product not found).

#### 32. `POST /api/v1/products/{id}/uoms`
- **Auth:** `Admin,Pharmacist`. **Runtime:** `Cloud`-only. **Idempotency:** Header or body.
- **Request (`CreateProductUomRequest`):** `uom_code` (req, <=20), `display_name` (req, <=50), `conversion_to_base` (`decimal > 0`), `sale_unit_price` (`decimal?`, req `>= 0` if `is_sellable`), `is_base` (`bool`, cannot add a second base UOM), `is_sellable` (`bool`), `is_purchasable` (`bool`), `idempotency_key` (`string?`, <=100).
- **Response (`201 Created`, `Location: /api/v1/products/{id}/uoms/{product_uom_id}`):** `ProductUomDto`.
- **Errors:** `400`, `401`, `403`, `404`, `409 CONFLICT` (duplicate `uom_code`) / `IDEMPOTENCY_MISMATCH`, `422`.

#### 33. `PATCH /api/v1/products/{id}/uoms/{uomId}`
- **Auth:** `Admin,Pharmacist`. **Runtime:** `Cloud`-only. **Idempotency:** Header or body.
- **Request (`UpdateProductUomRequest`, true partial PATCH):** `display_name?` (<=50), `conversion_to_base?` (`> 0`; **`409 CONFLICT`** if UOM is referenced by stock/history), `sale_unit_price?` (`>= 0`; **live quirk:** passing `is_sellable: false` with `sale_unit_price` omitted or `null` clears `sale_unit_price` back to `null`, whereas omitting `sale_unit_price` while `is_sellable` remains `true` preserves existing price), `is_sellable?`, `is_purchasable?`, `is_active?` (cannot deactivate base UOM -> `422`), `idempotency_key?` (<=100).
- **Response (`200 OK`):** `ProductUomDto`.
- **Errors:** `400`, `401`, `403`, `404`, `409 CONFLICT`/`IDEMPOTENCY_MISMATCH`, `422`.

#### 34. `GET /api/v1/branches/{branchId}/products/{productId}/reorder-rule`
- **Auth:** `Admin,Pharmacist,Cashier` + branch access. **Runtime:** Both.
- **Response (`200 OK`):** `ReorderRuleDto`.
- **Errors:** `401`, `403 FORBIDDEN`/`FORBIDDEN_BRANCH`, `404 NOT_FOUND`.

#### 35. `PUT /api/v1/branches/{branchId}/products/{productId}/reorder-rule`
- **Auth:** `Admin,Pharmacist` + branch access. **Runtime:** `Cloud`-only. **Idempotency:** Header or body.
- **Request (`UpsertReorderRuleRequest`):** `reorder_point_base` (`decimal >= 0`), `reorder_quantity_base` (`decimal >= 0`), `max_quantity_base` (`decimal?`, if set must be `>= reorder_point_base`), `is_active` (`bool`), `idempotency_key` (`string?`, <=100).
- **Response (`200 OK`):** `ReorderRuleDto` (advisory-locked upsert).
- **Errors:** `400`, `401`, `403`, `404` (branch/product not found or BranchLocal), `409 IDEMPOTENCY_MISMATCH`, `422`.

---

### 5.7 Inventory — Locations, Batches, Balances, Summary, Transactions & Adjustments

#### 36. `GET /api/v1/inventory/locations`
- **Auth:** `Admin,Pharmacist,Cashier` + branch access. **Runtime:** Both.
- **Query Params:** `branch_id` (**required** non-empty `Guid`, else `422`), `is_sellable` (`bool?`), `include_inactive` (`bool`, default `false`), `page` (`int`, default `1`, min `1`), `page_size` (`int`, default `25`, `1..200`).
- **Response (`200 OK`):** `PagedResult<InventoryLocationDto>`.
- **Errors:** `401`, `403 FORBIDDEN`/`FORBIDDEN_BRANCH`, `422`.

#### 37. `POST /api/v1/inventory/locations`
- **Auth:** `Admin,Pharmacist` + branch access. **Runtime:** Both (`Cloud` & `BranchLocal`). **Idempotency:** Header or body.
- **Request (`CreateInventoryLocationRequest`):** `branch_id` (`Guid`, non-empty req), `location_code` (req, <=30), `name` (req, <=100), `location_type` (`LocationType`), `is_sellable` (`bool`; MUST be `false` unless `location_type == "SELLABLE"`), `idempotency_key` (`string?`, <=100).
- **Response (`201 Created`, `Location: /api/v1/inventory/locations/{location_id}`):** `InventoryLocationDto`.
- **Errors:** `400`, `401`, `403`, `409 CONFLICT` (duplicate `location_code` in branch) / `IDEMPOTENCY_MISMATCH`, `422`.

#### 38. `PATCH /api/v1/inventory/locations/{id}`
- **Auth:** `Admin,Pharmacist` + branch access. **Runtime:** Both. **Idempotency:** Header or body.
- **Request (`UpdateInventoryLocationRequest`, true partial PATCH):** `name?` (<=100, non-blank when set), `is_sellable?` (`true` rejected with `422` if `location_type != "SELLABLE"`), `is_active?`, `idempotency_key?` (<=100).
- **Response (`200 OK`):** `InventoryLocationDto`.
- **Errors:** `400`, `401`, `403`, `404`, `409 IDEMPOTENCY_MISMATCH`, `422`.

#### 39. `GET /api/v1/inventory/batches`
- **Auth:** `[Authorize]` (org-scoped; no `branch_id` filter). **Runtime:** Both.
- **Query Params:** `product_id` (`Guid?`), `status` (`BatchQualityStatus?`), `expiring_before` (`DateOnly?`, **inclusive `expires_on <= expiring_before`**, excludes `NON-LOT` rows with `expires_on == null`), `page` (`int`, default `1`, min `1`), `page_size` (`int`, default `25`, `1..200`).
- **Response (`200 OK`):** `PagedResult<InventoryBatchDto>` (ordered by `expires_on`, `batch_number`).
- **Errors:** `401`, `422`.

#### 40. `GET /api/v1/inventory/balances`
- **Auth:** `[Authorize]` + branch access. **Runtime:** Both.
- **Query Params:** `branch_id` (**required** non-empty `Guid`, else `422`), `product_id` (`Guid?`), `location_id` (`Guid?`), `batch_id` (`Guid?`).
- **Response (`200 OK`):** **Raw JSON array `StockBalanceDto[]` (unpaginated live quirk!)**. Each row exposes `organization_id`, `branch_id`, `product_id`, `product_sku`, `product_name`, `base_uom_code`, `location_id`, `location_code`, `location_type`, `is_location_sellable`, `batch_id`, `batch_number`, `manufactured_on`, `expires_on`, `quality_status`, `on_hand_qty_base`, `available_qty_base` (computed using `Organization.TimeZoneId`), `average_unit_cost`, `updated_at`. *(Zero `reserved_quantity` field.)*
- **Errors:** `401`, `403 FORBIDDEN_BRANCH`, `422`.

#### 41. `GET /api/v1/inventory/summary`
- **Auth:** `[Authorize]` + branch access. **Runtime:** Both.
- **Query Params:** `branch_id` (**required** non-empty `Guid`), `product_id` (**required** non-empty `Guid`).
- **Response (`200 OK`):** `InventorySummaryDto` (`organization_id`, `branch_id`, `product_id`, `base_uom_code`, `total_on_hand_qty_base`, `total_available_qty_base`, `weighted_average_unit_cost_base`, `locations_and_lots: StockBalanceDto[]`).
- **Errors:** `401`, `403 FORBIDDEN_BRANCH`, `422` (`branch_id`, `product_id`).

#### 42. `GET /api/v1/inventory/transactions`
- **Auth:** `[Authorize]` + branch access. **Runtime:** Both.
- **Query Params:** `branch_id` (**required** non-empty `Guid`), `type` (`InventoryTransactionType?`), `product_id` (`Guid?`), `from_date` (`DateTimeOffset?`), `to_date` (`DateTimeOffset?`), `page` (`int`, default `1`, min `1`), `page_size` (`int`, default `25`, `1..200`).
- **Response (`200 OK`):** `PagedResult<InventoryTxnDto>` (each includes `lines: InventoryTxnLineDto[]`).
- **Errors:** `401`, `403 FORBIDDEN_BRANCH`, `422`.

#### 43. `POST /api/v1/inventory/adjustments`
- **Auth:** `Admin,Pharmacist` (both roles allowed for ALL adjustment types including `OPENING_BALANCE`; `Cashier` -> `403 FORBIDDEN`) + branch access. **Runtime:** **`BranchLocal`-only** (`Cloud` returns **`404 NOT_FOUND`** before auth). **Idempotency:** Header or body.
- **Request (`CreateInventoryAdjustmentRequest`):**
  - `branch_id`: `Guid`, non-empty required.
  - `transaction_type`: `InventoryTransactionType`, restricted to `"OPENING_BALANCE"`, `"ADJUSTMENT_IN"`, `"ADJUSTMENT_OUT"`, or `"REVERSAL"`.
  - `reason_code`: `string?`, optional, maxLength `40`.
  - `note`: `string?`, optional, maxLength `500`.
  - `reverses_inventory_txn_id`: `Guid?`, **required** (non-empty) when `transaction_type == "REVERSAL"`.
  - `lines`: `CreateInventoryAdjustmentLineRequest[]?` — **omitted/null allowed for `REVERSAL`**; required (`count >= 1`) for `OPENING_BALANCE`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`:
    - `product_id` (non-empty `Guid`), `product_uom_id` (non-empty `Guid`, any active UOM of the product), `location_id` (non-empty `Guid`, active location in `branch_id`), `batch_number` (`string?`, <=80; required non-`NON-LOT` if `lot_tracking_required=true`, must be null/blank/`"NON-LOT"` if `lot_tracking_required=false`), `manufactured_on` (`DateOnly?`, must be `<= expires_on`), `expires_on` (`DateOnly?`, required if `lot_tracking_required=true`, must be `null` if `lot_tracking_required=false`), `entered_qty` (`decimal > 0`), `unit_cost_entered` (`decimal?`, required & `>= 0` for `OPENING_BALANCE` and `ADJUSTMENT_IN`).
  - `idempotency_key`: `string?`, optional if header sent, maxLength `100`.
- **Response (`201 Created`, `Location: /api/v1/inventory/transactions/{inventory_txn_id}`):** `InventoryTxnDto` (`status: "POSTED"`).
  - **Base-UOM Ledger Normalization (Blueprint §8.9.12):** For standard adjustments, every persisted and returned `InventoryTxnLineDto` is normalized to the product's active **base UOM** (`product_uom_id = baseUomId`, `entered_qty = Math.Abs(quantity_delta_base)`, `conversion_snapshot = 1`, `unit_cost_base = Round(unit_cost_entered / conversion_to_base, 4, AwayFromZero)`).
- **Errors:** `400`, `401`, `403`, `404` (Cloud runtime guard or missing location/product/UOM/original txn), `409 OUT_OF_STOCK` / `INVALID_STATE_TRANSITION` / `CONFLICT` / `IDEMPOTENCY_MISMATCH`, `422`.

---

### 5.8 Canonical Integration Endpoints

#### 44. `GET /api/v1/canonical/capabilities`
- **Auth:** Public (`[AllowAnonymous]`). **Runtime:** Both.
- **Response (`200 OK`):** `CanonicalCapabilitiesDto` (`stage: 1`, `runtime_mode: "Cloud" | "BranchLocal"`, `supported_reads: string[]`, `supported_writes: string[]`).

#### 45. `GET /api/v1/canonical/products`
- **Auth:** `Admin,Pharmacist`. **Runtime:** `Cloud`-only (`404` on `BranchLocal`).
- **Query Params:** `updated_since` (`DateTimeOffset?`, inclusive `>=`), `cursor` (`string?`, opaque Base64Url keyset cursor), `limit` (`int`, default `50`, clamped `1..1000`).
- **Response (`200 OK`):** `CanonicalProductFeedPageDto` (`{ "items": CanonicalProductDto[], "next_cursor": string | null }`). Each item has `schema: "canonical.Product"`, `version: "1.0"`, `organization_id`, `id`, `sku`, `barcode`, `name`, `category_id`, `category_name`, `base_uom_code`, `tax_rate`, `lot_tracking_required`, `is_active`, `supported_conversions: CanonicalUomConversionDto[]`, `updated_at`.
- **Errors:** `401`, `403`, `404` (BranchLocal), `422` (invalid `cursor`).

#### 46. `POST /api/v1/canonical/configuration/products`
- **Auth:** `Admin,Pharmacist`. **Runtime:** `Cloud`-only. **Idempotency:** Header or body.
- **Request (`CanonicalProductConfigurationRequest`):**
  - Common required: `request_id` (non-empty `Guid`), `source_prompt_id` (req, <=100), `action` (`CatalogConfigurationAction`: `CreateProduct` | `UpdateProduct` | `AddUom` | `UpdateUom` | `DeactivateUom`), `idempotency_key` (optional in body when header provided, <=100).
  - Action-specific fields:
    - `CreateProduct`: requires `category_id`, `sku`, `name`, `base_uom_code`, `lot_tracking_required`, `tax_rate`, `expiry_alert_days`, `uoms[]` (`CanonicalUomItemDto[]`); optional `barcode`, `generic_name`, `brand_name`, `image_url`.
    - `UpdateProduct`: requires `product_id`; optional product fields + `is_active`.
    - `AddUom`: requires `product_id`, `uom_code`, `display_name`, `conversion_to_base`; optional `sale_unit_price`, `is_base` (default `false`), `is_sellable` (default `false`), `is_purchasable` (default `true`).
    - `UpdateUom`: requires `product_id`, `product_uom_id`; optional `display_name`, `conversion_to_base`, `sale_unit_price`, `is_sellable`, `is_purchasable`, `is_active`.
    - `DeactivateUom`: requires `product_id`, `product_uom_id` (cannot deactivate base UOM -> `409 CONFLICT`).
- **Response:** **`201 Created`** (`Location` header) for `CreateProduct`/`AddUom`; **`200 OK`** for `UpdateProduct`/`UpdateUom`/`DeactivateUom`. Body: `CanonicalWriteResultDto` (`request_id`, `status: "APPLIED"`, `target_entity_id`, `entity_type: "PRODUCT" | "PRODUCT_UOM"`, `executed_at`).
- **Errors:** `400`, `401`, `403`, `404`, `409`, `422`.

#### 47. `PUT /api/v1/canonical/configuration/reorder-rules`
- **Auth:** `Admin,Pharmacist` + branch access. **Runtime:** `Cloud`-only. **Idempotency:** Header or body.
- **Request (`CanonicalReorderRuleConfigurationRequest`):** `request_id` (non-empty `Guid`), `source_prompt_id` (req, <=100), `idempotency_key` (optional in body when header provided, <=100), `branch_id` (non-empty `Guid`), `product_id` (non-empty `Guid`), `reorder_point_base` (`>= 0`), `reorder_quantity_base` (`>= 0`), `max_quantity_base` (`decimal?`, `>= reorder_point_base`), `is_active` (`bool`, default `true`).
- **Response (`200 OK`):** `CanonicalWriteResultDto` (`request_id`, `status: "APPLIED"`, `target_entity_id`, `entity_type: "PRODUCT_REORDER_RULE"`, `executed_at`).
- **Errors:** `400`, `401`, `403`, `404`, `409`, `422`.

#### 48. `GET /api/v1/canonical/inventory`
- **Auth:** `[Authorize]` (all authenticated roles) + branch access. **Runtime:** `Cloud`-only (`404` on `BranchLocal`).
- **Query Params:** `organization_id` (`Guid?`; if provided and `!= tenant`, returns `403 FORBIDDEN`), `branch_id` (**required** non-empty `Guid`), `product_id` (`Guid?`), `updated_since` (`DateTimeOffset?`), `cursor` (`long?`, non-negative integer offset), `limit` (`int`, default `100`, clamped `1..1000`).
- **Response (`200 OK`):** `PagedResult<CanonicalInventoryItemDto>`. Each item has `schema: "canonical.InventoryItem"`, `version: "1.0"`, `organization_id`, `branch_id`, `product_id`, `location_id`, `base_uom_code`, `quantity_on_hand_base`, `available_quantity_base`, `average_unit_cost_base`, `reorder_point_base`, `lots[]` (`batch_id`, `batch_number`, `quantity_on_hand_base`, `available_quantity_base`, `manufactured_on`, `expires_on`, `quality_status`), `updated_at`. *(Zero `reserved_quantity` field; availability uses `Organization.TimeZoneId`.)*
- **Errors:** `401`, `403 FORBIDDEN`/`FORBIDDEN_BRANCH`, `404` (branch not found or BranchLocal), `422` (empty `branch_id`).
