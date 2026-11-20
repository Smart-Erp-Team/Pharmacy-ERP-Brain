using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Inventory.DTOs;
using PharmacyERP.Domain.Enums;

namespace PharmacyERP.Application.Features.Inventory.Services.Interfaces;

public interface IInventoryQueryService
{
    Task<Result<IReadOnlyList<StockBalanceDto>>> GetBalancesAsync(Guid branchId, Guid? productId, Guid? locationId, Guid? batchId, CancellationToken ct = default);
    Task<Result<InventorySummaryDto>> GetProductSummaryAsync(Guid branchId, Guid productId, CancellationToken ct = default);
    Task<Result<PagedResult<InventoryTxnDto>>> GetTransactionsAsync(Guid branchId, InventoryTransactionType? type, Guid? productId, DateTimeOffset? fromDate, DateTimeOffset? toDate, int page, int pageSize, CancellationToken ct = default);
}