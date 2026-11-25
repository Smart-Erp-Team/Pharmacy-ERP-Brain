using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Mvc.Formatters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using PharmacyERP.Api.Auth;
using PharmacyERP.Api.Swagger;
using PharmacyERP.Application.Features.Identity.Interfaces;

namespace PharmacyERP.Api;

public static class DependencyInjection
{
    public const string DefaultCorsPolicyName = "DefaultCorsPolicy";

    /// <summary>
    /// Shared <see cref="JsonSerializerOptions"/> enforcing Blueprint v1.1 <c>snake_case</c>
    /// property naming and strict string-only enum serialization across controllers, middlewares,
    /// and JWT/authorization error handlers.
    /// </summary>
    internal static readonly JsonSerializerOptions ApiJsonSerializerOptions = CreateApiJsonSerializerOptions();

    private static JsonSerializerOptions CreateApiJsonSerializerOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        ConfigureApiJsonOptions(options);
        return options;
    }

    private static void ConfigureApiJsonOptions(JsonSerializerOptions options)
    {
        options.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
        options.PropertyNameCaseInsensitive = true;
        options.Converters.Add(new JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false));
    }

    public static IServiceCollection AddApiServices(this IServiceCollection services)
    {
        services.AddHttpContextAccessor();
        services.AddSingleton<IDevRequestErrorLogWriter, FileDevRequestErrorLogWriter>();
        services.AddCors();
        services.AddOptions<CorsOptions>()
            .Configure<IConfiguration>((options, configuration) =>
            {
                options.AddPolicy(DefaultCorsPolicyName, policy =>
                {
                    var allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()?
                        .Where(origin => !string.IsNullOrWhiteSpace(origin))
                        .Select(origin => origin.Trim())
                        .ToArray();

                    if (allowedOrigins is null
                        || allowedOrigins.Length == 0
                        || allowedOrigins.Any(origin => string.Equals(origin, "*", StringComparison.Ordinal)))
                    {
                        policy
                            .SetIsOriginAllowed(_ => true)
                            .AllowAnyHeader()
                            .AllowAnyMethod()
                            .AllowCredentials();
                    }
                    else
                    {
                        policy
                            .WithOrigins(allowedOrigins)
                            .AllowAnyHeader()
                            .AllowAnyMethod()
                            .AllowCredentials();
                    }
                });
            });
        services.AddControllers()
            .AddJsonOptions(options =>
            {
                ConfigureApiJsonOptions(options.JsonSerializerOptions);
            })
            .ConfigureApiBehaviorOptions(options =>
            {
                options.InvalidModelStateResponseFactory = context =>
                {
                    var traceId = context.HttpContext.Items["TraceId"]?.ToString()
                        ?? context.HttpContext.TraceIdentifier
                        ?? Guid.NewGuid().ToString();

                    var isMalformedRequest = IsMalformedJsonOrProtocolRequest(context.ModelState);

                    var details = context.ModelState
                        .Where(entry => entry.Value != null && entry.Value.Errors.Count > 0)
                        .SelectMany(entry => entry.Value!.Errors.Select(modelError =>
                            new ApiErrorDetailDto(
                                NormalizeModelStateFieldName(entry.Key),
                                !string.IsNullOrWhiteSpace(modelError.ErrorMessage)
                                    ? modelError.ErrorMessage
                                    : isMalformedRequest
                                        ? "Malformed JSON request payload."
                                        : "Invalid value.")))
                        .ToList();

                    var errorCode = isMalformedRequest ? ErrorCode.MALFORMED_REQUEST : ErrorCode.VALIDATION_ERROR;
                    var message = isMalformedRequest ? ErrorMessages.MalformedRequest : ErrorMessages.ValidationError;
                    var statusCode = isMalformedRequest
                        ? StatusCodes.Status400BadRequest
                        : StatusCodes.Status422UnprocessableEntity;

                    var envelope = new ApiErrorEnvelopeDto(
                        new ApiErrorBodyDto(
                            errorCode.ToString(),
                            message,
                            details,
                            traceId));

                    return new ObjectResult(envelope)
                    {
                        StatusCode = statusCode
                    };
                };
            });
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer();
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<JwksKeyProvider, IConfiguration, IUserSecurityStampValidator>((options, keys, configuration, stampValidator) =>
            {
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new RsaSecurityKey(keys.GetPublicKeyParameters()) { KeyId = keys.KeyId },
                    ValidAlgorithms = new[] { SecurityAlgorithms.RsaSha256 },
                    ValidateIssuer = true,
                    ValidIssuer = configuration["Jwt:Issuer"] ?? "PharmacyERP",
                    ValidateAudience = true,
                    ValidAudience = configuration["Jwt:Audience"] ?? "PharmacyERP.Api",
                    ValidateLifetime = true,
                    RequireExpirationTime = true,
                    RequireSignedTokens = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                    NameClaimType = "sub",
                    RoleClaimType = "roles"
                };
                options.Events = new JwtBearerEvents
                {
                    OnChallenge = async context =>
                    {
                        context.HandleResponse();
                        await ApiErrorAuthorizationMiddlewareResultHandler.WriteAuthErrorAsync(
                            context.HttpContext,
                            StatusCodes.Status401Unauthorized,
                            ErrorCode.UNAUTHORIZED,
                            ErrorMessages.Unauthorized,
                            includeBearerChallengeHeader: true);
                    },
                    OnForbidden = async context =>
                    {
                        await ApiErrorAuthorizationMiddlewareResultHandler.WriteAuthErrorAsync(
                            context.HttpContext,
                            StatusCodes.Status403Forbidden,
                            ErrorCode.FORBIDDEN,
                            ErrorMessages.Forbidden,
                            includeBearerChallengeHeader: false);
                    },
                    OnTokenValidated = async context =>
                    {
                        var principal = context.Principal;
                        if (principal is null)
                        {
                            context.Fail("Invalid security principal.");
                            return;
                        }

                        var isPlatformProvisioner = principal.IsInRole("PlatformProvisioner")
                            || principal.FindAll("roles").Any(claim => string.Equals(claim.Value, "PlatformProvisioner", StringComparison.Ordinal));
                        var orgClaim = principal.FindFirst("organization_id")?.Value;
                        var subClaim = principal.FindFirst("sub")?.Value;

                        // Deployment-only PlatformProvisioner tokens are not tenant USER_ACCOUNT principals.
                        if (isPlatformProvisioner
                            && string.IsNullOrWhiteSpace(orgClaim)
                            && string.IsNullOrWhiteSpace(subClaim))
                        {
                            return;
                        }

                        var stampClaim = principal.FindFirst("security_stamp")?.Value;
                        if (!Guid.TryParse(orgClaim, out var organizationId)
                            || !Guid.TryParse(subClaim, out var userId)
                            || !Guid.TryParse(stampClaim, out var securityStamp))
                        {
                            context.Fail("Token is missing required user security claims.");
                            return;
                        }

                        // Reject JWTs whose embedded security_stamp no longer matches the active user record
                        // (e.g., after role/branch change, password reset, deactivation, or session revocation).
                        var isSecurityStampValid = await stampValidator.ValidateAsync(organizationId, userId, securityStamp, context.HttpContext.RequestAborted);
                        if (!isSecurityStampValid)
                        {
                            context.Fail("Token has been revoked or the user account is inactive.");
                        }
                    }
                };
            });
        services.AddSingleton<IAuthorizationMiddlewareResultHandler, ApiErrorAuthorizationMiddlewareResultHandler>();
        services.AddIdentityAuthorizationPolicies();
        services.AddJwksEndpoint();

        services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc("v1", new OpenApiInfo { Title = "Pharmacy ERP API", Version = "v1" });
            options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
            {
                Type = SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT",
                In = ParameterLocation.Header,
                Name = "Authorization",
                Description = "Enter a valid RS256 JWT access token."
            });
            options.AddSecurityRequirement(document => new OpenApiSecurityRequirement
            {
                [new OpenApiSecuritySchemeReference("Bearer", document)] = []
            });
            options.OperationFilter<IdempotencyKeyHeaderOperationFilter>();
        });
        return services;
    }

    private static string NormalizeModelStateFieldName(string key)
    {
        if (string.IsNullOrWhiteSpace(key) || string.Equals(key, "$", StringComparison.Ordinal))
        {
            return string.Empty;
        }

        var trimmed = key.StartsWith("$.", StringComparison.Ordinal)
            ? key[2..]
            : key;

        if (trimmed.StartsWith("request.", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = trimmed["request.".Length..];
        }

        var segments = trimmed.Split('.', StringSplitOptions.RemoveEmptyEntries);
        for (var i = 0; i < segments.Length; i++)
        {
            var segment = segments[i];
            var bracketIndex = segment.IndexOf('[');
            if (bracketIndex >= 0)
            {
                var namePart = segment[..bracketIndex];
                var indexPart = segment[bracketIndex..];
                segments[i] = string.IsNullOrEmpty(namePart)
                    ? indexPart
                    : JsonNamingPolicy.SnakeCaseLower.ConvertName(namePart) + indexPart;
            }
            else
            {
                segments[i] = JsonNamingPolicy.SnakeCaseLower.ConvertName(segment);
            }
        }

        return string.Join('.', segments);
    }

    private static bool IsMalformedJsonOrProtocolRequest(ModelStateDictionary modelState)
    {
        foreach (var (key, entry) in modelState)
        {
            if (entry is null || entry.Errors.Count == 0)
            {
                continue;
            }

            foreach (var error in entry.Errors)
            {
                var message = !string.IsNullOrWhiteSpace(error.ErrorMessage)
                    ? error.ErrorMessage
                    : error.Exception?.Message ?? string.Empty;

                // System.Text.Json syntax errors throw JsonReaderException; valid JSON with wrong field types
                // or invalid/integer enum values emits "The JSON value could not be converted to ..." under a
                // "$.property" path and must return 422 VALIDATION_ERROR per Blueprint §8.6 & §8.9.11.
                var isJsonTypeConversionError =
                    message.StartsWith("The JSON value could not be converted to ", StringComparison.OrdinalIgnoreCase);

                if (error.Exception is JsonException jsonException)
                {
                    if (string.Equals(jsonException.GetType().Name, "JsonReaderException", StringComparison.Ordinal)
                        || string.IsNullOrEmpty(key)
                        || string.Equals(key, "$", StringComparison.Ordinal)
                        || !isJsonTypeConversionError)
                    {
                        return true;
                    }
                }

                if (error.Exception is InputFormatterException)
                {
                    return true;
                }

                if (string.Equals(key, "$", StringComparison.Ordinal))
                {
                    return true;
                }

                if (key.StartsWith("$.", StringComparison.Ordinal) && !isJsonTypeConversionError)
                {
                    return true;
                }

                if (string.IsNullOrEmpty(key)
                    && (message.Contains("request body", StringComparison.OrdinalIgnoreCase)
                        || message.Contains("JSON", StringComparison.OrdinalIgnoreCase)
                        || message.Contains("end of data", StringComparison.OrdinalIgnoreCase)))
                {
                    return true;
                }
            }
        }

        return false;
    }
}
