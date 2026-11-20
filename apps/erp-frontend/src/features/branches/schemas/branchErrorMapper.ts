import type { UseFormSetError } from 'react-hook-form';
import { ApiClientError } from '../../../lib/api/client';
import type { BranchFormValues } from './branchSchema';

const BRANCH_FORM_FIELDS = new Set<string>([
  'code',
  'name',
  'is_active',
  'address.line1',
  'address.line2',
  'address.city',
  'address.region',
  'address.postal_code',
  'address.country_code',
]);

type BranchFieldPath =
  | 'code'
  | 'name'
  | 'is_active'
  | 'address.line1'
  | 'address.line2'
  | 'address.city'
  | 'address.region'
  | 'address.postal_code'
  | 'address.country_code';

function isBranchFieldPath(
  field: string | undefined
): field is BranchFieldPath {
  return typeof field === 'string' && BRANCH_FORM_FIELDS.has(field);
}

export function applyBranchFormApiError(
  error: unknown,
  setError: UseFormSetError<BranchFormValues>
): string | null {
  if (!(error instanceof ApiClientError)) {
    return 'Unable to save branch. Please try again.';
  }

  let mappedFieldError = false;
  for (const detail of error.details ?? []) {
    if (isBranchFieldPath(detail.field)) {
      setError(detail.field, { type: 'server', message: detail.issue });
      mappedFieldError = true;
    }
  }

  if (!mappedFieldError || error.status === 409) {
    const traceSuffix = error.trace_id ? ` (Trace: ${error.trace_id})` : '';
    return `${error.message}${traceSuffix}`;
  }

  return null;
}
