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
import { tokenStorage } from '../lib/auth/tokenStorage';
import { useAuthStore } from '../stores/authStore';
import { useAuth } from './useAuth';
import type { CurrentUser } from '../types/api';

const server = setupServer(...handlers);

const MEDCARE_ORG_ID = '11111111-1111-4111-8111-111111111101';
const BRANCH_DT_ID = '11111111-2222-4111-8111-000000000001';
const BRANCH_NS_ID = '11111111-2222-4111-8111-000000000002';

const adminUser: CurrentUser = {
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
};

const pharmacistUser: CurrentUser = {
  user_id: '11111111-4444-4111-8111-000000000005',
  employee_id: '11111111-3333-4111-8111-000000000005',
  organization_id: MEDCARE_ORG_ID,
  username: 'sarah.pharm@medcare.test',
  role: 'Pharmacist',
  branch_scope: 'ASSIGNED',
  branch_ids: [BRANCH_DT_ID],
  scopes: ['inventory:read', 'inventory:write', 'sales:read'],
  runtime_mode: 'Cloud',
};

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  tokenStorage.clearTokens();
  cleanup();
});
afterAll(() => server.close());

beforeEach(() => {
  tokenStorage.clearTokens();
  useAuthStore.setState({
    currentUser: null,
    organizationCode: null,
    activeBranchId: null,
    isAuthenticated: false,
    isInitializing: false,
  });
});

describe('useAuth', () => {
  it('exposes the flat session context, single-role mapping, runtime_mode, and organizationCode', () => {
    useAuthStore.setState({
      currentUser: adminUser,
      organizationCode: 'MEDCARE',
      activeBranchId: null,
      isAuthenticated: true,
      isInitializing: false,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.currentUser?.username).toBe('admin@medcare.test');
    expect(result.current.organizationCode).toBe('MEDCARE');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.runtime).toBe('Cloud');
    expect(result.current.branchScope).toBe('ALL');
    expect(result.current.branchIds).toEqual([]);
    expect(result.current.roles).toEqual(['Admin']);
  });

  it('maps single role to roles: [role] and answers role checks accurately', () => {
    useAuthStore.setState({
      currentUser: pharmacistUser,
      organizationCode: 'MEDCARE',
      activeBranchId: BRANCH_DT_ID,
      isAuthenticated: true,
      isInitializing: false,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.roles).toEqual(['Pharmacist']);
    expect(result.current.hasRole('Pharmacist')).toBe(true);
    expect(result.current.hasRole('Admin')).toBe(false);
    expect(result.current.hasAnyRole(['Admin', 'Pharmacist'])).toBe(true);
    expect(result.current.hasAnyRole(['Cashier'])).toBe(false);
  });

  it('answers capability questions from the authoritative Stage 1 scopes', () => {
    useAuthStore.setState({
      currentUser: pharmacistUser,
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.can('inventory:read')).toBe(true);
    expect(result.current.can('inventory:write')).toBe(true);
    expect(result.current.can('sales:read')).toBe(true);
    expect(result.current.can('sales:write')).toBe(false);
    expect(result.current.can('user:admin')).toBe(false);
  });

  it('answers runtime and branch questions including BranchLocal scope downgrade', () => {
    useAuthStore.setState({
      currentUser: {
        ...adminUser,
        branch_scope: 'ASSIGNED',
        branch_ids: [BRANCH_DT_ID],
        runtime_mode: 'BranchLocal',
      },
      organizationCode: 'MEDCARE',
      activeBranchId: BRANCH_DT_ID,
      isAuthenticated: true,
      isInitializing: false,
    });

    const { result } = renderHook(() => useAuth());

    expect(result.current.runtime).toBe('BranchLocal');
    expect(result.current.branchScope).toBe('ASSIGNED');
    expect(result.current.branchIds).toEqual([BRANCH_DT_ID]);
    expect(result.current.canAccessRuntime(['BranchLocal'])).toBe(true);
    expect(result.current.canAccessRuntime(['Cloud'])).toBe(false);
    expect(result.current.canAccessBranch(BRANCH_DT_ID)).toBe(true);
    expect(result.current.canAccessBranch(BRANCH_NS_ID)).toBe(false);
  });

  it('exposes the logout action of the auth store and clears organizationCode', async () => {
    useAuthStore.setState({
      currentUser: adminUser,
      organizationCode: 'MEDCARE',
      activeBranchId: BRANCH_DT_ID,
      isAuthenticated: true,
      isInitializing: false,
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.logout();
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(useAuthStore.getState().organizationCode).toBeNull();
    expect(useAuthStore.getState().activeBranchId).toBeNull();
  });

  it('updates activeBranchId only for permitted branches', () => {
    useAuthStore.setState({
      currentUser: {
        ...adminUser,
        branch_scope: 'ASSIGNED',
        branch_ids: [BRANCH_DT_ID, BRANCH_NS_ID],
      },
      organizationCode: 'MEDCARE',
      activeBranchId: BRANCH_DT_ID,
      isAuthenticated: true,
      isInitializing: false,
    });

    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.setActiveBranch(BRANCH_NS_ID);
    });
    expect(result.current.activeBranchId).toBe(BRANCH_NS_ID);

    act(() => {
      result.current.setActiveBranch('11111111-2222-4111-8111-000000000099');
    });
    expect(result.current.activeBranchId).toBe(BRANCH_NS_ID);

    act(() => {
      result.current.setActiveBranch(null);
    });
    expect(result.current.activeBranchId).toBe(BRANCH_NS_ID);
  });
});
