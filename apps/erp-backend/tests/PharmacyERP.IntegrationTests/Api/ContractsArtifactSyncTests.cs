using System.Text.Encodings.Web;
using System.Text.Json.Nodes;

namespace PharmacyERP.IntegrationTests.Api;

/// <summary>
/// Automated Stage 1 contract-completeness and drift tests ensuring:
/// (1) <c>contracts/openapi.v1.json</c> exactly matches live <c>/swagger/v1/swagger.json</c>,
/// (2) 100% of live HTTP endpoints (47 controller actions + <c>GET /.well-known/jwks.json</c> = 48 endpoints) exist,
/// (3) every non-204 response defines a concrete JSON schema, and
/// (4) <c>contracts/schemas/canonical-capabilities.schema.json</c> and <c>api-error-envelope.schema.json</c>
/// stay synchronized with live runtime responses and <see cref="ErrorCode"/> definitions.
/// </summary>
public sealed class ContractsArtifactSyncTests : IClassFixture<WebApplicationFactory<PharmacyERP.Api.Program>>
{
    private static readonly JsonSerializerOptions IndentedJsonOptions = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    private static readonly (string Path, string Method)[] ExpectedLiveEndpoints =
    [
        // JWKS (1)
        ("/.well-known/jwks.json", "get"),

        // Auth (4)
        ("/api/v1/auth/login", "post"),
        ("/api/v1/auth/refresh", "post"),
        ("/api/v1/auth/logout", "post"),
        ("/api/v1/auth/me", "get"),

        // Organizations (1)
        ("/api/v1/organizations", "post"),

        // Branches & Enrollment (6)
        ("/api/v1/branches", "get"),
        ("/api/v1/branches", "post"),
        ("/api/v1/branches/{id}", "get"),
        ("/api/v1/branches/{id}", "patch"),
        ("/api/v1/branches/{branchId}/enrollment-tokens", "post"),
        ("/api/v1/branch-enrollment", "post"),

        // Users (6)
        ("/api/v1/users", "get"),
        ("/api/v1/users", "post"),
        ("/api/v1/users/{id}", "get"),
        ("/api/v1/users/{id}", "patch"),
        ("/api/v1/users/{id}/password-reset", "post"),
        ("/api/v1/users/{id}/revoke-sessions", "post"),

        // Employees (4)
        ("/api/v1/employees", "get"),
        ("/api/v1/employees", "post"),
        ("/api/v1/employees/{id}", "get"),
        ("/api/v1/employees/{id}", "patch"),

        // Product Categories (4)
        ("/api/v1/product-categories", "get"),
        ("/api/v1/product-categories", "post"),
        ("/api/v1/product-categories/{id}", "get"),
        ("/api/v1/product-categories/{id}", "patch"),

        // Products & UOMs (7)
        ("/api/v1/products", "get"),
        ("/api/v1/products", "post"),
        ("/api/v1/products/{id}", "get"),
        ("/api/v1/products/{id}", "patch"),
        ("/api/v1/products/{id}/uoms", "get"),
        ("/api/v1/products/{id}/uoms", "post"),
        ("/api/v1/products/{id}/uoms/{uomId}", "patch"),

        // Reorder Rules (2)
        ("/api/v1/branches/{branchId}/products/{productId}/reorder-rule", "get"),
        ("/api/v1/branches/{branchId}/products/{productId}/reorder-rule", "put"),

        // Inventory Locations (3)
        ("/api/v1/inventory/locations", "get"),
        ("/api/v1/inventory/locations", "post"),
        ("/api/v1/inventory/locations/{id}", "patch"),

        // Inventory Queries & Adjustments (5)
        ("/api/v1/inventory/batches", "get"),
        ("/api/v1/inventory/balances", "get"),
        ("/api/v1/inventory/summary", "get"),
        ("/api/v1/inventory/transactions", "get"),
        ("/api/v1/inventory/adjustments", "post"),

        // Canonical Discovery, Catalog & Inventory (5)
        ("/api/v1/canonical/capabilities", "get"),
        ("/api/v1/canonical/products", "get"),
        ("/api/v1/canonical/configuration/products", "post"),
        ("/api/v1/canonical/configuration/reorder-rules", "put"),
        ("/api/v1/canonical/inventory", "get")
    ];

    private readonly WebApplicationFactory<PharmacyERP.Api.Program> _factory;

    public ContractsArtifactSyncTests(WebApplicationFactory<PharmacyERP.Api.Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task OpenApiV1Artifact_MatchesLiveSwaggerExactly_CoversAllLiveEndpoints_AndHasConcreteSchemas()
    {
        await using var factory = CreateFactory("Cloud");
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        using var swaggerResponse = await client.GetAsync("/swagger/v1/swagger.json");
        Assert.Equal(HttpStatusCode.OK, swaggerResponse.StatusCode);

        var liveRawJson = await swaggerResponse.Content.ReadAsStringAsync();
        var liveNode = JsonNode.Parse(liveRawJson)
            ?? throw new InvalidOperationException("Live /swagger/v1/swagger.json returned null JSON.");
        var formattedLiveJson = liveNode.ToJsonString(IndentedJsonOptions) + Environment.NewLine;

        var contractsDir = ResolveContractsDirectory();
        var openApiPath = Path.Combine(contractsDir, "openapi.v1.json");

        if (string.Equals(Environment.GetEnvironmentVariable("UPDATE_OPENAPI_SNAPSHOT"), "true", StringComparison.OrdinalIgnoreCase))
        {
            Directory.CreateDirectory(contractsDir);
            await File.WriteAllTextAsync(openApiPath, formattedLiveJson);
        }

        Assert.True(File.Exists(openApiPath), $"Expected OpenAPI contract artifact at {openApiPath}");

        var artifactRawJson = await File.ReadAllTextAsync(openApiPath);
        var artifactNode = JsonNode.Parse(artifactRawJson)
            ?? throw new InvalidOperationException("contracts/openapi.v1.json could not be parsed.");

        // 1. Exact semantic equality between committed contracts/openapi.v1.json and live /swagger/v1/swagger.json
        Assert.True(
            JsonNode.DeepEquals(liveNode, artifactNode),
            "contracts/openapi.v1.json has drifted from live /swagger/v1/swagger.json. Regenerate it before committing.");

        // 2. Verify 100% of the 48 live endpoints exist with zero omissions and zero phantom operations
        using var doc = JsonDocument.Parse(artifactRawJson);
        var paths = doc.RootElement.GetProperty("paths");

        var actualEndpoints = new HashSet<(string Path, string Method)>();
        foreach (var pathProp in paths.EnumerateObject())
        {
            foreach (var methodProp in pathProp.Value.EnumerateObject())
            {
                if (methodProp.Name is "get" or "post" or "put" or "patch" or "delete")
                {
                    actualEndpoints.Add((pathProp.Name, methodProp.Name));
                }
            }
        }

        Assert.Equal(ExpectedLiveEndpoints.Length, actualEndpoints.Count);
        foreach (var expected in ExpectedLiveEndpoints)
        {
            Assert.True(
                actualEndpoints.Contains(expected),
                $"Missing endpoint in contracts/openapi.v1.json: {expected.Method.ToUpperInvariant()} {expected.Path}");
        }

        // 3. Verify every non-204 response across every operation defines a concrete response schema
        foreach (var pathProp in paths.EnumerateObject())
        {
            foreach (var methodProp in pathProp.Value.EnumerateObject())
            {
                if (methodProp.Name is not ("get" or "post" or "put" or "patch" or "delete"))
                {
                    continue;
                }

                var responses = methodProp.Value.GetProperty("responses");
                Assert.True(
                    responses.EnumerateObject().Any(),
                    $"Operation {methodProp.Name.ToUpperInvariant()} {pathProp.Name} defines no responses.");

                foreach (var responseProp in responses.EnumerateObject())
                {
                    if (string.Equals(responseProp.Name, "204", StringComparison.Ordinal))
                    {
                        continue;
                    }

                    Assert.True(
                        responseProp.Value.TryGetProperty("content", out var content) && content.EnumerateObject().Any(),
                        $"Operation {methodProp.Name.ToUpperInvariant()} {pathProp.Name} response {responseProp.Name} is missing a typed content schema.");

                    foreach (var mediaType in content.EnumerateObject())
                    {
                        Assert.True(
                            mediaType.Value.TryGetProperty("schema", out var schema) && schema.EnumerateObject().Any(),
                            $"Operation {methodProp.Name.ToUpperInvariant()} {pathProp.Name} response {responseProp.Name} ({mediaType.Name}) has an empty schema.");
                    }
                }
            }
        }

        // 4. Verify all wire enums are present as string-only enum schemas
        var schemas = doc.RootElement.GetProperty("components").GetProperty("schemas");
        foreach (var enumType in new[]
        {
            typeof(UserRole),
            typeof(BranchScope),
            typeof(LocationType),
            typeof(BatchQualityStatus),
            typeof(InventoryTransactionType),
            typeof(InventoryTransactionStatus),
            typeof(CatalogConfigurationAction),
            typeof(ErpRuntimeMode)
        })
        {
            var enumSchema = schemas.GetProperty(enumType.Name);
            Assert.Equal("string", enumSchema.GetProperty("type").GetString());
            var schemaValues = enumSchema.GetProperty("enum").EnumerateArray().Select(e => e.GetString()).ToArray();
            var expectedValues = Enum.GetNames(enumType);
            Assert.Equal(expectedValues, schemaValues);
        }

        // 5. Verify Bearer JWT security scheme and ApiErrorEnvelopeDto + JwksDocument exist
        var bearerScheme = doc.RootElement.GetProperty("components").GetProperty("securitySchemes").GetProperty("Bearer");
        Assert.Equal("http", bearerScheme.GetProperty("type").GetString());
        Assert.Equal("bearer", bearerScheme.GetProperty("scheme").GetString());
        Assert.True(schemas.TryGetProperty("ApiErrorEnvelopeDto", out _));
        Assert.True(schemas.TryGetProperty("JwksDocument", out _));
        Assert.True(schemas.TryGetProperty("JwkKey", out _));
    }

    [Fact]
    public async Task CanonicalCapabilitiesAndErrorEnvelopeSchemas_MatchLiveEndpointsAndErrorCodes()
    {
        var schemasDir = Path.Combine(ResolveContractsDirectory(), "schemas");
        var capabilitiesSchemaPath = Path.Combine(schemasDir, "canonical-capabilities.schema.json");
        var errorEnvelopeSchemaPath = Path.Combine(schemasDir, "api-error-envelope.schema.json");

        Assert.True(File.Exists(capabilitiesSchemaPath));
        Assert.True(File.Exists(errorEnvelopeSchemaPath));

        using var capSchemaDoc = JsonDocument.Parse(await File.ReadAllTextAsync(capabilitiesSchemaPath));
        var requiredCapProps = capSchemaDoc.RootElement.GetProperty("required")
            .EnumerateArray()
            .Select(x => x.GetString()!)
            .OrderBy(x => x, StringComparer.Ordinal)
            .ToArray();
        var capSchemaProps = capSchemaDoc.RootElement.GetProperty("properties")
            .EnumerateObject()
            .Select(x => x.Name)
            .OrderBy(x => x, StringComparer.Ordinal)
            .ToArray();
        var allowedModes = capSchemaDoc.RootElement
            .GetProperty("properties")
            .GetProperty("runtime_mode")
            .GetProperty("enum")
            .EnumerateArray()
            .Select(x => x.GetString()!)
            .ToHashSet(StringComparer.Ordinal);

        Assert.Equal(new[] { "runtime_mode", "stage", "supported_reads", "supported_writes" }, requiredCapProps);
        Assert.Equal(requiredCapProps, capSchemaProps);

        // Validate live Cloud and BranchLocal /api/v1/canonical/capabilities responses against schema contract
        foreach (var (mode, expectedReadsCount, expectedWritesCount) in new[]
        {
            ("Cloud", 2, 2),
            ("BranchLocal", 0, 0)
        })
        {
            await using var factory = CreateFactory(mode, mode == "BranchLocal" ? Guid.NewGuid() : null);
            using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

            using var response = await client.GetAsync("/api/v1/canonical/capabilities");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);

            using var liveDoc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var livePropNames = liveDoc.RootElement.EnumerateObject()
                .Select(p => p.Name)
                .OrderBy(x => x, StringComparer.Ordinal)
                .ToArray();

            Assert.Equal(requiredCapProps, livePropNames);
            Assert.Equal(1, liveDoc.RootElement.GetProperty("stage").GetInt32());
            Assert.Contains(liveDoc.RootElement.GetProperty("runtime_mode").GetString()!, allowedModes);
            Assert.Equal(mode, liveDoc.RootElement.GetProperty("runtime_mode").GetString());
            Assert.Equal(expectedReadsCount, liveDoc.RootElement.GetProperty("supported_reads").GetArrayLength());
            Assert.Equal(expectedWritesCount, liveDoc.RootElement.GetProperty("supported_writes").GetArrayLength());
        }

        // Validate api-error-envelope.schema.json covers all ErrorCode values + INTERNAL_SERVER_ERROR
        using var errSchemaDoc = JsonDocument.Parse(await File.ReadAllTextAsync(errorEnvelopeSchemaPath));
        var errorCodeEnum = errSchemaDoc.RootElement
            .GetProperty("properties")
            .GetProperty("error")
            .GetProperty("properties")
            .GetProperty("code")
            .GetProperty("enum")
            .EnumerateArray()
            .Select(x => x.GetString()!)
            .ToHashSet(StringComparer.Ordinal);

        foreach (var liveErrorCode in Enum.GetNames<ErrorCode>())
        {
            Assert.Contains(liveErrorCode, errorCodeEnum);
        }

        Assert.Contains("INTERNAL_SERVER_ERROR", errorCodeEnum);
    }

    private WebApplicationFactory<PharmacyERP.Api.Program> CreateFactory(string runtimeMode, Guid? enrolledBranchId = null)
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
            });
        });
    }

    private static string ResolveContractsDirectory()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null)
        {
            var candidate = Path.Combine(current.FullName, "contracts");
            if (Directory.Exists(candidate) && File.Exists(Path.Combine(current.FullName, "PharmacyERP.sln")))
            {
                return candidate;
            }

            current = current.Parent;
        }

        throw new DirectoryNotFoundException("Could not locate apps/erp-backend/contracts directory from test base path.");
    }
}
