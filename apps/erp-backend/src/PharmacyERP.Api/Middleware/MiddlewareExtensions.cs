using System;
using System.Linq;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using PharmacyERP.Infrastructure.Persistence.Security;
using PharmacyERP.Infrastructure.Persistence.Seeding;

namespace PharmacyERP.Api.Middleware;

public static class MiddlewareExtensions
{
    public static IApplicationBuilder UsePharmacyErpMiddlewares(this IApplicationBuilder app)
    {
        var environment = app.ApplicationServices.GetService<IHostEnvironment>();
        var configuration = app.ApplicationServices.GetService<IConfiguration>();
        var server = app.ApplicationServices.GetService<IServer>();
        var isTestHost = string.Equals(server?.GetType().Name, "TestServer", StringComparison.Ordinal);
        var hasDatabaseStartupCheck = app.ApplicationServices
            .GetServices<IHostedService>()
            .OfType<DatabaseSecurityStartupCheck>()
            .Any();

        if (!isTestHost
            && hasDatabaseStartupCheck
            && environment is not null
            && environment.IsDevelopment()
            && configuration?.GetValue<bool>("DevSeed:Enabled") == true)
        {
            using var scope = app.ApplicationServices.CreateScope();
            var seeder = scope.ServiceProvider.GetService<DevDatabaseSeeder>();
            seeder?.SeedAsync().GetAwaiter().GetResult();
        }

        if (!isTestHost && environment is not null && environment.IsDevelopment())
        {
            app.UseMiddleware<DevRequestErrorLogMiddleware>();
        }

        app.UseMiddleware<ExceptionHandlingMiddleware>();
        app.UseMiddleware<TraceparentMiddleware>();
        app.UseCors(DependencyInjection.DefaultCorsPolicyName);
        app.UseMiddleware<RuntimeModeGuardMiddleware>();
        app.UseHttpsRedirection();
        app.UseAuthentication();
        app.UseMiddleware<TenantResolutionMiddleware>();
        app.UseAuthorization();

        return app;
    }
}