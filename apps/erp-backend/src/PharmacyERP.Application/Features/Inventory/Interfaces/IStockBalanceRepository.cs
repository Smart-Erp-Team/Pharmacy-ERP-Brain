using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using PharmacyERP.Domain.Entities.Inventory;

namespace PharmacyERP.Application.Features.Inventory.Interfaces;

public interface IStockBalanceRepository
{
    Task<StockBalance?> GetForUpdateAsync(Guid organizationId, Guid locationId, Guid batchId, CancellationToken ct = default);
    Task<StockBalance> GetOrCreateForUpdateAsync(Guid organizationId, Guid locationId, Guid batchId, DateTimeOffset now, CancellationToken ct = default);
    Task<IReadOnlyDictionary<(Guid LocationId, Guid BatchId), StockBalance>> GetOrCreateForUpdateBatchAsync(
        Guid organizationId,
        IReadOnlyCollection<(Guid LocationId, Guid BatchId)> keys,
        DateTimeOffset now,
        CancellationToken ct = default);
    Task<IReadOnlyList<StockBalance>> GetBalancesWithDetailsAsync(Guid organizationId, Guid branchId, Guid? productId = null, Guid? locationId = null, Guid? batchId = null, CancellationToken ct = default);
    Task<(IReadOnlyList<StockBalance> Balances, int TotalGroups, bool HasMore)> GetCanonicalInventoryPageAsync(
        Guid organizationId,
        Guid branchId,
        Guid? productId,
        DateTimeOffset? updatedSince,
        int offset,
        int pageSize,
        CancellationToken ct = default);
    Task AddAsync(StockBalance balance, CancellationToken ct = default);
}