namespace PharmacyERP.Infrastructure.Persistence.Repositories.Integration;

/// <summary>
/// Persists <see cref="IdempotencyRecord"/> rows and acquires transaction-scoped PostgreSQL
/// advisory locks to serialize concurrent retries sharing the same idempotency key.
/// </summary>
public class IdempotencyRepository : IIdempotencyRepository
{
    private readonly PharmacyDbContext _dbContext;

    public IdempotencyRepository(PharmacyDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task AcquireLockAsync(Guid organizationId, Guid? branchId, string operationScope, string idempotencyKey, CancellationToken ct = default)
    {
        if (!_dbContext.Database.IsRelational())
        {
            return;
        }

        // Transaction-scoped advisory lock serializes concurrent double-submits sharing the same idempotency key.
        var lockKey = $"{organizationId:N}:{(branchId.HasValue ? branchId.Value.ToString("N") : "org")}:{operationScope}:{idempotencyKey}";
        await _dbContext.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0));", ct);
    }

    public async Task AcquireGlobalLockAsync(string operationScope, string idempotencyKey, CancellationToken ct = default)
    {
        if (!_dbContext.Database.IsRelational())
        {
            return;
        }

        var lockKey = $"global:{operationScope}:{idempotencyKey}";
        await _dbContext.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({lockKey}, 0));", ct);
    }

    public Task<IdempotencyRecord?> GetAsync(Guid organizationId, Guid? branchId, string operationScope, string idempotencyKey, CancellationToken ct = default)
    {
        var query = _dbContext.IdempotencyRecords
            .AsNoTracking()
            .Where(x => x.OrganizationId == organizationId
                     && x.OperationScope == operationScope
                     && x.IdempotencyKey == idempotencyKey);

        // Explicit IS NULL / = branching lets PostgreSQL prove predicate implication for both partial unique indexes.
        query = branchId.HasValue
            ? query.Where(x => x.BranchId == branchId.Value)
            : query.Where(x => x.BranchId == null);

        return query.FirstOrDefaultAsync(ct);
    }

    public Task<IdempotencyRecord?> FindByScopeAndKeyAsync(string operationScope, string idempotencyKey, CancellationToken ct = default)
    {
        return _dbContext.IdempotencyRecords
            .AsNoTracking()
            .Where(x => x.BranchId == null
                     && x.OperationScope == operationScope
                     && x.IdempotencyKey == idempotencyKey)
            .FirstOrDefaultAsync(ct);
    }

    public async Task AddAsync(IdempotencyRecord record, CancellationToken ct = default)
    {
        await _dbContext.IdempotencyRecords.AddAsync(record, ct);
    }
}
