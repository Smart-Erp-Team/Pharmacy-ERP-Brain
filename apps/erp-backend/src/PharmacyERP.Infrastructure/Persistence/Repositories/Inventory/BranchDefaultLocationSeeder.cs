using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using PharmacyERP.Application.Common.Interfaces.CrossModule;
using PharmacyERP.Application.Features.Inventory.Interfaces;
using PharmacyERP.Domain.Entities.Inventory;

namespace PharmacyERP.Infrastructure.Persistence.Repositories.Inventory;

public class BranchDefaultLocationSeeder : IBranchDefaultLocationSeeder
{
    private readonly IInventoryLocationRepository _locationRepository;

    public BranchDefaultLocationSeeder(IInventoryLocationRepository locationRepository)
    {
        _locationRepository = locationRepository;
    }

    public async Task SeedDefaultLocationsAsync(Guid organizationId, Guid branchId, CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        var locationsToSeed = new List<InventoryLocation>();

        if (!await _locationRepository.ExistsByCodeAsync(organizationId, branchId, "MAIN-SELLABLE", null, ct))
        {
            locationsToSeed.Add(InventoryLocation.CreateDefaultSellable(organizationId, branchId, now));
        }

        if (!await _locationRepository.ExistsByCodeAsync(organizationId, branchId, "MAIN-QUARANTINE", null, ct))
        {
            locationsToSeed.Add(InventoryLocation.CreateDefaultQuarantine(organizationId, branchId, now));
        }

        if (!await _locationRepository.ExistsByCodeAsync(organizationId, branchId, "MAIN-SCRAP", null, ct))
        {
            locationsToSeed.Add(InventoryLocation.CreateDefaultScrap(organizationId, branchId, now));
        }

        if (locationsToSeed.Count > 0)
        {
            await _locationRepository.AddRangeAsync(locationsToSeed, ct);
        }
    }
}