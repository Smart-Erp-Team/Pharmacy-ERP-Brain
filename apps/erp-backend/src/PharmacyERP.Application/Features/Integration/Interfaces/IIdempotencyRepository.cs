namespace PharmacyERP.Application.Features.Integration.Interfaces;

public interface IIdempotencyRepository
{
    Task AcquireLockAsync(Guid organizationId, Guid? branchId, string operationScope, string idempotencyKey, CancellationToken ct = default);
    Task AcquireGlobalLockAsync(string operationScope, string idempotencyKey, CancellationToken ct = default);
    Task<IdempotencyRecord?> GetAsync(Guid organizationId, Guid? branchId, string operationScope, string idempotencyKey, CancellationToken ct = default);
    Task<IdempotencyRecord?> FindByScopeAndKeyAsync(string operationScope, string idempotencyKey, CancellationToken ct = default);
    Task AddAsync(IdempotencyRecord record, CancellationToken ct = default);
}
