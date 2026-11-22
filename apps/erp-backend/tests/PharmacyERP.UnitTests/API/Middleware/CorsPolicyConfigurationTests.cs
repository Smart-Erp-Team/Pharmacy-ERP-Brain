using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Moq;
using PharmacyERP.Api;
using PharmacyERP.Api.Middleware;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Domain.Enums;
using Xunit;

namespace PharmacyERP.UnitTests.Api.Middleware;

public class CorsPolicyConfigurationTests
{
    [Fact]
    public void DefaultCorsPolicy_AllowsAnyOriginWithCredentials_WhenAllowedOriginsMissing()
    {
        var policy = ResolveDefaultPolicy(new Dictionary<string, string?>());

        Assert.NotNull(policy);
        Assert.True(policy.SupportsCredentials);
        Assert.False(policy.AllowAnyOrigin);
        Assert.True(policy.AllowAnyHeader);
        Assert.True(policy.AllowAnyMethod);
        Assert.True(policy.IsOriginAllowed("http://localhost:5173"));
        Assert.True(policy.IsOriginAllowed("https://any-frontend.example.com"));
    }

    [Fact]
    public void DefaultCorsPolicy_AllowsAnyOriginWithCredentials_WhenAllowedOriginsContainsWildcard()
    {
        var policy = ResolveDefaultPolicy(new Dictionary<string, string?>
        {
            ["Cors:AllowedOrigins:0"] = "*"
        });

        Assert.NotNull(policy);
        Assert.True(policy.SupportsCredentials);
        Assert.False(policy.AllowAnyOrigin);
        Assert.True(policy.AllowAnyHeader);
        Assert.True(policy.AllowAnyMethod);
        Assert.True(policy.IsOriginAllowed("http://localhost:3000"));
        Assert.True(policy.IsOriginAllowed("https://preview.pharmacy-erp.test"));
    }

    [Fact]
    public void DefaultCorsPolicy_RestrictsToConfiguredOrigins_WhenSpecificOriginsProvided()
    {
        var policy = ResolveDefaultPolicy(new Dictionary<string, string?>
        {
            ["Cors:AllowedOrigins:0"] = "https://erp.example.com",
            ["Cors:AllowedOrigins:1"] = "http://localhost:5173"
        });

        Assert.NotNull(policy);
        Assert.True(policy.SupportsCredentials);
        Assert.False(policy.AllowAnyOrigin);
        Assert.True(policy.AllowAnyHeader);
        Assert.True(policy.AllowAnyMethod);
        Assert.Contains("https://erp.example.com", policy.Origins);
        Assert.Contains("http://localhost:5173", policy.Origins);
        Assert.True(policy.IsOriginAllowed("https://erp.example.com"));
        Assert.True(policy.IsOriginAllowed("http://localhost:5173"));
        Assert.False(policy.IsOriginAllowed("https://unauthorized.example.com"));
    }

    [Fact]
    public async Task UsePharmacyErpMiddlewares_HandlesCorsPreflight_BeforeRuntimeModeGuardAndAuth()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Cors:AllowedOrigins:0"] = "*"
            })
            .Build();

        var runtimeModeMock = new Mock<IRuntimeModeProvider>();
        runtimeModeMock.SetupGet(x => x.CurrentMode).Returns(ErpRuntimeMode.BranchLocal);

        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddSingleton(runtimeModeMock.Object);
        services.AddApiServices();

        using var provider = services.BuildServiceProvider();

        var appBuilder = new ApplicationBuilder(provider);
        appBuilder.UsePharmacyErpMiddlewares();
        var pipeline = appBuilder.Build();

        var context = new DefaultHttpContext
        {
            RequestServices = provider
        };
        context.Request.Method = HttpMethods.Options;
        context.Request.Path = "/api/v1/organizations";
        context.Request.Headers["Origin"] = "http://localhost:5173";
        context.Request.Headers["Access-Control-Request-Method"] = HttpMethods.Post;
        context.Request.Headers["Access-Control-Request-Headers"] = "Authorization, Idempotency-Key";

        await pipeline(context);

        Assert.Equal(StatusCodes.Status204NoContent, context.Response.StatusCode);
        Assert.Equal("http://localhost:5173", context.Response.Headers["Access-Control-Allow-Origin"].ToString());
        Assert.Equal("true", context.Response.Headers["Access-Control-Allow-Credentials"].ToString());
        Assert.Contains("Authorization", context.Response.Headers["Access-Control-Allow-Headers"].ToString(), StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Idempotency-Key", context.Response.Headers["Access-Control-Allow-Headers"].ToString(), StringComparison.OrdinalIgnoreCase);
        runtimeModeMock.VerifyGet(x => x.CurrentMode, Times.Never);
    }

    private static CorsPolicy? ResolveDefaultPolicy(IDictionary<string, string?> configValues)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configValues)
            .Build();

        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddApiServices();

        using var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<CorsOptions>>().Value;
        return options.GetPolicy(DependencyInjection.DefaultCorsPolicyName);
    }
}
