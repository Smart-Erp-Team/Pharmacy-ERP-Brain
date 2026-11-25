using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Text;
using Moq;
using PharmacyERP.Application.Features.Catalog.DTOs;
using PharmacyERP.Application.Features.Catalog.Interfaces;
using PharmacyERP.Application.Features.Inventory.DTOs;
using PharmacyERP.Application.Features.Inventory.Interfaces;
using PharmacyERP.Infrastructure.Auth;

namespace PharmacyERP.IntegrationTests.Api;

/// <summary>
/// End-to-end HTTP contract regression tests for Stage 1 frontend-blocking defects:
/// true partial PATCH semantics, 500-preventing 422 validation guards, snake_case error.details,
/// runtime-mode &amp; auth/role consistency, product UOM include_inactive, inventory summary endpoint,
/// outbox enrollment cursor, and Swagger JWT Bearer security metadata.
/// </summary>
public sealed class Stage1FrontendContractFixesTests : IClassFixture<WebApplicationFactory<PharmacyERP.Api.Program>>
{
    private readonly WebApplicationFactory<PharmacyERP.Api.Program> _factory;

    public Stage1FrontendContractFixesTests(WebApplicationFactory<PharmacyERP.Api.Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task PartialPatch_OnBranchesUsersEmployeesAndCategories_SucceedsWithMinimalPayload_AndPreservesOmittedFields()
    {
        var store = new IdentityApiTestStore();
        var orgIdHolder = new Guid[1];
        ProductCategory? storedCategory = null;

        var categoryRepoMock = new Mock<IProductCategoryRepository>();
        categoryRepoMock.Setup(r => r.GetByIdAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid _, Guid id, CancellationToken _) => storedCategory is not null && storedCategory.CategoryId == id ? storedCategory : null);

        await using var factory = CreateTestFactory(store, extraServices: services =>
        {
            services.RemoveAll<IProductCategoryRepository>();
            services.AddScoped(_ => categoryRepoMock.Object);
        });
        var keyProvider = factory.Services.GetRequiredService<JwksKeyProvider>();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var (orgId, branch1Id, adminToken) = await ProvisionAndLoginAdminAsync(client, keyProvider, "PATCHORG");
        orgIdHolder[0] = orgId;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);

        // Create a second branch so we can deactivate it cleanly
        using var branch2Resp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/branches", """
        {
            "branch_code": "BR2",
            "name": "Second Branch",
            "address": { "line1": "2 Second St", "city": "Giza", "country_code": "EG" }
        }
        """, "create-br2"));
        Assert.Equal(HttpStatusCode.Created, branch2Resp.StatusCode);
        using var branch2Doc = JsonDocument.Parse(await branch2Resp.Content.ReadAsStringAsync());
        var branch2Id = branch2Doc.RootElement.GetProperty("branch_id").GetGuid();

        // 1. Minimal PATCH on /api/v1/branches/{id}
        using var patchBranchResp = await client.SendAsync(
            RawJsonRequest(HttpMethod.Patch, $"/api/v1/branches/{branch2Id}", """{ "is_active": false }""", "patch-br2"));
        Assert.Equal(HttpStatusCode.OK, patchBranchResp.StatusCode);
        using var patchBranchDoc = JsonDocument.Parse(await patchBranchResp.Content.ReadAsStringAsync());
        Assert.Equal("Second Branch", patchBranchDoc.RootElement.GetProperty("name").GetString());
        Assert.Equal("Giza", patchBranchDoc.RootElement.GetProperty("address").GetProperty("city").GetString());
        Assert.False(patchBranchDoc.RootElement.GetProperty("is_active").GetBoolean());

        // Create employee & user on branch1
        using var empResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/employees", $$"""
        {
            "branch_id": "{{branch1Id}}",
            "employee_no": "EMP-PATCH",
            "full_name": "Patch Target Employee",
            "email": "patch.emp@example.com",
            "phone": "+201000000001",
            "job_title": "Pharmacist",
            "address": { "line1": "10 Nile St", "city": "Cairo", "country_code": "EG" },
            "hired_on": "2025-05-01"
        }
        """, "create-emp-patch"));
        Assert.Equal(HttpStatusCode.Created, empResp.StatusCode);
        using var empDoc = JsonDocument.Parse(await empResp.Content.ReadAsStringAsync());
        var employeeId = empDoc.RootElement.GetProperty("employee_id").GetGuid();

        using var userResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/users", $$"""
        {
            "employee_id": "{{employeeId}}",
            "username": "patch.user",
            "password": "StrongPassword123!",
            "role": "Pharmacist",
            "branch_scope": "ASSIGNED",
            "branch_ids": ["{{branch1Id}}"]
        }
        """, "create-user-patch"));
        Assert.Equal(HttpStatusCode.Created, userResp.StatusCode);
        using var userDoc = JsonDocument.Parse(await userResp.Content.ReadAsStringAsync());
        var userId = userDoc.RootElement.GetProperty("user_id").GetGuid();

        // 2. Minimal PATCH on /api/v1/users/{id} preserves role, branch_scope, AND branch_ids
        using var patchUserResp = await client.SendAsync(
            RawJsonRequest(HttpMethod.Patch, $"/api/v1/users/{userId}", """{ "is_active": false }""", "patch-user-1"));
        Assert.Equal(HttpStatusCode.OK, patchUserResp.StatusCode);
        using var patchUserDoc = JsonDocument.Parse(await patchUserResp.Content.ReadAsStringAsync());
        Assert.False(patchUserDoc.RootElement.GetProperty("is_active").GetBoolean());
        Assert.Equal("Pharmacist", patchUserDoc.RootElement.GetProperty("role").GetString());
        Assert.Equal("ASSIGNED", patchUserDoc.RootElement.GetProperty("branch_scope").GetString());
        var returnedBranches = patchUserDoc.RootElement.GetProperty("branch_ids").EnumerateArray().Select(x => x.GetGuid()).ToArray();
        Assert.Equal(new[] { branch1Id }, returnedBranches);

        // 3. Minimal PATCH on /api/v1/employees/{id} preserves full_name, email, phone, job_title, address
        using var patchEmpResp = await client.SendAsync(
            RawJsonRequest(HttpMethod.Patch, $"/api/v1/employees/{employeeId}", """{ "is_active": false }""", "patch-emp-1"));
        Assert.Equal(HttpStatusCode.OK, patchEmpResp.StatusCode);
        using var patchEmpDoc = JsonDocument.Parse(await patchEmpResp.Content.ReadAsStringAsync());
        Assert.False(patchEmpDoc.RootElement.GetProperty("is_active").GetBoolean());
        Assert.Equal("Patch Target Employee", patchEmpDoc.RootElement.GetProperty("full_name").GetString());
        Assert.Equal("patch.emp@example.com", patchEmpDoc.RootElement.GetProperty("email").GetString());
        Assert.Equal("Pharmacist", patchEmpDoc.RootElement.GetProperty("job_title").GetString());
        Assert.Equal("10 Nile St", patchEmpDoc.RootElement.GetProperty("address").GetProperty("line1").GetString());

        // 4. Minimal PATCH on /api/v1/product-categories/{id} preserves name, description, and parent_category_id
        var parentCatId = Guid.NewGuid();
        storedCategory = ProductCategory.Create(orgId, "CHILD-1", "Child Category", "Keep this description", parentCatId);
        using var patchCatResp = await client.SendAsync(
            RawJsonRequest(HttpMethod.Patch, $"/api/v1/product-categories/{storedCategory.CategoryId}", """{ "is_active": false }""", "patch-cat-1"));
        Assert.Equal(HttpStatusCode.OK, patchCatResp.StatusCode);
        using var patchCatDoc = JsonDocument.Parse(await patchCatResp.Content.ReadAsStringAsync());
        Assert.False(patchCatDoc.RootElement.GetProperty("is_active").GetBoolean());
        Assert.Equal("Child Category", patchCatDoc.RootElement.GetProperty("name").GetString());
        Assert.Equal("Keep this description", patchCatDoc.RootElement.GetProperty("description").GetString());
        Assert.Equal(parentCatId, patchCatDoc.RootElement.GetProperty("parent_category_id").GetGuid());
    }

    [Fact]
    public async Task ValidationErrorDetails_UseSnakeCaseFieldNames_AndEmptyBranchOrInvalidPagingNever500()
    {
        var store = new IdentityApiTestStore();
        await using var factory = CreateTestFactory(store);
        var keyProvider = factory.Services.GetRequiredService<JwksKeyProvider>();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var (_, branchId, adminToken) = await ProvisionAndLoginAdminAsync(client, keyProvider, "VALORG");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);

        // 1. ModelState validation error emits snake_case field paths (not PascalCase)
        using var invalidLoginResp = await client.PostAsync(
            "/api/v1/auth/login",
            new StringContent("""{ "organization_code": "", "username": "", "password": "" }""", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, invalidLoginResp.StatusCode);
        var loginErrorFields = await AssertValidationErrorAndGetFieldsAsync(invalidLoginResp);
        Assert.Contains("organization_code", loginErrorFields);
        Assert.Contains("username", loginErrorFields);
        Assert.Contains("password", loginErrorFields);

        // 2. CreateEmployee with empty branch_id returns 422 with field "branch_id"
        using var emptyEmpBranchResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/employees", $$"""
        {
            "branch_id": "{{Guid.Empty}}",
            "employee_no": "EMP-BAD",
            "full_name": "Bad Branch",
            "job_title": "Cashier",
            "address": { "line1": "1 St", "city": "Cairo", "country_code": "EG" }
        }
        """, "emp-bad-br"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, emptyEmpBranchResp.StatusCode);
        Assert.Contains("branch_id", await AssertValidationErrorAndGetFieldsAsync(emptyEmpBranchResp));

        // 3. Inventory GET endpoints reject empty branch_id / invalid page / page_size with 422 (never 500 or 200)
        using var badBalancesResp = await client.GetAsync("/api/v1/inventory/balances");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, badBalancesResp.StatusCode);
        Assert.Contains("branch_id", await AssertValidationErrorAndGetFieldsAsync(badBalancesResp));

        using var badLocationsResp = await client.GetAsync("/api/v1/inventory/locations?page=0&page_size=500");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, badLocationsResp.StatusCode);
        var locFields = await AssertValidationErrorAndGetFieldsAsync(badLocationsResp);
        Assert.Contains("branch_id", locFields);
        Assert.Contains("page", locFields);
        Assert.Contains("page_size", locFields);

        using var badBatchesResp = await client.GetAsync("/api/v1/inventory/batches?page=0&page_size=999");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, badBatchesResp.StatusCode);
        var batchFields = await AssertValidationErrorAndGetFieldsAsync(badBatchesResp);
        Assert.Contains("page", batchFields);
        Assert.Contains("page_size", batchFields);

        using var badTxnsResp = await client.GetAsync($"/api/v1/inventory/transactions?branch_id={branchId}&page=-1&page_size=0");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, badTxnsResp.StatusCode);
        var txnFields = await AssertValidationErrorAndGetFieldsAsync(badTxnsResp);
        Assert.Contains("page", txnFields);
        Assert.Contains("page_size", txnFields);

        using var badSummaryResp = await client.GetAsync("/api/v1/inventory/summary");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, badSummaryResp.StatusCode);
        var summaryFields = await AssertValidationErrorAndGetFieldsAsync(badSummaryResp);
        Assert.Contains("branch_id", summaryFields);
        Assert.Contains("product_id", summaryFields);

        // 4. Oversized inventory location code/name returns 422 with snake_case details (never 500)
        using var badLocCreateResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/inventory/locations", $$"""
        {
            "branch_id": "{{branchId}}",
            "location_code": "{{new string('L', 31)}}",
            "name": "{{new string('N', 101)}}",
            "location_type": "SELLABLE",
            "is_sellable": true
        }
        """, "loc-oversized-1"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, badLocCreateResp.StatusCode);
        var locCreateFields = await AssertValidationErrorAndGetFieldsAsync(badLocCreateResp);
        Assert.Contains("location_code", locCreateFields);
        Assert.Contains("name", locCreateFields);
    }

    [Fact]
    public async Task BranchLocal_AuthScopeCapabilitiesAndCloudGuards_AreConsistent_AndReversalWorksWithoutLines()
    {
        var store = new IdentityApiTestStore();
        await using var cloudFactory = CreateTestFactory(store);
        var keyProvider = cloudFactory.Services.GetRequiredService<JwksKeyProvider>();
        using var cloudClient = cloudFactory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var (orgId, branchId, adminToken) = await ProvisionAndLoginAdminAsync(cloudClient, keyProvider, "BLORG");

        // Advance OutboxEventCursor and test enrollment returns real initial_sync_cursor
        var cursor = store.OutboxCursors.Single(c => c.OrganizationId == orgId);
        cursor.AllocateNextSequence(DateTimeOffset.UtcNow);
        cursor.AllocateNextSequence(DateTimeOffset.UtcNow);
        cursor.AllocateNextSequence(DateTimeOffset.UtcNow);

        cloudClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
        using var issueReq = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/branches/{branchId}/enrollment-tokens");
        issueReq.Headers.Add("Idempotency-Key", "enroll-issue-1");
        using var issueResp = await cloudClient.SendAsync(issueReq);
        Assert.Equal(HttpStatusCode.Created, issueResp.StatusCode);
        using var issueDoc = JsonDocument.Parse(await issueResp.Content.ReadAsStringAsync());
        var enrollmentToken = issueDoc.RootElement.GetProperty("token").GetString()!;

        cloudClient.DefaultRequestHeaders.Authorization = null;
        using var redeemResp = await cloudClient.PostAsync(
            "/api/v1/branch-enrollment",
            new StringContent($$"""{ "token": "{{enrollmentToken}}" }""", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.OK, redeemResp.StatusCode);
        using var redeemDoc = JsonDocument.Parse(await redeemResp.Content.ReadAsStringAsync());
        Assert.Equal(3L, redeemDoc.RootElement.GetProperty("initial_sync_cursor").GetInt64());

        // Cloud capabilities report supported reads & writes
        using var cloudCapResp = await cloudClient.GetAsync("/api/v1/canonical/capabilities");
        Assert.Equal(HttpStatusCode.OK, cloudCapResp.StatusCode);
        using var cloudCapDoc = JsonDocument.Parse(await cloudCapResp.Content.ReadAsStringAsync());
        Assert.Equal("Cloud", cloudCapDoc.RootElement.GetProperty("runtime_mode").GetString());
        Assert.Equal(2, cloudCapDoc.RootElement.GetProperty("supported_reads").GetArrayLength());
        Assert.Equal(2, cloudCapDoc.RootElement.GetProperty("supported_writes").GetArrayLength());

        // Start BranchLocal runtime for the same store
        var txnRepoMock = new Mock<IInventoryTxnRepository>();
        var originalTxn = InventoryTxn.CreatePosted(orgId, branchId, "ADJ-ORIG", InventoryTransactionType.ADJUSTMENT_IN, "orig-key", Guid.NewGuid(), DateTimeOffset.UtcNow);
        txnRepoMock.Setup(r => r.GetByIdWithLinesAsync(orgId, branchId, originalTxn.InventoryTxnId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(originalTxn);
        txnRepoMock.Setup(r => r.HasPostedReversalAsync(orgId, branchId, originalTxn.InventoryTxnId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var stockRepoMock = new Mock<IStockBalanceRepository>();
        stockRepoMock.Setup(r => r.GetOrCreateForUpdateBatchAsync(orgId, It.IsAny<IReadOnlyCollection<(Guid, Guid)>>(), It.IsAny<DateTimeOffset>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<(Guid, Guid), StockBalance>());

        await using var localFactory = CreateTestFactory(store, runtimeMode: "BranchLocal", enrolledBranchId: branchId, extraServices: services =>
        {
            services.RemoveAll<IInventoryTxnRepository>();
            services.RemoveAll<IStockBalanceRepository>();
            services.RemoveAll<IInventoryBatchRepository>();
            services.RemoveAll<IInventoryLocationRepository>();
            services.AddScoped(_ => txnRepoMock.Object);
            services.AddScoped(_ => stockRepoMock.Object);
            services.AddScoped(_ => new Mock<IInventoryBatchRepository>().Object);
            services.AddScoped(_ => new Mock<IInventoryLocationRepository>().Object);
        });
        using var localClient = localFactory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        // 1. BranchLocal capabilities return empty arrays
        using var localCapResp = await localClient.GetAsync("/api/v1/canonical/capabilities");
        Assert.Equal(HttpStatusCode.OK, localCapResp.StatusCode);
        using var localCapDoc = JsonDocument.Parse(await localCapResp.Content.ReadAsStringAsync());
        Assert.Equal("BranchLocal", localCapDoc.RootElement.GetProperty("runtime_mode").GetString());
        Assert.Empty(localCapDoc.RootElement.GetProperty("supported_reads").EnumerateArray());
        Assert.Empty(localCapDoc.RootElement.GetProperty("supported_writes").EnumerateArray());

        // 2. BranchLocal login emits user.branch_scope == "ASSIGNED", matching /auth/me
        using var localLoginResp = await localClient.PostAsync(
            "/api/v1/auth/login",
            new StringContent("""{"organization_code":"BLORG","username":"owner","password":"OwnerPassword123!"}""", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.OK, localLoginResp.StatusCode);
        using var localLoginDoc = JsonDocument.Parse(await localLoginResp.Content.ReadAsStringAsync());
        var localToken = localLoginDoc.RootElement.GetProperty("access_token").GetString()!;
        Assert.Equal("ASSIGNED", localLoginDoc.RootElement.GetProperty("user").GetProperty("branch_scope").GetString());

        localClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", localToken);
        using var localMeResp = await localClient.GetAsync("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.OK, localMeResp.StatusCode);
        using var localMeDoc = JsonDocument.Parse(await localMeResp.Content.ReadAsStringAsync());
        Assert.Equal("ASSIGNED", localMeDoc.RootElement.GetProperty("branch_scope").GetString());

        // 3. BranchLocal blocks Cloud-only Identity write & enrollment endpoints with 404 NOT_FOUND
        foreach (var (method, url) in new[]
        {
            (HttpMethod.Post, "/api/v1/branches"),
            (HttpMethod.Patch, $"/api/v1/branches/{branchId}"),
            (HttpMethod.Post, $"/api/v1/branches/{branchId}/enrollment-tokens"),
            (HttpMethod.Post, "/api/v1/branch-enrollment"),
            (HttpMethod.Post, "/api/v1/users"),
            (HttpMethod.Post, "/api/v1/employees")
        })
        {
            using var blockedResp = await localClient.SendAsync(RawJsonRequest(method, url, "{}", "bl-block-key"));
            Assert.Equal(HttpStatusCode.NotFound, blockedResp.StatusCode);
            using var blockedDoc = JsonDocument.Parse(await blockedResp.Content.ReadAsStringAsync());
            Assert.Equal("NOT_FOUND", blockedDoc.RootElement.GetProperty("error").GetProperty("code").GetString());
        }

        // 4. REVERSAL succeeds without sending "lines" or "reason_code"
        using var reversalResp = await localClient.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/inventory/adjustments", $$"""
        {
            "branch_id": "{{branchId}}",
            "transaction_type": "REVERSAL",
            "reverses_inventory_txn_id": "{{originalTxn.InventoryTxnId}}"
        }
        """, "rev-minimal-1"));
        Assert.Equal(HttpStatusCode.Created, reversalResp.StatusCode);
    }

    [Fact]
    public async Task ProductUomsIncludeInactive_InventorySummary_MultiBranchEmployees_AndSwaggerBearerSecurity_Work()
    {
        var store = new IdentityApiTestStore();
        var productId = Guid.NewGuid();
        var capturedIncludeInactive = new List<bool>();

        var uomServiceMock = new Mock<IProductUomService>();
        uomServiceMock.Setup(s => s.GetProductUomsAsync(productId, It.IsAny<bool>(), It.IsAny<CancellationToken>()))
            .Callback<Guid, bool, CancellationToken>((_, includeInactive, _) => capturedIncludeInactive.Add(includeInactive))
            .ReturnsAsync((Guid pid, bool includeInactive, CancellationToken _) =>
            {
                var list = new List<ProductUomDto>
                {
                    new(Guid.NewGuid(), pid, "TAB", "Tablet", 1m, 5m, true, true, true, true, DateTimeOffset.UtcNow)
                };
                if (includeInactive)
                {
                    list.Add(new(Guid.NewGuid(), pid, "OLD", "Old Pack", 10m, 45m, false, false, false, false, DateTimeOffset.UtcNow));
                }

                return Result<IReadOnlyList<ProductUomDto>>.Success(list);
            });

        var queryServiceMock = new Mock<IInventoryQueryService>();
        queryServiceMock.Setup(s => s.GetProductSummaryAsync(It.IsAny<Guid>(), productId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid bid, Guid pid, CancellationToken _) => Result<InventorySummaryDto>.Success(
                new InventorySummaryDto(Guid.NewGuid(), bid, pid, "TAB", 50m, 40m, 7.25m, Array.Empty<StockBalanceDto>())));

        await using var factory = CreateTestFactory(store, extraServices: services =>
        {
            services.RemoveAll<IProductUomService>();
            services.RemoveAll<IInventoryQueryService>();
            services.AddScoped(_ => uomServiceMock.Object);
            services.AddScoped(_ => queryServiceMock.Object);
        });
        var keyProvider = factory.Services.GetRequiredService<JwksKeyProvider>();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var (_, branch1Id, adminToken) = await ProvisionAndLoginAdminAsync(client, keyProvider, "PARITYORG");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);

        // 1. GET /api/v1/products/{id}/uoms defaults to include_inactive=false, and supports include_inactive=true
        using var activeUomsResp = await client.GetAsync($"/api/v1/products/{productId}/uoms");
        Assert.Equal(HttpStatusCode.OK, activeUomsResp.StatusCode);
        using var activeUomsDoc = JsonDocument.Parse(await activeUomsResp.Content.ReadAsStringAsync());
        Assert.Single(activeUomsDoc.RootElement.EnumerateArray());

        using var allUomsResp = await client.GetAsync($"/api/v1/products/{productId}/uoms?include_inactive=true");
        Assert.Equal(HttpStatusCode.OK, allUomsResp.StatusCode);
        using var allUomsDoc = JsonDocument.Parse(await allUomsResp.Content.ReadAsStringAsync());
        Assert.Equal(2, allUomsDoc.RootElement.EnumerateArray().Count());
        Assert.Equal(new[] { false, true }, capturedIncludeInactive);

        // 2. GET /api/v1/inventory/summary exposes InventorySummaryDto in snake_case
        using var summaryResp = await client.GetAsync($"/api/v1/inventory/summary?branch_id={branch1Id}&product_id={productId}");
        Assert.Equal(HttpStatusCode.OK, summaryResp.StatusCode);
        using var summaryDoc = JsonDocument.Parse(await summaryResp.Content.ReadAsStringAsync());
        Assert.Equal(50m, summaryDoc.RootElement.GetProperty("total_on_hand_qty_base").GetDecimal());
        Assert.Equal(40m, summaryDoc.RootElement.GetProperty("total_available_qty_base").GetDecimal());
        Assert.Equal(7.25m, summaryDoc.RootElement.GetProperty("weighted_average_unit_cost_base").GetDecimal());

        // 3. Multi-branch ASSIGNED user calling GET /api/v1/employees without branch_id succeeds
        using var br2Resp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/branches", """
        {
            "branch_code": "BR2",
            "name": "Branch 2",
            "address": { "line1": "2 St", "city": "Cairo", "country_code": "EG" }
        }
        """, "parity-br2"));
        Assert.Equal(HttpStatusCode.Created, br2Resp.StatusCode);
        using var br2Doc = JsonDocument.Parse(await br2Resp.Content.ReadAsStringAsync());
        var branch2Id = br2Doc.RootElement.GetProperty("branch_id").GetGuid();

        using var emp2Resp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/employees", $$"""
        {
            "branch_id": "{{branch2Id}}",
            "employee_no": "EMP-BR2",
            "full_name": "Multi Branch Pharmacist",
            "job_title": "Pharmacist",
            "address": { "line1": "2 St", "city": "Cairo", "country_code": "EG" }
        }
        """, "parity-emp2"));
        Assert.Equal(HttpStatusCode.Created, emp2Resp.StatusCode);
        using var emp2Doc = JsonDocument.Parse(await emp2Resp.Content.ReadAsStringAsync());
        var emp2Id = emp2Doc.RootElement.GetProperty("employee_id").GetGuid();

        using var multiUserResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/users", $$"""
        {
            "employee_id": "{{emp2Id}}",
            "username": "multi.pharm",
            "password": "StrongPassword123!",
            "role": "Pharmacist",
            "branch_scope": "ASSIGNED",
            "branch_ids": ["{{branch1Id}}", "{{branch2Id}}"]
        }
        """, "parity-multi-user"));
        Assert.Equal(HttpStatusCode.Created, multiUserResp.StatusCode);

        var multiToken = await LoginAsync(client, "PARITYORG", "multi.pharm", "StrongPassword123!");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", multiToken);
        using var multiEmpListResp = await client.GetAsync("/api/v1/employees");
        Assert.Equal(HttpStatusCode.OK, multiEmpListResp.StatusCode);
        using var multiEmpListDoc = JsonDocument.Parse(await multiEmpListResp.Content.ReadAsStringAsync());
        Assert.Equal(2, multiEmpListDoc.RootElement.GetProperty("total_count").GetInt32());

        // 4. Swagger OpenAPI document contains Bearer JWT security definition
        client.DefaultRequestHeaders.Authorization = null;
        using var swaggerResp = await client.GetAsync("/swagger/v1/swagger.json");
        Assert.Equal(HttpStatusCode.OK, swaggerResp.StatusCode);
        using var swaggerDoc = JsonDocument.Parse(await swaggerResp.Content.ReadAsStringAsync());
        var bearerScheme = swaggerDoc.RootElement
            .GetProperty("components")
            .GetProperty("securitySchemes")
            .GetProperty("Bearer");
        Assert.Equal("http", bearerScheme.GetProperty("type").GetString());
        Assert.Equal("bearer", bearerScheme.GetProperty("scheme").GetString());
        Assert.Equal("JWT", bearerScheme.GetProperty("bearerFormat").GetString());
    }

    [Fact]
    public async Task PreOpenApiContractPolish_SwaggerMetadataCatalogPagingAuthScopesUomClearPriceAndEmployeeRbac_WorkEndToEnd()
    {
        var store = new IdentityApiTestStore();
        Product? storedProduct = null;

        var categoryRepoMock = new Mock<IProductCategoryRepository>();
        categoryRepoMock.Setup(r => r.GetPagedAsync(It.IsAny<Guid>(), It.IsAny<Guid?>(), It.IsAny<bool>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid _, Guid? _, bool _, string? _, int page, int pageSize, CancellationToken _) =>
                new PagedResult<ProductCategory>(Array.Empty<ProductCategory>(), page, pageSize, 0));
        categoryRepoMock.Setup(r => r.ExistsByCodeAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false);

        var productRepoMock = new Mock<IProductRepository>();
        productRepoMock.Setup(r => r.GetPagedAsync(It.IsAny<Guid>(), It.IsAny<Guid?>(), It.IsAny<bool>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid _, Guid? _, bool _, string? _, int page, int pageSize, CancellationToken _) =>
                new PagedResult<Product>(Array.Empty<Product>(), page, pageSize, 0));

        var uomRepoMock = new Mock<IProductUomRepository>();
        uomRepoMock.Setup(r => r.GetByIdAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid _, Guid pid, Guid uomId, CancellationToken _) =>
                storedProduct is not null && storedProduct.ProductId == pid
                    ? storedProduct.Uoms.FirstOrDefault(u => u.ProductUomId == uomId)
                    : null);

        await using var factory = CreateTestFactory(store, extraServices: services =>
        {
            services.RemoveAll<IProductCategoryRepository>();
            services.RemoveAll<IProductRepository>();
            services.RemoveAll<IProductUomRepository>();
            services.AddScoped(_ => categoryRepoMock.Object);
            services.AddScoped(_ => productRepoMock.Object);
            services.AddScoped(_ => uomRepoMock.Object);
        });
        var keyProvider = factory.Services.GetRequiredService<JwksKeyProvider>();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var (orgId, branchId, adminToken) = await ProvisionAndLoginAdminAsync(client, keyProvider, "POLISHORG");

        // 1. Swagger/OpenAPI metadata checks (DTO-DIFF-020, DTO-DIFF-013, DTO-DIFF-010)
        using var swaggerResp = await client.GetAsync("/swagger/v1/swagger.json");
        Assert.Equal(HttpStatusCode.OK, swaggerResp.StatusCode);
        using var swaggerDoc = JsonDocument.Parse(await swaggerResp.Content.ReadAsStringAsync());
        var paths = swaggerDoc.RootElement.GetProperty("paths");
        var schemas = swaggerDoc.RootElement.GetProperty("components").GetProperty("schemas");

        foreach (var (path, method) in new[]
        {
            ("/api/v1/branches", "post"),
            ("/api/v1/product-categories", "post"),
            ("/api/v1/products", "post"),
            ("/api/v1/products/{id}/uoms/{uomId}", "patch"),
            ("/api/v1/inventory/locations", "post"),
            ("/api/v1/inventory/adjustments", "post")
        })
        {
            var parameters = paths.GetProperty(path).GetProperty(method).GetProperty("parameters").EnumerateArray().ToList();
            var idempotencyHeaders = parameters
                .Where(p => string.Equals(p.GetProperty("name").GetString(), "Idempotency-Key", StringComparison.OrdinalIgnoreCase)
                         && string.Equals(p.GetProperty("in").GetString(), "header", StringComparison.OrdinalIgnoreCase))
                .ToList();
            var headerParam = Assert.Single(idempotencyHeaders);
            Assert.False(string.IsNullOrWhiteSpace(headerParam.GetProperty("description").GetString()));
            Assert.Equal(100, headerParam.GetProperty("schema").GetProperty("maxLength").GetInt32());
        }

        foreach (var schemaName in new[]
        {
            "CreateProductCategoryRequest",
            "UpdateProductCategoryRequest",
            "CreateProductRequest",
            "UpdateProductRequest",
            "CreateProductUomRequest",
            "UpdateProductUomRequest",
            "UpsertReorderRuleRequest",
            "CreateInventoryLocationRequest",
            "UpdateInventoryLocationRequest",
            "CreateInventoryAdjustmentRequest"
        })
        {
            var dtoSchema = schemas.GetProperty(schemaName);
            if (dtoSchema.TryGetProperty("required", out var requiredProps))
            {
                var requiredNames = requiredProps.EnumerateArray().Select(x => x.GetString()).ToArray();
                Assert.DoesNotContain("idempotency_key", requiredNames);
            }
        }

        // CurrentUserDto emits enum schema references for role & branch_scope
        var currentUserProps = schemas.GetProperty("CurrentUserDto").GetProperty("properties");
        Assert.Contains("UserRole", currentUserProps.GetProperty("role").GetRawText(), StringComparison.Ordinal);
        Assert.Contains("BranchScope", currentUserProps.GetProperty("branch_scope").GetRawText(), StringComparison.Ordinal);
        Assert.True(schemas.GetProperty("UserRole").TryGetProperty("enum", out _));
        Assert.True(schemas.GetProperty("BranchScope").TryGetProperty("enum", out _));

        // UserDto schema exposes last_login_at & lockout_end
        var userDtoProps = schemas.GetProperty("UserDto").GetProperty("properties");
        Assert.True(userDtoProps.TryGetProperty("last_login_at", out _));
        Assert.True(userDtoProps.TryGetProperty("lockout_end", out _));

        // 2. Runtime Idempotency-Key guards preserved + header-only works without body field
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);

        using var missingKeyResp = await client.SendAsync(RawJsonRequest(
            HttpMethod.Post, "/api/v1/product-categories", """{ "code": "CAT-M", "name": "Missing Key" }"""));
        Assert.Equal(HttpStatusCode.BadRequest, missingKeyResp.StatusCode);
        using var missingKeyDoc = JsonDocument.Parse(await missingKeyResp.Content.ReadAsStringAsync());
        Assert.Equal("MALFORMED_REQUEST", missingKeyDoc.RootElement.GetProperty("error").GetProperty("code").GetString());

        using var longKeyResp = await client.SendAsync(RawJsonRequest(
            HttpMethod.Post, "/api/v1/product-categories", """{ "code": "CAT-L", "name": "Long Key" }""", new string('K', 101)));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, longKeyResp.StatusCode);
        Assert.Contains("idempotency_key", await AssertValidationErrorAndGetFieldsAsync(longKeyResp));

        using var headerOnlyCatResp = await client.SendAsync(RawJsonRequest(
            HttpMethod.Post, "/api/v1/product-categories", """{ "code": "CAT-OK", "name": "Header Only" }""", "cat-hdr-only-1"));
        Assert.Equal(HttpStatusCode.Created, headerOnlyCatResp.StatusCode);

        // 3. Uniform Catalog pagination validation (API-DIFF-022): 422 on invalid, accepts 1..200 without clamping at 100
        using var badCatPaging = await client.GetAsync("/api/v1/product-categories?page=0&page_size=201");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, badCatPaging.StatusCode);
        var badCatFields = await AssertValidationErrorAndGetFieldsAsync(badCatPaging);
        Assert.Contains("page", badCatFields);
        Assert.Contains("page_size", badCatFields);

        using var badProdPaging = await client.GetAsync("/api/v1/products?page=-1&page_size=0");
        Assert.Equal(HttpStatusCode.UnprocessableEntity, badProdPaging.StatusCode);
        var badProdFields = await AssertValidationErrorAndGetFieldsAsync(badProdPaging);
        Assert.Contains("page", badProdFields);
        Assert.Contains("page_size", badProdFields);

        using var prodPage150 = await client.GetAsync("/api/v1/products?page=1&page_size=150");
        Assert.Equal(HttpStatusCode.OK, prodPage150.StatusCode);
        using var prodPage150Doc = JsonDocument.Parse(await prodPage150.Content.ReadAsStringAsync());
        Assert.Equal(150, prodPage150Doc.RootElement.GetProperty("page_size").GetInt32());

        // 4. Clearable sale_unit_price when disabling is_sellable (DTO-DIFF-019)
        storedProduct = Product.Create(
            orgId,
            Guid.NewGuid(),
            "SKU-CLR",
            null,
            "Clear Price Med",
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
                new InitialUomDefinition("BOX", "Box", 10m, 48m, false, true, true)
            });
        var boxUom = storedProduct.Uoms.Single(u => u.UomCode == "BOX");

        using var clearPriceResp = await client.SendAsync(RawJsonRequest(
            HttpMethod.Patch,
            $"/api/v1/products/{storedProduct.ProductId}/uoms/{boxUom.ProductUomId}",
            """{ "is_sellable": false }""",
            "uom-clear-price-1"));
        Assert.Equal(HttpStatusCode.OK, clearPriceResp.StatusCode);
        using var clearPriceDoc = JsonDocument.Parse(await clearPriceResp.Content.ReadAsStringAsync());
        Assert.False(clearPriceDoc.RootElement.GetProperty("is_sellable").GetBoolean());
        Assert.Equal(JsonValueKind.Null, clearPriceDoc.RootElement.GetProperty("sale_unit_price").ValueKind);

        // 5. Create Pharmacist & Cashier users to verify scopes (API-DIFF-019), Employee PII RBAC (API-DIFF-018), and UserDto last_login_at/lockout_end (DTO-DIFF-010)
        using var pharmEmpResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/employees", $$"""
        {
            "branch_id": "{{branchId}}",
            "employee_no": "EMP-PH",
            "full_name": "Pharmacist One",
            "job_title": "Pharmacist",
            "address": { "line1": "1 St", "city": "Cairo", "country_code": "EG" }
        }
        """, "emp-ph-1"));
        Assert.Equal(HttpStatusCode.Created, pharmEmpResp.StatusCode);
        var pharmEmpId = JsonDocument.Parse(await pharmEmpResp.Content.ReadAsStringAsync()).RootElement.GetProperty("employee_id").GetGuid();

        using var cashEmpResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/employees", $$"""
        {
            "branch_id": "{{branchId}}",
            "employee_no": "EMP-CA",
            "full_name": "Cashier One",
            "job_title": "Cashier",
            "address": { "line1": "2 St", "city": "Cairo", "country_code": "EG" }
        }
        """, "emp-ca-1"));
        Assert.Equal(HttpStatusCode.Created, cashEmpResp.StatusCode);
        var cashEmpId = JsonDocument.Parse(await cashEmpResp.Content.ReadAsStringAsync()).RootElement.GetProperty("employee_id").GetGuid();

        using var pharmUserResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/users", $$"""
        {
            "employee_id": "{{pharmEmpId}}",
            "username": "pharm.one",
            "password": "StrongPassword123!",
            "role": "Pharmacist",
            "branch_scope": "ASSIGNED",
            "branch_ids": ["{{branchId}}"]
        }
        """, "usr-ph-1"));
        Assert.Equal(HttpStatusCode.Created, pharmUserResp.StatusCode);
        var pharmUserId = JsonDocument.Parse(await pharmUserResp.Content.ReadAsStringAsync()).RootElement.GetProperty("user_id").GetGuid();

        using var cashUserResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/users", $$"""
        {
            "employee_id": "{{cashEmpId}}",
            "username": "cashier.one",
            "password": "StrongPassword123!",
            "role": "Cashier",
            "branch_scope": "ASSIGNED",
            "branch_ids": ["{{branchId}}"]
        }
        """, "usr-ca-1"));
        Assert.Equal(HttpStatusCode.Created, cashUserResp.StatusCode);
        var cashUserId = JsonDocument.Parse(await cashUserResp.Content.ReadAsStringAsync()).RootElement.GetProperty("user_id").GetGuid();

        // Pharmacist login: wire strings preserved, sales:write excluded, GET /employees allowed
        client.DefaultRequestHeaders.Authorization = null;
        using var pharmLoginResp = await client.PostAsync(
            "/api/v1/auth/login",
            new StringContent("""{"organization_code":"POLISHORG","username":"pharm.one","password":"StrongPassword123!"}""", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.OK, pharmLoginResp.StatusCode);
        using var pharmLoginDoc = JsonDocument.Parse(await pharmLoginResp.Content.ReadAsStringAsync());
        var pharmUserEl = pharmLoginDoc.RootElement.GetProperty("user");
        Assert.Equal("Pharmacist", pharmUserEl.GetProperty("role").GetString());
        Assert.Equal("ASSIGNED", pharmUserEl.GetProperty("branch_scope").GetString());
        var pharmScopes = pharmUserEl.GetProperty("scopes").EnumerateArray().Select(x => x.GetString()).ToArray();
        Assert.DoesNotContain("sales:write", pharmScopes);
        Assert.Contains("inventory:write", pharmScopes);

        var pharmToken = pharmLoginDoc.RootElement.GetProperty("access_token").GetString()!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", pharmToken);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/employees")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/employees/{pharmEmpId}")).StatusCode);

        // Cashier login: sales:write preserved, GET /employees & /employees/{id} blocked with 403 FORBIDDEN, GET /branches allowed
        client.DefaultRequestHeaders.Authorization = null;
        using var cashLoginResp = await client.PostAsync(
            "/api/v1/auth/login",
            new StringContent("""{"organization_code":"POLISHORG","username":"cashier.one","password":"StrongPassword123!"}""", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.OK, cashLoginResp.StatusCode);
        using var cashLoginDoc = JsonDocument.Parse(await cashLoginResp.Content.ReadAsStringAsync());
        var cashScopes = cashLoginDoc.RootElement.GetProperty("user").GetProperty("scopes").EnumerateArray().Select(x => x.GetString()).ToArray();
        Assert.Contains("sales:write", cashScopes);

        var cashToken = cashLoginDoc.RootElement.GetProperty("access_token").GetString()!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", cashToken);

        using var cashEmpListResp = await client.GetAsync("/api/v1/employees");
        Assert.Equal(HttpStatusCode.Forbidden, cashEmpListResp.StatusCode);
        using var cashEmpListDoc = JsonDocument.Parse(await cashEmpListResp.Content.ReadAsStringAsync());
        Assert.Equal("FORBIDDEN", cashEmpListDoc.RootElement.GetProperty("error").GetProperty("code").GetString());

        using var cashEmpByIdResp = await client.GetAsync($"/api/v1/employees/{cashEmpId}");
        Assert.Equal(HttpStatusCode.Forbidden, cashEmpByIdResp.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/branches")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/branches/{branchId}")).StatusCode);

        // Trigger lockout on cashier.one (5 failed logins) and confirm Admin GET /api/v1/users/{id} surfaces last_login_at and lockout_end
        client.DefaultRequestHeaders.Authorization = null;
        for (int attempt = 0; attempt < 5; attempt++)
        {
            using var failResp = await client.PostAsync(
                "/api/v1/auth/login",
                new StringContent("""{"organization_code":"POLISHORG","username":"cashier.one","password":"WrongPassword123!"}""", Encoding.UTF8, "application/json"));
            Assert.Equal(HttpStatusCode.Unauthorized, failResp.StatusCode);
        }

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
        using var getPharmUserResp = await client.GetAsync($"/api/v1/users/{pharmUserId}");
        Assert.Equal(HttpStatusCode.OK, getPharmUserResp.StatusCode);
        using var getPharmUserDoc = JsonDocument.Parse(await getPharmUserResp.Content.ReadAsStringAsync());
        Assert.NotEqual(JsonValueKind.Null, getPharmUserDoc.RootElement.GetProperty("last_login_at").ValueKind);
        Assert.Equal(JsonValueKind.Null, getPharmUserDoc.RootElement.GetProperty("lockout_end").ValueKind);

        using var getCashUserResp = await client.GetAsync($"/api/v1/users/{cashUserId}");
        Assert.Equal(HttpStatusCode.OK, getCashUserResp.StatusCode);
        using var getCashUserDoc = JsonDocument.Parse(await getCashUserResp.Content.ReadAsStringAsync());
        Assert.NotEqual(JsonValueKind.Null, getCashUserDoc.RootElement.GetProperty("last_login_at").ValueKind);
        Assert.NotEqual(JsonValueKind.Null, getCashUserDoc.RootElement.GetProperty("lockout_end").ValueKind);
    }

    private WebApplicationFactory<PharmacyERP.Api.Program> CreateTestFactory(
        IdentityApiTestStore store,
        string runtimeMode = "Cloud",
        Guid? enrolledBranchId = null,
        Action<IServiceCollection>? extraServices = null)
    {
        return _factory.WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
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
        string orgCode)
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", CreatePlatformProvisionerToken(keyProvider));
        using var orgResp = await client.SendAsync(RawJsonRequest(HttpMethod.Post, "/api/v1/organizations", $$"""
        {
            "organization_code": "{{orgCode}}",
            "name": "{{orgCode}} Pharmacy",
            "base_currency": "EGP",
            "time_zone_id": "Africa/Cairo",
            "address": { "line1": "Org St", "city": "Cairo", "country_code": "EG" },
            "initial_branch": { "branch_code": "MAIN", "name": "Main Branch", "address": { "line1": "Main St", "city": "Cairo", "country_code": "EG" } },
            "initial_employee": {
                "branch_id": "{{Guid.Empty}}",
                "employee_no": "EMP-001",
                "full_name": "Initial Admin",
                "job_title": "Admin",
                "address": { "line1": "Emp St", "city": "Cairo", "country_code": "EG" },
                "hired_on": "2025-01-01"
            },
            "initial_admin": { "username": "owner", "password": "OwnerPassword123!" }
        }
        """, $"prov-{orgCode}"));
        Assert.Equal(HttpStatusCode.Created, orgResp.StatusCode);
        using var orgDoc = JsonDocument.Parse(await orgResp.Content.ReadAsStringAsync());
        var orgId = orgDoc.RootElement.GetProperty("organization_id").GetGuid();
        var branchId = orgDoc.RootElement.GetProperty("initial_branch_id").GetGuid();

        var token = await LoginAsync(client, orgCode, "owner", "OwnerPassword123!");
        return (orgId, branchId, token);
    }

    private static async Task<string> LoginAsync(HttpClient client, string orgCode, string username, string password)
    {
        client.DefaultRequestHeaders.Authorization = null;
        using var loginResp = await client.PostAsync(
            "/api/v1/auth/login",
            new StringContent($$"""{"organization_code":"{{orgCode}}","username":"{{username}}","password":"{{password}}"}""", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.OK, loginResp.StatusCode);
        using var loginDoc = JsonDocument.Parse(await loginResp.Content.ReadAsStringAsync());
        return loginDoc.RootElement.GetProperty("access_token").GetString()!;
    }

    private static HttpRequestMessage RawJsonRequest(HttpMethod method, string url, string rawJson, string? idempotencyKey = null)
    {
        var req = new HttpRequestMessage(method, url)
        {
            Content = new StringContent(rawJson, Encoding.UTF8, "application/json")
        };
        if (!string.IsNullOrWhiteSpace(idempotencyKey))
        {
            req.Headers.Add("Idempotency-Key", idempotencyKey);
        }

        return req;
    }

    private static async Task<string[]> AssertValidationErrorAndGetFieldsAsync(HttpResponseMessage response)
    {
        var raw = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(raw);
        var error = doc.RootElement.GetProperty("error");
        Assert.Equal("VALIDATION_ERROR", error.GetProperty("code").GetString());
        return error.GetProperty("details")
            .EnumerateArray()
            .Select(d => d.GetProperty("field").GetString()!)
            .ToArray();
    }

    private static string CreatePlatformProvisionerToken(JwksKeyProvider keyProvider)
    {
        var now = DateTime.UtcNow;
        var token = new JwtSecurityToken(
            issuer: "PharmacyERP",
            audience: "PharmacyERP.Api",
            claims: new[] { new Claim("roles", "[\"PlatformProvisioner\"]", JsonClaimValueTypes.JsonArray) },
            notBefore: now.AddSeconds(-10),
            expires: now.AddMinutes(5),
            signingCredentials: keyProvider.CreateSigningCredentials());
        token.Header["kid"] = keyProvider.KeyId;
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
