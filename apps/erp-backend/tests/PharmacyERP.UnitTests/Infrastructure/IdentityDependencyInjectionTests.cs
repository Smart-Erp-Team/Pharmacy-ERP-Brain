using Microsoft.AspNetCore.Identity;
using PharmacyERP.Infrastructure;

namespace PharmacyERP.UnitTests.Infrastructure;

public sealed class IdentityDependencyInjectionTests
{
    [Fact]
    public void AddInfrastructureServices_RegistersIdentityDependenciesWithExpectedLifetimes()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = "Host=localhost;Database=erp_db;Username=erp_app;Password=test-only"
            })
            .Build();

        services.AddInfrastructureServices(configuration);

        AssertScoped<IOrganizationRepository, OrganizationRepository>(services);
        AssertScoped<IBranchRepository, BranchRepository>(services);
        AssertScoped<IEmployeeRepository, EmployeeRepository>(services);
        AssertScoped<IUserAccountRepository, UserAccountRepository>(services);
        AssertScoped<IBranchEnrollmentRepository, BranchEnrollmentRepository>(services);
        AssertScoped<IUserRefreshTokenRepository, UserRefreshTokenRepository>(services);
        AssertScoped<IPasswordHasherService, PasswordHasherService>(services);
        AssertScoped<IJwtTokenGenerator, JwtTokenGenerator>(services);
        AssertScoped<IUserPasswordStore<UserAccount>, TenantUserStore>(services);

        var keyProvider = Assert.Single(services, x => x.ServiceType == typeof(JwksKeyProvider));
        Assert.Equal(ServiceLifetime.Singleton, keyProvider.Lifetime);
    }

    [Fact]
    public void AddInfrastructureServices_ThrowsWhenDefaultConnectionStringIsMissing()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().Build();

        Assert.Throws<InvalidOperationException>(() => services.AddInfrastructureServices(configuration));
    }

    private static void AssertScoped<TService, TImplementation>(IServiceCollection services)
    {
        var descriptor = Assert.Single(services, x => x.ServiceType == typeof(TService));
        Assert.Equal(typeof(TImplementation), descriptor.ImplementationType);
        Assert.Equal(ServiceLifetime.Scoped, descriptor.Lifetime);
    }
}
