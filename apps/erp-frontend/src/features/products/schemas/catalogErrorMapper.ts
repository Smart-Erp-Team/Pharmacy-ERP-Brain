import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiClientError } from '../../../lib/api/client';
import type { CategoryFormValues } from './categorySchema';
import type {
  CreateProductFormValues,
  EditProductFormValues,
} from './productSchema';
import type {
  CreateUomFormValues,
  EditUomFormValues,
  ReorderRuleFormValues,
} from './uomReorderSchema';

function mapCategoryField(field: string): Path<CategoryFormValues> | null {
  switch (field) {
    case 'code':
    case 'name':
    case 'description':
    case 'parent_category_id':
    case 'is_active':
      return field;
    default:
      return null;
  }
}

function mapCreateProductField(
  field: string
): Path<CreateProductFormValues> | null {
  switch (field) {
    case 'category_id':
    case 'sku':
    case 'name':
    case 'barcode':
    case 'generic_name':
    case 'brand_name':
    case 'image_url':
    case 'lot_tracking_required':
    case 'expiry_alert_days':
      return field;
    case 'tax_rate':
    case 'tax_percent':
      return 'tax_percent';
    case 'base_uom_code':
    case 'uoms[0].uom_code':
    case 'uoms.0.uom_code':
    case 'base_uom.uom_code':
      return 'base_uom.uom_code';
    case 'uoms[0].display_name':
    case 'uoms.0.display_name':
    case 'base_uom.display_name':
      return 'base_uom.display_name';
    case 'uoms[0].is_sellable':
    case 'uoms.0.is_sellable':
    case 'base_uom.is_sellable':
      return 'base_uom.is_sellable';
    case 'uoms[0].is_purchasable':
    case 'uoms.0.is_purchasable':
    case 'base_uom.is_purchasable':
      return 'base_uom.is_purchasable';
    case 'uoms[0].sale_unit_price':
    case 'uoms.0.sale_unit_price':
    case 'base_uom.sale_unit_price':
      return 'base_uom.sale_unit_price';
    default:
      return null;
  }
}

function mapEditProductField(
  field: string
): Path<EditProductFormValues> | null {
  switch (field) {
    case 'category_id':
    case 'name':
    case 'barcode':
    case 'generic_name':
    case 'brand_name':
    case 'image_url':
    case 'lot_tracking_required':
    case 'expiry_alert_days':
    case 'is_active':
      return field;
    case 'tax_rate':
    case 'tax_percent':
      return 'tax_percent';
    default:
      return null;
  }
}

function mapCreateUomField(field: string): Path<CreateUomFormValues> | null {
  switch (field) {
    case 'uom_code':
    case 'display_name':
    case 'conversion_to_base':
    case 'is_base':
    case 'is_sellable':
    case 'is_purchasable':
    case 'sale_unit_price':
      return field;
    default:
      return null;
  }
}

function mapEditUomField(field: string): Path<EditUomFormValues> | null {
  switch (field) {
    case 'display_name':
    case 'is_sellable':
    case 'is_purchasable':
    case 'sale_unit_price':
    case 'is_active':
      return field;
    default:
      return null;
  }
}

function mapReorderRuleField(
  field: string
): Path<ReorderRuleFormValues> | null {
  switch (field) {
    case 'reorder_point_base':
    case 'reorder_quantity_base':
    case 'max_quantity_base':
    case 'is_active':
      return field;
    default:
      return null;
  }
}

function applyMappedApiError<TFieldValues extends FieldValues>(
  error: unknown,
  fallbackMessage: string,
  setError: UseFormSetError<TFieldValues>,
  mapField: (field: string) => Path<TFieldValues> | null
): string | null {
  if (!(error instanceof ApiClientError)) {
    return fallbackMessage;
  }

  let mappedFieldError = false;
  for (const detail of error.details ?? []) {
    if (!detail.field) {
      continue;
    }
    const targetPath = mapField(detail.field);
    if (targetPath) {
      setError(targetPath, { type: 'server', message: detail.issue });
      mappedFieldError = true;
    }
  }

  if (!mappedFieldError || error.status === 409) {
    const traceSuffix = error.trace_id ? ` (Trace: ${error.trace_id})` : '';
    return `${error.message}${traceSuffix}`;
  }

  return null;
}

export function applyCategoryFormApiError(
  error: unknown,
  setError: UseFormSetError<CategoryFormValues>
): string | null {
  return applyMappedApiError(
    error,
    'Unable to save category. Please try again.',
    setError,
    mapCategoryField
  );
}

export function applyCreateProductFormApiError(
  error: unknown,
  setError: UseFormSetError<CreateProductFormValues>
): string | null {
  return applyMappedApiError(
    error,
    'Unable to create product. Please try again.',
    setError,
    mapCreateProductField
  );
}

export function applyEditProductFormApiError(
  error: unknown,
  setError: UseFormSetError<EditProductFormValues>
): string | null {
  return applyMappedApiError(
    error,
    'Unable to update product. Please try again.',
    setError,
    mapEditProductField
  );
}

export function applyCreateUomFormApiError(
  error: unknown,
  setError: UseFormSetError<CreateUomFormValues>
): string | null {
  return applyMappedApiError(
    error,
    'Unable to add unit of measure. Please try again.',
    setError,
    mapCreateUomField
  );
}

export function applyEditUomFormApiError(
  error: unknown,
  setError: UseFormSetError<EditUomFormValues>
): string | null {
  return applyMappedApiError(
    error,
    'Unable to update unit of measure. Please try again.',
    setError,
    mapEditUomField
  );
}

export function applyReorderRuleFormApiError(
  error: unknown,
  setError: UseFormSetError<ReorderRuleFormValues>
): string | null {
  return applyMappedApiError(
    error,
    'Unable to save reorder rule. Please try again.',
    setError,
    mapReorderRuleField
  );
}
