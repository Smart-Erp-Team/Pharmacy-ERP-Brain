import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import currentUserContextFixture from '@contracts/fixtures/current-user-context.json';
import { handlers, resetMockAuth } from '../mocks/handlers';
import { IDEMPOTENCY_KEY_HEADER } from '../lib/api/idempotency';
import { normalizeCurrentUser } from '../lib/api/normalizers';
import { tokenStorage } from '../lib/auth/tokenStorage';
import { useAuthStore } from '../stores/authStore';

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterAll(() => server.close());

beforeEach(() => {
  server.resetHandlers();
  resetMockAuth();
  tokenStorage.clearTokens();
  useAuthStore.setState({
    currentUser: null,
    organizationCode: null,
    activeBranchId: null,
    isAuthenticated: false,
    isInitializing: true,
  });
});

describe('authStore (Stage 1)', () => {
  it('initialize() sets isAuthenticated: false and organizationCode: null when no token is present', async () => {
    await useAuthStore.getState().initialize();

    const state = useAuthStore.getState();
    expect(state.isInitializing).toBe(false);
    expect(state.isAuthenticated).toBe(false);
    expect(state.currentUser).toBeNull();
    expect(state.organizationCode).toBeNull();
  });

  it('login() authenticates, fetches flat CurrentUserDto, and persists organizationCode', async () => {
    await useAuthStore.getState().login({
      organization_code: 'MEDCARE',
      username: 'admin@medcare.test',
      password: 'password123',
    });

    const state = useAuthStore.getState();
    expect(state.isInitializing).toBe(false);
    expect(state.isAuthenticated).toBe(true);
    expect(state.organizationCode).toBe('MEDCARE');
    expect(state.activeBranchId).toBeNull();
    expect(state.currentUser).not.toBeNull();
    expect(state.currentUser?.username).toBe('admin@medcare.test');
    expect(state.currentUser?.role).toBe('Admin');
    expect(state.currentUser?.runtime_mode).toBe('Cloud');
    expect(tokenStorage.getAccessToken()).toBeDefined();
    expect(tokenStorage.getOrganizationCode()).toBe('MEDCARE');
  });

  it('initialize() restores session and organizationCode when valid token exists in storage', async () => {
    tokenStorage.setTokens('existing_valid_token');
    tokenStorage.setOrganizationCode('MEDCARE');

    await useAuthStore.getState().initialize();

    const state = useAuthStore.getState();
    expect(state.isInitializing).toBe(false);
    expect(state.isAuthenticated).toBe(true);
    expect(state.organizationCode).toBe('MEDCARE');
    expect(state.currentUser?.username).toBe('admin@medcare.test');
    expect(state.currentUser?.role).toBe('Admin');
  });

  it('logout() sends { refresh_token } without Idempotency-Key, resets store state, and clears tokens + organizationCode', async () => {
    let receivedBody: unknown = null;
    let receivedIdempotencyKey: string | null = 'unexpected';

    server.use(
      http.post('*/api/v1/auth/logout', async ({ request }) => {
        receivedIdempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER);
        receivedBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      })
    );

    tokenStorage.setTokens('test_token', 'test_refresh_token');
    tokenStorage.setOrganizationCode('MEDCARE');
    useAuthStore.setState({
      currentUser: normalizeCurrentUser(currentUserContextFixture),
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(receivedIdempotencyKey).toBeNull();
    expect(receivedBody).toEqual({ refresh_token: 'test_refresh_token' });
    expect(state.isAuthenticated).toBe(false);
    expect(state.currentUser).toBeNull();
    expect(state.organizationCode).toBeNull();
    expect(state.activeBranchId).toBeNull();
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(tokenStorage.getOrganizationCode()).toBeNull();
  });

  it('resetSession() clears store state, tokens, and organizationCode without making an API call', () => {
    tokenStorage.setTokens('test_token', 'test_refresh_token');
    tokenStorage.setOrganizationCode('MEDCARE');
    useAuthStore.setState({
      currentUser: normalizeCurrentUser(currentUserContextFixture),
      organizationCode: 'MEDCARE',
      activeBranchId: '11111111-2222-4111-8111-000000000001',
      isAuthenticated: true,
      isInitializing: false,
    });

    useAuthStore.getState().resetSession();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isInitializing).toBe(false);
    expect(state.currentUser).toBeNull();
    expect(state.organizationCode).toBeNull();
    expect(state.activeBranchId).toBeNull();
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(tokenStorage.getOrganizationCode()).toBeNull();
  });

  it('login() rolls back stored tokens and organizationCode if /auth/me fails', async () => {
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json(
          {
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'User context unavailable',
              details: [],
              trace_id: 'mock-trace-auth-me-500',
            },
          },
          { status: 500 }
        )
      )
    );

    await expect(
      useAuthStore.getState().login({
        organization_code: 'MEDCARE',
        username: 'admin@medcare.test',
        password: 'password123',
      })
    ).rejects.toThrow();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.currentUser).toBeNull();
    expect(state.organizationCode).toBeNull();
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(tokenStorage.getOrganizationCode()).toBeNull();
  });
});
