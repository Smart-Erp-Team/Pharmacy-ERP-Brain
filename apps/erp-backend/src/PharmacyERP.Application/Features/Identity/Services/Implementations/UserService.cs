namespace PharmacyERP.Application.Features.Identity.Services.Implementations;

public sealed class UserService : IUserService
{
    private readonly IUserAccountRepository _users;
    private readonly IEmployeeRepository _employees;
    private readonly IBranchRepository _branches;
    private readonly IUserRefreshTokenRepository _tokens;
    private readonly IPasswordHasherService _passwords;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAuditLogger _audit;
    private readonly IOutboxService _outbox;
    private readonly ITenantContext _tenant;
    private readonly ICurrentUser _currentUser;
    private readonly IDateTimeProvider _clock;
    private readonly IUserManagementAuthorizer _authorizer;
    private readonly IUserSecurityStampValidator? _securityStampValidator;

    public UserService(IUserAccountRepository users, IEmployeeRepository employees, IBranchRepository branches,
        IUserRefreshTokenRepository tokens, IPasswordHasherService passwords, IUnitOfWork unitOfWork,
        IAuditLogger audit, IOutboxService outbox, ITenantContext tenant, ICurrentUser currentUser, IDateTimeProvider clock,
        IUserManagementAuthorizer authorizer, IUserSecurityStampValidator? securityStampValidator = null)
    { _users = users; _employees = employees; _branches = branches; _tokens = tokens; _passwords = passwords; _unitOfWork = unitOfWork; _audit = audit; _outbox = outbox; _tenant = tenant; _currentUser = currentUser; _clock = clock; _authorizer = authorizer; _securityStampValidator = securityStampValidator; }

    public async Task<Result<PagedResult<UserDto>>> GetPagedAsync(Guid? branchId, UserRole? role, bool includeInactive, int page, int pageSize, CancellationToken ct = default)
    {
        var auth = _authorizer.AuthorizeList(branchId);
        if (!auth.IsSuccess) return IdentityResults.Failure<PagedResult<UserDto>>(auth.ErrorCode!.Value, auth.ErrorMessage!);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<PagedResult<UserDto>>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        if (page < 1 || pageSize is < 1 or > 200) return IdentityResults.Failure<PagedResult<UserDto>>(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError);
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var result = await _users.GetPagedAsync(organizationId, branchId, role, includeInactive, page, pageSize, ct);
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            return Result<PagedResult<UserDto>>.Success(new PagedResult<UserDto>(result.Items.Select(UserDtoMapper.From).ToArray(), page, pageSize, result.TotalCount));
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result<UserDto>> GetByIdAsync(Guid userId, CancellationToken ct = default)
    {
        if (!IsAdmin()) return IdentityResults.Failure<UserDto>(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<UserDto>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var user = await _users.GetByIdWithAccessAsync(organizationId, userId, ct);
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            if (user is null) return IdentityResults.Failure<UserDto>(ErrorCode.NOT_FOUND, ErrorMessages.UserNotFound);
            var auth = _authorizer.AuthorizeRead(user);
            if (!auth.IsSuccess) return IdentityResults.Failure<UserDto>(auth.ErrorCode!.Value, auth.ErrorMessage!);
            return Result<UserDto>.Success(UserDtoMapper.From(user));
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result<UserDto>> CreateAsync(CreateUserRequest request, CancellationToken ct = default)
    {
        if (!IsAdmin()) return IdentityResults.Failure<UserDto>(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<UserDto>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var employee = await _employees.GetByIdAsync(organizationId, request.EmployeeId, ct);
            if (employee is null || !employee.IsActive)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(ErrorCode.NOT_FOUND, ErrorMessages.NotFound);
            }
            var auth = _authorizer.AuthorizeCreate(employee, request.Role, request.BranchScope, request.BranchIds);
            if (!auth.IsSuccess)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(auth.ErrorCode!.Value, auth.ErrorMessage!);
            }
            if (await _users.ExistsByUsernameAsync(organizationId, request.Username.Trim().ToUpperInvariant(), ct))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(ErrorCode.CONFLICT, ErrorMessages.DuplicateUsername);
            }
            if (await _users.ExistsForEmployeeAsync(organizationId, employee.EmployeeId, ct))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(ErrorCode.CONFLICT, ErrorMessages.EmployeeAlreadyHasAccount);
            }
            if (!await ValidateBranchesAsync(organizationId, request.BranchScope, request.BranchIds, ct))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(ErrorCode.VALIDATION_ERROR, ErrorMessages.InvalidBranchSelection);
            }

            UserAccount user;
            try
            {
                user = UserAccount.Create(organizationId, employee.EmployeeId, request.Username, "pending-hash", request.Role, request.BranchScope);
                user.UpdatePasswordHash(_passwords.HashPassword(user, request.Password), _clock.UtcNow);
            }
            catch (Exception ex) when (ex is ArgumentException or IdentityDomainException)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(ErrorCode.VALIDATION_ERROR, ex.Message);
            }
            await _users.AddAsync(user, ct);
            await _users.ReplaceBranchAccessAsync(organizationId, user.UserId, request.BranchScope == BranchScope.ALL ? Array.Empty<Guid>() : request.BranchIds, ct);
            await _audit.LogAsync("user.created", "identity", "USER_ACCOUNT", user.UserId, null,
                new { user.EmployeeId, user.Username, user.Role, user.BranchScope }, employee.BranchId, ct: ct);
            await _outbox.EnqueueAsync("identity.user.created", employee.BranchId,
                new { user.UserId, user.EmployeeId, user.Role }, ct: ct);
            await _unitOfWork.CommitTransactionAsync(ct);
            var branchIds = request.BranchScope == BranchScope.ALL
                ? Array.Empty<Guid>()
                : request.BranchIds.Distinct().ToArray();
            return Result<UserDto>.Success(new UserDto(user.UserId, user.EmployeeId, user.OrganizationId,
                user.Username, user.Role, user.BranchScope, user.IsActive, branchIds));
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result<UserDto>> UpdateAsync(Guid userId, UpdateUserRequest request, CancellationToken ct = default)
    {
        if (!IsAdmin()) return IdentityResults.Failure<UserDto>(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<UserDto>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var user = await _users.GetByIdWithAccessAsync(organizationId, userId, ct);
            if (user is null)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(ErrorCode.NOT_FOUND, ErrorMessages.UserNotFound);
            }
            var auth = _authorizer.AuthorizeUpdate(user, request.Role, request.BranchScope, request.BranchIds, request.IsActive);
            if (!auth.IsSuccess)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(auth.ErrorCode!.Value, auth.ErrorMessage!);
            }
            if (!await ValidateBranchesAsync(organizationId, request.BranchScope, request.BranchIds, ct))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(ErrorCode.VALIDATION_ERROR, ErrorMessages.InvalidBranchSelection);
            }

            var roleChanged = user.Role != request.Role;
            var scopeChanged = user.BranchScope != request.BranchScope;
            var existingBranchIds = user.BranchAccesses.Select(x => x.BranchId).ToHashSet();
            var requestedBranchIds = request.BranchScope == BranchScope.ALL
                ? new HashSet<Guid>()
                : request.BranchIds.ToHashSet();
            var branchesChanged = !existingBranchIds.SetEquals(requestedBranchIds);

            try { user.ChangeRoleAndScope(request.Role, request.BranchScope); }
            catch (Exception ex) when (ex is ArgumentException or IdentityDomainException)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(ErrorCode.VALIDATION_ERROR, ex.Message);
            }
            await _users.ReplaceBranchAccessAsync(organizationId, user.UserId, request.BranchScope == BranchScope.ALL ? Array.Empty<Guid>() : request.BranchIds, ct);
            if (request.IsActive.HasValue)
            {
                user.SetActive(request.IsActive.Value);
            }
            if (roleChanged || scopeChanged || branchesChanged || (request.IsActive.HasValue && !request.IsActive.Value))
            {
                user.RotateSecurityStamp(_clock.UtcNow);
                await _tokens.RevokeAllUserTokensAsync(organizationId, userId, _clock.UtcNow, ct);
            }
            await _audit.LogAsync("user.updated", "identity", "USER_ACCOUNT", user.UserId, null,
                new { user.Role, user.BranchScope, user.IsActive }, user.Employee.BranchId, ct: ct);
            await _outbox.EnqueueAsync("identity.user.updated", user.Employee.BranchId,
                new { user.UserId, user.Role, user.BranchScope, user.IsActive }, ct: ct);
            await _unitOfWork.CommitTransactionAsync(ct);
            _securityStampValidator?.Invalidate(organizationId, userId);
            return Result<UserDto>.Success(UserDtoMapper.From(user));
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result> ResetPasswordAsync(Guid userId, ResetPasswordRequest request, CancellationToken ct = default)
    {
        if (!IsAdmin()) return IdentityResults.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var user = await _users.GetByIdWithAccessAsync(organizationId, userId, ct);
            if (user is null)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure(ErrorCode.NOT_FOUND, ErrorMessages.UserNotFound);
            }
            var auth = _authorizer.AuthorizeSensitiveAction(user);
            if (!auth.IsSuccess)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return auth;
            }
            var newHash = _passwords.HashPassword(user, request.NewPassword);
            user.UpdatePasswordHash(newHash, _clock.UtcNow);
            await _tokens.RevokeAllUserTokensAsync(organizationId, userId, _clock.UtcNow, ct);
            await _audit.LogAsync("user.password_reset", "identity", "USER_ACCOUNT", userId, null,
                new { refreshSessionsRevoked = true }, user.Employee.BranchId, ct: ct);
            await _outbox.EnqueueAsync("identity.user.password_reset", user.Employee.BranchId, new { user.UserId }, ct: ct);
            await _unitOfWork.CommitTransactionAsync(ct);
            _securityStampValidator?.Invalidate(organizationId, userId);
            return Result.Success();
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result> RevokeSessionsAsync(Guid userId, CancellationToken ct = default)
    {
        if (!IsAdmin()) return IdentityResults.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var user = await _users.GetByIdWithAccessAsync(organizationId, userId, ct);
            if (user is null)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure(ErrorCode.NOT_FOUND, ErrorMessages.UserNotFound);
            }
            var auth = _authorizer.AuthorizeSensitiveAction(user);
            if (!auth.IsSuccess)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return auth;
            }
            user.RotateSecurityStamp(_clock.UtcNow);
            await _tokens.RevokeAllUserTokensAsync(organizationId, userId, _clock.UtcNow, ct);
            await _audit.LogAsync("user.sessions_revoked", "identity", "USER_ACCOUNT", userId, null,
                new { sessionsRevoked = true }, user.Employee.BranchId, ct: ct);
            await _outbox.EnqueueAsync("identity.user.sessions_revoked", user.Employee.BranchId, new { user.UserId }, ct: ct);
            await _unitOfWork.CommitTransactionAsync(ct);
            _securityStampValidator?.Invalidate(organizationId, userId);
            return Result.Success();
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    private async Task<bool> ValidateBranchesAsync(Guid organizationId, BranchScope scope, IReadOnlyCollection<Guid> branchIds, CancellationToken ct)
    {
        if (scope == BranchScope.ALL) return branchIds.Count == 0;
        var ids = branchIds.Distinct().ToArray();
        if (ids.Length == 0 || ids.Length != branchIds.Count) return false;
        return await _branches.CountActiveByIdsAsync(organizationId, ids, ct) == ids.Length;
    }

    private bool IsAdmin() => string.Equals(_currentUser.Role, UserRole.Admin.ToString(), StringComparison.Ordinal);
}
