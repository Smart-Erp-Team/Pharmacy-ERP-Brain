using Microsoft.EntityFrameworkCore;
using PharmacyERP.Domain.Entities.Identity;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Domain.ValueObjects;
using PharmacyERP.Infrastructure.Persistence.Database;
using PharmacyERP.Infrastructure.Persistence.Repositories.Identity;
using PharmacyERP.Infrastructure.Services.Context;

namespace PharmacyERP.UnitTests.Infrastructure;

public sealed class IdentityRepositoriesTests
{
    private static Address NewAddress() => new("1 Main St", null, "Cairo", null, null, "EG");

    private static (PharmacyDbContext Db, TenantContext Tenant) CreateDb()
    {
        var tenant = new TenantContext();
        var options = new DbContextOptionsBuilder<PharmacyDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return (new IdentityRepositoryTestDbContext(options, tenant), tenant);
    }

    // EF InMemory cannot currently shape EF Core ComplexProperty values. These repository
    // tests exercise identity lookup behavior; the full Address mapping is checked separately
    // by IdentityModelConfigurationTests against the Npgsql model.
    private sealed class IdentityRepositoryTestDbContext(
        DbContextOptions<PharmacyDbContext> options,
        TenantContext tenant) : PharmacyDbContext(options, tenant)
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.Entity<Organization>().Ignore(x => x.Address);
            modelBuilder.Entity<Branch>().Ignore(x => x.Address);
            modelBuilder.Entity<Employee>().Ignore(x => x.Address);
        }
    }

    [Fact]
    public async Task OrganizationRepository_FindsActiveCodeAcrossTenantFilter()
    {
        var (db, tenant) = CreateDb();
        await using (db)
        {
            var organization = Organization.Create("ACME", "Acme", "EGP", "Africa/Cairo", NewAddress());
            db.Organizations.Add(organization);
            await db.SaveChangesAsync();
            tenant.SetTenant(Guid.NewGuid());

            var repository = new OrganizationRepository(db);
            Assert.True(await repository.ExistsByCodeAsync(" acme "));
            Assert.Equal(organization.OrganizationId, (await repository.GetActiveByCodeAsync("ACME"))!.OrganizationId);
        }
    }

    [Fact]
    public async Task TenantBindingAfterDiscoveryRestoresGlobalOrganizationQueryFilter()
    {
        var (db, tenant) = CreateDb();
        await using (db)
        {
            var first = Organization.Create("FIRST", "First", "EGP", "Africa/Cairo", NewAddress());
            var second = Organization.Create("SECOND", "Second", "EGP", "Africa/Cairo", NewAddress());
            db.Organizations.AddRange(first, second);
            await db.SaveChangesAsync();

            tenant.AllowSystemBypass();
            Assert.Equal(2, await db.Organizations.CountAsync());

            tenant.SetTenant(first.OrganizationId);

            Assert.Equal(1, await db.Organizations.CountAsync());
            Assert.Equal(first.OrganizationId, (await db.Organizations.SingleAsync()).OrganizationId);
        }
    }

    [Fact]
    public async Task BranchRepository_FiltersInactiveBranchesAndPagesResults()
    {
        var (db, tenant) = CreateDb();
        await using (db)
        {
            var organization = Organization.Create("ACME", "Acme", "EGP", "Africa/Cairo", NewAddress());
            var active = Branch.Create(organization.OrganizationId, "MAIN", "Main Branch", NewAddress());
            var inactive = Branch.Create(organization.OrganizationId, "OLD", "Old Branch", NewAddress());
            inactive.SetActive(false);
            tenant.SetTenant(organization.OrganizationId);
            db.AddRange(organization, active, inactive);
            await db.SaveChangesAsync();

            var repository = new BranchRepository(db);

            Assert.True(await repository.ExistsByCodeAsync(organization.OrganizationId, " main "));
            Assert.Equal(active.BranchId, (await repository.GetByIdAsync(organization.OrganizationId, active.BranchId))!.BranchId);
            var activePage = await repository.GetPagedAsync(organization.OrganizationId, includeInactive: false,
                search: null, page: 1, pageSize: 1);
            Assert.Single(activePage.Items);
            Assert.Equal(1, activePage.TotalCount);
            Assert.Equal(active.BranchId, activePage.Items[0].BranchId);

            var allBranches = await repository.GetPagedAsync(organization.OrganizationId, includeInactive: true,
                search: "Branch", page: 1, pageSize: 1);
            Assert.Equal(2, allBranches.TotalCount);
            Assert.Single(allBranches.Items);
        }
    }

    [Fact]
    public async Task EmployeeRepository_FiltersByBranchActivityAndSearch()
    {
        var (db, tenant) = CreateDb();
        await using (db)
        {
            var organization = Organization.Create("ACME", "Acme", "EGP", "Africa/Cairo", NewAddress());
            var branch = Branch.Create(organization.OrganizationId, "MAIN", "Main Branch", NewAddress());
            var active = Employee.Create(organization.OrganizationId, branch.BranchId, "E-1", "Alice Pharmacist",
                "alice@example.test", null, "Pharmacist", NewAddress(), new DateOnly(2020, 1, 1));
            var inactive = Employee.Create(organization.OrganizationId, branch.BranchId, "E-2", "Bob Pharmacist",
                null, null, "Pharmacist", NewAddress(), new DateOnly(2021, 1, 1));
            inactive.SetActive(false);
            tenant.SetTenant(organization.OrganizationId);
            db.AddRange(organization, branch, active, inactive);
            await db.SaveChangesAsync();

            var repository = new EmployeeRepository(db);

            Assert.True(await repository.ExistsByEmployeeNoAsync(organization.OrganizationId, branch.BranchId, " e-1 "));
            Assert.Equal(active.EmployeeId, (await repository.GetByIdAsync(organization.OrganizationId, active.EmployeeId))!.EmployeeId);
            var activePage = await repository.GetPagedAsync(organization.OrganizationId, branch.BranchId,
                includeInactive: false, search: "alice", page: 1, pageSize: 10);
            Assert.Single(activePage.Items);
            Assert.Equal(active.EmployeeId, activePage.Items[0].EmployeeId);
            Assert.Equal(1, activePage.TotalCount);

            var allEmployees = await repository.GetPagedAsync(organization.OrganizationId, branchId: null,
                includeInactive: true, search: null, page: 1, pageSize: 10);
            Assert.Equal(2, allEmployees.TotalCount);
        }
    }

    [Fact]
    public async Task BranchEnrollmentRepository_FindsEnrollmentByHashAndLoadsBranch()
    {
        var (db, tenant) = CreateDb();
        await using (db)
        {
            var organization = Organization.Create("ACME", "Acme", "EGP", "Africa/Cairo", NewAddress());
            var branch = Branch.Create(organization.OrganizationId, "MAIN", "Main Branch", NewAddress());
            var hash = Enumerable.Range(0, 32).Select(value => (byte)value).ToArray();
            var now = DateTimeOffset.UtcNow;
            var enrollment = BranchEnrollment.Create(organization.OrganizationId, branch.BranchId, hash,
                now.AddMinutes(15), now);
            tenant.SetTenant(organization.OrganizationId);
            db.AddRange(organization, branch, enrollment);
            await db.SaveChangesAsync();

            var repository = new BranchEnrollmentRepository(db);
            var found = await repository.GetByTokenHashAsync(hash);

            Assert.NotNull(found);
            Assert.Equal(enrollment.EnrollmentId, found.EnrollmentId);
            Assert.Equal(branch.BranchId, found.Branch.BranchId);
            Assert.Null(await repository.GetByTokenHashAsync(new byte[32]));
        }
    }

    [Fact]
    public async Task UserAccountRepository_FindsLoginAndReplacesBranchAccess()
    {
        var (db, tenant) = CreateDb();
        await using (db)
        {
            var organization = Organization.Create("ACME", "Acme", "EGP", "Africa/Cairo", NewAddress());
            tenant.SetTenant(organization.OrganizationId);
            var branch = Branch.Create(organization.OrganizationId, "MAIN", "Main", NewAddress());
            var employee = Employee.Create(organization.OrganizationId, branch.BranchId, "E-1", "A Person", null, null, "Pharmacist", NewAddress(), DateOnly.FromDateTime(DateTime.UtcNow));
            var user = UserAccount.Create(organization.OrganizationId, employee.EmployeeId, "Alice", "hash", UserRole.Pharmacist, BranchScope.ASSIGNED);
            db.AddRange(organization, branch, employee, user);
            await db.SaveChangesAsync();

            var repository = new UserAccountRepository(db);
            Assert.True(await repository.ExistsByUsernameAsync(organization.OrganizationId, "ALICE"));
            Assert.True(await repository.ExistsForEmployeeAsync(organization.OrganizationId, employee.EmployeeId));
            Assert.Equal(user.UserId, (await repository.GetForLoginAsync(organization.OrganizationId, "ALICE"))!.UserId);
            await repository.ReplaceBranchAccessAsync(organization.OrganizationId, user.UserId, new[] { branch.BranchId, branch.BranchId });
            await db.SaveChangesAsync();
            Assert.Single(await db.UserBranchAccesses.ToListAsync());

            var loaded = await repository.GetByIdWithAccessAsync(organization.OrganizationId, user.UserId);
            Assert.NotNull(loaded);
            Assert.Equal(employee.EmployeeId, loaded.Employee.EmployeeId);
            Assert.Single(loaded.BranchAccesses);
            var page = await repository.GetPagedAsync(organization.OrganizationId, branch.BranchId, UserRole.Pharmacist,
                includeInactive: false, page: 1, pageSize: 10);
            Assert.Single(page.Items);
            Assert.Equal(user.UserId, page.Items[0].UserId);
        }
    }

    [Fact]
    public async Task RefreshTokenRepository_RevokesEntireFamily()
    {
        var (db, tenant) = CreateDb();
        await using (db)
        {
            var organization = Organization.Create("ACME", "Acme", "EGP", "Africa/Cairo", NewAddress());
            var organizationId = organization.OrganizationId;
            var branch = Branch.Create(organizationId, "MAIN", "Main", NewAddress());
            var employee = Employee.Create(organizationId, branch.BranchId, "E-1", "A Person", null, null,
                "Pharmacist", NewAddress(), DateOnly.FromDateTime(DateTime.UtcNow));
            var user = UserAccount.Create(organizationId, employee.EmployeeId, "Alice", "hash",
                UserRole.Pharmacist, BranchScope.ASSIGNED);
            var userId = user.UserId;
            var familyId = Guid.NewGuid();
            tenant.SetTenant(organizationId);
            var now = DateTimeOffset.UtcNow;
            var first = UserRefreshToken.Create(organizationId, userId, new byte[32], familyId, now, now.AddDays(1));
            var second = UserRefreshToken.Create(organizationId, userId, Enumerable.Repeat((byte)1, 32).ToArray(), familyId, now, now.AddDays(1));
            db.AddRange(organization, branch, employee, user, first, second);
            await db.SaveChangesAsync();

            var repository = new UserRefreshTokenRepository(db);
            Assert.Equal(first.RefreshTokenId, (await repository.GetByTokenHashAsync(new byte[32]))!.RefreshTokenId);
            await repository.RevokeFamilyAsync(organizationId, familyId, now.AddMinutes(1));
            await db.SaveChangesAsync();

            Assert.All(await db.UserRefreshTokens.ToListAsync(), token => Assert.Equal(now.AddMinutes(1), token.RevokedAt));
        }
    }
}
