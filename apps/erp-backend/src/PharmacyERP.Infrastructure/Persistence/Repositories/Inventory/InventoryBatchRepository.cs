using System;
using System.Collections.Generic;
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
        var local = _context.InventoryBatches.Local.FirstOrDefault(b =>
            b.OrganizationId == organizationId && b.ProductId == productId && b.BatchId == batchId);
        if (local != null)
        {
            return local;
        }

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

        var localBatch = _context.InventoryBatches.Local.FirstOrDefault(b =>
            b.OrganizationId == organizationId && b.ProductId == productId && b.BatchId == computedBatchId);
        if (localBatch != null)
        {
            return localBatch;
        }

        InventoryBatch candidateBatch = expiresOn.HasValue
            ? InventoryBatch.CreateDatedBatch(organizationId, productId, batchNumber, expiresOn.Value, manufacturedOn)
            : InventoryBatch.CreateNonLotSystemBatch(organizationId, productId);

        if (_context.Database.IsRelational())
        {
            var productExistsInDb = await _context.Products
                .AsNoTracking()
                .AnyAsync(p => p.OrganizationId == organizationId && p.ProductId == productId, ct);

            if (productExistsInDb)
            {
                var qualityStatus = candidateBatch.QualityStatus.ToString();
                await _context.Database.ExecuteSqlInterpolatedAsync(
                    $@"INSERT INTO inventory.""INVENTORY_BATCH""
                       (batch_id, organization_id, product_id, batch_number, manufactured_on, expires_on, quality_status, created_at, updated_at)
                       VALUES ({candidateBatch.BatchId}, {candidateBatch.OrganizationId}, {candidateBatch.ProductId}, {candidateBatch.BatchNumber}, {candidateBatch.ManufacturedOn}, {candidateBatch.ExpiresOn}, {qualityStatus}, {candidateBatch.CreatedAt}, {candidateBatch.UpdatedAt})
                       ON CONFLICT DO NOTHING;", ct);

                var persisted = await _context.InventoryBatches
                    .FirstOrDefaultAsync(b => b.OrganizationId == organizationId && b.ProductId == productId && b.BatchId == candidateBatch.BatchId, ct);
                if (persisted != null)
                {
                    return persisted;
                }
            }
        }

        var existingBatch = await _context.InventoryBatches
            .FirstOrDefaultAsync(b => b.OrganizationId == organizationId && b.ProductId == productId && b.BatchId == computedBatchId, ct);
        if (existingBatch != null)
        {
            return existingBatch;
        }

        await _context.InventoryBatches.AddAsync(candidateBatch, ct);
        return candidateBatch;
    }

    public async Task<IReadOnlyDictionary<Guid, InventoryBatch>> GetOrCreateBatchesAsync(
        Guid organizationId,
        IReadOnlyCollection<(Guid ProductId, string BatchNumber, DateOnly? ExpiresOn, DateOnly? ManufacturedOn)> requests,
        CancellationToken ct = default)
    {
        var result = new Dictionary<Guid, InventoryBatch>();
        if (requests.Count == 0)
        {
            return result;
        }

        var candidatesById = new Dictionary<Guid, InventoryBatch>();
        foreach (var req in requests)
        {
            Guid computedBatchId = req.ExpiresOn.HasValue
                ? DeterministicBatchIdGenerator.Generate(organizationId, req.ProductId, req.BatchNumber, req.ExpiresOn.Value)
                : DeterministicBatchIdGenerator.GenerateNonLotBatchId(organizationId, req.ProductId);

            if (candidatesById.ContainsKey(computedBatchId))
            {
                continue;
            }

            var localBatch = _context.InventoryBatches.Local.FirstOrDefault(b =>
                b.OrganizationId == organizationId && b.ProductId == req.ProductId && b.BatchId == computedBatchId);
            if (localBatch != null)
            {
                candidatesById[computedBatchId] = localBatch;
                continue;
            }

            var candidate = req.ExpiresOn.HasValue
                ? InventoryBatch.CreateDatedBatch(organizationId, req.ProductId, req.BatchNumber, req.ExpiresOn.Value, req.ManufacturedOn)
                : InventoryBatch.CreateNonLotSystemBatch(organizationId, req.ProductId);

            candidatesById[computedBatchId] = candidate;
        }

        var allIds = candidatesById.Keys.ToArray();
        var persistedBatches = await _context.InventoryBatches
            .Where(b => b.OrganizationId == organizationId && allIds.Contains(b.BatchId))
            .ToListAsync(ct);

        foreach (var batch in persistedBatches)
        {
            result[batch.BatchId] = batch;
        }

        var missing = candidatesById
            .Where(kvp => !result.ContainsKey(kvp.Key) && _context.Entry(kvp.Value).State == EntityState.Detached)
            .Select(kvp => kvp.Value)
            .ToList();

        if (missing.Count > 0)
        {
            if (_context.Database.IsRelational())
            {
                var batchIds = missing.Select(b => b.BatchId).ToArray();
                var productIds = missing.Select(b => b.ProductId).ToArray();
                var batchNumbers = missing.Select(b => b.BatchNumber).ToArray();
                var manufacturedOns = missing.Select(b => b.ManufacturedOn).ToArray();
                var expiresOns = missing.Select(b => b.ExpiresOn).ToArray();
                var qualityStatuses = missing.Select(b => b.QualityStatus.ToString()).ToArray();
                var createdAts = missing.Select(b => b.CreatedAt).ToArray();
                var updatedAts = missing.Select(b => b.UpdatedAt).ToArray();

                await _context.Database.ExecuteSqlInterpolatedAsync(
                    $@"INSERT INTO inventory.""INVENTORY_BATCH""
                       (batch_id, organization_id, product_id, batch_number, manufactured_on, expires_on, quality_status, created_at, updated_at)
                       SELECT b_id, {organizationId}, p_id, b_num, m_on, e_on, q_st, c_at, u_at
                       FROM unnest({batchIds}, {productIds}, {batchNumbers}, {manufacturedOns}, {expiresOns}, {qualityStatuses}, {createdAts}, {updatedAts})
                            AS t(b_id, p_id, b_num, m_on, e_on, q_st, c_at, u_at)
                       ON CONFLICT DO NOTHING;", ct);

                var fetchedMissing = await _context.InventoryBatches
                    .Where(b => b.OrganizationId == organizationId && batchIds.Contains(b.BatchId))
                    .ToListAsync(ct);

                foreach (var batch in fetchedMissing)
                {
                    result[batch.BatchId] = batch;
                }
            }
            else
            {
                await _context.InventoryBatches.AddRangeAsync(missing, ct);
                foreach (var batch in missing)
                {
                    result[batch.BatchId] = batch;
                }
            }
        }

        foreach (var kvp in candidatesById)
        {
            if (!result.ContainsKey(kvp.Key))
            {
                result[kvp.Key] = kvp.Value;
            }
        }

        return result;
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
        var query = _context.InventoryBatches
            .AsNoTracking()
            .Where(b => b.OrganizationId == organizationId);

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

        return new PagedResult<InventoryBatch>(items, page, pageSize, totalCount);
    }

    public async Task AddAsync(InventoryBatch batch, CancellationToken ct = default)
    {
        await _context.InventoryBatches.AddAsync(batch, ct);
    }
}
