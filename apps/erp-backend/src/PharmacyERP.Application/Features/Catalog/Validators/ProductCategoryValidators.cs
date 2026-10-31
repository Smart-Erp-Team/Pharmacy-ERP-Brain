using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Catalog.DTOs;

namespace PharmacyERP.Application.Features.Catalog.Validators;

public static class CreateProductCategoryRequestValidator
{
    public static IReadOnlyList<ApiErrorDetailDto> Validate(CreateProductCategoryRequest request)
    {
        var errors = new List<ApiErrorDetailDto>();

        if (string.IsNullOrWhiteSpace(request.Code))
            errors.Add(new ApiErrorDetailDto("Code", "Code is required."));
        else if (request.Code.Length > 30)
            errors.Add(new ApiErrorDetailDto("Code", "Code cannot exceed 30 characters."));

        if (string.IsNullOrWhiteSpace(request.Name))
            errors.Add(new ApiErrorDetailDto("Name", "Name is required."));
        else if (request.Name.Length > 100)
            errors.Add(new ApiErrorDetailDto("Name", "Name cannot exceed 100 characters."));

        if (request.Description != null && request.Description.Length > 250)
            errors.Add(new ApiErrorDetailDto("Description", "Description cannot exceed 250 characters."));

        if (string.IsNullOrWhiteSpace(request.IdempotencyKey))
            errors.Add(new ApiErrorDetailDto("IdempotencyKey", "IdempotencyKey is required."));

        return errors;
    }
}

public static class UpdateProductCategoryRequestValidator
{
    public static IReadOnlyList<ApiErrorDetailDto> Validate(UpdateProductCategoryRequest request)
    {
        var errors = new List<ApiErrorDetailDto>();

        if (string.IsNullOrWhiteSpace(request.Name))
            errors.Add(new ApiErrorDetailDto("Name", "Name is required."));
        else if (request.Name.Length > 100)
            errors.Add(new ApiErrorDetailDto("Name", "Name cannot exceed 100 characters."));

        if (request.Description != null && request.Description.Length > 250)
            errors.Add(new ApiErrorDetailDto("Description", "Description cannot exceed 250 characters."));

        if (string.IsNullOrWhiteSpace(request.IdempotencyKey))
            errors.Add(new ApiErrorDetailDto("IdempotencyKey", "IdempotencyKey is required."));

        return errors;
    }
}

