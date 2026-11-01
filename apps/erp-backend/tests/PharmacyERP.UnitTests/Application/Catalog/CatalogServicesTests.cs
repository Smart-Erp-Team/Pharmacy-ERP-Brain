using Moq;
using PharmacyERP.Application.Common.Constants;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Common.Interfaces.CrossModule;
using PharmacyERP.Application.Common.Interfaces.Integration;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Application.Features.Catalog.DTOs;
using PharmacyERP.Application.Features.Catalog.Interfaces;
using PharmacyERP.Application.Features.Catalog.Services.Implementations;
using PharmacyERP.Domain.Entities.Catalog;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Domain.Exceptions;
using Xunit;

namespace PharmacyERP.UnitTests.Application.Catalog;

public class CatalogServicesTests
{
    private readonly Guid _orgId = Guid.NewGuid();
    private readonly Mock<ITenantContext> _tenantContextMock = new();
    private readonly Mock<ICurrentUser> _currentUserMock = new();
    private readonly Mock<IRuntimeModeProvider> _runtimeModeProviderMock = new();
    private readonly Mock<IUnitOfWork> _unitOfWorkMock = new();
    private readonly Mock<IIdempotencyService> _idempotencyServiceMock = new();
    private readonly Mock<IAuditLogger> _auditLoggerMock = new();
    private readonly Mock<IOutboxService> _outboxServiceMock = new();
    private readonly Mock<INonLotBatchInitializer> _nonLotBatchInitializerMock = new();
    private readonly Mock<IProductInventoryUsageChecker> _usageCheckerMock = new();

    public CatalogServicesTests()
    {
        _tenantContextMock.Setup(t => t.OrganizationId).Returns(_orgId);
        _currentUserMock.Setup(u => u.Role).Returns("Admin");
        _currentUserMock.Setup(u => u.CanAccessBranch(It.IsAny<Guid>())).Returns(true);
        _runtimeModeProviderMock.Setup(r => r.CurrentMode).Returns(ErpRuntimeMode.Cloud);

        // Default idempotency setup: no replay
        _idempotencyServiceMock
            .Setup(i => i.CheckAsync<It.IsAnyType, ProductCategoryDto>(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<It.IsAnyType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new IdempotencyCheckResult<ProductCategoryDto> { IsReplay = false });

        _idempotencyServiceMock
            .Setup(i => i.CheckAsync<It.IsAnyType, ProductDto>(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<It.IsAnyType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new IdempotencyCheckResult<ProductDto> { IsReplay = false });

        _idempotencyServiceMock
            .Setup(i => i.CheckAsync<It.IsAnyType, ProductUomDto>(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<It.IsAnyType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new IdempotencyCheckResult<ProductUomDto> { IsReplay = false });

        _idempotencyServiceMock
            .Setup(i => i.CheckAsync<It.IsAnyType, ReorderRuleDto>(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<It.IsAnyType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new IdempotencyCheckResult<ReorderRuleDto> { IsReplay = false });
    }

    // ==========================================
    // 1. ProductCategoryService Tests
    // ==========================================

    [Fact]
    public async Task ProductCategoryService_CreateCategory_Success_CommitsTransactionAndEnqueuesOutbox()
    {
        var categoryRepoMock = new Mock<IProductCategoryRepository>();
        categoryRepoMock.Setup(r => r.ExistsByCodeAsync(_orgId, "CAT01", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var service = new ProductCategoryService(
            categoryRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object);

        var request = new CreateProductCategoryRequest(null, "CAT01", "Painkillers", "Desc", "idemp-cat-1");
        var result = await service.CreateCategoryAsync(request);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Equal("CAT01", result.Value.Code);
        categoryRepoMock.Verify(r => r.AddAsync(It.IsAny<ProductCategory>(), It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.BeginTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
        _outboxServiceMock.Verify(o => o.EnqueueAsync("catalog.category.created", null, It.IsAny<object>(), "1.0", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ProductCategoryService_CreateCategory_DuplicateCode_RollsBackAndFailsWithConflict()
    {
        var categoryRepoMock = new Mock<IProductCategoryRepository>();
        categoryRepoMock.Setup(r => r.ExistsByCodeAsync(_orgId, "CAT01", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var service = new ProductCategoryService(
            categoryRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object);

        var request = new CreateProductCategoryRequest(null, "CAT01", "Painkillers", "Desc", "idemp-cat-2");
        var result = await service.CreateCategoryAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.CONFLICT, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ProductCategoryService_CreateCategory_NonCloudMode_FailsWithForbidden()
    {
        _runtimeModeProviderMock.Setup(r => r.CurrentMode).Returns(ErpRuntimeMode.BranchLocal);
        var categoryRepoMock = new Mock<IProductCategoryRepository>();

        var service = new ProductCategoryService(
            categoryRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object);

        var request = new CreateProductCategoryRequest(null, "CAT01", "Painkillers", "Desc", "idemp-cat-3");
        var result = await service.CreateCategoryAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.FORBIDDEN, result.ErrorCode);
    }

    [Fact]
    public async Task ProductCategoryService_CreateCategory_IdempotencyReplay_ReturnsCachedResponseAndRollsBack()
    {
        var categoryRepoMock = new Mock<IProductCategoryRepository>();
        var cachedDto = new ProductCategoryDto(Guid.NewGuid(), _orgId, null, "CAT-REPLAY", "Replay Cat", null, true, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow);

        _idempotencyServiceMock
            .Setup(i => i.CheckAsync<CreateProductCategoryRequest, ProductCategoryDto>(
                "catalog.category.create", "idemp-replay-1", null, It.IsAny<CreateProductCategoryRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new IdempotencyCheckResult<ProductCategoryDto> { IsReplay = true, ReplayedResponse = cachedDto });

        var service = new ProductCategoryService(
            categoryRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object);

        var request = new CreateProductCategoryRequest(null, "CAT-REPLAY", "Replay Cat", null, "idemp-replay-1");
        var result = await service.CreateCategoryAsync(request);

        Assert.True(result.IsSuccess);
        Assert.Same(cachedDto, result.Value);
        _unitOfWorkMock.Verify(u => u.BeginTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
        categoryRepoMock.Verify(r => r.AddAsync(It.IsAny<ProductCategory>(), It.IsAny<CancellationToken>()), Times.Never);
        _auditLoggerMock.Verify(a => a.LogAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<object>(), It.IsAny<object>(), It.IsAny<Guid?>(), It.IsAny<AuditActorType?>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _outboxServiceMock.Verify(o => o.EnqueueAsync(It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<object>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ProductCategoryService_CreateCategory_IdempotencyMismatch_ReturnsIdempotencyMismatchAndRollsBack()
    {
        var categoryRepoMock = new Mock<IProductCategoryRepository>();

        _idempotencyServiceMock
            .Setup(i => i.CheckAsync<CreateProductCategoryRequest, ProductCategoryDto>(
                "catalog.category.create", "idemp-mismatch-1", null, It.IsAny<CreateProductCategoryRequest>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IntegrationDomainException("IDEMPOTENCY_MISMATCH"));

        var service = new ProductCategoryService(
            categoryRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object);

        var request = new CreateProductCategoryRequest(null, "CAT-MISMATCH", "Mismatch Cat", null, "idemp-mismatch-1");
        var result = await service.CreateCategoryAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.IDEMPOTENCY_MISMATCH, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ProductCategoryService_UpdateCategory_SelfParenting_ReturnsValidationErrorAndRollsBack()
    {
        var categoryRepoMock = new Mock<IProductCategoryRepository>();
        var categoryId = Guid.NewGuid();
        var existingCategory = ProductCategory.Create(_orgId, "CAT01", "Painkillers", null, null, categoryId);

        categoryRepoMock.Setup(r => r.GetByIdAsync(_orgId, categoryId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingCategory);

        var service = new ProductCategoryService(
            categoryRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object);

        // Request sets ParentCategoryId == categoryId (self-parenting)
        var request = new UpdateProductCategoryRequest(categoryId, "Updated Name", null, null, "idemp-upd-self");
        var result = await service.UpdateCategoryAsync(categoryId, request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.VALIDATION_ERROR, result.ErrorCode);
        Assert.Equal(ErrorMessages.CategorySelfParent, result.ErrorMessage);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ProductCategoryService_GetCategories_ReturnsPagedResult()
    {
        var categoryRepoMock = new Mock<IProductCategoryRepository>();
        var cat1 = ProductCategory.Create(_orgId, "CAT1", "Cat One", null, null);
        var cat2 = ProductCategory.Create(_orgId, "CAT2", "Cat Two", null, null);
        var paged = new PagedResult<ProductCategory>(new List<ProductCategory> { cat1, cat2 }, 1, 10, 2);

        categoryRepoMock.Setup(r => r.GetPagedAsync(_orgId, null, false, "Cat", 1, 10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(paged);

        var service = new ProductCategoryService(
            categoryRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object);

        var result = await service.GetCategoriesAsync(null, false, "Cat", 1, 10);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Equal(2, result.Value.Items.Count);
        Assert.Equal(1, result.Value.Page);
        Assert.Equal(10, result.Value.PageSize);
        Assert.Equal(2, result.Value.TotalCount);
    }

    [Fact]
    public async Task ProductCategoryService_GetCategoryById_ReturnsDto_WhenFound()
    {
        var categoryRepoMock = new Mock<IProductCategoryRepository>();
        var categoryId = Guid.NewGuid();
        var cat = ProductCategory.Create(_orgId, "CAT1", "Cat One", "Desc", null, categoryId);

        categoryRepoMock.Setup(r => r.GetByIdAsync(_orgId, categoryId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(cat);

        var service = new ProductCategoryService(
            categoryRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object);

        var result = await service.GetCategoryByIdAsync(categoryId);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Equal(categoryId, result.Value.CategoryId);
        Assert.Equal("CAT1", result.Value.Code);
    }

    [Fact]
    public async Task ProductCategoryService_GetCategoryById_ReturnsNotFound_WhenNull()
    {
        var categoryRepoMock = new Mock<IProductCategoryRepository>();
        var categoryId = Guid.NewGuid();

        categoryRepoMock.Setup(r => r.GetByIdAsync(_orgId, categoryId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ProductCategory?)null);

        var service = new ProductCategoryService(
            categoryRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object);

        var result = await service.GetCategoryByIdAsync(categoryId);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.NOT_FOUND, result.ErrorCode);
    }

    // ==========================================
    // 2. ProductService Tests
    // ==========================================

    [Fact]
    public async Task ProductService_CreateProduct_NonLotTracking_InitializesNonLotBatch()
    {
        var productRepoMock = new Mock<IProductRepository>();
        var categoryRepoMock = new Mock<IProductCategoryRepository>();
        var categoryId = Guid.NewGuid();

        categoryRepoMock.Setup(r => r.ExistsAndActiveAsync(_orgId, categoryId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        productRepoMock.Setup(r => r.ExistsBySkuAsync(_orgId, "SKU-NL", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var service = new ProductService(
            productRepoMock.Object,
            categoryRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object,
            _nonLotBatchInitializerMock.Object,
            _usageCheckerMock.Object);

        var uoms = new List<CreateProductUomItemRequest>
        {
            new("BOX", "Box", 1m, 50m, true, true, true)
        };
        var request = new CreateProductRequest(
            categoryId, "SKU-NL", null, "Syrup", null, null, "BOX", 0.14m, null,
            LotTrackingRequired: false, ExpiryAlertDays: 0, uoms, "idemp-prod-1");

        var result = await service.CreateProductAsync(request);

        Assert.True(result.IsSuccess);
        _nonLotBatchInitializerMock.Verify(n => n.EnsureNonLotBatchExistsAsync(_orgId, It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ProductService_CreateProduct_LotTrackingRequired_DoesNotInitializeNonLotBatch()
    {
        var productRepoMock = new Mock<IProductRepository>();
        var categoryRepoMock = new Mock<IProductCategoryRepository>();
        var categoryId = Guid.NewGuid();

        categoryRepoMock.Setup(r => r.ExistsAndActiveAsync(_orgId, categoryId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        productRepoMock.Setup(r => r.ExistsBySkuAsync(_orgId, "SKU-LOT", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var service = new ProductService(
            productRepoMock.Object,
            categoryRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object,
            _nonLotBatchInitializerMock.Object,
            _usageCheckerMock.Object);

        var uoms = new List<CreateProductUomItemRequest>
        {
            new("BOX", "Box", 1m, 50m, true, true, true)
        };
        var request = new CreateProductRequest(
            categoryId, "SKU-LOT", null, "Antibiotic", null, null, "BOX", 0.14m, null,
            LotTrackingRequired: true, ExpiryAlertDays: 90, uoms, "idemp-prod-2");

        var result = await service.CreateProductAsync(request);

        Assert.True(result.IsSuccess);
        _nonLotBatchInitializerMock.Verify(n => n.EnsureNonLotBatchExistsAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ProductService_CreateProduct_DuplicateBarcode_RollsBackAndFailsWithConflict()
    {
        var productRepoMock = new Mock<IProductRepository>();
        var categoryRepoMock = new Mock<IProductCategoryRepository>();
        var categoryId = Guid.NewGuid();

        categoryRepoMock.Setup(r => r.ExistsAndActiveAsync(_orgId, categoryId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        productRepoMock.Setup(r => r.ExistsBySkuAsync(_orgId, "SKU-DUP-BAR", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);
        productRepoMock.Setup(r => r.ExistsByBarcodeAsync(_orgId, "1234567890", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var service = new ProductService(
            productRepoMock.Object,
            categoryRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object,
            _nonLotBatchInitializerMock.Object,
            _usageCheckerMock.Object);

        var uoms = new List<CreateProductUomItemRequest>
        {
            new("BOX", "Box", 1m, 50m, true, true, true)
        };
        var request = new CreateProductRequest(
            categoryId, "SKU-DUP-BAR", "1234567890", "Prod", null, null, "BOX", 0.14m, null,
            false, 0, uoms, "idemp-dup-bar");

        var result = await service.CreateProductAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.CONFLICT, result.ErrorCode);
        Assert.Equal(ErrorMessages.DuplicateBarcode, result.ErrorMessage);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ProductService_CreateProduct_InactiveCategory_RollsBackAndFailsWithNotFound()
    {
        var productRepoMock = new Mock<IProductRepository>();
        var categoryRepoMock = new Mock<IProductCategoryRepository>();
        var categoryId = Guid.NewGuid();

        categoryRepoMock.Setup(r => r.ExistsAndActiveAsync(_orgId, categoryId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var service = new ProductService(
            productRepoMock.Object,
            categoryRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object,
            _nonLotBatchInitializerMock.Object,
            _usageCheckerMock.Object);

        var uoms = new List<CreateProductUomItemRequest>
        {
            new("BOX", "Box", 1m, 50m, true, true, true)
        };
        var request = new CreateProductRequest(
            categoryId, "SKU-INACT", null, "Prod", null, null, "BOX", 0.14m, null,
            false, 0, uoms, "idemp-inact-cat");

        var result = await service.CreateProductAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.NOT_FOUND, result.ErrorCode);
        Assert.Equal(ErrorMessages.CategoryNotFoundOrInactive, result.ErrorMessage);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ProductService_UpdateProduct_ChangeLotTrackingWhenStockExists_FailsWithConflictAndRollback()
    {
        var productRepoMock = new Mock<IProductRepository>();
        var categoryRepoMock = new Mock<IProductCategoryRepository>();
        var productId = Guid.NewGuid();

        var existingProduct = Product.Create(
            _orgId, Guid.NewGuid(), "SKU-EXIST", null, "Product", null, null, "BOX", 0.14m, null, true, 30,
            new List<InitialUomDefinition> { new("BOX", "Box", 1m, 50m, true, true, true) }, productId);

        productRepoMock.Setup(r => r.GetByIdWithUomsAsync(_orgId, productId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingProduct);

        // Usage checker indicates existing stock/history!
        _usageCheckerMock.Setup(u => u.HasAnyStockOrPostedHistoryForProductAsync(_orgId, productId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var service = new ProductService(
            productRepoMock.Object,
            categoryRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object,
            _nonLotBatchInitializerMock.Object,
            _usageCheckerMock.Object);

        var request = new UpdateProductRequest(
            null, null, null, null, null, null, null, null, null,
            LotTrackingRequired: false, ExpiryAlertDays: null, IsActive: null, "idemp-prod-upd-1");

        var result = await service.UpdateProductAsync(productId, request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.CONFLICT, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ProductService_GetProducts_ReturnsPagedResultWithUoms()
    {
        var productRepoMock = new Mock<IProductRepository>();
        var categoryRepoMock = new Mock<IProductCategoryRepository>();

        var p = Product.Create(
            _orgId, Guid.NewGuid(), "SKU-PAGED", null, "Paged Product", null, null, "BOX", 0.14m, null, false, 0,
            new List<InitialUomDefinition> { new("BOX", "Box", 1m, 10m, true, true, true) });
        var paged = new PagedResult<Product>(new List<Product> { p }, 1, 10, 1);

        productRepoMock.Setup(r => r.GetPagedAsync(_orgId, null, false, null, 1, 10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(paged);

        var service = new ProductService(
            productRepoMock.Object,
            categoryRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object,
            _nonLotBatchInitializerMock.Object,
            _usageCheckerMock.Object);

        var result = await service.GetProductsAsync(null, false, null, 1, 10);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Single(result.Value.Items);
        Assert.Equal("SKU-PAGED", result.Value.Items[0].Sku);
        Assert.Single(result.Value.Items[0].Uoms);
    }

    [Fact]
    public async Task ProductService_GetProductById_ReturnsProduct_WhenFound()
    {
        var productRepoMock = new Mock<IProductRepository>();
        var categoryRepoMock = new Mock<IProductCategoryRepository>();
        var productId = Guid.NewGuid();

        var p = Product.Create(
            _orgId, Guid.NewGuid(), "SKU-ID", null, "Id Product", null, null, "BOX", 0.14m, null, false, 0,
            new List<InitialUomDefinition> { new("BOX", "Box", 1m, 10m, true, true, true) }, productId);

        productRepoMock.Setup(r => r.GetByIdWithUomsAsync(_orgId, productId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(p);

        var service = new ProductService(
            productRepoMock.Object,
            categoryRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object,
            _nonLotBatchInitializerMock.Object,
            _usageCheckerMock.Object);

        var result = await service.GetProductByIdAsync(productId);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Equal(productId, result.Value.ProductId);
        Assert.Equal("SKU-ID", result.Value.Sku);
    }

    // ==========================================
    // 3. ProductUomService Tests
    // ==========================================

    [Fact]
    public async Task ProductUomService_UpdateUom_ChangeConversionFactorWhenReferenced_FailsWithConflictAndRollback()
    {
        var uomRepoMock = new Mock<IProductUomRepository>();
        var productRepoMock = new Mock<IProductRepository>();
        var productId = Guid.NewGuid();

        var product = Product.Create(
            _orgId, Guid.NewGuid(), "SKU-P", null, "Prod", null, null, "BOX", 0.14m, null, false, 0,
            new List<InitialUomDefinition> { new("BOX", "Box", 1m, 50m, true, true, true) }, productId);
        var uom = product.AddUom("STRIP", "Strip", 0.1m, 10m, false, true, true);
        var uomId = uom.ProductUomId;

        uomRepoMock.Setup(r => r.GetByIdAsync(_orgId, productId, uomId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(uom);

        // Usage checker returns true (referenced by stock or document)
        _usageCheckerMock.Setup(u => u.HasAnyStockOrDocumentReferenceForUomAsync(_orgId, productId, uomId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var service = new ProductUomService(
            uomRepoMock.Object,
            productRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object,
            _usageCheckerMock.Object);

        var request = new UpdateProductUomRequest(null, ConversionToBase: 0.2m, null, null, null, null, "idemp-uom-upd-1");
        var result = await service.UpdateProductUomAsync(productId, uomId, request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.CONFLICT, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ProductUomService_CreateUom_DuplicateCode_FailsWithConflictAndRollback()
    {
        var uomRepoMock = new Mock<IProductUomRepository>();
        var productRepoMock = new Mock<IProductRepository>();
        var productId = Guid.NewGuid();

        var product = Product.Create(
            _orgId, Guid.NewGuid(), "SKU-1", null, "Prod", null, null, "BOX", 0.14m, null, false, 0,
            new List<InitialUomDefinition> { new("BOX", "Box", 1m, 50m, true, true, true) }, productId);

        productRepoMock.Setup(r => r.GetByIdWithUomsAsync(_orgId, productId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(product);

        uomRepoMock.Setup(r => r.ExistsByUomCodeAsync(_orgId, productId, "BOX", null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var service = new ProductUomService(
            uomRepoMock.Object,
            productRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object,
            _usageCheckerMock.Object);

        var request = new CreateProductUomRequest("BOX", "Box New", 1m, 50m, false, true, true, "idemp-uom-cr-1");
        var result = await service.CreateProductUomAsync(productId, request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.CONFLICT, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ProductUomService_GetProductUoms_ReturnsUomsList()
    {
        var uomRepoMock = new Mock<IProductUomRepository>();
        var productRepoMock = new Mock<IProductRepository>();
        var productId = Guid.NewGuid();

        var product = Product.Create(
            _orgId, Guid.NewGuid(), "SKU-UOM", null, "Prod", null, null, "BOX", 0.14m, null, false, 0,
            new List<InitialUomDefinition> { new("BOX", "Box", 1m, 50m, true, true, true) }, productId);
        var uom2 = product.AddUom("STRIP", "Strip", 0.1m, 5m, false, true, true);

        uomRepoMock.Setup(r => r.GetByProductIdAsync(_orgId, productId, true, It.IsAny<CancellationToken>()))
            .ReturnsAsync(product.Uoms.ToList());

        var service = new ProductUomService(
            uomRepoMock.Object,
            productRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object,
            _usageCheckerMock.Object);

        var result = await service.GetProductUomsAsync(productId);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Equal(2, result.Value.Count);
        Assert.Contains(result.Value, u => u.UomCode == "BOX");
        Assert.Contains(result.Value, u => u.UomCode == "STRIP");
    }

    // ==========================================
    // 4. ReorderRuleService Tests
    // ==========================================

    [Fact]
    public async Task ReorderRuleService_UpsertRule_ForbiddenBranch_ReturnsForbiddenBranch()
    {
        var reorderRepoMock = new Mock<IProductReorderRuleRepository>();
        var productRepoMock = new Mock<IProductRepository>();
        var branchId = Guid.NewGuid();
        var productId = Guid.NewGuid();

        _currentUserMock.Setup(u => u.CanAccessBranch(branchId)).Returns(false);

        var service = new ReorderRuleService(
            reorderRepoMock.Object,
            productRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object);

        var request = new UpsertReorderRuleRequest(10m, 50m, 100m, true, "idemp-rr-1");
        var result = await service.UpsertReorderRuleAsync(branchId, productId, request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.FORBIDDEN_BRANCH, result.ErrorCode);
    }

    [Fact]
    public async Task ReorderRuleService_UpsertRule_ProductNotFound_ReturnsNotFoundAndRollback()
    {
        var reorderRepoMock = new Mock<IProductReorderRuleRepository>();
        var productRepoMock = new Mock<IProductRepository>();
        var branchId = Guid.NewGuid();
        var productId = Guid.NewGuid();

        _currentUserMock.Setup(u => u.CanAccessBranch(branchId)).Returns(true);
        productRepoMock.Setup(p => p.GetByIdAsync(_orgId, productId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Product?)null);

        var service = new ReorderRuleService(
            reorderRepoMock.Object,
            productRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object);

        var request = new UpsertReorderRuleRequest(10m, 50m, 100m, true, "idemp-rr-2");
        var result = await service.UpsertReorderRuleAsync(branchId, productId, request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.NOT_FOUND, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ReorderRuleService_UpsertRule_Create_PassesBranchIdToIdempotencyAndAudit()
    {
        var reorderRepoMock = new Mock<IProductReorderRuleRepository>();
        var productRepoMock = new Mock<IProductRepository>();
        var branchId = Guid.NewGuid();
        var productId = Guid.NewGuid();

        var product = Product.Create(
            _orgId, Guid.NewGuid(), "SKU-R", null, "Prod", null, null, "BOX", 0.14m, null, false, 0,
            new List<InitialUomDefinition> { new("BOX", "Box", 1m, 50m, true, true, true) }, productId);

        productRepoMock.Setup(p => p.GetByIdAsync(_orgId, productId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(product);
        reorderRepoMock.Setup(r => r.GetByBranchAndProductAsync(_orgId, branchId, productId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ProductReorderRule?)null);

        var service = new ReorderRuleService(
            reorderRepoMock.Object,
            productRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object);

        var request = new UpsertReorderRuleRequest(15m, 60m, 120m, true, "idemp-rr-branch");
        var result = await service.UpsertReorderRuleAsync(branchId, productId, request);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Equal(15m, result.Value.ReorderPointBase);
        Assert.Equal(branchId, result.Value.BranchId);

        // Verify BranchId is passed to CheckAsync, PersistResponseAsync, AuditLogger, Outbox
        _idempotencyServiceMock.Verify(i => i.CheckAsync<UpsertReorderRuleRequest, ReorderRuleDto>(
            "catalog.reorderrule.upsert", "idemp-rr-branch", branchId, request, It.IsAny<CancellationToken>()), Times.Once);
        _idempotencyServiceMock.Verify(i => i.PersistResponseAsync(
            "catalog.reorderrule.upsert", "idemp-rr-branch", branchId, request, It.IsAny<ReorderRuleDto>(), It.IsAny<CancellationToken>()), Times.Once);
        _auditLoggerMock.Verify(a => a.LogAsync(
            "CREATE", "catalog", "PRODUCT_REORDER_RULE", It.IsAny<Guid>(), null, It.IsAny<object>(), branchId, null, null, It.IsAny<CancellationToken>()), Times.Once);
        _outboxServiceMock.Verify(o => o.EnqueueAsync(
            "catalog.reorderrule.created", branchId, It.IsAny<object>(), "1.0", It.IsAny<CancellationToken>()), Times.Once);

        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ReorderRuleService_UpsertRule_UpdatesExistingRule_ThresholdsAndActive()
    {
        var reorderRepoMock = new Mock<IProductReorderRuleRepository>();
        var productRepoMock = new Mock<IProductRepository>();
        var branchId = Guid.NewGuid();
        var productId = Guid.NewGuid();

        var product = Product.Create(
            _orgId, Guid.NewGuid(), "SKU-UPDR", null, "Prod", null, null, "BOX", 0.14m, null, false, 0,
            new List<InitialUomDefinition> { new("BOX", "Box", 1m, 50m, true, true, true) }, productId);

        var existingRule = ProductReorderRule.Create(_orgId, productId, branchId, 5m, 20m, 50m);
        existingRule.SetActiveState(false); // currently inactive

        productRepoMock.Setup(p => p.GetByIdAsync(_orgId, productId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(product);
        reorderRepoMock.Setup(r => r.GetByBranchAndProductAsync(_orgId, branchId, productId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingRule);

        var service = new ReorderRuleService(
            reorderRepoMock.Object,
            productRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object);

        var request = new UpsertReorderRuleRequest(25m, 80m, 160m, true, "idemp-rr-upd");
        var result = await service.UpsertReorderRuleAsync(branchId, productId, request);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Equal(25m, result.Value.ReorderPointBase);
        Assert.Equal(80m, result.Value.ReorderQuantityBase);
        Assert.Equal(160m, result.Value.MaxQuantityBase);
        Assert.True(result.Value.IsActive);

        // Verify rule was updated in place, NOT added as new
        reorderRepoMock.Verify(r => r.AddAsync(It.IsAny<ProductReorderRule>(), It.IsAny<CancellationToken>()), Times.Never);
        _auditLoggerMock.Verify(a => a.LogAsync("UPDATE", "catalog", "PRODUCT_REORDER_RULE", existingRule.ReorderRuleId, null, existingRule, branchId, null, null, It.IsAny<CancellationToken>()), Times.Once);
        _outboxServiceMock.Verify(o => o.EnqueueAsync("catalog.reorderrule.updated", branchId, It.IsAny<object>(), "1.0", It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ReorderRuleService_GetReorderRule_ReturnsDto_WhenFound()
    {
        var reorderRepoMock = new Mock<IProductReorderRuleRepository>();
        var productRepoMock = new Mock<IProductRepository>();
        var branchId = Guid.NewGuid();
        var productId = Guid.NewGuid();

        var existingRule = ProductReorderRule.Create(_orgId, productId, branchId, 10m, 50m, 100m);

        reorderRepoMock.Setup(r => r.GetByBranchAndProductAsync(_orgId, branchId, productId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingRule);

        var service = new ReorderRuleService(
            reorderRepoMock.Object,
            productRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object);

        var result = await service.GetReorderRuleAsync(branchId, productId);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Equal(existingRule.ReorderRuleId, result.Value.ReorderRuleId);
        Assert.Equal(10m, result.Value.ReorderPointBase);
        Assert.Equal(branchId, result.Value.BranchId);
    }

    [Fact]
    public async Task ReorderRuleService_GetReorderRule_ReturnsNotFound_WhenNull()
    {
        var reorderRepoMock = new Mock<IProductReorderRuleRepository>();
        var productRepoMock = new Mock<IProductRepository>();
        var branchId = Guid.NewGuid();
        var productId = Guid.NewGuid();

        reorderRepoMock.Setup(r => r.GetByBranchAndProductAsync(_orgId, branchId, productId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ProductReorderRule?)null);

        var service = new ReorderRuleService(
            reorderRepoMock.Object,
            productRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object);

        var result = await service.GetReorderRuleAsync(branchId, productId);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.NOT_FOUND, result.ErrorCode);
    }
}
