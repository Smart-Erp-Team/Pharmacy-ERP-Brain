/**
 * Pharmacy ERP — Shared TanStack Query Client
 *
 * The single QueryClient for the whole app (STRUCTURE.md: `lib/queryClient.ts`).
 * Every server-data default lives here; screens never override retry/staleTime.
 *
 * Retry policy: a 4xx is the server's final answer (the request itself was wrong),
 * so it is never retried. Network and 5xx failures are retried a couple of times.
 * Mutations are never retried automatically: a write is retried by the user, with
 * the same `Idempotency-Key`, so the backend can replay it safely.
 */

import { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from './api/client';

const CLIENT_ERROR_MIN_STATUS = 400;
const CLIENT_ERROR_MAX_STATUS = 499;
const NETWORK_RETRY_LIMIT = 2;
const DEFAULT_STALE_TIME_MS = 30_000;

/**
 * Extracts the HTTP status of an error, whether it is the normalized
 * `ApiClientError` or a raw transport error that still carries a status.
 */
const getErrorStatus = (error: unknown): number | null => {
  if (error instanceof ApiClientError) {
    return error.status ?? null;
  }

  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return null;
  }

  const status: unknown = error.status;
  return typeof status === 'number' ? status : null;
};

/**
 * True when the error is a 4xx answer from the backend.
 */
export const isClientError = (error: unknown): boolean => {
  const status = getErrorStatus(error);
  return (
    status !== null &&
    status >= CLIENT_ERROR_MIN_STATUS &&
    status <= CLIENT_ERROR_MAX_STATUS
  );
};

/**
 * The one QueryClient instance used by the app.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (isClientError(error)) {
          return false;
        }

        return failureCount < NETWORK_RETRY_LIMIT;
      },
      staleTime: DEFAULT_STALE_TIME_MS,
      // A POS terminal is shared and its window focus events are noisy.
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
