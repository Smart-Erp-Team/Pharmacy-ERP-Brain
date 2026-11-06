using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Catalog.DTOs;

namespace PharmacyERP.Application.Features.Catalog.Validators;

public static class CreateProductUomItemRequestValidator
{
    public static IReadOnlyList<ApiErrorDetailDto> Validate(CreateProductUomItemRequest item, string prefix = "")
    {
        var errors = new List<ApiErrorDetailDto>();
        var fieldPrefix = string.IsNullOrEmpty(prefix) ? "" : prefix + ".";

        if (string.IsNullOrWhiteSpace(item.UomCode))
            errors.Add(new ApiErrorDetailDto($"{fieldPrefix}UomCode", "UomCode is required."));
        else if (item.UomCode.Length > 20)
            errors.Add(new ApiErrorDetailDto($"{fieldPrefix}UomCode", "UomCode cannot exceed 20 characters."));

        if (string.IsNullOrWhiteSpace(item.DisplayName))
            errors.Add(new ApiErrorDetailDto($"{fieldPrefix}DisplayName", "DisplayName is required."));
        else if (item.DisplayName.Length > 50)
            errors.Add(new ApiErrorDetailDto($"{fieldPrefix}DisplayName", "DisplayName cannot exceed 50 characters."));

        if (item.ConversionToBase <= 0m)
            errors.Add(new ApiErrorDetailDto($"{fieldPrefix}ConversionToBase", "Conversion factor must be greater than zero."));
        else if (item.IsBase && item.ConversionToBase != 1m)
            errors.Add(new ApiErrorDetailDto($"{fieldPrefix}ConversionToBase", "Base UOM conversion factor must be exactly 1."));

        if (item.IsSellable)
        {
            if (!item.SaleUnitPrice.HasValue)
                errors.Add(new ApiErrorDetailDto($"{fieldPrefix}SaleUnitPrice", "Sale unit price is required for sellable units."));
            else if (item.SaleUnitPrice.Value < 0m)
                errors.Add(new ApiErrorDetailDto($"{fieldPrefix}SaleUnitPrice", "Sale unit price must be non-negative."));
        }
        else if (item.SaleUnitPrice.HasValue && item.SaleUnitPrice.Value < 0m)
        {
            errors.Add(new ApiErrorDetailDto($"{fieldPrefix}SaleUnitPrice", "Sale unit price must be non-negative."));
        }

        return errors;
    }
}

public static class CreateProductUomRequestValidator
{
    public static IReadOnlyList<ApiErrorDetailDto> Validate(CreateProductUomRequest request)
    {
        var errors = new List<ApiErrorDetailDto>();

        var item = new CreateProductUomItemRequest(
            request.UomCode,
            request.DisplayName,
            request.ConversionToBase,
            request.SaleUnitPrice,
            request.IsBase,
            request.IsSellable,
            request.IsPurchasable);

        errors.AddRange(CreateProductUomItemRequestValidator.Validate(item));

        if (string.IsNullOrWhiteSpace(request.IdempotencyKey))
            errors.Add(new ApiErrorDetailDto("IdempotencyKey", "IdempotencyKey is required."));

        return errors;
    }
}

public static class UpdateProductUomRequestValidator
{
    public static IReadOnlyList<ApiErrorDetailDto> Validate(UpdateProductUomRequest request)
    {
        var errors = new List<ApiErrorDetailDto>();

        if (request.DisplayName != null)
        {
            if (string.IsNullOrWhiteSpace(request.DisplayName))
                errors.Add(new ApiErrorDetailDto("DisplayName", "DisplayName cannot be empty."));
            else if (request.DisplayName.Length > 50)
                errors.Add(new ApiErrorDetailDto("DisplayName", "DisplayName cannot exceed 50 characters."));
        }

        if (request.ConversionToBase.HasValue && request.ConversionToBase.Value <= 0m)
            errors.Add(new ApiErrorDetailDto("ConversionToBase", "Conversion factor must be greater than zero."));

        if (request.SaleUnitPrice.HasValue && request.SaleUnitPrice.Value < 0m)
            errors.Add(new ApiErrorDetailDto("SaleUnitPrice", "Sale unit price must be non-negative."));

        if (string.IsNullOrWhiteSpace(request.IdempotencyKey))
            errors.Add(new ApiErrorDetailDto("IdempotencyKey", "IdempotencyKey is required."));

        return errors;
    }
}

