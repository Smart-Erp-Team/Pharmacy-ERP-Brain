---
name: pharmacy-stage1-baseline
description: Foundational Stage 1 baseline context for PharmacyERP backend tasks and audits. Use to protect approved Stage 1 ~5% developer design adjustments, preserve cross-module integration contracts, and enforce Stage 1 vs Stage 2 vs Stage 3 boundaries.
---

# PharmacyERP Stage 1 Baseline (Protected Foundation)

## 1. On-Demand Reference Documentation (Do NOT Bulk-Load Everything)
Do **NOT** read all of `_audit_docs/` up front on every Stage 2/3 task — that wastes context window tokens. Read specific sections **only on demand** when verifying a Stage 1 contract or Blueprint rule:
- `apps/erp-backend/_audit_docs/01_master_spec/ERP-Backend-Blueprint-v1.1.md` — Frozen master spec (read only target section, e.g., §4, §6, §8, §9).
- `apps/erp-backend/_audit_docs/03_actual_docs/` — Approved Stage 1 as-built decisions (`STAGE-1-IDENTITY-AUTH-AR.md`, `STAGE1_INVENTORY_DOCUMENTATION_AND_DECISIONS.md`, `developer_4.md`) — authoritative over `02_planned_tasks/` when they differ.

## 2. Stage Boundaries
- **Stage 1 (Frozen Production Baseline — `767/767` tests, `48` live endpoints, `76` OpenAPI schemas):**
  - **Identity & Auth:** `Organization`, `Branch`, `Employee`, `UserAccount`, `UserBranchAccess`, `BranchEnrollment`, `UserRefreshToken`, JWT/JWKS (`GET /.well-known/jwks.json`), `AdminOnly` & `PlatformProvisionerOnly`.
  - **Catalog & UOM:** `ProductCategory`, `Product`, `ProductUom`, `ProductReorderRule`, `CanonicalCatalogController`.
  - **Inventory & Ledger:** `InventoryLocation`, `InventoryBatch`, `StockBalance`, `InventoryTxn`, `InventoryTxnLine`, `CanonicalInventoryController`, `InventoryLedgerImmutabilitySql`.
  - **Core Infrastructure & Integration:** `PharmacyDbContext` (single `erp_db`), `TenantRlsConnectionInterceptor`, `UnitOfWork`, `IdempotencyRecord`, `OutboxEvent`, `OutboxEventCursor`, `AuditLog`, `OutboxPublisherWorker`, `CanonicalCapabilitiesController`, `ContractsArtifactSyncTests`, middlewares.
- **Stage 2 (Active Development — Sales & Sync):** Sales orders, FEFO POS checkout, invoices/payments, sales returns/refunds, BranchLocal <-> Cloud sync engine, Stage 2 canonical reads & contract export.
- **Stage 3 (Deferred — Purchasing):** Purchase orders, goods receipts, supplier/vendor returns. **NEVER** write Stage 3 entities/endpoints during Stage 2 (except explicitly specified closed DB `CHECK` enum values such as `SyncOperationType`).

## 3. Protected Stage 1 Design Adjustments (~5% Rule)
Do NOT revert these approved as-built Stage 1 decisions unless they cause a runtime exception, security vulnerability, or broken integration:
- [ ] **Wave 0 Clean Root Files:** `Program.cs` and `PharmacyDbContext.cs` remain untouched; module `DbSet<T>` properties live in partial classes (`PharmacyDbContext.*.cs`).
- [ ] **Dual Cross-Module Interfaces (Stage 1 Compatibility):** Stage 1 `ProductInventoryUsageChecker` / `NonLotBatchInitializer` implement both `v1` and `*2` interfaces so Stage 1 modules remain unbroken. **In new Stage 2/3 code, inject ONLY the active `INonLotBatchInitializer` and `IProductInventoryUsageChecker` (ignore `*2.cs` interfaces).**
- [ ] **Optional UOM Repo in `InventoryAdjustmentService`:** `IProductUomRepository? productUomRepo = null` with `1m` fallback preserves unit test compatibility.
- [ ] **Canonical Inventory DTO:** `CanonicalInventoryItemDto` intentionally omits `reserved_quantity` in Stage 1.
- [ ] **Explicit `GetByIdAsync` in `InventoryLocationService`:** Fetches by `(organizationId, locationId)` before checking `_currentUser.CanAccessBranch(location.BranchId)`.
- [ ] **`TenantUserStore` Adapter:** Registered as `IUserPasswordStore<UserAccount>` while `AuthService` uses `PasswordHasherService` directly.
- [ ] **In-Memory vs. Npgsql Unit Test Workarounds:** `Address` `ComplexProperty` workarounds and `IsSystemBypassEnabled` mocks in `UnitTests` are intentional.

## 4. Protected Stage 1 Cross-Module Contracts
Never break these live contracts when extending the backend in Stage 2/3:
- [ ] `OrganizationProvisioningService` & `BranchService` -> `IBranchDefaultLocationSeeder` inside the active transaction.
- [ ] `ProductService` / `ProductUomService` -> `INonLotBatchInitializer` and `IProductInventoryUsageChecker`.
- [ ] All write services inject `IUnitOfWork`, `ITenantContext`, `ICurrentUser`, `IDateTimeProvider`, `IAuditLogger`, `IIdempotencyService`, `IOutboxService` explicitly via constructor injection.
- [ ] Anonymous discovery flows (`login`, `refresh`, `branch-enrollment`, `organizations`) use short discovery transactions with `AllowSystemBypass()`, then call `ITenantContext.SetTenant(orgId)` (clearing bypass) before starting the tenant-bound transaction.
