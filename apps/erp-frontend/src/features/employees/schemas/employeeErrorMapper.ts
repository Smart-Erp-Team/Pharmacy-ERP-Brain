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

export function applyEmployeeFormApiError(
  error: unknown,
  setError: UseFormSetError<EmployeeFormValues>
): string | null {
  if (!(error instanceof ApiClientError)) {
    return 'Unable to save employee. Please try again.';
  }

  let mappedFieldError = false;
  for (const detail of error.details ?? []) {
    if (isEmployeeFieldPath(detail.field)) {
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
