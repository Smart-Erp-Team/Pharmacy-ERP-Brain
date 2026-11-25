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
/// Dedicated end-to-end HTTP wire-contract regression tests verifying all Level 1B fixes:
/// global snake_case JSON &amp; query binding, strict string-only enums (422 on raw integer enums),
/// 400 on malformed JSON, base-UOM ledger line normalization (Blueprint §8.9.12),
/// CanonicalInventoryItem available_quantity_base + organization_id (no reserved_quantity),
/// and Blueprint §8.5 JWT roles/scopes JSON arrays + username claim.
/// </summary>
public sealed class Level1BWireContractTests : IClassFixture<WebApplicationFactory<PharmacyERP.Api.Program>>
{
    private readonly WebApplicationFactory<PharmacyERP.Api.Program> _factory;

    public Level1BWireContractTests(WebApplicationFactory<PharmacyERP.Api.Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task RawIntegerEnums_AreRejectedWith422ValidationError_WhileMalformedJsonStillReturns400()
    {
        var store = new IdentityApiTestStore();
        await using var cloudFactory = CreateTestFactory(store);
        var keyProvider = cloudFactory.Services.GetRequiredService<JwksKeyProvider>();
        using var cloudClient = cloudFactory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var (_, branchId, adminToken) = await ProvisionAndLoginAdminAsync(cloudClient, keyProvider, "L1BENUM");
        cloudClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);

        // 1. Raw integer enum on POST /api/v1/users ("role": 2, "branch_scope": 2) -> 422 VALIDATION_ERROR (not 201 and not 400)
        using var intUserRoleReq = RawJsonRequest(HttpMethod.Post, "/api/v1/users", $$"""
        {
            "employee_id": "{{Guid.NewGuid()}}",
            "username": "introleuser",
            "password": "ValidPassword123!",
            "role": 2,
            "branch_scope": 2,
            "branch_ids": ["{{branchId}}"]
        }
        """, "idem-int-role-1");
        using var intUserRoleResp = await cloudClient.SendAsync(intUserRoleReq);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, intUserRoleResp.StatusCode);
        await AssertErrorEnvelopeAsync(intUserRoleResp, "VALIDATION_ERROR");

        // 2. Raw integer enum on POST /api/v1/inventory/locations ("location_type": 1) -> 422 VALIDATION_ERROR
        using var intLocTypeReq = RawJsonRequest(HttpMethod.Post, "/api/v1/inventory/locations", $$"""
        {
            "branch_id": "{{branchId}}",
            "location_code": "INT-LOC",
            "name": "Int Type Shelf",
            "location_type": 1,
            "is_sellable": true
        }
        """, "idem-int-loc-1");
        using var intLocTypeResp = await cloudClient.SendAsync(intLocTypeReq);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, intLocTypeResp.StatusCode);
        await AssertErrorEnvelopeAsync(intLocTypeResp, "VALIDATION_ERROR");

        // 3. Raw integer enum on POST /api/v1/canonical/configuration/products ("action": 1) -> 422 VALIDATION_ERROR
        using var intCanonActionReq = RawJsonRequest(HttpMethod.Post, "/api/v1/canonical/configuration/products", $$"""
        {
            "request_id": "{{Guid.NewGuid()}}",
            "source_prompt_id": "prompt-int-action",
            "action": 1
        }
        """, "idem-int-canon-1");
        using var intCanonActionResp = await cloudClient.SendAsync(intCanonActionReq);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, intCanonActionResp.StatusCode);
        await AssertErrorEnvelopeAsync(intCanonActionResp, "VALIDATION_ERROR");

        // 4. Raw integer enum & unknown string enum on POST /api/v1/inventory/adjustments (BranchLocal) -> 422 VALIDATION_ERROR
        await using var localFactory = CreateTestFactory(store, runtimeMode: "BranchLocal", enrolledBranchId: branchId);
        using var localClient = localFactory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var localToken = await LoginAsync(localClient, "L1BENUM", "owner", "OwnerPassword123!");
        localClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", localToken);

        using var intTxnTypeReq = RawJsonRequest(HttpMethod.Post, "/api/v1/inventory/adjustments", $$"""
        {
            "branch_id": "{{branchId}}",
            "transaction_type": 2,
            "reason_code": "COUNT",
            "lines": []
        }
        """, "idem-int-txn-1");
        using var intTxnTypeResp = await localClient.SendAsync(intTxnTypeReq);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, intTxnTypeResp.StatusCode);
        await AssertErrorEnvelopeAsync(intTxnTypeResp, "VALIDATION_ERROR");

        using var invalidStringEnumReq = RawJsonRequest(HttpMethod.Post, "/api/v1/inventory/adjustments", $$"""
        {
            "branch_id": "{{branchId}}",
            "transaction_type": "TRANSFER",
            "reason_code": "COUNT",
            "lines": []
        }
        """, "idem-bad-enum-1");
        using var invalidStringEnumResp = await localClient.SendAsync(invalidStringEnumReq);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, invalidStringEnumResp.StatusCode);
        await AssertErrorEnvelopeAsync(invalidStringEnumResp, "VALIDATION_ERROR");

        // 5. Truly malformed JSON still returns 400 MALFORMED_REQUEST
        using var malformedReq = RawJsonRequest(HttpMethod.Post, "/api/v1/inventory/adjustments", "{ \"branch_id\": \"unterminated", "idem-malformed-1");
        using var malformedResp = await localClient.SendAsync(malformedReq);
        Assert.Equal(HttpStatusCode.BadRequest, malformedResp.StatusCode);
        await AssertErrorEnvelopeAsync(malformedResp, "MALFORMED_REQUEST");
    }

    [Fact]
    public async Task SnakeCaseWireContract_WorksEndToEndAcrossModules_AndRejectsCamelCaseBodyKeys()
    {
        var store = new IdentityApiTestStore();
        var canonicalProductId = Guid.NewGuid();
        var canonicalLocationId = Guid.NewGuid();
        var canonicalBatchId = Guid.NewGuid();
        var canonicalUomId = Guid.NewGuid();
        var capturedProductsQuery = (CategoryId: (Guid?)null, IncludeInactive: false, PageSize: 0);
        var capturedCanonicalInvQuery = (OrgId: Guid.Empty, BranchId: Guid.Empty);

        var productServiceMock = new Mock<IProductService>();
        productServiceMock
            .Setup(x => x.GetProductsAsync(It.IsAny<Guid?>(), It.IsAny<bool>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .Callback<Guid?, bool, string?, int, int, CancellationToken>((catId, inc, _, _, pageSize, _) => capturedProductsQuery = (catId, inc, pageSize))
            .ReturnsAsync((Guid? catId, bool _, string? _, int page, int pageSize, CancellationToken _) =>
                Result<PagedResult<ProductDto>>.Success(new PagedResult<ProductDto>(
                    new[]
                    {
                        new ProductDto(
                            canonicalProductId, Guid.NewGuid(), catId ?? Guid.NewGuid(), "SKU-SNK-1", "6221000000011",
                            "Snake Case Med", "Generic", "Brand", "TAB", 0.14m, null, true, 30, true,
                            new[] { new ProductUomDto(canonicalUomId, canonicalProductId, "TAB", "Tablet", 1m, 10m, true, true, true, true, DateTimeOffset.UtcNow) },
                            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow)
                    },
                    page, pageSize, 1)));

        var canonicalCatalogMock = new Mock<ICanonicalCatalogService>();
        canonicalCatalogMock
            .Setup(x => x.GetCanonicalProductsFeedAsync(It.IsAny<DateTimeOffset?>(), It.IsAny<string?>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result<CanonicalProductFeedPageDto>.Success(new CanonicalProductFeedPageDto(
                new[]
                {
                    new CanonicalProductDto(
                        Guid.NewGuid(), canonicalProductId, "SKU-SNK-1", "6221000000011", "Snake Case Med",
                        Guid.NewGuid(), "Antibiotics", "TAB", 0.14m, true, true,
                        new[] { new CanonicalUomConversionDto(canonicalUomId, "TAB", "Tablet", 1m, 10m, true, true, true, true) },
                        DateTimeOffset.UtcNow)
                },
                NextCursor: "cursor-1")));

        var canonicalInventoryMock = new Mock<ICanonicalInventoryService>();
        canonicalInventoryMock
            .Setup(x => x.GetCanonicalInventoryAsync(It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<Guid?>(), It.IsAny<DateTimeOffset?>(), It.IsAny<long?>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .Callback<Guid, Guid, Guid?, DateTimeOffset?, long?, int, CancellationToken>((orgId, brId, _, _, _, _, _) => capturedCanonicalInvQuery = (orgId, brId))
            .ReturnsAsync((Guid orgId, Guid brId, Guid? _, DateTimeOffset? _, long? _, int pageSize, CancellationToken _) =>
                Result<PagedResult<CanonicalInventoryItemDto>>.Success(new PagedResult<CanonicalInventoryItemDto>(
                    new[]
                    {
                        new CanonicalInventoryItemDto(
                            orgId, brId, canonicalProductId, canonicalLocationId, "TAB", 240m, 240m, 1.25m, 60m,
                            new[]
                            {
                                new CanonicalInventoryLotDto(canonicalBatchId, "LOT-01", 240m, 240m, new DateOnly(2026, 1, 1), new DateOnly(2027, 8, 31), "AVAILABLE")
                            },
                            DateTimeOffset.UtcNow)
                    },
                    1, pageSize, 1, "1")));

        await using var testFactory = CreateTestFactory(store, extraServices: services =>
        {
            services.RemoveAll<IProductService>();
            services.RemoveAll<ICanonicalCatalogService>();
            services.RemoveAll<ICanonicalInventoryService>();
            services.AddScoped(_ => productServiceMock.Object);
            services.AddScoped(_ => canonicalCatalogMock.Object);
            services.AddScoped(_ => canonicalInventoryMock.Object);
        });

        var keyProvider = testFactory.Services.GetRequiredService<JwksKeyProvider>();
        using var client = testFactory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var (orgId, branchId, adminToken) = await ProvisionAndLoginAdminAsync(client, keyProvider, "L1BSNK", adminUsername: "dr.snake");

        // 1. Verify camelCase body key ("organizationCode") is rejected on POST /api/v1/auth/login
        client.DefaultRequestHeaders.Authorization = null;
        using var camelLoginResp = await client.PostAsync(
            "/api/v1/auth/login",
            new StringContent("""{"organizationCode":"L1BSNK","username":"dr.snake","password":"OwnerPassword123!"}""", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, camelLoginResp.StatusCode);
        await AssertErrorEnvelopeAsync(camelLoginResp, "VALIDATION_ERROR");

        // 2. Verify JWT raw JSON payload contains Blueprint §8.5 "roles" & "scopes" JSON arrays + "username"
        var jwtParts = adminToken.Split('.');
        using var jwtPayloadDoc = JsonDocument.Parse(JwksKeyProvider.Base64UrlDecode(jwtParts[1]));
        var jwtRoot = jwtPayloadDoc.RootElement;
        Assert.Equal(JsonValueKind.Array, jwtRoot.GetProperty("roles").ValueKind);
        Assert.Equal(new[] { "Admin" }, jwtRoot.GetProperty("roles").EnumerateArray().Select(x => x.GetString()));
        Assert.False(jwtRoot.TryGetProperty("role", out _));
        Assert.Equal(JsonValueKind.Array, jwtRoot.GetProperty("scopes").ValueKind);
        Assert.Contains("user:admin", jwtRoot.GetProperty("scopes").EnumerateArray().Select(x => x.GetString()));
        Assert.False(jwtRoot.TryGetProperty("scope", out _));
        Assert.Equal("dr.snake", jwtRoot.GetProperty("username").GetString());

        // 3. Verify GET /api/v1/auth/me returns snake_case JSON with username + scopes
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
        using var meResp = await client.GetAsync("/api/v1/auth/me");
        Assert.Equal(HttpStatusCode.OK, meResp.StatusCode);
        using var meDoc = JsonDocument.Parse(await meResp.Content.ReadAsStringAsync());
        Assert.Equal(orgId, meDoc.RootElement.GetProperty("organization_id").GetGuid());
        Assert.Equal("dr.snake", meDoc.RootElement.GetProperty("username").GetString());
        Assert.Equal("Admin", meDoc.RootElement.GetProperty("role").GetString());
        Assert.Equal("ALL", meDoc.RootElement.GetProperty("branch_scope").GetString());
        Assert.Contains("user:admin", meDoc.RootElement.GetProperty("scopes").EnumerateArray().Select(x => x.GetString()));

        // 4. Verify snake_case query params & snake_case response on GET /api/v1/products
        var filterCategoryId = Guid.NewGuid();
        using var productsResp = await client.GetAsync($"/api/v1/products?category_id={filterCategoryId}&include_inactive=true&page=1&page_size=15");
        Assert.Equal(HttpStatusCode.OK, productsResp.StatusCode);
        Assert.Equal(filterCategoryId, capturedProductsQuery.CategoryId);
        Assert.True(capturedProductsQuery.IncludeInactive);
        Assert.Equal(15, capturedProductsQuery.PageSize);
        using var productsDoc = JsonDocument.Parse(await productsResp.Content.ReadAsStringAsync());
        Assert.Equal(15, productsDoc.RootElement.GetProperty("page_size").GetInt32());
        Assert.Equal(1, productsDoc.RootElement.GetProperty("total_count").GetInt32());
        var firstProd = productsDoc.RootElement.GetProperty("items")[0];
        Assert.Equal("TAB", firstProd.GetProperty("base_uom_code").GetString());
        Assert.True(firstProd.GetProperty("lot_tracking_required").GetBoolean());
        Assert.Equal(10m, firstProd.GetProperty("uoms")[0].GetProperty("sale_unit_price").GetDecimal());

        // 5. Verify Canonical Products emits snake_case (schema, version, organization_id, base_uom_code, supported_conversions, next_cursor)
        using var canonProdResp = await client.GetAsync("/api/v1/canonical/products?limit=10");
        Assert.Equal(HttpStatusCode.OK, canonProdResp.StatusCode);
        using var canonProdDoc = JsonDocument.Parse(await canonProdResp.Content.ReadAsStringAsync());
        Assert.Equal("cursor-1", canonProdDoc.RootElement.GetProperty("next_cursor").GetString());
        var canonProd = canonProdDoc.RootElement.GetProperty("items")[0];
        Assert.Equal("canonical.Product", canonProd.GetProperty("schema").GetString());
        Assert.Equal("1.0", canonProd.GetProperty("version").GetString());
        Assert.True(canonProd.TryGetProperty("organization_id", out _));
        Assert.True(canonProd.TryGetProperty("base_uom_code", out _));
        Assert.True(canonProd.TryGetProperty("supported_conversions", out _));
        Assert.False(canonProd.TryGetProperty("organizationId", out _));

        // 6. Verify Canonical Inventory emits organization_id + available_quantity_base and ZERO reserved_quantity (DTO-DIFF-031/032)
        using var canonInvResp = await client.GetAsync($"/api/v1/canonical/inventory?organization_id={orgId}&branch_id={branchId}&limit=50");
        Assert.Equal(HttpStatusCode.OK, canonInvResp.StatusCode);
        Assert.Equal(orgId, capturedCanonicalInvQuery.OrgId);
        Assert.Equal(branchId, capturedCanonicalInvQuery.BranchId);
        using var canonInvDoc = JsonDocument.Parse(await canonInvResp.Content.ReadAsStringAsync());
        var invItem = canonInvDoc.RootElement.GetProperty("items")[0];
        Assert.Equal("canonical.InventoryItem", invItem.GetProperty("schema").GetString());
        Assert.Equal("1.0", invItem.GetProperty("version").GetString());
        Assert.Equal(orgId, invItem.GetProperty("organization_id").GetGuid());
        Assert.Equal(branchId, invItem.GetProperty("branch_id").GetGuid());
        Assert.Equal(240m, invItem.GetProperty("quantity_on_hand_base").GetDecimal());
        Assert.Equal(240m, invItem.GetProperty("available_quantity_base").GetDecimal());
        Assert.False(invItem.TryGetProperty("reserved_quantity", out _));
        Assert.False(invItem.TryGetProperty("quantity_available_base", out _));
        var invLot = invItem.GetProperty("lots")[0];
        Assert.Equal(canonicalBatchId, invLot.GetProperty("batch_id").GetGuid());
        Assert.Equal(240m, invLot.GetProperty("available_quantity_base").GetDecimal());
        Assert.False(invLot.TryGetProperty("reserved_quantity", out _));
    }

    [Fact]
    public async Task MultiUomInventoryAdjustment_OverHttpPipeline_PersistsAndReturnsBaseNormalizedLedgerLineInSnakeCase()
    {
        var store = new IdentityApiTestStore();
        await using var cloudFactory = CreateTestFactory(store);
        var keyProvider = cloudFactory.Services.GetRequiredService<JwksKeyProvider>();
        using var cloudClient = cloudFactory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var (orgId, branchId, _) = await ProvisionAndLoginAdminAsync(cloudClient, keyProvider, "L1BMULTI");

        var product = Product.Create(
            orgId,
            Guid.NewGuid(),
            "MED-AUG-1000",
            null,
            "Augmentin 1g",
            null,
            null,
            "TAB",
            0m,
            null,
            true,
            30,
            new[] { new InitialUomDefinition("TAB", "Tablet", 1m, 10.50m, true, true, true) });
        var baseUom = product.Uoms.Single(u => u.IsBase);
        var boxUom = product.AddUom("BOX", "Box of 14", 14m, 138.00m, false, true, true);

        var location = InventoryLocation.CreateDefaultSellable(orgId, branchId, DateTimeOffset.UtcNow);
        var expiresOn = new DateOnly(2027, 1, 28);
        var batch = InventoryBatch.CreateDatedBatch(orgId, product.ProductId, "LOT-HTTP-2601", expiresOn);
        var stockBalance = StockBalance.CreateInitial(orgId, location.LocationId, batch.BatchId, 0m, 0m, DateTimeOffset.UtcNow);

        var txnRepoMock = new Mock<IInventoryTxnRepository>();
        var stockRepoMock = new Mock<IStockBalanceRepository>();
        var batchRepoMock = new Mock<IInventoryBatchRepository>();
        var locationRepoMock = new Mock<IInventoryLocationRepository>();
        var productRepoMock = new Mock<IProductRepository>();
        var uomRepoMock = new Mock<IProductUomRepository>();

        locationRepoMock.Setup(l => l.GetByIdsAsync(orgId, branchId, It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<InventoryLocation> { location });
        productRepoMock.Setup(p => p.GetByIdsAsync(orgId, It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<Product> { product });
        uomRepoMock.Setup(u => u.GetByIdsAsync(orgId, It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<ProductUom> { boxUom });
        uomRepoMock.Setup(u => u.GetActiveBaseUomsByProductIdsAsync(orgId, It.IsAny<IReadOnlyCollection<Guid>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<ProductUom> { baseUom });
        batchRepoMock.Setup(b => b.GetOrCreateBatchesAsync(
                orgId,
                It.IsAny<IReadOnlyCollection<(Guid ProductId, string BatchNumber, DateOnly? ExpiresOn, DateOnly? ManufacturedOn)>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<Guid, InventoryBatch> { [batch.BatchId] = batch });
        stockRepoMock.Setup(s => s.GetOrCreateForUpdateBatchAsync(
                orgId,
                It.IsAny<IReadOnlyCollection<(Guid LocationId, Guid BatchId)>>(),
                It.IsAny<DateTimeOffset>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<(Guid LocationId, Guid BatchId), StockBalance> { [(location.LocationId, batch.BatchId)] = stockBalance });

        await using var localFactory = CreateTestFactory(store, runtimeMode: "BranchLocal", enrolledBranchId: branchId, extraServices: services =>
        {
            services.RemoveAll<IInventoryTxnRepository>();
            services.RemoveAll<IStockBalanceRepository>();
            services.RemoveAll<IInventoryBatchRepository>();
            services.RemoveAll<IInventoryLocationRepository>();
            services.RemoveAll<IProductRepository>();
            services.RemoveAll<IProductUomRepository>();
            services.AddScoped(_ => txnRepoMock.Object);
            services.AddScoped(_ => stockRepoMock.Object);
            services.AddScoped(_ => batchRepoMock.Object);
            services.AddScoped(_ => locationRepoMock.Object);
            services.AddScoped(_ => productRepoMock.Object);
            services.AddScoped(_ => uomRepoMock.Object);
        });

        using var localClient = localFactory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var localToken = await LoginAsync(localClient, "L1BMULTI", "owner", "OwnerPassword123!");
        localClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", localToken);

        // Submit 2 Boxes (14 Tabs/Box) at 100.80/Box using header-only Idempotency-Key & snake_case JSON
        using var req = RawJsonRequest(HttpMethod.Post, "/api/v1/inventory/adjustments", $$"""
        {
            "branch_id": "{{branchId}}",
            "transaction_type": "ADJUSTMENT_IN",
            "reason_code": "RESTOCK",
            "note": "2 boxes = 28 tabs",
            "lines": [
                {
                    "product_id": "{{product.ProductId}}",
                    "product_uom_id": "{{boxUom.ProductUomId}}",
                    "location_id": "{{location.LocationId}}",
                    "batch_number": "LOT-HTTP-2601",
                    "expires_on": "2027-01-28",
                    "entered_qty": 2,
                    "unit_cost_entered": 100.80
                }
            ]
        }
        """, "idem-http-multi-uom-1");

        using var resp = await localClient.SendAsync(req);
        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        Assert.Equal("ADJUSTMENT_IN", root.GetProperty("transaction_type").GetString());
        Assert.Equal("POSTED", root.GetProperty("status").GetString());
        var line = root.GetProperty("lines")[0];
        Assert.Equal(baseUom.ProductUomId, line.GetProperty("product_uom_id").GetGuid());
        Assert.Equal(28m, line.GetProperty("entered_qty").GetDecimal());
        Assert.Equal(1m, line.GetProperty("conversion_snapshot").GetDecimal());
        Assert.Equal(28m, line.GetProperty("quantity_delta_base").GetDecimal());
        Assert.Equal(7.20m, line.GetProperty("unit_cost_base").GetDecimal());
    }

    private WebApplicationFactory<PharmacyERP.Api.Program> CreateTestFactory(
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
            "initial_admin": { "username": "{{adminUsername}}", "password": "OwnerPassword123!" }
        }
        """, $"prov-{orgCode}"));
        Assert.Equal(HttpStatusCode.Created, orgResp.StatusCode);
        using var orgDoc = JsonDocument.Parse(await orgResp.Content.ReadAsStringAsync());
        var orgId = orgDoc.RootElement.GetProperty("organization_id").GetGuid();
        var branchId = orgDoc.RootElement.GetProperty("initial_branch_id").GetGuid();

        var token = await LoginAsync(client, orgCode, adminUsername, "OwnerPassword123!");
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
