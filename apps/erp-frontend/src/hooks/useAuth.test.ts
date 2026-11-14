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
import { renderHook, act, cleanup } from '@testing-library/react';
import { handlers } from '../mocks/handlers';
import { useAuthStore } from '../stores/authStore';
import { useAuth } from './useAuth';
import type { CurrentUserContext } from '../types/api';

const server = setupServer(...handlers);

const adminUser = {
  user: {
    user_id: '550e8400-e29b-41d4-a716-446655440000',
    employee_id: 'fa567890-1234-4def-9fbe-fa12345678de',
    username: 'admin.user',
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
} as CurrentUserContext;

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

describe('useAuth', () => {
  it('exposes the session context of the signed-in user', () => {
    useAuthStore.setState({
      currentUser: adminUser,
      isAuthenticated: true,
      isInitializing: false,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.currentUser?.user.username).toBe('admin.user');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.runtime).toBe('Cloud');
    expect(result.current.branchScope).toBe('ALL');
    expect(result.current.branchIds).toEqual([]);
    expect(result.current.roles).toEqual(['Admin']);
  });

  it('answers role questions from the session roles', () => {
    useAuthStore.setState({
      currentUser: adminUser,
      isAuthenticated: true,
      isInitializing: false,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.hasRole('Admin')).toBe(true);
    expect(result.current.hasRole('Cashier')).toBe(false);
    expect(result.current.hasAnyRole(['Admin', 'Cashier'])).toBe(true);
    expect(result.current.hasAnyRole(['Cashier'])).toBe(false);
  });

  it('answers capability questions from the authoritative scopes', () => {
    useAuthStore.setState({
      currentUser: adminUser,
      isAuthenticated: true,
      isInitializing: false,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.can('user:admin')).toBe(true);
    expect(result.current.can('inventory:read')).toBe(true);
    expect(result.current.can('sales:write')).toBe(false);
  });

  it('answers runtime and branch questions', () => {
    useAuthStore.setState({
      currentUser: adminUser,
      isAuthenticated: true,
      isInitializing: false,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.canAccessRuntime(['Cloud'])).toBe(true);
    expect(result.current.canAccessRuntime(['BranchLocal'])).toBe(false);
    expect(result.current.canAccessBranch('branch-9')).toBe(true);
  });

  it('exposes the logout action of the auth store', async () => {
    useAuthStore.setState({
      currentUser: adminUser,
      isAuthenticated: true,
      isInitializing: false,
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.logout();
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().activeBranchId).toBeNull();
  });

  it('updates activeBranchId only for permitted branches', () => {
    useAuthStore.setState({
      currentUser: {
        ...adminUser,
        branch_scope: 'ASSIGNED',
        branch_ids: ['branch-1', 'branch-2'],
      },
      activeBranchId: 'branch-1',
      isAuthenticated: true,
      isInitializing: false,
    });

    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.setActiveBranch('branch-2');
    });
    expect(result.current.activeBranchId).toBe('branch-2');

    act(() => {
      result.current.setActiveBranch('branch-999');
    });
    expect(result.current.activeBranchId).toBe('branch-2');

    act(() => {
      result.current.setActiveBranch(null);
    });
    expect(result.current.activeBranchId).toBe('branch-2');
  });
});
