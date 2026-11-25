/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ScopeGate } from '../routes/ScopeGate';
import { useAuthStore } from '../stores/authStore';
import type { CurrentUser } from '../types/api';

const buildUser = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  user_id: '11111111-4444-4111-8111-000000000001',
  employee_id: '11111111-3333-4111-8111-000000000001',
  organization_id: '11111111-1111-4111-8111-111111111101',
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
  cleanup();
});

describe('ScopeGate', () => {
  it('renders children when user scopes cover all required scopes', () => {
    useAuthStore.setState({
      currentUser: buildUser({ scopes: ['user:admin', 'inventory:read'] }),
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    render(
      <ScopeGate requiredScopes={['user:admin']}>
        <div>Admin Scoped Area</div>
      </ScopeGate>
    );

    expect(screen.getByText('Admin Scoped Area')).toBeDefined();
    expect(screen.queryByTestId('role-gate-forbidden')).toBeNull();
  });

  it('renders children when requiredScopes is empty', () => {
    useAuthStore.setState({
      currentUser: buildUser({ scopes: [] }),
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    render(
      <ScopeGate requiredScopes={[]}>
        <div>Open Area</div>
      </ScopeGate>
    );

    expect(screen.getByText('Open Area')).toBeDefined();
  });

  it('renders the 403 screen when a required scope is missing', () => {
    useAuthStore.setState({
      currentUser: buildUser({
        role: 'Pharmacist',
        scopes: ['inventory:read', 'inventory:write', 'sales:read'],
      }),
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    render(
      <ScopeGate requiredScopes={['user:admin']}>
        <div>Admin Scoped Area</div>
      </ScopeGate>
    );

    expect(screen.queryByText('Admin Scoped Area')).toBeNull();
    expect(screen.getByTestId('role-gate-forbidden')).toBeDefined();
    expect(screen.getByText('Required permissions: user:admin')).toBeDefined();
  });

  it('renders custom fallback when provided and scope is missing', () => {
    useAuthStore.setState({
      currentUser: buildUser({
        role: 'Cashier',
        scopes: ['inventory:read', 'sales:read', 'sales:write'],
      }),
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    render(
      <ScopeGate
        requiredScopes={['inventory:write']}
        fallback={<div>Custom Scope Forbidden</div>}
      >
        <div>Inventory Write Area</div>
      </ScopeGate>
    );

    expect(screen.queryByText('Inventory Write Area')).toBeNull();
    expect(screen.getByText('Custom Scope Forbidden')).toBeDefined();
  });
});
