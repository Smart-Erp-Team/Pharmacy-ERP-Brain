# Stage 2 Engineering Task Specification — Ahmed Salah (`AS-01`..`AS-09`, `AS-FINAL`)

| Field | Value |
| :--- | :--- |
| **Developer** | Ahmed Salah |
| **Master Reference** | [00-STAGE2-EXECUTION-MAP.md](./00-STAGE2-EXECUTION-MAP.md), [ahmed-hassan.md](./ahmed-hassan.md), & `_audit_docs/01_master_spec/ERP-Backend-Blueprint-v1.1.md` (Sections 6, 8 [§8.2, §8.6, §8.9], 9, 10 — frozen reference-only) |
| **Base / Target Branch** | `stage2-dev` (**NEVER** open Stage 2 feature PRs against `main`) |
| **Execution Protocol** | Run every engineering task (`AS-01`..`AS-09`) via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md`, `@.agent/skills/pharmacy-stage1-baseline/SKILL.md`, and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`. Run `AS-FINAL` via `/stage-final-audit`. |
| **Owned Files & Interfaces** | `SalesReturnQueryDtos.cs`, `CanonicalSaleDto.cs`, `CanonicalSalesOrderDto.cs`, `CanonicalSaleReturnDto.cs`, `ISalesReturnQueryRepository`/`SalesReturnQueryRepository`, `ISalesReturnQueryService`/`SalesReturnQueryService`, `SalesReturnsController.Read.cs`, `ICanonicalStage2Repository`/`CanonicalStage2Repository`, `ICanonicalStage2Service`/`CanonicalStage2Service`, `CanonicalSalesController.cs`, `CanonicalCapabilitiesService.cs` (Stage 2 update), `CanonicalStage2DependencyInjection.cs` (Application + Infrastructure), `Stage2ContractSchemaTests.cs` |
| **Hard Boundaries** | Edit ONLY inside `apps/erp-backend/`. Keep `Program.cs`, `PharmacyDbContext.cs`, root `DependencyInjection.cs` files, and other teammates' owned files **100% untouched**. Stage 2 Canonical APIs are **strictly read-only** (ZERO Stage 2 canonical writes, ZERO PII/customer/delivery/reservation/terminal fields). **ZERO Stage 3 Purchasing code.** |

---

## Task `AS-01`: Local PostgreSQL Setup (`setup-local-db.ps1`) & `stage2-dev` Verification

### 1. Task Header
- **Task ID:** `AS-01`
- **Title:** Local PostgreSQL Setup (`setup-local-db.ps1`) & `stage2-dev` Verification
- **Base Branch:** `stage2-dev`
- **Feature Branch:** No code branch required (local environment onboarding before starting `AS-02`)
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-01` (`stage2-dev` branch) exists on `origin` and has been pulled locally (`git switch stage2-dev && git pull --ff-only origin stage2-dev`).
- [ ] PostgreSQL is installed locally with `psql` in `PATH` and `.NET 10 SDK` installed.
- [ ] `apps/erp-backend/setup-local-db.ps1` exists at the backend root.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. From `apps/erp-backend/`, sync to the latest `stage2-dev` branch:
   ```powershell
   git fetch origin
   git switch stage2-dev
   git pull --ff-only origin stage2-dev
   ```
2. Run `.\setup-local-db.ps1` interactively to:
   - Create `erp_db` if absent.
   - Provision least-privilege PostgreSQL roles (`erp_migrator` & `erp_app`, `NOSUPERUSER NOBYPASSRLS`).
   - Apply all EF Core migrations and `ENABLE` + `FORCE ROW LEVEL SECURITY` policies.
   - Save `ConnectionStrings:DefaultConnection` (as `erp_app`) to `dotnet user-secrets` for `src/PharmacyERP.Api`.
   - Set user environment variable `ERP_IT_POSTGRES` for `ThrowawayPostgresDatabaseProvisioner`.
3. Never print or commit database passwords, connection strings, or tokens.

### 4. Mandatory Unit & Integration Tests
- Execute the full Stage 1 baseline test suite (`724 / 724` tests passing, `0 Failed`, `0 Skipped`) against local PostgreSQL.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** explaining the local DB/RLS role setup (`erp_migrator` vs `erp_app`) and confirming readiness for Wave 2.

---

## Task `AS-02`: Return Read DTOs & Stage 2 Canonical DTOs

### 1. Task Header
- **Task ID:** `AS-02`
- **Title:** `SalesReturnQueryDtos.cs` & Stage 2 Canonical DTOs (`CanonicalSaleDto`, `CanonicalSalesOrderDto`, `CanonicalSaleReturnDto`)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-salah/as-02-return-and-canonical-dtos`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AS-01` completed locally.
- [ ] `AH-01`..`AH-06` merged into `stage2-dev` and pulled locally (Stage 2 enums `SalesOrderStatus`, `OrderChannel`, `SalesInvoiceStatus`, `SalesPaymentStatus`, `SalesReturnStatus`, `SalesRefundStatus`, `ReturnDisposition`, `PaymentMethod`, all 8 Sales entities, and `CanonicalStage2DependencyInjection.cs` compile cleanly).
- [ ] Stage 1 reference DTOs (`CanonicalProductDto.cs`, `CanonicalInventoryItemDto.cs`, `CanonicalCapabilitiesDto.cs`) exist under `src/PharmacyERP.Application/Features/Integration/DTOs/`.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Keep all DTOs self-contained inside Ahmed Salah's owned files (zero compile-time dependency on `YA-02` or `EH-02`) and strictly compliant with Blueprint §6.5–§6.6 (ZERO customer, delivery, reservation, terminal, or employee PII fields in Canonical DTOs):

1. **Create `src/PharmacyERP.Application/Features/Sales/DTOs/SalesReturnQueryDtos.cs`** (`namespace PharmacyERP.Application.Features.Sales.DTOs;`):
   - `SalesReturnQueryFilter(Guid? BranchId, Guid? InvoiceId, DateTimeOffset? FromDate, DateTimeOffset? ToDate, int Page = 1, int PageSize = 20)`
   - `SalesReturnSummaryDto(Guid ReturnId, Guid BranchId, Guid InvoiceId, string? InvoiceNo, string ReturnNo, SalesReturnStatus Status, string ReasonCode, decimal RefundAmount, SalesRefundStatus RefundStatus, Guid ReceivedByEmployeeId, Guid? ApprovedByEmployeeId, DateTimeOffset ReceivedAt)`
   - `SalesReturnLineDetailDto(Guid ReturnLineId, Guid InvoiceLineId, Guid ProductId, string? ProductSku, string? ProductName, Guid BatchId, string? BatchNumber, Guid DestinationLocationId, string? DestinationLocationCode, decimal QuantityBase, decimal RefundAmount, ReturnDisposition Disposition)`
   - `SalesReturnStockMovementDto(Guid InventoryTxnId, string TransactionNo, InventoryTransactionType TransactionType, InventoryTransactionStatus Status, DateTimeOffset? PostedAt)`
   - `SalesReturnRefundSummaryDto(Guid RefundId, Guid ProcessedByEmployeeId, string? ProcessedByEmployeeName, decimal Amount, PaymentMethod Method, DateTimeOffset RefundedAt)`
   - `SalesReturnDetailDto(Guid ReturnId, Guid OrganizationId, Guid BranchId, Guid InvoiceId, string? InvoiceNo, string ReturnNo, SalesReturnStatus Status, string ReasonCode, Guid ReceivedByEmployeeId, string? ReceivedByEmployeeName, Guid? ApprovedByEmployeeId, string? ApprovedByEmployeeName, decimal RefundAmount, SalesRefundStatus RefundStatus, string IdempotencyKey, DateTimeOffset ReceivedAt, IReadOnlyList<SalesReturnLineDetailDto> Lines, IReadOnlyList<SalesReturnStockMovementDto> StockMovements, IReadOnlyList<SalesReturnRefundSummaryDto> Refunds)`
2. **Create `src/PharmacyERP.Application/Features/Integration/DTOs/CanonicalSaleDto.cs`** (`namespace PharmacyERP.Application.Features.Integration.DTOs;`, matching Stage 1 `CanonicalInventoryItemDto` `Schema`/`Version` metadata + explicit `[JsonPropertyName("snake_case")]` attributes matching Blueprint §6.6 & §8.2):
   - `CanonicalSaleLineDto`: `invoice_line_id`, `product_id`, `base_uom_code`, `entered_uom_id`, `entered_qty`, `conversion_snapshot`, `quantity_base`, `unit_price_entered`, `unit_price_base` (`Math.Round(unitPriceSnapshot / conversionSnapshot, 4, MidpointRounding.AwayFromZero)` per §8.9.12), `discount_amount`, `tax_rate_snapshot`, `tax_amount`, `net_amount`, `line_total`, `unit_cost_base_snapshot`.
   - `CanonicalSaleDto`: `schema` (`"canonical.Sale"`), `version` (`"1.0"`), `organization_id`, `invoice_id`, `order_id`, `branch_id`, `invoice_no`, `status`, `payment_status`, `currency_code`, `subtotal`, `discount_total`, `tax_total`, `grand_total`, `paid_amount`, `refunded_amount`, `issued_at`, `updated_at`, `lines` (`IReadOnlyList<CanonicalSaleLineDto>`).
3. **Create `src/PharmacyERP.Application/Features/Integration/DTOs/CanonicalSalesOrderDto.cs`:**
   - `CanonicalSalesOrderLineDto`: `order_line_id`, `product_id`, `base_uom_code`, `product_uom_id`, `entered_qty`, `conversion_snapshot`, `quantity_base`, `unit_price_snapshot`, `discount_amount`, `tax_rate_snapshot`, `tax_amount_snapshot`, `line_total`.
   - `CanonicalSalesOrderDto`: `schema` (`"canonical.SalesOrder"`), `version` (`"1.0"`), `organization_id`, `order_id`, `branch_id`, `order_no`, `channel` (`POS`), `order_status`, `currency_code`, `created_at`, `completed_at`, `lines` (`IReadOnlyList<CanonicalSalesOrderLineDto>`). *(Strictly non-PII: NO `customer`, `delivery`, `reservation`, `terminal`, or employee email/phone fields!)*
4. **Create `src/PharmacyERP.Application/Features/Integration/DTOs/CanonicalSaleReturnDto.cs`:**
   - `CanonicalSaleReturnLineDto`: `return_line_id`, `invoice_line_id`, `product_id`, `batch_id`, `destination_location_id`, `quantity_base`, `refund_amount`, `disposition`.
   - `CanonicalSaleReturnDto`: `schema` (`"canonical.SaleReturn"`), `version` (`"1.0"`), `organization_id`, `return_id`, `branch_id`, `invoice_id`, `return_no`, `status`, `reason_code`, `refund_amount`, `refund_status`, `received_at`, `updated_at` *(mapped from `received_at` for immutable posted returns per §6.6)*, `lines` (`IReadOnlyList<CanonicalSaleReturnLineDto>`).
5. **Update `GlobalUsings.cs`:** Ensure `PharmacyERP.Application.Features.Sales.DTOs`, `PharmacyERP.Application.Features.Sales.Repositories.Interfaces`, `PharmacyERP.Application.Features.Sales.Services.Interfaces`, and `PharmacyERP.Application.Features.Integration.Repositories.Interfaces` are globally imported cleanly across `Application`, `Infrastructure`, and `Api`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Integration/Stage2CanonicalDtoSerializationTests.cs`:
  - Verifies JSON serialization of `CanonicalSaleDto`, `CanonicalSalesOrderDto`, and `CanonicalSaleReturnDto` emits exact `snake_case` property names, `schema` (`canonical.Sale` / `canonical.SalesOrder` / `canonical.SaleReturn`), `version` (`"1.0"`), string enum values, and **asserts absence** of `customer`, `delivery`, `reservation`, `terminal`, `email`, `phone` keys.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** covering the non-PII Canonical Stage 2 DTO contracts and Return Read DTOs.

---

## Task `AS-03`: Sales Return Query Repository (`ISalesReturnQueryRepository`, `SalesReturnQueryRepository`)

### 1. Task Header
- **Task ID:** `AS-03`
- **Title:** Sales Return Query Repository (`ISalesReturnQueryRepository` & `SalesReturnQueryRepository`)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-salah/as-03-sales-return-query-repository`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-04` and `AH-05` merged into `stage2-dev` and pulled locally (`PharmacyDbContext.Sales.cs` & Stage 2 migration active).
- [ ] `AS-02` merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Create `ISalesReturnQueryRepository`** (`src/PharmacyERP.Application/Features/Sales/Repositories/Interfaces/ISalesReturnQueryRepository.cs`):
   ```csharp
   public interface ISalesReturnQueryRepository
   {
       Task<PagedResult<SalesReturnSummaryDto>> GetPagedAsync(
           Guid organizationId,
           IReadOnlyCollection<Guid>? allowedBranchIds,
           SalesReturnQueryFilter filter,
           CancellationToken ct = default);

       Task<SalesReturnDetailDto?> GetDetailByIdAsync(
           Guid organizationId,
           Guid returnId,
           CancellationToken ct = default);
   }
   ```
2. **Implement `SalesReturnQueryRepository`** (`src/PharmacyERP.Infrastructure/Persistence/Repositories/Sales/SalesReturnQueryRepository.cs`):
   - Strictly `.AsNoTracking()` (and `.AsSplitQuery()` on relational detail loads).
   - `GetPagedAsync`:
     - Clamps `page >= 1`, `pageSize` in `[1, 100]`.
     - Filters by `OrganizationId`, `allowedBranchIds` (when caller has `ASSIGNED` scope), optional `filter.BranchId`, optional `filter.InvoiceId`, and `filter.FromDate <= ReceivedAt <= filter.ToDate`.
     - Orders deterministically by `ReceivedAt DESC, ReturnId DESC`.
     - Projects `SalesReturnSummaryDto` (joining `SalesInvoice.InvoiceNo`) and returns `PagedResult<SalesReturnSummaryDto>(items, safePage, safePageSize, totalCount)`.
   - `GetDetailByIdAsync`:
     - Loads `SalesReturn` + `Lines` (`OrderBy(l => l.ReturnLineId)`) + `Refunds` (`OrderBy(r => r.RefundedAt)`) + `Invoice.InvoiceNo`.
     - Loads linked `InventoryTxn` rows where `OrganizationId == orgId && SalesReturnId == returnId` (`SALES_RETURN_IN` and optional `SCRAP_OUT`, ordered by `PostedAt ASC, InventoryTxnId ASC`).
     - Batch-fetches referenced `Product` (`Sku`, `Name`), `InventoryBatch` (`BatchNumber`), `InventoryLocation` (`LocationCode`), and `Employee` (`FullName`) in minimal set-based `.AsNoTracking()` queries (zero N+1 loops, **WITHOUT filtering `IsActive == true`** so historical deactivated products/employees/locations always resolve cleanly).

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.IntegrationTests/Persistence/SalesReturnQueryRepositoryTests.cs` (`[SkipWhenPostgresUnavailableFact]`):
  - Verifies search by `branchId`, `invoiceId`, and `fromDate`/`toDate` with accurate pagination.
  - Verifies `GetDetailByIdAsync` returns lines, both `SALES_RETURN_IN` and `SCRAP_OUT` linked stock movements for `SCRAP` returns, refunds, and deactivated product/employee names.
  - Verifies PostgreSQL `FORCE RLS` cross-tenant isolation under `erp_it_app`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing the return query repository, dual stock-movement linking (`SALES_RETURN_IN` + `SCRAP_OUT`), and zero-N+1 batch projections.

---

## Task `AS-04`: Sales Return Query Service & `SalesReturnsController.Read.cs`

### 1. Task Header
- **Task ID:** `AS-04`
- **Title:** `ISalesReturnQueryService`, `SalesReturnQueryService` & `SalesReturnsController.Read.cs`
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-salah/as-04-sales-return-read-service-and-controller`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-06` (`SalesReturnsController.cs` partial shell & `SalesReadAccess` policy) merged into `stage2-dev` and pulled locally.
- [ ] `AS-03` (`ISalesReturnQueryRepository`) merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Create `ISalesReturnQueryService` & `SalesReturnQueryService`** (`src/PharmacyERP.Application/Features/Sales/Services/`):
   - Allowed on BOTH `Cloud` and `BranchLocal`; roles `Admin`, `Pharmacist`, `Cashier`.
   - `GetReturnsAsync(SalesReturnQueryFilter filter, CancellationToken ct)`:
     - Validate authenticated tenant (`401`), `fromDate <= toDate` (`422 VALIDATION_ERROR`), and `filter.BranchId` branch authorization (`403 FORBIDDEN_BRANCH`).
     - Compute `allowedBranchIds` (`null` for `BranchScope == "ALL"`, else `_currentUser.AuthorizedBranchIds`).
     - Execute inside explicit `IUnitOfWork` read transaction (`BeginTransactionAsync` -> `_returnQueryRepo.GetPagedAsync(...)` -> `finally { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); }`).
   - `GetReturnByIdAsync(Guid returnId, CancellationToken ct)`:
     - Explicit `IUnitOfWork` read transaction -> `_returnQueryRepo.GetDetailByIdAsync(orgId, returnId, ct)` -> `404 NOT_FOUND` if null -> verify `_currentUser.CanAccessBranch(dto.BranchId)` (`403 FORBIDDEN_BRANCH`) -> return `Result<SalesReturnDetailDto>.Success(dto)`.
2. **Create `src/PharmacyERP.Api/Controllers/SalesReturnsController.Read.cs`** (`public partial class SalesReturnsController`, using `[FromServices]` so `SalesReturnsController.cs` stays untouched and zero constructor conflict occurs with El-Hosseiny's `SalesReturnsController.Write.cs`):
   - `[HttpGet]` (`GET /api/v1/sales-returns`), `[Authorize(Policy = "SalesReadAccess")]`: query params `branchId`, `invoiceId`, `fromDate`, `toDate`, `page = 1`, `pageSize = 20` -> `ApiResultMapper.ToActionResult`.
   - `[HttpGet("{id:guid}")]` (`GET /api/v1/sales-returns/{id}`), `[Authorize(Policy = "SalesReadAccess")]` -> `ApiResultMapper.ToActionResult`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Sales/SalesReturnQueryServiceTests.cs`:
  - Happy path list & detail, `ASSIGNED` vs `ALL` branch scope, `403 FORBIDDEN_BRANCH`, `404 NOT_FOUND`, `422` inverted date range, and verified `BeginTransactionAsync` + `RollbackTransactionAsync(CancellationToken.None)`.
- `tests/PharmacyERP.UnitTests/API/Controllers/SalesReturnsReadControllerTests.cs`:
  - Verifies `[Authorize(Policy = "SalesReadAccess")]`, query parameter binding, and `ApiResultMapper` response mapping.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing the return read service and partial controller separation.

---

## Task `AS-05`: Stage 2 Canonical Read Repository (`ICanonicalStage2Repository`, `CanonicalStage2Repository`)

### 1. Task Header
- **Task ID:** `AS-05`
- **Title:** Stage 2 Canonical Read Repository (`updated_since` & Durable `OUTBOX_EVENT.event_sequence` Cursor)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-salah/as-05-canonical-stage2-repository`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-04` and `AH-05` merged into `stage2-dev` and pulled locally.
- [ ] `AS-02` merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Create `ICanonicalStage2Repository`** (`src/PharmacyERP.Application/Features/Integration/Repositories/Interfaces/ICanonicalStage2Repository.cs`):
   ```csharp
   public sealed record CanonicalStage2FeedFilter(
       Guid? BranchId,
       DateTimeOffset? FromDate,
       DateTimeOffset? ToDate,
       DateTimeOffset? UpdatedSince,
       string? Cursor,
       int Limit = 100);

   public interface ICanonicalStage2Repository
   {
       Task<PagedResult<CanonicalSaleDto>> GetCanonicalSalesPageAsync(
           Guid organizationId,
           IReadOnlyCollection<Guid>? allowedBranchIds,
           CanonicalStage2FeedFilter filter,
           CancellationToken ct = default);

       Task<PagedResult<CanonicalSalesOrderDto>> GetCanonicalOrdersPageAsync(
           Guid organizationId,
           IReadOnlyCollection<Guid>? allowedBranchIds,
           CanonicalStage2FeedFilter filter,
           CancellationToken ct = default);

       Task<PagedResult<CanonicalSaleReturnDto>> GetCanonicalReturnsPageAsync(
           Guid organizationId,
           IReadOnlyCollection<Guid>? allowedBranchIds,
           CanonicalStage2FeedFilter filter,
           CancellationToken ct = default);
   }
   ```
2. **Implement `CanonicalStage2Repository`** (`src/PharmacyERP.Infrastructure/Persistence/Repositories/Integration/CanonicalStage2Repository.cs`):
   - Strictly `.AsNoTracking()` + `.AsSplitQuery()`, `Limit` clamped to `[1, 200]` (default `100`).
   - **Dual Cursor Modes (Blueprint §8.2 — `updated_since` + durable `OUTBOX_EVENT.event_sequence` cursor):**
     - **Opaque Cursor Encoding (base64url JSON):**
       - Snapshot/Keyset cursor: `{ "m": "ks", "ts": "<utc-iso>", "id": "<guid>", "hw": <highWaterEventSeq> }`
       - Durable Outbox-Sequence cursor: `{ "m": "seq", "seq": <lastScannedEventSequence> }`
     - **Initial / Time-Range / `updated_since` Mode (`cursor` null or `m == "ks"`):**
       - Capture current committed `highWaterEventSeq` from `integration."OUTBOX_EVENT"` for `organizationId` (0 if none).
       - Query posted `SalesInvoice` (`sales`), `SalesOrder` (`orders`), or posted `SalesReturn` (`returns`) applying `OrganizationId`, `allowedBranchIds`, optional `BranchId`, `FromDate`/`ToDate`, `UpdatedSince`, and keyset predicate `(ts > afterTs || (ts == afterTs && id > afterId))` ordered by `(ts ASC, id ASC)`, `Take(limit + 1)`.
       - If `hasMore`: emit next keyset cursor `{ "m": "ks", "ts": lastTs, "id": lastId, "hw": highWaterEventSeq }`.
       - When initial scan completes (`!hasMore`): emit durable outbox cursor `{ "m": "seq", "seq": highWaterEventSeq }` so subsequent incremental polls transition seamlessly into no-loss `OUTBOX_EVENT.event_sequence` replication!
     - **Durable Outbox-Sequence Mode (`m == "seq"`):**
       - Query `integration."OUTBOX_EVENT"` where `OrganizationId == orgId && EventSequence > afterSeq` filtered to matching event types (`sales.order.completed` / `sales.return.posted`, plus branch filter when specified) ordered by `EventSequence ASC`, `Take(limit + 1)`.
       - Extract distinct aggregate IDs from the returned events, batch-load the authoritative posted `SalesInvoice` / `SalesOrder` / `SalesReturn` + lines + `Product.BaseUomCode` via `.AsNoTracking().AsSplitQuery()`, and advance `NextCursor` to `{ "m": "seq", "seq": lastScannedEventSequence }` (even if filtered events produce 0 body items, guaranteeing no-loss progress!).
   - Batch-fetch `Product.BaseUomCode` for all line product IDs in one `.AsNoTracking()` query (zero N+1, never filtering `IsActive == true`).
   - Compute `unit_price_base = Math.Round(line.UnitPriceSnapshot / line.ConversionSnapshot, 4, MidpointRounding.AwayFromZero)` per §8.9.12.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.IntegrationTests/Persistence/CanonicalStage2RepositoryTests.cs` (`[SkipWhenPostgresUnavailableFact]`):
  - Verifies keyset paging + transition to `OUTBOX_EVENT.event_sequence` cursor for `sales`, `orders`, and `returns`.
  - Verifies incremental `m == "seq"` mode picks up newly committed `OUTBOX_EVENT` sales/returns without missing late commits or duplicating prior items.
  - Verifies `updated_since`, `from_date`/`to_date`, `branch_id`, and `FORCE RLS` cross-tenant isolation under `erp_it_app`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** explaining how `updated_since` keyset pagination hands off cleanly to durable `OUTBOX_EVENT.event_sequence` cursors per Blueprint §8.2.

---

## Task `AS-06`: Stage 2 Canonical Read Service (`ICanonicalStage2Service`, `CanonicalStage2Service`)

### 1. Task Header
- **Task ID:** `AS-06`
- **Title:** Stage 2 Canonical Read Service (`ICanonicalStage2Service` & `CanonicalStage2Service`)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-salah/as-06-canonical-stage2-service`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AS-05` (`ICanonicalStage2Repository`) merged into `stage2-dev` and pulled locally.
- [ ] Stage 1 `IBranchRepository`, `IUnitOfWork`, `ITenantContext`, `ICurrentUser`, and `IRuntimeModeProvider` exist.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Create `ICanonicalStage2Service` & `CanonicalStage2Service` (`src/PharmacyERP.Application/Features/Integration/Services/`):
- **Read-Only Contract:** Exposes strictly three read methods (`GetCanonicalSalesAsync`, `GetCanonicalOrdersAsync`, `GetCanonicalReturnsAsync`) — **ZERO write methods**.
- **Shared Security & Transaction Pipeline (matching Stage 1 `CanonicalInventoryService`):**
  1. Enforce `_runtimeMode.CurrentMode == ErpRuntimeMode.Cloud` -> `404 NOT_FOUND` (defense-in-depth alongside `RuntimeModeGuardMiddleware`).
  2. Require `_tenantContext.OrganizationId.HasValue && _tenantContext.OrganizationId.Value != Guid.Empty` -> `401 UNAUTHORIZED`.
  3. If client supplied `organizationId` query param (`organizationId.HasValue && organizationId.Value != Guid.Empty`) and `organizationId.Value != tenantOrganizationId` -> `403 FORBIDDEN`.
  4. Validate `fromDate <= toDate` and valid opaque `cursor` format (if provided) -> `422 VALIDATION_ERROR`.
  5. Open explicit `IUnitOfWork` read transaction (`BeginTransactionAsync` -> queries -> `finally { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); }`):
     - If `filter.BranchId.HasValue`:
       - Verify branch belongs to tenant via `_branchRepository.GetByIdAsync(tenantOrganizationId, filter.BranchId.Value, ct)` (`404 NOT_FOUND` if missing).
       - Verify `_currentUser.CanAccessBranch(filter.BranchId.Value)` (`403 FORBIDDEN_BRANCH` if unauthorized).
     - Resolve `allowedBranchIds = string.Equals(_currentUser.BranchScope, "ALL", StringComparison.Ordinal) ? null : _currentUser.AuthorizedBranchIds`.
     - Delegate to `_canonicalStage2Repo.GetCanonicalSalesPageAsync` / `GetCanonicalOrdersPageAsync` / `GetCanonicalReturnsPageAsync` and return `Result<PagedResult<T>>.Success(page)`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Integration/CanonicalStage2ServiceTests.cs`:
  - Happy paths for `sales`, `orders`, and `returns` (`ALL` and `ASSIGNED` scopes).
  - Rejects `BranchLocal` runtime (`404 NOT_FOUND`), missing tenant (`401`), cross-tenant `organization_id` mismatch (`403 FORBIDDEN`), missing branch (`404`), unauthorized branch (`403 FORBIDDEN_BRANCH`), inverted date range (`422`), and malformed cursor (`422`).
  - Verifies explicit `BeginTransactionAsync` + `RollbackTransactionAsync(CancellationToken.None)` on both success and failure paths.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing the Cloud-only, read-only canonical service and tenant/branch verification flow.

---

## Task `AS-07`: `CanonicalSalesController`, `CanonicalCapabilitiesService` Update & DI Wiring

### 1. Task Header
- **Task ID:** `AS-07`
- **Title:** `CanonicalSalesController`, `CanonicalCapabilitiesService` Stage 2 Update & DI Registration
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-salah/as-07-canonical-controller-and-capabilities`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-06` (`CanonicalStage2DependencyInjection.cs` & Stage 2 `RuntimeModeGuardMiddleware`) merged into `stage2-dev` and pulled locally.
- [ ] `AS-04` and `AS-06` merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Create `src/PharmacyERP.Api/Controllers/CanonicalSalesController.cs`:**
   - `[ApiController]`, `[Route("api/v1/canonical")]`, `[Authorize]`.
   - Three read-only `GET` endpoints using `snake_case` query parameter names matching Stage 1 `CanonicalInventoryController` & `CanonicalCatalogController`:
     - `[HttpGet("sales")]` (`GET /api/v1/canonical/sales`)
     - `[HttpGet("orders")]` (`GET /api/v1/canonical/orders`)
     - `[HttpGet("returns")]` (`GET /api/v1/canonical/returns`)
   - Query params on all three: `[FromQuery(Name = "organization_id")] Guid? organizationId`, `[FromQuery(Name = "branch_id")] Guid? branchId`, `[FromQuery(Name = "from_date")] DateTimeOffset? fromDate`, `[FromQuery(Name = "to_date")] DateTimeOffset? toDate`, `[FromQuery(Name = "updated_since")] DateTimeOffset? updatedSince`, `[FromQuery(Name = "cursor")] string? cursor`, `[FromQuery(Name = "limit")] int limit = 100`.
   - Thin controller: delegates directly to `ICanonicalStage2Service` and returns via `ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId)`.
   - **ZERO `POST`/`PUT`/`PATCH`/`DELETE` actions on `CanonicalSalesController`** (Blueprint §6.6 & §8.2).
2. **Update `src/PharmacyERP.Application/Features/Integration/Services/Implementations/CanonicalCapabilitiesService.cs`:**
   ```csharp
   public CanonicalCapabilitiesDto GetCapabilities()
   {
       return new CanonicalCapabilitiesDto(
           Stage: 2,
           RuntimeMode: _runtimeModeProvider.CurrentMode.ToString(),
           SupportedReads: new[] { "products", "inventory", "sales", "orders", "returns" },
           SupportedWrites: new[] { "configuration.products", "configuration.reorder-rules" }
       );
   }
   ```
   *(Update any Stage 1 unit/integration test asserting `Stage == 1` / `SupportedReads` count strictly inside `tests/` to reflect Stage 2 while preserving `SupportedWrites` unchanged — **ZERO Stage 2 canonical writes**!)*
3. **Register Services & Repositories ONLY in Ahmed Salah's Modular DI Files** (keep root `DependencyInjection.cs` untouched!):
   - `src/PharmacyERP.Application/Extensions/CanonicalStage2DependencyInjection.cs`: register `ISalesReturnQueryService`, `ICanonicalStage2Service` (`Scoped`).
   - `src/PharmacyERP.Infrastructure/Extensions/CanonicalStage2DependencyInjection.cs`: register `ISalesReturnQueryRepository`, `ICanonicalStage2Repository` (`Scoped`).

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/API/Controllers/CanonicalSalesControllerAndCapabilitiesTests.cs`:
  - Verifies exact routes (`/api/v1/canonical/sales`, `/orders`, `/returns`), `snake_case` `[FromQuery]` names, zero mutating HTTP attributes on `CanonicalSalesController`.
  - Verifies `CanonicalCapabilitiesService.GetCapabilities()` returns `Stage: 2`, `SupportedReads: ["products", "inventory", "sales", "orders", "returns"]`, and `SupportedWrites: ["configuration.products", "configuration.reorder-rules"]`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Local API boot check confirming Swagger exposes `GET /api/v1/sales-returns`, `GET /api/v1/sales-returns/{id}`, `GET /api/v1/canonical/sales`, `GET /api/v1/canonical/orders`, `GET /api/v1/canonical/returns`, and updated `GET /api/v1/canonical/capabilities`, then terminate cleanly.
- Provide a concise **Arabic explanation in chat** summarizing the 3 canonical feeds, capabilities update, and zero-write AI boundary enforcement.

---

## Task `AS-08`: Stage 2 DTO, Enum & Error Envelope Contract Schema Verification Suite

### 1. Task Header
- **Task ID:** `AS-08`
- **Title:** Stage 2 Contract & Schema Verification Tests (`Stage2ContractSchemaTests.cs`)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-salah/as-08-stage2-contract-schema-tests`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AS-07` merged into `stage2-dev` and pulled locally.
- [ ] `YA-02` (`SalesOrderDraftDtos.cs`, `SalesInvoiceDtos.cs`), `EH-02` (`SalesCheckoutDtos.cs`, `SalesReturnWriteDtos.cs`), and `AH-08` (`SyncDtos.cs`, `SyncPayloads.cs`) merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Create **`tests/PharmacyERP.UnitTests/Contracts/Stage2ContractSchemaTests.cs`** validating JSON serialization against `ERP-Backend-Blueprint-v1.1.md` (§4.4, §6.5, §6.6, §8.6, §8.9.11) using the exact ASP.NET Core `JsonSerializerOptions` configured in `src/PharmacyERP.Api/DependencyInjection.cs` (`PropertyNamingPolicy = JsonNamingPolicy.CamelCase` + `JsonStringEnumConverter`):
1. **Closed Enum String Contracts:** Verify every Stage 2 enum (`OrderChannel`, `SalesOrderStatus`, `SalesInvoiceStatus`, `SalesPaymentStatus`, `PaymentMethod`, `SalesReturnStatus`, `SalesRefundStatus`, `ReturnDisposition`, `SyncOperationType`, `SyncProcessingStatus`, `SyncResultCode`, `SyncDeliveryOutcome`, `ErrorCode`) serializes as exact uppercase/case-sensitive strings (never integers).
2. **Sales DTO Property Contracts:** Serialize & inspect JSON keys of `CreateSalesOrderRequest`, `SalesOrderDto`, `CompleteSalesOrderRequest`, `CompleteSalesOrderResultDto`, `SalesInvoiceDto`, `CreateSalesReturnRequest`, `SalesReturnDto`, `SalesReturnDetailDto` — proving:
   - `CreateSalesOrderRequest` / `SalesOrderLineRequest` contain NO price/discount/tax/total properties.
   - `CreateSalesReturnRequest` / `SalesReturnLineRequest` contain NO `batchId`/`destinationLocationId` properties.
3. **Sync DTO Property Contracts:** Serialize & inspect `SyncOperationBatchRequest`, `SyncOperationBatchResponse`, `SyncOperationResultDto`, `SyncBootstrapResponse`, `SyncChangesResponse` — asserting `SyncBootstrapResponse` contains NO `stockBalances`/`openingBalances` properties.
4. **Canonical Stage 2 DTO Contracts:** Serialize & inspect `CanonicalSaleDto`, `CanonicalSalesOrderDto`, `CanonicalSaleReturnDto`, and `CanonicalCapabilitiesDto` — verifying exact `snake_case` property names, `schema` & `version` constants, zero customer/delivery/reservation/terminal/PII keys, and zero Stage 2 canonical write entries in `SupportedWrites`.
5. **Error Envelope Contract (§8.6):** Verify `ApiResultMapper` produces `{ "error": { "code", "message", "details", "trace_id" } }` with exact HTTP status codes (`400`, `401`, `403`, `404`, `409` including `SYNC_CURSOR_EXPIRED`, `OUT_OF_STOCK`, `INVALID_STATE_TRANSITION`, `IDEMPOTENCY_MISMATCH`, and `422`).

### 4. Mandatory Unit & Integration Tests
- Execute `Stage2ContractSchemaTests.cs` (`0 Failed, 0 Skipped`).

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing the contract drift protections verified across all Stage 2 DTOs.

---

## Task `AS-09`: Return Queries & Canonical Reads PostgreSQL Integration Test Suite

### 1. Task Header
- **Task ID:** `AS-09`
- **Title:** Return Queries & Stage 2 Canonical Reads PostgreSQL Integration Tests
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-salah/as-09-return-and-canonical-integration-tests`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AS-08` merged into `stage2-dev` and pulled locally.
- [ ] `ERP_IT_POSTGRES` configured locally (`ThrowawayPostgresDatabaseProvisioner` active with `erp_it_app` and `FORCE RLS`).

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Create live PostgreSQL `WebApplicationFactory` integration tests under `tests/PharmacyERP.IntegrationTests/Api/Stage2ReturnReadAndCanonicalEndpointsTests.cs` (`[SkipWhenPostgresUnavailableFact]`):
1. **Return Read Endpoints (`GET /api/v1/sales-returns`, `GET /api/v1/sales-returns/{id}`):**
   - Succeeds on BOTH `Cloud` and `BranchLocal` for authorized `Admin`, `Pharmacist`, and `Cashier`.
   - Filters accurately by `branchId`, `invoiceId`, and date range.
   - Returns full detail (lines, refunds, `SALES_RETURN_IN` + `SCRAP_OUT` stock movements) including deactivated product/employee names.
   - Enforces `403 FORBIDDEN_BRANCH` for unassigned branches and `404 NOT_FOUND` for cross-tenant IDs under `FORCE RLS`.
2. **Canonical Stage 2 Endpoints (`GET /api/v1/canonical/sales`, `/orders`, `/returns`, `/capabilities`):**
   - On `Cloud`: returns `200 OK` with `schema`/`version`, `snake_case` payload, zero PII fields, working `updated_since` filter, and working cursor handoff to `OUTBOX_EVENT.event_sequence`.
   - On `Cloud`: rejects mismatched `organization_id` query param with `403 FORBIDDEN`; rejects unauthorized `branch_id` with `403 FORBIDDEN_BRANCH`; rejects unknown `branch_id` with `404 NOT_FOUND`.
   - On `BranchLocal`: returns `404 NOT_FOUND` (`RuntimeModeGuardMiddleware`) for `/api/v1/canonical/sales`, `/orders`, `/returns`, while STILL returning `200 OK` (`Stage: 2`, `RuntimeMode: "BranchLocal"`) for `/api/v1/canonical/capabilities`.
   - **Cross-Tenant PostgreSQL RLS Pool Reuse:** Tenant B querying `/api/v1/canonical/sales`, `/orders`, `/returns` on pooled `erp_it_app` connections sees zero rows from Tenant A.

### 4. Mandatory Unit & Integration Tests
- Execute `Stage2ReturnReadAndCanonicalEndpointsTests.cs` plus full solution suite (`0 Failed, 0 Skipped`).

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing the live PostgreSQL & HTTP integration proof for Return Reads and Canonical Stage 2 APIs.

---

## Task `AS-FINAL`: Final Security, Performance & Architecture Audit

### 1. Task Header
- **Task ID:** `AS-FINAL`
- **Title:** Final Security, Performance & Architecture Audit (Return Reads, Stage 2 Canonical & Contracts)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-salah/as-final-stage2-audit`
- **Execution Command:** Execute via `/stage-final-audit` applying `@.agent/rules/00-backend-guardrails.md`, `@.agent/skills/pharmacy-backend-engineering/SKILL.md`, `@.agent/skills/backend-security-audit/SKILL.md`, `@.agent/skills/performance-concurrency-guard/SKILL.md`, and `@.agent/skills/architecture-unifier/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AS-01` through `AS-09` merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Run `/stage-final-audit` across all Ahmed Salah's Stage 2 code (`AS-02`..`AS-09`) and generate **`apps/erp-backend/docs/stage2-reports/ahmed-salah-stage2-report.md`** covering:
1. **Security & AI Write-Boundary Audit:** Confirm Canonical Stage 2 endpoints are 100% read-only (`Cloud`-only), enforce exact `organization_id` match + `IBranchRepository` tenant ownership + `_currentUser.CanAccessBranch`, expose zero PII/customer/delivery/reservation/terminal fields, and `CanonicalCapabilitiesService` advertises zero Stage 2 canonical writes.
2. **Performance & Query Hygiene Audit:** Confirm `.AsNoTracking()` + `.AsSplitQuery()` on all queries, zero N+1 loops, bounded pagination (`limit <= 200` / `pageSize <= 100`), explicit `IUnitOfWork` read transactions (`RollbackTransactionAsync(CancellationToken.None)`), and durable `OUTBOX_EVENT.event_sequence` cursor handoff.
3. **Contract & Architecture Audit:** Confirm `Stage2ContractSchemaTests` pass 100%, zero edits to `Program.cs`/`PharmacyDbContext.cs`/root `DependencyInjection.cs`, and clean partial controller separation (`SalesReturnsController.Read.cs`).
4. **Build & Test Proof:** Exact `dotnet build` (`0 Error(s), 0 Warning(s)`) and `dotnet test` (`100% Passed, 0 Failed, 0 Skipped`) results.

### 4. Mandatory Unit & Integration Tests
- Execute full `PharmacyERP.sln` suite (`UnitTests` + `IntegrationTests`) with zero failures and zero skips; resolve any findings with regression tests before report sign-off.

### 5. Verification & Arabic Explanation Gate
- Confirm `apps/erp-backend/docs/stage2-reports/ahmed-salah-stage2-report.md` is generated and complete.
- Provide a final **Arabic debrief in chat** summarizing the audit results and confirming `AS-FINAL` sign-off for Wave 4.
