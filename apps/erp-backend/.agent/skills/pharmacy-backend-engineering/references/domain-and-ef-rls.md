# Domain, EF Core, Migrations & PostgreSQL RLS Reference

## 1. Domain Layer (`src/PharmacyERP.Domain/`)

### 1.1 Entities & Invariants
- Place module entities in `src/PharmacyERP.Domain/Entities/<Module>/` (`Sales/`, `Purchasing/`, matching `Identity/`, `Catalog/`, `Inventory/`, `Integration/`).
- Every tenant-owned entity MUST expose `public Guid OrganizationId { get; private set; }` (required for `PharmacyDbContext`'s dynamic global query filter and PostgreSQL RLS).
- Enforce structural invariants inside entity constructors, factory methods (including explicit-ID overloads where deterministic sync replay requires them), and state-transition methods:
  - Validate required IDs (`Guid.Empty`), non-empty trimmed codes/names, non-negative quantities/prices/amounts, and valid state transitions (`DRAFT -> COMPLETED`, `DRAFT -> POSTED`, etc.).
  - Throw `DomainException` (or module-specific subclasses under `src/PharmacyERP.Domain/Exceptions/`, e.g., `SalesDomainException`, `SyncDomainException`, `PurchasingDomainException`) only for impossible domain invariants.
  - Keep entities persistence-ignorant (zero EF Core, Npgsql, or ASP.NET Core attributes/references) with private parameterless constructors for EF Core.

### 1.2 Enums & Closed Value Sets
- Define enums under `src/PharmacyERP.Domain/Enums/`.
- Enums serialize as **exact case-sensitive string names** both in JSON (`JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false)` in `DependencyInjection.ApiJsonSerializerOptions`) and in PostgreSQL (`.HasConversion<string>()`).
- Every enum or closed string column MUST have a matching **exact case-sensitive PostgreSQL `CHECK` constraint** (e.g., `status IN ('DRAFT', 'POSTED', 'CANCELLED')`).

### 1.3 Value Objects & Financial / Quantity Precision
- Reuse `Address` (`src/PharmacyERP.Domain/ValueObjects/Address.cs`) and `DeterministicBatchIdGenerator` (`src/PharmacyERP.Domain/ValueObjects/DeterministicBatchIdGenerator.cs`) where applicable.
- Follow Blueprint decimal precision & rounding conventions strictly:
  - **Quantities, unit prices, unit costs, stock balances:** `numeric(18,4)` — round derived base quantities (`entered_qty * conversion_snapshot`) and base unit costs to 4 decimal places (`MidpointRounding.AwayFromZero`).
  - **Monetary document totals (line totals, subtotals, tax amounts, discounts, invoice/receipt grand totals, payments, refunds, cash drawer counts):** `numeric(18,2)` — round monetary totals to 2 decimal places (`MidpointRounding.AwayFromZero`).
  - **UOM conversion factors (`conversion_to_base`, `conversion_snapshot`):** `numeric(18,6)`.
  - **Tax / discount rates (`tax_rate`, percentage rates in `[0, 1]`):** `numeric(9,4)`.

---

## 2. Persistence & EF Core (`src/PharmacyERP.Infrastructure/Persistence/`)

### 2.1 Wave 0 `PharmacyDbContext` Partial Classes
- **NEVER edit `src/PharmacyERP.Infrastructure/Persistence/Database/PharmacyDbContext.cs`.**
  It already applies `ApplyConfigurationsFromAssembly(...)`, attaches the dynamic `OrganizationId` tenant global query filter, and enforces `DeleteBehavior.Restrict`.
- Add module `DbSet<T>` properties in dedicated partial classes:
  - Stage 2 Sales/Sync: `PharmacyDbContext.Sales.cs` (and/or `PharmacyDbContext.Sync.cs` as specified by the task)
  - Stage 3 Purchasing: `PharmacyDbContext.Purchasing.cs`

### 2.2 Entity Type Configurations (`Configurations/<Module>/<Entity>Configuration.cs`)
Create **one `IEntityTypeConfiguration<T>` per entity**:
- **Table & Schema:** `builder.ToTable("UPPER_SNAKE_NAME", "<schema>")` (e.g., `"sales"`, `"purchasing"`, `"inventory"`, `"integration"`).
- **Columns:** Explicit `snake_case` `.HasColumnName(...)`, explicit `.HasColumnType(...)` (`varchar(N)`, `char(2)`/`char(3)`, `numeric(18,4)` / `numeric(18,2)` / `numeric(18,6)` / `numeric(9,4)`, `timestamptz`, `date`), and `.ValueGeneratedNever()` on client-generated GUID PKs.
- **Address Mapping:**
  - Required `Address`: `builder.ComplexProperty(x => x.Address, ...)` mapping `address_line1`, `address_line2`, `address_city`, `address_region`, `address_postal_code`, `address_country_code`.
  - Optional `Address?`: `builder.OwnsOne(x => x.Address, ...)` with the exact same `address_*` column names and types.
- **Composite Alternate Keys & Tenant-Scoped FKs:**
  - Declare `builder.HasAlternateKey(x => new { x.OrganizationId, x.<EntityId> });` (and include `BranchId` or `ProductId` when cross-field integrity applies).
  - Configure all tenant-scoped FKs as composite keys with `.HasPrincipalKey(...)` and `.OnDelete(DeleteBehavior.Restrict)`:
    ```csharp
    builder.HasOne<Branch>()
        .WithMany()
        .HasForeignKey(x => new { x.OrganizationId, x.BranchId })
        .HasPrincipalKey(x => new { x.OrganizationId, x.BranchId })
        .OnDelete(DeleteBehavior.Restrict);
    ```
- **Check Constraints & Indexes:**
  - Add `HasCheckConstraint` for every enum string set, non-negative amount/quantity, and range invariant.
  - Add composite indexes prefixed by `OrganizationId` (and `BranchId` when branch-scoped) matching real `WHERE`, `JOIN`, and `ORDER BY` clauses. Use partial unique indexes (`.HasFilter(...)`) where nullable or active-only uniqueness applies.
- **Concurrency & Deterministic Locking:**
  - Add `RowVersion` (`long`, column `row_version`, `.IsConcurrencyToken().IsRequired()`) on mutable aggregate roots subject to concurrent updates.
  - Acquire pessimistic `FOR UPDATE` row locks in a **strict deterministic sort order** (e.g., ordered by `(LocationId, BatchId)` or `(ProductId, ExpiryDate, BatchId)`) to eliminate PostgreSQL deadlocks (`40P01`).

### 2.3 Migrations, PostgreSQL RLS, Least-Privilege Grants & Immutability Triggers
Command (run from `apps/erp-backend/`):
```powershell
dotnet ef migrations add <Name> --project src/PharmacyERP.Infrastructure/PharmacyERP.Infrastructure.csproj --startup-project src/PharmacyERP.Api/PharmacyERP.Api.csproj --output-dir Persistence/Migrations
```
Every schema/table migration MUST wire:
1. **RLS Protection:** Register every new tenant-owned table in `src/PharmacyERP.Infrastructure/Persistence/Triggers/RlsAndAuditProtectionSql.cs` and execute `RlsAndAuditProtectionSql.GenerateEnableRlsSql(schema, table)` in `Up(...)` (`ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, `tenant_isolation_policy`).
2. **Schema & Least-Privilege Grants (`erp_app`):** Whenever adding a new schema or table:
   - Create schema (`CREATE SCHEMA IF NOT EXISTS <schema> AUTHORIZATION erp_migrator;` or migration SQL).
   - Update `src/PharmacyERP.Infrastructure/Persistence/Security/DatabaseRoleSecuritySql.cs`:
     - Add schema to `TableRlsStatusCheckSql` (enforced by `DatabaseSecurityStartupCheck`).
     - Update `GenerateRoleProvisioningTemplateSql()` and `GenerateAppRoleGrantsSql()` for `erp_app`.
     - Invoke `DatabaseRoleSecuritySql.GenerateAppRoleGrantsSql()` in `Up(...)`.
3. **Immutability Triggers:** For posted financial/ledger/sync documents that must never be mutated/deleted after posting, add `BEFORE UPDATE OR DELETE` trigger SQL under `src/PharmacyERP.Infrastructure/Persistence/Triggers/` (following `InventoryLedgerImmutabilitySql.cs`) and invoke it in both the migration and `ThrowawayPostgresDatabaseProvisioner`.
4. **Model Snapshot Sync:** Confirm `dotnet ef migrations has-pending-model-changes` reports zero pending changes.

### 2.4 Repository Query Hygiene
- Use `.AsNoTracking()` on **every** read-only query.
- Avoid N+1 loops: batch-fetch related entities (`GetByIdsAsync`, `GetActiveBaseUomsByProductIdsAsync`, `GetOrCreateForUpdateBatchAsync`) and use `.AsSplitQuery()` when including multiple collections.
- Propagate `CancellationToken ct` to every async EF Core call; never call `SaveChangesAsync` inside repositories (`IUnitOfWork` owns commits/rollbacks).
