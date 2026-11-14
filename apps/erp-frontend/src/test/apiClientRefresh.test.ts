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
import { handlers } from '../mocks/handlers';
import { ApiClientError, apiClient } from '../lib/api/client';
import { registerSessionEndHandler } from '../lib/auth/sessionEvents';
import { tokenStorage } from '../lib/auth/tokenStorage';

const server = setupServer(...handlers);

const ROTATED_ACCESS_TOKEN = 'rotated_access_token';
const ROTATED_REFRESH_TOKEN = 'rotated_refresh_token';

const unauthorized = () =>
  HttpResponse.json(
    { error: { code: 'UNAUTHORIZED', message: 'access token expired' } },
    { status: 401 }
  );

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
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
          {
            error: {
              code: 'UNAUTHORIZED',
              message: 'refresh token has already been consumed',
            },
          },
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
          {
            error: {
              code: 'CONFLICT',
              message: 'refresh token family revoked',
            },
          },
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
          {
            error: { code: 'UNAUTHORIZED', message: 'refresh token consumed' },
          },
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
    ).rejects.toBeInstanceOf(ApiClientError);
  });

  it('keeps the same Idempotency-Key when a request is retried', async () => {
    const receivedKeys: Array<string | null> = [];

    server.use(
      http.post('*/api/v1/protected-mutation', ({ request }) => {
        receivedKeys.push(request.headers.get('Idempotency-Key'));

        const authorization = request.headers.get('Authorization');
        if (authorization === `Bearer ${ROTATED_ACCESS_TOKEN}`) {
          return HttpResponse.json({ ok: true }, { status: 200 });
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

    const response = await apiClient.post<{ ok: boolean }>(
      '/protected-mutation',
      { quantity: 2 }
    );

    expect(response.data.ok).toBe(true);
    expect(receivedKeys).toHaveLength(2);
    expect(receivedKeys[0]).not.toBeNull();
    expect(receivedKeys[0]).toBe(receivedKeys[1]);
  });
});
