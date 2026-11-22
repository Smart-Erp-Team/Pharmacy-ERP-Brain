namespace PharmacyERP.Infrastructure.Persistence.Repositories.Identity;

public sealed class BranchRepository : GenericRepository<Branch>, IBranchRepository
{
    public BranchRepository(PharmacyDbContext db) : base(db) { }

    public Task<Branch?> GetByIdAsync(Guid organizationId, Guid branchId, CancellationToken ct = default)
        => _dbSet.FirstOrDefaultAsync(x => x.OrganizationId == organizationId && x.BranchId == branchId, ct);

    public Task<bool> ExistsByCodeAsync(Guid organizationId, string branchCode, CancellationToken ct = default)
        => _dbSet.AnyAsync(x => x.OrganizationId == organizationId && x.BranchCode.ToUpper() == branchCode.Trim().ToUpper(), ct);

    public async Task<PagedResult<Branch>> GetPagedAsync(Guid organizationId, bool includeInactive, string? search, int page, int pageSize, CancellationToken ct = default)
    {
        var query = _dbSet.AsNoTracking().Where(x => x.OrganizationId == organizationId);
        if (!includeInactive) query = query.Where(x => x.IsActive);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.Name.Contains(term) || x.BranchCode.Contains(term));
        }
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.Name).ThenBy(x => x.BranchId)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return new PagedResult<Branch>(items, page, pageSize, total);
    }

    public async Task<PagedResult<Branch>> GetPagedByIdsAsync(Guid organizationId, IReadOnlyCollection<Guid> branchIds, bool includeInactive, string? search, int page, int pageSize, CancellationToken ct = default)
    {
        if (branchIds.Count == 0)
        {
            return new PagedResult<Branch>(Array.Empty<Branch>(), page, pageSize, 0);
        }

        var query = _dbSet.AsNoTracking()
            .Where(x => x.OrganizationId == organizationId && branchIds.Contains(x.BranchId));
        if (!includeInactive) query = query.Where(x => x.IsActive);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => x.Name.Contains(term) || x.BranchCode.Contains(term));
        }
        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.Name).ThenBy(x => x.BranchId)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return new PagedResult<Branch>(items, page, pageSize, total);
    }

    public Task<int> CountActiveByIdsAsync(Guid organizationId, IReadOnlyCollection<Guid> branchIds, CancellationToken ct = default)
    {
        if (branchIds.Count == 0)
        {
            return Task.FromResult(0);
        }

        return _dbSet.AsNoTracking()
            .CountAsync(x => x.OrganizationId == organizationId && x.IsActive && branchIds.Contains(x.BranchId), ct);
    }
}
