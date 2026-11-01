using PharmacyERP.Application.Common.Constants;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Common.Interfaces.Integration;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Application.Features.Catalog.DTOs;
using PharmacyERP.Application.Features.Catalog.Interfaces;
using PharmacyERP.Application.Features.Catalog.Services.Interfaces;
using PharmacyERP.Application.Features.Catalog.Validators;
using PharmacyERP.Domain.Entities.Catalog;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Domain.Exceptions;

namespace PharmacyERP.Application.Features.Catalog.Services.Implementations;

public class ProductCategoryService : IProductCategoryService
{
    private readonly IProductCategoryRepository _categoryRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenantContext;
    private readonly ICurrentUser _currentUser;
    private readonly IRuntimeModeProvider _runtimeModeProvider;
    private readonly IIdempotencyService _idempotencyService;
    private readonly IAuditLogger _auditLogger;
    private readonly IOutboxService _outboxService;

    public ProductCategoryService(
        IProductCategoryRepository categoryRepository,
        IUnitOfWork unitOfWork,
        ITenantContext tenantContext,
        ICurrentUser currentUser,
        IRuntimeModeProvider runtimeModeProvider,
        IIdempotencyService idempotencyService,
        IAuditLogger auditLogger,
        IOutboxService outboxService)
    {
        _categoryRepository = categoryRepository;
        _unitOfWork = unitOfWork;
        _tenantContext = tenantContext;
        _currentUser = currentUser;
        _runtimeModeProvider = runtimeModeProvider;
        _idempotencyService = idempotencyService;
        _auditLogger = auditLogger;
        _outboxService = outboxService;
    }

    public async Task<Result<PagedResult<ProductCategoryDto>>> GetCategoriesAsync(
        Guid? parentCategoryId,
        bool includeInactive,
        string? search,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<PagedResult<ProductCategoryDto>>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsAuthorizedForRead())
            return Result<PagedResult<ProductCategoryDto>>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var orgId = _tenantContext.OrganizationId.Value;
        var pagedResult = await _categoryRepository.GetPagedAsync(orgId, parentCategoryId, includeInactive, search, page, pageSize, ct);

        var dtos = pagedResult.Items.Select(MapToDto).ToList();
        var result = new PagedResult<ProductCategoryDto>(dtos, pagedResult.Page, pagedResult.PageSize, pagedResult.TotalCount, pagedResult.NextCursor);

        return Result<PagedResult<ProductCategoryDto>>.Success(result);
    }

    public async Task<Result<ProductCategoryDto>> GetCategoryByIdAsync(Guid categoryId, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<ProductCategoryDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsAuthorizedForRead())
            return Result<ProductCategoryDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var orgId = _tenantContext.OrganizationId.Value;
        var category = await _categoryRepository.GetByIdAsync(orgId, categoryId, ct);
        if (category == null)
            return Result<ProductCategoryDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductCategoryNotFound);

        return Result<ProductCategoryDto>.Success(MapToDto(category));
    }

    public async Task<Result<ProductCategoryDto>> CreateCategoryAsync(CreateProductCategoryRequest request, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<ProductCategoryDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsCloudRuntimeMode())
            return Result<ProductCategoryDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        if (!IsAuthorizedForWrite())
            return Result<ProductCategoryDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var validationErrors = CreateProductCategoryRequestValidator.Validate(request);
        if (validationErrors.Count > 0)
            return Result<ProductCategoryDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        var orgId = _tenantContext.OrganizationId.Value;

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            try
            {
                var idempotencyResult = await _idempotencyService.CheckAsync<CreateProductCategoryRequest, ProductCategoryDto>(
                    "catalog.category.create", request.IdempotencyKey, null, request, ct);

                if (idempotencyResult.IsReplay && idempotencyResult.ReplayedResponse != null)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductCategoryDto>.Success(idempotencyResult.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductCategoryDto>.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            if (request.ParentCategoryId.HasValue)
            {
                var parentExistsAndActive = await _categoryRepository.ExistsAndActiveAsync(orgId, request.ParentCategoryId.Value, ct);
                if (!parentExistsAndActive)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductCategoryDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.CategoryNotFoundOrInactive);
                }
            }

            var codeExists = await _categoryRepository.ExistsByCodeAsync(orgId, request.Code, null, ct);
            if (codeExists)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductCategoryDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.DuplicateCategoryCode);
            }

            var category = ProductCategory.Create(orgId, request.Code, request.Name, request.Description, request.ParentCategoryId);

            await _categoryRepository.AddAsync(category, ct);
            await _unitOfWork.SaveChangesAsync(ct);

            await _auditLogger.LogAsync("CREATE", "catalog", "PRODUCT_CATEGORY", category.CategoryId, null, category, null, null, null, ct);
            await _outboxService.EnqueueAsync("catalog.category.created", null, new { CategoryId = category.CategoryId, category.Code, category.Name }, "1.0", ct);

            var dto = MapToDto(category);
            await _idempotencyService.PersistResponseAsync("catalog.category.create", request.IdempotencyKey, null, request, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<ProductCategoryDto>.Success(dto);
        }
        catch (Exception)
        {
            await _unitOfWork.RollbackTransactionAsync(ct);
            throw;
        }
    }

    public async Task<Result<ProductCategoryDto>> UpdateCategoryAsync(Guid categoryId, UpdateProductCategoryRequest request, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<ProductCategoryDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsCloudRuntimeMode())
            return Result<ProductCategoryDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        if (!IsAuthorizedForWrite())
            return Result<ProductCategoryDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var validationErrors = UpdateProductCategoryRequestValidator.Validate(request);
        if (validationErrors.Count > 0)
            return Result<ProductCategoryDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        var orgId = _tenantContext.OrganizationId.Value;

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            try
            {
                var idempotencyResult = await _idempotencyService.CheckAsync<UpdateProductCategoryRequest, ProductCategoryDto>(
                    "catalog.category.update", request.IdempotencyKey, null, request, ct);

                if (idempotencyResult.IsReplay && idempotencyResult.ReplayedResponse != null)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductCategoryDto>.Success(idempotencyResult.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductCategoryDto>.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            var category = await _categoryRepository.GetByIdAsync(orgId, categoryId, ct);
            if (category == null)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductCategoryDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductCategoryNotFound);
            }

            if (request.ParentCategoryId.HasValue)
            {
                if (request.ParentCategoryId.Value == categoryId)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductCategoryDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.CategorySelfParent);
                }

                var parentExistsAndActive = await _categoryRepository.ExistsAndActiveAsync(orgId, request.ParentCategoryId.Value, ct);
                if (!parentExistsAndActive)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductCategoryDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.CategoryNotFoundOrInactive);
                }
            }

            category.UpdateDetails(request.Name, request.Description, request.ParentCategoryId);

            if (request.IsActive.HasValue)
            {
                category.SetActiveState(request.IsActive.Value);
            }

            await _unitOfWork.SaveChangesAsync(ct);

            await _auditLogger.LogAsync("UPDATE", "catalog", "PRODUCT_CATEGORY", category.CategoryId, null, category, null, null, null, ct);
            await _outboxService.EnqueueAsync("catalog.category.updated", null, new { CategoryId = category.CategoryId, category.Code, category.Name, category.IsActive }, "1.0", ct);

            var dto = MapToDto(category);
            await _idempotencyService.PersistResponseAsync("catalog.category.update", request.IdempotencyKey, null, request, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<ProductCategoryDto>.Success(dto);
        }
        catch (Exception)
        {
            await _unitOfWork.RollbackTransactionAsync(ct);
            throw;
        }
    }

    private bool IsCloudRuntimeMode() =>
        _runtimeModeProvider.CurrentMode == ErpRuntimeMode.Cloud;

    private bool IsAuthorizedForWrite() =>
        string.Equals(_currentUser.Role, "Admin", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(_currentUser.Role, "Pharmacist", StringComparison.OrdinalIgnoreCase);

    private bool IsAuthorizedForRead() =>
        string.Equals(_currentUser.Role, "Admin", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(_currentUser.Role, "Pharmacist", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(_currentUser.Role, "Cashier", StringComparison.OrdinalIgnoreCase);

    private static ProductCategoryDto MapToDto(ProductCategory c) =>
        new(c.CategoryId, c.OrganizationId, c.ParentCategoryId, c.Code, c.Name, c.Description, c.IsActive, c.CreatedAt, c.UpdatedAt);
}
