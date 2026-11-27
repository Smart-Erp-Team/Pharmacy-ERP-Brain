/**
 * Pharmacy ERP — Global Auth Store (Zustand v5)
 *
 * Single authority for managing client authentication state and user context.
 * Follows STRUCTURE.md: stores/authStore.ts.
 */

import axios from 'axios';
import { create } from 'zustand';
import { authService } from '../features/auth/api/authService';
import { ApiClientError } from '../lib/api/client';
import { isAllowedBranch } from '../lib/auth/permissions';
import { tokenStorage } from '../lib/auth/tokenStorage';
import { notifySessionEnd } from '../lib/auth/sessionEvents';
import { queryClient } from '../lib/queryClient';
import type { CurrentUser, LoginRequest } from '../types/api';

const DEFAULT_SESSION_INIT_ERROR =
  'Unable to reach the server to restore your session.';

function resolveInitialBranchId(userContext: CurrentUser): string | null {
  if (userContext.branch_scope === 'ASSIGNED') {
    return userContext.branch_ids[0] ?? null;
  }
  return null;
}

function reconcileActiveBranchId(
  userContext: CurrentUser,
  currentActiveBranchId: string | null
): string | null {
  if (userContext.branch_scope === 'ASSIGNED') {
    if (
      currentActiveBranchId !== null &&
      userContext.branch_ids.includes(currentActiveBranchId)
    ) {
      return currentActiveBranchId;
    }
    return userContext.branch_ids[0] ?? null;
  }
  return currentActiveBranchId;
}

function isDefinitiveAuthRejection(error: unknown): boolean {
  if (error instanceof ApiClientError) {
    return error.status === 401 || error.status === 403;
  }
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return status === 401 || status === 403;
  }
  return false;
}

export interface AuthState {
  currentUser: CurrentUser | null;
  organizationCode: string | null;
  activeBranchId: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  initError: string | null;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  syncCurrentUser: (user: CurrentUser) => void;
  setActiveBranch: (branchId: string | null) => void;
  resetSession: () => void;
}

async function hydrateSession(set: (state: Partial<AuthState>) => void) {
  try {
    const user = await authService.getCurrentUser();
    set({
      currentUser: user,
      organizationCode: tokenStorage.getOrganizationCode(),
      activeBranchId: resolveInitialBranchId(user),
      isAuthenticated: true,
      isInitializing: false,
      initError: null,
    });
  } catch (error) {
    const rejected = isDefinitiveAuthRejection(error);
    if (rejected) {
      tokenStorage.clearTokens();
      queryClient.clear();
    }
    set({
      currentUser: null,
      organizationCode: null,
      activeBranchId: null,
      isAuthenticated: false,
      isInitializing: false,
      initError: rejected
        ? null
        : error instanceof Error && error.message.trim()
          ? error.message
          : DEFAULT_SESSION_INIT_ERROR,
    });
    throw error;
  }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  currentUser: null,
  organizationCode: null,
  activeBranchId: null,
  isAuthenticated: false,
  isInitializing: true,
  initError: null,

  login: async (credentials: LoginRequest) => {
    // 1. Authenticate with credentials and store tokens + organization code
    await authService.login(credentials);

    await hydrateSession(set);
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
    set({ isInitializing: true, initError: null });

    const token = tokenStorage.getAccessToken();

    if (!token) {
      set({
        currentUser: null,
        organizationCode: null,
        activeBranchId: null,
        isAuthenticated: false,
        isInitializing: false,
        initError: null,
      });
      return;
    }

    try {
      await hydrateSession(set);
    } catch (error) {
      console.warn('Failed to restore auth session from storage', error);
    }
  },

  syncCurrentUser: (user: CurrentUser) => {
    if (!get().isAuthenticated) return;
    set((state) => ({
      currentUser: user,
      activeBranchId: reconcileActiveBranchId(user, state.activeBranchId),
      isAuthenticated: true,
      initError: null,
    }));
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
      initError: null,
    });
  },
}));
