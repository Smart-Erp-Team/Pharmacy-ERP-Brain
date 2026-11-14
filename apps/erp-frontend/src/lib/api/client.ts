/**
 * Pharmacy ERP — Central API Client
 *
 * The single Axios instance for the whole app (skill `api-server-state`).
 * - Base URL: /api/v1 (resolved with origin fallback for Node/test environments)
 * - Automatic Bearer token injection from tokenStorage
 * - Automatic `Idempotency-Key` on mutations (contract requirement)
 * - Single-flight 401 refresh with token rotation, then session expiration
 * - Standard ApiError envelope formatting
 */

import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { tokenStorage } from '../auth/tokenStorage';
import { notifySessionEnd } from '../auth/sessionEvents';
import {
  IDEMPOTENCY_KEY_HEADER,
  createIdempotencyKey,
  isMutationMethod,
} from './idempotency';
import type {
  ApiError,
  RefreshTokenRequest,
  TokenPairResponse,
} from '../../types/api';

/**
 * Standard client error normalizing the backend ApiError envelope.
 */
export class ApiClientError extends Error {
  public readonly code: string;
  public readonly status?: number;
  public readonly details?: Array<{ field?: string; issue: string }>;
  public readonly trace_id?: string;

  constructor(payload: ApiError['error'], status?: number) {
    super(payload.message || 'An unexpected API error occurred');
    this.name = 'ApiClientError';
    this.code = payload.code || 'UNKNOWN_ERROR';
    this.status = status;
    this.details = payload.details;
    this.trace_id = payload.trace_id;
  }
}

/**
 * Custom request config interface extending Axios to track retry attempts.
 */
interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

const resolveBaseUrl = (): string => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  // In Node.js testing environments, relative baseURLs cause Invalid URL errors.
  if (typeof window === 'undefined' || !window.location?.origin) {
    return 'http://localhost/api/v1';
  }
  return '/api/v1';
};

export const apiClient: AxiosInstance = axios.create({
  baseURL: resolveBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

/**
 * Strips the origin, the query string and a trailing slash from a request URL so
 * the token endpoints can be recognized in both relative and absolute form.
 */
const normalizeApiPath = (url: string | undefined): string => {
  if (!url) {
    return '';
  }

  const withoutQuery = url.split('?')[0] ?? '';
  const withoutOrigin = withoutQuery.replace(
    /^[a-z][a-z0-9+.-]*:\/\/[^/]*/i,
    ''
  );

  return withoutOrigin.replace(/\/+$/, '');
};

/**
 * The token endpoints. They never take an `Idempotency-Key`, and they must never
 * trigger the refresh flow (that would loop forever).
 */
const isAuthTokenPath = (url: string | undefined): boolean => {
  const path = normalizeApiPath(url);
  return path.endsWith('/auth/login') || path.endsWith('/auth/refresh');
};

/**
 * Unauthenticated device-enrollment redemption returns 401 when the single-use
 * token is invalid or unrecognized. That 401 must surface as an inline form
 * error instead of triggering session-refresh / session-expired redirect.
 */
const isBranchEnrollmentPath = (url: string | undefined): boolean =>
  normalizeApiPath(url).endsWith('/branch-enrollment');

/**
 * One refresh at a time. Refresh tokens rotate on every use, so two parallel
 * refreshes would consume the same token twice and revoke the whole token family.
 */
let refreshRequest: Promise<string> | null = null;

/**
 * Performs the rotation call. It uses a plain Axios call on purpose: the refresh
 * request must not re-enter this interceptor and try to refresh itself.
 */
const requestRefreshedAccessToken = async (): Promise<string> => {
  const refreshToken = tokenStorage.getRefreshToken();

  if (!refreshToken) {
    throw new Error('No refresh token is available for this session.');
  }

  const payload: RefreshTokenRequest = { refresh_token: refreshToken };

  const response = await axios.post<TokenPairResponse>(
    `${apiClient.defaults.baseURL ?? ''}/auth/refresh`,
    payload,
    { headers: { 'Content-Type': 'application/json' } }
  );

  tokenStorage.setTokens(
    response.data.access_token,
    response.data.refresh_token
  );

  return response.data.access_token;
};

/**
 * Shares one in-flight refresh between every request that hit a 401.
 */
const getRefreshedAccessToken = (): Promise<string> => {
  if (!refreshRequest) {
    refreshRequest = requestRefreshedAccessToken().finally(() => {
      refreshRequest = null;
    });
  }

  return refreshRequest;
};

/**
 * Drops the local session and asks the app to send the user back to the login page.
 */
const endExpiredSession = (): void => {
  tokenStorage.clearTokens();
  notifySessionEnd('expired');
};

// Request Interceptor: Inject JWT token from storage
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // The contract requires the header on every mutation except the two token
    // endpoints. The key stays on the config, so a retry keeps the same key.
    if (
      isMutationMethod(config.method) &&
      !isAuthTokenPath(config.url) &&
      !config.headers.has(IDEMPOTENCY_KEY_HEADER)
    ) {
      config.headers.set(IDEMPOTENCY_KEY_HEADER, createIdempotencyKey());
    }

    return config;
  },
  (error: unknown) => Promise.reject(error)
);

// Response Interceptor: Handle 401 refresh flow & ApiError formatting
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;
    const isUnauthorized = error.response?.status === 401;

    if (
      isUnauthorized &&
      originalRequest &&
      !isAuthTokenPath(originalRequest.url) &&
      !isBranchEnrollmentPath(originalRequest.url)
    ) {
      if (!originalRequest._retry) {
        originalRequest._retry = true;

        try {
          const accessToken = await getRefreshedAccessToken();
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        } catch {
          endExpiredSession();
        }
      } else {
        // The request was already retried with a fresh token and was rejected
        // again: the session is really over.
        endExpiredSession();
      }
    }

    // Format error into standard ApiClientError if error envelope exists
    if (error.response?.data?.error) {
      return Promise.reject(
        new ApiClientError(error.response.data.error, error.response.status)
      );
    }

    return Promise.reject(error);
  }
);
