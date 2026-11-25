using Microsoft.OpenApi;
using PharmacyERP.Api.Filters;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace PharmacyERP.Api.Swagger;

/// <summary>
/// Documents the <c>Idempotency-Key</c> HTTP header parameter on OpenAPI operations
/// decorated with <see cref="AllowHeaderIdempotencyKeyAttribute"/> or accepting a header-only
/// <c>Idempotency-Key</c>, and clears bearer security requirements on <see cref="AllowAnonymousAttribute"/> endpoints.
/// </summary>
internal sealed class IdempotencyKeyHeaderOperationFilter : IOperationFilter
{
    private const string HeaderName = "Idempotency-Key";
    private const string HeaderOrBodyDescription =
        "Unique idempotency key (max 100 characters) for safe retries. Required via either the Idempotency-Key HTTP header or the optional idempotency_key JSON body field.";
    private const string HeaderOnlyDescription =
        "Unique idempotency key (max 100 characters) for safe retries. Required via the Idempotency-Key HTTP header.";

    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        var isAllowAnonymous = context.MethodInfo.GetCustomAttributes(inherit: true).OfType<AllowAnonymousAttribute>().Any()
            || (context.MethodInfo.DeclaringType?.GetCustomAttributes(inherit: true).OfType<AllowAnonymousAttribute>().Any() ?? false);

        if (isAllowAnonymous)
        {
            operation.Security = new List<OpenApiSecurityRequirement>();
        }

        var hasAllowHeaderAttribute = context.MethodInfo
            .GetCustomAttributes(inherit: true)
            .OfType<AllowHeaderIdempotencyKeyAttribute>()
            .Any();

        var existingHeader = operation.Parameters?
            .FirstOrDefault(parameter =>
                parameter.In == ParameterLocation.Header
                && string.Equals(parameter.Name, HeaderName, StringComparison.OrdinalIgnoreCase));

        if (!hasAllowHeaderAttribute)
        {
            if (existingHeader is OpenApiParameter headerOnlyParam)
            {
                headerOnlyParam.Required = true;
                headerOnlyParam.Description = HeaderOnlyDescription;
                headerOnlyParam.Schema = new OpenApiSchema
                {
                    Type = JsonSchemaType.String,
                    MaxLength = 100
                };
            }

            return;
        }

        operation.Parameters ??= new List<IOpenApiParameter>();

        if (existingHeader is OpenApiParameter existingOpenApiParameter)
        {
            existingOpenApiParameter.Required = false;
            existingOpenApiParameter.Description = HeaderOrBodyDescription;
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
                Description = HeaderOrBodyDescription,
                Schema = new OpenApiSchema
                {
                    Type = JsonSchemaType.String,
                    MaxLength = 100
                }
            });
        }
    }
}
