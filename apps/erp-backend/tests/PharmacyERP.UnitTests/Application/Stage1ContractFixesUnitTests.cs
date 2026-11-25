using System.Security.Cryptography;
using PharmacyERP.Application.Features.Catalog.DTOs;
using PharmacyERP.Application.Features.Identity.DTOs;
using PharmacyERP.Application.Features.Inventory.DTOs;
using PharmacyERP.Application.Features.Inventory.Validators;

namespace PharmacyERP.UnitTests.Application;

/// <summary>
/// Focused unit tests verifying Stage 1 frontend-blocking contract fixes:
/// partial PATCH semantics, 500-preventing 422 validation guards, snake_case error.details,
/// runtime-mode &amp; auth consistency, organization timezone expiry, outbox enrollment cursor,
/// and multi-branch employee listing.
/// </summary>
public sealed class Stage1ContractFixesUnitTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 25, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void InventoryLocationValidators_RejectsOversizedStringsAndInvalidLocationType_WithSnakeCaseDetails()
    {
        var createReq = new CreateInventoryLocationRequest(
            BranchId: Guid.Empty,
            LocationCode: new string('C', 31),
            Name: new string('N', 101),
            LocationType: (LocationType)999,
            IsSellable: true,
            IdempotencyKey: new string('K', 101));

        var createErrors = InventoryLocationValidators.ValidateCreate(createReq);

        Assert.Contains(createErrors, e => e.Field == "branch_id");
        Assert.Contains(createErrors, e => e.Field == "location_code");
        Assert.Contains(createErrors, e => e.Field == "name");
        Assert.Contains(createErrors, e => e.Field == "location_type");
        Assert.Contains(createErrors, e => e.Field == "idempotency_key");

        var updateReq = new UpdateInventoryLocationRequest(
            Name: new string('U', 101),
            IsSellable: null,
            IsActive: null,
            IdempotencyKey: new string('K', 101));

        var updateErrors = InventoryLocationValidators.ValidateUpdate(updateReq);
        Assert.Contains(updateErrors, e => e.Field == "name");
        Assert.Contains(updateErrors, e => e.Field == "idempotency_key");
    }

    [Fact]
    public void InventoryAdjustmentValidators_AllowsNullLinesAndReasonCodeForReversal_AndRejectsOversizedOrBadDates()
    {
        var reversal = new CreateInventoryAdjustmentRequest(
            BranchId: Guid.NewGuid(),
            TransactionType: InventoryTransactionType.REVERSAL,
            ReasonCode: null,
            Note: null,
            ReversesInventoryTxnId: Guid.NewGuid(),
            Lines: null,
            IdempotencyKey: "rev-key-1");

        Assert.Empty(InventoryAdjustmentValidators.ValidateAdjustment(reversal));

        var invalidAdjustment = new CreateInventoryAdjustmentRequest(
            BranchId: Guid.NewGuid(),
            TransactionType: InventoryTransactionType.ADJUSTMENT_IN,
            ReasonCode: new string('R', 41),
            Note: new string('N', 501),
            ReversesInventoryTxnId: null,
            Lines: new[]
            {
                new CreateInventoryAdjustmentLineRequest(
                    Guid.NewGuid(),
                    Guid.NewGuid(),
                    Guid.NewGuid(),
                    new string('B', 81),
                    new DateOnly(2027, 6, 1),
                    new DateOnly(2027, 1, 1),
                    5m,
                    10m)
            },
            IdempotencyKey: new string('K', 101));

        var errors = InventoryAdjustmentValidators.ValidateAdjustment(invalidAdjustment);
        Assert.Contains(errors, e => e.Field == "reason_code");
        Assert.Contains(errors, e => e.Field == "note");
        Assert.Contains(errors, e => e.Field == "idempotency_key");
        Assert.Contains(errors, e => e.Field == "lines[0].batch_number");
        Assert.Contains(errors, e => e.Field == "lines[0].manufactured_on");
    }

    [Fact]
    public async Task InventoryQueryAndLocationServices_RejectEmptyBranchIdAndInvalidPage_BeforeBranchAccessCheck()
    {
        var orgId = Guid.NewGuid();
        var tenant = new Mock<ITenantContext>();
        tenant.SetupGet(t => t.OrganizationId).Returns(orgId);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(u => u.Role).Returns(UserRole.Admin.ToString());
        currentUser.Setup(u => u.CanAccessBranch(It.IsAny<Guid>())).Returns(false);

        var uow = new Mock<IUnitOfWork>();
        var dateProvider = new Mock<IDateTimeProvider>();

        var queryService = new InventoryQueryService(
            new Mock<IStockBalanceRepository>().Object,
            new Mock<IInventoryTxnRepository>().Object,
            new Mock<IInventoryBatchRepository>().Object,
            uow.Object,
            tenant.Object,
            currentUser.Object,
            dateProvider.Object);

        var balancesResult = await queryService.GetBalancesAsync(Guid.Empty, null, null, null, 0, 201);
        Assert.False(balancesResult.IsSuccess);
        Assert.Equal(ErrorCode.VALIDATION_ERROR, balancesResult.ErrorCode);
        Assert.Contains(balancesResult.ErrorDetails!, d => d.Field == "branch_id");
        Assert.Contains(balancesResult.ErrorDetails!, d => d.Field == "page");
        Assert.Contains(balancesResult.ErrorDetails!, d => d.Field == "page_size");

        var summaryResult = await queryService.GetProductSummaryAsync(Guid.Empty, Guid.Empty);
        Assert.False(summaryResult.IsSuccess);
        Assert.Equal(ErrorCode.VALIDATION_ERROR, summaryResult.ErrorCode);
        Assert.Contains(summaryResult.ErrorDetails!, d => d.Field == "branch_id");
        Assert.Contains(summaryResult.ErrorDetails!, d => d.Field == "product_id");

        var txnsResult = await queryService.GetTransactionsAsync(Guid.Empty, null, null, null, null, 0, 500);
        Assert.False(txnsResult.IsSuccess);
        Assert.Equal(ErrorCode.VALIDATION_ERROR, txnsResult.ErrorCode);
        Assert.Contains(txnsResult.ErrorDetails!, d => d.Field == "branch_id");
        Assert.Contains(txnsResult.ErrorDetails!, d => d.Field == "page");
        Assert.Contains(txnsResult.ErrorDetails!, d => d.Field == "page_size");

        var batchesResult = await queryService.GetBatchesAsync(null, null, null, 0, 201);
        Assert.False(batchesResult.IsSuccess);
        Assert.Equal(ErrorCode.VALIDATION_ERROR, batchesResult.ErrorCode);
        Assert.Contains(batchesResult.ErrorDetails!, d => d.Field == "page");
        Assert.Contains(batchesResult.ErrorDetails!, d => d.Field == "page_size");

        var locationService = new InventoryLocationService(
            new Mock<IInventoryLocationRepository>().Object,
            tenant.Object,
            currentUser.Object,
            uow.Object,
            dateProvider.Object,
            new Mock<IIdempotencyService>().Object,
            new Mock<IAuditLogger>().Object,
            new Mock<IOutboxService>().Object);

        var locationsResult = await locationService.GetPagedAsync(Guid.Empty, null, false, -1, 0);
        Assert.False(locationsResult.IsSuccess);
        Assert.Equal(ErrorCode.VALIDATION_ERROR, locationsResult.ErrorCode);
        Assert.Contains(locationsResult.ErrorDetails!, d => d.Field == "branch_id");
        Assert.Contains(locationsResult.ErrorDetails!, d => d.Field == "page");
        Assert.Contains(locationsResult.ErrorDetails!, d => d.Field == "page_size");

        currentUser.Verify(u => u.CanAccessBranch(It.IsAny<Guid>()), Times.Never);
    }

    [Fact]
    public async Task InventoryQueries_UseOrganizationTimeZoneId_InsteadOfHardcodedUtc()
    {
        var org = Organization.Create("CAIRO", "Cairo Pharma", "EGP", "Africa/Cairo", new Address("1 St", null, "Cairo", null, null, "EG"));
        var branch = Branch.Create(org.OrganizationId, "BR-1", "Main", new Address("1 St", null, "Cairo", null, null, "EG"));

        var orgRepo = new Mock<IOrganizationRepository>();
        orgRepo.Setup(r => r.GetByIdAsync(org.OrganizationId, It.IsAny<CancellationToken>())).ReturnsAsync(org);

        var branchRepo = new Mock<IBranchRepository>();
        branchRepo.Setup(r => r.GetByIdAsync(org.OrganizationId, branch.BranchId, It.IsAny<CancellationToken>())).ReturnsAsync(branch);

        var stockRepo = new Mock<IStockBalanceRepository>();
        stockRepo.Setup(r => r.GetBalancesWithDetailsAsync(org.OrganizationId, branch.BranchId, It.IsAny<Guid?>(), null, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<StockBalance>());
        stockRepo.Setup(r => r.GetPagedBalancesWithDetailsAsync(org.OrganizationId, branch.BranchId, It.IsAny<Guid?>(), null, null, 1, 25, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PagedResult<StockBalance>(Array.Empty<StockBalance>(), 1, 25, 0));
        stockRepo.Setup(r => r.GetCanonicalInventoryPageAsync(org.OrganizationId, branch.BranchId, null, null, 0, 100, It.IsAny<CancellationToken>()))
            .ReturnsAsync((new List<StockBalance>(), 0, false));

        var tenant = new Mock<ITenantContext>();
        tenant.SetupGet(t => t.OrganizationId).Returns(org.OrganizationId);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(u => u.Role).Returns(UserRole.Admin.ToString());
        currentUser.Setup(u => u.CanAccessBranch(branch.BranchId)).Returns(true);

        var uow = new Mock<IUnitOfWork>();
        var dateProvider = new Mock<IDateTimeProvider>();
        dateProvider.Setup(d => d.GetOrganizationBusinessDate("Africa/Cairo")).Returns(new DateOnly(2026, 11, 25));

        var queryService = new InventoryQueryService(
            stockRepo.Object,
            new Mock<IInventoryTxnRepository>().Object,
            new Mock<IInventoryBatchRepository>().Object,
            uow.Object,
            tenant.Object,
            currentUser.Object,
            dateProvider.Object,
            orgRepo.Object);

        Assert.True((await queryService.GetBalancesAsync(branch.BranchId, null, null, null)).IsSuccess);
        Assert.True((await queryService.GetProductSummaryAsync(branch.BranchId, Guid.NewGuid())).IsSuccess);

        var canonicalService = new CanonicalInventoryService(
            currentUser.Object,
            stockRepo.Object,
            branchRepo.Object,
            dateProvider.Object,
            tenant.Object,
            uow.Object,
            orgRepo.Object);

        Assert.True((await canonicalService.GetCanonicalInventoryAsync(org.OrganizationId, branch.BranchId, null, null, null, 100, CancellationToken.None)).IsSuccess);

        dateProvider.Verify(d => d.GetOrganizationBusinessDate("Africa/Cairo"), Times.Exactly(3));
        dateProvider.Verify(d => d.GetOrganizationBusinessDate("UTC"), Times.Never);
    }

    [Fact]
    public async Task InventoryAdjustmentService_InCloudMode_ReturnsNotFoundUnifiedWithMiddleware()
    {
        var runtimeMode = new Mock<IRuntimeModeProvider>();
        runtimeMode.SetupGet(r => r.CurrentMode).Returns(ErpRuntimeMode.Cloud);

        var service = new InventoryAdjustmentService(
            new Mock<IInventoryTxnRepository>().Object,
            new Mock<IStockBalanceRepository>().Object,
            new Mock<IInventoryBatchRepository>().Object,
            new Mock<IInventoryLocationRepository>().Object,
            new Mock<ITenantContext>().Object,
            new Mock<ICurrentUser>().Object,
            runtimeMode.Object,
            new Mock<IDateTimeProvider>().Object,
            new Mock<IUnitOfWork>().Object,
            new Mock<IIdempotencyService>().Object,
            new Mock<IOutboxService>().Object,
            new Mock<IAuditLogger>().Object);

        var request = new CreateInventoryAdjustmentRequest(
            Guid.NewGuid(),
            InventoryTransactionType.REVERSAL,
            null,
            null,
            Guid.NewGuid(),
            null,
            "cloud-key-1");

        var result = await service.PostAdjustmentAsync(request);
        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorCode.NOT_FOUND, result.ErrorCode);
    }

    [Fact]
    public async Task ProductCategoryService_PartialPatch_PreservesOmittedNameDescriptionAndParentCategoryId()
    {
        var orgId = Guid.NewGuid();
        var parentId = Guid.NewGuid();
        var existingCategory = ProductCategory.Create(orgId, "SUB-1", "Antibiotics", "Rx drugs", parentId);

        var repo = new Mock<IProductCategoryRepository>();
        repo.Setup(r => r.GetByIdAsync(orgId, existingCategory.CategoryId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingCategory);

        var tenant = new Mock<ITenantContext>();
        tenant.SetupGet(t => t.OrganizationId).Returns(orgId);
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(u => u.Role).Returns("Admin");
        var runtimeMode = new Mock<IRuntimeModeProvider>();
        runtimeMode.SetupGet(r => r.CurrentMode).Returns(ErpRuntimeMode.Cloud);
        var idempotency = new Mock<IIdempotencyService>();
        idempotency.Setup(i => i.CheckAsync<object, ProductCategoryDto>(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<object>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new IdempotencyCheckResult<ProductCategoryDto>());

        var service = new ProductCategoryService(
            repo.Object,
            new Mock<IUnitOfWork>().Object,
            tenant.Object,
            currentUser.Object,
            runtimeMode.Object,
            idempotency.Object,
            new Mock<IAuditLogger>().Object,
            new Mock<IOutboxService>().Object);

        var patchResult = await service.UpdateCategoryAsync(
            existingCategory.CategoryId,
            new UpdateProductCategoryRequest(null, null, null, false, "cat-patch-1"));

        Assert.True(patchResult.IsSuccess);
        Assert.Equal("Antibiotics", patchResult.Value!.Name);
        Assert.Equal("Rx drugs", patchResult.Value.Description);
        Assert.Equal(parentId, patchResult.Value.ParentCategoryId);
        Assert.False(patchResult.Value.IsActive);
    }

    [Fact]
    public async Task BranchService_RedeemEnrollment_ReturnsRealOutboxEventCursorSequence()
    {
        var orgId = Guid.NewGuid();
        var branch = Branch.Create(orgId, "BR-ENROLL", "Enroll Branch", new Address("1 St", null, "Cairo", null, null, "EG"));
        var clearToken = "raw-enrollment-token-secret";
        var tokenHash = SHA256.HashData(Encoding.UTF8.GetBytes(clearToken));
        var enrollment = BranchEnrollment.Create(orgId, branch.BranchId, tokenHash, Now.AddMinutes(15), Now);
        typeof(BranchEnrollment).GetProperty(nameof(BranchEnrollment.Branch))!.SetValue(enrollment, branch);

        var cursor = new OutboxEventCursor(orgId);
        for (int i = 0; i < 42; i++)
        {
            cursor.AllocateNextSequence(Now);
        }

        var enrollments = new Mock<IBranchEnrollmentRepository>();
        enrollments.Setup(e => e.FindOrganizationIdByTokenHashAsync(It.IsAny<byte[]>(), It.IsAny<CancellationToken>())).ReturnsAsync(orgId);
        enrollments.Setup(e => e.GetByTokenHashAsync(It.IsAny<byte[]>(), It.IsAny<CancellationToken>())).ReturnsAsync(enrollment);

        var cursorRepo = new Mock<IGenericRepository<OutboxEventCursor>>();
        cursorRepo.Setup(c => c.GetByIdAsync(orgId, It.IsAny<CancellationToken>())).ReturnsAsync(cursor);

        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);
        var runtimeMode = new Mock<IRuntimeModeProvider>();
        runtimeMode.SetupGet(r => r.CurrentMode).Returns(ErpRuntimeMode.Cloud);

        var service = new BranchService(
            new Mock<IBranchRepository>().Object,
            enrollments.Object,
            new Mock<IBranchDefaultLocationSeeder>().Object,
            new Mock<IUnitOfWork>().Object,
            new Mock<IAuditLogger>().Object,
            new Mock<IOutboxService>().Object,
            new Mock<IIdempotencyService>().Object,
            new TenantContext(),
            new Mock<ICurrentUser>().Object,
            clock.Object,
            runtimeMode.Object,
            cursorRepo.Object);

        var result = await service.RedeemEnrollmentAsync(new RedeemBranchEnrollmentRequest { Token = clearToken });

        Assert.True(result.IsSuccess);
        Assert.Equal(42L, result.Value!.InitialSyncCursor);
    }

    [Fact]
    public async Task EmployeeService_MultiBranchAssignedUser_ListsEmployeesWithoutBranchId_AndEmptyBranchIdCreateReturns422()
    {
        var orgId = Guid.NewGuid();
        var branch1 = Guid.NewGuid();
        var branch2 = Guid.NewGuid();
        var emp1 = Employee.Create(orgId, branch1, "E-1", "Emp One", null, null, "Pharmacist", new Address("1 St", null, "Cairo", null, null, "EG"), new DateOnly(2025, 1, 1));
        var emp2 = Employee.Create(orgId, branch2, "E-2", "Emp Two", null, null, "Cashier", new Address("2 St", null, "Cairo", null, null, "EG"), new DateOnly(2025, 1, 1));

        var empRepo = new Mock<IEmployeeRepository>();
        empRepo.Setup(r => r.GetPagedByBranchIdsAsync(orgId, It.IsAny<IReadOnlyCollection<Guid>>(), false, null, 1, 25, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PagedResult<Employee>(new[] { emp1, emp2 }, 1, 25, 2));

        var tenant = new TenantContext();
        tenant.SetTenant(orgId);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(u => u.Role).Returns(nameof(UserRole.Admin));
        currentUser.SetupGet(u => u.BranchScope).Returns(nameof(BranchScope.ASSIGNED));
        currentUser.SetupGet(u => u.AuthorizedBranchIds).Returns(new HashSet<Guid> { branch1, branch2 });
        currentUser.Setup(u => u.CanAccessBranch(It.IsAny<Guid>())).Returns<Guid>(id => id == branch1 || id == branch2);

        var service = new EmployeeService(
            empRepo.Object,
            new Mock<IBranchRepository>().Object,
            new Mock<IUnitOfWork>().Object,
            new Mock<IAuditLogger>().Object,
            new Mock<IOutboxService>().Object,
            new Mock<IIdempotencyService>().Object,
            tenant,
            currentUser.Object,
            new Mock<IDateTimeProvider>().Object);

        var listResult = await service.GetPagedAsync(null, false, null, 1, 25);
        Assert.True(listResult.IsSuccess);
        Assert.Equal(2, listResult.Value!.Items.Count);

        var createEmptyBranch = await service.CreateAsync(new CreateEmployeeRequest
        {
            BranchId = Guid.Empty,
            EmployeeNo = "E-3",
            FullName = "Invalid Branch Emp",
            JobTitle = "Cashier",
            Address = new AddressDto { Line1 = "1 St", City = "Cairo", CountryCode = "EG" },
            IdempotencyKey = "emp-empty-branch-1"
        });
        Assert.False(createEmptyBranch.IsSuccess);
        Assert.Equal(ErrorCode.VALIDATION_ERROR, createEmptyBranch.ErrorCode);
        Assert.Contains(createEmptyBranch.ErrorDetails!, d => d.Field == "branch_id");
    }

    [Fact]
    public async Task AuthService_BranchLocalLogin_EmitsAssignedBranchScopeMatchingJwtAndAuthMe()
    {
        var org = Organization.Create("LOCAL", "Local Pharma", "EGP", "Africa/Cairo", new Address("1 St", null, "Cairo", null, null, "EG"));
        var branchId = Guid.NewGuid();
        var employee = Employee.Create(org.OrganizationId, branchId, "EMP-1", "Org Admin", null, null, "Admin", new Address("1 St", null, "Cairo", null, null, "EG"), new DateOnly(2025, 1, 1));
        var admin = UserAccount.Create(org.OrganizationId, employee.EmployeeId, "owner", "hashed", UserRole.Admin, BranchScope.ALL);
        typeof(UserAccount).GetProperty(nameof(UserAccount.Employee))!.SetValue(admin, employee);

        var orgRepo = new Mock<IOrganizationRepository>();
        orgRepo.Setup(r => r.GetActiveByCodeAsync("LOCAL", It.IsAny<CancellationToken>())).ReturnsAsync(org);

        var userRepo = new Mock<IUserAccountRepository>();
        userRepo.Setup(r => r.GetForLoginAsync(org.OrganizationId, "OWNER", It.IsAny<CancellationToken>())).ReturnsAsync(admin);

        var passwordHasher = new Mock<IPasswordHasherService>();
        passwordHasher.Setup(p => p.VerifyPassword(admin, "hashed", "OwnerPassword123!")).Returns(true);

        var jwt = new Mock<IJwtTokenGenerator>();
        jwt.Setup(j => j.GenerateAccessToken(admin, It.IsAny<IReadOnlyCollection<Guid>>()))
            .Returns(new GeneratedAccessToken("fake-jwt", Now.AddHours(24), "PharmacyERP", "PharmacyERP.Api", "kid-local-1"));

        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);

        var runtimeMode = new Mock<IRuntimeModeProvider>();
        runtimeMode.SetupGet(r => r.CurrentMode).Returns(ErpRuntimeMode.BranchLocal);
        runtimeMode.SetupGet(r => r.EnrolledBranchId).Returns(branchId);

        var service = new AuthService(
            orgRepo.Object,
            userRepo.Object,
            new Mock<IUserRefreshTokenRepository>().Object,
            passwordHasher.Object,
            jwt.Object,
            new Mock<IUnitOfWork>().Object,
            new Mock<IAuditLogger>().Object,
            new Mock<IOutboxService>().Object,
            new TenantContext(),
            new Mock<ICurrentUser>().Object,
            clock.Object,
            runtimeMode.Object);

        var loginResult = await service.LoginAsync(new LoginRequest
        {
            OrganizationCode = "LOCAL",
            Username = "owner",
            Password = "OwnerPassword123!"
        });

        Assert.True(loginResult.IsSuccess);
        Assert.Equal("Bearer", loginResult.Value!.TokenType);
        Assert.Equal("PharmacyERP", loginResult.Value.Issuer);
        Assert.Equal("PharmacyERP.Api", loginResult.Value.Audience);
        Assert.Equal("kid-local-1", loginResult.Value.KeyId);
        Assert.Equal(BranchScope.ASSIGNED, loginResult.Value.User.BranchScope);
        Assert.Equal(UserRole.Admin, loginResult.Value.User.Role);
        Assert.Equal(ErpRuntimeMode.BranchLocal, loginResult.Value.User.RuntimeMode);
        Assert.Equal(new[] { branchId }, loginResult.Value.User.BranchIds);
        Assert.DoesNotContain("branch:admin", loginResult.Value.User.Scopes);
        Assert.DoesNotContain("employee:admin", loginResult.Value.User.Scopes);
        Assert.Equal(new[] { "user:admin", "inventory:read", "inventory:write", "sales:read", "sales:write" }, loginResult.Value.User.Scopes);
    }

    [Fact]
    public async Task CatalogServices_RejectInvalidPageAndPageSize_With422SnakeCaseDetails()
    {
        var orgId = Guid.NewGuid();
        var tenant = new Mock<ITenantContext>();
        tenant.SetupGet(t => t.OrganizationId).Returns(orgId);
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(u => u.Role).Returns("Admin");
        var uow = new Mock<IUnitOfWork>();

        var categoryRepo = new Mock<IProductCategoryRepository>();
        var categoryService = new ProductCategoryService(
            categoryRepo.Object,
            uow.Object,
            tenant.Object,
            currentUser.Object,
            new Mock<IRuntimeModeProvider>().Object,
            new Mock<IIdempotencyService>().Object,
            new Mock<IAuditLogger>().Object,
            new Mock<IOutboxService>().Object);

        var badCatResult = await categoryService.GetCategoriesAsync(null, false, null, page: 0, pageSize: 201);
        Assert.False(badCatResult.IsSuccess);
        Assert.Equal(ErrorCode.VALIDATION_ERROR, badCatResult.ErrorCode);
        Assert.Contains(badCatResult.ErrorDetails!, d => d.Field == "page");
        Assert.Contains(badCatResult.ErrorDetails!, d => d.Field == "page_size");

        var productRepo = new Mock<IProductRepository>();
        var productService = new ProductService(
            productRepo.Object,
            categoryRepo.Object,
            uow.Object,
            tenant.Object,
            currentUser.Object,
            new Mock<IRuntimeModeProvider>().Object,
            new Mock<IIdempotencyService>().Object,
            new Mock<IAuditLogger>().Object,
            new Mock<IOutboxService>().Object,
            new Mock<INonLotBatchInitializer>().Object,
            new Mock<IProductInventoryUsageChecker>().Object);

        var badProdResult = await productService.GetProductsAsync(null, false, null, page: -1, pageSize: 0);
        Assert.False(badProdResult.IsSuccess);
        Assert.Equal(ErrorCode.VALIDATION_ERROR, badProdResult.ErrorCode);
        Assert.Contains(badProdResult.ErrorDetails!, d => d.Field == "page");
        Assert.Contains(badProdResult.ErrorDetails!, d => d.Field == "page_size");

        uow.Verify(x => x.BeginTransactionAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AuthService_PharmacistScopesExcludeSalesWrite_AndCurrentUserDtoUsesTypedEnums()
    {
        var org = Organization.Create("SCOPEORG", "Scope Pharma", "EGP", "Africa/Cairo", new Address("1 St", null, "Cairo", null, null, "EG"));
        var branchId = Guid.NewGuid();
        var employee = Employee.Create(org.OrganizationId, branchId, "EMP-P", "Sarah Pharm", null, null, "Pharmacist", new Address("1 St", null, "Cairo", null, null, "EG"), new DateOnly(2025, 1, 1));
        var pharmacist = UserAccount.Create(org.OrganizationId, employee.EmployeeId, "sarah", "hashed", UserRole.Pharmacist, BranchScope.ASSIGNED);
        typeof(UserAccount).GetProperty(nameof(UserAccount.Employee))!.SetValue(pharmacist, employee);

        var orgRepo = new Mock<IOrganizationRepository>();
        orgRepo.Setup(r => r.GetActiveByCodeAsync("SCOPEORG", It.IsAny<CancellationToken>())).ReturnsAsync(org);

        var userRepo = new Mock<IUserAccountRepository>();
        userRepo.Setup(r => r.GetForLoginAsync(org.OrganizationId, "SARAH", It.IsAny<CancellationToken>())).ReturnsAsync(pharmacist);

        var passwordHasher = new Mock<IPasswordHasherService>();
        passwordHasher.Setup(p => p.VerifyPassword(pharmacist, "hashed", "StrongPass123!")).Returns(true);

        var jwt = new Mock<IJwtTokenGenerator>();
        jwt.Setup(j => j.GenerateAccessToken(pharmacist, It.IsAny<IReadOnlyCollection<Guid>>()))
            .Returns(new GeneratedAccessToken("fake-jwt", Now.AddMinutes(15)));

        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);
        var runtimeMode = new Mock<IRuntimeModeProvider>();
        runtimeMode.SetupGet(r => r.CurrentMode).Returns(ErpRuntimeMode.Cloud);

        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(u => u.IsAuthenticated).Returns(true);
        currentUser.SetupGet(u => u.UserId).Returns(pharmacist.UserId);
        currentUser.SetupGet(u => u.EmployeeId).Returns(employee.EmployeeId);
        currentUser.SetupGet(u => u.OrganizationId).Returns(org.OrganizationId);
        currentUser.SetupGet(u => u.Username).Returns("sarah");
        currentUser.SetupGet(u => u.Role).Returns(nameof(UserRole.Pharmacist));
        currentUser.SetupGet(u => u.BranchScope).Returns(nameof(BranchScope.ASSIGNED));
        currentUser.SetupGet(u => u.AuthorizedBranchIds).Returns(new HashSet<Guid> { branchId });
        currentUser.SetupGet(u => u.Scopes).Returns(new HashSet<string> { "inventory:read", "inventory:write", "sales:read" });

        var service = new AuthService(
            orgRepo.Object,
            userRepo.Object,
            new Mock<IUserRefreshTokenRepository>().Object,
            passwordHasher.Object,
            jwt.Object,
            new Mock<IUnitOfWork>().Object,
            new Mock<IAuditLogger>().Object,
            new Mock<IOutboxService>().Object,
            new TenantContext(),
            currentUser.Object,
            clock.Object,
            runtimeMode.Object);

        var loginResult = await service.LoginAsync(new LoginRequest
        {
            OrganizationCode = "SCOPEORG",
            Username = "sarah",
            Password = "StrongPass123!"
        });

        Assert.True(loginResult.IsSuccess);
        Assert.Equal(UserRole.Pharmacist, loginResult.Value!.User.Role);
        Assert.Equal(BranchScope.ASSIGNED, loginResult.Value.User.BranchScope);
        Assert.Contains("inventory:read", loginResult.Value.User.Scopes);
        Assert.Contains("inventory:write", loginResult.Value.User.Scopes);
        Assert.Contains("sales:read", loginResult.Value.User.Scopes);
        Assert.DoesNotContain("sales:write", loginResult.Value.User.Scopes);

        var meResult = service.GetCurrentUser();
        Assert.True(meResult.IsSuccess);
        Assert.Equal(UserRole.Pharmacist, meResult.Value!.Role);
        Assert.Equal(BranchScope.ASSIGNED, meResult.Value.BranchScope);
        Assert.Equal(ErpRuntimeMode.Cloud, meResult.Value.RuntimeMode);
    }

    [Fact]
    public async Task ProductUomService_UpdateToNonSellable_ClearsStaleSaleUnitPrice_WhilePreservingPriceWhenSellable()
    {
        var orgId = Guid.NewGuid();
        var catId = Guid.NewGuid();
        var product = Product.Create(
            orgId,
            catId,
            "SKU-UOM",
            null,
            "Test Med",
            null,
            null,
            "TAB",
            0.14m,
            null,
            false,
            0,
            new[]
            {
                new InitialUomDefinition("TAB", "Tablet", 1m, 5m, true, true, true),
                new InitialUomDefinition("BOX", "Box", 10m, 45m, false, true, true)
            });
        var boxUom = product.Uoms.Single(u => u.UomCode == "BOX");

        var uomRepo = new Mock<IProductUomRepository>();
        uomRepo.Setup(r => r.GetByIdAsync(orgId, product.ProductId, boxUom.ProductUomId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(boxUom);

        var tenant = new Mock<ITenantContext>();
        tenant.SetupGet(t => t.OrganizationId).Returns(orgId);
        var currentUser = new Mock<ICurrentUser>();
        currentUser.SetupGet(u => u.Role).Returns("Admin");
        var runtimeMode = new Mock<IRuntimeModeProvider>();
        runtimeMode.SetupGet(r => r.CurrentMode).Returns(ErpRuntimeMode.Cloud);
        var idempotency = new Mock<IIdempotencyService>();
        idempotency.Setup(i => i.CheckAsync<object, ProductUomDto>(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<object>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new IdempotencyCheckResult<ProductUomDto>());

        var service = new ProductUomService(
            uomRepo.Object,
            new Mock<IProductRepository>().Object,
            new Mock<IUnitOfWork>().Object,
            tenant.Object,
            currentUser.Object,
            runtimeMode.Object,
            idempotency.Object,
            new Mock<IAuditLogger>().Object,
            new Mock<IOutboxService>().Object,
            new Mock<IProductInventoryUsageChecker>().Object);

        // 1. Omitting sale_unit_price while remaining sellable preserves existing 45m price.
        var renameResult = await service.UpdateProductUomAsync(
            product.ProductId,
            boxUom.ProductUomId,
            new UpdateProductUomRequest("Box of 10", null, null, null, null, null, "uom-rename-1"));
        Assert.True(renameResult.IsSuccess);
        Assert.True(renameResult.Value!.IsSellable);
        Assert.Equal(45m, renameResult.Value.SaleUnitPrice);

        // 2. Setting is_sellable = false with sale_unit_price omitted/null clears stale price to null.
        var disableResult = await service.UpdateProductUomAsync(
            product.ProductId,
            boxUom.ProductUomId,
            new UpdateProductUomRequest(null, null, null, false, null, null, "uom-disable-1"));
        Assert.True(disableResult.IsSuccess);
        Assert.False(disableResult.Value!.IsSellable);
        Assert.Null(disableResult.Value.SaleUnitPrice);
    }

    [Fact]
    public async Task EmployeeService_PharmacistAndCashierReadReturnForbidden_AndIdentityDtosMapAuditAndLockoutFields()
    {
        var orgId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        var tenant = new TenantContext();
        tenant.SetTenant(orgId);

        foreach (var deniedRole in new[] { UserRole.Pharmacist, UserRole.Cashier })
        {
            var deniedUser = new Mock<ICurrentUser>();
            deniedUser.SetupGet(u => u.Role).Returns(deniedRole.ToString());
            deniedUser.SetupGet(u => u.BranchScope).Returns(nameof(BranchScope.ASSIGNED));
            deniedUser.SetupGet(u => u.AuthorizedBranchIds).Returns(new HashSet<Guid> { branchId });

            var empService = new EmployeeService(
                new Mock<IEmployeeRepository>().Object,
                new Mock<IBranchRepository>().Object,
                new Mock<IUnitOfWork>().Object,
                new Mock<IAuditLogger>().Object,
                new Mock<IOutboxService>().Object,
                new Mock<IIdempotencyService>().Object,
                tenant,
                deniedUser.Object,
                new Mock<IDateTimeProvider>().Object);

            var pagedResult = await empService.GetPagedAsync(branchId, false, null, 1, 25);
            Assert.False(pagedResult.IsSuccess);
            Assert.Equal(ErrorCode.FORBIDDEN, pagedResult.ErrorCode);

            var byIdResult = await empService.GetByIdAsync(Guid.NewGuid());
            Assert.False(byIdResult.IsSuccess);
            Assert.Equal(ErrorCode.FORBIDDEN, byIdResult.ErrorCode);
        }

        // BranchDto and EmployeeDto expose CreatedAt & UpdatedAt
        var branch = Branch.Create(orgId, "BR-AUD", "Audit Branch", new Address("1 St", null, "Cairo", null, null, "EG"));
        var branchDto = BranchDtoMapper.From(branch);
        Assert.Equal(branch.CreatedAt, branchDto.CreatedAt);
        Assert.Equal(branch.UpdatedAt, branchDto.UpdatedAt);

        var employee = Employee.Create(orgId, branch.BranchId, "EMP-AUD", "Audit Emp", null, null, "Pharmacist", new Address("1 St", null, "Cairo", null, null, "EG"), new DateOnly(2025, 1, 1));
        var employeeDto = EmployeeDtoMapper.From(employee);
        Assert.Equal(employee.CreatedAt, employeeDto.CreatedAt);
        Assert.Equal(employee.UpdatedAt, employeeDto.UpdatedAt);

        // UserDto exposes additive LastLoginAt, LockoutEnd, and AccessFailedCount from UserAccount
        var account = UserAccount.Create(orgId, employee.EmployeeId, "locked.user", "hashed", UserRole.Cashier, BranchScope.ASSIGNED);
        account.RecordLoginSuccess(Now);
        for (int i = 0; i < 5; i++)
        {
            account.RecordLoginFailure(Now.AddMinutes(1), 5, TimeSpan.FromMinutes(15));
        }

        var dto = UserDtoMapper.From(account);
        Assert.Equal(Now, dto.LastLoginAt);
        Assert.Equal(Now.AddMinutes(16), dto.LockoutEnd);
        Assert.Equal(5, dto.AccessFailedCount);
    }

    [Theory]
    [InlineData("POST", "/api/v1/branches")]
    [InlineData("PATCH", "/api/v1/branches/11111111-1111-1111-1111-111111111111")]
    [InlineData("POST", "/api/v1/branches/11111111-1111-1111-1111-111111111111/enrollment-tokens")]
    [InlineData("POST", "/api/v1/branch-enrollment")]
    [InlineData("POST", "/api/v1/users")]
    [InlineData("PATCH", "/api/v1/users/11111111-1111-1111-1111-111111111111")]
    [InlineData("POST", "/api/v1/users/11111111-1111-1111-1111-111111111111/password-reset")]
    [InlineData("POST", "/api/v1/users/11111111-1111-1111-1111-111111111111/revoke-sessions")]
    [InlineData("POST", "/api/v1/employees")]
    [InlineData("PATCH", "/api/v1/employees/11111111-1111-1111-1111-111111111111")]
    public async Task RuntimeModeGuardMiddleware_BlocksCloudOnlyIdentityRoutesInBranchLocal_With404(string method, string path)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = method;
        context.Request.Path = path;
        context.Response.Body = new MemoryStream();

        var runtimeMode = new Mock<IRuntimeModeProvider>();
        runtimeMode.SetupGet(r => r.CurrentMode).Returns(ErpRuntimeMode.BranchLocal);

        var nextCalled = false;
        var middleware = new RuntimeModeGuardMiddleware(_ =>
        {
            nextCalled = true;
            return Task.CompletedTask;
        });

        await middleware.InvokeAsync(context, runtimeMode.Object);

        Assert.False(nextCalled);
        Assert.Equal((int)HttpStatusCode.NotFound, context.Response.StatusCode);
    }
}
