namespace PharmacyERP.Application.Features.Catalog.Services.Implementations;

/// <summary>
/// Manages catalog products in Cloud mode, enforcing historical-usage guards before changing
/// <c>BaseUomCode</c> or <c>LotTrackingRequired</c> and initializing <c>NON-LOT</c> batches when needed.
/// </summary>
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

        var pageErrors = ValidatePagination(page, pageSize);
        if (pageErrors.Count > 0)
            return Result<PagedResult<ProductDto>>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, pageErrors);

        var orgId = _tenantContext.OrganizationId.Value;
        var ownsTransaction = !_unitOfWork.HasActiveTransaction;

        try
        {
            if (ownsTransaction)
            {
                await _unitOfWork.BeginTransactionAsync(ct);
            }

            var pagedResult = await _productRepository.GetPagedAsync(orgId, categoryId, includeInactive, search, page, pageSize, ct);

            var dtos = pagedResult.Items.Select(MapToDto).ToList();
            var result = new PagedResult<ProductDto>(dtos, pagedResult.Page, pagedResult.PageSize, pagedResult.TotalCount, pagedResult.NextCursor);

            return Result<PagedResult<ProductDto>>.Success(result);
        }
        finally
        {
            if (ownsTransaction && _unitOfWork.HasActiveTransaction)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            }
        }
    }

    public async Task<Result<ProductDto>> GetProductByIdAsync(Guid productId, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<ProductDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsAuthorizedForRead())
            return Result<ProductDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var orgId = _tenantContext.OrganizationId.Value;
        var ownsTransaction = !_unitOfWork.HasActiveTransaction;

        try
        {
            if (ownsTransaction)
            {
                await _unitOfWork.BeginTransactionAsync(ct);
            }

            var product = await _productRepository.GetByIdWithUomsAsync(orgId, productId, ct);
            if (product == null)
                return Result<ProductDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductNotFound);

            return Result<ProductDto>.Success(MapToDto(product));
        }
        finally
        {
            if (ownsTransaction && _unitOfWork.HasActiveTransaction)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            }
        }
    }

    public async Task<Result<ProductDto>> CreateProductAsync(CreateProductRequest request, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<ProductDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsCloudRuntimeMode())
            return Result<ProductDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.CloudOnlyOperationUnavailable);

        if (!IsAuthorizedForWrite())
            return Result<ProductDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var validationErrors = CreateProductRequestValidator.Validate(request);
        if (validationErrors.Count > 0)
            return Result<ProductDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        var idempotencyKey = request.IdempotencyKey!;
        var orgId = _tenantContext.OrganizationId.Value;

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            try
            {
                var idempotencyResult = await _idempotencyService.CheckAsync<CreateProductRequest, ProductDto>(
                    "catalog.product.create", idempotencyKey, null, request, ct);

                if (idempotencyResult.IsReplay && idempotencyResult.ReplayedResponse != null)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<ProductDto>.Success(idempotencyResult.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return Result<ProductDto>.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            var categoryActive = await _categoryRepository.ExistsAndActiveAsync(orgId, request.CategoryId, ct);
            if (!categoryActive)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return Result<ProductDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.CategoryNotFoundOrInactive);
            }

            var skuExists = await _productRepository.ExistsBySkuAsync(orgId, request.Sku, null, ct);
            if (skuExists)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return Result<ProductDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.DuplicateSku);
            }

            if (!string.IsNullOrWhiteSpace(request.Barcode))
            {
                var barcodeExists = await _productRepository.ExistsByBarcodeAsync(orgId, request.Barcode, null, ct);
                if (barcodeExists)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
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
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return Result<ProductDto>.Failure(ErrorCode.VALIDATION_ERROR, ex.Message);
            }
            catch (ArgumentException ex)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
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
            await _idempotencyService.PersistResponseAsync("catalog.product.create", idempotencyKey, null, request, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<ProductDto>.Success(dto);
        }
        catch (Exception)
        {
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            throw;
        }
    }

    public async Task<Result<ProductDto>> UpdateProductAsync(Guid productId, UpdateProductRequest request, CancellationToken ct = default)
    {
        if (!_tenantContext.OrganizationId.HasValue)
            return Result<ProductDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!IsCloudRuntimeMode())
            return Result<ProductDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.CloudOnlyOperationUnavailable);

        if (!IsAuthorizedForWrite())
            return Result<ProductDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var validationErrors = UpdateProductRequestValidator.Validate(request);
        if (validationErrors.Count > 0)
            return Result<ProductDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        var idempotencyKey = request.IdempotencyKey!;
        var orgId = _tenantContext.OrganizationId.Value;

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            var idempotencyPayload = new { ProductId = productId, Request = request };
            try
            {
                var idempotencyResult = await _idempotencyService.CheckAsync<object, ProductDto>(
                    "catalog.product.update", idempotencyKey, null, idempotencyPayload, ct);

                if (idempotencyResult.IsReplay && idempotencyResult.ReplayedResponse != null)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<ProductDto>.Success(idempotencyResult.ReplayedResponse);
                }
            }
            catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return Result<ProductDto>.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
            }

            var product = await _productRepository.GetByIdWithUomsAsync(orgId, productId, ct);
            if (product == null)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                return Result<ProductDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductNotFound);
            }

            if (request.CategoryId.HasValue && request.CategoryId.Value != product.CategoryId)
            {
                var categoryActive = await _categoryRepository.ExistsAndActiveAsync(orgId, request.CategoryId.Value, ct);
                if (!categoryActive)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<ProductDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.CategoryNotFoundOrInactive);
                }
            }

            if (request.Sku != null && !string.Equals(request.Sku, product.Sku, StringComparison.Ordinal))
            {
                var skuExists = await _productRepository.ExistsBySkuAsync(orgId, request.Sku, productId, ct);
                if (skuExists)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<ProductDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.DuplicateSku);
                }
            }

            if (request.Barcode != null && !string.Equals(request.Barcode, product.Barcode, StringComparison.Ordinal))
            {
                var barcodeExists = await _productRepository.ExistsByBarcodeAsync(orgId, request.Barcode, productId, ct);
                if (barcodeExists)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<ProductDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.DuplicateBarcode);
                }
            }

            bool? hasHistory = null;

            if (request.LotTrackingRequired.HasValue && request.LotTrackingRequired.Value != product.LotTrackingRequired)
            {
                hasHistory ??= await _usageChecker.HasAnyStockOrPostedHistoryForProductAsync(orgId, productId, ct);
                if (hasHistory.Value)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<ProductDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.HistoricalUomModificationForbidden);
                }

                product.ChangeLotTrackingPolicy(request.LotTrackingRequired.Value, hasHistory.Value);

                if (!product.LotTrackingRequired)
                {
                    await _nonLotBatchInitializer.EnsureNonLotBatchExistsAsync(orgId, product.ProductId, ct);
                }
            }

            if (request.BaseUomCode != null && !string.Equals(request.BaseUomCode, product.BaseUomCode, StringComparison.Ordinal))
            {
                hasHistory ??= await _usageChecker.HasAnyStockOrPostedHistoryForProductAsync(orgId, productId, ct);
                if (hasHistory.Value)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<ProductDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.HistoricalUomModificationForbidden);
                }

                try
                {
                    if (product.BeginBaseUomChange(request.BaseUomCode, hasHistory.Value))
                    {
                        await _unitOfWork.SaveChangesAsync(ct);
                    }

                    product.ChangeBaseUom(request.BaseUomCode, hasHistory.Value);
                }
                catch (CatalogDomainException ex)
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
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
            await _idempotencyService.PersistResponseAsync("catalog.product.update", idempotencyKey, null, idempotencyPayload, dto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);
            return Result<ProductDto>.Success(dto);
        }
        catch (Exception)
        {
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
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

    private static List<ApiErrorDetailDto> ValidatePagination(int page, int pageSize)
    {
        var errors = new List<ApiErrorDetailDto>();
        if (page < 1)
            errors.Add(new ApiErrorDetailDto("page", "Page must be at least 1."));
        if (pageSize is < 1 or > 200)
            errors.Add(new ApiErrorDetailDto("page_size", "PageSize must be between 1 and 200."));
        return errors;
    }

    private static ProductDto MapToDto(Product product) =>
        new(
            product.ProductId,
            product.OrganizationId,
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
            product.IsActive,
            product.Uoms.Select(MapUomToDto).ToList(),
            product.CreatedAt,
            product.UpdatedAt);

    private static ProductUomDto MapUomToDto(ProductUom uom) =>
        new(
            uom.ProductUomId,
            uom.ProductId,
            uom.UomCode,
            uom.DisplayName,
            uom.ConversionToBase,
            uom.SaleUnitPrice,
            uom.IsBase,
            uom.IsSellable,
            uom.IsPurchasable,
            uom.IsActive,
            uom.UpdatedAt);
}
