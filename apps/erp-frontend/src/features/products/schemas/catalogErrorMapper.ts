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

function normalizeWireFieldPath(rawField: string): string {
  return rawField.trim().replace(/^\$\./, '');
}

function mapCategoryField(field: string): Path<CategoryFormValues> | null {
  switch (normalizeWireFieldPath(field)) {
    case 'code':
    case 'name':
    case 'description':
    case 'parent_category_id':
    case 'is_active':
      return normalizeWireFieldPath(field) === 'code'
        ? 'code'
        : normalizeWireFieldPath(field) === 'name'
          ? 'name'
          : normalizeWireFieldPath(field) === 'description'
            ? 'description'
            : normalizeWireFieldPath(field) === 'parent_category_id'
              ? 'parent_category_id'
              : 'is_active';
    default:
      return null;
  }
}

function mapCreateProductField(
  field: string
): Path<CreateProductFormValues> | null {
  switch (normalizeWireFieldPath(field)) {
    case 'category_id':
      return 'category_id';
    case 'sku':
      return 'sku';
    case 'name':
      return 'name';
    case 'barcode':
      return 'barcode';
    case 'generic_name':
      return 'generic_name';
    case 'brand_name':
      return 'brand_name';
    case 'image_url':
      return 'image_url';
    case 'lot_tracking_required':
      return 'lot_tracking_required';
    case 'expiry_alert_days':
      return 'expiry_alert_days';
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
  switch (normalizeWireFieldPath(field)) {
    case 'category_id':
      return 'category_id';
    case 'name':
      return 'name';
    case 'barcode':
      return 'barcode';
    case 'generic_name':
      return 'generic_name';
    case 'brand_name':
      return 'brand_name';
    case 'image_url':
      return 'image_url';
    case 'lot_tracking_required':
      return 'lot_tracking_required';
    case 'expiry_alert_days':
      return 'expiry_alert_days';
    case 'is_active':
      return 'is_active';
    case 'tax_rate':
    case 'tax_percent':
      return 'tax_percent';
    default:
      return null;
  }
}

function mapCreateUomField(field: string): Path<CreateUomFormValues> | null {
  switch (normalizeWireFieldPath(field)) {
    case 'uom_code':
      return 'uom_code';
    case 'display_name':
      return 'display_name';
    case 'conversion_to_base':
      return 'conversion_to_base';
    case 'is_base':
      return 'is_base';
    case 'is_sellable':
      return 'is_sellable';
    case 'is_purchasable':
      return 'is_purchasable';
    case 'sale_unit_price':
      return 'sale_unit_price';
    default:
      return null;
  }
}

function mapEditUomField(field: string): Path<EditUomFormValues> | null {
  switch (normalizeWireFieldPath(field)) {
    case 'display_name':
      return 'display_name';
    case 'is_sellable':
      return 'is_sellable';
    case 'is_purchasable':
      return 'is_purchasable';
    case 'sale_unit_price':
      return 'sale_unit_price';
    case 'is_active':
      return 'is_active';
    default:
      return null;
  }
}

function mapReorderRuleField(
  field: string
): Path<ReorderRuleFormValues> | null {
  switch (normalizeWireFieldPath(field)) {
    case 'reorder_point_base':
      return 'reorder_point_base';
    case 'reorder_quantity_base':
      return 'reorder_quantity_base';
    case 'max_quantity_base':
      return 'max_quantity_base';
    case 'is_active':
      return 'is_active';
    default:
      return null;
  }
}

function requiresTopLevelBanner(error: ApiClientError): boolean {
  return (
    error.status === 400 ||
    error.status === 403 ||
    error.status === 409 ||
    error.code === 'MALFORMED_REQUEST' ||
    error.code === 'FORBIDDEN' ||
    error.code === 'FORBIDDEN_BRANCH' ||
    error.code === 'CONFLICT' ||
    error.code === 'IDEMPOTENCY_MISMATCH' ||
    error.code === 'INVALID_STATE_TRANSITION'
  );
}

function formatErrorBanner(error: ApiClientError): string {
  const traceSuffix = error.trace_id ? ` (Trace: ${error.trace_id})` : '';
  return `${error.message}${traceSuffix}`;
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

  // 400 MALFORMED_REQUEST and 403 FORBIDDEN / FORBIDDEN_BRANCH are request or
  // authorization-level failures — surface directly as a top-level banner.
  if (
    error.status === 400 ||
    error.status === 403 ||
    error.code === 'MALFORMED_REQUEST' ||
    error.code === 'FORBIDDEN' ||
    error.code === 'FORBIDDEN_BRANCH'
  ) {
    return formatErrorBanner(error);
  }

  let mappedFieldError = false;
  let hasUnmappedDetail = false;

  for (const detail of error.details) {
    if (!detail.field) {
      hasUnmappedDetail = true;
      continue;
    }
    const targetPath = mapField(detail.field);
    if (targetPath) {
      setError(targetPath, { type: 'server', message: detail.issue });
      mappedFieldError = true;
    } else {
      hasUnmappedDetail = true;
    }
  }

  if (!mappedFieldError || hasUnmappedDetail || requiresTopLevelBanner(error)) {
    return formatErrorBanner(error);
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
