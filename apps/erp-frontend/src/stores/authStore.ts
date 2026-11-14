/**
 * Pharmacy ERP — Global Auth Store (Zustand v5)
 *
 * Single authority for managing client authentication state and user context.
 * Follows STRUCTURE.md: stores/authStore.ts.
 */

import { create } from 'zustand';
import { authService } from '../features/auth/api/authService';
import { tokenStorage } from '../lib/auth/tokenStorage';
import { notifySessionEnd } from '../lib/auth/sessionEvents';
import { queryClient } from '../lib/queryClient';
import type { CurrentUserContext, LoginRequest } from '../types/api';

export interface AuthState {
  currentUser: CurrentUserContext | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  resetSession: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  currentUser: null,
  isAuthenticated: false,
  isInitializing: true,

  login: async (credentials: LoginRequest) => {
    // 1. Authenticate with credentials and store tokens
    await authService.login(credentials);

    // 2. Fetch full user context for the session
    const userContext = await authService.getCurrentUser();

    set({
      currentUser: userContext,
      isAuthenticated: true,
      isInitializing: false,
    });
  },

  logout: async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.warn(
        'Logout API call failed, proceeding to clear local session',
        error
      );
    } finally {
      // Drops the tokens, the cached server data and the session flags, so the
      // next user never sees the previous user's data.
      get().resetSession();
      notifySessionEnd('logout');
    }
  },

  initialize: async () => {
    const token = tokenStorage.getAccessToken();

    if (!token) {
      set({
        currentUser: null,
        isAuthenticated: false,
        isInitializing: false,
      });
      return;
    }

    try {
      const userContext = await authService.getCurrentUser();
      set({
        currentUser: userContext,
        isAuthenticated: true,
        isInitializing: false,
      });
    } catch (error) {
      console.warn('Failed to restore auth session from storage', error);
      tokenStorage.clearTokens();
      set({
        currentUser: null,
        isAuthenticated: false,
        isInitializing: false,
      });
    }
  },

  /**
   * Ends the local session: clears the tokens, empties the TanStack Query cache
   * and resets the session flags. It performs no API call.
   */
  resetSession: () => {
    tokenStorage.clearTokens();
    queryClient.clear();
    set({
      currentUser: null,
      isAuthenticated: false,
      isInitializing: false,
    });
  },
}));
