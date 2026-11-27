import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import authTokenPairFixture from '@contracts/fixtures/auth-token-pair.json';
import currentUserContextFixture from '@contracts/fixtures/current-user-context.json';
import { authService } from '../features/auth/api/authService';
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
    initError: null,
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
    await authService.login({
      organization_code: 'MEDCARE',
      username: 'admin@medcare.test',
      password: 'password123',
    });

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

  it('login() preserves issued tokens and retries hydration after a temporary failure', async () => {
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
    expect(tokenStorage.getAccessToken()).toBeTruthy();
    expect(tokenStorage.getRefreshToken()).toBeTruthy();
    expect(tokenStorage.getOrganizationCode()).toBe('MEDCARE');
    expect(state.initError).toBeTruthy();
    server.resetHandlers();
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().currentUser?.role).toBe('Admin');
  });

  it('session-bound MSW auth returns Pharmacist from both /auth/login and /auth/me for sarah.pharm@medcare.test and Admin for admin@medcare.test', async () => {
    const pharmLogin = await authService.login({
      organization_code: 'MEDCARE',
      username: 'sarah.pharm@medcare.test',
      password: 'password123',
    });
    expect(pharmLogin.user.username).toBe('sarah.pharm@medcare.test');
    expect(pharmLogin.user.role).toBe('Pharmacist');

    await useAuthStore.getState().initialize();
    const pharmState = useAuthStore.getState();
    expect(pharmState.isAuthenticated).toBe(true);
    expect(pharmState.currentUser?.username).toBe('sarah.pharm@medcare.test');
    expect(pharmState.currentUser?.role).toBe('Pharmacist');
    expect(pharmState.activeBranchId).toBe(
      '11111111-2222-4111-8111-000000000001'
    );

    const adminLogin = await authService.login({
      organization_code: 'MEDCARE',
      username: 'admin@medcare.test',
      password: 'password123',
    });
    expect(adminLogin.user.username).toBe('admin@medcare.test');
    expect(adminLogin.user.role).toBe('Admin');

    await useAuthStore.getState().initialize();
    const adminState = useAuthStore.getState();
    expect(adminState.isAuthenticated).toBe(true);
    expect(adminState.currentUser?.username).toBe('admin@medcare.test');
    expect(adminState.currentUser?.role).toBe('Admin');
    expect(adminState.activeBranchId).toBeNull();
  });

  it('initialize() preserves tokens and sets initError on network error or 503, and clears tokens on 401 or 403', async () => {
    tokenStorage.setTokens('saved_access', 'saved_refresh');
    tokenStorage.setOrganizationCode('MEDCARE');

    server.use(http.get('*/api/v1/auth/me', () => HttpResponse.error()));
    await useAuthStore.getState().initialize();

    let state = useAuthStore.getState();
    expect(state.isInitializing).toBe(false);
    expect(state.isAuthenticated).toBe(false);
    expect(state.initError).toBeTruthy();
    expect(tokenStorage.getAccessToken()).toBe('saved_access');
    expect(tokenStorage.getRefreshToken()).toBe('saved_refresh');

    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json(
          {
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Gateway 503 outage',
              details: [],
              trace_id: 'trace-me-503',
            },
          },
          { status: 503 }
        )
      )
    );
    await useAuthStore.getState().initialize();

    state = useAuthStore.getState();
    expect(state.isInitializing).toBe(false);
    expect(state.isAuthenticated).toBe(false);
    expect(state.initError).toBe('Gateway 503 outage');
    expect(tokenStorage.getAccessToken()).toBe('saved_access');
    expect(tokenStorage.getRefreshToken()).toBe('saved_refresh');

    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Account disabled',
              details: [],
              trace_id: 'trace-me-403',
            },
          },
          { status: 403 }
        )
      )
    );
    await useAuthStore.getState().initialize();

    state = useAuthStore.getState();
    expect(state.isInitializing).toBe(false);
    expect(state.isAuthenticated).toBe(false);
    expect(state.initError).toBeNull();
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();

    tokenStorage.setTokens('expired_access');
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json(
          {
            error: {
              code: 'UNAUTHORIZED',
              message: 'Invalid token',
              details: [],
              trace_id: 'trace-me-401',
            },
          },
          { status: 401 }
        )
      )
    );
    await useAuthStore.getState().initialize();

    state = useAuthStore.getState();
    expect(state.isInitializing).toBe(false);
    expect(state.isAuthenticated).toBe(false);
    expect(state.initError).toBeNull();
    expect(tokenStorage.getAccessToken()).toBeNull();
  });

  it('syncCurrentUser() updates currentUser and reconciles activeBranchId for ASSIGNED and ALL scopes', () => {
    const branchA = '11111111-2222-4111-8111-000000000001';
    const branchB = '11111111-2222-4111-8111-000000000002';
    const pharmacist = normalizeCurrentUser(authTokenPairFixture.user);
    const admin = normalizeCurrentUser(currentUserContextFixture);

    useAuthStore.setState({
      currentUser: admin,
      activeBranchId: branchB,
      isAuthenticated: true,
      isInitializing: false,
      initError: null,
    });

    // ASSIGNED user without branchB reconciles activeBranchId to branchA (branch_ids[0])
    useAuthStore.getState().syncCurrentUser({
      ...pharmacist,
      branch_scope: 'ASSIGNED',
      branch_ids: [branchA],
    });
    expect(useAuthStore.getState().currentUser?.role).toBe('Pharmacist');
    expect(useAuthStore.getState().activeBranchId).toBe(branchA);

    // ASSIGNED user where activeBranchId IS in branch_ids preserves activeBranchId
    useAuthStore.setState({ activeBranchId: branchB });
    useAuthStore.getState().syncCurrentUser({
      ...pharmacist,
      branch_scope: 'ASSIGNED',
      branch_ids: [branchA, branchB],
    });
    expect(useAuthStore.getState().activeBranchId).toBe(branchB);

    // ALL scope user keeps current activeBranchId as-is
    useAuthStore.getState().syncCurrentUser(admin);
    expect(useAuthStore.getState().currentUser?.role).toBe('Admin');
    expect(useAuthStore.getState().activeBranchId).toBe(branchB);
  });
});
