---
name: pharmacy-backend-engineering
description: Core Stage 2 and Stage 3 backend engineering patterns for PharmacyERP grounded in the Stage 1 codebase. Use when implementing Domain entities, EF Core configurations and migrations, Application services, API controllers, PostgreSQL RLS/immutability rules, and Unit/Integration tests inside apps/erp-backend/.
---

# PharmacyERP Backend Engineering Skill (Stage 2 & Stage 3)

Use this skill alongside `.agent/rules/00-backend-guardrails.md` and `.agent/skills/pharmacy-stage1-baseline/SKILL.md` whenever building or modifying features in `apps/erp-backend/`.

---

## 1. Domain Layer (`src/PharmacyERP.Domain/`)

### 1.1 Entities & Invariants
- Place module entities in `src/PharmacyERP.Domain/Entities/<Module>/` (`Sales/`, `Purchasing/`, matching `Identity/`, `Catalog/`, `Inventory/`, `Integration/`).
- Every tenant-owned entity MUST expose `public Guid OrganizationId { get; private set; }` (required for `PharmacyDbContext`'s dynamic global query filter and PostgreSQL RLS).
- Enforce structural invariants inside entity constructors, factory methods, and state-transition methods:
  - Validate required IDs (`Guid.Empty`), non-empty trimmed codes/names, non-negative quantities/prices/amounts, and valid state transitions (`DRAFT -> POSTED`, `OPEN -> CLOSED`, etc.).
  - Throw `DomainException` (or a module-specific subclass under `src/PharmacyERP.Domain/Exceptions/`, e.g., `SalesDomainException` / `PurchasingDomainException`, matching `InventoryDomainExceptions.cs`) only for impossible domain invariants.
  - Keep entities persistence-ignorant (zero EF Core, Npgsql, or ASP.NET Core attributes/references).

### 1.2 Enums & Closed Value Sets
- Define enums under `src/PharmacyERP.Domain/Enums/`.
- Enums serialize as **exact string names** both in JSON (`JsonStringEnumConverter` configured globally in `src/PharmacyERP.Api/DependencyInjection.cs`) and in PostgreSQL (`.HasConversion<string>()` in EF Core configurations).
- Every enum or closed string column MUST have a matching **exact case-sensitive PostgreSQL `CHECK` constraint** (e.g., `CK_INVENTORY_TXN_status`: `status IN ('DRAFT', 'POSTED', 'CANCELLED')` in `InventoryTxnConfiguration.cs`).

### 1.3 Value Objects & Financial / Quantity Precision
- Reuse `Address` (`src/PharmacyERP.Domain/ValueObjects/Address.cs`) and `DeterministicBatchIdGenerator` (`src/PharmacyERP.Domain/ValueObjects/DeterministicBatchIdGenerator.cs`) where applicable.
- Follow Blueprint decimal precision & rounding conventions strictly:
  - **Quantities, unit prices, unit costs, stock balances:** `numeric(18,4)` — round derived base quantities (`entered_qty * conversion_snapshot`) and base unit costs to 4 decimal places (`MidpointRounding.AwayFromZero`).
  - **Monetary document totals (line totals, subtotals, tax amounts, discounts, invoice/receipt grand totals, payments, cash drawer counts):** `numeric(18,2)` — round monetary totals to 2 decimal places (`MidpointRounding.AwayFromZero`).
  - **UOM conversion factors (`conversion_to_base`, `conversion_snapshot`):** `numeric(18,6)`.
  - **Tax / discount rates (`tax_rate`, percentage rates in `[0, 1]`):** `numeric(9,4)`.

---

## 2. Persistence & EF Core (`src/PharmacyERP.Infrastructure/Persistence/`)

### 2.1 Wave 0 `PharmacyDbContext` Partial Classes
- **NEVER edit `src/PharmacyERP.Infrastructure/Persistence/Database/PharmacyDbContext.cs`.**
  It already applies `ApplyConfigurationsFromAssembly(...)`, dynamically attaches the `OrganizationId` tenant global query filter (`_tenantContext.IsSystemBypassEnabled || EF.Property<Guid>(e, "OrganizationId") == _tenantContext.OrganizationId`), and enforces `DeleteBehavior.Restrict` on every FK.
- Add new module `DbSet<T>` declarations in a dedicated partial class:
  - Stage 2 Sales: `src/PharmacyERP.Infrastructure/Persistence/Database/PharmacyDbContext.Sales.cs`
  - Stage 3 Purchasing: `src/PharmacyERP.Infrastructure/Persistence/Database/PharmacyDbContext.Purchasing.cs`

### 2.2 Entity Type Configurations (`Configurations/<Module>/<Entity>Configuration.cs`)
Create exactly **one `IEntityTypeConfiguration<T>` per entity**:
- **Table & Schema:** `builder.ToTable("UPPER_SNAKE_NAME", "<schema>")` (e.g., `"sales"`, `"purchasing"`, `"inventory"`).
- **Columns:** Explicit `snake_case` `.HasColumnName(...)`, explicit `.HasColumnType(...)` (`varchar(N)`, `char(2)`, `numeric(18,4)` / `numeric(18,2)` / `numeric(18,6)` / `numeric(9,4)`, `timestamptz`, `date`), and `.ValueGeneratedNever()` on client-generated GUID PKs.
- **Address Mapping:**
  - For **required** `Address` properties, use `builder.ComplexProperty(x => x.Address, ...)` mapping `address_line1`, `address_line2`, `address_city`, `address_region`, `address_postal_code`, `address_country_code` (Stage 1 A-01 pattern in `OrganizationConfiguration`, `BranchConfiguration`, `EmployeeConfiguration`).
  - For **optional/nullable** `Address?` properties (e.g., optional customer/supplier addresses in Stage 2/3), use `builder.OwnsOne(x => x.Address, ...)` with the exact same `address_*` column names and types (since nullable owned types map cleanly to nullable columns in Npgsql/EF Core).
- **Composite Alternate Keys & Tenant-Scoped FKs:**
  - Declare `builder.HasAlternateKey(x => new { x.OrganizationId, x.<EntityId> });` (and `(OrganizationId, BranchId, <EntityId>)` when branch-scoped, as in `InventoryTxnConfiguration.cs`).
  - Configure all tenant-scoped FKs as composite keys with `.HasPrincipalKey(...)` and `.OnDelete(DeleteBehavior.Restrict)`:
    ```csharp
    builder.HasOne<Branch>()
        .WithMany()
        .HasForeignKey(x => new { x.OrganizationId, x.BranchId })
        .HasPrincipalKey(x => new { x.OrganizationId, x.BranchId })
        .OnDelete(DeleteBehavior.Restrict);
    ```
- **Check Constraints & Indexes:**
  - Add `HasCheckConstraint` for every enum string set, non-negative amount/quantity, and range invariant.
  - Add covering/composite indexes prefixed by `OrganizationId` (and `BranchId` when branch-scoped) matching real query filters and keyset sorts. Use partial unique indexes (`.HasFilter(...)`) where nullable or active-only uniqueness applies (see `ProductConfiguration.cs`, `ProductUomConfiguration.cs`, `OutboxEventConfiguration.cs`).
- **Concurrency & Locking:**
  - Add `RowVersion` (`long`, column `row_version`, `.IsConcurrencyToken().IsRequired()`) on mutable aggregate roots subject to concurrent updates (see `StockBalanceConfiguration.cs`).
  - For pessimistic row locking inside repositories, acquire `FOR UPDATE` locks in a **strict deterministic sort order** (e.g., ordered by `(LocationId, BatchId)` as in `StockBalanceRepository`) to eliminate PostgreSQL deadlocks (`40P01`).

### 2.3 Migrations, PostgreSQL RLS, Least-Privilege Grants & Immutability Triggers
When creating a migration via `dotnet ef migrations add <Name> --project src/PharmacyERP.Infrastructure/PharmacyERP.Infrastructure.csproj --startup-project src/PharmacyERP.Api/PharmacyERP.Api.csproj --output-dir Persistence/Migrations`:
1. **RLS Protection:** Register every new tenant-owned table in `src/PharmacyERP.Infrastructure/Persistence/Triggers/RlsAndAuditProtectionSql.cs` and execute `RlsAndAuditProtectionSql.GenerateEnableRlsSql(schema, table)` inside the migration's `Up(...)` method so every table has `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and `tenant_isolation_policy`.
2. **Schema & Role Security:** Whenever introducing a new PostgreSQL schema (e.g., `sales`, `purchasing`):
   - Create the schema (`CREATE SCHEMA IF NOT EXISTS sales AUTHORIZATION erp_migrator;` or equivalent migration SQL).
   - Update `src/PharmacyERP.Infrastructure/Persistence/Security/DatabaseRoleSecuritySql.cs`:
     * Add the schema to `TableRlsStatusCheckSql` (so `DatabaseSecurityStartupCheck` enforces `relrowsecurity` & `relforcerowsecurity` on startup).
     * Add schema grants in `GenerateRoleProvisioningTemplateSql()` and `GenerateAppRoleGrantsSql()` for `erp_app`.
     * Call `DatabaseRoleSecuritySql.GenerateAppRoleGrantsSql()` in the migration's `Up(...)`.
3. **Immutability Triggers:** For posted financial documents, payment ledgers, or stock movements that must never be mutated/deleted after posting, add dedicated PostgreSQL `BEFORE UPDATE OR DELETE` trigger SQL under `src/PharmacyERP.Infrastructure/Persistence/Triggers/` (following `InventoryLedgerImmutabilitySql.cs`) and invoke it in both the migration and `ThrowawayPostgresDatabaseProvisioner` (`tests/PharmacyERP.IntegrationTests/CustomWebApplicationFactory.cs`).

### 2.4 Repository Query Hygiene
- Use `.AsNoTracking()` on **every** read-only query.
- Avoid N+1 loops: batch-fetch related entities (`GetByIdsAsync`, `GetOrCreateBatchesAsync`, `GetOrCreateForUpdateBatchAsync`) and project lean DTOs directly in SQL where possible.
- Always propagate `CancellationToken ct` to every async EF Core call.

---

## 3. Application Layer (`src/PharmacyERP.Application/`)

### 3.1 Feature Layout & Constructor Injection
Organize each feature under `src/PharmacyERP.Application/Features/<Module>/`:
- `DTOs/` — Immutable `record` request/response DTOs matching exact Blueprint JSON property names.
- `Repositories/Interfaces/` — Focused repository interfaces (never bloat `IUnitOfWork` with repository properties).
- `Services/Interfaces/` & `Services/Implementations/` — Application services registered as `Scoped` in `src/PharmacyERP.Application/DependencyInjection.cs` (or a modular `Add<Module>ApplicationServices()` extension invoked from it).
- `Validators/` — Input validation returning structured `ApiErrorDetailDto` field errors.

Inject shared Stage 1 contracts explicitly via constructor injection:
- `IUnitOfWork` (`Common/Interfaces/Persistence/IUnitOfWork.cs`)
- `ITenantContext` (`Common/Interfaces/Context/ITenantContext.cs`)
- `ICurrentUser` (`Common/Interfaces/Context/ICurrentUser.cs`)
- `IDateTimeProvider` (`Common/Interfaces/Context/IDateTimeProvider.cs`) — never call `DateTime.UtcNow` or `DateTimeOffset.UtcNow` directly; use `GetOrganizationBusinessDate(ianaTimeZoneId)` for business dates.
- `IRuntimeModeProvider` (`Common/Interfaces/Context/IRuntimeModeProvider.cs`) — inspect `CurrentMode` (`Cloud` vs. `BranchLocal`) and `EnrolledBranchId`.
- `IIdempotencyService` (`Common/Interfaces/Integration/IIdempotencyService.cs`) — uses `CanonicalJsonHasher` (`Common/Utilities/CanonicalJsonHasher.cs`) internally to produce deterministic SHA-256 hashes (sorted object keys + normalized decimal scale).
- `IAuditLogger` (`Common/Interfaces/Integration/IAuditLogger.cs`)
- `IOutboxService` (`Common/Interfaces/Integration/IOutboxService.cs`)

### 3.2 `Result` / `Result<T>` Error Handling (Never Throw Raw Exceptions for Expected Failures)
Return `Result<T>.Failure(ErrorCode.<CODE>, message, details)` for all expected business outcomes:

| `ErrorCode` | HTTP Status | When to Use |
| :--- | :---: | :--- |
| `MALFORMED_REQUEST` | `400` | Null/unparseable request payload |
| `UNAUTHORIZED` | `401` | Unauthenticated or invalid credentials/token |
| `FORBIDDEN` | `403` | Role/policy denial or cross-tenant `organization_id` mismatch |
| `FORBIDDEN_BRANCH` | `403` | Caller lacks access to target `branchId` (`!_currentUser.CanAccessBranch(branchId)`) |
| `NOT_FOUND` | `404` | Entity does not exist within the caller's tenant/scope |
| `CONFLICT` | `409` | Duplicate unique key, `row_version` concurrency conflict, or retryable deadlock/serialization conflict |
| `INVALID_STATE_TRANSITION` | `409` | Illegal status transition (e.g., posting an already-posted/cancelled invoice or double-reversing) |
| `OUT_OF_STOCK` | `409` | Insufficient available `on_hand_qty_base` for issue/sale/return-out |
| `IDEMPOTENCY_MISMATCH` | `409` | Same `Idempotency-Key` reused with a different canonical request payload hash |
| `VALIDATION_ERROR` | `422` | Business/field validation errors (include `IReadOnlyList<ApiErrorDetailDto>`) |
| `EXPIRY_POLICY_VIOLATION` | `422` | Selling/issuing expired or quarantined batch in violation of pharmacy expiry policy |

### 3.3 Mandatory Explicit Transaction Patterns

**Read Transaction Pattern (Required by `TenantRlsConnectionInterceptor`):**
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

**Atomic Write Pattern (Idempotency + Mutation + Audit + Outbox):**
```csharp
// 1. Validate inputs, tenant context, role/branch access, and non-empty IdempotencyKey BEFORE opening transaction.
await _unitOfWork.BeginTransactionAsync(ct);
try
{
    // 2. Check idempotency inside the active transaction (acquires scoped lock & compares CanonicalJsonHasher SHA-256).
    var idempotencyCheck = await _idempotencyService.CheckAsync<MyRequest, MyResponse>(
        operationScope: "sales.orders.create",
        idempotencyKey: request.IdempotencyKey,
        branchId: request.BranchId,
        requestPayload: payloadForHash,
        ct: ct);

    if (idempotencyCheck.IsReplay && idempotencyCheck.ReplayedResponse is not null)
    {
        await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
        return Result<MyResponse>.Success(idempotencyCheck.ReplayedResponse);
    }

    // 3. Execute domain & cross-module mutations (e.g., stock balance/ledger updates in deterministic lock order).
    // 4. Write append-only audit trail (_auditLogger.LogAsync(...)).
    // 5. Enqueue integration outbox event (_outboxService.EnqueueAsync(...)).
    // 6. Persist idempotency response (_idempotencyService.PersistResponseAsync(...)).
    // 7. Commit atomically (SaveChangesAsync + CommitAsync).
    await _unitOfWork.CommitTransactionAsync(ct);
    return Result<MyResponse>.Success(response);
}
catch
{
    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
    throw;
}
```
> **Note:** On validation/business `Result.Failure(...)` paths inside an active write transaction, ALWAYS call `await _unitOfWork.RollbackTransactionAsync(CancellationToken.None)` before returning!

---

## 4. API Layer (`src/PharmacyERP.Api/`)

### 4.1 Thin Controllers
- Place controllers under `src/PharmacyERP.Api/Controllers/` with `[ApiController]` and `[Route("api/v1/...")]`.
- Controllers MUST stay thin: extract header/route/query parameters, invoke a single Application service method, and map the response via `ApiResultMapper`:
  - `ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId)` (`200 OK` or `204 No Content`)
  - `ApiResultMapper.ToCreatedResult(this, result, _currentUser.TraceId, locationUri)` (`201 Created`)
  - `ApiResultMapper.ToErrorResult(...)` (for null body `400 MALFORMED_REQUEST`)
- On every idempotent mutating action (`POST`/`PUT`/`PATCH`), apply `[AllowHeaderIdempotencyKey]` and merge `[FromHeader(Name = "Idempotency-Key")] string? idempotencyKey` with `request.IdempotencyKey` (see `InventoryController.PostAdjustment`).

### 4.2 Authorization & Runtime Mode Guard
- Apply `[Authorize]`, `[Authorize(Roles = "...")]`, or named policies from `src/PharmacyERP.Api/Auth/AuthorizationPoliciesExtensions.cs` (`AdminOnly`, `OrgAdminOnly`, `PlatformProvisionerOnly`, plus any approved Stage 2/3 policies).
- Keep `src/PharmacyERP.Api/Middleware/RuntimeModeGuardMiddleware.cs` up to date:
  - **BranchLocal-only mutations** (e.g., stock adjustments, POS sales, returns, branch shift operations) MUST return `404 NOT_FOUND` on `ErpRuntimeMode.Cloud`.
  - **Cloud-only endpoints** (e.g., organization provisioning, canonical sync/config, master catalog writes) MUST return `404 NOT_FOUND` on `ErpRuntimeMode.BranchLocal`.
- Never alter the middleware order in `src/PharmacyERP.Api/Middleware/MiddlewareExtensions.cs`:
  `DevRequestErrorLogMiddleware` (Dev only) -> `ExceptionHandlingMiddleware` -> `TraceparentMiddleware` -> `UseCors` -> `RuntimeModeGuardMiddleware` -> `UseHttpsRedirection` -> `UseAuthentication` -> `TenantResolutionMiddleware` -> `UseAuthorization`.

---

## 5. Testing Standards (`tests/`)

### 5.1 Unit Tests (`tests/PharmacyERP.UnitTests`)
Mirror the source structure (`Domain/<Module>/`, `Application/<Module>/`, `Infrastructure/`, `API/`). Every task MUST add unit tests proving:
- **Domain invariants:** invalid IDs, negative amounts/quantities, illegal state transitions, closed enum checks.
- **Math & rounding edge cases:** multi-UOM base conversions (`numeric(18,6)`), unit cost division, tax/discount/line total rounding (`numeric(18,2)` vs `numeric(18,4)`), zero/fractional boundaries.
- **Application service branches:** happy path, missing tenant (`401`), unauthorized branch (`403 FORBIDDEN_BRANCH`), missing resource (`404`), idempotency replay & payload mismatch (`409 IDEMPOTENCY_MISMATCH`), insufficient stock (`409 OUT_OF_STOCK`), expiry policy violation (`422 EXPIRY_POLICY_VIOLATION`), transaction rollback on failure, and verified `IAuditLogger` + `IOutboxService` invocations.
- **EF Core model configuration tests:** column types/precisions, check constraints, unique/partial indexes, composite alternate keys & FKs, and `DeleteBehavior.Restrict`.

### 5.2 Integration Tests (`tests/PharmacyERP.IntegrationTests`)
Use `ThrowawayPostgresDatabaseProvisioner` (`CustomWebApplicationFactory.cs`) and `[SkipWhenPostgresUnavailableFact]` so PostgreSQL tests run against an isolated throwaway database connected as least-privilege **`erp_it_app`** (`erp_app` member, `NOSUPERUSER NOBYPASSRLS`) with `FORCE ROW LEVEL SECURITY` and triggers active. Every Stage 2/3 module MUST prove:
1. **Cross-Tenant PostgreSQL RLS Isolation:** Tenant B cannot read, update, or delete Tenant A rows even with raw queries when bound to Tenant B.
2. **Composite FK Enforcement:** Inserting a child row referencing a parent entity from another `organization_id` (or wrong `branch_id`/`product_id`) fails at the PostgreSQL FK constraint layer.
3. **Immutability Triggers:** Attempting `UPDATE` or `DELETE` on posted immutable records raises a PostgreSQL trigger exception.
4. **Concurrency & Locking:** Stale `row_version` or concurrent conflicting writes surface `409 CONFLICT` without negative stock or corrupted totals.
5. **Idempotency Replay & Mismatch:** Repeating a request with the same `Idempotency-Key` + equivalent payload replays the stored response without duplicating ledger/audit/outbox rows; reusing the key with a mutated payload returns `409 IDEMPOTENCY_MISMATCH`.
6. **HTTP Endpoint Contracts:** Real `WebApplicationFactory` tests verifying routes, status codes, `ApiErrorEnvelopeDto`, header-only `Idempotency-Key`, RBAC policies, branch scope (`403 FORBIDDEN_BRANCH`), and `RuntimeModeGuardMiddleware` (`Cloud` vs. `BranchLocal`).

### 5.3 Mandatory Verification Commands (Run from `apps/erp-backend/`)
```powershell
dotnet build PharmacyERP.sln --no-restore
dotnet test PharmacyERP.sln --no-restore
```
Target gate: **`0 Error(s), 0 Warning(s)`** and **`100% Passed, 0 Failed, 0 Skipped`**.
