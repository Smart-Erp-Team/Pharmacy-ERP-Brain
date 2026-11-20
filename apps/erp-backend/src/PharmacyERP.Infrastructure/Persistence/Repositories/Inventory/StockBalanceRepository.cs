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
        // Executes row-level locking (FOR UPDATE) in PostgreSQL to prevent concurrent balance mutations
        var sql = @"SELECT * FROM inventory.""STOCK_BALANCE"" 
                    WHERE organization_id = {0} AND location_id = {1} AND batch_id = {2} 
                    FOR UPDATE";

        return await _context.StockBalances
            .FromSqlRaw(sql, organizationId, locationId, batchId)
            .FirstOrDefaultAsync(ct);
    }

    public async Task<IReadOnlyList<StockBalance>> GetBalancesWithDetailsAsync(
        Guid organizationId,
        Guid branchId,
        Guid? productId = null,
        Guid? locationId = null,
        Guid? batchId = null,
        CancellationToken ct = default)
    {
        var query = _context.StockBalances
            .Include(sb => sb.Location)
            .Include(sb => sb.Batch)
                .ThenInclude(batch => batch.Product)
                    .ThenInclude(product => product.ReorderRules)
            .Where(sb => sb.OrganizationId == organizationId && sb.Location.BranchId == branchId);

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

        return await query.ToListAsync(ct);
    }

    public async Task AddAsync(StockBalance balance, CancellationToken ct = default)
    {
        await _context.StockBalances.AddAsync(balance, ct);
    }
}