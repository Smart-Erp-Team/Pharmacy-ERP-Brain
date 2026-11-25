using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace PharmacyERP.Api.Swagger;

/// <summary>
/// Enriches the generated OpenAPI v1 specification with the startup-middleware
/// <c>GET /.well-known/jwks.json</c> endpoint, its <c>JwksDocument</c> / <c>JwkKey</c>
/// schemas, the canonical <see cref="ApiErrorEnvelopeDto"/> schema, and optional
/// <c>idempotency_key</c> body metadata for <c>[AllowHeaderIdempotencyKey]</c> DTOs.
/// </summary>
internal sealed class Stage1OpenApiDocumentFilter : IDocumentFilter
{
    private static readonly string[] HeaderOptionalIdempotencySchemas =
    [
        nameof(CanonicalProductConfigurationRequest),
        nameof(CanonicalReorderRuleConfigurationRequest)
    ];

    public void Apply(OpenApiDocument swaggerDoc, DocumentFilterContext context)
    {
        swaggerDoc.Components ??= new OpenApiComponents();
        swaggerDoc.Components.Schemas ??= new Dictionary<string, IOpenApiSchema>(StringComparer.Ordinal);
        swaggerDoc.Paths ??= new OpenApiPaths();

        // Ensure ApiErrorEnvelopeDto (and nested error schemas) are always registered.
        context.SchemaGenerator.GenerateSchema(typeof(ApiErrorEnvelopeDto), context.SchemaRepository);

        // Register JWKS schemas matching JwksKeyProvider.GetPublicJwksJson().
        swaggerDoc.Components.Schemas["JwkKey"] = new OpenApiSchema
        {
            Type = JsonSchemaType.Object,
            AdditionalPropertiesAllowed = false,
            Required = new HashSet<string>(StringComparer.Ordinal) { "kty", "use", "alg", "kid", "n", "e" },
            Properties = new Dictionary<string, IOpenApiSchema>(StringComparer.Ordinal)
            {
                ["kty"] = new OpenApiSchema { Type = JsonSchemaType.String, Description = "Key type (\"RSA\")." },
                ["use"] = new OpenApiSchema { Type = JsonSchemaType.String, Description = "Public key use (\"sig\")." },
                ["alg"] = new OpenApiSchema { Type = JsonSchemaType.String, Description = "Signing algorithm (\"RS256\")." },
                ["kid"] = new OpenApiSchema { Type = JsonSchemaType.String, Description = "32-character hexadecimal key identifier." },
                ["n"] = new OpenApiSchema { Type = JsonSchemaType.String, Description = "Base64url-encoded RSA modulus." },
                ["e"] = new OpenApiSchema { Type = JsonSchemaType.String, Description = "Base64url-encoded RSA public exponent." }
            }
        };

        swaggerDoc.Components.Schemas["JwksDocument"] = new OpenApiSchema
        {
            Type = JsonSchemaType.Object,
            AdditionalPropertiesAllowed = false,
            Required = new HashSet<string>(StringComparer.Ordinal) { "keys" },
            Properties = new Dictionary<string, IOpenApiSchema>(StringComparer.Ordinal)
            {
                ["keys"] = new OpenApiSchema
                {
                    Type = JsonSchemaType.Array,
                    Items = new OpenApiSchemaReference("JwkKey", swaggerDoc)
                }
            }
        };

        // Add GET /.well-known/jwks.json (served by JwksEndpointMiddleware).
        var jwksOperation = new OpenApiOperation
        {
            Tags = new HashSet<OpenApiTagReference> { new("Auth", swaggerDoc) },
            Summary = "Get public RSA signing keys (JWKS)",
            Description = "Returns the active public RSA signing key set in RFC 7517 JWKS format (application/jwk-set+json) for verifying RS256 access tokens.",
            Security = new List<OpenApiSecurityRequirement>(),
            Responses = new OpenApiResponses
            {
                ["200"] = new OpenApiResponse
                {
                    Description = "OK",
                    Content = new Dictionary<string, OpenApiMediaType>(StringComparer.Ordinal)
                    {
                        ["application/jwk-set+json"] = new OpenApiMediaType
                        {
                            Schema = new OpenApiSchemaReference("JwksDocument", swaggerDoc)
                        }
                    }
                }
            }
        };

        swaggerDoc.Paths["/.well-known/jwks.json"] = new OpenApiPathItem
        {
            Operations = new Dictionary<HttpMethod, OpenApiOperation>
            {
                [HttpMethod.Get] = jwksOperation
            }
        };

        // Mark idempotency_key as optional in schemas where [AllowHeaderIdempotencyKey] permits
        // omitting it from the JSON body when the Idempotency-Key HTTP header is provided.
        foreach (var schemaName in HeaderOptionalIdempotencySchemas)
        {
            if (swaggerDoc.Components.Schemas.TryGetValue(schemaName, out var schemaInterface)
                && schemaInterface is OpenApiSchema schema)
            {
                schema.Required?.Remove("idempotency_key");
                if (schema.Properties is not null
                    && schema.Properties.TryGetValue("idempotency_key", out var propInterface)
                    && propInterface is OpenApiSchema propSchema)
                {
                    propSchema.Type = JsonSchemaType.String | JsonSchemaType.Null;
                    propSchema.MaxLength = 100;
                    propSchema.Description = "Optional when the Idempotency-Key HTTP header is provided (max 100 characters).";
                }
            }
        }
    }
}
