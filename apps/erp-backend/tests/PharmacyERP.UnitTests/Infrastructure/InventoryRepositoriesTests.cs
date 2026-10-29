using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using PharmacyERP.Domain.Entities.Inventory;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Infrastructure.Persistence.Database;
using PharmacyERP.Infrastructure.Persistence.Repositories.Inventory;
using Xunit;

namespace PharmacyERP.UnitTests.Infrastructure;

public class InventoryRepositoriesTests
{
    private readonly PharmacyDbContext _context;

    public InventoryRepositoriesTests()
    {
        var options = new DbContextOptionsBuilder<PharmacyDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new PharmacyDbContext(options);
    }

    [Fact]
    public async Task BranchDefaultLocationSeeder_SeedsThreeDefaultLocations()
    {
        var orgId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        var locRepo = new InventoryLocationRepository(_context);
        var seeder = new BranchDefaultLocationSeeder(locRepo);

        await seeder.SeedDefaultLocationsAsync(orgId, branchId);
        await _context.SaveChangesAsync();

        var locations = await _context.InventoryLocations.ToListAsync();
        Assert.Equal(3, locations.Count);
        Assert.Contains(locations, l => l.LocationCode == "MAIN-SELLABLE" && l.LocationType == LocationType.SELLABLE);
        Assert.Contains(locations, l => l.LocationCode == "MAIN-QUARANTINE" && l.LocationType == LocationType.QUARANTINE);
        Assert.Contains(locations, l => l.LocationCode == "MAIN-SCRAP" && l.LocationType == LocationType.SCRAP);
    }

    [Fact]
    public async Task NonLotBatchInitializer_IdempotentCreation_DoesNotDuplicate()
    {
        var orgId = Guid.NewGuid();
        var productId = Guid.NewGuid();
        var batchRepo = new InventoryBatchRepository(_context);
        var initializer = new NonLotBatchInitializer(batchRepo);

        await initializer.EnsureNonLotBatchCreatedAsync(orgId, productId);
        await _context.SaveChangesAsync();

        // Second call should not duplicate
        await initializer.EnsureNonLotBatchCreatedAsync(orgId, productId);
        await _context.SaveChangesAsync();

        var batches = await _context.InventoryBatches.ToListAsync();
        Assert.Single(batches);
        Assert.Equal("NON-LOT", batches[0].BatchNumber);
    }

    [Fact]
    public async Task InventoryBatchRepository_GetOrCreateBatchAsync_DeterministicIdMatching()
    {
        var orgId = Guid.NewGuid();
        var productId = Guid.NewGuid();
        var expiresOn = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));
        var repo = new InventoryBatchRepository(_context);

        var batch1 = await repo.GetOrCreateBatchAsync(orgId, productId, "LOT-100", expiresOn, null);
        await _context.SaveChangesAsync();

        var batch2 = await repo.GetOrCreateBatchAsync(orgId, productId, "LOT-100", expiresOn, null);

        Assert.Equal(batch1.BatchId, batch2.BatchId);
        Assert.Equal(1, await _context.InventoryBatches.CountAsync());
    }
}