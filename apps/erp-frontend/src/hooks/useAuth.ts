/**
 * Pharmacy ERP — Auth Hook
 *
 * The single entry point components use to read the session and to ask whether
 * something is allowed. Components never read the Zustand store directly and
 * never compare role strings themselves (skill `routing-auth`).
 */

import { useMemo } from 'react';
import { useAuthStore } from '../stores/authStore';
import {
  hasAnyRole,
  hasPermission,
  hasRole,
  isAllowedBranch,
  isAllowedRuntime,
} from '../lib/auth/permissions';
import type {
  BranchScope,
  CurrentUserContext,
  PermissionScope,
  Role,
  RuntimeMode,
} from '../types/api';

export interface UseAuthResult {
  currentUser: CurrentUserContext | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  runtime: RuntimeMode | null;
  branchScope: BranchScope | null;
  branchIds: readonly string[];
  roles: readonly Role[];
  scopes: readonly PermissionScope[];
  logout: () => Promise<void>;
  hasRole: (role: Role) => boolean;
  hasAnyRole: (requiredRoles: readonly Role[]) => boolean;
  can: (scope: PermissionScope) => boolean;
  canAccessRuntime: (allowedRuntimes: readonly RuntimeMode[]) => boolean;
  canAccessBranch: (branchId: string) => boolean;
}

export function useAuth(): UseAuthResult {
  const currentUser = useAuthStore((state) => state.currentUser);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const logout = useAuthStore((state) => state.logout);

  return useMemo<UseAuthResult>(() => {
    const roles = currentUser?.roles ?? [];
    const scopes = currentUser?.scopes ?? [];
    const runtime = currentUser?.runtime ?? null;
    const branchScope = currentUser?.branch_scope ?? null;
    const branchIds = currentUser?.branch_ids ?? [];

    return {
      currentUser,
      isAuthenticated,
      isInitializing,
      runtime,
      branchScope,
      branchIds,
      roles,
      scopes,
      logout,
      hasRole: (role: Role) => hasRole(roles, role),
      hasAnyRole: (requiredRoles: readonly Role[]) =>
        hasAnyRole(roles, requiredRoles),
      can: (scope: PermissionScope) => hasPermission(scopes, scope),
      canAccessRuntime: (allowedRuntimes: readonly RuntimeMode[]) =>
        isAllowedRuntime(runtime, allowedRuntimes),
      canAccessBranch: (branchId: string) =>
        isAllowedBranch(currentUser, branchId),
    };
  }, [currentUser, isAuthenticated, isInitializing, logout]);
}
