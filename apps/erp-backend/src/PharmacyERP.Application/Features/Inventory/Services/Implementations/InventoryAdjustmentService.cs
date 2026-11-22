namespace PharmacyERP.Application.Features.Inventory.Services.Implementations;

public class InventoryAdjustmentService : IInventoryAdjustmentService
{
    private const string IdempotencyScope = "inventory.adjustment.post";
    private const string OutboxTopic = "inventory.adjustment.posted";
    private const string AuditAction = "POST";
    private const int MaxConcurrencyRetryAttempts = 3;

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
    private readonly IProductUomRepository? _productUomRepo;
    private readonly IProductRepository? _productRepo;

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
        IAuditLogger auditLogger,
        IProductUomRepository? productUomRepo = null,
        IProductRepository? productRepo = null)
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
        _productUomRepo = productUomRepo;
        _productRepo = productRepo;
    }

    public async Task<Result<InventoryTxnDto>> PostAdjustmentAsync(CreateInventoryAdjustmentRequest request, CancellationToken ct = default)
    {
        var validation = InventoryAdjustmentValidators.ValidateAdjustment(request);
        if (!validation.IsValid)
            return Result<InventoryTxnDto>.Failure(ErrorCode.VALIDATION_ERROR, validation.ErrorMessage!);

        if (_runtimeMode.CurrentMode == ErpRuntimeMode.Cloud)
            return Result<InventoryTxnDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.CloudStockMutationForbidden);

        if (!_tenantContext.OrganizationId.HasValue || _tenantContext.OrganizationId.Value == Guid.Empty
            || !_currentUser.EmployeeId.HasValue || _currentUser.EmployeeId.Value == Guid.Empty)
            return Result<InventoryTxnDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!_currentUser.CanAccessBranch(request.BranchId))
            return Result<InventoryTxnDto>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        if (request.TransactionType == InventoryTransactionType.OPENING_BALANCE
            && !string.Equals(_currentUser.Role, UserRole.Admin.ToString(), StringComparison.Ordinal))
            return Result<InventoryTxnDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        Guid orgId = _tenantContext.OrganizationId.Value;
        Guid employeeId = _currentUser.EmployeeId.Value;

        for (int attempt = 1; ; attempt++)
        {
            await _unitOfWork.BeginTransactionAsync(ct);

            try
            {
                try
                {
                    var idempotencyResult = await _idempotency.CheckAsync<CreateInventoryAdjustmentRequest, InventoryTxnDto>(
                        IdempotencyScope, request.IdempotencyKey, request.BranchId, request, ct);

                    if (idempotencyResult.IsReplay && idempotencyResult.ReplayedResponse != null)
                    {
                        await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                        return Result<InventoryTxnDto>.Success(idempotencyResult.ReplayedResponse);
                    }
                }
                catch (IntegrationDomainException ex) when (string.Equals(ex.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<InventoryTxnDto>.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
                }

                var now = _dateTimeProvider.UtcNow;
                string txnNo = $"ADJ-{now:yyyyMMddHHmmss}-{Guid.NewGuid().ToString("N")[..12].ToUpperInvariant()}";

                var txn = InventoryTxn.CreateDraft(
                    organizationId: orgId,
                    branchId: request.BranchId,
                    transactionNo: txnNo,
                    transactionType: request.TransactionType,
                    idempotencyKey: request.IdempotencyKey,
                    createdByEmployeeId: employeeId,
                    now: now,
                    reasonCode: request.ReasonCode,
                    note: request.Note,
                    reversesInventoryTxnId: request.ReversesInventoryTxnId);

                var batchNumbersById = new Dictionary<Guid, string>();

                if (request.TransactionType == InventoryTransactionType.REVERSAL)
                {
                    var reversalFailure = await ProcessReversalAsync(orgId, request.BranchId, request.ReversesInventoryTxnId!.Value, txn, batchNumbersById, now, ct);
                    if (reversalFailure != null)
                    {
                        await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                        return reversalFailure;
                    }
                }
                else
                {
                    var standardFailure = await ProcessStandardAdjustmentAsync(orgId, request, txn, batchNumbersById, now, ct);
                    if (standardFailure != null)
                    {
                        await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                        return standardFailure;
                    }
                }

                // Persist DRAFT header and lines first so PostgreSQL's BEFORE INSERT line-immutability trigger
                // validates parent status = 'DRAFT', then transition to POSTED atomically within the same transaction.
                await _txnRepo.AddAsync(txn, ct);
                await _unitOfWork.SaveChangesAsync(ct);

                txn.Post(now);

                var responseDto = MapToTxnDto(txn, batchNumbersById);

                await _outbox.EnqueueAsync(OutboxTopic, request.BranchId, responseDto, ct: ct);

                await _auditLogger.LogAsync(
                    action: AuditAction,
                    entitySchema: "inventory",
                    entityName: "INVENTORY_TXN",
                    entityId: txn.InventoryTxnId,
                    beforeData: null,
                    afterData: responseDto,
                    branchId: request.BranchId,
                    ct: ct);

                await _idempotency.PersistResponseAsync(
                    IdempotencyScope, request.IdempotencyKey, request.BranchId, request, responseDto, ct);

                await _unitOfWork.CommitTransactionAsync(ct);

                return Result<InventoryTxnDto>.Success(responseDto);
            }
            catch (Exception ex) when (attempt < MaxConcurrencyRetryAttempts && IsTransientConcurrencyException(ex))
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                await Task.Delay(Random.Shared.Next(15, 50) * attempt, ct);
            }
            catch (Exception)
            {
                await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                throw;
            }
        }
    }

    private async Task<Result<InventoryTxnDto>?> ProcessReversalAsync(
        Guid orgId,
        Guid branchId,
        Guid reversesTxnId,
        InventoryTxn reversalTxn,
        IDictionary<Guid, string> batchNumbersById,
        DateTimeOffset now,
        CancellationToken ct)
    {
        var originalTxn = await _txnRepo.GetByIdWithLinesAsync(orgId, branchId, reversesTxnId, ct);
        if (originalTxn == null)
        {
            return Result<InventoryTxnDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.NotFound);
        }

        if (originalTxn.Status != InventoryTransactionStatus.POSTED)
        {
            return Result<InventoryTxnDto>.Failure(ErrorCode.INVALID_STATE_TRANSITION, ErrorMessages.InvalidStateTransition);
        }

        if (originalTxn.TransactionType == InventoryTransactionType.REVERSAL)
        {
            return Result<InventoryTxnDto>.Failure(ErrorCode.INVALID_STATE_TRANSITION, ErrorMessages.InvalidStateTransition);
        }

        if (await _txnRepo.HasPostedReversalAsync(orgId, branchId, reversesTxnId, ct))
        {
            return Result<InventoryTxnDto>.Failure(ErrorCode.INVALID_STATE_TRANSITION, ErrorMessages.InvalidStateTransition);
        }

        var orderedOriginalLines = originalTxn.Lines
            .OrderBy(l => l.LocationId)
            .ThenBy(l => l.BatchId)
            .ToList();

        var balanceKeys = orderedOriginalLines
            .Select(l => (l.LocationId, l.BatchId))
            .Distinct()
            .ToArray();

        // Acquire all STOCK_BALANCE row locks in a single ordered FOR UPDATE query.
        var lockedBalances = await _stockRepo.GetOrCreateForUpdateBatchAsync(orgId, balanceKeys, now, ct);

        foreach (var origLine in orderedOriginalLines)
        {
            if (origLine.Batch != null && !string.IsNullOrWhiteSpace(origLine.Batch.BatchNumber))
            {
                batchNumbersById[origLine.BatchId] = origLine.Batch.BatchNumber;
            }

            decimal invertedDelta = -origLine.QuantityDeltaBase;
            var stockBalance = lockedBalances[(origLine.LocationId, origLine.BatchId)];

            if (invertedDelta > 0m)
            {
                stockBalance.ApplyIncomingStock(invertedDelta, origLine.UnitCostBase, now);
                reversalTxn.AddLine(
                    origLine.ProductId,
                    origLine.LocationId,
                    origLine.BatchId,
                    origLine.ProductUomId,
                    origLine.EnteredQty,
                    origLine.ConversionSnapshot,
                    invertedDelta,
                    origLine.UnitCostBase);
            }
            else
            {
                decimal absQty = Math.Abs(invertedDelta);
                if (stockBalance.OnHandQtyBase < absQty)
                {
                    return Result<InventoryTxnDto>.Failure(ErrorCode.OUT_OF_STOCK, ErrorMessages.OutOfStock);
                }

                decimal outUnitCost = stockBalance.ApplyOutgoingStock(absQty, now);
                reversalTxn.AddLine(
                    origLine.ProductId,
                    origLine.LocationId,
                    origLine.BatchId,
                    origLine.ProductUomId,
                    origLine.EnteredQty,
                    origLine.ConversionSnapshot,
                    invertedDelta,
                    outUnitCost);
            }
        }

        return null;
    }

    private async Task<Result<InventoryTxnDto>?> ProcessStandardAdjustmentAsync(
        Guid orgId,
        CreateInventoryAdjustmentRequest request,
        InventoryTxn txn,
        IDictionary<Guid, string> batchNumbersById,
        DateTimeOffset now,
        CancellationToken ct)
    {
        // Batch-fetch all reference entities BEFORE acquiring exclusive STOCK_BALANCE FOR UPDATE locks.
        var distinctLocationIds = request.Lines.Select(l => l.LocationId).Distinct().ToArray();
        var locationsById = (await _locationRepo.GetByIdsAsync(orgId, request.BranchId, distinctLocationIds, ct))
            .ToDictionary(l => l.LocationId);

        Dictionary<Guid, Product>? productsById = null;
        if (_productRepo != null)
        {
            var distinctProductIds = request.Lines.Select(l => l.ProductId).Distinct().ToArray();
            productsById = (await _productRepo.GetByIdsAsync(orgId, distinctProductIds, ct))
                .ToDictionary(p => p.ProductId);
        }

        Dictionary<(Guid ProductId, Guid ProductUomId), ProductUom>? uomsByKey = null;
        if (_productUomRepo != null)
        {
            var distinctUomIds = request.Lines.Select(l => l.ProductUomId).Distinct().ToArray();
            uomsByKey = (await _productUomRepo.GetByIdsAsync(orgId, distinctUomIds, ct))
                .ToDictionary(u => (u.ProductId, u.ProductUomId));
        }

        var batchRequests = new List<(Guid ProductId, string BatchNumber, DateOnly? ExpiresOn, DateOnly? ManufacturedOn)>(request.Lines.Count);
        var validatedLines = new List<(CreateInventoryAdjustmentLineRequest LineReq, Guid ComputedBatchId, decimal ConversionFactor)>(request.Lines.Count);

        foreach (var lineReq in request.Lines)
        {
            if (!locationsById.TryGetValue(lineReq.LocationId, out var location) || !location.IsActive)
            {
                return Result<InventoryTxnDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.LocationNotFound);
            }

            bool isNonLotInput = string.IsNullOrWhiteSpace(lineReq.BatchNumber)
                || string.Equals(lineReq.BatchNumber, DeterministicBatchIdGenerator.NonLotBatchNumber, StringComparison.Ordinal);

            if (productsById != null)
            {
                if (!productsById.TryGetValue(lineReq.ProductId, out var product))
                {
                    return Result<InventoryTxnDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductNotFound);
                }

                if (product.LotTrackingRequired)
                {
                    if (isNonLotInput)
                    {
                        return Result<InventoryTxnDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.NonLotMisuse);
                    }

                    if (!lineReq.ExpiresOn.HasValue)
                    {
                        return Result<InventoryTxnDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.InvalidBatchDates);
                    }
                }
                else
                {
                    if (!isNonLotInput || lineReq.ExpiresOn.HasValue)
                    {
                        return Result<InventoryTxnDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.NonLotMisuse);
                    }
                }
            }

            decimal conversionFactor = 1m;
            if (uomsByKey != null)
            {
                if (!uomsByKey.TryGetValue((lineReq.ProductId, lineReq.ProductUomId), out var uom) || !uom.IsActive)
                {
                    return Result<InventoryTxnDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductUomNotFound);
                }

                if (uom.ConversionToBase > 0m)
                {
                    conversionFactor = uom.ConversionToBase;
                }
            }

            string effectiveBatchNumber = isNonLotInput
                ? DeterministicBatchIdGenerator.NonLotBatchNumber
                : lineReq.BatchNumber!;
            DateOnly? effectiveExpiresOn = isNonLotInput ? null : lineReq.ExpiresOn;
            DateOnly? effectiveManufacturedOn = isNonLotInput ? null : lineReq.ManufacturedOn;

            Guid computedBatchId = effectiveExpiresOn.HasValue
                ? DeterministicBatchIdGenerator.Generate(orgId, lineReq.ProductId, effectiveBatchNumber, effectiveExpiresOn.Value)
                : DeterministicBatchIdGenerator.GenerateNonLotBatchId(orgId, lineReq.ProductId);

            batchRequests.Add((lineReq.ProductId, effectiveBatchNumber, effectiveExpiresOn, effectiveManufacturedOn));
            validatedLines.Add((lineReq, computedBatchId, conversionFactor));
        }

        // Batch-upsert/fetch all distinct batches in one round-trip.
        var batchesById = await _batchRepo.GetOrCreateBatchesAsync(orgId, batchRequests, ct);
        foreach (var kvp in batchesById)
        {
            batchNumbersById[kvp.Key] = kvp.Value.BatchNumber;
        }

        var orderedLines = validatedLines
            .OrderBy(x => x.LineReq.LocationId)
            .ThenBy(x => x.ComputedBatchId)
            .ToList();

        var distinctBalanceKeys = orderedLines
            .Select(x => (x.LineReq.LocationId, x.ComputedBatchId))
            .Distinct()
            .ToArray();

        // Batch-upsert and lock all distinct (LocationId, BatchId) rows in a single ordered FOR UPDATE query.
        var lockedBalances = await _stockRepo.GetOrCreateForUpdateBatchAsync(orgId, distinctBalanceKeys, now, ct);

        if (request.TransactionType == InventoryTransactionType.OPENING_BALANCE)
        {
            if (distinctBalanceKeys.Length != orderedLines.Count)
            {
                return Result<InventoryTxnDto>.Failure(ErrorCode.INVALID_STATE_TRANSITION, ErrorMessages.InvalidStateTransition);
            }

            foreach (var (locId, bId) in distinctBalanceKeys)
            {
                if (lockedBalances[(locId, bId)].OnHandQtyBase != 0m
                    || await _txnRepo.HasLedgerHistoryAsync(orgId, locId, bId, ct))
                {
                    return Result<InventoryTxnDto>.Failure(ErrorCode.INVALID_STATE_TRANSITION, ErrorMessages.InvalidStateTransition);
                }
            }
        }

        foreach (var (lineReq, batchId, conversionFactor) in orderedLines)
        {
            var stockBalance = lockedBalances[(lineReq.LocationId, batchId)];

            decimal qtyBase = Math.Round(lineReq.EnteredQty * conversionFactor, 4, MidpointRounding.AwayFromZero);
            decimal unitCostBase = lineReq.UnitCostEntered.HasValue
                ? Math.Round(lineReq.UnitCostEntered.Value / conversionFactor, 4, MidpointRounding.AwayFromZero)
                : stockBalance.AverageUnitCost;

            if (request.TransactionType == InventoryTransactionType.OPENING_BALANCE || request.TransactionType == InventoryTransactionType.ADJUSTMENT_IN)
            {
                stockBalance.ApplyIncomingStock(qtyBase, unitCostBase, now);
                txn.AddLine(lineReq.ProductId, lineReq.LocationId, batchId, lineReq.ProductUomId, lineReq.EnteredQty, conversionFactor, qtyBase, unitCostBase);
            }
            else if (request.TransactionType == InventoryTransactionType.ADJUSTMENT_OUT)
            {
                if (stockBalance.OnHandQtyBase < qtyBase)
                {
                    return Result<InventoryTxnDto>.Failure(ErrorCode.OUT_OF_STOCK, ErrorMessages.OutOfStock);
                }

                unitCostBase = stockBalance.ApplyOutgoingStock(qtyBase, now);
                txn.AddLine(lineReq.ProductId, lineReq.LocationId, batchId, lineReq.ProductUomId, lineReq.EnteredQty, conversionFactor, -qtyBase, unitCostBase);
            }
        }

        return null;
    }

    private static bool IsTransientConcurrencyException(Exception exception)
    {
        for (var current = exception; current != null; current = current.InnerException)
        {
            var typeName = current.GetType().FullName;
            if (string.Equals(typeName, "Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException", StringComparison.Ordinal))
            {
                return true;
            }

            var sqlState = current.GetType().GetProperty("SqlState")?.GetValue(current) as string;
            if (string.Equals(sqlState, "40001", StringComparison.Ordinal) ||
                string.Equals(sqlState, "40P01", StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    private static InventoryTxnDto MapToTxnDto(InventoryTxn t, IReadOnlyDictionary<Guid, string> batchNumbersById) =>
        new(
            t.InventoryTxnId, t.OrganizationId, t.BranchId, t.TransactionNo, t.TransactionType, t.Status,
            t.ReasonCode, t.Note, t.IdempotencyKey, t.CreatedByEmployeeId, t.ReversesInventoryTxnId, t.PostedAt,
            t.Lines.Select(l => new InventoryTxnLineDto(
                l.InventoryTxnLineId,
                l.ProductId,
                l.LocationId,
                l.BatchId,
                batchNumbersById.TryGetValue(l.BatchId, out var resolvedBatchNumber)
                    ? resolvedBatchNumber
                    : (l.Batch?.BatchNumber ?? DeterministicBatchIdGenerator.NonLotBatchNumber),
                l.ProductUomId,
                l.EnteredQty,
                l.ConversionSnapshot,
                l.QuantityDeltaBase,
                l.UnitCostBase)).ToList());
}
