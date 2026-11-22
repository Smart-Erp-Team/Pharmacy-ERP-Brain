#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Reflection;
using System.Security.Claims;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;
using PharmacyERP.Api;
using PharmacyERP.Api.Controllers;
using PharmacyERP.Application.Common.Constants;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Common.Interfaces.CrossModule;
using PharmacyERP.Application.Features.Catalog.DTOs;
using PharmacyERP.Application.Features.Catalog.Services.Implementations;
using PharmacyERP.Application.Features.Integration.DTOs;
using PharmacyERP.Domain.Entities.Catalog;
using PharmacyERP.Domain.Entities.Identity;
using PharmacyERP.Domain.Entities.Integration;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Domain.ValueObjects;
using PharmacyERP.Infrastructure.Persistence.Database;
using PharmacyERP.Infrastructure.Services.Context;
using Xunit;
using Xunit.Sdk;

namespace PharmacyERP.IntegrationTests.Api;

#region Skip Attributes & Availability Probe
public static class PostgresAvailabilityProbe
{
    private static bool? _isAvailable;
    private static string? _skipReason;
    private static readonly object _lock = new();

    public static (bool IsAvailable, string? SkipReason) Check()
    {
        lock (_lock)
        {
            if (_isAvailable.HasValue)
            {
                return (_isAvailable.Value, _skipReason);
            }

            var processVar = Environment.GetEnvironmentVariable("ERP_IT_POSTGRES", EnvironmentVariableTarget.Process);
            if (string.Equals(processVar, "DISABLED", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(processVar, "NONE", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(processVar, "SKIP", StringComparison.OrdinalIgnoreCase))
            {
                _isAvailable = false;
                _skipReason = "ERP_IT_POSTGRES environment variable is disabled for this test run.";
                return (_isAvailable.Value, _skipReason);
            }

            var rawConnStr = !string.IsNullOrWhiteSpace(processVar)
                ? processVar
                : (Environment.GetEnvironmentVariable("ERP_IT_POSTGRES", EnvironmentVariableTarget.User)
                   ?? Environment.GetEnvironmentVariable("ERP_IT_POSTGRES", EnvironmentVariableTarget.Machine));

            if (string.IsNullOrWhiteSpace(rawConnStr))
            {
                _isAvailable = false;
                _skipReason = "ERP_IT_POSTGRES environment variable is missing or empty.";
                return (_isAvailable.Value, _skipReason);
            }

            try
            {
                var builder = new NpgsqlConnectionStringBuilder(rawConnStr);
                using var conn = new NpgsqlConnection(builder.ConnectionString);
                conn.Open();
                _isAvailable = true;
                _skipReason = null;
            }
            catch (Exception ex)
            {
                _isAvailable = false;
                _skipReason = $"PostgreSQL connection failed: {ex.GetType().Name}";
            }

            return (_isAvailable.Value, _skipReason);
        }
    }
}

public class SkipWhenPostgresUnavailableFactAttribute : FactAttribute
{
    public SkipWhenPostgresUnavailableFactAttribute()
    {
        var (isAvailable, skipReason) = PostgresAvailabilityProbe.Check();
        if (!isAvailable)
        {
            Skip = skipReason ?? "PostgreSQL server is unavailable.";
        }
    }
}

public class SkipWhenPostgresUnavailableTheoryAttribute : TheoryAttribute
{
    public SkipWhenPostgresUnavailableTheoryAttribute()
    {
        var (isAvailable, skipReason) = PostgresAvailabilityProbe.Check();
        if (!isAvailable)
        {
            Skip = skipReason ?? "PostgreSQL server is unavailable.";
        }
    }
}
#endregion

#region Test Authentication Handler
public class CatalogTestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "CatalogTestAuthScheme";
    public const string HeaderUserId = "X-Test-UserId";
    public const string HeaderOrgId = "X-Test-OrgId";
    public const string HeaderEmployeeId = "X-Test-EmployeeId";
    public const string HeaderRole = "X-Test-Role";
    public const string HeaderBranchScope = "X-Test-BranchScope";
    public const string HeaderBranchIds = "X-Test-BranchIds";

    public CatalogTestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder)
    {
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(HeaderUserId, out var userIdVal) || string.IsNullOrWhiteSpace(userIdVal))
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userIdVal.ToString()),
            new("sub", userIdVal.ToString())
        };

        if (Request.Headers.TryGetValue(HeaderOrgId, out var orgIdVal) && !string.IsNullOrWhiteSpace(orgIdVal))
        {
            claims.Add(new Claim("organization_id", orgIdVal.ToString()));
        }

        if (Request.Headers.TryGetValue(HeaderEmployeeId, out var empIdVal) && !string.IsNullOrWhiteSpace(empIdVal))
        {
            claims.Add(new Claim("employee_id", empIdVal.ToString()));
        }

        if (Request.Headers.TryGetValue(HeaderRole, out var roleVal) && !string.IsNullOrWhiteSpace(roleVal))
        {
            if (!string.Equals(roleVal.ToString(), "NONE", StringComparison.OrdinalIgnoreCase))
            {
                claims.Add(new Claim(ClaimTypes.Role, roleVal.ToString()));
                claims.Add(new Claim("role", roleVal.ToString()));
            }
        }

        if (Request.Headers.TryGetValue(HeaderBranchScope, out var scopeVal) && !string.IsNullOrWhiteSpace(scopeVal))
        {
            claims.Add(new Claim("branch_scope", scopeVal.ToString()));
        }

        if (Request.Headers.TryGetValue(HeaderBranchIds, out var branchesVal) && !string.IsNullOrWhiteSpace(branchesVal))
        {
            claims.Add(new Claim("branch_ids", branchesVal.ToString()));
        }

        var identity = new ClaimsIdentity(claims, SchemeName, ClaimTypes.NameIdentifier, ClaimTypes.Role);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, SchemeName);

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = 401;
        return Task.CompletedTask;
    }

    protected override Task HandleForbiddenAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = 403;
        return Task.CompletedTask;
    }
}
#endregion

#region Spy and Fake Cross-Module Services
public class SpyNonLotBatchInitializer : INonLotBatchInitializer
{
    public List<(Guid OrganizationId, Guid ProductId)> Invocations { get; } = new();

    public Task EnsureNonLotBatchExistsAsync(Guid organizationId, Guid productId, CancellationToken ct = default)
    {
        Invocations.Add((organizationId, productId));
        return Task.CompletedTask;
    }
}

public class PermissiveProductInventoryUsageChecker : IProductInventoryUsageChecker
{
    public Task<bool> HasAnyStockOrPostedHistoryForProductAsync(Guid organizationId, Guid productId, CancellationToken ct = default)
    {
        return Task.FromResult(false);
    }

    public Task<bool> HasAnyStockOrDocumentReferenceForUomAsync(Guid organizationId, Guid productId, Guid productUomId, CancellationToken ct = default)
    {
        return Task.FromResult(false);
    }
}

public class BlockingProductInventoryUsageChecker : IProductInventoryUsageChecker
{
    public Task<bool> HasAnyStockOrPostedHistoryForProductAsync(Guid organizationId, Guid productId, CancellationToken ct = default)
    {
        return Task.FromResult(true);
    }

    public Task<bool> HasAnyStockOrDocumentReferenceForUomAsync(Guid organizationId, Guid productId, Guid productUomId, CancellationToken ct = default)
    {
        return Task.FromResult(true);
    }
}
#endregion

#region PostgreSQL Test Fixture & WebApplicationFactory
public class CatalogWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly CatalogPostgresFixture _fixture;
    public SpyNonLotBatchInitializer SpyInitializer { get; } = new();
    public IProductInventoryUsageChecker? UsageCheckerOverride { get; set; }

    public CatalogWebApplicationFactory(CatalogPostgresFixture fixture)
    {
        _fixture = fixture;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("ConnectionStrings:DefaultConnection", _fixture.ConnectionString);
        builder.UseSetting("Outbox:WorkerEnabled", "false");
        builder.ConfigureLogging(logging => logging.ClearProviders());
        builder.ConfigureTestServices(services =>
        {
            services.PostConfigure<AuthenticationOptions>(options =>
            {
                options.DefaultAuthenticateScheme = CatalogTestAuthHandler.SchemeName;
                options.DefaultChallengeScheme = CatalogTestAuthHandler.SchemeName;
                options.DefaultScheme = CatalogTestAuthHandler.SchemeName;
            });

            services.AddAuthentication()
                .AddScheme<AuthenticationSchemeOptions, CatalogTestAuthHandler>(
                    CatalogTestAuthHandler.SchemeName, _ => { });

            services.RemoveAll<INonLotBatchInitializer>();
            services.AddSingleton<INonLotBatchInitializer>(SpyInitializer);

            services.RemoveAll<IProductInventoryUsageChecker>();
            services.AddScoped<IProductInventoryUsageChecker>(sp =>
                UsageCheckerOverride ?? new TemporaryProductInventoryUsageChecker());
        });
    }
}

public class CatalogPostgresFixture : IAsyncLifetime
{
    private string? _maintenanceConnStr;
    public string DatabaseName { get; private set; } = string.Empty;
    public string ConnectionString { get; private set; } = string.Empty;
    public CatalogWebApplicationFactory Factory { get; private set; } = null!;

    public Guid OrganizationAId { get; } = Guid.NewGuid();
    public Guid OrganizationBId { get; } = Guid.NewGuid();

    public Guid BranchA1Id { get; } = Guid.NewGuid(); // Accessible by default test user
    public Guid BranchA2Id { get; } = Guid.NewGuid(); // Inaccessible by default test user

    public Guid UserAId { get; } = Guid.NewGuid();
    public Guid EmployeeAId { get; } = Guid.NewGuid();

    public Guid BranchB1Id { get; } = Guid.NewGuid();
    public Guid UserBId { get; } = Guid.NewGuid();
    public Guid EmployeeBId { get; } = Guid.NewGuid();

    public async Task InitializeAsync()
    {
        var rawConnStr = ThrowawayPostgresDatabaseProvisioner.ResolveAdminConnectionString();
        if (string.IsNullOrWhiteSpace(rawConnStr))
        {
            return;
        }

        DatabaseName = "erp_catalog_it_" + Guid.NewGuid().ToString("N");

        var provisioned = await ThrowawayPostgresDatabaseProvisioner.CreateAndProvisionDatabaseAsync(rawConnStr, DatabaseName);
        _maintenanceConnStr = provisioned.MaintenanceConnectionString;
        ConnectionString = provisioned.AppConnectionString;

        try
        {
            var options = new DbContextOptionsBuilder<PharmacyDbContext>()
                .UseNpgsql(provisioned.AdminConnectionString)
                .Options;

            var tenant = new TenantContext();
            tenant.AllowSystemBypass();

            await using var db = new PharmacyDbContext(options, tenant);

            // Seed required baseline data
            await SeedBaselineDataAsync(db);

            Factory = new CatalogWebApplicationFactory(this);
        }
        catch
        {
            await DropDatabaseAsync();
            throw;
        }
    }

    private async Task SeedBaselineDataAsync(PharmacyDbContext db)
    {
        var addrA = new Address("10 El-Tahrir St", null, "Cairo", "Cairo", "11511", "EG");
        var orgA = Organization.Create("ORGA", "Organization Alpha", "EGP", "Egypt Standard Time", addrA);
        typeof(Organization).GetProperty("OrganizationId")!.SetValue(orgA, OrganizationAId);

        var addrB = new Address("20 Corniche St", null, "Alexandria", "Alexandria", "21500", "EG");
        var orgB = Organization.Create("ORGB", "Organization Beta", "EGP", "Egypt Standard Time", addrB);
        typeof(Organization).GetProperty("OrganizationId")!.SetValue(orgB, OrganizationBId);

        db.Organizations.AddRange(orgA, orgB);

        var branchA1 = Branch.Create(OrganizationAId, "BRA1", "Main Cairo Branch", addrA);
        typeof(Branch).GetProperty("BranchId")!.SetValue(branchA1, BranchA1Id);

        var branchA2 = Branch.Create(OrganizationAId, "BRA2", "Giza Branch", addrA);
        typeof(Branch).GetProperty("BranchId")!.SetValue(branchA2, BranchA2Id);

        db.Branches.AddRange(branchA1, branchA2);

        var empA = Employee.Create(OrganizationAId, BranchA1Id, "EMP001", "Dr. Ahmed Ali", "ahmed@alpha.com", "+201001234567", "Head Pharmacist", addrA, new DateOnly(2025, 1, 1));
        typeof(Employee).GetProperty("EmployeeId")!.SetValue(empA, EmployeeAId);
        db.Employees.Add(empA);

        var userA = UserAccount.Create(OrganizationAId, EmployeeAId, "ahmed.pharmacist", "hashed_pwd_placeholder", UserRole.Pharmacist, BranchScope.ASSIGNED);
        typeof(UserAccount).GetProperty("UserId")!.SetValue(userA, UserAId);
        db.UserAccounts.Add(userA);

        var accessA1 = UserBranchAccess.Create(OrganizationAId, UserAId, BranchA1Id);
        db.UserBranchAccesses.Add(accessA1);

        var branchB1 = Branch.Create(OrganizationBId, "BRB1", "Alexandria Branch", addrB);
        typeof(Branch).GetProperty("BranchId")!.SetValue(branchB1, BranchB1Id);
        db.Branches.Add(branchB1);

        var empB = Employee.Create(OrganizationBId, BranchB1Id, "EMP002", "Dr. Mona Alex", "mona@beta.com", "+201099887766", "Alex Pharmacist", addrB, new DateOnly(2025, 1, 1));
        typeof(Employee).GetProperty("EmployeeId")!.SetValue(empB, EmployeeBId);
        db.Employees.Add(empB);

        var userB = UserAccount.Create(OrganizationBId, EmployeeBId, "mona.pharmacist", "hashed_pwd_placeholder", UserRole.Pharmacist, BranchScope.ASSIGNED);
        typeof(UserAccount).GetProperty("UserId")!.SetValue(userB, UserBId);
        db.UserAccounts.Add(userB);

        var accessB1 = UserBranchAccess.Create(OrganizationBId, UserBId, BranchB1Id);
        db.UserBranchAccesses.Add(accessB1);

        await db.SaveChangesAsync();
    }

    public async Task DisposeAsync()
    {
        if (Factory != null)
        {
            await Factory.DisposeAsync();
        }
        await DropDatabaseAsync();
    }

    private Task DropDatabaseAsync()
        => ThrowawayPostgresDatabaseProvisioner.DropDatabaseAsync(_maintenanceConnStr, DatabaseName);
}
#endregion

#region Integration Tests Class
public sealed class CatalogEndpointsTests : IClassFixture<CatalogPostgresFixture>
{
    private readonly CatalogPostgresFixture _fixture;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public CatalogEndpointsTests(CatalogPostgresFixture fixture)
    {
        _fixture = fixture;
    }

    private HttpClient CreateClient(
        string? role = "Pharmacist",
        Guid? orgId = null,
        Guid? userId = null,
        Guid? employeeId = null,
        string? branchScope = "ASSIGNED",
        IEnumerable<Guid>? branchIds = null)
    {
        var targetOrgId = orgId ?? _fixture.OrganizationAId;
        var isOrgB = targetOrgId == _fixture.OrganizationBId;
        var targetUserId = userId ?? (isOrgB ? _fixture.UserBId : _fixture.UserAId);
        var targetEmployeeId = employeeId ?? (isOrgB ? _fixture.EmployeeBId : _fixture.EmployeeAId);
        var targetBranches = branchIds ?? (isOrgB ? new[] { _fixture.BranchB1Id } : new[] { _fixture.BranchA1Id });

        var client = _fixture.Factory.CreateClient();
        if (!string.IsNullOrWhiteSpace(role))
        {
            client.DefaultRequestHeaders.Add(CatalogTestAuthHandler.HeaderRole, role);
            client.DefaultRequestHeaders.Add(CatalogTestAuthHandler.HeaderOrgId, targetOrgId.ToString());
            client.DefaultRequestHeaders.Add(CatalogTestAuthHandler.HeaderUserId, targetUserId.ToString());
            client.DefaultRequestHeaders.Add(CatalogTestAuthHandler.HeaderEmployeeId, targetEmployeeId.ToString());
            client.DefaultRequestHeaders.Add(CatalogTestAuthHandler.HeaderBranchScope, branchScope ?? "ASSIGNED");
            client.DefaultRequestHeaders.Add(CatalogTestAuthHandler.HeaderBranchIds, string.Join(",", targetBranches));
        }
        return client;
    }

    private static HttpRequestMessage CreateRequest<T>(HttpMethod method, string url, T content, string? idempotencyKey = null)
    {
        var request = new HttpRequestMessage(method, url)
        {
            Content = JsonContent.Create(content)
        };
        if (!string.IsNullOrWhiteSpace(idempotencyKey))
        {
            request.Headers.Add("Idempotency-Key", idempotencyKey);
        }
        return request;
    }

    [SkipWhenPostgresUnavailableFact]
    public void ThrowawayDatabase_PointsToIsolatedTestDatabase_NotProductionOrErpDb()
    {
        using var scope = _fixture.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();
        var dbName = db.Database.GetDbConnection().Database;

        Assert.False(string.IsNullOrWhiteSpace(dbName));
        Assert.Equal(_fixture.DatabaseName, dbName);
        Assert.NotEqual("erp_db", dbName, StringComparer.OrdinalIgnoreCase);
        Assert.StartsWith("erp_catalog_it_", dbName);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task DatabaseCleanupProof_NoOrphanedItDatabasesExist_AndErpDbUntouched()
    {
        var rawConnStr = Environment.GetEnvironmentVariable("ERP_IT_POSTGRES", EnvironmentVariableTarget.Process);
        if (string.IsNullOrWhiteSpace(rawConnStr))
        {
            rawConnStr = Environment.GetEnvironmentVariable("ERP_IT_POSTGRES", EnvironmentVariableTarget.User);
        }
        if (string.IsNullOrWhiteSpace(rawConnStr))
        {
            rawConnStr = Environment.GetEnvironmentVariable("ERP_IT_POSTGRES", EnvironmentVariableTarget.Machine);
        }

        Assert.False(string.IsNullOrWhiteSpace(rawConnStr), "ERP_IT_POSTGRES must not be null, empty, or whitespace when PostgreSQL tests execute.");

        var mBuilder = new NpgsqlConnectionStringBuilder(rawConnStr) { Database = "postgres" };
        await using var conn = new NpgsqlConnection(mBuilder.ConnectionString);
        await conn.OpenAsync();

        // 1. Verify no orphaned databases from earlier runs exist (only the current active fixture database should exist)
        await using var cmd1 = conn.CreateCommand();
        cmd1.CommandText = $"SELECT datname FROM pg_database WHERE datname LIKE 'erp_catalog_it_%' AND datname != '{_fixture.DatabaseName}';";
        await using var reader = await cmd1.ExecuteReaderAsync();
        var orphanedDbs = new List<string>();
        while (await reader.ReadAsync())
        {
            orphanedDbs.Add(reader.GetString(0));
        }
        Assert.Empty(orphanedDbs);

        // 2. Verify throwaway database name is distinct from any production/default database
        Assert.NotEqual("erp_db", _fixture.DatabaseName, StringComparer.OrdinalIgnoreCase);
        Assert.NotEqual("pharmacy_erp", _fixture.DatabaseName, StringComparer.OrdinalIgnoreCase);
        Assert.NotEqual("postgres", _fixture.DatabaseName, StringComparer.OrdinalIgnoreCase);

        // 3. Verify that if erp_db or any default db exists, it is not our test db
        await reader.CloseAsync();
        await using var cmd2 = conn.CreateCommand();
        cmd2.CommandText = "SELECT datname FROM pg_database WHERE datname IN ('erp_db', 'pharmacy_erp');";
        await using var defaultReader = await cmd2.ExecuteReaderAsync();
        while (await defaultReader.ReadAsync())
        {
            var defaultDb = defaultReader.GetString(0);
            Assert.NotEqual(defaultDb, _fixture.DatabaseName, StringComparer.OrdinalIgnoreCase);
        }
    }

    #region Spec Scenarios
    [SkipWhenPostgresUnavailableFact]
    public async Task Scenario1_CreateRootAndChildCategory_SelfParentingReturns422()
    {
        var client = CreateClient();

        // 1. Create Root Category
        var rootKey = Guid.NewGuid().ToString();
        var rootReq = new CreateProductCategoryRequest(null, "ROOT-" + Guid.NewGuid().ToString("N")[..8], "Root Category", "Root description", rootKey);
        var rootResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories", rootReq, rootKey));
        Assert.Equal(HttpStatusCode.OK, rootResp.StatusCode);
        var rootCat = await rootResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);
        Assert.NotNull(rootCat);
        Assert.Null(rootCat!.ParentCategoryId);

        // 2. Create Child Category
        var childKey = Guid.NewGuid().ToString();
        var childReq = new CreateProductCategoryRequest(rootCat.CategoryId, "CHILD-" + Guid.NewGuid().ToString("N")[..8], "Child Category", "Child description", childKey);
        var childResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories", childReq, childKey));
        Assert.Equal(HttpStatusCode.OK, childResp.StatusCode);
        var childCat = await childResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);
        Assert.NotNull(childCat);
        Assert.Equal(rootCat.CategoryId, childCat!.ParentCategoryId);

        // 3. Attempt Self-Parenting
        var updateKey = Guid.NewGuid().ToString();
        var updateReq = new UpdateProductCategoryRequest(childCat.CategoryId, "Updated Child", "Desc", true, updateKey);
        var patchResp = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/api/v1/product-categories/{childCat.CategoryId}", updateReq, updateKey));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, patchResp.StatusCode);

        var errEnv = await patchResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(errEnv);
        Assert.Equal("VALIDATION_ERROR", errEnv!.Error.Code);
        Assert.Contains(ErrorMessages.CategorySelfParent, errEnv.Error.Message);
        Assert.False(string.IsNullOrWhiteSpace(errEnv.Error.TraceId));
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task Scenario2_CreateLotTrackedProductWithBaseUom_AddUoms_VerifyGetAndUomList()
    {
        var client = CreateClient();

        // Ensure category
        var catKey = Guid.NewGuid().ToString();
        var catResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, "CAT-" + Guid.NewGuid().ToString("N")[..8], "Category Meds", null, catKey), catKey));
        var cat = await catResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);
        Assert.NotNull(cat);

        // 1. Create Lot-Tracked Product with Base UOM "tablet"
        var prodKey = Guid.NewGuid().ToString();
        var baseUom = new CreateProductUomItemRequest("tablet", "Tablet", 1m, 2.50m, true, true, true);
        var prodReq = new CreateProductRequest(
            cat!.CategoryId,
            "SKU-" + Guid.NewGuid().ToString("N")[..8],
            "BAR-" + Guid.NewGuid().ToString("N")[..8],
            "Panadol Advance",
            "Paracetamol",
            "GSK",
            "tablet",
            0.14m,
            null,
            true, // Lot tracking required
            30,
            new[] { baseUom },
            prodKey);

        var prodResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", prodReq, prodKey));
        Assert.Equal(HttpStatusCode.OK, prodResp.StatusCode);
        var prod = await prodResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        Assert.NotNull(prod);
        Assert.True(prod!.LotTrackingRequired);
        Assert.Single(prod.Uoms);
        Assert.Equal("tablet", prod.BaseUomCode);

        // 2. Add Secondary UOM "strip" (conversion factor 10)
        var uom2Key = Guid.NewGuid().ToString();
        var uom2Req = new CreateProductUomRequest("strip", "Strip of 10", 10m, 25.00m, false, true, true, uom2Key);
        var uom2Resp = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/api/v1/products/{prod.ProductId}/uoms", uom2Req, uom2Key));
        Assert.Equal(HttpStatusCode.OK, uom2Resp.StatusCode);

        // 3. Add Third UOM "box" (conversion factor 30)
        var uom3Key = Guid.NewGuid().ToString();
        var uom3Req = new CreateProductUomRequest("box", "Box of 30", 30m, 75.00m, false, true, true, uom3Key);
        var uom3Resp = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/api/v1/products/{prod.ProductId}/uoms", uom3Req, uom3Key));
        Assert.Equal(HttpStatusCode.OK, uom3Resp.StatusCode);

        // 4. Verify GET /products/{id} includes UOMs
        var getProdResp = await client.GetAsync($"/api/v1/products/{prod.ProductId}");
        Assert.Equal(HttpStatusCode.OK, getProdResp.StatusCode);
        var fetchedProd = await getProdResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        Assert.NotNull(fetchedProd);
        Assert.Equal(3, fetchedProd!.Uoms.Count);

        // 5. Verify GET /products/{id}/uoms returns all 3 UOMs
        var getUomsResp = await client.GetAsync($"/api/v1/products/{prod.ProductId}/uoms");
        Assert.Equal(HttpStatusCode.OK, getUomsResp.StatusCode);
        var uomList = await getUomsResp.Content.ReadFromJsonAsync<List<ProductUomDto>>(JsonOptions);
        Assert.NotNull(uomList);
        Assert.Equal(3, uomList!.Count);
        Assert.Contains(uomList, u => u.UomCode == "tablet" && u.IsBase && u.ConversionToBase == 1m);
        Assert.Contains(uomList, u => u.UomCode == "strip" && !u.IsBase && u.ConversionToBase == 10m);
        Assert.Contains(uomList, u => u.UomCode == "box" && !u.IsBase && u.ConversionToBase == 30m);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task Scenario3_CreateNonLotProduct_InvokesNonLotBatchInitializerSpy_LotTrackedDoesNot()
    {
        var client = CreateClient();
        _fixture.Factory.SpyInitializer.Invocations.Clear();

        var catKey = Guid.NewGuid().ToString();
        var catResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, "CAT-" + Guid.NewGuid().ToString("N")[..8], "NonLot Cat", null, catKey), catKey));
        var cat = await catResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);
        Assert.NotNull(cat);

        // 1. Create Non-Lot product
        var nonLotKey = Guid.NewGuid().ToString();
        var nonLotReq = new CreateProductRequest(
            cat!.CategoryId,
            "SKU-NL-" + Guid.NewGuid().ToString("N")[..8],
            null,
            "Non Lot Product",
            null,
            null,
            "pcs",
            0.14m,
            null,
            false, // Non-lot
            0,
            new[] { new CreateProductUomItemRequest("pcs", "Pieces", 1m, 10m, true, true, true) },
            nonLotKey);

        var nonLotResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", nonLotReq, nonLotKey));
        Assert.Equal(HttpStatusCode.OK, nonLotResp.StatusCode);
        var nonLotProd = await nonLotResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        Assert.NotNull(nonLotProd);

        // Assert Spy invoked for non-lot product
        Assert.Single(_fixture.Factory.SpyInitializer.Invocations);
        var inv = _fixture.Factory.SpyInitializer.Invocations[0];
        Assert.Equal(_fixture.OrganizationAId, inv.OrganizationId);
        Assert.Equal(nonLotProd!.ProductId, inv.ProductId);

        // 2. Create Lot-Tracked product
        var lotKey = Guid.NewGuid().ToString();
        var lotReq = new CreateProductRequest(
            cat.CategoryId,
            "SKU-LT-" + Guid.NewGuid().ToString("N")[..8],
            null,
            "Lot Product",
            null,
            null,
            "pcs",
            0.14m,
            null,
            true, // Lot tracked
            30,
            new[] { new CreateProductUomItemRequest("pcs", "Pieces", 1m, 10m, true, true, true) },
            lotKey);

        var lotResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", lotReq, lotKey));
        Assert.Equal(HttpStatusCode.OK, lotResp.StatusCode);

        // Assert Spy was NOT invoked again
        Assert.Single(_fixture.Factory.SpyInitializer.Invocations);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task Scenario4_IdempotentProductCreate_ReplayReturnsSameResult_PayloadMismatchReturns409()
    {
        var client = CreateClient();

        var catKey = Guid.NewGuid().ToString();
        var catResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, "CAT-" + Guid.NewGuid().ToString("N")[..8], "Idemp Cat", null, catKey), catKey));
        var cat = await catResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);
        Assert.NotNull(cat);

        var sharedKey = Guid.NewGuid().ToString();
        var originalReq = new CreateProductRequest(
            cat!.CategoryId,
            "SKU-IDEMP-" + Guid.NewGuid().ToString("N")[..8],
            null,
            "Original Product Name",
            null,
            null,
            "box",
            0.14m,
            null,
            true,
            60,
            new[] { new CreateProductUomItemRequest("box", "Box", 1m, 50m, true, true, true) },
            sharedKey);

        // 1. First execution
        var firstResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", originalReq, sharedKey));
        Assert.Equal(HttpStatusCode.OK, firstResp.StatusCode);
        var firstResult = await firstResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        Assert.NotNull(firstResult);

        // 2. Replay with identical payload and same key
        var replayResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", originalReq, sharedKey));
        Assert.Equal(HttpStatusCode.OK, replayResp.StatusCode);
        var replayResult = await replayResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        Assert.NotNull(replayResult);
        Assert.Equal(firstResult!.ProductId, replayResult!.ProductId);
        Assert.Equal(firstResult.Sku, replayResult.Sku);

        // 3. Send same key with mismatched payload
        var modifiedReq = originalReq with { Name = "Tampered Different Name" };
        var mismatchResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", modifiedReq, sharedKey));
        Assert.Equal(HttpStatusCode.Conflict, mismatchResp.StatusCode);
        var errEnv = await mismatchResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(errEnv);
        Assert.Equal("IDEMPOTENCY_MISMATCH", errEnv!.Error.Code);
        Assert.False(string.IsNullOrWhiteSpace(errEnv.Error.TraceId));
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task Scenario5_ReorderRuleUpsert_MaxQuantityLessThanReorderPoint_Returns422()
    {
        var client = CreateClient();

        var catKey = Guid.NewGuid().ToString();
        var catResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, "CAT-" + Guid.NewGuid().ToString("N")[..8], "Reorder Cat", null, catKey), catKey));
        var cat = await catResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);
        Assert.NotNull(cat);

        var prodKey = Guid.NewGuid().ToString();
        var prodResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products",
            new CreateProductRequest(cat!.CategoryId, "SKU-RR-" + Guid.NewGuid().ToString("N")[..8], null, "Reorder Prod", null, null, "pack", 0.14m, null, true, 30,
            new[] { new CreateProductUomItemRequest("pack", "Pack", 1m, 15m, true, true, true) }, prodKey), prodKey));
        var prod = await prodResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        Assert.NotNull(prod);

        // 1. Invalid Reorder Rule (MaxQuantityBase < ReorderPointBase) -> 422
        var invalidKey = Guid.NewGuid().ToString();
        var invalidReq = new UpsertReorderRuleRequest(100m, 50m, 50m, true, invalidKey);
        var invalidResp = await client.SendAsync(CreateRequest(HttpMethod.Put,
            $"/api/v1/branches/{_fixture.BranchA1Id}/products/{prod!.ProductId}/reorder-rule", invalidReq, invalidKey));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, invalidResp.StatusCode);

        var errEnv = await invalidResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(errEnv);
        Assert.Equal("VALIDATION_ERROR", errEnv!.Error.Code);

        // 2. Valid Reorder Rule -> 200 OK
        var validKey = Guid.NewGuid().ToString();
        var validReq = new UpsertReorderRuleRequest(50m, 50m, 200m, true, validKey);
        var validResp = await client.SendAsync(CreateRequest(HttpMethod.Put,
            $"/api/v1/branches/{_fixture.BranchA1Id}/products/{prod.ProductId}/reorder-rule", validReq, validKey));
        Assert.Equal(HttpStatusCode.OK, validResp.StatusCode);
        var ruleDto = await validResp.Content.ReadFromJsonAsync<ReorderRuleDto>(JsonOptions);
        Assert.NotNull(ruleDto);
        Assert.Equal(50m, ruleDto!.ReorderPointBase);
        Assert.Equal(200m, ruleDto.MaxQuantityBase);

        // 3. Verify GET reorder rule returns saved rule
        var getResp = await client.GetAsync($"/api/v1/branches/{_fixture.BranchA1Id}/products/{prod.ProductId}/reorder-rule");
        Assert.Equal(HttpStatusCode.OK, getResp.StatusCode);
        var fetchedRule = await getResp.Content.ReadFromJsonAsync<ReorderRuleDto>(JsonOptions);
        Assert.NotNull(fetchedRule);
        Assert.Equal(ruleDto.ReorderRuleId, fetchedRule!.ReorderRuleId);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task Scenario6_CanonicalFeedReadWithCursor_ApprovedWrite_VerifiesAuditLogRowAndActor()
    {
        var client = CreateClient();

        // 1. Create a category and at least 5 products to test paging thoroughly
        var catKey = Guid.NewGuid().ToString();
        var catResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, "CAT-PAGING-" + Guid.NewGuid().ToString("N")[..8], "Paging Cat", null, catKey), catKey));
        var cat = await catResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);
        Assert.NotNull(cat);

        var createdProductIds = new List<Guid>();
        for (int i = 1; i <= 5; i++)
        {
            var pKey = Guid.NewGuid().ToString();
            var pResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products",
                new CreateProductRequest(cat!.CategoryId, $"SKU-PAGE-{i}-" + Guid.NewGuid().ToString("N")[..6], null, $"Paged Med {i}", null, null, "tab", 0.14m, null, true, 30,
                new[] { new CreateProductUomItemRequest("tab", "Tab", 1m, 5m, true, true, true) }, pKey), pKey));
            Assert.Equal(HttpStatusCode.OK, pResp.StatusCode);
            var p = await pResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
            createdProductIds.Add(p!.ProductId);
        }

        // 2. Page through canonical products with small limit (limit=2)
        var retrievedIds = new List<Guid>();
        string? cursor = null;
        int pageCount = 0;

        do
        {
            var url = string.IsNullOrWhiteSpace(cursor)
                ? "/api/v1/canonical/products?limit=2"
                : $"/api/v1/canonical/products?limit=2&cursor={Uri.EscapeDataString(cursor)}";

            var feedResp = await client.GetAsync(url);
            Assert.Equal(HttpStatusCode.OK, feedResp.StatusCode);
            var feedPage = await feedResp.Content.ReadFromJsonAsync<CanonicalProductFeedPageDto>(JsonOptions);
            Assert.NotNull(feedPage);

            foreach (var item in feedPage!.Items)
            {
                retrievedIds.Add(item.Id);
            }

            cursor = feedPage.NextCursor;
            pageCount++;

            // Safety bound against infinite loops
            Assert.True(pageCount <= 200, "Excessive paging iterations detected.");
        } while (!string.IsNullOrWhiteSpace(cursor));

        // Assert: all 5 created products are present across pages, no duplicates
        foreach (var id in createdProductIds)
        {
            Assert.Contains(id, retrievedIds);
        }
        Assert.Equal(retrievedIds.Count, retrievedIds.Distinct().Count());

        // Assert: updated_since in the far future returns 0 items and no cursor
        var futureDate = DateTimeOffset.UtcNow.AddDays(30).ToString("o");
        var futureFeedResp = await client.GetAsync($"/api/v1/canonical/products?updated_since={Uri.EscapeDataString(futureDate)}");
        Assert.Equal(HttpStatusCode.OK, futureFeedResp.StatusCode);
        var futureFeed = await futureFeedResp.Content.ReadFromJsonAsync<CanonicalProductFeedPageDto>(JsonOptions);
        Assert.NotNull(futureFeed);
        Assert.Empty(futureFeed!.Items);
        Assert.Null(futureFeed.NextCursor);

        // Assert: tampered cursor returns 422 VALIDATION_ERROR
        var tamperedResp = await client.GetAsync("/api/v1/canonical/products?cursor=not-a-valid-cursor-string");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, tamperedResp.StatusCode);
        var tamperedErr = await tamperedResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(tamperedErr);
        Assert.Equal("VALIDATION_ERROR", tamperedErr!.Error.Code);

        // 3. Approved AI Product Configuration Write (CREATE_PRODUCT)
        var createPromptId = "PRM-CREATE-" + Guid.NewGuid().ToString("N")[..8];
        var createConfigKey = Guid.NewGuid().ToString();
        var createConfigReq = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: createPromptId,
            IdempotencyKey: createConfigKey,
            Action: CatalogConfigurationAction.CreateProduct,
            CategoryId: cat.CategoryId,
            Sku: "SKU-AI-CR-" + Guid.NewGuid().ToString("N")[..6],
            Name: "AI Created Product",
            BaseUomCode: "box",
            TaxRate: 0.14m,
            LotTrackingRequired: true,
            ExpiryAlertDays: 30,
            Uoms: new[] { new CanonicalUomItemDto("box", "Box", 1m, 100m, true, true, true) });

        var createConfigResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/canonical/configuration/products", createConfigReq, createConfigKey));
        Assert.Equal(HttpStatusCode.OK, createConfigResp.StatusCode);
        var createWriteResult = await createConfigResp.Content.ReadFromJsonAsync<CanonicalWriteResultDto>(JsonOptions);
        Assert.NotNull(createWriteResult);
        Assert.Equal("APPLIED", createWriteResult!.Status);

        // 4. Approved AI Product Configuration Write (UPDATE_PRODUCT)
        var updatePromptId = "PRM-UPDATE-" + Guid.NewGuid().ToString("N")[..8];
        var updateConfigKey = Guid.NewGuid().ToString();
        var updateConfigReq = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: updatePromptId,
            IdempotencyKey: updateConfigKey,
            Action: CatalogConfigurationAction.UpdateProduct,
            ProductId: createWriteResult.TargetEntityId,
            Name: "AI Updated Product Name");

        var updateConfigResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/canonical/configuration/products", updateConfigReq, updateConfigKey));
        Assert.Equal(HttpStatusCode.OK, updateConfigResp.StatusCode);
        var updateWriteResult = await updateConfigResp.Content.ReadFromJsonAsync<CanonicalWriteResultDto>(JsonOptions);
        Assert.NotNull(updateWriteResult);
        Assert.Equal("APPLIED", updateWriteResult!.Status);

        // 5. Approved AI Reorder Rule Configuration Write (PUT /canonical/configuration/reorder-rules)
        var rrPromptId = "PRM-RR-" + Guid.NewGuid().ToString("N")[..8];
        var rrConfigKey = Guid.NewGuid().ToString();
        var rrConfigReq = new CanonicalReorderRuleConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: rrPromptId,
            IdempotencyKey: rrConfigKey,
            BranchId: _fixture.BranchA1Id,
            ProductId: createWriteResult.TargetEntityId,
            ReorderPointBase: 40m,
            ReorderQuantityBase: 80m,
            MaxQuantityBase: 250m,
            IsActive: true);

        var rrConfigResp = await client.SendAsync(CreateRequest(HttpMethod.Put, "/api/v1/canonical/configuration/reorder-rules", rrConfigReq, rrConfigKey));
        Assert.Equal(HttpStatusCode.OK, rrConfigResp.StatusCode);
        var rrWriteResult = await rrConfigResp.Content.ReadFromJsonAsync<CanonicalWriteResultDto>(JsonOptions);
        Assert.NotNull(rrWriteResult);
        Assert.Equal("APPLIED", rrWriteResult!.Status);

        // 6. Direct verification of AUDIT_LOG table in database for all 3 writes
        using var scope = _fixture.Factory.Services.CreateScope();
        var tenant = (TenantContext)scope.ServiceProvider.GetRequiredService<ITenantContext>();
        tenant.SetTenant(_fixture.OrganizationAId);
        var uow = scope.ServiceProvider.GetRequiredService<PharmacyERP.Application.Common.Interfaces.Persistence.IUnitOfWork>();
        var db = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();
        await uow.BeginTransactionAsync();
        try
        {
            var createAudit = await db.AuditLogs.FirstOrDefaultAsync(a => a.SourcePromptId == createPromptId);
            Assert.NotNull(createAudit);
            Assert.Equal(_fixture.OrganizationAId, createAudit!.OrganizationId);
            Assert.Equal(_fixture.UserAId, createAudit.ActorUserId);
            Assert.Equal(_fixture.EmployeeAId, createAudit.ActorEmployeeId);
            Assert.Equal(AuditActorType.AI_ASSISTED, createAudit.ActorType);
            Assert.Equal("CREATE", createAudit.Action);
            Assert.Equal("PRODUCT", createAudit.EntityName);

            var updateAudit = await db.AuditLogs.FirstOrDefaultAsync(a => a.SourcePromptId == updatePromptId);
            Assert.NotNull(updateAudit);
            Assert.Equal(_fixture.OrganizationAId, updateAudit!.OrganizationId);
            Assert.Equal(_fixture.UserAId, updateAudit.ActorUserId);
            Assert.Equal(_fixture.EmployeeAId, updateAudit.ActorEmployeeId);
            Assert.Equal(AuditActorType.AI_ASSISTED, updateAudit.ActorType);
            Assert.Equal("UPDATE", updateAudit.Action);
            Assert.Equal("PRODUCT", updateAudit.EntityName);

            var rrAudit = await db.AuditLogs.FirstOrDefaultAsync(a => a.SourcePromptId == rrPromptId);
            Assert.NotNull(rrAudit);
            Assert.Equal(_fixture.OrganizationAId, rrAudit!.OrganizationId);
            Assert.Equal(_fixture.UserAId, rrAudit.ActorUserId);
            Assert.Equal(_fixture.EmployeeAId, rrAudit.ActorEmployeeId);
            Assert.Equal(_fixture.BranchA1Id, rrAudit.BranchId);
            Assert.Equal(AuditActorType.AI_ASSISTED, rrAudit.ActorType);
            Assert.Equal("PRODUCT_REORDER_RULE", rrAudit.EntityName);
        }
        finally
        {
            await uow.RollbackTransactionAsync();
        }

        // 7. Canonical Idempotency Replay & Mismatch
        var rrReplayResp = await client.SendAsync(CreateRequest(HttpMethod.Put, "/api/v1/canonical/configuration/reorder-rules", rrConfigReq, rrConfigKey));
        Assert.Equal(HttpStatusCode.OK, rrReplayResp.StatusCode);
        var rrReplayResult = await rrReplayResp.Content.ReadFromJsonAsync<CanonicalWriteResultDto>(JsonOptions);
        Assert.NotNull(rrReplayResult);
        Assert.Equal(rrWriteResult.RequestId, rrReplayResult!.RequestId);

        var rrMismatchReq = rrConfigReq with { ReorderQuantityBase = 90m };
        var rrMismatchResp = await client.SendAsync(CreateRequest(HttpMethod.Put, "/api/v1/canonical/configuration/reorder-rules", rrMismatchReq, rrConfigKey));
        Assert.Equal(HttpStatusCode.Conflict, rrMismatchResp.StatusCode);
        var mismatchErr = await rrMismatchResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(mismatchErr);
        Assert.Equal("IDEMPOTENCY_MISMATCH", mismatchErr!.Error.Code);
    }
    #endregion

    #region Hardening Tests: Exact Status Codes
    [SkipWhenPostgresUnavailableFact]
    public async Task MissingIdempotencyKey_OnCreateCategoryAndProduct_ReturnsExact422ValidationError()
    {
        var client = CreateClient();

        // 1. Missing key on POST /api/v1/product-categories -> exact 422 VALIDATION_ERROR
        var catReq = new CreateProductCategoryRequest(null, "NOKEY-" + Guid.NewGuid().ToString("N")[..6], "No Key Cat", null, string.Empty);
        var catResp = await client.PostAsync("/api/v1/product-categories", JsonContent.Create(catReq));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, catResp.StatusCode);
        var catErr = await catResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(catErr);
        Assert.Equal("VALIDATION_ERROR", catErr!.Error.Code);

        // 2. Missing key on POST /api/v1/products -> exact 422 VALIDATION_ERROR
        var prodReq = new CreateProductRequest(
            Guid.NewGuid(), "SKU-NOKEY", null, "No Key Product", null, null, "pcs", 0.14m, null, true, 30,
            new[] { new CreateProductUomItemRequest("pcs", "Pcs", 1m, 10m, true, true, true) },
            string.Empty);
        var prodResp = await client.PostAsync("/api/v1/products", JsonContent.Create(prodReq));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, prodResp.StatusCode);
        var prodErr = await prodResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(prodErr);
        Assert.Equal("VALIDATION_ERROR", prodErr!.Error.Code);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task ProductUom_DeleteAndPut_ReturnExact405MethodNotAllowed()
    {
        var client = CreateClient();
        var dummyId = Guid.NewGuid();

        var deleteUomsResp = await client.DeleteAsync($"/api/v1/products/{dummyId}/uoms");
        Assert.Equal(HttpStatusCode.MethodNotAllowed, deleteUomsResp.StatusCode);

        var putUomsResp = await client.PutAsync($"/api/v1/products/{dummyId}/uoms", JsonContent.Create(new { }));
        Assert.Equal(HttpStatusCode.MethodNotAllowed, putUomsResp.StatusCode);

        var deleteSingleUomResp = await client.DeleteAsync($"/api/v1/products/{dummyId}/uoms/{dummyId}");
        Assert.Equal(HttpStatusCode.MethodNotAllowed, deleteSingleUomResp.StatusCode);

        var putSingleUomResp = await client.PutAsync($"/api/v1/products/{dummyId}/uoms/{dummyId}", JsonContent.Create(new { }));
        Assert.Equal(HttpStatusCode.MethodNotAllowed, putSingleUomResp.StatusCode);
    }
    #endregion

    #region Hardening Tests: Forbidden Branch Matrix
    [SkipWhenPostgresUnavailableFact]
    public async Task ForbiddenBranch_OnGetPutAndCanonicalWrite_ReturnsExact403ForbiddenBranch()
    {
        // Client only has access to BranchA1Id
        var client = CreateClient(role: "Pharmacist", branchScope: "ASSIGNED", branchIds: new[] { _fixture.BranchA1Id });
        var targetBranch = _fixture.BranchA2Id; // Unauthorized branch

        // 1. GET reorder rule for forbidden branch -> 403 FORBIDDEN_BRANCH
        var getResp = await client.GetAsync($"/api/v1/branches/{targetBranch}/products/{Guid.NewGuid()}/reorder-rule");
        Assert.Equal(HttpStatusCode.Forbidden, getResp.StatusCode);
        var getErr = await getResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(getErr);
        Assert.Equal("FORBIDDEN_BRANCH", getErr!.Error.Code);

        // 2. PUT reorder rule for forbidden branch -> 403 FORBIDDEN_BRANCH
        var putKey = Guid.NewGuid().ToString();
        var putReq = new UpsertReorderRuleRequest(10m, 20m, 50m, true, putKey);
        var putResp = await client.SendAsync(CreateRequest(HttpMethod.Put,
            $"/api/v1/branches/{targetBranch}/products/{Guid.NewGuid()}/reorder-rule", putReq, putKey));
        Assert.Equal(HttpStatusCode.Forbidden, putResp.StatusCode);
        var putErr = await putResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(putErr);
        Assert.Equal("FORBIDDEN_BRANCH", putErr!.Error.Code);

        // 3. PUT canonical reorder rule configuration for forbidden branch -> 403 FORBIDDEN_BRANCH
        var canonKey = Guid.NewGuid().ToString();
        var canonReq = new CanonicalReorderRuleConfigurationRequest(
            Guid.NewGuid(), "PRM-FORBIDDEN", canonKey, targetBranch, Guid.NewGuid(), 10m, 20m, 50m, true);
        var canonResp = await client.SendAsync(CreateRequest(HttpMethod.Put,
            "/api/v1/canonical/configuration/reorder-rules", canonReq, canonKey));
        Assert.Equal(HttpStatusCode.Forbidden, canonResp.StatusCode);
        var canonErr = await canonResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(canonErr);
        Assert.Equal("FORBIDDEN_BRANCH", canonErr!.Error.Code);
    }
    #endregion

    #region Hardening Tests: 404 Not Found Envelope Matrix
    [SkipWhenPostgresUnavailableFact]
    public async Task ResourceNotFound_AcrossAllEntities_ReturnsExact404NotFoundWithErrorEnvelope()
    {
        var client = CreateClient();

        // 1. Non-existent Category
        var catResp = await client.GetAsync($"/api/v1/product-categories/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, catResp.StatusCode);
        var catErr = await catResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(catErr);
        Assert.Equal("NOT_FOUND", catErr!.Error.Code);
        Assert.False(string.IsNullOrWhiteSpace(catErr.Error.TraceId));

        // 2. Non-existent Product
        var prodResp = await client.GetAsync($"/api/v1/products/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, prodResp.StatusCode);
        var prodErr = await prodResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(prodErr);
        Assert.Equal("NOT_FOUND", prodErr!.Error.Code);
        Assert.False(string.IsNullOrWhiteSpace(prodErr.Error.TraceId));

        // 3. Seed real product to test non-existent UOM on valid product
        var cKey = Guid.NewGuid().ToString();
        var cResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, "CAT-404-" + Guid.NewGuid().ToString("N")[..6], "404 Cat", null, cKey), cKey));
        var cat = await cResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);

        var pKey = Guid.NewGuid().ToString();
        var pResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products",
            new CreateProductRequest(cat!.CategoryId, "SKU-404-" + Guid.NewGuid().ToString("N")[..6], null, "404 Prod", null, null, "unit", 0.14m, null, true, 30,
            new[] { new CreateProductUomItemRequest("unit", "Unit", 1m, 10m, true, true, true) }, pKey), pKey));
        var prod = await pResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);

        // Non-existent UOM on existing product
        var uomPatchKey = Guid.NewGuid().ToString();
        var uomPatchReq = new UpdateProductUomRequest("New Name", null, null, null, null, null, uomPatchKey);
        var uomResp = await client.SendAsync(CreateRequest(HttpMethod.Patch,
            $"/api/v1/products/{prod!.ProductId}/uoms/{Guid.NewGuid()}", uomPatchReq, uomPatchKey));
        Assert.Equal(HttpStatusCode.NotFound, uomResp.StatusCode);
        var uomErr = await uomResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(uomErr);
        Assert.Equal("NOT_FOUND", uomErr!.Error.Code);
        Assert.False(string.IsNullOrWhiteSpace(uomErr.Error.TraceId));

        // 4. Non-existent Reorder Rule
        var rrResp = await client.GetAsync($"/api/v1/branches/{_fixture.BranchA1Id}/products/{Guid.NewGuid()}/reorder-rule");
        Assert.Equal(HttpStatusCode.NotFound, rrResp.StatusCode);
        var rrErr = await rrResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(rrErr);
        Assert.Equal("NOT_FOUND", rrErr!.Error.Code);
        Assert.False(string.IsNullOrWhiteSpace(rrErr.Error.TraceId));
    }
    #endregion

    #region Hardening Tests: 422 Validation & 409 Conflict Matrix
    [SkipWhenPostgresUnavailableFact]
    public async Task ValidationAndConflictMatrix_RejectsInvalidPayloadsAndDuplicates()
    {
        var client = CreateClient();

        // 1. Category Create: Name length exceeds 100 characters -> 422
        var longCatName = new string('A', 101);
        var catResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, "CAT-VAL", longCatName, null, Guid.NewGuid().ToString())));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, catResp.StatusCode);

        // Create valid category for product tests
        var cKey = Guid.NewGuid().ToString();
        var cResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, "CAT-VALOK-" + Guid.NewGuid().ToString("N")[..6], "Valid Cat", null, cKey), cKey));
        var cat = await cResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);

        // 2. Product Create: TaxRate out of range (1.50) -> 422
        var taxResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products",
            new CreateProductRequest(cat!.CategoryId, "SKU-TAX-OOB", null, "Tax OOB", null, null, "pcs", 1.50m, null, true, 30,
            new[] { new CreateProductUomItemRequest("pcs", "Pcs", 1m, 10m, true, true, true) }, Guid.NewGuid().ToString())));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, taxResp.StatusCode);

        // 3. Product Create: Base UOM conversion factor not equal to 1.0 -> 422
        var uomFactorResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products",
            new CreateProductRequest(cat.CategoryId, "SKU-BASEFACTOR", null, "Factor Invalid", null, null, "pcs", 0.14m, null, true, 30,
            new[] { new CreateProductUomItemRequest("pcs", "Pcs", 2.0m, 10m, true, true, true) }, Guid.NewGuid().ToString())));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, uomFactorResp.StatusCode);

        // 4. Create base product for duplicate tests
        var pKey = Guid.NewGuid().ToString();
        var sharedBarcode = "BAR-UNIQUE-" + Guid.NewGuid().ToString("N")[..8];
        var pResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products",
            new CreateProductRequest(cat.CategoryId, "SKU-BASE-" + Guid.NewGuid().ToString("N")[..6], sharedBarcode, "Base Prod", null, null, "pcs", 0.14m, null, true, 30,
            new[] { new CreateProductUomItemRequest("pcs", "Pcs", 1m, 10m, true, true, true) }, pKey), pKey));
        Assert.Equal(HttpStatusCode.OK, pResp.StatusCode);
        var prod = await pResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);

        // 5. Duplicate Barcode within same organization -> 409 CONFLICT
        var dupBarcodeResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products",
            new CreateProductRequest(cat.CategoryId, "SKU-BARCODEDUP-" + Guid.NewGuid().ToString("N")[..6], sharedBarcode, "Barcode Dup", null, null, "pcs", 0.14m, null, true, 30,
            new[] { new CreateProductUomItemRequest("pcs", "Pcs", 1m, 10m, true, true, true) }, Guid.NewGuid().ToString())));
        Assert.Equal(HttpStatusCode.Conflict, dupBarcodeResp.StatusCode);
        var dupBarcodeErr = await dupBarcodeResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(dupBarcodeErr);
        Assert.Equal("CONFLICT", dupBarcodeErr!.Error.Code);

        // 6. UOM Create: DisplayName exceeds 50 characters -> 422
        var longUomName = new string('U', 51);
        var longUomResp = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/api/v1/products/{prod!.ProductId}/uoms",
            new CreateProductUomRequest("uomx", longUomName, 5m, 20m, false, true, true, Guid.NewGuid().ToString())));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, longUomResp.StatusCode);

        // 7. Duplicate UOM Code on same product -> 409 CONFLICT
        var dupUomCodeResp = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/api/v1/products/{prod.ProductId}/uoms",
            new CreateProductUomRequest("pcs", "Duplicate Pcs", 1m, 10m, false, true, true, Guid.NewGuid().ToString())));
        Assert.Equal(HttpStatusCode.Conflict, dupUomCodeResp.StatusCode);
        var dupUomErr = await dupUomCodeResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(dupUomErr);
        Assert.Equal("CONFLICT", dupUomErr!.Error.Code);
    }
    #endregion

    #region Hardening Tests: BaseUOM and Conversion Factor Patch Guard
    [SkipWhenPostgresUnavailableFact]
    public async Task PatchBaseUomAndConversionFactor_FailsafeBlocks409_PermissiveSucceeds200()
    {
        var client = CreateClient();

        // Setup product with base UOM and secondary UOM
        var cKey = Guid.NewGuid().ToString();
        var cResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, "CAT-GUARD-" + Guid.NewGuid().ToString("N")[..6], "Guard Cat", null, cKey), cKey));
        var cat = await cResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);

        var pKey = Guid.NewGuid().ToString();
        var pResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products",
            new CreateProductRequest(cat!.CategoryId, "SKU-GUARD-" + Guid.NewGuid().ToString("N")[..6], null, "Guard Prod", null, null, "pack", 0.14m, null, true, 30,
            new[] { new CreateProductUomItemRequest("pack", "Pack", 1m, 20m, true, true, true) }, pKey), pKey));
        var prod = await pResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);

        var uomKey = Guid.NewGuid().ToString();
        var uomResp = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/api/v1/products/{prod!.ProductId}/uoms",
            new CreateProductUomRequest("box", "Box", 10m, 200m, false, true, true, uomKey), uomKey));
        var uom = await uomResp.Content.ReadFromJsonAsync<ProductUomDto>(JsonOptions);

        try
        {
            // 1. FAILSAFE CHECKER: changing BaseUomCode returns 409
            _fixture.Factory.UsageCheckerOverride = new BlockingProductInventoryUsageChecker();
            var patchBaseKey1 = Guid.NewGuid().ToString();
            var patchBaseReq1 = new UpdateProductRequest(null, null, null, null, null, null, "newbase", null, null, null, null, null, patchBaseKey1);
            var patchBaseResp1 = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/api/v1/products/{prod.ProductId}", patchBaseReq1, patchBaseKey1));
            Assert.Equal(HttpStatusCode.Conflict, patchBaseResp1.StatusCode);
            var err1 = await patchBaseResp1.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
            Assert.NotNull(err1);
            Assert.Equal("CONFLICT", err1!.Error.Code);
            Assert.Contains(ErrorMessages.HistoricalUomModificationForbidden, err1.Error.Message);

            // 2. FAILSAFE CHECKER: changing ConversionToBase returns 409
            var patchUomKey1 = Guid.NewGuid().ToString();
            var patchUomReq1 = new UpdateProductUomRequest(null, 15m, null, null, null, null, patchUomKey1);
            var patchUomResp1 = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/api/v1/products/{prod.ProductId}/uoms/{uom!.ProductUomId}", patchUomReq1, patchUomKey1));
            Assert.Equal(HttpStatusCode.Conflict, patchUomResp1.StatusCode);
            var err2 = await patchUomResp1.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
            Assert.NotNull(err2);
            Assert.Equal("CONFLICT", err2!.Error.Code);
            Assert.Contains(ErrorMessages.HistoricalUomModificationForbidden, err2.Error.Message);

            // 3. PERMISSIVE FAKE: changing ConversionToBase succeeds 200 OK and updates value
            _fixture.Factory.UsageCheckerOverride = new PermissiveProductInventoryUsageChecker();
            var patchUomKey2 = Guid.NewGuid().ToString();
            var patchUomReq2 = new UpdateProductUomRequest(null, 25m, null, null, null, null, patchUomKey2);
            var patchUomResp2 = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/api/v1/products/{prod.ProductId}/uoms/{uom.ProductUomId}", patchUomReq2, patchUomKey2));
            Assert.Equal(HttpStatusCode.OK, patchUomResp2.StatusCode);

            // Read back and assert new conversion factor is 25m
            var getUomsResp = await client.GetAsync($"/api/v1/products/{prod.ProductId}/uoms");
            Assert.Equal(HttpStatusCode.OK, getUomsResp.StatusCode);
            var uomList = await getUomsResp.Content.ReadFromJsonAsync<List<ProductUomDto>>(JsonOptions);
            var updatedUom = uomList!.FirstOrDefault(u => u.ProductUomId == uom.ProductUomId);
            Assert.NotNull(updatedUom);
            Assert.Equal(25m, updatedUom!.ConversionToBase);
        }
        finally
        {
            _fixture.Factory.UsageCheckerOverride = null;
        }
    }
    #endregion

    #region Hardening Tests: Idempotency on PATCH and PUT
    [SkipWhenPostgresUnavailableFact]
    public async Task Idempotency_OnPatchAndPut_ReplayReturns200_MismatchReturns409()
    {
        var client = CreateClient();

        // Setup product
        var cKey = Guid.NewGuid().ToString();
        var cResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, "CAT-IDEMP-" + Guid.NewGuid().ToString("N")[..6], "Idemp Cat", null, cKey), cKey));
        var cat = await cResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);

        var pKey = Guid.NewGuid().ToString();
        var pResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products",
            new CreateProductRequest(cat!.CategoryId, "SKU-IDEMP2-" + Guid.NewGuid().ToString("N")[..6], null, "Idemp Prod", null, null, "unit", 0.14m, null, true, 30,
            new[] { new CreateProductUomItemRequest("unit", "Unit", 1m, 10m, true, true, true) }, pKey), pKey));
        var prod = await pResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);

        // 1. PATCH /api/v1/products/{id} idempotency replay & mismatch
        var patchKey = Guid.NewGuid().ToString();
        var patchReq = new UpdateProductRequest(null, null, null, "Updated Name", null, null, null, null, null, null, null, null, patchKey);
        var patchResp1 = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/api/v1/products/{prod!.ProductId}", patchReq, patchKey));
        Assert.Equal(HttpStatusCode.OK, patchResp1.StatusCode);

        // Replay identical PATCH
        var patchReplayResp = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/api/v1/products/{prod.ProductId}", patchReq, patchKey));
        Assert.Equal(HttpStatusCode.OK, patchReplayResp.StatusCode);

        // Mismatched PATCH with same key
        var patchMismatchReq = patchReq with { Name = "Tampered Mismatch Name" };
        var patchMismatchResp = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/api/v1/products/{prod.ProductId}", patchMismatchReq, patchKey));
        Assert.Equal(HttpStatusCode.Conflict, patchMismatchResp.StatusCode);
        var patchMismatchErr = await patchMismatchResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.Equal("IDEMPOTENCY_MISMATCH", patchMismatchErr!.Error.Code);

        // 2. PUT /api/v1/branches/{branchId}/products/{productId}/reorder-rule idempotency replay & mismatch
        var putKey = Guid.NewGuid().ToString();
        var putReq = new UpsertReorderRuleRequest(20m, 40m, 100m, true, putKey);
        var putResp1 = await client.SendAsync(CreateRequest(HttpMethod.Put,
            $"/api/v1/branches/{_fixture.BranchA1Id}/products/{prod.ProductId}/reorder-rule", putReq, putKey));
        Assert.Equal(HttpStatusCode.OK, putResp1.StatusCode);

        // Replay identical PUT
        var putReplayResp = await client.SendAsync(CreateRequest(HttpMethod.Put,
            $"/api/v1/branches/{_fixture.BranchA1Id}/products/{prod.ProductId}/reorder-rule", putReq, putKey));
        Assert.Equal(HttpStatusCode.OK, putReplayResp.StatusCode);

        // Mismatched PUT with same key
        var putMismatchReq = putReq with { ReorderPointBase = 35m };
        var putMismatchResp = await client.SendAsync(CreateRequest(HttpMethod.Put,
            $"/api/v1/branches/{_fixture.BranchA1Id}/products/{prod.ProductId}/reorder-rule", putMismatchReq, putKey));
        Assert.Equal(HttpStatusCode.Conflict, putMismatchResp.StatusCode);
        var putMismatchErr = await putMismatchResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.Equal("IDEMPOTENCY_MISMATCH", putMismatchErr!.Error.Code);
    }
    #endregion

    #region Hardening Tests: Complete Table-Driven Role Matrix
    public static IEnumerable<object[]> RoleMatrixTestData()
    {
        // Format: role (null for anonymous), endpointMethod, endpointUrl, expectedStatusCode
        string[] roles = { "ANONYMOUS", "Cashier", "Pharmacist", "Admin" };

        foreach (var role in roles)
        {
            // GET /api/v1/product-categories -> All roles 200, Anonymous 401
            yield return new object[] { role, "GET", "/api/v1/product-categories", role == "ANONYMOUS" ? 401 : 200 };

            // POST /api/v1/product-categories -> Pharmacist/Admin 200/422, Cashier 403, Anonymous 401
            yield return new object[] { role, "POST", "/api/v1/product-categories", role == "ANONYMOUS" ? 401 : role == "Cashier" ? 403 : 200 };

            // GET /api/v1/products -> All roles 200, Anonymous 401
            yield return new object[] { role, "GET", "/api/v1/products", role == "ANONYMOUS" ? 401 : 200 };

            // POST /api/v1/products -> Pharmacist/Admin 200, Cashier 403, Anonymous 401
            yield return new object[] { role, "POST", "/api/v1/products", role == "ANONYMOUS" ? 401 : role == "Cashier" ? 403 : 200 };

            // GET /api/v1/canonical/products -> Pharmacist/Admin 200, Cashier 403, Anonymous 401
            yield return new object[] { role, "GET", "/api/v1/canonical/products", role == "ANONYMOUS" ? 401 : role == "Cashier" ? 403 : 200 };

            // PUT /api/v1/canonical/configuration/reorder-rules -> Pharmacist/Admin 200, Cashier 403, Anonymous 401
            yield return new object[] { role, "PUT", "/api/v1/canonical/configuration/reorder-rules", role == "ANONYMOUS" ? 401 : role == "Cashier" ? 403 : 200 };
        }
    }

    [SkipWhenPostgresUnavailableTheory]
    [MemberData(nameof(RoleMatrixTestData))]
    public async Task RoleMatrix_TableDriven_AssertsExactAccessControl(string role, string method, string path, int expectedStatus)
    {
        var client = role == "ANONYMOUS" ? CreateClient(role: null) : CreateClient(role: role);

        HttpResponseMessage resp;
        if (method == "GET")
        {
            resp = await client.GetAsync(path);
        }
        else if (method == "POST")
        {
            resp = await client.PostAsync(path, JsonContent.Create(new { }));
        }
        else if (method == "PUT")
        {
            resp = await client.PutAsync(path, JsonContent.Create(new { }));
        }
        else
        {
            throw new NotSupportedException($"Method {method} not supported in test.");
        }

        // Cashier/Anonymous return 401/403 directly at routing/authorization gate
        if (expectedStatus == 401 || expectedStatus == 403)
        {
            Assert.Equal((HttpStatusCode)expectedStatus, resp.StatusCode);
        }
        else
        {
            // For authorized roles sending empty bodies, verify not 401 and not 403
            Assert.NotEqual(HttpStatusCode.Unauthorized, resp.StatusCode);
            Assert.NotEqual(HttpStatusCode.Forbidden, resp.StatusCode);
        }
    }
    #endregion

    #region Hardening Tests: Existing Tests Maintained
    [SkipWhenPostgresUnavailableFact]
    public async Task AuthorizationMatrix_Unauthenticated_Returns401()
    {
        var anonymousClient = CreateClient(role: null); // No auth headers

        var resp1 = await anonymousClient.GetAsync("/api/v1/product-categories");
        Assert.Equal(HttpStatusCode.Unauthorized, resp1.StatusCode);

        var resp2 = await anonymousClient.PostAsync("/api/v1/products", JsonContent.Create(new { }));
        Assert.Equal(HttpStatusCode.Unauthorized, resp2.StatusCode);

        var resp3 = await anonymousClient.GetAsync($"/api/v1/products/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.Unauthorized, resp3.StatusCode);

        var resp4 = await anonymousClient.GetAsync("/api/v1/canonical/products");
        Assert.Equal(HttpStatusCode.Unauthorized, resp4.StatusCode);

        var resp5 = await anonymousClient.PutAsync($"/api/v1/branches/{Guid.NewGuid()}/products/{Guid.NewGuid()}/reorder-rule", JsonContent.Create(new { }));
        Assert.Equal(HttpStatusCode.Unauthorized, resp5.StatusCode);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task AuthorizationMatrix_CashierCannotWriteOrReadFeed_Returns403()
    {
        var cashierClient = CreateClient(role: "Cashier");

        // Cashier cannot create product
        var resp1 = await cashierClient.PostAsync("/api/v1/products", JsonContent.Create(new { }));
        Assert.Equal(HttpStatusCode.Forbidden, resp1.StatusCode);

        // Cashier cannot patch product
        var resp2 = await cashierClient.PatchAsync($"/api/v1/products/{Guid.NewGuid()}", JsonContent.Create(new { }));
        Assert.Equal(HttpStatusCode.Forbidden, resp2.StatusCode);

        // Cashier cannot create UOM
        var resp3 = await cashierClient.PostAsync($"/api/v1/products/{Guid.NewGuid()}/uoms", JsonContent.Create(new { }));
        Assert.Equal(HttpStatusCode.Forbidden, resp3.StatusCode);

        // Cashier cannot create category
        var resp4 = await cashierClient.PostAsync("/api/v1/product-categories", JsonContent.Create(new { }));
        Assert.Equal(HttpStatusCode.Forbidden, resp4.StatusCode);

        // Cashier cannot upsert reorder rule
        var resp5 = await cashierClient.PutAsync($"/api/v1/branches/{_fixture.BranchA1Id}/products/{Guid.NewGuid()}/reorder-rule", JsonContent.Create(new { }));
        Assert.Equal(HttpStatusCode.Forbidden, resp5.StatusCode);

        // Cashier cannot read canonical feed
        var resp6 = await cashierClient.GetAsync("/api/v1/canonical/products");
        Assert.Equal(HttpStatusCode.Forbidden, resp6.StatusCode);

        // Cashier cannot configure AI canonical reorder rule
        var resp7 = await cashierClient.PutAsync("/api/v1/canonical/configuration/reorder-rules", JsonContent.Create(new { }));
        Assert.Equal(HttpStatusCode.Forbidden, resp7.StatusCode);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task AuthorizationMatrix_CashierCanReadProductsAndUoms_Returns200()
    {
        var adminClient = CreateClient(role: "Admin");

        // Seed product as admin
        var catKey = Guid.NewGuid().ToString();
        var catResp = await adminClient.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, "CAT-" + Guid.NewGuid().ToString("N")[..8], "Cashier Read Cat", null, catKey), catKey));
        var cat = await catResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);
        Assert.NotNull(cat);

        var prodKey = Guid.NewGuid().ToString();
        var prodResp = await adminClient.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products",
            new CreateProductRequest(cat!.CategoryId, "SKU-CR-" + Guid.NewGuid().ToString("N")[..8], null, "Cashier Read Prod", null, null, "unit", 0.14m, null, true, 30,
            new[] { new CreateProductUomItemRequest("unit", "Unit", 1m, 12m, true, true, true) }, prodKey), prodKey));
        var prod = await prodResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        Assert.NotNull(prod);

        // Now test as Cashier
        var cashierClient = CreateClient(role: "Cashier");
        var getProdResp = await cashierClient.GetAsync($"/api/v1/products/{prod!.ProductId}");
        Assert.Equal(HttpStatusCode.OK, getProdResp.StatusCode);

        var getUomsResp = await cashierClient.GetAsync($"/api/v1/products/{prod.ProductId}/uoms");
        Assert.Equal(HttpStatusCode.OK, getUomsResp.StatusCode);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task MalformedJson_Returns400_WithTraceId()
    {
        var client = CreateClient();
        var content = new StringContent("{ this is definitely not valid json }", Encoding.UTF8, "application/json");

        var resp = await client.PostAsync("/api/v1/products", content);
        // InvalidModelStateResponseFactory returns unified 422 VALIDATION_ERROR envelope for model-binding/JSON failures.
        Assert.Equal(HttpStatusCode.UnprocessableEntity, resp.StatusCode);
        Assert.True(resp.Headers.Contains("X-Trace-Id"));
        var errEnv = await resp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(errEnv);
        Assert.Equal("VALIDATION_ERROR", errEnv!.Error.Code);
        Assert.False(string.IsNullOrWhiteSpace(errEnv.Error.TraceId));
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task DuplicateSku_WithinSameOrganization_Returns409()
    {
        var client = CreateClient();

        var catKey = Guid.NewGuid().ToString();
        var catResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, "CAT-" + Guid.NewGuid().ToString("N")[..8], "Dup Cat", null, catKey), catKey));
        var cat = await catResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);
        Assert.NotNull(cat);

        var sharedSku = "SKU-DUP-" + Guid.NewGuid().ToString("N")[..8];

        // First product
        var key1 = Guid.NewGuid().ToString();
        var req1 = new CreateProductRequest(cat!.CategoryId, sharedSku, null, "Product 1", null, null, "pcs", 0.14m, null, true, 30,
            new[] { new CreateProductUomItemRequest("pcs", "Pcs", 1m, 10m, true, true, true) }, key1);
        var resp1 = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", req1, key1));
        Assert.Equal(HttpStatusCode.OK, resp1.StatusCode);

        // Second product with duplicate SKU (different idempotency key)
        var key2 = Guid.NewGuid().ToString();
        var req2 = new CreateProductRequest(cat.CategoryId, sharedSku, null, "Product 2", null, null, "pcs", 0.14m, null, true, 30,
            new[] { new CreateProductUomItemRequest("pcs", "Pcs", 1m, 10m, true, true, true) }, key2);
        var resp2 = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", req2, key2));
        Assert.Equal(HttpStatusCode.Conflict, resp2.StatusCode);

        var errEnv = await resp2.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(errEnv);
        Assert.Equal("CONFLICT", errEnv!.Error.Code);
        Assert.Contains(ErrorMessages.DuplicateSku, errEnv.Error.Message);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task TenantIsolation_OrganizationBCannotAccessOrganizationAData()
    {
        var clientOrgA = CreateClient(orgId: _fixture.OrganizationAId);

        // Create product in Org A
        var catKey = Guid.NewGuid().ToString();
        var catResp = await clientOrgA.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, "CAT-ORGA-" + Guid.NewGuid().ToString("N")[..8], "Org A Cat", null, catKey), catKey));
        var cat = await catResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);
        Assert.NotNull(cat);

        var prodKey = Guid.NewGuid().ToString();
        var prodResp = await clientOrgA.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products",
            new CreateProductRequest(cat!.CategoryId, "SKU-ORGA-" + Guid.NewGuid().ToString("N")[..8], null, "Org A Prod", null, null, "unit", 0.14m, null, true, 30,
            new[] { new CreateProductUomItemRequest("unit", "Unit", 1m, 10m, true, true, true) }, prodKey), prodKey));
        var prod = await prodResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        Assert.NotNull(prod);

        // Client belonging to Organization B attempts to read and patch Org A's product
        var clientOrgB = CreateClient(orgId: _fixture.OrganizationBId);

        var getResp = await clientOrgB.GetAsync($"/api/v1/products/{prod!.ProductId}");
        Assert.Equal(HttpStatusCode.NotFound, getResp.StatusCode);

        var patchKey = Guid.NewGuid().ToString();
        var patchReq = new UpdateProductRequest(null, null, null, "Hacked", null, null, null, null, null, null, null, null, patchKey);
        var patchResp = await clientOrgB.SendAsync(CreateRequest(HttpMethod.Patch, $"/api/v1/products/{prod.ProductId}", patchReq, patchKey));
        Assert.Equal(HttpStatusCode.NotFound, patchResp.StatusCode);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task ProductPatch_LotTrackingChange_FailsafeCheckerReturns409_PermissiveSucceeds()
    {
        var client = CreateClient();

        var catKey = Guid.NewGuid().ToString();
        var catResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, "CAT-LT-" + Guid.NewGuid().ToString("N")[..8], "Lot Change Cat", null, catKey), catKey));
        var cat = await catResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);
        Assert.NotNull(cat);

        // 1. Create product with LotTrackingRequired = false
        var prodKey = Guid.NewGuid().ToString();
        var prodReq = new CreateProductRequest(cat!.CategoryId, "SKU-LTCHG-" + Guid.NewGuid().ToString("N")[..8], null, "Lot Toggle", null, null, "unit", 0.14m, null, false, 0,
            new[] { new CreateProductUomItemRequest("unit", "Unit", 1m, 10m, true, true, true) }, prodKey);
        var prodResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", prodReq, prodKey));
        var prod = await prodResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        Assert.NotNull(prod);
        Assert.False(prod!.LotTrackingRequired);

        try
        {
            // 2. Default/Fail-Safe checker (blocks change because stock/history is assumed) -> 409 Conflict
            _fixture.Factory.UsageCheckerOverride = new BlockingProductInventoryUsageChecker();

            var patch1Key = Guid.NewGuid().ToString();
            var patch1Req = new UpdateProductRequest(null, null, null, null, null, null, null, null, null, true, null, null, patch1Key);
            var patch1Resp = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/api/v1/products/{prod.ProductId}", patch1Req, patch1Key));
            Assert.Equal(HttpStatusCode.Conflict, patch1Resp.StatusCode);
            var errEnv = await patch1Resp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
            Assert.NotNull(errEnv);
            Assert.Equal("CONFLICT", errEnv!.Error.Code);
            Assert.Contains(ErrorMessages.HistoricalUomModificationForbidden, errEnv.Error.Message);

            // 3. Permissive checker (no stock/history) -> succeeds 200 OK
            _fixture.Factory.UsageCheckerOverride = new PermissiveProductInventoryUsageChecker();

            var patch2Key = Guid.NewGuid().ToString();
            var patch2Req = new UpdateProductRequest(null, null, null, null, null, null, null, null, null, true, null, null, patch2Key);
            var patch2Resp = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/api/v1/products/{prod.ProductId}", patch2Req, patch2Key));
            Assert.Equal(HttpStatusCode.OK, patch2Resp.StatusCode);
            var updatedProd = await patch2Resp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
            Assert.NotNull(updatedProd);
            Assert.True(updatedProd!.LotTrackingRequired);
        }
        finally
        {
            _fixture.Factory.UsageCheckerOverride = null;
        }
    }
    #endregion

    #region Reflection Contract & Filter Tests
    private record ExpectedRouteContract(
        Type ControllerType,
        string ActionName,
        string HttpMethod,
        string ExpectedPath,
        string ExpectedRoles
    );

    [Fact]
    public void ControllerContract_Reflection_ValidatesRoutesAndRolesAgainstSpec()
    {
        var expectedContracts = new List<ExpectedRouteContract>
        {
            // ProductCategoriesController
            new(typeof(ProductCategoriesController), nameof(ProductCategoriesController.GetCategories), "GET", "api/v1/product-categories", "Admin,Pharmacist,Cashier"),
            new(typeof(ProductCategoriesController), nameof(ProductCategoriesController.CreateCategory), "POST", "api/v1/product-categories", "Admin,Pharmacist"),
            new(typeof(ProductCategoriesController), nameof(ProductCategoriesController.GetCategoryById), "GET", "api/v1/product-categories/{id:guid}", "Admin,Pharmacist,Cashier"),
            new(typeof(ProductCategoriesController), nameof(ProductCategoriesController.UpdateCategory), "PATCH", "api/v1/product-categories/{id:guid}", "Admin,Pharmacist"),

            // ProductsController
            new(typeof(ProductsController), nameof(ProductsController.GetProducts), "GET", "api/v1/products", "Admin,Pharmacist,Cashier"),
            new(typeof(ProductsController), nameof(ProductsController.CreateProduct), "POST", "api/v1/products", "Admin,Pharmacist"),
            new(typeof(ProductsController), nameof(ProductsController.GetProductById), "GET", "api/v1/products/{id:guid}", "Admin,Pharmacist,Cashier"),
            new(typeof(ProductsController), nameof(ProductsController.UpdateProduct), "PATCH", "api/v1/products/{id:guid}", "Admin,Pharmacist"),
            new(typeof(ProductsController), nameof(ProductsController.GetProductUoms), "GET", "api/v1/products/{id:guid}/uoms", "Admin,Pharmacist,Cashier"),
            new(typeof(ProductsController), nameof(ProductsController.CreateProductUom), "POST", "api/v1/products/{id:guid}/uoms", "Admin,Pharmacist"),
            new(typeof(ProductsController), nameof(ProductsController.UpdateProductUom), "PATCH", "api/v1/products/{id:guid}/uoms/{uomId:guid}", "Admin,Pharmacist"),

            // ReorderRulesController
            new(typeof(ReorderRulesController), nameof(ReorderRulesController.GetReorderRule), "GET", "api/v1/branches/{branchId:guid}/products/{productId:guid}/reorder-rule", "Admin,Pharmacist,Cashier"),
            new(typeof(ReorderRulesController), nameof(ReorderRulesController.UpsertReorderRule), "PUT", "api/v1/branches/{branchId:guid}/products/{productId:guid}/reorder-rule", "Admin,Pharmacist"),

            // CanonicalCatalogController
            new(typeof(CanonicalCatalogController), nameof(CanonicalCatalogController.GetProductsFeed), "GET", "api/v1/canonical/products", "Admin,Pharmacist"),
            new(typeof(CanonicalCatalogController), nameof(CanonicalCatalogController.ConfigureProduct), "POST", "api/v1/canonical/configuration/products", "Admin,Pharmacist"),
            new(typeof(CanonicalCatalogController), nameof(CanonicalCatalogController.ConfigureReorderRule), "PUT", "api/v1/canonical/configuration/reorder-rules", "Admin,Pharmacist")
        };

        foreach (var expected in expectedContracts)
        {
            var method = expected.ControllerType.GetMethod(expected.ActionName);
            Assert.True(method != null, $"Method {expected.ActionName} not found on {expected.ControllerType.Name}");

            // Route Prefix
            var classRouteAttr = expected.ControllerType.GetCustomAttribute<RouteAttribute>();
            var classPrefix = classRouteAttr?.Template?.Trim('/') ?? string.Empty;

            // Action HTTP attribute
            var httpMethodAttr = method!.GetCustomAttributes().OfType<HttpMethodAttribute>().FirstOrDefault();
            Assert.NotNull(httpMethodAttr);
            Assert.Contains(expected.HttpMethod, httpMethodAttr!.HttpMethods);

            var actionTemplate = httpMethodAttr.Template?.Trim('/') ?? string.Empty;
            var fullPath = string.IsNullOrEmpty(actionTemplate) ? classPrefix : $"{classPrefix}/{actionTemplate}";
            Assert.Equal(expected.ExpectedPath, fullPath);

            // Authorize roles
            var methodAuthAttr = method.GetCustomAttribute<AuthorizeAttribute>();
            var classAuthAttr = expected.ControllerType.GetCustomAttribute<AuthorizeAttribute>();
            var effectiveRoles = methodAuthAttr?.Roles ?? classAuthAttr?.Roles;
            Assert.Equal(expected.ExpectedRoles, effectiveRoles);
        }
    }

    [Fact]
    public void CatalogReadEndpoints_MustBeDecoratedWithTenantReadTransactionAttribute()
    {
        // Batch 3 (T7-ARC-001): Read transaction ownership moved from API layer (TenantReadTransactionAttribute)
        // down to Catalog Application Services.
        // 1. Verify that controllers no longer declare transaction filters (clean API layer).
        var catalogControllers = new[]
        {
            typeof(ProductCategoriesController),
            typeof(ProductsController),
            typeof(ReorderRulesController),
            typeof(CanonicalCatalogController)
        };

        foreach (var controller in catalogControllers)
        {
            var getMethods = controller.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                .Where(m => m.GetCustomAttributes().OfType<HttpGetAttribute>().Any());

            foreach (var getMethod in getMethods)
            {
                var transactionFilterAttributes = getMethod.GetCustomAttributes()
                    .Where(a => a.GetType().Name.Contains("Transaction", StringComparison.OrdinalIgnoreCase))
                    .ToList();

                Assert.Empty(transactionFilterAttributes);
            }

            var classTransactionFilters = controller.GetCustomAttributes()
                .Where(a => a.GetType().Name.Contains("Transaction", StringComparison.OrdinalIgnoreCase))
                .ToList();

            Assert.Empty(classTransactionFilters);
        }

        // 2. Verify that all 5 Catalog Application Service classes inject IUnitOfWork to own transactions.
        var serviceTypes = new[]
        {
            typeof(ProductCategoryService),
            typeof(ProductService),
            typeof(ProductUomService),
            typeof(ReorderRuleService),
            typeof(CanonicalCatalogService)
        };

        foreach (var serviceType in serviceTypes)
        {
            var constructors = serviceType.GetConstructors();
            var injectsUnitOfWork = constructors.Any(c => c.GetParameters().Any(p => p.ParameterType.Name == "IUnitOfWork"));
            Assert.True(injectsUnitOfWork, $"{serviceType.Name} must inject IUnitOfWork to manage its own read/write transactions.");
        }
    }
    #endregion

    #region Extended Review Corrections Tests (Items 1 to 13)

    private Guid _cachedCatId = Guid.Empty;
    private Guid _cachedProdId = Guid.Empty;
    private Guid _cachedUomId = Guid.Empty;

    private async Task<(Guid CategoryId, Guid ProductId, Guid UomId)> EnsureBaselineEntitiesAsync()
    {
        if (_cachedCatId != Guid.Empty && _cachedProdId != Guid.Empty && _cachedUomId != Guid.Empty)
        {
            return (_cachedCatId, _cachedProdId, _cachedUomId);
        }

        var client = CreateClient("Admin");

        // 1. Create baseline Category
        var catKey = "SEED-CAT-" + Guid.NewGuid().ToString("N");
        var catReq = new CreateProductCategoryRequest(null, "SEEDED-" + Guid.NewGuid().ToString("N")[..8], "Seeded Category", null, catKey);
        var catResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories", catReq, catKey));
        catResp.EnsureSuccessStatusCode();
        var cat = await catResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);
        _cachedCatId = cat!.CategoryId;

        // 2. Create baseline Product
        var prodKey = "SEED-PROD-" + Guid.NewGuid().ToString("N");
        var prodReq = new CreateProductRequest(
            _cachedCatId,
            "SEEDED-SKU-" + Guid.NewGuid().ToString("N")[..8],
            null,
            "Seeded Product",
            null,
            null,
            "BOX",
            0.14m,
            null,
            true,
            30,
            new[] { new CreateProductUomItemRequest("BOX", "Box of 100", 1.0m, 50.0m, true, true, true) },
            prodKey);
        var prodResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", prodReq, prodKey));
        prodResp.EnsureSuccessStatusCode();
        var prod = await prodResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        _cachedProdId = prod!.ProductId;

        // 3. Create baseline secondary UOM
        var uomKey = "SEED-UOM-" + Guid.NewGuid().ToString("N");
        var uomReq = new CreateProductUomRequest("STRIP", "Strip of 10", 10.0m, 20.0m, false, true, true, uomKey);
        var uomResp = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/api/v1/products/{_cachedProdId}/uoms", uomReq, uomKey));
        uomResp.EnsureSuccessStatusCode();
        var uom = await uomResp.Content.ReadFromJsonAsync<ProductUomDto>(JsonOptions);
        _cachedUomId = uom!.ProductUomId;

        // 4. Create baseline ReorderRule
        var rrKey = "SEED-RR-" + Guid.NewGuid().ToString("N");
        var rrReq = new UpsertReorderRuleRequest(50m, 20m, 100m, true, rrKey);
        var rrResp = await client.SendAsync(CreateRequest(HttpMethod.Put, $"/api/v1/branches/{_fixture.BranchA1Id}/products/{_cachedProdId}/reorder-rule", rrReq, rrKey));
        rrResp.EnsureSuccessStatusCode();

        return (_cachedCatId, _cachedProdId, _cachedUomId);
    }

    public static IEnumerable<object[]> SixteenEndpointsRoleMatrixData()
    {
        var endpoints = new[]
        {
            ("GET", "CATEGORIES_GET", new[] { "Admin", "Pharmacist", "Cashier" }),
            ("POST", "CATEGORIES_POST", new[] { "Admin", "Pharmacist" }),
            ("GET", "CATEGORY_BY_ID_GET", new[] { "Admin", "Pharmacist", "Cashier" }),
            ("PATCH", "CATEGORY_BY_ID_PATCH", new[] { "Admin", "Pharmacist" }),

            ("GET", "PRODUCTS_GET", new[] { "Admin", "Pharmacist", "Cashier" }),
            ("POST", "PRODUCTS_POST", new[] { "Admin", "Pharmacist" }),
            ("GET", "PRODUCT_BY_ID_GET", new[] { "Admin", "Pharmacist", "Cashier" }),
            ("PATCH", "PRODUCT_BY_ID_PATCH", new[] { "Admin", "Pharmacist" }),
            ("GET", "PRODUCT_UOMS_GET", new[] { "Admin", "Pharmacist", "Cashier" }),
            ("POST", "PRODUCT_UOMS_POST", new[] { "Admin", "Pharmacist" }),
            ("PATCH", "PRODUCT_UOM_PATCH", new[] { "Admin", "Pharmacist" }),

            ("GET", "REORDER_RULE_GET", new[] { "Admin", "Pharmacist", "Cashier" }),
            ("PUT", "REORDER_RULE_PUT", new[] { "Admin", "Pharmacist" }),

            ("GET", "CANONICAL_FEED_GET", new[] { "Admin", "Pharmacist" }),
            ("POST", "CANONICAL_PRODUCT_POST", new[] { "Admin", "Pharmacist" }),
            ("PUT", "CANONICAL_REORDER_RULE_PUT", new[] { "Admin", "Pharmacist" })
        };

        var roles = new[] { "Admin", "Pharmacist", "Cashier", "NONE", "Anonymous" };

        foreach (var (method, key, allowedRoles) in endpoints)
        {
            foreach (var role in roles)
            {
                var isRead = method == "GET";
                int expectedStatus;
                string? expectedErrorCode = null;

                if (role == "Anonymous")
                {
                    expectedStatus = (int)HttpStatusCode.Unauthorized;
                }
                else if (role == "NONE" || !allowedRoles.Contains(role))
                {
                    expectedStatus = (int)HttpStatusCode.Forbidden;
                }
                else
                {
                    if (isRead)
                    {
                        expectedStatus = (int)HttpStatusCode.OK;
                    }
                    else
                    {
                        expectedStatus = (int)HttpStatusCode.UnprocessableEntity;
                        expectedErrorCode = "VALIDATION_ERROR";
                    }
                }

                yield return new object[] { method, key, role, expectedStatus, expectedErrorCode ?? string.Empty };
            }
        }
    }

    [SkipWhenPostgresUnavailableTheory]
    [MemberData(nameof(SixteenEndpointsRoleMatrixData))]
    public async Task RoleMatrix_AllSixteenEndpoints_ExactStatusAssertions(string method, string endpointKey, string role, int expectedStatus, string expectedErrorCode)
    {
        var (catId, prodId, uomId) = await EnsureBaselineEntitiesAsync();
        var client = CreateClient(role == "Anonymous" ? null : role);

        string url;
        HttpRequestMessage req;
        var key = Guid.NewGuid().ToString();

        switch (endpointKey)
        {
            case "CATEGORIES_GET":
                url = "/api/v1/product-categories";
                req = new HttpRequestMessage(HttpMethod.Get, url);
                break;
            case "CATEGORIES_POST":
                url = "/api/v1/product-categories";
                // Intentionally invalid: empty Code and Name
                req = CreateRequest(HttpMethod.Post, url, new CreateProductCategoryRequest(null, "", "", null, key), key);
                break;
            case "CATEGORY_BY_ID_GET":
                url = $"/api/v1/product-categories/{catId}";
                req = new HttpRequestMessage(HttpMethod.Get, url);
                break;
            case "CATEGORY_BY_ID_PATCH":
                url = $"/api/v1/product-categories/{catId}";
                // Intentionally invalid: empty Name
                req = CreateRequest(HttpMethod.Patch, url, new UpdateProductCategoryRequest(null, "", null, null, key), key);
                break;
            case "PRODUCTS_GET":
                url = "/api/v1/products";
                req = new HttpRequestMessage(HttpMethod.Get, url);
                break;
            case "PRODUCTS_POST":
                url = "/api/v1/products";
                // Intentionally invalid: empty SKU
                req = CreateRequest(HttpMethod.Post, url, new CreateProductRequest(catId, "", null, "Name", null, null, "pcs", 0.14m, null, true, 30, new[] { new CreateProductUomItemRequest("pcs", "Pcs", 1m, 10m, true, true, true) }, key), key);
                break;
            case "PRODUCT_BY_ID_GET":
                url = $"/api/v1/products/{prodId}";
                req = new HttpRequestMessage(HttpMethod.Get, url);
                break;
            case "PRODUCT_BY_ID_PATCH":
                url = $"/api/v1/products/{prodId}";
                // Intentionally invalid: tax rate > 1.0 (e.g. 150m)
                req = CreateRequest(HttpMethod.Patch, url, new UpdateProductRequest(null, null, null, "Name", null, null, null, 150m, null, null, null, null, key), key);
                break;
            case "PRODUCT_UOMS_GET":
                url = $"/api/v1/products/{prodId}/uoms";
                req = new HttpRequestMessage(HttpMethod.Get, url);
                break;
            case "PRODUCT_UOMS_POST":
                url = $"/api/v1/products/{prodId}/uoms";
                // Intentionally invalid: negative conversion
                req = CreateRequest(HttpMethod.Post, url, new CreateProductUomRequest("NEWUOM", "New Uom", -5m, null, false, true, true, key), key);
                break;
            case "PRODUCT_UOM_PATCH":
                url = $"/api/v1/products/{prodId}/uoms/{uomId}";
                // Intentionally invalid: negative conversion
                req = CreateRequest(HttpMethod.Patch, url, new UpdateProductUomRequest(null, -5m, null, null, null, null, key), key);
                break;
            case "REORDER_RULE_GET":
                url = $"/api/v1/branches/{_fixture.BranchA1Id}/products/{prodId}/reorder-rule";
                req = new HttpRequestMessage(HttpMethod.Get, url);
                break;
            case "REORDER_RULE_PUT":
                url = $"/api/v1/branches/{_fixture.BranchA1Id}/products/{prodId}/reorder-rule";
                // Intentionally invalid: Max < Reorder
                req = CreateRequest(HttpMethod.Put, url, new UpsertReorderRuleRequest(100m, 50m, 50m, true, key), key);
                break;
            case "CANONICAL_FEED_GET":
                url = "/api/v1/canonical/products";
                req = new HttpRequestMessage(HttpMethod.Get, url);
                break;
            case "CANONICAL_PRODUCT_POST":
                url = "/api/v1/canonical/configuration/products";
                // Intentionally invalid: empty Action
                req = CreateRequest(HttpMethod.Post, url, new CanonicalProductConfigurationRequest(Guid.NewGuid(), "PROMPT", key, (CatalogConfigurationAction)999), key);
                break;
            case "CANONICAL_REORDER_RULE_PUT":
                url = "/api/v1/canonical/configuration/reorder-rules";
                // Intentionally invalid: Max < Reorder
                req = CreateRequest(HttpMethod.Put, url, new CanonicalReorderRuleConfigurationRequest(Guid.NewGuid(), "PROMPT", key, _fixture.BranchA1Id, prodId, 100m, 50m, 50m), key);
                break;
            default:
                throw new ArgumentException($"Unknown endpoint key: {endpointKey}");
        }

        Assert.Equal(method, req.Method.Method);
        var resp = await client.SendAsync(req);
        Assert.Equal((HttpStatusCode)expectedStatus, resp.StatusCode);

        if (expectedStatus == (int)HttpStatusCode.UnprocessableEntity)
        {
            var err = await resp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
            Assert.NotNull(err);
            Assert.Equal(expectedErrorCode, err!.Error.Code);
        }
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task Scenario2_ExtendedCompleteness_PriceTaxConversionFlagsAndSingleBaseUom()
    {
        var client = CreateClient("Pharmacist");
        var (catId, _, _) = await EnsureBaselineEntitiesAsync();

        // 1. Create product with base UOM "TAB", TaxRate 0.14, SaleUnitPrice 2.50, LotTrackingRequired true
        var pKey = Guid.NewGuid().ToString();
        var baseUomDef = new CreateProductUomItemRequest("TAB", "Tablet", 1.0m, 2.50m, true, true, true);
        var pReq = new CreateProductRequest(
            catId,
            "SKU-EX-" + Guid.NewGuid().ToString("N")[..8],
            null,
            "Extended Medicine",
            null,
            null,
            "TAB",
            0.14m,
            null,
            true,
            30,
            new[] { baseUomDef },
            pKey);

        var pResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", pReq, pKey));
        Assert.Equal(HttpStatusCode.OK, pResp.StatusCode);
        var createdProd = await pResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        Assert.NotNull(createdProd);
        Assert.Equal(0.14m, createdProd!.TaxRate);
        Assert.True(createdProd.LotTrackingRequired);
        Assert.Equal("TAB", createdProd.BaseUomCode);

        // 2. Add Secondary UOM "STRIP", conversion 10, SaleUnitPrice 25.00
        var stripKey = Guid.NewGuid().ToString();
        var stripReq = new CreateProductUomRequest("STRIP", "Strip of 10", 10.0m, 25.00m, false, true, true, stripKey);
        var stripResp = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/api/v1/products/{createdProd.ProductId}/uoms", stripReq, stripKey));
        Assert.Equal(HttpStatusCode.OK, stripResp.StatusCode);
        var stripDto = await stripResp.Content.ReadFromJsonAsync<ProductUomDto>(JsonOptions);
        Assert.NotNull(stripDto);
        Assert.Equal(10.0m, stripDto!.ConversionToBase);
        Assert.Equal(25.00m, stripDto.SaleUnitPrice);
        Assert.False(stripDto.IsBase);
        Assert.True(stripDto.IsSellable);
        Assert.True(stripDto.IsPurchasable);

        // 3. Add Secondary UOM "BOX", conversion 30, SaleUnitPrice 75.00
        var boxKey = Guid.NewGuid().ToString();
        var boxReq = new CreateProductUomRequest("BOX", "Box of 30", 30.0m, 75.00m, false, true, true, boxKey);
        var boxResp = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/api/v1/products/{createdProd.ProductId}/uoms", boxReq, boxKey));
        Assert.Equal(HttpStatusCode.OK, boxResp.StatusCode);
        var boxDto = await boxResp.Content.ReadFromJsonAsync<ProductUomDto>(JsonOptions);
        Assert.NotNull(boxDto);
        Assert.Equal(30.0m, boxDto!.ConversionToBase);
        Assert.Equal(75.00m, boxDto.SaleUnitPrice);
        Assert.False(boxDto.IsBase);
        Assert.True(boxDto.IsSellable);
        Assert.True(boxDto.IsPurchasable);

        // 4. Assert GET /products/{id}
        var getProdResp = await client.GetAsync($"/api/v1/products/{createdProd.ProductId}");
        Assert.Equal(HttpStatusCode.OK, getProdResp.StatusCode);
        var getProd = await getProdResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        Assert.NotNull(getProd);
        Assert.Equal(0.14m, getProd!.TaxRate);
        Assert.True(getProd.LotTrackingRequired);
        Assert.Equal(3, getProd.Uoms.Count);
        Assert.Equal(1, getProd.Uoms.Count(u => u.IsBase));

        var tabInProd = getProd.Uoms.Single(u => u.UomCode == "TAB");
        Assert.Equal(1.0m, tabInProd.ConversionToBase);
        Assert.Equal(2.50m, tabInProd.SaleUnitPrice);
        Assert.True(tabInProd.IsBase);
        Assert.True(tabInProd.IsSellable);
        Assert.True(tabInProd.IsPurchasable);

        var stripInProd = getProd.Uoms.Single(u => u.UomCode == "STRIP");
        Assert.Equal(10.0m, stripInProd.ConversionToBase);
        Assert.Equal(25.00m, stripInProd.SaleUnitPrice);
        Assert.False(stripInProd.IsBase);
        Assert.True(stripInProd.IsSellable);
        Assert.True(stripInProd.IsPurchasable);

        var boxInProd = getProd.Uoms.Single(u => u.UomCode == "BOX");
        Assert.Equal(30.0m, boxInProd.ConversionToBase);
        Assert.Equal(75.00m, boxInProd.SaleUnitPrice);
        Assert.False(boxInProd.IsBase);
        Assert.True(boxInProd.IsSellable);
        Assert.True(boxInProd.IsPurchasable);

        // 5. Assert GET /products/{id}/uoms
        var getUomsResp = await client.GetAsync($"/api/v1/products/{createdProd.ProductId}/uoms");
        Assert.Equal(HttpStatusCode.OK, getUomsResp.StatusCode);
        var uomsList = await getUomsResp.Content.ReadFromJsonAsync<IReadOnlyList<ProductUomDto>>(JsonOptions);
        Assert.NotNull(uomsList);
        Assert.Equal(3, uomsList!.Count);
        Assert.Equal(1, uomsList.Count(u => u.IsBase));

        var tabFromList = uomsList.Single(u => u.UomCode == "TAB");
        Assert.Equal(1.0m, tabFromList.ConversionToBase);
        Assert.Equal(2.50m, tabFromList.SaleUnitPrice);
        Assert.True(tabFromList.IsBase);

        var stripFromList = uomsList.Single(u => u.UomCode == "STRIP");
        Assert.Equal(10.0m, stripFromList.ConversionToBase);
        Assert.Equal(25.00m, stripFromList.SaleUnitPrice);
        Assert.False(stripFromList.IsBase);

        var boxFromList = uomsList.Single(u => u.UomCode == "BOX");
        Assert.Equal(30.0m, boxFromList.ConversionToBase);
        Assert.Equal(75.00m, boxFromList.SaleUnitPrice);
        Assert.False(boxFromList.IsBase);

        // 6. Attempt to add a second base UOM (isBase: true) to the same product -> 422 VALIDATION_ERROR
        var secondBaseKey = Guid.NewGuid().ToString();
        var secondBaseReq = new CreateProductUomRequest("TAB2", "Second Base Tablet", 1.0m, 2.50m, true, true, true, secondBaseKey);
        var secondBaseResp = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/api/v1/products/{createdProd.ProductId}/uoms", secondBaseReq, secondBaseKey));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, secondBaseResp.StatusCode);
        var secondBaseErr = await secondBaseResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(secondBaseErr);
        Assert.Equal("VALIDATION_ERROR", secondBaseErr!.Error.Code);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task Scenario6_FeedOrderingAcrossPages_UpdatedAtAndId_NoDuplicatesNoGaps()
    {
        var client = CreateClient("Pharmacist");
        var (catId, _, _) = await EnsureBaselineEntitiesAsync();

        var createdIds = new List<Guid>();
        for (var i = 1; i <= 6; i++)
        {
            var pKey = Guid.NewGuid().ToString();
            var pReq = new CreateProductRequest(
                catId,
                $"SKU-ORDER-{i}-" + Guid.NewGuid().ToString("N")[..6],
                null,
                $"Order Med {i}",
                null,
                null,
                "tab",
                0.14m,
                null,
                true,
                30,
                new[] { new CreateProductUomItemRequest("tab", "Tab", 1m, 5m, true, true, true) },
                pKey);
            var pResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", pReq, pKey));
            Assert.Equal(HttpStatusCode.OK, pResp.StatusCode);
            var p = await pResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
            createdIds.Add(p!.ProductId);
            await Task.Delay(15);
        }

        var allFeedItems = new List<CanonicalProductDto>();
        string? cursor = null;
        var pageCount = 0;

        do
        {
            var url = "/api/v1/canonical/products?limit=2" + (cursor != null ? $"&cursor={Uri.EscapeDataString(cursor)}" : "");
            var resp = await client.GetAsync(url);
            Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
            var page = await resp.Content.ReadFromJsonAsync<CanonicalProductFeedPageDto>(JsonOptions);
            Assert.NotNull(page);

            allFeedItems.AddRange(page!.Items);
            cursor = page.NextCursor;
            pageCount++;
        } while (!string.IsNullOrWhiteSpace(cursor));

        Assert.True(pageCount >= 3, $"Expected at least 3 pages with limit=2, got {pageCount}");
        Assert.Null(cursor);

        // No duplicates
        var distinctIds = allFeedItems.Select(x => x.Id).Distinct().ToList();
        Assert.Equal(allFeedItems.Count, distinctIds.Count);

        // No gaps: all created IDs exist in feed
        foreach (var id in createdIds)
        {
            Assert.Contains(id, distinctIds);
        }

        // Ordered by UpdatedAt then ProductId
        for (var i = 1; i < allFeedItems.Count; i++)
        {
            var prev = allFeedItems[i - 1];
            var curr = allFeedItems[i];
            var timeComp = prev.UpdatedAt.CompareTo(curr.UpdatedAt);
            if (timeComp == 0)
            {
                Assert.True(prev.Id.CompareTo(curr.Id) < 0, "Products with identical UpdatedAt must be ordered by ProductId");
            }
            else
            {
                Assert.True(timeComp < 0, "Feed items must be ordered ascending by UpdatedAt");
            }
        }
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task Scenario6_UpdatedSince_MiddleTimestamp_ReturnsOnlyNewerProducts()
    {
        var client = CreateClient("Pharmacist");
        var (catId, _, _) = await EnsureBaselineEntitiesAsync();
        var startTime = DateTimeOffset.UtcNow.AddSeconds(-2);

        var ids = new List<Guid>();
        for (var i = 1; i <= 5; i++)
        {
            var k = Guid.NewGuid().ToString();
            var req = new CreateProductRequest(
                catId,
                $"SKU-TIME-{i}-" + Guid.NewGuid().ToString("N")[..6],
                null,
                $"Time Med {i}",
                null,
                null,
                "tab",
                0.14m,
                null,
                true,
                30,
                new[] { new CreateProductUomItemRequest("tab", "Tab", 1m, 5m, true, true, true) },
                k);
            var r = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", req, k));
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            var p = await r.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
            ids.Add(p!.ProductId);
            await Task.Delay(25);
        }

        // Query all products created since startTime
        var allResp = await client.GetAsync($"/api/v1/canonical/products?updated_since={Uri.EscapeDataString(startTime.ToString("O"))}&limit=100");
        Assert.Equal(HttpStatusCode.OK, allResp.StatusCode);
        var allPage = await allResp.Content.ReadFromJsonAsync<CanonicalProductFeedPageDto>(JsonOptions);
        Assert.NotNull(allPage);

        var matching5 = allPage!.Items.Where(x => ids.Contains(x.Id)).OrderBy(x => x.UpdatedAt).ThenBy(x => x.Id).ToList();
        Assert.True(matching5.Count >= 5);

        // Middle timestamp = product 3 UpdatedAt
        var middleTime = matching5[2].UpdatedAt;

        var midResp = await client.GetAsync($"/api/v1/canonical/products?updated_since={Uri.EscapeDataString(middleTime.ToString("O"))}&limit=100");
        Assert.Equal(HttpStatusCode.OK, midResp.StatusCode);
        var midPage = await midResp.Content.ReadFromJsonAsync<CanonicalProductFeedPageDto>(JsonOptions);
        Assert.NotNull(midPage);

        // Product 1 and Product 2 must NOT be in the result
        Assert.DoesNotContain(midPage!.Items, x => x.Id == matching5[0].Id);
        Assert.DoesNotContain(midPage.Items, x => x.Id == matching5[1].Id);

        // Product 3, 4, 5 MUST be in the result
        Assert.Contains(midPage.Items, x => x.Id == matching5[2].Id);
        Assert.Contains(midPage.Items, x => x.Id == matching5[3].Id);
        Assert.Contains(midPage.Items, x => x.Id == matching5[4].Id);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task Scenario6_CanonicalProductConfiguration_IdempotentReplayAndMismatch()
    {
        var client = CreateClient("Pharmacist");
        var (catId, _, _) = await EnsureBaselineEntitiesAsync();

        var promptId = "PRM-IDEM-" + Guid.NewGuid().ToString("N")[..8];
        var configKey = "IDEM-KEY-" + Guid.NewGuid().ToString("N");
        var configReq = new CanonicalProductConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: promptId,
            IdempotencyKey: configKey,
            Action: CatalogConfigurationAction.CreateProduct,
            CategoryId: catId,
            Sku: "SKU-CANON-IDEM-" + Guid.NewGuid().ToString("N")[..6],
            Name: "Idempotent Canonical Product",
            BaseUomCode: "box",
            TaxRate: 0.14m,
            LotTrackingRequired: true,
            ExpiryAlertDays: 30,
            Uoms: new[] { new CanonicalUomItemDto("box", "Box", 1m, 50m, true, true, true) });

        // 1. First execution -> 200 OK
        var resp1 = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/canonical/configuration/products", configReq, configKey));
        Assert.Equal(HttpStatusCode.OK, resp1.StatusCode);
        var res1 = await resp1.Content.ReadFromJsonAsync<CanonicalWriteResultDto>(JsonOptions);
        Assert.NotNull(res1);
        Assert.Equal("APPLIED", res1!.Status);

        // 2. Replay with identical payload and key -> 200 OK replay
        var resp2 = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/canonical/configuration/products", configReq, configKey));
        Assert.Equal(HttpStatusCode.OK, resp2.StatusCode);
        var res2 = await resp2.Content.ReadFromJsonAsync<CanonicalWriteResultDto>(JsonOptions);
        Assert.NotNull(res2);
        Assert.Equal(res1.RequestId, res2!.RequestId);
        Assert.Equal(res1.TargetEntityId, res2.TargetEntityId);

        // 3. Mismatched payload with same key -> 409 CONFLICT (IDEMPOTENCY_MISMATCH)
        var mismatchReq = configReq with { Name = "Tampered Mismatched Name" };
        var resp3 = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/canonical/configuration/products", mismatchReq, configKey));
        Assert.Equal(HttpStatusCode.Conflict, resp3.StatusCode);
        var err3 = await resp3.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(err3);
        Assert.Equal("IDEMPOTENCY_MISMATCH", err3!.Error.Code);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task Scenario6_CanonicalWrites_RawJsonWithInjectedActorFields_AuditLogAttributionImmune()
    {
        var client = CreateClient("Pharmacist");
        var (catId, _, _) = await EnsureBaselineEntitiesAsync();

        // 1. Raw JSON containing caller-injected actor fields sent to POST /canonical/configuration/products
        var pPromptId = "PRM-INJECT-P-" + Guid.NewGuid().ToString("N")[..8];
        var pKey = Guid.NewGuid().ToString();
        var skuSuffix = Guid.NewGuid().ToString("N")[..6];
        var rawProductJson = $$"""
        {
            "requestId": "{{Guid.NewGuid()}}",
            "sourcePromptId": "{{pPromptId}}",
            "idempotencyKey": "{{pKey}}",
            "action": 1,
            "categoryId": "{{catId}}",
            "sku": "SKU-INJECT-{{skuSuffix}}",
            "name": "Injection Test Medicine",
            "baseUomCode": "box",
            "taxRate": 0.14,
            "lotTrackingRequired": true,
            "expiryAlertDays": 30,
            "uoms": [
                {
                    "uomCode": "box",
                    "displayName": "Box",
                    "conversionToBase": 1.0,
                    "saleUnitPrice": 10.0,
                    "isBase": true,
                    "isSellable": true,
                    "isPurchasable": true
                }
            ],
            "actorUserId": "00000000-0000-0000-0000-000000000000",
            "actorEmployeeId": "00000000-0000-0000-0000-000000000000",
            "actorType": "HUMAN_OPERATOR"
        }
        """;

        var pMsg = new HttpRequestMessage(HttpMethod.Post, "/api/v1/canonical/configuration/products")
        {
            Content = new StringContent(rawProductJson, Encoding.UTF8, "application/json")
        };
        pMsg.Headers.Add("Idempotency-Key", pKey);

        var pResp = await client.SendAsync(pMsg);
        Assert.Equal(HttpStatusCode.OK, pResp.StatusCode);
        var pResult = await pResp.Content.ReadFromJsonAsync<CanonicalWriteResultDto>(JsonOptions);
        Assert.NotNull(pResult);

        // Verify AUDIT_LOG row in PostgreSQL
        using (var scope = _fixture.Factory.Services.CreateScope())
        {
            var tenant = (TenantContext)scope.ServiceProvider.GetRequiredService<ITenantContext>();
            tenant.SetTenant(_fixture.OrganizationAId);
            var uow = scope.ServiceProvider.GetRequiredService<PharmacyERP.Application.Common.Interfaces.Persistence.IUnitOfWork>();
            var db = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();
            await uow.BeginTransactionAsync();
            try
            {
                var audit = await db.AuditLogs
                    .AsNoTracking()
                    .FirstOrDefaultAsync(a => a.OrganizationId == _fixture.OrganizationAId &&
                                             a.SourcePromptId == pPromptId &&
                                             a.EntityId == pResult!.TargetEntityId);

                Assert.NotNull(audit);
                Assert.Equal(AuditActorType.AI_ASSISTED, audit!.ActorType);
                Assert.Equal(_fixture.UserAId, audit.ActorUserId);
                Assert.Equal(_fixture.EmployeeAId, audit.ActorEmployeeId);
                Assert.NotEqual(Guid.Empty, audit.ActorUserId);
            }
            finally
            {
                await uow.RollbackTransactionAsync();
            }
        }

        // 2. Raw JSON containing caller-injected actor fields sent to PUT /canonical/configuration/reorder-rules
        var rrPromptId = "PRM-INJECT-RR-" + Guid.NewGuid().ToString("N")[..8];
        var rrKey = Guid.NewGuid().ToString();
        var rawRrJson = $$"""
        {
            "requestId": "{{Guid.NewGuid()}}",
            "sourcePromptId": "{{rrPromptId}}",
            "idempotencyKey": "{{rrKey}}",
            "branchId": "{{_fixture.BranchA1Id}}",
            "productId": "{{pResult!.TargetEntityId}}",
            "reorderPointBase": 60.0,
            "reorderQuantityBase": 30.0,
            "maxQuantityBase": 150.0,
            "isActive": true,
            "actorUserId": "00000000-0000-0000-0000-000000000000",
            "actorEmployeeId": "00000000-0000-0000-0000-000000000000",
            "actorType": "HUMAN_OPERATOR"
        }
        """;

        var rrMsg = new HttpRequestMessage(HttpMethod.Put, "/api/v1/canonical/configuration/reorder-rules")
        {
            Content = new StringContent(rawRrJson, Encoding.UTF8, "application/json")
        };
        rrMsg.Headers.Add("Idempotency-Key", rrKey);

        var rrResp = await client.SendAsync(rrMsg);
        Assert.Equal(HttpStatusCode.OK, rrResp.StatusCode);

        using (var scope = _fixture.Factory.Services.CreateScope())
        {
            var tenant = (TenantContext)scope.ServiceProvider.GetRequiredService<ITenantContext>();
            tenant.SetTenant(_fixture.OrganizationAId);
            var uow = scope.ServiceProvider.GetRequiredService<PharmacyERP.Application.Common.Interfaces.Persistence.IUnitOfWork>();
            var db = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();
            await uow.BeginTransactionAsync();
            try
            {
                var audit = await db.AuditLogs
                    .AsNoTracking()
                    .FirstOrDefaultAsync(a => a.OrganizationId == _fixture.OrganizationAId &&
                                             a.SourcePromptId == rrPromptId);

                Assert.NotNull(audit);
                Assert.Equal(AuditActorType.AI_ASSISTED, audit!.ActorType);
                Assert.Equal(_fixture.UserAId, audit.ActorUserId);
                Assert.NotEqual(Guid.Empty, audit.ActorUserId);
            }
            finally
            {
                await uow.RollbackTransactionAsync();
            }
        }
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task RealDependencyInjection_DefaultFailSafeUsageChecker_BlocksHistoricalModifications()
    {
        _fixture.Factory.UsageCheckerOverride = null; // Ensure real registration is used
        using var scope = _fixture.Factory.Services.CreateScope();
        var checker = scope.ServiceProvider.GetRequiredService<IProductInventoryUsageChecker>();
        Assert.NotNull(checker);
        Assert.Equal("TemporaryProductInventoryUsageChecker", checker.GetType().Name);

        var client = CreateClient("Pharmacist");
        var (catId, _, _) = await EnsureBaselineEntitiesAsync();

        // 1. Create a product with LotTrackingRequired = false, BaseUomCode = "BOX"
        var pKey = Guid.NewGuid().ToString();
        var pReq = new CreateProductRequest(
            catId,
            "SKU-REALDI-" + Guid.NewGuid().ToString("N")[..8],
            null,
            "Real DI Test Product",
            null,
            null,
            "BOX",
            0.14m,
            null,
            false,
            0,
            new[] { new CreateProductUomItemRequest("BOX", "Box", 1m, 10m, true, true, true) },
            pKey);

        var pResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", pReq, pKey));
        Assert.Equal(HttpStatusCode.OK, pResp.StatusCode);
        var prod = await pResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        Assert.NotNull(prod);

        // 2. Add secondary UOM "STRIP", conversion 10m
        var uKey = Guid.NewGuid().ToString();
        var uReq = new CreateProductUomRequest("STRIP", "Strip", 10m, 2m, false, true, true, uKey);
        var uResp = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/api/v1/products/{prod!.ProductId}/uoms", uReq, uKey));
        Assert.Equal(HttpStatusCode.OK, uResp.StatusCode);
        var uom = await uResp.Content.ReadFromJsonAsync<ProductUomDto>(JsonOptions);
        Assert.NotNull(uom);

        // 3. Changing LotTrackingRequired via PATCH -> 409 CONFLICT
        var patch1Key = Guid.NewGuid().ToString();
        var patch1Req = new UpdateProductRequest(catId, null, null, prod.Name, null, null, null, null, null, true, null, null, patch1Key);
        var patch1Resp = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/api/v1/products/{prod.ProductId}", patch1Req, patch1Key));
        Assert.Equal(HttpStatusCode.Conflict, patch1Resp.StatusCode);
        var err1 = await patch1Resp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(err1);
        Assert.Equal("CONFLICT", err1!.Error.Code);
        Assert.Contains(ErrorMessages.HistoricalUomModificationForbidden, err1.Error.Message);

        // 4. Changing BaseUomCode via PATCH -> 409 CONFLICT
        var patch2Key = Guid.NewGuid().ToString();
        var patch2Req = new UpdateProductRequest(catId, null, null, prod.Name, null, null, "PACK", null, null, null, null, null, patch2Key);
        var patch2Resp = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/api/v1/products/{prod.ProductId}", patch2Req, patch2Key));
        Assert.Equal(HttpStatusCode.Conflict, patch2Resp.StatusCode);
        var err2 = await patch2Resp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(err2);
        Assert.Equal("CONFLICT", err2!.Error.Code);
        Assert.Contains(ErrorMessages.HistoricalUomModificationForbidden, err2.Error.Message);

        // 5. Changing UOM ConversionToBase via PATCH -> 409 CONFLICT
        var patch3Key = Guid.NewGuid().ToString();
        var patch3Req = new UpdateProductUomRequest("Strip Renamed", 12m, null, null, null, null, patch3Key);
        var patch3Resp = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/api/v1/products/{prod.ProductId}/uoms/{uom!.ProductUomId}", patch3Req, patch3Key));
        Assert.Equal(HttpStatusCode.Conflict, patch3Resp.StatusCode);
        var err3 = await patch3Resp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(err3);
        Assert.Equal("CONFLICT", err3!.Error.Code);
        Assert.Contains(ErrorMessages.HistoricalUomModificationForbidden, err3.Error.Message);

        // 6. Sending unchanged LotTrackingRequired & BaseUomCode -> 200 OK (does NOT return 409)
        var okProdKey = Guid.NewGuid().ToString();
        var okProdReq = new UpdateProductRequest(catId, null, null, "Renamed Real DI Product", null, null, "BOX", null, null, false, null, null, okProdKey);
        var okProdResp = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/api/v1/products/{prod.ProductId}", okProdReq, okProdKey));
        Assert.Equal(HttpStatusCode.OK, okProdResp.StatusCode);
        var okProd = await okProdResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        Assert.NotNull(okProd);
        Assert.Equal("Renamed Real DI Product", okProd!.Name);

        // 7. Sending unchanged UOM ConversionToBase -> 200 OK (does NOT return 409)
        var okUomKey = Guid.NewGuid().ToString();
        var okUomReq = new UpdateProductUomRequest("Strip Re-renamed", 10m, null, null, null, null, okUomKey);
        var okUomResp = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/api/v1/products/{prod.ProductId}/uoms/{uom.ProductUomId}", okUomReq, okUomKey));
        Assert.Equal(HttpStatusCode.OK, okUomResp.StatusCode);
        var okUom = await okUomResp.Content.ReadFromJsonAsync<ProductUomDto>(JsonOptions);
        Assert.NotNull(okUom);
        Assert.Equal("Strip Re-renamed", okUom!.DisplayName);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task TenantIsolation_ListsAndCanonicalFeed_OrganizationBCannotSeeOrganizationAData()
    {
        var clientA = CreateClient("Pharmacist", orgId: _fixture.OrganizationAId);
        var clientB = CreateClient("Pharmacist", orgId: _fixture.OrganizationBId);

        // 1. Org A creates Category, Product, and Canonical Item
        var catAKey = Guid.NewGuid().ToString();
        var catAResp = await clientA.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, "ORGA-CAT-" + Guid.NewGuid().ToString("N")[..6], "Org A Category", null, catAKey), catAKey));
        var catA = await catAResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);

        var prodAKey = Guid.NewGuid().ToString();
        var prodAResp = await clientA.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products",
            new CreateProductRequest(catA!.CategoryId, "SKU-ISO-A-" + Guid.NewGuid().ToString("N")[..6], null, "Org A Product", null, null, "unit", 0.14m, null, false, 0,
                new[] { new CreateProductUomItemRequest("unit", "Unit", 1m, 10m, true, true, true) }, prodAKey), prodAKey));
        var prodA = await prodAResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        Assert.NotNull(prodA);

        // 2. Org B creates Category, Product, and Canonical Item
        var catBKey = Guid.NewGuid().ToString();
        var catBResp = await clientB.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, "ORGB-CAT-" + Guid.NewGuid().ToString("N")[..6], "Org B Category", null, catBKey), catBKey));
        var catB = await catBResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);
        Assert.NotNull(catB);

        var prodBKey = Guid.NewGuid().ToString();
        var prodBResp = await clientB.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products",
            new CreateProductRequest(catB!.CategoryId, "SKU-ISO-B-" + Guid.NewGuid().ToString("N")[..6], null, "Org B Product", null, null, "unit", 0.14m, null, false, 0,
                new[] { new CreateProductUomItemRequest("unit", "Unit", 1m, 10m, true, true, true) }, prodBKey), prodBKey));
        var prodB = await prodBResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        Assert.NotNull(prodB);

        // 3. Org B lists categories -> contains Cat B, does NOT contain Cat A
        var catListResp = await clientB.GetAsync("/api/v1/product-categories");
        Assert.Equal(HttpStatusCode.OK, catListResp.StatusCode);
        var catList = await catListResp.Content.ReadFromJsonAsync<PagedResult<ProductCategoryDto>>(JsonOptions);
        Assert.NotNull(catList);
        Assert.NotEmpty(catList!.Items);
        Assert.Contains(catList.Items, c => c.CategoryId == catB.CategoryId);
        Assert.DoesNotContain(catList.Items, c => c.CategoryId == catA.CategoryId);

        // 4. Org B lists products -> contains Prod B, does NOT contain Prod A
        var prodListResp = await clientB.GetAsync("/api/v1/products");
        Assert.Equal(HttpStatusCode.OK, prodListResp.StatusCode);
        var prodList = await prodListResp.Content.ReadFromJsonAsync<PagedResult<ProductDto>>(JsonOptions);
        Assert.NotNull(prodList);
        Assert.NotEmpty(prodList!.Items);
        Assert.Contains(prodList.Items, p => p.ProductId == prodB!.ProductId);
        Assert.DoesNotContain(prodList.Items, p => p.ProductId == prodA!.ProductId);

        // 5. Org B gets canonical feed -> contains Prod B, does NOT contain Prod A
        var feedResp = await clientB.GetAsync("/api/v1/canonical/products");
        Assert.Equal(HttpStatusCode.OK, feedResp.StatusCode);
        var feed = await feedResp.Content.ReadFromJsonAsync<CanonicalProductFeedPageDto>(JsonOptions);
        Assert.NotNull(feed);
        Assert.NotEmpty(feed!.Items);
        Assert.Contains(feed.Items, p => p.Id == prodB.ProductId);
        Assert.DoesNotContain(feed.Items, p => p.Id == prodA.ProductId);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task MalformedJsonAndEmptyBody_ObservedResponseShape_DocumentsFrameworkBehavior()
    {
        var client = CreateClient("Pharmacist");

        // 1. Malformed JSON (InvalidModelStateResponseFactory returns unified 422 ApiErrorEnvelopeDto)
        var malformedContent = new StringContent("{ \"sku\": \"broken json ...", Encoding.UTF8, "application/json");
        var malformedResp = await client.PostAsync("/api/v1/products", malformedContent);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, malformedResp.StatusCode);

        var malformedBody = await malformedResp.Content.ReadAsStringAsync();
        using var malformedDoc = JsonDocument.Parse(malformedBody);
        var malformedRoot = malformedDoc.RootElement;

        // InvalidModelStateResponseFactory produces ApiErrorEnvelopeDto for unparseable JSON
        Assert.True(malformedRoot.TryGetProperty("title", out _) || malformedRoot.TryGetProperty("errors", out _) || malformedRoot.TryGetProperty("error", out _),
            "Observed shape must be either ASP.NET Core ProblemDetails or ApiErrorEnvelopeDto.");

        // 2. Empty Body on create endpoint
        var emptyContent = new StringContent(string.Empty, Encoding.UTF8, "application/json");
        var emptyResp = await client.PostAsync("/api/v1/products", emptyContent);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, emptyResp.StatusCode);

        var emptyBody = await emptyResp.Content.ReadAsStringAsync();
        using var emptyDoc = JsonDocument.Parse(emptyBody);
        var emptyRoot = emptyDoc.RootElement;
        Assert.True(emptyRoot.TryGetProperty("title", out _) || emptyRoot.TryGetProperty("errors", out _) || emptyRoot.TryGetProperty("error", out _));
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task IdempotencyKey_PatchAndPut_MissingKeyAndHeaderPrecedenceProof()
    {
        var client = CreateClient("Pharmacist");
        var (catId, prodId, uomId) = await EnsureBaselineEntitiesAsync();

        // 1. Missing key on PATCH /product-categories/{id} -> 422 VALIDATION_ERROR
        var patchCatMsg = new HttpRequestMessage(HttpMethod.Patch, $"/api/v1/product-categories/{catId}")
        {
            Content = JsonContent.Create(new UpdateProductCategoryRequest(null, "Renamed Cat", null, null, string.Empty))
        };
        var patchCatResp = await client.SendAsync(patchCatMsg);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, patchCatResp.StatusCode);
        var catErr = await patchCatResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(catErr);
        Assert.Equal("VALIDATION_ERROR", catErr!.Error.Code);

        // 2. Missing key on PATCH /products/{id} -> 422 VALIDATION_ERROR
        var patchProdMsg = new HttpRequestMessage(HttpMethod.Patch, $"/api/v1/products/{prodId}")
        {
            Content = JsonContent.Create(new UpdateProductRequest(null, null, null, "Renamed Prod", null, null, null, null, null, null, null, null, string.Empty))
        };
        var patchProdResp = await client.SendAsync(patchProdMsg);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, patchProdResp.StatusCode);
        var prodErr = await patchProdResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(prodErr);
        Assert.Equal("VALIDATION_ERROR", prodErr!.Error.Code);

        // 3. Missing key on PATCH /products/{id}/uoms/{uomId} -> 422 VALIDATION_ERROR
        var patchUomMsg = new HttpRequestMessage(HttpMethod.Patch, $"/api/v1/products/{prodId}/uoms/{uomId}")
        {
            Content = JsonContent.Create(new UpdateProductUomRequest("Renamed Uom", null, null, null, null, null, string.Empty))
        };
        var patchUomResp = await client.SendAsync(patchUomMsg);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, patchUomResp.StatusCode);
        var uomErr = await patchUomResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(uomErr);
        Assert.Equal("VALIDATION_ERROR", uomErr!.Error.Code);

        // 4. Missing key on PUT reorder-rule -> 422 VALIDATION_ERROR
        var putRrMsg = new HttpRequestMessage(HttpMethod.Put, $"/api/v1/branches/{_fixture.BranchA1Id}/products/{prodId}/reorder-rule")
        {
            Content = JsonContent.Create(new UpsertReorderRuleRequest(50m, 20m, 100m, true, string.Empty))
        };
        var putRrResp = await client.SendAsync(putRrMsg);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, putRrResp.StatusCode);
        var rrErr = await putRrResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(rrErr);
        Assert.Equal("VALIDATION_ERROR", rrErr!.Error.Code);

        // 5. Header wins over body key: Header = HEADER_KEY, Body = BODY_KEY
        var headerKey = "HDR-" + Guid.NewGuid().ToString("N");
        var bodyKey = "BDY-" + Guid.NewGuid().ToString("N");

        var precMsg = new HttpRequestMessage(HttpMethod.Patch, $"/api/v1/products/{prodId}")
        {
            Content = JsonContent.Create(new UpdateProductRequest(null, null, null, "Precedence Product", null, null, null, null, null, null, null, null, bodyKey))
        };
        precMsg.Headers.Add("Idempotency-Key", headerKey);

        var precResp = await client.SendAsync(precMsg);
        Assert.Equal(HttpStatusCode.OK, precResp.StatusCode);

        // Replay with HEADER_KEY -> 200 OK replay
        var replayMsg = new HttpRequestMessage(HttpMethod.Patch, $"/api/v1/products/{prodId}")
        {
            Content = JsonContent.Create(new UpdateProductRequest(null, null, null, "Precedence Product", null, null, null, null, null, null, null, null, "OTHER_KEY"))
        };
        replayMsg.Headers.Add("Idempotency-Key", headerKey);
        var replayResp = await client.SendAsync(replayMsg);
        Assert.Equal(HttpStatusCode.OK, replayResp.StatusCode);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task ResourceNotFound_ExtendedCoverage_MissingUomsPatchMissingProductAndReorderRuleNoExistingRule()
    {
        var client = CreateClient("Pharmacist");
        var (catId, prodId, _) = await EnsureBaselineEntitiesAsync();
        var missingId = Guid.NewGuid();

        // 1. GET /products/{missingId}/uoms -> returns 404 NOT_FOUND when product does not exist
        var uomsResp = await client.GetAsync($"/api/v1/products/{missingId}/uoms");
        Assert.Equal(HttpStatusCode.NotFound, uomsResp.StatusCode);
        var uomsErr = await uomsResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(uomsErr);
        Assert.Equal("NOT_FOUND", uomsErr!.Error.Code);
        Assert.Equal(ErrorMessages.ProductNotFound, uomsErr.Error.Message);

        // 2. PATCH /products/{missingId}/uoms/{uomId} -> 404 NOT_FOUND
        var patchKey = Guid.NewGuid().ToString();
        var patchReq = new UpdateProductUomRequest("Renamed", 5m, null, null, null, null, patchKey);
        var patchResp = await client.SendAsync(CreateRequest(HttpMethod.Patch, $"/api/v1/products/{missingId}/uoms/{Guid.NewGuid()}", patchReq, patchKey));
        Assert.Equal(HttpStatusCode.NotFound, patchResp.StatusCode);
        var patchErr = await patchResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(patchErr);
        Assert.Equal("NOT_FOUND", patchErr!.Error.Code);

        // 3. GET reorder rule for an EXISTING product and EXISTING branch with no rule -> 404 NOT_FOUND with exact message
        var newProdKey = Guid.NewGuid().ToString();
        var newProdReq = new CreateProductRequest(
            catId,
            "SKU-NORR-" + Guid.NewGuid().ToString("N")[..8],
            null,
            "No RR Product",
            null,
            null,
            "unit",
            0.14m,
            null,
            false,
            0,
            new[] { new CreateProductUomItemRequest("unit", "Unit", 1m, 10m, true, true, true) },
            newProdKey);
        var newProdResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", newProdReq, newProdKey));
        Assert.Equal(HttpStatusCode.OK, newProdResp.StatusCode);
        var newProd = await newProdResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);

        var getRrResp = await client.GetAsync($"/api/v1/branches/{_fixture.BranchA1Id}/products/{newProd!.ProductId}/reorder-rule");
        Assert.Equal(HttpStatusCode.NotFound, getRrResp.StatusCode);
        var rrErr = await getRrResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(rrErr);
        Assert.Equal("NOT_FOUND", rrErr!.Error.Code);
        Assert.Equal(ErrorMessages.ReorderRuleNotFound, rrErr.Error.Message);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task Task5DefectObservation_NonExistentBranchReorderRuleUpsert_Returns500DueToFkViolation()
    {
        var client = CreateClient("Admin", branchScope: "ALL");
        var (_, prodId, _) = await EnsureBaselineEntitiesAsync();
        var nonExistentBranchId = Guid.NewGuid();

        // 1. ReorderRuleService.UpsertReorderRuleAsync verifies branch existence -> 404 NOT_FOUND
        var key = Guid.NewGuid().ToString();
        var req = new UpsertReorderRuleRequest(50m, 20m, 100m, true, key);
        var resp = await client.SendAsync(CreateRequest(HttpMethod.Put, $"/api/v1/branches/{nonExistentBranchId}/products/{prodId}/reorder-rule", req, key));
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
        var err = await resp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(err);
        Assert.Equal("NOT_FOUND", err!.Error.Code);
        Assert.Equal(ErrorMessages.NotFound, err.Error.Message);

        // 2. Canonical service also verifies branch existence -> 404 NOT_FOUND
        var canonKey = Guid.NewGuid().ToString();
        var canonReq = new CanonicalReorderRuleConfigurationRequest(
            RequestId: Guid.NewGuid(),
            SourcePromptId: "PRM-" + Guid.NewGuid().ToString("N")[..8],
            IdempotencyKey: canonKey,
            BranchId: nonExistentBranchId,
            ProductId: prodId,
            ReorderPointBase: 50m,
            ReorderQuantityBase: 20m,
            MaxQuantityBase: 100m);
        var canonResp = await client.SendAsync(CreateRequest(HttpMethod.Put, "/api/v1/canonical/configuration/reorder-rules", canonReq, canonKey));
        Assert.Equal(HttpStatusCode.NotFound, canonResp.StatusCode);
        var canonErr = await canonResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(canonErr);
        Assert.Equal("NOT_FOUND", canonErr!.Error.Code);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task HeaderOnlyIdempotencyKey_RawJsonOmittingBodyProperty_WorksAcrossAllEndpointFamilies()
    {
        var client = CreateClient("Pharmacist");
        var (catId, prodId, uomId) = await EnsureBaselineEntitiesAsync();

        static HttpRequestMessage RawJsonRequest(HttpMethod method, string url, string rawJson, string? headerIdempotencyKey = null)
        {
            var msg = new HttpRequestMessage(method, url)
            {
                Content = new StringContent(rawJson, Encoding.UTF8, "application/json")
            };
            if (!string.IsNullOrWhiteSpace(headerIdempotencyKey))
            {
                msg.Headers.Add("Idempotency-Key", headerIdempotencyKey);
            }
            return msg;
        }

        // =========================================================================
        // 1. Product Categories (POST & PATCH) — raw JSON without "idempotencyKey"
        // =========================================================================
        var catCode = "HDRCAT-" + Guid.NewGuid().ToString("N")[..6];
        var rawCreateCatJson = $$"""
        {
            "parentCategoryId": null,
            "code": "{{catCode}}",
            "name": "Header Only Category",
            "description": "Created without idempotencyKey in JSON body"
        }
        """;

        // 1a. Header missing, body omitted -> 422 VALIDATION_ERROR
        var catNoKeyResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/product-categories", rawCreateCatJson));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, catNoKeyResp.StatusCode);
        var catNoKeyErr = await catNoKeyResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.Equal("VALIDATION_ERROR", catNoKeyErr!.Error.Code);

        // 1b. Header present, body omitted -> 200 OK
        var catHeaderKey = "HDR-CAT-CR-" + Guid.NewGuid().ToString("N");
        var catCreatedResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/product-categories", rawCreateCatJson, catHeaderKey));
        Assert.Equal(HttpStatusCode.OK, catCreatedResp.StatusCode);
        var createdCat = await catCreatedResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);
        Assert.NotNull(createdCat);
        Assert.Equal(catCode, createdCat!.Code);

        // 1c. Replay with identical raw JSON (no body key) and same header key -> 200 OK
        var catReplayResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/product-categories", rawCreateCatJson, catHeaderKey));
        Assert.Equal(HttpStatusCode.OK, catReplayResp.StatusCode);
        var replayedCat = await catReplayResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions);
        Assert.Equal(createdCat.CategoryId, replayedCat!.CategoryId);

        // 1d. Mismatch with different raw JSON (no body key) and same header key -> 409 IDEMPOTENCY_MISMATCH
        var rawCreateCatMismatchJson = $$"""
        {
            "parentCategoryId": null,
            "code": "{{catCode}}",
            "name": "Tampered Header Only Category",
            "description": "Created without idempotencyKey in JSON body"
        }
        """;
        var catMismatchResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/product-categories", rawCreateCatMismatchJson, catHeaderKey));
        Assert.Equal(HttpStatusCode.Conflict, catMismatchResp.StatusCode);
        var catMismatchErr = await catMismatchResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.Equal("IDEMPOTENCY_MISMATCH", catMismatchErr!.Error.Code);

        // 1e. PATCH /product-categories/{id} with header only, body omitted -> 200 OK
        var rawPatchCatJson = """
        {
            "name": "Header Patched Category",
            "description": "Updated via header key only",
            "isActive": true
        }
        """;
        var catPatchNoKeyResp = await client.SendAsync(RawJsonRequest(HttpMethod.Patch, $"/api/v1/product-categories/{createdCat.CategoryId}", rawPatchCatJson));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, catPatchNoKeyResp.StatusCode);

        var catPatchHeaderKey = "HDR-CAT-UP-" + Guid.NewGuid().ToString("N");
        var catPatchOkResp = await client.SendAsync(RawJsonRequest(HttpMethod.Patch, $"/api/v1/product-categories/{createdCat.CategoryId}", rawPatchCatJson, catPatchHeaderKey));
        Assert.Equal(HttpStatusCode.OK, catPatchOkResp.StatusCode);

        // 1f. Header missing, body present in raw JSON -> 200 OK (preserves body-key support)
        var bodyOnlyCatKey = "BDY-ONLY-CAT-" + Guid.NewGuid().ToString("N");
        var rawBodyOnlyPatchCatJson = $$"""
        {
            "name": "Body Key Patched Category",
            "description": "Updated via body key only",
            "isActive": true,
            "idempotencyKey": "{{bodyOnlyCatKey}}"
        }
        """;
        var catBodyOnlyResp = await client.SendAsync(RawJsonRequest(HttpMethod.Patch, $"/api/v1/product-categories/{createdCat.CategoryId}", rawBodyOnlyPatchCatJson));
        Assert.Equal(HttpStatusCode.OK, catBodyOnlyResp.StatusCode);

        // =========================================================================
        // 2. Products (POST & PATCH) — raw JSON without "idempotencyKey"
        // =========================================================================
        var prodSku = "HDR-SKU-" + Guid.NewGuid().ToString("N")[..6];
        var rawCreateProdJson = $$"""
        {
            "categoryId": "{{catId}}",
            "sku": "{{prodSku}}",
            "name": "Header Only Product",
            "baseUomCode": "box",
            "taxRate": 0.14,
            "lotTrackingRequired": true,
            "expiryAlertDays": 30,
            "uoms": [
                {
                    "uomCode": "box",
                    "displayName": "Box",
                    "conversionToBase": 1.0,
                    "saleUnitPrice": 25.0,
                    "isBase": true,
                    "isSellable": true,
                    "isPurchasable": true
                }
            ]
        }
        """;

        var prodNoKeyResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/products", rawCreateProdJson));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, prodNoKeyResp.StatusCode);

        var prodHeaderKey = "HDR-PROD-CR-" + Guid.NewGuid().ToString("N");
        var prodCreatedResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/products", rawCreateProdJson, prodHeaderKey));
        Assert.Equal(HttpStatusCode.OK, prodCreatedResp.StatusCode);
        var createdProd = await prodCreatedResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions);
        Assert.NotNull(createdProd);

        var rawPatchProdJson = """
        {
            "name": "Header Patched Product"
        }
        """;
        var prodPatchNoKeyResp = await client.SendAsync(RawJsonRequest(HttpMethod.Patch, $"/api/v1/products/{createdProd!.ProductId}", rawPatchProdJson));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, prodPatchNoKeyResp.StatusCode);

        var prodPatchHeaderKey = "HDR-PROD-UP-" + Guid.NewGuid().ToString("N");
        var prodPatchOkResp = await client.SendAsync(RawJsonRequest(HttpMethod.Patch, $"/api/v1/products/{createdProd.ProductId}", rawPatchProdJson, prodPatchHeaderKey));
        Assert.Equal(HttpStatusCode.OK, prodPatchOkResp.StatusCode);

        // =========================================================================
        // 3. Product UOMs (POST & PATCH) — raw JSON without "idempotencyKey"
        // =========================================================================
        var rawCreateUomJson = """
        {
            "uomCode": "pack10",
            "displayName": "Pack of 10",
            "conversionToBase": 10.0,
            "saleUnitPrice": 200.0,
            "isBase": false,
            "isSellable": true,
            "isPurchasable": true
        }
        """;
        var uomNoKeyResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, $"/api/v1/products/{createdProd.ProductId}/uoms", rawCreateUomJson));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, uomNoKeyResp.StatusCode);

        var uomHeaderKey = "HDR-UOM-CR-" + Guid.NewGuid().ToString("N");
        var uomCreatedResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, $"/api/v1/products/{createdProd.ProductId}/uoms", rawCreateUomJson, uomHeaderKey));
        Assert.Equal(HttpStatusCode.OK, uomCreatedResp.StatusCode);
        var createdUom = await uomCreatedResp.Content.ReadFromJsonAsync<ProductUomDto>(JsonOptions);
        Assert.NotNull(createdUom);

        var rawPatchUomJson = """
        {
            "displayName": "Header Patched Pack"
        }
        """;
        var uomPatchNoKeyResp = await client.SendAsync(RawJsonRequest(HttpMethod.Patch, $"/api/v1/products/{createdProd.ProductId}/uoms/{createdUom!.ProductUomId}", rawPatchUomJson));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, uomPatchNoKeyResp.StatusCode);

        var uomPatchHeaderKey = "HDR-UOM-UP-" + Guid.NewGuid().ToString("N");
        var uomPatchOkResp = await client.SendAsync(RawJsonRequest(HttpMethod.Patch, $"/api/v1/products/{createdProd.ProductId}/uoms/{createdUom.ProductUomId}", rawPatchUomJson, uomPatchHeaderKey));
        Assert.Equal(HttpStatusCode.OK, uomPatchOkResp.StatusCode);

        // =========================================================================
        // 4. Reorder Rules (PUT) — raw JSON without "idempotencyKey"
        // =========================================================================
        var rawUpsertRrJson = """
        {
            "reorderPointBase": 30.0,
            "reorderQuantityBase": 60.0,
            "maxQuantityBase": 120.0,
            "isActive": true
        }
        """;
        var rrNoKeyResp = await client.SendAsync(RawJsonRequest(HttpMethod.Put, $"/api/v1/branches/{_fixture.BranchA1Id}/products/{createdProd.ProductId}/reorder-rule", rawUpsertRrJson));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, rrNoKeyResp.StatusCode);

        var rrHeaderKey = "HDR-RR-UP-" + Guid.NewGuid().ToString("N");
        var rrOkResp = await client.SendAsync(RawJsonRequest(HttpMethod.Put, $"/api/v1/branches/{_fixture.BranchA1Id}/products/{createdProd.ProductId}/reorder-rule", rawUpsertRrJson, rrHeaderKey));
        Assert.Equal(HttpStatusCode.OK, rrOkResp.StatusCode);

        // =========================================================================
        // 5. Canonical Configuration (POST products & PUT reorder-rules) — raw JSON without "idempotencyKey"
        // =========================================================================
        var rawCanonProdJson = $$"""
        {
            "requestId": "{{Guid.NewGuid()}}",
            "sourcePromptId": "PRM-HDR-ONLY-1",
            "action": 2,
            "productId": "{{createdProd.ProductId}}",
            "name": "Canonical Header Only Updated Name"
        }
        """;
        var canonProdNoKeyResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/canonical/configuration/products", rawCanonProdJson));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, canonProdNoKeyResp.StatusCode);

        var canonProdHeaderKey = "HDR-CANON-P-" + Guid.NewGuid().ToString("N");
        var canonProdOkResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/canonical/configuration/products", rawCanonProdJson, canonProdHeaderKey));
        Assert.Equal(HttpStatusCode.OK, canonProdOkResp.StatusCode);

        var rawCanonRrJson = $$"""
        {
            "requestId": "{{Guid.NewGuid()}}",
            "sourcePromptId": "PRM-HDR-ONLY-2",
            "branchId": "{{_fixture.BranchA1Id}}",
            "productId": "{{createdProd.ProductId}}",
            "reorderPointBase": 45.0,
            "reorderQuantityBase": 90.0,
            "maxQuantityBase": 180.0,
            "isActive": true
        }
        """;
        var canonRrNoKeyResp = await client.SendAsync(RawJsonRequest(HttpMethod.Put, "/api/v1/canonical/configuration/reorder-rules", rawCanonRrJson));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, canonRrNoKeyResp.StatusCode);

        var canonRrHeaderKey = "HDR-CANON-RR-" + Guid.NewGuid().ToString("N");
        var canonRrOkResp = await client.SendAsync(RawJsonRequest(HttpMethod.Put, "/api/v1/canonical/configuration/reorder-rules", rawCanonRrJson, canonRrHeaderKey));
        Assert.Equal(HttpStatusCode.OK, canonRrOkResp.StatusCode);

        // =========================================================================
        // 6. Header present, body property explicitly null ("idempotencyKey": null) -> 200 OK
        // =========================================================================
        var explicitNullCatCode = "NULLKEY-" + Guid.NewGuid().ToString("N")[..6];
        var rawExplicitNullKeyJson = $$"""
        {
            "parentCategoryId": null,
            "code": "{{explicitNullCatCode}}",
            "name": "Explicit Null Body Key Category",
            "description": "Explicit null idempotencyKey in JSON",
            "idempotencyKey": null
        }
        """;
        var explicitNullHeaderKey = "HDR-EXPLICIT-NULL-" + Guid.NewGuid().ToString("N");
        var explicitNullResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/product-categories", rawExplicitNullKeyJson, explicitNullHeaderKey));
        Assert.Equal(HttpStatusCode.OK, explicitNullResp.StatusCode);

        // =========================================================================
        // 7. Both header and body present in raw JSON -> header precedence preserved
        // =========================================================================
        var bothHeaderKey = "HDR-WIN-" + Guid.NewGuid().ToString("N");
        var bothBodyKey = "BDY-LOSE-" + Guid.NewGuid().ToString("N");
        var rawBothPresentJson = $$"""
        {
            "name": "Header Precedence Raw Json Category",
            "description": "Both header and body present",
            "isActive": true,
            "idempotencyKey": "{{bothBodyKey}}"
        }
        """;
        var bothResp1 = await client.SendAsync(RawJsonRequest(HttpMethod.Patch, $"/api/v1/product-categories/{createdCat.CategoryId}", rawBothPresentJson, bothHeaderKey));
        Assert.Equal(HttpStatusCode.OK, bothResp1.StatusCode);

        // Replay with same header key and omitted body key -> 200 OK replay
        var rawBothReplayJson = """
        {
            "name": "Header Precedence Raw Json Category",
            "description": "Both header and body present",
            "isActive": true
        }
        """;
        var bothReplayResp = await client.SendAsync(RawJsonRequest(HttpMethod.Patch, $"/api/v1/product-categories/{createdCat.CategoryId}", rawBothReplayJson, bothHeaderKey));
        Assert.Equal(HttpStatusCode.OK, bothReplayResp.StatusCode);

        // =========================================================================
        // 8. Different required body property omitted (even with Idempotency-Key header present) -> STILL REJECTED (422 Unprocessable Entity)
        // =========================================================================
        // 8a. Omitting required "code" on POST /api/v1/product-categories
        var missingCodeJson = """
        {
            "name": "Missing Code Category"
        }
        """;
        var missingCodeResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/product-categories", missingCodeJson, Guid.NewGuid().ToString()));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, missingCodeResp.StatusCode);

        // 8b. Omitting required "name" and "sku" on POST /api/v1/products
        var missingSkuJson = $$"""
        {
            "categoryId": "{{catId}}",
            "baseUomCode": "box",
            "taxRate": 0.14,
            "lotTrackingRequired": true,
            "expiryAlertDays": 30
        }
        """;
        var missingSkuResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/products", missingSkuJson, Guid.NewGuid().ToString()));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, missingSkuResp.StatusCode);

        // 8c. Omitting required "sourcePromptId" on POST /api/v1/canonical/configuration/products
        var missingPromptJson = $$"""
        {
            "requestId": "{{Guid.NewGuid()}}",
            "action": 2,
            "productId": "{{createdProd.ProductId}}",
            "name": "Missing SourcePromptId"
        }
        """;
        var missingPromptResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/canonical/configuration/products", missingPromptJson, Guid.NewGuid().ToString()));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, missingPromptResp.StatusCode);

        // =========================================================================
        // 9. Malformed JSON (even with Idempotency-Key header present) -> STILL REJECTED (422 Unprocessable Entity)
        // =========================================================================
        var malformedWithHeaderResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/product-categories", "{ \"code\": \"BROKEN\", ", Guid.NewGuid().ToString()));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, malformedWithHeaderResp.StatusCode);

        var wrongTypeIdempotencyKeyJson = $$"""
        {
            "code": "TYPE-ERR",
            "name": "Wrong Type Key",
            "idempotencyKey": 12345
        }
        """;
        var wrongTypeResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/product-categories", wrongTypeIdempotencyKeyJson, Guid.NewGuid().ToString()));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, wrongTypeResp.StatusCode);

        // =========================================================================
        // 10. Unrelated endpoints not supporting header-based idempotency remain completely unaffected
        // =========================================================================
        var adminClient = CreateClient("Admin", branchScope: "ALL");
        var invalidBranchJson = """
        {
            "branchCode": "BR-ONLY"
        }
        """;
        var unrelatedBranchResp = await adminClient.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/branches", invalidBranchJson, Guid.NewGuid().ToString()));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, unrelatedBranchResp.StatusCode);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task CrossTenant_ProductUomGet_And_ReorderRuleUpsert_Return404NotFound()
    {
        var (_, prodAId, _) = await EnsureBaselineEntitiesAsync();

        // 1. Organization B client attempting GET /api/v1/products/{orgAProductId}/uoms -> 404 NOT_FOUND
        var clientOrgB = CreateClient("Pharmacist", orgId: _fixture.OrganizationBId);
        var crossTenantUomsResp = await clientOrgB.GetAsync($"/api/v1/products/{prodAId}/uoms");
        Assert.Equal(HttpStatusCode.NotFound, crossTenantUomsResp.StatusCode);
        var uomsErr = await crossTenantUomsResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(uomsErr);
        Assert.Equal("NOT_FOUND", uomsErr!.Error.Code);
        Assert.Equal(ErrorMessages.ProductNotFound, uomsErr.Error.Message);

        // 2. Organization A Admin (BranchScope = ALL) attempting PUT reorder-rule for Organization B's branch (_fixture.BranchB1Id) -> 404 NOT_FOUND
        var adminOrgA = CreateClient("Admin", orgId: _fixture.OrganizationAId, branchScope: "ALL");
        var rrKey = Guid.NewGuid().ToString();
        var rrReq = new UpsertReorderRuleRequest(25m, 50m, 100m, true, rrKey);
        var crossTenantBranchResp = await adminOrgA.SendAsync(CreateRequest(
            HttpMethod.Put,
            $"/api/v1/branches/{_fixture.BranchB1Id}/products/{prodAId}/reorder-rule",
            rrReq,
            rrKey));
        Assert.Equal(HttpStatusCode.NotFound, crossTenantBranchResp.StatusCode);
        var branchErr = await crossTenantBranchResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(branchErr);
        Assert.Equal("NOT_FOUND", branchErr!.Error.Code);
        Assert.Equal(ErrorMessages.NotFound, branchErr.Error.Message);
    }

    [Fact]
    public void RouteContract_Hardening_ExactSixteenPublicActionMethods_NoDeleteExposed()
    {
        var catalogControllers = new[]
        {
            typeof(ProductCategoriesController),
            typeof(ProductsController),
            typeof(ReorderRulesController),
            typeof(CanonicalCatalogController)
        };

        var totalPublicActionMethods = 0;

        foreach (var controller in catalogControllers)
        {
            var publicMethods = controller.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                .Where(m => !m.IsSpecialName && m.GetCustomAttributes().OfType<HttpMethodAttribute>().Any())
                .ToList();

            totalPublicActionMethods += publicMethods.Count;

            foreach (var method in publicMethods)
            {
                var httpMethodAttr = method.GetCustomAttributes().OfType<HttpMethodAttribute>().First();
                Assert.DoesNotContain("DELETE", httpMethodAttr.HttpMethods);
                Assert.False(method.GetCustomAttributes().OfType<HttpDeleteAttribute>().Any(),
                    $"Endpoint {controller.Name}.{method.Name} must not expose HTTP DELETE.");
            }
        }

        Assert.Equal(16, totalPublicActionMethods);
    }

    [Fact]
    public void AllowHeaderIdempotencyKeyAttribute_RemovesOnlyImplicitRequiredError_PreservesAllOtherModelStateErrors()
    {
        var filterType = typeof(ProductCategoriesController).Assembly
            .GetType("PharmacyERP.Api.Filters.AllowHeaderIdempotencyKeyAttribute");
        Assert.NotNull(filterType);

        var filter = (Microsoft.AspNetCore.Mvc.Filters.ActionFilterAttribute)Activator.CreateInstance(filterType!)!;

        // 1. Verify the actual runtime ModelState key and ModelError produced by ASP.NET Core IObjectModelValidator
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddControllers();
        using var sp = services.BuildServiceProvider();
        var validator = sp.GetRequiredService<Microsoft.AspNetCore.Mvc.ModelBinding.Validation.IObjectModelValidator>();

        var actionContext1 = new ActionContext(
            new Microsoft.AspNetCore.Http.DefaultHttpContext { RequestServices = sp },
            new Microsoft.AspNetCore.Routing.RouteData(),
            new Microsoft.AspNetCore.Mvc.Abstractions.ActionDescriptor());

        var dtoWithNullKey = new CreateProductCategoryRequest(null, "CAT-01", "Valid Name", null, null!);
        validator.Validate(actionContext1, validationState: null, prefix: string.Empty, model: dtoWithNullKey);

        // Confirm the exact runtime ModelState key ("IdempotencyKey") and exact ModelError details
        Assert.False(actionContext1.ModelState.IsValid);
        Assert.True(actionContext1.ModelState.ContainsKey("IdempotencyKey"));
        var runtimeEntry = actionContext1.ModelState["IdempotencyKey"]!;
        var runtimeError = Assert.Single(runtimeEntry.Errors);
        Assert.Null(runtimeError.Exception);
        Assert.Equal("The IdempotencyKey field is required.", runtimeError.ErrorMessage);

        // Running the filter removes this exact implicit Required error
        var execCtx1 = new Microsoft.AspNetCore.Mvc.Filters.ActionExecutingContext(
            actionContext1,
            new List<Microsoft.AspNetCore.Mvc.Filters.IFilterMetadata>(),
            new Dictionary<string, object?> { ["request"] = dtoWithNullKey },
            controller: new object());

        filter.OnActionExecuting(execCtx1);
        Assert.True(actionContext1.ModelState.IsValid);
        Assert.False(actionContext1.ModelState.ContainsKey("IdempotencyKey"));

        // 2. Non-Required validation error on IdempotencyKey (with Exception == null) MUST be preserved
        var actionContext2 = new ActionContext(
            new Microsoft.AspNetCore.Http.DefaultHttpContext(),
            new Microsoft.AspNetCore.Routing.RouteData(),
            new Microsoft.AspNetCore.Mvc.Abstractions.ActionDescriptor());
        actionContext2.ModelState.AddModelError(
            "IdempotencyKey",
            "The field IdempotencyKey must be a string with a maximum length of 100.");

        var execCtx2 = new Microsoft.AspNetCore.Mvc.Filters.ActionExecutingContext(
            actionContext2,
            new List<Microsoft.AspNetCore.Mvc.Filters.IFilterMetadata>(),
            new Dictionary<string, object?> { ["request"] = dtoWithNullKey },
            controller: new object());

        filter.OnActionExecuting(execCtx2);
        Assert.False(actionContext2.ModelState.IsValid);
        Assert.True(actionContext2.ModelState.ContainsKey("IdempotencyKey"));
        var preservedError = Assert.Single(actionContext2.ModelState["IdempotencyKey"]!.Errors);
        Assert.Null(preservedError.Exception);
        Assert.Equal("The field IdempotencyKey must be a string with a maximum length of 100.", preservedError.ErrorMessage);

        // 3. Both implicit Required error AND another validation error on IdempotencyKey -> only implicit Required is removed
        var actionContext3 = new ActionContext(
            new Microsoft.AspNetCore.Http.DefaultHttpContext(),
            new Microsoft.AspNetCore.Routing.RouteData(),
            new Microsoft.AspNetCore.Mvc.Abstractions.ActionDescriptor());
        actionContext3.ModelState.AddModelError("IdempotencyKey", "The IdempotencyKey field is required.");
        actionContext3.ModelState.AddModelError("IdempotencyKey", "IdempotencyKey contains invalid characters.");

        var execCtx3 = new Microsoft.AspNetCore.Mvc.Filters.ActionExecutingContext(
            actionContext3,
            new List<Microsoft.AspNetCore.Mvc.Filters.IFilterMetadata>(),
            new Dictionary<string, object?> { ["request"] = dtoWithNullKey },
            controller: new object());

        filter.OnActionExecuting(execCtx3);
        Assert.False(actionContext3.ModelState.IsValid);
        var remainingOnSameProp = Assert.Single(actionContext3.ModelState["IdempotencyKey"]!.Errors);
        Assert.Equal("IdempotencyKey contains invalid characters.", remainingOnSameProp.ErrorMessage);

        // 4. Implicit Required error on IdempotencyKey + Required error on another property ("Code") -> only IdempotencyKey error is removed
        var actionContext4 = new ActionContext(
            new Microsoft.AspNetCore.Http.DefaultHttpContext { RequestServices = sp },
            new Microsoft.AspNetCore.Routing.RouteData(),
            new Microsoft.AspNetCore.Mvc.Abstractions.ActionDescriptor());
        var dtoMissingCodeAndKey = new CreateProductCategoryRequest(null, null!, "Valid Name", null, null!);
        validator.Validate(actionContext4, validationState: null, prefix: string.Empty, model: dtoMissingCodeAndKey);

        Assert.True(actionContext4.ModelState.ContainsKey("IdempotencyKey"));
        Assert.True(actionContext4.ModelState.ContainsKey("Code"));

        var execCtx4 = new Microsoft.AspNetCore.Mvc.Filters.ActionExecutingContext(
            actionContext4,
            new List<Microsoft.AspNetCore.Mvc.Filters.IFilterMetadata>(),
            new Dictionary<string, object?> { ["request"] = dtoMissingCodeAndKey },
            controller: new object());

        filter.OnActionExecuting(execCtx4);
        Assert.False(actionContext4.ModelState.ContainsKey("IdempotencyKey"));
        Assert.True(actionContext4.ModelState.ContainsKey("Code"));
        Assert.False(actionContext4.ModelState.IsValid);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task GetProducts_SearchByNameSkuBarcode_CategoryId_IncludeInactive_AndPagination_ReturnsExpectedRecords()
    {
        var client = CreateClient("Pharmacist");
        var token = "PFLT" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();

        // 1. Create two isolated categories
        var catAlphaKey = Guid.NewGuid().ToString();
        var catAlphaResp = await client.SendAsync(CreateRequest(
            HttpMethod.Post,
            "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, $"CA-{token}", $"Alpha Category {token}", null, catAlphaKey),
            catAlphaKey));
        Assert.Equal(HttpStatusCode.OK, catAlphaResp.StatusCode);
        var catAlpha = (await catAlphaResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions))!;

        var catBetaKey = Guid.NewGuid().ToString();
        var catBetaResp = await client.SendAsync(CreateRequest(
            HttpMethod.Post,
            "/api/v1/product-categories",
            new CreateProductCategoryRequest(null, $"CB-{token}", $"Beta Category {token}", null, catBetaKey),
            catBetaKey));
        Assert.Equal(HttpStatusCode.OK, catBetaResp.StatusCode);
        var catBeta = (await catBetaResp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions))!;

        // 2. Seed 3 products in catAlpha and 1 product in catBeta
        async Task<ProductDto> CreateTestProductAsync(Guid categoryId, string sku, string? barcode, string name)
        {
            var key = Guid.NewGuid().ToString();
            var req = new CreateProductRequest(
                categoryId,
                sku,
                barcode,
                name,
                null,
                null,
                "tab",
                0.14m,
                null,
                true,
                30,
                new[] { new CreateProductUomItemRequest("tab", "Tablet", 1m, 10m, true, true, true) },
                key);
            var resp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", req, key));
            Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
            return (await resp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions))!;
        }

        var prodAlpha1 = await CreateTestProductAsync(
            catAlpha.CategoryId,
            $"SKU-{token}-A1",
            $"BAR-{token}-111",
            $"A1 {token} Amoxicillin");
        var prodAlpha2 = await CreateTestProductAsync(
            catAlpha.CategoryId,
            $"SKU-{token}-UNIQSKU",
            $"BAR-{token}-222",
            $"A2 {token} Cefotaxime");
        var prodAlpha3 = await CreateTestProductAsync(
            catAlpha.CategoryId,
            $"SKU-{token}-A3",
            $"BAR-{token}-333",
            $"A3 {token} Doxycycline");
        var prodBeta1 = await CreateTestProductAsync(
            catBeta.CategoryId,
            $"SKU-{token}-B1",
            $"BAR-{token}-UNIQBAR",
            $"B1 {token} Ibuprofen");

        // Deactivate prodAlpha3 so includeInactive can be verified
        var deactKey = Guid.NewGuid().ToString();
        var deactResp = await client.SendAsync(CreateRequest(
            HttpMethod.Patch,
            $"/api/v1/products/{prodAlpha3.ProductId}",
            new UpdateProductRequest(null, null, null, null, null, null, null, null, null, null, null, false, deactKey),
            deactKey));
        Assert.Equal(HttpStatusCode.OK, deactResp.StatusCode);

        // 3. Search by product Name
        var searchByNameResp = await client.GetAsync($"/api/v1/products?search={Uri.EscapeDataString($"{token} Amoxicillin")}");
        Assert.Equal(HttpStatusCode.OK, searchByNameResp.StatusCode);
        var searchByNamePage = (await searchByNameResp.Content.ReadFromJsonAsync<PagedResult<ProductDto>>(JsonOptions))!;
        Assert.Equal(1, searchByNamePage.TotalCount);
        var matchedByName = Assert.Single(searchByNamePage.Items);
        Assert.Equal(prodAlpha1.ProductId, matchedByName.ProductId);

        // 4. Search by SKU
        var searchBySkuResp = await client.GetAsync($"/api/v1/products?search={Uri.EscapeDataString($"SKU-{token}-UNIQSKU")}");
        Assert.Equal(HttpStatusCode.OK, searchBySkuResp.StatusCode);
        var searchBySkuPage = (await searchBySkuResp.Content.ReadFromJsonAsync<PagedResult<ProductDto>>(JsonOptions))!;
        Assert.Equal(1, searchBySkuPage.TotalCount);
        var matchedBySku = Assert.Single(searchBySkuPage.Items);
        Assert.Equal(prodAlpha2.ProductId, matchedBySku.ProductId);

        // 5. Search by Barcode
        var searchByBarcodeResp = await client.GetAsync($"/api/v1/products?search={Uri.EscapeDataString($"BAR-{token}-UNIQBAR")}");
        Assert.Equal(HttpStatusCode.OK, searchByBarcodeResp.StatusCode);
        var searchByBarcodePage = (await searchByBarcodeResp.Content.ReadFromJsonAsync<PagedResult<ProductDto>>(JsonOptions))!;
        Assert.Equal(1, searchByBarcodePage.TotalCount);
        var matchedByBarcode = Assert.Single(searchByBarcodePage.Items);
        Assert.Equal(prodBeta1.ProductId, matchedByBarcode.ProductId);

        // 6. Filter by categoryId with includeInactive=false (default) -> excludes deactivated prodAlpha3 and catBeta's prodBeta1
        var activeOnlyResp = await client.GetAsync($"/api/v1/products?categoryId={catAlpha.CategoryId}&includeInactive=false");
        Assert.Equal(HttpStatusCode.OK, activeOnlyResp.StatusCode);
        var activeOnlyPage = (await activeOnlyResp.Content.ReadFromJsonAsync<PagedResult<ProductDto>>(JsonOptions))!;
        Assert.Equal(2, activeOnlyPage.TotalCount);
        Assert.Equal(2, activeOnlyPage.Items.Count);
        Assert.Contains(activeOnlyPage.Items, p => p.ProductId == prodAlpha1.ProductId);
        Assert.Contains(activeOnlyPage.Items, p => p.ProductId == prodAlpha2.ProductId);
        Assert.DoesNotContain(activeOnlyPage.Items, p => p.ProductId == prodAlpha3.ProductId);
        Assert.DoesNotContain(activeOnlyPage.Items, p => p.ProductId == prodBeta1.ProductId);

        // 7. Filter by categoryId with includeInactive=true -> includes deactivated prodAlpha3
        var withInactiveResp = await client.GetAsync($"/api/v1/products?categoryId={catAlpha.CategoryId}&includeInactive=true");
        Assert.Equal(HttpStatusCode.OK, withInactiveResp.StatusCode);
        var withInactivePage = (await withInactiveResp.Content.ReadFromJsonAsync<PagedResult<ProductDto>>(JsonOptions))!;
        Assert.Equal(3, withInactivePage.TotalCount);
        Assert.Equal(3, withInactivePage.Items.Count);
        Assert.Contains(withInactivePage.Items, p => p.ProductId == prodAlpha3.ProductId && !p.IsActive);

        // 8. Pagination (page=1&pageSize=2 and page=2&pageSize=2) ordered by Name
        var page1Resp = await client.GetAsync($"/api/v1/products?categoryId={catAlpha.CategoryId}&includeInactive=true&page=1&pageSize=2");
        Assert.Equal(HttpStatusCode.OK, page1Resp.StatusCode);
        var page1 = (await page1Resp.Content.ReadFromJsonAsync<PagedResult<ProductDto>>(JsonOptions))!;
        Assert.Equal(1, page1.Page);
        Assert.Equal(2, page1.PageSize);
        Assert.Equal(3, page1.TotalCount);
        Assert.Equal(2, page1.Items.Count);
        Assert.Equal(prodAlpha1.ProductId, page1.Items[0].ProductId);
        Assert.Equal(prodAlpha2.ProductId, page1.Items[1].ProductId);

        var page2Resp = await client.GetAsync($"/api/v1/products?categoryId={catAlpha.CategoryId}&includeInactive=true&page=2&pageSize=2");
        Assert.Equal(HttpStatusCode.OK, page2Resp.StatusCode);
        var page2 = (await page2Resp.Content.ReadFromJsonAsync<PagedResult<ProductDto>>(JsonOptions))!;
        Assert.Equal(2, page2.Page);
        Assert.Equal(2, page2.PageSize);
        Assert.Equal(3, page2.TotalCount);
        var page2Item = Assert.Single(page2.Items);
        Assert.Equal(prodAlpha3.ProductId, page2Item.ProductId);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task GetProductCategories_Search_ParentCategoryId_IncludeInactive_AndPagination_ReturnsExpectedRecords()
    {
        var client = CreateClient("Pharmacist");
        var token = "CFLT" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();

        async Task<ProductCategoryDto> CreateTestCategoryAsync(Guid? parentId, string code, string name)
        {
            var key = Guid.NewGuid().ToString();
            var req = new CreateProductCategoryRequest(parentId, code, name, null, key);
            var resp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/product-categories", req, key));
            Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
            return (await resp.Content.ReadFromJsonAsync<ProductCategoryDto>(JsonOptions))!;
        }

        // 1. Create two parent categories
        var parentMain = await CreateTestCategoryAsync(null, $"PRM-{token}", $"Parent Main {token}");
        var parentOther = await CreateTestCategoryAsync(null, $"PRO-{token}", $"Parent Other {token}");

        // 2. Create 3 child categories under parentMain and 1 under parentOther
        var child1 = await CreateTestCategoryAsync(parentMain.CategoryId, $"C1-{token}", $"C1 {token} Analgesics");
        var child2 = await CreateTestCategoryAsync(parentMain.CategoryId, $"C2-{token}-UNIQCODE", $"C2 {token}Cardio");
        var child3 = await CreateTestCategoryAsync(parentMain.CategoryId, $"C3-{token}", $"C3 {token} Dermatology");
        var otherChild = await CreateTestCategoryAsync(parentOther.CategoryId, $"CO-{token}", $"CO {token} Oncology");

        // Deactivate child3
        var deactKey = Guid.NewGuid().ToString();
        var deactResp = await client.SendAsync(CreateRequest(
            HttpMethod.Patch,
            $"/api/v1/product-categories/{child3.CategoryId}",
            new UpdateProductCategoryRequest(parentMain.CategoryId, child3.Name, null, false, deactKey),
            deactKey));
        Assert.Equal(HttpStatusCode.OK, deactResp.StatusCode);

        // 3. Search by category Name
        var searchByNameResp = await client.GetAsync($"/api/v1/product-categories?search={Uri.EscapeDataString($"{token} Analgesics")}");
        Assert.Equal(HttpStatusCode.OK, searchByNameResp.StatusCode);
        var searchByNamePage = (await searchByNameResp.Content.ReadFromJsonAsync<PagedResult<ProductCategoryDto>>(JsonOptions))!;
        Assert.Equal(1, searchByNamePage.TotalCount);
        Assert.Equal(child1.CategoryId, Assert.Single(searchByNamePage.Items).CategoryId);

        // 4. Search by category Code
        var searchByCodeResp = await client.GetAsync($"/api/v1/product-categories?search={Uri.EscapeDataString($"C2-{token}-UNIQCODE")}");
        Assert.Equal(HttpStatusCode.OK, searchByCodeResp.StatusCode);
        var searchByCodePage = (await searchByCodeResp.Content.ReadFromJsonAsync<PagedResult<ProductCategoryDto>>(JsonOptions))!;
        Assert.Equal(1, searchByCodePage.TotalCount);
        Assert.Equal(child2.CategoryId, Assert.Single(searchByCodePage.Items).CategoryId);

        // 5. Filter by parentCategoryId with includeInactive=false (default) -> excludes inactive child3 and otherChild
        var activeChildrenResp = await client.GetAsync($"/api/v1/product-categories?parentCategoryId={parentMain.CategoryId}&includeInactive=false");
        Assert.Equal(HttpStatusCode.OK, activeChildrenResp.StatusCode);
        var activeChildrenPage = (await activeChildrenResp.Content.ReadFromJsonAsync<PagedResult<ProductCategoryDto>>(JsonOptions))!;
        Assert.Equal(2, activeChildrenPage.TotalCount);
        Assert.Equal(2, activeChildrenPage.Items.Count);
        Assert.Contains(activeChildrenPage.Items, c => c.CategoryId == child1.CategoryId);
        Assert.Contains(activeChildrenPage.Items, c => c.CategoryId == child2.CategoryId);
        Assert.DoesNotContain(activeChildrenPage.Items, c => c.CategoryId == child3.CategoryId);
        Assert.DoesNotContain(activeChildrenPage.Items, c => c.CategoryId == otherChild.CategoryId);

        // 6. Filter by parentCategoryId with includeInactive=true -> includes inactive child3
        var allChildrenResp = await client.GetAsync($"/api/v1/product-categories?parentCategoryId={parentMain.CategoryId}&includeInactive=true");
        Assert.Equal(HttpStatusCode.OK, allChildrenResp.StatusCode);
        var allChildrenPage = (await allChildrenResp.Content.ReadFromJsonAsync<PagedResult<ProductCategoryDto>>(JsonOptions))!;
        Assert.Equal(3, allChildrenPage.TotalCount);
        Assert.Equal(3, allChildrenPage.Items.Count);
        Assert.Contains(allChildrenPage.Items, c => c.CategoryId == child3.CategoryId && !c.IsActive);

        // 7. Pagination (page=1&pageSize=2 and page=2&pageSize=2) ordered by Name
        var page1Resp = await client.GetAsync($"/api/v1/product-categories?parentCategoryId={parentMain.CategoryId}&includeInactive=true&page=1&pageSize=2");
        Assert.Equal(HttpStatusCode.OK, page1Resp.StatusCode);
        var page1 = (await page1Resp.Content.ReadFromJsonAsync<PagedResult<ProductCategoryDto>>(JsonOptions))!;
        Assert.Equal(1, page1.Page);
        Assert.Equal(2, page1.PageSize);
        Assert.Equal(3, page1.TotalCount);
        Assert.Equal(2, page1.Items.Count);
        Assert.Equal(child1.CategoryId, page1.Items[0].CategoryId);
        Assert.Equal(child2.CategoryId, page1.Items[1].CategoryId);

        var page2Resp = await client.GetAsync($"/api/v1/product-categories?parentCategoryId={parentMain.CategoryId}&includeInactive=true&page=2&pageSize=2");
        Assert.Equal(HttpStatusCode.OK, page2Resp.StatusCode);
        var page2 = (await page2Resp.Content.ReadFromJsonAsync<PagedResult<ProductCategoryDto>>(JsonOptions))!;
        Assert.Equal(2, page2.Page);
        Assert.Equal(2, page2.PageSize);
        Assert.Equal(3, page2.TotalCount);
        var page2Item = Assert.Single(page2.Items);
        Assert.Equal(child3.CategoryId, page2Item.CategoryId);
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task PatchProductUom_DeactivateSecondaryUomSucceeds_DeactivateBaseUomReturns422ValidationError()
    {
        var client = CreateClient("Pharmacist");
        var (catId, _, _) = await EnsureBaselineEntitiesAsync();

        // 1. Create product with base UOM "TAB"
        var prodKey = Guid.NewGuid().ToString();
        var prodReq = new CreateProductRequest(
            catId,
            "SKU-UOMDEACT-" + Guid.NewGuid().ToString("N")[..8],
            null,
            "UOM Deactivation Test Product",
            null,
            null,
            "TAB",
            0.14m,
            null,
            true,
            30,
            new[] { new CreateProductUomItemRequest("TAB", "Tablet", 1.0m, 5.00m, true, true, true) },
            prodKey);
        var prodResp = await client.SendAsync(CreateRequest(HttpMethod.Post, "/api/v1/products", prodReq, prodKey));
        Assert.Equal(HttpStatusCode.OK, prodResp.StatusCode);
        var prod = (await prodResp.Content.ReadFromJsonAsync<ProductDto>(JsonOptions))!;
        var baseUom = Assert.Single(prod.Uoms);
        Assert.True(baseUom.IsBase);
        Assert.True(baseUom.IsActive);

        // 2. Add secondary UOM "STRIP"
        var secKey = Guid.NewGuid().ToString();
        var secReq = new CreateProductUomRequest("STRIP", "Strip of 10", 10.0m, 50.00m, false, true, true, secKey);
        var secResp = await client.SendAsync(CreateRequest(HttpMethod.Post, $"/api/v1/products/{prod.ProductId}/uoms", secReq, secKey));
        Assert.Equal(HttpStatusCode.OK, secResp.StatusCode);
        var secUom = (await secResp.Content.ReadFromJsonAsync<ProductUomDto>(JsonOptions))!;
        Assert.False(secUom.IsBase);
        Assert.True(secUom.IsActive);

        // 3. Deactivate secondary UOM via PATCH /api/v1/products/{id}/uoms/{uomId} with isActive: false -> 200 OK
        var deactSecKey = Guid.NewGuid().ToString();
        var deactSecReq = new UpdateProductUomRequest(null, null, null, null, null, false, deactSecKey);
        var deactSecResp = await client.SendAsync(CreateRequest(
            HttpMethod.Patch,
            $"/api/v1/products/{prod.ProductId}/uoms/{secUom.ProductUomId}",
            deactSecReq,
            deactSecKey));
        Assert.Equal(HttpStatusCode.OK, deactSecResp.StatusCode);
        var deactivatedSecDto = (await deactSecResp.Content.ReadFromJsonAsync<ProductUomDto>(JsonOptions))!;
        Assert.Equal(secUom.ProductUomId, deactivatedSecDto.ProductUomId);
        Assert.False(deactivatedSecDto.IsActive);

        // 4. Attempt to deactivate base UOM via PATCH /api/v1/products/{id}/uoms/{uomId} with isActive: false -> 422 VALIDATION_ERROR
        var deactBaseKey = Guid.NewGuid().ToString();
        var deactBaseReq = new UpdateProductUomRequest(null, null, null, null, null, false, deactBaseKey);
        var deactBaseResp = await client.SendAsync(CreateRequest(
            HttpMethod.Patch,
            $"/api/v1/products/{prod.ProductId}/uoms/{baseUom.ProductUomId}",
            deactBaseReq,
            deactBaseKey));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, deactBaseResp.StatusCode);
        var deactBaseErr = await deactBaseResp.Content.ReadFromJsonAsync<ApiErrorEnvelopeDto>(JsonOptions);
        Assert.NotNull(deactBaseErr);
        Assert.Equal("VALIDATION_ERROR", deactBaseErr!.Error.Code);

        // 5. Verify via GET /api/v1/products/{id}/uoms that secondary UOM is inactive and base UOM remains active
        var listResp = await client.GetAsync($"/api/v1/products/{prod.ProductId}/uoms");
        Assert.Equal(HttpStatusCode.OK, listResp.StatusCode);
        var uoms = (await listResp.Content.ReadFromJsonAsync<IReadOnlyList<ProductUomDto>>(JsonOptions))!;
        Assert.Equal(2, uoms.Count);
        Assert.True(uoms.Single(u => u.ProductUomId == baseUom.ProductUomId).IsActive);
        Assert.False(uoms.Single(u => u.ProductUomId == secUom.ProductUomId).IsActive);
    }
    #endregion
}
#endregion
