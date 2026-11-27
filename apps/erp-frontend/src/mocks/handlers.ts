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
import { normalizeCurrentUser } from '../lib/api/normalizers';
import type {
  CanonicalCapabilitiesDto,
  ErrorCode,
  NormalizedApiErrorDetail,
  NormalizedApiErrorEnvelope,
  NormalizedCurrentUser,
} from '../types/api';
import { branchHandlers } from './branchHandlers';
import { employeeHandlers } from './employeeHandlers';
import { inventoryHandlers } from './inventoryHandlers';
import { productHandlers } from './productHandlers';
import { userHandlers } from './userHandlers';

const ADMIN_MOCK_USER: NormalizedCurrentUser = normalizeCurrentUser(
  currentUserContext,
  '@contracts/fixtures/current-user-context.json'
);
const PHARMACIST_MOCK_USER: NormalizedCurrentUser = normalizeCurrentUser(
  authTokenPair.user,
  '@contracts/fixtures/auth-token-pair.json'
);

const INVALID_CREDENTIALS_PASSWORD = 'invalid';
// The mock issuer lives in the browser tab, independently of client token storage.
const SESSION_KEY = 'erp.msw.auth-session';
let memorySession: string | null = null;

function readSession() {
  const raw =
    typeof sessionStorage === 'undefined'
      ? memorySession
      : sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !isRecord(value) ||
    typeof value.access_token !== 'string' ||
    typeof value.refresh_token !== 'string' ||
    (value.username !== PHARMACIST_MOCK_USER.username &&
      value.username !== ADMIN_MOCK_USER.username)
  )
    return null;
  const user =
    value.username === PHARMACIST_MOCK_USER.username
      ? PHARMACIST_MOCK_USER
      : ADMIN_MOCK_USER;
  return {
    access_token: value.access_token,
    refresh_token: value.refresh_token,
    user,
  };
}

function issueTokens(user: NormalizedCurrentUser) {
  const pair = {
    ...authTokenPair,
    user,
    access_token: 'mock-access-' + crypto.randomUUID(),
    refresh_token: 'mock-refresh-' + crypto.randomUUID(),
  };
  memorySession = JSON.stringify({
    access_token: pair.access_token,
    refresh_token: pair.refresh_token,
    username: user.username,
  });
  if (typeof sessionStorage !== 'undefined')
    sessionStorage.setItem(SESSION_KEY, memorySession);
  return pair;
}

export function resetMockAuth(): void {
  memorySession = null;
  if (typeof sessionStorage !== 'undefined')
    sessionStorage.removeItem(SESSION_KEY);
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

    const normalizedUsername =
      typeof body.username === 'string'
        ? body.username.trim().toLowerCase()
        : '';
    const user =
      normalizedUsername === PHARMACIST_MOCK_USER.username.toLowerCase()
        ? PHARMACIST_MOCK_USER
        : ADMIN_MOCK_USER;

    return HttpResponse.json(issueTokens(user));
  }),

  // GET /api/v1/auth/me
  http.get('*/api/v1/auth/me', ({ request }) => {
    const session = readSession();
    if (
      !session ||
      request.headers.get('Authorization') !== 'Bearer ' + session.access_token
    ) {
      return HttpResponse.json(
        createMockErrorEnvelope(
          'UNAUTHORIZED',
          'Session is no longer valid.',
          'mock-trace-auth-me'
        ),
        { status: 401 }
      );
    }
    return HttpResponse.json(session.user);
  }),

  // POST /api/v1/auth/refresh
  // Refresh tokens rotate on every use: a consumed token is rejected with 401.
  http.post('*/api/v1/auth/refresh', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);

    const refreshToken =
      isRecord(body) && isNonEmptyString(body.refresh_token)
        ? body.refresh_token
        : null;

    const session = readSession();
    if (!session || session.refresh_token !== refreshToken) {
      return HttpResponse.json(
        createMockErrorEnvelope(
          'UNAUTHORIZED',
          'Refresh token is invalid or has already been consumed.',
          'mock-trace-refresh-rejected'
        ),
        { status: 401 }
      );
    }

    return HttpResponse.json(issueTokens(session.user));
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

    if (readSession()?.refresh_token === refreshToken) resetMockAuth();
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
