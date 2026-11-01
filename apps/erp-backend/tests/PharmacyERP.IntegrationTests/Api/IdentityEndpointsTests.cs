using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using PharmacyERP.Application.Common.Interfaces.CrossModule;
using PharmacyERP.Application.Common.Interfaces.Integration;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Application.Features.Identity.Interfaces;
using PharmacyERP.Domain.Entities.Identity;
using PharmacyERP.Domain.Entities.Integration;
using PharmacyERP.Infrastructure.Auth;

namespace PharmacyERP.IntegrationTests.Api;

public sealed class IdentityEndpointsTests : IClassFixture<WebApplicationFactory<PharmacyERP.Api.Program>>, IDisposable
{
    private readonly WebApplicationFactory<PharmacyERP.Api.Program> _factory;
    private readonly HttpClient _client;

    public IdentityEndpointsTests(WebApplicationFactory<PharmacyERP.Api.Program> factory)
    {
        _factory = factory;
        _client = factory.WithWebHostBuilder(builder => builder.ConfigureLogging(logging => logging.ClearProviders())).CreateClient();
    }

    public void Dispose() => _client.Dispose();

    [Fact]
    public async Task JwksEndpoint_PublishesPublicSigningKey()
    {
        using var response = await _client.GetAsync("/.well-known/jwks.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/jwk-set+json", response.Content.Headers.ContentType?.MediaType);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("\"keys\"", body);
        Assert.Contains("\"alg\":\"RS256\"", body);
        Assert.Contains("\"kid\"", body);
    }

    [Theory]
    [InlineData("/api/v1/auth/me")]
    [InlineData("/api/v1/users")]
    [InlineData("/api/v1/employees")]
    [InlineData("/api/v1/branches")]
    public async Task ProtectedIdentityEndpoints_RejectAnonymousRequests(string path)
    {
        using var response = await _client.GetAsync(path);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task OrganizationProvisioning_RejectsAnonymousRequest()
    {
        using var response = await _client.PostAsync("/api/v1/organizations", JsonContent.Create(new { }));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task IdentityFlow_ProvisionsOrganizationEnrollsBranchCreatesPharmacistAndDetectsRefreshReuse()
    {
        var store = new IdentityApiTestStore();
        await using var testFactory = _factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureLogging(logging => logging.ClearProviders());
            builder.ConfigureTestServices(services =>
            {
            services.RemoveAll<IOrganizationRepository>();
            services.RemoveAll<IBranchRepository>();
            services.RemoveAll<IEmployeeRepository>();
            services.RemoveAll<IUserAccountRepository>();
            services.RemoveAll<IBranchEnrollmentRepository>();
            services.RemoveAll<IUserRefreshTokenRepository>();
            services.RemoveAll<IGenericRepository<OutboxEventCursor>>();
            services.RemoveAll<IUnitOfWork>();
            services.RemoveAll<IBranchDefaultLocationSeeder>();
            services.RemoveAll<IAuditLogger>();
            services.RemoveAll<IOutboxService>();

            services.AddSingleton(store);
            services.AddScoped<IOrganizationRepository>(sp => sp.GetRequiredService<IdentityApiTestStore>().OrganizationsRepo);
            services.AddScoped<IBranchRepository>(sp => sp.GetRequiredService<IdentityApiTestStore>().BranchesRepo);
            services.AddScoped<IEmployeeRepository>(sp => sp.GetRequiredService<IdentityApiTestStore>().EmployeesRepo);
            services.AddScoped<IUserAccountRepository>(sp => sp.GetRequiredService<IdentityApiTestStore>().UserAccountsRepo);
            services.AddScoped<IBranchEnrollmentRepository>(sp => sp.GetRequiredService<IdentityApiTestStore>().BranchEnrollmentsRepo);
            services.AddScoped<IUserRefreshTokenRepository>(sp => sp.GetRequiredService<IdentityApiTestStore>().RefreshTokensRepo);
            services.AddScoped<IGenericRepository<OutboxEventCursor>>(sp => sp.GetRequiredService<IdentityApiTestStore>().OutboxCursorsRepo);
            services.AddScoped<IUnitOfWork, IdentityApiTestUnitOfWork>();
            services.AddScoped<IBranchDefaultLocationSeeder, IdentityApiTestBranchSeeder>();
            services.AddScoped<IAuditLogger, IdentityApiTestAuditLogger>();
                services.AddScoped<IOutboxService, IdentityApiTestOutboxService>();
            });
        });

        var keyProvider = testFactory.Services.GetRequiredService<JwksKeyProvider>();
        using var client = testFactory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", CreatePlatformProvisionerToken(keyProvider));
        using var organizationResponse = await client.PostAsJsonAsync("/api/v1/organizations", new
        {
            organizationCode = "E2E-PHARMACY",
            name = "End To End Pharmacy",
            baseCurrency = "EGP",
            timeZoneId = "Africa/Cairo",
            address = Address("Organization Street"),
            initialBranch = new { branchCode = "MAIN", name = "Main Branch", address = Address("Main Street") },
            initialEmployee = new
            {
                branchId = Guid.Empty,
                employeeNo = "EMP-001",
                fullName = "Initial Administrator",
                jobTitle = "Administrator",
                address = Address("Employee Street"),
                hiredOn = "2025-01-01"
            },
            initialAdmin = new { username = "owner", password = "OwnerPassword123!" }
        });
        Assert.Equal(HttpStatusCode.OK, organizationResponse.StatusCode);
        using var organizationBody = JsonDocument.Parse(await organizationResponse.Content.ReadAsStringAsync());
        var organizationId = organizationBody.RootElement.GetProperty("organizationId").GetGuid();
        var firstBranchId = organizationBody.RootElement.GetProperty("initialBranchId").GetGuid();
        var initialEmployeeId = organizationBody.RootElement.GetProperty("initialEmployeeId").GetGuid();
        var adminUserId = organizationBody.RootElement.GetProperty("initialAdminUserId").GetGuid();
        Assert.Contains(store.OutboxCursors, x => x.OrganizationId == organizationId);
        Assert.Contains(firstBranchId, store.SeededBranches);

        client.DefaultRequestHeaders.Authorization = null;
        using var adminLoginResponse = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            organizationCode = "E2E-PHARMACY",
            username = "owner",
            password = "OwnerPassword123!"
        });
        Assert.Equal(HttpStatusCode.OK, adminLoginResponse.StatusCode);
        using var adminLoginBody = JsonDocument.Parse(await adminLoginResponse.Content.ReadAsStringAsync());
        var adminAccessToken = adminLoginBody.RootElement.GetProperty("accessToken").GetString()!;
        var originalRefreshToken = adminLoginBody.RootElement.GetProperty("refreshToken").GetString()!;

        using var jwksResponse = await client.GetAsync("/.well-known/jwks.json");
        Assert.Equal(HttpStatusCode.OK, jwksResponse.StatusCode);
        Assert.Contains(keyProvider.KeyId, await jwksResponse.Content.ReadAsStringAsync());
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAccessToken);
        using var meResponse = await client.GetAsync("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.OK, meResponse.StatusCode);
        using var meBody = JsonDocument.Parse(await meResponse.Content.ReadAsStringAsync());
        Assert.Equal(organizationId, meBody.RootElement.GetProperty("organizationId").GetGuid());
        Assert.Equal(adminUserId, meBody.RootElement.GetProperty("userId").GetGuid());
        Assert.Equal("ALL", meBody.RootElement.GetProperty("branchScope").GetString());

        using var createBranchResponse = await client.PostAsJsonAsync("/api/v1/branches", new
        {
            branchCode = "SECOND",
            name = "Second Branch",
            address = Address("Second Street")
        });
        Assert.Equal(HttpStatusCode.OK, createBranchResponse.StatusCode);
        using var branchBody = JsonDocument.Parse(await createBranchResponse.Content.ReadAsStringAsync());
        var secondBranchId = branchBody.RootElement.GetProperty("branchId").GetGuid();
        Assert.Contains(secondBranchId, store.SeededBranches);

        using var enrollmentIssueResponse = await client.PostAsync($"/api/v1/branches/{secondBranchId}/enrollment-tokens", null);
        Assert.Equal(HttpStatusCode.OK, enrollmentIssueResponse.StatusCode);
        using var enrollmentIssueBody = JsonDocument.Parse(await enrollmentIssueResponse.Content.ReadAsStringAsync());
        var enrollmentToken = enrollmentIssueBody.RootElement.GetProperty("token").GetString()!;

        client.DefaultRequestHeaders.Authorization = null;
        using var enrollmentRedeemResponse = await client.PostAsJsonAsync("/api/v1/branch-enrollment", new { token = enrollmentToken });
        Assert.Equal(HttpStatusCode.OK, enrollmentRedeemResponse.StatusCode);
        using var enrollmentRedeemBody = JsonDocument.Parse(await enrollmentRedeemResponse.Content.ReadAsStringAsync());
        Assert.Equal(organizationId, enrollmentRedeemBody.RootElement.GetProperty("organizationId").GetGuid());
        Assert.Equal(secondBranchId, enrollmentRedeemBody.RootElement.GetProperty("branchId").GetGuid());
        using var enrollmentReplayResponse = await client.PostAsJsonAsync("/api/v1/branch-enrollment", new { token = enrollmentToken });
        Assert.Equal(HttpStatusCode.Unauthorized, enrollmentReplayResponse.StatusCode);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAccessToken);
        using var employeeResponse = await client.PostAsJsonAsync("/api/v1/employees", new
        {
            branchId = secondBranchId,
            employeeNo = "PHARM-001",
            fullName = "Second Branch Pharmacist",
            email = "pharmacist@example.test",
            jobTitle = "Pharmacist",
            address = Address("Pharmacist Street"),
            hiredOn = "2025-02-01"
        });
        Assert.Equal(HttpStatusCode.OK, employeeResponse.StatusCode);
        using var employeeBody = JsonDocument.Parse(await employeeResponse.Content.ReadAsStringAsync());
        var pharmacistEmployeeId = employeeBody.RootElement.GetProperty("employeeId").GetGuid();
        Assert.NotEqual(initialEmployeeId, pharmacistEmployeeId);

        using var userResponse = await client.PostAsJsonAsync("/api/v1/users", new
        {
            employeeId = pharmacistEmployeeId,
            username = "pharmacist",
            password = "PharmacistPassword123!",
            role = 2,
            branchScope = 2,
            branchIds = new[] { secondBranchId }
        });
        Assert.Equal(HttpStatusCode.OK, userResponse.StatusCode);

        client.DefaultRequestHeaders.Authorization = null;
        using var pharmacistLoginResponse = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            organizationCode = "E2E-PHARMACY",
            username = "pharmacist",
            password = "PharmacistPassword123!"
        });
        Assert.Equal(HttpStatusCode.OK, pharmacistLoginResponse.StatusCode);
        using var pharmacistLoginBody = JsonDocument.Parse(await pharmacistLoginResponse.Content.ReadAsStringAsync());
        var pharmacistAccessToken = pharmacistLoginBody.RootElement.GetProperty("accessToken").GetString()!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", pharmacistAccessToken);
        using var forbiddenUsersResponse = await client.GetAsync("/api/v1/users");
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenUsersResponse.StatusCode);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAccessToken);
        using var rotateResponse = await client.PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken = originalRefreshToken });
        Assert.Equal(HttpStatusCode.OK, rotateResponse.StatusCode);
        using var rotateBody = JsonDocument.Parse(await rotateResponse.Content.ReadAsStringAsync());
        var rotatedRefreshToken = rotateBody.RootElement.GetProperty("refreshToken").GetString()!;

        using var reusedRefreshResponse = await client.PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken = originalRefreshToken });
        Assert.Equal(HttpStatusCode.Unauthorized, reusedRefreshResponse.StatusCode);
        using var revokedFamilyResponse = await client.PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken = rotatedRefreshToken });
        Assert.Equal(HttpStatusCode.Unauthorized, revokedFamilyResponse.StatusCode);

        Assert.Single(store.Organizations);
        Assert.Equal(2, store.Branches.Count);
        Assert.Equal(2, store.Employees.Count);
        Assert.Equal(2, store.Users.Count);
        Assert.Single(store.OutboxCursors);
        Assert.All(store.RefreshTokens.Where(x => x.UserId == adminUserId), token => Assert.NotNull(token.RevokedAt));
    }

    private static object Address(string line1) => new
    {
        line1,
        city = "Cairo",
        countryCode = "EG"
    };

    private static string CreatePlatformProvisionerToken(JwksKeyProvider keyProvider)
    {
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            issuer: "PharmacyERP",
            audience: "PharmacyERP.Api",
            claims: new[] { new Claim("role", "PlatformProvisioner") },
            notBefore: now.AddSeconds(-10),
            expires: now.AddMinutes(5),
            signingCredentials: keyProvider.CreateSigningCredentials());
        token.Header["kid"] = keyProvider.KeyId;
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
