import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import authTokenPair from '@contracts/fixtures/auth-token-pair.json';
import { handlers, resetMockAuth } from '../mocks/handlers';
import { ApiClientError, apiClient } from '../lib/api/client';
import { IDEMPOTENCY_KEY_HEADER } from '../lib/api/idempotency';
import { registerSessionEndHandler } from '../lib/auth/sessionEvents';
import { tokenStorage } from '../lib/auth/tokenStorage';
import type {
  CanonicalCapabilitiesDto,
  ErrorCode,
  NormalizedApiErrorEnvelope,
} from '../types/api';

const server = setupServer(...handlers);

const ROTATED_ACCESS_TOKEN = 'rotated_access_token';
const ROTATED_REFRESH_TOKEN = 'rotated_refresh_token';

const errorEnvelope = (
  code: ErrorCode,
  message: string,
  traceId = 'test-trace-id'
): NormalizedApiErrorEnvelope => ({
  error: {
    code,
    message,
    details: [],
    trace_id: traceId,
  },
});

const unauthorized = () =>
  HttpResponse.json(
    errorEnvelope('UNAUTHORIZED', 'access token expired', 'trace-401'),
    { status: 401 }
  );

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  resetMockAuth();
  registerSessionEndHandler(null);
  tokenStorage.clearTokens();
});
afterAll(() => server.close());

describe('401 refresh interceptor', () => {
  it('refreshes once for concurrent 401 answers and retries both requests', async () => {
    let refreshCalls = 0;
    let protectedCalls = 0;
    let releaseProtectedCalls: () => void = () => undefined;
    const bothRequestsArrived = new Promise<void>((resolve) => {
      releaseProtectedCalls = resolve;
    });

    server.use(
      http.get('*/api/v1/protected-resource', async ({ request }) => {
        protectedCalls += 1;
        if (protectedCalls >= 2) {
          releaseProtectedCalls();
        }

        // Both requests are in flight before either of them is rejected.
        await bothRequestsArrived;

        const authorization = request.headers.get('Authorization');
        if (authorization === `Bearer ${ROTATED_ACCESS_TOKEN}`) {
          return HttpResponse.json({ ok: true });
        }

        return unauthorized();
      }),
      http.post('*/api/v1/auth/refresh', () => {
        refreshCalls += 1;
        return HttpResponse.json({
          ...authTokenPair,
          access_token: ROTATED_ACCESS_TOKEN,
          refresh_token: ROTATED_REFRESH_TOKEN,
        });
      })
    );

    tokenStorage.setTokens('stale_access_token', 'valid_refresh_token');

    const [first, second] = await Promise.all([
      apiClient.get<{ ok: boolean }>('/protected-resource'),
      apiClient.get<{ ok: boolean }>('/protected-resource'),
    ]);

    expect(refreshCalls).toBe(1);
    expect(first.data.ok).toBe(true);
    expect(second.data.ok).toBe(true);
    expect(tokenStorage.getAccessToken()).toBe(ROTATED_ACCESS_TOKEN);
    expect(tokenStorage.getRefreshToken()).toBe(ROTATED_REFRESH_TOKEN);
  });

  it('rotates the token pair through the mock refresh endpoint', async () => {
    server.use(
      http.get('*/api/v1/protected-resource', async ({ request }) => {
        const authorization = request.headers.get('Authorization');
        if (authorization?.startsWith('Bearer eyJ')) {
          return HttpResponse.json({ ok: true });
        }

        return unauthorized();
      })
    );

    tokenStorage.setTokens('stale_access_token', 'valid_refresh_token');

    const response = await apiClient.get<{ ok: boolean }>(
      '/protected-resource'
    );

    expect(response.data.ok).toBe(true);
    expect(tokenStorage.getAccessToken()?.endsWith('.rotated')).toBe(true);
    expect(tokenStorage.getRefreshToken()?.endsWith('.rotated')).toBe(true);
  });

  it('ends the session when the refresh is rejected with 401', async () => {
    const sessionEndHandler = vi.fn();
    registerSessionEndHandler(sessionEndHandler);

    server.use(
      http.get('*/api/v1/protected-resource', unauthorized),
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json(
          errorEnvelope(
            'UNAUTHORIZED',
            'refresh token has already been consumed',
            'trace-refresh-401'
          ),
          { status: 401 }
        )
      )
    );

    tokenStorage.setTokens('stale_access_token', 'consumed_refresh_token');

    await expect(apiClient.get('/protected-resource')).rejects.toBeInstanceOf(
      ApiClientError
    );

    expect(sessionEndHandler).toHaveBeenCalledWith('expired');
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });

  it('ends the session when the refresh is rejected with 409', async () => {
    const sessionEndHandler = vi.fn();
    registerSessionEndHandler(sessionEndHandler);

    server.use(
      http.get('*/api/v1/protected-resource', unauthorized),
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json(
          errorEnvelope(
            'CONFLICT',
            'refresh token family revoked',
            'trace-refresh-409'
          ),
          { status: 409 }
        )
      )
    );

    tokenStorage.setTokens('stale_access_token', 'revoked_refresh_token');

    await expect(apiClient.get('/protected-resource')).rejects.toBeInstanceOf(
      ApiClientError
    );

    expect(sessionEndHandler).toHaveBeenCalledWith('expired');
    expect(tokenStorage.getAccessToken()).toBeNull();
  });

  it('ends the session when /auth/refresh returns a malformed LoginResponse', async () => {
    const sessionEndHandler = vi.fn();
    registerSessionEndHandler(sessionEndHandler);

    server.use(
      http.get('*/api/v1/protected-resource', unauthorized),
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({ access_token: 'only-token' }, { status: 200 })
      )
    );

    tokenStorage.setTokens('stale_access_token', 'valid_refresh_token');

    await expect(apiClient.get('/protected-resource')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'UNAUTHORIZED',
      status: 401,
    });

    expect(sessionEndHandler).toHaveBeenCalledWith('expired');
    expect(tokenStorage.getAccessToken()).toBeNull();
  });

  it('ends the session when there is no refresh token left', async () => {
    const sessionEndHandler = vi.fn();
    registerSessionEndHandler(sessionEndHandler);

    server.use(http.get('*/api/v1/protected-resource', unauthorized));
    tokenStorage.clearTokens();

    await expect(apiClient.get('/protected-resource')).rejects.toBeInstanceOf(
      ApiClientError
    );

    expect(sessionEndHandler).toHaveBeenCalledWith('expired');
  });

  it('never lets the refresh endpoint trigger a refresh loop', async () => {
    let refreshCalls = 0;
    const sessionEndHandler = vi.fn();
    registerSessionEndHandler(sessionEndHandler);

    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshCalls += 1;
        return HttpResponse.json(
          errorEnvelope(
            'UNAUTHORIZED',
            'refresh token consumed',
            'trace-refresh-loop'
          ),
          { status: 401 }
        );
      })
    );

    await expect(
      apiClient.post('/auth/refresh', {
        refresh_token: 'consumed_refresh_token',
      })
    ).rejects.toBeInstanceOf(ApiClientError);

    expect(refreshCalls).toBe(1);
    expect(sessionEndHandler).not.toHaveBeenCalled();
  });

  it('rejects a consumed refresh token through the mock server', async () => {
    await expect(
      apiClient.post('/auth/refresh', { refresh_token: 'expired' })
    ).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      details: [],
    });
  });

  it('keeps the same Idempotency-Key when a mutating request is retried', async () => {
    const receivedKeys: Array<string | null> = [];

    server.use(
      http.post('*/api/v1/branches', ({ request }) => {
        receivedKeys.push(request.headers.get(IDEMPOTENCY_KEY_HEADER));

        const authorization = request.headers.get('Authorization');
        if (authorization === `Bearer ${ROTATED_ACCESS_TOKEN}`) {
          return HttpResponse.json({ branch_id: 'b-1' }, { status: 201 });
        }

        return unauthorized();
      }),
      http.post('*/api/v1/auth/refresh', () =>
        HttpResponse.json({
          ...authTokenPair,
          access_token: ROTATED_ACCESS_TOKEN,
          refresh_token: ROTATED_REFRESH_TOKEN,
        })
      )
    );

    tokenStorage.setTokens('stale_access_token', 'valid_refresh_token');

    const response = await apiClient.post<{ branch_id: string }>('/branches', {
      branch_code: 'MED-NEW',
      name: 'MedCare - New Branch',
    });

    expect(response.data.branch_id).toBe('b-1');
    expect(receivedKeys).toHaveLength(2);
    expect(receivedKeys[0]).not.toBeNull();
    expect(receivedKeys[0]).toBe(receivedKeys[1]);
  });

  it('does not trigger refresh, endExpiredSession, or Idempotency-Key on 401 from POST /branch-enrollment', async () => {
    let refreshCalls = 0;
    let receivedIdempotencyKey: string | null = 'not-checked';
    const sessionEndHandler = vi.fn();
    registerSessionEndHandler(sessionEndHandler);

    server.use(
      http.post('*/api/v1/branch-enrollment', ({ request }) => {
        receivedIdempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER);
        return HttpResponse.json(
          errorEnvelope(
            'UNAUTHORIZED',
            'Enrollment token is invalid or unrecognized.',
            'trace-enroll-401'
          ),
          { status: 401 }
        );
      }),
      http.post('*/api/v1/auth/refresh', () => {
        refreshCalls += 1;
        return HttpResponse.json(authTokenPair);
      })
    );

    tokenStorage.clearTokens();

    await expect(
      apiClient.post('/branch-enrollment', {
        token: 'bad-token',
      })
    ).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      details: [],
    });

    expect(receivedIdempotencyKey).toBeNull();
    expect(refreshCalls).toBe(0);
    expect(sessionEndHandler).not.toHaveBeenCalled();
  });
});

describe('Stage 1 ApiErrorEnvelopeDto normalization and idempotency exemptions', () => {
  it('normalizes 500 INTERNAL_SERVER_ERROR envelopes into ApiClientError', async () => {
    server.use(
      http.get('*/api/v1/branches', () =>
        HttpResponse.json(
          errorEnvelope(
            'INTERNAL_SERVER_ERROR',
            'Unhandled backend failure.',
            'trace-500'
          ),
          { status: 500 }
        )
      )
    );

    await expect(apiClient.get('/branches')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'INTERNAL_SERVER_ERROR',
      status: 500,
      details: [],
      trace_id: 'trace-500',
    });
  });

  it('exempts /auth/login, /auth/refresh, /auth/logout, and /branch-enrollment from Idempotency-Key while injecting on other mutations', async () => {
    const capturedHeaders: Record<string, string | null> = {};

    server.use(
      http.post('*/api/v1/auth/login', ({ request }) => {
        capturedHeaders.login = request.headers.get(IDEMPOTENCY_KEY_HEADER);
        return HttpResponse.json(authTokenPair, { status: 200 });
      }),
      http.post('*/api/v1/auth/refresh', ({ request }) => {
        capturedHeaders.refresh = request.headers.get(IDEMPOTENCY_KEY_HEADER);
        return HttpResponse.json(authTokenPair, { status: 200 });
      }),
      http.post('*/api/v1/auth/logout', ({ request }) => {
        capturedHeaders.logout = request.headers.get(IDEMPOTENCY_KEY_HEADER);
        return new HttpResponse(null, { status: 204 });
      }),
      http.post('*/api/v1/branch-enrollment', ({ request }) => {
        capturedHeaders.enrollment = request.headers.get(
          IDEMPOTENCY_KEY_HEADER
        );
        return HttpResponse.json({ branch_id: 'b-1' }, { status: 200 });
      }),
      http.post('*/api/v1/branches', ({ request }) => {
        capturedHeaders.branches = request.headers.get(IDEMPOTENCY_KEY_HEADER);
        return HttpResponse.json({ branch_id: 'b-1' }, { status: 201 });
      })
    );

    await apiClient.post('/auth/login', {
      organization_code: 'MEDCARE',
      username: 'sarah.pharm@medcare.test',
      password: 'password123',
    });
    await apiClient.post('/auth/refresh', {
      refresh_token: authTokenPair.refresh_token,
    });
    await apiClient.post('/auth/logout', {
      refresh_token: authTokenPair.refresh_token,
    });
    await apiClient.post('/branch-enrollment', { token: 'enroll-token' });
    await apiClient.post('/branches', { branch_code: 'MED-2', name: 'Two' });

    expect(capturedHeaders.login).toBeNull();
    expect(capturedHeaders.refresh).toBeNull();
    expect(capturedHeaders.logout).toBeNull();
    expect(capturedHeaders.enrollment).toBeNull();
    expect(capturedHeaders.branches).not.toBeNull();
  });
});

describe('non-JSON / HTML response protection', () => {
  it('rejects a 200 OK HTML fallback response instead of returning raw HTML string', async () => {
    server.use(
      http.get('*/api/v1/employees', () =>
        HttpResponse.html('<!doctype html><html><body>SPA</body></html>')
      )
    );

    await expect(apiClient.get('/employees')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'INVALID_RESPONSE',
      status: 200,
    });
  });

  it('rejects a 200 OK non-empty plain text response as INVALID_RESPONSE', async () => {
    server.use(
      http.get('*/api/v1/branches', () => HttpResponse.text('unexpected text'))
    );

    await expect(apiClient.get('/branches')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'INVALID_RESPONSE',
      status: 200,
    });
  });

  it('allows 204 No Content empty responses without raising INVALID_RESPONSE', async () => {
    server.use(
      http.post(
        '*/api/v1/users/user-1/revoke-sessions',
        () => new HttpResponse(null, { status: 204 })
      )
    );

    const response = await apiClient.post('/users/user-1/revoke-sessions');
    expect(response.status).toBe(204);
  });
});

describe('Stage 1 auth and canonical mock handlers', () => {
  it('rejects login requests missing organization_code with 422 VALIDATION_ERROR', async () => {
    await expect(
      apiClient.post('/auth/login', {
        organization_code: '',
        username: 'admin@medcare.test',
        password: 'password123',
      })
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects invalid credentials with 401 UNAUTHORIZED and details: []', async () => {
    await expect(
      apiClient.post('/auth/login', {
        organization_code: 'MEDCARE',
        username: 'admin@medcare.test',
        password: 'invalid',
      })
    ).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      details: [],
    });
  });

  it('tracks rotated refresh tokens so reusing a rotated token fails with 401', async () => {
    const firstRotation = await apiClient.post<{
      access_token: string;
      refresh_token: string;
    }>('/auth/refresh', {
      refresh_token: 'fresh_session_refresh_token',
    });

    expect(firstRotation.data.refresh_token.endsWith('.rotated')).toBe(true);

    await expect(
      apiClient.post('/auth/refresh', {
        refresh_token: 'fresh_session_refresh_token',
      })
    ).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      details: [],
    });

    const secondRotation = await apiClient.post<{
      access_token: string;
      refresh_token: string;
    }>('/auth/refresh', {
      refresh_token: firstRotation.data.refresh_token,
    });
    expect(secondRotation.data.refresh_token.endsWith('.rotated')).toBe(true);
  });

  it('enforces non-empty refresh_token on POST /auth/logout and serves GET /canonical/capabilities', async () => {
    await expect(
      apiClient.post('/auth/logout', { refresh_token: '' })
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      details: [
        { field: 'refresh_token', issue: 'Refresh token is required.' },
      ],
    });

    const capsResponse = await apiClient.get<CanonicalCapabilitiesDto>(
      '/canonical/capabilities'
    );
    expect(capsResponse.data).toEqual({
      stage: 1,
      runtime_mode: 'Cloud',
      supported_reads: ['canonical.products', 'canonical.inventory'],
      supported_writes: [
        'canonical.configuration.products',
        'canonical.configuration.reorder_rules',
      ],
    });
  });
});
