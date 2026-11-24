using System.Net.Http.Headers;
using System.IdentityModel.Tokens.Jwt;
using PharmacyERP.Infrastructure.Auth;

namespace PharmacyERP.IntegrationTests.Api;

public sealed class IdentityEndpointsTests : IClassFixture<WebApplicationFactory<PharmacyERP.Api.Program>>, IDisposable
{
    private readonly WebApplicationFactory<PharmacyERP.Api.Program> _factory;
    private readonly HttpClient _client;

    public IdentityEndpointsTests(WebApplicationFactory<PharmacyERP.Api.Program> factory)
    {
        _factory = factory;
        _client = factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ConnectionStrings:DefaultConnection", "Host=localhost;Database=erp_test_unused;Username=erp_app;Password=test-only");
            builder.UseSetting("Outbox:WorkerEnabled", "false");
            builder.ConfigureLogging(logging => logging.ClearProviders());
            builder.ConfigureTestServices(RemoveDatabaseStartupCheck);
        }).CreateClient();
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
        await AssertErrorEnvelopeAsync(response, "UNAUTHORIZED");
    }

    [Fact]
    public async Task OrganizationProvisioning_RejectsAnonymousRequest()
    {
        using var response = await _client.PostAsync("/api/v1/organizations", JsonContent.Create(new { }));
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        await AssertErrorEnvelopeAsync(response, "UNAUTHORIZED");
    }

    [Fact]
    public async Task IdentityFlow_ProvisionsOrganizationEnrollsBranchCreatesPharmacistAndDetectsRefreshReuse()
    {
        var store = new IdentityApiTestStore();
        await using var testFactory = _factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ConnectionStrings:DefaultConnection", "Host=localhost;Database=erp_test_unused;Username=erp_app;Password=test-only");
            builder.UseSetting("Outbox:WorkerEnabled", "false");
            builder.ConfigureLogging(logging => logging.ClearProviders());
            builder.ConfigureTestServices(services =>
            {
            RemoveDatabaseStartupCheck(services);
            services.RemoveAll<IOrganizationRepository>();
            services.RemoveAll<IBranchRepository>();
            services.RemoveAll<IEmployeeRepository>();
            services.RemoveAll<IUserAccountRepository>();
            services.RemoveAll<IBranchEnrollmentRepository>();
            services.RemoveAll<IUserRefreshTokenRepository>();
            services.RemoveAll<IGenericRepository<OutboxEventCursor>>();
            services.RemoveAll<IIdempotencyRepository>();
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
            services.AddScoped<IIdempotencyRepository>(sp => sp.GetRequiredService<IdentityApiTestStore>().IdempotencyRepo);
            services.AddScoped<IUnitOfWork, IdentityApiTestUnitOfWork>();
            services.AddScoped<IBranchDefaultLocationSeeder, IdentityApiTestBranchSeeder>();
            services.AddScoped<IAuditLogger, IdentityApiTestAuditLogger>();
                services.AddScoped<IOutboxService, IdentityApiTestOutboxService>();
            });
        });

        var keyProvider = testFactory.Services.GetRequiredService<JwksKeyProvider>();
        using var client = testFactory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", CreatePlatformProvisionerToken(keyProvider));
        using var organizationResponse = await SendWithIdempotencyAsync(client, HttpMethod.Post, "/api/v1/organizations", "org-e2e-1", new
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
        Assert.Equal(HttpStatusCode.Created, organizationResponse.StatusCode);
        using var organizationBody = JsonDocument.Parse(await organizationResponse.Content.ReadAsStringAsync());
        var organizationId = organizationBody.RootElement.GetProperty("organizationId").GetGuid();
        Assert.Equal($"/api/v1/organizations/{organizationId}", organizationResponse.Headers.Location?.ToString());
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
        Assert.Equal("owner", meBody.RootElement.GetProperty("username").GetString());
        Assert.Equal("ALL", meBody.RootElement.GetProperty("branchScope").GetString());

        using var createBranchResponse = await SendWithIdempotencyAsync(client, HttpMethod.Post, "/api/v1/branches", "branch-e2e-1", new
        {
            branchCode = "SECOND",
            name = "Second Branch",
            address = Address("Second Street")
        });
        Assert.Equal(HttpStatusCode.Created, createBranchResponse.StatusCode);
        using var branchBody = JsonDocument.Parse(await createBranchResponse.Content.ReadAsStringAsync());
        var secondBranchId = branchBody.RootElement.GetProperty("branchId").GetGuid();
        Assert.Equal($"/api/v1/branches/{secondBranchId}", createBranchResponse.Headers.Location?.ToString());
        Assert.Contains(secondBranchId, store.SeededBranches);

        using var enrollmentIssueResponse = await SendWithIdempotencyAsync(client, HttpMethod.Post, $"/api/v1/branches/{secondBranchId}/enrollment-tokens", "enroll-issue-1");
        Assert.Equal(HttpStatusCode.Created, enrollmentIssueResponse.StatusCode);
        Assert.Equal($"/api/v1/branches/{secondBranchId}/enrollment-tokens", enrollmentIssueResponse.Headers.Location?.ToString());
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
        using var employeeResponse = await SendWithIdempotencyAsync(client, HttpMethod.Post, "/api/v1/employees", "emp-e2e-1", new
        {
            branchId = secondBranchId,
            employeeNo = "PHARM-001",
            fullName = "Second Branch Pharmacist",
            email = "pharmacist@example.test",
            jobTitle = "Pharmacist",
            address = Address("Pharmacist Street"),
            hiredOn = "2025-02-01"
        });
        Assert.Equal(HttpStatusCode.Created, employeeResponse.StatusCode);
        using var employeeBody = JsonDocument.Parse(await employeeResponse.Content.ReadAsStringAsync());
        var pharmacistEmployeeId = employeeBody.RootElement.GetProperty("employeeId").GetGuid();
        Assert.Equal($"/api/v1/employees/{pharmacistEmployeeId}", employeeResponse.Headers.Location?.ToString());
        Assert.NotEqual(initialEmployeeId, pharmacistEmployeeId);

        using var userResponse = await SendWithIdempotencyAsync(client, HttpMethod.Post, "/api/v1/users", "user-e2e-1", new
        {
            employeeId = pharmacistEmployeeId,
            username = "pharmacist",
            password = "PharmacistPassword123!",
            role = 2,
            branchScope = 2,
            branchIds = new[] { secondBranchId }
        });
        Assert.Equal(HttpStatusCode.Created, userResponse.StatusCode);
        using var userBody = JsonDocument.Parse(await userResponse.Content.ReadAsStringAsync());
        var pharmacistUserId = userBody.RootElement.GetProperty("userId").GetGuid();
        Assert.Equal($"/api/v1/users/{pharmacistUserId}", userResponse.Headers.Location?.ToString());

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
        await AssertErrorEnvelopeAsync(forbiddenUsersResponse, "FORBIDDEN");

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

    private static Task<HttpResponseMessage> SendWithIdempotencyAsync(
        HttpClient client,
        HttpMethod method,
        string url,
        string idempotencyKey,
        object? payload = null)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Add("Idempotency-Key", idempotencyKey);
        if (payload is not null)
        {
            request.Content = JsonContent.Create(payload);
        }

        return client.SendAsync(request);
    }

    private static async Task AssertErrorEnvelopeAsync(HttpResponseMessage response, string expectedCode)
    {
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        var raw = await response.Content.ReadAsStringAsync();
        Assert.False(string.IsNullOrWhiteSpace(raw));
        using var doc = JsonDocument.Parse(raw);
        var error = doc.RootElement.GetProperty("error");
        Assert.Equal(expectedCode, error.GetProperty("code").GetString());
        Assert.False(string.IsNullOrWhiteSpace(error.GetProperty("message").GetString()));
        Assert.Equal(JsonValueKind.Array, error.GetProperty("details").ValueKind);
        Assert.False(string.IsNullOrWhiteSpace(error.GetProperty("trace_id").GetString()));
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

    private static void RemoveDatabaseStartupCheck(IServiceCollection services)
    {
        var descriptors = services
            .Where(d => d.ServiceType == typeof(IHostedService) && d.ImplementationType == typeof(DatabaseSecurityStartupCheck))
            .ToList();
        foreach (var descriptor in descriptors)
            services.Remove(descriptor);
    }
}
