/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import currentUserContextFixture from '@contracts/fixtures/current-user-context.json';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { useAuthStore } from '../../../stores/authStore';
import type { CurrentUserContext } from '../../../types/api';
import { BranchEnrollmentPage } from './BranchEnrollmentPage';

const mockUserContext = currentUserContextFixture as CurrentUserContext;

const buildUser = (
  overrides: Partial<CurrentUserContext> = {}
): CurrentUserContext => ({
  ...mockUserContext,
  ...overrides,
});

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

describe('BranchEnrollmentPage', () => {
  it('shows the sign-in link when no session exists', () => {
    renderWithProviders(
      <BranchEnrollmentPage homePath="/" loginPath="/login" />
    );

    expect(
      screen.getByRole('link', { name: 'Go to sign in' }).getAttribute('href')
    ).toBe('/login');
    expect(
      screen.queryByRole('link', { name: 'Back to workspace' })
    ).toBeNull();
    expect(screen.queryByText('Wrong deployment')).toBeNull();
  });

  it('shows the workspace link without a warning on BranchLocal', () => {
    useAuthStore.setState({
      currentUser: buildUser({ runtime: 'BranchLocal' }),
      isAuthenticated: true,
      isInitializing: false,
    });

    renderWithProviders(
      <BranchEnrollmentPage homePath="/" loginPath="/login" />
    );

    expect(
      screen
        .getByRole('link', { name: 'Back to workspace' })
        .getAttribute('href')
    ).toBe('/');
    expect(screen.queryByRole('link', { name: 'Go to sign in' })).toBeNull();
    expect(screen.queryByText('Wrong deployment')).toBeNull();
  });

  it('shows the wrong-deployment warning on Cloud runtime', () => {
    useAuthStore.setState({
      currentUser: buildUser({ runtime: 'Cloud' }),
      isAuthenticated: true,
      isInitializing: false,
    });

    renderWithProviders(
      <BranchEnrollmentPage homePath="/" loginPath="/login" />
    );

    expect(screen.getByText('Wrong deployment')).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Back to workspace' })
    ).toBeDefined();
  });
});
