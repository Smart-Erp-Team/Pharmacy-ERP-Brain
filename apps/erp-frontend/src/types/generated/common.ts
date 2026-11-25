/**
 * Pharmacy ERP — Shared Contract Primitives (Stage 1).
 *
 * Source of truth: /contracts/openapi.erp.yaml (components.schemas) and
 * /contracts/schemas/common.json.
 *
 * Wire conventions:
 *  - Strict snake_case for all JSON properties and query parameters.
 *  - Native JSON numbers for decimals/quantities/prices/rates.
 *  - String-only enums (integer enum values are rejected with 422).
 */
import type { components } from './api-paths';

type Schemas = components['schemas'];

// ---------------------------------------------------------------------------
// Scalar conventions (contracts/schemas/common.json)
// ---------------------------------------------------------------------------

/** RFC 4122 UUID / .NET Guid */
export type Uuid = string;
/** ISO 8601 UTC timestamp with offset (DateTimeOffset) */
export type Timestamp = string;
/** ISO 8601 calendar date (YYYY-MM-DD) */
export type DateOnly = string;
/** Business date, organization-timezone-derived (YYYY-MM-DD) */
export type BusinessDate = DateOnly;
/** Optional in JSON body when provided via the Idempotency-Key HTTP header (max 100 chars) */
export type IdempotencyKey = string | null;

// ---------------------------------------------------------------------------
// Shared value objects & auth/runtime enums (components.schemas)
// ---------------------------------------------------------------------------

export type AddressDto = Schemas['AddressDto'];
export type UserRole = Schemas['UserRole'];
export type BranchScope = Schemas['BranchScope'];
export type ErpRuntimeMode = Schemas['ErpRuntimeMode'];

// ---------------------------------------------------------------------------
// Stage 1 closed vocabularies (contracts/schemas/common.json)
// ---------------------------------------------------------------------------

/** Exact Stage 1 emitted JWT scopes vocabulary */
export type PermissionScope =
  | 'user:admin'
  | 'inventory:read'
  | 'inventory:write'
  | 'sales:read'
  | 'sales:write';

/** Exact Stage 1 ErrorCode enum values plus INTERNAL_SERVER_ERROR for HTTP 500 */
export type ErrorCode =
  | 'MALFORMED_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'FORBIDDEN_BRANCH'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_STATE_TRANSITION'
  | 'OUT_OF_STOCK'
  | 'IDEMPOTENCY_MISMATCH'
  | 'VALIDATION_ERROR'
  | 'EXPIRY_POLICY_VIOLATION'
  | 'INTERNAL_SERVER_ERROR';

// ---------------------------------------------------------------------------
// Error envelope DTOs (components.schemas)
// ---------------------------------------------------------------------------

export type ApiErrorDetailDto = Schemas['ApiErrorDetailDto'];
export type ApiErrorBodyDto = Schemas['ApiErrorBodyDto'];
export type ApiErrorEnvelopeDto = Schemas['ApiErrorEnvelopeDto'];

// ---------------------------------------------------------------------------
// Pagination envelope (contracts/schemas/common.json)
// ---------------------------------------------------------------------------

/** Standard Stage 1 pagination envelope for ERP list endpoints */
export interface PagedResult<T> {
  items: T[];
  page: number;
  page_size: number;
  total_count: number;
  next_cursor: string | null;
}
