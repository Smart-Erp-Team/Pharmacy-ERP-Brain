using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using PharmacyERP.Application.Common.Constants;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Application.Features.Inventory.DTOs;
using PharmacyERP.Application.Features.Inventory.Interfaces;
using PharmacyERP.Application.Features.Inventory.Services.Interfaces;
using PharmacyERP.Application.Features.Inventory.Validators;
using PharmacyERP.Domain.Entities.Inventory;
using PharmacyERP.Domain.Enums;

namespace PharmacyERP.Application.Features.Inventory.Services.Implementations;

public class InventoryLocationService : IInventoryLocationService
{
    private readonly IInventoryLocationRepository _locationRepo;
    private readonly ITenantContext _tenantContext;
    private readonly ICurrentUser _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IDateTimeProvider _dateTimeProvider;

    public InventoryLocationService(
        IInventoryLocationRepository locationRepo,
        ITenantContext tenantContext,
        ICurrentUser currentUser,
        IUnitOfWork unitOfWork,
        IDateTimeProvider dateTimeProvider)
    {
        _locationRepo = locationRepo;
        _tenantContext = tenantContext;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<InventoryLocationDto>> CreateAsync(CreateInventoryLocationRequest request, CancellationToken ct = default)
    {
        var validation = InventoryLocationValidators.ValidateCreate(request);
        if (!validation.IsValid)
            return Result<InventoryLocationDto>.Failure(ErrorCode.VALIDATION_ERROR, validation.ErrorMessage!);

        if (!_currentUser.CanAccessBranch(request.BranchId))
            return Result<InventoryLocationDto>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        Guid orgId = _tenantContext.OrganizationId ?? Guid.Empty;

        bool codeExists = await _locationRepo.ExistsByCodeAsync(orgId, request.BranchId, request.LocationCode, null, ct);
        if (codeExists)
            return Result<InventoryLocationDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.DuplicateLocationCode);

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

        return Result<InventoryLocationDto>.Success(ToDto(location));
    }

    public async Task<Result<InventoryLocationDto>> UpdateAsync(Guid locationId, UpdateInventoryLocationRequest request, CancellationToken ct = default)
    {
        Guid orgId = _tenantContext.OrganizationId ?? Guid.Empty;

        var location = await _locationRepo.GetByIdAsync(orgId, Guid.Empty, locationId, ct);
        if (location == null)
            return Result<InventoryLocationDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.LocationNotFound);

        if (!_currentUser.CanAccessBranch(location.BranchId))
            return Result<InventoryLocationDto>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        location.UpdateDetails(
            request.Name ?? location.Name,
            request.IsSellable ?? location.IsSellable,
            request.IsActive ?? location.IsActive,
            _dateTimeProvider.UtcNow);

        await _unitOfWork.SaveChangesAsync(ct);

        return Result<InventoryLocationDto>.Success(ToDto(location));
    }

    public async Task<Result<InventoryLocationDto>> GetByIdAsync(Guid locationId, CancellationToken ct = default)
    {
        Guid orgId = _tenantContext.OrganizationId ?? Guid.Empty;

        var location = await _locationRepo.GetByIdAsync(orgId, Guid.Empty, locationId, ct);
        if (location == null)
            return Result<InventoryLocationDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.LocationNotFound);

        return Result<InventoryLocationDto>.Success(ToDto(location));
    }

    public async Task<Result<PagedResult<InventoryLocationDto>>> GetPagedAsync(Guid branchId, bool? isSellable, bool includeInactive, int page, int pageSize, CancellationToken ct = default)
    {
        if (!_currentUser.CanAccessBranch(branchId))
            return Result<PagedResult<InventoryLocationDto>>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        Guid orgId = _tenantContext.OrganizationId ?? Guid.Empty;

        var pagedLocations = await _locationRepo.GetPagedAsync(orgId, branchId, isSellable, includeInactive, page, pageSize, ct);
        var dtos = pagedLocations.Items.Select(ToDto).ToList();

        return Result<PagedResult<InventoryLocationDto>>.Success(new PagedResult<InventoryLocationDto>(dtos, pagedLocations.TotalCount, page, pageSize));
    }

    private static InventoryLocationDto ToDto(InventoryLocation loc) =>
        new(loc.LocationId, loc.OrganizationId, loc.BranchId, loc.LocationCode, loc.Name, loc.LocationType, loc.IsSellable, loc.IsActive, loc.UpdatedAt);
}