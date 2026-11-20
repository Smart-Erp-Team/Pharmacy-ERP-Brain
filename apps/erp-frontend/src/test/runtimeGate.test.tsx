/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RuntimeGate } from '../routes/RuntimeGate';
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

describe('RuntimeGate', () => {
  it('renders the children when the current runtime owns the route', () => {
    useAuthStore.setState({
      currentUser: buildUser({ runtime: 'Cloud' }),
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
      currentUser: buildUser({ runtime: 'BranchLocal' }),
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
