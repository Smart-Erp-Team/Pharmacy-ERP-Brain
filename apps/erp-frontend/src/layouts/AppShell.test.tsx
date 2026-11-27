/** @vitest-environment jsdom */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { branchesKeys } from '../features/branches/hooks/branchesKeys';
import { handlers } from '../mocks/handlers';
import { useAuthStore } from '../stores/authStore';
import { AppShell } from './AppShell';
import type { BranchDto, CurrentUser } from '../types/api';

const server = setupServer(...handlers);

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

const buildUser = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  user_id: '11111111-4444-4111-8111-000000000001',
  employee_id: '11111111-3333-4111-8111-000000000001',
  organization_id: MEDCARE_ORG_ID,
  username: 'admin@medcare.test',
  role: 'Admin',
  branch_scope: 'ALL',
  branch_ids: [],
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

interface RenderShellOptions {
  seedBranches?: BranchDto[];
}

const activeQueryClients: QueryClient[] = [];

const renderShell = ({
  seedBranches = STAGE1_BRANCHES,
}: RenderShellOptions = {}) => {
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

  if (seedBranches.length > 0) {
    queryClient.setQueryData<BranchDto[]>(
      branchesKeys.allList({ include_inactive: false }),
      seedBranches
    );
  }

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<div>Overview Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

function getBranchSelect(): HTMLSelectElement {
  const element = screen.getByLabelText('Active branch');
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(
      'Expected Active branch control to be an HTMLSelectElement'
    );
  }
  return element;
}

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  for (const client of activeQueryClients) {
    client.clear();
  }
  activeQueryClients.length = 0;
  cleanup();
});
afterAll(() => server.close());

beforeEach(() => {
  useAuthStore.setState({
    currentUser: null,
    organizationCode: null,
    activeBranchId: null,
    isAuthenticated: false,
    isInitializing: false,
  });
});

describe('AppShell', () => {
  it('shows the flat username in Sidebar and organizationCode + runtime_mode in Topbar', () => {
    useAuthStore.setState({
      currentUser: buildUser(),
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    expect(screen.getByText('admin@medcare.test')).toBeDefined();
    expect(screen.getAllByText('Cloud').length).toBeGreaterThan(0);
    expect(screen.getByText('MEDCARE')).toBeDefined();
  });

  it('shows the organization and enrollment screens to an Admin on the Cloud runtime', () => {
    useAuthStore.setState({
      currentUser: buildUser(),
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    expect(screen.getByRole('link', { name: 'Branches' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Employees' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'User Accounts' })).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Branch Enrollment' })
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Products' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Inventory' })).toBeDefined();
  });

  it('shows Branches and Branch Enrollment to Pharmacist on Cloud while hiding Employees and User Accounts', () => {
    useAuthStore.setState({
      currentUser: buildUser({
        user_id: '11111111-4444-4111-8111-000000000005',
        employee_id: '11111111-3333-4111-8111-000000000005',
        username: 'sarah.pharm@medcare.test',
        role: 'Pharmacist',
        branch_scope: 'ASSIGNED',
        branch_ids: [BRANCH_DT_ID],
        scopes: ['inventory:read', 'inventory:write', 'sales:read'],
      }),
      organizationCode: 'MEDCARE',
      activeBranchId: BRANCH_DT_ID,
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    expect(screen.getByText('sarah.pharm@medcare.test')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Branches' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Employees' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'User Accounts' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Branch Enrollment' })
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Products' })).toBeDefined();
  });

  it('hides Cloud-only Branch Enrollment on BranchLocal while keeping readable organization screens for Admin', () => {
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

    renderShell();

    expect(
      screen.queryByRole('link', { name: 'Branch Enrollment' })
    ).toBeNull();
    expect(screen.getByRole('link', { name: 'Branches' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Employees' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'User Accounts' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Products' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Inventory' })).toBeDefined();
  });

  it('logs the operator out from the sidebar and clears organizationCode', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      currentUser: buildUser(),
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    await user.click(screen.getByRole('button', { name: 'Logout' }));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(useAuthStore.getState().organizationCode).toBeNull();
  });

  it('displays branch_code — name and lets an ALL-scope Admin switch branches from Topbar', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      currentUser: buildUser(),
      organizationCode: 'MEDCARE',
      activeBranchId: null,
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    const selector = getBranchSelect();
    expect(selector.value).toBe('');
    expect(Array.from(selector.options).map((option) => option.text)).toEqual([
      'All branches',
      'MED-DT — MedCare - Downtown Flagship',
      'MED-NS — MedCare - Nasr City',
    ]);

    await user.selectOptions(selector, BRANCH_NS_ID);
    expect(useAuthStore.getState().activeBranchId).toBe(BRANCH_NS_ID);
  });

  it('shows branch_code — name in a fixed branch badge for single-branch Pharmacist and Cashier', () => {
    for (const role of ['Pharmacist', 'Cashier'] as const) {
      useAuthStore.setState({
        currentUser: buildUser({
          username:
            role === 'Pharmacist'
              ? 'sarah.pharm@medcare.test'
              : 'cashier@medcare.test',
          role,
          branch_scope: 'ASSIGNED',
          branch_ids: [BRANCH_DT_ID],
          scopes:
            role === 'Pharmacist'
              ? ['inventory:read', 'inventory:write', 'sales:read']
              : ['inventory:read', 'sales:read', 'sales:write'],
        }),
        organizationCode: 'MEDCARE',
        activeBranchId: BRANCH_DT_ID,
        isAuthenticated: true,
        isInitializing: false,
      });

      renderShell();

      expect(screen.queryByLabelText('Active branch')).toBeNull();
      expect(
        screen.getByText('MED-DT — MedCare - Downtown Flagship')
      ).toBeDefined();

      cleanup();
    }
  });

  it('lets a multi-branch Pharmacist or Cashier switch among assigned branches with branch_code — name labels', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      currentUser: buildUser({
        username: 'cashier@medcare.test',
        role: 'Cashier',
        branch_scope: 'ASSIGNED',
        branch_ids: [BRANCH_DT_ID, BRANCH_NS_ID],
        scopes: ['inventory:read', 'sales:read', 'sales:write'],
      }),
      organizationCode: 'MEDCARE',
      activeBranchId: BRANCH_DT_ID,
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    const selector = getBranchSelect();
    expect(Array.from(selector.options).map((option) => option.text)).toEqual([
      'MED-DT — MedCare - Downtown Flagship',
      'MED-NS — MedCare - Nasr City',
    ]);

    await user.selectOptions(selector, BRANCH_NS_ID);
    expect(useAuthStore.getState().activeBranchId).toBe(BRANCH_NS_ID);
  });

  it('restricts an Admin with ASSIGNED scope to their assigned branch_ids', () => {
    useAuthStore.setState({
      currentUser: buildUser({
        role: 'Admin',
        branch_scope: 'ASSIGNED',
        branch_ids: [BRANCH_DT_ID, BRANCH_NS_ID],
      }),
      organizationCode: 'MEDCARE',
      activeBranchId: BRANCH_DT_ID,
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    const selector = getBranchSelect();
    expect(Array.from(selector.options).map((option) => option.value)).toEqual([
      BRANCH_DT_ID,
      BRANCH_NS_ID,
    ]);
  });

  it('shows Branches unavailable when GET /branches fails for an ALL-scope Admin', async () => {
    server.use(
      http.get('*/api/v1/branches', () =>
        HttpResponse.json(
          {
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Boom',
              trace_id: 'trace-branches-500',
            },
          },
          { status: 500 }
        )
      )
    );

    useAuthStore.setState({
      currentUser: buildUser(),
      organizationCode: 'MEDCARE',
      activeBranchId: null,
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell({ seedBranches: [] });

    expect(await screen.findByText('Branches unavailable')).toBeDefined();
    expect(
      within(screen.getByRole('banner')).queryByText('All branches')
    ).toBeNull();
    expect(screen.queryByLabelText('Active branch')).toBeNull();
  });

  it('clears a stale activeBranchId if it is no longer returned as active', () => {
    useAuthStore.setState({
      currentUser: buildUser(),
      organizationCode: 'MEDCARE',
      activeBranchId: '99999999-9999-4999-8999-999999999999',
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    const selector = getBranchSelect();
    expect(selector.value).toBe('');
    expect(useAuthStore.getState().activeBranchId).toBeNull();
  });
});
