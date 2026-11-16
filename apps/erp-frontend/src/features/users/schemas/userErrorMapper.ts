import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiClientError } from '../../../lib/api/client';
import type {
  CreateUserFormValues,
  EditUserFormValues,
  PasswordResetFormValues,
} from './userSchema';

function isBranchAccessField(field: string): boolean {
  return (
    field === 'branch_access' ||
    field === 'branch_ids' ||
    field.startsWith('branch_access[') ||
    field.startsWith('branch_access.')
  );
}

function mapCreateUserField(field: string): Path<CreateUserFormValues> | null {
  if (isBranchAccessField(field)) {
    return 'branch_ids';
  }
  switch (field) {
    case 'employee_id':
    case 'username':
    case 'password':
    case 'role':
    case 'branch_scope':
      return field;
    default:
      return null;
  }
}

function mapEditUserField(field: string): Path<EditUserFormValues> | null {
  if (isBranchAccessField(field)) {
    return 'branch_ids';
  }
  switch (field) {
    case 'role':
    case 'branch_scope':
    case 'is_active':
      return field;
    default:
      return null;
  }
}

function mapPasswordResetField(
  field: string
): Path<PasswordResetFormValues> | null {
  switch (field) {
    case 'new_password':
      return 'new_password';
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

export function applyCreateUserFormApiError(
  error: unknown,
  setError: UseFormSetError<CreateUserFormValues>
): string | null {
  return applyMappedApiError(
    error,
    'Unable to create user account. Please try again.',
    setError,
    mapCreateUserField
  );
}

export function applyEditUserFormApiError(
  error: unknown,
  setError: UseFormSetError<EditUserFormValues>
): string | null {
  return applyMappedApiError(
    error,
    'Unable to update user account. Please try again.',
    setError,
    mapEditUserField
  );
}

export function applyPasswordResetFormApiError(
  error: unknown,
  setError: UseFormSetError<PasswordResetFormValues>
): string | null {
  return applyMappedApiError(
    error,
    'Unable to reset user password. Please try again.',
    setError,
    mapPasswordResetField
  );
}
