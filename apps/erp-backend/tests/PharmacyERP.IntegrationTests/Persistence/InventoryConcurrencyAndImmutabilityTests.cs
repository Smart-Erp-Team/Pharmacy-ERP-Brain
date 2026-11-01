using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Domain.Entities.Inventory;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Domain.Exceptions;
using PharmacyERP.Infrastructure.Persistence.Database;
using Xunit;

namespace PharmacyERP.IntegrationTests.Persistence;

public class InventoryConcurrencyAndImmutabilityTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public InventoryConcurrencyAndImmutabilityTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Concurrent_OutgoingAdjustments_ShouldPreventNegativeStock_And_ThrowConcurrencyException()
    {
        
        var orgId = Guid.NewGuid();
        var locId = Guid.NewGuid();
        var batchId = Guid.NewGuid();

        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();

        var stock = StockBalance.CreateInitial(orgId, locId, batchId, 10m, 50m, DateTimeOffset.UtcNow);
        dbContext.StockBalances.Add(stock);
        await dbContext.SaveChangesAsync();

        var task1 = SimulateOutgoingAdjustmentAsync(orgId, locId, batchId, 8m);
        var task2 = SimulateOutgoingAdjustmentAsync(orgId, locId, batchId, 8m);

        
        var results = await Task.WhenAll(task1, task2);

        
        var successCount = results.Count(r => r.IsSuccess);
        var failureCount = results.Count(r => !r.IsSuccess);

        Assert.Equal(1, successCount);
        Assert.Equal(1, failureCount);

        
        var finalStock = await dbContext.StockBalances.AsNoTracking()
            .FirstAsync(s => s.LocationId == locId && s.BatchId == batchId);

        Assert.Equal(2m, finalStock.OnHandQtyBase);
    }

    [Fact]
    public async Task PostedTransaction_Mutation_ShouldThrowException()
    {
        
        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<PharmacyDbContext>();

        var orgId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        var employeeId = Guid.NewGuid();
        var txn = InventoryTxn.CreatePosted(
            orgId,
            branchId,
            "TEST-POSTED-1",
            InventoryTransactionType.ADJUSTMENT_IN,
            Guid.NewGuid().ToString(),
            employeeId,
            DateTimeOffset.UtcNow);

        dbContext.InventoryTxns.Add(txn);
        await dbContext.SaveChangesAsync();

       
        Func<Task> act = async () =>
        {
            txn.AddLine(
                Guid.NewGuid(),
                Guid.NewGuid(),
                Guid.NewGuid(),
                Guid.NewGuid(),
                1m,
                1m,
                1m,
                1m);
            await dbContext.SaveChangesAsync();
        };

        
        await Assert.ThrowsAsync<Exception>(act);
    }

    private async Task<(bool IsSuccess, Exception? Error)> SimulateOutgoingAdjustmentAsync(Guid orgId, Guid locId, Guid batchId, decimal qty)
    {
        using var scope = _factory.Services.CreateScope();
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