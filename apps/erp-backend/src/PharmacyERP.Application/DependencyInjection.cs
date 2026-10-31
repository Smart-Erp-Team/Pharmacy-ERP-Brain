using Microsoft.Extensions.DependencyInjection;
using PharmacyERP.Application.Common.Interfaces.Integration;
using PharmacyERP.Application.Features.Integration.Services.Implementations;
using PharmacyERP.Application.Features.Integration.Services.Interfaces;
using PharmacyERP.Application.Features.Inventory.Services.Implementations;
using PharmacyERP.Application.Features.Inventory.Services.Interfaces;

namespace PharmacyERP.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddScoped<IIdempotencyService, IdempotencyService>();
        services.AddScoped<IOutboxService, OutboxService>();
        services.AddScoped<IAuditLogger, AuditLogger>();
        services.AddScoped<ICanonicalCapabilitiesService, CanonicalCapabilitiesService>();

        // Inventory Application Services
        services.AddScoped<IInventoryLocationService, InventoryLocationService>();
        services.AddScoped<IInventoryQueryService, InventoryQueryService>();
        services.AddScoped<IInventoryAdjustmentService, InventoryAdjustmentService>();

        return services;
    }
}