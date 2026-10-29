using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Inventory.Interfaces;
using PharmacyERP.Domain.Entities.Inventory;
using PharmacyERP.Infrastructure.Persistence.Database;

namespace PharmacyERP.Infrastructure.Persistence.Repositories.Inventory;

public class InventoryLocationRepository : IInventoryLocationRepository
{
    private readonly PharmacyDbContext _context;

    public InventoryLocationRepository(PharmacyDbContext context)
    {
        _context = context;
    }

    public async Task<InventoryLocation?> GetByIdAsync(Guid organizationId, Guid branchId, Guid locationId, CancellationToken ct = default)
    {
        return await _context.InventoryLocations
            .FirstOrDefaultAsync(l => l.OrganizationId == organizationId && l.BranchId == branchId && l.LocationId == locationId, ct);
    }

    public async Task<bool> ExistsByCodeAsync(Guid organizationId, Guid branchId, string locationCode, Guid? excludeLocationId = null, CancellationToken ct = default)
    {
        var query = _context.InventoryLocations
            .Where(l => l.OrganizationId == organizationId && l.BranchId == branchId && l.LocationCode == locationCode);

        if (excludeLocationId.HasValue)
        {
            query = query.Where(l => l.LocationId != excludeLocationId.Value);
        }

        return await query.AnyAsync(ct);
    }

    public async Task<PagedResult<InventoryLocation>> GetPagedAsync(Guid organizationId, Guid branchId, bool? isSellable, bool includeInactive, int page, int pageSize, CancellationToken ct = default)
    {
        var query = _context.InventoryLocations
            .Where(l => l.OrganizationId == organizationId && l.BranchId == branchId);

        if (isSellable.HasValue)
        {
            query = query.Where(l => l.IsSellable == isSellable.Value);
        }

        if (!includeInactive)
        {
            query = query.Where(l => l.IsActive);
        }

        var totalCount = await query.CountAsync(ct);
        var items = await query
            .OrderBy(l => l.LocationCode)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<InventoryLocation>(items, totalCount, page, pageSize);
    }

    public async Task AddRangeAsync(IEnumerable<InventoryLocation> locations, CancellationToken ct = default)
    {
        await _context.InventoryLocations.AddRangeAsync(locations, ct);
    }

    public async Task AddAsync(InventoryLocation location, CancellationToken ct = default)
    {
        await _context.InventoryLocations.AddAsync(location, ct);
    }
}