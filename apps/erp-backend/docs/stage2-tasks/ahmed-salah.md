# Stage 2 Engineering Task Specification — Ahmed Salah (`AS-01`..`AS-09`, `AS-FINAL`)

| Field | Value |
| :--- | :--- |
| **Developer** | Ahmed Salah |
| **Master Reference** | [00-STAGE2-EXECUTION-MAP.md](./00-STAGE2-EXECUTION-MAP.md), [01-STAGE2-PLAN-AUDIT-DIFF.md](./01-STAGE2-PLAN-AUDIT-DIFF.md), [ahmed-hassan.md](./ahmed-hassan.md), `_audit_docs/01_master_spec/ERP-Backend-Blueprint-v1.1.md` (Sections 2 [§2.7], 6, 8 [§8.2, §8.5, §8.6, §8.9], 9, 10 — frozen reference-only), `_audit_docs/04_audit_reports/11_STAGE1_CONTRACT_ALIGNMENT_DECISIONS.md`, & `contracts/README.md` |
| **Verified Stage 1 Baseline** | **`767 / 767`** tests passing (`590` Unit + `177` Integration), **`48` live HTTP endpoints**, **`76` OpenAPI schemas**, `0 Error(s), 0 Warning(s)` |
| **Base / Target Branch** | `stage2-dev` (**NEVER** open Stage 2 feature PRs against `main`) |
| **Execution Protocol** | Run every engineering task (`AS-01`..`AS-09`) via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md`, `@.agent/skills/pharmacy-stage1-baseline/SKILL.md`, and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`. Run `AS-FINAL` via `/stage-final-audit`. |
| **Owned Files & Interfaces** | `SalesReturnQueryDtos.cs`, `CanonicalSaleDto.cs`, `CanonicalSalesOrderDto.cs`, `CanonicalSaleReturnDto.cs`, `CanonicalOutboxCursor.cs`, `ISalesReturnQueryRepository`/`SalesReturnQueryRepository`, `ISalesReturnQueryService`/`SalesReturnQueryService`, `SalesReturnsController.Read.cs`, `ICanonicalStage2Repository`/`CanonicalStage2Repository`, `ICanonicalStage2Service`/`CanonicalStage2Service`, `ICanonicalServiceTokenGenerator`/`CanonicalServiceTokenGenerator.cs`, `CanonicalSalesController.cs`, `CanonicalCapabilitiesService.cs` (Stage 2 update), Stage 1 Canonical unification files (`CanonicalCatalogController.cs`, `CanonicalCatalogService.cs`, `CanonicalInventoryController.cs`, `CanonicalInventoryService.cs`, `CanonicalCatalogConfigurationDtos.cs`), `CanonicalStage2DependencyInjection.cs` (Application + Infrastructure), `Stage2ContractSchemaTests.cs`, `ContractsArtifactSyncTests.cs`, `apps/erp-backend/contracts/` (`openapi.v1.json`, `schemas/canonical-capabilities.schema.json`, `README.md`), and shared monorepo-root `contracts/` (Wave 3 export) |
| **Hard Boundaries** | Edit strictly inside `apps/erp-backend/` **plus** the shared monorepo-root `contracts/` directory for synchronized Stage 2 OpenAPI/JSON Schema export in `AS-08` (aligned with `00-backend-guardrails.md` §1.1). Keep `Program.cs`, `PharmacyDbContext.cs`, root `DependencyInjection.cs` files, frozen `ERP-Backend-Blueprint-v1.1.md`, and other teammates' owned files **100% untouched**. Stage 2 Canonical APIs are **strictly read-only** (ZERO Stage 2 canonical writes, ZERO PII/customer/delivery/reservation/terminal fields; Stage 1 canonical configuration writes stay strictly `Admin,Pharmacist` and emit `status: "succeeded"`). **ZERO Stage 3 Purchasing code.** |

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
- Execute the full Stage 1 baseline test suite (**`767 / 767`** tests passing: `590` Unit + `177` Integration, `48` live HTTP endpoints, `76` OpenAPI schemas, `0 Warnings`, `0 Failed`, `0 Skipped`) against local PostgreSQL.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`767 / 767` Passed, `0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** explaining the local DB/RLS role setup (`erp_migrator` vs `erp_app`) and confirming readiness for Wave 2.

---

## Task `AS-02`: Return Read DTOs, Stage 2 Canonical DTOs & Shared `CanonicalOutboxCursor`

### 1. Task Header
- **Task ID:** `AS-02`
- **Title:** `SalesReturnQueryDtos.cs`, Stage 2 Canonical DTOs (`CanonicalSaleDto`, `CanonicalSalesOrderDto`, `CanonicalSaleReturnDto`) & Shared `CanonicalOutboxCursor.cs`
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-salah/as-02-return-and-canonical-dtos`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AS-01` completed locally (`767 / 767` baseline green).
- [ ] `AH-01`..`AH-06` merged into `stage2-dev` and pulled locally (Stage 2 enums `SalesOrderStatus`, `OrderChannel`, `SalesInvoiceStatus`, `SalesPaymentStatus`, `SalesReturnStatus`, `SalesRefundStatus`, `ReturnDisposition`, `PaymentMethod`, all 8 Sales entities, `CanonicalRead` policy, and `CanonicalStage2DependencyInjection.cs` compile cleanly).
- [ ] Stage 1 reference DTOs (`CanonicalProductDto.cs`, `CanonicalInventoryItemDto.cs`, `CanonicalCapabilitiesDto.cs`, `CanonicalCatalogConfigurationDtos.cs`) exist under `src/PharmacyERP.Application/Features/Integration/DTOs/`.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Keep all DTOs self-contained inside Ahmed Salah's owned files (zero compile-time dependency on `YA-02` or `EH-02`) and strictly compliant with Blueprint §6.5–§6.6 (ZERO customer, delivery, reservation, terminal, or employee PII fields in Canonical DTOs).

**Global Wire Serialization Rule (`DependencyInjection.ApiJsonSerializerOptions`):** Live `src/PharmacyERP.Api/DependencyInjection.cs` ALREADY enforces global `JsonNamingPolicy.SnakeCaseLower` + `JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false)` and native JSON numbers for decimals (`D-01`). Do **not** add redundant `[JsonPropertyName]` attributes on Stage 2 Canonical or Return Read DTOs when clean C# PascalCase property names map directly via `SnakeCaseLower` to exact Blueprint `snake_case` wire keys (verify every C# property name maps 1-to-1 to its exact Blueprint key, e.g., `OrderId` -> `order_id`, `UnitPriceEntered` -> `unit_price_entered`, `UnitPriceBase` -> `unit_price_base`, `UnitCostBaseSnapshot` -> `unit_cost_base_snapshot`, `DestinationLocationId` -> `destination_location_id`).

1. **Create `src/PharmacyERP.Application/Features/Sales/DTOs/SalesReturnQueryDtos.cs`** (`namespace PharmacyERP.Application.Features.Sales.DTOs;`):
   - `SalesReturnQueryFilter(Guid? BranchId, Guid? InvoiceId, DateTimeOffset? FromDate, DateTimeOffset? ToDate, int Page = 1, int PageSize = 25)` *(aligned with Stage 1 locked `D-02` & `API-DIFF-022`: default `Page = 1, PageSize = 25`)*
   - `SalesReturnSummaryDto(Guid ReturnId, Guid BranchId, Guid InvoiceId, string? InvoiceNo, string ReturnNo, SalesReturnStatus Status, string ReasonCode, decimal RefundAmount, SalesRefundStatus RefundStatus, Guid ReceivedByEmployeeId, Guid? ApprovedByEmployeeId, DateTimeOffset ReceivedAt)`
   - `SalesReturnLineDetailDto(Guid ReturnLineId, Guid InvoiceLineId, Guid ProductId, string? ProductSku, string? ProductName, Guid BatchId, string? BatchNumber, Guid DestinationLocationId, string? DestinationLocationCode, decimal QuantityBase, decimal RefundAmount, ReturnDisposition Disposition)`
   - `SalesReturnStockMovementDto(Guid InventoryTxnId, string TransactionNo, InventoryTransactionType TransactionType, InventoryTransactionStatus Status, DateTimeOffset? PostedAt)`
   - `SalesReturnRefundSummaryDto(Guid RefundId, Guid ProcessedByEmployeeId, string? ProcessedByEmployeeName, decimal Amount, PaymentMethod Method, DateTimeOffset RefundedAt)`
   - `SalesReturnDetailDto(Guid ReturnId, Guid OrganizationId, Guid BranchId, Guid InvoiceId, string? InvoiceNo, string ReturnNo, SalesReturnStatus Status, string ReasonCode, Guid ReceivedByEmployeeId, string? ReceivedByEmployeeName, Guid? ApprovedByEmployeeId, string? ApprovedByEmployeeName, decimal RefundAmount, SalesRefundStatus RefundStatus, string IdempotencyKey, DateTimeOffset ReceivedAt, IReadOnlyList<SalesReturnLineDetailDto> Lines, IReadOnlyList<SalesReturnStockMovementDto> StockMovements, IReadOnlyList<SalesReturnRefundSummaryDto> Refunds)`
   - *(Note on contract alignment with `EH-02`: `SalesReturnDetailDto` is the enriched read model for `GET /api/v1/sales-returns/{id}` while El-Hosseiny's `SalesReturnDto` is the atomic write response for `POST /api/v1/sales-returns`; shared core wire keys are 100% identical in `snake_case`.)*
2. **Create `src/PharmacyERP.Application/Features/Integration/DTOs/CanonicalSaleDto.cs`** (`namespace PharmacyERP.Application.Features.Integration.DTOs;`, matching Stage 1 `CanonicalInventoryItemDto` `Schema`/`Version` metadata and serializing via global `SnakeCaseLower` to exact Blueprint §6.6 & §8.2 `snake_case` keys):
   - `CanonicalSaleLineDto`: `InvoiceLineId` (`invoice_line_id`), `ProductId` (`product_id`), `BaseUomCode` (`base_uom_code`), `EnteredUomId` (`entered_uom_id`), `EnteredQty` (`entered_qty`), `ConversionSnapshot` (`conversion_snapshot`), `QuantityBase` (`quantity_base`), `UnitPriceEntered` (`unit_price_entered`), `UnitPriceBase` (`unit_price_base` = `Math.Round(unitPriceSnapshot / conversionSnapshot, 4, MidpointRounding.AwayFromZero)` per §8.9.12), `DiscountAmount` (`discount_amount`), `TaxRateSnapshot` (`tax_rate_snapshot`), `TaxAmount` (`tax_amount`), `NetAmount` (`net_amount`), `LineTotal` (`line_total`), `UnitCostBaseSnapshot` (`unit_cost_base_snapshot`).
   - `CanonicalSaleDto`: `Schema` (`"canonical.Sale"`), `Version` (`"1.0"`), `OrganizationId` (`organization_id`), `InvoiceId` (`invoice_id`), `OrderId` (`order_id`), `BranchId` (`branch_id`), `InvoiceNo` (`invoice_no`), `Status` (`status`), `PaymentStatus` (`payment_status`), `CurrencyCode` (`currency_code`), `Subtotal` (`subtotal`), `DiscountTotal` (`discount_total`), `TaxTotal` (`tax_total`), `GrandTotal` (`grand_total`), `PaidAmount` (`paid_amount`), `RefundedAmount` (`refunded_amount`), `IssuedAt` (`issued_at`), `UpdatedAt` (`updated_at`), `Lines` (`lines`: `IReadOnlyList<CanonicalSaleLineDto>`).
3. **Create `src/PharmacyERP.Application/Features/Integration/DTOs/CanonicalSalesOrderDto.cs`:**
   - `CanonicalSalesOrderLineDto`: `OrderLineId` (`order_line_id`), `ProductId` (`product_id`), `BaseUomCode` (`base_uom_code`), `ProductUomId` (`product_uom_id`), `EnteredQty` (`entered_qty`), `ConversionSnapshot` (`conversion_snapshot`), `QuantityBase` (`quantity_base`), `UnitPriceSnapshot` (`unit_price_snapshot`), `DiscountAmount` (`discount_amount`), `TaxRateSnapshot` (`tax_rate_snapshot`), `TaxAmountSnapshot` (`tax_amount_snapshot`), `LineTotal` (`line_total`).
   - `CanonicalSalesOrderDto`: `Schema` (`"canonical.SalesOrder"`), `Version` (`"1.0"`), `OrganizationId` (`organization_id`), `OrderId` (`order_id`), `BranchId` (`branch_id`), `OrderNo` (`order_no`), `Channel` (`channel`: `POS`), `OrderStatus` (`order_status`), `CurrencyCode` (`currency_code`), `CreatedAt` (`created_at`), `CompletedAt` (`completed_at`), `Lines` (`lines`: `IReadOnlyList<CanonicalSalesOrderLineDto>`). *(Strictly non-PII: NO `customer`, `delivery`, `reservation`, `terminal`, or employee email/phone fields!)*
4. **Create `src/PharmacyERP.Application/Features/Integration/DTOs/CanonicalSaleReturnDto.cs`:**
   - `CanonicalSaleReturnLineDto`: `ReturnLineId` (`return_line_id`), `InvoiceLineId` (`invoice_line_id`), `ProductId` (`product_id`), `BatchId` (`batch_id`), `DestinationLocationId` (`destination_location_id`), `QuantityBase` (`quantity_base`), `RefundAmount` (`refund_amount`), `Disposition` (`disposition`).
   - `CanonicalSaleReturnDto`: `Schema` (`"canonical.SaleReturn"`), `Version` (`"1.0"`), `OrganizationId` (`organization_id`), `ReturnId` (`return_id`), `BranchId` (`branch_id`), `InvoiceId` (`invoice_id`), `ReturnNo` (`return_no`), `Status` (`status`), `ReasonCode` (`reason_code`), `RefundAmount` (`refund_amount`), `RefundStatus` (`refund_status`), `ReceivedAt` (`received_at`), `UpdatedAt` (`updated_at`, mapped from `received_at` for immutable posted returns per §6.6), `Lines` (`lines`: `IReadOnlyList<CanonicalSaleReturnLineDto>`).
5. **Create `src/PharmacyERP.Application/Features/Integration/Utilities/CanonicalOutboxCursor.cs`** (`namespace PharmacyERP.Application.Features.Integration.Utilities;`, shared across ALL 5 Canonical read feeds `/products`, `/inventory`, `/sales`, `/orders`, `/returns` per `API-DIFF-011` / `T-03`):
   - Implements strict RFC 4648 Base64Url JSON encoding/decoding (rejecting `+`, `/`, `=`, malformed JSON, unknown mode `m`, negative `seq`/`hw`, or missing coordinates so services return `422 VALIDATION_ERROR` with `ApiErrorDetailDto("cursor", ...)`).
   - Supports two unified cursor modes:
     - **Keyset initial-scan cursor (`m: "ks"`):** `{ "m": "ks", "ts": "<utc-iso>", "id": "<guid>", "id2": "<optional-secondary-guid>", "hw": <highWaterEventSeq> }` (supporting both `(timestamp, id)` keysets for `products`/`sales`/`orders`/`returns` and `(product_id, location_id)` composite keyset for `inventory`, while carrying the initial `highWaterEventSeq` snapshot from `integration."OUTBOX_EVENT"`).
     - **Durable Outbox-Sequence cursor (`m: "seq"`):** `{ "m": "seq", "seq": <long> }` backed by commit-ordered `integration."OUTBOX_EVENT".event_sequence`.
6. **Update `GlobalUsings.cs`:** Ensure `PharmacyERP.Application.Features.Sales.DTOs`, `PharmacyERP.Application.Features.Sales.Repositories.Interfaces`, `PharmacyERP.Application.Features.Sales.Services.Interfaces`, `PharmacyERP.Application.Features.Integration.Repositories.Interfaces`, and `PharmacyERP.Application.Features.Integration.Utilities` are globally imported cleanly across `Application`, `Infrastructure`, and `Api`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Integration/Stage2CanonicalDtoSerializationTests.cs`:
  - Serializes `CanonicalSaleDto`, `CanonicalSalesOrderDto`, and `CanonicalSaleReturnDto` using live `DependencyInjection.ApiJsonSerializerOptions` (`SnakeCaseLower` + `allowIntegerValues: false`), verifying exact `snake_case` property names, `schema` (`canonical.Sale` / `canonical.SalesOrder` / `canonical.SaleReturn`), `version` (`"1.0"`), native JSON numbers for decimals, string-only enum values, and **asserting absence** of `customer`, `delivery`, `reservation`, `terminal`, `email`, `phone` keys.
  - Verifies `CanonicalOutboxCursor` round-trip encoding/decoding for both `m: "ks"` and `m: "seq"` modes and asserts `TryDecode` returns `false` on tampered, padded (`=`), non-Base64Url (`+`/`/`), negative `seq`/`hw`, or unknown-mode cursors.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** covering the non-PII Canonical Stage 2 DTO contracts, Return Read DTOs, global `SnakeCaseLower` alignment, and shared `CanonicalOutboxCursor` codec.

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
     - Uses `DefaultPageSize = 25` and defensive repository safety cap `MaxPageSize = 200` (aligned with `D-02` & `API-DIFF-022`; `SalesReturnQueryService` rejects `page < 1` or `page_size < 1 || page_size > 200` with `422 VALIDATION_ERROR` before calling the repository).
     - Filters by `OrganizationId`, `allowedBranchIds` (when caller has `ASSIGNED` scope), optional `filter.BranchId`, optional `filter.InvoiceId`, and `filter.FromDate <= ReceivedAt <= filter.ToDate`.
     - Orders deterministically by `ReceivedAt DESC, ReturnId DESC`.
     - Projects `SalesReturnSummaryDto` (joining `SalesInvoice.InvoiceNo`) and returns `PagedResult<SalesReturnSummaryDto>(items, safePage, safePageSize, totalCount)`.
   - `GetDetailByIdAsync`:
     - Loads `SalesReturn` + `Lines` (`OrderBy(l => l.ReturnLineId)`) + `Refunds` (`OrderBy(r => r.RefundedAt)`) + `Invoice.InvoiceNo`.
     - Loads linked `InventoryTxn` rows where `OrganizationId == orgId && SalesReturnId == returnId` (`SALES_RETURN_IN` and optional `SCRAP_OUT`, ordered by `PostedAt ASC, InventoryTxnId ASC`).
     - Batch-fetches referenced `Product` (`Sku`, `Name`), `InventoryBatch` (`BatchNumber`), `InventoryLocation` (`LocationCode`), and `Employee` (`FullName`) in minimal set-based `.AsNoTracking()` queries (zero N+1 loops, **WITHOUT filtering `IsActive == true`** so historical deactivated products/employees/locations always resolve cleanly).

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.IntegrationTests/Persistence/SalesReturnQueryRepositoryTests.cs` (`[SkipWhenPostgresUnavailableFact]`):
  - Verifies search by `branch_id`, `invoice_id`, and `from_date`/`to_date` with accurate pagination (default `page_size = 25`, verified up to `200`).
  - Verifies `GetDetailByIdAsync` returns lines, both `SALES_RETURN_IN` and `SCRAP_OUT` linked stock movements for `SCRAP` returns, refunds, and deactivated product/employee names.
  - Verifies PostgreSQL `FORCE RLS` cross-tenant isolation under `erp_it_app`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing the return query repository, dual stock-movement linking (`SALES_RETURN_IN` + `SCRAP_OUT`), and zero-N+1 batch projections.

---

## Task `AS-04`: Sales Return Query Service, `SalesReturnsController.Read.cs` & Incremental OpenAPI Sync

### 1. Task Header
- **Task ID:** `AS-04`
- **Title:** `ISalesReturnQueryService`, `SalesReturnQueryService`, `SalesReturnsController.Read.cs` & Incremental OpenAPI Sync
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-salah/as-04-sales-return-read-service-and-controller`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-06` (`SalesReturnsController.cs` partial shell, `SalesReadAccess` policy & `CanonicalStage2DependencyInjection.cs`) merged into `stage2-dev` and pulled locally.
- [ ] `AS-03` (`ISalesReturnQueryRepository`) merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Create `ISalesReturnQueryService` & `SalesReturnQueryService`** (`src/PharmacyERP.Application/Features/Sales/Services/`):
   - Allowed on BOTH `Cloud` and `BranchLocal`; roles `Admin`, `Pharmacist`, `Cashier`.
   - `GetReturnsAsync(SalesReturnQueryFilter filter, CancellationToken ct)`:
     - Validate authenticated tenant (`401 UNAUTHORIZED`).
     - Validate pagination bounds per locked Stage 1 `D-02` & `API-DIFF-022`:
       - `filter.Page >= 1` -> else **`422 VALIDATION_ERROR`** with `ApiErrorDetailDto("page", ...)`.
       - `1 <= filter.PageSize <= 200` -> else **`422 VALIDATION_ERROR`** with `ApiErrorDetailDto("page_size", ...)`.
     - Validate `filter.FromDate <= filter.ToDate` when both are supplied -> else **`422 VALIDATION_ERROR`** with `snake_case` `ApiErrorDetailDto("to_date", ...)` (or `"from_date"`).
     - Validate `filter.BranchId` branch authorization (`403 FORBIDDEN_BRANCH`).
     - Compute `allowedBranchIds` (`null` for `BranchScope == "ALL"`, else `_currentUser.AuthorizedBranchIds`).
     - Execute inside explicit `IUnitOfWork` read transaction (`BeginTransactionAsync` -> `_returnQueryRepo.GetPagedAsync(...)` -> `finally { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); }`).
   - `GetReturnByIdAsync(Guid returnId, CancellationToken ct)`:
     - Explicit `IUnitOfWork` read transaction -> `_returnQueryRepo.GetDetailByIdAsync(orgId, returnId, ct)` -> `404 NOT_FOUND` if null -> verify `_currentUser.CanAccessBranch(dto.BranchId)` (`403 FORBIDDEN_BRANCH`) -> return `Result<SalesReturnDetailDto>.Success(dto)`.
2. **Create `src/PharmacyERP.Api/Controllers/SalesReturnsController.Read.cs`** (`public partial class SalesReturnsController`, using `[FromServices]` so `SalesReturnsController.cs` stays untouched and zero constructor conflict occurs with El-Hosseiny's `SalesReturnsController.Write.cs`):
   - `[HttpGet]` (`GET /api/v1/sales-returns`), `[Authorize(Policy = "SalesReadAccess")]`:
     - Explicit `snake_case` query parameters:
       - `[FromQuery(Name = "branch_id")] Guid? branchFilter`
       - `[FromQuery(Name = "invoice_id")] Guid? invoiceFilter`
       - `[FromQuery(Name = "from_date")] DateTimeOffset? fromDate`
       - `[FromQuery(Name = "to_date")] DateTimeOffset? toDate`
       - `[FromQuery(Name = "page")] int page = 1`
       - `[FromQuery(Name = "page_size")] int pageSize = 25`
     - Complete `[ProducesResponseType]` attributes:
       - `[ProducesResponseType(typeof(PagedResult<SalesReturnSummaryDto>), StatusCodes.Status200OK)]`
       - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]`
       - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]`
       - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status422UnprocessableEntity)]`
     - Delegates to `ISalesReturnQueryService` and returns via `ApiResultMapper.ToActionResult(this, result, currentUser.TraceId)`.
   - `[HttpGet("{id:guid}")]` (`GET /api/v1/sales-returns/{id}`), `[Authorize(Policy = "SalesReadAccess")]`:
     - Complete `[ProducesResponseType]` attributes:
       - `[ProducesResponseType(typeof(SalesReturnDetailDto), StatusCodes.Status200OK)]`
       - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status401Unauthorized)]`
       - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status403Forbidden)]`
       - `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), StatusCodes.Status404NotFound)]`
     - Delegates to `ISalesReturnQueryService` and returns via `ApiResultMapper.ToActionResult(this, result, currentUser.TraceId)`.
3. **Register Return Query Service & Repository in Ahmed Salah's Modular DI Files** (keep root `DependencyInjection.cs` untouched!):
   - `src/PharmacyERP.Application/Extensions/CanonicalStage2DependencyInjection.cs`: register `ISalesReturnQueryService` -> `SalesReturnQueryService` (`Scoped`).
   - `src/PharmacyERP.Infrastructure/Extensions/CanonicalStage2DependencyInjection.cs`: register `ISalesReturnQueryRepository` -> `SalesReturnQueryRepository` (`Scoped`).
4. **Incremental Contract-First & OpenAPI Sync Gate (NON-NEGOTIABLE):**
   - Update `tests/PharmacyERP.IntegrationTests/Api/ContractsArtifactSyncTests.cs`: add `("/api/v1/sales-returns", "get")` and `("/api/v1/sales-returns/{id}", "get")` to `ExpectedLiveEndpoints` (and assert string-only schemas for `SalesReturnStatus`, `SalesRefundStatus`, `ReturnDisposition`, `PaymentMethod` if newly exposed in OpenAPI).
   - Regenerate `apps/erp-backend/contracts/openapi.v1.json`:
     ```powershell
     $env:UPDATE_OPENAPI_SNAPSHOT="true"
     dotnet test tests/PharmacyERP.IntegrationTests/PharmacyERP.IntegrationTests.csproj --filter ContractsArtifactSyncTests
     Remove-Item Env:UPDATE_OPENAPI_SNAPSHOT
     ```
   - Update `apps/erp-backend/contracts/README.md` with the two new return-read endpoints.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Sales/SalesReturnQueryServiceTests.cs`:
  - Happy path list & detail, `ASSIGNED` vs `ALL` branch scope, `403 FORBIDDEN_BRANCH`, `404 NOT_FOUND`, `422` inverted date range, `422` invalid pagination (`page = 0`, `page = -1`, `page_size = 0`, `page_size = 201`) asserting exact `snake_case` `details[].field` (`"page"`, `"page_size"`), and verified `BeginTransactionAsync` + `RollbackTransactionAsync(CancellationToken.None)`.
- `tests/PharmacyERP.UnitTests/API/Controllers/SalesReturnsReadControllerTests.cs`:
  - Verifies `[Authorize(Policy = "SalesReadAccess")]`, explicit `[FromQuery(Name = "...")]` `snake_case` parameter names (`branch_id`, `invoice_id`, `from_date`, `to_date`, `page`, `page_size`), default `page = 1, page_size = 25`, complete `[ProducesResponseType]` attributes, and `ApiResultMapper` response mapping.
- `ContractsArtifactSyncTests`: green with `0` drift.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing the return read service, partial controller separation, `page_size` `1..200` validation, and incremental OpenAPI sync.

---

## Task `AS-05`: Unified Canonical Read Repository (`ICanonicalStage2Repository` + Stage 1 `API-DIFF-011` / `T-03` Cursor Unification)

### 1. Task Header
- **Task ID:** `AS-05`
- **Title:** Unified Canonical Read Repository (`updated_since` & Durable `OUTBOX_EVENT.event_sequence` Cursor Across All 5 Canonical Feeds)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-salah/as-05-canonical-stage2-repository`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md`, `@.agent/skills/pharmacy-stage1-baseline/SKILL.md`, and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-04` and `AH-05` merged into `stage2-dev` and pulled locally.
- [ ] `AS-02` (`CanonicalOutboxCursor.cs` & Stage 2 Canonical DTOs) merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Fold deferred Stage 1 Brain contract item **`API-DIFF-011` / `T-03`** directly into `AS-05` so **all 5 canonical read collections** (`/products`, `/inventory`, `/sales`, `/orders`, `/returns`) share ONE unified `CanonicalOutboxCursor` protocol (`m: "ks"` -> `m: "seq"` over commit-ordered `OUTBOX_EVENT.event_sequence`), ONE `Limit` clamp **`[1, 1000]`** (default **`100`**, `<= 0` falls back to `100`), and ONE uniform **`PagedResult<T>`** envelope:

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

       // Stage 1 Canonical Unification (API-DIFF-011 / T-03): unified OUTBOX_EVENT.event_sequence cursor queries
       Task<PagedResult<CanonicalProductDto>> GetUnifiedCanonicalProductsPageAsync(
           Guid organizationId,
           DateTimeOffset? updatedSince,
           CanonicalOutboxCursor? decodedCursor,
           int limit,
           CancellationToken ct = default);

       Task<PagedResult<CanonicalInventoryItemDto>> GetUnifiedCanonicalInventoryPageAsync(
           Guid organizationId,
           Guid branchId,
           Guid? productId,
           DateTimeOffset? updatedSince,
           DateOnly organizationBusinessDate,
           CanonicalOutboxCursor? decodedCursor,
           int limit,
           CancellationToken ct = default);
   }
   ```
2. **Implement `CanonicalStage2Repository`** (`src/PharmacyERP.Infrastructure/Persistence/Repositories/Integration/CanonicalStage2Repository.cs`):
   - Strictly `.AsNoTracking()` + `.AsSplitQuery()`.
   - **Uniform Limit Clamp (ALL 5 feeds):** `resolvedLimit = limit <= 0 ? 100 : Math.Min(limit, 1000)`.
   - **Unified Dual-Mode `CanonicalOutboxCursor` Protocol (Blueprint §8.2 & `API-DIFF-011` / `T-03`):**
     - **Initial / Time-Range / `updated_since` Mode (`cursor` null or `m == "ks"`):**
       - Capture current committed `highWaterEventSeq` from `integration."OUTBOX_EVENT"` for `organizationId` (`0` if none).
       - Query authoritative rows applying `OrganizationId`, branch/date/`updated_since` filters, and keyset predicate ordered deterministically (`Take(resolvedLimit + 1)`).
       - If `hasMore`: emit next keyset cursor `{ "m": "ks", ..., "hw": highWaterEventSeq }`.
       - When initial scan completes (`!hasMore`): emit durable outbox cursor **`{ "m": "seq", "seq": highWaterEventSeq }`** so subsequent incremental polls transition seamlessly into no-loss `OUTBOX_EVENT.event_sequence` replication!
     - **Durable Outbox-Sequence Mode (`m == "seq"`):**
       - Query `integration."OUTBOX_EVENT"` where `OrganizationId == orgId && EventSequence > afterSeq` filtered to the collection's matching event types (plus branch filter when applicable), ordered by `EventSequence ASC`, `Take(resolvedLimit + 1)`.
       - Extract distinct aggregate/product IDs from the returned events, batch-load the authoritative rows + child lines via `.AsNoTracking().AsSplitQuery()`, and advance `NextCursor` to `{ "m": "seq", "seq": lastScannedEventSequence }` (even if filtered events produce `0` body items, guaranteeing no-loss progress!).
   - **Per-Feed Mapping & Event Filters:**
     - **`sales` (`CanonicalSaleDto`):** Posted `SalesInvoice` + lines + batch-fetched `Product.BaseUomCode` (never filtering `IsActive == true`). Compute `unit_price_base = Math.Round(line.UnitPriceSnapshot / line.ConversionSnapshot, 4, MidpointRounding.AwayFromZero)` per §8.9.12. Outbox event types: `sales.order.completed`, `sales.return.posted`.
     - **`orders` (`CanonicalSalesOrderDto`):** `SalesOrder` + lines + batch-fetched `Product.BaseUomCode`. Because `sales."SALES_ORDER"` has no `updated_at` column, filter `updated_since` and keyset-order strictly on **`(COALESCE(completed_at, created_at), sales_order_id)`** (in EF Core LINQ: `(order.CompletedAt ?? order.CreatedAt) >= updatedSince` and `OrderBy(order => order.CompletedAt ?? order.CreatedAt).ThenBy(order => order.SalesOrderId)`, encoding `ts = order.CompletedAt ?? order.CreatedAt` and `id = order.SalesOrderId` in `CanonicalOutboxCursor` `m: "ks"`). Outbox event types: `sales.order.completed` (and any `sales.order.*` lifecycle events emitted).
     - **`returns` (`CanonicalSaleReturnDto`):** Posted `SalesReturn` + lines (`UpdatedAt` mapped from `ReceivedAt`). Outbox event types: `sales.return.posted`.
     - **`products` (`CanonicalProductDto`, Stage 1 unification):** Keyset ordered by `(UpdatedAt ASC, ProductId ASC)`. Outbox event types: `catalog.product.*` (`catalog.product.created`, `catalog.product.updated`) and `catalog.uom.*` (`catalog.uom.created`, `catalog.uom.updated`). Projects exact Stage 1 `CanonicalProductDto` fields + active/inactive UOMs inside `PagedResult<CanonicalProductDto>`.
     - **`inventory` (`CanonicalInventoryItemDto`, Stage 1 unification):** Keyset ordered by `(ProductId ASC, LocationId ASC)` for `(organizationId, branchId, optional productId)`. Outbox event types: `inventory.adjustment.posted`, `sales.order.completed`, `sales.return.posted`, `catalog.reorderrule.created`, `catalog.reorderrule.updated`, `catalog.reorder_rule.upserted` (matching live `CanonicalCatalogService` & inventory/sales outbox emitters). Preserves exact Stage 1 `CanonicalInventoryItemDto` lot availability (`IsSellable && IsActive && Batch.IsEligibleForSale(organizationBusinessDate)`), weighted-average cost rounding (`4` decimals, `MidpointRounding.AwayFromZero`), and active `ReorderPointBase` projection inside `PagedResult<CanonicalInventoryItemDto>`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.IntegrationTests/Persistence/CanonicalStage2RepositoryTests.cs` (`[SkipWhenPostgresUnavailableFact]`):
  - Verifies keyset paging + seamless handoff to `OUTBOX_EVENT.event_sequence` cursor (`m: "ks"` -> `m: "seq"`) across **ALL 5 canonical feeds** (`sales`, `orders`, `returns`, `products`, `inventory`).
  - Verifies incremental `m == "seq"` mode picks up newly committed `OUTBOX_EVENT` rows (`sales.order.completed`, `sales.return.posted`, `catalog.product.*`, `catalog.uom.*`, `inventory.adjustment.posted`, `catalog.reorderrule.*`) without missing late commits or duplicating prior items.
  - Verifies unified `limit` clamp `[1, 1000]` (default `100`), `updated_since` (explicitly verifying `/canonical/orders` filters and keyset-orders on `(COALESCE(completed_at, created_at), sales_order_id)` for both `DRAFT` and `COMPLETED` orders), `from_date`/`to_date`, `branch_id`, and `FORCE RLS` cross-tenant isolation under `erp_it_app`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** explaining how all 5 canonical feeds now share one `updated_since` + `OUTBOX_EVENT.event_sequence` cursor engine per Blueprint §8.2 and `API-DIFF-011` / `T-03`.

---

## Task `AS-06`: Strictly Additive Stage 2 Canonical Read Service & `CanonicalServiceTokenGenerator` (`API-DIFF-012`)

### 1. Task Header
- **Task ID:** `AS-06`
- **Title:** Strictly Additive `ICanonicalStage2Service` & `ICanonicalServiceTokenGenerator` (`API-DIFF-012`)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-salah/as-06-canonical-stage2-service`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md`, `@.agent/skills/pharmacy-stage1-baseline/SKILL.md`, and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-06` merged into `stage2-dev` and pulled locally (`CanonicalRead` policy in `AuthorizationPoliciesExtensions.cs`, `.NET` `CanonicalReader` service token validation in `Api/DependencyInjection.cs` `OnTokenValidated`, and `CanonicalReader + ALL` bypass in `CurrentUser.CanAccessBranch`).
- [ ] `AS-05` (`ICanonicalStage2Repository` with unified 5-feed methods) merged into `stage2-dev` and pulled locally.
- [ ] Stage 1 `IBranchRepository`, `IOrganizationRepository`, `IUnitOfWork`, `ITenantContext`, `ICurrentUser`, `IRuntimeModeProvider`, and `JwksKeyProvider` exist.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Keep `AS-06` **strictly additive** — **ZERO signature changes** to Stage 1 `ICanonicalCatalogService`, `CanonicalCatalogService`, `ICanonicalInventoryService`, `CanonicalInventoryService`, or `CanonicalWriteStatuses` (the atomic Stage 1 Canonical unification of services + controllers + capabilities + OpenAPI + impacted Stage 1 tests lands together in **`AS-07`** so both `AS-06` and `AS-07` compile and pass 100% of tests independently!):

1. **Create `ICanonicalStage2Service` & `CanonicalStage2Service`** (`src/PharmacyERP.Application/Features/Integration/Services/`):
   - **Read-Only Contract:** Exposes strictly three read methods (`GetCanonicalSalesAsync`, `GetCanonicalOrdersAsync`, `GetCanonicalReturnsAsync`) — **ZERO write methods**.
   - **Shared Security & Transaction Pipeline:**
     1. Enforce `_runtimeMode.CurrentMode == ErpRuntimeMode.Cloud` -> `404 NOT_FOUND` (defense-in-depth alongside `RuntimeModeGuardMiddleware`).
     2. Require `_tenantContext.OrganizationId.HasValue && _tenantContext.OrganizationId.Value != Guid.Empty` -> `401 UNAUTHORIZED`.
     3. Enforce caller role in **`{ Admin, Pharmacist, CanonicalReader }`** -> else `403 FORBIDDEN` (explicitly rejecting `Cashier`).
     4. If client supplied `organization_id` query param (`organizationId.HasValue && organizationId.Value != Guid.Empty`) and `organizationId.Value != tenantOrganizationId` -> `403 FORBIDDEN`.
     5. Validate `from_date <= to_date` (`422 VALIDATION_ERROR`, `snake_case` field) and validate opaque `cursor` via `CanonicalOutboxCursor.TryDecode(...)` when provided -> **`422 VALIDATION_ERROR`** with `ApiErrorDetailDto("cursor", "Invalid cursor format.")`.
     6. Open explicit `IUnitOfWork` read transaction (`BeginTransactionAsync` -> queries -> `finally { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); }`):
        - If `filter.BranchId.HasValue`:
          - Verify branch belongs to tenant via `_branchRepository.GetByIdAsync(tenantOrganizationId, filter.BranchId.Value, ct)` (`404 NOT_FOUND` if missing).
          - Verify `_currentUser.CanAccessBranch(filter.BranchId.Value)` (`403 FORBIDDEN_BRANCH` if unauthorized; `CanonicalReader + ALL` is authorized via `AH-06`).
        - Resolve `allowedBranchIds = string.Equals(_currentUser.BranchScope, "ALL", StringComparison.Ordinal) ? null : _currentUser.AuthorizedBranchIds`.
        - Delegate to `_canonicalStage2Repo.GetCanonicalSalesPageAsync` / `GetCanonicalOrdersPageAsync` / `GetCanonicalReturnsPageAsync` and return `Result<PagedResult<T>>.Success(page)`.
2. **Create `ICanonicalServiceTokenGenerator` & `CanonicalServiceTokenGenerator` (`API-DIFF-012`):**
   - Interface: `src/PharmacyERP.Application/Features/Integration/Services/Interfaces/ICanonicalServiceTokenGenerator.cs`.
   - Implementation: `src/PharmacyERP.Infrastructure/Security/CanonicalServiceTokenGenerator.cs` (signed via existing `JwksKeyProvider` RS256 private key with configured `Jwt:Issuer` and `Jwt:Audience`).
   - Issues short-lived RS256 read-only service tokens compatible with `AH-06`'s `OnTokenValidated`:
     - `token_type`: `"service"`
     - `roles`: `["CanonicalReader"]` (exclusively `"CanonicalReader"` — zero user/admin/pharmacist roles)
     - `organization_id`: non-empty tenant GUID
     - `branch_scope`: `"ALL"` or `"ASSIGNED"` + `branch_ids` JSON string array
     - `scopes`: `["canonical:read"]` (strictly read-only — zero write scopes)
     - Default lifetime **`15 minutes`**, hard maximum **`60 minutes`** (`TimeSpan.FromMinutes(60)`; reject `<= 0` or `> 60 min` with `ArgumentOutOfRangeException`).

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Integration/CanonicalStage2ServiceTests.cs`:
  - Happy paths for `sales`, `orders`, and `returns` (`Admin`, `Pharmacist`, and `CanonicalReader` across `ALL` and `ASSIGNED` scopes).
  - Rejects `Cashier` (`403 FORBIDDEN`), `BranchLocal` runtime (`404 NOT_FOUND`), missing tenant (`401`), cross-tenant `organization_id` mismatch (`403 FORBIDDEN`), missing branch (`404`), unauthorized branch (`403 FORBIDDEN_BRANCH`), inverted date range (`422`), and malformed cursor (`422`, `field: "cursor"`).
  - Verifies explicit `BeginTransactionAsync` + `RollbackTransactionAsync(CancellationToken.None)` on both success and failure paths.
- `tests/PharmacyERP.UnitTests/Security/CanonicalServiceTokenGeneratorTests.cs`:
  - Verifies RS256 signature verification against `JwksKeyProvider.GetPublicKeyParameters()`, exact claims (`token_type: "service"`, `roles: ["CanonicalReader"]`, `scopes: ["canonical:read"]`, `organization_id`, `branch_scope`, `branch_ids`), default `15 min` TTL, and rejection of `> 60 min` or `<= 0` TTL.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing the strictly additive Cloud-only read-only canonical service and `CanonicalServiceTokenGenerator` (`API-DIFF-012`), confirming zero Stage 1 signature churn prior to atomic unification in `AS-07`.

---

## Task `AS-07`: `CanonicalSalesController`, Atomic Stage 1 Canonical Unification (`API-DIFF-011`, `API-DIFF-012`, `DTO-DIFF-034`), `CanonicalCapabilitiesService` Update, DI Wiring & OpenAPI Sync

### 1. Task Header
- **Task ID:** `AS-07`
- **Title:** `CanonicalSalesController`, Atomic Stage 1 Canonical Service + Controller Unification, `CanonicalCapabilitiesService` Stage 2 Update, DI Registration & OpenAPI/Schema Sync
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-salah/as-07-canonical-controller-and-capabilities`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md`, `@.agent/skills/pharmacy-stage1-baseline/SKILL.md`, and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-06` (`CanonicalStage2DependencyInjection.cs`, `CanonicalRead` policy & Stage 2 `RuntimeModeGuardMiddleware`) merged into `stage2-dev` and pulled locally.
- [ ] `AS-04` and `AS-06` merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Land the entire Stage 1 Canonical unification (`API-DIFF-011`/`T-03`, `API-DIFF-012`, `DTO-DIFF-034`, plus defense-in-depth `Cloud` runtime guards) **atomically** in this single PR alongside `CanonicalSalesController`, `CanonicalCapabilitiesService`, OpenAPI snapshot regeneration, and all impacted Stage 1 tests so the solution compiles and passes 100% of tests at every commit:

1. **Create `src/PharmacyERP.Api/Controllers/CanonicalSalesController.cs`:**
   - `[ApiController]`, `[Route("api/v1/canonical")]`, **`[Authorize(Policy = "CanonicalRead")]`** (allows `Admin`, `Pharmacist`, and `CanonicalReader`; denies `Cashier` with `403 FORBIDDEN`).
   - Three read-only `GET` endpoints using explicit `snake_case` `[FromQuery(Name = "...")]` parameter names matching Stage 1 `CanonicalInventoryController` & `CanonicalCatalogController`:
     - `[HttpGet("sales")]` (`GET /api/v1/canonical/sales`) — `[ProducesResponseType(typeof(PagedResult<CanonicalSaleDto>), StatusCodes.Status200OK)]` + `401`, `403`, `404`, `422` (`ApiErrorEnvelopeDto`).
     - `[HttpGet("orders")]` (`GET /api/v1/canonical/orders`) — `[ProducesResponseType(typeof(PagedResult<CanonicalSalesOrderDto>), StatusCodes.Status200OK)]` + `401`, `403`, `404`, `422` (`ApiErrorEnvelopeDto`).
     - `[HttpGet("returns")]` (`GET /api/v1/canonical/returns`) — `[ProducesResponseType(typeof(PagedResult<CanonicalSaleReturnDto>), StatusCodes.Status200OK)]` + `401`, `403`, `404`, `422` (`ApiErrorEnvelopeDto`).
   - Query params on all three: `[FromQuery(Name = "organization_id")] Guid? organizationId`, `[FromQuery(Name = "branch_id")] Guid? branchFilter`, `[FromQuery(Name = "from_date")] DateTimeOffset? fromDate`, `[FromQuery(Name = "to_date")] DateTimeOffset? toDate`, `[FromQuery(Name = "updated_since")] DateTimeOffset? updatedSince`, `[FromQuery(Name = "cursor")] string? cursor`, `[FromQuery(Name = "limit")] int limit = 100`.
   - Thin controller: delegates directly to `ICanonicalStage2Service` and returns via `ApiResultMapper.ToActionResult(this, result, _currentUser.TraceId)`.
   - **ZERO `POST`/`PUT`/`PATCH`/`DELETE` actions on `CanonicalSalesController`** (Blueprint §6.6 & §8.2).
2. **Atomically Unify Stage 1 Canonical Services & DTOs (`ICanonicalCatalogService`, `CanonicalCatalogService`, `ICanonicalInventoryService`, `CanonicalInventoryService`, `CanonicalWriteStatuses`):**
   - **`DTO-DIFF-034` (`src/PharmacyERP.Application/Features/Integration/DTOs/CanonicalCatalogConfigurationDtos.cs`):** Add `public const string Succeeded = "succeeded";` to `CanonicalWriteStatuses` and update `CanonicalCatalogService.ConfigureProductAsync` and `ConfigureReorderRuleAsync` to emit **`CanonicalWriteStatuses.Succeeded` (`"succeeded"`)** per Blueprint §2.7 (replacing `"APPLIED"`).
   - **`ICanonicalCatalogService.cs` & `CanonicalCatalogService.cs` (`API-DIFF-011`, `API-DIFF-012`, Defense-in-Depth `Cloud` Check):**
     - Add defense-in-depth `Cloud` runtime-mode guard at the top of `GetCanonicalProductsFeedAsync`: `if (!IsCloudRuntimeMode()) return Result<PagedResult<CanonicalProductDto>>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.CloudOnlyOperationUnavailable);` (matching `ConfigureProductAsync` and `ConfigureReorderRuleAsync`).
     - Split `IsAuthorized()` into `IsReadAuthorized()` (`{ Admin, Pharmacist, CanonicalReader }`, used by `GetCanonicalProductsFeedAsync`) and `IsWriteAuthorized()` (`{ Admin, Pharmacist }` ONLY, used by `ConfigureProductAsync` & `ConfigureReorderRuleAsync` — denying `CanonicalReader` with **`403 FORBIDDEN`**!).
     - Update `GetCanonicalProductsFeedAsync` return type to **`Task<Result<PagedResult<CanonicalProductDto>>>`** with default `limit = 100` (clamped `[1, 1000]`).
     - Replace legacy ticks-based `EncodeCursor`/`TryDecodeCursor` with `CanonicalOutboxCursor.TryDecode(...)` (returning `422 VALIDATION_ERROR`, `field: "cursor"` on malformed cursor) and delegate to `ICanonicalStage2Repository.GetUnifiedCanonicalProductsPageAsync` inside the explicit `IUnitOfWork` read transaction.
   - **`ICanonicalInventoryService.cs` & `CanonicalInventoryService.cs` (`API-DIFF-011`, `API-DIFF-012`, Defense-in-Depth `Cloud` Check):**
     - Append optional trailing constructor parameter **`IRuntimeModeProvider? runtimeModeProvider = null`** (automatically resolved by DI while keeping existing unit test constructions backwards-compatible) and enforce defense-in-depth `if (_runtimeModeProvider is not null && _runtimeModeProvider.CurrentMode != ErpRuntimeMode.Cloud) return Result<PagedResult<CanonicalInventoryItemDto>>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.CloudOnlyOperationUnavailable);` inside `GetCanonicalInventoryAsync`.
     - Update role check on `GetCanonicalInventoryAsync` to allow **`{ Admin, Pharmacist, CanonicalReader }`** (still rejecting `Cashier` with `403 FORBIDDEN`).
     - Change `cursor` parameter on `ICanonicalInventoryService.GetCanonicalInventoryAsync` and `CanonicalInventoryService.GetCanonicalInventoryAsync` from `long?` to **`string?`**.
     - Validate `cursor` via `CanonicalOutboxCursor.TryDecode(...)` -> **`422 VALIDATION_ERROR`** with `ApiErrorDetailDto("cursor", "Invalid cursor format.")` on malformed cursor, and delegate to `ICanonicalStage2Repository.GetUnifiedCanonicalInventoryPageAsync` inside the explicit `IUnitOfWork` read transaction.
3. **Unify Stage 1 Canonical Controllers (`CanonicalCatalogController.cs` & `CanonicalInventoryController.cs`):**
   - **`src/PharmacyERP.Api/Controllers/CanonicalCatalogController.cs`:**
     - On `GetProductsFeed` (`GET /api/v1/canonical/products`): replace `[Authorize(Roles = "Admin,Pharmacist")]` with **`[Authorize(Policy = "CanonicalRead")]`**, update `[ProducesResponseType(typeof(PagedResult<CanonicalProductDto>), StatusCodes.Status200OK)]` (replacing `CanonicalProductFeedPageDto`), and update default `[FromQuery(Name = "limit")] int limit = 100` (was `50`).
     - On `ConfigureProduct` (`POST /api/v1/canonical/configuration/products`) and `ConfigureReorderRule` (`PUT /api/v1/canonical/configuration/reorder-rules`): keep **`[Authorize(Roles = "Admin,Pharmacist")]`** strictly unchanged so `CanonicalReader` tokens receive `403 FORBIDDEN`.
   - **`src/PharmacyERP.Api/Controllers/CanonicalInventoryController.cs`:**
     - On `GetCanonicalInventory` (`GET /api/v1/canonical/inventory`): replace `[Authorize(Roles = "Admin,Pharmacist")]` with **`[Authorize(Policy = "CanonicalRead")]`** and change `[FromQuery(Name = "cursor")] long? cursor` to **`[FromQuery(Name = "cursor")] string? cursor`** (keeping `limit = 100` and all `[ProducesResponseType]` attributes).
4. **Update `src/PharmacyERP.Application/Features/Integration/Services/Implementations/CanonicalCapabilitiesService.cs`** (MUST preserve `isCloud` check for `BranchLocal` empty arrays per `API-DIFF-008` / `DTO-DIFF-036`!):
   ```csharp
   public CanonicalCapabilitiesDto GetCapabilities()
   {
       var isCloud = _runtimeModeProvider.CurrentMode == ErpRuntimeMode.Cloud;

       return new CanonicalCapabilitiesDto(
           Stage: 2,
           RuntimeMode: _runtimeModeProvider.CurrentMode.ToString(),
           SupportedReads: isCloud
               ? new[] { "products", "inventory", "sales", "orders", "returns" }
               : Array.Empty<string>(),
           SupportedWrites: isCloud
               ? new[] { "configuration.products", "configuration.reorder-rules" }
               : Array.Empty<string>());
   }
   ```
   *(On `Cloud`: `Stage: 2`, `5` reads, `2` writes — **ZERO Stage 2 canonical writes**! On `BranchLocal`: `Stage: 2`, `supported_reads: []`, `supported_writes: []`.)*
5. **Register Services & Repositories ONLY in Ahmed Salah's Modular DI Files** (keep root `DependencyInjection.cs` untouched!):
   - `src/PharmacyERP.Application/Extensions/CanonicalStage2DependencyInjection.cs`: register `ISalesReturnQueryService`, `ICanonicalStage2Service` (`Scoped`).
   - `src/PharmacyERP.Infrastructure/Extensions/CanonicalStage2DependencyInjection.cs`: register `ISalesReturnQueryRepository`, `ICanonicalStage2Repository` (`Scoped`), and `ICanonicalServiceTokenGenerator` -> `CanonicalServiceTokenGenerator` (`Singleton`).
6. **Update Schemas, `ContractsArtifactSyncTests`, OpenAPI Snapshot & ALL 9 Impacted Stage 1 Test Files (NON-NEGOTIABLE):**
   - Update `apps/erp-backend/contracts/schemas/canonical-capabilities.schema.json`: change `"stage": { "type": "integer", "const": 1 }` to **`"const": 2`**.
   - Update `tests/PharmacyERP.IntegrationTests/Api/ContractsArtifactSyncTests.cs`:
     - Add `("/api/v1/canonical/sales", "get")`, `("/api/v1/canonical/orders", "get")`, and `("/api/v1/canonical/returns", "get")` to `ExpectedLiveEndpoints`.
     - Update `CanonicalCapabilitiesAndErrorEnvelopeSchemas_MatchLiveEndpointsAndErrorCodes`: assert `stage == 2`, `("Cloud", 5, 2)`, and `("BranchLocal", 0, 0)`.
   - Regenerate `apps/erp-backend/contracts/openapi.v1.json` (`UPDATE_OPENAPI_SNAPSHOT=true`) and update `apps/erp-backend/contracts/README.md`.
   - Update **all 9 impacted Stage 1 test files** strictly inside `tests/` in this same PR so 100% of unit and integration tests compile and pass:
     1. `Stage1ContractFixesUnitTests.cs`
     2. `Level1BWireContractTests.cs`
     3. `Level1AApiContractTests.cs`
     4. `CatalogEndpointsTests.cs`
     5. `CanonicalCatalogServiceTests.cs` (also assert `BranchLocal` -> `404 NOT_FOUND` on `GetCanonicalProductsFeedAsync`, `CanonicalReader` read/write separation, `PagedResult<CanonicalProductDto>`, and `status == "succeeded"`)
     6. `CanonicalInventoryServiceTests.cs` (also assert `BranchLocal` -> `404 NOT_FOUND` when `IRuntimeModeProvider` is provided, `string? cursor` `CanonicalOutboxCursor`, and `CanonicalReader` read access)
     7. `CanonicalCapabilitiesServiceTests.cs`
     8. `CanonicalCapabilitiesEndpointTests.cs`
     9. `CanonicalCapabilitiesControllerTests.cs`

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/API/Controllers/CanonicalSalesControllerAndCapabilitiesTests.cs`:
  - Verifies exact routes (`/api/v1/canonical/sales`, `/orders`, `/returns`), `[Authorize(Policy = "CanonicalRead")]` across ALL 5 canonical read endpoints (`CanonicalSalesController`, `CanonicalCatalogController.GetProductsFeed`, `CanonicalInventoryController.GetCanonicalInventory`), `snake_case` `[FromQuery]` names, complete `[ProducesResponseType]` attributes, and zero mutating HTTP attributes on `CanonicalSalesController`.
  - Verifies `CanonicalCapabilitiesService.GetCapabilities()` returns:
    - On `Cloud`: `Stage: 2`, `RuntimeMode: "Cloud"`, `SupportedReads: ["products", "inventory", "sales", "orders", "returns"]`, `SupportedWrites: ["configuration.products", "configuration.reorder-rules"]`.
    - On `BranchLocal`: `Stage: 2`, `RuntimeMode: "BranchLocal"`, `SupportedReads: []`, `SupportedWrites: []`.
- All 9 updated Stage 1 test files + `ContractsArtifactSyncTests`: 100% green with `0` drift.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Local API boot check confirming Swagger exposes `GET /api/v1/sales-returns`, `GET /api/v1/sales-returns/{id}`, `GET /api/v1/canonical/sales`, `GET /api/v1/canonical/orders`, `GET /api/v1/canonical/returns`, unified `GET /api/v1/canonical/products` & `GET /api/v1/canonical/inventory`, and updated `GET /api/v1/canonical/capabilities`, then terminate cleanly.
- Provide a concise **Arabic explanation in chat** summarizing the atomic Stage 1 + Stage 2 canonical unification across all 5 read feeds, defense-in-depth `Cloud` checks, `CanonicalRead` enforcement, `isCloud`-guarded capabilities update, and zero-write AI boundary enforcement.

---

## Task `AS-08`: Stage 2 DTO, Enum & Error Envelope Contract Schema Verification Suite + Shared Repo-Root `/contracts/` Export

### 1. Task Header
- **Task ID:** `AS-08`
- **Title:** Stage 2 Contract & Schema Verification Tests (`Stage2ContractSchemaTests.cs`) & Wave 3 Shared Repo-Root `/contracts/` Export
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-salah/as-08-stage2-contract-schema-tests`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AS-07` merged into `stage2-dev` and pulled locally.
- [ ] `YA-08` (`SalesOrderDraftDtos.cs`, `SalesInvoiceDtos.cs` & draft/invoice controllers), `EH-08` (`SalesCheckoutDtos.cs`, `SalesReturnWriteDtos.cs` & checkout/return-write controllers), and `AH-12` (`SyncDtos.cs`, `SyncPayloads.cs` & `SyncController`) merged into `stage2-dev` and pulled locally (all **`66` live endpoints** active).

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Create `tests/PharmacyERP.UnitTests/Contracts/Stage2ContractSchemaTests.cs`** validating JSON serialization against `ERP-Backend-Blueprint-v1.1.md` (§2.7, §4.4, §6.5, §6.6, §8.6, §8.9.11) using the **exact live `DependencyInjection.ApiJsonSerializerOptions`** (`PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower` + `JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false)`):
   - **Closed String-Only Enum Contracts:** Verify every Stage 2 enum (`OrderChannel`, `SalesOrderStatus`, `SalesInvoiceStatus`, `SalesPaymentStatus`, `PaymentMethod`, `SalesReturnStatus`, `SalesRefundStatus`, `ReturnDisposition`, `SyncOperationType`, `SyncProcessingStatus`, `SyncResultCode`, `SyncDeliveryOutcome`, `ErrorCode`) serializes as exact case-sensitive strings (never integers) **AND assert deserializing integer enum values throws `JsonException`** (`allowIntegerValues: false`).
   - **Sales DTO Property Contracts (strict `snake_case` + native JSON numbers):** Serialize & inspect JSON keys of `CreateSalesOrderRequest`, `ReplaceSalesOrderLinesRequest`, `CancelSalesOrderRequest`, `SalesOrderDto`, `CompleteSalesOrderRequest`, `CompleteSalesOrderResultDto`, `SalesInvoiceDto`, `CreateSalesReturnRequest`, `SalesReturnDto`, `SalesReturnDetailDto` — proving:
     - All keys emit strict `snake_case` (including optional `idempotency_key` on all 5 mutating Sales request DTOs).
     - All decimal money/quantity/tax/cost fields serialize as native JSON numbers (`JsonValueKind.Number`, `D-01`).
     - `CreateSalesOrderRequest` / `SalesOrderLineRequest` contain NO price/discount/tax/total properties (`unit_price`, `discount_amount`, `tax_rate`, `line_total`, `grand_total`).
     - `CreateSalesReturnRequest` / `SalesReturnLineRequest` contain NO `batch_id` or `destination_location_id` properties.
   - **Sync DTO Property Contracts (strict `snake_case`):** Serialize & inspect `SyncOperationBatchRequest`, `SyncOperationBatchResponse`, `SyncOperationResultDto`, `SyncBootstrapResponse`, `SyncChangesResponse` — verifying `next_cursor`, `branch_sequence`, `payload_hash`, and asserting `SyncBootstrapResponse` contains NO `stock_balances` or `opening_balances` properties.
   - **Canonical Stage 2 & Unified Stage 1 DTO Contracts:** Serialize & inspect `CanonicalSaleDto`, `CanonicalSalesOrderDto`, `CanonicalSaleReturnDto`, `CanonicalCapabilitiesDto`, `CanonicalWriteResultDto`, and `PagedResult<T>` — verifying exact `snake_case` property names (`next_cursor`, `runtime_mode`, `supported_reads`, `supported_writes`, `unit_price_entered`, `unit_price_base`, `unit_cost_base_snapshot`), `schema` & `version` constants, zero customer/delivery/reservation/terminal/PII keys, zero Stage 2 canonical write entries in `supported_writes`, `BranchLocal` empty arrays, and **`CanonicalWriteResultDto.status == "succeeded"`** (`DTO-DIFF-034`).
   - **Error Envelope Contract (§8.6):** Verify `ApiResultMapper` produces `{ "error": { "code", "message", "details", "trace_id" } }` with exact HTTP status codes (`400` including `ToMissingIdempotencyKeyResult`, `401`, `403`, `404`, `409` including `SYNC_CURSOR_EXPIRED`, `OUT_OF_STOCK`, `INVALID_STATE_TRANSITION`, `IDEMPOTENCY_MISMATCH`, and `422` with `snake_case` `details[].field`).
2. **Wave 3 Shared Repo-Root `/contracts/` Stage 2 Activation Sync (`00-backend-guardrails.md` §1.1):**
   - Run `ContractsArtifactSyncTests` verifying all **`66` live endpoints** (`48` Stage 1 + `18` new Stage 2 + updated `/api/v1/canonical/capabilities`) match `/swagger/v1/swagger.json` with zero drift and 100% typed response schemas.
   - Synchronize the **4 Stage 2 Activation Deltas** into the shared monorepo-root `contracts/` package (preserving all `x-stage`/`x-surface`/`x-runtime`/`x-roles` extensions, modular schemas, fixtures, and repo-root documentation — **NEVER** overwriting repo-root `contracts/README.md` with backend-only `apps/erp-backend/contracts/README.md` or duplicating `openapi.v1.json` into repo-root `contracts/`):
     - `contracts/openapi.erp.yaml` (activate Stage 2 updates on `/canonical/capabilities`, `/canonical/products`, `/canonical/inventory`, `/canonical/configuration/*`, preserving `x-*` extensions across all `66` endpoints)
     - `contracts/schemas/api-error-envelope.schema.json` (add `"SYNC_CURSOR_EXPIRED"`)
     - `contracts/schemas/canonical-capabilities.schema.json` (`"const": 2`)
     - `contracts/schemas/common.json` (add `"SYNC_CURSOR_EXPIRED"` to `ErrorCode` and `"return:read"`, `"return:write"`, `"sync:retry"` to `PermissionScope`)
     - `contracts/schemas/canonical.json` (unified `PagedResult<CanonicalProductDto>` / `string? cursor` / `CanonicalWriteResultDto.status` `"succeeded"`)
     - `contracts/README.md` and `contracts/FRONTEND.md` (update Stage 2 activation status tables in-place)
   - Verify exact semantic parity between `apps/erp-backend/contracts/openapi.v1.json` and shared repo-root `contracts/openapi.erp.yaml` + `contracts/schemas/`.

### 4. Mandatory Unit & Integration Tests
- Execute `Stage2ContractSchemaTests.cs`, `ContractsArtifactSyncTests.cs`, and the full solution suite (`0 Failed, 0 Skipped`).

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing the strict `SnakeCaseLower` contract drift protections, integer-enum rejection proof, and Wave 3 shared repo-root `contracts/` export (`66` live endpoints).

---

## Task `AS-09`: Return Queries & Unified 5-Feed Canonical PostgreSQL Integration Test Suite

### 1. Task Header
- **Task ID:** `AS-09`
- **Title:** Return Queries & Unified 5-Feed Canonical Reads PostgreSQL Integration Tests
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
   - Filters accurately using strict `snake_case` query params: `branch_id`, `invoice_id`, `from_date`, `to_date`, `page`, `page_size` (default `page=1, page_size=25`).
   - Asserts **`422 VALIDATION_ERROR`** with `snake_case` `details[].field` on `page=0`, `page_size=0`, `page_size=201`, and inverted `from_date > to_date`.
   - Returns full detail (lines, refunds, `SALES_RETURN_IN` + `SCRAP_OUT` stock movements) including deactivated product/employee names.
   - Enforces `403 FORBIDDEN_BRANCH` for unassigned branches and `404 NOT_FOUND` for cross-tenant IDs under `FORCE RLS`.
2. **Unified 5-Feed Canonical Endpoints (`GET /api/v1/canonical/products`, `/inventory`, `/sales`, `/orders`, `/returns`), Config Writes & `/capabilities`:**
   - **Unified `OUTBOX_EVENT.event_sequence` Cursor Across All 5 Feeds:** On `Cloud`, returns `200 OK` with `PagedResult<T>` (`items`, `page`, `page_size`, `total_count`, `next_cursor`), strict `snake_case` payload, `schema`/`version`, zero PII fields, working `updated_since` filter, seamless `m: "ks"` -> `m: "seq"` cursor handoff over `OUTBOX_EVENT.event_sequence` across ALL 5 feeds (`/products`, `/inventory`, `/sales`, `/orders`, `/returns`), and **`422 VALIDATION_ERROR` (`field: "cursor"`)** on malformed cursor.
   - **`CanonicalReader` Read-Only Service Token (`API-DIFF-012`):** Issue a real RS256 service token via `ICanonicalServiceTokenGenerator` and verify:
     - **`200 OK`** on ALL 5 canonical read endpoints (`/products`, `/inventory`, `/sales`, `/orders`, `/returns`).
     - **`403 FORBIDDEN`** on canonical writes (`POST /api/v1/canonical/configuration/products`, `PUT /api/v1/canonical/configuration/reorder-rules`) and operational ERP writes (`POST /api/v1/sales-orders`, `POST /api/v1/inventory/adjustments`).
     - **`403 FORBIDDEN`** for `Cashier` attempting any of the 5 canonical read endpoints.
   - **Canonical Configuration Write Status (`DTO-DIFF-034`):** Verify authorized `Admin`/`Pharmacist` calls to `POST /api/v1/canonical/configuration/products` and `PUT /api/v1/canonical/configuration/reorder-rules` return `"status": "succeeded"`.
   - **Tenant & Branch Security:** On `Cloud`, rejects mismatched `organization_id` query param with `403 FORBIDDEN`; rejects unauthorized `branch_id` with `403 FORBIDDEN_BRANCH`; rejects unknown `branch_id` with `404 NOT_FOUND`.
   - **`BranchLocal` Runtime Mode:** Returns `404 NOT_FOUND` (`RuntimeModeGuardMiddleware`) for `/api/v1/canonical/products`, `/inventory`, `/sales`, `/orders`, `/returns`, while STILL returning `200 OK` for `GET /api/v1/canonical/capabilities` with **`stage: 2`, `runtime_mode: "BranchLocal"`, `supported_reads: []`, `supported_writes: []`**.
   - **Cross-Tenant PostgreSQL RLS Pool Reuse:** Tenant B querying `/api/v1/canonical/products`, `/inventory`, `/sales`, `/orders`, `/returns` on pooled `erp_it_app` connections sees zero rows from Tenant A.

### 4. Mandatory Unit & Integration Tests
- Execute `Stage2ReturnReadAndCanonicalEndpointsTests.cs` plus full solution suite (`0 Failed, 0 Skipped`).

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing the live PostgreSQL & HTTP integration proof for Return Reads, all 5 unified Canonical feeds, `CanonicalReader` service tokens, `"succeeded"` write status, and `BranchLocal` empty capabilities.

---

## Task `AS-FINAL`: Final Security, Performance & Architecture Audit

### 1. Task Header
- **Task ID:** `AS-FINAL`
- **Title:** Final Security, Performance & Architecture Audit (Return Reads, Unified 5-Feed Canonical & Contracts)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-salah/as-final-stage2-audit`
- **Execution Command:** Execute via `/stage-final-audit` applying `@.agent/rules/00-backend-guardrails.md`, `@.agent/skills/pharmacy-backend-engineering/SKILL.md`, `@.agent/skills/backend-security-audit/SKILL.md`, `@.agent/skills/performance-concurrency-guard/SKILL.md`, and `@.agent/skills/architecture-unifier/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AS-01` through `AS-09` merged into `stage2-dev` and pulled locally.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Run `/stage-final-audit` across all Ahmed Salah's Stage 2 code (`AS-02`..`AS-09`) and generate **`apps/erp-backend/docs/stage2-reports/ahmed-salah-stage2-report.md`** covering:
1. **Security & AI Write-Boundary Audit:** Confirm all 5 Canonical read endpoints (`/products`, `/inventory`, `/sales`, `/orders`, `/returns`) are `Cloud`-only, enforce `[Authorize(Policy = "CanonicalRead")]` (`Admin`, `Pharmacist`, `CanonicalReader`), deny `CanonicalReader` (`403`) on all canonical configuration writes and ERP writes, enforce exact `organization_id` match + `IBranchRepository` tenant ownership + `_currentUser.CanAccessBranch`, expose zero PII/customer/delivery/reservation/terminal fields, emit `CanonicalWriteResultDto.status == "succeeded"`, and `CanonicalCapabilitiesService` preserves `isCloud` (`Cloud`: `stage: 2`, `5` reads, `2` writes; `BranchLocal`: `stage: 2`, `[]`, `[]`; zero Stage 2 canonical writes).
2. **Performance & Query Hygiene Audit:** Confirm `.AsNoTracking()` + `.AsSplitQuery()` on all queries, zero N+1 loops, bounded pagination (**`page_size` `1..200`** with default `25` and `422` on out-of-range for ERP return queries; **`limit` `1..1000`** with default `100` for all 5 Canonical feeds), explicit `IUnitOfWork` read transactions (`RollbackTransactionAsync(CancellationToken.None)`), and unified `OUTBOX_EVENT.event_sequence` cursor handoff across all 5 canonical feeds.
3. **Contract & Architecture Audit:** Confirm `Stage2ContractSchemaTests` and `ContractsArtifactSyncTests` (`66` live endpoints) pass 100%, verify exact parity between `apps/erp-backend/contracts/` and shared monorepo-root `contracts/`, confirm zero edits to `Program.cs`/`PharmacyDbContext.cs`/root `DependencyInjection.cs`, and verify clean partial controller separation (`SalesReturnsController.Read.cs`).
4. **Build & Test Proof:** Exact `dotnet build` (`0 Error(s), 0 Warning(s)`) and `dotnet test` (`100% Passed, 0 Failed, 0 Skipped`) results.

### 4. Mandatory Unit & Integration Tests
- Execute full `PharmacyERP.sln` suite (`UnitTests` + `IntegrationTests`) with zero failures and zero skips; resolve any findings with regression tests before report sign-off.

### 5. Verification & Arabic Explanation Gate
- Confirm `apps/erp-backend/docs/stage2-reports/ahmed-salah-stage2-report.md` is generated and complete.
- Provide a final **Arabic debrief in chat** summarizing the audit results and confirming `AS-FINAL` sign-off for Wave 4.
