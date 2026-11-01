using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using PharmacyERP.Application.Features.Identity.Interfaces;
using PharmacyERP.Domain.Entities.Identity;
using PharmacyERP.Infrastructure;
using PharmacyERP.Infrastructure.Auth;
using PharmacyERP.Infrastructure.Persistence.Repositories.Identity;

namespace PharmacyERP.UnitTests.Infrastructure;

public sealed class IdentityDependencyInjectionTests
{
    [Fact]
    public void AddInfrastructureServices_RegistersIdentityDependenciesWithExpectedLifetimes()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().Build();

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

    private static void AssertScoped<TService, TImplementation>(IServiceCollection services)
    {
        var descriptor = Assert.Single(services, x => x.ServiceType == typeof(TService));
        Assert.Equal(typeof(TImplementation), descriptor.ImplementationType);
        Assert.Equal(ServiceLifetime.Scoped, descriptor.Lifetime);
    }
}
