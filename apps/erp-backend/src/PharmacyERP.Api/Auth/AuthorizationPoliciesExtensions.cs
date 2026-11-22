namespace PharmacyERP.Api.Auth;

public static class AuthorizationPoliciesExtensions
{
    public static IServiceCollection AddIdentityAuthorizationPolicies(this IServiceCollection services)
    {
        services.AddAuthorization(options =>
        {
            options.AddPolicy("AdminOnly", policy => policy.RequireAuthenticatedUser().RequireRole("Admin"));
            options.AddPolicy("OrgAdminOnly", policy => policy.RequireAuthenticatedUser().RequireRole("Admin").RequireClaim("branch_scope", "ALL"));
            options.AddPolicy("PlatformProvisionerOnly", policy => policy.RequireAuthenticatedUser().RequireRole("PlatformProvisioner"));
        });
        return services;
    }
}
