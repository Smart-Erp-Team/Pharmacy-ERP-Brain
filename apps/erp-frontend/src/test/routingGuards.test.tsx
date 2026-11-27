/** @vitest-environment jsdom */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { setupServer } from 'msw/node';
import { ProtectedRoute } from '../routes/ProtectedRoute';
import { RoleGate } from '../routes/RoleGate';
import { handlers, resetMockAuth } from '../mocks/handlers';
import { tokenStorage } from '../lib/auth/tokenStorage';
import { useAuthStore } from '../stores/authStore';
import { normalizeCurrentUser } from '../lib/api/normalizers';
import currentUserContextFixture from '@contracts/fixtures/current-user-context.json';
import type { CurrentUser } from '../types/api';

const server = setupServer(...handlers);

const normalizedAdminFixture = normalizeCurrentUser(
  currentUserContextFixture,
  '@contracts/fixtures/current-user-context.json'
);

const mockPharmacistUser: CurrentUser = {
  ...normalizedAdminFixture,
  user_id: '11111111-4444-4111-8111-000000000005',
  employee_id: '11111111-3333-4111-8111-000000000005',
  username: 'sarah.pharm@medcare.test',
  role: 'Pharmacist',
  branch_scope: 'ASSIGNED',
  branch_ids: ['11111111-2222-4111-8111-000000000001'],
  scopes: ['inventory:read', 'inventory:write', 'sales:read'],
};

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
    isInitializing: false,
    initError: null,
  });
});

afterEach(() => {
  cleanup();
});

describe('ProtectedRoute', () => {
  it('renders loading spinner while isInitializing is true', () => {
    useAuthStore.setState({ isInitializing: true });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Secret Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('loading-spinner')).toBeDefined();
    expect(screen.queryByText('Secret Content')).toBeNull();
  });

  it('redirects to /login when unauthenticated', () => {
    useAuthStore.setState({ isAuthenticated: false, isInitializing: false });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Secret Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Page')).toBeDefined();
    expect(screen.queryByText('Secret Dashboard')).toBeNull();
  });

  it('renders protected content when authenticated', () => {
    useAuthStore.setState({
      currentUser: normalizedAdminFixture,
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Secret Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Secret Dashboard')).toBeDefined();
  });

  it('renders session-init-error recovery screen on initError and restores session when Retry is clicked', async () => {
    const user = userEvent.setup();
    tokenStorage.setTokens('preserved_access_token', 'preserved_refresh_token');
    tokenStorage.setOrganizationCode('MEDCARE');
    useAuthStore.setState({
      isAuthenticated: false,
      isInitializing: false,
      initError: 'Gateway 503 temporarily unavailable',
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Secret Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('session-init-error')).toBeDefined();
    expect(
      screen.getByText('Gateway 503 temporarily unavailable')
    ).toBeDefined();
    expect(screen.queryByText('Login Page')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByText('Secret Dashboard')).toBeDefined();
    });
    expect(useAuthStore.getState().initError).toBeNull();
  });

  it('clears session and redirects to /login when Sign in again is clicked on session-init-error screen', async () => {
    const user = userEvent.setup();
    tokenStorage.setTokens('preserved_access_token', 'preserved_refresh_token');
    useAuthStore.setState({
      isAuthenticated: false,
      isInitializing: false,
      initError: 'Network error while restoring session',
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Secret Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('session-init-error')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Sign in again' }));

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeDefined();
    });
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(useAuthStore.getState().initError).toBeNull();
  });
});

describe('RoleGate', () => {
  it('renders children when user role is in allowedRoles', () => {
    useAuthStore.setState({
      currentUser: mockPharmacistUser,
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    render(
      <RoleGate allowedRoles={['Pharmacist', 'Admin']}>
        <div>Pharmacist Area</div>
      </RoleGate>
    );

    expect(screen.getByText('Pharmacist Area')).toBeDefined();
    expect(screen.queryByTestId('role-gate-forbidden')).toBeNull();
  });

  it('renders 403 Forbidden fallback when user role is not in allowedRoles', () => {
    useAuthStore.setState({
      currentUser: mockPharmacistUser,
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    render(
      <RoleGate allowedRoles={['Admin']}>
        <div>Admin Only Area</div>
      </RoleGate>
    );

    expect(screen.queryByText('Admin Only Area')).toBeNull();
    expect(screen.getByTestId('role-gate-forbidden')).toBeDefined();
    expect(screen.getByText(/403 Forbidden/i)).toBeDefined();
  });

  it('renders custom fallback when provided and user lacks permission', () => {
    useAuthStore.setState({
      currentUser: mockPharmacistUser,
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    render(
      <RoleGate
        allowedRoles={['Admin']}
        fallback={<div>Custom Forbidden Notice</div>}
      >
        <div>Admin Only Area</div>
      </RoleGate>
    );

    expect(screen.queryByText('Admin Only Area')).toBeNull();
    expect(screen.getByText('Custom Forbidden Notice')).toBeDefined();
  });
});
