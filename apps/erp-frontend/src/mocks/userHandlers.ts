import { http, HttpResponse } from 'msw';
import type {
  BranchAccessGrant,
  BranchScope,
  Role,
  UserDto,
} from '../types/api';

const DEFAULT_BRANCH_ID = 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa';

export const INITIAL_USERS: readonly UserDto[] = [
  {
    user_id: 'b2222222-2222-4222-8222-222222222201',
    employee_id: 'a1111111-1111-4111-8111-111111111101',
    username: 'admin.omar',
    role: 'Admin',
    branch_scope: 'ALL',
    is_active: true,
    access_failed_count: 0,
    lockout_end: null,
    last_login_at: '2026-11-14T08:15:00.000Z',
  },
  {
    user_id: 'b2222222-2222-4222-8222-222222222202',
    employee_id: 'a1111111-1111-4111-8111-111111111102',
    username: 'ph.mona',
    role: 'Pharmacist',
    branch_scope: 'ASSIGNED',
    is_active: true,
    access_failed_count: 5,
    lockout_end: '2099-01-01T12:00:00.000Z',
    last_login_at: '2026-11-13T17:40:00.000Z',
  },
];

const INITIAL_USER_BRANCH_ACCESS: ReadonlyArray<
  readonly [string, BranchAccessGrant[]]
> = [
  [
    'b2222222-2222-4222-8222-222222222202',
    [{ branch_id: DEFAULT_BRANCH_ID, branch_code: 'CAI-01' }],
  ],
];

const VALID_ROLES: ReadonlySet<string> = new Set<Role>([
  'Admin',
  'Pharmacist',
  'Cashier',
]);

const VALID_BRANCH_SCOPES: ReadonlySet<string> = new Set<BranchScope>([
  'ALL',
  'ASSIGNED',
]);

let mockUsers: UserDto[] = INITIAL_USERS.map((user) => ({ ...user }));
let mockUserBranchAccess = createInitialBranchAccessMap();
let createdUserCounter = 0;

function createInitialBranchAccessMap(): Map<string, BranchAccessGrant[]> {
  return new Map(
    INITIAL_USER_BRANCH_ACCESS.map(([userId, grants]) => [
      userId,
      grants.map((grant) => ({ ...grant })),
    ])
  );
}

export function resetMockUsers(): void {
  mockUsers = INITIAL_USERS.map((user) => ({ ...user }));
  mockUserBranchAccess = createInitialBranchAccessMap();
  createdUserCounter = 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && VALID_ROLES.has(value);
}

function isBranchScope(value: unknown): value is BranchScope {
  return typeof value === 'string' && VALID_BRANCH_SCOPES.has(value);
}

function parseBranchAccessGrants(value: unknown): BranchAccessGrant[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const grants: BranchAccessGrant[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!isRecord(item) || typeof item.branch_id !== 'string') {
      return null;
    }
    const branchId = item.branch_id.trim();
    if (branchId.length === 0 || seen.has(branchId)) {
      continue;
    }
    seen.add(branchId);
    grants.push(
      typeof item.branch_code === 'string'
        ? { branch_id: branchId, branch_code: item.branch_code }
        : { branch_id: branchId }
    );
  }

  return grants;
}

function nextMockUserId(): string {
  createdUserCounter += 1;
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const suffix = String(createdUserCounter + 2).padStart(12, '0');
  return `b2222222-2222-4222-8222-${suffix}`;
}

function userNotFoundResponse() {
  return HttpResponse.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'User account was not found.',
        trace_id: 'mock-trace-user-not-found',
      },
    },
    { status: 404 }
  );
}

function validationErrorResponse(
  message: string,
  details: Array<{ field: string; issue: string }>
) {
  return HttpResponse.json(
    {
      error: {
        code: 'VALIDATION_ERROR',
        message,
        trace_id: 'mock-trace-user-validation',
        details,
      },
    },
    { status: 422 }
  );
}

export const userHandlers = [
  http.get('*/api/v1/users', ({ request }) => {
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get('limit') ?? '20');
    const parsedLimit = Math.floor(rawLimit);
    const limit =
      Number.isFinite(rawLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 200)
        : 20;
    const rawCursor = Number(url.searchParams.get('cursor') ?? '0');
    const parsedCursor = Math.floor(rawCursor);
    const start =
      Number.isFinite(rawCursor) && parsedCursor >= 0 ? parsedCursor : 0;

    const items = mockUsers.slice(start, start + limit).map((user) => ({
      ...user,
    }));
    const nextOffset = start + limit;
    const nextCursor =
      nextOffset < mockUsers.length ? String(nextOffset) : null;

    return HttpResponse.json({ items, nextCursor }, { status: 200 });
  }),

  http.get('*/api/v1/users/:userId', ({ params }) => {
    const user = mockUsers.find((item) => item.user_id === params.userId);
    if (!user) {
      return userNotFoundResponse();
    }

    return HttpResponse.json({ ...user }, { status: 200 });
  }),

  http.post('*/api/v1/users', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return HttpResponse.json(
        {
          error: {
            code: 'MALFORMED_REQUEST',
            message: 'Request body must be a valid JSON object.',
            trace_id: 'mock-trace-user-malformed',
          },
        },
        { status: 400 }
      );
    }

    const details: Array<{ field: string; issue: string }> = [];

    const employeeId =
      typeof body.employee_id === 'string' ? body.employee_id.trim() : '';
    const username =
      typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const role = isRole(body.role) ? body.role : null;
    const branchScope = isBranchScope(body.branch_scope)
      ? body.branch_scope
      : null;
    const branchAccess =
      body.branch_access === undefined
        ? []
        : parseBranchAccessGrants(body.branch_access);

    if (!employeeId) {
      details.push({ field: 'employee_id', issue: 'Employee is required.' });
    }

    if (!username) {
      details.push({ field: 'username', issue: 'Username is required.' });
    } else if (username.length > 80) {
      details.push({
        field: 'username',
        issue: 'Username must be at most 80 characters.',
      });
    }

    if (password.length < 8) {
      details.push({
        field: 'password',
        issue: 'Password must be at least 8 characters.',
      });
    } else if (password.length > 128) {
      details.push({
        field: 'password',
        issue: 'Password must be at most 128 characters.',
      });
    }

    if (!role) {
      details.push({
        field: 'role',
        issue: 'Role must be Admin, Pharmacist, or Cashier.',
      });
    }

    if (!branchScope) {
      details.push({
        field: 'branch_scope',
        issue: 'Branch scope must be ALL or ASSIGNED.',
      });
    }

    if (role && branchScope && role !== 'Admin' && branchScope === 'ALL') {
      details.push({
        field: 'branch_scope',
        issue: 'Only Admin accounts can use ALL branch scope.',
      });
    }

    if (body.branch_access !== undefined && branchAccess === null) {
      details.push({
        field: 'branch_access',
        issue: 'Branch access grants must be a valid array.',
      });
    } else if (
      branchScope === 'ASSIGNED' &&
      (!branchAccess || branchAccess.length === 0)
    ) {
      details.push({
        field: 'branch_access',
        issue: 'Select at least one branch for ASSIGNED scope.',
      });
    }

    if (details.length > 0 || !role || !branchScope) {
      return validationErrorResponse('Invalid user account details.', details);
    }

    const normalizedEmployeeId = employeeId.toLowerCase();
    const duplicateEmployee = mockUsers.some(
      (item) => item.employee_id.toLowerCase() === normalizedEmployeeId
    );
    if (duplicateEmployee) {
      return HttpResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: 'This employee already has a user account.',
            trace_id: 'mock-trace-user-employee-conflict',
            details: [
              {
                field: 'employee_id',
                issue: 'An account already exists for this employee.',
              },
            ],
          },
        },
        { status: 409 }
      );
    }

    const normalizedUsername = username.toLowerCase();
    const duplicateUsername = mockUsers.some(
      (item) => item.username.toLowerCase() === normalizedUsername
    );
    if (duplicateUsername) {
      return HttpResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: `Username "${username}" is already taken in this organization.`,
            trace_id: 'mock-trace-user-username-conflict',
            details: [
              {
                field: 'username',
                issue: 'Username must be unique within the organization.',
              },
            ],
          },
        },
        { status: 409 }
      );
    }

    const created: UserDto = {
      user_id: nextMockUserId(),
      employee_id: employeeId,
      username,
      role,
      branch_scope: branchScope,
      is_active: true,
      access_failed_count: 0,
      lockout_end: null,
      last_login_at: null,
    };

    if (branchScope === 'ASSIGNED' && branchAccess) {
      mockUserBranchAccess.set(
        created.user_id,
        branchAccess.map((grant) => ({ ...grant }))
      );
    }

    mockUsers = [created, ...mockUsers];
    return HttpResponse.json({ ...created }, { status: 201 });
  }),

  http.patch('*/api/v1/users/:userId', async ({ params, request }) => {
    const index = mockUsers.findIndex((item) => item.user_id === params.userId);
    if (index === -1) {
      return userNotFoundResponse();
    }

    const current = mockUsers[index];
    if (!current) {
      return userNotFoundResponse();
    }

    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return HttpResponse.json(
        {
          error: {
            code: 'MALFORMED_REQUEST',
            message: 'Request body must be a valid JSON object.',
            trace_id: 'mock-trace-user-malformed',
          },
        },
        { status: 400 }
      );
    }

    const details: Array<{ field: string; issue: string }> = [];

    let nextRole = current.role;
    if (body.role !== undefined) {
      if (isRole(body.role)) {
        nextRole = body.role;
      } else {
        details.push({
          field: 'role',
          issue: 'Role must be Admin, Pharmacist, or Cashier.',
        });
      }
    }

    let nextScope = current.branch_scope;
    if (body.branch_scope !== undefined) {
      if (isBranchScope(body.branch_scope)) {
        nextScope = body.branch_scope;
      } else {
        details.push({
          field: 'branch_scope',
          issue: 'Branch scope must be ALL or ASSIGNED.',
        });
      }
    }

    let nextIsActive = current.is_active;
    if (body.is_active !== undefined) {
      if (typeof body.is_active === 'boolean') {
        nextIsActive = body.is_active;
      } else {
        details.push({
          field: 'is_active',
          issue: 'Active status must be a boolean.',
        });
      }
    }

    if (nextRole !== 'Admin' && nextScope === 'ALL') {
      details.push({
        field: 'branch_scope',
        issue: 'Only Admin accounts can use ALL branch scope.',
      });
    }

    const hasBranchAccessField = body.branch_access !== undefined;
    const parsedBranchAccess = hasBranchAccessField
      ? parseBranchAccessGrants(body.branch_access)
      : null;

    if (hasBranchAccessField && parsedBranchAccess === null) {
      details.push({
        field: 'branch_access',
        issue: 'Branch access grants must be a valid array.',
      });
    } else if (nextScope === 'ASSIGNED') {
      if (hasBranchAccessField && parsedBranchAccess?.length === 0) {
        details.push({
          field: 'branch_access',
          issue: 'Select at least one branch for ASSIGNED scope.',
        });
      } else if (
        !hasBranchAccessField &&
        current.branch_scope === 'ALL' &&
        (mockUserBranchAccess.get(current.user_id)?.length ?? 0) === 0
      ) {
        details.push({
          field: 'branch_access',
          issue: 'Select at least one branch for ASSIGNED scope.',
        });
      }
    }

    if (details.length > 0) {
      return validationErrorResponse('Invalid user update details.', details);
    }

    if (nextScope === 'ALL') {
      mockUserBranchAccess.delete(current.user_id);
    } else if (hasBranchAccessField && parsedBranchAccess) {
      mockUserBranchAccess.set(
        current.user_id,
        parsedBranchAccess.map((grant) => ({ ...grant }))
      );
    }

    const updated: UserDto = {
      ...current,
      role: nextRole,
      branch_scope: nextScope,
      is_active: nextIsActive,
    };

    mockUsers = mockUsers.map((item, idx) => (idx === index ? updated : item));
    return HttpResponse.json({ ...updated }, { status: 200 });
  }),

  http.post(
    '*/api/v1/users/:userId/password-reset',
    async ({ params, request }) => {
      const user = mockUsers.find((item) => item.user_id === params.userId);
      if (!user) {
        return userNotFoundResponse();
      }

      const body: unknown = await request.json().catch(() => null);
      if (!isRecord(body)) {
        return HttpResponse.json(
          {
            error: {
              code: 'MALFORMED_REQUEST',
              message: 'Request body must be a valid JSON object.',
              trace_id: 'mock-trace-user-malformed',
            },
          },
          { status: 400 }
        );
      }

      const newPassword =
        typeof body.new_password === 'string' ? body.new_password : '';

      if (newPassword.length < 8) {
        return validationErrorResponse('Invalid password reset request.', [
          {
            field: 'new_password',
            issue: 'Password must be at least 8 characters.',
          },
        ]);
      }

      if (newPassword.length > 128) {
        return validationErrorResponse('Invalid password reset request.', [
          {
            field: 'new_password',
            issue: 'Password must be at most 128 characters.',
          },
        ]);
      }

      return new HttpResponse(null, { status: 204 });
    }
  ),

  http.post('*/api/v1/users/:userId/revoke-sessions', ({ params }) => {
    const user = mockUsers.find((item) => item.user_id === params.userId);
    if (!user) {
      return userNotFoundResponse();
    }

    return new HttpResponse(null, { status: 204 });
  }),
];
