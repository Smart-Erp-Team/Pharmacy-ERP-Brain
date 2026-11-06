using PharmacyERP.Application.Common.Constants;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Common.Interfaces.CrossModule;
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

public class ProductUomService : IProductUomService
{
    private readonly IProductUomRepository _uomRepository;
    private readonly IProductRepository _productRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenantContext;
    private readonly ICurrentUser _currentUser;
    private readonly IRuntimeModeProvider _runtimeModeProvider;
    private readonly IIdempotencyService _idempotencyService;
    private readonly IAuditLogger _auditLogger;
    private readonly IOutboxService _outboxService;
    private readonly IProductInventoryUsageChecker _usageChecker;

    public ProductUomService(
        IProductUomRepository uomRepository,
        IProductRepository productRepository,
        IUnitOfWork unitOfWork,
        ITenantContext tenantContext,
        ICurrentUser currentUser,
        IRuntimeModeProvider runtimeModeProvider,
        IIdempotencyService idempotencyService,
        IAuditLogger auditLogger,
        IOutboxService outboxService,
        IProductInventoryUsageChecker usageChecker)
    {
        _uomRepository = uomRepository;
        _productRepository = productRepository;
        _unitOfWork = unitOfWork;
        _tenantContext = tenantContext;
        _currentUser = currentUser;
        _runtimeModeProvider = runtimeModeProvider;
        _idempotencyService = idempotencyService;
        _auditLogger = auditLogger;
        _outboxService = outboxService;
        _usageChecker = usageChecker;
    }

    public async Task<Result<IReadOnlyList<ProductUomDto>>> GetProductUomsAsync(Guid productId, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<IReadOnlyList<ProductUomDto>>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsAuthorizedForRead())
            return Result<IReadOnlyList<ProductUomDto>>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var orgId = _tenantContext.OrganizationId.Value;
        var uoms = await _uomRepository.GetByProductIdAsync(orgId, productId, includeInactive: true, ct);
        var dtos = uoms.Select(MapToDto).ToList();

        return Result<IReadOnlyList<ProductUomDto>>.Success(dtos);
    }

    public async Task<Result<ProductUomDto>> CreateProductUomAsync(Guid productId, CreateProductUomRequest request, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<ProductUomDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsCloudRuntimeMode())
            return Result<ProductUomDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        if (!IsAuthorizedForWrite())
            return Result<ProductUomDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var validationErrors = CreateProductUomRequestValidator.Validate(request);
        if (validationErrors.Count > 0)
            return Result<ProductUomDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        var orgId = _tenantContext.OrganizationId.Value;

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            try
            {
                var idempotencyResult = await _idempotencyService.CheckAsync<CreateProductUomRequest, ProductUomDto>(
                    "catalog.uom.create", request.IdempotencyKey, null, request, ct);

                if (idempotencyResult.IsReplay && idempotencyResult.ReplayedResponse != null)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductUomDto>.Success(idempotencyResult.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductUomDto>.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            var product = await _productRepository.GetByIdWithUomsAsync(orgId, productId, ct);
            if (product == null)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductUomDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductNotFound);
            }

            var uomCodeExists = await _uomRepository.ExistsByUomCodeAsync(orgId, productId, request.UomCode, null, ct);
            if (uomCodeExists)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductUomDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.DuplicateUomCode);
            }

            ProductUom uom;
            try
            {
                uom = product.AddUom(
                    request.UomCode,
                    request.DisplayName,
                    request.ConversionToBase,
                    request.SaleUnitPrice,
                    request.IsBase,
                    request.IsSellable,
                    request.IsPurchasable);
            }
            catch (CatalogDomainException ex)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductUomDto>.Failure(ErrorCode.VALIDATION_ERROR, ex.Message);
            }
            catch (ArgumentException ex)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductUomDto>.Failure(ErrorCode.VALIDATION_ERROR, ex.Message);
            }

            await _uomRepository.AddAsync(uom, ct);
            await _unitOfWork.SaveChangesAsync(ct);

            await _auditLogger.LogAsync("CREATE", "catalog", "PRODUCT_UOM", uom.ProductUomId, null, uom, null, null, null, ct);
            await _outboxService.EnqueueAsync(
                "catalog.uom.created",
                null,
                new { uom.ProductUomId, uom.ProductId, uom.UomCode, uom.ConversionToBase },
                "1.0",
                ct);

            var dto = MapToDto(uom);
            await _idempotencyService.PersistResponseAsync("catalog.uom.create", request.IdempotencyKey, null, request, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<ProductUomDto>.Success(dto);
        }
        catch (Exception)
        {
            await _unitOfWork.RollbackTransactionAsync(ct);
            throw;
        }
    }

    public async Task<Result<ProductUomDto>> UpdateProductUomAsync(Guid productId, Guid uomId, UpdateProductUomRequest request, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<ProductUomDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsCloudRuntimeMode())
            return Result<ProductUomDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        if (!IsAuthorizedForWrite())
            return Result<ProductUomDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var validationErrors = UpdateProductUomRequestValidator.Validate(request);
        if (validationErrors.Count > 0)
            return Result<ProductUomDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        var orgId = _tenantContext.OrganizationId.Value;

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            try
            {
                var idempotencyResult = await _idempotencyService.CheckAsync<UpdateProductUomRequest, ProductUomDto>(
                    "catalog.uom.update", request.IdempotencyKey, null, request, ct);

                if (idempotencyResult.IsReplay && idempotencyResult.ReplayedResponse != null)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductUomDto>.Success(idempotencyResult.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductUomDto>.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            var uom = await _uomRepository.GetByIdAsync(orgId, productId, uomId, ct);
            if (uom == null)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductUomDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductUomNotFound);
            }

            if (request.ConversionToBase.HasValue && request.ConversionToBase.Value != uom.ConversionToBase)
            {
                var isReferenced = await _usageChecker.HasAnyStockOrDocumentReferenceForUomAsync(orgId, productId, uomId, ct);
                if (isReferenced)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductUomDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.HistoricalUomModificationForbidden);
                }

                try
                {
                    uom.UpdateConversionFactor(request.ConversionToBase.Value, isReferenced);
                }
                catch (CatalogDomainException ex)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductUomDto>.Failure(ErrorCode.VALIDATION_ERROR, ex.Message);
                }
            }

            var displayName = request.DisplayName ?? uom.DisplayName;
            var saleUnitPrice = request.SaleUnitPrice.HasValue ? request.SaleUnitPrice : uom.SaleUnitPrice;
            var isSellable = request.IsSellable ?? uom.IsSellable;
            var isPurchasable = request.IsPurchasable ?? uom.IsPurchasable;

            try
            {
                uom.UpdateNonHistoricalAttributes(displayName, saleUnitPrice, isSellable, isPurchasable);
            }
            catch (CatalogDomainException ex)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductUomDto>.Failure(ErrorCode.VALIDATION_ERROR, ex.Message);
            }
            catch (ArgumentException ex)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductUomDto>.Failure(ErrorCode.VALIDATION_ERROR, ex.Message);
            }

            if (request.IsActive.HasValue)
            {
                try
                {
                    if (request.IsActive.Value)
                    {
                        uom.Activate();
                    }
                    else
                    {
                        uom.Deactivate();
                    }
                }
                catch (CatalogDomainException ex)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductUomDto>.Failure(ErrorCode.VALIDATION_ERROR, ex.Message);
                }
            }

            await _unitOfWork.SaveChangesAsync(ct);

            await _auditLogger.LogAsync("UPDATE", "catalog", "PRODUCT_UOM", uom.ProductUomId, null, uom, null, null, null, ct);
            await _outboxService.EnqueueAsync(
                "catalog.uom.updated",
                null,
                new { uom.ProductUomId, uom.ProductId, uom.UomCode, uom.IsActive },
                "1.0",
                ct);

            var dto = MapToDto(uom);
            await _idempotencyService.PersistResponseAsync("catalog.uom.update", request.IdempotencyKey, null, request, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<ProductUomDto>.Success(dto);
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

    private static ProductUomDto MapToDto(ProductUom u) =>
        new(
            u.ProductUomId,
            u.ProductId,
            u.UomCode,
            u.DisplayName,
            u.ConversionToBase,
            u.SaleUnitPrice,
            u.IsBase,
            u.IsSellable,
            u.IsPurchasable,
            u.IsActive,
            u.UpdatedAt);
}
