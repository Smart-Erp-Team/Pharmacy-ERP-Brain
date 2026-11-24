namespace PharmacyERP.Application.Features.Identity.Services.Implementations;

/// <summary>
/// Provisions a brand-new tenant organization along with its outbox cursor, initial branch,
/// default inventory locations, founding employee, and all-branch Admin account in a single transaction.
/// </summary>
public sealed class OrganizationProvisioningService : IOrganizationProvisioningService
{
    private readonly IOrganizationRepository _organizations;
    private readonly IBranchRepository _branches;
    private readonly IEmployeeRepository _employees;
    private readonly IUserAccountRepository _users;
    private readonly IGenericRepository<OutboxEventCursor> _cursors;
    private readonly IPasswordHasherService _passwords;
    private readonly IBranchDefaultLocationSeeder _locationSeeder;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAuditLogger _audit;
    private readonly IOutboxService _outbox;
    private readonly IIdempotencyService _idempotency;
    private readonly ITenantContext _tenant;
    private readonly ICurrentUser _currentUser;
    private readonly IDateTimeProvider _clock;

    public OrganizationProvisioningService(IOrganizationRepository organizations, IBranchRepository branches,
        IEmployeeRepository employees, IUserAccountRepository users, IGenericRepository<OutboxEventCursor> cursors,
        IPasswordHasherService passwords, IBranchDefaultLocationSeeder locationSeeder, IUnitOfWork unitOfWork,
        IAuditLogger audit, IOutboxService outbox, IIdempotencyService idempotency, ITenantContext tenant, ICurrentUser currentUser, IDateTimeProvider clock)
    {
        _organizations = organizations; _branches = branches; _employees = employees; _users = users; _cursors = cursors;
        _passwords = passwords; _locationSeeder = locationSeeder; _unitOfWork = unitOfWork; _audit = audit;
        _outbox = outbox; _idempotency = idempotency; _tenant = tenant; _currentUser = currentUser; _clock = clock;
    }

    public async Task<Result<OrganizationDto>> CreateAsync(CreateOrganizationRequest request, CancellationToken ct = default)
    {
        if (!string.Equals(_currentUser.Role, "PlatformProvisioner", StringComparison.Ordinal))
            return IdentityResults.Failure<OrganizationDto>(ErrorCode.FORBIDDEN, "Only a platform provisioner may create organizations.");

        if (string.IsNullOrWhiteSpace(request.IdempotencyKey))
            return IdentityResults.MissingIdempotencyKey<OrganizationDto>();

        var idempotencyKey = request.IdempotencyKey.Trim();
        var normalizedRequest = request with { IdempotencyKey = idempotencyKey };

        Organization organization;
        Branch branch;
        Employee employee;
        UserAccount admin;
        try
        {
            organization = Organization.Create(normalizedRequest.OrganizationCode, normalizedRequest.Name, normalizedRequest.BaseCurrency, normalizedRequest.TimeZoneId, normalizedRequest.Address.ToValueObject());
            branch = Branch.Create(organization.OrganizationId, normalizedRequest.InitialBranch.BranchCode, normalizedRequest.InitialBranch.Name, normalizedRequest.InitialBranch.Address.ToValueObject());
            employee = Employee.Create(organization.OrganizationId, branch.BranchId,
                normalizedRequest.InitialEmployee.EmployeeNo, normalizedRequest.InitialEmployee.FullName, normalizedRequest.InitialEmployee.Email,
                normalizedRequest.InitialEmployee.Phone, normalizedRequest.InitialEmployee.JobTitle, normalizedRequest.InitialEmployee.Address.ToValueObject(), normalizedRequest.InitialEmployee.HiredOn);
            admin = UserAccount.Create(organization.OrganizationId, employee.EmployeeId,
                normalizedRequest.InitialAdmin.Username, "pending-hash", UserRole.Admin, BranchScope.ALL);
            admin.UpdatePasswordHash(_passwords.HashPassword(admin, normalizedRequest.InitialAdmin.Password), _clock.UtcNow);
        }
        catch (Exception exception) when (exception is ArgumentException or PharmacyERP.Domain.Exceptions.IdentityDomainException)
        {
            return IdentityResults.Failure<OrganizationDto>(ErrorCode.VALIDATION_ERROR, exception.Message);
        }

        try
        {
            // Probe globally under the database's explicit system-bypass setting, then use tenant RLS for writes.
            _tenant.AllowSystemBypass();
            await _unitOfWork.BeginTransactionAsync(ct);
            bool exists;
            try
            {
                try
                {
                    var idempotencyCheck = await _idempotency.CheckGlobalAsync<CreateOrganizationRequest, OrganizationDto>(
                        "identity.organization.create", idempotencyKey, normalizedRequest, ct);
                    if (idempotencyCheck.IsReplay && idempotencyCheck.ReplayedResponse is not null)
                    {
                        await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                        return Result<OrganizationDto>.Success(idempotencyCheck.ReplayedResponse);
                    }
                }
                catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return IdentityResults.Failure<OrganizationDto>(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
                }

                exists = await _organizations.ExistsByCodeAsync(normalizedRequest.OrganizationCode, ct);
            }
            catch
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                throw;
            }
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            if (exists)
                return IdentityResults.Failure<OrganizationDto>(ErrorCode.CONFLICT, ErrorMessages.DuplicateOrganizationCode);

            _tenant.SetTenant(organization.OrganizationId);
            await _unitOfWork.BeginTransactionAsync(ct);
            await _organizations.AddAsync(organization, ct);
            await _cursors.AddAsync(new OutboxEventCursor(organization.OrganizationId), ct);
            await _unitOfWork.SaveChangesAsync(ct);

            await _branches.AddAsync(branch, ct);
            await _locationSeeder.SeedDefaultLocationsAsync(organization.OrganizationId, branch.BranchId, ct);
            await _employees.AddAsync(employee, ct);
            await _users.AddAsync(admin, ct);
            await _audit.LogAsync("organization.created", "identity", "ORGANIZATION", organization.OrganizationId,
                null, new { organization.OrganizationCode, organization.Name, branch.BranchId, employee.EmployeeId, admin.UserId },
                branch.BranchId, AuditActorType.SYSTEM, ct: ct);
            await _outbox.EnqueueAsync("identity.organization.created", branch.BranchId,
                new { organization.OrganizationId, organization.OrganizationCode, branch.BranchId }, ct: ct);

            var dto = new OrganizationDto(organization.OrganizationId, organization.OrganizationCode,
                organization.Name, organization.BaseCurrency, organization.TimeZoneId, branch.BranchId, employee.EmployeeId, admin.UserId);
            await _idempotency.PersistResponseAsync("identity.organization.create", idempotencyKey, null, normalizedRequest, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);

            return Result<OrganizationDto>.Success(dto);
        }
        catch
        {
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            throw;
        }
    }
}

internal sealed record IdempotencyVoidResult(bool Completed);

internal static class IdentityResults
{
    public static Result<T> Failure<T>(ErrorCode code, string message, IReadOnlyList<ApiErrorDetailDto>? details = null)
        => Result<T>.Failure(code, message, details);

    public static Result Failure(ErrorCode code, string message, IReadOnlyList<ApiErrorDetailDto>? details = null)
        => Result.Failure(code, message, details);

    public static Result<T> MissingIdempotencyKey<T>()
        => Result<T>.Failure(
            ErrorCode.MALFORMED_REQUEST,
            ErrorMessages.MalformedRequest,
            new[] { new ApiErrorDetailDto("Idempotency-Key", ErrorMessages.InvalidIdempotencyKey) });

    public static Result MissingIdempotencyKey()
        => Result.Failure(
            ErrorCode.MALFORMED_REQUEST,
            ErrorMessages.MalformedRequest,
            new[] { new ApiErrorDetailDto("Idempotency-Key", ErrorMessages.InvalidIdempotencyKey) });
}
