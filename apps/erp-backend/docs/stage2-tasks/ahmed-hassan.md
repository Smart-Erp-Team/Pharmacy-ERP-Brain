# Stage 2 Engineering Task Specification — Ahmed Hassan (`AH-01`..`AH-14`, `AH-FINAL`)

| Field | Value |
| :--- | :--- |
| **Developer** | Ahmed Hassan |
| **Master Reference** | [00-STAGE2-EXECUTION-MAP.md](./00-STAGE2-EXECUTION-MAP.md) & `_audit_docs/01_master_spec/ERP-Backend-Blueprint-v1.1.md` (Sections 4, 6, 8, 9, 10 — frozen reference-only) |
| **Base / Target Branch** | `stage2-dev` (**NEVER** open Stage 2 feature PRs against `main`) |
| **Execution Protocol** | Run every engineering task via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md`, `@.agent/skills/pharmacy-stage1-baseline/SKILL.md`, and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`. Run `AH-FINAL` via `/stage-final-audit`. |
| **Stage 1 Verified PKs & AKs** | `Organization.OrganizationId` · `Branch.BranchId` AK `(OrganizationId, BranchId)` · `Employee.EmployeeId` AK `(OrganizationId, EmployeeId)` · `Product.ProductId` AK `(OrganizationId, ProductId)` · `ProductUom.ProductUomId` AK `(OrganizationId, ProductId, ProductUomId)` · `InventoryBatch.BatchId` AK `(OrganizationId, ProductId, BatchId)` · `InventoryLocation.LocationId` AK `(OrganizationId, BranchId, LocationId)` · `InventoryTxn.InventoryTxnId` AK `(OrganizationId, InventoryTxnId, BranchId)` |
| **Verified Stage 1 Baseline** | **`767 / 767`** tests passing (`590` Unit + `177` Integration), **`48` live HTTP endpoints** (`47` controller actions + `GET /.well-known/jwks.json`), **`76` OpenAPI schemas**, `0 Error(s), 0 Warning(s)`, global `JsonNamingPolicy.SnakeCaseLower` + string-only enums (`allowIntegerValues: false`), and live `ContractsArtifactSyncTests` gate |
| **Hard Boundaries** | Edit strictly inside `apps/erp-backend/` **plus** the shared monorepo-root `contracts/` directory when exporting synchronized Stage 2 OpenAPI/JSON schemas (per `00-backend-guardrails.md` §1.1). Keep `src/PharmacyERP.Api/Program.cs` and `src/PharmacyERP.Infrastructure/Persistence/Database/PharmacyDbContext.cs` **100% untouched**. Reference only active `INonLotBatchInitializer` and `IProductInventoryUsageChecker` (ignore `*2.cs` interfaces). **ZERO Stage 3 Purchasing code.** |

---

## Task `AH-01`: `stage2-dev` Branch Bootstrap, Stage 2 Domain Enums, Exceptions & Error Schema Sync

### 1. Task Header
- **Task ID:** `AH-01`
- **Title:** `stage2-dev` Branch Bootstrap, Stage 2 Domain Enums, Exceptions & Error Schema Sync
- **Base Branch:** `stage2-dev` (created directly from verified Stage 1 `main`)
- **Feature Branch:** `stage2/ahmed-hassan/ah-01-stage2-enums-and-exceptions`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] Local PostgreSQL environment initialized via `setup-local-db.ps1` and verified Stage 1 baseline passes (**`767 / 767`** tests: `590` Unit + `177` Integration, `48` live HTTP endpoints, `76` OpenAPI schemas, `0` warnings).
- [ ] `src/PharmacyERP.Domain/Enums/ErrorCode.cs` exists with the 11 Stage 1 error codes, and `apps/erp-backend/contracts/schemas/api-error-envelope.schema.json` + `tests/PharmacyERP.IntegrationTests/Api/ContractsArtifactSyncTests.cs` exist and pass.
- [ ] `src/PharmacyERP.Domain/Exceptions/DomainException.cs` (or `IntegrationDomainException.cs` / `InventoryDomainExceptions.cs`) exists as the base domain exception pattern.
- [ ] `stage2-dev` branch exists locally (branched from verified Stage 1 `main`).

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Create Stage 2 Enums under `src/PharmacyERP.Domain/Enums/`** (`namespace PharmacyERP.Domain.Enums;`, exact case-sensitive string names matching Blueprint §4.2 & §8.9.11):
   - `OrderChannel.cs`: `public enum OrderChannel { POS = 1 }`
   - `SalesOrderStatus.cs`: `public enum SalesOrderStatus { DRAFT = 1, COMPLETED = 2, CANCELLED = 3 }`
   - `SalesInvoiceStatus.cs`: `public enum SalesInvoiceStatus { ISSUED = 1 }`
   - `SalesPaymentStatus.cs`: `public enum SalesPaymentStatus { PAID = 1, PARTIALLY_REFUNDED = 2, REFUNDED = 3 }`
   - `PaymentMethod.cs`: `public enum PaymentMethod { CASH = 1 }`
   - `SalesReturnStatus.cs`: `public enum SalesReturnStatus { DRAFT = 1, POSTED = 2, CANCELLED = 3 }`
   - `SalesRefundStatus.cs`: `public enum SalesRefundStatus { NOT_REFUNDED = 1, PARTIALLY_REFUNDED = 2, REFUNDED = 3 }`
   - `ReturnDisposition.cs`: `public enum ReturnDisposition { RESTOCK = 1, QUARANTINE = 2, SCRAP = 3 }`
   - `SyncOperationType.cs`: `public enum SyncOperationType { COMPLETE_SALES_ORDER = 1, POST_SALES_RETURN = 2, POST_INVENTORY_ADJUSTMENT = 3, RECEIVE_PURCHASE_ORDER = 4, CANCEL_REMAINING_PURCHASE_ORDER = 5, POST_VENDOR_RETURN = 6 }`
     *(Note: The enum carries the closed Blueprint §8.9.11 DB CHECK set so Stage 3 requires no CHECK drop/recreate; Stage 2 handlers accept strictly values `1..3`.)*
   - `SyncProcessingStatus.cs`: `public enum SyncProcessingStatus { RECEIVED = 1, APPLIED = 2, CONFLICT = 3, FAILED = 4 }`
   - `SyncResultCode.cs`: `public enum SyncResultCode { APPLIED = 1, CONFLICT = 2, FAILED = 3 }`
   - `SyncDeliveryOutcome.cs`: `public enum SyncDeliveryOutcome { APPLIED = 1, ALREADY_APPLIED = 2, CONFLICT = 3, FAILED = 4 }` *(response DTO status per Blueprint §4.4)*.
2. **Extend `src/PharmacyERP.Domain/Enums/ErrorCode.cs` & Synchronize Error Envelope Schema:**
   - Append `SYNC_CURSOR_EXPIRED` (`// HTTP 409`) to `ErrorCode.cs` without altering or reordering any of the 11 Stage 1 values.
   - **MANDATORY CONTRACT SYNC (prevents `ContractsArtifactSyncTests` failure):** Add `"SYNC_CURSOR_EXPIRED"` to `properties.error.properties.code.enum` in `apps/erp-backend/contracts/schemas/api-error-envelope.schema.json` in this same PR (live `ContractsArtifactSyncTests.CanonicalCapabilitiesAndErrorEnvelopeSchemas_MatchLiveEndpointsAndErrorCodes` asserts every `Enum.GetNames<ErrorCode>()` value exists in `api-error-envelope.schema.json`).
3. **Create Domain Exceptions under `src/PharmacyERP.Domain/Exceptions/`** (`namespace PharmacyERP.Domain.Exceptions;`):
   - `SalesDomainException.cs`:
     ```csharp
     public class SalesDomainException : DomainException
     {
         public SalesDomainException(string message) : base(message) { }
     }
     public sealed class InvalidSalesOrderStateTransitionException : SalesDomainException { ... }
     public sealed class ImmutableSalesInvoiceException : SalesDomainException { ... }
     public sealed class InvalidSalesPaymentAmountException : SalesDomainException { ... }
     public sealed class InvalidSalesRefundAmountException : SalesDomainException { ... }
     ```
   - `SyncDomainException.cs`:
     ```csharp
     public class SyncDomainException : DomainException
     {
         public SyncDomainException(string message) : base(message) { }
     }
     public sealed class ImmutableSyncResultCodeException : SyncDomainException { ... }
     public sealed class InvalidSyncSequenceException : SyncDomainException { ... }
     ```
4. **`GlobalUsings.cs`:** No change required (`PharmacyERP.Domain.Enums` and `PharmacyERP.Domain.Exceptions` are already globally imported in `src/PharmacyERP.Domain/GlobalUsings.cs`, `Application/GlobalUsings.cs`, `Infrastructure/GlobalUsings.cs`, and `Api/GlobalUsings.cs`).

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Domain/Sales/Stage2EnumAndExceptionTests.cs`:
  - Verify exact `Enum.GetNames<T>()` string values for all 12 Stage 2 enums match Blueprint §4.2 & §8.9.11 case-sensitively.
  - Verify `ErrorCode` retains all 11 Stage 1 names plus `SYNC_CURSOR_EXPIRED`.
  - Verify `SalesDomainException` and `SyncDomainException` inherit from `DomainException` and preserve message text.
- Verify `tests/PharmacyERP.IntegrationTests/Api/ContractsArtifactSyncTests.cs` (`CanonicalCapabilitiesAndErrorEnvelopeSchemas_MatchLiveEndpointsAndErrorCodes`) passes with `"SYNC_CURSOR_EXPIRED"` synchronized in `apps/erp-backend/contracts/schemas/api-error-envelope.schema.json`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`, including `ContractsArtifactSyncTests`).
- Provide a concise **Arabic explanation in chat** (keeping C# identifiers, enum values, and file paths in English) summarizing the enums, exceptions, error schema sync, and `stage2-dev` bootstrap.

---

## Task `AH-02`: Stage 2 Sales Domain Entities, `InventoryTxn` Extensions & `BranchEnrollment` Runtime Credential Support

### 1. Task Header
- **Task ID:** `AH-02`
- **Title:** Stage 2 Sales Domain Entities, `InventoryTxn` Extensions & `BranchEnrollment` Runtime Credential Support
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-hassan/ah-02-sales-domain-entities`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-01` merged into `stage2-dev` and pulled locally.
- [ ] All Stage 2 enums (`OrderChannel`, `SalesOrderStatus`, `SalesInvoiceStatus`, `SalesPaymentStatus`, `PaymentMethod`, `SalesReturnStatus`, `SalesRefundStatus`, `ReturnDisposition`) and `SalesDomainException` compile in `PharmacyERP.Domain`.
- [ ] `src/PharmacyERP.Domain/Entities/Inventory/InventoryTxn.cs`, `InventoryTxnLine.cs`, and `src/PharmacyERP.Domain/Entities/Identity/BranchEnrollment.cs` exist.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Create persistence-ignorant entities under `src/PharmacyERP.Domain/Entities/Sales/` (`namespace PharmacyERP.Domain.Entities.Sales;`), zero EF/Npgsql/ASP.NET references, private parameterless constructors for EF, and static factory/rehydration methods (including explicit-ID overloads required by Cloud Sync exact fact replay in `AH-09`):

1. **`SalesOrder.cs`:**
   - Properties: `Guid SalesOrderId`, `Guid OrganizationId`, `Guid BranchId`, `Guid CreatedByEmployeeId`, `string OrderNo` (max 40), `OrderChannel Channel` (`POS`), `SalesOrderStatus OrderStatus` (`DRAFT`/`COMPLETED`/`CANCELLED`), `string CurrencyCode` (`char(3)` uppercase), `string IdempotencyKey` (max 100), `DateTimeOffset CreatedAt`, `DateTimeOffset? CompletedAt`.
   - Navigation: `public ICollection<SalesOrderLine> Lines { get; private set; } = new List<SalesOrderLine>();`
   - Methods: `CreateDraft(...)` (optional `Guid? salesOrderId = null` for deterministic sync replay), `ReplaceLines(IEnumerable<SalesOrderLine> newLines)` (throws `InvalidSalesOrderStateTransitionException` if `OrderStatus != DRAFT`, rejects empty list), `MarkCompleted(DateTimeOffset completedAt)` (only from `DRAFT`, requires `Lines.Count > 0`), `Cancel()` (only from `DRAFT`).
2. **`SalesOrderLine.cs`:**
   - Properties: `Guid OrderLineId`, `Guid OrganizationId`, `Guid SalesOrderId`, `Guid ProductId`, `Guid ProductUomId`, `decimal EnteredQty`, `decimal ConversionSnapshot`, `decimal QuantityBase`, `decimal UnitPriceSnapshot`, `decimal DiscountAmount`, `decimal TaxRateSnapshot`, `decimal TaxAmountSnapshot`, `decimal LineTotal`, `DateTimeOffset CreatedAt`, `DateTimeOffset UpdatedAt`.
   - Navigation: `public SalesOrder SalesOrder { get; private set; } = null!;`
   - Factory `Create(...)`: validates `EnteredQty > 0`, `ConversionSnapshot > 0`, `UnitPriceSnapshot >= 0`, `DiscountAmount >= 0`, `TaxRateSnapshot is >= 0 and <= 1`; computes & verifies:
     - `QuantityBase = Math.Round(enteredQty * conversionSnapshot, 4, MidpointRounding.AwayFromZero)`
     - `net = Math.Round(enteredQty * unitPriceSnapshot - discountAmount, 2, MidpointRounding.AwayFromZero)` (rejects `net < 0`)
     - `TaxAmountSnapshot = Math.Round(net * taxRateSnapshot, 2, MidpointRounding.AwayFromZero)`
     - `LineTotal = net + TaxAmountSnapshot`
3. **`SalesInvoice.cs`:**
   - Properties: `Guid InvoiceId`, `Guid OrganizationId`, `Guid BranchId`, `Guid SalesOrderId`, `string InvoiceNo` (max 40), `SalesInvoiceStatus Status` (`ISSUED`), `string CurrencyCode` (`char(3)`), `decimal Subtotal`, `decimal DiscountTotal`, `decimal TaxTotal`, `decimal GrandTotal`, `decimal PaidAmount`, `decimal RefundedAmount`, `SalesPaymentStatus PaymentStatus`, `DateTimeOffset IssuedAt`, `DateTimeOffset CreatedAt`, `DateTimeOffset UpdatedAt`.
   - Navigation: `public SalesOrder SalesOrder { get; private set; } = null!;`, `public ICollection<SalesInvoiceLine> Lines { get; private set; } = new List<SalesInvoiceLine>();`, `public ICollection<SalesPayment> Payments { get; private set; } = new List<SalesPayment>();`, `public ICollection<SalesReturn> Returns { get; private set; } = new List<SalesReturn>();`
   - Factory `Issue(...)`: validates non-empty `lines`, verifies `Subtotal = sum(net_amount)`, `DiscountTotal = sum(discount_amount)`, `TaxTotal = sum(tax_amount)`, `GrandTotal = sum(line_total)`, `PaidAmount == GrandTotal`, `RefundedAmount == 0m`, `Status = ISSUED`, `PaymentStatus = PAID`.
   - Settlement projection method `ApplyRefund(decimal refundAmount, DateTimeOffset updatedAt)`: validates `refundAmount > 0`, `RefundedAmount + refundAmount <= PaidAmount` (throws `InvalidSalesRefundAmountException` otherwise), increments `RefundedAmount`, updates `PaymentStatus` (`REFUNDED` if `RefundedAmount == PaidAmount` else `PARTIALLY_REFUNDED`), sets `UpdatedAt`.
4. **`SalesInvoiceLine.cs`:**
   - Properties: `Guid InvoiceLineId`, `Guid OrganizationId`, `Guid InvoiceId`, `Guid SourceOrderLineId`, `Guid ProductId`, `Guid ProductUomId`, `decimal EnteredQty`, `decimal ConversionSnapshot`, `decimal QuantityBase`, `decimal UnitPriceSnapshot`, `decimal DiscountAmount`, `decimal TaxRateSnapshot`, `decimal TaxAmount`, `decimal NetAmount`, `decimal LineTotal`, `decimal UnitCostSnapshot`.
   - Navigation: `public SalesInvoice Invoice { get; private set; } = null!;`
   - Factory `Create(...)`: validates `QuantityBase == round(EnteredQty * ConversionSnapshot, 4)`, `LineTotal == NetAmount + TaxAmount`, `UnitCostSnapshot >= 0`. Strictly immutable after construction (no mutator methods).
5. **`SalesPayment.cs`:**
   - Properties: `Guid PaymentId`, `Guid OrganizationId`, `Guid BranchId`, `Guid InvoiceId`, `Guid ReceivedByEmployeeId`, `decimal AmountDue`, `decimal CashTenderedAmount`, `decimal ChangeAmount`, `PaymentMethod Method` (`CASH`), `string IdempotencyKey` (max 100), `DateTimeOffset PaidAt`, `string? Note` (max 500).
   - Navigation: `public SalesInvoice Invoice { get; private set; } = null!;`
   - Factory `CreateCashPayment(...)`: enforces `Method == PaymentMethod.CASH`, `AmountDue > 0`, `CashTenderedAmount >= AmountDue` (throws `InvalidSalesPaymentAmountException` otherwise), `ChangeAmount = Math.Round(cashTenderedAmount - amountDue, 2, MidpointRounding.AwayFromZero)`.
6. **`SalesReturn.cs`:**
   - Properties: `Guid ReturnId`, `Guid OrganizationId`, `Guid InvoiceId`, `Guid BranchId`, `Guid ReceivedByEmployeeId`, `Guid? ApprovedByEmployeeId`, `string ReturnNo` (max 40), `SalesReturnStatus Status`, `string ReasonCode` (max 40), `decimal RefundAmount`, `SalesRefundStatus RefundStatus`, `string IdempotencyKey` (max 100), `DateTimeOffset ReceivedAt`.
   - Navigation: `public SalesInvoice Invoice { get; private set; } = null!;`, `public ICollection<SalesReturnLine> Lines { get; private set; } = new List<SalesReturnLine>();`, `public ICollection<SalesRefund> Refunds { get; private set; } = new List<SalesRefund>();`
   - Factory `CreatePosted(...)`: enforces non-empty lines, `ApprovedByEmployeeId != ReceivedByEmployeeId` when `ApprovedByEmployeeId.HasValue`, `RefundAmount == sum(line.RefundAmount)`, `RefundAmount >= 0`, `RefundStatus` derived (`NOT_REFUNDED` if `0`, `REFUNDED` when full cash refund equals `RefundAmount`). *(Explicit non-refund alignment with `EH-06`/`EH-07`: when `issue_cash_refund == false`, callers set every `SalesReturnLine.RefundAmount = 0m` and `SalesReturn.RefundAmount = 0m`, yielding `RefundStatus = SalesRefundStatus.NOT_REFUNDED` and `SalesRefund = null` so `SALES_RETURN.refund_amount == SUM(SALES_RETURN_LINE.refund_amount) == SUM(SALES_REFUND.amount)` always holds cleanly without throwing.)*
7. **`SalesReturnLine.cs`:**
   - Properties: `Guid ReturnLineId`, `Guid OrganizationId`, `Guid ReturnId`, `Guid InvoiceId`, `Guid BranchId`, `Guid InvoiceLineId`, `Guid ProductId`, `Guid BatchId` (non-null, `NON-LOT` deterministic GUID when non-lot), `Guid DestinationLocationId`, `decimal QuantityBase`, `decimal RefundAmount`, `ReturnDisposition Disposition`.
   - Navigation: `public SalesReturn SalesReturn { get; private set; } = null!;`, `public SalesInvoiceLine InvoiceLine { get; private set; } = null!;`
   - Factory `Create(...)`: validates all GUIDs non-empty, `QuantityBase > 0`, `RefundAmount >= 0`.
8. **`SalesRefund.cs`:**
   - Properties: `Guid RefundId`, `Guid OrganizationId`, `Guid BranchId`, `Guid SalesReturnId`, `Guid InvoiceId`, `Guid ProcessedByEmployeeId`, `decimal Amount`, `PaymentMethod Method` (`CASH`), `string IdempotencyKey` (max 100), `DateTimeOffset RefundedAt`.
   - Navigation: `public SalesReturn SalesReturn { get; private set; } = null!;`, `public SalesInvoice Invoice { get; private set; } = null!;`
   - Factory `CreateCashRefund(...)`: enforces `Method == PaymentMethod.CASH`, `Amount > 0`.
9. **Extend `src/PharmacyERP.Domain/Entities/Inventory/InventoryTxn.cs` & `InventoryTxnLine.cs` (Backwards-Compatible with Live Stage 1 Signatures):**
   - Live Stage 1 `InventoryTxn.CreateDraft` and `InventoryTxn.CreatePosted` already accept `salesOrderId`, `salesReturnId`, `purchaseOrderId`, `vendorReturnId`. Append an optional trailing `Guid? inventoryTxnId = null` parameter after `vendorReturnId = null` on both `CreateDraft` and `CreatePosted` (`InventoryTxnId = inventoryTxnId ?? Guid.NewGuid()`, forwarded from `CreatePosted` to `CreateDraft`) so Cloud Sync exact fact replay (`AH-09`) preserves branch-assigned `InventoryTxnId`.
   - Live Stage 1 `InventoryTxnLine.Create` already accepts `salesOrderLineId`, `salesReturnLineId`, `purchaseOrderLineId`, `vendorReturnLineId`. Append an optional trailing `Guid? inventoryTxnLineId = null` parameter after `vendorReturnLineId = null` (`InventoryTxnLineId = inventoryTxnLineId ?? Guid.NewGuid()`).
   - Keep the existing 8-parameter Stage 1 `InventoryTxn.AddLine(...)` and `AddLine(InventoryTxnLine)` overloads 100% intact, and add a new `InventoryTxn.AddLine(...)` overload accepting `(Guid productId, Guid locationId, Guid batchId, Guid productUomId, decimal enteredQty, decimal conversionSnapshot, decimal quantityDeltaBase, decimal unitCostBase, Guid? salesOrderLineId, Guid? salesReturnLineId = null, Guid? inventoryTxnLineId = null)` forwarding to `InventoryTxnLine.Create(...)`.
10. **Extend `src/PharmacyERP.Domain/Entities/Identity/BranchEnrollment.cs` (Runtime Credential Persistence Support):**
   - Live Stage 1 `BranchEnrollment` only stores `TokenHash` (the 15-min one-time enrollment token hash), leaving `BranchService.RedeemEnrollmentAsync` with nowhere to persist the issued `runtime_credential` hash for `IBranchSyncAuthenticator`.
   - Add `private byte[]? _runtimeCredentialHash;`, nullable `public byte[]? RuntimeCredentialHash { get => _runtimeCredentialHash?.ToArray(); private set => _runtimeCredentialHash = value?.ToArray(); }` (defensive copy matching `TokenHash`), and nullable `public DateTimeOffset? RuntimeCredentialExpiresAt { get; private set; }`.
   - Extend `Redeem` to a backwards-compatible signature:
     `public void Redeem(DateTimeOffset now, byte[]? runtimeCredentialHash = null, DateTimeOffset? runtimeCredentialExpiresAt = null)`
     - Preserves all existing 1-arg Stage 1 callers (`enrollment.Redeem(now)`).
     - Enforces existing `UsedAt.HasValue || ExpiresAt <= now` guard (`EnrollmentTokenInvalidOrExpiredException`).
     - When `runtimeCredentialHash` is supplied: validates `runtimeCredentialHash.Length == 32` (`ArgumentException`), requires `runtimeCredentialExpiresAt.HasValue && runtimeCredentialExpiresAt.Value > now` (`ArgumentException`), and persists defensive copy + expiry.
11. **Update `GlobalUsings.cs`:** Add `global using PharmacyERP.Domain.Entities.Sales;` (sorted alphabetically) to `src/PharmacyERP.Domain/GlobalUsings.cs`, `src/PharmacyERP.Application/GlobalUsings.cs`, and `src/PharmacyERP.Infrastructure/GlobalUsings.cs`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Domain/Sales/SalesOrderAndInvoiceDomainTests.cs`:
  - Draft creation, line math (`MidpointRounding.AwayFromZero` for `quantity_base`, `net`, `tax`, `line_total`), replace-lines on `DRAFT`, rejection on `COMPLETED`/`CANCELLED`.
  - Invoice issuance total reconciliation, `ApplyRefund` (`PAID -> PARTIALLY_REFUNDED -> REFUNDED`), rejection when `refund > paid - refunded`.
  - Cash payment change calculation, rejection when `cash_tendered_amount < amount_due` or `amount_due <= 0`.
- `tests/PharmacyERP.UnitTests/Domain/Sales/SalesReturnAndRefundDomainTests.cs`:
  - Return creation with `RESTOCK`/`QUARANTINE`/`SCRAP`, self-approval rejection (`ApprovedByEmployeeId == ReceivedByEmployeeId`), empty `BatchId` rejection, non-positive `QuantityBase` rejection, `SalesRefund` amount validation.
  - `InventoryTxn.CreateDraft`/`CreatePosted` optional `inventoryTxnId`, `InventoryTxnLine.Create` optional `inventoryTxnLineId`, and `InventoryTxn.AddLine(...)` overload with `salesOrderLineId` / `salesReturnLineId` / `inventoryTxnLineId` preserve Stage 1 sign rules (`SALE_ISSUE < 0`, `SALES_RETURN_IN > 0`, `SCRAP_OUT < 0`).
  - `BranchEnrollment.Redeem(now, runtimeCredentialHash, expiry)`: persists defensive copy of 32-byte `RuntimeCredentialHash` & `RuntimeCredentialExpiresAt`, preserves 1-arg `Redeem(now)` compatibility, and rejects non-32-byte hashes or `expiry <= now`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** covering all 8 Sales entities, domain invariants, explicit-ID factory support for Branch-to-Cloud sync replay, and `BranchEnrollment` runtime credential hash persistence.

---

## Task `AH-03`: Stage 2 Sync Domain Entities (`SyncOutbox`, `SyncInbox`, `SyncBranchCursor`)

### 1. Task Header
- **Task ID:** `AH-03`
- **Title:** Stage 2 Sync Domain Entities (`SyncOutbox`, `SyncInbox`, `SyncBranchCursor`)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-hassan/ah-03-sync-domain-entities`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-01` merged into `stage2-dev` and pulled locally.
- [ ] `SyncOperationType`, `SyncProcessingStatus`, `SyncResultCode`, and `SyncDomainException` exist in `PharmacyERP.Domain`.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Create three persistence-ignorant entities under `src/PharmacyERP.Domain/Entities/Integration/` (`namespace PharmacyERP.Domain.Entities.Integration;`):

1. **`SyncOutbox.cs`** (`integration."SYNC_OUTBOX"`):
   - Properties: `Guid OperationId`, `Guid OrganizationId`, `Guid BranchId`, `SyncOperationType OperationType`, `Guid AggregateId`, `long BranchSequence`, `int PayloadVersion`, `string PayloadHash` (`char(64)` lowercase hex), `string Payload` (`jsonb`), `DateTimeOffset CreatedAt`, `DateTimeOffset? SyncedAt`, `int RetryCount`, `string? LastError` (max 500).
   - Factory `Create(...)`: validates non-empty GUIDs, `BranchSequence > 0`, `PayloadVersion > 0`, `PayloadHash.Length == 64`, non-empty `Payload`; sets `RetryCount = 0`, `SyncedAt = null`.
   - Methods: `MarkSynced(DateTimeOffset syncedAt)` (clears `LastError`, sets `SyncedAt`), `RecordRetryFailure(string error)` (increments `RetryCount`, truncates `LastError` to 500 chars; never discards the row per §8.9.2).
2. **`SyncInbox.cs`** (`integration."SYNC_INBOX"`):
   - Properties: `Guid OperationId`, `Guid OrganizationId`, `Guid BranchId`, `SyncProcessingStatus ProcessingStatus`, `DateTimeOffset ReceivedAt`, `long BranchSequence`, `int PayloadVersion`, `string PayloadHash` (`char(64)`), `string Payload` (`jsonb` NOT NULL), `SyncResultCode? ResultCode`.
   - Factory `CreateReceived(...)`: sets `ProcessingStatus = RECEIVED`, `ResultCode = null`, validates `BranchSequence > 0`, `PayloadVersion > 0`, `PayloadHash.Length == 64`, non-empty `Payload`.
   - Methods enforcing Blueprint §4.2 & §8.9.2 immutability:
     - `MarkApplied()`: sets `ProcessingStatus = APPLIED`; sets `ResultCode ??= SyncResultCode.APPLIED` (preserves first terminal `ResultCode` if previously `CONFLICT`).
     - `MarkConflict()`: sets `ProcessingStatus = CONFLICT`; sets `ResultCode ??= SyncResultCode.CONFLICT`.
     - `MarkFailed()`: sets `ProcessingStatus = FAILED`; sets `ResultCode ??= SyncResultCode.FAILED`.
     - `BeginAuthorizedRetry()`: allowed ONLY when `ProcessingStatus == SyncProcessingStatus.CONFLICT` (throws `SyncDomainException` otherwise); transitions `ProcessingStatus = SyncProcessingStatus.RECEIVED` while **leaving `ResultCode` untouched** (preserving first terminal outcome for audit).
3. **`SyncBranchCursor.cs`** (`integration."SYNC_BRANCH_CURSOR"`):
   - Properties: `Guid OrganizationId`, `Guid BranchId`, `long LastIssuedSequence`, `long LastAppliedSequence`, `string LastAppliedCloudCursor` (max 500, default `""`).
   - Factory `CreateInitial(Guid organizationId, Guid branchId)`: sets sequences to `0`, cursor to `""`.
   - Methods:
     - `AllocateNextIssuedSequence()` -> increments `LastIssuedSequence` by `1` and returns the new sequence.
     - `AdvanceAppliedSequence(long appliedSequence)`: validates `appliedSequence == LastAppliedSequence + 1` (throws `InvalidSyncSequenceException` on gap or regression).
     - `UpdateCloudCursor(string cloudCursor)`: validates non-null and length `<= 500`.
4. **Backwards-Compatible `AuditLog` Replay Support (`src/PharmacyERP.Domain/Entities/Integration/AuditLog.cs`):**
   - Append an optional trailing parameter `Guid? auditLogId = null` after `string? sourcePromptId = null` on the existing `AuditLog(...)` constructor (`AuditLogId = auditLogId ?? Guid.NewGuid();`) so Cloud Sync exact fact replay (`AH-09`) can persist branch-originated audit rows with their exact original `audit_log_id` (Blueprint §8.9.9 & §9.3) with zero impact on Stage 1 callers.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Domain/Integration/SyncEntitiesTests.cs`:
  - `SyncOutbox`: valid creation, invalid sequence/version/hash rejection, `MarkSynced` clears `LastError`, `RecordRetryFailure` truncates at 500 chars and increments `RetryCount`.
  - `SyncInbox`: `RECEIVED` starts with `ResultCode == null`; first terminal transition sets `ResultCode` permanently; `CONFLICT -> BeginAuthorizedRetry() -> RECEIVED -> MarkApplied()` transitions `ProcessingStatus` to `APPLIED` while `ResultCode` remains `CONFLICT`; calling `BeginAuthorizedRetry()` on `APPLIED` throws `SyncDomainException`.
  - `SyncBranchCursor`: `AllocateNextIssuedSequence` increments monotonically; `AdvanceAppliedSequence` accepts `n + 1` and rejects gaps (`n + 2`) or duplicates (`n`).

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** explaining `SyncOutbox`, `SyncInbox` (`processing_status` vs immutable `result_code`), and `SyncBranchCursor` ownership semantics.

---

## Task `AH-04`: EF Core Configurations (11 New + 3 Updated) & `PharmacyDbContext` Partials

### 1. Task Header
- **Task ID:** `AH-04`
- **Title:** EF Core Configurations (11 New + 3 Updated) & `PharmacyDbContext` Partials
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-hassan/ah-04-ef-configurations-and-dbcontext`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-02` and `AH-03` merged into `stage2-dev` and pulled locally.
- [ ] All 8 Sales entities and 3 Sync entities compile in `PharmacyERP.Domain`.
- [ ] `src/PharmacyERP.Infrastructure/Persistence/Database/PharmacyDbContext.cs` is untouched (Wave 0 invariant).

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Keep `PharmacyDbContext.cs` UNTOUCHED.** Create/update ONLY partial classes:
   - Create `src/PharmacyERP.Infrastructure/Persistence/Database/PharmacyDbContext.Sales.cs`:
     `DbSet<SalesOrder> SalesOrders`, `DbSet<SalesOrderLine> SalesOrderLines`, `DbSet<SalesInvoice> SalesInvoices`, `DbSet<SalesInvoiceLine> SalesInvoiceLines`, `DbSet<SalesPayment> SalesPayments`, `DbSet<SalesReturn> SalesReturns`, `DbSet<SalesReturnLine> SalesReturnLines`, `DbSet<SalesRefund> SalesRefunds`.
   - Update `src/PharmacyERP.Infrastructure/Persistence/Database/PharmacyDbContext.Integration.cs`:
     Add `DbSet<SyncOutbox> SyncOutboxes`, `DbSet<SyncInbox> SyncInboxes`, `DbSet<SyncBranchCursor> SyncBranchCursors`.
2. **Create 8 Sales Configurations** under `src/PharmacyERP.Infrastructure/Persistence/Configurations/Sales/` (explicit `snake_case`, `.ValueGeneratedNever()` on GUID PKs, `.HasConversion<string>()` on enums, `DeleteBehavior.Restrict` on every FK, Blueprint §6.3 precisions: quantities/unit-prices/unit-costs `numeric(18,4)`, monetary totals `numeric(18,2)`, conversions `numeric(18,6)`, tax rates `numeric(9,4)`):
   - **`SalesOrderConfiguration.cs`** -> `sales."SALES_ORDER"`:
     - PK `SalesOrderId` (`sales_order_id`); AKs `(OrganizationId, SalesOrderId)` and `(OrganizationId, BranchId, SalesOrderId)`.
     - Unique indexes: `(OrganizationId, BranchId, OrderNo)`, `(OrganizationId, BranchId, IdempotencyKey)`. Query index: `(OrganizationId, BranchId, OrderStatus, CreatedAt)`.
     - CHECKs: `channel IN ('POS')`, `order_status IN ('DRAFT', 'COMPLETED', 'CANCELLED')`.
     - FKs: `(OrganizationId, BranchId) -> Branch(OrganizationId, BranchId)`, `(OrganizationId, CreatedByEmployeeId) -> Employee(OrganizationId, EmployeeId)`.
   - **`SalesOrderLineConfiguration.cs`** -> `sales."SALES_ORDER_LINE"`:
     - PK `OrderLineId` (`order_line_id`); AK `(OrganizationId, OrderLineId, ProductId)` *(supports `INVENTORY_TXN_LINE` source FK)*.
     - CHECKs: `entered_qty > 0`, `conversion_snapshot > 0`, `quantity_base > 0`, `unit_price_snapshot >= 0`, `discount_amount >= 0`, `tax_rate_snapshot >= 0 AND tax_rate_snapshot <= 1`, `tax_amount_snapshot >= 0`, `line_total >= 0`.
     - FKs: `(OrganizationId, SalesOrderId) -> SalesOrder(OrganizationId, SalesOrderId)`, `(OrganizationId, ProductId) -> Product(OrganizationId, ProductId)`, `(OrganizationId, ProductId, ProductUomId) -> ProductUom(OrganizationId, ProductId, ProductUomId)`.
   - **`SalesInvoiceConfiguration.cs`** -> `sales."SALES_INVOICE"`:
     - PK `InvoiceId` (`invoice_id`); AKs `(OrganizationId, InvoiceId)` and `(OrganizationId, BranchId, InvoiceId)`.
     - Unique indexes: `(OrganizationId, BranchId, InvoiceNo)`, `(OrganizationId, SalesOrderId)`. Query indexes: `(OrganizationId, BranchId, IssuedAt, InvoiceId)` and `(OrganizationId, UpdatedAt, InvoiceId)` (Canonical feed).
     - CHECKs: `status IN ('ISSUED')`, `payment_status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')`, `subtotal >= 0 AND discount_total >= 0 AND tax_total >= 0 AND grand_total >= 0 AND paid_amount >= 0 AND refunded_amount >= 0 AND refunded_amount <= paid_amount`.
     - FKs: `(OrganizationId, BranchId, SalesOrderId) -> SalesOrder(OrganizationId, BranchId, SalesOrderId)`, `(OrganizationId, BranchId) -> Branch(OrganizationId, BranchId)`.
   - **`SalesInvoiceLineConfiguration.cs`** -> `sales."SALES_INVOICE_LINE"`:
     - PK `InvoiceLineId` (`invoice_line_id`); AK `(OrganizationId, InvoiceId, InvoiceLineId, ProductId)` *(supports `SALES_RETURN_LINE` FK)*.
     - Unique index: `(OrganizationId, SourceOrderLineId)`.
     - CHECKs: `entered_qty > 0`, `conversion_snapshot > 0`, `quantity_base > 0`, `unit_price_snapshot >= 0`, `discount_amount >= 0`, `tax_rate_snapshot >= 0 AND tax_rate_snapshot <= 1`, `tax_amount >= 0`, `net_amount >= 0`, `line_total = net_amount + tax_amount`, `unit_cost_snapshot >= 0`.
     - FKs: `(OrganizationId, InvoiceId) -> SalesInvoice(OrganizationId, InvoiceId)`, `(OrganizationId, SourceOrderLineId, ProductId) -> SalesOrderLine(OrganizationId, OrderLineId, ProductId)`, `(OrganizationId, ProductId, ProductUomId) -> ProductUom(OrganizationId, ProductId, ProductUomId)`.
   - **`SalesPaymentConfiguration.cs`** -> `sales."SALES_PAYMENT"`:
     - PK `PaymentId` (`payment_id`); AK `(OrganizationId, PaymentId)`.
     - Unique index: `(OrganizationId, BranchId, IdempotencyKey)`. Query index: `(OrganizationId, InvoiceId, PaidAt)`.
     - CHECKs: `method IN ('CASH')`, `amount_due > 0`, `cash_tendered_amount >= amount_due`, `change_amount = cash_tendered_amount - amount_due`.
     - FKs: `(OrganizationId, BranchId, InvoiceId) -> SalesInvoice(OrganizationId, BranchId, InvoiceId)`, `(OrganizationId, ReceivedByEmployeeId) -> Employee(OrganizationId, EmployeeId)`.
   - **`SalesReturnConfiguration.cs`** -> `sales."SALES_RETURN"`:
     - PK `ReturnId` (`return_id`); AKs `(OrganizationId, ReturnId, BranchId, InvoiceId)` and `(OrganizationId, BranchId, ReturnId)`.
     - Unique indexes: `(OrganizationId, BranchId, ReturnNo)`, `(OrganizationId, BranchId, IdempotencyKey)`. Query index: `(OrganizationId, BranchId, ReceivedAt, ReturnId)`.
     - CHECKs: `status IN ('DRAFT', 'POSTED', 'CANCELLED')`, `refund_status IN ('NOT_REFUNDED', 'PARTIALLY_REFUNDED', 'REFUNDED')`, `refund_amount >= 0`, `approved_by_employee_id IS NULL OR approved_by_employee_id <> received_by_employee_id`.
     - FKs: `(OrganizationId, BranchId, InvoiceId) -> SalesInvoice(OrganizationId, BranchId, InvoiceId)`, `(OrganizationId, ReceivedByEmployeeId) -> Employee(OrganizationId, EmployeeId)`, `(OrganizationId, ApprovedByEmployeeId) -> Employee(OrganizationId, EmployeeId)`.
   - **`SalesReturnLineConfiguration.cs`** -> `sales."SALES_RETURN_LINE"`:
     - PK `ReturnLineId` (`return_line_id`); AK `(OrganizationId, ReturnLineId, BranchId, ProductId, BatchId, DestinationLocationId)` *(supports exact `INVENTORY_TXN_LINE` source FK)*.
     - Query index: `(OrganizationId, InvoiceLineId, BatchId)`.
     - CHECKs: `disposition IN ('RESTOCK', 'QUARANTINE', 'SCRAP')`, `quantity_base > 0`, `refund_amount >= 0`.
     - FKs: `(OrganizationId, ReturnId, BranchId, InvoiceId) -> SalesReturn(OrganizationId, ReturnId, BranchId, InvoiceId)`, `(OrganizationId, InvoiceId, InvoiceLineId, ProductId) -> SalesInvoiceLine(OrganizationId, InvoiceId, InvoiceLineId, ProductId)`, `(OrganizationId, ProductId, BatchId) -> InventoryBatch(OrganizationId, ProductId, BatchId)`, `(OrganizationId, BranchId, DestinationLocationId) -> InventoryLocation(OrganizationId, BranchId, LocationId)`.
   - **`SalesRefundConfiguration.cs`** -> `sales."SALES_REFUND"`:
     - PK `RefundId` (`refund_id`); AK `(OrganizationId, RefundId)`.
     - Unique index: `(OrganizationId, BranchId, IdempotencyKey)`. Query index: `(OrganizationId, SalesReturnId)`.
     - CHECKs: `method IN ('CASH')`, `amount > 0`.
     - FKs: `(OrganizationId, SalesReturnId, BranchId, InvoiceId) -> SalesReturn(OrganizationId, ReturnId, BranchId, InvoiceId)`, `(OrganizationId, ProcessedByEmployeeId) -> Employee(OrganizationId, EmployeeId)`.
3. **Create 3 Sync Configurations** under `src/PharmacyERP.Infrastructure/Persistence/Configurations/Integration/`:
   - **`SyncOutboxConfiguration.cs`** -> `integration."SYNC_OUTBOX"`: PK `OperationId`, UK `(OrganizationId, BranchId, BranchSequence)`, partial pending index `(OrganizationId, BranchId, BranchSequence) WHERE synced_at IS NULL`, `payload jsonb`, `payload_hash char(64)`, `last_error varchar(500)`, CHECKs on `operation_type` (6 closed values), `branch_sequence > 0`, `payload_version > 0`, `retry_count >= 0`, FK `(OrganizationId, BranchId) -> Branch`.
   - **`SyncInboxConfiguration.cs`** -> `integration."SYNC_INBOX"`: PK `OperationId`, UK `(OrganizationId, BranchId, BranchSequence)`, `payload jsonb NOT NULL`, `payload_hash char(64)`, CHECKs on `processing_status IN ('RECEIVED','APPLIED','CONFLICT','FAILED')`, `result_code IS NULL OR result_code IN ('APPLIED','CONFLICT','FAILED')`, `branch_sequence > 0`, `payload_version > 0`, FK `(OrganizationId, BranchId) -> Branch`.
   - **`SyncBranchCursorConfiguration.cs`** -> `integration."SYNC_BRANCH_CURSOR"`: Composite PK `(OrganizationId, BranchId)`, `last_issued_sequence bigint DEFAULT 0`, `last_applied_sequence bigint DEFAULT 0`, `last_applied_cloud_cursor varchar(500) DEFAULT ''`, CHECKs `last_issued_sequence >= 0 AND last_applied_sequence >= 0`, FK `(OrganizationId, BranchId) -> Branch`.
4. **Update 3 Stage 1 Configurations (`InventoryTxnConfiguration.cs`, `InventoryTxnLineConfiguration.cs`, `BranchEnrollmentConfiguration.cs`):**
   - `InventoryTxnConfiguration.cs`:
     - Add composite FKs: `(OrganizationId, BranchId, SalesOrderId) -> SalesOrder(OrganizationId, BranchId, SalesOrderId)` and `(OrganizationId, BranchId, SalesReturnId) -> SalesReturn(OrganizationId, BranchId, ReturnId)`.
     - Add 3 partial unique indexes: `(OrganizationId, SalesOrderId) WHERE transaction_type = 'SALE_ISSUE' AND sales_order_id IS NOT NULL`; `(OrganizationId, SalesReturnId) WHERE transaction_type = 'SALES_RETURN_IN' AND sales_return_id IS NOT NULL`; `(OrganizationId, SalesReturnId) WHERE transaction_type = 'SCRAP_OUT' AND sales_return_id IS NOT NULL`.
     - Add `CK_INVENTORY_TXN_source_links`: ensures `SALE_ISSUE` sets only `sales_order_id`; `SALES_RETURN_IN`/`SCRAP_OUT` set only `sales_return_id`; `OPENING_BALANCE`/`ADJUSTMENT_IN`/`ADJUSTMENT_OUT`/`REVERSAL` leave all four source FKs NULL; `PURCHASE_RECEIPT` sets only `purchase_order_id`; `VENDOR_RETURN_OUT` sets only `vendor_return_id`.
   - `InventoryTxnLineConfiguration.cs`:
     - Add composite FKs: `(OrganizationId, SalesOrderLineId, ProductId) -> SalesOrderLine(OrganizationId, OrderLineId, ProductId)` and `(OrganizationId, SalesReturnLineId, BranchId, ProductId, BatchId, LocationId) -> SalesReturnLine(OrganizationId, ReturnLineId, BranchId, ProductId, BatchId, DestinationLocationId)`.
     - Add `CK_INVENTORY_TXN_LINE_single_source_line`: at most one of `sales_order_line_id`, `sales_return_line_id`, `purchase_order_line_id`, `vendor_return_line_id` is non-null.
   - `src/PharmacyERP.Infrastructure/Persistence/Configurations/Identity/BranchEnrollmentConfiguration.cs`:
     - Map nullable `RuntimeCredentialHash` -> `.HasColumnName("runtime_credential_hash").HasColumnType("bytea")` with unique partial index `builder.HasIndex(x => x.RuntimeCredentialHash).IsUnique().HasFilter("runtime_credential_hash IS NOT NULL");`.
     - Map nullable `RuntimeCredentialExpiresAt` -> `.HasColumnName("runtime_credential_expires_at").HasColumnType("timestamptz")`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Infrastructure/SalesAndSyncModelConfigurationTests.cs`:
  - Inspect EF Core `IModel` for all 11 new + 3 updated entities: verify exact schemas/table names, decimal column types (`numeric(18,4)`, `numeric(18,2)`, `numeric(18,6)`, `numeric(9,4)`), `DeleteBehavior.Restrict` on every FK, exact composite alternate keys & composite FKs, partial unique index filters (including `BRANCH_ENROLLMENT` `runtime_credential_hash IS NOT NULL`), CHECK constraints, and dynamic `OrganizationId` query filter on all 11 new entities.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** detailing the 11 new configurations, the 3 extended Stage 1 configurations (`InventoryTxn`, `InventoryTxnLine`, `BranchEnrollment`), and how composite keys prevent cross-tenant/cross-branch/cross-product mismatches at the database layer.

---

## Task `AH-05`: PostgreSQL RLS, Immutability & Deferred Triggers, Grants & Stage 2 Migration

### 1. Task Header
- **Task ID:** `AH-05`
- **Title:** PostgreSQL RLS, Immutability & Deferred Triggers, Grants & Single Cumulative Stage 2 Migration
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-hassan/ah-05-stage2-migration-and-security`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-04` merged into `stage2-dev` and pulled locally.
- [ ] All 11 new + 3 updated EF configurations compile and `SalesAndSyncModelConfigurationTests` pass.
- [ ] Local PostgreSQL accessible via `erp_migrator` (`ERP_MIGRATOR_CONNECTION`) and `ERP_IT_POSTGRES`.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Update `src/PharmacyERP.Infrastructure/Persistence/Triggers/RlsAndAuditProtectionSql.cs`:**
   - Add all 11 Stage 2 tables (`8` in `sales`, `3` in `integration`: `SYNC_OUTBOX`, `SYNC_INBOX`, `SYNC_BRANCH_CURSOR`) to `TenantBoundTables` (`31` total).
   - Add `GenerateStage2RlsSql()` helper generating `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and `tenant_isolation_policy` (`USING` + `WITH CHECK` checking `app.system_bypass` or `organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid`) for the 11 new tables.
2. **Update `src/PharmacyERP.Infrastructure/Persistence/Security/DatabaseRoleSecuritySql.cs` & `provision_db_roles.sql`:**
   - Add `'sales'` to `TableRlsStatusCheckSql` (`WHERE n.nspname IN ('identity', 'catalog', 'inventory', 'integration', 'sales')`).
   - Add `CREATE SCHEMA IF NOT EXISTS sales AUTHORIZATION erp_migrator;`, `GRANT USAGE ON SCHEMA sales TO erp_app;`, and `ALTER DEFAULT PRIVILEGES FOR ROLE erp_migrator IN SCHEMA sales GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app;` to both `GenerateRoleProvisioningTemplateSql()` and `provision_db_roles.sql`.
   - In `GenerateAppRoleGrantsSql()`: grant `USAGE` + `SELECT, INSERT, UPDATE, DELETE` on `ALL TABLES IN SCHEMA sales`, AND explicitly add `integration."SYNC_OUTBOX"`, `integration."SYNC_INBOX"`, `integration."SYNC_BRANCH_CURSOR"` to the `integration` grant list (keeping `integration."AUDIT_LOG"` restricted to `SELECT, INSERT` only!).
3. **Create `src/PharmacyERP.Infrastructure/Persistence/Triggers/SalesImmutabilityAndSourceConstraintSql.cs`:**
   - **Immutability Triggers:**
     - `sales.fn_prevent_sales_invoice_mutation()` (`BEFORE UPDATE OR DELETE` on `sales."SALES_INVOICE"`): reject `DELETE`; on `UPDATE`, reject any modification to immutable columns (`invoice_id`, `organization_id`, `branch_id`, `sales_order_id`, `invoice_no`, `status`, `currency_code`, `subtotal`, `discount_total`, `tax_total`, `grand_total`, `issued_at`, `created_at`), allowing updates ONLY to settlement projection columns (`paid_amount`, `refunded_amount`, `payment_status`, `updated_at`).
     - `sales.fn_prevent_immutable_sales_record_mutation()` (`BEFORE UPDATE OR DELETE` on `sales."SALES_INVOICE_LINE"`, `sales."SALES_PAYMENT"`, `sales."SALES_REFUND"`): unconditionally raise exception.
     - `sales.fn_prevent_posted_sales_return_mutation()` (`BEFORE UPDATE OR DELETE` on `sales."SALES_RETURN"` and `sales."SALES_RETURN_LINE"`): reject any `UPDATE`/`DELETE` when return `status = 'POSTED'`.
     - `integration.fn_prevent_sync_inbox_result_code_mutation()` (`BEFORE UPDATE` on `integration."SYNC_INBOX"`): reject if `OLD.result_code IS NOT NULL AND NEW.result_code IS DISTINCT FROM OLD.result_code`.
   - **Deferred Source-Line Ownership Constraint Trigger (`DEFERRABLE INITIALLY DEFERRED`):**
     - `inventory.fn_verify_txn_line_source_ownership()` attached via `CREATE CONSTRAINT TRIGGER trg_verify_txn_line_source_ownership AFTER INSERT OR UPDATE ON inventory."INVENTORY_TXN_LINE" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW`:
       - When `NEW.sales_order_line_id IS NOT NULL`: verify parent `INVENTORY_TXN` has `transaction_type = 'SALE_ISSUE'` and `sales_order_id = (SELECT sales_order_id FROM sales."SALES_ORDER_LINE" WHERE organization_id = NEW.organization_id AND order_line_id = NEW.sales_order_line_id)`.
       - When `NEW.sales_return_line_id IS NOT NULL`: verify parent `INVENTORY_TXN` has `transaction_type IN ('SALES_RETURN_IN', 'SCRAP_OUT')` and `sales_return_id = (SELECT return_id FROM sales."SALES_RETURN_LINE" WHERE organization_id = NEW.organization_id AND return_line_id = NEW.sales_return_line_id)`.
       - Raise clear PostgreSQL exception on mismatch.
4. **Generate Single Cumulative Stage 2 EF Core Migration:**
   ```powershell
   dotnet ef migrations add Stage2SalesAndOfflineSync `
     --project src/PharmacyERP.Infrastructure/PharmacyERP.Infrastructure.csproj `
     --startup-project src/PharmacyERP.Api/PharmacyERP.Api.csproj `
     --output-dir Persistence/Migrations
   ```
   - Verify the generated migration captures all 11 new tables, the `INVENTORY_TXN`/`INVENTORY_TXN_LINE` Sales FKs/partial unique indexes/CHECK constraints, AND the additive nullable `runtime_credential_hash bytea` (unique partial index `WHERE runtime_credential_hash IS NOT NULL`) & `runtime_credential_expires_at timestamptz` columns on `identity."BRANCH_ENROLLMENT"`.
   - In the generated migration's `Up(MigrationBuilder migrationBuilder)` (after table creation):
     1. `migrationBuilder.Sql(RlsAndAuditProtectionSql.GenerateStage2RlsSql());`
     2. `migrationBuilder.Sql(SalesImmutabilityAndSourceConstraintSql.CreateFunctionsAndTriggersSql);`
     3. `migrationBuilder.Sql(DatabaseRoleSecuritySql.GenerateAppRoleGrantsSql());`
   - In `Down(...)`: drop Stage 2 triggers/functions cleanly before dropping tables.
5. **Update `tests/PharmacyERP.IntegrationTests/CustomWebApplicationFactory.cs` (`ThrowawayPostgresDatabaseProvisioner`):**
   - Execute `SalesImmutabilityAndSourceConstraintSql.CreateFunctionsAndTriggersSql` alongside `RlsAndAuditProtectionSql.GenerateCompleteStage1SecuritySql(db.Model)` and `InventoryLedgerImmutabilitySql.CreateFunctionAndTriggerSql`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.IntegrationTests/Persistence/Stage2MigrationRlsAndTriggersTests.cs` (`[SkipWhenPostgresUnavailableFact]`):
  - Apply full ordered migration chain (`Stage1InitialSchemaAndSecurity` -> `AddUserSecurityStamp` -> `Stage2SalesAndOfflineSync`) onto an empty throwaway PostgreSQL DB as `erp_migrator`, then verify `DatabaseSecurityStartupCheck` passes as `erp_app` across all **31/31** tables.
  - Cross-tenant RLS test: Tenant B connected as `erp_it_app` cannot read/update/delete Tenant A rows in `SALES_ORDER`, `SALES_INVOICE`, `SALES_RETURN`, `SYNC_OUTBOX`, `SYNC_INBOX`, `SYNC_BRANCH_CURSOR`.
  - Composite FK rejection test: inserting `SALES_RETURN_LINE` referencing an `invoice_line_id` from a different `invoice_id` or `product_id` fails at PostgreSQL FK level.
  - Deferred constraint trigger test: inserting an `INVENTORY_TXN_LINE` whose `sales_order_line_id` belongs to Order B under an `INVENTORY_TXN` linked to Order A fails on `COMMIT`.
  - Immutability trigger tests: `UPDATE` on `SALES_INVOICE.grand_total` or `DELETE` fails; `UPDATE` on `SALES_INVOICE.refunded_amount` & `payment_status` succeeds; `UPDATE`/`DELETE` on `SALES_INVOICE_LINE`, `SALES_PAYMENT`, `SALES_REFUND`, posted `SALES_RETURN` fails; mutating non-null `SYNC_INBOX.result_code` fails.

### 5. Verification & Arabic Explanation Gate
- Apply migration locally via `dotnet ef database update` (`erp_migrator`).
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing the migration, `31/31` RLS enforcement, least-privilege `erp_app` grants, immutability triggers, and deferred source-line constraint triggers.

---

## Task `AH-06`: Zero-Conflict Scaffolding, `RuntimeModeGuardMiddleware`, Authz Policies, Stage 2 Scopes & `CanonicalReader` Validation

### 1. Task Header
- **Task ID:** `AH-06`
- **Title:** Zero-Conflict Scaffolding (4 Modular DIs, Partial Controller Shells), Runtime Mode Guard, Authz Policies, Stage 2 JWT Scopes & `CanonicalReader` Validation
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-hassan/ah-06-zero-conflict-scaffolding`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-05` merged into `stage2-dev` and pulled locally.
- [ ] Stage 2 migration applies cleanly and `ErrorCode.SYNC_CURSOR_EXPIRED` exists.
- [ ] `src/PharmacyERP.Api/Program.cs` is untouched.
- [ ] Live Stage 1 `RuntimeModeGuardMiddleware.cs`, `AuthorizationPoliciesExtensions.cs`, `Api/DependencyInjection.cs`, `CurrentUser.cs`, `JwtTokenGenerator.cs`, and `AuthService.cs` exist.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Create 4 Modular DI Extension File Pairs** (using namespace `PharmacyERP.Application.Extensions` and `PharmacyERP.Infrastructure.Extensions` to avoid any `CS0101` collision with `PharmacyERP.Application.DependencyInjection` / `PharmacyERP.Infrastructure.DependencyInjection`):
   - `src/PharmacyERP.Application/Extensions/`:
     - `SalesDraftDependencyInjection.cs` (`AddSalesDraftApplicationServices`)
     - `SalesCheckoutAndReturnsDependencyInjection.cs` (`AddSalesCheckoutAndReturnsApplicationServices`)
     - `SyncDependencyInjection.cs` (`AddSyncApplicationServices`)
     - `CanonicalStage2DependencyInjection.cs` (`AddCanonicalStage2ApplicationServices`)
   - `src/PharmacyERP.Infrastructure/Extensions/`:
     - `SalesDraftDependencyInjection.cs` (`AddSalesDraftInfrastructureServices`)
     - `SalesCheckoutAndReturnsDependencyInjection.cs` (`AddSalesCheckoutAndReturnsInfrastructureServices`)
     - `SyncDependencyInjection.cs` (`AddSyncInfrastructureServices(this IServiceCollection services, IConfiguration configuration)`)
     - `CanonicalStage2DependencyInjection.cs` (`AddCanonicalStage2InfrastructureServices`)
   - Wire all 4 calls **once** inside `src/PharmacyERP.Application/DependencyInjection.cs` and `src/PharmacyERP.Infrastructure/DependencyInjection.cs`.
2. **Create 2 Minimal Partial Controller Shells** under `src/PharmacyERP.Api/Controllers/`:
   - `SalesOrdersController.cs`:
     ```csharp
     namespace PharmacyERP.Api.Controllers;

     [ApiController]
     [Route("api/v1/sales-orders")]
     [Authorize]
     public partial class SalesOrdersController : ControllerBase
     {
     }
     ```
   - `SalesReturnsController.cs`:
     ```csharp
     namespace PharmacyERP.Api.Controllers;

     [ApiController]
     [Route("api/v1/sales-returns")]
     [Authorize]
     public partial class SalesReturnsController : ControllerBase
     {
     }
     ```
   *(Zero constructor fields — teammates inject their own services + `ICurrentUser` via `[FromServices]` in their separate partial files.)*
3. **Update `src/PharmacyERP.Api/Middleware/RuntimeModeGuardMiddleware.cs` (Match Live Stage 1 Exactly):**
   - In `IsBranchLocalOnlyMutation(string path, string method)` (returns `404 NOT_FOUND` on `ErpRuntimeMode.Cloud` for non-GET/HEAD/OPTIONS):
     - Preserve live Stage 1 `path.StartsWith("/api/v1/inventory/adjustments", StringComparison.OrdinalIgnoreCase)`.
     - Add `path.StartsWith("/api/v1/sales-orders", StringComparison.OrdinalIgnoreCase)` and `path.StartsWith("/api/v1/sales-returns", StringComparison.OrdinalIgnoreCase)`.
     - *(Read `GET` requests on `/api/v1/sales-orders`, `/api/v1/sales-invoices`, `/api/v1/sales-returns` remain allowed on BOTH `Cloud` and `BranchLocal`.)*
   - In `IsCloudOnlyEndpoint(string path, string method)` (returns `404 NOT_FOUND` on `ErpRuntimeMode.BranchLocal`):
     - Preserve **all** live Stage 1 Cloud-only guards: `/api/v1/organizations`, `/api/v1/canonical/` (except `/api/v1/canonical/capabilities`), `/api/v1/branch-enrollment`, plus non-GET/HEAD/OPTIONS writes on `/api/v1/product-categories`, `/api/v1/products`, `*/reorder-rule`, `/api/v1/branches`, `/api/v1/users`, and `/api/v1/employees`.
     - Add `path.StartsWith("/api/v1/sync", StringComparison.OrdinalIgnoreCase)` (blocks ALL verbs on `/api/v1/sync/*` in `BranchLocal` mode).
4. **Update `src/PharmacyERP.Api/Auth/AuthorizationPoliciesExtensions.cs` (with Shared Claim-Extraction Helper):**
   - Preserve existing `AdminOnly`, `OrgAdminOnly`, `PlatformProvisionerOnly`.
   - Create a shared claim-extraction helper (e.g., `JwtClaimValueExtractor.ExtractClaimValues` / `ExtractScopes` — identical to `CurrentUser.ExtractClaimValues`, supporting BOTH unpacked individual claims from `JwtBearer` AND raw JSON-array claim strings `["..."]` as well as space/comma-delimited strings, instead of brittle `c.Value.Split(' ')`) and reuse it in BOTH `AuthorizationPoliciesExtensions.cs` (`SyncAdminOnly`) and `Api/DependencyInjection.cs` (`OnTokenValidated` `CanonicalReader` validation).
   - Add all 5 Stage 2 named policies matching Blueprint §8.5, §9.1 & `API-DIFF-012`:
     - `PosCashierOrAdmin`: `RequireAuthenticatedUser().RequireRole("Cashier", "Admin")`
     - `SalesReadAccess`: `RequireAuthenticatedUser().RequireRole("Admin", "Pharmacist", "Cashier")`
     - `SalesReturnWriteAccess`: `RequireAuthenticatedUser().RequireRole("Cashier", "Pharmacist", "Admin")`
     - `SyncAdminOnly`: `RequireAuthenticatedUser().RequireRole("Admin").RequireAssertion(ctx => JwtClaimValueExtractor.ExtractScopes(ctx.User).Contains("sync:retry", StringComparer.Ordinal))` *(reads `"scopes"`, `"scope"`, and `"scp"` via the shared helper supporting both unpacked claims and JSON-array strings)*
     - `CanonicalRead`: `RequireAuthenticatedUser().RequireRole("Admin", "Pharmacist", "CanonicalReader")` *(permits human `Admin`/`Pharmacist` users and short-lived `.NET`-issued read-only `CanonicalReader` service tokens across all 5 canonical read feeds while denying `CanonicalReader` on canonical configuration writes)*.
5. **Update `src/PharmacyERP.Api/DependencyInjection.cs` (`JwtBearerEvents.OnTokenValidated` — `.NET` `CanonicalReader` Service Token Exemption, `API-DIFF-012`):**
   - Preserve existing `PlatformProvisioner` exemption (not a tenant `USER_ACCOUNT` principal).
   - Add strict recognition for `.NET`-issued short-lived read-only `CanonicalReader` service tokens (not backed by a `USER_ACCOUNT` row or `security_stamp`), using the **same shared `JwtClaimValueExtractor`** (supporting both unpacked claims and JSON-array strings for `roles`, `scopes`/`scope`/`scp`, and `branch_ids`):
     - `token_type` claim equals `"service"` (`StringComparison.Ordinal`).
     - Extracted `roles` claims contain ONLY `"CanonicalReader"` (reject if any human/admin role such as `Admin`, `Pharmacist`, `Cashier`, or `PlatformProvisioner` is present).
     - `organization_id` is a valid non-empty `Guid`.
     - `branch_scope` is `"ALL"` or `"ASSIGNED"` (and if `"ASSIGNED"`, at least one valid GUID exists in extracted `branch_ids`).
     - Extracted `scopes` contain `"canonical:read"` and contain **no** write/admin scopes (`user:admin`, `inventory:write`, `sales:write`, `return:write`, `sync:retry`, `canonical:write`).
     - Lifetime bounded: valid `iat` and `exp` numeric claims with `exp > iat` and `(exp - iat) <= 3600` seconds (max 1 hour).
   - When all checks pass, return early to bypass `IUserSecurityStampValidator` (just like `PlatformProvisioner`); if `token_type == "service"` or role `"CanonicalReader"` fails any invariant above, call `context.Fail(...)` immediately.
6. **Update `src/PharmacyERP.Infrastructure/Services/Context/CurrentUser.cs`:**
   - In `CanAccessBranch(Guid branchId)`, permit `BranchScope == "ALL"` bypass for **`Admin` OR `CanonicalReader`**:
     ```csharp
     if (string.Equals(BranchScope, "ALL", StringComparison.OrdinalIgnoreCase) &&
         (string.Equals(Role, "Admin", StringComparison.OrdinalIgnoreCase) ||
          string.Equals(Role, "CanonicalReader", StringComparison.OrdinalIgnoreCase)))
     {
         return true;
     }
     ```
7. **Emit Stage 2 Blueprint §8.5 Scopes in `src/PharmacyERP.Infrastructure/Auth/JwtTokenGenerator.cs` & `src/PharmacyERP.Application/Features/Identity/Services/Implementations/AuthService.cs`:**
   - Update both `JwtTokenGenerator.GetScopes(...)` and `AuthService.ScopeNames(...)` in lockstep (passing `user.Role`, `effectiveBranchScope` / `user.BranchScope`, and `_runtimeMode.CurrentMode`) so JWT `scopes` and `LoginResponse.User.Scopes` stay 100% identical:
     - `UserRole.Admin`: `"user:admin"`, `"inventory:read"`, `"inventory:write"`, `"sales:read"`, `"sales:write"`, `"return:read"`, `"return:write"`, plus **`"sync:retry"`** ONLY when `user.BranchScope == BranchScope.ALL` AND `_runtimeMode.CurrentMode == ErpRuntimeMode.Cloud` (note: in `BranchLocal`, `effectiveBranchScope` is already forced to `ASSIGNED` and `/api/v1/sync/*` is Cloud-only, so `sync:retry` is never emitted on `BranchLocal`).
     - `UserRole.Pharmacist`: `"inventory:read"`, `"inventory:write"`, `"sales:read"`, `"return:read"`, `"return:write"`.
     - `UserRole.Cashier`: `"inventory:read"`, `"sales:read"`, `"sales:write"`, `"return:read"`, `"return:write"`.
   - Update affected Stage 1 scope assertions in `JwtAndPasswordSecurityTests`, `Stage1ContractFixesUnitTests`, and `Stage1FrontendContractFixesTests` so all Stage 1 + Stage 2 tests stay 100% green.
8. **Update `src/PharmacyERP.Api/Common/ApiResultMapper.cs` & `src/PharmacyERP.Api/Middleware/ExceptionHandlingMiddleware.cs`:**
   - Map `ErrorCode.SYNC_CURSOR_EXPIRED` -> `409` in `ApiResultMapper.MapStatusCode(ErrorCode code)`.
   - Add `ErrorCode.SYNC_CURSOR_EXPIRED => HttpStatusCode.Conflict` to `ExceptionHandlingMiddleware.MapErrorCodeToHttpStatus(ErrorCode code)` so any thrown `AppException(ErrorCode.SYNC_CURSOR_EXPIRED, ...)` maps to `409 Conflict` instead of falling through to `500 InternalServerError`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/API/Middleware/Stage2RuntimeModeGuardAndAuthzTests.cs`:
  - `Cloud` mode returns `404 NOT_FOUND` (`ApiErrorEnvelopeDto`) for `POST /api/v1/sales-orders`, `PUT /api/v1/sales-orders/{id}/lines`, `POST /api/v1/sales-orders/{id}/complete`, `POST /api/v1/sales-orders/{id}/cancel`, `POST /api/v1/sales-returns`, and `POST /api/v1/inventory/adjustments`; allows `GET /api/v1/sales-orders`, `GET /api/v1/sales-invoices`, `GET /api/v1/sales-returns`, and all `/api/v1/sync/*`.
  - `BranchLocal` mode returns `404 NOT_FOUND` for `POST /api/v1/sync/operations`, `POST /api/v1/sync/operations/{id}/retry`, `GET /api/v1/sync/bootstrap`, `GET /api/v1/sync/changes`, `GET /api/v1/canonical/sales`, `/orders`, `/returns`, `/api/v1/branch-enrollment`, and writes on `/branches`/`/users`/`/employees`/`/products`; allows `GET /api/v1/canonical/capabilities` and all `/api/v1/sales-*` verbs.
  - Both `ApiResultMapper.MapStatusCode` AND `ExceptionHandlingMiddleware` (`AppException(ErrorCode.SYNC_CURSOR_EXPIRED, ...)`) map `ErrorCode.SYNC_CURSOR_EXPIRED` to HTTP `409 Conflict`.
  - `SyncAdminOnly` allows `Admin` with `sync:retry` scope (verified for BOTH unpacked individual `scopes` claims AND JSON-array claim strings `["user:admin","sync:retry"]`) and rejects `Admin` without `sync:retry` and `Pharmacist`/`Cashier`.
  - `CanonicalRead` allows `Admin`, `Pharmacist`, and `CanonicalReader`, and rejects `Cashier`.
  - `JwtBearerEvents.OnTokenValidated` accepts valid `.NET` `CanonicalReader` service tokens (both unpacked claims and JSON-array strings for `roles`/`scopes`/`branch_ids`, `token_type: "service"`, `roles: ["CanonicalReader"]`, `scopes: ["canonical:read"]`, `exp - iat <= 3600`, valid `organization_id`) without calling `IUserSecurityStampValidator`, and rejects service tokens with write scopes, mixed roles, missing `organization_id`, or `exp - iat > 3600`.
  - `CurrentUser.CanAccessBranch` permits `CanonicalReader` with `branch_scope == "ALL"` and restricts `CanonicalReader` with `branch_scope == "ASSIGNED"` to `AuthorizedBranchIds`.
  - `JwtTokenGenerator` and `AuthService` emit `return:read`, `return:write` for all 3 roles and `sync:retry` exclusively for `Admin` + `BranchScope.ALL` on `Cloud` (and omit `sync:retry` on `BranchLocal` or `ASSIGNED` Admin).

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** noting that Wave 1 scaffolding is ready to unblock `Yassin` and `Ahmed Salah`, and explaining the live `Cloud`/`BranchLocal` guard, Stage 2 JWT scopes, `SyncAdminOnly`, `CanonicalRead`, and `.NET` `CanonicalReader` service-token validation.

---

## Task `AH-07`: `ISyncOutboxWriter`, `IAuditLogger.LogWithIdAsync`, `SyncPayloads.cs` & Stage 1 Adjustment Hook

### 1. Task Header
- **Task ID:** `AH-07`
- **Title:** `ISyncOutboxWriter`, `IAuditLogger.LogWithIdAsync`, `SyncPayloads.cs` & Wiring `POST_INVENTORY_ADJUSTMENT` into `InventoryAdjustmentService`
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-hassan/ah-07-sync-outbox-writer`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-06` merged into `stage2-dev` and pulled locally.
- [ ] `SyncOutbox`, `SyncBranchCursor`, and `SyncDependencyInjection.cs` exist.
- [ ] `src/PharmacyERP.Application/Common/Interfaces/Integration/IAuditLogger.cs`, `src/PharmacyERP.Application/Features/Integration/Services/Implementations/AuditLogger.cs`, `src/PharmacyERP.Application/Features/Inventory/Services/Implementations/InventoryAdjustmentService.cs`, and `src/PharmacyERP.Application/Common/Utilities/CanonicalJsonHasher.cs` exist.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Add Non-Breaking `LogWithIdAsync` to `IAuditLogger` & `AuditLogger` (Captures Exact `AuditLogId` for Sync Replay):**
   - Live Stage 1 `IAuditLogger.LogAsync(...)` returns `Task` and generates `AuditLogId = Guid.NewGuid()` internally inside `AuditLogger.cs`, which prevents `InventoryAdjustmentService`, `SalesCheckoutService`, and `SalesReturnService` from capturing the exact persisted `audit_log_id` for `SyncAuditFactDto`.
   - In `src/PharmacyERP.Application/Common/Interfaces/Integration/IAuditLogger.cs`: keep the existing `Task LogAsync(...)` signature **100% untouched** (preserving all 590 Stage 1 unit tests and Moq setups!) and add a second method:
     ```csharp
     Task<Guid> LogWithIdAsync(
         string action,
         string entitySchema,
         string entityName,
         Guid entityId,
         object? beforeData,
         object? afterData,
         Guid? branchId = null,
         AuditActorType? actorTypeOverride = null,
         string? sourcePromptId = null,
         CancellationToken ct = default);
     ```
   - In `src/PharmacyERP.Application/Features/Integration/Services/Implementations/AuditLogger.cs`: implement `LogWithIdAsync(...)` persisting `AuditLog` via `_repository.AddAsync(logEntry, ct)` and returning `logEntry.AuditLogId`; have `LogAsync(...)` delegate cleanly to `LogWithIdAsync(...)` (discarding the returned `Guid`).
2. **Create `ISyncBranchCursorRepository`** (`src/PharmacyERP.Application/Features/Sync/Repositories/Interfaces/ISyncBranchCursorRepository.cs`):
   - `Task<SyncBranchCursor> GetOrCreateForUpdateAsync(Guid organizationId, Guid branchId, CancellationToken ct = default);`
   - `Task<SyncBranchCursor?> GetByBranchAsync(Guid organizationId, Guid branchId, CancellationToken ct = default);`
3. **Implement `SyncBranchCursorRepository`** (`src/PharmacyERP.Infrastructure/Persistence/Repositories/Integration/SyncBranchCursorRepository.cs`):
   - Relational PostgreSQL path: `INSERT INTO integration."SYNC_BRANCH_CURSOR" (organization_id, branch_id, last_issued_sequence, last_applied_sequence, last_applied_cloud_cursor) VALUES ({orgId}, {branchId}, 0, 0, '') ON CONFLICT (organization_id, branch_id) DO NOTHING;` followed by `SELECT * FROM integration."SYNC_BRANCH_CURSOR" WHERE organization_id = {orgId} AND branch_id = {branchId} FOR UPDATE` (`.IgnoreQueryFilters()`), guaranteeing rollback leaves zero sequence gaps (Blueprint §4.2).
   - Non-relational fallback for unit tests.
4. **Create `ISyncOutboxWriter`** (`src/PharmacyERP.Application/Common/Interfaces/Integration/ISyncOutboxWriter.cs`):
   ```csharp
   public sealed record SyncAuditFactDto(
       Guid AuditLogId,
       Guid? ActorUserId,
       Guid? ActorEmployeeId,
       AuditActorType ActorType,
       string Action,
       string EntitySchema,
       string EntityName,
       Guid EntityId,
       string? SourcePromptId,
       string TraceId,
       DateTimeOffset CreatedAt,
       string? BeforeData = null,
       string? AfterData = null);

   public interface ISyncOutboxWriter
   {
       /// <summary>
       /// On BranchLocal, allocates the next row-locked branch_sequence, computes the pinned
       /// CanonicalJsonHasher SHA-256 hash over the typed payload, and queues a SYNC_OUTBOX row
       /// inside the caller's active transaction. No-op on Cloud runtime.
       /// </summary>
       Task<Guid?> EnqueueAsync<TPayload>(
           Guid branchId,
           SyncOperationType operationType,
           Guid aggregateId,
           TPayload typedPayload,
           int payloadVersion = 1,
           CancellationToken ct = default);
   }
   ```
5. **Implement `SyncOutboxWriter`** (`src/PharmacyERP.Application/Features/Sync/Services/Implementations/SyncOutboxWriter.cs`):
   - If `_runtimeMode.CurrentMode != ErpRuntimeMode.BranchLocal`, return `null` immediately (no-op on `Cloud`).
   - Require active tenant (`_tenantContext.OrganizationId`) and active transaction (`_unitOfWork.HasActiveTransaction`).
   - Call `_cursorRepo.GetOrCreateForUpdateAsync(organizationId, branchId, ct)` and `var sequence = cursor.AllocateNextIssuedSequence();`.
   - Serialize canonical JSON via `CanonicalJsonHasher.SerializeToCanonicalJson(typedPayload)` and compute `payloadHash = CanonicalJsonHasher.ComputeSha256Hex(typedPayload)` (64-char lowercase hex).
   - Create `SyncOutbox.Create(Guid.NewGuid(), organizationId, branchId, operationType, aggregateId, sequence, payloadVersion, payloadHash, canonicalJson, _dateTimeProvider.UtcNow)` and add via `ISyncOutboxRepository.AddAsync(...)` (registering `ISyncOutboxWriter`, `ISyncBranchCursorRepository`, and minimal `ISyncOutboxRepository` in `SyncDependencyInjection.cs`, Scoped).
6. **Create Versioned Immutable Self-Contained `v1` Sync Payloads (`src/PharmacyERP.Application/Features/Sync/Contracts/SyncPayloads.cs`):**
   - Place **100% self-contained immutable `*FactV1` C# records** here in Wave 1 with **ZERO dependency on Wave 2 HTTP DTOs (`YA-02`/`EH-02`)**, capturing every persisted `NOT NULL` DB column (and zero UI-only display fields such as `product_sku`, `product_name`, `uom_code`, `created_by_employee_name`, or `estimated_*`), matching `contracts/schemas/sync.json` verbatim:
     ```csharp
     namespace PharmacyERP.Application.Features.Sync.Contracts;

     public static class SyncPayloadVersions
     {
         public const int SupportedPayloadVersion = 1;
     }

     public sealed record SyncInventoryTxnLineFactV1(
         Guid InventoryTxnLineId,
         Guid ProductId,
         Guid LocationId,
         Guid BatchId,
         string BatchNumber,
         DateOnly? ManufacturedOn,
         DateOnly? ExpiresOn,
         Guid ProductUomId,
         decimal EnteredQty,
         decimal ConversionSnapshot,
         decimal QuantityDeltaBase,
         decimal UnitCostBase,
         Guid? SalesOrderLineId = null,
         Guid? SalesReturnLineId = null);

     public sealed record SyncInventoryTxnFactV1(
         Guid InventoryTxnId,
         Guid OrganizationId,
         Guid BranchId,
         string TransactionNo,
         InventoryTransactionType TransactionType,
         InventoryTransactionStatus Status,
         string? ReasonCode,
         string? Note,
         string IdempotencyKey,
         Guid CreatedByEmployeeId,
         Guid? ReversesInventoryTxnId,
         Guid? SalesOrderId,
         Guid? SalesReturnId,
         DateTimeOffset CreatedAt,
         DateTimeOffset PostedAt,
         IReadOnlyList<SyncInventoryTxnLineFactV1> Lines);

     public sealed record SyncSalesOrderLineFactV1(
         Guid OrderLineId,
         Guid ProductId,
         Guid ProductUomId,
         decimal EnteredQty,
         decimal ConversionSnapshot,
         decimal QuantityBase,
         decimal UnitPriceSnapshot,
         decimal DiscountAmount,
         decimal TaxRateSnapshot,
         decimal TaxAmountSnapshot,
         decimal LineTotal,
         DateTimeOffset CreatedAt,
         DateTimeOffset UpdatedAt);

     public sealed record SyncSalesOrderFactV1(
         Guid SalesOrderId,
         Guid OrganizationId,
         Guid BranchId,
         Guid CreatedByEmployeeId,
         string OrderNo,
         OrderChannel Channel,
         SalesOrderStatus OrderStatus,
         string CurrencyCode,
         string IdempotencyKey,
         DateTimeOffset CreatedAt,
         DateTimeOffset CompletedAt,
         IReadOnlyList<SyncSalesOrderLineFactV1> Lines);

     public sealed record SyncSalesInvoiceLineFactV1(
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

     public sealed record SyncSalesInvoiceFactV1(
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
         DateTimeOffset CreatedAt,
         DateTimeOffset UpdatedAt,
         IReadOnlyList<SyncSalesInvoiceLineFactV1> Lines);

     public sealed record SyncSalesPaymentFactV1(
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

     public sealed record SyncSalesReturnLineFactV1(
         Guid ReturnLineId,
         Guid InvoiceLineId,
         Guid ProductId,
         Guid BatchId,
         Guid DestinationLocationId,
         decimal QuantityBase,
         decimal RefundAmount,
         ReturnDisposition Disposition);

     public sealed record SyncSalesReturnFactV1(
         Guid ReturnId,
         Guid OrganizationId,
         Guid InvoiceId,
         Guid BranchId,
         Guid ReceivedByEmployeeId,
         Guid? ApprovedByEmployeeId,
         string ReturnNo,
         SalesReturnStatus Status,
         string ReasonCode,
         decimal RefundAmount,
         SalesRefundStatus RefundStatus,
         string IdempotencyKey,
         DateTimeOffset ReceivedAt,
         IReadOnlyList<SyncSalesReturnLineFactV1> Lines);

     public sealed record SyncSalesRefundFactV1(
         Guid RefundId,
         Guid OrganizationId,
         Guid BranchId,
         Guid SalesReturnId,
         Guid InvoiceId,
         Guid ProcessedByEmployeeId,
         decimal Amount,
         PaymentMethod Method,
         string IdempotencyKey,
         DateTimeOffset RefundedAt);

     public sealed record PostInventoryAdjustmentSyncPayloadV1(
         SyncInventoryTxnFactV1 InventoryTxn,
         SyncAuditFactDto Audit);

     public sealed record CompleteSalesOrderSyncPayloadV1(
         SyncSalesOrderFactV1 SalesOrder,
         SyncSalesInvoiceFactV1 SalesInvoice,
         SyncSalesPaymentFactV1 SalesPayment,
         SyncInventoryTxnFactV1 SaleIssueTxn,
         SyncAuditFactDto Audit);

     public sealed record PostSalesReturnSyncPayloadV1(
         SyncSalesReturnFactV1 SalesReturn,
         SyncSalesRefundFactV1? SalesRefund,
         SyncInventoryTxnFactV1 ReturnStockTxn,
         SyncInventoryTxnFactV1? ScrapOutTxn,
         SyncAuditFactDto Audit);
     ```
7. **Wire `POST_INVENTORY_ADJUSTMENT` into Stage 1 `InventoryAdjustmentService.cs`:**
   - Live Stage 1 `InventoryAdjustmentService` has a **14-parameter constructor** ending with `IProductUomRepository? productUomRepo = null, IProductRepository? productRepo = null`. Append `ISyncOutboxWriter? syncOutboxWriter = null` as **optional trailing parameter #15** so zero existing Stage 1 unit tests break.
   - Inside `PostAdjustmentAsync` (after `inventoryTransaction.Post(now)`, BEFORE `_unitOfWork.CommitTransactionAsync(ct)`):
     - When `_syncOutboxWriter is not null && _runtimeMode.CurrentMode == ErpRuntimeMode.BranchLocal`: call `var auditLogId = await _auditLogger.LogWithIdAsync(...)` to capture the exact persisted `AuditLogId`, build `PostInventoryAdjustmentSyncPayloadV1` containing exact posted `InventoryTxn` + `InventoryTxnLine` IDs, `TransactionNo`, `TransactionType`, `Status`, `ReasonCode`, `Note`, `IdempotencyKey`, `CreatedByEmployeeId`, `ReversesInventoryTxnId`, `CreatedAt`, `PostedAt`, all lines (`InventoryTxnLineId`, `ProductId`, `LocationId`, `BatchId`, `BatchNumber`, `ExpiresOn`, `ManufacturedOn`, `ProductUomId`, `EnteredQty`, `ConversionSnapshot`, `QuantityDeltaBase`, `UnitCostBase`), and `SyncAuditFactDto` (with exact `auditLogId` and serialized `AfterData`), and call `_syncOutboxWriter.EnqueueAsync(request.BranchId, SyncOperationType.POST_INVENTORY_ADJUSTMENT, inventoryTransaction.InventoryTxnId, syncPayload, payloadVersion: 1, ct)`.
     - Otherwise (when `_syncOutboxWriter is null` or on `Cloud`): preserve the existing `_auditLogger.LogAsync(...)` call so every Stage 1 Moq verification on `IAuditLogger.LogAsync` stays 100% green.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Sync/SyncOutboxWriterTests.cs`:
  - `AuditLogger.LogWithIdAsync` persists `AuditLog` and returns its exact `AuditLogId`; `LogAsync` remains 100% backwards-compatible.
  - `BranchLocal` allocates contiguous `branch_sequence` (`1, 2, 3`), stores exact `CanonicalJsonHasher.ComputeSha256Hex` hash, and persists `SyncOutbox`.
  - `Cloud` mode performs a clean no-op returning `null` with zero cursor mutation.
  - `InventoryAdjustmentService` captures the exact `AuditLogId` + `AfterData` into `SyncAuditFactDto` and emits `POST_INVENTORY_ADJUSTMENT` in `BranchLocal` mode when `ISyncOutboxWriter` is injected, and remains 100% compatible when omitted (`null`).
- `tests/PharmacyERP.IntegrationTests/Persistence/SyncBranchCursorConcurrencyTests.cs` (`[SkipWhenPostgresUnavailableFact]`):
  - Transaction rollback after `AllocateNextIssuedSequence()` leaves **zero sequence gap** in `integration."SYNC_BRANCH_CURSOR"`.
  - Concurrent `BranchLocal` transactions allocate strictly gap-free sequential numbers (`1..N`) without duplicates or deadlocks.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** noting that `IAuditLogger.LogWithIdAsync`, `ISyncOutboxWriter`, and `SyncPayloads.cs` are live in `stage2-dev` (unblocking `El-Hosseiny` for `EH-05`/`EH-07`) and explaining gap-free transactional sequence allocation.

---

## Task `AH-08`: Sync DTOs, Versioned `v1` Payloads, Validators & Sync Repositories

### 1. Task Header
- **Task ID:** `AH-08`
- **Title:** Sync DTOs, Versioned `v1` Payloads, Validators & Sync Repositories
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-hassan/ah-08-sync-dtos-and-repositories`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-07` merged into `stage2-dev` and pulled locally.
- [ ] `SyncOutbox`, `SyncInbox`, `SyncBranchCursor`, and `SyncAuditFactDto` exist and compile.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Verify/Reuse Versioned `v1` Payloads (`src/PharmacyERP.Application/Features/Sync/Contracts/SyncPayloads.cs` created in `AH-07`):**
   - Reuse `PostInventoryAdjustmentSyncPayloadV1`, `CompleteSalesOrderSyncPayloadV1`, and `PostSalesReturnSyncPayloadV1` (`SupportedPayloadVersion = 1`) for Cloud push/retry deserialization and canonical SHA-256 verification.
2. **Create Sync HTTP DTOs** (`src/PharmacyERP.Application/Features/Sync/DTOs/SyncDtos.cs`) matching Blueprint §4.4 (all properties serialize strictly as **`snake_case`** via global `DependencyInjection.ApiJsonSerializerOptions` — e.g., `SyncChangesResponse.NextCursor` -> `next_cursor`, `HighestContiguousAppliedSequence` -> `highest_contiguous_applied_sequence`, `ExpectedNextSequence` -> `expected_next_sequence`, `PayloadHash` -> `payload_hash`; enums serialize strictly as case-sensitive strings with `allowIntegerValues: false`):
   - `SyncOperationItemRequest(Guid OperationId, long BranchSequence, SyncOperationType OperationType, int PayloadVersion, string PayloadHash, JsonElement Payload, DateTimeOffset CreatedAt)`
   - `SyncOperationBatchRequest(Guid OrganizationId, Guid BranchId, IReadOnlyList<SyncOperationItemRequest> Operations)`
   - `SyncOperationResultDto(Guid OperationId, long BranchSequence, SyncDeliveryOutcome Status, long? ExpectedNextSequence, string? ConflictCode, string? Message, IReadOnlyList<ApiErrorDetailDto> Details)`
   - `SyncOperationBatchResponse(Guid OrganizationId, Guid BranchId, long HighestContiguousAppliedSequence, IReadOnlyList<SyncOperationResultDto> Results)`
   - `RetrySyncOperationRequest(string Reason)`
   - **Pinned Bootstrap Sub-DTO C# Records (100% Lockstep with Live Stage 1 Entities, `contracts/schemas/sync.json`, & `contracts/openapi.erp.yaml` — Zero Missing `NOT NULL` Columns):**
     ```csharp
     public sealed record OrganizationBootstrapDto(
         Guid OrganizationId,
         string OrganizationCode,
         string Name,
         string BaseCurrency,
         string TimeZoneId,
         AddressDto Address,
         bool IsActive,
         DateTimeOffset UpdatedAt);

     public sealed record BranchBootstrapDto(
         Guid BranchId,
         Guid OrganizationId,
         string BranchCode,
         string Name,
         AddressDto Address,
         bool IsActive,
         DateTimeOffset UpdatedAt);

     public sealed record BootstrapEmployeeDto(
         Guid EmployeeId,
         Guid OrganizationId,
         Guid BranchId,          // wire: branch_id (matches Employee.BranchId — NOT primary_branch_id)
         string EmployeeNo,
         string FullName,
         string? Email,
         string? Phone,
         string JobTitle,        // non-null (matches Employee.JobTitle)
         AddressDto Address,     // non-null (matches Employee.Address)
         DateOnly HiredOn,       // non-null ISO date (matches Employee.HiredOn)
         bool IsActive,
         DateTimeOffset UpdatedAt);

     public sealed record BootstrapUserAccountDto(
         Guid UserId,
         Guid OrganizationId,
         Guid EmployeeId,
         string Username,
         string PasswordHash,
         Guid SecurityStamp,     // wire: format uuid (matches UserAccount.SecurityStamp Guid)
         UserRole Role,
         BranchScope BranchScope,
         bool IsActive,
         DateTimeOffset UpdatedAt);

     public sealed record BootstrapUserBranchAccessDto(
         Guid OrganizationId,
         Guid UserId,
         Guid BranchId);

     public sealed record BootstrapCategoryDto(
         Guid CategoryId,
         Guid OrganizationId,
         Guid? ParentCategoryId,
         string Code,            // non-null maxLength 30 (matches ProductCategory.Code)
         string Name,
         string? Description,
         bool IsActive,
         DateTimeOffset UpdatedAt);

     public sealed record BootstrapProductDto(
         Guid ProductId,
         Guid OrganizationId,
         Guid CategoryId,
         string Sku,
         string? Barcode,
         string Name,
         string? GenericName,
         string? BrandName,
         string BaseUomCode,
         decimal TaxRate,
         string? ImageUrl,
         bool LotTrackingRequired,
         int ExpiryAlertDays,
         bool IsActive,
         DateTimeOffset UpdatedAt);

     public sealed record BootstrapProductUomDto(
         Guid ProductUomId,
         Guid OrganizationId,
         Guid ProductId,
         string UomCode,
         string DisplayName,
         decimal ConversionToBase,
         decimal? SaleUnitPrice,
         bool IsBase,
         bool IsSellable,
         bool IsPurchasable,
         bool IsActive,
         DateTimeOffset UpdatedAt);

     public sealed record BootstrapReorderRuleDto(
         Guid ReorderRuleId,
         Guid OrganizationId,
         Guid BranchId,
         Guid ProductId,
         decimal ReorderPointBase,
         decimal ReorderQuantityBase,
         decimal? MaxQuantityBase,
         bool IsActive,
         DateTimeOffset UpdatedAt);

     public sealed record BootstrapLocationDto(
         Guid LocationId,
         Guid OrganizationId,
         Guid BranchId,
         string LocationCode,
         string Name,
         LocationType LocationType,
         bool IsSellable,
         bool IsActive,
         DateTimeOffset UpdatedAt);

     public sealed record SyncBootstrapCursorDto(
         long LastIssuedSequence,
         long LastAppliedSequence,
         string LastAppliedCloudCursor,
         string CloudHighWaterCursor);
     ```
     *(On `BranchLocal` initial bootstrap upsert: `NormalizedUsername` is deterministically derived as `Username.ToUpperInvariant()`, `AccessFailedCount` initializes to `0`, and `CreatedAt` initializes from `UpdatedAt` when inserting new local reference rows.)*
   - `SyncBootstrapResponse(Guid OrganizationId, Guid BranchId, OrganizationBootstrapDto Organization, BranchBootstrapDto Branch, IReadOnlyList<BootstrapEmployeeDto> Employees, IReadOnlyList<BootstrapUserAccountDto> Users, IReadOnlyList<BootstrapUserBranchAccessDto> UserBranchAccesses, IReadOnlyList<BootstrapCategoryDto> Categories, IReadOnlyList<BootstrapProductDto> Products, IReadOnlyList<BootstrapProductUomDto> ProductUoms, IReadOnlyList<BootstrapReorderRuleDto> ReorderRules, IReadOnlyList<BootstrapLocationDto> Locations, SyncBootstrapCursorDto Cursors)` *(explicitly NO `StockBalances`, NO `InventoryTxns`, NO opening balances!)*
   - `SyncChangeItemDto(Guid EventId, long EventSequence, string EventType, string SchemaVersion, Guid? BranchId, JsonElement Payload, DateTimeOffset OccurredAt)`
   - `SyncChangesResponse(Guid OrganizationId, Guid BranchId, string NextCursor, bool HasMore, IReadOnlyList<SyncChangeItemDto> Items)` *(wire JSON field for `NextCursor` is `next_cursor`)*
3. **Create Validators** (`src/PharmacyERP.Application/Features/Sync/Validators/SyncValidators.cs`):
   - Validate non-empty batch (`1..100` operations), non-empty `organization_id` and `branch_id`, strictly ascending `branch_sequence` within batch, `payload_hash` 64-char hex, `payload_version > 0`, non-empty `RetrySyncOperationRequest.Reason` (`3..500` chars), and valid pull parameters (`branch_id`, `since_cursor`, `limit`).
   - **Strict `snake_case` `ApiErrorDetailDto.Field` Paths (MANDATORY):** every validation failure MUST emit wire `snake_case` field names: `organization_id`, `branch_id`, `operations`, `operations[i].operation_id`, `operations[i].branch_sequence`, `operations[i].payload_hash`, `operations[i].payload_version`, `reason`, `since_cursor`, `limit`.
4. **Create Repository Interfaces & EF Implementations:**
   - `ISyncOutboxRepository` / `SyncOutboxRepository`: `AddAsync`, `GetPendingOrderedBatchAsync(orgId, branchId, batchSize, ct)` (`ORDER BY branch_sequence ASC`), `GetByIdsAsync`, `UpdateRangeAsync`.
   - `ISyncInboxRepository` / `SyncInboxRepository`: `GetByOperationIdAsync(orgId, operationId, ct)`, `GetBySequenceAsync(orgId, branchId, branchSequence, ct)`, `GetHeadConflictAsync(orgId, branchId, expectedSequence, ct)`, `AddAsync`.
   - `ISyncSnapshotRepository` / `SyncSnapshotRepository`: `AsNoTracking()` queries loading enrolled branch bootstrap entities (excluding stock projections), verifying enrolled branch runtime credential hash via `identity."BRANCH_ENROLLMENT"` (`FindActiveEnrollmentByCredentialHashAsync(byte[] runtimeCredentialHash, DateTimeOffset now, CancellationToken ct)` using `AsNoTracking()`, filtering `RuntimeCredentialHash == runtimeCredentialHash && UsedAt != null && RuntimeCredentialExpiresAt > now && Branch.IsActive`), and reading `integration."OUTBOX_EVENT"` in commit-ordered `event_sequence` with high-water sequence capture and earliest-retained sequence check for `SYNC_CURSOR_EXPIRED`.
5. **Update `GlobalUsings.cs`:** Add `PharmacyERP.Application.Features.Sync.Contracts`, `DTOs`, `Repositories.Interfaces`, `Services.Interfaces`, `Validators` to `Application/GlobalUsings.cs` and relevant namespaces to `Infrastructure/GlobalUsings.cs` & `Api/GlobalUsings.cs`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Sync/SyncValidatorAndPayloadHashTests.cs`:
  - Verify `SyncValidators` rejects empty batches, unsorted/duplicate sequences, malformed SHA-256 hashes, and empty retry reasons, asserting strict `snake_case` `ApiErrorDetailDto.Field` values (`organization_id`, `branch_id`, `operations[0].branch_sequence`, `operations[0].payload_hash`, `reason`, `since_cursor`, `limit`).
  - Verify `CanonicalJsonHasher.ComputeSha256Hex` produces identical digests for `CompleteSalesOrderSyncPayloadV1` / `PostSalesReturnSyncPayloadV1` across re-ordered JSON properties and trailing-zero decimal variants (`10.0m` vs `10.0000m`), plus Arabic/Unicode strings.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** covering the versioned `v1` sync payloads, strict `snake_case` DTO/validator contracts, and repository query hygiene.

---

## Task `AH-09`: Cloud Sync Push Ingestion, Enrolled-Branch Auth & Conflict Engine (`POST /api/v1/sync/operations`)

### 1. Task Header
- **Task ID:** `AH-09`
- **Title:** Cloud Sync Push Ingestion, Enrolled-Branch Auth & Conflict Engine (`POST /api/v1/sync/operations`)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-hassan/ah-09-sync-push-ingestion`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-08` merged into `stage2-dev` and pulled locally.
- [ ] `ISyncInboxRepository`, `ISyncBranchCursorRepository`, `ISyncSnapshotRepository`, `SyncPayloads.cs`, `BranchEnrollment.RuntimeCredentialHash`, and `BranchService.cs` exist and compile.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Persist Issued Runtime Credential Hash in `BranchService.RedeemEnrollmentAsync` & Implement `IBranchSyncAuthenticator`:**
   - **Update `src/PharmacyERP.Application/Features/Identity/Services/Implementations/BranchService.cs` (`RedeemEnrollmentAsync`):** generate `credential = Base64UrlEncode(RandomNumberGenerator.GetBytes(32))` and `expiry = now.AddHours(24)` before redeeming, and invoke `enrollment.Redeem(now, HashToken(credential), expiry)` so the 32-byte SHA-256 hash of `runtime_credential` and its expiration timestamp are atomically persisted on `identity."BRANCH_ENROLLMENT"`.
   - **Create `IBranchSyncAuthenticator` / `BranchSyncAuthenticator`:**
     - **Reject Pre-Bound Tenant Context First (Prevents Silent `AllowSystemBypass()` No-Op):** Because `TenantContext.AllowSystemBypass()` silently returns when `IsTenantBound == true` (e.g., if a caller sends an `Authorization: Bearer <user JWT>` alongside `X-Branch-Enrollment-Token` on an `[AllowAnonymous]` sync route), `BranchSyncAuthenticator` MUST first check `if (_tenantContext.IsTenantBound)` and immediately return `401 UNAUTHORIZED` (`"Enrolled-branch sync endpoints do not accept user Bearer authentication alongside X-Branch-Enrollment-Token."`).
     - Accepts the `X-Branch-Enrollment-Token` header value (returning `401 UNAUTHORIZED` when missing/blank), hashes with SHA-256, and calls `ISyncSnapshotRepository.FindActiveEnrollmentByCredentialHashAsync(credentialHash, _dateTimeProvider.UtcNow, ct)` inside a short `AllowSystemBypass()` `AsNoTracking()` discovery transaction (matching Stage 1 A-04 pattern: rollback + clear change tracker, then call `_tenantContext.SetTenant(organizationId)`).
     - Enforces `UsedAt != null && RuntimeCredentialExpiresAt > now && Branch.IsActive` — rejecting unknown, unredeemed, expired, or inactive-branch credentials with `401 UNAUTHORIZED`; rejects if request `organization_id`/`branch_id` differs from enrolled `(OrganizationId, BranchId)` with `403 FORBIDDEN` / `403 FORBIDDEN_BRANCH`.
2. **Create `ISyncOperationApplier`** (shared by `AH-09` Push and `AH-10` Retry) & **`ISyncPushService`**:
   - Process each operation in ascending `BranchSequence` order inside its own isolated `IUnitOfWork` transaction (so earlier valid operations commit cleanly even if a later operation hits a conflict or gap):
     1. Lock `SYNC_BRANCH_CURSOR` via `GetOrCreateForUpdateAsync(orgId, branchId, ct)` (`expectedSequence = cursor.LastAppliedSequence + 1`).
     2. **Deduplication check (`SYNC_INBOX` by `OperationId`):**
        - If already exists: compare `existing.PayloadHash` (and `BranchSequence`/`PayloadVersion`) against submitted operation.
          - Hash mismatch -> audit security conflict, return `CONFLICT` (`IDEMPOTENCY_MISMATCH`) without modifying inbox or cursor.
          - Hash matches -> if `existing.ProcessingStatus == APPLIED`, return `SyncDeliveryOutcome.ALREADY_APPLIED`; if `CONFLICT`, return `SyncDeliveryOutcome.CONFLICT` (preserving original `result_code`).
     3. **Contiguous sequence & head-of-line conflict check:**
        - If `operation.BranchSequence < expectedSequence` (different `operation_id` for an already-applied sequence): return `CONFLICT` (`IDEMPOTENCY_MISMATCH`), audit, do NOT apply.
        - If `operation.BranchSequence > expectedSequence`: do NOT apply, do NOT advance cursor, return `SyncDeliveryOutcome.CONFLICT` with `ExpectedNextSequence = expectedSequence`, `ConflictCode = "SYNC_SEQUENCE_GAP"`, and halt processing remaining items in the batch.
        - If a `CONFLICT` inbox row already exists at `expectedSequence` for another `operation_id`: halt batch, return `CONFLICT` (`QUEUE_HEAD_BLOCKED`, `ExpectedNextSequence = expectedSequence`).
     4. **Version & Canonical SHA-256 Hash verification (before applying business rows):**
        - Reject unsupported `PayloadVersion != 1` or Stage 3 unimplemented `OperationType`: persist `SYNC_INBOX` (`RECEIVED -> CONFLICT`, `result_code = CONFLICT`), audit, do NOT advance cursor, halt batch.
        - Deserialize typed `v1` payload, recompute `CanonicalJsonHasher.ComputeSha256Hex(typedPayload)` and compare ordinally with `operation.PayloadHash`. On mismatch: persist `SYNC_INBOX` (`CONFLICT`), audit (`IDEMPOTENCY_MISMATCH`), do NOT advance cursor, halt batch.
     5. **Exact Fact Application (NEVER recalculates FEFO, totals, prices, or tax!):**
        - `POST_INVENTORY_ADJUSTMENT`: upsert deterministic `InventoryBatch` (conflict if same `batch_id` arrives with conflicting non-identity attributes per §8.9.3), insert `InventoryTxn` (`DRAFT` -> lines -> `POSTED`) with exact branch IDs/timestamps, update `StockBalance` projection in deterministic `(LocationId, BatchId)` lock order, insert replicated `AUDIT_LOG` row via `new AuditLog(..., auditLogId: auditFact.AuditLogId)` preserving original `audit_log_id`, `before_data`, `after_data`, actor, trace, and timestamp.
        - `COMPLETE_SALES_ORDER`: insert exact `SalesOrder` (`COMPLETED`) + `SalesOrderLine`s + `SalesInvoice` (`ISSUED`/`PAID`) + `SalesInvoiceLine`s + `SalesPayment` + `InventoryTxn` (`SALE_ISSUE`, `DRAFT` -> lines -> `POSTED`) + deduct `StockBalance` projection + insert replicated `AUDIT_LOG` (with original `audit_log_id`, `before_data`, `after_data`) + enqueue Cloud `OUTBOX_EVENT`.
        - `POST_SALES_RETURN`: insert exact `SalesReturn` (`POSTED`) + `SalesReturnLine`s + optional `SalesRefund` + update `SalesInvoice` settlement projection (`ApplyRefund`) + insert `InventoryTxn` (`SALES_RETURN_IN`) + optional `InventoryTxn` (`SCRAP_OUT`) + update `StockBalance` projection + insert replicated `AUDIT_LOG` (with original `audit_log_id`, `before_data`, `after_data`) + enqueue Cloud `OUTBOX_EVENT`.
        - Any deterministic FK/reference/conflict failure rolls back business rows, commits a `SYNC_INBOX` row with `ProcessingStatus = CONFLICT` (`ResultCode = CONFLICT`) + `AUDIT_LOG` entry, leaves `LastAppliedSequence` unchanged, and halts the remaining batch.
     6. **Commit on success:** mark `SYNC_INBOX` `APPLIED` (`ResultCode = APPLIED`), call `cursor.AdvanceAppliedSequence(operation.BranchSequence)`, commit transaction atomically, return `SyncDeliveryOutcome.APPLIED`.
   - Batch response returns `HighestContiguousAppliedSequence = cursor.LastAppliedSequence` and per-operation results.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Sync/SyncPushServiceTests.cs`:
  - `BranchService.RedeemEnrollmentAsync` persists `SHA256(runtime_credential)` & `RuntimeCredentialExpiresAt` on `BranchEnrollment`; `IBranchSyncAuthenticator` accepts valid redeemed credentials, immediately rejects requests where `ITenantContext.IsTenantBound == true` with `401 UNAUTHORIZED` (never calling `AllowSystemBypass()` or querying the DB), and rejects unknown/unredeemed/expired/inactive-branch credentials (`401 UNAUTHORIZED`).
  - Happy path applying `COMPLETE_SALES_ORDER`, `POST_SALES_RETURN`, and `POST_INVENTORY_ADJUSTMENT` sequentially without recalculating FEFO/totals, preserving exact `audit_log_id` and `before_data`/`after_data`.
  - Duplicate delivery of applied operation returns `ALREADY_APPLIED` with zero duplicate rows.
  - Sequence gap (`seq 3` when `expected 2`) returns `CONFLICT` with `expected_next_sequence = 2` and does not advance cursor.
  - Payload hash mismatch (`IDEMPOTENCY_MISMATCH`) and unsupported `payload_version = 99` block at queue head without advancing cursor.
  - Enrolled branch scope mismatch returns `403 FORBIDDEN_BRANCH`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** explaining exact fact application (no FEFO re-run), canonical SHA-256 verification, and head-of-line conflict blocking.

---

## Task `AH-10`: Cloud Sync Conflict Retry Service (`POST /api/v1/sync/operations/{operationId}/retry`)

### 1. Task Header
- **Task ID:** `AH-10`
- **Title:** Cloud Sync Conflict Retry Service (`POST /api/v1/sync/operations/{operationId}/retry`)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-hassan/ah-10-sync-conflict-retry`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-09` merged into `stage2-dev` and pulled locally.
- [ ] `ISyncOperationApplier`, `ISyncInboxRepository`, `ISyncBranchCursorRepository`, and `SyncAdminOnly` policy exist and compile.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Create `ISyncRetryService` & `SyncRetryService` (`src/PharmacyERP.Application/Features/Sync/Services/`):
1. **Authorization & Validation:**
   - Validate `RuntimeMode == ErpRuntimeMode.Cloud` (`404 NOT_FOUND` otherwise), active tenant (`_tenantContext.OrganizationId`), non-empty `Reason` (`3..500` chars -> `422 VALIDATION_ERROR` with strict `snake_case` `ApiErrorDetailDto.Field = "reason"`).
   - Require `Admin` role with `sync:retry` scope and `_currentUser.CanAccessBranch(inbox.BranchId)` (`403 FORBIDDEN` / `403 FORBIDDEN_BRANCH` on failure).
2. **Head-of-Line Immutability Enforcement (Blueprint §4.3 & §8.9.2):**
   - Inside `IUnitOfWork` transaction:
     - Load `SYNC_INBOX` row by `(organizationId, operationId)` (`404 NOT_FOUND` if missing).
     - Lock `SYNC_BRANCH_CURSOR` via `GetOrCreateForUpdateAsync(organizationId, inbox.BranchId, ct)`.
     - Verify `inbox.ProcessingStatus == SyncProcessingStatus.CONFLICT` (`409 INVALID_STATE_TRANSITION` if `APPLIED`, `RECEIVED`, or `FAILED`).
     - Verify `inbox.BranchSequence == cursor.LastAppliedSequence + 1` (cannot skip or retry out-of-order; `409 INVALID_STATE_TRANSITION` otherwise).
     - **Cannot edit or alter payload:** re-verify stored `inbox.Payload` against stored `inbox.PayloadHash` via `CanonicalJsonHasher`; if tampered/irreparable, audit failed retry attempt with `request.Reason`, keep `CONFLICT`, do NOT advance cursor, and return `SyncOperationResultDto` (`CONFLICT`, `IRREPARABLE_PAYLOAD_HASH_MISMATCH`).
     - Transition `inbox.BeginAuthorizedRetry()` (`CONFLICT -> RECEIVED`, preserving immutable first `ResultCode = CONFLICT`).
     - Invoke `ISyncOperationApplier.ApplyExactFactAsync(...)` using the exact retained `inbox.Payload`, `inbox.PayloadVersion`, and `inbox.OperationId`.
     - **On Success:** call `inbox.MarkApplied()` (`ProcessingStatus = APPLIED`, `ResultCode` remains `CONFLICT`), `cursor.AdvanceAppliedSequence(inbox.BranchSequence)`, write `IAuditLogger.LogAsync(action: "SYNC_RETRY_SUCCEEDED", entitySchema: "integration", entityName: "SYNC_INBOX", entityId: inbox.OperationId, ...)` containing `request.Reason`, and commit atomically.
     - **On Failure:** roll back business changes, write `IAuditLogger.LogAsync(action: "SYNC_RETRY_FAILED", ...)` with `request.Reason`, keep `ProcessingStatus = CONFLICT` and `LastAppliedSequence` unchanged, commit audit, and return `CONFLICT` result.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Sync/SyncRetryServiceTests.cs`:
  - Recoverable conflict (e.g., missing catalog reference subsequently created on Cloud): retry succeeds, advances `LastAppliedSequence`, transitions `ProcessingStatus` to `APPLIED`, preserves immutable `ResultCode == CONFLICT`, and writes audit log with `Reason`.
  - Irreparable/tampered hash conflict: retry refuses to apply, preserves `CONFLICT`, keeps cursor blocked, and audits attempt.
  - Rejects empty reason (`422`), non-conflict status (`409`), non-head sequence (`409`), unauthorized branch (`403 FORBIDDEN_BRANCH`).

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** explaining why retry can never edit or skip a conflicting operation and how `result_code` preserves the audit trail.

---

## Task `AH-11`: Cloud Sync Pull Feeds (`GET /api/v1/sync/bootstrap` & `GET /api/v1/sync/changes`)

### 1. Task Header
- **Task ID:** `AH-11`
- **Title:** Cloud Sync Pull Feeds (`GET /api/v1/sync/bootstrap` & `GET /api/v1/sync/changes`)
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-hassan/ah-11-sync-pull-feeds`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-08` and `AH-09` merged into `stage2-dev` and pulled locally.
- [ ] `IBranchSyncAuthenticator`, `ISyncSnapshotRepository`, and `SyncBootstrapResponse`/`SyncChangesResponse` exist and compile.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Create `ISyncPullService` & `SyncPullService` (`src/PharmacyERP.Application/Features/Sync/Services/`):
1. **`GetBootstrapAsync(string? enrollmentToken, Guid branchId, CancellationToken ct)` (`GET /api/v1/sync/bootstrap?branch_id=...`):**
   - Authenticate enrolled branch via `IBranchSyncAuthenticator`; derive `organizationId` strictly from `BRANCH_ENROLLMENT.runtime_credential_hash` and verify `branch_id == enrolledBranchId` (`403 FORBIDDEN_BRANCH` on mismatch; empty `branch_id` -> `422 VALIDATION_ERROR`, `field: "branch_id"`).
   - Inside explicit `IUnitOfWork` read transaction (`BeginTransactionAsync` -> queries -> `RollbackTransactionAsync(CancellationToken.None)`):
     - Load `Organization`, enrolled `Branch`, active/authorized `Employee` + `UserAccount` + `UserBranchAccess` rows for users permitted at `branchId` (including `ALL`-scope Admins and `ASSIGNED` users for `branchId` via the protected enrollment channel so local actor FKs and offline login work per Blueprint §8.9.9), `ProductCategory`, `Product` (including `TaxRate`), `ProductUom` (including `SaleUnitPrice`), branch `ProductReorderRule`, branch `InventoryLocation`, and current `SyncBranchCursor` + current committed Cloud `OUTBOX_EVENT.event_sequence` high-water cursor token.
     - **CRITICAL INVARIANT (Blueprint §4.3 & §4.4):** NEVER include `StockBalance`, `InventoryBatch` quantities, `InventoryTxn`, or opening-balance facts. BranchLocal always posts its own local `OPENING_BALANCE` transaction.
2. **`GetChangesAsync(string? enrollmentToken, Guid branchId, string? cursor, int limit, CancellationToken ct)` (`GET /api/v1/sync/changes?branch_id=...&since_cursor=...&limit=...`):**
   - Authenticate enrolled branch; derive `organizationId` from enrollment and verify `branch_id == enrolledBranchId` (`403 FORBIDDEN_BRANCH` on mismatch; empty `branch_id` -> `422 VALIDATION_ERROR`, `field: "branch_id"`).
   - Clamp `limit` to `[1, 200]` (default `100`; `<= 0` falls back to `100`).
   - Encode/decode opaque `since_cursor` as base64url JSON `{ "v": 1, "seq": <long> }`. Malformed `since_cursor` returns `422 VALIDATION_ERROR` with strict `snake_case` `ApiErrorDetailDto.Field = "since_cursor"`.
   - Inside explicit `IUnitOfWork` read transaction:
     - Capture current committed high-water `maxCommittedSequence` from `integration."OUTBOX_EVENT_CURSOR"` / `OUTBOX_EVENT`.
     - Check earliest retained sequence / cursor retention floor (configurable `Sync:MinRetainedEventSequence` or min event check): if `requestedSeq > 0 && requestedSeq < minAvailableFloor`, return `Result<SyncChangesResponse>.Failure(ErrorCode.SYNC_CURSOR_EXPIRED, "The supplied sync cursor has expired. Perform a controlled branch resnapshot via /api/v1/sync/bootstrap.")` (`HTTP 409`).
     - Query `OUTBOX_EVENT` where `OrganizationId == orgId && EventSequence > requestedSeq && EventSequence <= maxCommittedSequence` ordered by `EventSequence ASC`, `Take(limit + 1)`.
     - Advance `SyncChangesResponse.NextCursor` (wire JSON `"next_cursor"`) to the **last scanned committed `EventSequence`** even if branch-scope filtering excludes some or all events from the returned `Items` list (Blueprint §4.4).
     - Filter returned `Items` to organization-wide events (`BranchId == null`: catalog/price/tax/identity/deactivation changes) or events targeting `BranchId == enrolledBranchId` (excluding branch-local stock mutation echoes that originated from this branch).
     - Replay from the same `since_cursor` is 100% deterministic.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Application/Sync/SyncPullServiceTests.cs`:
  - `GetBootstrapAsync` returns catalog, UOM prices, product tax rates, authorized branch users/employees, and initial cursors — asserting zero stock balances or opening balances.
  - `GetChangesAsync` returns events in strict `EventSequence` order, advances `next_cursor` (`SyncChangesResponse.NextCursor`) over scanned events even when branch filtering yields 0 items, replays deterministically from prior `since_cursor`, rejects malformed `since_cursor` (`422` with `field: "since_cursor"`), and returns `ErrorCode.SYNC_CURSOR_EXPIRED` (`409`) when cursor is expired.
  - Rejects mismatched `branch_id` vs enrolled branch (`403 FORBIDDEN_BRANCH`).

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** detailing why `bootstrap` excludes stock projections and how commit-ordered `event_sequence` cursors prevent missing late commits.

---

## Task `AH-12`: `SyncController`, `BranchSyncBackgroundWorker`, DI Wiring & Incremental OpenAPI Sync

### 1. Task Header
- **Task ID:** `AH-12`
- **Title:** `SyncController`, `BranchSyncBackgroundWorker`, `SyncDependencyInjection.cs` Wiring & Incremental OpenAPI Sync
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-hassan/ah-12-sync-controller-and-worker`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-09`, `AH-10`, and `AH-11` merged into `stage2-dev` and pulled locally.
- [ ] `ISyncPushService`, `ISyncRetryService`, `ISyncPullService`, and `SyncDependencyInjection.cs` exist and compile.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Create Thin `SyncController.cs`** (`src/PharmacyERP.Api/Controllers/SyncController.cs`) with strict `snake_case` query bindings, accurate `[AllowAnonymous]` vs `[Authorize]` attributes, and complete `[ProducesResponseType]` annotations (mandatory for `ContractsArtifactSyncTests`):
   - `[ApiController]`, `[Route("api/v1/sync")]`.
   - `POST /api/v1/sync/operations` (`[HttpPost("operations")]`, **`[AllowAnonymous]`** — authenticated via `IBranchSyncAuthenticator` so Swagger/`IdempotencyKeyHeaderOperationFilter` does not falsely require Bearer JWT):
     - Parameters: `[FromHeader(Name = "X-Branch-Enrollment-Token")] string? enrollmentToken`, `[FromBody] SyncOperationBatchRequest request`, `CancellationToken ct`.
     - `[ProducesResponseType(typeof(SyncOperationBatchResponse), StatusCodes.Status200OK)]` + `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), 400/401/403/404/422)]`.
     - Delegates to `ISyncPushService.ProcessBatchAsync(...)`, returns via `ApiResultMapper.ToActionResult`.
   - `POST /api/v1/sync/operations/{operationId:guid}/retry` (`[HttpPost("operations/{operationId:guid}/retry")]`, **`[Authorize(Policy = "SyncAdminOnly")]`**):
     - Parameters: `[FromRoute] Guid operationId`, `[FromBody] RetrySyncOperationRequest request`, `CancellationToken ct`.
     - `[ProducesResponseType(typeof(SyncOperationResultDto), StatusCodes.Status200OK)]` + `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), 400/401/403/404/409/422)]`.
     - Delegates to `ISyncRetryService.RetryOperationAsync(operationId, request, ct)`, returns via `ApiResultMapper.ToActionResult`.
   - `GET /api/v1/sync/bootstrap` (`[HttpGet("bootstrap")]`, **`[AllowAnonymous]`**):
     - Parameters: `[FromHeader(Name = "X-Branch-Enrollment-Token")] string? enrollmentToken`, **`[FromQuery(Name = "branch_id")] Guid branchId`**, `CancellationToken ct`.
     - `[ProducesResponseType(typeof(SyncBootstrapResponse), StatusCodes.Status200OK)]` + `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), 401/403/404/422)]`.
     - Delegates to `ISyncPullService.GetBootstrapAsync(enrollmentToken, branchId, ct)`, returns via `ApiResultMapper.ToActionResult`.
   - `GET /api/v1/sync/changes` (`[HttpGet("changes")]`, **`[AllowAnonymous]`**):
     - Parameters: `[FromHeader(Name = "X-Branch-Enrollment-Token")] string? enrollmentToken`, **`[FromQuery(Name = "branch_id")] Guid branchId`**, **`[FromQuery(Name = "since_cursor")] string? cursor = null`**, **`[FromQuery(Name = "limit")] int limit = 100`**, `CancellationToken ct`.
     - `[ProducesResponseType(typeof(SyncChangesResponse), StatusCodes.Status200OK)]` + `[ProducesResponseType(typeof(ApiErrorEnvelopeDto), 401/403/404/409/422)]`.
     - Delegates to `ISyncPullService.GetChangesAsync(enrollmentToken, branchId, cursor, limit, ct)`, returns via `ApiResultMapper.ToActionResult`.
2. **Create `ICloudSyncHttpClient` & `CloudSyncHttpClient`** (`src/PharmacyERP.Infrastructure/BackgroundServices/Sync/`):
   - Typed `HttpClient` calling Cloud `POST /api/v1/sync/operations`, `GET /api/v1/sync/bootstrap?branch_id=...`, and `GET /api/v1/sync/changes?branch_id=...&since_cursor=...&limit=...` with `X-Branch-Enrollment-Token` and W3C `traceparent` propagation.
3. **Create `BranchSyncBackgroundWorker`** (`src/PharmacyERP.Infrastructure/BackgroundServices/Sync/BranchSyncBackgroundWorker.cs`):
   - Inherits `BackgroundService`. Registered ONLY when `IRuntimeModeProvider.CurrentMode == ErpRuntimeMode.BranchLocal` AND `configuration.GetValue<bool>("Sync:WorkerEnabled", true)` (disabled in test hosts via `Sync:WorkerEnabled = false`, matching `Outbox:WorkerEnabled`).
   - **Push Loop:** reads pending `SYNC_OUTBOX` rows ordered by `branch_sequence ASC` (batch size configurable, default `25`). Sends batch via `ICloudSyncHttpClient`:
     - For each `APPLIED` or `ALREADY_APPLIED` item: marks `SyncOutbox.MarkSynced(now)` inside a local `IUnitOfWork` transaction.
     - On deterministic `CONFLICT`: records `LastError` without marking `SyncedAt` and **stops pushing subsequent operations** (no automatic infinite conflict loop; Blueprint §4.3 & §8.9.2).
     - On transient network / HTTP `5xx` failure: calls `RecordRetryFailure(err)` (never discards the row) and applies **bounded exponential backoff** (`base 2s`, `2^n`, capped at `300s` + jitter).
   - **Pull Loop:** reads `SyncBranchCursor.LastAppliedCloudCursor`, calls `GET /api/v1/sync/changes`, and applies the entire returned reference/catalog/identity change page + `cursor.UpdateCloudCursor(response.NextCursor)` inside a **single atomic local `IUnitOfWork` transaction** (idempotent replay if interrupted). On `409 SYNC_CURSOR_EXPIRED`, logs warning and triggers controlled reference resnapshot via `GET /api/v1/sync/bootstrap` while preserving all local business history and pending `SYNC_OUTBOX` rows.
4. **Complete DI Registration in `SyncDependencyInjection.cs` (Application & Infrastructure):**
   - Register all Sync repositories, services (`ISyncOutboxWriter`, `IBranchSyncAuthenticator`, `ISyncOperationApplier`, `ISyncPushService`, `ISyncRetryService`, `ISyncPullService`), typed `ICloudSyncHttpClient`, and conditional `BranchSyncBackgroundWorker` (`Scoped` for repos/services, `HostedService` for worker). Keep root `DependencyInjection.cs` files untouched.
5. **OpenAPI Header Filter, `ContractsArtifactSyncTests` & `contracts/README.md` Sync (MANDATORY IN THIS PR):**
   - Update `IdempotencyKeyHeaderOperationFilter` (or add a dedicated `BranchEnrollmentHeaderOperationFilter` in `src/PharmacyERP.Api/Swagger/` registered in `Api/DependencyInjection.cs`) so Swashbuckle marks the `X-Branch-Enrollment-Token` header parameter `Required = true` in OpenAPI on the 3 enrolled-branch sync routes (`POST /api/v1/sync/operations`, `GET /api/v1/sync/bootstrap`, `GET /api/v1/sync/changes`) — matching `contracts/openapi.erp.yaml` 100%.
   - Update `tests/PharmacyERP.IntegrationTests/Api/ContractsArtifactSyncTests.cs`:
     - Add all 4 `/api/v1/sync/*` endpoints (`POST /api/v1/sync/operations`, `POST /api/v1/sync/operations/{operationId}/retry`, `GET /api/v1/sync/bootstrap`, `GET /api/v1/sync/changes`) to `ExpectedLiveEndpoints`.
     - Add `typeof(SyncOperationType)` and `typeof(SyncDeliveryOutcome)` to the string-only wire enum schema verification list.
   - Regenerate `apps/erp-backend/contracts/openapi.v1.json` against live `/swagger/v1/swagger.json`:
     ```powershell
     $env:UPDATE_OPENAPI_SNAPSHOT="true"
     dotnet test tests/PharmacyERP.IntegrationTests/PharmacyERP.IntegrationTests.csproj --filter ContractsArtifactSyncTests
     Remove-Item Env:UPDATE_OPENAPI_SNAPSHOT
     ```
   - Update `apps/erp-backend/contracts/README.md` documenting the 4 Sync endpoints, required `X-Branch-Enrollment-Token` header auth on enrolled-branch endpoints, `SyncAdminOnly` (`sync:retry`) on retry, and `409 SYNC_CURSOR_EXPIRED`.

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.UnitTests/Infrastructure/BranchSyncBackgroundWorkerTests.cs`:
  - Verifies strict `branch_sequence` ordering, marks `synced_at` ONLY after explicit `APPLIED`/`ALREADY_APPLIED` ack.
  - Verifies deterministic `CONFLICT` halts queue progression without infinite retry loop.
  - Verifies transient HTTP 503 triggers bounded exponential backoff without discarding `SYNC_OUTBOX` row.
  - Verifies pull page application + `LastAppliedCloudCursor` commit atomically; verifies `SYNC_CURSOR_EXPIRED` triggers bootstrap resnapshot without deleting pending `SYNC_OUTBOX`.
- `tests/PharmacyERP.UnitTests/API/Controllers/SyncControllerTests.cs`:
  - Verifies route attributes, `[AllowAnonymous]` + `[FromHeader(Name = "X-Branch-Enrollment-Token")]` on `operations`, `bootstrap`, and `changes`, `[Authorize(Policy = "SyncAdminOnly")]` on `retry`, explicit `[FromQuery(Name = "branch_id")]`/`[FromQuery(Name = "since_cursor")]`/`[FromQuery(Name = "limit")]`, complete `[ProducesResponseType]` annotations, and `ApiResultMapper` error mapping.
- `tests/PharmacyERP.IntegrationTests/Api/ContractsArtifactSyncTests.cs` passes 100% with zero OpenAPI drift.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`, including `ContractsArtifactSyncTests`).
- Local API boot check (`dotnet run` in `Cloud` mode -> verify Swagger `/swagger/v1/swagger.json` exposes all 4 `/api/v1/sync/*` endpoints with `snake_case` query params and typed schemas, then terminate cleanly).
- Provide a concise **Arabic explanation in chat** covering `SyncController`, `BranchSyncBackgroundWorker` push/pull resilience, backoff/conflict halting, and the synchronized OpenAPI contract.

---

## Task `AH-13`: Sync Engine Comprehensive PostgreSQL Integration Test Matrix

### 1. Task Header
- **Task ID:** `AH-13`
- **Title:** Sync Engine Comprehensive PostgreSQL Integration Test Matrix
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-hassan/ah-13-sync-integration-tests`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-12` merged into `stage2-dev` and pulled locally.
- [ ] Local PostgreSQL accessible via `ERP_IT_POSTGRES` (`ThrowawayPostgresDatabaseProvisioner` active with `erp_it_app` and `FORCE RLS`).

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Create comprehensive real-PostgreSQL integration test suites under `tests/PharmacyERP.IntegrationTests/Sync/` using `ThrowawayPostgresDatabaseProvisioner` + `[SkipWhenPostgresUnavailableFact]` covering EVERY Blueprint §10.1 synchronization gate:
1. `SyncPushAndConflictIntegrationTests.cs`:
   - **End-to-end Push of `COMPLETE_SALES_ORDER`, `POST_SALES_RETURN`, `POST_INVENTORY_ADJUSTMENT`:** exact IDs, ledger lines, stock projection, and replicated `AUDIT_LOG` rows persisted atomically; `SYNC_BRANCH_CURSOR.last_applied_sequence` advances.
   - **Duplicate Delivery & Crash-Before-Ack Replay:** resending an already-applied operation returns `ALREADY_APPLIED`, creates zero duplicate invoices/ledger/audit rows, and keeps `result_code == APPLIED`.
   - **Reversed Arrival Order & Gap Detection:** sending `seq 2` before `seq 1` returns `CONFLICT` with `expected_next_sequence = 1` without mutating DB or advancing cursor; subsequently sending `seq 1` then `seq 2` succeeds cleanly.
   - **Payload Hash Mismatch (`IDEMPOTENCY_MISMATCH`):** mutating payload bytes with same `operation_id` or wrong `payload_hash` rejects with `CONFLICT`, audits the mismatch, and blocks cursor.
   - **Recoverable Conflict & Authorized `POST /api/v1/sync/operations/{operationId}/retry`:** trigger a missing-reference conflict at `seq 1` (confirm `seq 2` is blocked), add the missing reference on Cloud, invoke `/retry` with `SyncAdminOnly` + reason -> succeeds, `processing_status` becomes `APPLIED`, `result_code` stays `CONFLICT`, audit record contains reason, and `seq 2` now applies cleanly.
   - **Irreparable Conflict:** retry with corrupted payload hash stays `CONFLICT` and cursor remains blocked.
   - **Runtime Mode Enforcement:** `BranchLocal` host returns `404 NOT_FOUND` for all 4 `/api/v1/sync/*` endpoints; `Cloud` host returns `403 FORBIDDEN` when retry lacks `sync:retry` scope.
2. `SyncPullAndRlsIntegrationTests.cs`:
   - **Real Enrollment Redemption & Credential Auth:** redeem enrollment via `POST /api/v1/branch-enrollment` (`BranchService.RedeemEnrollmentAsync`) and authenticate all enrolled-branch sync routes with the issued `runtime_credential` via `X-Branch-Enrollment-Token`; verify expired/unknown credentials return `401 UNAUTHORIZED`.
   - **`GET /api/v1/sync/bootstrap`:** returns full catalog/UOM prices/tax/locations/branch-authorized users with **zero stock balances**; rejects cross-branch `branch_id` (`403 FORBIDDEN_BRANCH`).
   - **`GET /api/v1/sync/changes`:**
     - Overlapping/delayed transaction test proving commit-ordered `OUTBOX_EVENT.event_sequence` never skips a late commit.
     - Page-boundary replay returns identical page deterministically (`since_cursor` / `next_cursor`).
     - Deactivation/tombstone event delivery verified.
     - Expired cursor returns `409 SYNC_CURSOR_EXPIRED`.
   - **Multi-Tenant RLS Pool Reuse:** alternating Tenant A and Tenant B sync calls across pooled `erp_it_app` connections prove zero cross-tenant leakage.

### 4. Mandatory Unit & Integration Tests
- Both test files above (`tests/PharmacyERP.IntegrationTests/Sync/SyncPushAndConflictIntegrationTests.cs` and `SyncPullAndRlsIntegrationTests.cs`) executed live against PostgreSQL (`0 Skipped`).

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Provide a concise **Arabic explanation in chat** summarizing every sync resilience scenario verified against live PostgreSQL.

---

## Task `AH-14`: Stage 2 `DevDatabaseSeeder` & `FRONTEND_TEST_DATA_GUIDE.md` Update

### 1. Task Header
- **Task ID:** `AH-14`
- **Title:** Stage 2 `DevDatabaseSeeder` Extension & `FRONTEND_TEST_DATA_GUIDE.md` Update
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-hassan/ah-14-stage2-seeder-and-test-guide`
- **Execution Command:** Execute via `/execute-stage-task` applying `@.agent/rules/00-backend-guardrails.md` and `@.agent/skills/pharmacy-backend-engineering/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-12` and `AH-13` merged into `stage2-dev` and pulled locally.
- [ ] **El-Hosseiny's** checkout & return PRs (`EH-05`, `EH-07`, `EH-08`) merged into `stage2-dev` and pulled locally.
- [ ] **Yassin's** draft/invoice PR (`YA-08`) and **Ahmed Salah's** return-read/canonical PR (`AS-07`) merged into `stage2-dev` and pulled locally.
- [ ] `src/PharmacyERP.Infrastructure/Persistence/Seeding/DevDatabaseSeeder.cs`, `DevSeedConstants.cs`, and `apps/erp-backend/FRONTEND_TEST_DATA_GUIDE.md` exist.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
1. **Extend `DevSeedConstants.cs`:**
   - Add deterministic Stage 2 seed keys/numbers (using `DevSeedConstants.DeterministicGuid(...)`) for `MEDCARE` (`MedCareDowntownBranchId`) and `ALNOUR` (`AlNourHeliopolisBranchId`):
     - `MEDCARE`: 2 completed POS sales orders/invoices/cash payments (`POS-MED-DT-0001`, `POS-MED-DT-0002` + `INV-MED-DT-0001`, `INV-MED-DT-0002`) + 1 posted partial sales return & cash refund (`RET-MED-DT-0001`, disposition `RESTOCK`, approved by Pharmacist `Dr. Sarah Nabil`, received by Cashier `Youssef Adel`) + 1 open `DRAFT` order (`POS-MED-DT-0003`) for immediate frontend checkout testing.
     - `ALNOUR`: 2 completed POS sales orders/invoices/cash payments (`POS-AN-HEL-0001`, `POS-AN-HEL-0002` + `INV-AN-HEL-0001`, `INV-AN-HEL-0002`) + 1 posted sales return & cash refund (`RET-AN-HEL-0001`, disposition `QUARANTINE`).
2. **Extend `DevDatabaseSeeder.cs` (Idempotent, `Development` Mode Only):**
   - Preserve existing Stage 1 idempotency (`IsAlreadySeededAsync()` checks `MEDCARE`).
   - Add an independent Stage 2 idempotency guard (`IsStage2AlreadySeededAsync()` checking `db.SalesOrders.AsNoTracking().AnyAsync(o => o.OrderNo == "POS-MED-DT-0001")`) so developers with an existing Stage 1 local database STILL receive Stage 2 seed rows on next dev boot without duplicating Stage 1 data!
   - Seed inside tenant-bound `IUnitOfWork` transactions (`ITenantContext.SetTenant(...)`) respecting `FORCE ROW LEVEL SECURITY` and all immutability triggers (`INVENTORY_TXN` inserted as `DRAFT` -> lines added -> `SaveChangesAsync()` -> `Post(now)`):
     - Exact FEFO batch deductions on `STOCK_BALANCE`, linked `SALE_ISSUE` + `SALES_RETURN_IN` ledger transactions, `SALES_INVOICE` settlement projection updates (`PARTIALLY_REFUNDED`), `SYNC_BRANCH_CURSOR` initialized cleanly, and append-only `AUDIT_LOG` entries.
3. **Append Stage 2 Testing Section to `apps/erp-backend/FRONTEND_TEST_DATA_GUIDE.md` (Strict `snake_case`):**
   - Do NOT alter Stage 1 sections (already migrated to live `snake_case` during Stage 1 Contract Export); append a new `## Stage 2 — POS Sales, Invoices, Cash Payments, Returns & Sync Test Data` section using **strict `snake_case`** JSON payloads, query parameters (`branch_id`, `status`, `from_date`, `to_date`, `invoice_no`, `payment_status`, `invoice_id`, `page`, `page_size`), native JSON decimals, and string-only enums, listing:
     - Exact deterministic IDs & document numbers for `MEDCARE` and `ALNOUR` (completed orders, invoices, cash payments, posted returns/refunds, and the ready-to-checkout `DRAFT` order).
     - Step-by-step POS checkout & return QA flows (including `BranchLocal` vs `Cloud` `404`/`403` runtime mode rules, header/optional-body `Idempotency-Key` testing + `400 MALFORMED_REQUEST` when omitted in both, `201 Created` + `Location` on `POST /api/v1/sales-orders` & `POST /api/v1/sales-returns`, `page = 1, page_size = 25` [`1..200`] pagination bounds, 14-day return window, distinct approver test user pairs, and `GET /api/v1/canonical/sales|orders|returns|capabilities`).

### 4. Mandatory Unit & Integration Tests
- `tests/PharmacyERP.IntegrationTests/Persistence/Stage2DevDatabaseSeederTests.cs` (`[SkipWhenPostgresUnavailableFact]`):
  - Runs `DevDatabaseSeeder.SeedAsync()` twice against a fresh throwaway PostgreSQL DB (`erp_it_app` + `FORCE RLS` + all triggers) and proves:
    - Idempotency (second run inserts `0` duplicate orders/invoices/returns/txns).
    - Exact counts: `MEDCARE` has 2 `COMPLETED` orders + 1 `DRAFT` order + 2 `ISSUED` invoices + 2 `CASH` payments + 1 `POSTED` return/refund; `ALNOUR` has 2 `COMPLETED` orders + 2 `ISSUED` invoices + 2 `CASH` payments + 1 `POSTED` return/refund.
    - Stock balances reconcile mathematically with `OPENING_BALANCE` - `SALE_ISSUE` + `SALES_RETURN_IN`.

### 5. Verification & Arabic Explanation Gate
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
- Run `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
- Local API dev boot check (`dotnet run --project src/PharmacyERP.Api` with `ASPNETCORE_ENVIRONMENT=Development`) confirming `DevDatabaseSeeder` completes cleanly with zero warnings/exceptions, then stop cleanly.
- Provide a concise **Arabic explanation in chat** summarizing the Stage 2 seed scenarios and the updated `FRONTEND_TEST_DATA_GUIDE.md`.

---

## Task `AH-FINAL`: Stage 2 Final Security, Performance & Architecture Audit

### 1. Task Header
- **Task ID:** `AH-FINAL`
- **Title:** Stage 2 Final Security, Performance & Architecture Audit + `stage2-dev -> main` Gate
- **Base Branch:** `stage2-dev`
- **Feature Branch:** `stage2/ahmed-hassan/ah-final-stage2-audit`
- **Execution Command:** Execute via `/stage-final-audit` applying `@.agent/rules/00-backend-guardrails.md`, `@.agent/skills/pharmacy-stage1-baseline/SKILL.md`, `@.agent/skills/pharmacy-backend-engineering/SKILL.md`, `@.agent/skills/backend-security-audit/SKILL.md`, `@.agent/skills/performance-concurrency-guard/SKILL.md`, and `@.agent/skills/architecture-unifier/SKILL.md`.

### 2. Hard Prerequisites Checklist (BLOCKING GATE)
- [ ] `AH-01` through `AH-14` merged into `stage2-dev` and pulled locally.
- [ ] `EH-FINAL`, `YA-FINAL`, and `AS-FINAL` completed and merged into `stage2-dev`.
- [ ] All **`66` live HTTP endpoints** (`48` Stage 1 + `18` new Stage 2 + updated `/api/v1/canonical/capabilities`) are registered and active on `stage2-dev`, and `ContractsArtifactSyncTests` passes.

> **BLOCKING GATE RULE:** *If ANY prerequisite above is missing or fails to compile, STOP immediately, refuse to implement this task, and inform the developer in Arabic which exact task/PR must be merged and pulled from `stage2-dev` first.*

### 3. Exhaustive Implementation Specification
Run `/stage-final-audit` across all Ahmed Hassan Stage 2 code (`AH-01`..`AH-14`) plus full `stage2-dev` release readiness and generate **`apps/erp-backend/docs/stage2-reports/ahmed-hassan-stage2-report.md`** containing:
1. **Architecture & Clean Boundary Check:** Confirm `Program.cs` & `PharmacyDbContext.cs` remain `0` lines changed, single unified `PharmacyDbContext`, single cumulative Stage 2 migration (`Stage2SalesAndOfflineSync`) in sync with `PharmacyDbContextModelSnapshot.cs`, both empty-DB and Stage 1 -> Stage 2 upgrade migrations succeed cleanly, zero Stage 3 artifacts, and all 4 modular DI files cleanly wired.
2. **Security & RLS Verification:** Confirm `31/31` tables enforce `ENABLE` + `FORCE ROW LEVEL SECURITY` under least-privilege `erp_app`, `AUDIT_LOG` retains `INSERT/SELECT` only, all immutability and deferred source-line constraint triggers are active, `RuntimeModeGuardMiddleware` enforces `Cloud` vs `BranchLocal` across all Stage 1 + Stage 2 routes, and `SyncAdminOnly`, `CanonicalRead`, `.NET` `CanonicalReader` service-token validation, Stage 2 JWT scopes (`return:read`, `return:write`, `sync:retry`), and `BRANCH_ENROLLMENT.runtime_credential_hash` verification have zero bypass paths.
3. **Concurrency, Reliability & Sync Resilience Verification:** Confirm gap-free row-locked `SYNC_BRANCH_CURSOR`, deterministic `(LocationId, BatchId)` lock ordering, canonical SHA-256 verification, head-of-line conflict blocking, and `BranchSyncBackgroundWorker` backoff/atomicity.
4. **Full Build, Test, OpenAPI Contract & Root `/contracts/` Parity Proof:** Exact outputs of:
   - `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`).
   - `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`, covering all `767` Stage 1 tests + all Stage 2 unit, integration, concurrency, sync, and contract suites).
   - `ContractsArtifactSyncTests` passing across all **`66` live HTTP endpoints** (`48` Stage 1 + `18` new Stage 2 + updated `/api/v1/canonical/capabilities`), `contracts/schemas/api-error-envelope.schema.json` (including `SYNC_CURSOR_EXPIRED`), and `contracts/schemas/canonical-capabilities.schema.json` (`stage: 2`, `Cloud`: `5` reads / `2` writes, `BranchLocal`: `0` / `0`).
   - Verified semantic parity between `apps/erp-backend/contracts/openapi.v1.json` (`66` live endpoints) and the shared monorepo-root `contracts/` package after applying the **4 Stage 2 Activation Deltas** across `contracts/openapi.erp.yaml` (preserving `x-stage`/`x-surface`/`x-runtime`/`x-roles` extensions), `contracts/schemas/{api-error-envelope.schema.json,canonical-capabilities.schema.json,common.json,canonical.json}`, `contracts/README.md`, and `contracts/FRONTEND.md` (preserving modular schemas, fixtures, and repo-root documentation — never overwriting `contracts/README.md` or duplicating `openapi.v1.json`), confirming readiness to open the final `stage2-dev -> main` PR.

### 4. Mandatory Unit & Integration Tests
- Execute the full solution test suite (`PharmacyERP.UnitTests` + `PharmacyERP.IntegrationTests`) with zero failures and zero skipped tests. Fix any audit findings with dedicated regression tests before finalizing the report.

### 5. Verification & Arabic Explanation Gate
- Confirm `apps/erp-backend/docs/stage2-reports/ahmed-hassan-stage2-report.md` is generated and complete.
- Run `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`) and `dotnet test PharmacyERP.sln --no-restore` (`100% Passed`).
- Provide a final **Arabic executive debrief in chat** summarizing the audit results, test counts, and `stage2-dev -> main` promotion readiness.
