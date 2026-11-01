using Microsoft.Extensions.DependencyInjection;
using PharmacyERP.Application;
using PharmacyERP.Application.Common.Interfaces.CrossModule;
using PharmacyERP.Application.Features.Catalog.Services.Implementations;
using Xunit;

namespace PharmacyERP.UnitTests.Application.Catalog;

public class TemporaryImplementationsTests
{
    [Fact]
    public async Task TemporaryProductInventoryUsageChecker_AlwaysReturnsTrue_AsSafeDefault()
    {
        var checker = new TemporaryProductInventoryUsageChecker();
        var orgId = Guid.NewGuid();
        var productId = Guid.NewGuid();
        var uomId = Guid.NewGuid();

        var productResult = await checker.HasAnyStockOrPostedHistoryForProductAsync(orgId, productId);
        var uomResult = await checker.HasAnyStockOrDocumentReferenceForUomAsync(orgId, productId, uomId);

        Assert.True(productResult);
        Assert.True(uomResult);
    }

    [Fact]
    public async Task TemporaryNonLotBatchInitializer_CompletesSuccessfully_WithoutThrowing()
    {
        var initializer = new TemporaryNonLotBatchInitializer();
        var orgId = Guid.NewGuid();
        var productId = Guid.NewGuid();

        var task = initializer.EnsureNonLotBatchExistsAsync(orgId, productId);
        await task;

        Assert.True(task.IsCompletedSuccessfully);
    }

    [Fact]
    public void DependencyInjection_TemporaryImplementations_RegisteredViaTryAdd_AllowsPrecedence()
    {
        var services = new ServiceCollection();

        // 1. Register a custom mock/dummy implementation BEFORE AddApplicationServices
        var customChecker = new CustomUsageChecker();
        services.AddScoped<IProductInventoryUsageChecker>(_ => customChecker);

        // 2. Call AddApplicationServices
        services.AddApplicationServices();

        var provider = services.BuildServiceProvider();
        var resolvedChecker = provider.GetRequiredService<IProductInventoryUsageChecker>();
        var resolvedInitializer = provider.GetRequiredService<INonLotBatchInitializer>();

        // Custom implementation was NOT replaced by TemporaryProductInventoryUsageChecker
        Assert.Same(customChecker, resolvedChecker);
        // Initializer defaulted to TemporaryNonLotBatchInitializer
        Assert.IsType<TemporaryNonLotBatchInitializer>(resolvedInitializer);
    }

    private sealed class CustomUsageChecker : IProductInventoryUsageChecker
    {
        public Task<bool> HasAnyStockOrPostedHistoryForProductAsync(Guid organizationId, Guid productId, CancellationToken ct = default) =>
            Task.FromResult(false);

        public Task<bool> HasAnyStockOrDocumentReferenceForUomAsync(Guid organizationId, Guid productId, Guid productUomId, CancellationToken ct = default) =>
            Task.FromResult(false);
    }
}

