import { describe, it, expect } from 'vitest';
import {
  VALID_ROLES,
  VALID_RUNTIMES,
  ROLE_PERMISSIONS,
  isValidRole,
  hasRole,
  hasAnyRole,
  hasPermission,
  hasAllPermissions,
  isAllowedRuntime,
  isAllowedBranch,
  describeBranchScope,
} from '../lib/auth/permissions';
import type { CurrentUser, PermissionScope, Role } from '../types/api';

const MEDCARE_ORG_ID = '11111111-1111-4111-8111-111111111101';
const BRANCH_DT_ID = '11111111-2222-4111-8111-000000000001';
const BRANCH_NS_ID = '11111111-2222-4111-8111-000000000002';

const buildUser = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  user_id: '11111111-4444-4111-8111-000000000005',
  employee_id: '11111111-3333-4111-8111-000000000005',
  organization_id: MEDCARE_ORG_ID,
  username: 'sarah.pharm@medcare.test',
  role: 'Pharmacist',
  branch_scope: 'ASSIGNED',
  branch_ids: [BRANCH_DT_ID],
  scopes: ['inventory:read', 'inventory:write', 'sales:read'],
  runtime_mode: 'BranchLocal',
  ...overrides,
});

describe('Roles and Permissions Matrix', () => {
  it('strictly contains only the three canonical Stage 1 roles and two runtimes', () => {
    expect(VALID_ROLES).toEqual(['Admin', 'Pharmacist', 'Cashier']);
    expect(VALID_RUNTIMES).toEqual(['Cloud', 'BranchLocal']);
    expect(isValidRole('Admin')).toBe(true);
    expect(isValidRole('Pharmacist')).toBe(true);
    expect(isValidRole('Cashier')).toBe(true);
    expect(isValidRole('Staff')).toBe(false);
    expect(isValidRole('Manager')).toBe(false);
    expect(isValidRole('PlatformProvisioner')).toBe(false);
  });

  it('defines the closed 5-scope Stage 1 ROLE_PERMISSIONS for Admin, Pharmacist, and Cashier', () => {
    expect(ROLE_PERMISSIONS.Admin).toEqual([
      'user:admin',
      'inventory:read',
      'inventory:write',
      'sales:read',
      'sales:write',
    ]);

    expect(ROLE_PERMISSIONS.Pharmacist).toEqual([
      'inventory:read',
      'inventory:write',
      'sales:read',
    ]);
    expect(ROLE_PERMISSIONS.Pharmacist).not.toContain('sales:write');
    expect(ROLE_PERMISSIONS.Pharmacist).not.toContain('user:admin');

    expect(ROLE_PERMISSIONS.Cashier).toEqual([
      'inventory:read',
      'sales:read',
      'sales:write',
    ]);
    expect(ROLE_PERMISSIONS.Cashier).not.toContain('inventory:write');
    expect(ROLE_PERMISSIONS.Cashier).not.toContain('user:admin');
  });

  it('evaluates role checks accurately', () => {
    const pharmacistRoles: readonly Role[] = ['Pharmacist'];
    expect(hasRole(pharmacistRoles, 'Pharmacist')).toBe(true);
    expect(hasRole(pharmacistRoles, 'Admin')).toBe(false);
    expect(hasAnyRole(pharmacistRoles, ['Admin', 'Pharmacist'])).toBe(true);
    expect(hasAnyRole(pharmacistRoles, ['Admin', 'Cashier'])).toBe(false);
    expect(hasRole([], 'Pharmacist')).toBe(false);
    expect(hasRole(undefined, 'Admin')).toBe(false);
    expect(hasAnyRole(undefined, ['Admin'])).toBe(false);
  });

  it('evaluates permission checks accurately against the 5-scope vocabulary', () => {
    const scopes: readonly PermissionScope[] = [
      'inventory:read',
      'inventory:write',
      'sales:read',
    ];
    expect(hasPermission(scopes, 'inventory:read')).toBe(true);
    expect(hasPermission(scopes, 'inventory:write')).toBe(true);
    expect(hasPermission(scopes, 'sales:write')).toBe(false);
    expect(hasPermission(undefined, 'inventory:read')).toBe(false);
    expect(
      hasAllPermissions(scopes, ['inventory:read', 'inventory:write'])
    ).toBe(true);
    expect(hasAllPermissions(scopes, ['inventory:read', 'sales:write'])).toBe(
      false
    );
  });

  it('passes the scope check when nothing is required', () => {
    expect(hasAllPermissions(['inventory:read'], [])).toBe(true);
    expect(hasAllPermissions([], [])).toBe(true);
    expect(hasAllPermissions(undefined, [])).toBe(true);
    expect(hasAllPermissions([], ['inventory:read'])).toBe(false);
    expect(hasAllPermissions(undefined, ['inventory:read'])).toBe(false);
  });
});

describe('Runtime gating', () => {
  it('allows a runtime that owns the route', () => {
    expect(isAllowedRuntime('Cloud', ['Cloud'])).toBe(true);
    expect(isAllowedRuntime('BranchLocal', ['Cloud', 'BranchLocal'])).toBe(
      true
    );
  });

  it('blocks a runtime that does not own the route', () => {
    expect(isAllowedRuntime('BranchLocal', ['Cloud'])).toBe(false);
    expect(isAllowedRuntime('Cloud', ['BranchLocal'])).toBe(false);
  });

  it('blocks everything when the runtime is unknown', () => {
    expect(isAllowedRuntime(null, ['Cloud', 'BranchLocal'])).toBe(false);
    expect(isAllowedRuntime(undefined, ['Cloud'])).toBe(false);
  });
});

describe('Branch scope gating', () => {
  it('allows every branch when the scope is ALL', () => {
    const user = buildUser({
      role: 'Admin',
      branch_scope: 'ALL',
      branch_ids: [],
    });

    expect(isAllowedBranch(user, BRANCH_DT_ID)).toBe(true);
    expect(isAllowedBranch(user, BRANCH_NS_ID)).toBe(true);
  });

  it('allows only the assigned branches when the scope is ASSIGNED', () => {
    const user = buildUser({
      branch_scope: 'ASSIGNED',
      branch_ids: [BRANCH_DT_ID, BRANCH_NS_ID],
    });

    expect(isAllowedBranch(user, BRANCH_DT_ID)).toBe(true);
    expect(isAllowedBranch(user, BRANCH_NS_ID)).toBe(true);
    expect(isAllowedBranch(user, '11111111-2222-4111-8111-000000000099')).toBe(
      false
    );
  });

  it('blocks everything without a session', () => {
    expect(isAllowedBranch(null, BRANCH_DT_ID)).toBe(false);
    expect(isAllowedBranch(undefined, BRANCH_DT_ID)).toBe(false);
  });

  it('describes the branch scope without inventing a value', () => {
    expect(describeBranchScope('ALL')).toBe('All branches');
    expect(describeBranchScope('ASSIGNED')).toBe('Assigned branches');
    expect(describeBranchScope(null)).toBe('Unavailable');
    expect(describeBranchScope(undefined)).toBe('Unavailable');
  });
});
