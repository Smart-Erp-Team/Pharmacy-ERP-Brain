---
name: performance-concurrency-guard
description: Runtime reliability, concurrency, and performance audit checklist for PharmacyERP across Stage 1, Stage 2 (Sales & Sync), and Stage 3 (Purchasing). Use when auditing stock/FEFO/cash/sync mutations, EF Core queries, indexes, pagination, async/await code, and null safety.
---

# Performance & Concurrency Guard (Stage 1 / Stage 2 / Stage 3)

## 1. Concurrency, Locking & Financial Race Conditions
- [ ] **Explicit Transactions:** Every multi-step write (stock adjustments, FEFO checkout, sales returns/refunds, `OutboxEventCursor` sequence allocation, sync batch apply, org provisioning) runs inside a single `IUnitOfWork` transaction. Every `Result.Failure(...)` early return inside an active write transaction calls `RollbackTransactionAsync(CancellationToken.None)`.
- [ ] **Deterministic `FOR UPDATE` Lock Ordering:** Pessimistic row locks on `StockBalance`, `InventoryBatch`, `SalesOrder`, `SalesInvoice`, or `OutboxEventCursor` MUST acquire locks in a strict deterministic sort order (e.g., `(LocationId, BatchId)` or `(ProductId, ExpiryDate, BatchId)`) to prevent PostgreSQL deadlocks (`40P01`).
- [ ] **Optimistic Concurrency & Conflict Mapping:** Mutable aggregate roots use `RowVersion` (`.IsConcurrencyToken()`); `DbUpdateConcurrencyException` and PostgreSQL `40001`/`40P01` map cleanly to `409 CONFLICT` (never silently overwritten or returned as `500`).
- [ ] **Decimal & Rounding Integrity:** Quantities/unit costs use `numeric(18,4)` (`MidpointRounding.AwayFromZero`); monetary totals use `numeric(18,2)`; UOM conversion uses `numeric(18,6)`; tax/discount rates use `numeric(9,4)`. No `float`/`double` in financial calculations.
- [ ] **Immutable Posted Records:** Posted invoices, payments, returns, stock ledger lines, and sync results are never updated in place; corrections use explicit returns/reversals.

## 2. `NullReferenceException` & InvalidOperation Traps
- [ ] **Unsafe `.First()` / `.Single()`:** Flag `.First()`, `.Single()`, `.Last()` without `OrDefault` when rows may be absent; return `Result.Failure(ErrorCode.NOT_FOUND, ...)`.
- [ ] **Un-Included Navigation Properties:** Every accessed navigation property (`Lines`, `Batch`, `Uoms`, `Payments`, `Returns`, `Employee`) is explicitly `.Include(...)`/`.ThenInclude(...)` or projected via `.Select(...)`.
- [ ] **Nullable Guards:** No `.Value` on `Nullable<T>` without `.HasValue` checks; repositories never return `null` for `IReadOnlyList<T>`.

## 3. Async Hygiene & `CancellationToken`
- [ ] **Zero Sync-Over-Async:** Zero `.Result`, `.Wait()`, `.GetAwaiter().GetResult()`, or sync EF Core calls (`ToList()`, `FirstOrDefault()`, `SaveChanges()`) inside async methods.
- [ ] **End-to-End `CancellationToken`:** Every async controller, service, repository, and EF LINQ call forwards `CancellationToken ct` (reserving `CancellationToken.None` strictly for `RollbackTransactionAsync` in `catch`/`finally`).

## 4. EF Core Query Performance, Indexes & Pagination
- [ ] **Zero N+1 Query Loops:** Flag `await _repository.*` / `await _dbContext.*` inside `foreach`/`for`/`while`. Batch-fetch via `GetByIdsAsync` / `GetActiveBaseUomsByProductIdsAsync` / `GetOrCreateForUpdateBatchAsync`; use `.AsSplitQuery()` when including multiple collections.
- [ ] **`.AsNoTracking()` on Read Queries:** Every read-only query uses `.AsNoTracking()` and lean projections where full entity graphs are unnecessary.
- [ ] **Bounded Pagination & Indexes:** Standard ERP lists enforce `page >= 1` and `1 <= page_size <= 200` (`422` out-of-range); canonical lists use cursor pagination (`OUTBOX_EVENT.event_sequence`). Composite/partial indexes in `IEntityTypeConfiguration<T>` are prefixed by `organization_id` (and `branch_id`) matching real `WHERE`/`ORDER BY` clauses.
