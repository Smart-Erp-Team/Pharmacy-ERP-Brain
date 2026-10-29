using System;
using System.Threading;
using System.Threading.Tasks;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Domain.Entities.Inventory;
using PharmacyERP.Domain.Enums;

namespace PharmacyERP.Application.Features.Inventory.Interfaces;

public interface IInventoryTxnRepository
{
    Task<InventoryTxn?> GetByIdWithLinesAsync(Guid organizationId, Guid branchId, Guid inventoryTxnId, CancellationToken ct = default);
    Task<PagedResult<InventoryTxn>> GetPagedAsync(Guid organizationId, Guid branchId, InventoryTransactionType? type, Guid? productId, DateTimeOffset? fromDate, DateTimeOffset? toDate, int page, int pageSize, CancellationToken ct = default);
    Task AddAsync(InventoryTxn txn, CancellationToken ct = default);
}