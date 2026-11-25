namespace PharmacyERP.Application.Features.Identity.Services.Implementations;

/// <summary>
/// Manages user accounts, branch access assignments, password resets, and session revocations.
/// Rotates <see cref="UserAccount.SecurityStamp"/> and invalidates the validator cache whenever
/// privileges, credentials, or active status change so existing JWTs are rejected immediately.
/// </summary>
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
    private readonly IIdempotencyService _idempotency;
    private readonly ITenantContext _tenant;
    private readonly ICurrentUser _currentUser;
    private readonly IDateTimeProvider _clock;
    private readonly IUserManagementAuthorizer _authorizer;
    private readonly IUserSecurityStampValidator? _securityStampValidator;

    public UserService(IUserAccountRepository users, IEmployeeRepository employees, IBranchRepository branches,
        IUserRefreshTokenRepository tokens, IPasswordHasherService passwords, IUnitOfWork unitOfWork,
        IAuditLogger audit, IOutboxService outbox, IIdempotencyService idempotency, ITenantContext tenant, ICurrentUser currentUser, IDateTimeProvider clock,
        IUserManagementAuthorizer authorizer, IUserSecurityStampValidator? securityStampValidator = null)
    { _users = users; _employees = employees; _branches = branches; _tokens = tokens; _passwords = passwords; _unitOfWork = unitOfWork; _audit = audit; _outbox = outbox; _idempotency = idempotency; _tenant = tenant; _currentUser = currentUser; _clock = clock; _authorizer = authorizer; _securityStampValidator = securityStampValidator; }

    public async Task<Result<PagedResult<UserDto>>> GetPagedAsync(Guid? branchId, UserRole? role, bool includeInactive, int page, int pageSize, CancellationToken ct = default)
    {
        var authorizationResult = _authorizer.AuthorizeList(branchId);
        if (!authorizationResult.IsSuccess) return IdentityResults.Failure<PagedResult<UserDto>>(authorizationResult.ErrorCode!.Value, authorizationResult.ErrorMessage!);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<PagedResult<UserDto>>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        var pageErrors = IdentityResults.ValidatePagination(page, pageSize);
        if (pageErrors.Count > 0) return IdentityResults.Failure<PagedResult<UserDto>>(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, pageErrors);

        // Explicit read transaction binds the tenant GUC for PostgreSQL FORCE ROW LEVEL SECURITY.
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var pagedUsers = await _users.GetPagedAsync(organizationId, branchId, role, includeInactive, page, pageSize, ct);
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            return Result<PagedResult<UserDto>>.Success(new PagedResult<UserDto>(pagedUsers.Items.Select(UserDtoMapper.From).ToArray(), page, pageSize, pagedUsers.TotalCount));
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
            var authorizationResult = _authorizer.AuthorizeRead(user);
            if (!authorizationResult.IsSuccess) return IdentityResults.Failure<UserDto>(authorizationResult.ErrorCode!.Value, authorizationResult.ErrorMessage!);
            return Result<UserDto>.Success(UserDtoMapper.From(user));
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result<UserDto>> CreateAsync(CreateUserRequest request, CancellationToken ct = default)
    {
        if (!IsAdmin()) return IdentityResults.Failure<UserDto>(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<UserDto>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey)) return IdentityResults.MissingIdempotencyKey<UserDto>();

        var idempotencyKey = request.IdempotencyKey.Trim();
        var validationErrors = new List<ApiErrorDetailDto>();
        if (idempotencyKey.Length > 100)
            validationErrors.Add(new ApiErrorDetailDto("idempotency_key", "IdempotencyKey cannot exceed 100 characters."));
        if (!Enum.IsDefined(request.Role))
            validationErrors.Add(new ApiErrorDetailDto("role", "Role is required and must be a valid user role."));
        if (!Enum.IsDefined(request.BranchScope))
            validationErrors.Add(new ApiErrorDetailDto("branch_scope", "BranchScope must be a valid branch scope."));
        if (validationErrors.Count > 0)
            return IdentityResults.Failure<UserDto>(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        var normalizedRequest = request with { IdempotencyKey = idempotencyKey };

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var employee = await _employees.GetByIdAsync(organizationId, normalizedRequest.EmployeeId, ct);
            if (employee is null || !employee.IsActive)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(ErrorCode.NOT_FOUND, ErrorMessages.NotFound);
            }
            var authorizationResult = _authorizer.AuthorizeCreate(employee, normalizedRequest.Role, normalizedRequest.BranchScope, normalizedRequest.BranchIds);
            if (!authorizationResult.IsSuccess)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(authorizationResult.ErrorCode!.Value, authorizationResult.ErrorMessage!);
            }

            try
            {
                var idempotencyCheck = await _idempotency.CheckAsync<CreateUserRequest, UserDto>(
                    "identity.user.create", idempotencyKey, null, normalizedRequest, ct);
                if (idempotencyCheck.IsReplay && idempotencyCheck.ReplayedResponse is not null)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<UserDto>.Success(idempotencyCheck.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            if (await _users.ExistsByUsernameAsync(organizationId, normalizedRequest.Username.Trim().ToUpperInvariant(), ct))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(ErrorCode.CONFLICT, ErrorMessages.DuplicateUsername);
            }
            if (await _users.ExistsForEmployeeAsync(organizationId, employee.EmployeeId, ct))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(ErrorCode.CONFLICT, ErrorMessages.EmployeeAlreadyHasAccount);
            }
            if (!await ValidateBranchesAsync(organizationId, normalizedRequest.BranchScope, normalizedRequest.BranchIds, ct))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(
                    ErrorCode.VALIDATION_ERROR,
                    ErrorMessages.InvalidBranchSelection,
                    new[] { new ApiErrorDetailDto("branch_ids", ErrorMessages.InvalidBranchSelection) });
            }

            UserAccount user;
            try
            {
                user = UserAccount.Create(organizationId, employee.EmployeeId, normalizedRequest.Username, "pending-hash", normalizedRequest.Role, normalizedRequest.BranchScope);
                user.UpdatePasswordHash(_passwords.HashPassword(user, normalizedRequest.Password), _clock.UtcNow);
            }
            catch (Exception exception) when (exception is ArgumentException or IdentityDomainException)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.ValidationFailure<UserDto>(exception);
            }
            await _users.AddAsync(user, ct);
            await _users.ReplaceBranchAccessAsync(organizationId, user.UserId, normalizedRequest.BranchScope == BranchScope.ALL ? Array.Empty<Guid>() : normalizedRequest.BranchIds, ct);
            await _audit.LogAsync("user.created", "identity", "USER_ACCOUNT", user.UserId, null,
                new { user.EmployeeId, user.Username, user.Role, user.BranchScope }, employee.BranchId, ct: ct);
            await _outbox.EnqueueAsync("identity.user.created", employee.BranchId,
                new { user.UserId, user.EmployeeId, user.Role }, ct: ct);

            var assignedBranchIds = normalizedRequest.BranchScope == BranchScope.ALL
                ? Array.Empty<Guid>()
                : normalizedRequest.BranchIds.Distinct().ToArray();
            var dto = new UserDto(user.UserId, user.EmployeeId, user.OrganizationId,
                user.Username, user.Role, user.BranchScope, user.IsActive, assignedBranchIds,
                user.LastLoginAt, user.LockoutEnd, user.AccessFailedCount);
            await _idempotency.PersistResponseAsync("identity.user.create", idempotencyKey, null, normalizedRequest, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<UserDto>.Success(dto);
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result<UserDto>> UpdateAsync(Guid userId, UpdateUserRequest request, CancellationToken ct = default)
    {
        if (!IsAdmin()) return IdentityResults.Failure<UserDto>(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<UserDto>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey)) return IdentityResults.MissingIdempotencyKey<UserDto>();

        var idempotencyKey = request.IdempotencyKey.Trim();
        var validationErrors = new List<ApiErrorDetailDto>();
        if (idempotencyKey.Length > 100)
            validationErrors.Add(new ApiErrorDetailDto("idempotency_key", "IdempotencyKey cannot exceed 100 characters."));
        if (request.Role.HasValue && !Enum.IsDefined(request.Role.Value))
            validationErrors.Add(new ApiErrorDetailDto("role", "Role must be a valid user role."));
        if (request.BranchScope.HasValue && !Enum.IsDefined(request.BranchScope.Value))
            validationErrors.Add(new ApiErrorDetailDto("branch_scope", "BranchScope must be a valid branch scope."));
        if (validationErrors.Count > 0)
            return IdentityResults.Failure<UserDto>(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        var normalizedRequest = request with { IdempotencyKey = idempotencyKey };
        var idempotencyPayload = new { UserId = userId, Request = normalizedRequest };

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var user = await _users.GetByIdWithAccessAsync(organizationId, userId, ct);
            if (user is null)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(ErrorCode.NOT_FOUND, ErrorMessages.UserNotFound);
            }

            // Support true partial PATCH semantics: omitted fields retain the user's existing values
            // without clearing existing branch assignments.
            var effectiveRole = normalizedRequest.Role ?? user.Role;
            var effectiveScope = normalizedRequest.BranchScope ?? user.BranchScope;
            var existingBranchIds = user.BranchAccesses.Select(access => access.BranchId).ToArray();
            var effectiveBranchIds = normalizedRequest.BranchIds is not null
                ? normalizedRequest.BranchIds
                : effectiveScope == BranchScope.ALL
                    ? Array.Empty<Guid>()
                    : existingBranchIds;

            var authorizationResult = _authorizer.AuthorizeUpdate(user, effectiveRole, effectiveScope, effectiveBranchIds, normalizedRequest.IsActive);
            if (!authorizationResult.IsSuccess)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(authorizationResult.ErrorCode!.Value, authorizationResult.ErrorMessage!);
            }

            try
            {
                var idempotencyCheck = await _idempotency.CheckAsync<object, UserDto>(
                    "identity.user.update", idempotencyKey, null, idempotencyPayload, ct);
                if (idempotencyCheck.IsReplay && idempotencyCheck.ReplayedResponse is not null)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<UserDto>.Success(idempotencyCheck.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            if (!await ValidateBranchesAsync(organizationId, effectiveScope, effectiveBranchIds, ct))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<UserDto>(
                    ErrorCode.VALIDATION_ERROR,
                    ErrorMessages.InvalidBranchSelection,
                    new[] { new ApiErrorDetailDto("branch_ids", ErrorMessages.InvalidBranchSelection) });
            }

            var roleChanged = user.Role != effectiveRole;
            var scopeChanged = user.BranchScope != effectiveScope;
            var existingBranchSet = existingBranchIds.ToHashSet();
            var requestedBranchIds = effectiveScope == BranchScope.ALL
                ? new HashSet<Guid>()
                : effectiveBranchIds.ToHashSet();
            var branchesChanged = !existingBranchSet.SetEquals(requestedBranchIds);

            try { user.ChangeRoleAndScope(effectiveRole, effectiveScope); }
            catch (Exception exception) when (exception is ArgumentException or IdentityDomainException)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.ValidationFailure<UserDto>(exception);
            }

            if (branchesChanged || scopeChanged)
            {
                await _users.ReplaceBranchAccessAsync(organizationId, user.UserId, effectiveScope == BranchScope.ALL ? Array.Empty<Guid>() : effectiveBranchIds, ct);
            }

            if (normalizedRequest.IsActive.HasValue)
            {
                user.SetActive(normalizedRequest.IsActive.Value);
            }

            // Any privilege change or deactivation must invalidate active JWTs (via SecurityStamp)
            // and revoke refresh sessions so stale permissions cannot persist.
            var isDeactivating = normalizedRequest.IsActive.HasValue && !normalizedRequest.IsActive.Value;
            if (roleChanged || scopeChanged || branchesChanged || isDeactivating)
            {
                user.RotateSecurityStamp(_clock.UtcNow);
                await _tokens.RevokeAllUserTokensAsync(organizationId, userId, _clock.UtcNow, ct);
            }
            await _audit.LogAsync("user.updated", "identity", "USER_ACCOUNT", user.UserId, null,
                new { user.Role, user.BranchScope, user.IsActive }, user.Employee.BranchId, ct: ct);
            await _outbox.EnqueueAsync("identity.user.updated", user.Employee.BranchId,
                new { user.UserId, user.Role, user.BranchScope, user.IsActive }, ct: ct);

            var dto = UserDtoMapper.From(user);
            await _idempotency.PersistResponseAsync("identity.user.update", idempotencyKey, null, idempotencyPayload, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);

            // Evict cached stamp after commit so subsequent JWT validations observe the rotated stamp immediately.
            _securityStampValidator?.Invalidate(organizationId, userId);
            return Result<UserDto>.Success(dto);
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result> ResetPasswordAsync(Guid userId, ResetPasswordRequest request, CancellationToken ct = default)
    {
        if (!IsAdmin()) return IdentityResults.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey)) return IdentityResults.MissingIdempotencyKey();

        var idempotencyKey = request.IdempotencyKey.Trim();
        if (idempotencyKey.Length > 100)
            return IdentityResults.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError,
                new[] { new ApiErrorDetailDto("idempotency_key", "IdempotencyKey cannot exceed 100 characters.") });

        var normalizedRequest = request with { IdempotencyKey = idempotencyKey };
        var idempotencyPayload = new { UserId = userId, Request = normalizedRequest };

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var user = await _users.GetByIdWithAccessAsync(organizationId, userId, ct);
            if (user is null)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure(ErrorCode.NOT_FOUND, ErrorMessages.UserNotFound);
            }
            var authorizationResult = _authorizer.AuthorizeSensitiveAction(user);
            if (!authorizationResult.IsSuccess)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return authorizationResult;
            }

            try
            {
                var idempotencyCheck = await _idempotency.CheckAsync<object, IdempotencyVoidResult>(
                    "identity.user.password_reset", idempotencyKey, null, idempotencyPayload, ct);
                if (idempotencyCheck.IsReplay)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result.Success();
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            var newPasswordHash = _passwords.HashPassword(user, normalizedRequest.NewPassword);
            user.UpdatePasswordHash(newPasswordHash, _clock.UtcNow);
            await _tokens.RevokeAllUserTokensAsync(organizationId, userId, _clock.UtcNow, ct);
            await _audit.LogAsync("user.password_reset", "identity", "USER_ACCOUNT", userId, null,
                new { refreshSessionsRevoked = true }, user.Employee.BranchId, ct: ct);
            await _outbox.EnqueueAsync("identity.user.password_reset", user.Employee.BranchId, new { user.UserId }, ct: ct);
            await _idempotency.PersistResponseAsync("identity.user.password_reset", idempotencyKey, null, idempotencyPayload, new IdempotencyVoidResult(true), ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            _securityStampValidator?.Invalidate(organizationId, userId);
            return Result.Success();
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result> RevokeSessionsAsync(Guid userId, string idempotencyKey, CancellationToken ct = default)
    {
        if (!IsAdmin()) return IdentityResults.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        if (string.IsNullOrWhiteSpace(idempotencyKey)) return IdentityResults.MissingIdempotencyKey();

        var normalizedKey = idempotencyKey.Trim();
        if (normalizedKey.Length > 100)
            return IdentityResults.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError,
                new[] { new ApiErrorDetailDto("idempotency_key", "IdempotencyKey cannot exceed 100 characters.") });
        var idempotencyPayload = new { UserId = userId };

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var user = await _users.GetByIdWithAccessAsync(organizationId, userId, ct);
            if (user is null)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure(ErrorCode.NOT_FOUND, ErrorMessages.UserNotFound);
            }
            var authorizationResult = _authorizer.AuthorizeSensitiveAction(user);
            if (!authorizationResult.IsSuccess)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return authorizationResult;
            }

            try
            {
                var idempotencyCheck = await _idempotency.CheckAsync<object, IdempotencyVoidResult>(
                    "identity.user.revoke_sessions", normalizedKey, null, idempotencyPayload, ct);
                if (idempotencyCheck.IsReplay)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result.Success();
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            user.RotateSecurityStamp(_clock.UtcNow);
            await _tokens.RevokeAllUserTokensAsync(organizationId, userId, _clock.UtcNow, ct);
            await _audit.LogAsync("user.sessions_revoked", "identity", "USER_ACCOUNT", userId, null,
                new { sessionsRevoked = true }, user.Employee.BranchId, ct: ct);
            await _outbox.EnqueueAsync("identity.user.sessions_revoked", user.Employee.BranchId, new { user.UserId }, ct: ct);
            await _idempotency.PersistResponseAsync("identity.user.revoke_sessions", normalizedKey, null, idempotencyPayload, new IdempotencyVoidResult(true), ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            _securityStampValidator?.Invalidate(organizationId, userId);
            return Result.Success();
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    private async Task<bool> ValidateBranchesAsync(Guid organizationId, BranchScope scope, IReadOnlyCollection<Guid> branchIds, CancellationToken cancellationToken)
    {
        if (scope == BranchScope.ALL) return branchIds.Count == 0;
        var distinctBranchIds = branchIds.Distinct().ToArray();
        if (distinctBranchIds.Length == 0 || distinctBranchIds.Length != branchIds.Count) return false;
        return await _branches.CountActiveByIdsAsync(organizationId, distinctBranchIds, cancellationToken) == distinctBranchIds.Length;
    }

    private bool IsAdmin() => string.Equals(_currentUser.Role, UserRole.Admin.ToString(), StringComparison.Ordinal);
}
