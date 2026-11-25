/**
 * Pharmacy ERP — Authentication & JWKS Contract (Stage 1).
 *
 * Source of truth: /contracts/openapi.erp.yaml (components.schemas) and
 * /contracts/schemas/auth.json.
 *
 * - Username uniqueness is PER-ORGANIZATION (login resolves organization_code).
 * - Refresh rotates on every use; submitting a consumed refresh token revokes
 *   its whole token family -> FE must force re-login.
 * - GET /api/v1/auth/me returns flat CurrentUserDto directly at the root.
 */
import type { components } from './api-paths';

type Schemas = components['schemas'];

export type JwkKey = Schemas['JwkKey'];
export type JwksDocument = Schemas['JwksDocument'];
export type LoginRequest = Schemas['LoginRequest'];
export type LoginResponse = Schemas['LoginResponse'];
export type RefreshTokenRequest = Schemas['RefreshTokenRequest'];
export type LogoutRequest = Schemas['LogoutRequest'];
export type CurrentUserDto = Schemas['CurrentUserDto'];
