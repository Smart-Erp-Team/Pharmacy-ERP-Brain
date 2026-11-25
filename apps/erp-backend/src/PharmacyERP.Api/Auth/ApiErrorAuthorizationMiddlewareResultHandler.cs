using Microsoft.AspNetCore.Authorization.Policy;

namespace PharmacyERP.Api.Auth;

/// <summary>
/// Intercepts authorization middleware rejections (<c>401 Unauthorized</c> and <c>403 Forbidden</c>)
/// so every failed <c>[Authorize]</c>, role, or policy check returns a standardized
/// <see cref="ApiErrorEnvelopeDto"/> JSON payload rather than an empty body.
/// </summary>
public sealed class ApiErrorAuthorizationMiddlewareResultHandler : IAuthorizationMiddlewareResultHandler
{
    private readonly AuthorizationMiddlewareResultHandler _defaultHandler = new();

    public async Task HandleAsync(
        RequestDelegate next,
        HttpContext context,
        AuthorizationPolicy policy,
        PolicyAuthorizationResult authorizeResult)
    {
        if (authorizeResult.Challenged)
        {
            await WriteAuthErrorAsync(
                context,
                StatusCodes.Status401Unauthorized,
                ErrorCode.UNAUTHORIZED,
                ErrorMessages.Unauthorized,
                includeBearerChallengeHeader: true);
            return;
        }

        if (authorizeResult.Forbidden)
        {
            await WriteAuthErrorAsync(
                context,
                StatusCodes.Status403Forbidden,
                ErrorCode.FORBIDDEN,
                ErrorMessages.Forbidden,
                includeBearerChallengeHeader: false);
            return;
        }

        await _defaultHandler.HandleAsync(next, context, policy, authorizeResult);
    }

    internal static async Task WriteAuthErrorAsync(
        HttpContext context,
        int statusCode,
        ErrorCode errorCode,
        string message,
        bool includeBearerChallengeHeader)
    {
        if (context.Response.HasStarted || context.RequestAborted.IsCancellationRequested)
        {
            return;
        }

        if (includeBearerChallengeHeader && !context.Response.Headers.ContainsKey("WWW-Authenticate"))
        {
            context.Response.Headers.WWWAuthenticate = "Bearer";
        }

        var traceId = context.Items["TraceId"]?.ToString()
            ?? context.TraceIdentifier
            ?? Guid.NewGuid().ToString();

        var envelope = new ApiErrorEnvelopeDto(
            new ApiErrorBodyDto(
                errorCode.ToString(),
                message,
                Array.Empty<ApiErrorDetailDto>(),
                traceId));

        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync(
            JsonSerializer.Serialize(envelope, DependencyInjection.ApiJsonSerializerOptions),
            context.RequestAborted);
    }
}
