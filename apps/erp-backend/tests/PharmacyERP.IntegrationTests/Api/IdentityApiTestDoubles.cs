using System.Reflection;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.CrossModule;
using PharmacyERP.Application.Common.Interfaces.Integration;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Application.Features.Identity.Interfaces;
using PharmacyERP.Domain.Entities.Identity;
using PharmacyERP.Domain.Entities.Integration;
using PharmacyERP.Domain.Enums;

namespace PharmacyERP.IntegrationTests.Api;

/// <summary>
/// Lightweight stateful persistence doubles for the HTTP identity flow. The API pipeline,
/// JWT bearer validation, controllers, application services, password hashing, and token
/// generation remain real; only the database-facing boundary and cross-module writers are replaced.
/// </summary>
internal sealed class IdentityApiTestStore
{
    public List<Organization> Organizations { get; } = [];
    public List<Branch> Branches { get; } = [];
    public List<Employee> Employees { get; } = [];
    public List<UserAccount> Users { get; } = [];
    public List<BranchEnrollment> Enrollments { get; } = [];
    public List<UserRefreshToken> RefreshTokens { get; } = [];
    public List<OutboxEventCursor> OutboxCursors { get; } = [];
    public List<Guid> SeededBranches { get; } = [];

    public IOrganizationRepository OrganizationsRepo => new OrganizationRepository(this);
    public IBranchRepository BranchesRepo => new BranchRepository(this);
    public IEmployeeRepository EmployeesRepo => new EmployeeRepository(this);
    public IUserAccountRepository UserAccountsRepo => new UserAccountRepository(this);
    public IBranchEnrollmentRepository BranchEnrollmentsRepo => new BranchEnrollmentRepository(this);
    public IUserRefreshTokenRepository RefreshTokensRepo => new UserRefreshTokenRepository(this);
    public IGenericRepository<OutboxEventCursor> OutboxCursorsRepo => new OutboxCursorRepository(this);

    internal static void SetNavigation<TEntity, TValue>(TEntity entity, string propertyName, TValue value)
        where TEntity : class
    {
        typeof(TEntity).GetProperty(propertyName, BindingFlags.Instance | BindingFlags.Public)!
            .SetValue(entity, value);
    }

    private sealed class OrganizationRepository(IdentityApiTestStore store) : IOrganizationRepository
    {
        public Task<Organization?> GetActiveByCodeAsync(string organizationCode, CancellationToken ct = default)
            => Task.FromResult(store.Organizations.FirstOrDefault(x => x.IsActive &&
                string.Equals(x.OrganizationCode, organizationCode.Trim(), StringComparison.OrdinalIgnoreCase)));

        public Task<bool> ExistsByCodeAsync(string organizationCode, CancellationToken ct = default)
            => Task.FromResult(store.Organizations.Any(x =>
                string.Equals(x.OrganizationCode, organizationCode.Trim(), StringComparison.OrdinalIgnoreCase)));

        public Task AddAsync(Organization organization, CancellationToken ct = default)
        {
            store.Organizations.Add(organization);
            return Task.CompletedTask;
        }
    }

    private sealed class BranchRepository(IdentityApiTestStore store) : IBranchRepository
    {
        public Task<Branch?> GetByIdAsync(Guid organizationId, Guid branchId, CancellationToken ct = default)
            => Task.FromResult(store.Branches.FirstOrDefault(x => x.OrganizationId == organizationId && x.BranchId == branchId));

        public Task<bool> ExistsByCodeAsync(Guid organizationId, string branchCode, CancellationToken ct = default)
            => Task.FromResult(store.Branches.Any(x => x.OrganizationId == organizationId &&
                string.Equals(x.BranchCode, branchCode.Trim(), StringComparison.OrdinalIgnoreCase)));

        public Task<PagedResult<Branch>> GetPagedAsync(Guid organizationId, bool includeInactive, string? search,
            int page, int pageSize, CancellationToken ct = default)
        {
            var query = store.Branches.Where(x => x.OrganizationId == organizationId);
            if (!includeInactive) query = query.Where(x => x.IsActive);
            if (!string.IsNullOrWhiteSpace(search))
                query = query.Where(x => x.Name.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                    x.BranchCode.Contains(search, StringComparison.OrdinalIgnoreCase));
            return Task.FromResult(Page(query.OrderBy(x => x.Name).ThenBy(x => x.BranchId), page, pageSize));
        }

        public Task<Branch?> GetByIdAsync(Guid id, CancellationToken ct = default)
            => Task.FromResult(store.Branches.FirstOrDefault(x => x.BranchId == id));

        public Task AddAsync(Branch entity, CancellationToken ct = default)
        {
            store.Branches.Add(entity);
            return Task.CompletedTask;
        }

        public Task AddRangeAsync(IEnumerable<Branch> entities, CancellationToken ct = default)
        {
            store.Branches.AddRange(entities);
            return Task.CompletedTask;
        }

        public void Update(Branch entity) { }
        public IQueryable<Branch> AsQueryable() => store.Branches.AsQueryable();
    }

    private sealed class EmployeeRepository(IdentityApiTestStore store) : IEmployeeRepository
    {
        public Task<Employee?> GetByIdAsync(Guid organizationId, Guid employeeId, CancellationToken ct = default)
            => Task.FromResult(store.Employees.FirstOrDefault(x => x.OrganizationId == organizationId && x.EmployeeId == employeeId));

        public Task<bool> ExistsByEmployeeNoAsync(Guid organizationId, Guid branchId, string employeeNo, CancellationToken ct = default)
            => Task.FromResult(store.Employees.Any(x => x.OrganizationId == organizationId && x.BranchId == branchId &&
                string.Equals(x.EmployeeNo, employeeNo.Trim(), StringComparison.OrdinalIgnoreCase)));

        public Task<PagedResult<Employee>> GetPagedAsync(Guid organizationId, Guid? branchId, bool includeInactive,
            string? search, int page, int pageSize, CancellationToken ct = default)
        {
            var query = store.Employees.Where(x => x.OrganizationId == organizationId);
            if (branchId.HasValue) query = query.Where(x => x.BranchId == branchId.Value);
            if (!includeInactive) query = query.Where(x => x.IsActive);
            if (!string.IsNullOrWhiteSpace(search))
                query = query.Where(x => x.FullName.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                    x.EmployeeNo.Contains(search, StringComparison.OrdinalIgnoreCase));
            return Task.FromResult(Page(query.OrderBy(x => x.FullName).ThenBy(x => x.EmployeeId), page, pageSize));
        }

        public Task<Employee?> GetByIdAsync(Guid id, CancellationToken ct = default)
            => Task.FromResult(store.Employees.FirstOrDefault(x => x.EmployeeId == id));

        public Task AddAsync(Employee entity, CancellationToken ct = default)
        {
            store.Employees.Add(entity);
            return Task.CompletedTask;
        }

        public Task AddRangeAsync(IEnumerable<Employee> entities, CancellationToken ct = default)
        {
            store.Employees.AddRange(entities);
            return Task.CompletedTask;
        }

        public void Update(Employee entity) { }
        public IQueryable<Employee> AsQueryable() => store.Employees.AsQueryable();
    }

    private sealed class UserAccountRepository(IdentityApiTestStore store) : IUserAccountRepository
    {
        public Task<UserAccount?> GetForLoginAsync(Guid organizationId, string normalizedUsername, CancellationToken ct = default)
            => Task.FromResult(Attach(store.Users.FirstOrDefault(x => x.OrganizationId == organizationId &&
                x.NormalizedUsername == normalizedUsername)));

        public Task<UserAccount?> GetByIdWithAccessAsync(Guid organizationId, Guid userId, CancellationToken ct = default)
            => Task.FromResult(Attach(store.Users.FirstOrDefault(x => x.OrganizationId == organizationId && x.UserId == userId)));

        public Task<bool> ExistsByUsernameAsync(Guid organizationId, string normalizedUsername, CancellationToken ct = default)
            => Task.FromResult(store.Users.Any(x => x.OrganizationId == organizationId && x.NormalizedUsername == normalizedUsername));

        public Task<bool> ExistsForEmployeeAsync(Guid organizationId, Guid employeeId, CancellationToken ct = default)
            => Task.FromResult(store.Users.Any(x => x.OrganizationId == organizationId && x.EmployeeId == employeeId));

        public Task<PagedResult<UserAccount>> GetPagedAsync(Guid organizationId, Guid? branchId, UserRole? role,
            bool includeInactive, int page, int pageSize, CancellationToken ct = default)
        {
            var query = store.Users.Where(x => x.OrganizationId == organizationId);
            if (branchId.HasValue)
                query = query.Where(x => (x.Role == UserRole.Admin && x.BranchScope == BranchScope.ALL) ||
                    x.BranchAccesses.Any(a => a.BranchId == branchId.Value));
            if (role.HasValue) query = query.Where(x => x.Role == role.Value);
            if (!includeInactive) query = query.Where(x => x.IsActive);
            return Task.FromResult(Page(query.OrderBy(x => x.Username).ThenBy(x => x.UserId), page, pageSize));
        }

        public Task ReplaceBranchAccessAsync(Guid organizationId, Guid userId, IReadOnlyCollection<Guid> branchIds,
            CancellationToken ct = default)
        {
            var user = store.Users.Single(x => x.OrganizationId == organizationId && x.UserId == userId);
            user.BranchAccesses.Clear();
            foreach (var branchId in branchIds.Distinct())
                user.BranchAccesses.Add(UserBranchAccess.Create(organizationId, userId, branchId));
            return Task.CompletedTask;
        }

        public Task AddAsync(UserAccount userAccount, CancellationToken ct = default)
        {
            var employee = store.Employees.Single(x => x.OrganizationId == userAccount.OrganizationId && x.EmployeeId == userAccount.EmployeeId);
            SetNavigation(userAccount, nameof(UserAccount.Employee), employee);
            store.Users.Add(userAccount);
            return Task.CompletedTask;
        }

        private UserAccount? Attach(UserAccount? user)
        {
            if (user is null) return null;
            var employee = store.Employees.First(x => x.OrganizationId == user.OrganizationId && x.EmployeeId == user.EmployeeId);
            SetNavigation(user, nameof(UserAccount.Employee), employee);
            return user;
        }
    }

    private sealed class BranchEnrollmentRepository(IdentityApiTestStore store) : IBranchEnrollmentRepository
    {
        public Task<BranchEnrollment?> GetByTokenHashAsync(byte[] tokenHash, CancellationToken ct = default)
        {
            var enrollment = store.Enrollments.FirstOrDefault(x => x.TokenHash.SequenceEqual(tokenHash));
            if (enrollment is not null)
            {
                var branch = store.Branches.First(x => x.OrganizationId == enrollment.OrganizationId && x.BranchId == enrollment.BranchId);
                SetNavigation(enrollment, nameof(BranchEnrollment.Branch), branch);
            }
            return Task.FromResult(enrollment);
        }

        public Task AddAsync(BranchEnrollment enrollment, CancellationToken ct = default)
        {
            var branch = store.Branches.Single(x => x.OrganizationId == enrollment.OrganizationId && x.BranchId == enrollment.BranchId);
            SetNavigation(enrollment, nameof(BranchEnrollment.Branch), branch);
            store.Enrollments.Add(enrollment);
            return Task.CompletedTask;
        }
    }

    private sealed class UserRefreshTokenRepository(IdentityApiTestStore store) : IUserRefreshTokenRepository
    {
        public Task<UserRefreshToken?> GetByTokenHashAsync(byte[] tokenHash, CancellationToken ct = default)
        {
            var token = store.RefreshTokens.FirstOrDefault(x => x.TokenHash.SequenceEqual(tokenHash));
            if (token is not null)
            {
                var user = store.Users.First(x => x.OrganizationId == token.OrganizationId && x.UserId == token.UserId);
                var employee = store.Employees.First(x => x.OrganizationId == user.OrganizationId && x.EmployeeId == user.EmployeeId);
                SetNavigation(user, nameof(UserAccount.Employee), employee);
                SetNavigation(token, nameof(UserRefreshToken.UserAccount), user);
            }
            return Task.FromResult(token);
        }

        public Task RevokeFamilyAsync(Guid organizationId, Guid tokenFamilyId, DateTimeOffset revokedAt, CancellationToken ct = default)
        {
            foreach (var token in store.RefreshTokens.Where(x => x.OrganizationId == organizationId &&
                         x.TokenFamilyId == tokenFamilyId && x.RevokedAt is null))
                token.Revoke(revokedAt);
            return Task.CompletedTask;
        }

        public Task RevokeAllUserTokensAsync(Guid organizationId, Guid userId, DateTimeOffset revokedAt, CancellationToken ct = default)
        {
            foreach (var token in store.RefreshTokens.Where(x => x.OrganizationId == organizationId &&
                         x.UserId == userId && x.RevokedAt is null))
                token.Revoke(revokedAt);
            return Task.CompletedTask;
        }

        public Task AddAsync(UserRefreshToken token, CancellationToken ct = default)
        {
            store.RefreshTokens.Add(token);
            return Task.CompletedTask;
        }
    }

    private sealed class OutboxCursorRepository(IdentityApiTestStore store) : IGenericRepository<OutboxEventCursor>
    {
        public Task<OutboxEventCursor?> GetByIdAsync(Guid id, CancellationToken ct = default)
            => Task.FromResult(store.OutboxCursors.FirstOrDefault(x => x.OrganizationId == id));

        public Task AddAsync(OutboxEventCursor entity, CancellationToken ct = default)
        {
            store.OutboxCursors.Add(entity);
            return Task.CompletedTask;
        }

        public Task AddRangeAsync(IEnumerable<OutboxEventCursor> entities, CancellationToken ct = default)
        {
            store.OutboxCursors.AddRange(entities);
            return Task.CompletedTask;
        }

        public void Update(OutboxEventCursor entity) { }
        public IQueryable<OutboxEventCursor> AsQueryable() => store.OutboxCursors.AsQueryable();
    }

    private static PagedResult<T> Page<T>(IOrderedEnumerable<T> query, int page, int pageSize)
    {
        var items = query.ToArray();
        return new PagedResult<T>(items.Skip((page - 1) * pageSize).Take(pageSize).ToArray(), page, pageSize, items.Length);
    }
}

internal sealed class IdentityApiTestUnitOfWork : IUnitOfWork
{
    public bool HasActiveTransaction { get; private set; }

    public Task BeginTransactionAsync(CancellationToken ct = default)
    {
        if (HasActiveTransaction) throw new InvalidOperationException("A transaction is already active.");
        HasActiveTransaction = true;
        return Task.CompletedTask;
    }

    public Task<int> SaveChangesAsync(CancellationToken ct = default) => Task.FromResult(0);
    public Task CommitTransactionAsync(CancellationToken ct = default) { HasActiveTransaction = false; return Task.CompletedTask; }
    public Task RollbackTransactionAsync(CancellationToken ct = default) { HasActiveTransaction = false; return Task.CompletedTask; }
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    public void Dispose() { }
}

internal sealed class IdentityApiTestBranchSeeder(IdentityApiTestStore store) : IBranchDefaultLocationSeeder
{
    public Task SeedDefaultLocationsAsync(Guid organizationId, Guid branchId, CancellationToken ct = default)
    {
        store.SeededBranches.Add(branchId);
        return Task.CompletedTask;
    }
}

internal sealed class IdentityApiTestAuditLogger : IAuditLogger
{
    public Task LogAsync(string action, string entitySchema, string entityName, Guid entityId, object? beforeData,
        object? afterData, Guid? branchId = null, AuditActorType? actorTypeOverride = null,
        string? sourcePromptId = null, CancellationToken ct = default) => Task.CompletedTask;
}

internal sealed class IdentityApiTestOutboxService : IOutboxService
{
    public Task EnqueueAsync<TPayload>(string eventType, Guid? branchId, TPayload payload, string schemaVersion = "1.0",
        CancellationToken ct = default) => Task.CompletedTask;
}
