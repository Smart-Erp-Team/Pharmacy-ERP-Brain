import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type {
  BranchScope,
  CurrentUserContext,
  PermissionScope,
  Role,
  RuntimeMode,
} from '../../../src/types/api';
import { mockApiResponse } from './mswBridge';

function readStrField(map: Map<string, unknown>, key: string): string {
  const value = map.get(key);
  if (typeof value !== 'string') {
    throw new Error(`Expected string fixture field "${key}"`);
  }
  return value;
}

function loadCurrentUserSeed() {
  const fixtureUrl = new URL(
    '../../../../../contracts/fixtures/current-user-context.json',
    import.meta.url
  );
  const parsed: unknown = JSON.parse(readFileSync(fixtureUrl, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid current-user-context fixture');
  }
  const root = new Map(Object.entries(parsed));
  const rawUser = root.get('user');
  if (typeof rawUser !== 'object' || rawUser === null) {
    throw new Error('Invalid user field in current-user-context fixture');
  }
  const userMap = new Map(Object.entries(rawUser));
  return {
    organization_id: readStrField(root, 'organization_id'),
    organization_code: readStrField(root, 'organization_code'),
    user_id: readStrField(userMap, 'user_id'),
    employee_id: readStrField(userMap, 'employee_id'),
    username: readStrField(userMap, 'username'),
    last_login_at: readStrField(userMap, 'last_login_at'),
  };
}

export const currentUserFixture = loadCurrentUserSeed();

export const BRANCH_CAI_ID = 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa';
export const BRANCH_ALX_ID = 'e5f6a7b8-4444-4d55-9e66-ccddeeff0011';

export interface UserContextOverrides {
  role?: Role;
  roles?: Role[];
  branch_scope?: BranchScope;
  branch_ids?: string[];
  scopes?: PermissionScope[];
  runtime?: RuntimeMode;
  username?: string;
}

const DEFAULT_ADMIN_SCOPES: PermissionScope[] = [
  'inventory:read',
  'inventory:write',
  'sales:read',
  'purchase-order:read',
  'purchase-order:draft',
  'purchase-order:approve',
  'purchase-order:receive',
  'supplier-payment:write',
  'return:read',
  'return:write',
  'user:admin',
];

export function buildUserContext(
  overrides: UserContextOverrides = {}
): CurrentUserContext {
  const role: Role = overrides.role ?? overrides.roles?.[0] ?? 'Admin';
  const branchScope: BranchScope = overrides.branch_scope ?? 'ALL';

  return {
    user: {
      user_id: currentUserFixture.user_id,
      employee_id: currentUserFixture.employee_id,
      username: overrides.username ?? 'admin.omar',
      role,
      branch_scope: branchScope,
      is_active: true,
      access_failed_count: 0,
      lockout_end: null,
      last_login_at: currentUserFixture.last_login_at,
    },
    organization_id: currentUserFixture.organization_id,
    organization_code: currentUserFixture.organization_code,
    branch_scope: branchScope,
    branch_ids: overrides.branch_ids ?? [],
    roles: overrides.roles ?? [role],
    scopes: overrides.scopes ?? DEFAULT_ADMIN_SCOPES,
    runtime: overrides.runtime ?? 'Cloud',
  };
}

export async function mockAuthMe(
  page: Page,
  overrides: UserContextOverrides = {}
): Promise<void> {
  const payload = buildUserContext(overrides);
  await mockApiResponse(page, {
    method: 'GET',
    path: '/api/v1/auth/me',
    status: 200,
    body: payload,
  });
}
