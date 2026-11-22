using PharmacyERP.Domain.Exceptions;
using PharmacyERP.IntegrationTests.Api;

namespace PharmacyERP.IntegrationTests.Persistence;

public class InventoryConcurrencyAndImmutabilityTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public InventoryConcurrencyAndImmutabilityTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task Concurrent_OutgoingAdjustments_ShouldPreventNegativeStock_And_ThrowConcurrencyException()
    {
        var orgId = _factory.DefaultOrganizationId;
        var locId = _factory.DefaultLocationId;
        var batchId = _factory.DefaultBatchId;

        using (var seedScope = _factory.Services.CreateScope())
        {
            var tenantContext = seedScope.ServiceProvider.GetRequiredService<ITenantContext>();
            tenantContext.SetTenant(orgId);
            var uow = seedScope.ServiceProvider.GetRequiredService<IUnitOfWork>();
            var dbContext = seedScope.ServiceProvider.GetRequiredService<PharmacyDbContext>();

            await uow.BeginTransactionAsync();
            var stock = StockBalance.CreateInitial(orgId, locId, batchId, 10m, 50m, DateTimeOffset.UtcNow);
            dbContext.StockBalances.Add(stock);
            await uow.CommitTransactionAsync();
        }

        var task1 = SimulateOutgoingAdjustmentAsync(orgId, locId, batchId, 8m);
        var task2 = SimulateOutgoingAdjustmentAsync(orgId, locId, batchId, 8m);

        var results = await Task.WhenAll(task1, task2);

        var successCount = results.Count(r => r.IsSuccess);
        var failureCount = results.Count(r => !r.IsSuccess);

        Assert.Equal(1, successCount);
        Assert.Equal(1, failureCount);

        using (var verifyScope = _factory.Services.CreateScope())
        {
            var tenantContext = verifyScope.ServiceProvider.GetRequiredService<ITenantContext>();
            tenantContext.SetTenant(orgId);
            var uow = verifyScope.ServiceProvider.GetRequiredService<IUnitOfWork>();
            var dbContext = verifyScope.ServiceProvider.GetRequiredService<PharmacyDbContext>();

            await uow.BeginTransactionAsync();
            try
            {
                var finalStock = await dbContext.StockBalances.AsNoTracking()
                    .FirstAsync(s => s.LocationId == locId && s.BatchId == batchId);

                Assert.Equal(2m, finalStock.OnHandQtyBase);
            }
            finally
            {
                await uow.RollbackTransactionAsync();
            }
        }
    }

    [SkipWhenPostgresUnavailableFact]
    public async Task PostedTransaction_Mutation_ShouldThrowException()
    {
        using var scope = _factory.Services.CreateScope();
        var tenantContext = scope.ServiceProvider.GetRequiredService<ITenantContext>();
        var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var dbContext = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();

        var orgId = _factory.DefaultOrganizationId;
        var branchId = _factory.DefaultBranchId;
        var employeeId = _factory.DefaultEmployeeId;

        tenantContext.SetTenant(orgId);
        await uow.BeginTransactionAsync();
        var txn = InventoryTxn.CreatePosted(
            orgId,
            branchId,
            "TEST-POSTED-1",
            InventoryTransactionType.ADJUSTMENT_IN,
            Guid.NewGuid().ToString(),
            employeeId,
            DateTimeOffset.UtcNow);

        dbContext.InventoryTxns.Add(txn);
        await uow.CommitTransactionAsync();

        Func<Task> act = async () =>
        {
            await uow.BeginTransactionAsync();
            try
            {
                txn.AddLine(
                    _factory.DefaultProductId,
                    _factory.DefaultProductUomId,
                    _factory.DefaultLocationId,
                    _factory.DefaultBatchId,
                    1m,
                    1m,
                    1m,
                    1m);
                await uow.CommitTransactionAsync();
            }
            finally
            {
                await uow.RollbackTransactionAsync();
            }
        };

        await Assert.ThrowsAnyAsync<Exception>(act);
    }

    private async Task<(bool IsSuccess, Exception? Error)> SimulateOutgoingAdjustmentAsync(Guid orgId, Guid locId, Guid batchId, decimal qty)
    {
        using var scope = _factory.Services.CreateScope();
        var tenantContext = scope.ServiceProvider.GetRequiredService<ITenantContext>();
        tenantContext.SetTenant(orgId);
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var dbContext = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();

        try
        {
            await unitOfWork.BeginTransactionAsync(default);

            var balance = await dbContext.StockBalances
                .FromSqlRaw("SELECT * FROM inventory.\"STOCK_BALANCE\" WHERE organization_id = {0} AND location_id = {1} AND batch_id = {2} FOR UPDATE", orgId, locId, batchId)
                .SingleAsync();

            balance.ApplyOutgoingStock(qty, DateTimeOffset.UtcNow); 

            await unitOfWork.CommitTransactionAsync(default);
            return (true, null);
        }
        catch (Exception ex)
        {
            await unitOfWork.RollbackTransactionAsync(default);
            return (false, ex);
        }
    }
}
