---
name: architecture-unifier
description: Architecture and code consistency audit checklist across all 4 developers' modules in PharmacyERP. Use when checking Clean Architecture boundaries, DI lifetime mismatches in DependencyInjection.cs or Program.cs, consistent Result/ApiErrorEnvelopeDto error handling, swallowed exceptions, or Outbox/Audit/Idempotency integration.
---

# Architecture Unifier (Clean Architecture & Cross-Module Consistency)

## 1. Dependency Injection & Lifetime Audit (`Program.cs` & `DependencyInjection.cs`)
- [ ] **Wave 0 Entrypoint Cleanliness:** Verify `Program.cs` only wires `AddApplicationServices()`, `AddInfrastructureServices(builder.Configuration)`, `AddApiServices()`, `UsePharmacyErpMiddlewares()`, and `MapControllers()`.
- [ ] **No Captive Dependencies:**
  - `PharmacyDbContext`, `ITenantContext`, `ICurrentUser`, `IUnitOfWork`, `TenantRlsConnectionInterceptor`, all Repositories, and all Application Services MUST be `Scoped`.
  - `Singleton` services (`IDateTimeProvider`, `IRuntimeModeProvider`, `JwksKeyProvider`) and `BackgroundService` (`OutboxPublisherWorker`) MUST NEVER inject `Scoped` services (`PharmacyDbContext`, `ITenantContext`, `IUnitOfWork`, Repositories) directly via constructor. Background workers must use `IServiceScopeFactory.CreateScope()`.
- [ ] **No Duplicate/Conflicting Registrations:** Verify `TryAddScoped` temporary fallbacks in `Application/DependencyInjection.cs` (`TemporaryNonLotBatchInitializer`, `TemporaryProductInventoryUsageChecker`) are cleanly overridden by `Infrastructure/DependencyInjection.cs` (`NonLotBatchInitializer`, `ProductInventoryUsageChecker`) and both `v1` and `2` cross-module interfaces resolve to the real implementations.

## 2. Clean Architecture / Onion Layer Boundaries
- [ ] **Domain (`PharmacyERP.Domain`) Purity:**
  - Zero references to `Microsoft.EntityFrameworkCore`, `Microsoft.AspNetCore.*`, `PharmacyERP.Application`, or `PharmacyERP.Infrastructure`.
  - All domain exceptions inherit from `PharmacyERP.Domain.Exceptions.DomainException`.
- [ ] **Application (`PharmacyERP.Application`) Purity:**
  - References ONLY `PharmacyERP.Domain` (and abstractions). Zero references to `PharmacyERP.Infrastructure` or `PharmacyDbContext`.
  - Services use repository interfaces, `IUnitOfWork`, `ITenantContext`, `ICurrentUser`, `IDateTimeProvider`, `IAuditLogger`, `IIdempotencyService`, `IOutboxService` via explicit constructor injection.
- [ ] **Api (`PharmacyERP.Api`) Thin Controllers:**
  - Controllers MUST NOT inject `PharmacyDbContext` or `IUnitOfWork` or `IGenericRepository<T>` directly.
  - Controllers only validate model/headers, delegate to Application services, and map `Result` / `Result<T>` to HTTP responses.
- [ ] **Single `PharmacyDbContext`:** Confirm no developer created a second `DbContext` class; all module `DbSet`s live in `PharmacyDbContext.*.cs` partial classes.

## 3. Consistent Error Handling & Response Envelopes
- [ ] **No Swallowed Exceptions:** Flag any `catch` block that silently returns `null`, `false`, `default`, or an empty list without logging/re-throwing or returning a structured `Result.Failure(...)`.
- [ ] **Consistent `Result<T>` & `ErrorCode` Usage:**
  - Expected business/validation failures should return `Result` / `Result<T>` using `ErrorCode` enum values and `ErrorMessages` constants (avoid magic strings).
  - Unexpected/domain invariant violations throw `AppException` or `DomainException` so `ExceptionHandlingMiddleware` produces a uniform `ApiErrorEnvelopeDto` (`errorCode`, `message`, `details`, `traceId`).
- [ ] **No `SaveChanges` Inside Repositories:** Repositories only query/add/update/remove; `IUnitOfWork` owns `BeginTransactionAsync`, `SaveChangesAsync`, `CommitTransactionAsync`, and `RollbackTransactionAsync`.

## 4. Cross-Module & Outbox/Audit/Idempotency Consistency
- [ ] **Idempotency on Mutations:** Mutating endpoints that accept `Idempotency-Key` must check `IIdempotencyService` with `CanonicalJsonHasher` SHA-256 payload hashing and return `409 Conflict` (`IDEMPOTENCY_MISMATCH`) on payload mismatch.
- [ ] **Transactional Outbox & Sequence Ordering:** Domain events must be written via `IOutboxService` inside the same `IUnitOfWork` transaction as the state change, allocating gapless sequences from `OutboxEventCursor`.
- [ ] **Audit Logging:** Security-sensitive and state-changing operations must record immutable `AuditLog` entries via `IAuditLogger` with accurate `AuditActorType` (`USER`, `SYSTEM`, `AI_ASSISTED` with `SourcePromptId`).
- [ ] **Outbox Worker Resilience:** `OutboxPublisherWorker` must process events in `OrganizationId`, `EventSequence` order inside a scoped transaction with `AllowSystemBypass()` and record failures via `RecordPublishFailure(...)` without crashing the host loop.
