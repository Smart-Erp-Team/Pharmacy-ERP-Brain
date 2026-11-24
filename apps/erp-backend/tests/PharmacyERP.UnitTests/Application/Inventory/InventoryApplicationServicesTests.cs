using PharmacyERP.Application.Features.Inventory.DTOs;

namespace PharmacyERP.UnitTests.Application.Inventory;

public class InventoryApplicationServicesTests
{
    private readonly Mock<IInventoryTxnRepository> _txnRepoMock = new();
    private readonly Mock<IStockBalanceRepository> _stockRepoMock = new();
    private readonly Mock<IInventoryBatchRepository> _batchRepoMock = new();
    private readonly Mock<IInventoryLocationRepository> _locationRepoMock = new();
    private readonly Mock<ITenantContext> _tenantContextMock = new();
    private readonly Mock<ICurrentUser> _currentUserMock = new();
    private readonly Mock<IRuntimeModeProvider> _runtimeModeMock = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProviderMock = new();
    private readonly Mock<IUnitOfWork> _unitOfWorkMock = new();
    private readonly Mock<IIdempotencyService> _idempotencyMock = new();
    private readonly Mock<IOutboxService> _outboxMock = new();
    private readonly Mock<IAuditLogger> _auditLoggerMock = new();

    private readonly Guid _orgId = Guid.NewGuid();
    private readonly Guid _branchId = Guid.NewGuid();
    private readonly Guid _userId = Guid.NewGuid();
    private readonly Guid _employeeId = Guid.NewGuid();

    public InventoryApplicationServicesTests()
    {
        _tenantContextMock.Setup(t => t.OrganizationId).Returns(_orgId);
        _currentUserMock.Setup(u => u.UserId).Returns(_userId);
        _currentUserMock.Setup(u => u.EmployeeId).Returns(_employeeId);
        _currentUserMock.Setup(u => u.Role).Returns(UserRole.Admin.ToString());
        _currentUserMock.Setup(u => u.CanAccessBranch(It.IsAny<Guid>())).Returns(true);
        _runtimeModeMock.Setup(r => r.CurrentMode).Returns(ErpRuntimeMode.BranchLocal);
        _dateTimeProviderMock.Setup(d => d.UtcNow).Returns(DateTimeOffset.UtcNow);
        _idempotencyMock.Setup(i => i.CheckAsync<CreateInventoryAdjustmentRequest, InventoryTxnDto>(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<Guid?>(),
                It.IsAny<CreateInventoryAdjustmentRequest>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new IdempotencyCheckResult<InventoryTxnDto>());
    }

    [Fact]
    public async Task PostAdjustmentAsync_OpeningBalance_CreatesStockAndCalculatesWeightedAvgCost()
    {
        // Arrange
        var service = new InventoryAdjustmentService(
            _txnRepoMock.Object, _stockRepoMock.Object, _batchRepoMock.Object, _locationRepoMock.Object,
            _tenantContextMock.Object, _currentUserMock.Object, _runtimeModeMock.Object,
            _dateTimeProviderMock.Object, _unitOfWorkMock.Object, _idempotencyMock.Object,
            _outboxMock.Object, _auditLoggerMock.Object);

        var productId = Guid.NewGuid();
        var uomId = Guid.NewGuid();

        var location = InventoryLocation.CreateDefaultSellable(_orgId, _branchId, DateTimeOffset.UtcNow);
        var locationId = location.LocationId;
        _locationRepoMock.Setup(l => l.GetByIdsAsync(_orgId, _branchId, It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<InventoryLocation> { location });

        var batch = InventoryBatch.CreateNonLotSystemBatch(_orgId, productId);
        _batchRepoMock.Setup(b => b.GetOrCreateBatchesAsync(
                _orgId,
                It.IsAny<IReadOnlyCollection<(Guid ProductId, string BatchNumber, DateOnly? ExpiresOn, DateOnly? ManufacturedOn)>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<Guid, InventoryBatch> { [batch.BatchId] = batch });

        var initialBalance = StockBalance.CreateInitial(_orgId, locationId, batch.BatchId, 0m, 0m, DateTimeOffset.UtcNow);
        _stockRepoMock.Setup(s => s.GetOrCreateForUpdateBatchAsync(
                _orgId,
                It.IsAny<IReadOnlyCollection<(Guid LocationId, Guid BatchId)>>(),
                It.IsAny<DateTimeOffset>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<(Guid LocationId, Guid BatchId), StockBalance> { [(locationId, batch.BatchId)] = initialBalance });

        var request = new CreateInventoryAdjustmentRequest(
            _branchId,
            InventoryTransactionType.OPENING_BALANCE,
            "INIT",
            "Opening Stock",
            null,
            new List<CreateInventoryAdjustmentLineRequest>
            {
                new(productId, uomId, locationId, "NON-LOT", null, null, 10m, 15m)
            },
            "IDEM-KEY-1");

        // Act
        var result = await service.PostAdjustmentAsync(request);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.NotNull(result.Value);
        Assert.Equal(InventoryTransactionStatus.POSTED, result.Value.Status);
        _unitOfWorkMock.Verify(u => u.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task PostAdjustmentAsync_AdjustmentOut_ReturnsOutOfStockWhenQtyExceedsBalance()
    {
        // Arrange
        var service = new InventoryAdjustmentService(
            _txnRepoMock.Object, _stockRepoMock.Object, _batchRepoMock.Object, _locationRepoMock.Object,
            _tenantContextMock.Object, _currentUserMock.Object, _runtimeModeMock.Object,
            _dateTimeProviderMock.Object, _unitOfWorkMock.Object, _idempotencyMock.Object,
            _outboxMock.Object, _auditLoggerMock.Object);

        var productId = Guid.NewGuid();
        var uomId = Guid.NewGuid();

        var location = InventoryLocation.CreateDefaultSellable(_orgId, _branchId, DateTimeOffset.UtcNow);
        var locationId = location.LocationId;
        _locationRepoMock.Setup(l => l.GetByIdsAsync(_orgId, _branchId, It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<InventoryLocation> { location });

        var batch = InventoryBatch.CreateNonLotSystemBatch(_orgId, productId);
        _batchRepoMock.Setup(b => b.GetOrCreateBatchesAsync(
                _orgId,
                It.IsAny<IReadOnlyCollection<(Guid ProductId, string BatchNumber, DateOnly? ExpiresOn, DateOnly? ManufacturedOn)>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<Guid, InventoryBatch> { [batch.BatchId] = batch });

        var stockBalance = StockBalance.CreateInitial(_orgId, locationId, batch.BatchId, 5m, 10m, DateTimeOffset.UtcNow);
        _stockRepoMock.Setup(s => s.GetOrCreateForUpdateBatchAsync(
                _orgId,
                It.IsAny<IReadOnlyCollection<(Guid LocationId, Guid BatchId)>>(),
                It.IsAny<DateTimeOffset>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<(Guid LocationId, Guid BatchId), StockBalance> { [(locationId, batch.BatchId)] = stockBalance });

        var request = new CreateInventoryAdjustmentRequest(
            _branchId,
            InventoryTransactionType.ADJUSTMENT_OUT,
            "CORRECTION",
            "Stock reduction",
            null,
            new List<CreateInventoryAdjustmentLineRequest>
            {
                new(productId, uomId, locationId, "NON-LOT", null, null, 10m, null)
            },
            "IDEM-KEY-2");

        // Act
        var result = await service.PostAdjustmentAsync(request);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.OUT_OF_STOCK, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task GetBalancesAsync_ExcludesQuarantineAndScrapFromAvailableQuantity()
    {
        // Arrange
        var queryService = new InventoryQueryService(
            _stockRepoMock.Object, _txnRepoMock.Object, _batchRepoMock.Object, _unitOfWorkMock.Object,
            _tenantContextMock.Object, _currentUserMock.Object, _dateTimeProviderMock.Object);

        var productId = Guid.NewGuid();
        var scrapLocation = InventoryLocation.CreateDefaultScrap(_orgId, _branchId, DateTimeOffset.UtcNow);
        var batch = InventoryBatch.CreateNonLotSystemBatch(_orgId, productId);
        var scrapBalance = StockBalance.CreateInitial(_orgId, scrapLocation.LocationId, batch.BatchId, 20m, 5m, DateTimeOffset.UtcNow);

        // Inject Navigation properties via reflection for testing
        typeof(StockBalance).GetProperty(nameof(StockBalance.Location))!.SetValue(scrapBalance, scrapLocation);
        typeof(StockBalance).GetProperty(nameof(StockBalance.Batch))!.SetValue(scrapBalance, batch);

        _stockRepoMock.Setup(s => s.GetBalancesWithDetailsAsync(_orgId, _branchId, productId, null, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<StockBalance> { scrapBalance });

        _dateTimeProviderMock.Setup(d => d.GetOrganizationBusinessDate(It.IsAny<string>()))
            .Returns(DateOnly.FromDateTime(DateTime.UtcNow));

        // Act
        var result = await queryService.GetBalancesAsync(_branchId, productId, null, null);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Single(result.Value!);
        Assert.Equal(20m, result.Value![0].OnHandQtyBase);
        Assert.Equal(0m, result.Value[0].AvailableQtyBase); // Scrap area -> Available quantity is zero
    }

    [Fact]
    public async Task PostAdjustmentAsync_OpeningBalance_PharmacistIsAllowedPerBlueprint91_AndCashierReturnsForbidden()
    {
        var service = new InventoryAdjustmentService(
            _txnRepoMock.Object, _stockRepoMock.Object, _batchRepoMock.Object, _locationRepoMock.Object,
            _tenantContextMock.Object, _currentUserMock.Object, _runtimeModeMock.Object,
            _dateTimeProviderMock.Object, _unitOfWorkMock.Object, _idempotencyMock.Object,
            _outboxMock.Object, _auditLoggerMock.Object);

        var productId = Guid.NewGuid();
        var uomId = Guid.NewGuid();
        var location = InventoryLocation.CreateDefaultSellable(_orgId, _branchId, DateTimeOffset.UtcNow);
        var batch = InventoryBatch.CreateNonLotSystemBatch(_orgId, productId);
        var initialBalance = StockBalance.CreateInitial(_orgId, location.LocationId, batch.BatchId, 0m, 0m, DateTimeOffset.UtcNow);

        _locationRepoMock.Setup(l => l.GetByIdsAsync(_orgId, _branchId, It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<InventoryLocation> { location });
        _batchRepoMock.Setup(b => b.GetOrCreateBatchesAsync(
                _orgId,
                It.IsAny<IReadOnlyCollection<(Guid ProductId, string BatchNumber, DateOnly? ExpiresOn, DateOnly? ManufacturedOn)>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<Guid, InventoryBatch> { [batch.BatchId] = batch });
        _stockRepoMock.Setup(s => s.GetOrCreateForUpdateBatchAsync(
                _orgId,
                It.IsAny<IReadOnlyCollection<(Guid LocationId, Guid BatchId)>>(),
                It.IsAny<DateTimeOffset>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<(Guid LocationId, Guid BatchId), StockBalance> { [(location.LocationId, batch.BatchId)] = initialBalance });

        // Pharmacist is allowed on OPENING_BALANCE per Blueprint §9.1
        _currentUserMock.Setup(u => u.Role).Returns(UserRole.Pharmacist.ToString());
        var pharmacistRequest = new CreateInventoryAdjustmentRequest(
            _branchId,
            InventoryTransactionType.OPENING_BALANCE,
            "INIT",
            "Opening Stock by Pharmacist",
            null,
            new List<CreateInventoryAdjustmentLineRequest>
            {
                new(productId, uomId, location.LocationId, "NON-LOT", null, null, 10m, 15m)
            },
            "IDEM-OPENING-PHARM");

        var pharmacistResult = await service.PostAdjustmentAsync(pharmacistRequest);
        Assert.True(pharmacistResult.IsSuccess);
        Assert.Equal(InventoryTransactionStatus.POSTED, pharmacistResult.Value!.Status);

        // Cashier is denied with FORBIDDEN
        _currentUserMock.Setup(u => u.Role).Returns(UserRole.Cashier.ToString());
        var cashierResult = await service.PostAdjustmentAsync(pharmacistRequest with { IdempotencyKey = "IDEM-OPENING-CASHIER" });
        Assert.False(cashierResult.IsSuccess);
        Assert.Equal(ErrorCode.FORBIDDEN, cashierResult.ErrorCode);
    }

    [Fact]
    public async Task PostAdjustmentAsync_OpeningBalance_WithExistingLedgerHistoryReturnsInvalidStateTransition()
    {
        var service = new InventoryAdjustmentService(
            _txnRepoMock.Object, _stockRepoMock.Object, _batchRepoMock.Object, _locationRepoMock.Object,
            _tenantContextMock.Object, _currentUserMock.Object, _runtimeModeMock.Object,
            _dateTimeProviderMock.Object, _unitOfWorkMock.Object, _idempotencyMock.Object,
            _outboxMock.Object, _auditLoggerMock.Object);

        var productId = Guid.NewGuid();
        var uomId = Guid.NewGuid();
        var location = InventoryLocation.CreateDefaultSellable(_orgId, _branchId, DateTimeOffset.UtcNow);
        var batch = InventoryBatch.CreateNonLotSystemBatch(_orgId, productId);
        var zeroBalance = StockBalance.CreateInitial(_orgId, location.LocationId, batch.BatchId, 0m, 0m, DateTimeOffset.UtcNow);

        _locationRepoMock.Setup(l => l.GetByIdsAsync(_orgId, _branchId, It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<InventoryLocation> { location });
        _batchRepoMock.Setup(b => b.GetOrCreateBatchesAsync(
                _orgId,
                It.IsAny<IReadOnlyCollection<(Guid ProductId, string BatchNumber, DateOnly? ExpiresOn, DateOnly? ManufacturedOn)>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<Guid, InventoryBatch> { [batch.BatchId] = batch });
        _stockRepoMock.Setup(s => s.GetOrCreateForUpdateBatchAsync(
                _orgId,
                It.IsAny<IReadOnlyCollection<(Guid LocationId, Guid BatchId)>>(),
                It.IsAny<DateTimeOffset>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<(Guid LocationId, Guid BatchId), StockBalance> { [(location.LocationId, batch.BatchId)] = zeroBalance });
        _txnRepoMock.Setup(t => t.HasLedgerHistoryAsync(_orgId, location.LocationId, batch.BatchId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var request = new CreateInventoryAdjustmentRequest(
            _branchId,
            InventoryTransactionType.OPENING_BALANCE,
            "INIT",
            "Duplicate Opening",
            null,
            new List<CreateInventoryAdjustmentLineRequest>
            {
                new(productId, uomId, location.LocationId, "NON-LOT", null, null, 10m, 15m)
            },
            "IDEM-OPENING-HISTORY");

        var result = await service.PostAdjustmentAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.INVALID_STATE_TRANSITION, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task PostAdjustmentAsync_Reversal_AlreadyReversedReturnsInvalidStateTransition()
    {
        var service = new InventoryAdjustmentService(
            _txnRepoMock.Object, _stockRepoMock.Object, _batchRepoMock.Object, _locationRepoMock.Object,
            _tenantContextMock.Object, _currentUserMock.Object, _runtimeModeMock.Object,
            _dateTimeProviderMock.Object, _unitOfWorkMock.Object, _idempotencyMock.Object,
            _outboxMock.Object, _auditLoggerMock.Object);

        var originalTxn = InventoryTxn.CreatePosted(
            _orgId, _branchId, "ADJ-ORIG-1", InventoryTransactionType.ADJUSTMENT_IN,
            "IDEM-ORIG", _employeeId, DateTimeOffset.UtcNow);

        _txnRepoMock.Setup(t => t.GetByIdWithLinesAsync(_orgId, _branchId, originalTxn.InventoryTxnId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(originalTxn);
        _txnRepoMock.Setup(t => t.HasPostedReversalAsync(_orgId, _branchId, originalTxn.InventoryTxnId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var request = new CreateInventoryAdjustmentRequest(
            _branchId,
            InventoryTransactionType.REVERSAL,
            "REV",
            "Second reversal attempt",
            originalTxn.InventoryTxnId,
            Array.Empty<CreateInventoryAdjustmentLineRequest>(),
            "IDEM-REV-2");

        var result = await service.PostAdjustmentAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.INVALID_STATE_TRANSITION, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task PostAdjustmentAsync_InactiveProductUom_ReturnsNotFound()
    {
        var uomRepoMock = new Mock<IProductUomRepository>();
        var service = new InventoryAdjustmentService(
            _txnRepoMock.Object, _stockRepoMock.Object, _batchRepoMock.Object, _locationRepoMock.Object,
            _tenantContextMock.Object, _currentUserMock.Object, _runtimeModeMock.Object,
            _dateTimeProviderMock.Object, _unitOfWorkMock.Object, _idempotencyMock.Object,
            _outboxMock.Object, _auditLoggerMock.Object, productUomRepo: uomRepoMock.Object);

        var product = Product.Create(
            _orgId,
            Guid.NewGuid(),
            "SKU-TEST",
            null,
            "Test Med",
            null,
            null,
            "PCS",
            0m,
            null,
            false,
            0,
            new[] { new InitialUomDefinition("PCS", "Piece", 1m, 5m, true, true, true) });
        var productId = product.ProductId;
        var location = InventoryLocation.CreateDefaultSellable(_orgId, _branchId, DateTimeOffset.UtcNow);
        var inactiveUom = product.AddUom("BOX", "Box", 10m, 50m, false, true, true);
        inactiveUom.Deactivate();

        _locationRepoMock.Setup(l => l.GetByIdsAsync(_orgId, _branchId, It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<InventoryLocation> { location });
        uomRepoMock.Setup(u => u.GetByIdsAsync(_orgId, It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<ProductUom> { inactiveUom });

        var request = new CreateInventoryAdjustmentRequest(
            _branchId,
            InventoryTransactionType.ADJUSTMENT_IN,
            "COUNT",
            "Inactive UOM",
            null,
            new List<CreateInventoryAdjustmentLineRequest>
            {
                new(productId, inactiveUom.ProductUomId, location.LocationId, "NON-LOT", null, null, 2m, 20m)
            },
            "IDEM-INACTIVE-UOM");

        var result = await service.PostAdjustmentAsync(request);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.NOT_FOUND, result.ErrorCode);
        _unitOfWorkMock.Verify(u => u.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task PostAdjustmentAsync_MultiUomInput_NormalizesLedgerLineToBaseUomPerBlueprint8912()
    {
        var uomRepoMock = new Mock<IProductUomRepository>();
        var productRepoMock = new Mock<IProductRepository>();
        InventoryTxn? capturedTxn = null;
        _txnRepoMock.Setup(t => t.AddAsync(It.IsAny<InventoryTxn>(), It.IsAny<CancellationToken>()))
            .Callback<InventoryTxn, CancellationToken>((txn, _) => capturedTxn = txn)
            .Returns(Task.CompletedTask);

        var service = new InventoryAdjustmentService(
            _txnRepoMock.Object, _stockRepoMock.Object, _batchRepoMock.Object, _locationRepoMock.Object,
            _tenantContextMock.Object, _currentUserMock.Object, _runtimeModeMock.Object,
            _dateTimeProviderMock.Object, _unitOfWorkMock.Object, _idempotencyMock.Object,
            _outboxMock.Object, _auditLoggerMock.Object,
            productUomRepo: uomRepoMock.Object, productRepo: productRepoMock.Object);

        var product = Product.Create(
            _orgId,
            Guid.NewGuid(),
            "MED-AUG-1000",
            null,
            "Augmentin 1g",
            null,
            null,
            "TAB",
            0m,
            null,
            true,
            30,
            new[] { new InitialUomDefinition("TAB", "Tablet", 1m, 10.50m, true, true, true) });
        var baseUom = product.Uoms.Single(u => u.IsBase);
        var boxUom = product.AddUom("BOX", "Box of 14", 14m, 138.00m, false, true, true);

        var location = InventoryLocation.CreateDefaultSellable(_orgId, _branchId, DateTimeOffset.UtcNow);
        var expiresOn = new DateOnly(2027, 1, 28);
        var batch = InventoryBatch.CreateDatedBatch(_orgId, product.ProductId, "LOT-2601", expiresOn);
        var stockBalance = StockBalance.CreateInitial(_orgId, location.LocationId, batch.BatchId, 0m, 0m, DateTimeOffset.UtcNow);

        _locationRepoMock.Setup(l => l.GetByIdsAsync(_orgId, _branchId, It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<InventoryLocation> { location });
        productRepoMock.Setup(p => p.GetByIdsAsync(_orgId, It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<Product> { product });
        uomRepoMock.Setup(u => u.GetByIdsAsync(_orgId, It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<ProductUom> { boxUom });
        uomRepoMock.Setup(u => u.GetActiveBaseUomsByProductIdsAsync(_orgId, It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<ProductUom> { baseUom });
        _batchRepoMock.Setup(b => b.GetOrCreateBatchesAsync(
                _orgId,
                It.IsAny<IReadOnlyCollection<(Guid ProductId, string BatchNumber, DateOnly? ExpiresOn, DateOnly? ManufacturedOn)>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<Guid, InventoryBatch> { [batch.BatchId] = batch });
        _stockRepoMock.Setup(s => s.GetOrCreateForUpdateBatchAsync(
                _orgId,
                It.IsAny<IReadOnlyCollection<(Guid LocationId, Guid BatchId)>>(),
                It.IsAny<DateTimeOffset>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<(Guid LocationId, Guid BatchId), StockBalance> { [(location.LocationId, batch.BatchId)] = stockBalance });

        // Caller submits 2 Boxes (14 Tabs/Box) at 100.80/Box -> 28 Tabs at 7.20/Tab
        var request = new CreateInventoryAdjustmentRequest(
            _branchId,
            InventoryTransactionType.ADJUSTMENT_IN,
            "COUNT",
            "Multi-UOM restock",
            null,
            new List<CreateInventoryAdjustmentLineRequest>
            {
                new(product.ProductId, boxUom.ProductUomId, location.LocationId, "LOT-2601", null, expiresOn, 2m, 100.80m)
            },
            "IDEM-MULTI-UOM");

        var result = await service.PostAdjustmentAsync(request);

        Assert.True(result.IsSuccess);
        var responseLine = Assert.Single(result.Value!.Lines);
        Assert.Equal(baseUom.ProductUomId, responseLine.ProductUomId);
        Assert.Equal(28m, responseLine.EnteredQty);
        Assert.Equal(1m, responseLine.ConversionSnapshot);
        Assert.Equal(28m, responseLine.QuantityDeltaBase);
        Assert.Equal(7.20m, responseLine.UnitCostBase);

        Assert.NotNull(capturedTxn);
        var persistedLine = Assert.Single(capturedTxn!.Lines);
        Assert.Equal(baseUom.ProductUomId, persistedLine.ProductUomId);
        Assert.Equal(28m, persistedLine.EnteredQty);
        Assert.Equal(1m, persistedLine.ConversionSnapshot);
        Assert.Equal(28m, persistedLine.QuantityDeltaBase);
        Assert.Equal(7.20m, persistedLine.UnitCostBase);
        Assert.Equal(28m, stockBalance.OnHandQtyBase);
        Assert.Equal(7.20m, stockBalance.AverageUnitCost);
    }
}
