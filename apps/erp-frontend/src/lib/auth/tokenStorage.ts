/**
 * Pharmacy ERP — Token Storage
 *
 * The single authority for reading and writing auth tokens to browser storage.
 * Follows STRUCTURE.md: lib/auth/tokenStorage.ts is the only file that touches storage.
 * Uses sessionStorage (destroyed on tab close) to enforce security in shared-device POS environments.
 * Includes in-memory fallback for SSR/Node/test environments where window.sessionStorage is unavailable.
 */

const ACCESS_TOKEN_KEY = 'erp_access_token';
const REFRESH_TOKEN_KEY = 'erp_refresh_token';
const ORGANIZATION_CODE_KEY = 'erp_organization_code';

// In-memory fallback for environments without sessionStorage (e.g. Node test runners)
const inMemoryStore = new Map<string, string>();

const getStorage = (): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
} => {
  if (
    typeof window !== 'undefined' &&
    typeof window.sessionStorage !== 'undefined'
  ) {
    return window.sessionStorage;
  }
  return {
    getItem: (key: string) => inMemoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => inMemoryStore.set(key, value),
    removeItem: (key: string) => inMemoryStore.delete(key),
  };
};

export const tokenStorage = {
  getAccessToken(): string | null {
    try {
      return getStorage().getItem(ACCESS_TOKEN_KEY);
    } catch {
      return inMemoryStore.get(ACCESS_TOKEN_KEY) ?? null;
    }
  },

  getRefreshToken(): string | null {
    try {
      return getStorage().getItem(REFRESH_TOKEN_KEY);
    } catch {
      return inMemoryStore.get(REFRESH_TOKEN_KEY) ?? null;
    }
  },

  getOrganizationCode(): string | null {
    try {
      const value = getStorage().getItem(ORGANIZATION_CODE_KEY);
      return value && value.trim().length > 0 ? value.trim() : null;
    } catch {
      const fallback = inMemoryStore.get(ORGANIZATION_CODE_KEY) ?? null;
      return fallback && fallback.trim().length > 0 ? fallback.trim() : null;
    }
  },

  setTokens(accessToken: string, refreshToken?: string | null): void {
    try {
      const storage = getStorage();
      storage.setItem(ACCESS_TOKEN_KEY, accessToken);
      if (refreshToken) {
        storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      }
    } catch (error) {
      console.warn('Unable to persist auth tokens to storage', error);
      inMemoryStore.set(ACCESS_TOKEN_KEY, accessToken);
      if (refreshToken) {
        inMemoryStore.set(REFRESH_TOKEN_KEY, refreshToken);
      }
    }
  },

  setOrganizationCode(code: string | null): void {
    const normalized = code?.trim() ?? '';
    try {
      const storage = getStorage();
      if (normalized.length > 0) {
        storage.setItem(ORGANIZATION_CODE_KEY, normalized);
      } else {
        storage.removeItem(ORGANIZATION_CODE_KEY);
      }
    } catch (error) {
      console.warn('Unable to persist organization code to storage', error);
      if (normalized.length > 0) {
        inMemoryStore.set(ORGANIZATION_CODE_KEY, normalized);
      } else {
        inMemoryStore.delete(ORGANIZATION_CODE_KEY);
      }
    }
  },

  clearTokens(): void {
    try {
      const storage = getStorage();
      storage.removeItem(ACCESS_TOKEN_KEY);
      storage.removeItem(REFRESH_TOKEN_KEY);
      storage.removeItem(ORGANIZATION_CODE_KEY);
    } catch (error) {
      console.warn('Unable to clear auth tokens from storage', error);
    } finally {
      inMemoryStore.clear();
    }
  },
};
