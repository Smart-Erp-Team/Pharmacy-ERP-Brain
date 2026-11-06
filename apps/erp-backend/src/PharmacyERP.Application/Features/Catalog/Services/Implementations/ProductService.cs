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

public class ProductService : IProductService
{
    private readonly IProductRepository _productRepository;
    private readonly IProductCategoryRepository _categoryRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ITenantContext _tenantContext;
    private readonly ICurrentUser _currentUser;
    private readonly IRuntimeModeProvider _runtimeModeProvider;
    private readonly IIdempotencyService _idempotencyService;
    private readonly IAuditLogger _auditLogger;
    private readonly IOutboxService _outboxService;
    private readonly INonLotBatchInitializer _nonLotBatchInitializer;
    private readonly IProductInventoryUsageChecker _usageChecker;

    public ProductService(
        IProductRepository productRepository,
        IProductCategoryRepository categoryRepository,
        IUnitOfWork unitOfWork,
        ITenantContext tenantContext,
        ICurrentUser currentUser,
        IRuntimeModeProvider runtimeModeProvider,
        IIdempotencyService idempotencyService,
        IAuditLogger auditLogger,
        IOutboxService outboxService,
        INonLotBatchInitializer nonLotBatchInitializer,
        IProductInventoryUsageChecker usageChecker)
    {
        _productRepository = productRepository;
        _categoryRepository = categoryRepository;
        _unitOfWork = unitOfWork;
        _tenantContext = tenantContext;
        _currentUser = currentUser;
        _runtimeModeProvider = runtimeModeProvider;
        _idempotencyService = idempotencyService;
        _auditLogger = auditLogger;
        _outboxService = outboxService;
        _nonLotBatchInitializer = nonLotBatchInitializer;
        _usageChecker = usageChecker;
    }

    public async Task<Result<PagedResult<ProductDto>>> GetProductsAsync(
        Guid? categoryId,
        bool includeInactive,
        string? search,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<PagedResult<ProductDto>>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsAuthorizedForRead())
            return Result<PagedResult<ProductDto>>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var orgId = _tenantContext.OrganizationId.Value;
        var pagedResult = await _productRepository.GetPagedAsync(orgId, categoryId, includeInactive, search, page, pageSize, ct);

        var dtos = pagedResult.Items.Select(MapToDto).ToList();
        var result = new PagedResult<ProductDto>(dtos, pagedResult.Page, pagedResult.PageSize, pagedResult.TotalCount, pagedResult.NextCursor);

        return Result<PagedResult<ProductDto>>.Success(result);
    }

    public async Task<Result<ProductDto>> GetProductByIdAsync(Guid productId, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<ProductDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsAuthorizedForRead())
            return Result<ProductDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var orgId = _tenantContext.OrganizationId.Value;
        var product = await _productRepository.GetByIdWithUomsAsync(orgId, productId, ct);
        if (product == null)
            return Result<ProductDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductNotFound);

        return Result<ProductDto>.Success(MapToDto(product));
    }

    public async Task<Result<ProductDto>> CreateProductAsync(CreateProductRequest request, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<ProductDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsCloudRuntimeMode())
            return Result<ProductDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        if (!IsAuthorizedForWrite())
            return Result<ProductDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var validationErrors = CreateProductRequestValidator.Validate(request);
        if (validationErrors.Count > 0)
            return Result<ProductDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        var orgId = _tenantContext.OrganizationId.Value;

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            try
            {
                var idempotencyResult = await _idempotencyService.CheckAsync<CreateProductRequest, ProductDto>(
                    "catalog.product.create", request.IdempotencyKey, null, request, ct);

                if (idempotencyResult.IsReplay && idempotencyResult.ReplayedResponse != null)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductDto>.Success(idempotencyResult.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductDto>.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            var categoryActive = await _categoryRepository.ExistsAndActiveAsync(orgId, request.CategoryId, ct);
            if (!categoryActive)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.CategoryNotFoundOrInactive);
            }

            var skuExists = await _productRepository.ExistsBySkuAsync(orgId, request.Sku, null, ct);
            if (skuExists)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.DuplicateSku);
            }

            if (!string.IsNullOrWhiteSpace(request.Barcode))
            {
                var barcodeExists = await _productRepository.ExistsByBarcodeAsync(orgId, request.Barcode, null, ct);
                if (barcodeExists)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.DuplicateBarcode);
                }
            }

            var initialUoms = request.Uoms.Select(u => new InitialUomDefinition(
                u.UomCode,
                u.DisplayName,
                u.ConversionToBase,
                u.SaleUnitPrice,
                u.IsBase,
                u.IsSellable,
                u.IsPurchasable)).ToList();

            Product product;
            try
            {
                product = Product.Create(
                    orgId,
                    request.CategoryId,
                    request.Sku,
                    request.Barcode,
                    request.Name,
                    request.GenericName,
                    request.BrandName,
                    request.BaseUomCode,
                    request.TaxRate,
                    request.ImageUrl,
                    request.LotTrackingRequired,
                    request.ExpiryAlertDays,
                    initialUoms);
            }
            catch (CatalogDomainException ex)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductDto>.Failure(ErrorCode.VALIDATION_ERROR, ex.Message);
            }
            catch (ArgumentException ex)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductDto>.Failure(ErrorCode.VALIDATION_ERROR, ex.Message);
            }

            if (!product.LotTrackingRequired)
            {
                await _nonLotBatchInitializer.EnsureNonLotBatchExistsAsync(orgId, product.ProductId, ct);
            }

            await _productRepository.AddAsync(product, ct);
            await _unitOfWork.SaveChangesAsync(ct);

            await _auditLogger.LogAsync("CREATE", "catalog", "PRODUCT", product.ProductId, null, product, null, null, null, ct);
            await _outboxService.EnqueueAsync(
                "catalog.product.created",
                null,
                new { ProductId = product.ProductId, product.Sku, product.Name, product.LotTrackingRequired },
                "1.0",
                ct);

            var dto = MapToDto(product);
            await _idempotencyService.PersistResponseAsync("catalog.product.create", request.IdempotencyKey, null, request, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<ProductDto>.Success(dto);
        }
        catch (Exception)
        {
            await _unitOfWork.RollbackTransactionAsync(ct);
            throw;
        }
    }

    public async Task<Result<ProductDto>> UpdateProductAsync(Guid productId, UpdateProductRequest request, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<ProductDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsCloudRuntimeMode())
            return Result<ProductDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        if (!IsAuthorizedForWrite())
            return Result<ProductDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var validationErrors = UpdateProductRequestValidator.Validate(request);
        if (validationErrors.Count > 0)
            return Result<ProductDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        var orgId = _tenantContext.OrganizationId.Value;

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            try
            {
                var idempotencyResult = await _idempotencyService.CheckAsync<UpdateProductRequest, ProductDto>(
                    "catalog.product.update", request.IdempotencyKey, null, request, ct);

                if (idempotencyResult.IsReplay && idempotencyResult.ReplayedResponse != null)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductDto>.Success(idempotencyResult.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductDto>.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            var product = await _productRepository.GetByIdWithUomsAsync(orgId, productId, ct);
            if (product == null)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<ProductDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductNotFound);
            }

            if (request.CategoryId.HasValue && request.CategoryId.Value != product.CategoryId)
            {
                var categoryActive = await _categoryRepository.ExistsAndActiveAsync(orgId, request.CategoryId.Value, ct);
                if (!categoryActive)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.CategoryNotFoundOrInactive);
                }
            }

            if (request.Sku != null && !string.Equals(request.Sku, product.Sku, StringComparison.Ordinal))
            {
                var skuExists = await _productRepository.ExistsBySkuAsync(orgId, request.Sku, productId, ct);
                if (skuExists)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.DuplicateSku);
                }
            }

            if (request.Barcode != null && !string.Equals(request.Barcode, product.Barcode, StringComparison.Ordinal))
            {
                var barcodeExists = await _productRepository.ExistsByBarcodeAsync(orgId, request.Barcode, productId, ct);
                if (barcodeExists)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.DuplicateBarcode);
                }
            }

            if (request.LotTrackingRequired.HasValue && request.LotTrackingRequired.Value != product.LotTrackingRequired)
            {
                var hasHistory = await _usageChecker.HasAnyStockOrPostedHistoryForProductAsync(orgId, productId, ct);
                if (hasHistory)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.HistoricalUomModificationForbidden);
                }

                product.ChangeLotTrackingPolicy(request.LotTrackingRequired.Value, hasHistory);

                if (!product.LotTrackingRequired)
                {
                    await _nonLotBatchInitializer.EnsureNonLotBatchExistsAsync(orgId, product.ProductId, ct);
                }
            }

            if (request.BaseUomCode != null && !string.Equals(request.BaseUomCode, product.BaseUomCode, StringComparison.Ordinal))
            {
                var hasHistory = await _usageChecker.HasAnyStockOrPostedHistoryForProductAsync(orgId, productId, ct);
                if (hasHistory)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.HistoricalUomModificationForbidden);
                }

                try
                {
                    product.ChangeBaseUom(request.BaseUomCode, hasHistory);
                }
                catch (CatalogDomainException ex)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<ProductDto>.Failure(ErrorCode.VALIDATION_ERROR, ex.Message);
                }
            }

            product.UpdateDetails(
                request.CategoryId,
                request.Sku,
                request.Barcode,
                request.Name,
                request.GenericName,
                request.BrandName,
                request.TaxRate,
                request.ImageUrl,
                request.ExpiryAlertDays);

            if (request.IsActive.HasValue)
            {
                product.SetActiveState(request.IsActive.Value);
            }

            await _unitOfWork.SaveChangesAsync(ct);

            await _auditLogger.LogAsync("UPDATE", "catalog", "PRODUCT", product.ProductId, null, product, null, null, null, ct);
            await _outboxService.EnqueueAsync(
                "catalog.product.updated",
                null,
                new { ProductId = product.ProductId, product.Sku, product.Name, product.IsActive },
                "1.0",
                ct);

            var dto = MapToDto(product);
            await _idempotencyService.PersistResponseAsync("catalog.product.update", request.IdempotencyKey, null, request, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<ProductDto>.Success(dto);
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

    private static ProductDto MapToDto(Product p) =>
        new(
            p.ProductId,
            p.OrganizationId,
            p.CategoryId,
            p.Sku,
            p.Barcode,
            p.Name,
            p.GenericName,
            p.BrandName,
            p.BaseUomCode,
            p.TaxRate,
            p.ImageUrl,
            p.LotTrackingRequired,
            p.ExpiryAlertDays,
            p.IsActive,
            p.Uoms.Select(MapUomToDto).ToList(),
            p.CreatedAt,
            p.UpdatedAt);

    private static ProductUomDto MapUomToDto(ProductUom u) =>
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
