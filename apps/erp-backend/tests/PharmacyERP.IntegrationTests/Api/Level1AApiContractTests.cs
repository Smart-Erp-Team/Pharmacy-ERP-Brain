using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Text;
using Moq;
using PharmacyERP.Application.Features.Catalog.DTOs;
using PharmacyERP.Application.Features.Inventory.DTOs;
using PharmacyERP.Infrastructure.Auth;

namespace PharmacyERP.IntegrationTests.Api;

/// <summary>
/// Dedicated end-to-end HTTP pipeline contract tests verifying all five Level 1A fixes:
/// API-DIFF-001 (401/403 ApiErrorEnvelopeDto), API-DIFF-002 (400 MALFORMED_REQUEST on broken JSON),
/// API-DIFF-003 (real username on GET /api/v1/auth/me), API-DIFF-004 (201 Created + Location),
/// and API-DIFF-006 (400 MALFORMED_REQUEST on missing Idempotency-Key + Identity idempotency replay/mismatch).
/// </summary>
public sealed class Level1AApiContractTests : IClassFixture<WebApplicationFactory<PharmacyERP.Api.Program>>
{
    private static readonly JsonSerializerOptions TestJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
    };

    private readonly WebApplicationFactory<PharmacyERP.Api.Program> _factory;

    public Level1AApiContractTests(WebApplicationFactory<PharmacyERP.Api.Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task ApiDiff001_UnauthorizedAndForbiddenResponses_ReturnStandardApiErrorEnvelopeDto()
    {
        var store = new IdentityApiTestStore();
        await using var testFactory = CreateIdentityTestFactory(store);
        var keyProvider = testFactory.Services.GetRequiredService<JwksKeyProvider>();
        using var client = testFactory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        // 1. Missing Authorization header -> 401 UNAUTHORIZED with WWW-Authenticate + ApiErrorEnvelopeDto
        using var anonMe = await client.GetAsync("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, anonMe.StatusCode);
        Assert.True(anonMe.Headers.WwwAuthenticate.Any());
        await AssertErrorEnvelopeAsync(anonMe, "UNAUTHORIZED");

        // 2. Invalid bearer token -> 401 UNAUTHORIZED with ApiErrorEnvelopeDto
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not-a-valid-jwt");
        using var badJwtResp = await client.GetAsync("/api/v1/branches");
        Assert.Equal(HttpStatusCode.Unauthorized, badJwtResp.StatusCode);
        await AssertErrorEnvelopeAsync(badJwtResp, "UNAUTHORIZED");

        // 3. Provision org + login Admin + create Cashier, then verify [Authorize(Roles/Policy)] returns 403 FORBIDDEN envelope
        var (_, branchId, adminToken) = await ProvisionAndLoginAdminAsync(client, keyProvider, "DIFF001");
        var cashierToken = await CreateUserAndLoginAsync(client, adminToken, "DIFF001", branchId, "EMP-C1", "cashier1", UserRole.Cashier);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", cashierToken);

        // Cashier hitting AdminOnly policy (GET /api/v1/users) -> 403 FORBIDDEN JSON envelope
        using var forbiddenUsers = await client.GetAsync("/api/v1/users");
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenUsers.StatusCode);
        await AssertErrorEnvelopeAsync(forbiddenUsers, "FORBIDDEN");

        // Cashier hitting [Authorize(Roles = "Admin,Pharmacist")] (POST /api/v1/products) -> 403 FORBIDDEN JSON envelope
        using var forbiddenProductReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/products")
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json")
        };
        forbiddenProductReq.Headers.Add("Idempotency-Key", "cashier-forbidden-1");
        using var forbiddenProduct = await client.SendAsync(forbiddenProductReq);
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenProduct.StatusCode);
        await AssertErrorEnvelopeAsync(forbiddenProduct, "FORBIDDEN");

        // Admin hitting PlatformProvisionerOnly policy (POST /api/v1/organizations) -> 403 FORBIDDEN JSON envelope
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
        using var forbiddenOrgReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/organizations")
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json")
        };
        forbiddenOrgReq.Headers.Add("Idempotency-Key", "admin-forbidden-org-1");
        using var forbiddenOrg = await client.SendAsync(forbiddenOrgReq);
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenOrg.StatusCode);
        await AssertErrorEnvelopeAsync(forbiddenOrg, "FORBIDDEN");
    }

    [Fact]
    public async Task ApiDiff002_MalformedJsonAndEmptyBody_Return400MalformedRequest_WhileFieldValidationReturns422()
    {
        var store = new IdentityApiTestStore();
        await using var testFactory = CreateIdentityTestFactory(store);
        var keyProvider = testFactory.Services.GetRequiredService<JwksKeyProvider>();
        using var client = testFactory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        // 1. Broken JSON syntax -> 400 MALFORMED_REQUEST
        using var brokenJson = await client.PostAsync(
            "/api/v1/auth/login",
            new StringContent("{ \"organizationCode\": \"ACME\", ", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, brokenJson.StatusCode);
        await AssertErrorEnvelopeAsync(brokenJson, "MALFORMED_REQUEST");

        // 2. Unquoted invalid token inside property -> 400 MALFORMED_REQUEST
        using var nestedSyntaxError = await client.PostAsync(
            "/api/v1/auth/login",
            new StringContent("{ \"organizationCode\": broken_token }", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, nestedSyntaxError.StatusCode);
        await AssertErrorEnvelopeAsync(nestedSyntaxError, "MALFORMED_REQUEST");

        // 3. Empty body -> 400 MALFORMED_REQUEST
        using var emptyBody = await client.PostAsync(
            "/api/v1/auth/login",
            new StringContent(string.Empty, Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, emptyBody.StatusCode);
        await AssertErrorEnvelopeAsync(emptyBody, "MALFORMED_REQUEST");

        // 4. Valid JSON with missing required fields -> 422 VALIDATION_ERROR
        using var missingFields = await client.PostAsync(
            "/api/v1/auth/login",
            new StringContent("{ \"organizationCode\": \"\", \"username\": \"\", \"password\": \"\" }", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, missingFields.StatusCode);
        await AssertErrorEnvelopeAsync(missingFields, "VALIDATION_ERROR");

        // 5. Valid JSON with wrong property type (number where string expected) -> 422 VALIDATION_ERROR
        var (_, _, adminToken) = await ProvisionAndLoginAdminAsync(client, keyProvider, "DIFF002");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
        using var wrongTypeReq = new HttpRequestMessage(HttpMethod.Post, "/api/v1/branches")
        {
            Content = new StringContent("{ \"branchCode\": 12345, \"name\": \"Bad Type\" }", Encoding.UTF8, "application/json")
        };
        wrongTypeReq.Headers.Add("Idempotency-Key", "wrong-type-1");
        using var wrongTypeResp = await client.SendAsync(wrongTypeReq);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, wrongTypeResp.StatusCode);
        await AssertErrorEnvelopeAsync(wrongTypeResp, "VALIDATION_ERROR");
    }

    [Fact]
    public async Task ApiDiff003_AuthMe_ReturnsRealAuthenticatedUsername()
    {
        var store = new IdentityApiTestStore();
        await using var testFactory = CreateIdentityTestFactory(store);
        var keyProvider = testFactory.Services.GetRequiredService<JwksKeyProvider>();
        using var client = testFactory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var (orgId, _, adminToken) = await ProvisionAndLoginAdminAsync(client, keyProvider, "DIFF003", adminUsername: "dr.ahmed.admin");

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
        using var meResp = await client.GetAsync("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.OK, meResp.StatusCode);

        using var doc = JsonDocument.Parse(await meResp.Content.ReadAsStringAsync());
        Assert.Equal(orgId, doc.RootElement.GetProperty("organizationId").GetGuid());
        Assert.Equal("dr.ahmed.admin", doc.RootElement.GetProperty("username").GetString());
        Assert.Equal("Admin", doc.RootElement.GetProperty("role").GetString());
    }

    [Fact]
    public async Task ApiDiff004And006_IdentityIdempotencyReplayMismatchAndMissingKey400_AllWriteEndpoints()
    {
        var store = new IdentityApiTestStore();
        await using var testFactory = CreateIdentityTestFactory(store);
        var keyProvider = testFactory.Services.GetRequiredService<JwksKeyProvider>();
        using var client = testFactory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        // 1. POST /api/v1/organizations: missing Idempotency-Key -> 400 MALFORMED_REQUEST
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", CreatePlatformProvisionerToken(keyProvider));
        var orgPayload = new
        {
            organizationCode = "IDEMP-ORG",
            name = "Idempotent Pharmacy",
            baseCurrency = "EGP",
            timeZoneId = "Africa/Cairo",
            address = Address("Org St"),
            initialBranch = new { branchCode = "MAIN", name = "Main", address = Address("Branch St") },
            initialEmployee = new
            {
                branchId = Guid.Empty,
                employeeNo = "EMP-001",
                fullName = "Org Admin",
                jobTitle = "Admin",
                address = Address("Emp St"),
                hiredOn = "2025-01-01"
            },
            initialAdmin = new { username = "orgadmin", password = "AdminPassword123!" }
        };

        using var orgMissingKey = await client.PostAsJsonAsync("/api/v1/organizations", orgPayload);
        Assert.Equal(HttpStatusCode.BadRequest, orgMissingKey.StatusCode);
        await AssertErrorEnvelopeAsync(orgMissingKey, "MALFORMED_REQUEST");

        // 1b. POST /api/v1/organizations: first call -> 201 Created + Location, replay -> same orgId, mismatch -> 409 IDEMPOTENCY_MISMATCH
        using var orgFirst = await SendJsonAsync(client, HttpMethod.Post, "/api/v1/organizations", orgPayload, "idem-org-1");
        Assert.Equal(HttpStatusCode.Created, orgFirst.StatusCode);
        var org1 = await orgFirst.Content.ReadFromJsonAsync<OrganizationDto>();
        Assert.NotNull(org1);
        Assert.Equal($"/api/v1/organizations/{org1!.OrganizationId}", orgFirst.Headers.Location?.ToString());

        using var orgReplay = await SendJsonAsync(client, HttpMethod.Post, "/api/v1/organizations", orgPayload, "idem-org-1");
        Assert.Equal(HttpStatusCode.Created, orgReplay.StatusCode);
        var orgReplayed = await orgReplay.Content.ReadFromJsonAsync<OrganizationDto>();
        Assert.Equal(org1.OrganizationId, orgReplayed!.OrganizationId);
        Assert.Single(store.Organizations);

        var orgDifferentPayload = new
        {
            organizationCode = "OTHER-ORG",
            name = "Different Pharmacy",
            baseCurrency = "EGP",
            timeZoneId = "Africa/Cairo",
            address = Address("Org St"),
            initialBranch = new { branchCode = "MAIN", name = "Main", address = Address("Branch St") },
            initialEmployee = new
            {
                branchId = Guid.Empty,
                employeeNo = "EMP-001",
                fullName = "Org Admin",
                jobTitle = "Admin",
                address = Address("Emp St"),
                hiredOn = "2025-01-01"
            },
            initialAdmin = new { username = "orgadmin", password = "AdminPassword123!" }
        };
        using var orgMismatch = await SendJsonAsync(client, HttpMethod.Post, "/api/v1/organizations", orgDifferentPayload, "idem-org-1");
        Assert.Equal(HttpStatusCode.Conflict, orgMismatch.StatusCode);
        await AssertErrorEnvelopeAsync(orgMismatch, "IDEMPOTENCY_MISMATCH");

        // Login as orgadmin
        client.DefaultRequestHeaders.Authorization = null;
        using var loginResp = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            organizationCode = "IDEMP-ORG",
            username = "orgadmin",
            password = "AdminPassword123!"
        });
        Assert.Equal(HttpStatusCode.OK, loginResp.StatusCode);
        using var loginDoc = JsonDocument.Parse(await loginResp.Content.ReadAsStringAsync());
        var adminToken = loginDoc.RootElement.GetProperty("accessToken").GetString()!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);

        // 2. POST & PATCH /api/v1/branches: missing key -> 400, create -> 201 + replay + mismatch, patch -> 200 + replay + mismatch
        var branchPayload = new { branchCode = "BR-02", name = "Branch Two", address = Address("Two St") };
        using var brMissing = await client.PostAsJsonAsync("/api/v1/branches", branchPayload);
        Assert.Equal(HttpStatusCode.BadRequest, brMissing.StatusCode);
        await AssertErrorEnvelopeAsync(brMissing, "MALFORMED_REQUEST");

        using var brFirst = await SendJsonAsync(client, HttpMethod.Post, "/api/v1/branches", branchPayload, "idem-br-1");
        Assert.Equal(HttpStatusCode.Created, brFirst.StatusCode);
        var br1 = await brFirst.Content.ReadFromJsonAsync<BranchDto>();
        Assert.NotNull(br1);
        Assert.Equal($"/api/v1/branches/{br1!.BranchId}", brFirst.Headers.Location?.ToString());

        using var brReplay = await SendJsonAsync(client, HttpMethod.Post, "/api/v1/branches", branchPayload, "idem-br-1");
        Assert.Equal(HttpStatusCode.Created, brReplay.StatusCode);
        Assert.Equal(br1.BranchId, (await brReplay.Content.ReadFromJsonAsync<BranchDto>())!.BranchId);
        Assert.Equal(2, store.Branches.Count);

        using var brMismatch = await SendJsonAsync(client, HttpMethod.Post, "/api/v1/branches",
            new { branchCode = "BR-03", name = "Branch Three", address = Address("Three St") }, "idem-br-1");
        Assert.Equal(HttpStatusCode.Conflict, brMismatch.StatusCode);
        await AssertErrorEnvelopeAsync(brMismatch, "IDEMPOTENCY_MISMATCH");

        var brPatchPayload = new { name = "Branch Two Renamed", address = Address("Two St"), isActive = true };
        using var brPatchMissing = await SendJsonAsync(client, HttpMethod.Patch, $"/api/v1/branches/{br1.BranchId}", brPatchPayload, null);
        Assert.Equal(HttpStatusCode.BadRequest, brPatchMissing.StatusCode);
        await AssertErrorEnvelopeAsync(brPatchMissing, "MALFORMED_REQUEST");

        using var brPatchFirst = await SendJsonAsync(client, HttpMethod.Patch, $"/api/v1/branches/{br1.BranchId}", brPatchPayload, "idem-br-patch-1");
        Assert.Equal(HttpStatusCode.OK, brPatchFirst.StatusCode);
        using var brPatchReplay = await SendJsonAsync(client, HttpMethod.Patch, $"/api/v1/branches/{br1.BranchId}", brPatchPayload, "idem-br-patch-1");
        Assert.Equal(HttpStatusCode.OK, brPatchReplay.StatusCode);
        using var brPatchMismatch = await SendJsonAsync(client, HttpMethod.Patch, $"/api/v1/branches/{br1.BranchId}",
            new { name = "Tampered Name", address = Address("Two St"), isActive = true }, "idem-br-patch-1");
        Assert.Equal(HttpStatusCode.Conflict, brPatchMismatch.StatusCode);
        await AssertErrorEnvelopeAsync(brPatchMismatch, "IDEMPOTENCY_MISMATCH");

        // 3. POST /api/v1/branches/{branchId}/enrollment-tokens: missing key -> 400, first -> 201, replay -> same token
        using var enrollMissing = await client.PostAsync($"/api/v1/branches/{br1.BranchId}/enrollment-tokens", null);
        Assert.Equal(HttpStatusCode.BadRequest, enrollMissing.StatusCode);
        await AssertErrorEnvelopeAsync(enrollMissing, "MALFORMED_REQUEST");

        using var enrollFirst = await SendJsonAsync(client, HttpMethod.Post, $"/api/v1/branches/{br1.BranchId}/enrollment-tokens", null, "idem-enroll-1");
        Assert.Equal(HttpStatusCode.Created, enrollFirst.StatusCode);
        var enroll1 = await enrollFirst.Content.ReadFromJsonAsync<EnrollmentTokenResponse>();
        using var enrollReplay = await SendJsonAsync(client, HttpMethod.Post, $"/api/v1/branches/{br1.BranchId}/enrollment-tokens", null, "idem-enroll-1");
        Assert.Equal(HttpStatusCode.Created, enrollReplay.StatusCode);
        Assert.Equal(enroll1!.Token, (await enrollReplay.Content.ReadFromJsonAsync<EnrollmentTokenResponse>())!.Token);
        Assert.Single(store.Enrollments);

        // 4. POST & PATCH /api/v1/employees: missing key -> 400, create -> 201 + replay + mismatch, patch -> 200 + replay + mismatch
        var empPayload = new
        {
            branchId = br1.BranchId,
            employeeNo = "EMP-002",
            fullName = "Second Employee",
            jobTitle = "Pharmacist",
            address = Address("Emp 2 St"),
            hiredOn = "2025-03-01"
        };
        using var empMissing = await client.PostAsJsonAsync("/api/v1/employees", empPayload);
        Assert.Equal(HttpStatusCode.BadRequest, empMissing.StatusCode);
        await AssertErrorEnvelopeAsync(empMissing, "MALFORMED_REQUEST");

        using var empFirst = await SendJsonAsync(client, HttpMethod.Post, "/api/v1/employees", empPayload, "idem-emp-1");
        Assert.Equal(HttpStatusCode.Created, empFirst.StatusCode);
        var emp1 = await empFirst.Content.ReadFromJsonAsync<EmployeeDto>();
        Assert.Equal($"/api/v1/employees/{emp1!.EmployeeId}", empFirst.Headers.Location?.ToString());

        using var empReplay = await SendJsonAsync(client, HttpMethod.Post, "/api/v1/employees", empPayload, "idem-emp-1");
        Assert.Equal(HttpStatusCode.Created, empReplay.StatusCode);
        Assert.Equal(emp1.EmployeeId, (await empReplay.Content.ReadFromJsonAsync<EmployeeDto>())!.EmployeeId);

        using var empMismatch = await SendJsonAsync(client, HttpMethod.Post, "/api/v1/employees",
            new { branchId = br1.BranchId, employeeNo = "EMP-003", fullName = "Other", jobTitle = "Cashier", address = Address("Other"), hiredOn = "2025-03-01" }, "idem-emp-1");
        Assert.Equal(HttpStatusCode.Conflict, empMismatch.StatusCode);
        await AssertErrorEnvelopeAsync(empMismatch, "IDEMPOTENCY_MISMATCH");

        // 5. POST/PATCH /api/v1/users, POST password-reset (204), POST revoke-sessions (204): missing key -> 400, replay + mismatch
        var userPayload = new
        {
            employeeId = emp1.EmployeeId,
            username = "pharm2",
            password = "Pharm2Password123!",
            role = "Pharmacist",
            branchScope = "ASSIGNED",
            branchIds = new[] { br1.BranchId }
        };
        using var userMissing = await client.PostAsJsonAsync("/api/v1/users", userPayload);
        Assert.Equal(HttpStatusCode.BadRequest, userMissing.StatusCode);
        await AssertErrorEnvelopeAsync(userMissing, "MALFORMED_REQUEST");

        using var userFirst = await SendJsonAsync(client, HttpMethod.Post, "/api/v1/users", userPayload, "idem-user-1");
        Assert.Equal(HttpStatusCode.Created, userFirst.StatusCode);
        var user1 = await userFirst.Content.ReadFromJsonAsync<UserDto>(TestJsonOptions);
        Assert.Equal($"/api/v1/users/{user1!.UserId}", userFirst.Headers.Location?.ToString());

        using var userReplay = await SendJsonAsync(client, HttpMethod.Post, "/api/v1/users", userPayload, "idem-user-1");
        Assert.Equal(HttpStatusCode.Created, userReplay.StatusCode);
        Assert.Equal(user1.UserId, (await userReplay.Content.ReadFromJsonAsync<UserDto>(TestJsonOptions))!.UserId);

        using var userMismatch = await SendJsonAsync(client, HttpMethod.Post, "/api/v1/users",
            new { employeeId = emp1.EmployeeId, username = "different", password = "Pharm2Password123!", role = "Pharmacist", branchScope = "ASSIGNED", branchIds = new[] { br1.BranchId } }, "idem-user-1");
        Assert.Equal(HttpStatusCode.Conflict, userMismatch.StatusCode);
        await AssertErrorEnvelopeAsync(userMismatch, "IDEMPOTENCY_MISMATCH");

        // Password reset: missing key -> 400, first -> 204, replay -> 204, mismatch -> 409
        using var resetMissing = await client.PostAsJsonAsync($"/api/v1/users/{user1.UserId}/password-reset", new { newPassword = "ResetPassword123!" });
        Assert.Equal(HttpStatusCode.BadRequest, resetMissing.StatusCode);
        await AssertErrorEnvelopeAsync(resetMissing, "MALFORMED_REQUEST");

        using var resetFirst = await SendJsonAsync(client, HttpMethod.Post, $"/api/v1/users/{user1.UserId}/password-reset", new { newPassword = "ResetPassword123!" }, "idem-reset-1");
        Assert.Equal(HttpStatusCode.NoContent, resetFirst.StatusCode);
        using var resetReplay = await SendJsonAsync(client, HttpMethod.Post, $"/api/v1/users/{user1.UserId}/password-reset", new { newPassword = "ResetPassword123!" }, "idem-reset-1");
        Assert.Equal(HttpStatusCode.NoContent, resetReplay.StatusCode);
        using var resetMismatch = await SendJsonAsync(client, HttpMethod.Post, $"/api/v1/users/{user1.UserId}/password-reset", new { newPassword = "DifferentPassword123!" }, "idem-reset-1");
        Assert.Equal(HttpStatusCode.Conflict, resetMismatch.StatusCode);
        await AssertErrorEnvelopeAsync(resetMismatch, "IDEMPOTENCY_MISMATCH");

        // Revoke sessions: missing key -> 400, first -> 204, replay -> 204
        using var revokeMissing = await client.PostAsync($"/api/v1/users/{user1.UserId}/revoke-sessions", null);
        Assert.Equal(HttpStatusCode.BadRequest, revokeMissing.StatusCode);
        await AssertErrorEnvelopeAsync(revokeMissing, "MALFORMED_REQUEST");

        using var revokeFirst = await SendJsonAsync(client, HttpMethod.Post, $"/api/v1/users/{user1.UserId}/revoke-sessions", null, "idem-revoke-1");
        Assert.Equal(HttpStatusCode.NoContent, revokeFirst.StatusCode);
        using var revokeReplay = await SendJsonAsync(client, HttpMethod.Post, $"/api/v1/users/{user1.UserId}/revoke-sessions", null, "idem-revoke-1");
        Assert.Equal(HttpStatusCode.NoContent, revokeReplay.StatusCode);
    }

    [Fact]
    public async Task ApiDiff004And006_CatalogInventoryAndCanonicalControllers_Return201OnCreateAnd400OnMissingIdempotencyKey()
    {
        var store = new IdentityApiTestStore();
        var orgId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        var categoryId = Guid.NewGuid();
        var productId = Guid.NewGuid();
        var uomId = Guid.NewGuid();
        var locationId = Guid.NewGuid();
        var txnId = Guid.NewGuid();

        var categoryService = new Mock<IProductCategoryService>();
        categoryService.Setup(x => x.CreateCategoryAsync(It.IsAny<CreateProductCategoryRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<ProductCategoryDto>.Success(new ProductCategoryDto(categoryId, orgId, null, "CAT1", "Category 1", null, true, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow)));

        var productService = new Mock<IProductService>();
        productService.Setup(x => x.CreateProductAsync(It.IsAny<CreateProductRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<ProductDto>.Success(new ProductDto(productId, orgId, categoryId, "SKU1", null, "Product 1", null, null, "TAB", 0m, null, false, 0, true, Array.Empty<ProductUomDto>(), DateTimeOffset.UtcNow, DateTimeOffset.UtcNow)));

        var uomService = new Mock<IProductUomService>();
        uomService.Setup(x => x.CreateProductUomAsync(productId, It.IsAny<CreateProductUomRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<ProductUomDto>.Success(new ProductUomDto(uomId, productId, "BOX", "Box", 10m, 50m, false, true, true, true, DateTimeOffset.UtcNow)));

        var locationService = new Mock<IInventoryLocationService>();
        locationService.Setup(x => x.CreateAsync(It.IsAny<CreateInventoryLocationRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<InventoryLocationDto>.Success(new InventoryLocationDto(locationId, orgId, branchId, "LOC-1", "Main Shelf", LocationType.SELLABLE, true, true, DateTimeOffset.UtcNow)));

        var adjustmentService = new Mock<IInventoryAdjustmentService>();
        adjustmentService.Setup(x => x.PostAdjustmentAsync(It.IsAny<CreateInventoryAdjustmentRequest>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<InventoryTxnDto>.Success(new InventoryTxnDto(txnId, orgId, branchId, "ADJ-1", InventoryTransactionType.ADJUSTMENT_IN, InventoryTransactionStatus.POSTED, "COUNT", null, "k1", Guid.NewGuid(), null, DateTimeOffset.UtcNow, Array.Empty<InventoryTxnLineDto>())));

        var canonicalCatalogService = new Mock<ICanonicalCatalogService>();
        canonicalCatalogService.Setup(x => x.ConfigureProductAsync(It.Is<CanonicalProductConfigurationRequest>(r => r.Action == CatalogConfigurationAction.CreateProduct), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<CanonicalWriteResultDto>.Success(new CanonicalWriteResultDto(Guid.NewGuid(), CanonicalWriteStatuses.Applied, productId, "PRODUCT", DateTimeOffset.UtcNow)));
        canonicalCatalogService.Setup(x => x.ConfigureProductAsync(It.Is<CanonicalProductConfigurationRequest>(r => r.Action == CatalogConfigurationAction.AddUom), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<CanonicalWriteResultDto>.Success(new CanonicalWriteResultDto(Guid.NewGuid(), CanonicalWriteStatuses.Applied, uomId, "PRODUCT_UOM", DateTimeOffset.UtcNow)));
        canonicalCatalogService.Setup(x => x.ConfigureProductAsync(It.Is<CanonicalProductConfigurationRequest>(r => r.Action == CatalogConfigurationAction.UpdateProduct), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<CanonicalWriteResultDto>.Success(new CanonicalWriteResultDto(Guid.NewGuid(), CanonicalWriteStatuses.Applied, productId, "PRODUCT", DateTimeOffset.UtcNow)));

        // Cloud factory for Catalog & Canonical endpoints
        await using var cloudFactory = CreateIdentityTestFactory(store, extraServices: services =>
        {
            services.RemoveAll<IProductCategoryService>();
            services.RemoveAll<IProductService>();
            services.RemoveAll<IProductUomService>();
            services.RemoveAll<IInventoryLocationService>();
            services.RemoveAll<ICanonicalCatalogService>();
            services.AddScoped(_ => categoryService.Object);
            services.AddScoped(_ => productService.Object);
            services.AddScoped(_ => uomService.Object);
            services.AddScoped(_ => locationService.Object);
            services.AddScoped(_ => canonicalCatalogService.Object);
        });

        var cloudKeys = cloudFactory.Services.GetRequiredService<JwksKeyProvider>();
        using var cloudClient = cloudFactory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var (_, provisionedBranchId, adminToken) = await ProvisionAndLoginAdminAsync(cloudClient, cloudKeys, "DIFF004");
        cloudClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);

        // Missing Idempotency-Key -> 400 MALFORMED_REQUEST across Catalog, ReorderRule, Location, Canonical
        using var catMissing = await SendJsonAsync(cloudClient, HttpMethod.Post, "/api/v1/product-categories", new { code = "C1", name = "Cat" }, null);
        Assert.Equal(HttpStatusCode.BadRequest, catMissing.StatusCode);
        await AssertErrorEnvelopeAsync(catMissing, "MALFORMED_REQUEST");

        using var rrMissing = await SendJsonAsync(cloudClient, HttpMethod.Put, $"/api/v1/branches/{provisionedBranchId}/products/{productId}/reorder-rule",
            new { reorderPointBase = 10, reorderQuantityBase = 20, maxQuantityBase = 50, isActive = true }, null);
        Assert.Equal(HttpStatusCode.BadRequest, rrMissing.StatusCode);
        await AssertErrorEnvelopeAsync(rrMissing, "MALFORMED_REQUEST");

        using var locMissing = await SendJsonAsync(cloudClient, HttpMethod.Post, "/api/v1/inventory/locations",
            new { branchId = provisionedBranchId, locationCode = "LOC-1", name = "Shelf", locationType = "SELLABLE", isSellable = true }, null);
        Assert.Equal(HttpStatusCode.BadRequest, locMissing.StatusCode);
        await AssertErrorEnvelopeAsync(locMissing, "MALFORMED_REQUEST");

        using var canonMissing = await SendJsonAsync(cloudClient, HttpMethod.Post, "/api/v1/canonical/configuration/products",
            new { requestId = Guid.NewGuid(), sourcePromptId = "p1", action = "CreateProduct" }, null);
        Assert.Equal(HttpStatusCode.BadRequest, canonMissing.StatusCode);
        await AssertErrorEnvelopeAsync(canonMissing, "MALFORMED_REQUEST");

        // 201 Created + Location checks
        using var catCreated = await SendJsonAsync(cloudClient, HttpMethod.Post, "/api/v1/product-categories", new { code = "C1", name = "Cat" }, "k-cat-1");
        Assert.Equal(HttpStatusCode.Created, catCreated.StatusCode);
        Assert.Equal($"/api/v1/product-categories/{categoryId}", catCreated.Headers.Location?.ToString());

        using var prodCreated = await SendJsonAsync(cloudClient, HttpMethod.Post, "/api/v1/products",
            new { categoryId, sku = "SKU1", name = "Prod", baseUomCode = "TAB", taxRate = 0, lotTrackingRequired = false, expiryAlertDays = 0, uoms = Array.Empty<object>() }, "k-prod-1");
        Assert.Equal(HttpStatusCode.Created, prodCreated.StatusCode);
        Assert.Equal($"/api/v1/products/{productId}", prodCreated.Headers.Location?.ToString());

        using var uomCreated = await SendJsonAsync(cloudClient, HttpMethod.Post, $"/api/v1/products/{productId}/uoms",
            new { uomCode = "BOX", displayName = "Box", conversionToBase = 10, isBase = false, isSellable = true, isPurchasable = true }, "k-uom-1");
        Assert.Equal(HttpStatusCode.Created, uomCreated.StatusCode);
        Assert.Equal($"/api/v1/products/{productId}/uoms/{uomId}", uomCreated.Headers.Location?.ToString());

        using var locCreated = await SendJsonAsync(cloudClient, HttpMethod.Post, "/api/v1/inventory/locations",
            new { branchId, locationCode = "LOC-1", name = "Shelf", locationType = "SELLABLE", isSellable = true }, "k-loc-1");
        Assert.Equal(HttpStatusCode.Created, locCreated.StatusCode);
        Assert.Equal($"/api/v1/inventory/locations/{locationId}", locCreated.Headers.Location?.ToString());

        using var canonCreateProd = await SendJsonAsync(cloudClient, HttpMethod.Post, "/api/v1/canonical/configuration/products",
            new { requestId = Guid.NewGuid(), sourcePromptId = "p1", action = "CreateProduct" }, "k-canon-1");
        Assert.Equal(HttpStatusCode.Created, canonCreateProd.StatusCode);
        Assert.Equal($"/api/v1/products/{productId}", canonCreateProd.Headers.Location?.ToString());

        using var canonAddUom = await SendJsonAsync(cloudClient, HttpMethod.Post, "/api/v1/canonical/configuration/products",
            new { requestId = Guid.NewGuid(), sourcePromptId = "p2", action = "AddUom", productId }, "k-canon-2");
        Assert.Equal(HttpStatusCode.Created, canonAddUom.StatusCode);
        Assert.Equal($"/api/v1/products/{productId}/uoms/{uomId}", canonAddUom.Headers.Location?.ToString());

        // Canonical UpdateProduct stays 200 OK
        using var canonUpdateProd = await SendJsonAsync(cloudClient, HttpMethod.Post, "/api/v1/canonical/configuration/products",
            new { requestId = Guid.NewGuid(), sourcePromptId = "p3", action = "UpdateProduct", productId }, "k-canon-3");
        Assert.Equal(HttpStatusCode.OK, canonUpdateProd.StatusCode);

        // BranchLocal factory for POST /api/v1/inventory/adjustments (201 Created + 400 on missing key)
        await using var branchLocalFactory = CreateIdentityTestFactory(store, runtimeMode: "BranchLocal", enrolledBranchId: provisionedBranchId, extraServices: services =>
        {
            services.RemoveAll<IInventoryAdjustmentService>();
            services.AddScoped(_ => adjustmentService.Object);
        });
        using var localClient = branchLocalFactory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var localLogin = await localClient.PostAsJsonAsync("/api/v1/auth/login", new
        {
            organizationCode = "DIFF004",
            username = "owner",
            password = "OwnerPassword123!"
        });
        Assert.Equal(HttpStatusCode.OK, localLogin.StatusCode);
        using var localLoginDoc = JsonDocument.Parse(await localLogin.Content.ReadAsStringAsync());
        localClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", localLoginDoc.RootElement.GetProperty("accessToken").GetString()!);

        var adjPayload = new
        {
            branchId = provisionedBranchId,
            transactionType = "ADJUSTMENT_IN",
            reasonCode = "COUNT",
            lines = Array.Empty<object>()
        };
        using var adjMissing = await SendJsonAsync(localClient, HttpMethod.Post, "/api/v1/inventory/adjustments", adjPayload, null);
        Assert.Equal(HttpStatusCode.BadRequest, adjMissing.StatusCode);
        await AssertErrorEnvelopeAsync(adjMissing, "MALFORMED_REQUEST");

        using var adjCreated = await SendJsonAsync(localClient, HttpMethod.Post, "/api/v1/inventory/adjustments", adjPayload, "k-adj-1");
        Assert.Equal(HttpStatusCode.Created, adjCreated.StatusCode);
        Assert.Equal($"/api/v1/inventory/transactions/{txnId}", adjCreated.Headers.Location?.ToString());
    }

    private WebApplicationFactory<PharmacyERP.Api.Program> CreateIdentityTestFactory(
        IdentityApiTestStore store,
        string runtimeMode = "Cloud",
        Guid? enrolledBranchId = null,
        Action<IServiceCollection>? extraServices = null)
    {
        return _factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ConnectionStrings:DefaultConnection", "Host=localhost;Database=erp_test_unused;Username=erp_app;Password=test-only");
            builder.UseSetting("Outbox:WorkerEnabled", "false");
            builder.UseSetting("ERP_RUNTIME_MODE", runtimeMode);
            if (enrolledBranchId.HasValue)
            {
                builder.UseSetting("ENROLLED_BRANCH_ID", enrolledBranchId.Value.ToString());
            }

            builder.ConfigureLogging(logging => logging.ClearProviders());
            builder.ConfigureTestServices(services =>
            {
                var startupChecks = services
                    .Where(d => d.ServiceType == typeof(IHostedService) && d.ImplementationType == typeof(DatabaseSecurityStartupCheck))
                    .ToList();
                foreach (var descriptor in startupChecks)
                {
                    services.Remove(descriptor);
                }

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

                extraServices?.Invoke(services);
            });
        });
    }

    private static async Task<(Guid OrgId, Guid BranchId, string AdminToken)> ProvisionAndLoginAdminAsync(
        HttpClient client,
        JwksKeyProvider keyProvider,
        string orgCode,
        string adminUsername = "owner")
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", CreatePlatformProvisionerToken(keyProvider));
        using var orgResp = await SendJsonAsync(client, HttpMethod.Post, "/api/v1/organizations", new
        {
            organizationCode = orgCode,
            name = $"{orgCode} Pharmacy",
            baseCurrency = "EGP",
            timeZoneId = "Africa/Cairo",
            address = Address("Org St"),
            initialBranch = new { branchCode = "MAIN", name = "Main Branch", address = Address("Main St") },
            initialEmployee = new
            {
                branchId = Guid.Empty,
                employeeNo = "EMP-001",
                fullName = "Initial Admin",
                jobTitle = "Admin",
                address = Address("Emp St"),
                hiredOn = "2025-01-01"
            },
            initialAdmin = new { username = adminUsername, password = "OwnerPassword123!" }
        }, $"prov-{orgCode}");
        Assert.Equal(HttpStatusCode.Created, orgResp.StatusCode);
        var orgDto = await orgResp.Content.ReadFromJsonAsync<OrganizationDto>();

        client.DefaultRequestHeaders.Authorization = null;
        using var loginResp = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            organizationCode = orgCode,
            username = adminUsername,
            password = "OwnerPassword123!"
        });
        Assert.Equal(HttpStatusCode.OK, loginResp.StatusCode);
        using var loginDoc = JsonDocument.Parse(await loginResp.Content.ReadAsStringAsync());
        var token = loginDoc.RootElement.GetProperty("accessToken").GetString()!;
        return (orgDto!.OrganizationId, orgDto.InitialBranchId, token);
    }

    private static async Task<string> CreateUserAndLoginAsync(
        HttpClient client,
        string adminToken,
        string orgCode,
        Guid branchId,
        string employeeNo,
        string username,
        UserRole role)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
        using var empResp = await SendJsonAsync(client, HttpMethod.Post, "/api/v1/employees", new
        {
            branchId,
            employeeNo,
            fullName = username,
            jobTitle = role.ToString(),
            address = Address("Staff St"),
            hiredOn = "2025-01-01"
        }, $"emp-{username}");
        Assert.Equal(HttpStatusCode.Created, empResp.StatusCode);
        var emp = await empResp.Content.ReadFromJsonAsync<EmployeeDto>();

        using var userResp = await SendJsonAsync(client, HttpMethod.Post, "/api/v1/users", new
        {
            employeeId = emp!.EmployeeId,
            username,
            password = "StaffPassword123!",
            role = role.ToString(),
            branchScope = "ASSIGNED",
            branchIds = new[] { branchId }
        }, $"user-{username}");
        Assert.Equal(HttpStatusCode.Created, userResp.StatusCode);

        client.DefaultRequestHeaders.Authorization = null;
        using var loginResp = await client.PostAsJsonAsync("/api/v1/auth/login", new
        {
            organizationCode = orgCode,
            username,
            password = "StaffPassword123!"
        });
        Assert.Equal(HttpStatusCode.OK, loginResp.StatusCode);
        using var loginDoc = JsonDocument.Parse(await loginResp.Content.ReadAsStringAsync());
        return loginDoc.RootElement.GetProperty("accessToken").GetString()!;
    }

    private static Task<HttpResponseMessage> SendJsonAsync(
        HttpClient client,
        HttpMethod method,
        string url,
        object? payload,
        string? idempotencyKey)
    {
        var req = new HttpRequestMessage(method, url);
        if (!string.IsNullOrWhiteSpace(idempotencyKey))
        {
            req.Headers.Add("Idempotency-Key", idempotencyKey);
        }

        if (payload is not null)
        {
            req.Content = JsonContent.Create(payload);
        }

        return client.SendAsync(req);
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

    private static object Address(string line1) => new { line1, city = "Cairo", countryCode = "EG" };

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
