import type { UseFormSetError } from 'react-hook-form';
import { ApiClientError } from '../../../lib/api/client';
import type {
  BranchEnrollmentFormValues,
  BranchFormValues,
} from './branchSchema';

const BRANCH_FORM_FIELDS = new Set<string>([
  'branch_code',
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
  | 'branch_code'
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

function formatErrorWithTrace(error: ApiClientError): string {
  const traceSuffix = error.trace_id ? ` (Trace: ${error.trace_id})` : '';
  return `${error.message}${traceSuffix}`;
}

export function applyBranchFormApiError(
  error: unknown,
  setError: UseFormSetError<BranchFormValues>
): string | null {
  if (!(error instanceof ApiClientError)) {
    return 'Unable to save branch. Please try again.';
  }

  let mappedFieldError = false;
  for (const detail of error.details) {
    if (isBranchFieldPath(detail.field)) {
      setError(detail.field, { type: 'server', message: detail.issue });
      mappedFieldError = true;
    }
  }

  const isConflict =
    error.status === 409 ||
    error.code === 'CONFLICT' ||
    error.code === 'IDEMPOTENCY_MISMATCH';
  const isMalformed =
    error.status === 400 || error.code === 'MALFORMED_REQUEST';

  if (isConflict || isMalformed || !mappedFieldError) {
    return formatErrorWithTrace(error);
  }

  return null;
}

export interface BranchEnrollmentErrorState {
  title: string;
  message: string;
}

/**
 * Maps Stage 1 `/api/v1/branch-enrollment` errors to UI alert state.
 * Stage 1 returns `401 UNAUTHORIZED` for invalid, expired, or already-used
 * enrollment tokens (there is no `410 GONE` in Stage 1).
 */
export function mapBranchEnrollmentApiError(
  error: unknown
): BranchEnrollmentErrorState {
  if (!(error instanceof ApiClientError)) {
    return {
      title: 'Enrollment failed',
      message: 'Unable to activate this branch terminal. Please try again.',
    };
  }

  if (error.status === 401 || error.code === 'UNAUTHORIZED') {
    return {
      title: 'Invalid or expired enrollment token',
      message:
        'This enrollment token is invalid, expired, or has already been used. Ask an administrator in the head office workspace to issue a fresh token.',
    };
  }

  if (error.status === 422 || error.code === 'VALIDATION_ERROR') {
    return {
      title: 'Invalid enrollment request',
      message: formatErrorWithTrace(error),
    };
  }

  if (error.status === 400 || error.code === 'MALFORMED_REQUEST') {
    return {
      title: 'Malformed enrollment request',
      message: formatErrorWithTrace(error),
    };
  }

  return {
    title: 'Enrollment failed',
    message: formatErrorWithTrace(error),
  };
}

export function applyBranchEnrollmentApiError(
  error: unknown,
  setError: UseFormSetError<BranchEnrollmentFormValues>
): BranchEnrollmentErrorState {
  if (error instanceof ApiClientError) {
    for (const detail of error.details) {
      if (detail.field === 'token') {
        setError('token', { type: 'server', message: detail.issue });
      }
    }
  }

  return mapBranchEnrollmentApiError(error);
}
