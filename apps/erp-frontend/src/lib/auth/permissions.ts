/**
 * Pharmacy ERP — Roles, Scopes, Runtime and Branch Permissions
 *
 * The single place where every permission decision is made (skill `routing-auth`).
 * Two authoritative sources come from the session (`/auth/me`):
 * - `roles`  → who the user is (Admin | Pharmacist | Cashier)
 * - `scopes` → what the user may do (the contract's PermissionScope vocabulary)
 * Plus the deployment context: `runtime` (Cloud | BranchLocal) and the branch scope.
 */

import type {
  BranchScope,
  CurrentUserContext,
  PermissionScope,
  Role,
  RuntimeMode,
} from '../../types/api';

export const VALID_ROLES: readonly Role[] = [
  'Admin',
  'Pharmacist',
  'Cashier',
] as const;

export const VALID_RUNTIMES: readonly RuntimeMode[] = [
  'Cloud',
  'BranchLocal',
] as const;

export const ROLE_PERMISSIONS: Record<Role, readonly PermissionScope[]> = {
  Admin: [
    'user:admin',
    'inventory:read',
    'inventory:write',
    'sales:read',
    'sales:write',
    'return:read',
    'return:write',
    'purchase-order:read',
    'purchase-order:draft',
    'purchase-order:approve',
    'purchase-order:receive',
    'supplier-payment:write',
    'sync:retry',
  ],
  Pharmacist: [
    'inventory:read',
    'inventory:write',
    'sales:read',
    'return:read',
    'purchase-order:read',
    'purchase-order:draft',
    'purchase-order:receive',
    'supplier-payment:write',
  ],
  Cashier: [
    'sales:read',
    'sales:write',
    'return:read',
    'return:write',
    'inventory:read',
  ],
} as const;

export function isValidRole(role: string): role is Role {
  return (VALID_ROLES as readonly string[]).includes(role);
}

export function hasRole(
  userRoles: readonly Role[] | undefined,
  requiredRole: Role
): boolean {
  if (!userRoles || userRoles.length === 0) return false;
  return userRoles.includes(requiredRole);
}

export function hasAnyRole(
  userRoles: readonly Role[] | undefined,
  requiredRoles: readonly Role[]
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
 * Runtime gate (contracts/FRONTEND.md §1): a route the current runtime does not
 * own answers 404/405 on the server, so the UI must not offer it.
 */
export function isAllowedRuntime(
  runtime: RuntimeMode | null | undefined,
  allowedRuntimes: readonly RuntimeMode[]
): boolean {
  if (!runtime) return false;
  return allowedRuntimes.includes(runtime);
}

/**
 * Branch gate: `branch_scope = ALL` covers every branch of the organization,
 * `ASSIGNED` covers only the branches listed in `branch_ids`.
 */
export function isAllowedBranch(
  currentUser: CurrentUserContext | null | undefined,
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
