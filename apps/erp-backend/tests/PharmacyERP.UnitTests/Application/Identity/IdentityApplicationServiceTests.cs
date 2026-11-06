using System.Reflection;
using Moq;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Common.Interfaces.CrossModule;
using PharmacyERP.Application.Common.Interfaces.Integration;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Application.Features.Identity.DTOs;
using PharmacyERP.Application.Features.Identity.Interfaces;
using PharmacyERP.Application.Features.Identity.Services.Implementations;
using PharmacyERP.Domain.Entities.Identity;
using PharmacyERP.Domain.Entities.Integration;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Domain.ValueObjects;
using PharmacyERP.Infrastructure.Services.Context;

namespace PharmacyERP.UnitTests.Application.Identity;

public sealed class IdentityApplicationServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task OrganizationProvisioning_CommitsSeedAndInitialCursorInOneTenantTransaction()
    {
        var organizations = new Mock<IOrganizationRepository>();
        var branches = new Mock<IBranchRepository>();
        var employees = new Mock<IEmployeeRepository>();
        var users = new Mock<IUserAccountRepository>();
        var cursors = new Mock<IGenericRepository<OutboxEventCursor>>();
        var passwordHasher = new Mock<IPasswordHasherService>();
        var locationSeeder = new Mock<IBranchDefaultLocationSeeder>();
        var unitOfWork = NewUnitOfWorkMock();
        var audit = new Mock<IAuditLogger>();
        var outbox = new Mock<IOutboxService>();
        var tenant = new TenantContext();
        var currentUser = new Mock<ICurrentUser>();
        var clock = new Mock<IDateTimeProvider>();
        Organization? createdOrganization = null;
        OutboxEventCursor? createdCursor = null;

        currentUser.SetupGet(x => x.Role).Returns("PlatformProvisioner");
        clock.SetupGet(x => x.UtcNow).Returns(Now);
        organizations.Setup(x => x.ExistsByCodeAsync("ACME", It.IsAny<CancellationToken>())).ReturnsAsync(false);
        organizations.Setup(x => x.AddAsync(It.IsAny<Organization>(), It.IsAny<CancellationToken>()))
            .Callback<Organization, CancellationToken>((value, _) => createdOrganization = value)
            .Returns(Task.CompletedTask);
        branches.Setup(x => x.AddAsync(It.IsAny<Branch>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        employees.Setup(x => x.AddAsync(It.IsAny<Employee>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        users.Setup(x => x.AddAsync(It.IsAny<UserAccount>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        cursors.Setup(x => x.AddAsync(It.IsAny<OutboxEventCursor>(), It.IsAny<CancellationToken>()))
            .Callback<OutboxEventCursor, CancellationToken>((value, _) => createdCursor = value)
            .Returns(Task.CompletedTask);
        passwordHasher.Setup(x => x.HashPassword(It.IsAny<UserAccount>(), "StrongPassword123!")).Returns("password-hash");
        locationSeeder.Setup(x => x.SeedDefaultLocationsAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        audit.SetReturnsDefault(Task.CompletedTask);
        outbox.SetReturnsDefault(Task.CompletedTask);

        var service = new OrganizationProvisioningService(
            organizations.Object, branches.Object, employees.Object, users.Object, cursors.Object,
            passwordHasher.Object, locationSeeder.Object, unitOfWork.Object, audit.Object, outbox.Object,
            tenant, currentUser.Object, clock.Object);

        var result = await service.CreateAsync(ValidOrganizationRequest());

        Assert.True(result.IsSuccess);
        Assert.NotNull(createdOrganization);
        Assert.NotNull(createdCursor);
        Assert.Equal(createdOrganization.OrganizationId, createdCursor.OrganizationId);
        Assert.Equal(createdOrganization.OrganizationId, tenant.OrganizationId);
        organizations.Verify(x => x.AddAsync(createdOrganization, It.IsAny<CancellationToken>()), Times.Once);
        branches.Verify(x => x.AddAsync(It.IsAny<Branch>(), It.IsAny<CancellationToken>()), Times.Once);
        employees.Verify(x => x.AddAsync(It.IsAny<Employee>(), It.IsAny<CancellationToken>()), Times.Once);
        users.Verify(x => x.AddAsync(It.IsAny<UserAccount>(), It.IsAny<CancellationToken>()), Times.Once);
        locationSeeder.Verify(x => x.SeedDefaultLocationsAsync(createdOrganization.OrganizationId, It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Once);
        unitOfWork.Verify(x => x.BeginTransactionAsync(It.IsAny<CancellationToken>()), Times.Exactly(2));
        unitOfWork.Verify(x => x.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
        unitOfWork.Verify(x => x.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task OrganizationProvisioning_RollsBackWhenAWriteFails()
    {
        var organizations = new Mock<IOrganizationRepository>();
        var branches = new Mock<IBranchRepository>();
        var employees = new Mock<IEmployeeRepository>();
        var users = new Mock<IUserAccountRepository>();
        var cursors = new Mock<IGenericRepository<OutboxEventCursor>>();
        var passwordHasher = new Mock<IPasswordHasherService>();
        var locationSeeder = new Mock<IBranchDefaultLocationSeeder>();
        var unitOfWork = NewUnitOfWorkMock();
        var audit = new Mock<IAuditLogger>();
        var outbox = new Mock<IOutboxService>();
        var tenant = new TenantContext();
        var currentUser = new Mock<ICurrentUser>();
        var clock = new Mock<IDateTimeProvider>();

        currentUser.SetupGet(x => x.Role).Returns("PlatformProvisioner");
        clock.SetupGet(x => x.UtcNow).Returns(Now);
        organizations.Setup(x => x.ExistsByCodeAsync("ACME", It.IsAny<CancellationToken>())).ReturnsAsync(false);
        organizations.Setup(x => x.AddAsync(It.IsAny<Organization>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        branches.Setup(x => x.AddAsync(It.IsAny<Branch>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("write failed"));
        passwordHasher.Setup(x => x.HashPassword(It.IsAny<UserAccount>(), "StrongPassword123!")).Returns("password-hash");
        audit.SetReturnsDefault(Task.CompletedTask);
        outbox.SetReturnsDefault(Task.CompletedTask);

        var service = new OrganizationProvisioningService(
            organizations.Object, branches.Object, employees.Object, users.Object, cursors.Object,
            passwordHasher.Object, locationSeeder.Object, unitOfWork.Object, audit.Object, outbox.Object,
            tenant, currentUser.Object, clock.Object);

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.CreateAsync(ValidOrganizationRequest()));

        unitOfWork.Verify(x => x.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
        unitOfWork.Verify(x => x.RollbackTransactionAsync(It.IsAny<CancellationToken>()), Times.Exactly(2));
    }

    [Fact]
    public async Task RefreshAsync_ReusedConsumedTokenRevokesItsEntireFamilyAndCommits()
    {
        var organizationId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var familyId = Guid.NewGuid();
        var token = UserRefreshToken.Create(organizationId, userId, new byte[32], familyId, Now.AddHours(-1), Now.AddDays(1));
        token.Consume(Now.AddMinutes(-1));
        var organizations = new Mock<IOrganizationRepository>();
        var users = new Mock<IUserAccountRepository>();
        var tokens = new Mock<IUserRefreshTokenRepository>();
        var passwordHasher = new Mock<IPasswordHasherService>();
        var jwt = new Mock<IJwtTokenGenerator>();
        var unitOfWork = NewUnitOfWorkMock();
        var audit = new Mock<IAuditLogger>();
        var outbox = new Mock<IOutboxService>();
        var tenant = new TenantContext();
        var currentUser = new Mock<ICurrentUser>();
        var clock = new Mock<IDateTimeProvider>();

        tokens.Setup(x => x.GetByTokenHashAsync(It.IsAny<byte[]>(), It.IsAny<CancellationToken>())).ReturnsAsync(token);
        tokens.Setup(x => x.RevokeFamilyAsync(organizationId, familyId, Now, It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        clock.SetupGet(x => x.UtcNow).Returns(Now);
        audit.SetReturnsDefault(Task.CompletedTask);
        outbox.SetReturnsDefault(Task.CompletedTask);

        var service = new AuthService(organizations.Object, users.Object, tokens.Object, passwordHasher.Object, jwt.Object,
            unitOfWork.Object, audit.Object, outbox.Object, tenant, currentUser.Object, clock.Object);

        var result = await service.RefreshAsync(new RefreshTokenRequest { RefreshToken = "already-consumed-secret" });

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.UNAUTHORIZED, result.ErrorCode);
        tokens.Verify(x => x.RevokeFamilyAsync(organizationId, familyId, Now, It.IsAny<CancellationToken>()), Times.Once);
        unitOfWork.Verify(x => x.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ResetPassword_ChangesHashAndRevokesAllPreviousSessions()
    {
        var organizationId = Guid.NewGuid();
        var employee = Employee.Create(organizationId, Guid.NewGuid(), "EMP-1", "Test Employee", null, null, "Pharmacist",
            Address(), new DateOnly(2020, 1, 1));
        var user = UserAccount.Create(organizationId, employee.EmployeeId, "pharmacist", "old-hash",
            UserRole.Pharmacist, BranchScope.ASSIGNED);
        SetNavigation(user, nameof(UserAccount.Employee), employee);
        var users = new Mock<IUserAccountRepository>();
        var employees = new Mock<IEmployeeRepository>();
        var branches = new Mock<IBranchRepository>();
        var tokens = new Mock<IUserRefreshTokenRepository>();
        var passwordHasher = new Mock<IPasswordHasherService>();
        var unitOfWork = NewUnitOfWorkMock();
        var audit = new Mock<IAuditLogger>();
        var outbox = new Mock<IOutboxService>();
        var tenant = new TenantContext();
        tenant.SetTenant(organizationId);
        var currentUser = new Mock<ICurrentUser>();
        var clock = new Mock<IDateTimeProvider>();

        currentUser.SetupGet(x => x.Role).Returns(nameof(UserRole.Admin));
        users.Setup(x => x.GetByIdWithAccessAsync(organizationId, user.UserId, It.IsAny<CancellationToken>())).ReturnsAsync(user);
        passwordHasher.Setup(x => x.HashPassword(user, "NewPassword123!")).Returns("new-password-hash");
        tokens.Setup(x => x.RevokeAllUserTokensAsync(organizationId, user.UserId, Now, It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        clock.SetupGet(x => x.UtcNow).Returns(Now);
        audit.SetReturnsDefault(Task.CompletedTask);
        outbox.SetReturnsDefault(Task.CompletedTask);

        var service = new UserService(users.Object, employees.Object, branches.Object, tokens.Object, passwordHasher.Object,
            unitOfWork.Object, audit.Object, outbox.Object, tenant, currentUser.Object, clock.Object);

        var result = await service.ResetPasswordAsync(user.UserId, new ResetPasswordRequest { NewPassword = "NewPassword123!" });

        Assert.True(result.IsSuccess);
        Assert.Equal("new-password-hash", user.PasswordHash);
        tokens.Verify(x => x.RevokeAllUserTokensAsync(organizationId, user.UserId, Now, It.IsAny<CancellationToken>()), Times.Once);
        unitOfWork.Verify(x => x.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    private static Mock<IUnitOfWork> NewUnitOfWorkMock()
    {
        var mock = new Mock<IUnitOfWork>();
        mock.SetReturnsDefault(Task.CompletedTask);
        mock.SetReturnsDefault(Task.FromResult(0));
        return mock;
    }

    private static CreateOrganizationRequest ValidOrganizationRequest() => new()
    {
        OrganizationCode = "ACME",
        Name = "Acme Pharmacy",
        BaseCurrency = "EGP",
        TimeZoneId = "Africa/Cairo",
        Address = AddressDto(),
        InitialBranch = new CreateBranchRequest { BranchCode = "MAIN", Name = "Main Branch", Address = AddressDto() },
        InitialEmployee = new CreateEmployeeRequest
        {
            EmployeeNo = "EMP-1",
            FullName = "First Admin",
            JobTitle = "Pharmacist",
            HiredOn = new DateOnly(2020, 1, 1),
            Address = AddressDto()
        },
        InitialAdmin = new CreateUserRequest { Username = "admin", Password = "StrongPassword123!" }
    };

    private static AddressDto AddressDto() => new()
    {
        Line1 = "1 Main Street",
        City = "Cairo",
        CountryCode = "EG"
    };

    private static Address Address() => new("1 Main Street", null, "Cairo", null, null, "EG");

    private static void SetNavigation<TEntity>(TEntity entity, string propertyName, object value)
        => typeof(TEntity).GetProperty(propertyName, BindingFlags.Instance | BindingFlags.Public)!
            .SetValue(entity, value);
}
