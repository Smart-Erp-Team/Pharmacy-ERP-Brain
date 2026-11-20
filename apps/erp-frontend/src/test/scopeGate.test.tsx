/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ScopeGate } from '../routes/ScopeGate';
import { useAuthStore } from '../stores/authStore';
import type { CurrentUserContext } from '../types/api';

const buildUser = (
  overrides: Partial<CurrentUserContext> = {}
): CurrentUserContext => ({
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
});

beforeEach(() => {
  useAuthStore.setState({
    currentUser: null,
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
      currentUser: buildUser({ scopes: ['inventory:read'] }),
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
      currentUser: buildUser({ scopes: ['sales:read'] }),
      isAuthenticated: true,
      isInitializing: false,
    });

    render(
      <ScopeGate
        requiredScopes={['inventory:read']}
        fallback={<div>Custom Scope Forbidden</div>}
      >
        <div>Inventory Scoped Area</div>
      </ScopeGate>
    );

    expect(screen.queryByText('Inventory Scoped Area')).toBeNull();
    expect(screen.getByText('Custom Scope Forbidden')).toBeDefined();
  });
});
