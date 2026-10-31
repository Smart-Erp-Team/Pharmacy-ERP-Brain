using System;
using System.Linq;
using PharmacyERP.Application.Features.Inventory.DTOs;
using PharmacyERP.Domain.Enums;

namespace PharmacyERP.Application.Features.Inventory.Validators;

public static class InventoryAdjustmentValidators
{
    public static (bool IsValid, string? ErrorMessage) ValidateAdjustment(CreateInventoryAdjustmentRequest req)
    {
        if (req.BranchId == Guid.Empty) return (false, "BranchId is required.");
        if (string.IsNullOrWhiteSpace(req.IdempotencyKey)) return (false, "IdempotencyKey is required.");
        if (req.Lines == null || !req.Lines.Any()) return (false, "Adjustment must contain at least one line.");

        var allowedTypes = new[]
        {
            InventoryTransactionType.OPENING_BALANCE,
            InventoryTransactionType.ADJUSTMENT_IN,
            InventoryTransactionType.ADJUSTMENT_OUT,
            InventoryTransactionType.REVERSAL
        };

        if (!allowedTypes.Contains(req.TransactionType))
            return (false, $"TransactionType {req.TransactionType} is not supported on adjustment endpoint.");

        foreach (var line in req.Lines)
        {
            if (line.ProductId == Guid.Empty) return (false, "Line ProductId is required.");
            if (line.ProductUomId == Guid.Empty) return (false, "Line ProductUomId is required.");
            if (line.LocationId == Guid.Empty) return (false, "Line LocationId is required.");
            if (line.EnteredQty <= 0) return (false, "Line EnteredQty must be greater than zero.");

            if ((req.TransactionType == InventoryTransactionType.OPENING_BALANCE || req.TransactionType == InventoryTransactionType.ADJUSTMENT_IN)
                && (!line.UnitCostEntered.HasValue || line.UnitCostEntered.Value < 0))
            {
                return (false, "Incoming transactions require valid non-negative UnitCostEntered.");
            }
        }

        return (true, null);
    }
}