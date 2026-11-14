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
import { handlers } from '../mocks/handlers';
import { useAuthStore } from '../stores/authStore';
import { AppShell } from './AppShell';
import type { CurrentUserContext } from '../types/api';

const server = setupServer(...handlers);

const buildUser = (
  overrides: Partial<CurrentUserContext> = {}
): CurrentUserContext =>
  ({
    user: {
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      employee_id: 'fa567890-1234-4def-9fbe-fa12345678de',
      username: 'operator.one',
      role: 'Admin',
      branch_scope: 'ALL',
      is_active: true,
    },
    organization_id: 'b1c2d3e4-2222-4b33-8c44-aabbccddeeff',
    organization_code: 'PHARMAPLUS',
    branch_scope: 'ALL',
    branch_ids: [],
    roles: ['Admin'],
    scopes: ['user:admin', 'inventory:read'],
    runtime: 'Cloud',
    ...overrides,
  }) as CurrentUserContext;

const renderShell = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

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

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

beforeEach(() => {
  useAuthStore.setState({
    currentUser: null,
    isAuthenticated: false,
    isInitializing: false,
  });
});

describe('AppShell', () => {
  it('shows the real signed-in user and the runtime', () => {
    useAuthStore.setState({
      currentUser: buildUser(),
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    expect(screen.getByText('operator.one')).toBeDefined();
    expect(screen.getAllByText('Cloud').length).toBeGreaterThan(0);
    expect(screen.getByText('PHARMAPLUS')).toBeDefined();
  });

  it('shows the organization screens to an admin on the cloud runtime', () => {
    useAuthStore.setState({
      currentUser: buildUser(),
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    expect(screen.getByRole('link', { name: 'Branches' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Employees' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'User Accounts' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Products' })).toBeDefined();
  });

  it('hides the organization screens from a non admin', () => {
    useAuthStore.setState({
      currentUser: buildUser({
        roles: ['Pharmacist'],
        scopes: ['inventory:read'],
        user: {
          user_id: '550e8400-e29b-41d4-a716-446655440000',
          employee_id: 'fa567890-1234-4def-9fbe-fa12345678de',
          username: 'operator.two',
          role: 'Pharmacist',
          branch_scope: 'ASSIGNED',
          is_active: true,
        },
      }),
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    expect(screen.queryByRole('link', { name: 'Branches' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'User Accounts' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Products' })).toBeDefined();
  });

  it('hides the branch only screens on the cloud runtime', () => {
    useAuthStore.setState({
      currentUser: buildUser(),
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    expect(
      screen.queryByRole('link', { name: 'Branch Enrollment' })
    ).toBeNull();
  });

  it('offers the branch only screens on the branch runtime', () => {
    useAuthStore.setState({
      currentUser: buildUser({ runtime: 'BranchLocal' }),
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    expect(
      screen.getByRole('link', { name: 'Branch Enrollment' })
    ).toBeDefined();
  });

  it('logs the operator out from the sidebar', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      currentUser: buildUser(),
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    await user.click(screen.getByRole('button', { name: 'Logout' }));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().currentUser).toBeNull();
  });

  it('lets an Admin switch the active branch from the Topbar selector', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      currentUser: buildUser(),
      activeBranchId: null,
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    const selector = (await screen.findByLabelText(
      'Active branch'
    )) as HTMLSelectElement;
    expect(selector.value).toBe('');

    await user.selectOptions(selector, 'e5f6a7b8-4444-4d55-9e66-ccddeeff0011');
    expect(useAuthStore.getState().activeBranchId).toBe(
      'e5f6a7b8-4444-4d55-9e66-ccddeeff0011'
    );
  });

  it('shows a fixed branch badge when a non-Admin has one assigned branch', () => {
    useAuthStore.setState({
      currentUser: buildUser({
        roles: ['Pharmacist'],
        branch_scope: 'ASSIGNED',
        branch_ids: ['d4e5f6a7-3333-4c44-9d55-bbccddeeffaa'],
      }),
      activeBranchId: 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa',
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    expect(screen.queryByLabelText('Active branch')).toBeNull();
    expect(screen.getByText('Branch d4e5f6a7')).toBeDefined();
  });

  it('lets a non-Admin with multiple assigned branches switch among them', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      currentUser: buildUser({
        roles: ['Pharmacist'],
        branch_scope: 'ASSIGNED',
        branch_ids: [
          'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa',
          'e5f6a7b8-4444-4d55-9e66-ccddeeff0011',
        ],
      }),
      activeBranchId: 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa',
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    const selector = screen.getByLabelText(
      'Active branch'
    ) as HTMLSelectElement;
    expect(selector.options).toHaveLength(2);

    await user.selectOptions(selector, 'e5f6a7b8-4444-4d55-9e66-ccddeeff0011');
    expect(useAuthStore.getState().activeBranchId).toBe(
      'e5f6a7b8-4444-4d55-9e66-ccddeeff0011'
    );
  });

  it('restricts an Admin with ASSIGNED scope to their assigned branch_ids', async () => {
    useAuthStore.setState({
      currentUser: buildUser({
        roles: ['Admin'],
        branch_scope: 'ASSIGNED',
        branch_ids: [
          'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa',
          'e5f6a7b8-4444-4d55-9e66-ccddeeff0011',
        ],
      }),
      activeBranchId: 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa',
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    const selector = (await screen.findByLabelText(
      'Active branch'
    )) as HTMLSelectElement;
    const optionValues = Array.from(selector.options).map((opt) => opt.value);

    expect(optionValues).toEqual([
      'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa',
      'e5f6a7b8-4444-4d55-9e66-ccddeeff0011',
    ]);
  });

  it('shows Branches unavailable when GET /branches fails for an ALL-scope Admin', async () => {
    server.use(
      http.get('*/api/v1/branches', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Boom' } },
          { status: 500 }
        )
      )
    );

    useAuthStore.setState({
      currentUser: buildUser(),
      activeBranchId: null,
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    expect(await screen.findByText('Branches unavailable')).toBeDefined();
    expect(
      within(screen.getByRole('banner')).queryByText('All branches')
    ).toBeNull();
    expect(screen.queryByLabelText('Active branch')).toBeNull();
  });

  it('clears a stale activeBranchId if it is no longer returned as active', async () => {
    useAuthStore.setState({
      currentUser: buildUser(),
      activeBranchId: '99999999-9999-4999-8999-999999999999',
      isAuthenticated: true,
      isInitializing: false,
    });

    renderShell();

    const selector = (await screen.findByLabelText(
      'Active branch'
    )) as HTMLSelectElement;
    expect(selector.value).toBe('');
    expect(useAuthStore.getState().activeBranchId).toBeNull();
  });
});
