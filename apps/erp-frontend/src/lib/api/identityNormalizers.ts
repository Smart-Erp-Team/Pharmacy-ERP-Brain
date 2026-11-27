/**
 * Pharmacy ERP — Identity & Branch Enrollment Runtime Contract Normalizers (Stage 1)
 *
 * Validates and normalizes Organization, Branch, EnrollmentToken, RedeemEnrollment,
 * Employee, and User responses against `/contracts/schemas/identity.json`.
 *
 * Architectural invariant:
 *  - Imports primitive guards & shared helpers from `./normalizers`.
 *  - NEVER imports `client.ts` (zero circular imports).
 */

import type {
  NormalizedBranch,
  NormalizedEmployee,
  NormalizedEnrollmentToken,
  NormalizedOrganization,
  NormalizedRedeemEnrollment,
  NormalizedUser,
} from '../../types/api';
import {
  ContractValidationError,
  isBranchScope,
  isPlainRecord,
  isUserRole,
  normalizeAddress,
  requireArray,
  requireBoolean,
  requireEnum,
  requireInteger,
  requireNullableString,
  requireString,
} from './normalizers';

export type {
  NormalizedBranch,
  NormalizedEmployee,
  NormalizedEnrollmentToken,
  NormalizedOrganization,
  NormalizedRedeemEnrollment,
  NormalizedUser,
};

function formatValidationMessage(
  fieldPath: string,
  reason: string,
  endpoint?: string
): string {
  const prefix = endpoint ? `${endpoint}: ` : '';
  return `${prefix}Expected valid "${fieldPath}" (${reason}).`;
}

/**
 * Validates and normalizes an `OrganizationDto` (`POST /organizations`).
 */
export function normalizeOrganization(
  raw: unknown,
  endpoint?: string
): NormalizedOrganization {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage(
        'OrganizationDto',
        'must be a JSON object',
        endpoint
      ),
      endpoint
    );
  }

  return {
    organization_id: requireString(raw, 'organization_id', endpoint),
    organization_code: requireString(raw, 'organization_code', endpoint),
    name: requireString(raw, 'name', endpoint),
    base_currency: requireString(raw, 'base_currency', endpoint),
    time_zone_id: requireString(raw, 'time_zone_id', endpoint),
    initial_branch_id: requireString(raw, 'initial_branch_id', endpoint),
    initial_employee_id: requireString(raw, 'initial_employee_id', endpoint),
    initial_admin_user_id: requireString(
      raw,
      'initial_admin_user_id',
      endpoint
    ),
    enrollment_setup_state: requireString(
      raw,
      'enrollment_setup_state',
      endpoint
    ),
  };
}

/**
 * Validates and normalizes a `BranchDto` (`GET/POST/PATCH /branches`).
 */
export function normalizeBranch(
  raw: unknown,
  endpoint?: string
): NormalizedBranch {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage('BranchDto', 'must be a JSON object', endpoint),
      endpoint
    );
  }

  return {
    branch_id: requireString(raw, 'branch_id', endpoint),
    organization_id: requireString(raw, 'organization_id', endpoint),
    branch_code: requireString(raw, 'branch_code', endpoint),
    name: requireString(raw, 'name', endpoint),
    address: normalizeAddress(raw.address, endpoint),
    is_active: requireBoolean(raw, 'is_active', endpoint),
    created_at: requireString(raw, 'created_at', endpoint),
    updated_at: requireString(raw, 'updated_at', endpoint),
  };
}

/**
 * Validates and normalizes an `EnrollmentTokenResponse`
 * (`POST /branches/{id}/enrollment-tokens`).
 */
export function normalizeEnrollmentToken(
  raw: unknown,
  endpoint?: string
): NormalizedEnrollmentToken {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage(
        'EnrollmentTokenResponse',
        'must be a JSON object',
        endpoint
      ),
      endpoint
    );
  }

  return {
    token: requireString(raw, 'token', endpoint),
    expires_at: requireString(raw, 'expires_at', endpoint),
  };
}

/**
 * Validates and normalizes a `RedeemBranchEnrollmentResponse`
 * (`POST /branch-enrollment`).
 */
export function normalizeRedeemEnrollment(
  raw: unknown,
  endpoint?: string
): NormalizedRedeemEnrollment {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage(
        'RedeemBranchEnrollmentResponse',
        'must be a JSON object',
        endpoint
      ),
      endpoint
    );
  }

  return {
    organization_id: requireString(raw, 'organization_id', endpoint),
    branch_id: requireString(raw, 'branch_id', endpoint),
    runtime_credential: requireString(raw, 'runtime_credential', endpoint),
    initial_sync_cursor: requireInteger(raw, 'initial_sync_cursor', endpoint),
    credential_expiry: requireString(raw, 'credential_expiry', endpoint),
  };
}

/**
 * Validates and normalizes an `EmployeeDto` (`GET/POST/PATCH /employees`).
 */
export function normalizeEmployee(
  raw: unknown,
  endpoint?: string
): NormalizedEmployee {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage('EmployeeDto', 'must be a JSON object', endpoint),
      endpoint
    );
  }

  return {
    employee_id: requireString(raw, 'employee_id', endpoint),
    organization_id: requireString(raw, 'organization_id', endpoint),
    branch_id: requireString(raw, 'branch_id', endpoint),
    employee_no: requireString(raw, 'employee_no', endpoint),
    full_name: requireString(raw, 'full_name', endpoint),
    email: requireNullableString(raw, 'email', endpoint),
    phone: requireNullableString(raw, 'phone', endpoint),
    job_title: requireString(raw, 'job_title', endpoint),
    address: normalizeAddress(raw.address, endpoint),
    hired_on: requireString(raw, 'hired_on', endpoint),
    is_active: requireBoolean(raw, 'is_active', endpoint),
    created_at: requireString(raw, 'created_at', endpoint),
    updated_at: requireString(raw, 'updated_at', endpoint),
  };
}

/**
 * Validates and normalizes a `UserDto` (`GET/POST/PATCH /users`).
 */
export function normalizeUser(raw: unknown, endpoint?: string): NormalizedUser {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage('UserDto', 'must be a JSON object', endpoint),
      endpoint
    );
  }

  const user_id = requireString(raw, 'user_id', endpoint);
  const employee_id = requireString(raw, 'employee_id', endpoint);
  const organization_id = requireString(raw, 'organization_id', endpoint);
  const username = requireString(raw, 'username', endpoint);
  const role = requireEnum(raw, 'role', isUserRole, endpoint);
  const branch_scope = requireEnum(
    raw,
    'branch_scope',
    isBranchScope,
    endpoint
  );
  const is_active = requireBoolean(raw, 'is_active', endpoint);
  const branch_ids = requireArray(
    raw,
    'branch_ids',
    (item, index) => {
      if (typeof item !== 'string' || item.trim().length === 0) {
        throw new ContractValidationError(
          formatValidationMessage(
            `branch_ids[${index}]`,
            'must be a non-empty UUID string',
            endpoint
          ),
          endpoint
        );
      }
      return item;
    },
    endpoint
  );
  const last_login_at = requireNullableString(raw, 'last_login_at', endpoint);
  const lockout_end = requireNullableString(raw, 'lockout_end', endpoint);
  const access_failed_count = requireInteger(
    raw,
    'access_failed_count',
    endpoint
  );

  return {
    user_id,
    employee_id,
    organization_id,
    username,
    role,
    branch_scope,
    is_active,
    branch_ids,
    last_login_at,
    lockout_end,
    access_failed_count,
  };
}
