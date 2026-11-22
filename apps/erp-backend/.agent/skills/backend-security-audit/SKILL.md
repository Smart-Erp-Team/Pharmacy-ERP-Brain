---
name: backend-security-audit
description: Deep security audit checklist for PharmacyERP ASP.NET Core Web API and EF Core. Use when auditing controllers, auth endpoints, JWT/JWKS, multi-tenancy, PostgreSQL RLS, DTOs, logging, or raw SQL for authorization gaps, IDOR, mass assignment, secret exposure, or SQL injection.
---

# Backend Security Audit (ASP.NET Core & EF Core)

## 1. Authentication & Authorization (`[Authorize]` / Policies / Roles)
- [ ] **Controller & Endpoint Attributes:** Every controller/action in `PharmacyERP.Api/Controllers/` has `[Authorize]` (or explicit policy `[Authorize(Policy = "AdminOnly")]` / `[Authorize(Policy = "PlatformProvisionerOnly")]`) unless it is intentionally anonymous (`POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/branch-enrollment`, `GET /.well-known/jwks.json`).
- [ ] **No Missing Policy Enforcement:** Verify admin-only mutations (branch creation/update, enrollment token issuance, employee create/update, user management, password reset, session revocation) require `"AdminOnly"`, and organization provisioning requires `"PlatformProvisionerOnly"`.
- [ ] **Runtime Mode Guard:** Verify `RuntimeModeGuardMiddleware` blocks Cloud-only endpoints in `BranchLocal` mode and BranchLocal-only mutations in `Cloud` mode, and `BranchLocal` tokens enforce `BranchScope.ASSIGNED` scoped to the enrolled branch.
- [ ] **JWT Validation:** Confirm `PharmacyERP.Api/DependencyInjection.cs` validates `Issuer`, `Audience`, `Lifetime`, `RequireExpirationTime`, `RequireSignedTokens`, and restricts `ValidAlgorithms` to `SecurityAlgorithms.RsaSha256` with `MapInboundClaims = false`.

## 2. Multi-Tenancy, Branch IDOR & PostgreSQL RLS Bypasses
- [ ] **Never Trust Client-Sent `TenantId` / `OrganizationId` / `BranchId`:**
  - All tenant-scoped queries and commands MUST derive `OrganizationId` from `ITenantContext.OrganizationId` (populated from the authenticated `"organization_id"` JWT claim in `TenantResolutionMiddleware`), NEVER from request body, route, or query string.
  - All branch-scoped operations MUST validate branch access via `ICurrentUser.CanAccessBranch(branchId)` (checking `"branch_scope"` and `"branch_ids"` claims), returning `ErrorCode.FORBIDDEN_BRANCH` (`403`) on mismatch.
- [ ] **`TenantResolutionMiddleware` Bypass Prefix Audit:**
  - Verify `SystemBypassPathPrefixes` (`/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/branch-enrollment`, `/api/v1/organizations`, `/api/v1/canonical/capabilities`) cannot be abused to bypass tenant binding on authenticated or tenant-scoped routes.
- [ ] **`IsSystemBypassEnabled` & `IgnoreQueryFilters()` Audit:**
  - Flag any usage of `IgnoreQueryFilters()` or `ITenantContext.AllowSystemBypass()` outside initial anonymous tenant discovery (`AuthService`, `BranchService` enrollment, `OrganizationProvisioningService`) or `OutboxPublisherWorker`.
  - Confirm `ITenantContext.SetTenant(orgId)` is called immediately after discovery so `IsSystemBypassEnabled` is reset to `false` before any tenant-bound transaction begins.
- [ ] **RLS Interceptor & Active Transaction:**
  - Confirm `TenantRlsConnectionInterceptor` is attached to `PharmacyDbContext` and no code bypasses `UnitOfWork` (which sets `app.organization_id` / bypass config on the PostgreSQL transaction).

## 3. Mass Assignment & EF Entity Exposure
- [ ] **No EF Entities in Controller Signatures:** Controllers must accept and return Application DTOs (`*RequestDto`, `*ResponseDto`), NEVER `PharmacyERP.Domain.Entities.*` directly.
- [ ] **Over-Posting / Mass Assignment:** Verify request DTOs do not expose server-controlled fields (`OrganizationId`, `CreatedAt`, `RowVersion`, `PasswordHash`, `FailedLoginCount`, `LockedUntil`, `IsActive` where restricted).
- [ ] **Domain Invariants Preserved:** Entity mutations must go through domain methods/constructors (which have `private set`), never via AutoMapper/reflection overwriting private state.

## 4. Sensitive Data, Secrets & Token Exposure
- [ ] **No Secrets in Logs or Error Responses:**
  - Verify `ILogger` calls never log raw passwords, refresh tokens, enrollment tokens, JWTs, or `Authorization` headers.
  - Verify `ExceptionHandlingMiddleware` maps unhandled exceptions to `ApiErrorEnvelopeDto` with generic `"An unexpected error occurred."` (no stack traces, SQL errors, or connection strings leaked in HTTP responses).
- [ ] **Token Hashing:** Refresh tokens (`UserRefreshToken`) and enrollment tokens (`BranchEnrollment`) must be stored as SHA-256 hashes only; raw tokens are returned once at issuance and never persisted.
- [ ] **JWKS Public Key Only:** `GET /.well-known/jwks.json` must expose only public RSA parameters (`n`, `e`, `kid`), never private key parameters.

## 5. Raw SQL & Injection Safety
- [ ] **Parameterized SQL Only:** Search all occurrences of `FromSqlRaw`, `ExecuteSqlRaw`, `ExecuteSqlRawAsync`, `DbCommand.CommandText`, or string-interpolated SQL (`$"..."`).
- [ ] **Flag Unsafe Patterns:** Any raw SQL using string concatenation or unparameterized `$""` interpolation (instead of `FromSqlInterpolated` / `ExecuteSqlInterpolatedAsync` / `NpgsqlParameter`) is a critical finding.
