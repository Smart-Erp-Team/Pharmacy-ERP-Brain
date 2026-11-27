/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { branchesKeys } from '../features/branches/hooks/branchesKeys';
import { normalizeCurrentUser } from '../lib/api/normalizers';
import { routes } from '../routes/router';
import { useAuthStore } from '../stores/authStore';
import currentUserContextFixture from '@contracts/fixtures/current-user-context.json';
import type { BranchDto, CurrentUser } from '../types/api';

const MEDCARE_ORG_ID = '11111111-1111-4111-8111-111111111101';
const BRANCH_DT_ID = '11111111-2222-4111-8111-000000000001';
const BRANCH_NS_ID = '11111111-2222-4111-8111-000000000002';

const STAGE1_BRANCHES: BranchDto[] = [
  {
    branch_id: BRANCH_DT_ID,
    organization_id: MEDCARE_ORG_ID,
    branch_code: 'MED-DT',
    name: 'MedCare - Downtown Flagship',
    is_active: true,
    created_at: '2026-01-15T08:00:00+00:00',
    updated_at: '2026-11-25T10:00:00+00:00',
  },
  {
    branch_id: BRANCH_NS_ID,
    organization_id: MEDCARE_ORG_ID,
    branch_code: 'MED-NS',
    name: 'MedCare - Nasr City',
    is_active: true,
    created_at: '2026-01-16T08:00:00+00:00',
    updated_at: '2026-11-25T10:00:00+00:00',
  },
];

const baseAdminUser = normalizeCurrentUser(
  currentUserContextFixture,
  '@contracts/fixtures/current-user-context.json'
);

const buildUser = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  ...baseAdminUser,
  role: 'Admin',
  scopes: [
    'user:admin',
    'inventory:read',
    'inventory:write',
    'sales:read',
    'sales:write',
  ],
  runtime_mode: 'Cloud',
  ...overrides,
});

const activeQueryClients: QueryClient[] = [];

const renderRouter = (path: string) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
      },
    },
  });
  activeQueryClients.push(queryClient);

  queryClient.setQueryData<BranchDto[]>(
    branchesKeys.allList({ include_inactive: false }),
    STAGE1_BRANCHES
  );

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
    organizationCode: null,
    activeBranchId: null,
    isAuthenticated: false,
    isInitializing: false,
  });
});

afterEach(() => {
  for (const client of activeQueryClients) {
    client.clear();
  }
  activeQueryClients.length = 0;
  cleanup();
});

describe('Application router', () => {
  it('opens an organization screen for an Admin on Cloud and renders shell context', () => {
    useAuthStore.setState({
      currentUser: buildUser({ runtime_mode: 'Cloud' }),
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    renderRouter('/branches');

    expect(screen.getByRole('heading', { name: 'Branches' })).toBeDefined();
    expect(screen.getByText('admin@medcare.test')).toBeDefined();
    expect(screen.getByText('MEDCARE')).toBeDefined();
    expect(
      screen.getByRole('option', {
        name: 'MED-DT — MedCare - Downtown Flagship',
      })
    ).toBeDefined();
  });

  it('opens employees and user accounts for an Admin on the Cloud runtime', () => {
    useAuthStore.setState({
      currentUser: buildUser({ runtime_mode: 'Cloud' }),
      organizationCode: 'MEDCARE',
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

  it('opens /branches for Pharmacist and Cashier on both Cloud and BranchLocal while blocking /employees and /users with 403', () => {
    for (const role of ['Pharmacist', 'Cashier'] as const) {
      for (const runtimeMode of ['Cloud', 'BranchLocal'] as const) {
        useAuthStore.setState({
          currentUser: buildUser({
            username: `${role.toLowerCase()}@medcare.test`,
            role,
            branch_scope: 'ASSIGNED',
            branch_ids: [BRANCH_DT_ID],
            scopes:
              role === 'Pharmacist'
                ? ['inventory:read', 'inventory:write', 'sales:read']
                : ['inventory:read', 'sales:read', 'sales:write'],
            runtime_mode: runtimeMode,
          }),
          organizationCode: 'MEDCARE',
          activeBranchId: BRANCH_DT_ID,
          isAuthenticated: true,
          isInitializing: false,
        });

        renderRouter('/branches');
        expect(screen.getByRole('heading', { name: 'Branches' })).toBeDefined();
        cleanup();

        for (const adminOnlyPath of ['/employees', '/users']) {
          renderRouter(adminOnlyPath);
          expect(screen.getByTestId('role-gate-forbidden')).toBeDefined();
          cleanup();
        }
      }
    }
  });

  it('opens /branches, /employees, and /users in read-only mode for an Admin on BranchLocal', () => {
    useAuthStore.setState({
      currentUser: buildUser({
        runtime_mode: 'BranchLocal',
        branch_scope: 'ASSIGNED',
        branch_ids: [BRANCH_DT_ID],
      }),
      organizationCode: 'MEDCARE',
      activeBranchId: BRANCH_DT_ID,
      isAuthenticated: true,
      isInitializing: false,
    });

    renderRouter('/branches');
    expect(screen.getByRole('heading', { name: 'Branches' })).toBeDefined();
    expect(
      screen.getByText(
        'Branch changes and enrollment tokens require the Cloud deployment.'
      )
    ).toBeDefined();
    cleanup();

    renderRouter('/employees');
    expect(screen.getByRole('heading', { name: 'Employees' })).toBeDefined();
    expect(
      screen.getByText('Employee changes require the Cloud deployment.')
    ).toBeDefined();
    cleanup();

    renderRouter('/users');
    expect(
      screen.getByRole('heading', { name: 'User Accounts' })
    ).toBeDefined();
    expect(
      screen.getByText('User account changes require the Cloud deployment.')
    ).toBeDefined();
  });

  it('allows /branches for Admin on Cloud without user:admin while gating /employees and /users on user:admin', () => {
    useAuthStore.setState({
      currentUser: buildUser({
        role: 'Admin',
        runtime_mode: 'Cloud',
        scopes: ['inventory:read'],
      }),
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    renderRouter('/branches');
    expect(screen.getByRole('heading', { name: 'Branches' })).toBeDefined();
    cleanup();

    for (const path of ['/employees', '/users']) {
      renderRouter(path);
      expect(screen.getByTestId('role-gate-forbidden')).toBeDefined();
      expect(
        screen.getByText('Required permissions: user:admin')
      ).toBeDefined();
      cleanup();
    }
  });

  it('shows the 403 screen when inventory:read scope is missing on /inventory or /products', () => {
    useAuthStore.setState({
      currentUser: buildUser({
        username: 'cashier@medcare.test',
        role: 'Cashier',
        branch_scope: 'ASSIGNED',
        branch_ids: [BRANCH_DT_ID],
        scopes: ['sales:read', 'sales:write'],
        runtime_mode: 'BranchLocal',
      }),
      organizationCode: 'MEDCARE',
      activeBranchId: BRANCH_DT_ID,
      isAuthenticated: true,
      isInitializing: false,
    });

    for (const path of ['/inventory', '/products']) {
      renderRouter(path);
      expect(screen.getByTestId('role-gate-forbidden')).toBeDefined();
      expect(
        screen.getByText('Required permissions: inventory:read')
      ).toBeDefined();
      cleanup();
    }
  });

  it('opens /products when inventory:read scope is present for any role on either runtime', () => {
    useAuthStore.setState({
      currentUser: buildUser({
        username: 'cashier@medcare.test',
        role: 'Cashier',
        branch_scope: 'ASSIGNED',
        branch_ids: [BRANCH_DT_ID],
        scopes: ['inventory:read', 'sales:read', 'sales:write'],
        runtime_mode: 'BranchLocal',
      }),
      organizationCode: 'MEDCARE',
      activeBranchId: BRANCH_DT_ID,
      isAuthenticated: true,
      isInitializing: false,
    });

    renderRouter('/products');

    expect(screen.getByRole('heading', { name: 'Products' })).toBeDefined();
    expect(
      screen.getByText('MED-DT — MedCare - Downtown Flagship')
    ).toBeDefined();
  });

  it('opens the inventory screen for every role on both runtimes', () => {
    useAuthStore.setState({
      currentUser: buildUser({
        username: 'cashier@medcare.test',
        role: 'Cashier',
        branch_scope: 'ASSIGNED',
        branch_ids: [BRANCH_DT_ID],
        scopes: ['inventory:read', 'sales:read', 'sales:write'],
        runtime_mode: 'BranchLocal',
      }),
      organizationCode: 'MEDCARE',
      activeBranchId: BRANCH_DT_ID,
      isAuthenticated: true,
      isInitializing: false,
    });

    renderRouter('/inventory');

    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeDefined();
    expect(
      screen.getByText('MED-DT — MedCare - Downtown Flagship')
    ).toBeDefined();
  });

  it('opens /branch-enrollment publicly without authentication', () => {
    renderRouter('/branch-enrollment');

    expect(
      screen.getByRole('heading', { name: 'Branch Enrollment' })
    ).toBeDefined();
  });

  it('shows the 404 screen for an unknown route', () => {
    useAuthStore.setState({
      currentUser: buildUser(),
      organizationCode: 'MEDCARE',
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
      organizationCode: null,
      activeBranchId: null,
      isAuthenticated: false,
      isInitializing: false,
    });

    renderRouter('/inventory');

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeDefined();
  });
});
