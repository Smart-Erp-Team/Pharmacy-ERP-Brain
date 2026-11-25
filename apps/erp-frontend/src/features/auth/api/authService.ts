/**
 * Pharmacy ERP — Auth Service (Stage 1)
 *
 * Communicates with backend authentication endpoints defined in Stage 1 contracts.
 * Validates responses via runtime normalizers and persists tokens + organization
 * code strictly through `tokenStorage`.
 */

import { ApiClientError, apiClient } from '../../../lib/api/client';
import {
  ContractValidationError,
  normalizeCurrentUser,
  normalizeLoginResponse,
} from '../../../lib/api/normalizers';
import { tokenStorage } from '../../../lib/auth/tokenStorage';
import type {
  LoginRequest,
  LogoutRequest,
  NormalizedCurrentUser,
  NormalizedLoginResponse,
} from '../../../types/api';

function rethrowNormalizedError(error: unknown, status?: number): never {
  if (error instanceof ContractValidationError) {
    throw new ApiClientError(
      {
        code: 'INVALID_RESPONSE',
        message: error.message,
      },
      status
    );
  }
  throw error;
}

export const authService = {
  /**
   * Authenticate with organization code, username, and password.
   * Normalizes `LoginResponse` and persists tokens + organization code.
   */
  async login(credentials: LoginRequest): Promise<NormalizedLoginResponse> {
    const response = await apiClient.post<unknown>('/auth/login', credentials);

    let normalized: NormalizedLoginResponse;
    try {
      normalized = normalizeLoginResponse(response.data, '/auth/login');
    } catch (error: unknown) {
      rethrowNormalizedError(error, response.status);
    }

    tokenStorage.setTokens(normalized.access_token, normalized.refresh_token);
    tokenStorage.setOrganizationCode(credentials.organization_code.trim());
    return normalized;
  },

  /**
   * Retrieve authoritative flat `CurrentUserDto` for the active session.
   */
  async getCurrentUser(): Promise<NormalizedCurrentUser> {
    const response = await apiClient.get<unknown>('/auth/me');

    try {
      return normalizeCurrentUser(response.data, '/auth/me');
    } catch (error: unknown) {
      rethrowNormalizedError(error, response.status);
    }
  },

  /**
   * Revoke current refresh token family and clear local session storage.
   *
   * Stage 1 contract (`contracts/FRONTEND.md §3.1 & §5.3`):
   * - `LogoutRequest.refresh_token` is required (`minLength: 1`), so only call
   *   `POST /auth/logout` when a non-empty refresh token is present.
   * - `POST /auth/logout` is exempt from `Idempotency-Key`.
   */
  async logout(): Promise<void> {
    const refreshToken = tokenStorage.getRefreshToken();
    try {
      if (refreshToken && refreshToken.trim().length > 0) {
        const payload: LogoutRequest = { refresh_token: refreshToken };
        await apiClient.post('/auth/logout', payload);
      }
    } finally {
      tokenStorage.clearTokens();
    }
  },
};
