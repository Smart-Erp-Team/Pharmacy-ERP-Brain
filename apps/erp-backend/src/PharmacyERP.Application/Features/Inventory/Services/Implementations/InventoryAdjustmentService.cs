using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using PharmacyERP.Application.Common.Constants;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Common.Interfaces.Context;
using PharmacyERP.Application.Common.Interfaces.Integration;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Application.Features.Inventory.DTOs;
using PharmacyERP.Application.Features.Inventory.Interfaces;
using PharmacyERP.Application.Features.Inventory.Services.Interfaces;
using PharmacyERP.Application.Features.Inventory.Validators;
using PharmacyERP.Domain.Entities.Inventory;
using PharmacyERP.Domain.Enums;

namespace PharmacyERP.Application.Features.Inventory.Services.Implementations;

public class InventoryAdjustmentService : IInventoryAdjustmentService
{
    private readonly IInventoryTxnRepository _txnRepo;
    private readonly IStockBalanceRepository _stockRepo;
    private readonly IInventoryBatchRepository _batchRepo;
    private readonly IInventoryLocationRepository _locationRepo;
    private readonly ITenantContext _tenantContext;
    private readonly ICurrentUser _currentUser;
    private readonly IRuntimeModeProvider _runtimeMode;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IIdempotencyService _idempotency;
    private readonly IOutboxService _outbox;
    private readonly IAuditLogger _auditLogger;

    public InventoryAdjustmentService(
        IInventoryTxnRepository txnRepo,
        IStockBalanceRepository stockRepo,
        IInventoryBatchRepository batchRepo,
        IInventoryLocationRepository locationRepo,
        ITenantContext tenantContext,
        ICurrentUser currentUser,
        IRuntimeModeProvider runtimeMode,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork,
        IIdempotencyService idempotency,
        IOutboxService outbox,
        IAuditLogger auditLogger)
    {
        _txnRepo = txnRepo;
        _stockRepo = stockRepo;
        _batchRepo = batchRepo;
        _locationRepo = locationRepo;
        _tenantContext = tenantContext;
        _currentUser = currentUser;
        _runtimeMode = runtimeMode;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
        _idempotency = idempotency;
        _outbox = outbox;
        _auditLogger = auditLogger;
    }

    public async Task<Result<InventoryTxnDto>> PostAdjustmentAsync(CreateInventoryAdjustmentRequest request, CancellationToken ct = default)
    {
        var validation = InventoryAdjustmentValidators.ValidateAdjustment(request);
        if (!validation.IsValid)
            return Result<InventoryTxnDto>.Failure(ErrorCode.VALIDATION_ERROR, validation.ErrorMessage!);

        if (_runtimeMode.CurrentMode == ErpRuntimeMode.Cloud)
            return Result<InventoryTxnDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.CloudStockMutationForbidden);

        if (!_currentUser.CanAccessBranch(request.BranchId))
            return Result<InventoryTxnDto>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        await _unitOfWork.BeginTransactionAsync(ct);

        try
        {
            // محاولة التحقق بطريقة تتفادى قراءة الخصائص الداخلية المجهولة وتستخدم var
            var idempotencyResult = await _idempotency.CheckAsync<CreateInventoryAdjustmentRequest, InventoryTxnDto>(
                "inventory.adjustment.post", request.IdempotencyKey, request.BranchId, request, ct);

            if (idempotencyResult.IsReplay && idempotencyResult.ReplayedResponse != null)
            {
                await _unitOfWork.RollbackTransactionAsync(ct);
                return Result<InventoryTxnDto>.Success(idempotencyResult.ReplayedResponse);
            }

            var now = _dateTimeProvider.UtcNow;
            string txnNo = $"ADJ-{now:yyyyMMddHHmmss}-{Random.Shared.Next(1000, 9999)}";

            Guid orgId = _tenantContext.OrganizationId ?? Guid.Empty;
            Guid userId = _currentUser.UserId ?? Guid.Empty;

            var txn = InventoryTxn.CreateDraft(
                organizationId: orgId,
                branchId: request.BranchId,
                transactionNo: txnNo,
                transactionType: request.TransactionType,
                idempotencyKey: request.IdempotencyKey,
                createdByEmployeeId: userId,
                now: now,
                reasonCode: request.ReasonCode,
                note: request.Note,
                reversesInventoryTxnId: request.ReversesInventoryTxnId);

            var orderedLines = request.Lines.OrderBy(l => l.LocationId).ThenBy(l => l.ProductId).ToList();

            foreach (var lineReq in orderedLines)
            {
                var location = await _locationRepo.GetByIdAsync(orgId, request.BranchId, lineReq.LocationId, ct);
                if (location == null || !location.IsActive)
                {
                    await _unitOfWork.RollbackTransactionAsync(ct);
                    return Result<InventoryTxnDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.LocationNotFound);
                }

                Guid batchId;
                if (!string.IsNullOrWhiteSpace(lineReq.BatchNumber) && lineReq.BatchNumber != "NON-LOT")
                {
                    var batch = await _batchRepo.GetOrCreateBatchAsync(
                        orgId, lineReq.ProductId, lineReq.BatchNumber, lineReq.ExpiresOn, lineReq.ManufacturedOn, ct);
                    batchId = batch.BatchId;
                }
                else
                {
                    var batch = await _batchRepo.GetOrCreateBatchAsync(
                        orgId, lineReq.ProductId, "NON-LOT", null, null, ct);
                    batchId = batch.BatchId;
                }

                var stockBalance = await _stockRepo.GetForUpdateAsync(orgId, lineReq.LocationId, batchId, ct);
                if (stockBalance == null)
                {
                    stockBalance = StockBalance.CreateInitial(orgId, lineReq.LocationId, batchId, 0m, 0m, now);
                    await _stockRepo.AddAsync(stockBalance, ct);
                }

                decimal qtyBase = Math.Round(lineReq.EnteredQty, 4, MidpointRounding.AwayFromZero);
                decimal unitCostBase = lineReq.UnitCostEntered.HasValue ? Math.Round(lineReq.UnitCostEntered.Value, 4, MidpointRounding.AwayFromZero) : stockBalance.AverageUnitCost;

                if (request.TransactionType == InventoryTransactionType.OPENING_BALANCE || request.TransactionType == InventoryTransactionType.ADJUSTMENT_IN)
                {
                    stockBalance.ApplyIncomingStock(qtyBase, unitCostBase, now);
                    txn.AddLine(lineReq.ProductId, lineReq.LocationId, batchId, lineReq.ProductUomId, qtyBase, 1m, qtyBase, unitCostBase);
                }
                else if (request.TransactionType == InventoryTransactionType.ADJUSTMENT_OUT)
                {
                    if (stockBalance.OnHandQtyBase < qtyBase)
                    {
                        await _unitOfWork.RollbackTransactionAsync(ct);
                        return Result<InventoryTxnDto>.Failure(ErrorCode.OUT_OF_STOCK, ErrorMessages.OutOfStock);
                    }

                    unitCostBase = stockBalance.ApplyOutgoingStock(qtyBase, now);
                    txn.AddLine(lineReq.ProductId, lineReq.LocationId, batchId, lineReq.ProductUomId, qtyBase, 1m, -qtyBase, unitCostBase);
                }
            }

            txn.Post(now);
            await _txnRepo.AddAsync(txn, ct);

            var responseDto = MapToTxnDto(txn);

            await _outbox.EnqueueAsync("inventory.adjustment.posted", request.BranchId, responseDto, ct: ct);

            await _auditLogger.LogAsync("InventoryAdjustment", txn.InventoryTxnId.ToString(), "POST", userId, null, responseDto, request.BranchId, null, null, ct);

            await _idempotency.PersistResponseAsync(
                "inventory.adjustment.post", request.IdempotencyKey, request.BranchId, request, responseDto, ct);

            await _unitOfWork.CommitTransactionAsync(ct);

            return Result<InventoryTxnDto>.Success(responseDto);
        }
        catch (Exception)
        {
            await _unitOfWork.RollbackTransactionAsync(ct);
            throw;
        }
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