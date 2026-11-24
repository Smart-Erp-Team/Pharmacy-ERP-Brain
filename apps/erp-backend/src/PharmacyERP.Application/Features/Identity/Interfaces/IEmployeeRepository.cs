namespace PharmacyERP.Application.Features.Identity.Interfaces;

public interface IEmployeeRepository : IGenericRepository<Employee>
{
    Task<Employee?> GetByIdAsync(Guid organizationId, Guid employeeId, CancellationToken ct = default);
    Task<bool> ExistsByEmployeeNoAsync(Guid organizationId, Guid branchId, string employeeNo, CancellationToken ct = default);
    Task<PagedResult<Employee>> GetPagedAsync(Guid organizationId, Guid? branchId, bool includeInactive, string? search, int page, int pageSize, CancellationToken ct = default);
    Task<PagedResult<Employee>> GetPagedByBranchIdsAsync(Guid organizationId, IReadOnlyCollection<Guid> branchIds, bool includeInactive, string? search, int page, int pageSize, CancellationToken ct = default);
}
