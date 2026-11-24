namespace PharmacyERP.Application.Features.Inventory.Services.Implementations;

/// <summary>
/// Manages branch inventory locations (sellable, quarantine, scrap) with idempotency,
/// branch-level access control, audit logging, and outbox notifications.
/// </summary>
public class InventoryLocationService : IInventoryLocationService
{
    private const string CreateIdempotencyScope = "inventory.location.create";
    private const string UpdateIdempotencyScope = "inventory.location.update";

    private readonly IInventoryLocationRepository _locationRepo;
    private readonly ITenantContext _tenantContext;
    private readonly ICurrentUser _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IIdempotencyService _idempotencyService;
    private readonly IAuditLogger _auditLogger;
    private readonly IOutboxService _outboxService;

    public InventoryLocationService(
        IInventoryLocationRepository locationRepo,
        ITenantContext tenantContext,
        ICurrentUser currentUser,
        IUnitOfWork unitOfWork,
        IDateTimeProvider dateTimeProvider,
        IIdempotencyService idempotencyService,
        IAuditLogger auditLogger,
        IOutboxService outboxService)
    {
        _locationRepo = locationRepo;
        _tenantContext = tenantContext;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _dateTimeProvider = dateTimeProvider;
        _idempotencyService = idempotencyService;
        _auditLogger = auditLogger;
        _outboxService = outboxService;
    }

    public async Task<Result<InventoryLocationDto>> CreateAsync(CreateInventoryLocationRequest request, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue || _tenantContext.OrganizationId.Value == Guid.Empty)
            return Result<InventoryLocationDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        var validationErrors = InventoryLocationValidators.ValidateCreate(request);
        if (validationErrors.Count > 0)
            return Result<InventoryLocationDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        if (!_currentUser.CanAccessBranch(request.BranchId))
            return Result<InventoryLocationDto>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        Guid orgId = _tenantContext.OrganizationId.Value;

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            try
            {
                var idempotencyResult = await _idempotencyService.CheckAsync<CreateInventoryLocationRequest, InventoryLocationDto>(
                    CreateIdempotencyScope, request.IdempotencyKey, request.BranchId, request, ct);

                if (idempotencyResult.IsReplay && idempotencyResult.ReplayedResponse != null)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<InventoryLocationDto>.Success(idempotencyResult.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return Result<InventoryLocationDto>.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            bool codeExists = await _locationRepo.ExistsByCodeAsync(orgId, request.BranchId, request.LocationCode, null, ct);
            if (codeExists)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return Result<InventoryLocationDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.DuplicateLocationCode);
            }

            var location = InventoryLocation.Create(
                orgId,
                request.BranchId,
                request.LocationCode,
                request.Name,
                request.LocationType,
                request.IsSellable,
                _dateTimeProvider.UtcNow);

            await _locationRepo.AddAsync(location, ct);
            await _unitOfWork.SaveChangesAsync(ct);

            var dto = ToDto(location);

            await _auditLogger.LogAsync(
                action: "CREATE",
                entitySchema: "inventory",
                entityName: "INVENTORY_LOCATION",
                entityId: location.LocationId,
                beforeData: null,
                afterData: dto,
                branchId: location.BranchId,
                ct: ct);

            await _outboxService.EnqueueAsync(
                "inventory.location.created",
                location.BranchId,
                dto,
                "1.0",
                ct);

            await _idempotencyService.PersistResponseAsync(
                CreateIdempotencyScope, request.IdempotencyKey, location.BranchId, request, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<InventoryLocationDto>.Success(dto);
        }
        catch (Exception)
        {
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            throw;
        }
    }

    public async Task<Result<InventoryLocationDto>> UpdateAsync(Guid locationId, UpdateInventoryLocationRequest request, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue || _tenantContext.OrganizationId.Value == Guid.Empty)
            return Result<InventoryLocationDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        var validationErrors = InventoryLocationValidators.ValidateUpdate(request);
        if (validationErrors.Count > 0)
            return Result<InventoryLocationDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        Guid orgId = _tenantContext.OrganizationId.Value;

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var location = await _locationRepo.GetByIdAsync(orgId, locationId, ct);
            if (location == null)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return Result<InventoryLocationDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.LocationNotFound);
            }

            if (!_currentUser.CanAccessBranch(location.BranchId))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return Result<InventoryLocationDto>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);
            }

            var idempotencyPayload = new { LocationId = locationId, Request = request };
            try
            {
                var idempotencyResult = await _idempotencyService.CheckAsync<object, InventoryLocationDto>(
                    UpdateIdempotencyScope, request.IdempotencyKey, location.BranchId, idempotencyPayload, ct);

                if (idempotencyResult.IsReplay && idempotencyResult.ReplayedResponse != null)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<InventoryLocationDto>.Success(idempotencyResult.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return Result<InventoryLocationDto>.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            var beforeData = ToDto(location);

            try
            {
                location.UpdateDetails(
                    request.Name ?? location.Name,
                    request.IsSellable ?? location.IsSellable,
                    request.IsActive ?? location.IsActive,
                    _dateTimeProvider.UtcNow);
            }
            catch (InvalidLocationSellableFlagException)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return Result<InventoryLocationDto>.Failure(
                    ErrorCode.VALIDATION_ERROR,
                    ErrorMessages.InvalidLocationSellableFlag,
                    new[] { new ApiErrorDetailDto("is_sellable", ErrorMessages.InvalidLocationSellableFlag) });
            }

            await _unitOfWork.SaveChangesAsync(ct);

            var dto = ToDto(location);

            await _auditLogger.LogAsync(
                action: "UPDATE",
                entitySchema: "inventory",
                entityName: "INVENTORY_LOCATION",
                entityId: location.LocationId,
                beforeData: beforeData,
                afterData: dto,
                branchId: location.BranchId,
                ct: ct);

            await _outboxService.EnqueueAsync(
                "inventory.location.updated",
                location.BranchId,
                dto,
                "1.0",
                ct);

            await _idempotencyService.PersistResponseAsync(
                UpdateIdempotencyScope, request.IdempotencyKey, location.BranchId, idempotencyPayload, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<InventoryLocationDto>.Success(dto);
        }
        catch (Exception)
        {
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            throw;
        }
    }

    public async Task<Result<InventoryLocationDto>> GetByIdAsync(Guid locationId, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue || _tenantContext.OrganizationId.Value == Guid.Empty)
            return Result<InventoryLocationDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        Guid orgId = _tenantContext.OrganizationId.Value;
        var ownsTransaction = !_unitOfWork.HasActiveTransaction;

        try
        {
            if (ownsTransaction)
            {
                await _unitOfWork.BeginTransactionAsync(ct);
            }

            var location = await _locationRepo.GetByIdAsync(orgId, locationId, ct);
            if (location == null)
                return Result<InventoryLocationDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.LocationNotFound);

            if (!_currentUser.CanAccessBranch(location.BranchId))
                return Result<InventoryLocationDto>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

            return Result<InventoryLocationDto>.Success(ToDto(location));
        }
        finally
        {
            if (ownsTransaction && _unitOfWork.HasActiveTransaction)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            }
        }
    }

    public async Task<Result<PagedResult<InventoryLocationDto>>> GetPagedAsync(Guid branchId, bool? isSellable, bool includeInactive, int page, int pageSize, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue || _tenantContext.OrganizationId.Value == Guid.Empty)
            return Result<PagedResult<InventoryLocationDto>>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        var validationErrors = new List<ApiErrorDetailDto>();
        if (branchId == Guid.Empty)
            validationErrors.Add(new ApiErrorDetailDto("branch_id", "BranchId is required."));
        if (page < 1)
            validationErrors.Add(new ApiErrorDetailDto("page", "Page must be at least 1."));
        if (pageSize is < 1 or > 200)
            validationErrors.Add(new ApiErrorDetailDto("page_size", "PageSize must be between 1 and 200."));
        if (validationErrors.Count > 0)
            return Result<PagedResult<InventoryLocationDto>>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        if (!_currentUser.CanAccessBranch(branchId))
            return Result<PagedResult<InventoryLocationDto>>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        Guid orgId = _tenantContext.OrganizationId.Value;
        var ownsTransaction = !_unitOfWork.HasActiveTransaction;

        try
        {
            if (ownsTransaction)
            {
                await _unitOfWork.BeginTransactionAsync(ct);
            }

            var pagedLocations = await _locationRepo.GetPagedAsync(orgId, branchId, isSellable, includeInactive, page, pageSize, ct);
            var dtos = pagedLocations.Items.Select(ToDto).ToList();

            return Result<PagedResult<InventoryLocationDto>>.Success(
                new PagedResult<InventoryLocationDto>(
                    Items: dtos,
                    Page: pagedLocations.Page,
                    PageSize: pagedLocations.PageSize,
                    TotalCount: pagedLocations.TotalCount));
        }
        finally
        {
            if (ownsTransaction && _unitOfWork.HasActiveTransaction)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            }
        }
    }

    private static InventoryLocationDto ToDto(InventoryLocation location) =>
        new(location.LocationId, location.OrganizationId, location.BranchId, location.LocationCode, location.Name, location.LocationType, location.IsSellable, location.IsActive, location.UpdatedAt);
}
