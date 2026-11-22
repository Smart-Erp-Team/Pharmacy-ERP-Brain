using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using PharmacyERP.Application.Features.Inventory.Interfaces;
using PharmacyERP.Domain.Entities.Inventory;
using PharmacyERP.Infrastructure.Persistence.Database;

namespace PharmacyERP.Infrastructure.Persistence.Repositories.Inventory;

public class StockBalanceRepository : IStockBalanceRepository
{
    private readonly PharmacyDbContext _context;

    public StockBalanceRepository(PharmacyDbContext context)
    {
        _context = context;
    }

    public async Task<StockBalance?> GetForUpdateAsync(Guid organizationId, Guid locationId, Guid batchId, CancellationToken ct = default)
    {
        var localAdded = _context.StockBalances.Local.FirstOrDefault(sb =>
            sb.OrganizationId == organizationId
            && sb.LocationId == locationId
            && sb.BatchId == batchId
            && _context.Entry(sb).State == EntityState.Added);
        if (localAdded != null)
        {
            return localAdded;
        }

        if (_context.Database.IsRelational())
        {
            var balances = await _context.StockBalances
                .FromSqlInterpolated(
                    $@"SELECT * FROM inventory.""STOCK_BALANCE""
                       WHERE organization_id = {organizationId} AND location_id = {locationId} AND batch_id = {batchId}
                       FOR UPDATE")
                .IgnoreQueryFilters()
                .ToListAsync(ct);

            return balances.FirstOrDefault();
        }

        return await _context.StockBalances
            .FirstOrDefaultAsync(sb => sb.OrganizationId == organizationId && sb.LocationId == locationId && sb.BatchId == batchId, ct);
    }

    public async Task<StockBalance> GetOrCreateForUpdateAsync(
        Guid organizationId,
        Guid locationId,
        Guid batchId,
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        var local = _context.StockBalances.Local.FirstOrDefault(sb =>
            sb.OrganizationId == organizationId && sb.LocationId == locationId && sb.BatchId == batchId);
        if (local != null && _context.Entry(local).State == EntityState.Added)
        {
            return local;
        }

        if (_context.Database.IsRelational())
        {
            await _context.Database.ExecuteSqlInterpolatedAsync(
                $@"INSERT INTO inventory.""STOCK_BALANCE""
                   (organization_id, location_id, batch_id, on_hand_qty_base, average_unit_cost, row_version, updated_at)
                   VALUES ({organizationId}, {locationId}, {batchId}, 0, 0, 1, {now})
                   ON CONFLICT (organization_id, location_id, batch_id) DO NOTHING;", ct);

            var balances = await _context.StockBalances
                .FromSqlInterpolated(
                    $@"SELECT * FROM inventory.""STOCK_BALANCE""
                       WHERE organization_id = {organizationId} AND location_id = {locationId} AND batch_id = {batchId}
                       FOR UPDATE")
                .IgnoreQueryFilters()
                .ToListAsync(ct);

            if (balances.Count > 0)
            {
                return balances[0];
            }
        }

        var existing = local ?? await _context.StockBalances
            .FirstOrDefaultAsync(sb => sb.OrganizationId == organizationId && sb.LocationId == locationId && sb.BatchId == batchId, ct);
        if (existing != null)
        {
            return existing;
        }

        var created = StockBalance.CreateInitial(organizationId, locationId, batchId, 0m, 0m, now);
        await _context.StockBalances.AddAsync(created, ct);
        return created;
    }

    public async Task<IReadOnlyDictionary<(Guid LocationId, Guid BatchId), StockBalance>> GetOrCreateForUpdateBatchAsync(
        Guid organizationId,
        IReadOnlyCollection<(Guid LocationId, Guid BatchId)> keys,
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        var result = new Dictionary<(Guid LocationId, Guid BatchId), StockBalance>();
        if (keys.Count == 0)
        {
            return result;
        }

        var orderedKeys = keys
            .Distinct()
            .OrderBy(k => k.LocationId)
            .ThenBy(k => k.BatchId)
            .ToList();

        var keysToQuery = new List<(Guid LocationId, Guid BatchId)>(orderedKeys.Count);
        foreach (var key in orderedKeys)
        {
            var local = _context.StockBalances.Local.FirstOrDefault(sb =>
                sb.OrganizationId == organizationId && sb.LocationId == key.LocationId && sb.BatchId == key.BatchId);
            if (local != null && _context.Entry(local).State == EntityState.Added)
            {
                result[key] = local;
            }
            else
            {
                keysToQuery.Add(key);
            }
        }

        if (keysToQuery.Count == 0)
        {
            return result;
        }

        if (_context.Database.IsRelational())
        {
            var locIds = keysToQuery.Select(k => k.LocationId).ToArray();
            var batchIds = keysToQuery.Select(k => k.BatchId).ToArray();

            await _context.Database.ExecuteSqlInterpolatedAsync(
                $@"INSERT INTO inventory.""STOCK_BALANCE""
                   (organization_id, location_id, batch_id, on_hand_qty_base, average_unit_cost, row_version, updated_at)
                   SELECT {organizationId}, k.location_id, k.batch_id, 0, 0, 1, {now}
                   FROM unnest({locIds}, {batchIds}) AS k(location_id, batch_id)
                   ON CONFLICT (organization_id, location_id, batch_id) DO NOTHING;", ct);

            var lockedBalances = await _context.StockBalances
                .FromSqlInterpolated(
                    $@"SELECT sb.*
                       FROM inventory.""STOCK_BALANCE"" sb
                       INNER JOIN unnest({locIds}, {batchIds}) AS k(location_id, batch_id)
                           ON sb.location_id = k.location_id AND sb.batch_id = k.batch_id
                       WHERE sb.organization_id = {organizationId}
                       ORDER BY sb.location_id ASC, sb.batch_id ASC
                       FOR UPDATE OF sb")
                .IgnoreQueryFilters()
                .ToListAsync(ct);

            foreach (var sb in lockedBalances)
            {
                result[(sb.LocationId, sb.BatchId)] = sb;
            }

            return result;
        }

        var locIdSet = keysToQuery.Select(k => k.LocationId).Distinct().ToList();
        var batchIdSet = keysToQuery.Select(k => k.BatchId).Distinct().ToList();
        var existingRows = await _context.StockBalances
            .Where(sb => sb.OrganizationId == organizationId && locIdSet.Contains(sb.LocationId) && batchIdSet.Contains(sb.BatchId))
            .ToListAsync(ct);

        foreach (var sb in existingRows)
        {
            result[(sb.LocationId, sb.BatchId)] = sb;
        }

        var missing = new List<StockBalance>();
        foreach (var key in keysToQuery)
        {
            if (!result.ContainsKey(key))
            {
                var created = StockBalance.CreateInitial(organizationId, key.LocationId, key.BatchId, 0m, 0m, now);
                missing.Add(created);
                result[key] = created;
            }
        }

        if (missing.Count > 0)
        {
            await _context.StockBalances.AddRangeAsync(missing, ct);
        }

        return result;
    }

    public async Task<IReadOnlyList<StockBalance>> GetBalancesWithDetailsAsync(
        Guid organizationId,
        Guid branchId,
        Guid? productId = null,
        Guid? locationId = null,
        Guid? batchId = null,
        CancellationToken ct = default)
    {
        IQueryable<StockBalance> query = _context.StockBalances
            .AsNoTracking()
            .Include(sb => sb.Location)
            .Include(sb => sb.Batch)
                .ThenInclude(batch => batch.Product)
                    .ThenInclude(product => product.ReorderRules.Where(r => r.BranchId == branchId && r.IsActive));

        if (_context.Database.IsRelational())
        {
            query = query.AsSplitQuery();
        }

        query = query.Where(sb => sb.OrganizationId == organizationId && sb.Location.BranchId == branchId);

        if (productId.HasValue)
        {
            query = query.Where(sb => sb.Batch.ProductId == productId.Value);
        }

        if (locationId.HasValue)
        {
            query = query.Where(sb => sb.LocationId == locationId.Value);
        }

        if (batchId.HasValue)
        {
            query = query.Where(sb => sb.BatchId == batchId.Value);
        }

        return await query
            .OrderBy(sb => sb.Batch.ProductId)
            .ThenBy(sb => sb.LocationId)
            .ThenBy(sb => sb.Batch.ExpiresOn)
            .ThenBy(sb => sb.BatchId)
            .Take(1000)
            .ToListAsync(ct);
    }

    public async Task<(IReadOnlyList<StockBalance> Balances, int TotalGroups, bool HasMore)> GetCanonicalInventoryPageAsync(
        Guid organizationId,
        Guid branchId,
        Guid? productId,
        DateTimeOffset? updatedSince,
        int offset,
        int pageSize,
        CancellationToken ct = default)
    {
        var baseQuery = _context.StockBalances
            .AsNoTracking()
            .Where(sb => sb.OrganizationId == organizationId && sb.Location.BranchId == branchId);

        if (productId.HasValue)
        {
            baseQuery = baseQuery.Where(sb => sb.Batch.ProductId == productId.Value);
        }

        if (updatedSince.HasValue)
        {
            baseQuery = baseQuery.Where(sb => sb.UpdatedAt >= updatedSince.Value);
        }

        var groupKeysQuery = baseQuery
            .Select(sb => new { sb.Batch.ProductId, sb.LocationId })
            .Distinct();

        var totalGroups = await groupKeysQuery.CountAsync(ct);
        if (totalGroups == 0)
        {
            return (Array.Empty<StockBalance>(), 0, false);
        }

        var safeOffset = Math.Max(0, offset);
        var safePageSize = Math.Clamp(pageSize, 1, 1000);

        var pageKeysPlusOne = await groupKeysQuery
            .OrderBy(k => k.ProductId)
            .ThenBy(k => k.LocationId)
            .Skip(safeOffset)
            .Take(safePageSize + 1)
            .ToListAsync(ct);

        var hasMore = pageKeysPlusOne.Count > safePageSize;
        var pageKeys = hasMore ? pageKeysPlusOne.Take(safePageSize).ToList() : pageKeysPlusOne;

        if (pageKeys.Count == 0)
        {
            return (Array.Empty<StockBalance>(), totalGroups, false);
        }

        var pageProductIds = pageKeys.Select(k => k.ProductId).Distinct().ToList();
        var pageLocationIds = pageKeys.Select(k => k.LocationId).Distinct().ToList();

        IQueryable<StockBalance> detailQuery = baseQuery
            .Include(sb => sb.Location)
            .Include(sb => sb.Batch)
                .ThenInclude(batch => batch.Product)
                    .ThenInclude(product => product.ReorderRules.Where(r => r.BranchId == branchId && r.IsActive));

        if (_context.Database.IsRelational())
        {
            detailQuery = detailQuery.AsSplitQuery();
        }

        var candidateBalances = await detailQuery
            .Where(sb => pageProductIds.Contains(sb.Batch.ProductId) && pageLocationIds.Contains(sb.LocationId))
            .OrderBy(sb => sb.Batch.ProductId)
            .ThenBy(sb => sb.LocationId)
            .ThenBy(sb => sb.Batch.ExpiresOn)
            .ThenBy(sb => sb.BatchId)
            .ToListAsync(ct);

        var keySet = pageKeys.Select(k => (k.ProductId, k.LocationId)).ToHashSet();
        var filteredBalances = candidateBalances
            .Where(sb => keySet.Contains((sb.Batch.ProductId, sb.LocationId)))
            .ToList();

        return (filteredBalances, totalGroups, hasMore);
    }

    public async Task AddAsync(StockBalance balance, CancellationToken ct = default)
    {
        await _context.StockBalances.AddAsync(balance, ct);
    }
}
