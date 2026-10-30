using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Inventory.Interfaces;
using PharmacyERP.Domain.Entities.Inventory;
using PharmacyERP.Domain.Enums;
using PharmacyERP.Domain.ValueObjects;
using PharmacyERP.Infrastructure.Persistence.Database;

namespace PharmacyERP.Infrastructure.Persistence.Repositories.Inventory;

public class InventoryBatchRepository : IInventoryBatchRepository
{
    private readonly PharmacyDbContext _context;

    public InventoryBatchRepository(PharmacyDbContext context)
    {
        _context = context;
    }

    public async Task<InventoryBatch?> GetByIdAsync(Guid organizationId, Guid productId, Guid batchId, CancellationToken ct = default)
    {
        return await _context.InventoryBatches
            .FirstOrDefaultAsync(b => b.OrganizationId == organizationId && b.ProductId == productId && b.BatchId == batchId, ct);
    }

    public async Task<InventoryBatch> GetOrCreateBatchAsync(
        Guid organizationId,
        Guid productId,
        string batchNumber,
        DateOnly? expiresOn,
        DateOnly? manufacturedOn,
        CancellationToken ct = default)
    {
        Guid computedBatchId = expiresOn.HasValue
            ? DeterministicBatchIdGenerator.Generate(organizationId, productId, batchNumber, expiresOn.Value)
            : DeterministicBatchIdGenerator.GenerateNonLotBatchId(organizationId, productId);

        var existingBatch = await GetByIdAsync(organizationId, productId, computedBatchId, ct);
        if (existingBatch != null)
        {
            return existingBatch;
        }

        InventoryBatch newBatch = expiresOn.HasValue
            ? InventoryBatch.CreateDatedBatch(organizationId, productId, batchNumber, expiresOn.Value, manufacturedOn)
            : InventoryBatch.CreateNonLotSystemBatch(organizationId, productId);

        await _context.InventoryBatches.AddAsync(newBatch, ct);
        return newBatch;
    }

    public async Task<PagedResult<InventoryBatch>> GetPagedAsync(
        Guid organizationId,
        Guid? productId,
        BatchQualityStatus? status,
        DateOnly? expiringBefore,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var query = _context.InventoryBatches.Where(b => b.OrganizationId == organizationId);

        if (productId.HasValue)
        {
            query = query.Where(b => b.ProductId == productId.Value);
        }

        if (status.HasValue)
        {
            query = query.Where(b => b.QualityStatus == status.Value);
        }

        if (expiringBefore.HasValue)
        {
            query = query.Where(b => b.ExpiresOn != null && b.ExpiresOn.Value <= expiringBefore.Value);
        }

        var totalCount = await query.CountAsync(ct);
        var items = await query
            .OrderBy(b => b.ExpiresOn)
            .ThenBy(b => b.BatchNumber)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<InventoryBatch>(items, totalCount, page, pageSize);
    }

    public async Task AddAsync(InventoryBatch batch, CancellationToken ct = default)
    {
        await _context.InventoryBatches.AddAsync(batch, ct);
    }
}