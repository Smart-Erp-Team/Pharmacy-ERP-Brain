import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type {
  BranchScope,
  CurrentUser,
  PermissionScope,
  Role,
  RuntimeMode,
} from '../../../src/types/api';
import { mockApiResponse } from './mswBridge.ts';

export const MEDCARE_ORG_CODE = 'MEDCARE';
export const BRANCH_DT_ID = '11111111-2222-4111-8111-000000000001';
export const BRANCH_ALX_ID = '11111111-2222-4111-8111-000000000002';

const VALID_ROLES = ['Admin', 'Pharmacist', 'Cashier'] as const;
const VALID_BRANCH_SCOPES = ['ALL', 'ASSIGNED'] as const;
const VALID_RUNTIMES = ['Cloud', 'BranchLocal'] as const;

export const STAGE1_SCOPES = [
  'user:admin',
  'inventory:read',
  'inventory:write',
  'sales:read',
  'sales:write',
] as const satisfies readonly PermissionScope[];

export const ROLE_DEFAULT_SCOPES: Record<Role, readonly PermissionScope[]> = {
  Admin: STAGE1_SCOPES,
  Pharmacist: ['inventory:read', 'inventory:write', 'sales:read'],
  Cashier: ['inventory:read', 'sales:read', 'sales:write'],
} as const;

function readStr(map: Map<string, unknown>, key: string): string {
  const val = map.get(key);
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new Error(`Expected non-empty string fixture field "${key}"`);
  }
  return val;
}

function isRole(val: unknown): val is Role {
  return typeof val === 'string' && VALID_ROLES.some((r) => r === val);
}

function isBranchScope(val: unknown): val is BranchScope {
  return typeof val === 'string' && VALID_BRANCH_SCOPES.some((s) => s === val);
}

function isRuntimeMode(val: unknown): val is RuntimeMode {
  return typeof val === 'string' && VALID_RUNTIMES.some((m) => m === val);
}

function isPermissionScope(val: unknown): val is PermissionScope {
  return typeof val === 'string' && STAGE1_SCOPES.some((s) => s === val);
}

function loadCurrentUserSeed(): CurrentUser {
  const fixtureUrl = new URL(
    '../../../../../contracts/fixtures/current-user-context.json',
    import.meta.url
  );
  const parsed: unknown = JSON.parse(readFileSync(fixtureUrl, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid flat current-user-context.json fixture');
  }
  const map = new Map(Object.entries(parsed));
  const role = map.get('role');
  const branchScope = map.get('branch_scope');
  const runtimeMode = map.get('runtime_mode');
  const rawBranchIds = map.get('branch_ids');
  const rawScopes = map.get('scopes');

  if (
    !isRole(role) ||
    !isBranchScope(branchScope) ||
    !isRuntimeMode(runtimeMode) ||
    !Array.isArray(rawBranchIds) ||
    !rawBranchIds.every((id): id is string => typeof id === 'string') ||
    !Array.isArray(rawScopes) ||
    !rawScopes.every(isPermissionScope)
  ) {
    throw new Error('Invalid enum or array field in current-user-context.json');
  }

  return {
    user_id: readStr(map, 'user_id'),
    employee_id: readStr(map, 'employee_id'),
    organization_id: readStr(map, 'organization_id'),
    username: readStr(map, 'username'),
    role,
    branch_scope: branchScope,
    branch_ids: [...rawBranchIds],
    scopes: [...rawScopes],
    runtime_mode: runtimeMode,
  };
}

export const currentUserFixture: CurrentUser = loadCurrentUserSeed();

export interface UserContextOverrides {
  user_id?: string;
  employee_id?: string;
  organization_id?: string;
  username?: string;
  role?: Role;
  branch_scope?: BranchScope;
  branch_ids?: readonly string[];
  scopes?: readonly PermissionScope[];
  runtime_mode?: RuntimeMode;
}

export function buildUserContext(
  overrides: UserContextOverrides = {}
): CurrentUser {
  const role: Role = overrides.role ?? currentUserFixture.role;
  const branchScope: BranchScope =
    overrides.branch_scope ?? (role === 'Admin' ? 'ALL' : 'ASSIGNED');

  return {
    user_id: overrides.user_id ?? currentUserFixture.user_id,
    employee_id: overrides.employee_id ?? currentUserFixture.employee_id,
    organization_id:
      overrides.organization_id ?? currentUserFixture.organization_id,
    username: overrides.username ?? currentUserFixture.username,
    role,
    branch_scope: branchScope,
    branch_ids:
      branchScope === 'ALL'
        ? []
        : [...(overrides.branch_ids ?? [BRANCH_DT_ID])],
    scopes: [...(overrides.scopes ?? ROLE_DEFAULT_SCOPES[role])],
    runtime_mode: overrides.runtime_mode ?? currentUserFixture.runtime_mode,
  };
}

export async function mockAuthMe(
  page: Page,
  overrides: UserContextOverrides = {}
): Promise<void> {
  await mockApiResponse(page, {
    method: 'GET',
    path: '/api/v1/auth/me',
    status: 200,
    body: buildUserContext(overrides),
  });
}
