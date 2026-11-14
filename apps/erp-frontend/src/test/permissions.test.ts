import { describe, it, expect } from 'vitest';
import {
  VALID_ROLES,
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
import type { CurrentUserContext, Role } from '../types/api';

const buildUser = (
  overrides: Partial<CurrentUserContext> = {}
): CurrentUserContext =>
  ({
    user: {
      user_id: '550e8400-e29b-41d4-a716-446655440000',
      employee_id: 'fa567890-1234-4def-9fbe-fa12345678de',
      username: 'fa.pharmacist',
      role: 'Pharmacist',
      branch_scope: 'ASSIGNED',
      is_active: true,
    },
    organization_id: 'b1c2d3e4-2222-4b33-8c44-aabbccddeeff',
    organization_code: 'PHARMAPLUS',
    branch_scope: 'ASSIGNED',
    branch_ids: ['branch-1'],
    roles: ['Pharmacist'],
    scopes: ['inventory:read'],
    runtime: 'BranchLocal',
    ...overrides,
  }) as CurrentUserContext;

describe('Roles and Permissions Matrix', () => {
  it('strictly contains only the three canonical contract roles', () => {
    expect(VALID_ROLES).toEqual(['Admin', 'Pharmacist', 'Cashier']);
    expect(isValidRole('Admin')).toBe(true);
    expect(isValidRole('Pharmacist')).toBe(true);
    expect(isValidRole('Cashier')).toBe(true);
    expect(isValidRole('Staff')).toBe(false);
    expect(isValidRole('Manager')).toBe(false);
  });

  it('defines permissions for Admin, Pharmacist, and Cashier', () => {
    expect(ROLE_PERMISSIONS.Admin).toContain('user:admin');
    expect(ROLE_PERMISSIONS.Admin).toContain('purchase-order:approve');

    expect(ROLE_PERMISSIONS.Pharmacist).toContain('inventory:write');
    expect(ROLE_PERMISSIONS.Pharmacist).not.toContain('user:admin');
    expect(ROLE_PERMISSIONS.Pharmacist).not.toContain('purchase-order:approve');

    expect(ROLE_PERMISSIONS.Cashier).toContain('sales:write');
    expect(ROLE_PERMISSIONS.Cashier).toContain('return:write');
    expect(ROLE_PERMISSIONS.Cashier).not.toContain('inventory:write');
    expect(ROLE_PERMISSIONS.Cashier).not.toContain('purchase-order:read');
  });

  it('evaluates role checks accurately', () => {
    const pharmacistRoles: Role[] = ['Pharmacist'];
    expect(hasRole(pharmacistRoles, 'Pharmacist')).toBe(true);
    expect(hasRole(pharmacistRoles, 'Admin')).toBe(false);
    expect(hasAnyRole(pharmacistRoles, ['Admin', 'Pharmacist'])).toBe(true);
    expect(hasAnyRole(pharmacistRoles, ['Admin', 'Cashier'])).toBe(false);
    expect(hasRole([], 'Pharmacist')).toBe(false);
  });

  it('evaluates permission checks accurately', () => {
    const scopes = ['inventory:read', 'inventory:write'] as const;
    expect(hasPermission(scopes, 'inventory:read')).toBe(true);
    expect(hasPermission(scopes, 'sales:write')).toBe(false);
    expect(
      hasAllPermissions(scopes, ['inventory:read', 'inventory:write'])
    ).toBe(true);
    expect(hasAllPermissions(scopes, ['inventory:read', 'sales:write'])).toBe(
      false
    );
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
    const user = buildUser({ branch_scope: 'ALL', branch_ids: [] });

    expect(isAllowedBranch(user, 'branch-1')).toBe(true);
    expect(isAllowedBranch(user, 'any-other-branch')).toBe(true);
  });

  it('allows only the assigned branches when the scope is ASSIGNED', () => {
    const user = buildUser({ branch_ids: ['branch-1', 'branch-2'] });

    expect(isAllowedBranch(user, 'branch-1')).toBe(true);
    expect(isAllowedBranch(user, 'branch-2')).toBe(true);
    expect(isAllowedBranch(user, 'branch-9')).toBe(false);
  });

  it('blocks everything without a session', () => {
    expect(isAllowedBranch(null, 'branch-1')).toBe(false);
  });

  it('describes the branch scope without inventing a value', () => {
    expect(describeBranchScope('ALL')).toBe('All branches');
    expect(describeBranchScope('ASSIGNED')).toBe('Assigned branches');
    expect(describeBranchScope(null)).toBe('Unavailable');
  });
});
