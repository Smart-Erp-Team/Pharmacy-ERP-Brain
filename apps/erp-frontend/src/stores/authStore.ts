/**
 * Pharmacy ERP — Global Auth Store (Zustand v5)
 *
 * Single authority for managing client authentication state and user context.
 * Follows STRUCTURE.md: stores/authStore.ts.
 */

import { create } from 'zustand';
import { authService } from '../features/auth/api/authService';
import { isAllowedBranch } from '../lib/auth/permissions';
import { tokenStorage } from '../lib/auth/tokenStorage';
import { notifySessionEnd } from '../lib/auth/sessionEvents';
import { queryClient } from '../lib/queryClient';
import type { CurrentUser, LoginRequest } from '../types/api';

function resolveInitialBranchId(userContext: CurrentUser): string | null {
  if (userContext.branch_scope === 'ASSIGNED') {
    return userContext.branch_ids[0] ?? null;
  }
  return null;
}

export interface AuthState {
  currentUser: CurrentUser | null;
  organizationCode: string | null;
  activeBranchId: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  setActiveBranch: (branchId: string | null) => void;
  resetSession: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  currentUser: null,
  organizationCode: null,
  activeBranchId: null,
  isAuthenticated: false,
  isInitializing: true,

  login: async (credentials: LoginRequest) => {
    // 1. Authenticate with credentials and store tokens + organization code
    await authService.login(credentials);

    // 2. Fetch authoritative flat CurrentUserDto; roll back stored session if
    //    context hydration fails so storage and UI session state stay aligned.
    try {
      const userContext = await authService.getCurrentUser();

      set({
        currentUser: userContext,
        organizationCode: tokenStorage.getOrganizationCode(),
        activeBranchId: resolveInitialBranchId(userContext),
        isAuthenticated: true,
        isInitializing: false,
      });
    } catch (error: unknown) {
      get().resetSession();
      throw error;
    }
  },

  logout: async () => {
    try {
      await authService.logout();
    } catch (error: unknown) {
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
        organizationCode: null,
        activeBranchId: null,
        isAuthenticated: false,
        isInitializing: false,
      });
      return;
    }

    try {
      const userContext = await authService.getCurrentUser();
      set({
        currentUser: userContext,
        organizationCode: tokenStorage.getOrganizationCode(),
        activeBranchId: resolveInitialBranchId(userContext),
        isAuthenticated: true,
        isInitializing: false,
      });
    } catch (error: unknown) {
      console.warn('Failed to restore auth session from storage', error);
      tokenStorage.clearTokens();
      set({
        currentUser: null,
        organizationCode: null,
        activeBranchId: null,
        isAuthenticated: false,
        isInitializing: false,
      });
    }
  },

  setActiveBranch: (branchId: string | null) => {
    const { currentUser } = get();
    if (!currentUser) {
      return;
    }
    if (branchId === null) {
      if (currentUser.branch_scope === 'ALL') {
        set({ activeBranchId: null });
      }
      return;
    }
    if (isAllowedBranch(currentUser, branchId)) {
      set({ activeBranchId: branchId });
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
      organizationCode: null,
      activeBranchId: null,
      isAuthenticated: false,
      isInitializing: false,
    });
  },
}));
