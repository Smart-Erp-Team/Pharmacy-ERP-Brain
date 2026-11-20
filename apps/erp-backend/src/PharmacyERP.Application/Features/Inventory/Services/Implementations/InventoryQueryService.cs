using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using PharmacyERP.Application.Common.Constants;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Features.Inventory.DTOs;
using PharmacyERP.Application.Features.Inventory.Interfaces;
using PharmacyERP.Application.Features.Inventory.Services.Interfaces;
using PharmacyERP.Domain.Entities.Inventory;
using PharmacyERP.Domain.Enums;

namespace PharmacyERP.Application.Features.Inventory.Services.Implementations;

public class InventoryQueryService : IInventoryQueryService
{
    private readonly IStockBalanceRepository _stockRepo;
    private readonly IInventoryTxnRepository _txnRepo;
    private readonly ITenantContext _tenantContext;
    private readonly ICurrentUser _currentUser;
    private readonly IDateTimeProvider _dateTimeProvider;

    public InventoryQueryService(
        IStockBalanceRepository stockRepo,
        IInventoryTxnRepository txnRepo,
        ITenantContext tenantContext,
        ICurrentUser currentUser,
        IDateTimeProvider dateTimeProvider)
    {
        _stockRepo = stockRepo;
        _txnRepo = txnRepo;
        _tenantContext = tenantContext;
        _currentUser = currentUser;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<IReadOnlyList<StockBalanceDto>>> GetBalancesAsync(Guid branchId, Guid? productId, Guid? locationId, Guid? batchId, CancellationToken ct = default)
    {
        if (!_currentUser.CanAccessBranch(branchId))
            return Result<IReadOnlyList<StockBalanceDto>>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        Guid orgId = _tenantContext.OrganizationId ?? Guid.Empty;

        var balances = await _stockRepo.GetBalancesWithDetailsAsync(orgId, branchId, productId, locationId, batchId, ct);
        var bizDate = _dateTimeProvider.GetOrganizationBusinessDate("UTC");

        var dtos = balances.Select(b => MapToStockBalanceDto(b, bizDate)).ToList();
        return Result<IReadOnlyList<StockBalanceDto>>.Success(dtos);
    }

    public async Task<Result<InventorySummaryDto>> GetProductSummaryAsync(Guid branchId, Guid productId, CancellationToken ct = default)
    {
        if (!_currentUser.CanAccessBranch(branchId))
            return Result<InventorySummaryDto>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        Guid orgId = _tenantContext.OrganizationId ?? Guid.Empty;

        var balances = await _stockRepo.GetBalancesWithDetailsAsync(orgId, branchId, productId, null, null, ct);
        var bizDate = _dateTimeProvider.GetOrganizationBusinessDate("UTC");

        var dtos = balances.Select(b => MapToStockBalanceDto(b, bizDate)).ToList();

        decimal totalOnHand = dtos.Sum(d => d.OnHandQtyBase);
        decimal totalAvailable = dtos.Sum(d => d.AvailableQtyBase);
        decimal weightedCost = totalOnHand > 0 ? dtos.Sum(d => d.OnHandQtyBase * d.AverageUnitCost) / totalOnHand : 0m;

        string baseUom = dtos.FirstOrDefault()?.BaseUomCode ?? "PCS";

        return Result<InventorySummaryDto>.Success(new InventorySummaryDto(
            orgId, branchId, productId, baseUom, totalOnHand, totalAvailable, Math.Round(weightedCost, 4), dtos));
    }

    public async Task<Result<PagedResult<InventoryTxnDto>>> GetTransactionsAsync(Guid branchId, InventoryTransactionType? type, Guid? productId, DateTimeOffset? fromDate, DateTimeOffset? toDate, int page, int pageSize, CancellationToken ct = default)
    {
        if (!_currentUser.CanAccessBranch(branchId))
            return Result<PagedResult<InventoryTxnDto>>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        Guid orgId = _tenantContext.OrganizationId ?? Guid.Empty;

        var pagedTxns = await _txnRepo.GetPagedAsync(orgId, branchId, type, productId, fromDate, toDate, page, pageSize, ct);
        var dtos = pagedTxns.Items.Select(MapToTxnDto).ToList();

        return Result<PagedResult<InventoryTxnDto>>.Success(new PagedResult<InventoryTxnDto>(dtos, pagedTxns.TotalCount, page, pageSize));
    }

    private static StockBalanceDto MapToStockBalanceDto(StockBalance b, DateOnly bizDate)
    {
        bool isLocAvailable = b.Location != null && b.Location.IsSellable && b.Location.IsActive;
        bool isBatchAvailable = b.Batch != null && b.Batch.IsEligibleForSale(bizDate);
        decimal availableQty = (isLocAvailable && isBatchAvailable) ? b.OnHandQtyBase : 0m;

        return new StockBalanceDto(
            b.OrganizationId,
            b.Location?.BranchId ?? Guid.Empty,
            b.Batch?.ProductId ?? Guid.Empty,
            b.Batch?.Product?.Sku ?? string.Empty,
            b.Batch?.Product?.Name ?? string.Empty,
            b.Batch?.Product?.BaseUomCode ?? "PCS",
            b.LocationId,
            b.Location?.LocationCode ?? string.Empty,
            b.Location?.LocationType ?? LocationType.SELLABLE,
            b.Location?.IsSellable ?? false,
            b.BatchId,
            b.Batch?.BatchNumber ?? "NON-LOT",
            b.Batch?.ManufacturedOn,
            b.Batch?.ExpiresOn,
            b.Batch?.QualityStatus ?? BatchQualityStatus.AVAILABLE,
            b.OnHandQtyBase,
            availableQty,
            b.AverageUnitCost,
            b.UpdatedAt);
    }

    private static InventoryTxnDto MapToTxnDto(InventoryTxn t) =>
        new(
            t.InventoryTxnId, t.OrganizationId, t.BranchId, t.TransactionNo, t.TransactionType, t.Status,
            t.ReasonCode, t.Note, t.IdempotencyKey, t.CreatedByEmployeeId, t.ReversesInventoryTxnId, t.PostedAt,
            t.Lines.Select(l => new InventoryTxnLineDto(
                l.InventoryTxnLineId, l.ProductId, l.LocationId, l.BatchId,
                l.Batch?.BatchNumber ?? "NON-LOT", l.ProductUomId, l.EnteredQty,
                l.ConversionSnapshot, l.QuantityDeltaBase, l.UnitCostBase)).ToList());
}