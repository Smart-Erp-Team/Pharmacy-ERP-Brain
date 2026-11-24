namespace PharmacyERP.Application.Features.Inventory.Validators;

/// <summary>
/// Validates inventory adjustment and reversal payloads, returning wire-consistent
/// <c>snake_case</c> <see cref="ApiErrorDetailDto"/> entries.
/// </summary>
public static class InventoryAdjustmentValidators
{
    public static IReadOnlyList<ApiErrorDetailDto> ValidateAdjustment(CreateInventoryAdjustmentRequest req)
    {
        var errors = new List<ApiErrorDetailDto>();

        if (req.BranchId == Guid.Empty)
            errors.Add(new ApiErrorDetailDto("branch_id", "BranchId is required."));

        if (string.IsNullOrWhiteSpace(req.IdempotencyKey))
            errors.Add(new ApiErrorDetailDto("idempotency_key", "IdempotencyKey is required."));
        else if (req.IdempotencyKey.Length > 100)
            errors.Add(new ApiErrorDetailDto("idempotency_key", "IdempotencyKey cannot exceed 100 characters."));

        if (req.ReasonCode != null && req.ReasonCode.Length > 40)
            errors.Add(new ApiErrorDetailDto("reason_code", "ReasonCode cannot exceed 40 characters."));

        if (req.Note != null && req.Note.Length > 500)
            errors.Add(new ApiErrorDetailDto("note", "Note cannot exceed 500 characters."));

        var isAllowedType = req.TransactionType is
            InventoryTransactionType.OPENING_BALANCE or
            InventoryTransactionType.ADJUSTMENT_IN or
            InventoryTransactionType.ADJUSTMENT_OUT or
            InventoryTransactionType.REVERSAL;

        if (!isAllowedType)
        {
            errors.Add(new ApiErrorDetailDto(
                "transaction_type",
                $"TransactionType {req.TransactionType} is not supported on adjustment endpoint."));
            return errors;
        }

        if (req.TransactionType == InventoryTransactionType.REVERSAL)
        {
            if (!req.ReversesInventoryTxnId.HasValue || req.ReversesInventoryTxnId.Value == Guid.Empty)
                errors.Add(new ApiErrorDetailDto(
                    "reverses_inventory_txn_id",
                    "ReversesInventoryTxnId is required for REVERSAL transactions."));

            return errors;
        }

        if (req.Lines == null || req.Lines.Count == 0)
        {
            errors.Add(new ApiErrorDetailDto("lines", "Adjustment must contain at least one line."));
            return errors;
        }

        for (int index = 0; index < req.Lines.Count; index++)
        {
            var line = req.Lines[index];
            var prefix = $"lines[{index}]";

            if (line.ProductId == Guid.Empty)
                errors.Add(new ApiErrorDetailDto($"{prefix}.product_id", "ProductId is required."));

            if (line.ProductUomId == Guid.Empty)
                errors.Add(new ApiErrorDetailDto($"{prefix}.product_uom_id", "ProductUomId is required."));

            if (line.LocationId == Guid.Empty)
                errors.Add(new ApiErrorDetailDto($"{prefix}.location_id", "LocationId is required."));

            if (line.BatchNumber != null && line.BatchNumber.Length > 80)
                errors.Add(new ApiErrorDetailDto($"{prefix}.batch_number", "BatchNumber cannot exceed 80 characters."));

            if (line.ManufacturedOn.HasValue && line.ExpiresOn.HasValue && line.ManufacturedOn.Value > line.ExpiresOn.Value)
                errors.Add(new ApiErrorDetailDto($"{prefix}.manufactured_on", ErrorMessages.InvalidBatchDates));

            if (line.EnteredQty <= 0)
                errors.Add(new ApiErrorDetailDto($"{prefix}.entered_qty", "EnteredQty must be greater than zero."));

            if ((req.TransactionType == InventoryTransactionType.OPENING_BALANCE || req.TransactionType == InventoryTransactionType.ADJUSTMENT_IN)
                && (!line.UnitCostEntered.HasValue || line.UnitCostEntered.Value < 0))
            {
                errors.Add(new ApiErrorDetailDto(
                    $"{prefix}.unit_cost_entered",
                    "Incoming transactions require valid non-negative UnitCostEntered."));
            }
        }

        return errors;
    }
}
