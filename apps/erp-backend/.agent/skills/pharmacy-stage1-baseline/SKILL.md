---
name: pharmacy-stage1-baseline
description: Foundational Stage 1 baseline context for PharmacyERP backend audits. Use before auditing any backend module (Identity, Catalog, Inventory, Integration) to enforce Stage 1 vs Stage 2/3 scope boundaries, protect approved ~5% developer design adjustments, and verify cross-module integration contracts.
---

# PharmacyERP Stage 1 Baseline

## 1. Mandatory Pre-Audit Reading
Before auditing, refactoring, or reviewing any file in `apps/erp-backend/`, read the baseline documentation located at `apps/erp-backend/_audit_docs/`:
1. `apps/erp-backend/_audit_docs/01_master_spec/ERP-Backend-Blueprint-v1.1.md` — Master architecture, database schema, and API contract specification.
2. `apps/erp-backend/_audit_docs/02_planned_tasks/` — Module task specs for all 4 developers:
   - `Developer-1-Identity-And-Auth.md` & `Dev1-Updates.md`
   - `Developer-2-Catalog-And-UOM.md`
   - `Developer-3-Inventory-And-Ledger.md`
   - `Developer-4-Core-Infrastructure-And-Integration.md`
3. `apps/erp-backend/_audit_docs/03_actual_docs/` — **Approved As-Built Baseline** (authoritative over planned specs when they differ):
   - `STAGE-1-IDENTITY-AUTH-AR.md` (Developer 1)
   - `STAGE1_INVENTORY_DOCUMENTATION_AND_DECISIONS.md` (Developer 3)
   - `developer_4.md` (Developer 4)

## 2. Stage 1 Scope vs. Deferred Stage 2/3 Boundaries
- **In Scope (Stage 1):**
  - **Identity & Auth (Dev 1):** `Organization`, `Branch`, `Employee`, `UserAccount`, `UserBranchAccess`, `BranchEnrollment`, `UserRefreshToken`, JWT/JWKS (`GET /.well-known/jwks.json`), `AdminOnly` & `PlatformProvisionerOnly` policies.
  - **Catalog & UOM (Dev 2):** `ProductCategory`, `Product`, `ProductUom`, `ProductReorderRule`, `CanonicalCatalogController`.
  - **Inventory & Ledger (Dev 3):** `InventoryLocation`, `InventoryBatch`, `StockBalance`, `InventoryTxn`, `InventoryTxnLine`, `CanonicalInventoryController`, `InventoryLedgerImmutabilitySql`.
  - **Core Infrastructure & Integration (Dev 4):** `PharmacyDbContext` (single `erp_db`), `TenantRlsConnectionInterceptor`, `UnitOfWork`, `IdempotencyRecord`, `OutboxEvent`, `OutboxEventCursor`, `AuditLog`, `OutboxPublisherWorker`, `CanonicalCapabilitiesController`, middlewares (`TraceparentMiddleware`, `ExceptionHandlingMiddleware`, `TenantResolutionMiddleware`, `RuntimeModeGuardMiddleware`).
- **Out of Scope (Deferred to Stage 2 & Stage 3):**
  - **Stage 2 (Sales):** POS/Sales orders, invoices, sales returns, customer-facing checkout (`Domain/Entities/Sales`, `Application/Features/Sales`).
  - **Stage 3 (Purchasing):** Purchase orders, goods receipts, supplier/vendor returns (`Domain/Entities/Purchasing`, `Application/Features/Purchasing`).
  - **Rule:** NEVER flag missing Stage 2/3 endpoints, services, or repositories as Stage 1 bugs.

## 3. Protected Developer Design Adjustments (~5% Rule)
Treat the documented as-built decisions in `apps/erp-backend/_audit_docs/03_actual_docs/` as the **approved baseline**. Do NOT revert them to match `01_master_spec/` or `02_planned_tasks/` unless they introduce a runtime exception, security vulnerability, or broken integration:
- [ ] **Wave 0 Clean Root Files:** `Program.cs` only calls `AddApplicationServices()`, `AddInfrastructureServices(builder.Configuration)`, `AddApiServices()`, `UsePharmacyErpMiddlewares()`, and `MapControllers()`. `PharmacyDbContext.cs` remains minimal (dynamic `OrganizationId` global query filter + `DeleteBehavior.Restrict`), with module `DbSet`s in partial classes (`PharmacyDbContext.Identity.cs`, `.Catalog.cs`, `.Inventory.cs`, `.Integration.cs`). No per-module EF Migrations.
- [ ] **Dual Cross-Module Interfaces:** `ProductInventoryUsageChecker` implements both `IProductInventoryUsageChecker` and `IProductInventoryUsageChecker2`; `NonLotBatchInitializer` implements both `INonLotBatchInitializer` and `INonLotBatchInitializer2`. Both are registered in `Infrastructure/DependencyInjection.cs` so Catalog (`Dev 2`) and Inventory (`Dev 3`) work without breaking either contract.
- [ ] **Optional UOM Repo in `InventoryAdjustmentService`:** `IProductUomRepository? productUomRepo = null` with `1m` fallback preserves unit test compatibility while supporting real UOM conversion.
- [ ] **Canonical Inventory DTO:** `CanonicalInventoryItemDto` intentionally omits `reserved_quantity` in Stage 1.
- [ ] **Explicit `GetByIdAsync` in `InventoryLocationService`:** Fetches the location by `(organizationId, locationId)` before checking `_currentUser.CanAccessBranch(location.BranchId)` (replacing earlier `Guid.Empty` placeholder).
- [ ] **`TenantUserStore` Adapter:** Registered as `IUserPasswordStore<UserAccount>` while `AuthService` uses `PasswordHasherService` directly. Do not force `UserManager<UserAccount>` migration.
- [ ] **In-Memory vs. Npgsql Test Workarounds:** `Address` `ComplexProperty` workarounds and `IsSystemBypassEnabled` mocks in `UnitTests` are intentional.

## 4. Cross-Module Integration Contracts Checklist
Verify these integration points remain intact across the 4 developers' modules:
- [ ] **Dev 1 ↔ Dev 3:** `OrganizationProvisioningService` and `BranchService` invoke `IBranchDefaultLocationSeeder` inside the active transaction to seed default locations for new branches.
- [ ] **Dev 2 ↔ Dev 3:** `ProductService` / `ProductUomService` invoke `INonLotBatchInitializer` (for `LotTrackingRequired == false`) and `IProductInventoryUsageChecker` (before mutating `BaseUomCode`, `LotTrackingRequired`, `ConversionToBase`, or `IsBase`).
- [ ] **Dev 1/2/3 ↔ Dev 4:** All write services inject `IUnitOfWork`, `ITenantContext`, `ICurrentUser`, `IDateTimeProvider`, `IAuditLogger`, `IIdempotencyService`, and `IOutboxService` explicitly via constructor injection (no fat `IUnitOfWork` repository properties).
- [ ] **Dev 1 ↔ Dev 4:** Anonymous discovery flows (`login`, `refresh`, `branch-enrollment`, `organizations`) use short discovery transactions with `AllowSystemBypass()`, then call `ITenantContext.SetTenant(orgId)` (which clears `IsSystemBypassEnabled`) before starting the tenant-bound write transaction.
