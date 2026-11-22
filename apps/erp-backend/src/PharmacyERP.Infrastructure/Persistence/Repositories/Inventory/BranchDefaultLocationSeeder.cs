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
    private static readonly string[] DefaultLocationCodes =
    {
        "MAIN-SELLABLE",
        "MAIN-QUARANTINE",
        "MAIN-SCRAP"
    };

    private readonly IInventoryLocationRepository _locationRepository;

    public BranchDefaultLocationSeeder(IInventoryLocationRepository locationRepository)
    {
        _locationRepository = locationRepository;
    }

    public async Task SeedDefaultLocationsAsync(Guid organizationId, Guid branchId, CancellationToken ct = default)
    {
        var now = DateTimeOffset.UtcNow;
        var existingCodes = await _locationRepository.GetExistingCodesAsync(organizationId, branchId, DefaultLocationCodes, ct);
        var locationsToSeed = new List<InventoryLocation>(3);

        if (!existingCodes.Contains("MAIN-SELLABLE"))
        {
            locationsToSeed.Add(InventoryLocation.CreateDefaultSellable(organizationId, branchId, now));
        }

        if (!existingCodes.Contains("MAIN-QUARANTINE"))
        {
            locationsToSeed.Add(InventoryLocation.CreateDefaultQuarantine(organizationId, branchId, now));
        }

        if (!existingCodes.Contains("MAIN-SCRAP"))
        {
            locationsToSeed.Add(InventoryLocation.CreateDefaultScrap(organizationId, branchId, now));
        }

        if (locationsToSeed.Count > 0)
        {
            await _locationRepository.AddRangeAsync(locationsToSeed, ct);
        }
    }
}
