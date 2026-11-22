namespace PharmacyERP.Api.Middleware;

/// <summary>
/// Binds the scoped <see cref="ITenantContext"/> from the authenticated JWT's <c>organization_id</c>
/// claim (must run after <c>UseAuthentication</c>). Enables temporary system bypass only for
/// allow-listed anonymous discovery and provisioning paths when no tenant claim is present.
/// </summary>
public class TenantResolutionMiddleware
{
    private readonly RequestDelegate _next;

    private static readonly string[] SystemBypassPathPrefixes =
    {
        "/api/v1/auth/login",
        "/api/v1/auth/refresh",
        "/api/v1/branch-enrollment",
        "/api/v1/organizations",
        "/api/v1/canonical/capabilities"
    };

    public TenantResolutionMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, ITenantContext tenantContext)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var organizationIdClaim = context.User.FindFirst("organization_id")?.Value;
            if (Guid.TryParse(organizationIdClaim, out var organizationId) && organizationId != Guid.Empty)
            {
                tenantContext.SetTenant(organizationId);
            }
        }

        // Only unbound requests targeting approved anonymous/provisioning routes may enable system bypass.
        if (!tenantContext.IsTenantBound && IsSystemBypassPath(context.Request.Path.Value))
        {
            tenantContext.AllowSystemBypass();
        }

        await _next(context);
    }

    private static bool IsSystemBypassPath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return false;
        }

        return SystemBypassPathPrefixes.Any(prefix =>
            path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
    }
}