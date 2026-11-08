using System.Text;
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
using PharmacyERP.Application.Features.Identity.Interfaces;
using PharmacyERP.Application.Features.Integration.DTOs;
using PharmacyERP.Domain.Entities.Catalog;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Domain.Exceptions;

namespace PharmacyERP.Application.Features.Catalog.Services.Implementations;

/// <summary>
/// Implementation of Stage 1 canonical catalog read contract and approved AI configuration writes.
/// </summary>
public class CanonicalCatalogService : ICanonicalCatalogService
{
    private const string ProductsWriteScope = "canonical.configuration.products";
    private const string ReorderRulesWriteScope = "canonical.configuration.reorder-rules";

    private readonly IProductRepository _productRepository;
    private readonly IProductCategoryRepository _categoryRepository;
    private readonly IProductUomRepository _productUomRepository;
    private readonly IProductReorderRuleRepository _reorderRuleRepository;
    private readonly IBranchRepository _branchRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenantContext;
    private readonly ICurrentUser _currentUser;
    private readonly IRuntimeModeProvider _runtimeModeProvider;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IIdempotencyService _idempotencyService;
    private readonly IAuditLogger _auditLogger;
    private readonly IOutboxService _outboxService;
    private readonly INonLotBatchInitializer _nonLotBatchInitializer;
    private readonly IProductInventoryUsageChecker _usageChecker;

    public CanonicalCatalogService(
        IProductRepository productRepository,
        IProductCategoryRepository categoryRepository,
        IProductUomRepository productUomRepository,
        IProductReorderRuleRepository reorderRuleRepository,
        IBranchRepository branchRepository,
        IUnitOfWork unitOfWork,
        ITenantContext tenantContext,
        ICurrentUser currentUser,
        IRuntimeModeProvider runtimeModeProvider,
        IDateTimeProvider dateTimeProvider,
        IIdempotencyService idempotencyService,
        IAuditLogger auditLogger,
        IOutboxService outboxService,
        INonLotBatchInitializer nonLotBatchInitializer,
        IProductInventoryUsageChecker usageChecker)
    {
        _productRepository = productRepository;
        _categoryRepository = categoryRepository;
        _productUomRepository = productUomRepository;
        _reorderRuleRepository = reorderRuleRepository;
        _branchRepository = branchRepository;
        _unitOfWork = unitOfWork;
        _tenantContext = tenantContext;
        _currentUser = currentUser;
        _runtimeModeProvider = runtimeModeProvider;
        _dateTimeProvider = dateTimeProvider;
        _idempotencyService = idempotencyService;
        _auditLogger = auditLogger;
        _outboxService = outboxService;
        _nonLotBatchInitializer = nonLotBatchInitializer;
        _usageChecker = usageChecker;
    }

    public async Task<Result<CanonicalProductFeedPageDto>> GetCanonicalProductsFeedAsync(
        DateTimeOffset? updatedSince,
        string? cursor,
        int limit = 50,
        CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<CanonicalProductFeedPageDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsAuthorized())
            return Result<CanonicalProductFeedPageDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var orgId = _tenantContext.OrganizationId.Value;
        DateTimeOffset? cursorUpdatedAt = null;
        Guid? cursorProductId = null;

        if (!string.IsNullOrWhiteSpace(cursor))
        {
            if (!TryDecodeCursor(cursor, out var decodedTime, out var decodedId))
            {
                return Result<CanonicalProductFeedPageDto>.Failure(ErrorCode.VALIDATION_ERROR, "Invalid cursor format.");
            }

            cursorUpdatedAt = decodedTime;
            cursorProductId = decodedId;
        }

        var resolvedLimit = limit <= 0 ? 50 : Math.Min(limit, 1000);
        var (products, hasNextPage) = await _productRepository.GetCanonicalFeedKeysetPageAsync(
            orgId,
            updatedSince,
            cursorUpdatedAt,
            cursorProductId,
            resolvedLimit,
            ct);

        var items = products.Select(MapToCanonicalDto).ToList();

        string? nextCursor = null;
        if (hasNextPage && items.Count > 0)
        {
            var lastItem = items[^1];
            nextCursor = EncodeCursor(lastItem.UpdatedAt, lastItem.Id);
        }

        return Result<CanonicalProductFeedPageDto>.Success(new CanonicalProductFeedPageDto(items, nextCursor));
    }

    public async Task<Result<CanonicalWriteResultDto>> ConfigureProductAsync(
        CanonicalProductConfigurationRequest request,
        CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<CanonicalWriteResultDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsCloudRuntimeMode())
            return Result<CanonicalWriteResultDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        if (!IsAuthorized())
            return Result<CanonicalWriteResultDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var validationErrors = ValidateProductConfigurationRequest(request);
        if (validationErrors.Count > 0)
            return Result<CanonicalWriteResultDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        var orgId = _tenantContext.OrganizationId.Value;

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            try
            {
                var idempotencyResult = await _idempotencyService.CheckAsync<CanonicalProductConfigurationRequest, CanonicalWriteResultDto>(
                    ProductsWriteScope, request.IdempotencyKey, null, request, ct);

                if (idempotencyResult.IsReplay && idempotencyResult.ReplayedResponse != null)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<CanonicalWriteResultDto>.Success(idempotencyResult.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<CanonicalWriteResultDto>.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            Guid targetEntityId;
            string entityType;

            switch (request.Action)
            {
                case CatalogConfigurationAction.CreateProduct:
                {
                    var catExists = await _categoryRepository.ExistsAndActiveAsync(orgId, request.CategoryId!.Value, ct);
                    if (!catExists)
                    {
                        await _unitOfWork.RollbackTransactionAsync(ct);
                        return Result<CanonicalWriteResultDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.CategoryNotFoundOrInactive);
                    }

                    var skuExists = await _productRepository.ExistsBySkuAsync(orgId, request.Sku!, null, ct);
                    if (skuExists)
                    {
                        await _unitOfWork.RollbackTransactionAsync(ct);
                        return Result<CanonicalWriteResultDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.DuplicateSku);
                    }

                    if (!string.IsNullOrWhiteSpace(request.Barcode))
                    {
                        var barcodeExists = await _productRepository.ExistsByBarcodeAsync(orgId, request.Barcode, null, ct);
                        if (barcodeExists)
                        {
                            await _unitOfWork.RollbackTransactionAsync(ct);
                            return Result<CanonicalWriteResultDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.DuplicateBarcode);
                        }
                    }

                    var initialUoms = request.Uoms!.Select(u => new InitialUomDefinition(
                        u.UomCode,
                        u.DisplayName,
                        u.ConversionToBase,
                        u.SaleUnitPrice,
                        u.IsBase,
                        u.IsSellable,
                        u.IsPurchasable
                    )).ToList();

                    var product = Product.Create(
                        orgId,
                        request.CategoryId.Value,
                        request.Sku!,
                        request.Barcode,
                        request.Name!,
                        request.GenericName,
                        request.BrandName,
                        request.BaseUomCode!,
                        request.TaxRate!.Value,
                        request.ImageUrl,
                        request.LotTrackingRequired!.Value,
                        request.ExpiryAlertDays!.Value,
                        initialUoms);

                    if (!product.LotTrackingRequired)
                    {
                        await _nonLotBatchInitializer.EnsureNonLotBatchExistsAsync(orgId, product.ProductId, ct);
                    }

                    await _productRepository.AddAsync(product, ct);
                    await _unitOfWork.SaveChangesAsync(ct);

                    var afterData = new
                    {
                        product.ProductId,
                        product.CategoryId,
                        product.Sku,
                        product.Barcode,
                        product.Name,
                        product.GenericName,
                        product.BrandName,
                        product.BaseUomCode,
                        product.TaxRate,
                        product.ImageUrl,
                        product.LotTrackingRequired,
                        product.ExpiryAlertDays,
                        product.IsActive
                    };

                    await _auditLogger.LogAsync("CREATE", "catalog", "PRODUCT", product.ProductId, null, afterData, null, AuditActorType.AI_ASSISTED, request.SourcePromptId, ct);
                    await _outboxService.EnqueueAsync("catalog.product.created", null, new { ProductId = product.ProductId, product.Sku, product.Name, product.LotTrackingRequired }, "1.0", ct);

                    targetEntityId = product.ProductId;
                    entityType = "PRODUCT";
                    break;
                }

                case CatalogConfigurationAction.UpdateProduct:
                {
                    var product = await _productRepository.GetByIdWithUomsAsync(orgId, request.ProductId!.Value, ct);
                    if (product == null)
                    {
                        await _unitOfWork.RollbackTransactionAsync(ct);
                        return Result<CanonicalWriteResultDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductNotFound);
                    }

                    var beforeData = new
                    {
                        product.CategoryId,
                        product.Sku,
                        product.Barcode,
                        product.Name,
                        product.GenericName,
                        product.BrandName,
                        product.TaxRate,
                        product.ImageUrl,
                        product.ExpiryAlertDays,
                        product.IsActive,
                        product.BaseUomCode,
                        product.LotTrackingRequired
                    };

                    if (request.CategoryId.HasValue && request.CategoryId.Value != product.CategoryId)
                    {
                        var catExists = await _categoryRepository.ExistsAndActiveAsync(orgId, request.CategoryId.Value, ct);
                        if (!catExists)
                        {
                            await _unitOfWork.RollbackTransactionAsync(ct);
                            return Result<CanonicalWriteResultDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.CategoryNotFoundOrInactive);
                        }
                    }

                    if (request.Sku != null && !string.Equals(request.Sku, product.Sku, StringComparison.Ordinal))
                    {
                        var skuExists = await _productRepository.ExistsBySkuAsync(orgId, request.Sku, product.ProductId, ct);
                        if (skuExists)
                        {
                            await _unitOfWork.RollbackTransactionAsync(ct);
                            return Result<CanonicalWriteResultDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.DuplicateSku);
                        }
                    }

                    if (request.Barcode != null && !string.Equals(request.Barcode, product.Barcode, StringComparison.Ordinal))
                    {
                        var barcodeExists = await _productRepository.ExistsByBarcodeAsync(orgId, request.Barcode, product.ProductId, ct);
                        if (barcodeExists)
                        {
                            await _unitOfWork.RollbackTransactionAsync(ct);
                            return Result<CanonicalWriteResultDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.DuplicateBarcode);
                        }
                    }

                    var modifyingBaseUom = !string.IsNullOrWhiteSpace(request.BaseUomCode) && !string.Equals(request.BaseUomCode, product.BaseUomCode, StringComparison.Ordinal);
                    var modifyingLotTracking = request.LotTrackingRequired.HasValue && request.LotTrackingRequired.Value != product.LotTrackingRequired;

                    if (modifyingBaseUom || modifyingLotTracking)
                    {
                        var hasHistory = await _usageChecker.HasAnyStockOrPostedHistoryForProductAsync(orgId, product.ProductId, ct);
                        if (hasHistory)
                        {
                            await _unitOfWork.RollbackTransactionAsync(ct);
                            return Result<CanonicalWriteResultDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.HistoricalUomModificationForbidden);
                        }

                        if (modifyingLotTracking)
                        {
                            product.ChangeLotTrackingPolicy(request.LotTrackingRequired!.Value, hasHistory);
                        }

                        if (modifyingBaseUom)
                        {
                            product.ChangeBaseUom(request.BaseUomCode!, hasHistory);
                        }
                    }

                    product.UpdateDetails(
                        request.CategoryId,
                        request.Sku,
                        request.Barcode,
                        request.Name ?? product.Name,
                        request.GenericName ?? product.GenericName,
                        request.BrandName ?? product.BrandName,
                        request.TaxRate ?? product.TaxRate,
                        request.ImageUrl ?? product.ImageUrl,
                        request.ExpiryAlertDays ?? product.ExpiryAlertDays);

                    if (request.IsActive.HasValue)
                    {
                        product.SetActiveState(request.IsActive.Value);
                    }

                    await _unitOfWork.SaveChangesAsync(ct);

                    var afterData = new
                    {
                        product.CategoryId,
                        product.Sku,
                        product.Barcode,
                        product.Name,
                        product.GenericName,
                        product.BrandName,
                        product.TaxRate,
                        product.ImageUrl,
                        product.ExpiryAlertDays,
                        product.IsActive,
                        product.BaseUomCode,
                        product.LotTrackingRequired
                    };

                    await _auditLogger.LogAsync("UPDATE", "catalog", "PRODUCT", product.ProductId, beforeData, afterData, null, AuditActorType.AI_ASSISTED, request.SourcePromptId, ct);
                    await _outboxService.EnqueueAsync("catalog.product.updated", null, new { ProductId = product.ProductId, product.Sku, product.Name, product.IsActive }, "1.0", ct);

                    targetEntityId = product.ProductId;
                    entityType = "PRODUCT";
                    break;
                }

                case CatalogConfigurationAction.AddUom:
                {
                    var product = await _productRepository.GetByIdWithUomsAsync(orgId, request.ProductId!.Value, ct);
                    if (product == null)
                    {
                        await _unitOfWork.RollbackTransactionAsync(ct);
                        return Result<CanonicalWriteResultDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductNotFound);
                    }

                    var uomExists = await _productUomRepository.ExistsByUomCodeAsync(orgId, product.ProductId, request.UomCode!, null, ct);
                    if (uomExists)
                    {
                        await _unitOfWork.RollbackTransactionAsync(ct);
                        return Result<CanonicalWriteResultDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.DuplicateUomCode);
                    }

                    var newUom = product.AddUom(
                        request.UomCode!,
                        request.DisplayName!,
                        request.ConversionToBase!.Value,
                        request.SaleUnitPrice,
                        request.IsBase ?? false,
                        request.IsSellable ?? false,
                        request.IsPurchasable ?? true);

                    await _productUomRepository.AddAsync(newUom, ct);
                    await _unitOfWork.SaveChangesAsync(ct);

                    var afterUom = new
                    {
                        newUom.ProductUomId,
                        newUom.ProductId,
                        newUom.UomCode,
                        newUom.DisplayName,
                        newUom.ConversionToBase,
                        newUom.SaleUnitPrice,
                        newUom.IsBase,
                        newUom.IsSellable,
                        newUom.IsPurchasable,
                        newUom.IsActive
                    };

                    await _auditLogger.LogAsync("CREATE", "catalog", "PRODUCT_UOM", newUom.ProductUomId, null, afterUom, null, AuditActorType.AI_ASSISTED, request.SourcePromptId, ct);
                    await _outboxService.EnqueueAsync("catalog.uom.created", null, new { newUom.ProductUomId, newUom.ProductId, newUom.UomCode, newUom.ConversionToBase }, "1.0", ct);

                    targetEntityId = newUom.ProductUomId;
                    entityType = "PRODUCT_UOM";
                    break;
                }

                case CatalogConfigurationAction.UpdateUom:
                {
                    var product = await _productRepository.GetByIdWithUomsAsync(orgId, request.ProductId!.Value, ct);
                    if (product == null)
                    {
                        await _unitOfWork.RollbackTransactionAsync(ct);
                        return Result<CanonicalWriteResultDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductNotFound);
                    }

                    var uom = await _productUomRepository.GetByIdAsync(orgId, product.ProductId, request.ProductUomId!.Value, ct);
                    if (uom == null)
                    {
                        await _unitOfWork.RollbackTransactionAsync(ct);
                        return Result<CanonicalWriteResultDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductUomNotFound);
                    }

                    var beforeUom = new
                    {
                        uom.DisplayName,
                        uom.ConversionToBase,
                        uom.SaleUnitPrice,
                        uom.IsSellable,
                        uom.IsPurchasable,
                        uom.IsActive
                    };

                    if (request.ConversionToBase.HasValue && request.ConversionToBase.Value != uom.ConversionToBase)
                    {
                        var hasUsage = await _usageChecker.HasAnyStockOrDocumentReferenceForUomAsync(orgId, product.ProductId, uom.ProductUomId, ct);
                        if (hasUsage)
                        {
                            await _unitOfWork.RollbackTransactionAsync(ct);
                            return Result<CanonicalWriteResultDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.HistoricalUomModificationForbidden);
                        }

                        uom.UpdateConversionFactor(request.ConversionToBase.Value, hasUsage);
                    }

                    if (request.IsActive.HasValue && !request.IsActive.Value && uom.IsBase)
                    {
                        await _unitOfWork.RollbackTransactionAsync(ct);
                        return Result<CanonicalWriteResultDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.CannotDeactivateBaseUom);
                    }

                    var displayName = request.DisplayName ?? uom.DisplayName;
                    var saleUnitPrice = request.SaleUnitPrice.HasValue ? request.SaleUnitPrice : uom.SaleUnitPrice;
                    var isSellable = request.IsSellable ?? uom.IsSellable;
                    var isPurchasable = request.IsPurchasable ?? uom.IsPurchasable;

                    uom.UpdateNonHistoricalAttributes(displayName, saleUnitPrice, isSellable, isPurchasable);

                    if (request.IsActive.HasValue)
                    {
                        if (request.IsActive.Value)
                            uom.Activate();
                        else
                            uom.Deactivate();
                    }

                    await _unitOfWork.SaveChangesAsync(ct);

                    var afterUom = new
                    {
                        uom.DisplayName,
                        uom.ConversionToBase,
                        uom.SaleUnitPrice,
                        uom.IsSellable,
                        uom.IsPurchasable,
                        uom.IsActive
                    };

                    await _auditLogger.LogAsync("UPDATE", "catalog", "PRODUCT_UOM", uom.ProductUomId, beforeUom, afterUom, null, AuditActorType.AI_ASSISTED, request.SourcePromptId, ct);
                    await _outboxService.EnqueueAsync("catalog.uom.updated", null, new { uom.ProductUomId, uom.ProductId, uom.UomCode, uom.IsActive }, "1.0", ct);

                    targetEntityId = uom.ProductUomId;
                    entityType = "PRODUCT_UOM";
                    break;
                }

                case CatalogConfigurationAction.DeactivateUom:
                {
                    var product = await _productRepository.GetByIdWithUomsAsync(orgId, request.ProductId!.Value, ct);
                    if (product == null)
                    {
                        await _unitOfWork.RollbackTransactionAsync(ct);
                        return Result<CanonicalWriteResultDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductNotFound);
                    }

                    var uom = await _productUomRepository.GetByIdAsync(orgId, product.ProductId, request.ProductUomId!.Value, ct);
                    if (uom == null)
                    {
                        await _unitOfWork.RollbackTransactionAsync(ct);
                        return Result<CanonicalWriteResultDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductUomNotFound);
                    }

                    if (uom.IsBase)
                    {
                        await _unitOfWork.RollbackTransactionAsync(ct);
                        return Result<CanonicalWriteResultDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.CannotDeactivateBaseUom);
                    }

                    var beforeUom = new { uom.IsActive };
                    uom.Deactivate();

                    await _unitOfWork.SaveChangesAsync(ct);

                    var afterUom = new { uom.IsActive };
                    await _auditLogger.LogAsync("DEACTIVATE", "catalog", "PRODUCT_UOM", uom.ProductUomId, beforeUom, afterUom, null, AuditActorType.AI_ASSISTED, request.SourcePromptId, ct);
                    await _outboxService.EnqueueAsync("catalog.uom.updated", null, new { uom.ProductUomId, uom.ProductId, uom.UomCode, uom.IsActive }, "1.0", ct);

                    targetEntityId = uom.ProductUomId;
                    entityType = "PRODUCT_UOM";
                    break;
                }

                default:
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<CanonicalWriteResultDto>.Failure(ErrorCode.MALFORMED_REQUEST, ErrorMessages.InvalidConfigurationAction);
                }
            }

            var resultDto = new CanonicalWriteResultDto(
                request.RequestId,
                CanonicalWriteStatuses.Applied,
                targetEntityId,
                entityType,
                _dateTimeProvider.UtcNow);

            await _idempotencyService.PersistResponseAsync(ProductsWriteScope, request.IdempotencyKey, null, request, resultDto, ct);
            await _unitOfWork.CommitTransactionAsync(ct);

            return Result<CanonicalWriteResultDto>.Success(resultDto);
        }
        catch (CatalogDomainException ex)
        {
            await _unitOfWork.RollbackTransactionAsync(ct);
            var errorCode = ex switch
            {
                HistoricalUomModificationForbiddenException => ErrorCode.CONFLICT,
                InvalidBaseUomInvariantException => ErrorCode.CONFLICT,
                _ => ErrorCode.VALIDATION_ERROR
            };
            return Result<CanonicalWriteResultDto>.Failure(errorCode, ex.Message);
        }
        catch (Exception)
        {
            await _unitOfWork.RollbackTransactionAsync(ct);
            throw;
        }
    }

    public async Task<Result<CanonicalWriteResultDto>> ConfigureReorderRuleAsync(
        CanonicalReorderRuleConfigurationRequest request,
        CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<CanonicalWriteResultDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsCloudRuntimeMode())
            return Result<CanonicalWriteResultDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        if (!IsAuthorized())
            return Result<CanonicalWriteResultDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        if (!_currentUser.CanAccessBranch(request.BranchId))
            return Result<CanonicalWriteResultDto>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        var validationErrors = ValidateReorderRuleConfigurationRequest(request);
        if (validationErrors.Count > 0)
            return Result<CanonicalWriteResultDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        var orgId = _tenantContext.OrganizationId.Value;

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            try
            {
                var idempotencyResult = await _idempotencyService.CheckAsync<CanonicalReorderRuleConfigurationRequest, CanonicalWriteResultDto>(
                    ReorderRulesWriteScope, request.IdempotencyKey, request.BranchId, request, ct);

                if (idempotencyResult.IsReplay && idempotencyResult.ReplayedResponse != null)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<CanonicalWriteResultDto>.Success(idempotencyResult.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<CanonicalWriteResultDto>.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            var branch = await _branchRepository.GetByIdAsync(orgId, request.BranchId, ct);
            if (branch == null)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<CanonicalWriteResultDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.NotFound);
            }

            var product = await _productRepository.GetByIdAsync(orgId, request.ProductId, ct);
            if (product == null)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<CanonicalWriteResultDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductNotFound);
            }

            var existingRule = await _reorderRuleRepository.GetByBranchAndProductAsync(orgId, request.BranchId, request.ProductId, ct);
            Guid targetEntityId;

            if (existingRule != null)
            {
                var beforeData = new
                {
                    existingRule.ReorderPointBase,
                    existingRule.ReorderQuantityBase,
                    existingRule.MaxQuantityBase,
                    existingRule.IsActive
                };

                existingRule.UpdateThresholds(request.ReorderPointBase, request.ReorderQuantityBase, request.MaxQuantityBase);
                existingRule.SetActiveState(request.IsActive);

                await _unitOfWork.SaveChangesAsync(ct);

                var afterData = new
                {
                    existingRule.ReorderPointBase,
                    existingRule.ReorderQuantityBase,
                    existingRule.MaxQuantityBase,
                    existingRule.IsActive
                };

                await _auditLogger.LogAsync("UPDATE", "catalog", "PRODUCT_REORDER_RULE", existingRule.ReorderRuleId, beforeData, afterData, request.BranchId, AuditActorType.AI_ASSISTED, request.SourcePromptId, ct);
                await _outboxService.EnqueueAsync("catalog.reorderrule.updated", request.BranchId, new { existingRule.ReorderRuleId, existingRule.BranchId, existingRule.ProductId, existingRule.IsActive }, "1.0", ct);

                targetEntityId = existingRule.ReorderRuleId;
            }
            else
            {
                var newRule = ProductReorderRule.Create(
                    orgId,
                    request.ProductId,
                    request.BranchId,
                    request.ReorderPointBase,
                    request.ReorderQuantityBase,
                    request.MaxQuantityBase);

                newRule.SetActiveState(request.IsActive);

                await _reorderRuleRepository.AddAsync(newRule, ct);
                await _unitOfWork.SaveChangesAsync(ct);

                var afterData = new
                {
                    newRule.ReorderRuleId,
                    newRule.BranchId,
                    newRule.ProductId,
                    newRule.ReorderPointBase,
                    newRule.ReorderQuantityBase,
                    newRule.MaxQuantityBase,
                    newRule.IsActive
                };

                await _auditLogger.LogAsync("CREATE", "catalog", "PRODUCT_REORDER_RULE", newRule.ReorderRuleId, null, afterData, request.BranchId, AuditActorType.AI_ASSISTED, request.SourcePromptId, ct);
                await _outboxService.EnqueueAsync("catalog.reorderrule.created", request.BranchId, new { newRule.ReorderRuleId, newRule.BranchId, newRule.ProductId, newRule.IsActive }, "1.0", ct);

                targetEntityId = newRule.ReorderRuleId;
            }

            var resultDto = new CanonicalWriteResultDto(
                request.RequestId,
                CanonicalWriteStatuses.Applied,
                targetEntityId,
                "PRODUCT_REORDER_RULE",
                _dateTimeProvider.UtcNow);

            await _idempotencyService.PersistResponseAsync(ReorderRulesWriteScope, request.IdempotencyKey, request.BranchId, request, resultDto, ct);
            await _unitOfWork.CommitTransactionAsync(ct);

            return Result<CanonicalWriteResultDto>.Success(resultDto);
        }
        catch (CatalogDomainException ex)
        {
            await _unitOfWork.RollbackTransactionAsync(ct);
            var errorCode = ex switch
            {
                HistoricalUomModificationForbiddenException => ErrorCode.CONFLICT,
                InvalidBaseUomInvariantException => ErrorCode.CONFLICT,
                _ => ErrorCode.VALIDATION_ERROR
            };
            return Result<CanonicalWriteResultDto>.Failure(errorCode, ex.Message);
        }
        catch (Exception)
        {
            await _unitOfWork.RollbackTransactionAsync(ct);
            throw;
        }
    }

    private bool IsCloudRuntimeMode() =>
        _runtimeModeProvider.CurrentMode == ErpRuntimeMode.Cloud;

    private bool IsAuthorized() =>
        string.Equals(_currentUser.Role, "Admin", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(_currentUser.Role, "Pharmacist", StringComparison.OrdinalIgnoreCase);

    private static string EncodeCursor(DateTimeOffset updatedAt, Guid productId)
    {
        var raw = $"{updatedAt.UtcTicks}:{productId:N}";
        var bytes = Encoding.UTF8.GetBytes(raw);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static bool TryDecodeCursor(string cursor, out DateTimeOffset updatedAt, out Guid productId)
    {
        updatedAt = default;
        productId = default;

        if (string.IsNullOrWhiteSpace(cursor))
            return false;

        if (cursor.Contains('+') || cursor.Contains('/') || cursor.Contains('='))
            return false;

        try
        {
            var padded = cursor.Replace('-', '+').Replace('_', '/');
            switch (padded.Length % 4)
            {
                case 2: padded += "=="; break;
                case 3: padded += "="; break;
                case 1: return false;
            }

            var bytes = Convert.FromBase64String(padded);
            var raw = Encoding.UTF8.GetString(bytes);
            var parts = raw.Split(':');
            if (parts.Length != 2)
                return false;

            if (!long.TryParse(parts[0], out var ticks))
                return false;

            if (!Guid.TryParse(parts[1], out productId))
                return false;

            updatedAt = new DateTimeOffset(ticks, TimeSpan.Zero);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static CanonicalProductDto MapToCanonicalDto(Product p) =>
        new(
            OrganizationId: p.OrganizationId,
            Id: p.ProductId,
            Sku: p.Sku,
            Barcode: p.Barcode,
            Name: p.Name,
            CategoryId: p.CategoryId,
            CategoryName: p.Category?.Name ?? string.Empty,
            BaseUomCode: p.BaseUomCode,
            TaxRate: p.TaxRate,
            LotTrackingRequired: p.LotTrackingRequired,
            IsActive: p.IsActive,
            SupportedConversions: p.Uoms.Select(u => new CanonicalUomConversionDto(
                ProductUomId: u.ProductUomId,
                UomCode: u.UomCode,
                DisplayName: u.DisplayName,
                ConversionToBase: u.ConversionToBase,
                SaleUnitPrice: u.SaleUnitPrice,
                IsBase: u.IsBase,
                IsSellable: u.IsSellable,
                IsPurchasable: u.IsPurchasable,
                IsActive: u.IsActive
            )).ToList(),
            UpdatedAt: p.UpdatedAt
        );

    private static List<ApiErrorDetailDto> ValidateProductConfigurationRequest(CanonicalProductConfigurationRequest r)
    {
        var errors = new List<ApiErrorDetailDto>();

        if (r.RequestId == Guid.Empty)
            errors.Add(new ApiErrorDetailDto("RequestId", ErrorMessages.InvalidRequestId));

        if (string.IsNullOrWhiteSpace(r.SourcePromptId) || r.SourcePromptId.Length > 100)
            errors.Add(new ApiErrorDetailDto("SourcePromptId", ErrorMessages.InvalidSourcePromptId));

        if (string.IsNullOrWhiteSpace(r.IdempotencyKey))
            errors.Add(new ApiErrorDetailDto("IdempotencyKey", ErrorMessages.InvalidIdempotencyKey));

        switch (r.Action)
        {
            case CatalogConfigurationAction.CreateProduct:
            {
                if (!r.CategoryId.HasValue || r.CategoryId.Value == Guid.Empty)
                    errors.Add(new ApiErrorDetailDto("CategoryId", "CategoryId is required."));

                if (string.IsNullOrWhiteSpace(r.Sku))
                    errors.Add(new ApiErrorDetailDto("Sku", "Sku is required."));

                if (string.IsNullOrWhiteSpace(r.Name))
                    errors.Add(new ApiErrorDetailDto("Name", "Name is required."));

                if (string.IsNullOrWhiteSpace(r.BaseUomCode))
                    errors.Add(new ApiErrorDetailDto("BaseUomCode", "BaseUomCode is required."));

                if (!r.LotTrackingRequired.HasValue)
                    errors.Add(new ApiErrorDetailDto("LotTrackingRequired", "LotTrackingRequired is required for product creation."));

                if (!r.TaxRate.HasValue)
                    errors.Add(new ApiErrorDetailDto("TaxRate", "TaxRate is required for product creation."));

                if (!r.ExpiryAlertDays.HasValue)
                    errors.Add(new ApiErrorDetailDto("ExpiryAlertDays", "ExpiryAlertDays is required for product creation."));

                if (r.Uoms == null || r.Uoms.Count == 0)
                    errors.Add(new ApiErrorDetailDto("Uoms", "At least one UOM is required."));

                if (errors.Count == 0)
                {
                    var uoms = r.Uoms!.Select(u => new CreateProductUomItemRequest(
                        u.UomCode,
                        u.DisplayName,
                        u.ConversionToBase,
                        u.SaleUnitPrice,
                        u.IsBase,
                        u.IsSellable,
                        u.IsPurchasable
                    )).ToList();

                    var createDto = new CreateProductRequest(
                        r.CategoryId!.Value,
                        r.Sku!,
                        r.Barcode,
                        r.Name!,
                        r.GenericName,
                        r.BrandName,
                        r.BaseUomCode!,
                        r.TaxRate!.Value,
                        r.ImageUrl,
                        r.LotTrackingRequired!.Value,
                        r.ExpiryAlertDays!.Value,
                        uoms,
                        r.IdempotencyKey);

                    var validatorErrors = CreateProductRequestValidator.Validate(createDto);
                    errors.AddRange(validatorErrors);
                }
                break;
            }

            case CatalogConfigurationAction.UpdateProduct:
            {
                if (!r.ProductId.HasValue || r.ProductId.Value == Guid.Empty)
                    errors.Add(new ApiErrorDetailDto("ProductId", "ProductId is required."));

                var updateDto = new UpdateProductRequest(
                    r.CategoryId,
                    r.Sku,
                    r.Barcode,
                    r.Name,
                    r.GenericName,
                    r.BrandName,
                    r.BaseUomCode,
                    r.TaxRate,
                    r.ImageUrl,
                    r.LotTrackingRequired,
                    r.ExpiryAlertDays,
                    r.IsActive,
                    r.IdempotencyKey);

                var validatorErrors = UpdateProductRequestValidator.Validate(updateDto);
                errors.AddRange(validatorErrors);
                break;
            }

            case CatalogConfigurationAction.AddUom:
            {
                if (!r.ProductId.HasValue || r.ProductId.Value == Guid.Empty)
                    errors.Add(new ApiErrorDetailDto("ProductId", "ProductId is required."));

                var addUomDto = new CreateProductUomRequest(
                    r.UomCode ?? string.Empty,
                    r.DisplayName ?? string.Empty,
                    r.ConversionToBase ?? 0m,
                    r.SaleUnitPrice,
                    r.IsBase ?? false,
                    r.IsSellable ?? false,
                    r.IsPurchasable ?? true,
                    r.IdempotencyKey);

                var validatorErrors = CreateProductUomRequestValidator.Validate(addUomDto);
                errors.AddRange(validatorErrors);
                break;
            }

            case CatalogConfigurationAction.UpdateUom:
            {
                if (!r.ProductId.HasValue || r.ProductId.Value == Guid.Empty)
                    errors.Add(new ApiErrorDetailDto("ProductId", "ProductId is required."));

                if (!r.ProductUomId.HasValue || r.ProductUomId.Value == Guid.Empty)
                    errors.Add(new ApiErrorDetailDto("ProductUomId", "ProductUomId is required."));

                var updateUomDto = new UpdateProductUomRequest(
                    r.DisplayName,
                    r.ConversionToBase,
                    r.SaleUnitPrice,
                    r.IsSellable,
                    r.IsPurchasable,
                    r.IsActive,
                    r.IdempotencyKey);

                var validatorErrors = UpdateProductUomRequestValidator.Validate(updateUomDto);
                errors.AddRange(validatorErrors);
                break;
            }

            case CatalogConfigurationAction.DeactivateUom:
            {
                if (!r.ProductId.HasValue || r.ProductId.Value == Guid.Empty)
                    errors.Add(new ApiErrorDetailDto("ProductId", "ProductId is required."));

                if (!r.ProductUomId.HasValue || r.ProductUomId.Value == Guid.Empty)
                    errors.Add(new ApiErrorDetailDto("ProductUomId", "ProductUomId is required."));
                break;
            }

            default:
                errors.Add(new ApiErrorDetailDto("Action", ErrorMessages.InvalidConfigurationAction));
                break;
        }

        return errors;
    }

    private static List<ApiErrorDetailDto> ValidateReorderRuleConfigurationRequest(CanonicalReorderRuleConfigurationRequest r)
    {
        var errors = new List<ApiErrorDetailDto>();

        if (r.RequestId == Guid.Empty)
            errors.Add(new ApiErrorDetailDto("RequestId", ErrorMessages.InvalidRequestId));

        if (string.IsNullOrWhiteSpace(r.SourcePromptId) || r.SourcePromptId.Length > 100)
            errors.Add(new ApiErrorDetailDto("SourcePromptId", ErrorMessages.InvalidSourcePromptId));

        if (string.IsNullOrWhiteSpace(r.IdempotencyKey))
            errors.Add(new ApiErrorDetailDto("IdempotencyKey", ErrorMessages.InvalidIdempotencyKey));

        if (r.BranchId == Guid.Empty)
            errors.Add(new ApiErrorDetailDto("BranchId", ErrorMessages.InvalidBranchId));

        if (r.ProductId == Guid.Empty)
            errors.Add(new ApiErrorDetailDto("ProductId", "ProductId is required."));

        var upsertDto = new UpsertReorderRuleRequest(
            r.ReorderPointBase,
            r.ReorderQuantityBase,
            r.MaxQuantityBase,
            r.IsActive,
            r.IdempotencyKey);

        var validatorErrors = UpsertReorderRuleRequestValidator.Validate(upsertDto);
        errors.AddRange(validatorErrors);

        return errors;
    }
}
