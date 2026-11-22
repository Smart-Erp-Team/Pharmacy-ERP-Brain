namespace PharmacyERP.Application.Features.Identity.Interfaces;

public interface IBranchRepository : IGenericRepository<Branch>
{
    Task<Branch?> GetByIdAsync(Guid organizationId, Guid branchId, CancellationToken ct = default);
    Task<bool> ExistsByCodeAsync(Guid organizationId, string branchCode, CancellationToken ct = default);
    Task<PagedResult<Branch>> GetPagedAsync(Guid organizationId, bool includeInactive, string? search, int page, int pageSize, CancellationToken ct = default);
    Task<PagedResult<Branch>> GetPagedByIdsAsync(Guid organizationId, IReadOnlyCollection<Guid> branchIds, bool includeInactive, string? search, int page, int pageSize, CancellationToken ct = default);
    Task<int> CountActiveByIdsAsync(Guid organizationId, IReadOnlyCollection<Guid> branchIds, CancellationToken ct = default);
}
