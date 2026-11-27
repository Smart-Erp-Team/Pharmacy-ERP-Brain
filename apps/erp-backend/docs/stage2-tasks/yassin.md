# Stage 2 Engineering Task Specification — Yassin (`YA-01`..`YA-09`, `YA-FINAL`)

| Field | Value |
| :--- | :--- |
| **Developer** | Yassin |
| **Master Reference** | [00-STAGE2-EXECUTION-MAP.md](./00-STAGE2-EXECUTION-MAP.md), [01-STAGE2-PLAN-AUDIT-DIFF.md](./01-STAGE2-PLAN-AUDIT-DIFF.md), [ahmed-hassan.md](./ahmed-hassan.md), & `_audit_docs/01_master_spec/ERP-Backend-Blueprint-v1.1.md` (Sections 6, 8 [§8.6, §8.9], 9, 10 — frozen reference-only) |
| **Base / Target Branch** | `stage2-dev` (**NEVER** open Stage 2 feature PRs against `main`) |
| **Execution Protocol** | Run every engineering task (`YA-01`..`YA-09`) via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md`, `@.agent/skills/pharmacy-stage1-baseline/SKILL.md`, and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`. Run `YA-FINAL` via `/stage-final-audit`. |
| **Owned Files & Interfaces** | `SalesOrderDraftDtos.cs`, `SalesInvoiceDtos.cs`, `SalesOrderValidators.cs`, `ISalesOrderDraftRepository`/`SalesOrderDraftRepository`, `ISalesInvoiceQueryRepository`/`SalesInvoiceQueryRepository`, `ISalesOrderDraftService`/`SalesOrderDraftService`, `ISalesInvoiceQueryService`/`SalesInvoiceQueryService`, `SalesOrdersController.Draft.cs`, `SalesInvoicesController.cs`, `SalesDraftDependencyInjection.cs` (Application + Infrastructure), plus incremental `YA-08` updates to `tests/PharmacyERP.IntegrationTests/Api/ContractsArtifactSyncTests.cs`, `apps/erp-backend/contracts/openapi.v1.json`, and `apps/erp-backend/contracts/README.md` |
| **Hard Boundaries** | Working scope follows `00-backend-guardrails.md` §1.1 (`apps/erp-backend/` plus the shared monorepo-root `contracts/` directory for synchronized Stage 2 OpenAPI/JSON schema exports in Wave 3/4 `AS-08` & `AH-FINAL`; Yassin's tasks edit ONLY inside `apps/erp-backend/`). Keep `Program.cs`, `PharmacyDbContext.cs`, root `DependencyInjection.cs` files, Stage 1 interfaces (`IOrganizationRepository`, `IProductRepository`, etc.), frozen `ERP-Backend-Blueprint-v1.1.md`, and other teammates' owned files **100% untouched**. **ZERO stock reservation/mutation in draft orders. ZERO Stage 3 Purchasing code.** |

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
- Execute the full Stage 1 baseline test suite (**`767 / 767`** tests passing — **`590` Unit + `177` Integration**, `0 Failed`, `0 Skipped`, `0 Error(s), 0 Warning(s)`, confirming **`48` live HTTP endpoints** and **`76` OpenAPI schemas** via `ContractsArtifactSyncTests`) against local PostgreSQL.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`767 / 767` passing, `0 Failed, 0 Skipped`).
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
Keep all DTOs self-contained in Yassin's owned files (zero compile-time dependency on `EH-02` or `AS-02`) and 100% faithful to Blueprint §6.5 & §8.6 and live Stage 1 wire-format contracts (`src/PharmacyERP.Api/DependencyInjection.cs` `ApiJsonSerializerOptions`: global **`JsonNamingPolicy.SnakeCaseLower`**, **`JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false)`**, native JSON numbers for decimals per `D-01`, and strict **`snake_case`** `ApiErrorDetailDto.Field` paths):

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
         IReadOnlyList<SalesOrderLineRequest> Lines,
         string? IdempotencyKey = null);
     ```
   - `ReplaceSalesOrderLinesRequest`:
     ```csharp
     public sealed record ReplaceSalesOrderLinesRequest(
         IReadOnlyList<SalesOrderLineRequest> Lines,
         string? IdempotencyKey = null);
     ```
   - `CancelSalesOrderRequest`:
     ```csharp
     public sealed record CancelSalesOrderRequest(
         string? Reason = null,
         string? IdempotencyKey = null);
     ```
     *(Per `DTO-DIFF-020` and all 17 live Stage 1 mutating endpoints, `string? IdempotencyKey = null` MUST be declared as the trailing optional parameter so Swashbuckle keeps `idempotency_key` optional in JSON bodies when clients pass the `Idempotency-Key` HTTP header via `[AllowHeaderIdempotencyKey]`.)*
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
   - `SalesOrderQueryFilter(Guid? BranchId, SalesOrderStatus? Status, DateTimeOffset? FromDate, DateTimeOffset? ToDate, int Page = 1, int PageSize = 25)` *(aligned with Stage 1 `D-02` & `API-DIFF-022`: default `page = 1`, `page_size = 25`, valid bounds `page >= 1` and `1 <= page_size <= 200`)*.
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
   - `SalesInvoiceQueryFilter(Guid? BranchId, string? InvoiceNo, SalesPaymentStatus? PaymentStatus, DateTimeOffset? FromDate, DateTimeOffset? ToDate, int Page = 1, int PageSize = 25)`.
3. **Create `src/PharmacyERP.Application/Features/Sales/Validators/SalesOrderValidators.cs`:**
   - Returns structured `IReadOnlyList<ApiErrorDetailDto>` using **strict `snake_case` `Field` paths** everywhere:
     - `ValidateCreate(CreateSalesOrderRequest)`:
       - `branch_id`: `BranchId != Guid.Empty`
       - `idempotency_key`: non-empty, `1..100` chars
       - `lines`: non-empty (`1..200` items)
       - `lines[i].product_id`: `ProductId != Guid.Empty`
       - `lines[i].product_uom_id`: `ProductUomId != Guid.Empty`
       - `lines[i].entered_qty`: `EnteredQty > 0`, max 4 decimal places (`decimal.Round(qty, 4) == qty`)
     - `ValidateReplaceLines(ReplaceSalesOrderLinesRequest)`:
       - `idempotency_key`: non-empty, `1..100` chars
       - `lines`: non-empty (`1..200` items) with `lines[i].product_id`, `lines[i].product_uom_id`, `lines[i].entered_qty` checks
     - `ValidateCancel(CancelSalesOrderRequest)`:
       - `idempotency_key`: non-empty, `1..100` chars
       - `reason`: optional `<= 500` chars
     - `ValidatePagination(int page, int pageSize)`:
       - reject `page < 1` with `ApiErrorDetailDto("page", ...)` (`422 VALIDATION_ERROR`)
       - reject `pageSize < 1 || pageSize > 200` with `ApiErrorDetailDto("page_size", ...)` (`422 VALIDATION_ERROR`)
       *(Matches Stage 1 `D-02` & `API-DIFF-022`: out-of-range pagination values MUST return `422 VALIDATION_ERROR` instead of silently clamping.)*
     - `ValidateDateRange(DateTimeOffset? fromDate, DateTimeOffset? toDate)`:
       - reject `fromDate > toDate` with `422 VALIDATION_ERROR` (`field: "from_date"` / `"to_date"`).
4. **Update `GlobalUsings.cs`:** Ensure `PharmacyERP.Application.Features.Sales.DTOs`, `Validators`, `Repositories.Interfaces`, `Services.Interfaces` are present (alphabetically, without duplicating entries if already added).

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Sales/SalesOrderValidatorTests.cs`:
  - Valid create/replace/cancel requests and valid pagination (`page = 1`, `page_size = 25`, `page_size = 200`) pass with zero errors.
  - Rejects empty `branch_id`, empty/overlong `idempotency_key`, empty `lines`, `> 200` lines, empty `lines[i].product_id`/`lines[i].product_uom_id`, `lines[i].entered_qty <= 0`, `lines[i].entered_qty` with 5+ decimal places, `reason > 500` chars, inverted `from_date > to_date` range, and out-of-range pagination (`page = 0`, `page = -1`, `page_size = 0`, `page_size = 201`) asserting exact **`snake_case`** `ApiErrorDetailDto.Field` names (`branch_id`, `idempotency_key`, `lines`, `lines[i].product_id`, `lines[i].product_uom_id`, `lines[i].entered_qty`, `reason`, `from_date`, `to_date`, `page`, `page_size`).

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** covering the draft order & invoice DTOs, optional trailing `IdempotencyKey`, `snake_case` validator fields, and why price/discount/tax fields are intentionally excluded from client request payloads.

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
   *(Do NOT add a duplicate organization currency lookup method here: live Stage 1 `IOrganizationRepository.GetByIdAsync(Guid organizationId, CancellationToken ct = default)` ALREADY exists and is reused directly in `YA-05` `SalesOrderDraftService` to load `Organization.BaseCurrency` without modifying Stage 1!)*
2. **Implement `SalesOrderDraftRepository`** (`src/PharmacyERP.Infrastructure/Persistence/Repositories/Sales/SalesOrderDraftRepository.cs`):
   - `GetForUpdateWithLinesAsync`: on relational PostgreSQL, acquires row lock `SELECT * FROM sales."SALES_ORDER" WHERE organization_id = {orgId} AND sales_order_id = {orderId} FOR UPDATE` (serializing concurrent replace-lines / cancel / checkout on the same order) and loads tracked `SalesOrderLines` via `_context.Entry(order).Collection(o => o.Lines).LoadAsync(ct)`. Includes EF LINQ fallback for non-relational unit tests.
   - `GetDetailByIdAsync`: strictly `.AsNoTracking()` + `.AsSplitQuery()` projecting `SalesOrderDto` with product SKU/name, UOM code, and employee full name via left joins — **NEVER filtering `IsActive == true`** on `Product`, `ProductUom`, `Employee`, or `Branch` so historical orders always load deactivated master data cleanly (Blueprint §8.9.9)!
   - `GetPagedAsync`: strictly `.AsNoTracking()`, enforces defensive repository safety cap `MaxPageSize = 200` (with default `Page = 1`, `PageSize = 25`; out-of-range `page < 1` or `page_size` outside `1..200` is rejected with `422 VALIDATION_ERROR` in `SalesOrderDraftService` per Stage 1 `D-02` & `API-DIFF-022`), applies `OrganizationId`, `allowedBranchIds` (when caller has `ASSIGNED` scope), optional `filter.BranchId`, `filter.Status`, `filter.FromDate <= CreatedAt <= filter.ToDate`, orders deterministically by `CreatedAt DESC, SalesOrderId DESC`, and returns `new PagedResult<SalesOrderSummaryDto>(items, safePage, safePageSize, totalCount)`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.IntegrationTests/Persistence/SalesOrderDraftRepositoryTests.cs` (`[SkipWhenPostgresUnavailableFact]`):
  - Verifies `AddAsync`, `GetForUpdateWithLinesAsync` + `RemoveLines` line replacement, `GetDetailByIdAsync` returning deactivated products/employees on historical orders, `GetPagedAsync` filtering by `branch_id`, `status`, and `from_date`/`to_date` with default `page = 1, page_size = 25` (and up to `200`) and accurate `Page`/`PageSize`/`TotalCount`, and cross-tenant `FORCE RLS` isolation under `erp_it_app`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** covering `AsNoTracking` query hygiene, historical inactive-entity preservation, Stage 1 `IOrganizationRepository.GetByIdAsync` reuse, and `FOR UPDATE` serialization on draft updates.

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
     - Uses defensive repository safety cap `MaxPageSize = 200` (default `Page = 1`, `PageSize = 25`; out-of-range `page < 1` or `page_size` outside `1..200` is rejected with `422 VALIDATION_ERROR` in `SalesInvoiceQueryService` per Stage 1 `D-02` & `API-DIFF-022`).
     - Filters by `OrganizationId`, `allowedBranchIds` (if non-null), optional `filter.BranchId`, `filter.PaymentStatus`, `filter.FromDate <= IssuedAt <= filter.ToDate`, and optional `filter.InvoiceNo` (case-insensitive prefix/contains match, trimmed, max 40 chars).
     - Deterministic sort: `IssuedAt DESC, InvoiceId DESC`.
     - Returns `PagedResult<SalesInvoiceSummaryDto>(items, safePage, safePageSize, totalCount)`.
   - `GetDetailByIdAsync`:
     - Loads `SalesInvoice` + `Lines` (ordered by `InvoiceLineId ASC`) + `Payments` (ordered by `PaidAt ASC`) + `Refunds` (ordered by `RefundedAt ASC`).
     - Batch-fetches referenced `Product` (`Sku`, `Name`), `ProductUom` (`UomCode`), and `Employee` (`FullName`) in minimal set-based `.AsNoTracking()` queries (zero N+1 loops!) — **WITHOUT filtering `IsActive == true`** so historical invoices cleanly display deactivated products, UOMs, and employees!

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.IntegrationTests/Persistence/SalesInvoiceQueryRepositoryTests.cs` (`[SkipWhenPostgresUnavailableFact]`):
  - Verifies paginated search by `branch_id`, `invoice_no`, `payment_status`, and `from_date`/`to_date` with default `page = 1, page_size = 25` (and up to `200`).
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
- [ ] Stage 1 `IOrganizationRepository` (`GetByIdAsync`), `IProductRepository`, `IProductUomRepository`, `IBranchRepository`, `IUnitOfWork`, `IIdempotencyService`, `IAuditLogger`, `IDateTimeProvider`, `IRuntimeModeProvider`, `ITenantContext`, and `ICurrentUser` compile cleanly.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Create `ISalesOrderDraftService` & `SalesOrderDraftService` (`src/PharmacyERP.Application/Features/Sales/Services/`):
- **Constants:** `CreateScope = "sales.orders.create"`, `ReplaceLinesScope = "sales.orders.replace-lines"`.
- **Method 1: `CreateDraftAsync(CreateSalesOrderRequest request, CancellationToken ct)`:**
  1. Validate `request` via `SalesOrderValidators.ValidateCreate` -> `422 VALIDATION_ERROR` with strict `snake_case` field details.
  2. Enforce `_runtimeMode.CurrentMode == ErpRuntimeMode.BranchLocal` -> `404 NOT_FOUND`.
  3. Require authenticated `_tenantContext.OrganizationId` & `_currentUser.EmployeeId` -> `401 UNAUTHORIZED`.
  4. Enforce role `Cashier` or `Admin` -> `403 FORBIDDEN`, and `_currentUser.CanAccessBranch(request.BranchId)` -> `403 FORBIDDEN_BRANCH`.
  5. Open `await _unitOfWork.BeginTransactionAsync(ct);`:
     - Check idempotency (`CreateScope`, `request.IdempotencyKey!`, `request.BranchId`, `request`): replay -> rollback + return stored `SalesOrderDto`; mismatch -> rollback + `409 IDEMPOTENCY_MISMATCH`.
     - Verify branch exists and `branch.IsActive` -> rollback + `404`/`422`.
     - Load organization via live Stage 1 `_organizationRepo.GetByIdAsync(orgId, ct)` (rollback + `404 NOT_FOUND` if null) and read `organization.BaseCurrency` directly (zero duplicate query method on `ISalesOrderDraftRepository`).
     - Batch-fetch all distinct `Product`s via `_productRepo.GetByIdsAsync` and `ProductUom`s via `_productUomRepo.GetByIdsAsync` (zero N+1 loops!).
     - Validate every line (emitting strict `snake_case` `ApiErrorDetailDto.Field` paths `lines[i].product_id` / `lines[i].product_uom_id`):
       - `product` exists and `product.IsActive` (`404`/`422`).
       - `uom` exists, `uom.ProductId == product.ProductId`, `uom.IsActive`, `uom.IsSellable`, and `uom.SaleUnitPrice.HasValue && uom.SaleUnitPrice.Value >= 0` (`422 VALIDATION_ERROR` on non-sellable or missing price).
     - Generate `orderNo = $"POS-{now:yyyyMMddHHmmss}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}"`.
     - Construct `SalesOrder.CreateDraft(orgId, request.BranchId, employeeId, orderNo, OrderChannel.POS, organization.BaseCurrency, request.IdempotencyKey!, now)` and `SalesOrderLine.Create(...)` with authoritative snapshots:
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
  3. Check idempotency (`ReplaceLinesScope`, `request.IdempotencyKey!`, `order.BranchId`, `request`): replay or `409 IDEMPOTENCY_MISMATCH`.
  4. Verify `order.OrderStatus == SalesOrderStatus.DRAFT` -> rollback + `409 INVALID_STATE_TRANSITION` if `COMPLETED` or `CANCELLED`.
  5. Capture `beforeSnapshot` for audit, batch-fetch & validate active sellable products/UOMs, snapshot current active `SaleUnitPrice` & `TaxRate`, remove previous lines (`_draftRepo.RemoveLines(existingLines)`), call `order.ReplaceLines(newLines)`.
  6. Write `IAuditLogger.LogAsync(action: "UPDATE_LINES", ...)`, persist idempotency, commit atomically (ZERO stock mutation!).

### 4. Mandatory Unit & Integration Tests
- Smoke unit tests in `tests/PharmacyERP.UnitTests/Application/Sales/SalesOrderDraftWriteTests.cs` proving server-authoritative price/tax/UOM math (`MidpointRounding.AwayFromZero`), `IOrganizationRepository.GetByIdAsync` reuse for `BaseCurrency`, non-sellable UOM rejection (`422` with `snake_case` `lines[i].product_uom_id`), `409 INVALID_STATE_TRANSITION` when replacing lines on `COMPLETED`/`CANCELLED` order, and zero stock repository dependencies.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** detailing draft snapshot math, Stage 1 `IOrganizationRepository.GetByIdAsync` reuse, and why drafts never touch stock balances or `SYNC_OUTBOX`.

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
   - Check idempotency (`"sales.orders.cancel"`, `request.IdempotencyKey!`, `order.BranchId`, `request`): replay or `409 IDEMPOTENCY_MISMATCH`.
   - Enforce `order.OrderStatus == SalesOrderStatus.DRAFT` -> rollback + `409 INVALID_STATE_TRANSITION` if `COMPLETED` or `CANCELLED`.
   - Call `order.Cancel()` (zero stock reversal, zero invoice/payment creation).
   - Write `IAuditLogger.LogAsync(action: "CANCEL", entitySchema: "sales", entityName: "SALES_ORDER", entityId: order.SalesOrderId, beforeData: beforeDto, afterData: afterDto, branchId: order.BranchId, ct: ct)` including optional `request.Reason`.
   - Persist idempotency & commit atomically.
2. **`GetOrdersAsync(SalesOrderQueryFilter filter, CancellationToken ct)` (`GET /api/v1/sales-orders`):**
   - Allowed on BOTH `Cloud` and `BranchLocal`; roles `Admin`, `Pharmacist`, `Cashier`.
   - Validate pagination (`page >= 1` -> `field: "page"`, `1 <= page_size <= 200` -> `field: "page_size"`) and date range (`from_date <= to_date` -> `field: "from_date"` / `"to_date"`) via `SalesOrderValidators`, returning **`422 VALIDATION_ERROR`** on any out-of-range value (`0`, `-1`, `201`) instead of silently clamping (`D-02` & `API-DIFF-022`).
   - Branch scope check: if `filter.BranchId.HasValue` and `!_currentUser.CanAccessBranch(filter.BranchId.Value)` -> `403 FORBIDDEN_BRANCH`. Otherwise pass `allowedBranchIds = string.Equals(_currentUser.BranchScope, "ALL", StringComparison.Ordinal) ? null : _currentUser.AuthorizedBranchIds`.
   - Execute inside explicit `IUnitOfWork` read transaction (`BeginTransactionAsync` -> `_draftRepo.GetPagedAsync(...)` -> `finally { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); }`) as required by `TenantRlsConnectionInterceptor`.
3. **`GetOrderByIdAsync(Guid salesOrderId, CancellationToken ct)` (`GET /api/v1/sales-orders/{id}`):**
   - Explicit `IUnitOfWork` read transaction -> `_draftRepo.GetDetailByIdAsync(orgId, salesOrderId, ct)` -> `404 NOT_FOUND` if null -> verify `_currentUser.CanAccessBranch(dto.BranchId)` (`403 FORBIDDEN_BRANCH`) -> return `Result<SalesOrderDto>.Success(dto)`.

### 4. Mandatory Unit & Integration Tests
- Unit tests in `tests/PharmacyERP.UnitTests/Application/Sales/SalesOrderCancelAndQueryTests.cs` verifying `DRAFT -> CANCELLED`, `409 INVALID_STATE_TRANSITION` on `COMPLETED`/`CANCELLED`, idempotency replay/mismatch, `422 VALIDATION_ERROR` on invalid pagination (`page = 0`, `page = -1`, `page_size = 0`, `page_size = 201` with `field: "page"` / `"page_size"`) and invalid date range (`from_date > to_date`), `403 FORBIDDEN_BRANCH`, and explicit read-transaction `BeginTransactionAsync` + `RollbackTransactionAsync(CancellationToken.None)`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing draft cancellation guarantees, bounded `1..200` pagination validation, and RLS read-transaction wrapping.

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
   - Validate authenticated tenant (`401`), pagination (`page >= 1` -> `field: "page"`, `1 <= page_size <= 200` -> `field: "page_size"`) and date range (`from_date <= to_date` -> `field: "from_date"` / `"to_date"`) via `SalesOrderValidators` returning **`422 VALIDATION_ERROR`** on out-of-range values (never silently clamping, per `D-02` & `API-DIFF-022`), and `filter.BranchId` branch authorization (`403 FORBIDDEN_BRANCH`).
   - Compute `allowedBranchIds` (`null` for `BranchScope == "ALL"`, otherwise `_currentUser.AuthorizedBranchIds`).
   - Execute inside explicit `IUnitOfWork` read transaction (`BeginTransactionAsync` -> `_invoiceQueryRepo.GetPagedAsync(...)` -> `finally { RollbackTransactionAsync(CancellationToken.None) }`).
2. **`GetInvoiceByIdAsync(Guid invoiceId, CancellationToken ct)`:**
   - Allowed on BOTH `Cloud` and `BranchLocal`.
   - Explicit `IUnitOfWork` read transaction -> `_invoiceQueryRepo.GetDetailByIdAsync(orgId, invoiceId, ct)` -> `404 NOT_FOUND` if null -> verify `_currentUser.CanAccessBranch(dto.BranchId)` -> `403 FORBIDDEN_BRANCH` if unauthorized -> return `Result<SalesInvoiceDto>.Success(dto)` containing all immutable lines, price/tax/cost snapshots, cash payments, refunds, and current `paid_amount`/`refunded_amount`/`payment_status`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Sales/SalesInvoiceQueryServiceTests.cs`:
  - Happy path list & detail, `ASSIGNED` vs `ALL` branch scoping, `403 FORBIDDEN_BRANCH`, `404 NOT_FOUND`, `422 VALIDATION_ERROR` on invalid pagination (`page = 0`, `page_size = 0`, `page_size = 201` with `field: "page"` / `"page_size"`) and invalid date range (`from_date > to_date`), and verified `BeginTransactionAsync` + `RollbackTransactionAsync(CancellationToken.None)`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing the invoice read service, pagination bounds, and branch-scope protections.

---

## Task `YA-08`: Controllers (`SalesOrdersController.Draft.cs`, `SalesInvoicesController.cs`), DI Wiring & Incremental OpenAPI Sync

### 1. Task Header
- **Task ID:** `YA-08`
- **Title:** `SalesOrdersController.Draft.cs`, `SalesInvoicesController.cs`, `SalesDraftDependencyInjection.cs` Wiring & OpenAPI Sync
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/yassin/ya-08-draft-and-invoice-controllers`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-06` (`SalesOrdersController.cs` partial shell & `SalesDraftDependencyInjection.cs`) merged into `stage2-dev` and pulled locally.
- [ ] `YA-06` and `YA-07` merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Follow exact live Stage 1 controller conventions (`ProductCategoriesController.cs`, `InventoryController.cs`, `ApiResultMapper.cs`, and `contracts/README.md` §1.6) across all 7 actions:

- **Exact Stage 1 Idempotency Resolution Pattern** (applied to `POST /api/v1/sales-orders`, `PUT /api/v1/sales-orders/{id}/lines`, and `POST /api/v1/sales-orders/{id}/cancel` with `[AllowHeaderIdempotencyKey]` and `[FromHeader(Name = "Idempotency-Key")] string? idempotencyKey`):
  ```csharp
  if (request == null)
  {
      return ApiResultMapper.ToErrorResult(this, ErrorCode.MALFORMED_REQUEST, ErrorMessages.MalformedRequest, currentUser.TraceId);
  }

  var effectiveKey = !string.IsNullOrWhiteSpace(idempotencyKey)
      ? idempotencyKey.Trim()
      : request.IdempotencyKey?.Trim() ?? string.Empty;
  if (string.IsNullOrWhiteSpace(effectiveKey))
  {
      return ApiResultMapper.ToMissingIdempotencyKeyResult(this, currentUser.TraceId);
  }

  var requestWithKey = request with { IdempotencyKey = effectiveKey };
  ```
  *(Trimmed HTTP `Idempotency-Key` header takes precedence over body `idempotency_key` — do NOT return `422` when both are supplied and differ; blank in both header and body returns `400 MALFORMED_REQUEST` via `ApiResultMapper.ToMissingIdempotencyKeyResult`; length `> 100` returns `422 VALIDATION_ERROR` with `field: "idempotency_key"`.)*

1. **Create `src/PharmacyERP.Api/Controllers/SalesOrdersController.Draft.cs`** (`public partial class SalesOrdersController`, using `[FromServices]` so `SalesOrdersController.cs` remains untouched and zero constructor conflict occurs with El-Hosseiny's `SalesOrdersController.Checkout.cs`):
   - **`POST /api/v1/sales-orders`** (`[HttpPost]`, `[Authorize(Policy = "PosCashierOrAdmin")]`, `[AllowHeaderIdempotencyKey]`):
     - `[ProducesResponseType(typeof(SalesOrderDto), StatusCodes.Status201Created)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status400BadRequest)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status409Conflict)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]`
     - Apply Stage 1 idempotency resolution -> `draftService.CreateDraftAsync(requestWithKey, ct)` -> `var locationUri = result.IsSuccess ? $"/api/v1/sales-orders/{result.Value!.SalesOrderId}" : null;` -> `ApiResultMapper.ToCreatedResult(this, result, currentUser.TraceId, locationUri)` (`201 Created` + `Location` header).
   - **`GET /api/v1/sales-orders`** (`[HttpGet]`, `[Authorize(Policy = "SalesReadAccess")]`):
     - `[ProducesResponseType(typeof(PagedResult<SalesOrderSummaryDto>), StatusCodes.Status200OK)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]`
     - Explicit `snake_case` query params: `[FromQuery(Name = "branch_id")] Guid? branchId = null`, `[FromQuery(Name = "status")] SalesOrderStatus? status = null`, `[FromQuery(Name = "from_date")] DateTimeOffset? fromDate = null`, `[FromQuery(Name = "to_date")] DateTimeOffset? toDate = null`, `[FromQuery(Name = "page")] int page = 1`, `[FromQuery(Name = "page_size")] int pageSize = 25` -> `ApiResultMapper.ToActionResult`.
   - **`GET /api/v1/sales-orders/{id}`** (`[HttpGet("{id:guid}")]`, `[Authorize(Policy = "SalesReadAccess")]`):
     - `[ProducesResponseType(typeof(SalesOrderDto), StatusCodes.Status200OK)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]`
     - `draftService.GetOrderByIdAsync(id, ct)` -> `ApiResultMapper.ToActionResult`.
   - **`PUT /api/v1/sales-orders/{id}/lines`** (`[HttpPut("{id:guid}/lines")]`, `[Authorize(Policy = "PosCashierOrAdmin")]`, `[AllowHeaderIdempotencyKey]`):
     - `[ProducesResponseType(typeof(SalesOrderDto), StatusCodes.Status200OK)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status400BadRequest)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status409Conflict)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]`
     - Apply Stage 1 idempotency resolution -> `draftService.ReplaceLinesAsync(id, requestWithKey, ct)` -> `ApiResultMapper.ToActionResult`.
   - **`POST /api/v1/sales-orders/{id}/cancel`** (`[HttpPost("{id:guid}/cancel")]`, `[Authorize(Policy = "PosCashierOrAdmin")]`, `[AllowHeaderIdempotencyKey]`):
     - `[ProducesResponseType(typeof(SalesOrderDto), StatusCodes.Status200OK)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status400BadRequest)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status409Conflict)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]`
     - Apply Stage 1 idempotency resolution -> `draftService.CancelDraftAsync(id, requestWithKey, ct)` -> `ApiResultMapper.ToActionResult`.
2. **Create `src/PharmacyERP.Api/Controllers/SalesInvoicesController.cs`:**
   - `[ApiController]`, `[Route("api/v1/sales-invoices")]`, `[Authorize(Policy = "SalesReadAccess")]`.
   - **`GET /api/v1/sales-invoices`** (`[HttpGet]`):
     - `[ProducesResponseType(typeof(PagedResult<SalesInvoiceSummaryDto>), StatusCodes.Status200OK)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]`
     - Explicit `snake_case` query params: `[FromQuery(Name = "branch_id")] Guid? branchId = null`, `[FromQuery(Name = "invoice_no")] string? invoiceNo = null`, `[FromQuery(Name = "payment_status")] SalesPaymentStatus? paymentStatus = null`, `[FromQuery(Name = "from_date")] DateTimeOffset? fromDate = null`, `[FromQuery(Name = "to_date")] DateTimeOffset? toDate = null`, `[FromQuery(Name = "page")] int page = 1`, `[FromQuery(Name = "page_size")] int pageSize = 25` -> `invoiceQueryService.GetInvoicesAsync(...)` -> `ApiResultMapper.ToActionResult`.
   - **`GET /api/v1/sales-invoices/{id}`** (`[HttpGet("{id:guid}")]`):
     - `[ProducesResponseType(typeof(SalesInvoiceDto), StatusCodes.Status200OK)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]`
     - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]`
     - `invoiceQueryService.GetInvoiceByIdAsync(id, ct)` -> `ApiResultMapper.ToActionResult`.
3. **Register Services & Repositories ONLY in Yassin's Modular DI Files** (keep root `DependencyInjection.cs` untouched!):
   - `src/PharmacyERP.Application/Extensions/SalesDraftDependencyInjection.cs`: register `ISalesOrderDraftService`, `ISalesInvoiceQueryService` (`Scoped`).
   - `src/PharmacyERP.Infrastructure/Extensions/SalesDraftDependencyInjection.cs`: register `ISalesOrderDraftRepository`, `ISalesInvoiceQueryRepository` (`Scoped`).
4. **Incremental Contract-First & OpenAPI Sync (REQUIRED IN THIS PR — `ContractsArtifactSyncTests` Gate):**
   - Update `tests/PharmacyERP.IntegrationTests/Api/ContractsArtifactSyncTests.cs`:
     - Add all 7 endpoints to `ExpectedLiveEndpoints`:
       - `("/api/v1/sales-orders", "post")`, `("/api/v1/sales-orders", "get")`, `("/api/v1/sales-orders/{id}", "get")`, `("/api/v1/sales-orders/{id}/lines", "put")`, `("/api/v1/sales-orders/{id}/cancel", "post")`
       - `("/api/v1/sales-invoices", "get")`, `("/api/v1/sales-invoices/{id}", "get")`
     - Add exposed Stage 2 string-only wire enums (`typeof(OrderChannel)`, `typeof(SalesOrderStatus)`, `typeof(SalesInvoiceStatus)`, `typeof(SalesPaymentStatus)`, `typeof(PaymentMethod)`) to the OpenAPI enum schema check (without duplicating any enum already added by an earlier merged Wave 2 PR).
   - Regenerate `apps/erp-backend/contracts/openapi.v1.json` from live `/swagger/v1/swagger.json`:
     ```powershell
     $env:UPDATE_OPENAPI_SNAPSHOT="true"
     dotnet test tests/PharmacyERP.IntegrationTests/PharmacyERP.IntegrationTests.csproj --filter ContractsArtifactSyncTests
     Remove-Item Env:UPDATE_OPENAPI_SNAPSHOT
     ```
   - Update `apps/erp-backend/contracts/README.md` with the 7 newly live endpoints, `snake_case` query parameters, pagination bounds (`page >= 1`, `1 <= page_size <= 200`), and status codes.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/API/Controllers/SalesOrderDraftAndInvoiceControllerTests.cs`:
  - Verifies `[AllowHeaderIdempotencyKey]`, header-only `Idempotency-Key` resolution, **trimmed HTTP header precedence** when both header and body provide a key (no `422` mismatch error), blank header & body returning **`400 MALFORMED_REQUEST`** via `ApiResultMapper.ToMissingIdempotencyKeyResult`, null body `400 MALFORMED_REQUEST`, **`201 Created` + `Location` header** on create, `200 OK` on replace/cancel/reads, `[FromQuery(Name = "...")]` `snake_case` bindings, and `ApiResultMapper` error envelope responses.
- `ContractsArtifactSyncTests` passes with zero OpenAPI drift and concrete typed schemas on every response.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`, including `ContractsArtifactSyncTests`).
- Local API boot check confirming Swagger exposes all 7 endpoints (`5` draft/order + `2` invoice) with `snake_case` query parameters and complete response schemas, then terminate cleanly.
- Provide a concise **Arabic explanation in chat** covering the partial controller integration, Stage 1 idempotency alignment, modular DI wiring, and incremental OpenAPI snapshot sync.

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
1. **Draft Creation, `Location` Header & Zero Stock Reservation:** `POST /api/v1/sales-orders` (`BranchLocal`, header-only `Idempotency-Key`, strict `snake_case` JSON payload with `branch_id`, `lines[].product_id`, `lines[].product_uom_id`, `lines[].entered_qty`) returns **`201 Created`** with **`Location: /api/v1/sales-orders/{sales_order_id}`** header and server-calculated `quantity_base`, `tax_amount_snapshot`, and `line_total` as native JSON numbers (verifying half-away-from-zero rounding on fractional prices/tax rates such as `19.995` & `14%` tax) and string-only enums; assert `STOCK_BALANCE` and `INVENTORY_TXN` rows remain 100% untouched.
2. **Idempotency Missing Key (`400`), Header Precedence, Replay & Mismatch:**
   - Sending `POST /api/v1/sales-orders`, `PUT /api/v1/sales-orders/{id}/lines`, or `POST /api/v1/sales-orders/{id}/cancel` with `Idempotency-Key` missing/blank in **both** the HTTP header and the JSON body returns **`400 MALFORMED_REQUEST`**.
   - Sending both HTTP header `Idempotency-Key` and body `idempotency_key` uses the trimmed HTTP header value (no `422` error).
   - Repeating `POST`, `PUT .../lines`, and `POST .../cancel` with the same `Idempotency-Key` + equivalent payload replays the exact stored response without duplicate rows; mutating `entered_qty` with the same key returns **`409 IDEMPOTENCY_MISMATCH`**.
3. **Line Replacement & State Transitions:** `PUT /api/v1/sales-orders/{id}/lines` replaces lines cleanly while `DRAFT` (updating snapshots to new active catalog price if price changed); returns `409 INVALID_STATE_TRANSITION` after order is `CANCELLED` or `COMPLETED`.
4. **Draft Cancel:** `POST /api/v1/sales-orders/{id}/cancel` transitions `DRAFT -> CANCELLED`, writes `AUDIT_LOG`, creates zero invoice/payment/stock rows; cancelling twice with a new key returns `409 INVALID_STATE_TRANSITION`.
5. **Order & Invoice Search, `snake_case` Query Params, Pagination Bounds (`422`) & Detail:**
   - `GET /api/v1/sales-orders` and `GET /api/v1/sales-invoices` accept strict `snake_case` query parameters (`branch_id`, `status`, `invoice_no`, `payment_status`, `from_date`, `to_date`, `page`, `page_size`), default to `page = 1, page_size = 25`, and return accurate `PagedResult` metadata (`items`, `page`, `page_size`, `total_count`).
   - Out-of-range pagination on BOTH `GET /api/v1/sales-orders` and `GET /api/v1/sales-invoices` (`page=0`, `page=-1`, `page_size=0`, `page_size=201`) returns **`422 VALIDATION_ERROR`** with `snake_case` `field` (`"page"` / `"page_size"`) — proving zero silent clamping.
   - `GET /api/v1/sales-invoices/{id}` returns full snapshots, payments, refunds, and succeeds even after product/employee deactivation (`IsActive = false`).
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
1. **Security, Wire-Contract & Isolation Audit:** Verify server-authoritative pricing/tax (zero client-trusted amounts), `BranchLocal`-only draft mutations, branch-scope (`ALL` vs `ASSIGNED`) on every read/write, explicit RLS read transactions (`BeginTransactionAsync` + `RollbackTransactionAsync(CancellationToken.None)`), optional trailing `string? IdempotencyKey = null` + Stage 1 header-precedence & `400` missing-key handling, strict `snake_case` query params (`[FromQuery(Name = "...")]`) & `ApiErrorDetailDto.Field` paths, complete `[ProducesResponseType]` annotations, and `ContractsArtifactSyncTests` passing with synchronized `contracts/openapi.v1.json` and `contracts/README.md`.
2. **Performance & Query Hygiene Audit:** Verify `.AsNoTracking()` + `.AsSplitQuery()` on all read queries, batch-fetching products/UOMs (`GetByIdsAsync`, zero N+1 loops), uniform Stage 1/2 ERP pagination (`page = 1`, `page_size = 25`, `422 VALIDATION_ERROR` for `page < 1` or `page_size` outside `1..200`, repository safety cap `MaxPageSize = 200`), and historical deactivated master-data loading.
3. **Architecture & Boundary Audit:** Verify zero edits to `Program.cs`, `PharmacyDbContext.cs`, root `DependencyInjection.cs`, or Stage 1 files, direct reuse of Stage 1 `IOrganizationRepository.GetByIdAsync` (no duplicate org currency method), zero stock mutations in draft flows, and clean partial controller separation.
4. **Build & Test Proof:** Exact `dotnet build` (`0 Error(s), 0 Warning(s)`) and `dotnet test` (`100% Passed, 0 Failed, 0 Skipped`) results.

### 4. Mandatory Unit & Integration Tests
- Execute full `PharmacyERP.sln` suite (`UnitTests` + `IntegrationTests`, including `ContractsArtifactSyncTests`) with zero failures and zero skips; resolve any findings with regression tests before report sign-off.

### 5. Verification & Arabic Explanation Gate
- Confirm `apps/erp-backend/docs/stage2-reports/yassin-stage2-report.md` is generated and complete.
- Provide a final **Arabic debrief in chat** summarizing the audit results and confirming `YA-FINAL` sign-off for Wave 4.
