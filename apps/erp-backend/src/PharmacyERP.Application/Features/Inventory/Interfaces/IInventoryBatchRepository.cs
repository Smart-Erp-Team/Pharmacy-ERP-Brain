using System;
using System.Threading;
using System.Threading.Tasks;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Domain.Entities.Inventory;
using PharmacyERP.Domain.Enums;

namespace PharmacyERP.Application.Features.Inventory.Interfaces;

public interface IInventoryBatchRepository
{
    Task<InventoryBatch?> GetByIdAsync(Guid organizationId, Guid productId, Guid batchId, CancellationToken ct = default);
    Task<InventoryBatch> GetOrCreateBatchAsync(Guid organizationId, Guid productId, string batchNumber, DateOnly? expiresOn, DateOnly? manufacturedOn, CancellationToken ct = default);
    Task<PagedResult<InventoryBatch>> GetPagedAsync(Guid organizationId, Guid? productId, BatchQualityStatus? status, DateOnly? expiringBefore, int page, int pageSize, CancellationToken ct = default);
    Task AddAsync(InventoryBatch batch, CancellationToken ct = default);
}