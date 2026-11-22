using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using PharmacyERP.Api.Auth;
using PharmacyERP.Application.Common.Constants;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Identity.Interfaces;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Infrastructure.Auth;

namespace PharmacyERP.Api;

public static class DependencyInjection
{
    public const string DefaultCorsPolicyName = "DefaultCorsPolicy";

    public static IServiceCollection AddApiServices(this IServiceCollection services)
    {
        services.AddHttpContextAccessor();
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
                options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
            })
            .ConfigureApiBehaviorOptions(options =>
            {
                options.InvalidModelStateResponseFactory = context =>
                {
                    var traceId = context.HttpContext.Items["TraceId"]?.ToString()
                        ?? context.HttpContext.TraceIdentifier
                        ?? Guid.NewGuid().ToString();

                    var details = context.ModelState
                        .Where(kvp => kvp.Value != null && kvp.Value.Errors.Count > 0)
                        .SelectMany(kvp => kvp.Value!.Errors.Select(err =>
                            new ApiErrorDetailDto(
                                kvp.Key,
                                string.IsNullOrWhiteSpace(err.ErrorMessage)
                                    ? "Invalid value."
                                    : err.ErrorMessage)))
                        .ToList();

                    var envelope = new ApiErrorEnvelopeDto(
                        new ApiErrorBodyDto(
                            ErrorCode.VALIDATION_ERROR.ToString(),
                            ErrorMessages.ValidationError,
                            details,
                            traceId));

                    return new ObjectResult(envelope)
                    {
                        StatusCode = StatusCodes.Status422UnprocessableEntity
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
                    RoleClaimType = "role"
                };
                options.Events = new JwtBearerEvents
                {
                    OnTokenValidated = async context =>
                    {
                        var principal = context.Principal;
                        if (principal is null)
                        {
                            context.Fail("Invalid security principal.");
                            return;
                        }

                        var role = principal.FindFirst("role")?.Value;
                        var orgClaim = principal.FindFirst("organization_id")?.Value;
                        var subClaim = principal.FindFirst("sub")?.Value;

                        // Deployment-only PlatformProvisioner tokens are not tenant USER_ACCOUNT principals.
                        if (string.Equals(role, "PlatformProvisioner", StringComparison.Ordinal)
                            && string.IsNullOrWhiteSpace(orgClaim)
                            && string.IsNullOrWhiteSpace(subClaim))
                        {
                            return;
                        }

                        var stampClaim = principal.FindFirst("security_stamp")?.Value;
                        if (!Guid.TryParse(orgClaim, out var orgId)
                            || !Guid.TryParse(subClaim, out var userId)
                            || !Guid.TryParse(stampClaim, out var securityStamp))
                        {
                            context.Fail("Token is missing required user security claims.");
                            return;
                        }

                        var isValid = await stampValidator.ValidateAsync(orgId, userId, securityStamp, context.HttpContext.RequestAborted);
                        if (!isValid)
                        {
                            context.Fail("Token has been revoked or the user account is inactive.");
                        }
                    }
                };
            });
        services.AddIdentityAuthorizationPolicies();
        services.AddJwksEndpoint();

        services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc("v1", new OpenApiInfo { Title = "Pharmacy ERP API", Version = "v1" });
        });
        return services;
    }
}
