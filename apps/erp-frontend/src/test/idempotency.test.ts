import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import authTokenPair from '@contracts/fixtures/auth-token-pair.json';
import { handlers } from '../mocks/handlers';
import { authService } from '../features/auth/api/authService';
import { apiClient } from '../lib/api/client';
import {
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_MIN_LENGTH,
  type AttemptKeyRecord,
  buildMutationConfig,
  createIdempotencyKey,
  getStableAttemptKey,
  isMutationMethod,
} from '../lib/api/idempotency';

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('createIdempotencyKey', () => {
  it('creates a key inside the 16-100 character range required by the contract', () => {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const key = createIdempotencyKey();

      expect(key.length).toBeGreaterThanOrEqual(IDEMPOTENCY_KEY_MIN_LENGTH);
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
  it('sends the header on POST /auth/logout', async () => {
    const receivedKeys: Array<string | null> = [];

    server.use(
      http.post('*/api/v1/auth/logout', ({ request }) => {
        receivedKeys.push(request.headers.get('Idempotency-Key'));
        return new HttpResponse(null, { status: 204 });
      })
    );

    await authService.logout();

    const receivedKey = receivedKeys[0];
    expect(receivedKey).toBeDefined();
    expect(receivedKey?.length ?? 0).toBeGreaterThanOrEqual(
      IDEMPOTENCY_KEY_MIN_LENGTH
    );
    expect(receivedKey?.length ?? 0).toBeLessThanOrEqual(
      IDEMPOTENCY_KEY_MAX_LENGTH
    );
  });

  it('sends the header on a regular mutation', async () => {
    let receivedKey: string | null = null;

    server.use(
      http.post('*/api/v1/products', ({ request }) => {
        receivedKey = request.headers.get('Idempotency-Key');
        return HttpResponse.json({ product_id: 'p-1' }, { status: 201 });
      })
    );

    await apiClient.post('/products', { name: 'Amoxicillin' });

    expect(receivedKey).not.toBeNull();
  });

  it('does not send the header on the token endpoints', async () => {
    const receivedKeys: Array<string | null> = [];

    server.use(
      http.post('*/api/v1/auth/login', ({ request }) => {
        receivedKeys.push(request.headers.get('Idempotency-Key'));
        return HttpResponse.json(authTokenPair, { status: 200 });
      })
    );

    await authService.login({
      organization_code: 'PHARMAPLUS',
      username: 'fa.pharmacist',
      password: 'password123',
    });

    expect(receivedKeys).toHaveLength(1);
    expect(receivedKeys[0]).toBeNull();
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
      headers: { 'Idempotency-Key': 'abc-123-456-789-0' },
    });
  });
});
