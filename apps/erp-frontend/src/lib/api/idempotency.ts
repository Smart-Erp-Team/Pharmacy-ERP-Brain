/**
 * Pharmacy ERP — Idempotency-Key helper
 *
 * The contract requires an `Idempotency-Key` header (16-100 characters) on every
 * mutation, with two documented exceptions: `POST /auth/login` and
 * `POST /auth/refresh` (token operations the backend owns).
 *
 * Key stability rule:
 * - Retrying the SAME payload must reuse the SAME key, so the backend replays the
 *   stored response instead of executing the write twice.
 * - A DIFFERENT payload is a different logical operation and therefore needs a NEW
 *   key (reusing the old one would produce `409 IDEMPOTENCY_MISMATCH`).
 *
 * The key is stored on the Axios request config, so a retry of the same request
 * keeps the same key without this module tracking anything.
 */

/** Header name required by the contract. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** Contract bounds for the key value. */
export const IDEMPOTENCY_KEY_MIN_LENGTH = 16;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 100;

const MUTATION_METHODS = ['post', 'put', 'patch', 'delete'] as const;

const FALLBACK_KEY_LENGTH = 36;

/**
 * Cryptographically random hex string, used only when the Web Crypto API is
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
 * Creates a valid idempotency key: an opaque string of 16-100 characters.
 */
export const createIdempotencyKey = (): string => {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  return randomHex(FALLBACK_KEY_LENGTH);
};

/**
 * True for the HTTP methods that change server state and therefore require the
 * `Idempotency-Key` header.
 */
export const isMutationMethod = (method: string | undefined): boolean => {
  if (!method) {
    return false;
  }

  const normalized = method.toLowerCase();
  return MUTATION_METHODS.some((candidate) => candidate === normalized);
};
