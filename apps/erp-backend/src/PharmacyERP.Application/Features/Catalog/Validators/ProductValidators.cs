using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Catalog.DTOs;

namespace PharmacyERP.Application.Features.Catalog.Validators;

public static class CreateProductRequestValidator
{
    public static IReadOnlyList<ApiErrorDetailDto> Validate(CreateProductRequest request)
    {
        var errors = new List<ApiErrorDetailDto>();

        if (request.CategoryId == Guid.Empty)
            errors.Add(new ApiErrorDetailDto("CategoryId", "CategoryId cannot be empty."));

        if (string.IsNullOrWhiteSpace(request.Sku))
            errors.Add(new ApiErrorDetailDto("Sku", "Sku is required."));
        else if (request.Sku.Length > 40)
            errors.Add(new ApiErrorDetailDto("Sku", "Sku cannot exceed 40 characters."));

        if (request.Barcode != null && request.Barcode.Length > 80)
            errors.Add(new ApiErrorDetailDto("Barcode", "Barcode cannot exceed 80 characters."));

        if (string.IsNullOrWhiteSpace(request.Name))
            errors.Add(new ApiErrorDetailDto("Name", "Name is required."));
        else if (request.Name.Length > 180)
            errors.Add(new ApiErrorDetailDto("Name", "Name cannot exceed 180 characters."));

        if (request.GenericName != null && request.GenericName.Length > 180)
            errors.Add(new ApiErrorDetailDto("GenericName", "GenericName cannot exceed 180 characters."));

        if (request.BrandName != null && request.BrandName.Length > 180)
            errors.Add(new ApiErrorDetailDto("BrandName", "BrandName cannot exceed 180 characters."));

        if (string.IsNullOrWhiteSpace(request.BaseUomCode))
            errors.Add(new ApiErrorDetailDto("BaseUomCode", "BaseUomCode is required."));
        else if (request.BaseUomCode.Length > 20)
            errors.Add(new ApiErrorDetailDto("BaseUomCode", "BaseUomCode cannot exceed 20 characters."));

        if (request.TaxRate < 0m || request.TaxRate > 1m)
            errors.Add(new ApiErrorDetailDto("TaxRate", "TaxRate must be between 0.0 and 1.0."));

        if (request.ImageUrl != null && request.ImageUrl.Length > 300)
            errors.Add(new ApiErrorDetailDto("ImageUrl", "ImageUrl cannot exceed 300 characters."));

        if (request.ExpiryAlertDays < 0)
            errors.Add(new ApiErrorDetailDto("ExpiryAlertDays", "ExpiryAlertDays must be non-negative."));

        if (string.IsNullOrWhiteSpace(request.IdempotencyKey))
            errors.Add(new ApiErrorDetailDto("IdempotencyKey", "IdempotencyKey is required."));

        if (request.Uoms == null || request.Uoms.Count == 0)
        {
            errors.Add(new ApiErrorDetailDto("Uoms", "At least one UOM is required for product creation."));
        }
        else
        {
            var seenCodes = new HashSet<string>(StringComparer.Ordinal);
            int baseCount = 0;
            bool baseMatchesCode = false;

            for (int i = 0; i < request.Uoms.Count; i++)
            {
                var uom = request.Uoms[i];
                var uomErrors = CreateProductUomItemRequestValidator.Validate(uom, $"Uoms[{i}]");
                errors.AddRange(uomErrors);

                if (!string.IsNullOrWhiteSpace(uom.UomCode))
                {
                    if (!seenCodes.Add(uom.UomCode))
                        errors.Add(new ApiErrorDetailDto($"Uoms[{i}].UomCode", $"Duplicate UOM code '{uom.UomCode}' in request."));

                    if (uom.IsBase)
                    {
                        baseCount++;
                        if (string.Equals(uom.UomCode, request.BaseUomCode, StringComparison.Ordinal))
                            baseMatchesCode = true;
                    }
                }
            }

            if (baseCount != 1)
                errors.Add(new ApiErrorDetailDto("Uoms", $"Product must have exactly one base UOM, found {baseCount}."));
            else if (!baseMatchesCode)
                errors.Add(new ApiErrorDetailDto("BaseUomCode", "Base UOM code in Uoms list must match Product.BaseUomCode."));
        }

        return errors;
    }
}

public static class UpdateProductRequestValidator
{
    public static IReadOnlyList<ApiErrorDetailDto> Validate(UpdateProductRequest request)
    {
        var errors = new List<ApiErrorDetailDto>();

        if (request.CategoryId.HasValue && request.CategoryId.Value == Guid.Empty)
            errors.Add(new ApiErrorDetailDto("CategoryId", "CategoryId cannot be empty."));

        if (request.Sku != null)
        {
            if (string.IsNullOrWhiteSpace(request.Sku))
                errors.Add(new ApiErrorDetailDto("Sku", "Sku cannot be empty."));
            else if (request.Sku.Length > 40)
                errors.Add(new ApiErrorDetailDto("Sku", "Sku cannot exceed 40 characters."));
        }

        if (request.Barcode != null && request.Barcode.Length > 80)
            errors.Add(new ApiErrorDetailDto("Barcode", "Barcode cannot exceed 80 characters."));

        if (request.Name != null)
        {
            if (string.IsNullOrWhiteSpace(request.Name))
                errors.Add(new ApiErrorDetailDto("Name", "Name cannot be empty."));
            else if (request.Name.Length > 180)
                errors.Add(new ApiErrorDetailDto("Name", "Name cannot exceed 180 characters."));
        }

        if (request.GenericName != null && request.GenericName.Length > 180)
            errors.Add(new ApiErrorDetailDto("GenericName", "GenericName cannot exceed 180 characters."));

        if (request.BrandName != null && request.BrandName.Length > 180)
            errors.Add(new ApiErrorDetailDto("BrandName", "BrandName cannot exceed 180 characters."));

        if (request.BaseUomCode != null)
        {
            if (string.IsNullOrWhiteSpace(request.BaseUomCode))
                errors.Add(new ApiErrorDetailDto("BaseUomCode", "BaseUomCode cannot be empty."));
            else if (request.BaseUomCode.Length > 20)
                errors.Add(new ApiErrorDetailDto("BaseUomCode", "BaseUomCode cannot exceed 20 characters."));
        }

        if (request.TaxRate.HasValue && (request.TaxRate.Value < 0m || request.TaxRate.Value > 1m))
            errors.Add(new ApiErrorDetailDto("TaxRate", "TaxRate must be between 0.0 and 1.0."));

        if (request.ImageUrl != null && request.ImageUrl.Length > 300)
            errors.Add(new ApiErrorDetailDto("ImageUrl", "ImageUrl cannot exceed 300 characters."));

        if (request.ExpiryAlertDays.HasValue && request.ExpiryAlertDays.Value < 0)
            errors.Add(new ApiErrorDetailDto("ExpiryAlertDays", "ExpiryAlertDays must be non-negative."));

        if (string.IsNullOrWhiteSpace(request.IdempotencyKey))
            errors.Add(new ApiErrorDetailDto("IdempotencyKey", "IdempotencyKey is required."));

        return errors;
    }
}

