---
name: architecture-unifier
description: Architecture, Wave 0, Wire Contract, and code consistency audit checklist across all 4 developers' modules in PharmacyERP. Use when checking Clean Architecture boundaries, DI lifetimes, Result/ApiErrorEnvelopeDto error handling, Wire Contract snake_case & OpenAPI sync, EF migrations sync, or Outbox/Audit/Idempotency integration.
---

# Architecture Unifier (Clean Architecture, Wave 0 & Wire Contracts)

## 1. Wave 0, Ownership & DI Lifetimes
- [ ] **Wave 0 Entrypoints Untouched:** `src/PharmacyERP.Api/Program.cs` and `src/PharmacyERP.Infrastructure/Persistence/Database/PharmacyDbContext.cs` have zero diff. Module `DbSet<T>`s live in partial classes (`PharmacyDbContext.<Module>.cs`).
- [ ] **Modular Feature DI & Per-Developer Ownership:** Stage 2/3 services/repositories register in modular feature DI extensions invoked from `DependencyInjection.cs` without touching other teammates' owned files.
- [ ] **No Captive Dependencies:** `PharmacyDbContext`, `ITenantContext`, `ICurrentUser`, `IUnitOfWork`, interceptors, repositories, and application services are `Scoped`. `Singleton` services (`IDateTimeProvider`, `IRuntimeModeProvider`, `JwksKeyProvider`) and `BackgroundService` (`OutboxPublisherWorker`) never inject `Scoped` services directly (use `IServiceScopeFactory`).
- [ ] **Active Cross-Module Interfaces:** Stage 2/3 code injects active `INonLotBatchInitializer` and `IProductInventoryUsageChecker` (ignoring legacy `*2.cs` compatibility interfaces while leaving Stage 1 registrations intact).

## 2. Clean / Onion Layer Boundaries
- [ ] **Domain (`PharmacyERP.Domain`):** Zero EF Core, Npgsql, ASP.NET Core, Application, or Infrastructure references. All domain exceptions inherit from `DomainException`.
- [ ] **Application (`PharmacyERP.Application`):** References ONLY `PharmacyERP.Domain` and abstractions; zero `PharmacyDbContext` or `Infrastructure` references. Never calls `DateTime.UtcNow` directly (uses `IDateTimeProvider`).
- [ ] **Api (`PharmacyERP.Api`):** Thin controllers only — zero direct `PharmacyDbContext`, `IUnitOfWork`, or repository injection.
- [ ] **Repositories:** Never call `SaveChangesAsync`; `IUnitOfWork` owns transaction lifecycle and commits.

## 3. Wire Contracts, Error Envelopes & OpenAPI Sync
- [ ] **No Swallowed Exceptions & Consistent `Result<T>`:** Zero silent `catch` blocks returning `null`/`false`/empty. Expected business failures return `Result`/`Result<T>` + `ErrorCode` mapped via `ApiResultMapper` (`201 Created` via `ToCreatedResult` for resource creation).
- [ ] **Strict `snake_case` & Enums:** Every `[FromQuery]` uses `[FromQuery(Name = "snake_case")]`; every `ApiErrorDetailDto.Field` uses exact wire `snake_case`; decimals are native JSON numbers; enums are exact case-sensitive strings (`allowIntegerValues: false`).
- [ ] **`[ProducesResponseType]` & `ContractsArtifactSyncTests`:** Every controller action declares complete `[ProducesResponseType]` attributes. Any PR adding/changing `ErrorCode`, endpoints, DTOs, or `/canonical/capabilities` updates `ContractsArtifactSyncTests.cs`, `apps/erp-backend/contracts/schemas/*.json`, `apps/erp-backend/contracts/openapi.v1.json`, and `apps/erp-backend/contracts/README.md` in the same PR.

## 4. Persistence Sync, Outbox, Audit & Readability
- [ ] **EF Core Model <-> Migrations Sync:** `PharmacyDbContextModelSnapshot.cs` and committed migrations match configurations 100% (`has-pending-model-changes` passes).
- [ ] **Outbox & Audit Atomicity:** State-changing mutations enqueue `IOutboxService` events (gapless `OutboxEventCursor` sequence) and log `IAuditLogger` entries inside the same `IUnitOfWork` transaction.
- [ ] **Readability & Hygiene:** Clean per-project `GlobalUsings.cs`, descriptive English identifiers, guard clauses, concise XML `<summary>` and *why* comments, and `0 Warning(s)`.
