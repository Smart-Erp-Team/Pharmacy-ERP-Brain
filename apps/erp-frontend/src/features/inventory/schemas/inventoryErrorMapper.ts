import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiClientError } from '../../../lib/api/client';
import type { InventoryAdjustmentFormValues } from './inventoryAdjustmentSchema';
import type {
  CreateLocationFormValues,
  EditLocationFormValues,
} from './inventoryLocationSchema';

const LINE_FIELD_PATTERN = /^lines(?:\[(\d+)\]|\.(\d+))\.([a-z_]+)$/;

function mapCreateLocationField(
  field: string
): Path<CreateLocationFormValues> | null {
  switch (field) {
    case 'location_code':
    case 'name':
    case 'location_type':
    case 'is_sellable':
      return field;
    default:
      return null;
  }
}

function mapEditLocationField(
  field: string
): Path<EditLocationFormValues> | null {
  switch (field) {
    case 'name':
    case 'is_sellable':
    case 'is_active':
      return field;
    default:
      return null;
  }
}

function mapAdjustmentField(
  field: string
): Path<InventoryAdjustmentFormValues> | null {
  switch (field) {
    case 'transaction_type':
    case 'reason_code':
    case 'note':
    case 'reverses_inventory_txn_id':
    case 'lines':
      return field;
    default: {
      const match = LINE_FIELD_PATTERN.exec(field);
      if (!match) {
        return null;
      }
      const rawIndex = match[1] ?? match[2] ?? '';
      const subField = match[3] ?? '';
      const index = Number.parseInt(rawIndex, 10);
      if (!Number.isInteger(index) || index < 0) {
        return null;
      }

      switch (subField) {
        case 'product_id':
          return `lines.${index}.product_id`;
        case 'product_uom_id':
          return `lines.${index}.product_uom_id`;
        case 'location_id':
          return `lines.${index}.location_id`;
        case 'batch_number':
          return `lines.${index}.batch_number`;
        case 'manufactured_on':
          return `lines.${index}.manufactured_on`;
        case 'expires_on':
          return `lines.${index}.expires_on`;
        case 'entered_qty':
        case 'quantity':
          return `lines.${index}.entered_qty`;
        case 'unit_cost_entered':
          return `lines.${index}.unit_cost_entered`;
        default:
          return null;
      }
    }
  }
}

function requiresTopLevelBanner(error: ApiClientError): boolean {
  return (
    error.status === 400 ||
    error.status === 403 ||
    error.status === 404 ||
    error.status === 409 ||
    (error.status !== undefined && error.status >= 500) ||
    error.code === 'MALFORMED_REQUEST' ||
    error.code === 'FORBIDDEN' ||
    error.code === 'FORBIDDEN_BRANCH' ||
    error.code === 'NOT_FOUND' ||
    error.code === 'OUT_OF_STOCK' ||
    error.code === 'CONFLICT' ||
    error.code === 'INVALID_STATE_TRANSITION' ||
    error.code === 'IDEMPOTENCY_MISMATCH' ||
    error.code === 'EXPIRY_POLICY_VIOLATION' ||
    error.code === 'INTERNAL_SERVER_ERROR'
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

function isCreateLocationSetError(
  _setError:
    | UseFormSetError<CreateLocationFormValues>
    | UseFormSetError<EditLocationFormValues>,
  mode: 'create' | 'edit'
): _setError is UseFormSetError<CreateLocationFormValues> {
  return mode === 'create';
}

export function applyCreateLocationFormApiError(
  error: unknown,
  setError: UseFormSetError<CreateLocationFormValues>
): string | null {
  return applyMappedApiError(
    error,
    'Unable to save inventory location. Please try again.',
    setError,
    mapCreateLocationField
  );
}

export function applyEditLocationFormApiError(
  error: unknown,
  setError: UseFormSetError<EditLocationFormValues>
): string | null {
  return applyMappedApiError(
    error,
    'Unable to update inventory location. Please try again.',
    setError,
    mapEditLocationField
  );
}

export function applyLocationFormApiError(
  error: unknown,
  setError: UseFormSetError<CreateLocationFormValues>,
  mode?: 'create'
): string | null;
export function applyLocationFormApiError(
  error: unknown,
  setError: UseFormSetError<EditLocationFormValues>,
  mode?: 'edit'
): string | null;
export function applyLocationFormApiError(
  error: unknown,
  setError:
    | UseFormSetError<CreateLocationFormValues>
    | UseFormSetError<EditLocationFormValues>,
  mode: 'create' | 'edit' = 'create'
): string | null {
  if (isCreateLocationSetError(setError, mode)) {
    return applyCreateLocationFormApiError(error, setError);
  }
  return applyEditLocationFormApiError(error, setError);
}

export function applyAdjustmentFormApiError(
  error: unknown,
  setError: UseFormSetError<InventoryAdjustmentFormValues>
): string | null {
  return applyMappedApiError(
    error,
    'Unable to submit inventory adjustment. Please try again.',
    setError,
    mapAdjustmentField
  );
}
