/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RuntimeGate } from '../routes/RuntimeGate';
import { useAuthStore } from '../stores/authStore';
import { normalizeCurrentUser } from '../lib/api/normalizers';
import currentUserContextFixture from '@contracts/fixtures/current-user-context.json';
import type { CurrentUser } from '../types/api';

const baseUser = normalizeCurrentUser(
  currentUserContextFixture,
  '@contracts/fixtures/current-user-context.json'
);

const buildUser = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  ...baseUser,
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

describe('RuntimeGate', () => {
  it('renders the children when the current runtime owns the route', () => {
    useAuthStore.setState({
      currentUser: buildUser({ runtime_mode: 'Cloud' }),
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    render(
      <RuntimeGate allowedRuntimes={['Cloud']}>
        <div>Cloud Only Area</div>
      </RuntimeGate>
    );

    expect(screen.getByText('Cloud Only Area')).toBeDefined();
  });

  it('renders the 403 screen when the runtime does not own the route', () => {
    useAuthStore.setState({
      currentUser: buildUser({
        runtime_mode: 'BranchLocal',
        branch_scope: 'ASSIGNED',
        branch_ids: ['11111111-2222-4111-8111-000000000001'],
      }),
      organizationCode: 'MEDCARE',
      isAuthenticated: true,
      isInitializing: false,
    });

    render(
      <RuntimeGate allowedRuntimes={['Cloud']}>
        <div>Cloud Only Area</div>
      </RuntimeGate>
    );

    expect(screen.queryByText('Cloud Only Area')).toBeNull();
    expect(screen.getByTestId('role-gate-forbidden')).toBeDefined();
  });
});
