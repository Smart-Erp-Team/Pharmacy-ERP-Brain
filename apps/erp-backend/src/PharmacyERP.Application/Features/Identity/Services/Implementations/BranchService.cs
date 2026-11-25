namespace PharmacyERP.Application.Features.Identity.Services.Implementations;

/// <summary>
/// Manages branch CRUD, default inventory location seeding on branch creation,
/// and single-use branch enrollment token issuance/redemption.
/// </summary>
public sealed class BranchService : IBranchService
{
    private readonly IBranchRepository _branches;
    private readonly IBranchEnrollmentRepository _enrollments;
    private readonly IBranchDefaultLocationSeeder _locationSeeder;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAuditLogger _audit;
    private readonly IOutboxService _outbox;
    private readonly IIdempotencyService _idempotency;
    private readonly ITenantContext _tenant;
    private readonly ICurrentUser _currentUser;
    private readonly IDateTimeProvider _clock;
    private readonly IRuntimeModeProvider _runtimeMode;
    private readonly IGenericRepository<OutboxEventCursor>? _outboxCursors;

    public BranchService(IBranchRepository branches, IBranchEnrollmentRepository enrollments, IBranchDefaultLocationSeeder locationSeeder,
        IUnitOfWork unitOfWork, IAuditLogger audit, IOutboxService outbox, IIdempotencyService idempotency, ITenantContext tenant,
        ICurrentUser currentUser, IDateTimeProvider clock, IRuntimeModeProvider runtimeMode,
        IGenericRepository<OutboxEventCursor>? outboxCursors = null)
    { _branches = branches; _enrollments = enrollments; _locationSeeder = locationSeeder; _unitOfWork = unitOfWork; _audit = audit; _outbox = outbox; _idempotency = idempotency; _tenant = tenant; _currentUser = currentUser; _clock = clock; _runtimeMode = runtimeMode; _outboxCursors = outboxCursors; }

    public async Task<Result<PagedResult<BranchDto>>> GetPagedAsync(bool includeInactive, string? search, int page, int pageSize, CancellationToken ct = default)
    {
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<PagedResult<BranchDto>>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        var pageErrors = IdentityResults.ValidatePagination(page, pageSize);
        if (pageErrors.Count > 0) return IdentityResults.Failure<PagedResult<BranchDto>>(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, pageErrors);

        // Explicit read transaction ensures TenantRlsConnectionInterceptor sets app.current_tenant_id
        // for PostgreSQL FORCE ROW LEVEL SECURITY before any SELECT executes.
        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            PagedResult<BranchDto> mappedPage;
            if (IsAllBranchAdmin())
            {
                var pagedBranches = await _branches.GetPagedAsync(organizationId, includeInactive, search, page, pageSize, ct);
                mappedPage = new PagedResult<BranchDto>(pagedBranches.Items.Select(BranchDtoMapper.From).ToArray(), page, pageSize, pagedBranches.TotalCount);
            }
            else
            {
                var pagedBranches = await _branches.GetPagedByIdsAsync(organizationId, _currentUser.AuthorizedBranchIds, includeInactive, search, page, pageSize, ct);
                mappedPage = new PagedResult<BranchDto>(pagedBranches.Items.Select(BranchDtoMapper.From).ToArray(), page, pageSize, pagedBranches.TotalCount);
            }
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            return Result<PagedResult<BranchDto>>.Success(mappedPage);
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
        if (_runtimeMode.CurrentMode == ErpRuntimeMode.BranchLocal) return IdentityResults.Failure<BranchDto>(ErrorCode.NOT_FOUND, ErrorMessages.CloudOnlyOperationUnavailable);
        if (!IsAllBranchAdmin()) return IdentityResults.Failure<BranchDto>(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<BranchDto>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey)) return IdentityResults.MissingIdempotencyKey<BranchDto>();

        var idempotencyKey = request.IdempotencyKey.Trim();
        if (idempotencyKey.Length > 100)
            return IdentityResults.Failure<BranchDto>(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError,
                new[] { new ApiErrorDetailDto("idempotency_key", "IdempotencyKey cannot exceed 100 characters.") });

        var normalizedRequest = request with { IdempotencyKey = idempotencyKey };

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            try
            {
                var idempotencyCheck = await _idempotency.CheckAsync<CreateBranchRequest, BranchDto>(
                    "identity.branch.create", idempotencyKey, null, normalizedRequest, ct);
                if (idempotencyCheck.IsReplay && idempotencyCheck.ReplayedResponse is not null)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<BranchDto>.Success(idempotencyCheck.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<BranchDto>(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            if (await _branches.ExistsByCodeAsync(organizationId, normalizedRequest.BranchCode, ct))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<BranchDto>(ErrorCode.CONFLICT, ErrorMessages.DuplicateBranchCode);
            }
            Branch branch;
            try { branch = Branch.Create(organizationId, normalizedRequest.BranchCode, normalizedRequest.Name, normalizedRequest.Address.ToValueObject()); }
            catch (Exception exception) when (exception is ArgumentException or IdentityDomainException)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.ValidationFailure<BranchDto>(exception);
            }
            await _branches.AddAsync(branch, ct);
            // Seed the three default inventory locations (Sellable, Quarantine, Scrap) atomically with the branch.
            await _locationSeeder.SeedDefaultLocationsAsync(organizationId, branch.BranchId, ct);
            await _audit.LogAsync("branch.created", "identity", "BRANCH", branch.BranchId, null, new { branch.BranchCode, branch.Name }, branch.BranchId, ct: ct);
            await _outbox.EnqueueAsync("identity.branch.created", branch.BranchId, new { branch.BranchId, branch.BranchCode }, ct: ct);

            var dto = BranchDtoMapper.From(branch);
            await _idempotency.PersistResponseAsync("identity.branch.create", idempotencyKey, null, normalizedRequest, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<BranchDto>.Success(dto);
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result<BranchDto>> UpdateAsync(Guid branchId, UpdateBranchRequest request, CancellationToken ct = default)
    {
        if (_runtimeMode.CurrentMode == ErpRuntimeMode.BranchLocal) return IdentityResults.Failure<BranchDto>(ErrorCode.NOT_FOUND, ErrorMessages.CloudOnlyOperationUnavailable);
        if (!IsAdmin()) return IdentityResults.Failure<BranchDto>(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<BranchDto>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey)) return IdentityResults.MissingIdempotencyKey<BranchDto>();

        var idempotencyKey = request.IdempotencyKey.Trim();
        if (idempotencyKey.Length > 100)
            return IdentityResults.Failure<BranchDto>(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError,
                new[] { new ApiErrorDetailDto("idempotency_key", "IdempotencyKey cannot exceed 100 characters.") });

        if (request.Name is not null && string.IsNullOrWhiteSpace(request.Name))
            return IdentityResults.Failure<BranchDto>(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError,
                new[] { new ApiErrorDetailDto("name", "Branch name cannot be empty.") });

        var normalizedRequest = request with { IdempotencyKey = idempotencyKey };
        var idempotencyPayload = new { BranchId = branchId, Request = normalizedRequest };

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
            if (normalizedRequest.IsActive.HasValue && normalizedRequest.IsActive.Value != branch.IsActive && !IsAllBranchAdmin())
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<BranchDto>(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
            }

            try
            {
                var idempotencyCheck = await _idempotency.CheckAsync<object, BranchDto>(
                    "identity.branch.update", idempotencyKey, branchId, idempotencyPayload, ct);
                if (idempotencyCheck.IsReplay && idempotencyCheck.ReplayedResponse is not null)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<BranchDto>.Success(idempotencyCheck.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<BranchDto>(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            if (normalizedRequest.Name is not null || normalizedRequest.Address is not null)
            {
                try
                {
                    branch.UpdateDetails(
                        normalizedRequest.Name ?? branch.Name,
                        normalizedRequest.Address?.ToValueObject() ?? branch.Address);
                }
                catch (Exception exception) when (exception is ArgumentException or IdentityDomainException)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return IdentityResults.ValidationFailure<BranchDto>(exception);
                }
            }
            if (normalizedRequest.IsActive.HasValue) branch.SetActive(normalizedRequest.IsActive.Value);
            await _audit.LogAsync("branch.updated", "identity", "BRANCH", branch.BranchId, null, new { branch.Name, branch.IsActive }, branch.BranchId, ct: ct);
            await _outbox.EnqueueAsync("identity.branch.updated", branch.BranchId, new { branch.BranchId, branch.IsActive }, ct: ct);

            var dto = BranchDtoMapper.From(branch);
            await _idempotency.PersistResponseAsync("identity.branch.update", idempotencyKey, branchId, idempotencyPayload, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<BranchDto>.Success(dto);
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result<EnrollmentTokenResponse>> IssueEnrollmentTokenAsync(Guid branchId, string idempotencyKey, CancellationToken ct = default)
    {
        if (_runtimeMode.CurrentMode == ErpRuntimeMode.BranchLocal) return IdentityResults.Failure<EnrollmentTokenResponse>(ErrorCode.NOT_FOUND, ErrorMessages.CloudOnlyOperationUnavailable);
        if (!IsAdmin()) return IdentityResults.Failure<EnrollmentTokenResponse>(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);
        if (_tenant.OrganizationId is not Guid organizationId) return IdentityResults.Failure<EnrollmentTokenResponse>(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);
        if (string.IsNullOrWhiteSpace(idempotencyKey)) return IdentityResults.MissingIdempotencyKey<EnrollmentTokenResponse>();

        var normalizedKey = idempotencyKey.Trim();
        if (normalizedKey.Length > 100)
            return IdentityResults.Failure<EnrollmentTokenResponse>(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError,
                new[] { new ApiErrorDetailDto("idempotency_key", "IdempotencyKey cannot exceed 100 characters.") });

        var idempotencyPayload = new { BranchId = branchId };

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

            try
            {
                var idempotencyCheck = await _idempotency.CheckAsync<object, EnrollmentTokenResponse>(
                    "identity.branch.enrollment_token.issue", normalizedKey, branchId, idempotencyPayload, ct);
                if (idempotencyCheck.IsReplay && idempotencyCheck.ReplayedResponse is not null)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<EnrollmentTokenResponse>.Success(idempotencyCheck.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return IdentityResults.Failure<EnrollmentTokenResponse>(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            var now = _clock.UtcNow;
            var clearToken = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
            var enrollment = BranchEnrollment.Create(organizationId, branchId, HashToken(clearToken), now.AddMinutes(15), now);
            await _enrollments.AddAsync(enrollment, ct);
            await _audit.LogAsync("branch.enrollment_token.issued", "identity", "BRANCH_ENROLLMENT", enrollment.EnrollmentId, null, new { enrollment.ExpiresAt }, branchId, ct: ct);
            await _outbox.EnqueueAsync("identity.branch.enrollment_issued", branchId, new { enrollment.EnrollmentId, enrollment.ExpiresAt }, ct: ct);

            var dto = new EnrollmentTokenResponse(clearToken, enrollment.ExpiresAt);
            await _idempotency.PersistResponseAsync("identity.branch.enrollment_token.issue", normalizedKey, branchId, idempotencyPayload, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<EnrollmentTokenResponse>.Success(dto);
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    public async Task<Result<RedeemBranchEnrollmentResponse>> RedeemEnrollmentAsync(RedeemBranchEnrollmentRequest request, CancellationToken ct = default)
    {
        if (_runtimeMode.CurrentMode == ErpRuntimeMode.BranchLocal) return IdentityResults.Failure<RedeemBranchEnrollmentResponse>(ErrorCode.NOT_FOUND, ErrorMessages.CloudOnlyOperationUnavailable);
        if (string.IsNullOrWhiteSpace(request.Token)) return IdentityResults.Failure<RedeemBranchEnrollmentResponse>(ErrorCode.UNAUTHORIZED, ErrorMessages.InvalidEnrollmentToken);
        var tokenHash = HashToken(request.Token);

        // Anonymous enrollment redemption: discover owning tenant under temporary system bypass,
        // then switch to strict tenant-scoped RLS for redeeming the one-time token.
        _tenant.AllowSystemBypass();
        await _unitOfWork.BeginTransactionAsync(ct);
        Guid? discoveredOrganizationId;
        try
        {
            discoveredOrganizationId = await _enrollments.FindOrganizationIdByTokenHashAsync(tokenHash, ct);
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
            var enrollment = await _enrollments.GetByTokenHashAsync(tokenHash, ct);
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

            // Read the tenant's real OUTBOX_EVENT_CURSOR sequence after enqueuing the enrollment event
            // so the newly enrolled BranchLocal node starts from the exact Cloud sequence checkpoint.
            var cursor = _outboxCursors is not null
                ? await _outboxCursors.GetByIdAsync(enrollment.OrganizationId, ct)
                : null;
            var initialSyncCursor = cursor?.LastEventSequence ?? 0L;

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<RedeemBranchEnrollmentResponse>.Success(
                new RedeemBranchEnrollmentResponse(enrollment.OrganizationId, enrollment.BranchId, credential, initialSyncCursor, expiry));
        }
        catch { await _unitOfWork.RollbackTransactionAsync(CancellationToken.None); throw; }
    }

    private bool IsAdmin() => string.Equals(_currentUser.Role, UserRole.Admin.ToString(), StringComparison.Ordinal);
    private bool IsAllBranchAdmin() => IsAdmin() && string.Equals(_currentUser.BranchScope, BranchScope.ALL.ToString(), StringComparison.OrdinalIgnoreCase);
    private static byte[] HashToken(string value) => SHA256.HashData(Encoding.UTF8.GetBytes(value));
    private static string Base64UrlEncode(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
