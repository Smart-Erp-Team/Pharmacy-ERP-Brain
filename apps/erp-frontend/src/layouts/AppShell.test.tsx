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
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const renderShell = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>Overview Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

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
});
