using Microsoft.EntityFrameworkCore;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Identity.Interfaces;
using PharmacyERP.Domain.Entities.Identity;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Infrastructure.Persistence.Database;

namespace PharmacyERP.Infrastructure.Persistence.Repositories.Identity;

public sealed class UserAccountRepository : IUserAccountRepository
{
    private readonly PharmacyDbContext _db;

    public UserAccountRepository(PharmacyDbContext db) => _db = db;

    public Task<UserAccount?> GetForLoginAsync(Guid organizationId, string normalizedUsername, CancellationToken ct = default)
        => _db.UserAccounts.Include(x => x.Employee).Include(x => x.BranchAccesses)
            .FirstOrDefaultAsync(x => x.OrganizationId == organizationId && x.NormalizedUsername == normalizedUsername, ct);

    public async Task<(int AccessFailedCount, DateTimeOffset? LockoutEnd)> RecordLoginFailureAsync(
        Guid organizationId,
        Guid userId,
        DateTimeOffset now,
        int maxAttempts,
        TimeSpan lockoutDuration,
        CancellationToken ct = default)
    {
        if (_db.Database.IsRelational())
        {
            var lockoutUntil = now.Add(lockoutDuration);
            await _db.Database.ExecuteSqlInterpolatedAsync(
                $@"UPDATE identity.""USER_ACCOUNT""
                   SET access_failed_count = access_failed_count + 1,
                       lockout_end = CASE WHEN access_failed_count + 1 >= {maxAttempts} THEN {lockoutUntil} ELSE lockout_end END,
                       updated_at = {now}
                   WHERE organization_id = {organizationId} AND user_id = {userId};", ct);

            var updated = await _db.UserAccounts
                .AsNoTracking()
                .Where(x => x.OrganizationId == organizationId && x.UserId == userId)
                .Select(x => new { x.AccessFailedCount, x.LockoutEnd })
                .FirstOrDefaultAsync(ct);

            return updated is null ? (0, null) : (updated.AccessFailedCount, updated.LockoutEnd);
        }

        var user = await _db.UserAccounts
            .FirstOrDefaultAsync(x => x.OrganizationId == organizationId && x.UserId == userId, ct);
        if (user is null)
        {
            return (0, null);
        }

        user.RecordLoginFailure(now, maxAttempts, lockoutDuration);
        return (user.AccessFailedCount, user.LockoutEnd);
    }

    public Task<UserAccount?> GetByIdWithAccessAsync(Guid organizationId, Guid userId, CancellationToken ct = default)
        => _db.UserAccounts.Include(x => x.Employee).Include(x => x.BranchAccesses)
            .FirstOrDefaultAsync(x => x.OrganizationId == organizationId && x.UserId == userId, ct);

    public async Task<(bool IsActive, Guid SecurityStamp)?> GetSecurityStateAsync(Guid organizationId, Guid userId, CancellationToken ct = default)
    {
        var state = await _db.UserAccounts
            .AsNoTracking()
            .Where(x => x.OrganizationId == organizationId && x.UserId == userId)
            .Select(x => new { IsActive = x.IsActive && x.Employee.IsActive, x.SecurityStamp })
            .FirstOrDefaultAsync(ct);

        return state is null ? null : (state.IsActive, state.SecurityStamp);
    }

    public Task<bool> ExistsByUsernameAsync(Guid organizationId, string normalizedUsername, CancellationToken ct = default)
        => _db.UserAccounts.AnyAsync(x => x.OrganizationId == organizationId && x.NormalizedUsername == normalizedUsername, ct);

    public Task<bool> ExistsForEmployeeAsync(Guid organizationId, Guid employeeId, CancellationToken ct = default)
        => _db.UserAccounts.AnyAsync(x => x.OrganizationId == organizationId && x.EmployeeId == employeeId, ct);

    public async Task<PagedResult<UserAccount>> GetPagedAsync(Guid organizationId, Guid? branchId, UserRole? role, bool includeInactive, int page, int pageSize, CancellationToken ct = default)
    {
        var query = _db.UserAccounts.AsNoTracking().Include(x => x.BranchAccesses)
            .Where(x => x.OrganizationId == organizationId);
        if (!includeInactive) query = query.Where(x => x.IsActive);
        if (role.HasValue) query = query.Where(x => x.Role == role.Value);
        if (branchId.HasValue)
        {
            var id = branchId.Value;
            query = query.Where(x => (x.Role == UserRole.Admin && x.BranchScope == BranchScope.ALL) || x.BranchAccesses.Any(a => a.BranchId == id));
        }
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.Username).ThenBy(x => x.UserId)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return new PagedResult<UserAccount>(items, page, pageSize, total);
    }

    public async Task ReplaceBranchAccessAsync(Guid organizationId, Guid userId, IReadOnlyCollection<Guid> branchIds, CancellationToken ct = default)
    {
        var existing = await _db.UserBranchAccesses
            .Where(x => x.OrganizationId == organizationId && x.UserId == userId).ToListAsync(ct);

        var targetIds = branchIds.Distinct().ToHashSet();
        var existingIds = existing.Select(x => x.BranchId).ToHashSet();

        var toRemove = existing.Where(x => !targetIds.Contains(x.BranchId)).ToList();
        var toAdd = targetIds
            .Where(id => !existingIds.Contains(id))
            .Select(id => UserBranchAccess.Create(organizationId, userId, id))
            .ToList();

        if (toRemove.Count > 0)
            _db.UserBranchAccesses.RemoveRange(toRemove);
        if (toAdd.Count > 0)
            await _db.UserBranchAccesses.AddRangeAsync(toAdd, ct);
    }

    public async Task AddAsync(UserAccount userAccount, CancellationToken ct = default)
        => await _db.UserAccounts.AddAsync(userAccount, ct);
}
