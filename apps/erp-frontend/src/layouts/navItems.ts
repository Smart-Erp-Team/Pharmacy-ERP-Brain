/**
 * Pharmacy ERP — Navigation Model
 *
 * The sidebar entries and the rules that decide who may see them:
 * - roles   → who the user is (Admin | Pharmacist | Cashier)
 * - scopes  → what the user may do (the contract's scope vocabulary)
 * - runtime → the deployment the session belongs to (contracts/FRONTEND.md §2)
 *
 * The model is data only, so the shell and the router gate on the same source.
 */

import { PATHS } from '../routes/paths';
import { hasAllPermissions, hasAnyRole } from '../lib/auth/permissions';
import type { PermissionScope, Role, RuntimeMode } from '../types/api';

const ALL_ROLES: readonly Role[] = ['Admin', 'Pharmacist', 'Cashier'];
const CLOUD_ONLY: readonly RuntimeMode[] = ['Cloud'];
const BOTH_RUNTIMES: readonly RuntimeMode[] = ['Cloud', 'BranchLocal'];

export interface NavItem {
  label: string;
  path: string;
  roles: readonly Role[];
  runtimes: readonly RuntimeMode[];
  scopes: readonly PermissionScope[];
}

export interface NavGroup {
  title: string;
  items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: 'Workspace',
    items: [
      {
        label: 'Overview',
        path: PATHS.HOME,
        roles: ALL_ROLES,
        runtimes: BOTH_RUNTIMES,
        scopes: [],
      },
    ],
  },
  {
    title: 'Operations',
    items: [
      {
        label: 'Products',
        path: PATHS.PRODUCTS,
        roles: ALL_ROLES,
        runtimes: BOTH_RUNTIMES,
        scopes: ['inventory:read'],
      },
      {
        label: 'Inventory',
        path: PATHS.INVENTORY,
        roles: ALL_ROLES,
        runtimes: BOTH_RUNTIMES,
        scopes: ['inventory:read'],
      },
      {
        label: 'Branch Enrollment',
        path: PATHS.BRANCH_ENROLLMENT,
        roles: ALL_ROLES,
        runtimes: CLOUD_ONLY,
        scopes: [],
      },
    ],
  },
  {
    title: 'Organization & Identity',
    items: [
      {
        label: 'Branches',
        path: PATHS.BRANCHES,
        roles: ALL_ROLES,
        runtimes: BOTH_RUNTIMES,
        scopes: [],
      },
      {
        label: 'Employees',
        path: PATHS.EMPLOYEES,
        roles: ['Admin'],
        runtimes: BOTH_RUNTIMES,
        scopes: ['user:admin'],
      },
      {
        label: 'User Accounts',
        path: PATHS.USERS,
        roles: ['Admin'],
        runtimes: BOTH_RUNTIMES,
        scopes: ['user:admin'],
      },
    ],
  },
];

export interface NavContext {
  roles: readonly Role[];
  scopes: readonly PermissionScope[];
  runtime: RuntimeMode | null;
}

/**
 * A navigation entry is visible when the session may open it: the runtime owns
 * the route, the user holds one of the roles, and the scopes cover it.
 * An unknown runtime hides the entry, exactly like the RuntimeGate does.
 */
export const isNavItemVisible = (
  item: NavItem,
  context: NavContext
): boolean => {
  if (!context.runtime) {
    return false;
  }

  if (!item.runtimes.includes(context.runtime)) {
    return false;
  }

  if (!hasAnyRole(context.roles, item.roles)) {
    return false;
  }

  return hasAllPermissions(context.scopes, item.scopes);
};

/**
 * Keeps only the groups that still have an entry the user may open.
 */
export const getVisibleNavGroups = (
  groups: readonly NavGroup[],
  context: NavContext
): NavGroup[] =>
  groups
    .map((group) => ({
      title: group.title,
      items: group.items.filter((item) => isNavItemVisible(item, context)),
    }))
    .filter((group) => group.items.length > 0);
