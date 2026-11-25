/**
 * Pharmacy ERP — MSW Request Handlers (Stage 1)
 *
 * Mock Service Worker endpoints matching Stage 1 contracts (`contracts/FRONTEND.md`).
 * Handlers return canonical JSON mock payloads from `contracts/fixtures/` and
 * strict `ApiErrorEnvelopeDto` errors (`{ error: { code, message, details, trace_id } }`).
 */

import { http, HttpResponse } from 'msw';
import authTokenPair from '@contracts/fixtures/auth-token-pair.json';
import currentUserContext from '@contracts/fixtures/current-user-context.json';
import type {
  CanonicalCapabilitiesDto,
  ErrorCode,
  NormalizedApiErrorDetail,
  NormalizedApiErrorEnvelope,
} from '../types/api';
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

const createMockErrorEnvelope = (
  code: ErrorCode,
  message: string,
  traceId: string,
  details: NormalizedApiErrorDetail[] = []
): NormalizedApiErrorEnvelope => ({
  error: {
    code,
    message,
    details,
    trace_id: traceId,
  },
});

const MOCK_CLOUD_CAPABILITIES: CanonicalCapabilitiesDto = {
  stage: 1,
  runtime_mode: 'Cloud',
  supported_reads: ['canonical.products', 'canonical.inventory'],
  supported_writes: [
    'canonical.configuration.products',
    'canonical.configuration.reorder_rules',
  ],
};

export const handlers = [
  // POST /api/v1/auth/login
  http.post('*/api/v1/auth/login', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);

    if (!isRecord(body)) {
      return HttpResponse.json(
        createMockErrorEnvelope(
          'MALFORMED_REQUEST',
          'Login request body must be a JSON object.',
          'mock-trace-malformed-login'
        ),
        { status: 400 }
      );
    }

    const details: NormalizedApiErrorDetail[] = [];
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
        createMockErrorEnvelope(
          'VALIDATION_ERROR',
          'Login request failed validation.',
          'mock-trace-login-validation',
          details
        ),
        { status: 422 }
      );
    }

    if (body.password === INVALID_CREDENTIALS_PASSWORD) {
      return HttpResponse.json(
        createMockErrorEnvelope(
          'UNAUTHORIZED',
          'Invalid organization code or credentials.',
          'mock-trace-invalid-credentials'
        ),
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
        createMockErrorEnvelope(
          'UNAUTHORIZED',
          'Refresh token is invalid or has already been consumed.',
          'mock-trace-refresh-rejected'
        ),
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
  // Stage 1 requires non-empty `refresh_token`; Idempotency-Key is NOT required.
  http.post('*/api/v1/auth/logout', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);
    const refreshToken =
      isRecord(body) && isNonEmptyString(body.refresh_token)
        ? body.refresh_token
        : null;

    if (!refreshToken) {
      return HttpResponse.json(
        createMockErrorEnvelope(
          'VALIDATION_ERROR',
          'Logout request failed validation.',
          'mock-trace-logout-validation',
          [
            {
              field: 'refresh_token',
              issue: 'Refresh token is required.',
            },
          ]
        ),
        { status: 422 }
      );
    }

    consumedRefreshTokens.add(refreshToken);
    return new HttpResponse(null, { status: 204 });
  }),

  // GET /api/v1/canonical/capabilities
  http.get('*/api/v1/canonical/capabilities', () => {
    return HttpResponse.json(MOCK_CLOUD_CAPABILITIES, { status: 200 });
  }),

  ...branchHandlers,
  ...employeeHandlers,
  ...inventoryHandlers,
  ...productHandlers,
  ...userHandlers,
];
