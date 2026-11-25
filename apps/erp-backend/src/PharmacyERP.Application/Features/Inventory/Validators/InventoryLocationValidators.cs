namespace PharmacyERP.Application.Features.Inventory.Validators;

/// <summary>
/// Validates inventory location create and update payloads, returning wire-consistent
/// <c>snake_case</c> <see cref="ApiErrorDetailDto"/> entries.
/// </summary>
public static class InventoryLocationValidators
{
    public static IReadOnlyList<ApiErrorDetailDto> ValidateCreate(CreateInventoryLocationRequest req)
    {
        var errors = new List<ApiErrorDetailDto>();

        if (req.BranchId == Guid.Empty)
            errors.Add(new ApiErrorDetailDto("branch_id", "BranchId is required."));

        if (string.IsNullOrWhiteSpace(req.LocationCode))
            errors.Add(new ApiErrorDetailDto("location_code", "LocationCode is required."));
        else if (req.LocationCode.Length > 30)
            errors.Add(new ApiErrorDetailDto("location_code", "LocationCode cannot exceed 30 characters."));

        if (string.IsNullOrWhiteSpace(req.Name))
            errors.Add(new ApiErrorDetailDto("name", "Name is required."));
        else if (req.Name.Length > 100)
            errors.Add(new ApiErrorDetailDto("name", "Name cannot exceed 100 characters."));

        if (!Enum.IsDefined(req.LocationType))
            errors.Add(new ApiErrorDetailDto("location_type", "LocationType is invalid."));
        else if (req.IsSellable && req.LocationType != LocationType.SELLABLE)
            errors.Add(new ApiErrorDetailDto("is_sellable", "Only SELLABLE location type can have IsSellable set to true."));

        if (string.IsNullOrWhiteSpace(req.IdempotencyKey))
            errors.Add(new ApiErrorDetailDto("idempotency_key", "IdempotencyKey is required."));
        else if (req.IdempotencyKey.Length > 100)
            errors.Add(new ApiErrorDetailDto("idempotency_key", "IdempotencyKey cannot exceed 100 characters."));

        return errors;
    }

    public static IReadOnlyList<ApiErrorDetailDto> ValidateUpdate(UpdateInventoryLocationRequest req)
    {
        var errors = new List<ApiErrorDetailDto>();

        if (string.IsNullOrWhiteSpace(req.IdempotencyKey))
            errors.Add(new ApiErrorDetailDto("idempotency_key", "IdempotencyKey is required."));
        else if (req.IdempotencyKey.Length > 100)
            errors.Add(new ApiErrorDetailDto("idempotency_key", "IdempotencyKey cannot exceed 100 characters."));

        if (req.Name != null)
        {
            if (string.IsNullOrWhiteSpace(req.Name))
                errors.Add(new ApiErrorDetailDto("name", "Name cannot be empty."));
            else if (req.Name.Length > 100)
                errors.Add(new ApiErrorDetailDto("name", "Name cannot exceed 100 characters."));
        }

        return errors;
    }
}