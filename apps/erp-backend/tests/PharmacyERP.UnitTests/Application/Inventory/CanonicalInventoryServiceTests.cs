using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using FluentAssertions;
using Moq;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Features.Inventory.Interfaces;
using PharmacyERP.Application.Features.Inventory.Services.Implementations;
using PharmacyERP.Domain.Entities.Inventory;
using PharmacyERP.Domain.Enums;
using Xunit;

namespace PharmacyERP.UnitTests.Application.Inventory;

public class CanonicalInventoryServiceTests
{
    private readonly Mock<ICurrentUser> _currentUserMock;
    private readonly Mock<IStockBalanceRepository> _stockBalanceRepoMock;
    private readonly Mock<IDateTimeProvider> _dateTimeProviderMock;
    private readonly Mock<ITenantContext> _tenantContextMock;
    private readonly CanonicalInventoryService _sut;

    public CanonicalInventoryServiceTests()
    {
        _currentUserMock = new Mock<ICurrentUser>();
        _stockBalanceRepoMock = new Mock<IStockBalanceRepository>();
        _dateTimeProviderMock = new Mock<IDateTimeProvider>();
        _tenantContextMock = new Mock<ITenantContext>();

        _sut = new CanonicalInventoryService(
            _currentUserMock.Object,
            _stockBalanceRepoMock.Object,
            _dateTimeProviderMock.Object,
            _tenantContextMock.Object);
    }

    [Fact]
    public async Task GetCanonicalInventoryAsync_CalculatesAvailableQuantityBase_Correctly()
    {
        // Arrange
        var orgId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        var ct = CancellationToken.None;

        _currentUserMock.Setup(x => x.CanAccessBranch(branchId)).Returns(true);
        _dateTimeProviderMock.Setup(x => x.GetOrganizationBusinessDate(It.IsAny<string>()))
            .Returns(DateOnly.FromDateTime(DateTime.UtcNow));

        // إعداد بيانات محاكاة (موقع قابل للبيع وآخر غیر قابل)
        // يجب أن تضيف الـ Stub Entities للـ Location و Batch هنا بالقيم المناسبة.

        // Act
        var result = await _sut.GetCanonicalInventoryAsync(orgId, branchId, null, null, null, 10, ct);

        // Assert
        result.IsSuccess.Should().BeTrue();
        // أضف الـ Asserts الخاصة بك للتحقق من استبعاد الـ Quarantine[cite: 1]
    }
}
