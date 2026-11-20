using System;
using PharmacyERP.Application.Features.Inventory.DTOs;
using PharmacyERP.Domain.Enums;

namespace PharmacyERP.Application.Features.Inventory.Validators;

public static class InventoryLocationValidators
{
    public static (bool IsValid, string? ErrorMessage) ValidateCreate(CreateInventoryLocationRequest req)
    {
        if (req.BranchId == Guid.Empty) return (false, "BranchId is required.");
        if (string.IsNullOrWhiteSpace(req.LocationCode)) return (false, "LocationCode is required.");
        if (string.IsNullOrWhiteSpace(req.Name)) return (false, "Name is required.");
        if (string.IsNullOrWhiteSpace(req.IdempotencyKey)) return (false, "IdempotencyKey is required.");
        if (req.IsSellable && req.LocationType != LocationType.SELLABLE)
            return (false, "Only SELLABLE location type can have IsSellable set to true.");

        return (true, null);
    }

    public static (bool IsValid, string? ErrorMessage) ValidateUpdate(UpdateInventoryLocationRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.IdempotencyKey)) return (false, "IdempotencyKey is required.");
        if (req.Name != null && string.IsNullOrWhiteSpace(req.Name)) return (false, "Name cannot be empty.");

        return (true, null);
    }
}