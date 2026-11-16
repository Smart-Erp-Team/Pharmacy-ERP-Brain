/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from '../routes/router';
import { useAuthStore } from '../stores/authStore';
import currentUserContextFixture from '@contracts/fixtures/current-user-context.json';
import type { CurrentUserContext } from '../types/api';

const mockUserContext = currentUserContextFixture as CurrentUserContext;

const buildUser = (
  overrides: Partial<CurrentUserContext> = {}
): CurrentUserContext =>
  ({
    ...mockUserContext,
    roles: ['Admin'],
    scopes: ['user:admin', 'inventory:read'],
    runtime: 'Cloud',
    ...overrides,
  }) as CurrentUserContext;

const renderRouter = (path: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const memoryRouter = createMemoryRouter(routes, { initialEntries: [path] });

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={memoryRouter} />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  useAuthStore.setState({
    currentUser: null,
    isAuthenticated: false,
    isInitializing: false,
  });
});

afterEach(() => {
  cleanup();
});

describe('Application router', () => {
  it('opens an organization screen for an admin on the cloud runtime', () => {
    useAuthStore.setState({
      currentUser: buildUser({ runtime: 'Cloud' }),
      isAuthenticated: true,
      isInitializing: false,
    });

    renderRouter('/branches');

    expect(screen.getByRole('heading', { name: 'Branches' })).toBeDefined();
  });

  it('opens employees and user accounts for an admin on the cloud runtime', () => {
    useAuthStore.setState({
      currentUser: buildUser({ runtime: 'Cloud' }),
      isAuthenticated: true,
      isInitializing: false,
    });

    renderRouter('/employees');
    expect(screen.getByRole('heading', { name: 'Employees' })).toBeDefined();

    cleanup();
    renderRouter('/users');
    expect(
      screen.getByRole('heading', { name: 'User Accounts' })
    ).toBeDefined();
  });

  it('shows the 403 screen when the role does not allow the screen', () => {
    useAuthStore.setState({
      currentUser: buildUser({ roles: ['Pharmacist'], runtime: 'Cloud' }),
      isAuthenticated: true,
      isInitializing: false,
    });

    renderRouter('/branches');

    expect(screen.getByTestId('role-gate-forbidden')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Branches' })).toBeNull();
  });

  it('shows the 403 screen when the runtime does not own the screen', () => {
    useAuthStore.setState({
      currentUser: buildUser({ runtime: 'BranchLocal' }),
      isAuthenticated: true,
      isInitializing: false,
    });

    renderRouter('/branches');

    expect(screen.getByTestId('role-gate-forbidden')).toBeDefined();
  });

  it('shows the 403 screen when user:admin scope is missing on organization routes', () => {
    useAuthStore.setState({
      currentUser: buildUser({
        roles: ['Admin'],
        runtime: 'Cloud',
        scopes: ['inventory:read'],
      }),
      isAuthenticated: true,
      isInitializing: false,
    });

    for (const path of ['/branches', '/employees', '/users']) {
      renderRouter(path);
      expect(screen.getByTestId('role-gate-forbidden')).toBeDefined();
      expect(
        screen.getByText('Required permissions: user:admin')
      ).toBeDefined();
      cleanup();
    }
  });

  it('shows the 403 screen when inventory:read scope is missing on /inventory', () => {
    useAuthStore.setState({
      currentUser: buildUser({
        roles: ['Cashier'],
        scopes: ['sales:read'],
        runtime: 'BranchLocal',
      }),
      isAuthenticated: true,
      isInitializing: false,
    });

    renderRouter('/inventory');

    expect(screen.getByTestId('role-gate-forbidden')).toBeDefined();
    expect(
      screen.getByText('Required permissions: inventory:read')
    ).toBeDefined();
  });

  it('opens the inventory screen for every role on both runtimes', () => {
    useAuthStore.setState({
      currentUser: buildUser({
        roles: ['Cashier'],
        scopes: ['inventory:read'],
        runtime: 'BranchLocal',
      }),
      isAuthenticated: true,
      isInitializing: false,
    });

    renderRouter('/inventory');

    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeDefined();
  });

  it('shows the 404 screen for an unknown route', () => {
    useAuthStore.setState({
      currentUser: buildUser(),
      isAuthenticated: true,
      isInitializing: false,
    });

    renderRouter('/does-not-exist');

    expect(screen.getByTestId('not-found')).toBeDefined();
    expect(
      screen.getByRole('heading', { name: '404 Not Found' })
    ).toBeDefined();
  });

  it('sends an unauthenticated visitor to the login screen', () => {
    useAuthStore.setState({
      currentUser: null,
      isAuthenticated: false,
      isInitializing: false,
    });

    renderRouter('/inventory');

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeDefined();
  });
});
