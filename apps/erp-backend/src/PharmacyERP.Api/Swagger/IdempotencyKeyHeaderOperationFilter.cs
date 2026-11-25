using Microsoft.OpenApi;
using PharmacyERP.Api.Filters;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace PharmacyERP.Api.Swagger;

/// <summary>
/// Documents the <c>Idempotency-Key</c> HTTP header parameter on OpenAPI operations
/// decorated with <see cref="AllowHeaderIdempotencyKeyAttribute"/> without duplicating
/// parameters already generated from <c>[FromHeader(Name = "Idempotency-Key")]</c>.
/// </summary>
internal sealed class IdempotencyKeyHeaderOperationFilter : IOperationFilter
{
    private const string HeaderName = "Idempotency-Key";
    private const string HeaderDescription =
        "Unique idempotency key (max 100 characters) for safe retries. Required via either the Idempotency-Key HTTP header or the optional idempotency_key JSON body field.";

    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        var hasAllowHeaderAttribute = context.MethodInfo
            .GetCustomAttributes(inherit: true)
            .OfType<AllowHeaderIdempotencyKeyAttribute>()
            .Any();

        if (!hasAllowHeaderAttribute)
        {
            return;
        }

        operation.Parameters ??= new List<IOpenApiParameter>();

        var existingHeader = operation.Parameters
            .FirstOrDefault(parameter =>
                parameter.In == ParameterLocation.Header
                && string.Equals(parameter.Name, HeaderName, StringComparison.OrdinalIgnoreCase));

        if (existingHeader is OpenApiParameter existingOpenApiParameter)
        {
            existingOpenApiParameter.Required = false;
            existingOpenApiParameter.Description = HeaderDescription;
            existingOpenApiParameter.Schema = new OpenApiSchema
            {
                Type = JsonSchemaType.String,
                MaxLength = 100
            };
            return;
        }

        if (existingHeader is null)
        {
            operation.Parameters.Add(new OpenApiParameter
            {
                Name = HeaderName,
                In = ParameterLocation.Header,
                Required = false,
                Description = HeaderDescription,
                Schema = new OpenApiSchema
                {
                    Type = JsonSchemaType.String,
                    MaxLength = 100
                }
            });
        }
    }
}
