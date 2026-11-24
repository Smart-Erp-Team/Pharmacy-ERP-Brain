namespace PharmacyERP.Application.Features.Identity.Services.Implementations;

/// <summary>
/// Manages branch-scoped employee records with tenant RLS enforcement, audit logging, and outbox notifications.
/// </summary>
public sealed class EmployeeService : IEmployeeService
{
    private readonly IEmployeeRepository _employees;
    private readonly IBranchRepository _branches;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAuditLogger _audit;
    private readonly IOutboxService _outbox;
    private readonly IIdempotencyService _idempotency;
    private readonly ITenantContext _tenant;
    private readonly ICurrentUser _currentUser;
    private readonly IDateTimeProvider _clock;

    public EmployeeService(IEmployeeRepository employees, IBranchRepository branches, IUnitOfWork unitOfWork,
        IAuditLogger audit, IOutboxService outbox, IIdempotencyService idempotency, ITenantContext tenant, ICurrentUser currentUser, IDateTimeProvider clock)
    { _employees = employees; _branches = branches; _unitOfWork = unitOfWork; _audit = audit; _outbox = outbox; _idempotency = idempotency; _tenant = tenant; _currentUser = currentUser; _clock = clock; }

    public async Task<Result<PagedResult<EmployeeDto>>> GetPagedAsync(Guid? branchId, bool includeInactive, string? search, int page, int pageSize, CancellationToken ct = default)
    {
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<PagedResult<EmployeeDto>>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        var pageErrors = IdentityResults.ValidatePagination(page, pageSize);
        if (pageErrors.Count > 0) return IdentityResults.Failure<PagedResult<EmployeeDto>>(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, pageErrors);

        if (branchId.HasValue)
        {
            if (branchId.Value == Guid.Empty)
                return IdentityResults.Failure<PagedResult<EmployeeDto>>(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError,
                    new[] { new ApiErrorDetailDto("branch_id", "BranchId cannot be empty.") });

            if (!_currentUser.CanAccessBranch(branchId.Value))
                return IdentityResults.Failure<PagedResult<EmployeeDto>>(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);
        }

        IReadOnlyCollection<Guid>? authorizedBranchFilter = null;
        if (!branchId.HasValue && !IsAllBranchAdmin())
        {
            if (_currentUser.AuthorizedBranchIds.Count == 0)
                return IdentityResults.Failure<PagedResult<EmployeeDto>>(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

            if (_currentUser.AuthorizedBranchIds.Count == 1)
                branchId = _currentUser.AuthorizedBranchIds.Single();
            else
                authorizedBranchFilter = _currentUser.AuthorizedBranchIds;
        }

        // Explicit read transaction binds the tenant GUC for PostgreSQL FORCE ROW LEVEL SECURITY.
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var pagedEmployees = authorizedBranchFilter is not null
                ? await _employees.GetPagedByBranchIdsAsync(organizationId, authorizedBranchFilter, includeInactive, search, page, pageSize, ct)
                : await _employees.GetPagedAsync(organizationId, branchId, includeInactive, search, page, pageSize, ct);
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            return Result<PagedResult<EmployeeDto>>.Success(new PagedResult<EmployeeDto>(pagedEmployees.Items.Select(EmployeeDtoMapper.From).ToArray(), page, pageSize, pagedEmployees.TotalCount));
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result<EmployeeDto>> GetByIdAsync(Guid employeeId, CancellationToken ct = default)
    {
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<EmployeeDto>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var employee = await _employees.GetByIdAsync(organizationId, employeeId, ct);
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            if (employee is null) return IdentityResults.Failure<EmployeeDto>(ErrorCode.NOT_FOUND, ErrorMessages.NotFound);
            if (!_currentUser.CanAccessBranch(employee.BranchId)) return IdentityResults.Failure<EmployeeDto>(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);
            return Result<EmployeeDto>.Success(EmployeeDtoMapper.From(employee));
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result<EmployeeDto>> CreateAsync(CreateEmployeeRequest request, CancellationToken ct = default)
    {
        if (!IsAdmin()) return IdentityResults.Failure<EmployeeDto>(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<EmployeeDto>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey)) return IdentityResults.MissingIdempotencyKey<EmployeeDto>();

        var idempotencyKey = request.IdempotencyKey.Trim();
        var validationErrors = new List<ApiErrorDetailDto>();
        if (idempotencyKey.Length > 100)
            validationErrors.Add(new ApiErrorDetailDto("idempotency_key", "IdempotencyKey cannot exceed 100 characters."));
        if (request.BranchId == Guid.Empty)
            validationErrors.Add(new ApiErrorDetailDto("branch_id", "BranchId is required."));
        if (validationErrors.Count > 0)
            return IdentityResults.Failure<EmployeeDto>(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        if (!_currentUser.CanAccessBranch(request.BranchId)) return IdentityResults.Failure<EmployeeDto>(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        var normalizedRequest = request with { IdempotencyKey = idempotencyKey };

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            try
            {
                var idempotencyCheck = await _idempotency.CheckAsync<CreateEmployeeRequest, EmployeeDto>(
                    "identity.employee.create", idempotencyKey, normalizedRequest.BranchId, normalizedRequest, ct);
                if (idempotencyCheck.IsReplay && idempotencyCheck.ReplayedResponse is not null)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<EmployeeDto>.Success(idempotencyCheck.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<EmployeeDto>(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            var branch = await _branches.GetByIdAsync(organizationId, normalizedRequest.BranchId, ct);
            if (branch is null || !branch.IsActive)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<EmployeeDto>(ErrorCode.NOT_FOUND, ErrorMessages.NotFound);
            }
            if (await _employees.ExistsByEmployeeNoAsync(organizationId, normalizedRequest.BranchId, normalizedRequest.EmployeeNo, ct))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<EmployeeDto>(ErrorCode.CONFLICT, ErrorMessages.DuplicateEmployeeNo);
            }
            Employee employee;
            try { employee = Employee.Create(organizationId, normalizedRequest.BranchId, normalizedRequest.EmployeeNo, normalizedRequest.FullName, normalizedRequest.Email, normalizedRequest.Phone, normalizedRequest.JobTitle, normalizedRequest.Address.ToValueObject(), normalizedRequest.HiredOn); }
            catch (Exception exception) when (exception is ArgumentException or IdentityDomainException)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.ValidationFailure<EmployeeDto>(exception);
            }
            await _employees.AddAsync(employee, ct);
            await _audit.LogAsync("employee.created", "identity", "EMPLOYEE", employee.EmployeeId, null,
                new { employee.EmployeeNo, employee.FullName }, employee.BranchId, ct: ct);
            await _outbox.EnqueueAsync("identity.employee.created", employee.BranchId, new { employee.EmployeeId, employee.EmployeeNo }, ct: ct);

            var dto = EmployeeDtoMapper.From(employee);
            await _idempotency.PersistResponseAsync("identity.employee.create", idempotencyKey, employee.BranchId, normalizedRequest, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<EmployeeDto>.Success(dto);
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result<EmployeeDto>> UpdateAsync(Guid employeeId, UpdateEmployeeRequest request, CancellationToken ct = default)
    {
        if (!IsAdmin()) return IdentityResults.Failure<EmployeeDto>(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<EmployeeDto>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey)) return IdentityResults.MissingIdempotencyKey<EmployeeDto>();

        var idempotencyKey = request.IdempotencyKey.Trim();
        var validationErrors = new List<ApiErrorDetailDto>();
        if (idempotencyKey.Length > 100)
            validationErrors.Add(new ApiErrorDetailDto("idempotency_key", "IdempotencyKey cannot exceed 100 characters."));
        if (request.FullName is not null && string.IsNullOrWhiteSpace(request.FullName))
            validationErrors.Add(new ApiErrorDetailDto("full_name", "FullName cannot be empty."));
        if (request.JobTitle is not null && string.IsNullOrWhiteSpace(request.JobTitle))
            validationErrors.Add(new ApiErrorDetailDto("job_title", "JobTitle cannot be empty."));
        if (validationErrors.Count > 0)
            return IdentityResults.Failure<EmployeeDto>(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        var normalizedRequest = request with { IdempotencyKey = idempotencyKey };
        var idempotencyPayload = new { EmployeeId = employeeId, Request = normalizedRequest };

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var employee = await _employees.GetByIdAsync(organizationId, employeeId, ct);
            if (employee is null)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<EmployeeDto>(ErrorCode.NOT_FOUND, ErrorMessages.NotFound);
            }
            if (!_currentUser.CanAccessBranch(employee.BranchId))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<EmployeeDto>(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);
            }

            try
            {
                var idempotencyCheck = await _idempotency.CheckAsync<object, EmployeeDto>(
                    "identity.employee.update", idempotencyKey, employee.BranchId, idempotencyPayload, ct);
                if (idempotencyCheck.IsReplay && idempotencyCheck.ReplayedResponse is not null)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<EmployeeDto>.Success(idempotencyCheck.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<EmployeeDto>(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            var hasDetailUpdates = normalizedRequest.FullName is not null
                || normalizedRequest.Email is not null
                || normalizedRequest.Phone is not null
                || normalizedRequest.JobTitle is not null
                || normalizedRequest.Address is not null;

            if (hasDetailUpdates)
            {
                try
                {
                    employee.UpdateDetails(
                        normalizedRequest.FullName ?? employee.FullName,
                        normalizedRequest.Email ?? employee.Email,
                        normalizedRequest.Phone ?? employee.Phone,
                        normalizedRequest.JobTitle ?? employee.JobTitle,
                        normalizedRequest.Address?.ToValueObject() ?? employee.Address);
                }
                catch (Exception exception) when (exception is ArgumentException or IdentityDomainException)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return IdentityResults.ValidationFailure<EmployeeDto>(exception);
                }
            }
            if (normalizedRequest.IsActive.HasValue) employee.SetActive(normalizedRequest.IsActive.Value);
            await _audit.LogAsync("employee.updated", "identity", "EMPLOYEE", employee.EmployeeId, null,
                new { employee.FullName, employee.Email, employee.Phone, employee.JobTitle, employee.IsActive }, employee.BranchId, ct: ct);
            await _outbox.EnqueueAsync("identity.employee.updated", employee.BranchId, new { employee.EmployeeId, employee.IsActive }, ct: ct);

            var dto = EmployeeDtoMapper.From(employee);
            await _idempotency.PersistResponseAsync("identity.employee.update", idempotencyKey, employee.BranchId, idempotencyPayload, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<EmployeeDto>.Success(dto);
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    private bool IsAdmin() => string.Equals(_currentUser.Role, UserRole.Admin.ToString(), StringComparison.Ordinal);
    private bool IsAllBranchAdmin() => IsAdmin() && string.Equals(_currentUser.BranchScope, BranchScope.ALL.ToString(), StringComparison.Ordinal);
}
