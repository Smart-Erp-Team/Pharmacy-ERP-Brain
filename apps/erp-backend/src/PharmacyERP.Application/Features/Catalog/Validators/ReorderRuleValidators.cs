using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Catalog.DTOs;

namespace PharmacyERP.Application.Features.Catalog.Validators;

public static class UpsertReorderRuleRequestValidator
{
    public static IReadOnlyList<ApiErrorDetailDto> Validate(UpsertReorderRuleRequest request)
    {
        var errors = new List<ApiErrorDetailDto>();

        if (request.ReorderPointBase < 0m)
            errors.Add(new ApiErrorDetailDto("ReorderPointBase", "Reorder point must be non-negative."));

        if (request.ReorderQuantityBase < 0m)
            errors.Add(new ApiErrorDetailDto("ReorderQuantityBase", "Reorder quantity must be non-negative."));

        if (request.MaxQuantityBase.HasValue && request.MaxQuantityBase.Value < request.ReorderPointBase)
            errors.Add(new ApiErrorDetailDto("MaxQuantityBase", "Maximum quantity cannot be less than reorder point."));

        if (string.IsNullOrWhiteSpace(request.IdempotencyKey))
            errors.Add(new ApiErrorDetailDto("IdempotencyKey", "IdempotencyKey is required."));

        return errors;
    }
}

