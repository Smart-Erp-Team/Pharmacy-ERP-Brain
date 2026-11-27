import type { UseFormSetError } from 'react-hook-form';
import { ApiClientError } from '../../../lib/api/client';
import type { EmployeeFormValues } from './employeeSchema';

const EMPLOYEE_FORM_FIELDS = new Set<string>([
  'branch_id',
  'employee_no',
  'full_name',
  'job_title',
  'email',
  'phone',
  'hired_on',
  'is_active',
  'address.line1',
  'address.line2',
  'address.city',
  'address.region',
  'address.postal_code',
  'address.country_code',
]);

type EmployeeFieldPath =
  | 'branch_id'
  | 'employee_no'
  | 'full_name'
  | 'job_title'
  | 'email'
  | 'phone'
  | 'hired_on'
  | 'is_active'
  | 'address.line1'
  | 'address.line2'
  | 'address.city'
  | 'address.region'
  | 'address.postal_code'
  | 'address.country_code';

function isEmployeeFieldPath(
  field: string | undefined
): field is EmployeeFieldPath {
  return typeof field === 'string' && EMPLOYEE_FORM_FIELDS.has(field);
}

function resolveEmployeeFieldPath(
  field: string | undefined
): EmployeeFieldPath | null {
  if (typeof field !== 'string') {
    return null;
  }
  const trimmed = field.trim();
  if (trimmed === 'address') {
    return 'address.line1';
  }
  return isEmployeeFieldPath(trimmed) ? trimmed : null;
}

export function applyEmployeeFormApiError(
  error: unknown,
  setError: UseFormSetError<EmployeeFormValues>
): string | null {
  if (!(error instanceof ApiClientError)) {
    return 'Unable to save employee. Please try again.';
  }

  let mappedFieldError = false;
  for (const detail of error.details) {
    const fieldPath = resolveEmployeeFieldPath(detail.field);
    if (fieldPath) {
      setError(fieldPath, { type: 'server', message: detail.issue });
      mappedFieldError = true;
    }
  }

  const isConflict = error.code === 'CONFLICT' || error.status === 409;
  const isMalformed =
    error.code === 'MALFORMED_REQUEST' || error.status === 400;
  const isValidation =
    error.code === 'VALIDATION_ERROR' || error.status === 422;

  if (isValidation && mappedFieldError) {
    return null;
  }

  if (!mappedFieldError || isConflict || isMalformed || !isValidation) {
    const traceSuffix = error.trace_id ? ` (Trace: ${error.trace_id})` : '';
    return `${error.message}${traceSuffix}`;
  }

  return null;
}
