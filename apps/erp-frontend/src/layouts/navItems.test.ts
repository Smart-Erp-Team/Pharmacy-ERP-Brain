import { describe, it, expect } from 'vitest';
import { getVisibleNavGroups, isNavItemVisible, NAV_GROUPS } from './navItems';
import type { PermissionScope, Role, RuntimeMode } from '../types/api';

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

const findItem = (label: string) => {
  const item = ALL_ITEMS.find((entry) => entry.label === label);
  if (!item) {
    throw new Error(`Missing nav item: ${label}`);
  }
  return item;
};

const overviewItem = findItem('Overview');
const branchEnrollmentItem = findItem('Branch Enrollment');
const branchesItem = findItem('Branches');
const employeesItem = findItem('Employees');

const ADMIN_SCOPES: readonly PermissionScope[] = [
  'user:admin',
  'inventory:read',
  'inventory:write',
  'sales:read',
  'sales:write',
];

const PHARMACIST_SCOPES: readonly PermissionScope[] = [
  'inventory:read',
  'inventory:write',
  'sales:read',
];

const CASHIER_SCOPES: readonly PermissionScope[] = [
  'inventory:read',
  'sales:read',
  'sales:write',
];

const getVisibleLabels = (
  roles: readonly Role[],
  scopes: readonly PermissionScope[],
  runtime: RuntimeMode | null
): string[] =>
  getVisibleNavGroups(NAV_GROUPS, { roles, scopes, runtime }).flatMap((group) =>
    group.items.map((item) => item.label)
  );

describe('Navigation visibility', () => {
  it('shows an entry whose required scopes are empty', () => {
    expect(
      isNavItemVisible(overviewItem, {
        roles: ['Cashier'],
        scopes: CASHIER_SCOPES,
        runtime: 'Cloud',
      })
    ).toBe(true);
    expect(
      isNavItemVisible(branchesItem, {
        roles: ['Admin'],
        scopes: ['inventory:read'],
        runtime: 'Cloud',
      })
    ).toBe(true);
  });

  it('treats Branch Enrollment as Cloud-only across all Stage 1 roles', () => {
    for (const role of ['Admin', 'Pharmacist', 'Cashier'] as const) {
      expect(
        isNavItemVisible(branchEnrollmentItem, {
          roles: [role],
          scopes: [],
          runtime: 'Cloud',
        })
      ).toBe(true);
      expect(
        isNavItemVisible(branchEnrollmentItem, {
          roles: [role],
          scopes: ADMIN_SCOPES,
          runtime: 'BranchLocal',
        })
      ).toBe(false);
    }
  });

  it('hides an entry whose required scope is missing', () => {
    expect(
      isNavItemVisible(employeesItem, {
        roles: ['Admin'],
        scopes: ['inventory:read'],
        runtime: 'Cloud',
      })
    ).toBe(false);
  });

  it('hides an entry when the runtime is unknown', () => {
    expect(
      isNavItemVisible(overviewItem, {
        roles: ['Admin'],
        scopes: ADMIN_SCOPES,
        runtime: null,
      })
    ).toBe(false);
  });

  it('shows all Stage 1 Cloud items for Admin and restricts BranchLocal to workspace and operations reads', () => {
    expect(getVisibleLabels(['Admin'], ADMIN_SCOPES, 'Cloud')).toEqual([
      'Overview',
      'Products',
      'Inventory',
      'Branch Enrollment',
      'Branches',
      'Employees',
      'User Accounts',
    ]);

    expect(getVisibleLabels(['Admin'], ADMIN_SCOPES, 'BranchLocal')).toEqual([
      'Overview',
      'Products',
      'Inventory',
    ]);
  });

  it('computes exact Stage 1 nav items for Pharmacist and Cashier across Cloud and BranchLocal', () => {
    expect(
      getVisibleLabels(['Pharmacist'], PHARMACIST_SCOPES, 'Cloud')
    ).toEqual(['Overview', 'Products', 'Inventory', 'Branch Enrollment']);
    expect(
      getVisibleLabels(['Pharmacist'], PHARMACIST_SCOPES, 'BranchLocal')
    ).toEqual(['Overview', 'Products', 'Inventory']);

    expect(getVisibleLabels(['Cashier'], CASHIER_SCOPES, 'Cloud')).toEqual([
      'Overview',
      'Products',
      'Inventory',
      'Branch Enrollment',
    ]);
    expect(
      getVisibleLabels(['Cashier'], CASHIER_SCOPES, 'BranchLocal')
    ).toEqual(['Overview', 'Products', 'Inventory']);
  });

  it('drops groups that keep no visible entry on BranchLocal', () => {
    const groups = getVisibleNavGroups(NAV_GROUPS, {
      roles: ['Pharmacist'],
      scopes: PHARMACIST_SCOPES,
      runtime: 'BranchLocal',
    });

    expect(groups.map((group) => group.title)).toEqual([
      'Workspace',
      'Operations',
    ]);
  });
});
