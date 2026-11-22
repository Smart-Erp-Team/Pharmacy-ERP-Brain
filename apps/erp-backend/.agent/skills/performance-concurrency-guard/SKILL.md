---
name: performance-concurrency-guard
description: Runtime reliability, concurrency, and performance audit checklist for PharmacyERP. Use when auditing inventory/stock ledger mutations, EF Core queries, async/await code, and null safety for race conditions, missing RowVersion/transactions, NullReferenceException traps, async deadlocks, N+1 queries, missing AsNoTracking, or dropped CancellationTokens.
---

# Performance & Concurrency Guard

## 1. Inventory & Stock Ledger Race Conditions
- [ ] **Explicit Database Transactions:** Every multi-step write (especially `InventoryAdjustmentService`, `StockBalance` updates, `InventoryTxn` + `InventoryTxnLine` posting, `OutboxEventCursor` sequence allocation, and `OrganizationProvisioningService`) MUST be wrapped in an explicit `IUnitOfWork.BeginTransactionAsync` / `CommitTransactionAsync` / `RollbackTransactionAsync` block. Note: `TenantRlsConnectionInterceptor` also enforces an active transaction on tenant-scoped commands.
- [ ] **Optimistic Concurrency (`RowVersion`):**
  - Verify `StockBalance` and other concurrency-sensitive entities configure `IsConcurrencyToken()` on `row_version` (`RowVersion++` on mutation) and handle `DbUpdateConcurrencyException` cleanly (e.g., retry or map to `409 Conflict`, never silently overwrite).
- [ ] **Atomic Sequence Allocation:** `OutboxEventCursor` updates must lock the organization's cursor row within the active transaction (`SELECT ... FOR UPDATE` or equivalent) to prevent duplicate `EventSequence` under concurrent requests.
- [ ] **Immutable Posted Ledger:** Posted `InventoryTxn` / `InventoryTxnLine` records must never be mutated in place; corrections must use `REVERSAL` transactions.

## 2. `NullReferenceException` & InvalidOperation Traps
- [ ] **Unsafe `.First()` / `.Single()`:** Flag `.First()`, `.Single()`, `.Last()` without `OrDefault` when a record might not exist; prefer `.FirstOrDefaultAsync(ct)` / `.SingleOrDefaultAsync(ct)` followed by an explicit null check returning `Result.Failure(ErrorCode.NOT_FOUND, ...)`.
- [ ] **Un-Included Navigation Properties:** Check every access to navigation properties (e.g., `user.Employee`, `user.BranchAccesses`, `product.Uoms`, `txn.Lines`, `balance.Batch`) to ensure the repository query explicitly uses `.Include(...)` / `.ThenInclude(...)` or projects via `.Select(...)` (lazy loading is not enabled).
- [ ] **Nullable Reference & Collection Safety:** Check `.Value` on `Nullable<T>` (`Guid?`, `DateTimeOffset?`, `decimal?`) without `.HasValue` guards, and verify repository/mock returns do not return `null` for `IReadOnlyList<T>` / `List<T>`.

## 3. Async Deadlocks & Blocking Calls
- [ ] **Zero Sync-Over-Async:** Search all `.cs` files for `.Result`, `.Wait()`, `.GetAwaiter().GetResult()`, `Task.Run(...).Result`, or synchronous EF Core calls (`ToList()`, `FirstOrDefault()`, `SaveChanges()`) inside async methods. Every I/O path must be `async`/`await` end-to-end.

## 4. EF Core Query Performance (N+1 & Tracking)
- [ ] **N+1 Queries Inside Loops:** Flag any `await _repository.*` or `await _dbContext.*` call inside `foreach`, `for`, or `while` loops (e.g., loading `ProductUom`, `InventoryBatch`, or `StockBalance` per line item). Batch-fetch with `Contains(...)` / dictionary lookup before the loop.
- [ ] **Missing `AsNoTracking()` on Read-Only Queries:** All read-only list, search, pagination (`PagedResult<T>`), and canonical export queries in Repositories must use `.AsNoTracking()` (unless entities are intentionally tracked for subsequent mutation in the same UoW).
- [ ] **Unbounded Queries:** Flag `.ToListAsync()` on tables that grow unbounded (`OutboxEvents`, `AuditLogs`, `InventoryTxns`, `Products`, `StockBalances`) without `.Take(...)`, cursor pagination, or `Skip`/`Take` limits.

## 5. `CancellationToken` Propagation
- [ ] **End-to-End Propagation:** Every `async` Controller action, Application Service method, Repository method, `IUnitOfWork` call, and EF Core LINQ call (`ToListAsync(ct)`, `FirstOrDefaultAsync(ct)`, `AnyAsync(ct)`, `SaveChangesAsync(ct)`) MUST accept and forward `CancellationToken ct = default`.
- [ ] **Background Worker Cancellation:** `OutboxPublisherWorker` must pass `stoppingToken` into `ProcessPendingOutboxBatchAsync` and `Task.Delay` without swallowing `OperationCanceledException` when `stoppingToken.IsCancellationRequested` is true.
