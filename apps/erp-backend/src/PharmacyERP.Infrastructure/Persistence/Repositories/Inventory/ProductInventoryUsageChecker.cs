using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using PharmacyERP.Application.Common.Interfaces.CrossModule;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Infrastructure.Persistence.Database;

namespace PharmacyERP.Infrastructure.Persistence.Repositories.Inventory;

public class ProductInventoryUsageChecker : IProductInventoryUsageChecker2
{
    private readonly PharmacyDbContext _context;

    public ProductInventoryUsageChecker(PharmacyDbContext context)
    {
        _context = context;
    }

    public async Task<bool> HasInventoryUsageAsync(Guid organizationId, Guid productId, Guid? productUomId = null, CancellationToken ct = default)
    {
        // 1. Check active stock balance
        var hasStock = await _context.StockBalances
            .AnyAsync(sb => sb.OrganizationId == organizationId
                         && sb.Batch.ProductId == productId
                         && sb.OnHandQtyBase > 0, ct);

        if (hasStock) return true;

        // 2. Check posted inventory transaction lines
        var query = _context.InventoryTxnLines
            .Where(l => l.OrganizationId == organizationId
                     && l.ProductId == productId
                     && l.InventoryTxn.Status == InventoryTransactionStatus.POSTED);

        if (productUomId.HasValue)
        {
            query = query.Where(l => l.ProductUomId == productUomId.Value);
        }

        return await query.AnyAsync(ct);
    }
}