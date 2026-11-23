# Stage 2 Engineering Task Specification — Yassin (`YA-01`..`YA-09`, `YA-FINAL`)

| Field | Value |
| :--- | :--- |
| **Developer** | Yassin |
| **Master Reference** | [00-STAGE2-EXECUTION-MAP.md](./00-STAGE2-EXECUTION-MAP.md), [ahmed-hassan.md](./ahmed-hassan.md), & `_audit_docs/01_master_spec/ERP-Backend-Blueprint-v1.1.md` (Sections 6, 8 [§8.6, §8.9], 9, 10 — frozen reference-only) |
| **Base / Target Branch** | `stage2-dev` (**NEVER** open Stage 2 feature PRs against `main`) |
| **Execution Protocol** | Run every engineering task (`YA-01`..`YA-09`) via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md`, `@.agent/skills/pharmacy-stage1-baseline/SKILL.md`, and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`. Run `YA-FINAL` via `/stage-final-audit`. |
| **Owned Files & Interfaces** | `SalesOrderDraftDtos.cs`, `SalesInvoiceDtos.cs`, `SalesOrderValidators.cs`, `ISalesOrderDraftRepository`/`SalesOrderDraftRepository`, `ISalesInvoiceQueryRepository`/`SalesInvoiceQueryRepository`, `ISalesOrderDraftService`/`SalesOrderDraftService`, `ISalesInvoiceQueryService`/`SalesInvoiceQueryService`, `SalesOrdersController.Draft.cs`, `SalesInvoicesController.cs`, `SalesDraftDependencyInjection.cs` (Application + Infrastructure) |
| **Hard Boundaries** | Edit ONLY inside `apps/erp-backend/`. Keep `Program.cs`, `PharmacyDbContext.cs`, root `DependencyInjection.cs` files, Stage 1 interfaces (`IOrganizationRepository`, `IProductRepository`, etc.), and other teammates' owned files **100% untouched**. **ZERO stock reservation/mutation in draft orders. ZERO Stage 3 Purchasing code.** |

---

## Task `YA-01`: Local PostgreSQL Setup (`setup-local-db.ps1`) & `stage2-dev` Verification

### 1. Task Header
- **Task ID:** `YA-01`
- **Title:** Local PostgreSQL Setup (`setup-local-db.ps1`) & `stage2-dev` Verification
- **Base Branch:** `stage2-dev`
- **Feature Branch:** No code branch required (local environment onboarding before starting `YA-02`)
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

## Task `YA-02`: Sales Order Draft & Invoice DTOs + Input Validators

### 1. Task Header
- **Task ID:** `YA-02`
- **Title:** Sales Order Draft & Invoice DTOs + `SalesOrderValidators.cs`
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/yassin/ya-02-sales-order-and-invoice-dtos`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `YA-01` completed locally.
- [ ] `AH-01`..`AH-06` merged into `stage2-dev` and pulled locally (Stage 2 enums `OrderChannel`, `SalesOrderStatus`, `SalesInvoiceStatus`, `SalesPaymentStatus`, `PaymentMethod`, all 8 Sales entities, and `SalesDraftDependencyInjection.cs` compile cleanly).

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Keep all DTOs self-contained in Yassin's owned files (zero compile-time dependency on `EH-02` or `AS-02`) and 100% faithful to Blueprint §6.5 & §8.6:

1. **Create `src/PharmacyERP.Application/Features/Sales/DTOs/SalesOrderDraftDtos.cs`** (`namespace PharmacyERP.Application.Features.Sales.DTOs;`):
   - `SalesOrderLineRequest`:
     ```csharp
     public sealed record SalesOrderLineRequest(
         Guid ProductId,
         Guid ProductUomId,
         decimal EnteredQty);
     ```
     *(Strictly NO client-supplied unit price, discount, tax rate, tax amount, or line total — server loads authoritative prices and tax rates from catalog per Blueprint §6.5 & §8.9.9.)*
   - `CreateSalesOrderRequest`:
     ```csharp
     public sealed record CreateSalesOrderRequest(
         Guid BranchId,
         string IdempotencyKey,
         IReadOnlyList<SalesOrderLineRequest> Lines);
     ```
   - `ReplaceSalesOrderLinesRequest`:
     ```csharp
     public sealed record ReplaceSalesOrderLinesRequest(
         string IdempotencyKey,
         IReadOnlyList<SalesOrderLineRequest> Lines);
     ```
   - `CancelSalesOrderRequest`:
     ```csharp
     public sealed record CancelSalesOrderRequest(
         string IdempotencyKey,
         string? Reason = null);
     ```
   - `SalesOrderLineDto`:
     ```csharp
     public sealed record SalesOrderLineDto(
         Guid OrderLineId,
         Guid ProductId,
         string? ProductSku,
         string? ProductName,
         Guid ProductUomId,
         string? UomCode,
         decimal EnteredQty,
         decimal ConversionSnapshot,
         decimal QuantityBase,
         decimal UnitPriceSnapshot,
         decimal DiscountAmount,
         decimal TaxRateSnapshot,
         decimal TaxAmountSnapshot,
         decimal LineTotal);
     ```
   - `SalesOrderDto`:
     ```csharp
     public sealed record SalesOrderDto(
         Guid SalesOrderId,
         Guid OrganizationId,
         Guid BranchId,
         Guid CreatedByEmployeeId,
         string? CreatedByEmployeeName,
         string OrderNo,
         OrderChannel Channel,
         SalesOrderStatus OrderStatus,
         string CurrencyCode,
         decimal EstimatedSubtotal,
         decimal EstimatedDiscountTotal,
         decimal EstimatedTaxTotal,
         decimal EstimatedGrandTotal,
         string IdempotencyKey,
         DateTimeOffset CreatedAt,
         DateTimeOffset? CompletedAt,
         IReadOnlyList<SalesOrderLineDto> Lines);
     ```
   - `SalesOrderSummaryDto`:
     ```csharp
     public sealed record SalesOrderSummaryDto(
         Guid SalesOrderId,
         Guid BranchId,
         string OrderNo,
         OrderChannel Channel,
         SalesOrderStatus OrderStatus,
         string CurrencyCode,
         decimal EstimatedGrandTotal,
         int LineCount,
         Guid CreatedByEmployeeId,
         DateTimeOffset CreatedAt,
         DateTimeOffset? CompletedAt);
     ```
   - `SalesOrderQueryFilter(Guid? BranchId, SalesOrderStatus? Status, DateTimeOffset? FromDate, DateTimeOffset? ToDate, int Page = 1, int PageSize = 20)`.
2. **Create `src/PharmacyERP.Application/Features/Sales/DTOs/SalesInvoiceDtos.cs`:**
   - `SalesInvoiceLineDto`:
     ```csharp
     public sealed record SalesInvoiceLineDto(
         Guid InvoiceLineId,
         Guid SourceOrderLineId,
         Guid ProductId,
         string? ProductSku,
         string? ProductName,
         Guid ProductUomId,
         string? UomCode,
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
   - `SalesInvoicePaymentSummaryDto(Guid PaymentId, Guid ReceivedByEmployeeId, string? ReceivedByEmployeeName, decimal AmountDue, decimal CashTenderedAmount, decimal ChangeAmount, PaymentMethod Method, DateTimeOffset PaidAt, string? Note)`
   - `SalesInvoiceRefundSummaryDto(Guid RefundId, Guid SalesReturnId, Guid ProcessedByEmployeeId, string? ProcessedByEmployeeName, decimal Amount, PaymentMethod Method, DateTimeOffset RefundedAt)`
   - `SalesInvoiceDto`:
     ```csharp
     public sealed record SalesInvoiceDto(
         Guid InvoiceId,
         Guid OrganizationId,
         Guid BranchId,
         Guid SalesOrderId,
         string InvoiceNo,
         SalesInvoiceStatus Status,
         string CurrencyCode,
         decimal Subtotal,
         decimal DiscountTotal,
         decimal TaxTotal,
         decimal GrandTotal,
         decimal PaidAmount,
         decimal RefundedAmount,
         SalesPaymentStatus PaymentStatus,
         DateTimeOffset IssuedAt,
         IReadOnlyList<SalesInvoiceLineDto> Lines,
         IReadOnlyList<SalesInvoicePaymentSummaryDto> Payments,
         IReadOnlyList<SalesInvoiceRefundSummaryDto> Refunds);
     ```
   - `SalesInvoiceSummaryDto(Guid InvoiceId, Guid BranchId, Guid SalesOrderId, string InvoiceNo, SalesInvoiceStatus Status, string CurrencyCode, decimal Subtotal, decimal DiscountTotal, decimal TaxTotal, decimal GrandTotal, decimal PaidAmount, decimal RefundedAmount, SalesPaymentStatus PaymentStatus, DateTimeOffset IssuedAt)`
   - `SalesInvoiceQueryFilter(Guid? BranchId, string? InvoiceNo, SalesPaymentStatus? PaymentStatus, DateTimeOffset? FromDate, DateTimeOffset? ToDate, int Page = 1, int PageSize = 20)`.
3. **Create `src/PharmacyERP.Application/Features/Sales/Validators/SalesOrderValidators.cs`:**
   - Returns structured `IReadOnlyList<ApiErrorDetailDto>`:
     - `ValidateCreate(CreateSalesOrderRequest)`: `BranchId != Guid.Empty`, `IdempotencyKey` non-empty (`1..100` chars), `Lines` non-empty (`1..200` items), each line `ProductId != Guid.Empty`, `ProductUomId != Guid.Empty`, `EnteredQty > 0`, max 4 decimal places (`decimal.Round(qty, 4) == qty`).
     - `ValidateReplaceLines(ReplaceSalesOrderLinesRequest)`: `IdempotencyKey` (`1..100` chars), `Lines` non-empty (`1..200` items) with same per-line checks.
     - `ValidateCancel(CancelSalesOrderRequest)`: `IdempotencyKey` (`1..100` chars), optional `Reason <= 500` chars.
     - `ValidateDateRange(DateTimeOffset? fromDate, DateTimeOffset? toDate)`: reject `fromDate > toDate` with `422 VALIDATION_ERROR`.
4. **Update `GlobalUsings.cs`:** Ensure `PharmacyERP.Application.Features.Sales.DTOs`, `Validators`, `Repositories.Interfaces`, `Services.Interfaces` are present (alphabetically, without duplicating entries if already added).

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Sales/SalesOrderValidatorTests.cs`:
  - Valid create/replace/cancel requests pass with zero errors.
  - Rejects empty `BranchId`, empty/overlong `IdempotencyKey`, empty `Lines`, `> 200` lines, empty `ProductId`/`ProductUomId`, `EnteredQty <= 0`, `EnteredQty` with 5+ decimal places, `Reason > 500` chars, and inverted `fromDate > toDate` range with exact `ApiErrorDetailDto` field names.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** covering the draft order & invoice DTOs and why price/discount/tax fields are intentionally excluded from client request payloads.

---

## Task `YA-03`: Sales Order Draft Repository (`ISalesOrderDraftRepository`, `SalesOrderDraftRepository`)

### 1. Task Header
- **Task ID:** `YA-03`
- **Title:** Sales Order Draft Repository (`ISalesOrderDraftRepository` & `SalesOrderDraftRepository`)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/yassin/ya-03-sales-order-draft-repository`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-04` and `AH-05` merged into `stage2-dev` and pulled locally (`PharmacyDbContext.Sales.cs` & Stage 2 migration active).
- [ ] `YA-02` merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Create `ISalesOrderDraftRepository`** (`src/PharmacyERP.Application/Features/Sales/Repositories/Interfaces/ISalesOrderDraftRepository.cs`):
   ```csharp
   public interface ISalesOrderDraftRepository
   {
       Task<string?> GetOrganizationBaseCurrencyAsync(Guid organizationId, CancellationToken ct = default);
       Task AddAsync(SalesOrder order, CancellationToken ct = default);
       Task<SalesOrder?> GetForUpdateWithLinesAsync(Guid organizationId, Guid salesOrderId, CancellationToken ct = default);
       void RemoveLines(IEnumerable<SalesOrderLine> lines);
       Task<SalesOrderDto?> GetDetailByIdAsync(Guid organizationId, Guid salesOrderId, CancellationToken ct = default);
       Task<PagedResult<SalesOrderSummaryDto>> GetPagedAsync(
           Guid organizationId,
           IReadOnlyCollection<Guid>? allowedBranchIds,
           SalesOrderQueryFilter filter,
           CancellationToken ct = default);
   }
   ```
   *(Notice `GetOrganizationBaseCurrencyAsync` avoids modifying Stage 1 `IOrganizationRepository`!)*
2. **Implement `SalesOrderDraftRepository`** (`src/PharmacyERP.Infrastructure/Persistence/Repositories/Sales/SalesOrderDraftRepository.cs`):
   - `GetOrganizationBaseCurrencyAsync`: `_context.Organizations.AsNoTracking().Where(o => o.OrganizationId == organizationId).Select(o => o.BaseCurrency).FirstOrDefaultAsync(ct)`.
   - `GetForUpdateWithLinesAsync`: on relational PostgreSQL, acquires row lock `SELECT * FROM sales."SALES_ORDER" WHERE organization_id = {orgId} AND sales_order_id = {orderId} FOR UPDATE` (serializing concurrent replace-lines / cancel / checkout on the same order) and loads tracked `SalesOrderLines` via `_context.Entry(order).Collection(o => o.Lines).LoadAsync(ct)`. Includes EF LINQ fallback for non-relational unit tests.
   - `GetDetailByIdAsync`: strictly `.AsNoTracking()` + `.AsSplitQuery()` projecting `SalesOrderDto` with product SKU/name, UOM code, and employee full name via left joins — **NEVER filtering `IsActive == true`** on `Product`, `ProductUom`, `Employee`, or `Branch` so historical orders always load deactivated master data cleanly (Blueprint §8.9.9)!
   - `GetPagedAsync`: strictly `.AsNoTracking()`, clamps `page >= 1` and `pageSize` to `[1, 100]` (`MaxPageSize = 100`), applies `OrganizationId`, `allowedBranchIds` (when caller has `ASSIGNED` scope), optional `filter.BranchId`, `filter.Status`, `filter.FromDate <= CreatedAt <= filter.ToDate`, orders deterministically by `CreatedAt DESC, SalesOrderId DESC`, and returns `new PagedResult<SalesOrderSummaryDto>(items, safePage, safePageSize, totalCount)`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.IntegrationTests/Persistence/SalesOrderDraftRepositoryTests.cs` (`[SkipWhenPostgresUnavailableFact]`):
  - Verifies `AddAsync`, `GetForUpdateWithLinesAsync` + `RemoveLines` line replacement, `GetDetailByIdAsync` returning deactivated products/employees on historical orders, `GetPagedAsync` filtering by branch/status/date with accurate `Page`/`PageSize`/`TotalCount`, and cross-tenant `FORCE RLS` isolation under `erp_it_app`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** covering `AsNoTracking` query hygiene, historical inactive-entity preservation, and `FOR UPDATE` serialization on draft updates.

---

## Task `YA-04`: Sales Invoice Query Repository (`ISalesInvoiceQueryRepository`, `SalesInvoiceQueryRepository`)

### 1. Task Header
- **Task ID:** `YA-04`
- **Title:** Sales Invoice Query Repository (`ISalesInvoiceQueryRepository` & `SalesInvoiceQueryRepository`)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/yassin/ya-04-sales-invoice-query-repository`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-04` and `AH-05` merged into `stage2-dev` and pulled locally.
- [ ] `YA-02` merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Create `ISalesInvoiceQueryRepository`** (`src/PharmacyERP.Application/Features/Sales/Repositories/Interfaces/ISalesInvoiceQueryRepository.cs`):
   ```csharp
   public interface ISalesInvoiceQueryRepository
   {
       Task<PagedResult<SalesInvoiceSummaryDto>> GetPagedAsync(
           Guid organizationId,
           IReadOnlyCollection<Guid>? allowedBranchIds,
           SalesInvoiceQueryFilter filter,
           CancellationToken ct = default);

       Task<SalesInvoiceDto?> GetDetailByIdAsync(
           Guid organizationId,
           Guid invoiceId,
           CancellationToken ct = default);
   }
   ```
2. **Implement `SalesInvoiceQueryRepository`** (`src/PharmacyERP.Infrastructure/Persistence/Repositories/Sales/SalesInvoiceQueryRepository.cs`):
   - Strictly read-only: every query uses `.AsNoTracking()` (and `.AsSplitQuery()` on relational detail loads to prevent Cartesian explosion across `Lines`, `Payments`, and `Refunds`).
   - `GetPagedAsync`:
     - Clamps `page >= 1`, `pageSize` in `[1, 100]`.
     - Filters by `OrganizationId`, `allowedBranchIds` (if non-null), optional `filter.BranchId`, `filter.PaymentStatus`, `filter.FromDate <= IssuedAt <= filter.ToDate`, and optional `filter.InvoiceNo` (case-insensitive prefix/contains match, trimmed, max 40 chars).
     - Deterministic sort: `IssuedAt DESC, InvoiceId DESC`.
     - Returns `PagedResult<SalesInvoiceSummaryDto>(items, safePage, safePageSize, totalCount)`.
   - `GetDetailByIdAsync`:
     - Loads `SalesInvoice` + `Lines` (ordered by `InvoiceLineId ASC`) + `Payments` (ordered by `PaidAt ASC`) + `Refunds` (ordered by `RefundedAt ASC`).
     - Batch-fetches referenced `Product` (`Sku`, `Name`), `ProductUom` (`UomCode`), and `Employee` (`FullName`) in minimal set-based `.AsNoTracking()` queries (zero N+1 loops!) — **WITHOUT filtering `IsActive == true`** so historical invoices cleanly display deactivated products, UOMs, and employees!

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.IntegrationTests/Persistence/SalesInvoiceQueryRepositoryTests.cs` (`[SkipWhenPostgresUnavailableFact]`):
  - Verifies paginated search by `branchId`, `invoiceNo`, `paymentStatus`, and `fromDate`/`toDate`.
  - Verifies `GetDetailByIdAsync` returns complete line snapshots (`unit_price_snapshot`, `tax_rate_snapshot`, `tax_amount`, `net_amount`, `line_total`, `unit_cost_snapshot`), payments, and refunds even after the product or cashier employee is deactivated (`IsActive = false`).
  - Verifies PostgreSQL `FORCE RLS` cross-tenant isolation under `erp_it_app`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing the read-only invoice query design (`AsNoTracking`, `AsSplitQuery`, zero N+1, inactive-entity preservation).

---

## Task `YA-05`: `ISalesOrderDraftService` (Part 1) — Create Draft & Replace Draft Lines

### 1. Task Header
- **Task ID:** `YA-05`
- **Title:** `ISalesOrderDraftService` (Part 1) — `POST /api/v1/sales-orders` & `PUT /api/v1/sales-orders/{id}/lines`
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/yassin/ya-05-sales-order-draft-write-service`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `YA-03` (`ISalesOrderDraftRepository`) merged into `stage2-dev` and pulled locally.
- [ ] Stage 1 `IProductRepository`, `IProductUomRepository`, `IBranchRepository`, `IUnitOfWork`, `IIdempotencyService`, `IAuditLogger`, `IDateTimeProvider`, `IRuntimeModeProvider`, `ITenantContext`, and `ICurrentUser` compile cleanly.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Create `ISalesOrderDraftService` & `SalesOrderDraftService` (`src/PharmacyERP.Application/Features/Sales/Services/`):
- **Constants:** `CreateScope = "sales.orders.create"`, `ReplaceLinesScope = "sales.orders.replace-lines"`.
- **Method 1: `CreateDraftAsync(CreateSalesOrderRequest request, CancellationToken ct)`:**
  1. Validate `request` via `SalesOrderValidators.ValidateCreate` -> `422 VALIDATION_ERROR` with field details.
  2. Enforce `_runtimeMode.CurrentMode == ErpRuntimeMode.BranchLocal` -> `404 NOT_FOUND`.
  3. Require authenticated `_tenantContext.OrganizationId` & `_currentUser.EmployeeId` -> `401 UNAUTHORIZED`.
  4. Enforce role `Cashier` or `Admin` -> `403 FORBIDDEN`, and `_currentUser.CanAccessBranch(request.BranchId)` -> `403 FORBIDDEN_BRANCH`.
  5. Open `await _unitOfWork.BeginTransactionAsync(ct);`:
     - Check idempotency (`CreateScope`, `request.IdempotencyKey`, `request.BranchId`, `request`): replay -> rollback + return stored `SalesOrderDto`; mismatch -> rollback + `409 IDEMPOTENCY_MISMATCH`.
     - Verify branch exists and `branch.IsActive` -> rollback + `404`/`422`.
     - Load `baseCurrency` via `_draftRepo.GetOrganizationBaseCurrencyAsync(orgId, ct)`.
     - Batch-fetch all distinct `Product`s via `_productRepo.GetByIdsAsync` and `ProductUom`s via `_productUomRepo.GetByIdsAsync` (zero N+1 loops!).
     - Validate every line:
       - `product` exists and `product.IsActive` (`404`/`422`).
       - `uom` exists, `uom.ProductId == product.ProductId`, `uom.IsActive`, `uom.IsSellable`, and `uom.SaleUnitPrice.HasValue && uom.SaleUnitPrice.Value >= 0` (`422 VALIDATION_ERROR` on non-sellable or missing price).
     - Generate `orderNo = $"POS-{now:yyyyMMddHHmmss}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}"`.
     - Construct `SalesOrder.CreateDraft(orgId, request.BranchId, employeeId, orderNo, OrderChannel.POS, baseCurrency, request.IdempotencyKey, now)` and `SalesOrderLine.Create(...)` with authoritative snapshots:
       - `conversion_snapshot = uom.ConversionToBase`
       - `quantity_base = Math.Round(line.EnteredQty * uom.ConversionToBase, 4, MidpointRounding.AwayFromZero)`
       - `unit_price_snapshot = uom.SaleUnitPrice.Value`
       - `discount_amount = 0m` *(no arbitrary client discount per §8.9.9)*
       - `tax_rate_snapshot = product.TaxRate`
       - `net = Math.Round(line.EnteredQty * uom.SaleUnitPrice.Value - 0m, 2, MidpointRounding.AwayFromZero)`
       - `tax_amount_snapshot = Math.Round(net * product.TaxRate, 2, MidpointRounding.AwayFromZero)`
       - `line_total = net + tax_amount_snapshot`
     - **ZERO stock reservation, ZERO `STOCK_BALANCE` reads/writes, ZERO `INVENTORY_TXN` rows, ZERO `SYNC_OUTBOX` rows** *(drafts are non-posting; only completed sales sync to Cloud per §6.4 & §8.9.11)*.
     - Persist order via `_draftRepo.AddAsync(order, ct)`, log `IAuditLogger.LogAsync(action: "CREATE", entitySchema: "sales", entityName: "SALES_ORDER", entityId: order.SalesOrderId, beforeData: null, afterData: dto, branchId: request.BranchId, ct: ct)`, persist idempotency via `_idempotency.PersistResponseAsync(...)`, and commit `await _unitOfWork.CommitTransactionAsync(ct);`.
- **Method 2: `ReplaceLinesAsync(Guid salesOrderId, ReplaceSalesOrderLinesRequest request, CancellationToken ct)`:**
  1. Same pre-transaction guards (validator, `BranchLocal`, auth, role `Cashier`/`Admin`).
  2. Open transaction -> lock order via `_draftRepo.GetForUpdateWithLinesAsync(orgId, salesOrderId, ct)` -> `404 NOT_FOUND` if null -> verify `_currentUser.CanAccessBranch(order.BranchId)` (`403 FORBIDDEN_BRANCH`).
  3. Check idempotency (`ReplaceLinesScope`, `request.IdempotencyKey`, `order.BranchId`, `request`): replay or `409 IDEMPOTENCY_MISMATCH`.
  4. Verify `order.OrderStatus == SalesOrderStatus.DRAFT` -> rollback + `409 INVALID_STATE_TRANSITION` if `COMPLETED` or `CANCELLED`.
  5. Capture `beforeSnapshot` for audit, batch-fetch & validate active sellable products/UOMs, snapshot current active `SaleUnitPrice` & `TaxRate`, remove previous lines (`_draftRepo.RemoveLines(existingLines)`), call `order.ReplaceLines(newLines)`.
  6. Write `IAuditLogger.LogAsync(action: "UPDATE_LINES", ...)`, persist idempotency, commit atomically (ZERO stock mutation!).

### 4. Mandatory Unit & Integration Tests
- Smoke unit tests in `tests/PharmacyERP.UnitTests/Application/Sales/SalesOrderDraftWriteTests.cs` proving server-authoritative price/tax/UOM math (`MidpointRounding.AwayFromZero`), non-sellable UOM rejection (`422`), `409 INVALID_STATE_TRANSITION` when replacing lines on `COMPLETED`/`CANCELLED` order, and zero stock repository dependencies.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** detailing draft snapshot math and why drafts never touch stock balances or `SYNC_OUTBOX`.

---

## Task `YA-06`: `ISalesOrderDraftService` (Part 2) — Cancel Draft & Order Queries

### 1. Task Header
- **Task ID:** `YA-06`
- **Title:** `ISalesOrderDraftService` (Part 2) — `POST /api/v1/sales-orders/{id}/cancel`, `GET` List & `GET {id}`
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/yassin/ya-06-sales-order-cancel-and-queries`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `YA-05` merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Extend `ISalesOrderDraftService` & `SalesOrderDraftService`:
1. **`CancelDraftAsync(Guid salesOrderId, CancelSalesOrderRequest request, CancellationToken ct)` (`POST /api/v1/sales-orders/{id}/cancel`):**
   - Validate request (`SalesOrderValidators.ValidateCancel`), enforce `BranchLocal`, authenticated tenant/employee, role `Cashier`/`Admin`.
   - Open write transaction -> lock order via `_draftRepo.GetForUpdateWithLinesAsync(orgId, salesOrderId, ct)` -> `404` if missing -> check `_currentUser.CanAccessBranch(order.BranchId)` (`403 FORBIDDEN_BRANCH`).
   - Check idempotency (`"sales.orders.cancel"`, `request.IdempotencyKey`, `order.BranchId`, `request`): replay or `409 IDEMPOTENCY_MISMATCH`.
   - Enforce `order.OrderStatus == SalesOrderStatus.DRAFT` -> rollback + `409 INVALID_STATE_TRANSITION` if `COMPLETED` or `CANCELLED`.
   - Call `order.Cancel()` (zero stock reversal, zero invoice/payment creation).
   - Write `IAuditLogger.LogAsync(action: "CANCEL", entitySchema: "sales", entityName: "SALES_ORDER", entityId: order.SalesOrderId, beforeData: beforeDto, afterData: afterDto, branchId: order.BranchId, ct: ct)` including optional `request.Reason`.
   - Persist idempotency & commit atomically.
2. **`GetOrdersAsync(SalesOrderQueryFilter filter, CancellationToken ct)` (`GET /api/v1/sales-orders`):**
   - Allowed on BOTH `Cloud` and `BranchLocal`; roles `Admin`, `Pharmacist`, `Cashier`.
   - Validate date range (`fromDate <= toDate` -> `422`).
   - Branch scope check: if `filter.BranchId.HasValue` and `!_currentUser.CanAccessBranch(filter.BranchId.Value)` -> `403 FORBIDDEN_BRANCH`. Otherwise pass `allowedBranchIds = string.Equals(_currentUser.BranchScope, "ALL", StringComparison.Ordinal) ? null : _currentUser.AuthorizedBranchIds`.
   - Execute inside explicit `IUnitOfWork` read transaction (`BeginTransactionAsync` -> `_draftRepo.GetPagedAsync(...)` -> `finally { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); }`) as required by `TenantRlsConnectionInterceptor`.
3. **`GetOrderByIdAsync(Guid salesOrderId, CancellationToken ct)` (`GET /api/v1/sales-orders/{id}`):**
   - Explicit `IUnitOfWork` read transaction -> `_draftRepo.GetDetailByIdAsync(orgId, salesOrderId, ct)` -> `404 NOT_FOUND` if null -> verify `_currentUser.CanAccessBranch(dto.BranchId)` (`403 FORBIDDEN_BRANCH`) -> return `Result<SalesOrderDto>.Success(dto)`.

### 4. Mandatory Unit & Integration Tests
- Unit tests in `tests/PharmacyERP.UnitTests/Application/Sales/SalesOrderCancelAndQueryTests.cs` verifying `DRAFT -> CANCELLED`, `409 INVALID_STATE_TRANSITION` on `COMPLETED`/`CANCELLED`, idempotency replay/mismatch, `403 FORBIDDEN_BRANCH`, and explicit read-transaction `BeginTransactionAsync` + `RollbackTransactionAsync(CancellationToken.None)`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing draft cancellation guarantees and RLS read-transaction wrapping.

---

## Task `YA-07`: Sales Invoice Query Service (`ISalesInvoiceQueryService`, `SalesInvoiceQueryService`)

### 1. Task Header
- **Task ID:** `YA-07`
- **Title:** Sales Invoice Query Service (`GET /api/v1/sales-invoices` & `GET /api/v1/sales-invoices/{id}`)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/yassin/ya-07-sales-invoice-query-service`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `YA-04` (`ISalesInvoiceQueryRepository`) merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Create `ISalesInvoiceQueryService` & `SalesInvoiceQueryService` (`src/PharmacyERP.Application/Features/Sales/Services/`):
1. **`GetInvoicesAsync(SalesInvoiceQueryFilter filter, CancellationToken ct)`:**
   - Allowed on BOTH `Cloud` and `BranchLocal`; roles `Admin`, `Pharmacist`, `Cashier`.
   - Validate authenticated tenant (`401`), date range (`fromDate <= toDate` -> `422`), and `filter.BranchId` branch authorization (`403 FORBIDDEN_BRANCH`).
   - Compute `allowedBranchIds` (`null` for `BranchScope == "ALL"`, otherwise `_currentUser.AuthorizedBranchIds`).
   - Execute inside explicit `IUnitOfWork` read transaction (`BeginTransactionAsync` -> `_invoiceQueryRepo.GetPagedAsync(...)` -> `finally { RollbackTransactionAsync(CancellationToken.None) }`).
2. **`GetInvoiceByIdAsync(Guid invoiceId, CancellationToken ct)`:**
   - Allowed on BOTH `Cloud` and `BranchLocal`.
   - Explicit `IUnitOfWork` read transaction -> `_invoiceQueryRepo.GetDetailByIdAsync(orgId, invoiceId, ct)` -> `404 NOT_FOUND` if null -> verify `_currentUser.CanAccessBranch(dto.BranchId)` -> `403 FORBIDDEN_BRANCH` if unauthorized -> return `Result<SalesInvoiceDto>.Success(dto)` containing all immutable lines, price/tax/cost snapshots, cash payments, refunds, and current `paid_amount`/`refunded_amount`/`payment_status`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Sales/SalesInvoiceQueryServiceTests.cs`:
  - Happy path list & detail, `ASSIGNED` vs `ALL` branch scoping, `403 FORBIDDEN_BRANCH`, `404 NOT_FOUND`, `422` invalid date range, and verified `BeginTransactionAsync` + `RollbackTransactionAsync(CancellationToken.None)`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing the invoice read service and branch-scope protections.

---

## Task `YA-08`: Controllers (`SalesOrdersController.Draft.cs`, `SalesInvoicesController.cs`) & DI Wiring

### 1. Task Header
- **Task ID:** `YA-08`
- **Title:** `SalesOrdersController.Draft.cs`, `SalesInvoicesController.cs` & `SalesDraftDependencyInjection.cs` Wiring
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/yassin/ya-08-draft-and-invoice-controllers`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-06` (`SalesOrdersController.cs` partial shell & `SalesDraftDependencyInjection.cs`) merged into `stage2-dev` and pulled locally.
- [ ] `YA-06` and `YA-07` merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Create `src/PharmacyERP.Api/Controllers/SalesOrdersController.Draft.cs`** (`public partial class SalesOrdersController`, using `[FromServices]` so `SalesOrdersController.cs` remains untouched and zero constructor conflict occurs with El-Hosseiny's `SalesOrdersController.Checkout.cs`):
   - `[HttpPost]` (`POST /api/v1/sales-orders`), `[Authorize(Policy = "PosCashierOrAdmin")]`, `[AllowHeaderIdempotencyKey]` -> merge `Idempotency-Key` header/body -> `draftService.CreateDraftAsync(...)` -> `ApiResultMapper.ToCreatedResult(this, result, currentUser.TraceId, $"/api/v1/sales-orders/{result.Value?.SalesOrderId}")` (`201 Created`).
   - `[HttpGet]` (`GET /api/v1/sales-orders`), `[Authorize(Policy = "SalesReadAccess")]` -> query params `branchId`, `status`, `fromDate`, `toDate`, `page = 1`, `pageSize = 20` -> `ApiResultMapper.ToActionResult`.
   - `[HttpGet("{id:guid}")]` (`GET /api/v1/sales-orders/{id}`), `[Authorize(Policy = "SalesReadAccess")]` -> `ApiResultMapper.ToActionResult`.
   - `[HttpPut("{id:guid}/lines")]` (`PUT /api/v1/sales-orders/{id}/lines`), `[Authorize(Policy = "PosCashierOrAdmin")]`, `[AllowHeaderIdempotencyKey]` -> merge `Idempotency-Key` header/body -> `ApiResultMapper.ToActionResult`.
   - `[HttpPost("{id:guid}/cancel")]` (`POST /api/v1/sales-orders/{id}/cancel`), `[Authorize(Policy = "PosCashierOrAdmin")]`, `[AllowHeaderIdempotencyKey]` -> merge `Idempotency-Key` header/body -> `ApiResultMapper.ToActionResult`.
2. **Create `src/PharmacyERP.Api/Controllers/SalesInvoicesController.cs`:**
   - `[ApiController]`, `[Route("api/v1/sales-invoices")]`, `[Authorize(Policy = "SalesReadAccess")]`.
   - `[HttpGet]` (`GET /api/v1/sales-invoices`): query params `branchId`, `invoiceNo`, `paymentStatus`, `fromDate`, `toDate`, `page = 1`, `pageSize = 20` -> `invoiceQueryService.GetInvoicesAsync(...)` -> `ApiResultMapper.ToActionResult`.
   - `[HttpGet("{id:guid}")]` (`GET /api/v1/sales-invoices/{id}`): `invoiceQueryService.GetInvoiceByIdAsync(id, ct)` -> `ApiResultMapper.ToActionResult`.
3. **Register Services & Repositories ONLY in Yassin's Modular DI Files** (keep root `DependencyInjection.cs` untouched!):
   - `src/PharmacyERP.Application/Extensions/SalesDraftDependencyInjection.cs`: register `ISalesOrderDraftService`, `ISalesInvoiceQueryService` (`Scoped`).
   - `src/PharmacyERP.Infrastructure/Extensions/SalesDraftDependencyInjection.cs`: register `ISalesOrderDraftRepository`, `ISalesInvoiceQueryRepository` (`Scoped`).

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/API/Controllers/SalesOrderDraftAndInvoiceControllerTests.cs`:
  - Verifies `[AllowHeaderIdempotencyKey]`, header-only `Idempotency-Key` merging, mismatched header/body key `422`, null body `400 MALFORMED_REQUEST`, `201 Created` on create, `200 OK` on replace/cancel/reads, and `ApiResultMapper` error envelope responses.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Local API boot check confirming Swagger exposes all 7 endpoints (`5` draft/order + `2` invoice), then terminate cleanly.
- Provide a concise **Arabic explanation in chat** covering the partial controller integration and modular DI wiring.

---

## Task `YA-09`: Exhaustive Unit & PostgreSQL Integration Test Suite (Draft Orders & Invoices)

### 1. Task Header
- **Task ID:** `YA-09`
- **Title:** Exhaustive Unit & PostgreSQL Integration Tests (Draft Lifecycle, Rounding, RLS, Idempotency & Invoices)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/yassin/ya-09-draft-and-invoice-integration-tests`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `YA-08` merged into `stage2-dev` and pulled locally.
- [ ] `ERP_IT_POSTGRES` configured locally (`ThrowawayPostgresDatabaseProvisioner` active with `erp_it_app` and `FORCE RLS`).

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Create comprehensive live PostgreSQL + HTTP `WebApplicationFactory` integration tests under `tests/PharmacyERP.IntegrationTests/Sales/SalesOrderDraftAndInvoiceEndpointsTests.cs` (`[SkipWhenPostgresUnavailableFact]`):
1. **Draft Creation & Zero Stock Reservation:** `POST /api/v1/sales-orders` (`BranchLocal`, header-only `Idempotency-Key`) returns `201 Created` with server-calculated `quantity_base`, `net`, `tax_amount_snapshot`, and `line_total` (verifying half-away-from-zero rounding on fractional prices/tax rates such as `19.995` & `14%` tax); assert `STOCK_BALANCE` and `INVENTORY_TXN` rows remain 100% untouched.
2. **Idempotency Replay & Mismatch:** repeating `POST`, `PUT .../lines`, and `POST .../cancel` with the same `Idempotency-Key` + equivalent payload replays exact stored response without duplicate rows; mutating `enteredQty` with the same key returns `409 IDEMPOTENCY_MISMATCH`.
3. **Line Replacement & State Transitions:** `PUT /api/v1/sales-orders/{id}/lines` replaces lines cleanly while `DRAFT` (updating snapshots to new active catalog price if price changed); returns `409 INVALID_STATE_TRANSITION` after order is `CANCELLED` or `COMPLETED`.
4. **Draft Cancel:** `POST /api/v1/sales-orders/{id}/cancel` transitions `DRAFT -> CANCELLED`, writes `AUDIT_LOG`, creates zero invoice/payment/stock rows; cancelling twice with a new key returns `409 INVALID_STATE_TRANSITION`.
5. **Invoice Search & Detail:** `GET /api/v1/sales-invoices` filters by branch/date/invoiceNo/paymentStatus with accurate `PagedResult` metadata; `GET /api/v1/sales-invoices/{id}` returns full snapshots, payments, refunds, and succeeds even after product/employee deactivation (`IsActive = false`).
6. **Security, Runtime Mode & Cross-Tenant RLS:**
   - `Cloud` runtime blocks `POST /api/v1/sales-orders`, `PUT .../lines`, `POST .../cancel` with `404 NOT_FOUND` while allowing `GET /api/v1/sales-orders` and `GET /api/v1/sales-invoices`.
   - `Pharmacist` cannot create/edit/cancel POS drafts (`403 FORBIDDEN`) but CAN read orders and invoices (`200 OK`).
   - Unauthorized branch returns `403 FORBIDDEN_BRANCH`; Tenant B cannot read or mutate Tenant A's orders/invoices (`404 NOT_FOUND` under `FORCE RLS`).

### 4. Mandatory Unit & Integration Tests
- Execute `SalesOrderDraftAndInvoiceEndpointsTests.cs` plus all existing unit/integration suites (`0 Failed, 0 Skipped`).

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing the live PostgreSQL integration verification results.

---

## Task `YA-FINAL`: Final Security, Performance & Architecture Audit

### 1. Task Header
- **Task ID:** `YA-FINAL`
- **Title:** Final Security, Performance & Architecture Audit (Sales Order Drafts & Invoice Queries)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/yassin/ya-final-stage2-audit`
- **Execution Command:** Execute via `/stage-final-audit` applying `@.agent/rules/00-backend-guardrails.md`, `@.agent/skills/pharmacy-backend-engineering/SKILL.md`, `@.agent/skills/backend-security-audit/SKILL.md`, `@.agent/skills/performance-concurrency-guard/SKILL.md`, and `@.agent/skills/architecture-unifier/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `YA-01` through `YA-09` merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Run `/stage-final-audit` across all Yassin's Stage 2 code (`YA-02`..`YA-09`) and generate **`apps/erp-backend/docs/stage2-reports/yassin-stage2-report.md`** covering:
1. **Security & Isolation Audit:** Verify server-authoritative pricing/tax (zero client-trusted amounts), `BranchLocal`-only draft mutations, branch-scope (`ALL` vs `ASSIGNED`) on every read/write, explicit RLS read transactions (`BeginTransactionAsync` + `RollbackTransactionAsync(CancellationToken.None)`), and idempotency atomicity.
2. **Performance & Query Hygiene Audit:** Verify `.AsNoTracking()` + `.AsSplitQuery()` on all read queries, batch-fetching products/UOMs (`GetByIdsAsync`, zero N+1 loops), bounded `MaxPageSize = 100`, and historical deactivated master-data loading.
3. **Architecture & Boundary Audit:** Verify zero edits to `Program.cs`, `PharmacyDbContext.cs`, root `DependencyInjection.cs`, or Stage 1 files, zero stock mutations in draft flows, and clean partial controller separation.
4. **Build & Test Proof:** Exact `dotnet build` (`0 Error(s), 0 Warning(s)`) and `dotnet test` (`100% Passed, 0 Failed, 0 Skipped`) results.

### 4. Mandatory Unit & Integration Tests
- Execute full `PharmacyERP.sln` suite (`UnitTests` + `IntegrationTests`) with zero failures and zero skips; resolve any findings with regression tests before report sign-off.

### 5. Verification & Arabic Explanation Gate
- Confirm `apps/erp-backend/docs/stage2-reports/yassin-stage2-report.md` is generated and complete.
- Provide a final **Arabic debrief in chat** summarizing the audit results and confirming `YA-FINAL` sign-off for Wave 4.
