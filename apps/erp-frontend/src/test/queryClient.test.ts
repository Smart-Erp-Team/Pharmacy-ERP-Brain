import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { MutationObserver } from '@tanstack/react-query';
import { handlers } from '../mocks/handlers';
import { ApiClientError } from '../lib/api/client';
import { isClientError, queryClient } from '../lib/queryClient';
import { tokenStorage } from '../lib/auth/tokenStorage';
import { useAuthStore } from '../stores/authStore';

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  queryClient.clear();
  tokenStorage.clearTokens();
});
afterAll(() => server.close());

const clientError = (status: number) =>
  new ApiClientError(
    { code: 'VALIDATION_ERROR', message: 'invalid request' },
    status
  );

describe('isClientError', () => {
  it('recognizes a 4xx answer', () => {
    expect(isClientError(clientError(400))).toBe(true);
    expect(isClientError(clientError(404))).toBe(true);
    expect(isClientError(clientError(422))).toBe(true);
  });

  it('does not treat a 5xx or a plain error as a client error', () => {
    expect(isClientError(clientError(500))).toBe(false);
    expect(isClientError(new Error('network down'))).toBe(false);
    expect(isClientError(undefined)).toBe(false);
  });
});

describe('queryClient defaults', () => {
  it('never retries a 4xx answer', async () => {
    let attempts = 0;

    const request = queryClient.fetchQuery({
      queryKey: ['test', 'client-error'],
      queryFn: () => {
        attempts += 1;
        throw clientError(422);
      },
      retryDelay: 0,
    });

    await expect(request).rejects.toBeInstanceOf(ApiClientError);
    expect(attempts).toBe(1);
  });

  it('retries a server error', async () => {
    let attempts = 0;

    const request = queryClient.fetchQuery({
      queryKey: ['test', 'server-error'],
      queryFn: () => {
        attempts += 1;
        throw clientError(500);
      },
      retryDelay: 0,
    });

    await expect(request).rejects.toBeInstanceOf(ApiClientError);
    expect(attempts).toBeGreaterThan(1);
  });

  it('never retries a mutation', async () => {
    let attempts = 0;

    const observer = new MutationObserver(queryClient, {
      mutationFn: async () => {
        attempts += 1;
        throw new Error('write failed');
      },
    });

    await observer.mutate().catch(() => undefined);
    expect(attempts).toBe(1);
  });
});

describe('session cache cleanup', () => {
  it('empties the cached server data on logout', async () => {
    queryClient.setQueryData(['products', 'list'], [{ product_id: 'p-1' }]);
    expect(queryClient.getQueryData(['products', 'list'])).toBeDefined();

    await useAuthStore.getState().logout();

    expect(queryClient.getQueryData(['products', 'list'])).toBeUndefined();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(tokenStorage.getAccessToken()).toBeNull();
  });

  it('empties the cached server data when the session is reset', () => {
    queryClient.setQueryData(
      ['inventory', 'balances'],
      [{ product_id: 'p-2' }]
    );
    expect(queryClient.getQueryData(['inventory', 'balances'])).toBeDefined();

    useAuthStore.getState().resetSession();

    expect(queryClient.getQueryData(['inventory', 'balances'])).toBeUndefined();
    expect(useAuthStore.getState().currentUser).toBeNull();
  });
});
