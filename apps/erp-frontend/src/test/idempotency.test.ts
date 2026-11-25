import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import authTokenPair from '@contracts/fixtures/auth-token-pair.json';
import { handlers, resetMockAuth } from '../mocks/handlers';
import { authService } from '../features/auth/api/authService';
import { apiClient } from '../lib/api/client';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  type AttemptKeyRecord,
  buildMutationConfig,
  createIdempotencyKey,
  getStableAttemptKey,
  isMutationMethod,
} from '../lib/api/idempotency';
import { tokenStorage } from '../lib/auth/tokenStorage';

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  resetMockAuth();
  tokenStorage.clearTokens();
});
afterAll(() => server.close());

describe('createIdempotencyKey', () => {
  it('creates a non-empty key within the 100 character Stage 1 limit', () => {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const key = createIdempotencyKey();

      expect(key.trim().length).toBeGreaterThan(0);
      expect(key.length).toBeLessThanOrEqual(IDEMPOTENCY_KEY_MAX_LENGTH);
    }
  });

  it('creates a different key for every call', () => {
    const keys = new Set<string>();

    for (let attempt = 0; attempt < 25; attempt += 1) {
      keys.add(createIdempotencyKey());
    }

    expect(keys.size).toBe(25);
  });
});

describe('isMutationMethod', () => {
  it('treats the write methods as mutations', () => {
    expect(isMutationMethod('post')).toBe(true);
    expect(isMutationMethod('POST')).toBe(true);
    expect(isMutationMethod('put')).toBe(true);
    expect(isMutationMethod('patch')).toBe(true);
    expect(isMutationMethod('delete')).toBe(true);
  });

  it('does not treat the read methods as mutations', () => {
    expect(isMutationMethod('get')).toBe(false);
    expect(isMutationMethod('head')).toBe(false);
    expect(isMutationMethod('options')).toBe(false);
    expect(isMutationMethod(undefined)).toBe(false);
  });
});

describe('Idempotency-Key on the wire', () => {
  it('omits Idempotency-Key on all 4 Stage 1 exempt endpoints', async () => {
    const loginKeys: Array<string | null> = [];
    const refreshKeys: Array<string | null> = [];
    const logoutKeys: Array<string | null> = [];
    const enrollmentKeys: Array<string | null> = [];

    server.use(
      http.post('*/api/v1/auth/login', ({ request }) => {
        loginKeys.push(request.headers.get(IDEMPOTENCY_KEY_HEADER));
        return HttpResponse.json(authTokenPair, { status: 200 });
      }),
      http.post('*/api/v1/auth/refresh', ({ request }) => {
        refreshKeys.push(request.headers.get(IDEMPOTENCY_KEY_HEADER));
        return HttpResponse.json(authTokenPair, { status: 200 });
      }),
      http.post('*/api/v1/auth/logout', ({ request }) => {
        logoutKeys.push(request.headers.get(IDEMPOTENCY_KEY_HEADER));
        return new HttpResponse(null, { status: 204 });
      }),
      http.post('*/api/v1/branch-enrollment', ({ request }) => {
        enrollmentKeys.push(request.headers.get(IDEMPOTENCY_KEY_HEADER));
        return HttpResponse.json(
          {
            organization_id: authTokenPair.user.organization_id,
            branch_id: '11111111-2222-4111-8111-000000000001',
            runtime_credential: 'cred-1',
            initial_sync_cursor: 0,
            credential_expiry: '2026-12-31T00:00:00+00:00',
          },
          { status: 200 }
        );
      })
    );

    await authService.login({
      organization_code: 'MEDCARE',
      username: 'sarah.pharm@medcare.test',
      password: 'password123',
    });
    await apiClient.post('/auth/refresh', {
      refresh_token: authTokenPair.refresh_token,
    });
    await authService.logout();
    await apiClient.post('/branch-enrollment?source=pos', {
      token: 'enroll-token-1',
    });

    expect(loginKeys).toEqual([null]);
    expect(refreshKeys).toEqual([null]);
    expect(logoutKeys).toEqual([null]);
    expect(enrollmentKeys).toEqual([null]);
  });

  it('sends a valid Idempotency-Key header on regular mutations', async () => {
    const receivedKeys: Array<string | null> = [];

    server.use(
      http.post('*/api/v1/branches', ({ request }) => {
        receivedKeys.push(request.headers.get(IDEMPOTENCY_KEY_HEADER));
        return HttpResponse.json({ branch_id: 'b-1' }, { status: 201 });
      }),
      http.post('*/api/v1/users/user-1/revoke-sessions', ({ request }) => {
        receivedKeys.push(request.headers.get(IDEMPOTENCY_KEY_HEADER));
        return new HttpResponse(null, { status: 204 });
      })
    );

    await apiClient.post('/branches', {
      branch_code: 'MED-NEW',
      name: 'MedCare - Maadi',
    });
    await apiClient.post('/users/user-1/revoke-sessions');

    expect(receivedKeys).toHaveLength(2);
    for (const key of receivedKeys) {
      expect(key).not.toBeNull();
      expect(key?.length ?? 0).toBeGreaterThan(0);
      expect(key?.length ?? 0).toBeLessThanOrEqual(IDEMPOTENCY_KEY_MAX_LENGTH);
    }
  });
});

describe('getStableAttemptKey and buildMutationConfig', () => {
  it('reuses the same key for identical payloads and rotates on signature change', () => {
    const attemptRef: { current: AttemptKeyRecord | null } = { current: null };

    const firstKey = getStableAttemptKey(attemptRef, '{"name":"A"}');
    const retryKey = getStableAttemptKey(attemptRef, '{"name":"A"}');
    const changedKey = getStableAttemptKey(attemptRef, '{"name":"B"}');

    expect(retryKey).toBe(firstKey);
    expect(changedKey).not.toBe(firstKey);
    expect(
      getStableAttemptKey(attemptRef, '{"name":"B"}', 'explicit-key')
    ).toBe('explicit-key');
  });

  it('builds a header config only when an idempotency key is provided', () => {
    expect(buildMutationConfig()).toBeUndefined();
    expect(
      buildMutationConfig({ idempotencyKey: 'abc-123-456-789-0' })
    ).toEqual({
      headers: { [IDEMPOTENCY_KEY_HEADER]: 'abc-123-456-789-0' },
    });
  });
});
