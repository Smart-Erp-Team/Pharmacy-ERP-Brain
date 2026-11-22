namespace PharmacyERP.Application.Features.Identity.Services.Implementations;

public sealed class BranchService : IBranchService
{
    private readonly IBranchRepository _branches;
    private readonly IBranchEnrollmentRepository _enrollments;
    private readonly IBranchDefaultLocationSeeder _locationSeeder;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAuditLogger _audit;
    private readonly IOutboxService _outbox;
    private readonly ITenantContext _tenant;
    private readonly ICurrentUser _currentUser;
    private readonly IDateTimeProvider _clock;
    private readonly IRuntimeModeProvider _runtimeMode;

    public BranchService(IBranchRepository branches, IBranchEnrollmentRepository enrollments, IBranchDefaultLocationSeeder locationSeeder,
        IUnitOfWork unitOfWork, IAuditLogger audit, IOutboxService outbox, ITenantContext tenant,
        ICurrentUser currentUser, IDateTimeProvider clock, IRuntimeModeProvider runtimeMode)
    { _branches = branches; _enrollments = enrollments; _locationSeeder = locationSeeder; _unitOfWork = unitOfWork; _audit = audit; _outbox = outbox; _tenant = tenant; _currentUser = currentUser; _clock = clock; _runtimeMode = runtimeMode; }

    public async Task<Result<PagedResult<BranchDto>>> GetPagedAsync(bool includeInactive, string? search, int page, int pageSize, CancellationToken ct = default)
    {
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<PagedResult<BranchDto>>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        if (!ValidPage(page, pageSize)) return IdentityResults.Failure<PagedResult<BranchDto>>(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError);
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            PagedResult<BranchDto> mapped;
            if (IsAllBranchAdmin())
            {
                var result = await _branches.GetPagedAsync(organizationId, includeInactive, search, page, pageSize, ct);
                mapped = new PagedResult<BranchDto>(result.Items.Select(BranchDtoMapper.From).ToArray(), page, pageSize, result.TotalCount);
            }
            else
            {
                var result = await _branches.GetPagedByIdsAsync(organizationId, _currentUser.AuthorizedBranchIds, includeInactive, search, page, pageSize, ct);
                mapped = new PagedResult<BranchDto>(result.Items.Select(BranchDtoMapper.From).ToArray(), page, pageSize, result.TotalCount);
            }
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            return Result<PagedResult<BranchDto>>.Success(mapped);
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result<BranchDto>> GetByIdAsync(Guid branchId, CancellationToken ct = default)
    {
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<BranchDto>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var branch = await _branches.GetByIdAsync(organizationId, branchId, ct);
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            if (branch is null) return IdentityResults.Failure<BranchDto>(ErrorCode.NOT_FOUND, ErrorMessages.NotFound);
            if (!_currentUser.CanAccessBranch(branchId)) return IdentityResults.Failure<BranchDto>(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);
            return Result<BranchDto>.Success(BranchDtoMapper.From(branch));
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result<BranchDto>> CreateAsync(CreateBranchRequest request, CancellationToken ct = default)
    {
        if (!IsAllBranchAdmin()) return IdentityResults.Failure<BranchDto>(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<BranchDto>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            if (await _branches.ExistsByCodeAsync(organizationId, request.BranchCode, ct))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<BranchDto>(ErrorCode.CONFLICT, ErrorMessages.DuplicateBranchCode);
            }
            Branch branch;
            try { branch = Branch.Create(organizationId, request.BranchCode, request.Name, request.Address.ToValueObject()); }
            catch (Exception ex) when (ex is ArgumentException or IdentityDomainException)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<BranchDto>(ErrorCode.VALIDATION_ERROR, ex.Message);
            }
            await _branches.AddAsync(branch, ct);
            await _locationSeeder.SeedDefaultLocationsAsync(organizationId, branch.BranchId, ct);
            await _audit.LogAsync("branch.created", "identity", "BRANCH", branch.BranchId, null, new { branch.BranchCode, branch.Name }, branch.BranchId, ct: ct);
            await _outbox.EnqueueAsync("identity.branch.created", branch.BranchId, new { branch.BranchId, branch.BranchCode }, ct: ct);
            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<BranchDto>.Success(BranchDtoMapper.From(branch));
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result<BranchDto>> UpdateAsync(Guid branchId, UpdateBranchRequest request, CancellationToken ct = default)
    {
        if (!IsAdmin()) return IdentityResults.Failure<BranchDto>(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<BranchDto>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var branch = await _branches.GetByIdAsync(organizationId, branchId, ct);
            if (branch is null)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<BranchDto>(ErrorCode.NOT_FOUND, ErrorMessages.NotFound);
            }
            if (!_currentUser.CanAccessBranch(branchId))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<BranchDto>(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);
            }
            if (request.IsActive.HasValue && request.IsActive.Value != branch.IsActive && !IsAllBranchAdmin())
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<BranchDto>(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
            }
            try { branch.UpdateDetails(request.Name, request.Address.ToValueObject()); }
            catch (Exception ex) when (ex is ArgumentException or IdentityDomainException)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<BranchDto>(ErrorCode.VALIDATION_ERROR, ex.Message);
            }
            if (request.IsActive.HasValue) branch.SetActive(request.IsActive.Value);
            await _audit.LogAsync("branch.updated", "identity", "BRANCH", branch.BranchId, null, new { branch.Name, branch.IsActive }, branch.BranchId, ct: ct);
            await _outbox.EnqueueAsync("identity.branch.updated", branch.BranchId, new { branch.BranchId, branch.IsActive }, ct: ct);
            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<BranchDto>.Success(BranchDtoMapper.From(branch));
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result<EnrollmentTokenResponse>> IssueEnrollmentTokenAsync(Guid branchId, CancellationToken ct = default)
    {
        if (!IsAdmin()) return IdentityResults.Failure<EnrollmentTokenResponse>(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<EnrollmentTokenResponse>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var branch = await _branches.GetByIdAsync(organizationId, branchId, ct);
            if (branch is null || !branch.IsActive)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<EnrollmentTokenResponse>(ErrorCode.NOT_FOUND, ErrorMessages.NotFound);
            }
            if (!_currentUser.CanAccessBranch(branchId))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<EnrollmentTokenResponse>(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);
            }
            var now = _clock.UtcNow;
            var clearToken = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
            var enrollment = BranchEnrollment.Create(organizationId, branchId, HashToken(clearToken), now.AddMinutes(15), now);
            await _enrollments.AddAsync(enrollment, ct);
            await _audit.LogAsync("branch.enrollment_token.issued", "identity", "BRANCH_ENROLLMENT", enrollment.EnrollmentId, null, new { enrollment.ExpiresAt }, branchId, ct: ct);
            await _outbox.EnqueueAsync("identity.branch.enrollment_issued", branchId, new { enrollment.EnrollmentId, enrollment.ExpiresAt }, ct: ct);
            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<EnrollmentTokenResponse>.Success(new EnrollmentTokenResponse(clearToken, enrollment.ExpiresAt));
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result<RedeemBranchEnrollmentResponse>> RedeemEnrollmentAsync(RedeemBranchEnrollmentRequest request, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(request.Token)) return IdentityResults.Failure<RedeemBranchEnrollmentResponse>(ErrorCode.UNAUTHORIZED, ErrorMessages.InvalidEnrollmentToken);
        var hash = HashToken(request.Token);
        _tenant.AllowSystemBypass();
        await _unitOfWork.BeginTransactionAsync(ct);
        Guid? discoveredOrganizationId;
        try
        {
            discoveredOrganizationId = await _enrollments.FindOrganizationIdByTokenHashAsync(hash, ct);
        }
        catch
        {
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            throw;
        }
        await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
        if (discoveredOrganizationId is null) return IdentityResults.Failure<RedeemBranchEnrollmentResponse>(ErrorCode.UNAUTHORIZED, ErrorMessages.InvalidEnrollmentToken);

        _tenant.SetTenant(discoveredOrganizationId.Value);
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var enrollment = await _enrollments.GetByTokenHashAsync(hash, ct);
            if (enrollment is null || enrollment.OrganizationId != discoveredOrganizationId.Value || !enrollment.Branch.IsActive)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<RedeemBranchEnrollmentResponse>(ErrorCode.UNAUTHORIZED, ErrorMessages.InvalidEnrollmentToken);
            }
            var now = _clock.UtcNow;
            try { enrollment.Redeem(now); }
            catch (EnrollmentTokenInvalidOrExpiredException)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<RedeemBranchEnrollmentResponse>(ErrorCode.UNAUTHORIZED, ErrorMessages.InvalidEnrollmentToken);
            }
            var credential = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
            var expiry = now.AddHours(24);
            await _audit.LogAsync("branch.enrollment.redeemed", "identity", "BRANCH_ENROLLMENT", enrollment.EnrollmentId,
                null, new { enrollment.BranchId, enrollment.UsedAt }, enrollment.BranchId, actorTypeOverride: AuditActorType.SYSTEM, ct: ct);
            await _outbox.EnqueueAsync("identity.branch.enrolled", enrollment.BranchId,
                new { enrollment.OrganizationId, enrollment.BranchId, credentialExpiresAt = expiry }, ct: ct);
            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<RedeemBranchEnrollmentResponse>.Success(new RedeemBranchEnrollmentResponse(enrollment.OrganizationId, enrollment.BranchId, credential, 0, expiry));
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    private bool IsAdmin() => string.Equals(_currentUser.Role, UserRole.Admin.ToString(), StringComparison.Ordinal);
    private bool IsAllBranchAdmin() => IsAdmin() && string.Equals(_currentUser.BranchScope, BranchScope.ALL.ToString(), StringComparison.OrdinalIgnoreCase);
    private static bool ValidPage(int page, int pageSize) => page > 0 && pageSize is > 0 and <= 200;
    private static byte[] HashToken(string value) => SHA256.HashData(Encoding.UTF8.GetBytes(value));
    private static string Base64UrlEncode(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
