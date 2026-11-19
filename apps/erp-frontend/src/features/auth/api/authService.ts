/**
 * Pharmacy ERP — Auth Service
 *
 * Communicates with backend authentication endpoints defined in Phase 0 contracts.
 * Fully typed via generated schema DTOs from src/types/api.ts.
 */

import { apiClient } from '../../../lib/api/client';
import {
  IDEMPOTENCY_KEY_HEADER,
  createIdempotencyKey,
} from '../../../lib/api/idempotency';
import { tokenStorage } from '../../../lib/auth/tokenStorage';
import type {
  LoginRequest,
  TokenPairResponse,
  CurrentUserContext,
  LogoutRequest,
} from '../../../types/api';

export const authService = {
  /**
   * Authenticate with organization code, username, and password.
   * Persists tokens to tokenStorage upon successful login.
   */
  async login(credentials: LoginRequest): Promise<TokenPairResponse> {
    const response = await apiClient.post<TokenPairResponse>(
      '/auth/login',
      credentials
    );
    tokenStorage.setTokens(
      response.data.access_token,
      response.data.refresh_token
    );
    return response.data;
  },

  /**
   * Retrieve authoritative CurrentUserContext for the active session.
   */
  async getCurrentUser(): Promise<CurrentUserContext> {
    const response = await apiClient.get<CurrentUserContext>('/auth/me');
    return response.data;
  },

  /**
   * Revoke current token family and clear local tokens.
   *
   * `POST /auth/logout` is a mutation, so the contract requires an
   * `Idempotency-Key`. The key is created once here and travels with the request,
   * so a retry of this exact call replays the same server-side result.
   */
  async logout(): Promise<void> {
    const refreshToken = tokenStorage.getRefreshToken();
    try {
      const payload: LogoutRequest = { refresh_token: refreshToken };
      await apiClient.post('/auth/logout', payload, {
        headers: { [IDEMPOTENCY_KEY_HEADER]: createIdempotencyKey() },
      });
    } finally {
      tokenStorage.clearTokens();
    }
  },
};
