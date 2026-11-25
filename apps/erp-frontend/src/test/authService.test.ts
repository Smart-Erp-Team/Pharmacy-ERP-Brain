import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { handlers, resetMockAuth } from '../mocks/handlers';
import { authService } from '../features/auth/api/authService';
import { IDEMPOTENCY_KEY_HEADER } from '../lib/api/idempotency';
import { tokenStorage } from '../lib/auth/tokenStorage';

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  resetMockAuth();
  tokenStorage.clearTokens();
});
afterAll(() => server.close());

describe('authService & MSW integration (Stage 1)', () => {
  it('login() authenticates, returns normalized LoginResponse, and persists tokens + organizationCode', async () => {
    const result = await authService.login({
      organization_code: ' MEDCARE ',
      username: 'sarah.pharm@medcare.test',
      password: 'password123',
    });

    expect(result.access_token).toBeDefined();
    expect(result.token_type).toBe('Bearer');
    expect(result.user.username).toBe('sarah.pharm@medcare.test');
    expect(result.user.role).toBe('Pharmacist');
    expect(tokenStorage.getAccessToken()).toBe(result.access_token);
    expect(tokenStorage.getRefreshToken()).toBe(result.refresh_token);
    expect(tokenStorage.getOrganizationCode()).toBe('MEDCARE');
  });

  it('getCurrentUser() retrieves flat Stage 1 CurrentUserDto fixture', async () => {
    const ctx = await authService.getCurrentUser();

    expect(ctx.username).toBe('admin@medcare.test');
    expect(ctx.role).toBe('Admin');
    expect(ctx.branch_scope).toBe('ALL');
    expect(ctx.runtime_mode).toBe('Cloud');
    expect(ctx.scopes).toContain('user:admin');
  });

  it('logout() omits network call when refresh token is missing and clears storage', async () => {
    let logoutRequests = 0;
    server.use(
      http.post('*/api/v1/auth/logout', () => {
        logoutRequests += 1;
        return new HttpResponse(null, { status: 204 });
      })
    );

    tokenStorage.setTokens('sample_access');
    tokenStorage.setOrganizationCode('MEDCARE');

    await authService.logout();

    expect(logoutRequests).toBe(0);
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(tokenStorage.getOrganizationCode()).toBeNull();
  });

  it('logout() sends { refresh_token } without Idempotency-Key when refresh token is present and clears storage', async () => {
    let receivedBody: unknown = null;
    let receivedIdempotencyKey: string | null = 'unexpected';

    server.use(
      http.post('*/api/v1/auth/logout', async ({ request }) => {
        receivedIdempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER);
        receivedBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      })
    );

    tokenStorage.setTokens('sample_access', 'sample_refresh');
    tokenStorage.setOrganizationCode('MEDCARE');

    await authService.logout();

    expect(receivedIdempotencyKey).toBeNull();
    expect(receivedBody).toEqual({ refresh_token: 'sample_refresh' });
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(tokenStorage.getOrganizationCode()).toBeNull();
  });

  it('tokenStorage persists tokens + organizationCode to sessionStorage and clears all on clearTokens()', () => {
    tokenStorage.setTokens('pos_access_token', 'pos_refresh_token');
    tokenStorage.setOrganizationCode('MEDCARE');

    expect(tokenStorage.getAccessToken()).toBe('pos_access_token');
    expect(tokenStorage.getRefreshToken()).toBe('pos_refresh_token');
    expect(tokenStorage.getOrganizationCode()).toBe('MEDCARE');

    if (typeof window !== 'undefined' && window.sessionStorage) {
      expect(window.sessionStorage.getItem('erp_access_token')).toBe(
        'pos_access_token'
      );
      expect(window.sessionStorage.getItem('erp_refresh_token')).toBe(
        'pos_refresh_token'
      );
      expect(window.sessionStorage.getItem('erp_organization_code')).toBe(
        'MEDCARE'
      );
    }

    tokenStorage.clearTokens();
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(tokenStorage.getOrganizationCode()).toBeNull();

    if (typeof window !== 'undefined' && window.sessionStorage) {
      expect(window.sessionStorage.getItem('erp_access_token')).toBeNull();
      expect(window.sessionStorage.getItem('erp_organization_code')).toBeNull();
    }
  });
});
