/**
 * Pharmacy ERP — MSW Request Handlers
 *
 * Mock Service Worker endpoints matching Phase 0 contracts.
 * Handlers return canonical JSON mock payloads from contracts/fixtures.
 */

import { http, HttpResponse } from 'msw';
import authTokenPair from '@contracts/fixtures/auth-token-pair.json';
import currentUserContext from '@contracts/fixtures/current-user-context.json';
import { branchHandlers } from './branchHandlers';
import { employeeHandlers } from './employeeHandlers';
import { inventoryHandlers } from './inventoryHandlers';
import { productHandlers } from './productHandlers';
import { userHandlers } from './userHandlers';

const INVALID_CREDENTIALS_PASSWORD = 'invalid';
const STATIC_CONSUMED_REFRESH_TOKENS: ReadonlySet<string> = new Set([
  'invalid',
  'expired',
  'consumed',
]);
const consumedRefreshTokens = new Set<string>();
let rotationSequence = 0;

export function resetMockAuth(): void {
  consumedRefreshTokens.clear();
  rotationSequence = 0;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const handlers = [
  // POST /api/v1/auth/login
  http.post('*/api/v1/auth/login', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);

    if (!isRecord(body)) {
      return HttpResponse.json(
        {
          error: {
            code: 'MALFORMED_REQUEST',
            message: 'Login request body must be a JSON object.',
            trace_id: 'mock-trace-malformed-login',
          },
        },
        { status: 400 }
      );
    }

    const details: Array<{ field: string; issue: string }> = [];
    if (!isNonEmptyString(body.organization_code)) {
      details.push({
        field: 'organization_code',
        issue: 'Organization code is required.',
      });
    }
    if (!isNonEmptyString(body.username)) {
      details.push({ field: 'username', issue: 'Username is required.' });
    }
    if (typeof body.password !== 'string' || body.password.length === 0) {
      details.push({ field: 'password', issue: 'Password is required.' });
    }

    if (details.length > 0) {
      return HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Login request failed validation.',
            details,
            trace_id: 'mock-trace-login-validation',
          },
        },
        { status: 422 }
      );
    }

    if (body.password === INVALID_CREDENTIALS_PASSWORD) {
      return HttpResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid organization code or credentials.',
            trace_id: 'mock-trace-invalid-credentials',
          },
        },
        { status: 401 }
      );
    }

    consumedRefreshTokens.delete(authTokenPair.refresh_token);
    return HttpResponse.json(authTokenPair, { status: 200 });
  }),

  // GET /api/v1/auth/me
  http.get('*/api/v1/auth/me', () => {
    return HttpResponse.json(currentUserContext, { status: 200 });
  }),

  // POST /api/v1/auth/refresh
  // Refresh tokens rotate on every use: a consumed token is rejected with 401.
  http.post('*/api/v1/auth/refresh', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);

    const refreshToken =
      isRecord(body) && isNonEmptyString(body.refresh_token)
        ? body.refresh_token
        : null;

    if (
      !refreshToken ||
      STATIC_CONSUMED_REFRESH_TOKENS.has(refreshToken) ||
      consumedRefreshTokens.has(refreshToken)
    ) {
      return HttpResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Refresh token is invalid or has already been consumed.',
            trace_id: 'mock-trace-refresh-rejected',
          },
        },
        { status: 401 }
      );
    }

    consumedRefreshTokens.add(refreshToken);
    rotationSequence += 1;

    return HttpResponse.json(
      {
        ...authTokenPair,
        access_token: `${authTokenPair.access_token}.${rotationSequence}.rotated`,
        refresh_token: `${refreshToken}.${rotationSequence}.rotated`,
      },
      { status: 200 }
    );
  }),

  // POST /api/v1/auth/logout
  http.post('*/api/v1/auth/logout', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);
    if (isRecord(body) && isNonEmptyString(body.refresh_token)) {
      consumedRefreshTokens.add(body.refresh_token);
    }
    return new HttpResponse(null, { status: 204 });
  }),

  ...branchHandlers,
  ...employeeHandlers,
  ...inventoryHandlers,
  ...productHandlers,
  ...userHandlers,
];
