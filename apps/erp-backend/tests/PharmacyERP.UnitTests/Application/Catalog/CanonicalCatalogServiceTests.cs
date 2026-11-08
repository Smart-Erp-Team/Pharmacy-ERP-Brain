using System.Reflection;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using PharmacyERP.Application;
using PharmacyERP.Application.Common.Constants;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Common.Interfaces.CrossModule;
using PharmacyERP.Application.Common.Interfaces.Integration;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Application.Features.Catalog.DTOs;
using PharmacyERP.Application.Features.Catalog.Interfaces;
using PharmacyERP.Application.Features.Catalog.Services.Implementations;
using PharmacyERP.Application.Features.Catalog.Services.Interfaces;
using PharmacyERP.Application.Features.Identity.Interfaces;
using PharmacyERP.Application.Features.Integration.DTOs;
using PharmacyERP.Domain.Entities.Catalog;
using PharmacyERP.Domain.Entities.Identity;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Domain.Exceptions;
using PharmacyERP.Domain.ValueObjects;
using PharmacyERP.Infrastructure;
using Xunit;

namespace PharmacyERP.UnitTests.Application.Catalog;

public class CanonicalCatalogServiceTests
{
    private readonly Guid _orgId = Guid.NewGuid();
    private readonly Guid _branchId = Guid.NewGuid();
    private readonly Mock<IProductRepository> _productRepoMock = new();
    private readonly Mock<IProductCategoryRepository> _categoryRepoMock = new();
    private readonly Mock<IProductUomRepository> _uomRepoMock = new();
    private readonly Mock<IProductReorderRuleRepository> _reorderRuleRepoMock = new();
    private readonly Mock<IBranchRepository> _branchRepoMock = new();
    private readonly Mock<IUnitOfWork> _unitOfWorkMock = new();
    private readonly Mock<ITenantContext> _tenantContextMock = new();
    private readonly Mock<ICurrentUser> _currentUserMock = new();
    private readonly Mock<IRuntimeModeProvider> _runtimeModeMock = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProviderMock = new();
    private readonly Mock<IIdempotencyService> _idempotencyServiceMock = new();
    private readonly Mock<IAuditLogger> _auditLoggerMock = new();
    private readonly Mock<IOutboxService> _outboxServiceMock = new();
    private readonly Mock<INonLotBatchInitializer> _nonLotBatchInitializerMock = new();
    private readonly Mock<IProductInventoryUsageChecker> _usageCheckerMock = new();

    private readonly DateTimeOffset _fixedTime = new(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);
    private readonly CanonicalCatalogService _service;

    public CanonicalCatalogServiceTests()
    {
        _tenantContextMock.Setup(t => t.OrganizationId).Returns(_orgId);
        _currentUserMock.Setup(u => u.Role).Returns("Admin");
        _currentUserMock.Setup(u => u.CanAccessBranch(It.IsAny<Guid>())).Returns(true);
        _runtimeModeMock.Setup(r => r.CurrentMode).Returns(ErpRuntimeMode.Cloud);
        _dateTimeProviderMock.Setup(d => d.UtcNow).Returns(_fixedTime);

        _branchRepoMock
            .Setup(b => b.GetByIdAsync(_orgId, It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Branch.Create(_orgId, "BR01", "Main Branch", new Address("123 Street", null, "Cairo", null, null, "EG")));

        _idempotencyServiceMock
            .Setup(i => i.CheckAsync<CanonicalProductConfigurationRequest, CanonicalWriteResultDto>(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<CanonicalProductConfigurationRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new IdempotencyCheckResult<CanonicalWriteResultDto> { IsReplay = false });

        _idempotencyServiceMock
            .Setup(i => i.CheckAsync<CanonicalReorderRuleConfigurationRequest, CanonicalWriteResultDto>(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<CanonicalReorderRuleConfigurationRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new IdempotencyCheckResult<CanonicalWriteResultDto> { IsReplay = false });

        _service = new CanonicalCatalogService(
            _productRepoMock.Object,
            _categoryRepoMock.Object,
            _uomRepoMock.Object,
            _reorderRuleRepoMock.Object,
            _branchRepoMock.Object,
            _unitOfWorkMock.Object,
            _tenantContextMock.Object,
            _currentUserMock.Object,
            _runtimeModeMock.Object,
            _dateTimeProviderMock.Object,
            _idempotencyServiceMock.Object,
            _auditLoggerMock.Object,
            _outboxServiceMock.Object,
            _nonLotBatchInitializerMock.Object,
            _usageCheckerMock.Object);
    }

    private Product CreateSampleProduct(string sku = "PAN-500", string name = "Panadol 500mg", bool lotTracking = false)
    {
        var categoryId = Guid.NewGuid();
        var initialUoms = new List<InitialUomDefinition>
        {
            new("BOX", "Box of 10", 1m, 25.50m, true, true, true),
            new("STRIP", "Strip of 5", 0.5m, 13.00m, false, true, true)
        };

        return Product.Create(
            _orgId,
            categoryId,
            sku,
            "1234567890123",
            name,
            "Generic " + name,
            "Brand " + name,
            "BOX",
            0.14m,
            "http://example.com/img.png",
            lotTracking,
            30,
            initialUoms);
    }

    private static string EncodeCursorBase64Url(DateTimeOffset time, Guid id)
    {
        var raw = $"{time.UtcTicks}:{id:N}";
        var bytes = Encoding.UTF8.GetBytes(raw);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static object? GetPropValue(object? obj, string propName)
    {
        if (obj == null) return null;
        var prop = obj.GetType().GetProperty(propName, BindingFlags.Public | BindingFlags.Instance);
        return prop?.GetValue(obj);
    }

    // =========================================================================
    // 1. Successful Write Paths: Full Protocol Lifecycle & Snapshot Assertions
    // =========================================================================

    [Fact]
    public async Task ConfigureProductAsync_CreateProduct_FullLifecycleVerification()
    {
        var categoryId = Guid.NewGuid();
        _categoryRepoMock.Setup(c => c.ExistsAndActiveAsync(_orgId, categoryId, It.IsAny<CancellationToken>())).ReturnsAsync(true);
        _productRepoMock.Setup(p => p.ExistsBySkuAsync(_orgId, "AMO-500", null, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-create-001",
            IdempotencyKey: "idem-create-001",
            Action: CatalogConfigurationAction.CreateProduct,
            CategoryId: categoryId,
            Sku: "AMO-500",
            Barcode: "9876543210123",
            Name: "Amoxicillin 500mg",
            BaseUomCode: "CAP",
            TaxRate: 0.14m,
            LotTrackingRequired: false,
            ExpiryAlertDays: 60,
            Uoms: new List<CanonicalUomItemDto> { new("CAP", "Capsule", 1m, 5.00m, true, true, true) }
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.True(result.IsSuccess);
        Assert.Equal(CanonicalWriteStatuses.Applied, result.Value!.Status);
        Assert.Equal("PRODUCT", result.Value.EntityType);
        Assert.Equal(_fixedTime, result.Value.ExecutedAt);

        _unitOfWorkMock.Verify(u => u.BeginTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);

        _idempotencyServiceMock.Verify(i => i.CheckAsync<CanonicalProductConfigurationRequest, CanonicalWriteResultDto>(
            "canonical.configuration.products", "idem-create-001", null, request, It.IsAny<CancellationToken>()), Times.Once);
        _idempotencyServiceMock.Verify(i => i.PersistResponseAsync(
            "canonical.configuration.products", "idem-create-001", null, request, result.Value, It.IsAny<CancellationToken>()), Times.Once);

        _auditLoggerMock.Verify(a => a.LogAsync(
            "CREATE", "catalog", "PRODUCT", result.Value.TargetEntityId, null,
            It.Is<object>(obj => obj != null && !typeof(Product).IsAssignableFrom(obj.GetType())),
            null, AuditActorType.AI_ASSISTED, "prompt-create-001", It.IsAny<CancellationToken>()), Times.Once);

        _outboxServiceMock.Verify(o => o.EnqueueAsync(
            "catalog.product.created", null,
            It.Is<object>(obj => obj != null && !typeof(Product).IsAssignableFrom(obj.GetType())),
            "1.0", It.IsAny<CancellationToken>()), Times.Once);

        _nonLotBatchInitializerMock.Verify(n => n.EnsureNonLotBatchExistsAsync(_orgId, result.Value.TargetEntityId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ConfigureProductAsync_UpdateProduct_FullLifecycleVerification()
    {
        var product = CreateSampleProduct("AUG-1G", "Augmentin 1g");
        _productRepoMock.Setup(p => p.GetByIdWithUomsAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-update-001",
            IdempotencyKey: "idem-update-001",
            Action: CatalogConfigurationAction.UpdateProduct,
            ProductId: product.ProductId,
            Name: "Augmentin 1000mg Extra",
            TaxRate: 0.14m,
            ExpiryAlertDays: 45
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.True(result.IsSuccess);
        Assert.Equal(product.ProductId, result.Value!.TargetEntityId);
        Assert.Equal(_fixedTime, result.Value.ExecutedAt);

        _unitOfWorkMock.Verify(u => u.BeginTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);

        _auditLoggerMock.Verify(a => a.LogAsync(
            "UPDATE", "catalog", "PRODUCT", product.ProductId,
            It.Is<object>(b => b != null && !typeof(Product).IsAssignableFrom(b.GetType())),
            It.Is<object>(aObj => aObj != null && !typeof(Product).IsAssignableFrom(aObj.GetType())),
            null, AuditActorType.AI_ASSISTED, "prompt-update-001", It.IsAny<CancellationToken>()), Times.Once);

        _outboxServiceMock.Verify(o => o.EnqueueAsync("catalog.product.updated", null, It.IsAny<object>(), "1.0", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ConfigureProductAsync_AddUom_FullLifecycleVerification()
    {
        var product = CreateSampleProduct("PAN-500", "Panadol 500mg");
        _productRepoMock.Setup(p => p.GetByIdWithUomsAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);
        _uomRepoMock.Setup(u => u.ExistsByUomCodeAsync(_orgId, product.ProductId, "PACK", null, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-add-uom-001",
            IdempotencyKey: "idem-add-uom-001",
            Action: CatalogConfigurationAction.AddUom,
            ProductId: product.ProductId,
            UomCode: "PACK",
            DisplayName: "Pack of 20",
            ConversionToBase: 2m,
            SaleUnitPrice: 50.00m,
            IsSellable: true,
            IsPurchasable: true
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.True(result.IsSuccess);
        Assert.Equal("PRODUCT_UOM", result.Value!.EntityType);

        _unitOfWorkMock.Verify(u => u.BeginTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _uomRepoMock.Verify(u => u.AddAsync(It.IsAny<ProductUom>(), It.IsAny<CancellationToken>()), Times.Once);

        _auditLoggerMock.Verify(a => a.LogAsync(
            "CREATE", "catalog", "PRODUCT_UOM", result.Value.TargetEntityId, null,
            It.Is<object>(aObj => aObj != null && !typeof(ProductUom).IsAssignableFrom(aObj.GetType())),
            null, AuditActorType.AI_ASSISTED, "prompt-add-uom-001", It.IsAny<CancellationToken>()), Times.Once);

        _outboxServiceMock.Verify(o => o.EnqueueAsync("catalog.uom.created", null, It.IsAny<object>(), "1.0", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ConfigureProductAsync_UpdateUom_FullLifecycleVerification()
    {
        var product = CreateSampleProduct("PAN-500", "Panadol 500mg");
        var secondaryUom = product.Uoms.First(u => !u.IsBase);
        _productRepoMock.Setup(p => p.GetByIdWithUomsAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);
        _uomRepoMock.Setup(u => u.GetByIdAsync(_orgId, product.ProductId, secondaryUom.ProductUomId, It.IsAny<CancellationToken>())).ReturnsAsync(secondaryUom);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-update-uom-001",
            IdempotencyKey: "idem-update-uom-001",
            Action: CatalogConfigurationAction.UpdateUom,
            ProductId: product.ProductId,
            ProductUomId: secondaryUom.ProductUomId,
            DisplayName: "Updated Strip Display",
            SaleUnitPrice: 15.00m
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.True(result.IsSuccess);
        Assert.Equal(secondaryUom.ProductUomId, result.Value!.TargetEntityId);

        _unitOfWorkMock.Verify(u => u.BeginTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);

        _auditLoggerMock.Verify(a => a.LogAsync(
            "UPDATE", "catalog", "PRODUCT_UOM", secondaryUom.ProductUomId,
            It.Is<object>(b => b != null && !typeof(ProductUom).IsAssignableFrom(b.GetType())),
            It.Is<object>(aObj => aObj != null && !typeof(ProductUom).IsAssignableFrom(aObj.GetType())),
            null, AuditActorType.AI_ASSISTED, "prompt-update-uom-001", It.IsAny<CancellationToken>()), Times.Once);

        _outboxServiceMock.Verify(o => o.EnqueueAsync("catalog.uom.updated", null, It.IsAny<object>(), "1.0", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ConfigureProductAsync_DeactivateUom_FullLifecycleVerification()
    {
        var product = CreateSampleProduct("PAN-500", "Panadol 500mg");
        var secondaryUom = product.Uoms.First(u => !u.IsBase);
        _productRepoMock.Setup(p => p.GetByIdWithUomsAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);
        _uomRepoMock.Setup(u => u.GetByIdAsync(_orgId, product.ProductId, secondaryUom.ProductUomId, It.IsAny<CancellationToken>())).ReturnsAsync(secondaryUom);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-deact-uom-001",
            IdempotencyKey: "idem-deact-uom-001",
            Action: CatalogConfigurationAction.DeactivateUom,
            ProductId: product.ProductId,
            ProductUomId: secondaryUom.ProductUomId
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.True(result.IsSuccess);
        Assert.False(secondaryUom.IsActive);

        _unitOfWorkMock.Verify(u => u.BeginTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);

        _auditLoggerMock.Verify(a => a.LogAsync(
            "DEACTIVATE", "catalog", "PRODUCT_UOM", secondaryUom.ProductUomId,
            It.Is<object>(b => b != null && !typeof(ProductUom).IsAssignableFrom(b.GetType())),
            It.Is<object>(aObj => aObj != null && !typeof(ProductUom).IsAssignableFrom(aObj.GetType())),
            null, AuditActorType.AI_ASSISTED, "prompt-deact-uom-001", It.IsAny<CancellationToken>()), Times.Once);

        _outboxServiceMock.Verify(o => o.EnqueueAsync("catalog.uom.updated", null, It.IsAny<object>(), "1.0", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ConfigureReorderRuleAsync_CreateRule_FullLifecycleVerification()
    {
        var product = CreateSampleProduct("MET-500", "Metformin 500mg");
        _productRepoMock.Setup(p => p.GetByIdAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);
        _reorderRuleRepoMock.Setup(r => r.GetByBranchAndProductAsync(_orgId, _branchId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync((ProductReorderRule?)null);

        var request = new CanonicalReorderRuleConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-reorder-create-001",
            IdempotencyKey: "idem-reorder-create-001",
            BranchId: _branchId,
            ProductId: product.ProductId,
            ReorderPointBase: 20m,
            ReorderQuantityBase: 100m,
            MaxQuantityBase: 200m,
            IsActive: true
        );

        var result = await _service.ConfigureReorderRuleAsync(request);

        Assert.True(result.IsSuccess);
        Assert.Equal(CanonicalWriteStatuses.Applied, result.Value!.Status);
        Assert.Equal("PRODUCT_REORDER_RULE", result.Value.EntityType);
        Assert.Equal(_fixedTime, result.Value.ExecutedAt);

        _unitOfWorkMock.Verify(u => u.BeginTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);

        _auditLoggerMock.Verify(a => a.LogAsync(
            "CREATE", "catalog", "PRODUCT_REORDER_RULE", result.Value.TargetEntityId, null,
            It.Is<object>(aObj => aObj != null && !typeof(ProductReorderRule).IsAssignableFrom(aObj.GetType())),
            _branchId, AuditActorType.AI_ASSISTED, "prompt-reorder-create-001", It.IsAny<CancellationToken>()), Times.Once);

        _outboxServiceMock.Verify(o => o.EnqueueAsync("catalog.reorderrule.created", _branchId, It.IsAny<object>(), "1.0", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ConfigureReorderRuleAsync_UpdateRule_FullLifecycleVerification()
    {
        var product = CreateSampleProduct("MET-500", "Metformin 500mg");
        var existingRule = ProductReorderRule.Create(_orgId, product.ProductId, _branchId, 10m, 50m, 100m);
        _productRepoMock.Setup(p => p.GetByIdAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);
        _reorderRuleRepoMock.Setup(r => r.GetByBranchAndProductAsync(_orgId, _branchId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(existingRule);

        var request = new CanonicalReorderRuleConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-reorder-update-001",
            IdempotencyKey: "idem-reorder-update-001",
            BranchId: _branchId,
            ProductId: product.ProductId,
            ReorderPointBase: 25m,
            ReorderQuantityBase: 75m,
            MaxQuantityBase: 150m,
            IsActive: true
        );

        var result = await _service.ConfigureReorderRuleAsync(request);

        Assert.True(result.IsSuccess);
        Assert.Equal(existingRule.ReorderRuleId, result.Value!.TargetEntityId);

        _unitOfWorkMock.Verify(u => u.BeginTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);

        _auditLoggerMock.Verify(a => a.LogAsync(
            "UPDATE", "catalog", "PRODUCT_REORDER_RULE", existingRule.ReorderRuleId,
            It.Is<object>(b => b != null && !typeof(ProductReorderRule).IsAssignableFrom(b.GetType())),
            It.Is<object>(aObj => aObj != null && !typeof(ProductReorderRule).IsAssignableFrom(aObj.GetType())),
            _branchId, AuditActorType.AI_ASSISTED, "prompt-reorder-update-001", It.IsAny<CancellationToken>()), Times.Once);

        _outboxServiceMock.Verify(o => o.EnqueueAsync("catalog.reorderrule.updated", _branchId, It.IsAny<object>(), "1.0", It.IsAny<CancellationToken>()), Times.Once);
    }

    // =========================================================================
    // 2. Snapshot Ordering Proof Tests (Before Snapshot Captured Prior to Mutation)
    // =========================================================================

    [Fact]
    public async Task ConfigureProductAsync_UpdateProduct_AssertsBeforeDataContainsOriginalValuesBeforeMutation()
    {
        var product = CreateSampleProduct("ORIG-SKU", "Original Name", lotTracking: false);
        var stripUom = product.Uoms.First(u => u.UomCode == "STRIP");
        stripUom.UpdateConversionFactor(1m, false);
        _productRepoMock.Setup(p => p.GetByIdWithUomsAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);
        _usageCheckerMock.Setup(u => u.HasAnyStockOrPostedHistoryForProductAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        object? capturedBefore = null;
        object? capturedAfter = null;

        _auditLoggerMock
            .Setup(a => a.LogAsync(
                "UPDATE", "catalog", "PRODUCT", product.ProductId,
                It.IsAny<object>(), It.IsAny<object>(), null,
                AuditActorType.AI_ASSISTED, "prompt-snapshot-order", It.IsAny<CancellationToken>()))
            .Callback<string, string, string, Guid, object?, object?, Guid?, AuditActorType?, string?, CancellationToken>(
                (_, _, _, _, before, after, _, _, _, _) =>
                {
                    capturedBefore = before;
                    capturedAfter = after;
                })
            .Returns(Task.CompletedTask);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-snapshot-order",
            IdempotencyKey: "idem-snap-order",
            Action: CatalogConfigurationAction.UpdateProduct,
            ProductId: product.ProductId,
            BaseUomCode: "STRIP",
            LotTrackingRequired: true,
            Name: "Mutated Name"
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.True(result.IsSuccess);
        Assert.NotNull(capturedBefore);
        Assert.NotNull(capturedAfter);

        // Before snapshot MUST reflect the original un-mutated entity values
        Assert.Equal("BOX", GetPropValue(capturedBefore, "BaseUomCode"));
        Assert.Equal(false, GetPropValue(capturedBefore, "LotTrackingRequired"));
        Assert.Equal("Original Name", GetPropValue(capturedBefore, "Name"));

        // After snapshot MUST reflect the new updated values
        Assert.Equal("STRIP", GetPropValue(capturedAfter, "BaseUomCode"));
        Assert.Equal(true, GetPropValue(capturedAfter, "LotTrackingRequired"));
        Assert.Equal("Mutated Name", GetPropValue(capturedAfter, "Name"));
    }

    [Fact]
    public async Task ConfigureProductAsync_UpdateUom_AssertsBeforeUomContainsOriginalValuesBeforeMutation()
    {
        var product = CreateSampleProduct("PAN-500", "Panadol 500mg");
        var secondaryUom = product.Uoms.First(u => !u.IsBase);
        _productRepoMock.Setup(p => p.GetByIdWithUomsAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);
        _uomRepoMock.Setup(u => u.GetByIdAsync(_orgId, product.ProductId, secondaryUom.ProductUomId, It.IsAny<CancellationToken>())).ReturnsAsync(secondaryUom);
        _usageCheckerMock.Setup(u => u.HasAnyStockOrDocumentReferenceForUomAsync(_orgId, product.ProductId, secondaryUom.ProductUomId, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        object? capturedBefore = null;
        object? capturedAfter = null;

        _auditLoggerMock
            .Setup(a => a.LogAsync(
                "UPDATE", "catalog", "PRODUCT_UOM", secondaryUom.ProductUomId,
                It.IsAny<object>(), It.IsAny<object>(), null,
                AuditActorType.AI_ASSISTED, "prompt-uom-snap", It.IsAny<CancellationToken>()))
            .Callback<string, string, string, Guid, object?, object?, Guid?, AuditActorType?, string?, CancellationToken>(
                (_, _, _, _, before, after, _, _, _, _) =>
                {
                    capturedBefore = before;
                    capturedAfter = after;
                })
            .Returns(Task.CompletedTask);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-uom-snap",
            IdempotencyKey: "idem-uom-snap",
            Action: CatalogConfigurationAction.UpdateUom,
            ProductId: product.ProductId,
            ProductUomId: secondaryUom.ProductUomId,
            ConversionToBase: 0.75m,
            DisplayName: "Mutated Strip Display"
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.True(result.IsSuccess);
        Assert.NotNull(capturedBefore);
        Assert.NotNull(capturedAfter);

        // Before snapshot MUST contain original 0.5m conversion factor and original display name
        Assert.Equal(0.5m, GetPropValue(capturedBefore, "ConversionToBase"));
        Assert.Equal("Strip of 5", GetPropValue(capturedBefore, "DisplayName"));

        // After snapshot MUST contain updated 0.75m conversion factor
        Assert.Equal(0.75m, GetPropValue(capturedAfter, "ConversionToBase"));
        Assert.Equal("Mutated Strip Display", GetPropValue(capturedAfter, "DisplayName"));
    }

    // =========================================================================
    // 3. INonLotBatchInitializer Specification Compliance Tests
    // =========================================================================

    [Fact]
    public async Task ConfigureProductAsync_CreateProduct_CallsInitializer_WhenLotTrackingFalse()
    {
        var categoryId = Guid.NewGuid();
        _categoryRepoMock.Setup(c => c.ExistsAndActiveAsync(_orgId, categoryId, It.IsAny<CancellationToken>())).ReturnsAsync(true);
        _productRepoMock.Setup(p => p.ExistsBySkuAsync(_orgId, "PAN-NONLOT", null, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-init-1", IdempotencyKey: "k-init-1",
            Action: CatalogConfigurationAction.CreateProduct, CategoryId: categoryId,
            Sku: "PAN-NONLOT", Name: "Panadol", BaseUomCode: "BOX", TaxRate: 0.14m,
            LotTrackingRequired: false, ExpiryAlertDays: 30,
            Uoms: new List<CanonicalUomItemDto> { new("BOX", "Box", 1m, 10m, true, true, true) });

        var result = await _service.ConfigureProductAsync(request);

        Assert.True(result.IsSuccess);
        _nonLotBatchInitializerMock.Verify(n => n.EnsureNonLotBatchExistsAsync(_orgId, result.Value!.TargetEntityId, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ConfigureProductAsync_CreateProduct_DoesNotCallInitializer_WhenLotTrackingTrue()
    {
        var categoryId = Guid.NewGuid();
        _categoryRepoMock.Setup(c => c.ExistsAndActiveAsync(_orgId, categoryId, It.IsAny<CancellationToken>())).ReturnsAsync(true);
        _productRepoMock.Setup(p => p.ExistsBySkuAsync(_orgId, "INS-LOT", null, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-init-2", IdempotencyKey: "k-init-2",
            Action: CatalogConfigurationAction.CreateProduct, CategoryId: categoryId,
            Sku: "INS-LOT", Name: "Insulin", BaseUomCode: "VIAL", TaxRate: 0.14m,
            LotTrackingRequired: true, ExpiryAlertDays: 90,
            Uoms: new List<CanonicalUomItemDto> { new("VIAL", "Vial", 1m, 100m, true, true, true) });

        var result = await _service.ConfigureProductAsync(request);

        Assert.True(result.IsSuccess);
        _nonLotBatchInitializerMock.Verify(n => n.EnsureNonLotBatchExistsAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ConfigureProductAsync_UpdateProduct_NeverCallsInitializer_EvenWhenChangingPolicy()
    {
        var product = CreateSampleProduct("PAN-500", "Panadol 500mg", lotTracking: true);
        _productRepoMock.Setup(p => p.GetByIdWithUomsAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);
        _usageCheckerMock.Setup(u => u.HasAnyStockOrPostedHistoryForProductAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-update-policy", IdempotencyKey: "k-update-pol",
            Action: CatalogConfigurationAction.UpdateProduct, ProductId: product.ProductId,
            LotTrackingRequired: false // Switching to false on update
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.True(result.IsSuccess);
        // Spec lines 493 and 511 mandate initializer is called ONLY on create
        _nonLotBatchInitializerMock.Verify(n => n.EnsureNonLotBatchExistsAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // =========================================================================
    // 4. No Silent Defaults on Create Fields Tests
    // =========================================================================

    [Fact]
    public async Task ConfigureProductAsync_CreateProduct_RejectsMissingLotTrackingRequired_WithoutCallingInitializer()
    {
        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-missing-lot", IdempotencyKey: "k-no-lot",
            Action: CatalogConfigurationAction.CreateProduct, CategoryId: Guid.NewGuid(),
            Sku: "SKU-NOLOT", Name: "Name", BaseUomCode: "BOX", TaxRate: 0.14m,
            LotTrackingRequired: null, // Omitted required field
            ExpiryAlertDays: 30,
            Uoms: new List<CanonicalUomItemDto> { new("BOX", "Box", 1m, 10m, true, true, true) });

        var result = await _service.ConfigureProductAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.VALIDATION_ERROR, result.ErrorCode);
        Assert.Contains(result.ErrorDetails!, d => d.Field == "LotTrackingRequired");

        _unitOfWorkMock.Verify(u => u.BeginTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
        _nonLotBatchInitializerMock.Verify(n => n.EnsureNonLotBatchExistsAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ConfigureProductAsync_CreateProduct_RejectsMissingTaxRateOrExpiryAlertDays()
    {
        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-missing-fields", IdempotencyKey: "k-miss",
            Action: CatalogConfigurationAction.CreateProduct, CategoryId: Guid.NewGuid(),
            Sku: "SKU-MISS", Name: "Name", BaseUomCode: "BOX",
            TaxRate: null, // Missing TaxRate
            LotTrackingRequired: false,
            ExpiryAlertDays: null, // Missing ExpiryAlertDays
            Uoms: new List<CanonicalUomItemDto> { new("BOX", "Box", 1m, 10m, true, true, true) });

        var result = await _service.ConfigureProductAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Contains(result.ErrorDetails!, d => d.Field == "TaxRate");
        Assert.Contains(result.ErrorDetails!, d => d.Field == "ExpiryAlertDays");
    }

    // =========================================================================
    // 5. Genuinely URL-Safe Base64Url Keyset Cursor Tests
    // =========================================================================

    [Fact]
    public async Task GetCanonicalProductsFeedAsync_ReturnsGenuinelyUrlSafeBase64UrlCursor()
    {
        var p1 = CreateSampleProduct("P1", "Product 1");
        var p2 = CreateSampleProduct("P2", "Product 2");

        _productRepoMock
            .Setup(r => r.GetCanonicalFeedKeysetPageAsync(_orgId, null, null, null, 2, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Product> { p1, p2 }, true));

        var result = await _service.GetCanonicalProductsFeedAsync(null, null, 2);

        Assert.True(result.IsSuccess);
        var cursor = result.Value!.NextCursor;
        Assert.NotNull(cursor);

        // Base64Url MUST NOT contain standard Base64 characters '+', '/', or '='
        Assert.DoesNotContain("+", cursor);
        Assert.DoesNotContain("/", cursor);
        Assert.DoesNotContain("=", cursor);

        // Base64Url MUST survive Uri.EscapeDataString completely unchanged
        Assert.Equal(cursor, Uri.EscapeDataString(cursor));
    }

    [Fact]
    public async Task GetCanonicalProductsFeedAsync_RejectsPaddedOrStandardBase64Cursor_WithValidationError()
    {
        // 1. Standard Base64 containing '='
        var standardPadded = Convert.ToBase64String(Encoding.UTF8.GetBytes("638976456000000000:00000000-0000-0000-0000-000000000001"));
        var res1 = await _service.GetCanonicalProductsFeedAsync(null, standardPadded);
        Assert.False(res1.IsSuccess);
        Assert.Equal(ErrorCode.VALIDATION_ERROR, res1.ErrorCode);

        // 2. Standard Base64 containing '+'
        var withPlus = "abc+def";
        var res2 = await _service.GetCanonicalProductsFeedAsync(null, withPlus);
        Assert.False(res2.IsSuccess);
        Assert.Equal(ErrorCode.VALIDATION_ERROR, res2.ErrorCode);

        // 3. Standard Base64 containing '/'
        var withSlash = "abc/def";
        var res3 = await _service.GetCanonicalProductsFeedAsync(null, withSlash);
        Assert.False(res3.IsSuccess);
        Assert.Equal(ErrorCode.VALIDATION_ERROR, res3.ErrorCode);
    }

    [Fact]
    public async Task GetCanonicalProductsFeedAsync_Base64UrlCursor_RoundTripsCorrectly()
    {
        var time = new DateTimeOffset(2026, 11, 1, 15, 30, 45, 123, TimeSpan.Zero);
        var id = Guid.NewGuid();
        var cursor = EncodeCursorBase64Url(time, id);

        _productRepoMock
            .Setup(r => r.GetCanonicalFeedKeysetPageAsync(_orgId, null, time, id, 50, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Product>(), false));

        var result = await _service.GetCanonicalProductsFeedAsync(null, cursor, 50);

        Assert.True(result.IsSuccess);
        _productRepoMock.Verify(r => r.GetCanonicalFeedKeysetPageAsync(_orgId, null, time, id, 50, It.IsAny<CancellationToken>()), Times.Once);
    }

    // =========================================================================
    // 6. DomainException Subclass Error Mapping Tests
    // =========================================================================

    [Fact]
    public async Task ConfigureProductAsync_UpdateProduct_MapsHistoricalUomModificationExceptionToConflict()
    {
        var product = CreateSampleProduct("PAN-500", "Panadol 500mg");
        _productRepoMock.Setup(p => p.GetByIdWithUomsAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);
        _usageCheckerMock.Setup(u => u.HasAnyStockOrPostedHistoryForProductAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-hist-err", IdempotencyKey: "k-hist",
            Action: CatalogConfigurationAction.UpdateProduct, ProductId: product.ProductId,
            BaseUomCode: "STRIP"
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.CONFLICT, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ConfigureProductAsync_DeactivateUom_MapsCannotDeactivateBaseUomToConflict()
    {
        var product = CreateSampleProduct("PAN-500", "Panadol 500mg");
        var baseUom = product.Uoms.First(u => u.IsBase);
        _productRepoMock.Setup(p => p.GetByIdWithUomsAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);
        _uomRepoMock.Setup(u => u.GetByIdAsync(_orgId, product.ProductId, baseUom.ProductUomId, It.IsAny<CancellationToken>())).ReturnsAsync(baseUom);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-deact-base", IdempotencyKey: "k-deact-base",
            Action: CatalogConfigurationAction.DeactivateUom, ProductId: product.ProductId,
            ProductUomId: baseUom.ProductUomId
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.CONFLICT, result.ErrorCode);
        Assert.Equal(ErrorMessages.CannotDeactivateBaseUom, result.ErrorMessage);
    }

    // =========================================================================
    // 7. Reorder Rules: Forbidden Branch & Product Not Found (Mirroring ReorderRuleService)
    // =========================================================================

    [Fact]
    public async Task ConfigureReorderRuleAsync_ForbiddenBranch_ReturnsForbiddenBranchBeforeTransaction()
    {
        _currentUserMock.Setup(u => u.CanAccessBranch(_branchId)).Returns(false);

        var request = new CanonicalReorderRuleConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-forbid-br", IdempotencyKey: "k-forbid-br",
            BranchId: _branchId, ProductId: Guid.NewGuid(),
            ReorderPointBase: 10m, ReorderQuantityBase: 50m, MaxQuantityBase: 100m
        );

        var result = await _service.ConfigureReorderRuleAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.FORBIDDEN_BRANCH, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.BeginTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ConfigureReorderRuleAsync_BranchNotFound_ReturnsNotFoundAndRollback()
    {
        var missingBranchId = Guid.NewGuid();
        var prodId = Guid.NewGuid();
        _branchRepoMock.Setup(b => b.GetByIdAsync(_orgId, missingBranchId, It.IsAny<CancellationToken>())).ReturnsAsync((Branch?)null);

        var request = new CanonicalReorderRuleConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-branch-not-found", IdempotencyKey: "k-branch-nf",
            BranchId: missingBranchId, ProductId: prodId,
            ReorderPointBase: 10m, ReorderQuantityBase: 50m, MaxQuantityBase: 100m
        );

        var result = await _service.ConfigureReorderRuleAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.NOT_FOUND, result.ErrorCode);
        Assert.Equal(ErrorMessages.NotFound, result.ErrorMessage);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
        _unitOfWorkMock.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
        _auditLoggerMock.Verify(a => a.LogAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<object?>(), It.IsAny<object?>(), It.IsAny<Guid?>(), It.IsAny<AuditActorType?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Never);
        _outboxServiceMock.Verify(o => o.EnqueueAsync(It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<object>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _reorderRuleRepoMock.Verify(r => r.AddAsync(It.IsAny<ProductReorderRule>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ConfigureReorderRuleAsync_ProductNotFound_ReturnsNotFoundAndRollback()
    {
        var missingProdId = Guid.NewGuid();
        _productRepoMock.Setup(p => p.GetByIdAsync(_orgId, missingProdId, It.IsAny<CancellationToken>())).ReturnsAsync((Product?)null);

        var request = new CanonicalReorderRuleConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-prod-not-found", IdempotencyKey: "k-prod-nf",
            BranchId: _branchId, ProductId: missingProdId,
            ReorderPointBase: 10m, ReorderQuantityBase: 50m, MaxQuantityBase: 100m
        );

        var result = await _service.ConfigureReorderRuleAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.NOT_FOUND, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    // =========================================================================
    // 8. Security, Roles, Runtime Mode & Reflection Invariants
    // =========================================================================

    [Fact]
    public async Task CanonicalService_RejectsCashier_ForBothReadAndWrite()
    {
        _currentUserMock.Setup(u => u.Role).Returns("Cashier");

        // 1. Read
        var readResult = await _service.GetCanonicalProductsFeedAsync(null, null);
        Assert.False(readResult.IsSuccess);
        Assert.Equal(ErrorCode.FORBIDDEN, readResult.ErrorCode);

        // 2. Write
        var writeRequest = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-cashier", IdempotencyKey: "k-cashier",
            Action: CatalogConfigurationAction.UpdateProduct, ProductId: Guid.NewGuid(), Name: "Name"
        );
        var writeResult = await _service.ConfigureProductAsync(writeRequest);
        Assert.False(writeResult.IsSuccess);
        Assert.Equal(ErrorCode.FORBIDDEN, writeResult.ErrorCode);
    }

    [Theory]
    [InlineData("Viewer")]
    [InlineData("Auditor")]
    [InlineData("Unknown")]
    public async Task CanonicalService_RejectsArbitraryRoles_ForReadAndWrite(string role)
    {
        _currentUserMock.Setup(u => u.Role).Returns(role);

        var readResult = await _service.GetCanonicalProductsFeedAsync(null, null);
        Assert.False(readResult.IsSuccess);
        Assert.Equal(ErrorCode.FORBIDDEN, readResult.ErrorCode);

        var writeRequest = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-role", IdempotencyKey: "k-role",
            Action: CatalogConfigurationAction.UpdateProduct, ProductId: Guid.NewGuid(), Name: "Name"
        );
        var writeResult = await _service.ConfigureProductAsync(writeRequest);
        Assert.False(writeResult.IsSuccess);
        Assert.Equal(ErrorCode.FORBIDDEN, writeResult.ErrorCode);
    }

    [Theory]
    [InlineData(ErpRuntimeMode.BranchLocal)]
    [InlineData((ErpRuntimeMode)999)]
    public async Task CanonicalService_RejectsNonCloudRuntimeMode_ForWrites(ErpRuntimeMode mode)
    {
        _runtimeModeMock.Setup(r => r.CurrentMode).Returns(mode);

        var productRequest = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-mode", IdempotencyKey: "k-mode",
            Action: CatalogConfigurationAction.UpdateProduct, ProductId: Guid.NewGuid(), Name: "Name"
        );
        var resProduct = await _service.ConfigureProductAsync(productRequest);
        Assert.False(resProduct.IsSuccess);
        Assert.Equal(ErrorCode.FORBIDDEN, resProduct.ErrorCode);

        var reorderRequest = new CanonicalReorderRuleConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-mode-rule", IdempotencyKey: "k-mode-rule",
            BranchId: _branchId, ProductId: Guid.NewGuid(),
            ReorderPointBase: 10m, ReorderQuantityBase: 20m, MaxQuantityBase: 50m
        );
        var resRule = await _service.ConfigureReorderRuleAsync(reorderRequest);
        Assert.False(resRule.IsSuccess);
        Assert.Equal(ErrorCode.FORBIDDEN, resRule.ErrorCode);
    }

    [Fact]
    public void CanonicalConfigurationRequests_HaveNoActorFields_ViaReflection()
    {
        var productProps = typeof(CanonicalProductConfigurationRequest).GetProperties(BindingFlags.Public | BindingFlags.Instance);
        Assert.DoesNotContain(productProps, p => p.Name.Contains("Actor", StringComparison.OrdinalIgnoreCase) || p.Name.Contains("User", StringComparison.OrdinalIgnoreCase));

        var reorderProps = typeof(CanonicalReorderRuleConfigurationRequest).GetProperties(BindingFlags.Public | BindingFlags.Instance);
        Assert.DoesNotContain(reorderProps, p => p.Name.Contains("Actor", StringComparison.OrdinalIgnoreCase) || p.Name.Contains("User", StringComparison.OrdinalIgnoreCase));
    }

    // =========================================================================
    // 9. SourcePromptId Strict Validation Defect Fix Tests
    // =========================================================================

    [Fact]
    public async Task ConfigureProductAsync_SourcePromptId_RejectsNullEmptyAndWhitespace()
    {
        var reqNull = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: null!, IdempotencyKey: "k1",
            Action: CatalogConfigurationAction.UpdateProduct, ProductId: Guid.NewGuid(), Name: "N");
        var resNull = await _service.ConfigureProductAsync(reqNull);
        Assert.False(resNull.IsSuccess);
        Assert.Contains(resNull.ErrorDetails!, d => d.Field == "SourcePromptId");

        var reqEmpty = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "", IdempotencyKey: "k2",
            Action: CatalogConfigurationAction.UpdateProduct, ProductId: Guid.NewGuid(), Name: "N");
        var resEmpty = await _service.ConfigureProductAsync(reqEmpty);
        Assert.False(resEmpty.IsSuccess);
        Assert.Contains(resEmpty.ErrorDetails!, d => d.Field == "SourcePromptId");

        var reqWs = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "    ", IdempotencyKey: "k3",
            Action: CatalogConfigurationAction.UpdateProduct, ProductId: Guid.NewGuid(), Name: "N");
        var resWs = await _service.ConfigureProductAsync(reqWs);
        Assert.False(resWs.IsSuccess);
        Assert.Contains(resWs.ErrorDetails!, d => d.Field == "SourcePromptId");
    }

    [Fact]
    public async Task ConfigureProductAsync_SourcePromptId_BoundaryTests()
    {
        var product = CreateSampleProduct("EXACT-100", "Exact 100 Product");
        _productRepoMock.Setup(p => p.GetByIdWithUomsAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);

        var req100 = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: new string('p', 100), IdempotencyKey: "k-100",
            Action: CatalogConfigurationAction.UpdateProduct, ProductId: product.ProductId, Name: "N");
        var res100 = await _service.ConfigureProductAsync(req100);
        Assert.True(res100.IsSuccess);

        var req101 = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: new string('p', 101), IdempotencyKey: "k-101",
            Action: CatalogConfigurationAction.UpdateProduct, ProductId: product.ProductId, Name: "N");
        var res101 = await _service.ConfigureProductAsync(req101);
        Assert.False(res101.IsSuccess);
        Assert.Contains(res101.ErrorDetails!, d => d.Field == "SourcePromptId");

        var req100PlusSpace = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: new string('p', 100) + " ", IdempotencyKey: "k-100-sp",
            Action: CatalogConfigurationAction.UpdateProduct, ProductId: product.ProductId, Name: "N");
        var res100PlusSpace = await _service.ConfigureProductAsync(req100PlusSpace);
        Assert.False(res100PlusSpace.IsSuccess);
        Assert.Contains(res100PlusSpace.ErrorDetails!, d => d.Field == "SourcePromptId");
    }

    // =========================================================================
    // 10. Validation Parity Boundary Tests
    // =========================================================================

    [Theory]
    [InlineData(40, true)]
    [InlineData(41, false)]
    public async Task ConfigureProductAsync_SkuLengthBoundary(int length, bool shouldPass)
    {
        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-sku", IdempotencyKey: "k-sku",
            Action: CatalogConfigurationAction.CreateProduct, CategoryId: Guid.NewGuid(),
            Sku: new string('S', length), Name: "Valid", BaseUomCode: "BOX", TaxRate: 0.14m,
            LotTrackingRequired: false, ExpiryAlertDays: 30,
            Uoms: new List<CanonicalUomItemDto> { new("BOX", "Box", 1m, 10m, true, true, true) });

        _categoryRepoMock.Setup(c => c.ExistsAndActiveAsync(_orgId, It.IsAny<Guid>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        var result = await _service.ConfigureProductAsync(request);
        Assert.Equal(shouldPass, result.IsSuccess);
    }

    [Theory]
    [InlineData(180, true)]
    [InlineData(181, false)]
    public async Task ConfigureProductAsync_NameLengthBoundary(int length, bool shouldPass)
    {
        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-name", IdempotencyKey: "k-name",
            Action: CatalogConfigurationAction.CreateProduct, CategoryId: Guid.NewGuid(),
            Sku: "SKU-OK", Name: new string('N', length), BaseUomCode: "BOX", TaxRate: 0.14m,
            LotTrackingRequired: false, ExpiryAlertDays: 30,
            Uoms: new List<CanonicalUomItemDto> { new("BOX", "Box", 1m, 10m, true, true, true) });

        _categoryRepoMock.Setup(c => c.ExistsAndActiveAsync(_orgId, It.IsAny<Guid>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        var result = await _service.ConfigureProductAsync(request);
        Assert.Equal(shouldPass, result.IsSuccess);
    }

    [Theory]
    [InlineData(80, true)]
    [InlineData(81, false)]
    public async Task ConfigureProductAsync_BarcodeLengthBoundary(int length, bool shouldPass)
    {
        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-bar", IdempotencyKey: "k-bar",
            Action: CatalogConfigurationAction.CreateProduct, CategoryId: Guid.NewGuid(),
            Sku: "SKU-OK", Barcode: new string('B', length), Name: "Name", BaseUomCode: "BOX", TaxRate: 0.14m,
            LotTrackingRequired: false, ExpiryAlertDays: 30,
            Uoms: new List<CanonicalUomItemDto> { new("BOX", "Box", 1m, 10m, true, true, true) });

        _categoryRepoMock.Setup(c => c.ExistsAndActiveAsync(_orgId, It.IsAny<Guid>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        var result = await _service.ConfigureProductAsync(request);
        Assert.Equal(shouldPass, result.IsSuccess);
    }

    [Theory]
    [InlineData(20, true)]
    [InlineData(21, false)]
    public async Task ConfigureProductAsync_BaseUomCodeLengthBoundary(int length, bool shouldPass)
    {
        var code = new string('U', length);
        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-uom-len", IdempotencyKey: "k-uom-len",
            Action: CatalogConfigurationAction.CreateProduct, CategoryId: Guid.NewGuid(),
            Sku: "SKU-OK", Name: "Name", BaseUomCode: code, TaxRate: 0.14m,
            LotTrackingRequired: false, ExpiryAlertDays: 30,
            Uoms: new List<CanonicalUomItemDto> { new(code, "Display", 1m, 10m, true, true, true) });

        _categoryRepoMock.Setup(c => c.ExistsAndActiveAsync(_orgId, It.IsAny<Guid>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        var result = await _service.ConfigureProductAsync(request);
        Assert.Equal(shouldPass, result.IsSuccess);
    }

    [Theory]
    [InlineData(50, true)]
    [InlineData(51, false)]
    public async Task ConfigureProductAsync_UomDisplayNameLengthBoundary(int length, bool shouldPass)
    {
        var product = CreateSampleProduct();
        _productRepoMock.Setup(p => p.GetByIdWithUomsAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-disp", IdempotencyKey: "k-disp",
            Action: CatalogConfigurationAction.AddUom, ProductId: product.ProductId,
            UomCode: "CTN", DisplayName: new string('D', length), ConversionToBase: 10m);

        var result = await _service.ConfigureProductAsync(request);
        Assert.Equal(shouldPass, result.IsSuccess);
    }

    [Theory]
    [InlineData(0.0, true)]
    [InlineData(1.0, true)]
    [InlineData(-0.01, false)]
    [InlineData(1.01, false)]
    public async Task ConfigureProductAsync_TaxRateBoundary(decimal taxRate, bool shouldPass)
    {
        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "prompt-tax", IdempotencyKey: "k-tax",
            Action: CatalogConfigurationAction.CreateProduct, CategoryId: Guid.NewGuid(),
            Sku: "SKU-TAX", Name: "Name", BaseUomCode: "BOX", TaxRate: taxRate,
            LotTrackingRequired: false, ExpiryAlertDays: 30,
            Uoms: new List<CanonicalUomItemDto> { new("BOX", "Box", 1m, 10m, true, true, true) });

        _categoryRepoMock.Setup(c => c.ExistsAndActiveAsync(_orgId, It.IsAny<Guid>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        var result = await _service.ConfigureProductAsync(request);
        Assert.Equal(shouldPass, result.IsSuccess);
    }

    [Fact]
    public async Task ConfigureProductAsync_RejectsInvalidUomCollections()
    {
        var categoryId = Guid.NewGuid();
        _categoryRepoMock.Setup(c => c.ExistsAndActiveAsync(_orgId, categoryId, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        // 1. Empty Uoms list
        var reqEmptyUoms = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "p1", IdempotencyKey: "k1",
            Action: CatalogConfigurationAction.CreateProduct, CategoryId: categoryId,
            Sku: "SKU-1", Name: "N1", BaseUomCode: "BOX", TaxRate: 0.14m,
            LotTrackingRequired: false, ExpiryAlertDays: 30,
            Uoms: new List<CanonicalUomItemDto>());
        var res1 = await _service.ConfigureProductAsync(reqEmptyUoms);
        Assert.False(res1.IsSuccess);

        // 2. Duplicate UOM codes
        var reqDupUoms = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "p2", IdempotencyKey: "k2",
            Action: CatalogConfigurationAction.CreateProduct, CategoryId: categoryId,
            Sku: "SKU-2", Name: "N2", BaseUomCode: "BOX", TaxRate: 0.14m,
            LotTrackingRequired: false, ExpiryAlertDays: 30,
            Uoms: new List<CanonicalUomItemDto>
            {
                new("BOX", "Box 1", 1m, 10m, true, true, true),
                new("BOX", "Box 2", 1m, 10m, false, true, true)
            });
        var res2 = await _service.ConfigureProductAsync(reqDupUoms);
        Assert.False(res2.IsSuccess);

        // 3. Zero Base UOMs
        var reqNoBase = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "p3", IdempotencyKey: "k3",
            Action: CatalogConfigurationAction.CreateProduct, CategoryId: categoryId,
            Sku: "SKU-3", Name: "N3", BaseUomCode: "BOX", TaxRate: 0.14m,
            LotTrackingRequired: false, ExpiryAlertDays: 30,
            Uoms: new List<CanonicalUomItemDto>
            {
                new("BOX", "Box", 1m, 10m, false, true, true)
            });
        var res3 = await _service.ConfigureProductAsync(reqNoBase);
        Assert.False(res3.IsSuccess);

        // 4. Base UOM Code Mismatch
        var reqMismatch = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(), SourcePromptId: "p4", IdempotencyKey: "k4",
            Action: CatalogConfigurationAction.CreateProduct, CategoryId: categoryId,
            Sku: "SKU-4", Name: "N4", BaseUomCode: "BOX", TaxRate: 0.14m,
            LotTrackingRequired: false, ExpiryAlertDays: 30,
            Uoms: new List<CanonicalUomItemDto>
            {
                new("TAB", "Tablet", 1m, 10m, true, true, true)
            });
        var res4 = await _service.ConfigureProductAsync(reqMismatch);
        Assert.False(res4.IsSuccess);
    }

    // =========================================================================
    // 11. Feed Keyset Paging & Clamping Tests
    // =========================================================================

    [Fact]
    public async Task GetCanonicalProductsFeedAsync_MapsAllFieldsCorrectly_IncludingConstantsAndUoms()
    {
        var product = CreateSampleProduct("PAN-500", "Panadol 500mg", lotTracking: true);
        var uomList = product.Uoms.ToList();
        uomList[1].Deactivate();

        _productRepoMock
            .Setup(r => r.GetCanonicalFeedKeysetPageAsync(_orgId, null, null, null, 50, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Product> { product }, false));

        var result = await _service.GetCanonicalProductsFeedAsync(null, null, 50);

        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Single(result.Value.Items);

        var dto = result.Value.Items[0];
        Assert.Equal("canonical.Product", dto.Schema);
        Assert.Equal("1.0", dto.Version);
        Assert.Equal(_orgId, dto.OrganizationId);
        Assert.Equal(product.ProductId, dto.Id);
        Assert.Equal("PAN-500", dto.Sku);
        Assert.Equal("1234567890123", dto.Barcode);
        Assert.Equal("Panadol 500mg", dto.Name);
        Assert.Equal(product.CategoryId, dto.CategoryId);
        Assert.Equal("BOX", dto.BaseUomCode);
        Assert.Equal(0.14m, dto.TaxRate);
        Assert.True(dto.LotTrackingRequired);
        Assert.True(dto.IsActive);
        Assert.Equal(2, dto.SupportedConversions.Count);

        var baseUom = dto.SupportedConversions.Single(u => u.IsBase);
        Assert.Equal("BOX", baseUom.UomCode);
        Assert.Equal(1m, baseUom.ConversionToBase);
        Assert.Equal(25.50m, baseUom.SaleUnitPrice);
        Assert.True(baseUom.IsActive);

        var secondaryUom = dto.SupportedConversions.Single(u => !u.IsBase);
        Assert.Equal("STRIP", secondaryUom.UomCode);
        Assert.Equal(0.5m, secondaryUom.ConversionToBase);
        Assert.False(secondaryUom.IsActive);
    }

    [Fact]
    public async Task GetCanonicalProductsFeedAsync_ReturnsNullNextCursor_WhenHasNextPageIsFalse()
    {
        var p1 = CreateSampleProduct("P1", "Product 1");

        _productRepoMock
            .Setup(r => r.GetCanonicalFeedKeysetPageAsync(_orgId, null, null, null, 50, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Product> { p1 }, false));

        var result = await _service.GetCanonicalProductsFeedAsync(null, null, 50);

        Assert.True(result.IsSuccess);
        Assert.Null(result.Value!.NextCursor);
    }

    [Theory]
    [InlineData(0, 50)]
    [InlineData(-10, 50)]
    [InlineData(2000, 1000)]
    public async Task GetCanonicalProductsFeedAsync_ClampsLimitCorrectly(int inputLimit, int expectedResolvedLimit)
    {
        _productRepoMock
            .Setup(r => r.GetCanonicalFeedKeysetPageAsync(_orgId, null, null, null, expectedResolvedLimit, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Product>(), false));

        var result = await _service.GetCanonicalProductsFeedAsync(null, null, inputLimit);

        Assert.True(result.IsSuccess);
        _productRepoMock.Verify(r => r.GetCanonicalFeedKeysetPageAsync(
            _orgId, null, null, null, expectedResolvedLimit, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GetCanonicalProductsFeedAsync_PassesBothUpdatedSinceAndCursor()
    {
        var since = DateTimeOffset.UtcNow.AddDays(-3);
        var cursorTime = DateTimeOffset.UtcNow.AddDays(-1);
        var cursorId = Guid.NewGuid();
        var cursor = EncodeCursorBase64Url(cursorTime, cursorId);

        _productRepoMock
            .Setup(r => r.GetCanonicalFeedKeysetPageAsync(_orgId, since, cursorTime, cursorId, 50, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Product>(), false));

        var result = await _service.GetCanonicalProductsFeedAsync(since, cursor, 50);

        Assert.True(result.IsSuccess);
        _productRepoMock.Verify(r => r.GetCanonicalFeedKeysetPageAsync(_orgId, since, cursorTime, cursorId, 50, It.IsAny<CancellationToken>()), Times.Once);
    }

    // =========================================================================
    // 12. Fail-Safe Checker Unchanged Values Optimization Test
    // =========================================================================

    [Fact]
    public async Task ConfigureProductAsync_UnchangedPolicyOrBaseUom_DoesNotCallUsageChecker()
    {
        var product = CreateSampleProduct("PAN-500", "Panadol 500mg", lotTracking: false);
        _productRepoMock.Setup(p => p.GetByIdWithUomsAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-noop",
            IdempotencyKey: "idem-noop",
            Action: CatalogConfigurationAction.UpdateProduct,
            ProductId: product.ProductId,
            BaseUomCode: "BOX",
            LotTrackingRequired: false
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.True(result.IsSuccess);
        _usageCheckerMock.Verify(u => u.HasAnyStockOrPostedHistoryForProductAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // =========================================================================
    // 13. End-to-End Dependency Injection Service Provider Resolution Test
    // =========================================================================

    [Fact]
    public void ServiceProvider_ResolvesExpectedImplementations_InProgramCsOrder()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = "Host=localhost;Database=test;Username=postgres;Password=postgres"
        }).Build();

        services.AddSingleton<IConfiguration>(configuration);

        services.AddApplicationServices();
        services.AddInfrastructureServices(configuration);

        var provider = services.BuildServiceProvider();

        var canonicalService = provider.GetService<ICanonicalCatalogService>();
        Assert.NotNull(canonicalService);
        Assert.IsType<CanonicalCatalogService>(canonicalService);

        var batchInit = provider.GetService<INonLotBatchInitializer>();
        Assert.NotNull(batchInit);
        Assert.IsType<TemporaryNonLotBatchInitializer>(batchInit);

        var usageChecker = provider.GetService<IProductInventoryUsageChecker>();
        Assert.NotNull(usageChecker);
        Assert.IsType<TemporaryProductInventoryUsageChecker>(usageChecker);
    }

    // =========================================================================
    // 11. Restored Baseline Tests (Rollback & Pre-Transaction Validation)
    // =========================================================================

    [Fact]
    public async Task ConfigureProductAsync_RollsBack_WhenCategoryNotFound()
    {
        var categoryId = Guid.NewGuid();
        _categoryRepoMock.Setup(c => c.ExistsAndActiveAsync(_orgId, categoryId, It.IsAny<CancellationToken>())).ReturnsAsync(false);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-cat-nf",
            IdempotencyKey: "k-cat-nf",
            Action: CatalogConfigurationAction.CreateProduct,
            CategoryId: categoryId,
            Sku: "SKU-CAT-NF",
            Name: "Test Product",
            BaseUomCode: "BOX",
            TaxRate: 0.14m,
            ExpiryAlertDays: 30,
            LotTrackingRequired: true,
            Uoms: new List<CanonicalUomItemDto> { new("BOX", "Box", 1m, 10m, true, true, true) }
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.NOT_FOUND, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ConfigureProductAsync_RollsBack_WhenDuplicateSku()
    {
        var categoryId = Guid.NewGuid();
        _categoryRepoMock.Setup(c => c.ExistsAndActiveAsync(_orgId, categoryId, It.IsAny<CancellationToken>())).ReturnsAsync(true);
        _productRepoMock.Setup(p => p.ExistsBySkuAsync(_orgId, "DUP-SKU", null, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-dup-sku",
            IdempotencyKey: "k-dup-sku",
            Action: CatalogConfigurationAction.CreateProduct,
            CategoryId: categoryId,
            Sku: "DUP-SKU",
            Name: "Test Product",
            BaseUomCode: "BOX",
            TaxRate: 0.14m,
            ExpiryAlertDays: 30,
            LotTrackingRequired: true,
            Uoms: new List<CanonicalUomItemDto> { new("BOX", "Box", 1m, 10m, true, true, true) }
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.CONFLICT, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ConfigureProductAsync_RollsBack_WhenDuplicateBarcode()
    {
        var categoryId = Guid.NewGuid();
        _categoryRepoMock.Setup(c => c.ExistsAndActiveAsync(_orgId, categoryId, It.IsAny<CancellationToken>())).ReturnsAsync(true);
        _productRepoMock.Setup(p => p.ExistsBySkuAsync(_orgId, "BAR-SKU", null, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _productRepoMock.Setup(p => p.ExistsByBarcodeAsync(_orgId, "BAR-123", null, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-dup-bar",
            IdempotencyKey: "k-dup-bar",
            Action: CatalogConfigurationAction.CreateProduct,
            CategoryId: categoryId,
            Sku: "BAR-SKU",
            Barcode: "BAR-123",
            Name: "Test Product",
            BaseUomCode: "BOX",
            TaxRate: 0.14m,
            ExpiryAlertDays: 30,
            LotTrackingRequired: true,
            Uoms: new List<CanonicalUomItemDto> { new("BOX", "Box", 1m, 10m, true, true, true) }
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.CONFLICT, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ConfigureProductAsync_RollsBack_WhenDuplicateUomCodeOnAdd()
    {
        var product = CreateSampleProduct("PAN-500", "Panadol 500mg");
        _productRepoMock.Setup(p => p.GetByIdWithUomsAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);
        _uomRepoMock.Setup(u => u.ExistsByUomCodeAsync(_orgId, product.ProductId, "BOX", null, It.IsAny<CancellationToken>())).ReturnsAsync(true);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-dup-uom",
            IdempotencyKey: "k-dup-uom",
            Action: CatalogConfigurationAction.AddUom,
            ProductId: product.ProductId,
            UomCode: "BOX",
            DisplayName: "Duplicate Box",
            ConversionToBase: 1m
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.CONFLICT, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ConfigureProductAsync_RollsBack_WhenProductNotFoundOnUpdate()
    {
        var missingId = Guid.NewGuid();
        _productRepoMock.Setup(p => p.GetByIdWithUomsAsync(_orgId, missingId, It.IsAny<CancellationToken>())).ReturnsAsync((Product?)null);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-p-nf",
            IdempotencyKey: "k-p-nf",
            Action: CatalogConfigurationAction.UpdateProduct,
            ProductId: missingId,
            Name: "New Name"
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.NOT_FOUND, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ConfigureProductAsync_RollsBack_WhenProductUomNotFoundOnUpdate()
    {
        var product = CreateSampleProduct("PAN-500", "Panadol 500mg");
        var missingUomId = Guid.NewGuid();
        _productRepoMock.Setup(p => p.GetByIdWithUomsAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);
        _uomRepoMock.Setup(u => u.GetByIdAsync(_orgId, product.ProductId, missingUomId, It.IsAny<CancellationToken>())).ReturnsAsync((ProductUom?)null);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-uom-nf",
            IdempotencyKey: "k-uom-nf",
            Action: CatalogConfigurationAction.UpdateUom,
            ProductId: product.ProductId,
            ProductUomId: missingUomId,
            DisplayName: "New Display Name"
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.NOT_FOUND, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ConfigureProductAsync_RollsBackAndRethrows_OnUnexpectedException()
    {
        var categoryId = Guid.NewGuid();
        _categoryRepoMock.Setup(c => c.ExistsAndActiveAsync(_orgId, categoryId, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("Fatal database failure"));

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-unexpected",
            IdempotencyKey: "k-unexpected",
            Action: CatalogConfigurationAction.CreateProduct,
            CategoryId: categoryId,
            Sku: "ERR-SKU",
            Name: "Error Product",
            BaseUomCode: "BOX",
            TaxRate: 0.14m,
            ExpiryAlertDays: 30,
            LotTrackingRequired: true,
            Uoms: new List<CanonicalUomItemDto> { new("BOX", "Box", 1m, 10m, true, true, true) }
        );

        await Assert.ThrowsAsync<InvalidOperationException>(() => _service.ConfigureProductAsync(request));

        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ConfigureProductAsync_ValidationFailure_OccursBeforeTransactionStart()
    {
        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.Empty, // Invalid RequestId triggers validation failure
            SourcePromptId: "prompt-val-fail",
            IdempotencyKey: "k-val-fail",
            Action: CatalogConfigurationAction.CreateProduct
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.VALIDATION_ERROR, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.BeginTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    // =========================================================================
    // 12. Idempotency Replay and Mismatch Tests
    // =========================================================================

    [Fact]
    public async Task ConfigureProductAsync_IdempotentReplay_ReturnsStoredResponseWithoutReExecution()
    {
        var cachedResult = new CanonicalWriteResultDto(Guid.NewGuid(), CanonicalWriteStatuses.Applied, Guid.NewGuid(), "PRODUCT", _fixedTime);
        _idempotencyServiceMock
            .Setup(i => i.CheckAsync<CanonicalProductConfigurationRequest, CanonicalWriteResultDto>(
                "canonical.configuration.products", "idem-replay-001", null, It.IsAny<CanonicalProductConfigurationRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new IdempotencyCheckResult<CanonicalWriteResultDto> { IsReplay = true, ReplayedResponse = cachedResult });

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-replay",
            IdempotencyKey: "idem-replay-001",
            Action: CatalogConfigurationAction.UpdateProduct,
            ProductId: Guid.NewGuid(),
            Name: "Replay Test"
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.True(result.IsSuccess);
        Assert.Equal(cachedResult.TargetEntityId, result.Value!.TargetEntityId);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ConfigureProductAsync_IdempotencyMismatch_ReturnsConflictAndRollsBack()
    {
        _idempotencyServiceMock
            .Setup(i => i.CheckAsync<CanonicalProductConfigurationRequest, CanonicalWriteResultDto>(
                "canonical.configuration.products", "idem-mismatch-001", null, It.IsAny<CanonicalProductConfigurationRequest>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IntegrationDomainException("IDEMPOTENCY_MISMATCH"));

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-mismatch",
            IdempotencyKey: "idem-mismatch-001",
            Action: CatalogConfigurationAction.UpdateProduct,
            ProductId: Guid.NewGuid(),
            Name: "Mismatch Test"
        );

        var result = await _service.ConfigureProductAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.IDEMPOTENCY_MISMATCH, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ConfigureReorderRuleAsync_IdempotentReplay_ReturnsStoredResponseWithoutReExecution()
    {
        var cachedResult = new CanonicalWriteResultDto(Guid.NewGuid(), CanonicalWriteStatuses.Applied, Guid.NewGuid(), "PRODUCT_REORDER_RULE", _fixedTime);
        _idempotencyServiceMock
            .Setup(i => i.CheckAsync<CanonicalReorderRuleConfigurationRequest, CanonicalWriteResultDto>(
                "canonical.configuration.reorder-rules", "idem-rule-replay", _branchId, It.IsAny<CanonicalReorderRuleConfigurationRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new IdempotencyCheckResult<CanonicalWriteResultDto> { IsReplay = true, ReplayedResponse = cachedResult });

        var request = new CanonicalReorderRuleConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-rule-replay",
            IdempotencyKey: "idem-rule-replay",
            BranchId: _branchId,
            ProductId: Guid.NewGuid(),
            ReorderPointBase: 10m,
            ReorderQuantityBase: 50m,
            MaxQuantityBase: 100m
        );

        var result = await _service.ConfigureReorderRuleAsync(request);

        Assert.True(result.IsSuccess);
        Assert.Equal(cachedResult.TargetEntityId, result.Value!.TargetEntityId);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Never);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ConfigureReorderRuleAsync_IdempotencyMismatch_ReturnsConflictAndRollsBack()
    {
        _idempotencyServiceMock
            .Setup(i => i.CheckAsync<CanonicalReorderRuleConfigurationRequest, CanonicalWriteResultDto>(
                "canonical.configuration.reorder-rules", "idem-rule-mismatch", _branchId, It.IsAny<CanonicalReorderRuleConfigurationRequest>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IntegrationDomainException("IDEMPOTENCY_MISMATCH"));

        var request = new CanonicalReorderRuleConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-rule-mismatch",
            IdempotencyKey: "idem-rule-mismatch",
            BranchId: _branchId,
            ProductId: Guid.NewGuid(),
            ReorderPointBase: 10m,
            ReorderQuantityBase: 50m,
            MaxQuantityBase: 100m
        );

        var result = await _service.ConfigureReorderRuleAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.IDEMPOTENCY_MISMATCH, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    // =========================================================================
    // 13. Feed Keyset Paging, Boundary & Failure Tests
    // =========================================================================

    [Fact]
    public async Task GetCanonicalProductsFeedAsync_ReturnsEmptyResult_WhenNoProductsMatch()
    {
        _productRepoMock
            .Setup(r => r.GetCanonicalFeedKeysetPageAsync(_orgId, null, null, null, 50, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Product>(), false));

        var result = await _service.GetCanonicalProductsFeedAsync(null, null, 50);

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value!.Items);
        Assert.Null(result.Value.NextCursor);
    }

    [Fact]
    public async Task GetCanonicalProductsFeedAsync_HandlesPaginationAcrossFirstMiddleAndLastPages()
    {
        var p1 = CreateSampleProduct("SKU-1", "Product 1");
        var p2 = CreateSampleProduct("SKU-2", "Product 2");

        // Page 1: returns p1, hasNextPage = true
        _productRepoMock
            .Setup(r => r.GetCanonicalFeedKeysetPageAsync(_orgId, null, null, null, 1, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Product> { p1 }, true));

        var page1 = await _service.GetCanonicalProductsFeedAsync(null, null, 1);
        Assert.True(page1.IsSuccess);
        Assert.Single(page1.Value!.Items);
        Assert.NotNull(page1.Value.NextCursor);

        // Page 2: returns p2, hasNextPage = false (last page)
        _productRepoMock
            .Setup(r => r.GetCanonicalFeedKeysetPageAsync(_orgId, null, p1.UpdatedAt, p1.ProductId, 1, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Product> { p2 }, false));

        var page2 = await _service.GetCanonicalProductsFeedAsync(null, page1.Value.NextCursor, 1);
        Assert.True(page2.IsSuccess);
        Assert.Single(page2.Value!.Items);
        Assert.Null(page2.Value.NextCursor); // Last page has null next cursor
    }

    [Theory]
    [InlineData("not-base64-at-all!@#")]
    [InlineData("YWJj")] // "abc" in base64, missing colon separator
    [InlineData("bm90LWEtdmFsaWQtdGlja3M6bm90LWEtZ3VpZA")] // valid base64url but invalid ticks and guid
    public async Task GetCanonicalProductsFeedAsync_RejectsCorruptedOrTamperedCursor_WithValidationError(string corruptedCursor)
    {
        var result = await _service.GetCanonicalProductsFeedAsync(null, corruptedCursor, 50);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.VALIDATION_ERROR, result.ErrorCode);
        _productRepoMock.Verify(r => r.GetCanonicalFeedKeysetPageAsync(
            It.IsAny<Guid>(), It.IsAny<DateTimeOffset?>(), It.IsAny<DateTimeOffset?>(), It.IsAny<Guid?>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetCanonicalProductsFeedAsync_AppliesBothUpdatedSinceAndCursorKeyset()
    {
        var since = DateTimeOffset.UtcNow.AddDays(-7);
        var cursorTime = DateTimeOffset.UtcNow.AddDays(-2);
        var cursorId = Guid.NewGuid();
        var cursor = EncodeCursorBase64Url(cursorTime, cursorId);

        _productRepoMock
            .Setup(r => r.GetCanonicalFeedKeysetPageAsync(_orgId, since, cursorTime, cursorId, 50, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<Product>(), false));

        var result = await _service.GetCanonicalProductsFeedAsync(since, cursor, 50);

        Assert.True(result.IsSuccess);
        _productRepoMock.Verify(r => r.GetCanonicalFeedKeysetPageAsync(_orgId, since, cursorTime, cursorId, 50, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ConfigureProductAsync_TemporaryUsageChecker_FailsafeConflict_OnLotTrackingAndUomChanges()
    {
        var tempChecker = new TemporaryProductInventoryUsageChecker();
        var product = CreateSampleProduct("PAN-500", "Panadol 500mg", lotTracking: false);

        var serviceWithTempChecker = new CanonicalCatalogService(
            _productRepoMock.Object, _categoryRepoMock.Object, _uomRepoMock.Object, _reorderRuleRepoMock.Object,
            _branchRepoMock.Object,
            _unitOfWorkMock.Object, _tenantContextMock.Object, _currentUserMock.Object, _runtimeModeMock.Object,
            _dateTimeProviderMock.Object, _idempotencyServiceMock.Object, _auditLoggerMock.Object, _outboxServiceMock.Object,
            _nonLotBatchInitializerMock.Object, tempChecker);

        _productRepoMock.Setup(p => p.GetByIdWithUomsAsync(_orgId, product.ProductId, It.IsAny<CancellationToken>())).ReturnsAsync(product);

        var request = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "prompt-temp-checker",
            IdempotencyKey: "k-temp-chk",
            Action: CatalogConfigurationAction.UpdateProduct,
            ProductId: product.ProductId,
            LotTrackingRequired: true
        );

        var result = await serviceWithTempChecker.ConfigureProductAsync(request);

        // Temporary checker returns true (fail-safe conflict)
        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.CONFLICT, result.ErrorCode);
    }
}
