namespace PharmacyERP.Application.Features.Inventory.Services.Implementations;

/// <summary>
/// Posts inventory adjustments (<c>OPENING_BALANCE</c>, <c>ADJUSTMENT_IN</c>, <c>ADJUSTMENT_OUT</c>)
/// and <c>REVERSAL</c> transactions with idempotency replay, ordered row-level locking,
/// UOM-to-base conversion math, and automatic retry on transient concurrency/serialization conflicts.
/// </summary>
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
        var validationErrors = InventoryAdjustmentValidators.ValidateAdjustment(request);
        if (validationErrors.Count > 0)
            return Result<InventoryTxnDto>.Failure(ErrorCode.VALIDATION_ERROR, ErrorMessages.ValidationError, validationErrors);

        if (_runtimeMode.CurrentMode == ErpRuntimeMode.Cloud)
            return Result<InventoryTxnDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.CloudStockMutationForbidden);

        if (!_tenantContext.OrganizationId.HasValue || _tenantContext.OrganizationId.Value == Guid.Empty
            || !_currentUser.EmployeeId.HasValue || _currentUser.EmployeeId.Value == Guid.Empty)
            return Result<InventoryTxnDto>.Failure(ErrorCode.UNAUTHORIZED, ErrorMessages.Unauthorized);

        if (!_currentUser.CanAccessBranch(request.BranchId))
            return Result<InventoryTxnDto>.Failure(ErrorCode.FORBIDDEN_BRANCH, ErrorMessages.ForbiddenBranch);

        // Blueprint §9.1: both Admin and Pharmacist are permitted on inventory adjustments and opening balances; Cashier is denied.
        if (!string.Equals(_currentUser.Role, UserRole.Admin.ToString(), StringComparison.Ordinal)
            && !string.Equals(_currentUser.Role, UserRole.Pharmacist.ToString(), StringComparison.Ordinal))
            return Result<InventoryTxnDto>.Failure(ErrorCode.FORBIDDEN, ErrorMessages.Forbidden);

        var idempotencyKey = request.IdempotencyKey!;
        Guid organizationId = _tenantContext.OrganizationId.Value;
        Guid employeeId = _currentUser.EmployeeId.Value;

        // Retry loop handles optimistic concurrency (row_version) and PostgreSQL serialization/deadlock errors
        // by rolling back cleanly and re-reading fresh stock balances on the next attempt.
        for (int attempt = 1; ; attempt++)
        {
            await _unitOfWork.BeginTransactionAsync(ct);

            try
            {
                try
                {
                    var idempotencyResult = await _idempotency.CheckAsync<CreateInventoryAdjustmentRequest, InventoryTxnDto>(
                        IdempotencyScope, idempotencyKey, request.BranchId, request, ct);

                    if (idempotencyResult.IsReplay && idempotencyResult.ReplayedResponse != null)
                    {
                        await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                        return Result<InventoryTxnDto>.Success(idempotencyResult.ReplayedResponse);
                    }
                }
                catch (IntegrationDomainException exception) when (string.Equals(exception.Message, "IDEMPOTENCY_MISMATCH", StringComparison.OrdinalIgnoreCase))
                {
                    await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                    return Result<InventoryTxnDto>.Failure(ErrorCode.IDEMPOTENCY_MISMATCH, ErrorMessages.IdempotencyMismatch);
                }

                var now = _dateTimeProvider.UtcNow;
                string transactionNumber = $"ADJ-{now:yyyyMMddHHmmss}-{Guid.NewGuid().ToString("N")[..12].ToUpperInvariant()}";

                var inventoryTransaction = InventoryTxn.CreateDraft(
                    organizationId: organizationId,
                    branchId: request.BranchId,
                    transactionNo: transactionNumber,
                    transactionType: request.TransactionType,
                    idempotencyKey: idempotencyKey,
                    createdByEmployeeId: employeeId,
                    now: now,
                    reasonCode: request.ReasonCode,
                    note: request.Note,
                    reversesInventoryTxnId: request.ReversesInventoryTxnId);

                var batchNumbersById = new Dictionary<Guid, string>();

                if (request.TransactionType == InventoryTransactionType.REVERSAL)
                {
                    var reversalFailure = await ProcessReversalAsync(organizationId, request.BranchId, request.ReversesInventoryTxnId!.Value, inventoryTransaction, batchNumbersById, now, ct);
                    if (reversalFailure != null)
                    {
                        await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                        return reversalFailure;
                    }
                }
                else
                {
                    var standardFailure = await ProcessStandardAdjustmentAsync(organizationId, request, inventoryTransaction, batchNumbersById, now, ct);
                    if (standardFailure != null)
                    {
                        await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
                        return standardFailure;
                    }
                }

                // Persist DRAFT header and lines first so PostgreSQL's BEFORE INSERT line-immutability trigger
                // validates parent status = 'DRAFT', then transition to POSTED atomically within the same transaction.
                await _txnRepo.AddAsync(inventoryTransaction, ct);
                await _unitOfWork.SaveChangesAsync(ct);

                inventoryTransaction.Post(now);

                var responseDto = MapToTxnDto(inventoryTransaction, batchNumbersById);

                await _outbox.EnqueueAsync(OutboxTopic, request.BranchId, responseDto, ct: ct);

                await _auditLogger.LogAsync(
                    action: AuditAction,
                    entitySchema: "inventory",
                    entityName: "INVENTORY_TXN",
                    entityId: inventoryTransaction.InventoryTxnId,
                    beforeData: null,
                    afterData: responseDto,
                    branchId: request.BranchId,
                    ct: ct);

                await _idempotency.PersistResponseAsync(
                    IdempotencyScope, idempotencyKey, request.BranchId, request, responseDto, ct);

                await _unitOfWork.CommitTransactionAsync(ct);

                return Result<InventoryTxnDto>.Success(responseDto);
            }
            catch (Exception exception) when (attempt < MaxConcurrencyRetryAttempts && IsTransientConcurrencyException(exception))
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
        Guid organizationId,
        Guid branchId,
        Guid reversesTransactionId,
        InventoryTxn reversalTransaction,
        IDictionary<Guid, string> batchNumbersById,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var originalTransaction = await _txnRepo.GetByIdWithLinesAsync(organizationId, branchId, reversesTransactionId, cancellationToken);
        if (originalTransaction == null)
        {
            return Result<InventoryTxnDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.NotFound);
        }

        // Only POSTED non-reversal transactions that have not already been reversed can be reversed.
        if (originalTransaction.Status != InventoryTransactionStatus.POSTED)
        {
            return Result<InventoryTxnDto>.Failure(ErrorCode.INVALID_STATE_TRANSITION, ErrorMessages.InvalidStateTransition);
        }

        if (originalTransaction.TransactionType == InventoryTransactionType.REVERSAL)
        {
            return Result<InventoryTxnDto>.Failure(ErrorCode.INVALID_STATE_TRANSITION, ErrorMessages.InvalidStateTransition);
        }

        if (await _txnRepo.HasPostedReversalAsync(organizationId, branchId, reversesTransactionId, cancellationToken))
        {
            return Result<InventoryTxnDto>.Failure(ErrorCode.INVALID_STATE_TRANSITION, ErrorMessages.InvalidStateTransition);
        }

        // Sort deterministically by (LocationId, BatchId) before locking to prevent deadlocks across concurrent writers.
        var orderedOriginalLines = originalTransaction.Lines
            .OrderBy(line => line.LocationId)
            .ThenBy(line => line.BatchId)
            .ToList();

        var balanceKeys = orderedOriginalLines
            .Select(line => (line.LocationId, line.BatchId))
            .Distinct()
            .ToArray();

        // Acquire all STOCK_BALANCE row locks in a single ordered FOR UPDATE query.
        var lockedBalances = await _stockRepo.GetOrCreateForUpdateBatchAsync(organizationId, balanceKeys, now, cancellationToken);

        foreach (var originalLine in orderedOriginalLines)
        {
            if (originalLine.Batch != null && !string.IsNullOrWhiteSpace(originalLine.Batch.BatchNumber))
            {
                batchNumbersById[originalLine.BatchId] = originalLine.Batch.BatchNumber;
            }

            // Negate the original base-unit delta to invert its stock effect while preserving the historical UOM snapshot.
            decimal invertedDeltaBase = -originalLine.QuantityDeltaBase;
            var stockBalance = lockedBalances[(originalLine.LocationId, originalLine.BatchId)];

            if (invertedDeltaBase > 0m)
            {
                stockBalance.ApplyIncomingStock(invertedDeltaBase, originalLine.UnitCostBase, now);
                reversalTransaction.AddLine(
                    originalLine.ProductId,
                    originalLine.LocationId,
                    originalLine.BatchId,
                    originalLine.ProductUomId,
                    originalLine.EnteredQty,
                    originalLine.ConversionSnapshot,
                    invertedDeltaBase,
                    originalLine.UnitCostBase);
            }
            else
            {
                decimal outboundQtyBase = Math.Abs(invertedDeltaBase);
                if (stockBalance.OnHandQtyBase < outboundQtyBase)
                {
                    return Result<InventoryTxnDto>.Failure(ErrorCode.OUT_OF_STOCK, ErrorMessages.OutOfStock);
                }

                decimal outgoingUnitCostBase = stockBalance.ApplyOutgoingStock(outboundQtyBase, now);
                reversalTransaction.AddLine(
                    originalLine.ProductId,
                    originalLine.LocationId,
                    originalLine.BatchId,
                    originalLine.ProductUomId,
                    originalLine.EnteredQty,
                    originalLine.ConversionSnapshot,
                    invertedDeltaBase,
                    outgoingUnitCostBase);
            }
        }

        return null;
    }

    private async Task<Result<InventoryTxnDto>?> ProcessStandardAdjustmentAsync(
        Guid organizationId,
        CreateInventoryAdjustmentRequest request,
        InventoryTxn inventoryTransaction,
        IDictionary<Guid, string> batchNumbersById,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        // Batch-fetch all reference entities BEFORE acquiring exclusive STOCK_BALANCE FOR UPDATE locks.
        var requestedLines = request.Lines!;
        var distinctLocationIds = requestedLines.Select(line => line.LocationId).Distinct().ToArray();
        var locationsById = (await _locationRepo.GetByIdsAsync(organizationId, request.BranchId, distinctLocationIds, cancellationToken))
            .ToDictionary(location => location.LocationId);

        Dictionary<Guid, Product>? productsById = null;
        if (_productRepo != null)
        {
            var distinctProductIds = requestedLines.Select(line => line.ProductId).Distinct().ToArray();
            productsById = (await _productRepo.GetByIdsAsync(organizationId, distinctProductIds, cancellationToken))
                .ToDictionary(product => product.ProductId);
        }

        Dictionary<(Guid ProductId, Guid ProductUomId), ProductUom>? uomsByKey = null;
        Dictionary<Guid, Guid>? baseUomIdsByProductId = null;
        if (_productUomRepo != null)
        {
            var distinctUomIds = requestedLines.Select(line => line.ProductUomId).Distinct().ToArray();
            var fetchedUoms = await _productUomRepo.GetByIdsAsync(organizationId, distinctUomIds, cancellationToken);
            uomsByKey = fetchedUoms.ToDictionary(uom => (uom.ProductId, uom.ProductUomId));

            // Seed known active base UOMs from the already-fetched set, then batch-fetch missing base UOMs
            // for any product where the caller entered a non-base unit (e.g., BOX/STRIP).
            baseUomIdsByProductId = fetchedUoms
                .Where(uom => uom.IsBase && uom.IsActive)
                .GroupBy(uom => uom.ProductId)
                .ToDictionary(group => group.Key, group => group.First().ProductUomId);

            var productIdsNeedingBaseUom = requestedLines
                .Select(line => line.ProductId)
                .Distinct()
                .Where(productId => !baseUomIdsByProductId.ContainsKey(productId))
                .ToArray();

            if (productIdsNeedingBaseUom.Length > 0)
            {
                var fetchedBaseUoms = await _productUomRepo.GetActiveBaseUomsByProductIdsAsync(
                    organizationId, productIdsNeedingBaseUom, cancellationToken);
                if (fetchedBaseUoms != null)
                {
                    foreach (var baseUom in fetchedBaseUoms)
                    {
                        baseUomIdsByProductId.TryAdd(baseUom.ProductId, baseUom.ProductUomId);
                    }
                }
            }
        }

        var batchRequests = new List<(Guid ProductId, string BatchNumber, DateOnly? ExpiresOn, DateOnly? ManufacturedOn)>(requestedLines.Count);
        var validatedLines = new List<(CreateInventoryAdjustmentLineRequest LineRequest, Guid ComputedBatchId, Guid BaseProductUomId, decimal ConversionFactor)>(requestedLines.Count);

        for (int lineIndex = 0; lineIndex < requestedLines.Count; lineIndex++)
        {
            var lineRequest = requestedLines[lineIndex];
            if (!locationsById.TryGetValue(lineRequest.LocationId, out var location) || !location.IsActive)
            {
                return Result<InventoryTxnDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.LocationNotFound);
            }

            bool isNonLotInput = string.IsNullOrWhiteSpace(lineRequest.BatchNumber)
                || string.Equals(lineRequest.BatchNumber, DeterministicBatchIdGenerator.NonLotBatchNumber, StringComparison.Ordinal);

            if (productsById != null)
            {
                if (!productsById.TryGetValue(lineRequest.ProductId, out var product))
                {
                    return Result<InventoryTxnDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductNotFound);
                }

                if (product.LotTrackingRequired)
                {
                    if (isNonLotInput)
                    {
                        return Result<InventoryTxnDto>.Failure(
                            ErrorCode.VALIDATION_ERROR,
                            ErrorMessages.NonLotMisuse,
                            new[] { new ApiErrorDetailDto($"lines[{lineIndex}].batch_number", ErrorMessages.NonLotMisuse) });
                    }

                    if (!lineRequest.ExpiresOn.HasValue)
                    {
                        return Result<InventoryTxnDto>.Failure(
                            ErrorCode.VALIDATION_ERROR,
                            ErrorMessages.InvalidBatchDates,
                            new[] { new ApiErrorDetailDto($"lines[{lineIndex}].expires_on", ErrorMessages.InvalidBatchDates) });
                    }
                }
                else
                {
                    if (!isNonLotInput || lineRequest.ExpiresOn.HasValue)
                    {
                        return Result<InventoryTxnDto>.Failure(
                            ErrorCode.VALIDATION_ERROR,
                            ErrorMessages.NonLotMisuse,
                            new[] { new ApiErrorDetailDto($"lines[{lineIndex}].batch_number", ErrorMessages.NonLotMisuse) });
                    }
                }
            }

            // Default conversion factor of 1m supports unit tests constructed without an optional UOM repository.
            decimal conversionFactor = 1m;
            Guid baseProductUomId = lineRequest.ProductUomId;
            if (uomsByKey != null)
            {
                if (!uomsByKey.TryGetValue((lineRequest.ProductId, lineRequest.ProductUomId), out var uom) || !uom.IsActive)
                {
                    return Result<InventoryTxnDto>.Failure(ErrorCode.NOT_FOUND, ErrorMessages.ProductUomNotFound);
                }

                if (uom.ConversionToBase > 0m)
                {
                    conversionFactor = uom.ConversionToBase;
                }

                if (uom.IsBase)
                {
                    baseProductUomId = uom.ProductUomId;
                }
                else if (baseUomIdsByProductId != null && baseUomIdsByProductId.TryGetValue(lineRequest.ProductId, out var resolvedBaseUomId))
                {
                    baseProductUomId = resolvedBaseUomId;
                }
                else
                {
                    return Result<InventoryTxnDto>.Failure(ErrorCode.CONFLICT, ErrorMessages.InvalidBaseUomInvariant);
                }
            }

            string effectiveBatchNumber = isNonLotInput
                ? DeterministicBatchIdGenerator.NonLotBatchNumber
                : lineRequest.BatchNumber!;
            DateOnly? effectiveExpiresOn = isNonLotInput ? null : lineRequest.ExpiresOn;
            DateOnly? effectiveManufacturedOn = isNonLotInput ? null : lineRequest.ManufacturedOn;

            Guid computedBatchId = effectiveExpiresOn.HasValue
                ? DeterministicBatchIdGenerator.Generate(organizationId, lineRequest.ProductId, effectiveBatchNumber, effectiveExpiresOn.Value)
                : DeterministicBatchIdGenerator.GenerateNonLotBatchId(organizationId, lineRequest.ProductId);

            batchRequests.Add((lineRequest.ProductId, effectiveBatchNumber, effectiveExpiresOn, effectiveManufacturedOn));
            validatedLines.Add((lineRequest, computedBatchId, baseProductUomId, conversionFactor));
        }

        // Batch-upsert/fetch all distinct batches in one round-trip.
        var batchesById = await _batchRepo.GetOrCreateBatchesAsync(organizationId, batchRequests, cancellationToken);
        foreach (var entry in batchesById)
        {
            batchNumbersById[entry.Key] = entry.Value.BatchNumber;
        }

        var orderedLines = validatedLines
            .OrderBy(entry => entry.LineRequest.LocationId)
            .ThenBy(entry => entry.ComputedBatchId)
            .ToList();

        var distinctBalanceKeys = orderedLines
            .Select(entry => (entry.LineRequest.LocationId, entry.ComputedBatchId))
            .Distinct()
            .ToArray();

        // Batch-upsert and lock all distinct (LocationId, BatchId) rows in a single ordered FOR UPDATE query.
        var lockedBalances = await _stockRepo.GetOrCreateForUpdateBatchAsync(organizationId, distinctBalanceKeys, now, cancellationToken);

        // OPENING_BALANCE is permitted only once per (LocationId, BatchId) when on-hand quantity is zero
        // and no prior ledger history exists; duplicate lines for the same balance key are also rejected.
        if (request.TransactionType == InventoryTransactionType.OPENING_BALANCE)
        {
            if (distinctBalanceKeys.Length != orderedLines.Count)
            {
                return Result<InventoryTxnDto>.Failure(ErrorCode.INVALID_STATE_TRANSITION, ErrorMessages.InvalidStateTransition);
            }

            foreach (var (locationId, batchId) in distinctBalanceKeys)
            {
                if (lockedBalances[(locationId, batchId)].OnHandQtyBase != 0m
                    || await _txnRepo.HasLedgerHistoryAsync(organizationId, locationId, batchId, cancellationToken))
                {
                    return Result<InventoryTxnDto>.Failure(ErrorCode.INVALID_STATE_TRANSITION, ErrorMessages.InvalidStateTransition);
                }
            }
        }

        foreach (var (lineRequest, batchId, baseProductUomId, conversionFactor) in orderedLines)
        {
            var stockBalance = lockedBalances[(lineRequest.LocationId, batchId)];

            // Convert entered UOM quantity and unit cost into base units:
            // baseQty = enteredQty * conversionToBase, baseUnitCost = enteredUnitCost / conversionToBase.
            // Blueprint §8.9.12: Every persisted and returned inventory ledger line is normalized to the
            // product's active base UOM (product_uom_id = baseUomId, entered_qty = abs(quantity_delta_base), conversion_snapshot = 1).
            decimal quantityBase = Math.Round(lineRequest.EnteredQty * conversionFactor, 4, MidpointRounding.AwayFromZero);
            decimal baseUnitCost = lineRequest.UnitCostEntered.HasValue
                ? Math.Round(lineRequest.UnitCostEntered.Value / conversionFactor, 4, MidpointRounding.AwayFromZero)
                : stockBalance.AverageUnitCost;

            if (request.TransactionType == InventoryTransactionType.OPENING_BALANCE || request.TransactionType == InventoryTransactionType.ADJUSTMENT_IN)
            {
                stockBalance.ApplyIncomingStock(quantityBase, baseUnitCost, now);
                inventoryTransaction.AddLine(lineRequest.ProductId, lineRequest.LocationId, batchId, baseProductUomId, quantityBase, 1m, quantityBase, baseUnitCost);
            }
            else if (request.TransactionType == InventoryTransactionType.ADJUSTMENT_OUT)
            {
                if (stockBalance.OnHandQtyBase < quantityBase)
                {
                    return Result<InventoryTxnDto>.Failure(ErrorCode.OUT_OF_STOCK, ErrorMessages.OutOfStock);
                }

                baseUnitCost = stockBalance.ApplyOutgoingStock(quantityBase, now);
                inventoryTransaction.AddLine(lineRequest.ProductId, lineRequest.LocationId, batchId, baseProductUomId, quantityBase, 1m, -quantityBase, baseUnitCost);
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

            // PostgreSQL SQLSTATE 40001 (serialization_failure) and 40P01 (deadlock_detected) are safe to retry.
            var sqlState = current.GetType().GetProperty("SqlState")?.GetValue(current) as string;
            if (string.Equals(sqlState, "40001", StringComparison.Ordinal) ||
                string.Equals(sqlState, "40P01", StringComparison.Ordinal))
            {
                return true;
            }
        }

        return false;
    }

    private static InventoryTxnDto MapToTxnDto(InventoryTxn transaction, IReadOnlyDictionary<Guid, string> batchNumbersById) =>
        new(
            transaction.InventoryTxnId, transaction.OrganizationId, transaction.BranchId, transaction.TransactionNo, transaction.TransactionType, transaction.Status,
            transaction.ReasonCode, transaction.Note, transaction.IdempotencyKey, transaction.CreatedByEmployeeId, transaction.ReversesInventoryTxnId, transaction.PostedAt,
            transaction.Lines.Select(line => new InventoryTxnLineDto(
                line.InventoryTxnLineId,
                line.ProductId,
                line.LocationId,
                line.BatchId,
                batchNumbersById.TryGetValue(line.BatchId, out var resolvedBatchNumber)
                    ? resolvedBatchNumber
                    : (line.Batch?.BatchNumber ?? DeterministicBatchIdGenerator.NonLotBatchNumber),
                line.ProductUomId,
                line.EnteredQty,
                line.ConversionSnapshot,
                line.QuantityDeltaBase,
                line.UnitCostBase)).ToList());
}
