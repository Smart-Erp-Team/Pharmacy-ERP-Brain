using PharmacyERP.Application.Features.Identity.DTOs;

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
        var idempotency = new PassThroughIdempotencyService();
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
            idempotency, tenant, currentUser.Object, clock.Object);

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
        var idempotency = new PassThroughIdempotencyService();
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
            idempotency, tenant, currentUser.Object, clock.Object);

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
        var runtimeMode = new Mock<IRuntimeModeProvider>();
        runtimeMode.SetupGet(x => x.CurrentMode).Returns(ErpRuntimeMode.Cloud);

        tokens.Setup(x => x.FindOrganizationIdByTokenHashAsync(It.IsAny<byte[]>(), It.IsAny<CancellationToken>())).ReturnsAsync(organizationId);
        tokens.Setup(x => x.GetByTokenHashAsync(It.IsAny<byte[]>(), It.IsAny<CancellationToken>())).ReturnsAsync(token);
        tokens.Setup(x => x.RevokeFamilyAsync(organizationId, familyId, Now, It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        clock.SetupGet(x => x.UtcNow).Returns(Now);
        audit.SetReturnsDefault(Task.CompletedTask);
        outbox.SetReturnsDefault(Task.CompletedTask);

        var service = new AuthService(organizations.Object, users.Object, tokens.Object, passwordHasher.Object, jwt.Object,
            unitOfWork.Object, audit.Object, outbox.Object, tenant, currentUser.Object, clock.Object, runtimeMode.Object);

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
        var idempotency = new PassThroughIdempotencyService();
        var tenant = new TenantContext();
        tenant.SetTenant(organizationId);
        var currentUser = new Mock<ICurrentUser>();
        var clock = new Mock<IDateTimeProvider>();

        currentUser.SetupGet(x => x.Role).Returns(nameof(UserRole.Admin));
        currentUser.SetupGet(x => x.BranchScope).Returns(nameof(BranchScope.ALL));
        users.Setup(x => x.GetByIdWithAccessAsync(organizationId, user.UserId, It.IsAny<CancellationToken>())).ReturnsAsync(user);
        passwordHasher.Setup(x => x.HashPassword(user, "NewPassword123!")).Returns("new-password-hash");
        tokens.Setup(x => x.RevokeAllUserTokensAsync(organizationId, user.UserId, Now, It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        clock.SetupGet(x => x.UtcNow).Returns(Now);
        audit.SetReturnsDefault(Task.CompletedTask);
        outbox.SetReturnsDefault(Task.CompletedTask);

        var service = new UserService(users.Object, employees.Object, branches.Object, tokens.Object, passwordHasher.Object,
            unitOfWork.Object, audit.Object, outbox.Object, idempotency, tenant, currentUser.Object, clock.Object,
            new UserManagementAuthorizer(currentUser.Object));

        var result = await service.ResetPasswordAsync(user.UserId, new ResetPasswordRequest { NewPassword = "NewPassword123!", IdempotencyKey = "reset-1" });

        Assert.True(result.IsSuccess);
        Assert.Equal("new-password-hash", user.PasswordHash);
        tokens.Verify(x => x.RevokeAllUserTokensAsync(organizationId, user.UserId, Now, It.IsAny<CancellationToken>()), Times.Once);
        unitOfWork.Verify(x => x.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task AssignedAdmin_CannotPromoteSelfToAllScope_OrTakeOverOrgOwner()
    {
        var organizationId = Guid.NewGuid();
        var branchA = Guid.NewGuid();
        var branchB = Guid.NewGuid();

        var ownerEmployee = Employee.Create(organizationId, branchB, "EMP-OWNER", "Org Owner", null, null, "Owner", Address(), new DateOnly(2020, 1, 1));
        var owner = UserAccount.Create(organizationId, ownerEmployee.EmployeeId, "owner", "hash", UserRole.Admin, BranchScope.ALL);
        SetNavigation(owner, nameof(UserAccount.Employee), ownerEmployee);

        var assignedAdminEmployee = Employee.Create(organizationId, branchA, "EMP-ADMIN-A", "Branch A Admin", null, null, "Admin", Address(), new DateOnly(2020, 1, 1));
        var assignedAdmin = UserAccount.Create(organizationId, assignedAdminEmployee.EmployeeId, "admin_a", "hash", UserRole.Admin, BranchScope.ASSIGNED);
        assignedAdmin.BranchAccesses.Add(UserBranchAccess.Create(organizationId, assignedAdmin.UserId, branchA));
        SetNavigation(assignedAdmin, nameof(UserAccount.Employee), assignedAdminEmployee);

        var users = new Mock<IUserAccountRepository>();
        var employees = new Mock<IEmployeeRepository>();
        var branches = new Mock<IBranchRepository>();
        var tokens = new Mock<IUserRefreshTokenRepository>();
        var passwordHasher = new Mock<IPasswordHasherService>();
        var unitOfWork = NewUnitOfWorkMock();
        var audit = new Mock<IAuditLogger>();
        var outbox = new Mock<IOutboxService>();
        var idempotency = new PassThroughIdempotencyService();
        var tenant = new TenantContext();
        tenant.SetTenant(organizationId);
        var currentUser = new Mock<ICurrentUser>();
        var clock = new Mock<IDateTimeProvider>();

        currentUser.SetupGet(x => x.UserId).Returns(assignedAdmin.UserId);
        currentUser.SetupGet(x => x.Role).Returns(nameof(UserRole.Admin));
        currentUser.SetupGet(x => x.BranchScope).Returns(nameof(BranchScope.ASSIGNED));
        currentUser.SetupGet(x => x.AuthorizedBranchIds).Returns(new HashSet<Guid> { branchA });
        currentUser.Setup(x => x.CanAccessBranch(It.IsAny<Guid>())).Returns<Guid>(id => id == branchA);
        clock.SetupGet(x => x.UtcNow).Returns(Now);
        users.Setup(x => x.GetByIdWithAccessAsync(organizationId, assignedAdmin.UserId, It.IsAny<CancellationToken>())).ReturnsAsync(assignedAdmin);
        users.Setup(x => x.GetByIdWithAccessAsync(organizationId, owner.UserId, It.IsAny<CancellationToken>())).ReturnsAsync(owner);

        var service = new UserService(users.Object, employees.Object, branches.Object, tokens.Object, passwordHasher.Object,
            unitOfWork.Object, audit.Object, outbox.Object, idempotency, tenant, currentUser.Object, clock.Object,
            new UserManagementAuthorizer(currentUser.Object));

        // 1. Self-promotion to ALL scope is forbidden
        var selfPromote = await service.UpdateAsync(assignedAdmin.UserId, new UpdateUserRequest
        {
            Role = UserRole.Admin,
            BranchScope = BranchScope.ALL,
            BranchIds = Array.Empty<Guid>(),
            IdempotencyKey = "self-promote-1"
        });
        Assert.False(selfPromote.IsSuccess);
        Assert.Equal(ErrorCode.FORBIDDEN, selfPromote.ErrorCode);

        // 2. Taking over org owner via password reset is forbidden
        var ownerReset = await service.ResetPasswordAsync(owner.UserId, new ResetPasswordRequest { NewPassword = "AttackerPassword123!", IdempotencyKey = "owner-reset-1" });
        Assert.False(ownerReset.IsSuccess);
        Assert.Equal(ErrorCode.FORBIDDEN, ownerReset.ErrorCode);

        // 3. Deactivating org owner is forbidden
        var ownerDeactivate = await service.UpdateAsync(owner.UserId, new UpdateUserRequest
        {
            Role = UserRole.Admin,
            BranchScope = BranchScope.ALL,
            BranchIds = Array.Empty<Guid>(),
            IsActive = false,
            IdempotencyKey = "owner-deactivate-1"
        });
        Assert.False(ownerDeactivate.IsSuccess);
        Assert.Equal(ErrorCode.FORBIDDEN, ownerDeactivate.ErrorCode);

        // 4. Revoking org owner sessions is forbidden
        var ownerRevoke = await service.RevokeSessionsAsync(owner.UserId, "owner-revoke-1");
        Assert.False(ownerRevoke.IsSuccess);
        Assert.Equal(ErrorCode.FORBIDDEN, ownerRevoke.ErrorCode);

        unitOfWork.Verify(x => x.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task UpdateAsync_RoleOrScopeChange_RevokesAllUserRefreshTokens()
    {
        var organizationId = Guid.NewGuid();
        var branchA = Guid.NewGuid();
        var branch = Branch.Create(organizationId, "BR-A", "Branch A", Address());
        typeof(Branch).GetProperty(nameof(Branch.BranchId))!.SetValue(branch, branchA);

        var employee = Employee.Create(organizationId, branchA, "EMP-2", "Cashier", null, null, "Cashier", Address(), new DateOnly(2020, 1, 1));
        var target = UserAccount.Create(organizationId, employee.EmployeeId, "cashier1", "hash", UserRole.Cashier, BranchScope.ASSIGNED);
        target.BranchAccesses.Add(UserBranchAccess.Create(organizationId, target.UserId, branchA));
        SetNavigation(target, nameof(UserAccount.Employee), employee);

        var users = new Mock<IUserAccountRepository>();
        var employees = new Mock<IEmployeeRepository>();
        var branches = new Mock<IBranchRepository>();
        var tokens = new Mock<IUserRefreshTokenRepository>();
        var passwordHasher = new Mock<IPasswordHasherService>();
        var unitOfWork = NewUnitOfWorkMock();
        var audit = new Mock<IAuditLogger>();
        var outbox = new Mock<IOutboxService>();
        var idempotency = new PassThroughIdempotencyService();
        var tenant = new TenantContext();
        tenant.SetTenant(organizationId);
        var currentUser = new Mock<ICurrentUser>();
        var clock = new Mock<IDateTimeProvider>();

        currentUser.SetupGet(x => x.UserId).Returns(Guid.NewGuid());
        currentUser.SetupGet(x => x.Role).Returns(nameof(UserRole.Admin));
        currentUser.SetupGet(x => x.BranchScope).Returns(nameof(BranchScope.ALL));
        clock.SetupGet(x => x.UtcNow).Returns(Now);
        users.Setup(x => x.GetByIdWithAccessAsync(organizationId, target.UserId, It.IsAny<CancellationToken>())).ReturnsAsync(target);
        branches.Setup(x => x.GetByIdAsync(organizationId, branchA, It.IsAny<CancellationToken>())).ReturnsAsync(branch);
        branches.Setup(x => x.CountActiveByIdsAsync(organizationId, It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>())).ReturnsAsync(1);
        users.Setup(x => x.ReplaceBranchAccessAsync(organizationId, target.UserId, It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        tokens.Setup(x => x.RevokeAllUserTokensAsync(organizationId, target.UserId, Now, It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
        audit.SetReturnsDefault(Task.CompletedTask);
        outbox.SetReturnsDefault(Task.CompletedTask);

        var service = new UserService(users.Object, employees.Object, branches.Object, tokens.Object, passwordHasher.Object,
            unitOfWork.Object, audit.Object, outbox.Object, idempotency, tenant, currentUser.Object, clock.Object,
            new UserManagementAuthorizer(currentUser.Object));

        var result = await service.UpdateAsync(target.UserId, new UpdateUserRequest
        {
            Role = UserRole.Pharmacist,
            BranchScope = BranchScope.ASSIGNED,
            BranchIds = new[] { branchA },
            IdempotencyKey = "role-change-1"
        });

        Assert.True(result.IsSuccess);
        tokens.Verify(x => x.RevokeAllUserTokensAsync(organizationId, target.UserId, Now, It.IsAny<CancellationToken>()), Times.Once);
        unitOfWork.Verify(x => x.CommitTransactionAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public void GetCurrentUser_ReturnsAuthenticatedUsernameFromCurrentUser()
    {
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(x => x.IsAuthenticated).Returns(true);
        currentUser.SetupGet(x => x.UserId).Returns(Guid.NewGuid());
        currentUser.SetupGet(x => x.EmployeeId).Returns(Guid.NewGuid());
        currentUser.SetupGet(x => x.OrganizationId).Returns(Guid.NewGuid());
        currentUser.SetupGet(x => x.Username).Returns("admin@medcare.test");
        currentUser.SetupGet(x => x.Role).Returns(nameof(UserRole.Admin));
        currentUser.SetupGet(x => x.BranchScope).Returns(nameof(BranchScope.ALL));
        currentUser.SetupGet(x => x.AuthorizedBranchIds).Returns(new HashSet<Guid>());
        currentUser.SetupGet(x => x.Scopes).Returns(new HashSet<string> { "user:admin" });

        var runtimeMode = new Mock<IRuntimeModeProvider>();
        runtimeMode.SetupGet(x => x.CurrentMode).Returns(ErpRuntimeMode.Cloud);

        var service = new AuthService(
            new Mock<IOrganizationRepository>().Object,
            new Mock<IUserAccountRepository>().Object,
            new Mock<IUserRefreshTokenRepository>().Object,
            new Mock<IPasswordHasherService>().Object,
            new Mock<IJwtTokenGenerator>().Object,
            NewUnitOfWorkMock().Object,
            new Mock<IAuditLogger>().Object,
            new Mock<IOutboxService>().Object,
            new TenantContext(),
            currentUser.Object,
            new Mock<IDateTimeProvider>().Object,
            runtimeMode.Object);

        var result = service.GetCurrentUser();

        Assert.True(result.IsSuccess);
        Assert.Equal("admin@medcare.test", result.Value!.Username);
    }

    private static Mock<IIdempotencyService> NewIdempotencyMock()
    {
        var mock = new Mock<IIdempotencyService>();
        mock.SetReturnsDefault(Task.CompletedTask);
        return mock;
    }

    private sealed class PassThroughIdempotencyService : IIdempotencyService
    {
        public Task<IdempotencyCheckResult<TResponse>> CheckAsync<TRequest, TResponse>(
            string operationScope, string idempotencyKey, Guid? branchId, TRequest requestPayload, CancellationToken ct = default)
            => Task.FromResult(new IdempotencyCheckResult<TResponse> { IsReplay = false });

        public Task<IdempotencyCheckResult<TResponse>> CheckGlobalAsync<TRequest, TResponse>(
            string operationScope, string idempotencyKey, TRequest requestPayload, CancellationToken ct = default)
            => Task.FromResult(new IdempotencyCheckResult<TResponse> { IsReplay = false });

        public Task PersistResponseAsync<TRequest, TResponse>(
            string operationScope, string idempotencyKey, Guid? branchId, TRequest requestPayload, TResponse responseBody, CancellationToken ct = default)
            => Task.CompletedTask;
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
        InitialAdmin = new CreateUserRequest { Username = "admin", Password = "StrongPassword123!" },
        IdempotencyKey = "org-prov-1"
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
