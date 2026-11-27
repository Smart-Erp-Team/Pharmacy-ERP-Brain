/**
 * Pharmacy ERP — Central API Client (Stage 1)
 *
 * The single Axios instance for the whole app (skill `api-server-state`).
 * - Base URL: /api/v1 (resolved with origin fallback for Node/test environments)
 * - Automatic Bearer token injection from `tokenStorage`
 * - Automatic `Idempotency-Key` on non-exempt mutations (`contracts/FRONTEND.md §5.3`)
 * - Single-flight 401 refresh with token rotation & `LoginResponse` validation
 * - Stage 1 `ApiErrorEnvelopeDto` runtime normalization into `ApiClientError`
 */

import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { tokenStorage } from '../auth/tokenStorage';
import {
  notifySessionEnd,
  notifySessionUserUpdated,
} from '../auth/sessionEvents';
import {
  IDEMPOTENCY_KEY_HEADER,
  createIdempotencyKey,
  isMutationMethod,
} from './idempotency';
import {
  ContractValidationError,
  normalizeApiErrorEnvelope,
  normalizeLoginResponse,
} from './normalizers';
import type {
  ErrorCode,
  NormalizedApiErrorDetail,
  NormalizedLoginResponse,
  RefreshTokenRequest,
} from '../../types/api';

declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    _retry?: boolean;
  }
}

export type ApiClientErrorCode =
  ErrorCode | 'INVALID_RESPONSE' | 'UNKNOWN_ERROR';

export interface ApiClientErrorPayload {
  code: ApiClientErrorCode;
  message: string;
  details?: NormalizedApiErrorDetail[];
  trace_id?: string;
}

/**
 * Standard client error normalizing the Stage 1 `ApiErrorEnvelopeDto` and
 * client-side invalid transport/schema responses.
 */
export class ApiClientError extends Error {
  public readonly code: ApiClientErrorCode;
  public readonly status?: number;
  public readonly details: NormalizedApiErrorDetail[];
  public readonly trace_id?: string;

  constructor(payload: ApiClientErrorPayload, status?: number) {
    super(payload.message || 'An unexpected API error occurred');
    this.name = 'ApiClientError';
    this.code = payload.code || 'UNKNOWN_ERROR';
    this.status = status;
    this.details = payload.details ? [...payload.details] : [];
    this.trace_id =
      payload.trace_id && payload.trace_id.length > 0
        ? payload.trace_id
        : undefined;
  }
}

/**
 * Converts a `ContractValidationError` into a standardized `ApiClientError`
 * (`INVALID_RESPONSE`) so transport and service layers wrap schema mismatches
 * consistently.
 */
export function toInvalidResponseError(
  error: ContractValidationError,
  status?: number
): ApiClientError {
  return new ApiClientError(
    {
      code: error.code,
      message: error.message,
    },
    status
  );
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
 * Strips the origin, the query string, and trailing slashes from a request URL
 * so endpoints are matched reliably in both relative and absolute forms.
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
 * Token issuance/rotation endpoints. They must never trigger the 401 refresh
 * flow (which would loop infinitely).
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

const IDEMPOTENCY_EXEMPT_SUFFIXES = [
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/branch-enrollment',
] as const;

/**
 * Stage 1 contract-exempt endpoints (`contracts/FRONTEND.md §5.3`) that must
 * NOT receive an automatically injected `Idempotency-Key` header.
 */
const isIdempotencyExemptPath = (url: string | undefined): boolean => {
  const path = normalizeApiPath(url);
  return IDEMPOTENCY_EXEMPT_SUFFIXES.some((suffix) => path.endsWith(suffix));
};

const TRACEPARENT_HEADER = 'traceparent';

const DEFINITIVE_REFRESH_FAILURE_STATUSES: ReadonlySet<number> = new Set([
  400, 401, 403, 409, 422,
]);

function generateRandomBytes(byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  const cryptoApi = globalThis.crypto;

  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
    return bytes;
  }

  for (let i = 0; i < byteLength; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function randomNonZeroHex(byteLength: number): string {
  const bytes = generateRandomBytes(byteLength);
  if (bytes.every((byte) => byte === 0)) {
    bytes[byteLength - 1] = 1;
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
}

/**
 * Generates a valid W3C Trace Context `traceparent` header value:
 * `00-<32-lowercase-hex-traceId>-<16-lowercase-hex-spanId>-01`
 * where neither `traceId` nor `spanId` is all zeros.
 */
export function createTraceparent(): string {
  const traceId = randomNonZeroHex(16);
  const spanId = randomNonZeroHex(8);
  return `00-${traceId}-${spanId}-01`;
}

const isDefinitiveRefreshFailure = (refreshError: unknown): boolean => {
  if (refreshError instanceof ApiClientError) {
    return true;
  }
  if (axios.isAxiosError(refreshError)) {
    const status = refreshError.response?.status;
    return (
      status !== undefined && DEFINITIVE_REFRESH_FAILURE_STATUSES.has(status)
    );
  }
  return true;
};

/**
 * One refresh at a time. Refresh tokens rotate on every use, so two parallel
 * refreshes would consume the same token twice and revoke the whole token family.
 */
let refreshRequest: Promise<string> | null = null;

/**
 * Performs the token rotation call. Uses a plain Axios call on purpose so the
 * refresh request never re-enters `apiClient`'s 401 interceptor.
 */
const requestRefreshedAccessToken = async (): Promise<string> => {
  const refreshToken = tokenStorage.getRefreshToken();

  if (!refreshToken) {
    throw new Error('No refresh token is available for this session.');
  }

  const payload: RefreshTokenRequest = { refresh_token: refreshToken };

  const response = await axios.post<unknown>(
    `${apiClient.defaults.baseURL ?? ''}/auth/refresh`,
    payload,
    {
      timeout: apiClient.defaults.timeout,
      headers: {
        'Content-Type': 'application/json',
        [TRACEPARENT_HEADER]: createTraceparent(),
      },
    }
  );

  let normalized: NormalizedLoginResponse;
  try {
    normalized = normalizeLoginResponse(response.data, '/auth/refresh');
  } catch (error: unknown) {
    if (error instanceof ContractValidationError) {
      throw toInvalidResponseError(error, response.status);
    }
    throw error;
  }

  tokenStorage.setTokens(normalized.access_token, normalized.refresh_token);
  notifySessionUserUpdated(normalized.user);

  return normalized.access_token;
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
 * Drops the local session and asks the app to send the user back to login.
 */
const endExpiredSession = (): void => {
  tokenStorage.clearTokens();
  notifySessionEnd('expired');
};

const getResponseContentType = (response: AxiosResponse): string => {
  const headers: unknown = response.headers;
  if (!headers || typeof headers !== 'object') {
    return '';
  }

  if ('get' in headers && typeof headers.get === 'function') {
    const value: unknown = headers.get('content-type');
    return typeof value === 'string' ? value.toLowerCase() : '';
  }

  if ('content-type' in headers) {
    const value: unknown = headers['content-type'];
    return typeof value === 'string' ? value.toLowerCase() : '';
  }

  return '';
};

/**
 * Rejects HTML/text SPA-fallback payloads (e.g., Vite serving `index.html` with
 * HTTP 200 when MSW or a proxy misses `/api/v1/*`) so API callers never coerce
 * non-JSON strings into empty lists.
 */
const validateJsonApiResponse = (response: AxiosResponse): AxiosResponse => {
  if (response.status === 204 || response.status === 205) {
    return response;
  }

  const responseType = response.config.responseType;
  if (responseType && responseType !== 'json') {
    return response;
  }

  const contentType = getResponseContentType(response);
  const isHtmlResponse =
    contentType.includes('text/html') ||
    contentType.includes('application/xhtml+xml');
  const isUnexpectedTextPayload =
    typeof response.data === 'string' && response.data.trim().length > 0;

  if (isHtmlResponse || isUnexpectedTextPayload) {
    throw new ApiClientError(
      {
        code: 'INVALID_RESPONSE',
        message:
          'Expected a JSON API response, but received an unexpected HTML or text payload.',
      },
      response.status
    );
  }

  return response;
};

// Request Interceptor: Inject Bearer JWT, W3C traceparent, and Stage 1 Idempotency-Key
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (!config.headers.has(TRACEPARENT_HEADER)) {
      config.headers.set(TRACEPARENT_HEADER, createTraceparent());
    }

    // Attach Idempotency-Key on every mutating endpoint except the four
    // Stage 1 contract-exempt paths. Keeping the header on `config` preserves
    // the same key across retries of the same request.
    if (
      isMutationMethod(config.method) &&
      !isIdempotencyExemptPath(config.url) &&
      !config.headers.has(IDEMPOTENCY_KEY_HEADER)
    ) {
      config.headers.set(IDEMPOTENCY_KEY_HEADER, createIdempotencyKey());
    }

    return config;
  },
  (error: unknown) => Promise.reject(error)
);

// Response Interceptor: Validate JSON payload, handle 401 refresh flow & Stage 1 ApiError normalization
apiClient.interceptors.response.use(
  validateJsonApiResponse,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const originalRequest = error.config;
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
        } catch (refreshError: unknown) {
          if (isDefinitiveRefreshFailure(refreshError)) {
            endExpiredSession();
          } else {
            if (axios.isAxiosError(refreshError)) {
              const refreshEnvelope = normalizeApiErrorEnvelope(
                refreshError.response?.data
              );
              if (refreshEnvelope) {
                return Promise.reject(
                  new ApiClientError(
                    refreshEnvelope.error,
                    refreshError.response?.status
                  )
                );
              }
            }
            return Promise.reject(refreshError);
          }
        }
      } else {
        // The request was already retried with a fresh token and was rejected
        // again: the session is really over.
        endExpiredSession();
      }
    }

    const normalizedEnvelope = normalizeApiErrorEnvelope(error.response?.data);
    if (normalizedEnvelope) {
      return Promise.reject(
        new ApiClientError(normalizedEnvelope.error, error.response?.status)
      );
    }

    return Promise.reject(error);
  }
);
