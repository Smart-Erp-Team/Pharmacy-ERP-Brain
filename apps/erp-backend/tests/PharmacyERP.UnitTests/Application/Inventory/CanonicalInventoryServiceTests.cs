using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Moq;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Application.Features.Identity.Interfaces;
using PharmacyERP.Application.Features.Inventory.Interfaces;
using PharmacyERP.Application.Features.Inventory.Services.Implementations;
using PharmacyERP.Domain.Entities.Identity;
using PharmacyERP.Domain.Entities.Inventory;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Domain.ValueObjects;
using Xunit;

namespace PharmacyERP.UnitTests.Application.Inventory;

public class CanonicalInventoryServiceTests
{
    private readonly Mock<ICurrentUser> _currentUserMock;
    private readonly Mock<IStockBalanceRepository> _stockBalanceRepoMock;
    private readonly Mock<IBranchRepository> _branchRepoMock;
    private readonly Mock<IDateTimeProvider> _dateTimeProviderMock;
    private readonly Mock<ITenantContext> _tenantContextMock;
    private readonly Mock<IUnitOfWork> _unitOfWorkMock;
    private readonly CanonicalInventoryService _sut;

    public CanonicalInventoryServiceTests()
    {
        _currentUserMock = new Mock<ICurrentUser>();
        _stockBalanceRepoMock = new Mock<IStockBalanceRepository>();
        _branchRepoMock = new Mock<IBranchRepository>();
        _dateTimeProviderMock = new Mock<IDateTimeProvider>();
        _tenantContextMock = new Mock<ITenantContext>();
        _unitOfWorkMock = new Mock<IUnitOfWork>();

        _sut = new CanonicalInventoryService(
            _currentUserMock.Object,
            _stockBalanceRepoMock.Object,
            _branchRepoMock.Object,
            _dateTimeProviderMock.Object,
            _tenantContextMock.Object,
            _unitOfWorkMock.Object);
    }

    [Fact]
    public async Task GetCanonicalInventoryAsync_CalculatesAvailableQuantityBase_Correctly()
    {
        var orgId = Guid.NewGuid();
        var branch = Branch.Create(orgId, "BR-1", "Main", new Address("1 Main St", null, "Cairo", null, null, "EG"));
        var branchId = branch.BranchId;
        var ct = CancellationToken.None;

        _tenantContextMock.Setup(x => x.OrganizationId).Returns(orgId);
        _branchRepoMock.Setup(x => x.GetByIdAsync(orgId, branchId, ct)).ReturnsAsync(branch);
        _currentUserMock.Setup(x => x.CanAccessBranch(branchId)).Returns(true);
        _dateTimeProviderMock.Setup(x => x.GetOrganizationBusinessDate(It.IsAny<string>()))
            .Returns(DateOnly.FromDateTime(DateTime.UtcNow));
        _stockBalanceRepoMock.Setup(x => x.GetCanonicalInventoryPageAsync(orgId, branchId, null, null, 0, 10, ct))
            .ReturnsAsync((new List<StockBalance>(), 0, false));

        var result = await _sut.GetCanonicalInventoryAsync(orgId, branchId, null, null, null, 10, ct);

        Assert.True(result.IsSuccess);
        _stockBalanceRepoMock.Verify(x => x.GetCanonicalInventoryPageAsync(orgId, branchId, null, null, 0, 10, ct), Times.Once);
        _unitOfWorkMock.Verify(u => u.BeginTransactionAsync(ct), Times.Once);
    }

    [Fact]
    public async Task GetCanonicalInventoryAsync_UnknownOrCrossTenantBranch_ReturnsNotFound()
    {
        var orgId = Guid.NewGuid();
        var foreignBranchId = Guid.NewGuid();

        _tenantContextMock.Setup(x => x.OrganizationId).Returns(orgId);
        _branchRepoMock.Setup(x => x.GetByIdAsync(orgId, foreignBranchId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Branch?)null);
        _currentUserMock.Setup(x => x.CanAccessBranch(foreignBranchId)).Returns(true);

        var result = await _sut.GetCanonicalInventoryAsync(orgId, foreignBranchId, null, null, null, 10, CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.NOT_FOUND, result.ErrorCode);
    }

    [Fact]
    public async Task GetCanonicalInventoryAsync_MismatchedOrganizationId_ReturnsForbidden()
    {
        var tenantOrgId = Guid.NewGuid();
        var requestedOrgId = Guid.NewGuid();
        var branchId = Guid.NewGuid();

        _tenantContextMock.Setup(x => x.OrganizationId).Returns(tenantOrgId);
        _currentUserMock.Setup(x => x.CanAccessBranch(branchId)).Returns(true);

        var result = await _sut.GetCanonicalInventoryAsync(requestedOrgId, branchId, null, null, null, 10, CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.FORBIDDEN, result.ErrorCode);
    }
}
