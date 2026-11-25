namespace PharmacyERP.Application.Features.Catalog.Validators;

public static class UpsertReorderRuleRequestValidator
{
    public static IReadOnlyList<ApiErrorDetailDto> Validate(UpsertReorderRuleRequest request)
    {
        var errors = new List<ApiErrorDetailDto>();

        if (request.ReorderPointBase < 0m)
            errors.Add(new ApiErrorDetailDto("reorder_point_base", "Reorder point must be non-negative."));

        if (request.ReorderQuantityBase < 0m)
            errors.Add(new ApiErrorDetailDto("reorder_quantity_base", "Reorder quantity must be non-negative."));

        if (request.MaxQuantityBase.HasValue && request.MaxQuantityBase.Value < request.ReorderPointBase)
            errors.Add(new ApiErrorDetailDto("max_quantity_base", "Maximum quantity cannot be less than reorder point."));

        if (string.IsNullOrWhiteSpace(request.IdempotencyKey))
            errors.Add(new ApiErrorDetailDto("idempotency_key", "IdempotencyKey is required."));
        else if (request.IdempotencyKey.Length > 100)
            errors.Add(new ApiErrorDetailDto("idempotency_key", "IdempotencyKey cannot exceed 100 characters."));

        return errors;
    }
}

