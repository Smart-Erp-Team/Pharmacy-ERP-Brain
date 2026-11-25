# Stage 2 Engineering Task Specification — El-Hosseiny (`EH-01`..`EH-10`, `EH-FINAL`)

| Field | Value |
| :--- | :--- |
| **Developer** | El-Hosseiny |
| **Master Reference** | [00-STAGE2-EXECUTION-MAP.md](./00-STAGE2-EXECUTION-MAP.md), [01-STAGE2-PLAN-AUDIT-DIFF.md](./01-STAGE2-PLAN-AUDIT-DIFF.md), [ahmed-hassan.md](./ahmed-hassan.md), `contracts/README.md`, & `_audit_docs/01_master_spec/ERP-Backend-Blueprint-v1.1.md` (Sections 4, 6, 8 [§8.6, §8.9], 9, 10 — frozen reference-only) |
| **Verified Stage 1 Baseline** | **`767 / 767`** tests passing (`590` Unit + `177` Integration), **`48` live HTTP endpoints**, **`76` OpenAPI schemas**, `0 Error(s), 0 Warning(s)` |
| **Base / Target Branch** | `stage2-dev` (**NEVER** open Stage 2 feature PRs against `main`) |
| **Execution Protocol** | Run every engineering task (`EH-01`..`EH-10`) via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md`, `@.agent/skills/pharmacy-stage1-baseline/SKILL.md`, and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`. Run `EH-FINAL` via `/stage-final-audit`. |
| **Owned Files & Interfaces** | `SalesCheckoutDtos.cs`, `SalesReturnWriteDtos.cs`, `SalesCheckoutValidators.cs`, `SalesReturnValidators.cs`, `IFefoAllocationRepository`/`FefoAllocationRepository`, `IFefoAllocationService`/`FefoAllocationService`, `ISalesCheckoutRepository`/`SalesCheckoutRepository`, `ISalesReturnWriteRepository`/`SalesReturnWriteRepository`, `ISalesCheckoutService`/`SalesCheckoutService`, `ISalesReturnService`/`SalesReturnService`, `SalesOrdersController.Checkout.cs`, `SalesReturnsController.Write.cs`, `SalesCheckoutAndReturnsDependencyInjection.cs` (Application + Infrastructure), plus incremental `ContractsArtifactSyncTests.cs` / `apps/erp-backend/contracts/openapi.v1.json` / `apps/erp-backend/contracts/README.md` sync in `EH-08` |
| **Hard Boundaries** | Aligned with `00-backend-guardrails.md` §1.1: edit strictly inside `apps/erp-backend/` (the shared monorepo-root `contracts/` directory is reserved for Wave 3/4 synchronized Stage 2 exports in `AS-08` & `AH-FINAL`). Keep `Program.cs`, `PharmacyDbContext.cs`, root `DependencyInjection.cs` files, Stage 1 repositories/services, and other teammates' owned files **100% untouched**. Reuse live Stage 1 `IOrganizationRepository.GetByIdAsync` and `IProductUomRepository.GetActiveBaseUomsByProductIdsAsync` directly. Reference only active `INonLotBatchInitializer` and `IProductInventoryUsageChecker` (ignore `*2.cs`). **ZERO Stage 3 Purchasing code.** |

---

## Task `EH-01`: Local PostgreSQL Setup (`setup-local-db.ps1`) & `stage2-dev` Verification

### 1. Task Header
- **Task ID:** `EH-01`
- **Title:** Local PostgreSQL Setup (`setup-local-db.ps1`) & `stage2-dev` Verification
- **Base Branch:** `stage2-dev`
- **Feature Branch:** No code branch required (local environment onboarding before starting `EH-02`)
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-01` (`stage2-dev` branch) exists on `origin` and has been pulled locally (`git switch stage2-dev && git pull --ff-only origin stage2-dev`).
- [ ] PostgreSQL is installed locally with `psql` available in `PATH` and `.NET 10 SDK` installed.
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
   - Create local `erp_db` if absent.
   - Provision least-privilege PostgreSQL roles (`erp_migrator` & `erp_app` with `NOSUPERUSER NOBYPASSRLS`).
   - Apply all EF Core migrations and `ENABLE` + `FORCE ROW LEVEL SECURITY` policies.
   - Save `ConnectionStrings:DefaultConnection` (as `erp_app`) to `dotnet user-secrets` for `src/PharmacyERP.Api`.
   - Set user environment variable `ERP_IT_POSTGRES` for `ThrowawayPostgresDatabaseProvisioner`.
3. Never print or commit database passwords, `ConnectionStrings:DefaultConnection`, `ERP_MIGRATOR_CONNECTION`, or `ERP_IT_POSTGRES`.

### 4. Mandatory Unit & Integration Tests
- Execute the full Stage 1 baseline test suite against local PostgreSQL (**`767 / 767`** tests passing: `590` Unit + `177` Integration, `0 Error(s), 0 Warning(s)`, `0 Failed`, `0 Skipped`, `48` live HTTP endpoints, `76` OpenAPI schemas, including `ContractsArtifactSyncTests`) to prove `erp_app`, `erp_it_app`, and `FORCE ROW LEVEL SECURITY` are operational locally.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** explaining the local DB/RLS role setup (`erp_migrator` vs `erp_app`) and confirming readiness for Wave 2.

---

## Task `EH-02`: Checkout & Sales Return Write DTOs + Input Validators

### 1. Task Header
- **Task ID:** `EH-02`
- **Title:** Checkout & Sales Return Write DTOs + Input Validators
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/el-hosseiny/eh-02-checkout-and-return-dtos`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `EH-01` completed locally.
- [ ] `AH-01`..`AH-06` merged into `stage2-dev` and pulled locally (Stage 2 enums `PaymentMethod`, `ReturnDisposition`, `SalesOrderStatus`, `SalesInvoiceStatus`, `SalesPaymentStatus`, `SalesReturnStatus`, `SalesRefundStatus`, all 8 Sales entities, and `SalesCheckoutAndReturnsDependencyInjection.cs` compile cleanly).

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Keep all DTOs self-contained inside El-Hosseiny's owned files (zero compile-time dependency on `Yassin`'s `YA-02` or `Ahmed Salah`'s `AS-02` files) and 100% faithful to Blueprint §6.5 & §8.6:

1. **Create `src/PharmacyERP.Application/Features/Sales/DTOs/SalesCheckoutDtos.cs`** (`namespace PharmacyERP.Application.Features.Sales.DTOs;`):
   - *Wire-format invariants (`DependencyInjection.ApiJsonSerializerOptions`):* all JSON keys serialize automatically as strict **`snake_case`** (`JsonNamingPolicy.SnakeCaseLower`), all decimals serialize as native JSON numbers (`D-01`), and enums serialize as exact case-sensitive strings (`allowIntegerValues: false`).
   - `CompleteSalesOrderRequest`:
     ```csharp
     public sealed record CompleteSalesOrderRequest(
         decimal CashTenderedAmount,
         PaymentMethod Method = PaymentMethod.CASH,
         string? Note = null,
         string? IdempotencyKey = null);
     ```
     *(Declare `string? IdempotencyKey = null` as the **trailing optional parameter** — matching Stage 1 `CreateInventoryAdjustmentRequest` so Swashbuckle does not mark `idempotency_key` required in the JSON body when `Idempotency-Key` is sent as an HTTP header. No client-supplied `AmountDue`, `ChangeAmount`, `Subtotal`, `TaxTotal`, or `GrandTotal` — server recomputes everything authoritatively from persisted order-line snapshots.)*
   - `SalesPaymentDto`:
     ```csharp
     public sealed record SalesPaymentDto(
         Guid PaymentId,
         Guid OrganizationId,
         Guid BranchId,
         Guid InvoiceId,
         Guid ReceivedByEmployeeId,
         decimal AmountDue,
         decimal CashTenderedAmount,
         decimal ChangeAmount,
         PaymentMethod Method,
         string IdempotencyKey,
         DateTimeOffset PaidAt,
         string? Note);
     ```
   - `CompletedSaleLineDto`:
     ```csharp
     public sealed record CompletedSaleLineDto(
         Guid InvoiceLineId,
         Guid SourceOrderLineId,
         Guid ProductId,
         Guid ProductUomId,
         decimal EnteredQty,
         decimal ConversionSnapshot,
         decimal QuantityBase,
         decimal UnitPriceSnapshot,
         decimal DiscountAmount,
         decimal TaxRateSnapshot,
         decimal TaxAmount,
         decimal NetAmount,
         decimal LineTotal,
         decimal UnitCostSnapshot);
     ```
   - `CompleteSalesOrderResultDto`:
     ```csharp
     public sealed record CompleteSalesOrderResultDto(
         Guid SalesOrderId,
         string OrderNo,
         SalesOrderStatus OrderStatus,
         DateTimeOffset CompletedAt,
         Guid InvoiceId,
         string InvoiceNo,
         SalesInvoiceStatus InvoiceStatus,
         SalesPaymentStatus PaymentStatus,
         string CurrencyCode,
         decimal Subtotal,
         decimal DiscountTotal,
         decimal TaxTotal,
         decimal GrandTotal,
         decimal PaidAmount,
         decimal RefundedAmount,
         DateTimeOffset IssuedAt,
         SalesPaymentDto Payment,
         Guid InventoryTxnId,
         string InventoryTxnNo,
         IReadOnlyList<CompletedSaleLineDto> Lines);
     ```
2. **Create `src/PharmacyERP.Application/Features/Sales/DTOs/SalesReturnWriteDtos.cs`:**
   - `SalesReturnLineRequest`:
     ```csharp
     public sealed record SalesReturnLineRequest(
         Guid InvoiceLineId,
         decimal QuantityBase,
         ReturnDisposition Disposition);
     ```
     *(Strictly NO `BatchId` or `DestinationLocationId` on request — server derives batch/location allocations from original `SALE_ISSUE` ledger lines and selects destination locations per Blueprint §6.4 & §8.9.9.)*
   - `CreateSalesReturnRequest`:
     ```csharp
     public sealed record CreateSalesReturnRequest(
         Guid InvoiceId,
         string ReasonCode,
         IReadOnlyList<SalesReturnLineRequest> Lines,
         Guid? ApprovedByEmployeeId = null,
         PaymentMethod RefundMethod = PaymentMethod.CASH,
         bool IssueCashRefund = true,
         string? IdempotencyKey = null);
     ```
     *(Declare `string? IdempotencyKey = null` as the **trailing optional parameter** so Swashbuckle never forces `idempotency_key` inside the JSON body when clients send the `Idempotency-Key` HTTP header.)*
   - `SalesReturnLineDto`:
     ```csharp
     public sealed record SalesReturnLineDto(
         Guid ReturnLineId,
         Guid InvoiceLineId,
         Guid ProductId,
         Guid BatchId,
         Guid DestinationLocationId,
         decimal QuantityBase,
         decimal RefundAmount,
         ReturnDisposition Disposition);
     ```
   - `SalesRefundDto`:
     ```csharp
     public sealed record SalesRefundDto(
         Guid RefundId,
         Guid SalesReturnId,
         Guid InvoiceId,
         Guid BranchId,
         Guid ProcessedByEmployeeId,
         decimal Amount,
         PaymentMethod Method,
         string IdempotencyKey,
         DateTimeOffset RefundedAt);
     ```
   - `SalesReturnDto`:
     ```csharp
     public sealed record SalesReturnDto(
         Guid ReturnId,
         Guid OrganizationId,
         Guid BranchId,
         Guid InvoiceId,
         string ReturnNo,
         SalesReturnStatus Status,
         string ReasonCode,
         Guid ReceivedByEmployeeId,
         Guid? ApprovedByEmployeeId,
         decimal RefundAmount,
         SalesRefundStatus RefundStatus,
         string IdempotencyKey,
         DateTimeOffset ReceivedAt,
         Guid? ReturnStockTxnId,
         Guid? ScrapOutTxnId,
         SalesRefundDto? Refund,
         IReadOnlyList<SalesReturnLineDto> Lines);
     ```
3. **Create Validators under `src/PharmacyERP.Application/Features/Sales/Validators/`:**
   - **Strict `snake_case` Error Paths:** Every `ApiErrorDetailDto.Field` emitted by validators and services MUST be strict **`snake_case`** matching the wire JSON schema (aligned with live Stage 1 `DTO-DIFF-001` & `API-DIFF-021`).
   - `SalesCheckoutValidators.cs`: returns structured `IReadOnlyList<ApiErrorDetailDto>`:
     - `IdempotencyKey` (`field: "idempotency_key"`): required (`1..100` chars; controllers reject blank in both header & body with `400 MALFORMED_REQUEST` via `ApiResultMapper.ToMissingIdempotencyKeyResult`, while the validator enforces `1..100` chars -> `422 VALIDATION_ERROR`).
     - `Method` (`field: "method"`): must be `PaymentMethod.CASH`.
     - `CashTenderedAmount` (`field: "cash_tendered_amount"`): must be `> 0` and have at most 2 decimal places (`decimal.Round(val, 2) == val`).
     - `Note` (`field: "note"`): optional (`<= 500` chars).
   - `SalesReturnValidators.cs`: returns structured `IReadOnlyList<ApiErrorDetailDto>`:
     - `InvoiceId` (`field: "invoice_id"`): `!= Guid.Empty`.
     - `ReasonCode` (`field: "reason_code"`): required (`1..40` chars).
     - `IdempotencyKey` (`field: "idempotency_key"`): required (`1..100` chars).
     - `RefundMethod` (`field: "refund_method"`): must be `PaymentMethod.CASH`.
     - `ApprovedByEmployeeId` (`field: "approved_by_employee_id"`): when provided, `!= Guid.Empty`.
     - `Lines` (`field: "lines"`): non-empty (`1..200` items), each with `InvoiceLineId != Guid.Empty` (`field: "lines[i].invoice_line_id"`), `QuantityBase > 0` with max 4 decimal places (`field: "lines[i].quantity_base"`), and valid defined `ReturnDisposition` (`field: "lines[i].disposition"`).
     - Reject duplicate `InvoiceLineId` entries with `422 VALIDATION_ERROR` detail `lines[i].invoice_line_id` to keep per-line refund intent unambiguous.
4. **Update `GlobalUsings.cs`:** Add `PharmacyERP.Application.Features.Sales.DTOs`, `PharmacyERP.Application.Features.Sales.Validators`, `PharmacyERP.Application.Features.Sales.Repositories.Interfaces`, and `PharmacyERP.Application.Features.Sales.Services.Interfaces` (alphabetically) to `src/PharmacyERP.Application/GlobalUsings.cs` and relevant namespaces to `Infrastructure/GlobalUsings.cs` & `Api/GlobalUsings.cs`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Sales/SalesCheckoutAndReturnValidatorTests.cs`:
  - Valid checkout/return requests (including `IdempotencyKey` populated after header resolution) pass with zero errors.
  - Rejects empty/overlong `IdempotencyKey`, `CashTenderedAmount <= 0`, >2 decimal places on cash tendered, `Note > 500` chars, empty `InvoiceId`, empty `ReasonCode`, `ApprovedByEmployeeId == Guid.Empty`, empty `Lines`, `QuantityBase <= 0`, >4 decimal places on `QuantityBase`, undefined enum values, and duplicate `InvoiceLineId` entries, asserting exact strict **`snake_case`** `ApiErrorDetailDto.Field` paths (`idempotency_key`, `cash_tendered_amount`, `method`, `note`, `invoice_id`, `reason_code`, `refund_method`, `approved_by_employee_id`, `lines`, `lines[i].invoice_line_id`, `lines[i].quantity_base`, `lines[i].disposition`).

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** covering the DTO contracts and server-authoritative validation boundaries.

---

## Task `EH-03`: FEFO Allocation Repository & Service (`IFefoAllocationRepository`, `IFefoAllocationService`)

### 1. Task Header
- **Task ID:** `EH-03`
- **Title:** FEFO Allocation Repository & Service (`SELECT ... FOR UPDATE`, Org TZ Expiry, Multi-Batch Split, `409 OUT_OF_STOCK`)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/el-hosseiny/eh-03-fefo-allocation`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `EH-02` merged into `stage2-dev` and pulled locally.
- [ ] `InventoryBatch.IsEligibleForSale(DateOnly organizationBusinessDate)`, `StockBalance.ApplyOutgoingStock(...)`, and `IDateTimeProvider.GetOrganizationBusinessDate(string ianaTimeZoneId)` exist in Stage 1 codebase.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Create `IFefoAllocationRepository`** (`src/PharmacyERP.Application/Features/Sales/Repositories/Interfaces/IFefoAllocationRepository.cs`):
   ```csharp
   public sealed record LockedFefoCandidateRow(
       StockBalance Balance,
       Guid ProductId,
       Guid LocationId,
       Guid BatchId,
       DateOnly? ExpiresOn,
       BatchQualityStatus QualityStatus);

   public interface IFefoAllocationRepository
   {
       /// <summary>
       /// Locks all eligible sellable STOCK_BALANCE rows for the requested products at the target branch
       /// in deterministic (location_id ASC, batch_id ASC) lock order to prevent PostgreSQL 40P01 deadlocks,
       /// returning rows with batch metadata ready for FEFO ordering.
       /// </summary>
       Task<IReadOnlyList<LockedFefoCandidateRow>> LockEligibleSellableBalancesAsync(
           Guid organizationId,
           Guid branchId,
           IReadOnlyCollection<Guid> productIds,
           DateOnly organizationBusinessDate,
           CancellationToken ct = default);
   }
   ```
2. **Implement `FefoAllocationRepository`** (`src/PharmacyERP.Infrastructure/Persistence/Repositories/Sales/FefoAllocationRepository.cs`):
   - **Deadlock-Free Locking Discipline (matching Stage 1 `StockBalanceRepository.GetOrCreateForUpdateBatchAsync`):**
     - Relational PostgreSQL query: join `inventory."STOCK_BALANCE" sb` with `inventory."INVENTORY_LOCATION" loc` and `inventory."INVENTORY_BATCH" b`:
       ```sql
       SELECT sb.*
       FROM inventory."STOCK_BALANCE" sb
       INNER JOIN inventory."INVENTORY_LOCATION" loc
           ON loc.organization_id = sb.organization_id AND loc.location_id = sb.location_id
       INNER JOIN inventory."INVENTORY_BATCH" b
           ON b.organization_id = sb.organization_id AND b.batch_id = sb.batch_id
       WHERE sb.organization_id = {organizationId}
         AND loc.branch_id = {branchId}
         AND loc.is_active = true
         AND loc.is_sellable = true
         AND loc.location_type = 'SELLABLE'
         AND b.product_id = ANY({distinctProductIds})
         AND b.quality_status = 'AVAILABLE'
         AND (b.expires_on IS NULL OR b.expires_on > {organizationBusinessDate})
         AND sb.on_hand_qty_base > 0
       ORDER BY sb.location_id ASC, sb.batch_id ASC
       FOR UPDATE OF sb
       ```
       *(Notice two deliberate invariants: (1) `FOR UPDATE OF sb` acquires locks in strict `(location_id ASC, batch_id ASC)` order — identical to Stage 1 `StockBalanceRepository` so concurrent checkouts and adjustments NEVER deadlock; (2) `b.expires_on > organizationBusinessDate` matches Stage 1 `InventoryBatch.IsEligibleForSale(organizationBusinessDate)` where expiring on or before the business date is expired/ineligible.)*
     - Batch-fetch matching `InventoryBatch` rows (`AsNoTracking`) to attach `ProductId`, `ExpiresOn`, `QualityStatus` without N+1 queries.
     - Include EF Core LINQ fallback when `!_context.Database.IsRelational()` for in-memory tests.
3. **Create `IFefoAllocationService` & `FefoAllocationService`** (`src/PharmacyERP.Application/Features/Sales/Services/`):
   - Input: `organizationId`, `branchId`, `organizationTimeZoneId`, `IReadOnlyList<FefoLineDemand> demands` (`OrderLineId`, `LineIndex`, `ProductId`, `RequiredQtyBase`).
   - Resolve `DateOnly orgBusinessDate = _dateTimeProvider.GetOrganizationBusinessDate(organizationTimeZoneId);`.
   - Call `_fefoRepo.LockEligibleSellableBalancesAsync(organizationId, branchId, distinctProductIds, orgBusinessDate, ct)`.
   - Group locked candidates by `ProductId` and sort each product's pool in **exact Blueprint §8.9.3 FEFO order**:
     1. Dated batches before `NULL`-expiry (`NON-LOT`) batches (`row.ExpiresOn.HasValue ? 0 : 1`)
     2. `row.ExpiresOn` ascending
     3. `row.BatchId` ascending *(deterministic tie-breaker for equal expiry dates)*
     4. `row.LocationId` ascending *(deterministic tie-breaker if same batch exists in multiple sellable locations)*
   - Track remaining unallocated quantity per locked `StockBalance` in memory across all order lines (handling multiple order lines referencing the same `ProductId`!).
   - Allocate each demand line greedily across sorted batches (splitting across 2+ batches/locations when needed).
   - **Shortage Handling (Blueprint §6.7 & §8.6):** Evaluate ALL demand lines so if ANY line has insufficient eligible sellable stock, return `Result<FefoAllocationResult>.Failure(ErrorCode.OUT_OF_STOCK, "One or more order lines have insufficient eligible sellable stock.", affectedDetails)` where each affected line produces strict `snake_case` `new ApiErrorDetailDto($"lines[{demand.LineIndex}].quantity", $"Requested {demand.RequiredQtyBase:0.####} base units for product {demand.ProductId}; only {availableForLine:0.####} eligible sellable base units available.")`.
   - Return `FefoAllocationResult(IReadOnlyList<FefoAllocationSlice> Slices)` where each slice carries `(OrderLineId, ProductId, LocationId, BatchId, AllocatedQtyBase, StockBalance)`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Sales/FefoAllocationServiceTests.cs`:
  - Single-batch exact fulfillment.
  - Multi-batch split in strict `ExpiresOn ASC` order.
  - Equal `ExpiresOn` tie-breaking by `BatchId ASC`.
  - `NULL`-expiry (`NON-LOT`) batch sorted strictly AFTER dated batches.
  - Excludes `ExpiresOn <= orgBusinessDate` (using Org IANA timezone, e.g., `Africa/Cairo` vs UTC midnight crossover), `QUARANTINED`, `EXPIRED`, `RECALLED`, and non-sellable locations.
  - Multiple order lines for the same `ProductId` share the locked pool cleanly without double-allocating.
  - Partial/zero availability returns `ErrorCode.OUT_OF_STOCK` (`409`) with exact `ApiErrorDetailDto` for every affected line.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** explaining FEFO ordering, Org timezone business-date expiry, and why lock order `(location_id ASC, batch_id ASC)` is decoupled from FEFO consumption order (`expires_on ASC, batch_id ASC`) to prevent deadlocks.

---

## Task `EH-04`: Transactional Write Repositories (`ISalesCheckoutRepository`, `ISalesReturnWriteRepository`)

### 1. Task Header
- **Task ID:** `EH-04`
- **Title:** Transactional Write Repositories (`ISalesCheckoutRepository` & `ISalesReturnWriteRepository`)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/el-hosseiny/eh-04-checkout-and-return-repositories`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-04` and `AH-05` merged into `stage2-dev` and pulled locally (`PharmacyDbContext.Sales.cs` and Stage 2 migration active).
- [ ] `EH-02` merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
> **Reuse Live Stage 1 Repositories Directly (Zero Duplicated SQL / Zero Stage 1 Edits):** Live Stage 1 ALREADY provides `IOrganizationRepository.GetByIdAsync(Guid organizationId, CancellationToken ct = default)` (resolving `Organization.BaseCurrency` and `Organization.TimeZoneId`) and `IProductUomRepository.GetActiveBaseUomsByProductIdsAsync(Guid organizationId, IReadOnlyCollection<Guid> productIds, CancellationToken ct = default)` (batch-fetching active base `ProductUom` rows required by Blueprint §8.9.12 so every `INVENTORY_TXN_LINE` uses the product's base `PRODUCT_UOM` with `conversion_snapshot = 1` and `entered_qty = abs(quantity_delta_base)`). Inject and reuse those existing Stage 1 interfaces directly in `SalesCheckoutService` (`EH-05`) and `SalesReturnService` (`EH-06`/`EH-07`) — do **not** create redundant organization or base-UOM helper methods on Sales repositories.

1. **Create `ISalesCheckoutRepository` & `SalesCheckoutRepository`** (`Application/Features/Sales/Repositories/Interfaces/` & `Infrastructure/Persistence/Repositories/Sales/`):
   - `Task<SalesOrder?> GetOrderForCheckoutUpdateAsync(Guid organizationId, Guid salesOrderId, CancellationToken ct = default)`:
     - On relational PostgreSQL, locks the `SALES_ORDER` header row (`SELECT * FROM sales."SALES_ORDER" WHERE organization_id = {orgId} AND sales_order_id = {orderId} FOR UPDATE`) and eagerly loads `Lines` (ordered by `OrderLineId`) so concurrent checkout/cancel/edit attempts on the same order serialize cleanly.
   - `Task AddCheckoutArtifactsAsync(SalesInvoice invoice, SalesPayment payment, CancellationToken ct = default)`.
2. **Create `ISalesReturnWriteRepository` & `SalesReturnWriteRepository`:**
   - `Task<SalesInvoice?> GetInvoiceForReturnUpdateAsync(Guid organizationId, Guid invoiceId, CancellationToken ct = default)`:
     - Locks `SALES_INVOICE` row (`SELECT * FROM sales."SALES_INVOICE" WHERE organization_id = {orgId} AND invoice_id = {invoiceId} FOR UPDATE`) and loads `Lines` so concurrent partial returns on the same invoice serialize cleanly without over-returning or over-refunding.
   - `Task<IReadOnlyList<SoldAllocationFact>> GetOriginalSaleAllocationsAsync(Guid organizationId, Guid branchId, Guid salesOrderId, IReadOnlyCollection<Guid> sourceOrderLineIds, CancellationToken ct = default)`:
     - Loads original posted `SALE_ISSUE` `INVENTORY_TXN_LINE` rows (ordered deterministically by `InventoryTxnLineId ASC`) returning `(SourceOrderLineId, ProductId, LocationId, BatchId, SoldQtyBase: Math.Abs(QuantityDeltaBase), UnitCostBase)`.
   - `Task<IReadOnlyDictionary<(Guid InvoiceLineId, Guid BatchId), decimal>> GetAlreadyReturnedQtyByInvoiceLineAndBatchAsync(Guid organizationId, Guid invoiceId, CancellationToken ct = default)`:
     - Sums `QuantityBase` from `sales."SALES_RETURN_LINE"` joined to `sales."SALES_RETURN"` where `Status == SalesReturnStatus.POSTED` and `InvoiceId == invoiceId`.
   - `Task<IReadOnlyDictionary<Guid, (decimal ReturnedQtyBase, decimal RefundedAmount)>> GetAlreadyReturnedTotalsByInvoiceLineAsync(Guid organizationId, Guid invoiceId, CancellationToken ct = default)`:
     - Sums prior posted `QuantityBase` and `RefundAmount` per `InvoiceLineId` (needed for §8.9.12 final cent-residual refund rounding).
   - `Task<ApproverCandidate?> GetApproverCandidateAsync(Guid organizationId, Guid employeeId, CancellationToken ct = default)`:
     - `AsNoTracking()` load of `UserAccount` + `Employee` + `BranchAccesses` by `(organizationId, employeeId)` for distinct approver authorization.
   - `Task<IReadOnlyDictionary<LocationType, InventoryLocation>> GetActiveBranchLocationsByTypeAsync(Guid organizationId, Guid branchId, CancellationToken ct = default)` and `Task<IReadOnlyDictionary<Guid, InventoryLocation>> GetBranchLocationsByIdsAsync(Guid organizationId, Guid branchId, IReadOnlyCollection<Guid> locationIds, CancellationToken ct = default)`:
     - Resolves active `MAIN-SELLABLE` (or first active `SELLABLE`), `MAIN-QUARANTINE` (or first active `QUARANTINE`), and `MAIN-SCRAP` (or first active `SCRAP`) branch locations without client input.
   - `Task AddReturnArtifactsAsync(SalesReturn salesReturn, SalesRefund? salesRefund, CancellationToken ct = default)`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.IntegrationTests/Persistence/SalesCheckoutAndReturnRepositoryTests.cs` (`[SkipWhenPostgresUnavailableFact]`):
  - Verifies `GetOrderForCheckoutUpdateAsync` & `GetInvoiceForReturnUpdateAsync` acquire `FOR UPDATE` locks under `erp_it_app` + `FORCE RLS`.
  - Verifies `GetActiveBranchLocationsByTypeAsync`, `GetBranchLocationsByIdsAsync`, and `GetApproverCandidateAsync` resolve branch locations and approver branch accesses accurately under `FORCE RLS`.
  - Verifies `GetOriginalSaleAllocationsAsync` and `GetAlreadyReturnedTotalsByInvoiceLineAsync` accurately aggregate multi-batch sale issues and prior posted returns while ignoring `DRAFT`/`CANCELLED` returns.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** explaining why locking the `SALES_ORDER` / `SALES_INVOICE` aggregate header with `FOR UPDATE` prevents double-checkout and over-return race conditions.

---

## Task `EH-05`: Atomic POS Checkout Service (`POST /api/v1/sales-orders/{id}/complete`)

### 1. Task Header
- **Task ID:** `EH-05`
- **Title:** Atomic POS Checkout Service (`ISalesCheckoutService` — `POST /api/v1/sales-orders/{id}/complete`)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/el-hosseiny/eh-05-pos-checkout-service`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-07` (`IAuditLogger.LogWithIdAsync`, `ISyncOutboxWriter`, `SyncAuditFactDto`, & `CompleteSalesOrderSyncPayloadV1` in `SyncPayloads.cs`) merged into `stage2-dev` and pulled locally.
- [ ] `EH-03` (`IFefoAllocationService`) and `EH-04` (`ISalesCheckoutRepository`) merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Create `ISalesCheckoutService` & `SalesCheckoutService` (`src/PharmacyERP.Application/Features/Sales/Services/`):
- **Constants:** `IdempotencyScope = "sales.orders.complete"`, `OutboxTopic = "sales.order.completed"`, `MaxConcurrencyRetryAttempts = 3`.
- **Pre-Transaction Guard Clauses:**
  1. Validate `request` with `SalesCheckoutValidators` -> `422 VALIDATION_ERROR` with `ApiErrorDetailDto` list.
  2. Enforce `_runtimeMode.CurrentMode == ErpRuntimeMode.BranchLocal` -> `404 NOT_FOUND` (defense-in-depth alongside `RuntimeModeGuardMiddleware`).
  3. Require authenticated tenant (`_tenantContext.OrganizationId`) & actor (`_currentUser.EmployeeId`) -> `401 UNAUTHORIZED`.
  4. Enforce role `Cashier` or `Admin` -> `403 FORBIDDEN`.
- **Atomic Transaction with 3-Attempt Transient Concurrency Retry (`DbUpdateConcurrencyException` / PostgreSQL `40001`, `40P01`):**
  1. `await _unitOfWork.BeginTransactionAsync(ct);`
  2. Load & lock `SALES_ORDER` via `_checkoutRepo.GetOrderForCheckoutUpdateAsync(organizationId, salesOrderId, ct)` -> `404 NOT_FOUND` if null.
  3. Enforce `_currentUser.CanAccessBranch(order.BranchId)` -> rollback + `403 FORBIDDEN_BRANCH`.
  4. **Check Idempotency INSIDE transaction:**
     - Call `_idempotency.CheckAsync<CompleteSalesOrderRequest, CompleteSalesOrderResultDto>(IdempotencyScope, request.IdempotencyKey, order.BranchId, request, ct)`.
     - On replay -> rollback + return `Result<CompleteSalesOrderResultDto>.Success(replayedResponse)`.
     - On `IntegrationDomainException("IDEMPOTENCY_MISMATCH")` -> rollback + `409 IDEMPOTENCY_MISMATCH`.
  5. **Order State & Snapshot Validation:**
     - If `order.OrderStatus != SalesOrderStatus.DRAFT` -> rollback + `409 INVALID_STATE_TRANSITION`.
     - If `order.Lines.Count == 0` -> rollback + `422 VALIDATION_ERROR`.
     - Load `organization` via live Stage 1 `IOrganizationRepository.GetByIdAsync(organizationId, ct)` (resolving `organization.BaseCurrency` and `organization.TimeZoneId`) and verify `order.CurrencyCode == organization.BaseCurrency`.
     - Recompute authoritative invoice totals strictly from persisted order-line snapshots (`net_amount = round(entered_qty * unit_price_snapshot - discount_amount, 2)`, `tax_amount = round(net_amount * tax_rate_snapshot, 2)`, `line_total = net_amount + tax_amount`; `subtotal = sum(net_amount)`, `discount_total = sum(discount_amount)`, `tax_total = sum(tax_amount)`, `grand_total = sum(line_total)`).
     - Validate full cash payment (`request.CashTenderedAmount >= grandTotal` and `grandTotal > 0`): reject partial payments / unpaid credit with `422 VALIDATION_ERROR` (`field: "cash_tendered_amount"`). Compute `changeAmount = Math.Round(request.CashTenderedAmount - grandTotal, 2, MidpointRounding.AwayFromZero)`.
  6. **FEFO Allocation & Stock Deduction:**
     - Call `_fefoService.AllocateAsync(organizationId, order.BranchId, organization.TimeZoneId, demands, ct)`.
     - If failed (`409 OUT_OF_STOCK` with affected lines on `field: "lines[i].quantity"`) -> rollback + return failure.
     - Fetch active base UOM rows for all distinct products via live Stage 1 `IProductUomRepository.GetActiveBaseUomsByProductIdsAsync(organizationId, distinctProductIds, ct)` and map `ProductId -> ProductUomId` (verifying every product has an active base UOM).
     - Create `InventoryTxn.CreateDraft(..., TransactionType: SALE_ISSUE, idempotencyKey: request.IdempotencyKey!, salesOrderId: order.SalesOrderId, ...)`.
     - For each `FefoAllocationSlice`:
       - `decimal outgoingUnitCostBase = slice.StockBalance.ApplyOutgoingStock(slice.AllocatedQtyBase, now);`
       - Append base-UOM ledger line (`product_uom_id = baseUomId`, `entered_qty = slice.AllocatedQtyBase`, `conversion_snapshot = 1m`, `quantity_delta_base = -slice.AllocatedQtyBase`, `unit_cost_base = outgoingUnitCostBase`, `salesOrderLineId = slice.OrderLineId`).
     - Compute weighted-average `unit_cost_snapshot` per `SalesInvoiceLine`: `Math.Round(sum(slice.AllocatedQtyBase * outgoingUnitCostBase) / orderLine.QuantityBase, 4, MidpointRounding.AwayFromZero)`.
  7. **Create Sales Invoice, Cash Payment & Complete Order:**
     - `order.MarkCompleted(now);`
     - Create `SalesInvoice.Issue(...)` (`Status = ISSUED`, `PaymentStatus = PAID`, `PaidAmount = grandTotal`, `RefundedAmount = 0m`) with immutable `SalesInvoiceLine`s.
     - Create `SalesPayment.CreateCashPayment(...)` with `AmountDue = grandTotal`, `CashTenderedAmount = request.CashTenderedAmount`, `ChangeAmount = changeAmount`, `Method = PaymentMethod.CASH`, and `IdempotencyKey = request.IdempotencyKey!`.
  8. **Atomic Persistence, Trigger-Safe Ledger Posting, Audit, Outbox, Sync Outbox & Idempotency:**
     - Persist `SalesInvoice`, `SalesPayment`, and `InventoryTxn` (`DRAFT` + lines) -> `await _unitOfWork.SaveChangesAsync(ct);` *(satisfies PostgreSQL `BEFORE INSERT` immutability trigger on `INVENTORY_TXN_LINE`!)*.
     - `saleIssueTxn.Post(now);`
     - Write audit log capturing its exact persisted `AuditLogId` via `AH-07`'s `LogWithIdAsync`:
       ```csharp
       var auditLogId = await _auditLogger.LogWithIdAsync(
           action: "COMPLETE",
           entitySchema: "sales",
           entityName: "SALES_ORDER",
           entityId: order.SalesOrderId,
           beforeData: beforeOrderSnapshot,
           afterData: resultDto,
           branchId: order.BranchId,
           ct: ct);
       ```
     - Enqueue `IOutboxService.EnqueueAsync(OutboxTopic, order.BranchId, resultDto, ct: ct)`.
     - Enqueue `ISyncOutboxWriter.EnqueueAsync(order.BranchId, SyncOperationType.COMPLETE_SALES_ORDER, order.SalesOrderId, syncPayloadV1, payloadVersion: 1, ct: ct)` with exact IDs, ledger lines, and `SyncAuditFactDto` populated with that exact `auditLogId` plus serialized `beforeData`/`afterData`.
     - Persist idempotency response via `_idempotency.PersistResponseAsync(...)`.
     - `await _unitOfWork.CommitTransactionAsync(ct);`

### 4. Mandatory Unit & Integration Tests
- Verified in detail in `EH-09` and `EH-10`, plus immediate smoke unit test `tests/PharmacyERP.UnitTests/Application/Sales/SalesCheckoutServiceSmokeTests.cs` proving happy path atomic commit (including `IAuditLogger.LogWithIdAsync` `auditLogId` embedded in `SyncAuditFactDto`), `409 INVALID_STATE_TRANSITION`, `409 OUT_OF_STOCK` (`lines[i].quantity`), and `422` insufficient cash tendered (`field: "cash_tendered_amount"`).

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** walking through the single-transaction checkout flow, base-UOM ledger line invariant (§8.9.12), and `DRAFT -> SaveChanges -> Post` trigger compliance.

---

## Task `EH-06`: Sales Return Policy & Eligibility Validation (`ISalesReturnService` — Part 1)

### 1. Task Header
- **Task ID:** `EH-06`
- **Title:** Sales Return Policy, 14-Day Org TZ Check, Distinct Approver & Source Allocation Validator
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/el-hosseiny/eh-06-sales-return-policy-core`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `EH-04` and `EH-05` merged into `stage2-dev` and pulled locally.
- [ ] `ISalesReturnWriteRepository` and `CreateSalesReturnRequest` compile cleanly.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Create focused, testable policy/calculation components under `src/PharmacyERP.Application/Features/Sales/Services/Implementations/`:
1. **`SalesReturnPolicyEvaluator.cs`** (pure deterministic helper invoked by `SalesReturnService`):
   - **14-Day Window in Organization IANA Timezone (Blueprint §6.4 & §8.9.9):**
     *(Resolve `organizationTimeZoneId` in `SalesReturnService` from live Stage 1 `IOrganizationRepository.GetByIdAsync(organizationId, ct)`.)*
     ```csharp
     var timeZone = TimeZoneInfo.FindSystemTimeZoneById(organizationTimeZoneId);
     var issuedBusinessDate = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(invoice.IssuedAt, timeZone).Date);
     var currentBusinessDate = dateTimeProvider.GetOrganizationBusinessDate(organizationTimeZoneId);
     if (currentBusinessDate > issuedBusinessDate.AddDays(14))
         return Result.Failure(
             ErrorCode.VALIDATION_ERROR,
             "Sales return window of 14 days has expired.",
             new[] { new ApiErrorDetailDto("invoice_id", "Sales return window of 14 days has expired.") });
     ```
   - **Invoice Branch Enforcement:** verify `_currentUser.CanAccessBranch(invoice.BranchId)` (`403 FORBIDDEN_BRANCH`) and in `BranchLocal` verify `invoice.BranchId == _runtimeMode.EnrolledBranchId` (`403 FORBIDDEN_BRANCH` — return MUST be processed at the original invoice branch per §6.4).
   - **Distinct Approver Policy (Blueprint §8.9.9 & §9.1):**
     - Receiver is always `_currentUser.EmployeeId` (Cashier, Pharmacist, or Admin authorized for `invoice.BranchId`).
     - If `request.ApprovedByEmployeeId.HasValue`:
       - If `request.ApprovedByEmployeeId.Value == receiverEmployeeId` -> `422 VALIDATION_ERROR` with `snake_case` `ApiErrorDetailDto("approved_by_employee_id", "The approving employee must differ from the receiving employee; self-approval is forbidden.")`.
       - Load `ApproverCandidate` via `_returnWriteRepo.GetApproverCandidateAsync(organizationId, request.ApprovedByEmployeeId.Value, ct)`.
       - Reject with `403 FORBIDDEN` if missing, `!Employee.IsActive || !UserAccount.IsActive`, `Role is not (UserRole.Admin or UserRole.Pharmacist)`, or `!(BranchScope == BranchScope.ALL || AuthorizedBranchIds.Contains(invoice.BranchId))` (approver's home branch need NOT equal `invoice.BranchId`, per §8.9.9!).
2. **`SalesReturnAllocationAndRefundCalculator.cs`** (pure deterministic calculator):
   - **Server-Derived Allocation Splitting:** For each requested `SalesReturnLineRequest`:
     - Find `SalesInvoiceLine` belonging to `invoice` (`422 VALIDATION_ERROR` on `field: "lines[i].invoice_line_id"` if missing).
     - Fetch original posted `SALE_ISSUE` ledger allocations for `invoiceLine.SourceOrderLineId` minus cumulative already-returned quantities per `(invoiceLineId, batchId)`.
     - Verify `requestedQtyBase <= totalRemainingReturnableQtyBase` -> if exceeded, fail with `422 VALIDATION_ERROR` (typed policy error `ApiErrorDetailDto` with strict `snake_case` `field: "lines[i].quantity_base"` showing remaining returnable quantity).
     - Split `requestedQtyBase` deterministically across remaining original `SALE_ISSUE` `(LocationId, BatchId, UnitCostBase)` allocations in original `InventoryTxnLineId` order, preserving each allocation's exact original `UnitCostBase`!
   - **Exact Proportional Partial Refund Rounding with Cent-Residual Rule (Blueprint §8.9.12):**
     - Let `lineTotal = invoiceLine.LineTotal` (tax-inclusive: `net_amount + tax_amount`), `soldQtyBase = invoiceLine.QuantityBase`, `priorReturnedQty = alreadyReturned.ReturnedQtyBase`, `priorRefunded = alreadyReturned.RefundedAmount`.
     - If `priorReturnedQty + requestedQtyBase == soldQtyBase` *(final returned unit(s) for this invoice line)*:
       - `lineRefund = Math.Round(lineTotal - priorRefunded, 2, MidpointRounding.AwayFromZero)` *(assigns any remaining cent fraction deterministically so cumulative line refund equals `lineTotal` exactly!)*.
     - Else *(partial return)*:
       - `lineRefund = Math.Round(lineTotal * (requestedQtyBase / soldQtyBase), 2, MidpointRounding.AwayFromZero)`.
     - Guard: `lineRefund = Math.Min(lineRefund, Math.Round(lineTotal - priorRefunded, 2, MidpointRounding.AwayFromZero))` (never exceeds remaining refundable line total).
     - When an invoice line splits across multiple original batches, distribute `lineRefund` proportionally across the split slices and assign any slice rounding residual cent to the last slice so `sum(slice.RefundAmount) == lineRefund` exactly.
     - Verify total return refund `<= invoice.PaidAmount - invoice.RefundedAmount` (never exceeds remaining paid amount on invoice).
   - **Server-Selected Return Destination Location (Blueprint §8.9.9):**
     - `ReturnDisposition.RESTOCK`: original `SALE_ISSUE` location if still `IsActive && IsSellable && LocationType == SELLABLE`; otherwise branch default active `SELLABLE` location (`MAIN-SELLABLE`).
     - `ReturnDisposition.QUARANTINE`: branch default active `QUARANTINE` location (`MAIN-QUARANTINE`).
     - `ReturnDisposition.SCRAP`: branch default active `SCRAP` location (`MAIN-SCRAP`).

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Sales/SalesReturnPolicyAndRefundCalculatorTests.cs`:
  - 14-day window passes on day `0` and day `14` in Org TZ (`Africa/Cairo`), fails on day `15` (including UTC vs Org TZ midnight edge case).
  - Distinct approver: accepts Admin (`ALL` scope, different home branch) and Pharmacist (`ASSIGNED` to invoice branch); rejects Cashier approver, inactive approver, unassigned branch approver, and self-approval (`approvedBy == receivedBy`).
  - Partial refund cent-residual math: `100.00` sold qty `3` returned `1 + 1 + 1` -> `33.33 + 33.33 + 33.34 = 100.00` exact; `10.00` qty `3` -> `3.33 + 3.33 + 3.34 = 10.00`; multi-batch split sums exactly to `lineRefund`.
  - Over-return rejection across cumulative returns.
  - Destination selection fallback when original sellable location is deactivated.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** detailing the 14-day Org TZ rule, distinct approver policy, and §8.9.12 cent-residual rounding proof.

---

## Task `EH-07`: Atomic Sales Return & Refund Service (`POST /api/v1/sales-returns`)

### 1. Task Header
- **Task ID:** `EH-07`
- **Title:** Atomic Sales Return & Refund Execution (`ISalesReturnService` — `POST /api/v1/sales-returns`)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/el-hosseiny/eh-07-sales-return-service`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-07` (`IAuditLogger.LogWithIdAsync`, `ISyncOutboxWriter`, `SyncAuditFactDto`, & `PostSalesReturnSyncPayloadV1` in `SyncPayloads.cs`) merged into `stage2-dev` and pulled locally.
- [ ] `EH-06` (`SalesReturnPolicyEvaluator` & `SalesReturnAllocationAndRefundCalculator`) merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Create `ISalesReturnService` & `SalesReturnService` (`src/PharmacyERP.Application/Features/Sales/Services/`):
- **Constants:** `IdempotencyScope = "sales.returns.post"`, `OutboxTopic = "sales.return.posted"`, `MaxConcurrencyRetryAttempts = 3`.
- **Pre-Transaction Guard Clauses:** validate request via `SalesReturnValidators`, enforce `BranchLocal`, authenticated tenant & `EmployeeId`, role `Cashier`/`Pharmacist`/`Admin`.
- **Atomic Transaction with 3-Attempt Transient Concurrency Retry:**
  1. `await _unitOfWork.BeginTransactionAsync(ct);`
  2. Load & lock `SALES_INVOICE` via `_returnWriteRepo.GetInvoiceForReturnUpdateAsync(organizationId, request.InvoiceId, ct)` -> `404 NOT_FOUND` if null; load `organization` via live Stage 1 `IOrganizationRepository.GetByIdAsync(organizationId, ct)` for `organization.TimeZoneId`.
  3. Run `SalesReturnPolicyEvaluator` (invoice branch check, 14-day Org TZ window using `organization.TimeZoneId`, distinct approver verification).
  4. **Check Idempotency INSIDE transaction** (`IdempotencyScope`, `request.IdempotencyKey!`, `invoice.BranchId`, `request`): replay on match, `409 IDEMPOTENCY_MISMATCH` on hash conflict.
  5. Run `SalesReturnAllocationAndRefundCalculator` to derive `(LocationId, BatchId, DestinationLocationId, QuantityBase, UnitCostBase, RefundAmount, Disposition)` splits and verify no over-return or over-refund.
  6. **Create `SalesReturn` (`POSTED`) & `SalesReturnLine`s:**
     - `totalRefundAmount = request.IssueCashRefund ? sum(lines.RefundAmount) : 0m`.
     - `SalesRefund? refund = totalRefundAmount > 0m ? SalesRefund.CreateCashRefund(..., amount: totalRefundAmount, method: PaymentMethod.CASH, idempotencyKey: request.IdempotencyKey!, refundedAt: now) : null`.
     - If `totalRefundAmount > 0m`, call `invoice.ApplyRefund(totalRefundAmount, now)` (updates ONLY mutable settlement columns `refunded_amount`, `payment_status`, `updated_at` — respecting the PostgreSQL invoice immutability trigger!).
  7. **Atomic Stock Balance & Dual-Transaction Ledger Execution (`RESTOCK` / `QUARANTINE` / `SCRAP`):**
     - Acquire all destination `(DestinationLocationId, BatchId)` balance locks in **one deterministic ordered batch** via `IStockBalanceRepository.GetOrCreateForUpdateBatchAsync(organizationId, distinctKeys, now, ct)`.
     - Fetch active base UOM rows for all returned products via live Stage 1 `IProductUomRepository.GetActiveBaseUomsByProductIdsAsync(organizationId, distinctProductIds, ct)`.
     - **Transaction 1 — `SALES_RETURN_IN` (all dispositions: `RESTOCK`, `QUARANTINE`, `SCRAP`):**
       - `InventoryTxn.CreateDraft(..., TransactionType: SALES_RETURN_IN, idempotencyKey: request.IdempotencyKey!, salesReturnId: salesReturn.ReturnId)`.
       - For every `SalesReturnLine`:
         - `balance.ApplyIncomingStock(returnLine.QuantityBase, originalSaleUnitCostBase, now)` *(RESTOCK and QUARANTINE use original sale's `UnitCostBase`, never current moving average per §8.9.9!)*.
         - Add positive base-UOM ledger line (`conversion_snapshot = 1m`, `entered_qty = returnLine.QuantityBase`, `quantity_delta_base = +returnLine.QuantityBase`, `unit_cost_base = originalSaleUnitCostBase`, `salesReturnLineId = returnLine.ReturnLineId`).
     - **Transaction 2 — `SCRAP_OUT` (ONLY when one or more lines have `Disposition == ReturnDisposition.SCRAP`):**
       - `InventoryTxn.CreateDraft(..., TransactionType: SCRAP_OUT, idempotencyKey: request.IdempotencyKey!, salesReturnId: salesReturn.ReturnId)` *(shares the parent command `idempotency_key` safely because `INVENTORY_TXN` unique index includes `transaction_type` per §8.9.9!)*.
       - For every `SCRAP` `SalesReturnLine`:
         - `decimal scrapCost = balance.ApplyOutgoingStock(returnLine.QuantityBase, now);` *(ending `SCRAP` location on-hand balance returns to `0`!)*.
         - Add negative base-UOM ledger line (`conversion_snapshot = 1m`, `entered_qty = returnLine.QuantityBase`, `quantity_delta_base = -returnLine.QuantityBase`, `unit_cost_base = scrapCost`, `salesReturnLineId = returnLine.ReturnLineId`).
  8. **Trigger-Safe Persist & Post:**
     - Add `SalesReturn`, `SalesRefund?`, `returnInTxn`, and optional `scrapOutTxn` -> `await _unitOfWork.SaveChangesAsync(ct);` *(persists `SALES_RETURN_LINE`s first + `INVENTORY_TXN` as `DRAFT` + lines)*.
     - `returnInTxn.Post(now);` and `scrapOutTxn?.Post(now);`
     - Write audit log capturing its exact persisted `AuditLogId` via `AH-07`'s `LogWithIdAsync`:
       ```csharp
       var auditLogId = await _auditLogger.LogWithIdAsync(
           action: "POST_RETURN",
           entitySchema: "sales",
           entityName: "SALES_RETURN",
           entityId: salesReturn.ReturnId,
           beforeData: beforeInvoiceSnapshot,
           afterData: responseDto,
           branchId: invoice.BranchId,
           ct: ct);
       ```
     - Enqueue `IOutboxService.EnqueueAsync(OutboxTopic, invoice.BranchId, responseDto, ct: ct)`.
     - Enqueue `ISyncOutboxWriter.EnqueueAsync(invoice.BranchId, SyncOperationType.POST_SALES_RETURN, salesReturn.ReturnId, syncPayloadV1, payloadVersion: 1, ct: ct)` with exact IDs, ledger lines, and `SyncAuditFactDto` populated with that exact `auditLogId` plus serialized `beforeData`/`afterData`.
     - Persist idempotency response via `_idempotency.PersistResponseAsync(...)`.
     - `await _unitOfWork.CommitTransactionAsync(ct);`

### 4. Mandatory Unit & Integration Tests
- Immediate unit smoke test `tests/PharmacyERP.UnitTests/Application/Sales/SalesReturnServiceSmokeTests.cs` covering `RESTOCK`, `QUARANTINE`, and `SCRAP` dual-transaction execution (proving ending `SCRAP` balance is `0` and both txns link to `salesReturn.ReturnId`), plus full suite in `EH-09`/`EH-10`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** explaining the `RESTOCK`/`QUARANTINE`/`SCRAP` dual ledger mechanism, original sale cost retention, and why `SCRAP_OUT` safely shares `idempotency_key` with `SALES_RETURN_IN`.

---

## Task `EH-08`: Partial Write Controllers, DI Wiring & Incremental OpenAPI Sync

### 1. Task Header
- **Task ID:** `EH-08`
- **Title:** `SalesOrdersController.Checkout.cs`, `SalesReturnsController.Write.cs`, DI Registration & Incremental OpenAPI Sync
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/el-hosseiny/eh-08-write-controllers-and-di`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-06` partial controller shells (`SalesOrdersController.cs`, `SalesReturnsController.cs`) and `SalesCheckoutAndReturnsDependencyInjection.cs` exist in `stage2-dev`.
- [ ] `EH-05` and `EH-07` merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Create `src/PharmacyERP.Api/Controllers/SalesOrdersController.Checkout.cs`** (`public partial class SalesOrdersController`):
   - Action with complete `[ProducesResponseType]` attributes (required by `ContractsArtifactSyncTests`):
     ```csharp
     [HttpPost("{id:guid}/complete")]
     [Authorize(Policy = "PosCashierOrAdmin")]
     [AllowHeaderIdempotencyKey]
     [ProducesResponseType(typeof(CompleteSalesOrderResultDto), StatusCodes.Status200OK)]
     [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status400BadRequest)]
     [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]
     [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]
     [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]
     [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status409Conflict)]
     [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]
     public async Task<IActionResult> CompleteOrder(
         Guid id,
         [FromBody] CompleteSalesOrderRequest? request,
         [FromHeader(Name = "Idempotency-Key")] string? headerIdempotencyKey,
         [FromServices] ISalesCheckoutService checkoutService,
         [FromServices] ICurrentUser currentUser,
         CancellationToken ct)
     ```
   - Follow the exact Stage 1 `[AllowHeaderIdempotencyKey]` pattern (matching `InventoryController.PostAdjustment` and all 17 live Stage 1 mutating endpoints):
     - Null body -> `return ApiResultMapper.ToErrorResult(this, ErrorCode.MALFORMED_REQUEST, ErrorMessages.MalformedRequest, currentUser.TraceId);` (`400`).
     - Trimmed HTTP header takes precedence over body; blank in both -> `400 MALFORMED_REQUEST` via `ApiResultMapper.ToMissingIdempotencyKeyResult`:
       ```csharp
       var effectiveKey = !string.IsNullOrWhiteSpace(headerIdempotencyKey)
           ? headerIdempotencyKey.Trim()
           : request.IdempotencyKey?.Trim() ?? string.Empty;
       if (string.IsNullOrWhiteSpace(effectiveKey))
       {
           return ApiResultMapper.ToMissingIdempotencyKeyResult(this, currentUser.TraceId);
       }

       var effectiveRequest = request with { IdempotencyKey = effectiveKey };
       ```
     - Delegate to `checkoutService.CompleteOrderAsync(id, effectiveRequest, ct)` and return `ApiResultMapper.ToActionResult(this, result, currentUser.TraceId)` (`200 OK`).
2. **Create `src/PharmacyERP.Api/Controllers/SalesReturnsController.Write.cs`** (`public partial class SalesReturnsController`):
   - Action with complete `[ProducesResponseType]` attributes:
     ```csharp
     [HttpPost]
     [Authorize(Policy = "SalesReturnWriteAccess")]
     [AllowHeaderIdempotencyKey]
     [ProducesResponseType(typeof(SalesReturnDto), StatusCodes.Status201Created)]
     [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status400BadRequest)]
     [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]
     [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]
     [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]
     [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status409Conflict)]
     [ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]
     public async Task<IActionResult> CreateReturn(
         [FromBody] CreateSalesReturnRequest? request,
         [FromHeader(Name = "Idempotency-Key")] string? headerIdempotencyKey,
         [FromServices] ISalesReturnService returnService,
         [FromServices] ICurrentUser currentUser,
         CancellationToken ct)
     ```
   - Apply the exact same Stage 1 null-body (`400`) + trimmed header-precedence + `ApiResultMapper.ToMissingIdempotencyKeyResult(this, currentUser.TraceId)` (`400`) resolution (`request with { IdempotencyKey = effectiveKey }`).
   - Delegate to `returnService.CreateReturnAsync(effectiveRequest, ct)` and return `ApiResultMapper.ToCreatedResult(this, result, currentUser.TraceId, result.IsSuccess ? $"/api/v1/sales-returns/{result.Value!.ReturnId}" : null)` (`201 Created` + `Location` header).
3. **Register Services & Repositories ONLY in El-Hosseiny's Modular DI Files** (keep root `DependencyInjection.cs` untouched!):
   - `src/PharmacyERP.Application/Extensions/SalesCheckoutAndReturnsDependencyInjection.cs`: register `IFefoAllocationService`, `ISalesCheckoutService`, `ISalesReturnService` as `Scoped`.
   - `src/PharmacyERP.Infrastructure/Extensions/SalesCheckoutAndReturnsDependencyInjection.cs`: register `IFefoAllocationRepository`, `ISalesCheckoutRepository`, `ISalesReturnWriteRepository` as `Scoped`.
4. **Incremental Contract-First & OpenAPI Sync (MANDATORY in this PR — `ContractsArtifactSyncTests` Gate):**
   - Update `tests/PharmacyERP.IntegrationTests/Api/ContractsArtifactSyncTests.cs`:
     - Add `("/api/v1/sales-orders/{id}/complete", "post")` and `("/api/v1/sales-returns", "post")` to `ExpectedLiveEndpoints`.
     - Ensure all Stage 2 checkout/return wire enums (`PaymentMethod`, `SalesOrderStatus`, `SalesInvoiceStatus`, `SalesPaymentStatus`, `SalesReturnStatus`, `SalesRefundStatus`, `ReturnDisposition`) are included (without duplicates) in the string-only enum schema verification list.
   - Regenerate `apps/erp-backend/contracts/openapi.v1.json`:
     ```powershell
     $env:UPDATE_OPENAPI_SNAPSHOT="true"
     dotnet test tests/PharmacyERP.IntegrationTests/PharmacyERP.IntegrationTests.csproj --filter ContractsArtifactSyncTests
     Remove-Item Env:UPDATE_OPENAPI_SNAPSHOT
     ```
   - Update `apps/erp-backend/contracts/README.md` to document `POST /api/v1/sales-orders/{id}/complete` (`200 OK`) and `POST /api/v1/sales-returns` (`201 Created`).
   - Re-run `ContractsArtifactSyncTests` **without** `UPDATE_OPENAPI_SNAPSHOT` to verify exact byte/tree equality with live `/swagger/v1/swagger.json`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/API/Controllers/SalesCheckoutAndReturnWriteControllerTests.cs`:
  - Verifies `[AllowHeaderIdempotencyKey]`, header-only `Idempotency-Key` resolution, **trimmed header precedence over body key when both are supplied**, **`400 MALFORMED_REQUEST` via `ApiResultMapper.ToMissingIdempotencyKeyResult` when blank in both header and body**, null body `400 MALFORMED_REQUEST`, `200 OK` on complete, `201 Created` with `Location: /api/v1/sales-returns/{return_id}` header on return, and `ApiResultMapper` mapping for `403`, `404`, `409`, `422`.
- `tests/PharmacyERP.IntegrationTests/Api/ContractsArtifactSyncTests.cs` passes 100% with synchronized `apps/erp-backend/contracts/openapi.v1.json`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`, including `ContractsArtifactSyncTests`).
- Local API boot check confirming Swagger exposes `POST /api/v1/sales-orders/{id}/complete` and `POST /api/v1/sales-returns` with full typed schemas, then terminate cleanly.
- Provide a concise **Arabic explanation in chat** summarizing the partial controller endpoints, Stage 1 idempotency header-precedence protocol, zero-conflict DI wiring, and OpenAPI contract sync.

---

## Task `EH-09`: Exhaustive Checkout, FEFO & Sales Return Unit Test Suite

### 1. Task Header
- **Task ID:** `EH-09`
- **Title:** Exhaustive Unit Test Suite (FEFO, Checkout Atomicity, Returns, Dispositions & §8.9.12 Rounding)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/el-hosseiny/eh-09-checkout-and-return-unit-tests`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `EH-08` merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Expand comprehensive xUnit test coverage under `tests/PharmacyERP.UnitTests/Application/Sales/`:
1. `SalesCheckoutServiceFullUnitTests.cs`:
   - Multi-UOM order (`BOX` conversion `10`, `STRIP` conversion `2`) produces base-UOM `SALE_ISSUE` ledger lines (`conversion_snapshot = 1`) and accurate weighted-average `unit_cost_snapshot` across 2+ batches with different costs.
   - Exact change calculation (`tendered = 200.00`, `grandTotal = 147.35` -> `change = 52.65`; exact cash `tendered == grandTotal` -> `change = 0.00`).
   - Rejects partial payment (`tendered < grandTotal` -> `422` `field: "cash_tendered_amount"`), `COMPLETED`/`CANCELLED` order (`409 INVALID_STATE_TRANSITION`), empty lines (`422`), `Cloud` runtime (`404`), unauthorized branch (`403 FORBIDDEN_BRANCH`), missing tenant (`401`), `OUT_OF_STOCK` (`409` with affected lines on `field: "lines[i].quantity"` & verified transaction rollback).
   - Verifies idempotency replay returns stored DTO without calling stock/audit/outbox again; verifies `IDEMPOTENCY_MISMATCH` (`409`) rolls back cleanly.
   - Verifies transient concurrency retry succeeds on attempt 2 after `DbUpdateConcurrencyException`.
   - Verifies exact calls to `IAuditLogger.LogWithIdAsync` (embedding the returned `auditLogId` + `beforeData`/`afterData` into `SyncAuditFactDto`), `IOutboxService`, and `ISyncOutboxWriter` (`COMPLETE_SALES_ORDER`).
2. `SalesReturnServiceFullUnitTests.cs`:
   - Full return & multi-step partial returns (`1 + 1 + 1` of `100.00` = `33.33 + 33.33 + 33.34 = 100.00`; `50.00 / 7` across 7 returns) proving zero cent drift and exact `PAID -> PARTIALLY_REFUNDED -> REFUNDED` progression.
   - `RESTOCK` uses original sale `UnitCostBase` (NOT current moving average), updates sellable balance, posts `SALES_RETURN_IN` only.
   - `QUARANTINE` posts `SALES_RETURN_IN` to non-sellable `MAIN-QUARANTINE`, leaving sellable stock unchanged.
   - `SCRAP` posts BOTH `SALES_RETURN_IN` (+qty) and `SCRAP_OUT` (-qty) linked to `salesReturn.ReturnId` sharing `idempotency_key`, ending `MAIN-SCRAP` balance = `0`.
   - Mixed-disposition return (line 1 `RESTOCK`, line 2 `SCRAP`) in a single request produces accurate dual transactions and embeds exact `IAuditLogger.LogWithIdAsync` `auditLogId` + `beforeData`/`afterData` into `SyncAuditFactDto` (`POST_SALES_RETURN`).
   - Rejects day-15 return in Org TZ (`422` `field: "invoice_id"`), cross-branch return (`403 FORBIDDEN_BRANCH`), self-approving cashier (`422` `field: "approved_by_employee_id"`), unauthorized/inactive approver (`403`), over-return (`422 VALIDATION_ERROR` `field: "lines[i].quantity_base"`), and verifies rollback on every failure branch.

### 4. Mandatory Unit & Integration Tests
- Both test files above executed with `0 Failed, 0 Skipped`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing all covered edge cases and math invariants.

---

## Task `EH-10`: PostgreSQL Integration & Multi-Threaded Concurrency Test Suite

### 1. Task Header
- **Task ID:** `EH-10`
- **Title:** PostgreSQL Integration & Multi-Threaded Concurrency Tests (Checkout, FEFO & Returns)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/el-hosseiny/eh-10-checkout-return-integration-tests`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `EH-09` merged into `stage2-dev` and pulled locally.
- [ ] `ERP_IT_POSTGRES` configured locally (`ThrowawayPostgresDatabaseProvisioner` active with `erp_it_app`, `FORCE RLS`, and Stage 2 triggers).

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Create live PostgreSQL integration tests under `tests/PharmacyERP.IntegrationTests/Sales/` using `ThrowawayPostgresDatabaseProvisioner` + `[SkipWhenPostgresUnavailableFact]`:
1. `SalesCheckoutEndpointsAndConcurrencyTests.cs`:
   - **End-to-End HTTP Checkout (`BranchLocal`):** `POST /api/v1/sales-orders/{id}/complete` with strict **`snake_case`** JSON payload (`cash_tendered_amount`, `method`, `note`) and header-only `Idempotency-Key` returns `200 OK` (with `snake_case` response keys and native JSON numbers), persists `SALES_INVOICE`, `SALES_INVOICE_LINE`, `SALES_PAYMENT`, `SALE_ISSUE` `INVENTORY_TXN`/`INVENTORY_TXN_LINE`, `STOCK_BALANCE` deduction, `AUDIT_LOG`, `OUTBOX_EVENT`, `SYNC_OUTBOX` (`COMPLETE_SALES_ORDER` carrying exact `audit_log_id`), and `IDEMPOTENCY_RECORD` atomically.
   - **Idempotency Missing Key, Header Precedence, Replay & Mismatch:** missing/blank `Idempotency-Key` in both header and body returns **`400 MALFORMED_REQUEST`**; when both header and body carry a key, trimmed header takes precedence; identical retry replays stored `CompleteSalesOrderResultDto` with zero duplicate invoices/ledger rows; altered `cash_tendered_amount` with same key returns `409 IDEMPOTENCY_MISMATCH`.
   - **Multi-Threaded Hot-SKU Concurrency Gate (Blueprint §10.1):** Seed a single batch with `on_hand_qty_base = 10`, create 15 `DRAFT` orders each requesting `1` base unit, fire 15 parallel `POST .../complete` calls via `Task.WhenAll`: assert **exactly 10 succeed (`200 OK`)**, **exactly 5 fail (`409 OUT_OF_STOCK` with `lines[0].quantity` error detail)**, final `on_hand_qty_base == 0.0000` (zero oversell, zero deadlocks, zero negative stock).
   - **Security & Runtime Mode Gates:** `Cloud` runtime returns `404 NOT_FOUND`; `Pharmacist` attempting checkout returns `403 FORBIDDEN`; unauthorized branch returns `403 FORBIDDEN_BRANCH`; Tenant B cannot complete Tenant A's order (`404 NOT_FOUND` under `FORCE RLS`).
2. `SalesReturnEndpointsAndTriggersTests.cs`:
   - **End-to-End HTTP Returns (`BranchLocal`):** `POST /api/v1/sales-returns` with strict **`snake_case`** JSON payload (`invoice_id`, `reason_code`, `approved_by_employee_id`, `refund_method`, `issue_cash_refund`, `idempotency_key`, `lines[].invoice_line_id`, `lines[].quantity_base`, `lines[].disposition`) returns **`201 Created`** + **`Location: /api/v1/sales-returns/{return_id}`** header for `RESTOCK`, `QUARANTINE`, and `SCRAP` (verifying `MAIN-SCRAP` ending `on_hand_qty_base == 0` with both `SALES_RETURN_IN` and `SCRAP_OUT` persisted in `inventory."INVENTORY_TXN"` and `SYNC_OUTBOX` `POST_SALES_RETURN` carrying exact `audit_log_id`).
   - **Cumulative Partial Returns + Cent Residual:** 3 sequential partial returns on a `100.00` / qty `3` invoice line verify `SALES_INVOICE.refunded_amount` progresses `33.33 -> 66.66 -> 100.00` and `payment_status` progresses `PAID -> PARTIALLY_REFUNDED -> REFUNDED`, while a 4th return attempt is rejected (`422` `field: "lines[0].quantity_base"`).
   - **Multi-Threaded Concurrent Returns on Same Invoice:** Two simultaneous full-return requests on the same invoice serialize cleanly via `FOR UPDATE` on `SALES_INVOICE` — exactly 1 succeeds (`201 Created`) and 1 is rejected (zero double-refund).
   - **Idempotency (`400` Missing Key, Replay, `409 IDEMPOTENCY_MISMATCH`), 14-Day Policy, Distinct Approver (`422` `field: "approved_by_employee_id"`), `Cloud` Mode (`404`), & Cross-Tenant RLS (`404`).**

### 4. Mandatory Unit & Integration Tests
- Both live PostgreSQL integration test files executed with `0 Failed, 0 Skipped`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** presenting the concurrency stress-test proof (10/15 succeeded, 5/15 `409 OUT_OF_STOCK`, 0 oversell) and return/refund integration verification.

---

## Task `EH-FINAL`: Final Security, Performance & Architecture Audit

### 1. Task Header
- **Task ID:** `EH-FINAL`
- **Title:** Final Security, Performance & Architecture Audit (Checkout, FEFO & Returns)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/el-hosseiny/eh-final-stage2-audit`
- **Execution Command:** Execute via `/stage-final-audit` applying `@.agent/rules/00-backend-guardrails.md`, `@.agent/skills/pharmacy-backend-engineering/SKILL.md`, `@.agent/skills/backend-security-audit/SKILL.md`, `@.agent/skills/performance-concurrency-guard/SKILL.md`, and `@.agent/skills/architecture-unifier/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `EH-01` through `EH-10` merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Run `/stage-final-audit` across all El-Hosseiny's Stage 2 code (`EH-02`..`EH-10`) and generate **`apps/erp-backend/docs/stage2-reports/el-hosseiny-stage2-report.md`** covering:
1. **Concurrency & Locking Audit:** Verify deterministic `(location_id ASC, batch_id ASC)` `FOR UPDATE` lock order in `FefoAllocationRepository`, `FOR UPDATE` aggregate header locks on `SALES_ORDER`/`SALES_INVOICE`, `row_version` optimistic check + 3-attempt transient retry, and multi-threaded zero-oversell proof.
2. **Financial & Inventory Integrity Audit:** Verify server-authoritative totals/change, base-UOM ledger lines (`conversion_snapshot = 1`), weighted-average `unit_cost_snapshot`, original sale cost preservation on `RESTOCK`, `SCRAP` dual-txn zero ending balance, and §8.9.12 cent-residual refund rounding.
3. **Security & Architecture Audit:** Verify `BranchLocal`-only enforcement, tenant/branch scoping, distinct approver checks, exact Stage 1 `[AllowHeaderIdempotencyKey]` protocol (trimmed header precedence, `400 MALFORMED_REQUEST` via `ApiResultMapper.ToMissingIdempotencyKeyResult` when blank, `409 IDEMPOTENCY_MISMATCH`), zero edits to `Program.cs`/`PharmacyDbContext.cs`/root `DependencyInjection.cs`/Stage 1 repositories (confirming direct reuse of `IOrganizationRepository.GetByIdAsync` and `IProductUomRepository.GetActiveBaseUomsByProductIdsAsync`), and full `IAuditLogger.LogWithIdAsync` (exact `audit_log_id` + `beforeData`/`afterData` in `SyncAuditFactDto`) + `IOutboxService` + `ISyncOutboxWriter` integration.
4. **Stage 2 Contract-First & OpenAPI Gate:** Verify strict `snake_case` JSON wire serialization & `ApiErrorDetailDto.Field` paths (`idempotency_key`, `cash_tendered_amount`, `lines[i].invoice_line_id`, `lines[i].quantity_base`, `lines[i].disposition`, `lines[i].quantity`, `approved_by_employee_id`), optional trailing `string? IdempotencyKey = null` on `CompleteSalesOrderRequest` and `CreateSalesReturnRequest`, native JSON numbers for decimals (`D-01`), string-only enums, complete `[ProducesResponseType]` schemas on `POST /api/v1/sales-orders/{id}/complete` (`200 OK`) and `POST /api/v1/sales-returns` (`201 Created` + `Location`), and `ContractsArtifactSyncTests` passing with synchronized `apps/erp-backend/contracts/openapi.v1.json` and `apps/erp-backend/contracts/README.md`.
5. **Build & Test Proof:** Exact `dotnet build` (`0 Error(s), 0 Warning(s)`) and `dotnet test` (`100% Passed, 0 Failed, 0 Skipped`, exceeding the `767 / 767` Stage 1 baseline with `ContractsArtifactSyncTests` green).

### 4. Mandatory Unit & Integration Tests
- Execute full `PharmacyERP.sln` suite (`UnitTests` + `IntegrationTests`) with zero failures and zero skips; resolve any findings with regression tests before report sign-off.

### 5. Verification & Arabic Explanation Gate
- Confirm `apps/erp-backend/docs/stage2-reports/el-hosseiny-stage2-report.md` is generated and complete.
- Provide a final **Arabic debrief in chat** summarizing the audit results and confirming `EH-FINAL` sign-off for Wave 4.
