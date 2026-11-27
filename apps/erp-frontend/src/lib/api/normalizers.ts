/**
 * Pharmacy ERP — Runtime Contract Normalizers & Enum Predicates
 *
 * Bridges OpenAPI schemas that omit `required` (causing optional properties in
 * generated types) with strict runtime validation and strongly typed normalized
 * DTOs derived directly from `src/types/api.ts`.
 *
 * Architectural invariant: NEVER imports `client.ts` (zero circular imports).
 */

import type {
  AddressDto,
  BranchScope,
  ErpRuntimeMode,
  ErrorCode,
  NormalizedAddress,
  NormalizedApiErrorBody,
  NormalizedApiErrorDetail,
  NormalizedApiErrorEnvelope,
  NormalizedCurrentUser,
  NormalizedLoginResponse,
  PermissionScope,
  UserRole,
} from '../../types/api';

export type {
  NormalizedAddress,
  NormalizedApiErrorBody,
  NormalizedApiErrorDetail,
  NormalizedApiErrorEnvelope,
  NormalizedCurrentUser,
  NormalizedLoginResponse,
};

// ---------------------------------------------------------------------------
// Error class (no circular dependency on ApiClientError)
// ---------------------------------------------------------------------------

/**
 * Thrown when an API response payload fails runtime contract validation.
 * Transport layers (`client.ts`, `pagination.ts`, `authService.ts`) may catch
 * or re-wrap this error using its stable `code === 'INVALID_RESPONSE'`.
 */
export class ContractValidationError extends Error {
  public readonly code = 'INVALID_RESPONSE' as const;
  public readonly endpoint?: string;

  constructor(message: string, endpoint?: string) {
    super(message);
    this.name = 'ContractValidationError';
    this.endpoint = endpoint;
  }
}

// ---------------------------------------------------------------------------
// Single-source-of-truth Stage 1 closed vocabularies & type predicates
// ---------------------------------------------------------------------------

export const USER_ROLES = [
  'Admin',
  'Pharmacist',
  'Cashier',
] as const satisfies readonly UserRole[];

export const BRANCH_SCOPES = [
  'ALL',
  'ASSIGNED',
] as const satisfies readonly BranchScope[];

export const ERP_RUNTIME_MODES = [
  'Cloud',
  'BranchLocal',
] as const satisfies readonly ErpRuntimeMode[];

export const PERMISSION_SCOPES = [
  'user:admin',
  'inventory:read',
  'inventory:write',
  'sales:read',
  'sales:write',
] as const satisfies readonly PermissionScope[];

export const ERROR_CODES = [
  'MALFORMED_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'FORBIDDEN_BRANCH',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_STATE_TRANSITION',
  'OUT_OF_STOCK',
  'IDEMPOTENCY_MISMATCH',
  'VALIDATION_ERROR',
  'EXPIRY_POLICY_VIOLATION',
  'INTERNAL_SERVER_ERROR',
] as const satisfies readonly ErrorCode[];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.some((role) => role === value);
}

export function isBranchScope(value: unknown): value is BranchScope {
  return (
    typeof value === 'string' && BRANCH_SCOPES.some((scope) => scope === value)
  );
}

export function isErpRuntimeMode(value: unknown): value is ErpRuntimeMode {
  return (
    typeof value === 'string' &&
    ERP_RUNTIME_MODES.some((mode) => mode === value)
  );
}

export function isPermissionScope(value: unknown): value is PermissionScope {
  return (
    typeof value === 'string' &&
    PERMISSION_SCOPES.some((scope) => scope === value)
  );
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === 'string' && ERROR_CODES.some((code) => code === value)
  );
}

// ---------------------------------------------------------------------------
// Strict runtime primitive guards (unknown narrowing only)
// ---------------------------------------------------------------------------

function formatValidationMessage(
  fieldPath: string,
  reason: string,
  endpoint?: string
): string {
  const prefix = endpoint ? `${endpoint}: ` : '';
  return `${prefix}Expected valid "${fieldPath}" (${reason}).`;
}

export function isPlainRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface RequireStringOptions {
  readonly allowEmpty?: boolean;
}

export function requireString(
  record: Record<string, unknown>,
  field: string,
  endpoint?: string,
  options?: RequireStringOptions
): string {
  const value = record[field];
  if (typeof value !== 'string') {
    throw new ContractValidationError(
      formatValidationMessage(field, 'must be a string', endpoint),
      endpoint
    );
  }
  if (!options?.allowEmpty && value.trim().length === 0) {
    throw new ContractValidationError(
      formatValidationMessage(field, 'must be a non-empty string', endpoint),
      endpoint
    );
  }
  return value;
}

export interface RequireNullableStringOptions {
  readonly allowUndefined?: boolean;
}

export function requireNullableString(
  record: Record<string, unknown>,
  field: string,
  endpoint?: string,
  options?: RequireNullableStringOptions
): string | null {
  const allowUndefined = options?.allowUndefined ?? false;
  const value = record[field];
  if (value === null) {
    return null;
  }
  if (value === undefined && allowUndefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  throw new ContractValidationError(
    formatValidationMessage(field, 'must be a string or null', endpoint),
    endpoint
  );
}

export function requireBoolean(
  record: Record<string, unknown>,
  field: string,
  endpoint?: string
): boolean {
  const value = record[field];
  if (typeof value !== 'boolean') {
    throw new ContractValidationError(
      formatValidationMessage(field, 'must be a boolean', endpoint),
      endpoint
    );
  }
  return value;
}

export function requireNumber(
  record: Record<string, unknown>,
  field: string,
  endpoint?: string
): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ContractValidationError(
      formatValidationMessage(field, 'must be a finite number', endpoint),
      endpoint
    );
  }
  return value;
}

export function requireInteger(
  record: Record<string, unknown>,
  field: string,
  endpoint?: string
): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ContractValidationError(
      formatValidationMessage(field, 'must be an integer', endpoint),
      endpoint
    );
  }
  return value;
}

export function requireEnum<T extends string>(
  record: Record<string, unknown>,
  field: string,
  guard: (value: unknown) => value is T,
  endpoint?: string
): T {
  const value = record[field];
  if (!guard(value)) {
    throw new ContractValidationError(
      formatValidationMessage(
        field,
        'must match a valid contract enum value',
        endpoint
      ),
      endpoint
    );
  }
  return value;
}

export function requireArray<T>(
  record: Record<string, unknown>,
  field: string,
  normalizeItem: (item: unknown, index: number) => T,
  endpoint?: string
): T[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new ContractValidationError(
      formatValidationMessage(field, 'must be an array', endpoint),
      endpoint
    );
  }
  return value.map((item, index) => normalizeItem(item, index));
}

// ---------------------------------------------------------------------------
// Stage 0 core DTO normalizers
// ---------------------------------------------------------------------------

/**
 * Validates and normalizes an `ApiErrorEnvelopeDto` payload.
 * Returns `null` if the payload is not a valid Stage 1 error envelope.
 * Gracefully defaults omitted `details` to `[]` and omitted `trace_id` to `""`
 * while rejecting malformed types.
 */
export function normalizeApiErrorEnvelope(
  raw: unknown
): NormalizedApiErrorEnvelope | null {
  if (!isPlainRecord(raw) || !isPlainRecord(raw.error)) {
    return null;
  }

  const errorRecord = raw.error;

  if (!isErrorCode(errorRecord.code)) {
    return null;
  }

  if (
    typeof errorRecord.message !== 'string' ||
    errorRecord.message.trim().length === 0
  ) {
    return null;
  }

  let traceId = '';
  if (errorRecord.trace_id !== undefined) {
    if (typeof errorRecord.trace_id !== 'string') {
      return null;
    }
    traceId = errorRecord.trace_id;
  }

  const details: NormalizedApiErrorDetail[] = [];
  if (errorRecord.details !== undefined && errorRecord.details !== null) {
    if (!Array.isArray(errorRecord.details)) {
      return null;
    }
    for (const item of errorRecord.details) {
      if (!isPlainRecord(item)) {
        return null;
      }
      if (typeof item.field !== 'string' || typeof item.issue !== 'string') {
        return null;
      }
      details.push({
        field: item.field,
        issue: item.issue,
      });
    }
  }

  return {
    error: {
      code: errorRecord.code,
      message: errorRecord.message,
      details,
      trace_id: traceId,
    },
  };
}

/**
 * Validates and normalizes a flat `CurrentUserDto` (returned by `GET /auth/me`
 * and embedded as `LoginResponse.user`).
 */
export function normalizeCurrentUser(
  raw: unknown,
  endpoint?: string
): NormalizedCurrentUser {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage('user', 'must be a JSON object', endpoint),
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

  const scopes = requireArray(
    raw,
    'scopes',
    (item, index) => {
      if (!isPermissionScope(item)) {
        throw new ContractValidationError(
          formatValidationMessage(
            `scopes[${index}]`,
            'must be a valid Stage 1 PermissionScope',
            endpoint
          ),
          endpoint
        );
      }
      return item;
    },
    endpoint
  );

  const runtime_mode = requireEnum(
    raw,
    'runtime_mode',
    isErpRuntimeMode,
    endpoint
  );

  return {
    user_id,
    employee_id,
    organization_id,
    username,
    role,
    branch_scope,
    branch_ids,
    scopes,
    runtime_mode,
  };
}

/**
 * Validates and normalizes a `LoginResponse` (returned by `POST /auth/login`
 * and `POST /auth/refresh`).
 */
export function normalizeLoginResponse(
  raw: unknown,
  endpoint?: string
): NormalizedLoginResponse {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage(
        'LoginResponse',
        'must be a JSON object',
        endpoint
      ),
      endpoint
    );
  }

  const access_token = requireString(raw, 'access_token', endpoint);
  const access_token_expires_at = requireString(
    raw,
    'access_token_expires_at',
    endpoint
  );
  const refresh_token = requireString(raw, 'refresh_token', endpoint);
  const user = normalizeCurrentUser(raw.user, endpoint);
  const token_type = requireString(raw, 'token_type', endpoint);
  const issuer = requireString(raw, 'issuer', endpoint);
  const audience = requireString(raw, 'audience', endpoint);
  const key_id = requireString(raw, 'key_id', endpoint);

  return {
    access_token,
    access_token_expires_at,
    refresh_token,
    user,
    token_type,
    issuer,
    audience,
    key_id,
  };
}

/**
 * Validates and normalizes an `AddressDto` payload.
 */
export function normalizeAddress(raw: unknown, endpoint?: string): AddressDto {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage('address', 'must be a JSON object', endpoint),
      endpoint
    );
  }

  return {
    line1: requireString(raw, 'line1', endpoint),
    line2: requireNullableString(raw, 'line2', endpoint),
    city: requireString(raw, 'city', endpoint),
    region: requireNullableString(raw, 'region', endpoint),
    postal_code: requireNullableString(raw, 'postal_code', endpoint),
    country_code: requireString(raw, 'country_code', endpoint),
  };
}
