---
name: pharmacy-backend-engineering
description: Core Stage 2 and Stage 3 backend engineering patterns for PharmacyERP grounded in the Stage 1 codebase. Use when implementing Domain entities, EF Core configurations and migrations, Application services, API controllers, Wire Contracts / OpenAPI sync, PostgreSQL RLS/immutability rules, and Unit/Integration tests inside apps/erp-backend/.
---

# PharmacyERP Backend Engineering Skill (Stage 2 & Stage 3)

Use this skill alongside `.agent/rules/00-backend-guardrails.md` and `.agent/skills/pharmacy-stage1-baseline/SKILL.md` whenever building or modifying features in `apps/erp-backend/`.

## Progressive Disclosure — Read Only the References Needed for Your Task

Do **NOT** load every reference on simple tasks (e.g., enum-only tasks do not need API/integration test references). Load only the slice(s) relevant to the files your task touches:

| Task Touches | Reference File to Read |
| :--- | :--- |
| Domain entities, enums, precision/rounding, EF Core configurations, partial `PharmacyDbContext`, migrations, PostgreSQL RLS, `DatabaseRoleSecuritySql`, immutability triggers, `FOR UPDATE` locking | [Domain, EF Core & PostgreSQL RLS](./references/domain-and-ef-rls.md) |
| Application services, DTOs, validators, `Result<T>` & `ErrorCode`, explicit `IUnitOfWork` read/write transactions, API controllers, `[AllowHeaderIdempotencyKey]`, `RuntimeModeGuardMiddleware`, strict `snake_case` wire contracts, `[ProducesResponseType]`, `ContractsArtifactSyncTests` & `openapi.v1.json` sync | [Application, API & Wire Contracts](./references/application-api-contracts.md) |
| Unit tests, Integration tests (`ThrowawayPostgresDatabaseProvisioner`, `erp_it_app`, `[SkipWhenPostgresUnavailableFact]`), two-tier test execution, and anti-tautology test rules | [Testing & Verification Patterns](./references/testing-patterns.md) |

---

## Core Invariants (Always Apply)

1. **Wave 0 Clean Root Files:** Never touch `src/PharmacyERP.Api/Program.cs` or `src/PharmacyERP.Infrastructure/Persistence/Database/PharmacyDbContext.cs`. Use modular feature DI extensions and `PharmacyDbContext.<Module>.cs` partials.
2. **Tenant & Branch Security:** Derive `OrganizationId` exclusively from `ITenantContext` / JWT claims. Verify `_currentUser.CanAccessBranch(branchId)` (`403 FORBIDDEN_BRANCH`). Every new tenant table requires `ENABLE` + `FORCE ROW LEVEL SECURITY`, `tenant_isolation_policy`, composite tenant-scoped FKs (`DeleteBehavior.Restrict`), and `erp_app` grants.
3. **Explicit Transactions Everywhere:** `TenantRlsConnectionInterceptor` rejects commands outside an active transaction. Wrap every read (`BeginTransactionAsync` -> `RollbackTransactionAsync(CancellationToken.None)`) and write (`BeginTransactionAsync` -> `CommitTransactionAsync` / rollback on failure or `Result.Failure`).
4. **No Raw Exceptions for Expected Business Failures:** Return `Result` / `Result<T>` + `ErrorCode`, mapped in thin controllers via `ApiResultMapper`.
5. **Strict Wire Contract:** `snake_case` everywhere (`[FromQuery(Name = "...")]`, `ApiErrorDetailDto.Field`), decimals as native JSON numbers, enums as exact case-sensitive strings (`allowIntegerValues: false`), complete `[ProducesResponseType]`, and synchronized `ContractsArtifactSyncTests` + `contracts/openapi.v1.json`.
6. **Zero-Warning & Zero-Skip Gate:** `dotnet build PharmacyERP.sln --no-restore` (`0 Error(s), 0 Warning(s)`) and `dotnet test PharmacyERP.sln --no-restore` (`100% Passed, 0 Failed, 0 Skipped`).
