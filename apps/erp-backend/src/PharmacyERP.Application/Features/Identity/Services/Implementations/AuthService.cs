namespace PharmacyERP.Application.Features.Identity.Services.Implementations;

/// <summary>
/// Handles tenant-scoped authentication, refresh-token rotation with reuse detection,
/// session logout, and current-user context projection.
/// </summary>
public sealed class AuthService : IAuthService
{
    private static readonly TimeSpan RefreshLifetime = TimeSpan.FromDays(30);
    private readonly IOrganizationRepository _organizations;
    private readonly IUserAccountRepository _users;
    private readonly IUserRefreshTokenRepository _tokens;
    private readonly IPasswordHasherService _passwords;
    private readonly IJwtTokenGenerator _jwt;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAuditLogger _audit;
    private readonly IOutboxService _outbox;
    private readonly ITenantContext _tenant;
    private readonly ICurrentUser _currentUser;
    private readonly IDateTimeProvider _clock;
    private readonly IRuntimeModeProvider _runtimeMode;

    public AuthService(IOrganizationRepository organizations, IUserAccountRepository users, IUserRefreshTokenRepository tokens,
        IPasswordHasherService passwords, IJwtTokenGenerator jwt, IUnitOfWork unitOfWork, IAuditLogger audit,
        IOutboxService outbox, ITenantContext tenant, ICurrentUser currentUser, IDateTimeProvider clock,
        IRuntimeModeProvider runtimeMode)
    {
        _organizations = organizations; _users = users; _tokens = tokens; _passwords = passwords; _jwt = jwt;
        _unitOfWork = unitOfWork; _audit = audit; _outbox = outbox; _tenant = tenant; _currentUser = currentUser;
        _clock = clock; _runtimeMode = runtimeMode;
    }

    public async Task<Result<LoginResponse>> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        // Anonymous login has no JWT tenant claim yet: run a short discovery transaction with
        // AllowSystemBypass() to locate the organization, then switch to tenant-bound RLS below.
        _tenant.AllowSystemBypass();
        await _unitOfWork.BeginTransactionAsync(ct);
        Organization? organization;
        try
        {
            organization = await _organizations.GetActiveByCodeAsync(request.OrganizationCode, ct);
        }
        catch
        {
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            throw;
        }
        await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
        if (organization is null)
            return IdentityResults.Failure<LoginResponse>(ErrorCode.UNAUTHORIZED, ErrorMessages.InvalidCredentials);

        // SetTenant clears IsSystemBypassEnabled so all subsequent reads/writes enforce PostgreSQL FORCE RLS.
        _tenant.SetTenant(organization.OrganizationId);
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var normalizedUsername = request.Username.Trim().ToUpperInvariant();
            var user = await _users.GetForLoginAsync(organization.OrganizationId, normalizedUsername, ct);
            if (user is null)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<LoginResponse>(ErrorCode.UNAUTHORIZED, ErrorMessages.InvalidCredentials);
            }

            var now = _clock.UtcNow;
            if (!user.IsActive || !user.Employee.IsActive)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<LoginResponse>(ErrorCode.FORBIDDEN, ErrorMessages.AccountInactive);
            }
            if (user.LockoutEnd > now)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<LoginResponse>(ErrorCode.FORBIDDEN, ErrorMessages.AccountLocked);
            }

            if (!_passwords.VerifyPassword(user, user.PasswordHash, request.Password))
            {
                var (failedCount, lockoutEnd) = await _users.RecordLoginFailureAsync(
                    organization.OrganizationId, user.UserId, now, 5, TimeSpan.FromMinutes(15), ct);
                await _audit.LogAsync("auth.login.failed", "identity", "USER_ACCOUNT", user.UserId,
                    null, new { AccessFailedCount = failedCount, LockoutEnd = lockoutEnd }, branchId: user.Employee.BranchId, ct: ct);
                await _unitOfWork.CommitTransactionAsync(ct);
                return IdentityResults.Failure<LoginResponse>(ErrorCode.UNAUTHORIZED, ErrorMessages.InvalidCredentials);
            }

            if (!IsAuthorizedForCurrentRuntimeMode(user))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<LoginResponse>(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);
            }

            user.RecordLoginSuccess(now);
            var response = await IssueTokensAsync(user, Guid.NewGuid(), now, ct);
            await _audit.LogAsync("auth.login.succeeded", "identity", "USER_ACCOUNT", user.UserId, null,
                new { user.LastLoginAt }, user.Employee.BranchId, ct: ct);
            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<LoginResponse>.Success(response);
        }
        catch
        {
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            throw;
        }
    }

    public async Task<Result<LoginResponse>> RefreshAsync(RefreshTokenRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
            return IdentityResults.Failure<LoginResponse>(ErrorCode.UNAUTHORIZED, ErrorMessages.InvalidRefreshToken);

        var tokenHash = HashToken(request.RefreshToken);

        // Anonymous refresh discovery: look up owning organization under temporary system bypass,
        // then immediately bind the tenant context for strict RLS enforcement during token rotation.
        _tenant.AllowSystemBypass();
        await _unitOfWork.BeginTransactionAsync(ct);
        Guid? discoveredOrganizationId;
        try
        {
            discoveredOrganizationId = await _tokens.FindOrganizationIdByTokenHashAsync(tokenHash, ct);
        }
        catch
        {
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            throw;
        }
        await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
        if (discoveredOrganizationId is null)
            return IdentityResults.Failure<LoginResponse>(ErrorCode.UNAUTHORIZED, ErrorMessages.InvalidRefreshToken);

        _tenant.SetTenant(discoveredOrganizationId.Value);
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var refreshToken = await _tokens.GetByTokenHashAsync(tokenHash, ct);
            if (refreshToken is null)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<LoginResponse>(ErrorCode.UNAUTHORIZED, ErrorMessages.InvalidRefreshToken);
            }

            var now = _clock.UtcNow;

            // Reuse detection: presenting an already-consumed refresh token signals possible theft,
            // so revoke the entire token family and commit the revocation + audit event.
            if (refreshToken.ConsumedAt.HasValue)
            {
                await _tokens.RevokeFamilyAsync(refreshToken.OrganizationId, refreshToken.TokenFamilyId, now, ct);
                await _audit.LogAsync("auth.refresh.reuse_detected", "identity", "USER_REFRESH_TOKEN", refreshToken.RefreshTokenId,
                    null, new { refreshToken.TokenFamilyId }, ct: ct);
                await _unitOfWork.CommitTransactionAsync(ct);
                return IdentityResults.Failure<LoginResponse>(ErrorCode.UNAUTHORIZED, ErrorMessages.InvalidRefreshToken);
            }

            var isTokenAndAccountActive = refreshToken.IsActive(now)
                && refreshToken.UserAccount.IsActive
                && refreshToken.UserAccount.Employee.IsActive;
            if (!isTokenAndAccountActive)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<LoginResponse>(ErrorCode.UNAUTHORIZED, ErrorMessages.InvalidRefreshToken);
            }

            if (!IsAuthorizedForCurrentRuntimeMode(refreshToken.UserAccount))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<LoginResponse>(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);
            }

            // Refresh token rotation: mark the presented token consumed and issue a successor in the same family.
            refreshToken.Consume(now);
            var response = await IssueTokensAsync(refreshToken.UserAccount, refreshToken.TokenFamilyId, now, ct);
            await _audit.LogAsync("auth.refresh.succeeded", "identity", "USER_REFRESH_TOKEN", refreshToken.RefreshTokenId,
                null, new { refreshToken.TokenFamilyId }, ct: ct);
            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<LoginResponse>.Success(response);
        }
        catch
        {
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            throw;
        }
    }

    public async Task<Result> LogoutAsync(LogoutRequest request, CancellationToken ct = default)
    {
        if (_tenant.OrganizationId is not Guid organizationId || _currentUser.UserId is not Guid userId)
            return IdentityResults.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
            return IdentityResults.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.InvalidRefreshToken);

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var refreshToken = await _tokens.GetByTokenHashAsync(HashToken(request.RefreshToken), ct);
            if (refreshToken is null || refreshToken.OrganizationId != organizationId || refreshToken.UserId != userId)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.InvalidRefreshToken);
            }

            await _tokens.RevokeFamilyAsync(organizationId, refreshToken.TokenFamilyId, _clock.UtcNow, ct);
            await _audit.LogAsync("auth.logout", "identity", "USER_ACCOUNT", userId, null,
                new { refreshToken.TokenFamilyId }, ct: ct);
            await _unitOfWork.CommitTransactionAsync(ct);
            return Result.Success();
        }
        catch
        {
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            throw;
        }
    }

    public Result<CurrentUserDto> GetCurrentUser()
    {
        if (!_currentUser.IsAuthenticated || _currentUser.UserId is not Guid userId || _currentUser.EmployeeId is not Guid employeeId || _currentUser.OrganizationId is not Guid organizationId)
            return IdentityResults.Failure<CurrentUserDto>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        if (!Enum.TryParse<UserRole>(_currentUser.Role, out var parsedRole) || !Enum.IsDefined(parsedRole))
            return IdentityResults.Failure<CurrentUserDto>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        var parsedBranchScope = Enum.TryParse<BranchScope>(_currentUser.BranchScope, out var scope) && Enum.IsDefined(scope)
            ? scope
            : BranchScope.ASSIGNED;
        return Result<CurrentUserDto>.Success(new CurrentUserDto(
            userId,
            employeeId,
            organizationId,
            _currentUser.Username ?? string.Empty,
            parsedRole,
            parsedBranchScope,
            _currentUser.AuthorizedBranchIds.ToArray(),
            _currentUser.Scopes.ToArray(),
            _runtimeMode.CurrentMode));
    }

    private async Task<LoginResponse> IssueTokensAsync(UserAccount user, Guid tokenFamilyId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var authorizedBranchIds = user.BranchAccesses.Select(access => access.BranchId).Distinct().ToArray();
        var accessTokenResult = _jwt.GenerateAccessToken(user, authorizedBranchIds);
        var refreshTokenText = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var refreshTokenEntity = UserRefreshToken.Create(
            user.OrganizationId,
            user.UserId,
            HashToken(refreshTokenText),
            tokenFamilyId,
            now,
            now.Add(RefreshLifetime));
        await _tokens.AddAsync(refreshTokenEntity, cancellationToken);

        var isBranchLocal = _runtimeMode.CurrentMode == ErpRuntimeMode.BranchLocal;
        var effectiveBranchIds = isBranchLocal && _runtimeMode.EnrolledBranchId is Guid enrolledBranchId
            ? new[] { enrolledBranchId }
            : authorizedBranchIds;
        var effectiveBranchScope = isBranchLocal
            ? BranchScope.ASSIGNED
            : user.BranchScope;
        return new LoginResponse(
            accessTokenResult.Token,
            accessTokenResult.ExpiresAt,
            refreshTokenText,
            CurrentUserDtoMapper.From(user, effectiveBranchIds, ScopeNames(user.Role), effectiveBranchScope, _runtimeMode.CurrentMode),
            TokenType: "Bearer",
            Issuer: accessTokenResult.Issuer,
            Audience: accessTokenResult.Audience,
            KeyId: accessTokenResult.KeyId);
    }

    private bool IsAuthorizedForCurrentRuntimeMode(UserAccount user)
    {
        if (_runtimeMode.CurrentMode != ErpRuntimeMode.BranchLocal)
            return true;

        if (_runtimeMode.EnrolledBranchId is not Guid enrolledBranchId || enrolledBranchId == Guid.Empty)
            return false;

        if (user.Role == UserRole.Admin && user.BranchScope == BranchScope.ALL)
            return true;

        return user.BranchAccesses.Any(access => access.BranchId == enrolledBranchId);
    }

    private static byte[] HashToken(string value) => SHA256.HashData(Encoding.UTF8.GetBytes(value));
    private static string Base64UrlEncode(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static string[] ScopeNames(UserRole role) => role switch
    {
        // Blueprint §8.5: adhere strictly to the closed 13-scope vocabulary (no undocumented branch:admin/employee:admin).
        UserRole.Admin => new[] { "user:admin", "inventory:read", "inventory:write", "sales:read", "sales:write" },
        // Blueprint §8.5/§9.1: Pharmacist is read-only on POS sales (excludes sales:write).
        UserRole.Pharmacist => new[] { "inventory:read", "inventory:write", "sales:read" },
        UserRole.Cashier => new[] { "inventory:read", "sales:read", "sales:write" },
        _ => Array.Empty<string>()
    };
}
