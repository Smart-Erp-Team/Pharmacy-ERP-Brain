/**
 * Pharmacy ERP — Roles, Scopes, Runtime and Branch Permissions (Stage 1)
 *
 * The single place where every permission decision is made (skill `routing-auth`).
 * Two authoritative sources come from the flat `CurrentUserDto` (`/auth/me`):
 * - `role`   → who the user is (Admin | Pharmacist | Cashier)
 * - `scopes` → what the user may do (the Stage 1 closed 5-scope PermissionScope vocabulary)
 * Plus the deployment context: `runtime_mode` (Cloud | BranchLocal) and branch scope.
 */

import { ERP_RUNTIME_MODES, USER_ROLES, isUserRole } from '../api/normalizers';
import type {
  BranchScope,
  CurrentUser,
  ErpRuntimeMode,
  PermissionScope,
  UserRole,
} from '../../types/api';

export const VALID_ROLES: readonly UserRole[] = USER_ROLES;

export const VALID_RUNTIMES: readonly ErpRuntimeMode[] = ERP_RUNTIME_MODES;

/**
 * Exact emitted JWT `scopes[]` per role (Stage 1 closed 5-scope vocabulary,
 * contracts/FRONTEND.md §3.3).
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly PermissionScope[]> = {
  Admin: [
    'user:admin',
    'inventory:read',
    'inventory:write',
    'sales:read',
    'sales:write',
  ],
  Pharmacist: ['inventory:read', 'inventory:write', 'sales:read'],
  Cashier: ['inventory:read', 'sales:read', 'sales:write'],
} as const;

export function isValidRole(role: string): role is UserRole {
  return isUserRole(role);
}

export function hasRole(
  userRoles: readonly UserRole[] | undefined,
  requiredRole: UserRole
): boolean {
  if (!userRoles || userRoles.length === 0) return false;
  return userRoles.includes(requiredRole);
}

export function hasAnyRole(
  userRoles: readonly UserRole[] | undefined,
  requiredRoles: readonly UserRole[]
): boolean {
  if (!userRoles || userRoles.length === 0) return false;
  return requiredRoles.some((role) => userRoles.includes(role));
}

export function hasPermission(
  userScopes: readonly PermissionScope[] | undefined,
  requiredScope: PermissionScope
): boolean {
  if (!userScopes || userScopes.length === 0) return false;
  return userScopes.includes(requiredScope);
}

export function hasAllPermissions(
  userScopes: readonly PermissionScope[] | undefined,
  requiredScopes: readonly PermissionScope[]
): boolean {
  // Nothing is required: the check passes, even without any scope in the session.
  if (requiredScopes.length === 0) {
    return true;
  }

  if (!userScopes || userScopes.length === 0) return false;
  return requiredScopes.every((scope) => userScopes.includes(scope));
}

/**
 * Runtime gate (contracts/FRONTEND.md §2): a route unavailable in the active
 * `ERP_RUNTIME_MODE` returns `404 NOT_FOUND` on the server, so the UI must not
 * offer it.
 */
export function isAllowedRuntime(
  runtime: ErpRuntimeMode | null | undefined,
  allowedRuntimes: readonly ErpRuntimeMode[]
): boolean {
  if (!runtime) return false;
  return allowedRuntimes.includes(runtime);
}

/**
 * Branch gate: `branch_scope = ALL` covers every branch of the organization,
 * `ASSIGNED` covers only the branches listed in `branch_ids`.
 */
export function isAllowedBranch(
  currentUser: CurrentUser | null | undefined,
  branchId: string
): boolean {
  if (!currentUser) return false;
  if (currentUser.branch_scope === 'ALL') return true;
  return currentUser.branch_ids.includes(branchId);
}

/**
 * Human readable branch scope. Never invents a value: an unknown scope is
 * reported as "Unavailable" (DESIGN.md §8).
 */
export function describeBranchScope(
  branchScope: BranchScope | null | undefined
): string {
  if (branchScope === 'ALL') return 'All branches';
  if (branchScope === 'ASSIGNED') return 'Assigned branches';
  return 'Unavailable';
}
