using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Moq;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Common.Interfaces.Integration;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Application.Features.Inventory.DTOs;
using PharmacyERP.Application.Features.Inventory.Interfaces;
using PharmacyERP.Application.Features.Inventory.Services.Implementations;
using PharmacyERP.Domain.Entities.Inventory;
using PharmacyERP.Domain.Enums;
using Xunit;

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

    public InventoryApplicationServicesTests()
    {
        _tenantContextMock.Setup(t => t.OrganizationId).Returns(_orgId);
        _currentUserMock.Setup(u => u.UserId).Returns(_userId);
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

        var locationId = Guid.NewGuid();
        var productId = Guid.NewGuid();
        var uomId = Guid.NewGuid();

        var location = InventoryLocation.CreateDefaultSellable(_orgId, _branchId, DateTimeOffset.UtcNow);
        _locationRepoMock.Setup(l => l.GetByIdAsync(_orgId, _branchId, locationId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(location);

        var batch = InventoryBatch.CreateNonLotSystemBatch(_orgId, productId);
        _batchRepoMock.Setup(b => b.GetOrCreateBatchAsync(_orgId, productId, "NON-LOT", null, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(batch);

        _stockRepoMock.Setup(s => s.GetForUpdateAsync(_orgId, locationId, batch.BatchId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((StockBalance?)null);

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

        var locationId = Guid.NewGuid();
        var productId = Guid.NewGuid();
        var uomId = Guid.NewGuid();

        var location = InventoryLocation.CreateDefaultSellable(_orgId, _branchId, DateTimeOffset.UtcNow);
        _locationRepoMock.Setup(l => l.GetByIdAsync(_orgId, _branchId, locationId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(location);

        var batch = InventoryBatch.CreateNonLotSystemBatch(_orgId, productId);
        _batchRepoMock.Setup(b => b.GetOrCreateBatchAsync(_orgId, productId, "NON-LOT", null, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(batch);

        var stockBalance = StockBalance.CreateInitial(_orgId, locationId, batch.BatchId, 5m, 10m, DateTimeOffset.UtcNow);
        _stockRepoMock.Setup(s => s.GetForUpdateAsync(_orgId, locationId, batch.BatchId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(stockBalance);

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
            _stockRepoMock.Object, _txnRepoMock.Object, _tenantContextMock.Object,
            _currentUserMock.Object, _dateTimeProviderMock.Object);

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
}