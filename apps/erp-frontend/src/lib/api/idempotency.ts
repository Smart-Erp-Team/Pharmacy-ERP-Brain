/**
 * Pharmacy ERP — Idempotency-Key helper (Stage 1)
 *
 * Per `contracts/FRONTEND.md §5.3`, mutating endpoints accept an
 * `Idempotency-Key` HTTP header (maxLength 100), with four documented
 * exemptions: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
 * and `POST /branch-enrollment`.
 *
 * Key stability rule:
 * - Retrying the SAME payload must reuse the SAME key, so the backend replays
 *   the stored response instead of executing the write twice.
 * - A DIFFERENT payload is a different logical operation and therefore needs a
 *   NEW key (reusing the old one produces `409 IDEMPOTENCY_MISMATCH`).
 * - Omitting the key on a required endpoint produces `400 MALFORMED_REQUEST`;
 *   exceeding `IDEMPOTENCY_KEY_MAX_LENGTH` produces `422 VALIDATION_ERROR`.
 *
 * Generated keys default to RFC 4122 UUID v4 (36 characters), which is always
 * non-empty and safely within the 100-character Stage 1 ceiling. The key is
 * attached on the Axios request config, so retrying the same request preserves
 * the same key automatically.
 */

/** Header name required by the Stage 1 contract. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** Stage 1 contract maximum length for the `Idempotency-Key` value. */
export const IDEMPOTENCY_KEY_MAX_LENGTH = 100;

const MUTATION_METHODS = ['post', 'put', 'patch', 'delete'] as const;

const FALLBACK_KEY_LENGTH = 36;

/**
 * Cryptographically random hex string, used only when `crypto.randomUUID` is
 * unavailable. The key is an opaque idempotency token, not a secret.
 */
const randomHex = (length: number): string => {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    cryptoApi.getRandomValues(bytes);

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, length);
  }

  return Math.random()
    .toString(16)
    .replace(/[^a-f0-9]/g, '')
    .padEnd(length, '0')
    .slice(0, length);
};

/**
 * Creates a valid idempotency key: a 36-character opaque UUID v4 (or 36-char
 * random hex fallback), safely within `IDEMPOTENCY_KEY_MAX_LENGTH` (100).
 */
export const createIdempotencyKey = (): string => {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  return randomHex(FALLBACK_KEY_LENGTH);
};

/**
 * True for HTTP methods that change server state and therefore carry an
 * `Idempotency-Key` header on non-exempt endpoints.
 */
export const isMutationMethod = (method: string | undefined): boolean => {
  if (!method) {
    return false;
  }

  const normalized = method.toLowerCase();
  return MUTATION_METHODS.some((candidate) => candidate === normalized);
};

export interface AttemptKeyRecord {
  signature: string;
  key: string;
}

export interface MutationRequestOptions {
  idempotencyKey?: string;
}

/**
 * Reuses the active attempt's `Idempotency-Key` when retrying an identical
 * payload, and rotates to a fresh key whenever the payload signature changes.
 */
export function getStableAttemptKey(
  attemptRef: { current: AttemptKeyRecord | null },
  signature: string,
  explicitKey?: string
): string {
  if (explicitKey) {
    return explicitKey;
  }
  if (attemptRef.current?.signature === signature) {
    return attemptRef.current.key;
  }
  const key = createIdempotencyKey();
  attemptRef.current = { signature, key };
  return key;
}

export function buildMutationConfig(
  options?: MutationRequestOptions
): { headers: Record<string, string> } | undefined {
  return options?.idempotencyKey
    ? { headers: { [IDEMPOTENCY_KEY_HEADER]: options.idempotencyKey } }
    : undefined;
}
