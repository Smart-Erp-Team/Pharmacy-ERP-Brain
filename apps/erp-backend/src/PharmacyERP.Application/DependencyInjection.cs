using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using PharmacyERP.Application.Common.Interfaces.CrossModule;
using PharmacyERP.Application.Common.Interfaces.Integration;
using PharmacyERP.Application.Features.Identity.Services.Implementations;
using PharmacyERP.Application.Features.Identity.Services.Interfaces;
using PharmacyERP.Application.Features.Identity.Services.Implementations;
using PharmacyERP.Application.Features.Identity.Services.Interfaces;
using PharmacyERP.Application.Features.Integration.Services.Implementations;
using PharmacyERP.Application.Features.Integration.Services.Interfaces;

namespace PharmacyERP.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddScoped<IIdempotencyService, IdempotencyService>();
        services.AddScoped<IOutboxService, OutboxService>();
        services.AddScoped<IAuditLogger, AuditLogger>();
        services.AddScoped<ICanonicalCapabilitiesService, CanonicalCapabilitiesService>();
        services.AddScoped<IOrganizationProvisioningService, OrganizationProvisioningService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IBranchService, BranchService>();
        services.AddScoped<IEmployeeService, EmployeeService>();
        services.AddScoped<IUserService, UserService>();

        // Catalog Services
        services.AddScoped<IProductCategoryService, ProductCategoryService>();
        services.AddScoped<IProductService, ProductService>();
        services.AddScoped<IProductUomService, ProductUomService>();
        services.AddScoped<IReorderRuleService, ReorderRuleService>();

        // Temporary Cross-Module Initializers / Checkers (fallback until Inventory module is implemented)
        services.TryAddScoped<INonLotBatchInitializer, TemporaryNonLotBatchInitializer>();
        services.TryAddScoped<IProductInventoryUsageChecker, TemporaryProductInventoryUsageChecker>();

        return services;
    }
}
