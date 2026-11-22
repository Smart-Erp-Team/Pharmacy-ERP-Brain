namespace PharmacyERP.Application.Features.Identity.Services.Interfaces;

public interface IEmployeeService
{
    Task<Result<PagedResult<EmployeeDto>>> GetPagedAsync(Guid? branchId, bool includeInactive, string? search, int page, int pageSize, CancellationToken ct = default);
    Task<Result<EmployeeDto>> GetByIdAsync(Guid employeeId, CancellationToken ct = default);
    Task<Result<EmployeeDto>> CreateAsync(CreateEmployeeRequest request, CancellationToken ct = default);
    Task<Result<EmployeeDto>> UpdateAsync(Guid employeeId, UpdateEmployeeRequest request, CancellationToken ct = default);
}
