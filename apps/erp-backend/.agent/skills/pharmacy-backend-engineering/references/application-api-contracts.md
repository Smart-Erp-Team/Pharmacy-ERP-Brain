# Application, API & Wire Contracts Reference

## 1. Application Layer (`src/PharmacyERP.Application/`)

### 1.1 Feature Layout & Modular DI
Organize features under `src/PharmacyERP.Application/Features/<Module>/`:
- `DTOs/` — Immutable `record` request/response DTOs matching exact Blueprint JSON property names.
- `Repositories/Interfaces/` — Focused repository interfaces (never add repository properties to `IUnitOfWork`).
- `Services/Interfaces/` & `Services/Implementations/` — Registered as `Scoped` in the developer's modular feature DI extension (invoked from `DependencyInjection.cs` without touching root `Program.cs`).
- `Validators/` — Input validation returning structured `ApiErrorDetailDto` field errors with exact **`snake_case`** `Field` names.

Inject shared Stage 1 contracts via constructor injection:
- `IUnitOfWork`, `ITenantContext`, `ICurrentUser`
- `IDateTimeProvider` (never call `DateTime.UtcNow` / `DateTimeOffset.UtcNow` directly; use `GetOrganizationBusinessDate(ianaTimeZoneId)` for business dates)
- `IRuntimeModeProvider` (`CurrentMode`: `Cloud` vs. `BranchLocal`, `EnrolledBranchId`)
- `IIdempotencyService` (uses `CanonicalJsonHasher` SHA-256 internally)
- `IAuditLogger`, `IOutboxService`
- Reference only active `INonLotBatchInitializer` and `IProductInventoryUsageChecker` (ignore legacy `*2.cs` interfaces in Stage 2/3 code).

### 1.2 `Result` / `Result<T>` Error Mapping

| `ErrorCode` | HTTP Status | When to Use |
| :--- | :---: | :--- |
| `MALFORMED_REQUEST` | `400` | Null/unparseable payload or missing `Idempotency-Key` (both header and body empty) |
| `UNAUTHORIZED` | `401` | Unauthenticated or invalid credentials/token |
| `FORBIDDEN` | `403` | Role/policy denial or cross-tenant `organization_id` mismatch |
| `FORBIDDEN_BRANCH` | `403` | Caller lacks access to target `branchId` (`!_currentUser.CanAccessBranch(branchId)`) |
| `NOT_FOUND` | `404` | Entity does not exist within caller's tenant/scope (or blocked by `RuntimeModeGuardMiddleware`) |
| `CONFLICT` | `409` | Duplicate unique key, `row_version` concurrency conflict, or PostgreSQL deadlock/serialization (`40P01`/`40001`) |
| `INVALID_STATE_TRANSITION` | `409` | Illegal status transition (e.g., completing a cancelled order or double-posting a return) |
| `OUT_OF_STOCK` | `409` | Insufficient available `on_hand_qty_base` for issue/sale/return-out |
| `IDEMPOTENCY_MISMATCH` | `409` | Same `Idempotency-Key` reused with a different canonical payload hash |
| `SYNC_CURSOR_EXPIRED` | `409` | Sync pull cursor is older than the retained outbox window (Stage 2 Sync) |
| `VALIDATION_ERROR` | `422` | Business/field validation errors (include `IReadOnlyList<ApiErrorDetailDto>` with `snake_case` field names) |
| `EXPIRY_POLICY_VIOLATION` | `422` | Selling/issuing expired or quarantined batch in violation of pharmacy expiry policy |

### 1.3 Mandatory Explicit Transaction Templates

**Read Transaction (Required by `TenantRlsConnectionInterceptor`):**
```csharp
if (!_tenantContext.IsTenantBound || !_tenantContext.OrganizationId.HasValue)
{
    return Result<MyDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
}

if (!_currentUser.CanAccessBranch(branchId))
{
    return Result<MyDto>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);
}

await _unitOfWork.BeginTransactionAsync(ct);
try
{
    var entity = await _repository.GetByIdAsync(organizationId, id, ct);
    if (entity is null)
    {
        return Result<MyDto>.Failure(ErrorCode.NOT_FOUND, "Resource not found.");
    }

    return Result<MyDto>.Success(MapToDto(entity));
}
finally
{
    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
}
```

**Atomic Write Transaction (Idempotency + Mutation + Audit + Outbox):**
```csharp
// 1. Validate inputs, tenant context, role/branch access, and non-empty IdempotencyKey BEFORE opening transaction.
await _unitOfWork.BeginTransactionAsync(ct);
try
{
    var idempotencyCheck = await _idempotencyService.CheckAsync<MyRequest, MyResponse>(
        operationScope: "sales.orders.create",
        idempotencyKey: resolvedIdempotencyKey,
        branchId: request.BranchId,
        requestPayload: payloadForHash,
        ct: ct);

    if (idempotencyCheck.IsReplay && idempotencyCheck.ReplayedResponse is not null)
    {
        await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
        return Result<MyResponse>.Success(idempotencyCheck.ReplayedResponse);
    }

    // 2. Domain & cross-module mutations (deterministic lock order).
    //    On ANY early Result.Failure(...) inside the transaction: ALWAYS RollbackTransactionAsync(CancellationToken.None) before returning!
    // 3. _auditLogger.LogAsync(...)
    // 4. _outboxService.EnqueueAsync(...)
    // 5. _idempotencyService.PersistResponseAsync(...)
    await _unitOfWork.CommitTransactionAsync(ct);
    return Result<MyResponse>.Success(response);
}
catch
{
    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
    throw;
}
```

---

## 2. API Layer & Wire Contracts (`src/PharmacyERP.Api/`)

### 2.1 Thin Controllers & `Idempotency-Key`
- Place controllers (or per-developer partial controller files) under `src/PharmacyERP.Api/Controllers/` with `[ApiController]` and `[Route("api/v1/...")]`.
- Controllers only validate model/headers, invoke a single Application service method, and map responses via `ApiResultMapper`:
  - `ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId)` (`200 OK` / `204 No Content`)
  - `ApiResultMapper.ToCreatedResult(this, result, _currentUser.TraceId, locationUri)` (`201 Created` + `Location` header for resource creation like `POST /api/v1/sales-orders` and `POST /api/v1/sales-returns`)
  - `ApiResultMapper.ToMissingIdempotencyKeyResult(...)` (`400 MALFORMED_REQUEST` when both header and body omit `Idempotency-Key`)
- On every mutating request DTO: declare `string? IdempotencyKey = null` as the **trailing optional parameter** so Swashbuckle does not mark `idempotency_key` required in the body when sent via header.
- On every mutating controller action: apply `[AllowHeaderIdempotencyKey]` and give `[FromHeader(Name = "Idempotency-Key")]` precedence over `request.IdempotencyKey`; reject length `> 100` with `422 VALIDATION_ERROR`.

### 2.2 Strict `snake_case` & Pagination Rules
- Global `DependencyInjection.ApiJsonSerializerOptions` enforces `JsonNamingPolicy.SnakeCaseLower` + `JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false)`.
- **Decimals** serialize as native JSON numbers (never strings); **Enums** serialize as exact case-sensitive strings (integers rejected with `422`).
- Every `[FromQuery]` parameter MUST specify explicit `[FromQuery(Name = "snake_case")]` (e.g., `branch_id`, `page_size`, `from_date`, `to_date`, `invoice_no`, `payment_status`, `invoice_id`, `since_cursor`).
- Every `ApiErrorDetailDto.Field` MUST use exact wire `snake_case` (e.g., `cash_tendered_amount`, `lines[0].entered_qty`, `lines[0].invoice_line_id`, `idempotency_key`, `page_size`).
- Standard ERP list endpoints use `page = 1`, `page_size = 25` with strict validation `page >= 1` and `1 <= page_size <= 200` (out-of-range -> `422 VALIDATION_ERROR`).
- Canonical list endpoints (`/products`, `/inventory`, `/sales`, `/orders`, `/returns`) use `string? cursor` backed by `OUTBOX_EVENT.event_sequence` and `PagedResult<T>`.

### 2.3 Authorization & `RuntimeModeGuardMiddleware`
- Enforce `[Authorize]` / named policies (`AuthorizationPoliciesExtensions.cs`).
- Keep `RuntimeModeGuardMiddleware.cs` synced:
  - **BranchLocal-only mutations** (stock adjustments, POS orders/checkout, sales returns) -> `404 NOT_FOUND` on `Cloud`.
  - **Cloud-only endpoints** (org provisioning, master catalog writes, canonical sync config) -> `404 NOT_FOUND` on `BranchLocal`.
- Never alter middleware order in `MiddlewareExtensions.cs`:
  `DevRequestErrorLogMiddleware` (Dev only) -> `ExceptionHandlingMiddleware` -> `TraceparentMiddleware` -> `UseCors` -> `RuntimeModeGuardMiddleware` -> `UseHttpsRedirection` -> `UseAuthentication` -> `TenantResolutionMiddleware` -> `UseAuthorization`.

### 2.4 Mandatory `ContractsArtifactSyncTests` & OpenAPI Snapshot Sync
Every Controller Action MUST declare complete `[ProducesResponseType]` attributes (success + all `ApiErrorEnvelopeDto` error statuses).
Whenever a PR adds/modifies an `ErrorCode`, HTTP endpoint, DTO, or `/canonical/capabilities`:
1. Update `tests/PharmacyERP.IntegrationTests/Api/ContractsArtifactSyncTests.cs` (`ExpectedLiveEndpoints` + enum/capability assertions).
2. Update `apps/erp-backend/contracts/schemas/*.json` (when `ErrorCode` or `CanonicalCapabilities` changes).
3. Regenerate `apps/erp-backend/contracts/openapi.v1.json`:
   ```powershell
   $env:UPDATE_OPENAPI_SNAPSHOT="true"
   dotnet test tests/PharmacyERP.IntegrationTests/PharmacyERP.IntegrationTests.csproj --filter ContractsArtifactSyncTests
   Remove-Item Env:UPDATE_OPENAPI_SNAPSHOT
   ```
4. Update `apps/erp-backend/contracts/README.md`.
*(Wave 3/4 export tasks `AS-08` and `AH-FINAL` synchronize the final Stage 2 artifacts to the shared monorepo-root `contracts/` directory.)*
