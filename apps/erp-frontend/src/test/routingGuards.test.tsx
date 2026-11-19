/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../routes/ProtectedRoute';
import { RoleGate } from '../routes/RoleGate';
import { useAuthStore } from '../stores/authStore';
import currentUserContextFixture from '@contracts/fixtures/current-user-context.json';
import type { CurrentUserContext } from '../types/api';

const mockUserContext = currentUserContextFixture as CurrentUserContext;

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

describe('ProtectedRoute', () => {
  it('renders loading spinner while isInitializing is true', () => {
    useAuthStore.setState({ isInitializing: true });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <div>Secret Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('loading-spinner')).toBeDefined();
    expect(screen.queryByText('Secret Content')).toBeNull();
  });

  it('redirects to /login when unauthenticated', () => {
    useAuthStore.setState({ isAuthenticated: false, isInitializing: false });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Secret Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Page')).toBeDefined();
    expect(screen.queryByText('Secret Dashboard')).toBeNull();
  });

  it('renders protected content when authenticated', () => {
    useAuthStore.setState({
      currentUser: mockUserContext,
      isAuthenticated: true,
      isInitializing: false,
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Secret Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Secret Dashboard')).toBeDefined();
  });
});

describe('RoleGate', () => {
  it('renders children when user role is in allowedRoles', () => {
    useAuthStore.setState({
      currentUser: mockUserContext,
      isAuthenticated: true,
      isInitializing: false,
    });

    render(
      <RoleGate allowedRoles={['Pharmacist', 'Admin']}>
        <div>Pharmacist Area</div>
      </RoleGate>
    );

    expect(screen.getByText('Pharmacist Area')).toBeDefined();
    expect(screen.queryByTestId('role-gate-forbidden')).toBeNull();
  });

  it('renders 403 Forbidden fallback when user role is not in allowedRoles', () => {
    useAuthStore.setState({
      currentUser: mockUserContext,
      isAuthenticated: true,
      isInitializing: false,
    });

    render(
      <RoleGate allowedRoles={['Admin']}>
        <div>Admin Only Area</div>
      </RoleGate>
    );

    expect(screen.queryByText('Admin Only Area')).toBeNull();
    expect(screen.getByTestId('role-gate-forbidden')).toBeDefined();
    expect(screen.getByText(/403 Forbidden/i)).toBeDefined();
  });

  it('renders custom fallback when provided and user lacks permission', () => {
    useAuthStore.setState({
      currentUser: mockUserContext,
      isAuthenticated: true,
      isInitializing: false,
    });

    render(
      <RoleGate
        allowedRoles={['Admin']}
        fallback={<div>Custom Forbidden Notice</div>}
      >
        <div>Admin Only Area</div>
      </RoleGate>
    );

    expect(screen.queryByText('Admin Only Area')).toBeNull();
    expect(screen.getByText('Custom Forbidden Notice')).toBeDefined();
  });
});
