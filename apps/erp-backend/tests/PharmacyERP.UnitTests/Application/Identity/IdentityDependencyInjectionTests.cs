using Microsoft.Extensions.DependencyInjection;
using PharmacyERP.Application;
using PharmacyERP.Application.Features.Identity.Services.Implementations;
using PharmacyERP.Application.Features.Identity.Services.Interfaces;

namespace PharmacyERP.UnitTests.Application.Identity;

public sealed class IdentityDependencyInjectionTests
{
    [Fact]
    public void AddApplicationServices_RegistersAllIdentityServicesAsScoped()
    {
        var services = new ServiceCollection();

        services.AddApplicationServices();

        AssertScoped<IOrganizationProvisioningService, OrganizationProvisioningService>(services);
        AssertScoped<IAuthService, AuthService>(services);
        AssertScoped<IBranchService, BranchService>(services);
        AssertScoped<IEmployeeService, EmployeeService>(services);
        AssertScoped<IUserService, UserService>(services);
    }

    private static void AssertScoped<TService, TImplementation>(IServiceCollection services)
    {
        var descriptor = Assert.Single(services, x => x.ServiceType == typeof(TService));
        Assert.Equal(typeof(TImplementation), descriptor.ImplementationType);
        Assert.Equal(ServiceLifetime.Scoped, descriptor.Lifetime);
    }
}
