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
import { productHandlers } from './productHandlers';
import { userHandlers } from './userHandlers';

const INVALID_CREDENTIALS_PASSWORD = 'invalid';
const CONSUMED_REFRESH_TOKENS = ['invalid', 'expired', 'consumed'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const handlers = [
  // POST /api/v1/auth/login
  http.post('*/api/v1/auth/login', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);

    if (isRecord(body) && body.password === INVALID_CREDENTIALS_PASSWORD) {
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
      isRecord(body) && typeof body.refresh_token === 'string'
        ? body.refresh_token
        : null;

    if (!refreshToken || CONSUMED_REFRESH_TOKENS.includes(refreshToken)) {
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

    return HttpResponse.json(
      {
        ...authTokenPair,
        access_token: `${authTokenPair.access_token}.rotated`,
        refresh_token: `${refreshToken}.rotated`,
      },
      { status: 200 }
    );
  }),

  // POST /api/v1/auth/logout
  http.post('*/api/v1/auth/logout', () => {
    return new HttpResponse(null, { status: 204 });
  }),

  ...branchHandlers,
  ...employeeHandlers,
  ...productHandlers,
  ...userHandlers,
];
