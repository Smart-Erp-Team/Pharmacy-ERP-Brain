using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Inventory.Interfaces;
using PharmacyERP.Domain.Entities.Inventory;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Infrastructure.Persistence.Database;

namespace PharmacyERP.Infrastructure.Persistence.Repositories.Inventory;

public class InventoryTxnRepository : IInventoryTxnRepository
{
    private readonly PharmacyDbContext _context;

    public InventoryTxnRepository(PharmacyDbContext context)
    {
        _context = context;
    }

    public async Task<InventoryTxn?> GetByIdWithLinesAsync(Guid organizationId, Guid branchId, Guid inventoryTxnId, CancellationToken ct = default)
    {
        return await _context.InventoryTxns
            .Include(t => t.Lines)
            .FirstOrDefaultAsync(t => t.OrganizationId == organizationId && t.BranchId == branchId && t.InventoryTxnId == inventoryTxnId, ct);
    }

    public async Task<PagedResult<InventoryTxn>> GetPagedAsync(
        Guid organizationId,
        Guid branchId,
        InventoryTransactionType? type,
        Guid? productId,
        DateTimeOffset? fromDate,
        DateTimeOffset? toDate,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var query = _context.InventoryTxns
            .Include(t => t.Lines)
            .Where(t => t.OrganizationId == organizationId && t.BranchId == branchId);

        if (type.HasValue)
        {
            query = query.Where(t => t.TransactionType == type.Value);
        }

        if (productId.HasValue)
        {
            query = query.Where(t => t.Lines.Any(l => l.ProductId == productId.Value));
        }

        if (fromDate.HasValue)
        {
            query = query.Where(t => t.CreatedAt >= fromDate.Value);
        }

        if (toDate.HasValue)
        {
            query = query.Where(t => t.CreatedAt <= toDate.Value);
        }

        var totalCount = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(t => t.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<InventoryTxn>(items, totalCount, page, pageSize);
    }

    public async Task AddAsync(InventoryTxn txn, CancellationToken ct = default)
    {
        await _context.InventoryTxns.AddAsync(txn, ct);
    }
}