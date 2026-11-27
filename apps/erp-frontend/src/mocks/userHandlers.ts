import { http, HttpResponse } from 'msw';
import currentUserContext from '@contracts/fixtures/current-user-context.json';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
} from '../lib/api/idempotency';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../lib/api/pagination';
import { useAuthStore } from '../stores/authStore';
import type {
  ApiErrorEnvelopeDto,
  BranchScope,
  CurrentUser,
  ErrorCode,
  NormalizedApiErrorDetail,
  PagedResult,
  User,
  UserRole,
} from '../types/api';

export const ORGANIZATION_ID = currentUserContext.organization_id;

export const INITIAL_USERS: readonly User[] = [
  {
    user_id: '11111111-4444-4111-8111-000000000001',
    employee_id: '11111111-3333-4111-8111-000000000001',
    organization_id: ORGANIZATION_ID,
    username: 'admin@medcare.test',
    role: 'Admin',
    branch_scope: 'ALL',
    branch_ids: [],
    is_active: true,
    access_failed_count: 0,
    lockout_end: null,
    last_login_at: '2026-11-25T08:15:00.000Z',
  },
  {
    user_id: '11111111-4444-4111-8111-000000000002',
    employee_id: '11111111-3333-4111-8111-000000000002',
    organization_id: ORGANIZATION_ID,
    username: 'ph.mona@medcare.test',
    role: 'Pharmacist',
    branch_scope: 'ASSIGNED',
    branch_ids: ['11111111-2222-4111-8111-000000000001'],
    is_active: true,
    access_failed_count: 5,
    lockout_end: '2099-01-01T12:00:00.000Z',
    last_login_at: '2026-11-24T17:40:00.000Z',
  },
  {
    user_id: '11111111-4444-4111-8111-000000000003',
    employee_id: '11111111-3333-4111-8111-000000000004',
    organization_id: ORGANIZATION_ID,
    username: 'cashier.salma@medcare.test',
    role: 'Cashier',
    branch_scope: 'ASSIGNED',
    branch_ids: ['11111111-2222-4111-8111-000000000002'],
    is_active: false,
    access_failed_count: 0,
    lockout_end: null,
    last_login_at: null,
  },
];

const MIN_PASSWORD_LENGTH = 12;

const VALID_ROLES = [
  'Admin',
  'Pharmacist',
  'Cashier',
] as const satisfies readonly UserRole[];

const VALID_BRANCH_SCOPES = [
  'ALL',
  'ASSIGNED',
] as const satisfies readonly BranchScope[];

function cloneUser(user: User): User {
  return {
    ...user,
    branch_ids: [...user.branch_ids],
  };
}

let mockUsers: User[] = INITIAL_USERS.map(cloneUser);
let createdUserCounter = 0;

export function resetMockUsers(): void {
  mockUsers = INITIAL_USERS.map(cloneUser);
  createdUserCounter = 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRole(value: unknown): value is UserRole {
  return typeof value === 'string' && VALID_ROLES.some((r) => r === value);
}

function isBranchScope(value: unknown): value is BranchScope {
  return (
    typeof value === 'string' && VALID_BRANCH_SCOPES.some((s) => s === value)
  );
}

function parseBranchIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const branchIds: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== 'string') {
      return null;
    }
    const trimmed = item.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      branchIds.push(trimmed);
    }
  }

  return branchIds;
}

function parseStrictPositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

function nextMockUserId(): string {
  createdUserCounter += 1;
  const suffix = String(createdUserCounter + 3).padStart(12, '0');
  return `11111111-4444-4111-8111-${suffix}`;
}

function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  traceId: string,
  details: NormalizedApiErrorDetail[] = []
) {
  const envelope: ApiErrorEnvelopeDto = {
    error: {
      code,
      message,
      details,
      trace_id: traceId,
    },
  };
  return HttpResponse.json(envelope, { status });
}

function userNotFoundResponse() {
  return errorResponse(
    404,
    'NOT_FOUND',
    'User account was not found.',
    'mock-trace-user-not-found'
  );
}

function malformedBodyResponse() {
  return errorResponse(
    400,
    'MALFORMED_REQUEST',
    'Request body must be a valid JSON object.',
    'mock-trace-user-malformed'
  );
}

function validationErrorResponse(
  message: string,
  details: NormalizedApiErrorDetail[]
) {
  return errorResponse(
    422,
    'VALIDATION_ERROR',
    message,
    'mock-trace-user-validation',
    details
  );
}

function requireIdempotencyKey(request: Request): Response | null {
  const key = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim() ?? '';
  if (key.length === 0) {
    return errorResponse(
      400,
      'MALFORMED_REQUEST',
      'The idempotency key is required.',
      'mock-trace-user-idempotency-missing',
      [
        {
          field: IDEMPOTENCY_KEY_HEADER,
          issue: 'The idempotency key is required.',
        },
      ]
    );
  }
  if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return errorResponse(
      400,
      'MALFORMED_REQUEST',
      `The idempotency key must be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`,
      'mock-trace-user-idempotency-length',
      [
        {
          field: IDEMPOTENCY_KEY_HEADER,
          issue: `The idempotency key must be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`,
        },
      ]
    );
  }
  return null;
}

function getAssignedAdminActor(): CurrentUser | null {
  const actor = useAuthStore.getState().currentUser;
  if (actor && actor.role === 'Admin' && actor.branch_scope === 'ASSIGNED') {
    return actor;
  }
  return null;
}

function authorizeAssignedAdminTarget(
  actor: CurrentUser,
  target: User
): Response | null {
  if (target.role === 'Admin' || target.branch_scope === 'ALL') {
    return errorResponse(
      403,
      'FORBIDDEN',
      'Assigned branch administrators cannot manage Admin or ALL-scope accounts.',
      'mock-trace-user-hierarchy-forbidden'
    );
  }
  if (
    actor.branch_ids.length === 0 ||
    target.branch_ids.length === 0 ||
    !target.branch_ids.every((id) => actor.branch_ids.includes(id))
  ) {
    return errorResponse(
      403,
      'FORBIDDEN_BRANCH',
      'Target user belongs to branches outside your authorized scope.',
      'mock-trace-user-branch-forbidden'
    );
  }
  return null;
}

async function handleResetPassword(
  userId: string | undefined,
  request: Request
) {
  const idempotencyError = requireIdempotencyKey(request);
  if (idempotencyError) {
    return idempotencyError;
  }

  const index = mockUsers.findIndex((item) => item.user_id === userId);
  if (index === -1) {
    return userNotFoundResponse();
  }

  const current = mockUsers[index];
  if (!current) {
    return userNotFoundResponse();
  }

  const assignedAdmin = getAssignedAdminActor();
  if (assignedAdmin) {
    const authError = authorizeAssignedAdminTarget(assignedAdmin, current);
    if (authError) {
      return authError;
    }
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return malformedBodyResponse();
  }

  const newPassword =
    typeof body.new_password === 'string' ? body.new_password : '';

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return validationErrorResponse('Invalid password reset request.', [
      {
        field: 'new_password',
        issue: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      },
    ]);
  }

  const updated: User = {
    ...current,
    branch_ids: [...current.branch_ids],
    lockout_end: null,
    access_failed_count: 0,
  };
  mockUsers = mockUsers.map((item, idx) => (idx === index ? updated : item));

  return new HttpResponse(null, { status: 204 });
}

export const userHandlers = [
  http.get('*/api/v1/users', ({ request }) => {
    const url = new URL(request.url);
    const details: NormalizedApiErrorDetail[] = [];

    const rawPage = url.searchParams.get('page');
    let page = DEFAULT_PAGE;
    if (rawPage !== null) {
      const parsedPage = parseStrictPositiveInt(rawPage);
      if (parsedPage === null) {
        details.push({
          field: 'page',
          issue: 'Page must be an integer greater than or equal to 1.',
        });
      } else {
        page = parsedPage;
      }
    }

    const rawPageSize = url.searchParams.get('page_size');
    let pageSize = DEFAULT_PAGE_SIZE;
    if (rawPageSize !== null) {
      const parsedPageSize = parseStrictPositiveInt(rawPageSize);
      if (parsedPageSize === null || parsedPageSize > MAX_PAGE_SIZE) {
        details.push({
          field: 'page_size',
          issue: `Page size must be an integer between 1 and ${MAX_PAGE_SIZE}.`,
        });
      } else {
        pageSize = parsedPageSize;
      }
    }

    const rawRole = url.searchParams.get('role');
    let roleFilter: UserRole | null = null;
    if (rawRole !== null && rawRole.trim().length > 0) {
      if (isRole(rawRole)) {
        roleFilter = rawRole;
      } else {
        details.push({
          field: 'role',
          issue: 'Role must be Admin, Pharmacist, or Cashier.',
        });
      }
    }

    if (details.length > 0) {
      return validationErrorResponse('Invalid user list parameters.', details);
    }

    const includeInactive = url.searchParams.get('include_inactive') === 'true';
    const branchId = url.searchParams.get('branch_id')?.trim() ?? '';

    const assignedAdmin = getAssignedAdminActor();
    if (
      assignedAdmin &&
      (branchId.length === 0 || !assignedAdmin.branch_ids.includes(branchId))
    ) {
      return errorResponse(
        403,
        'FORBIDDEN_BRANCH',
        'A valid authorized branch_id is required.',
        'mock-trace-users-list-branch-forbidden'
      );
    }

    const filtered = mockUsers.filter((user) => {
      if (!includeInactive && !user.is_active) {
        return false;
      }
      if (roleFilter !== null && user.role !== roleFilter) {
        return false;
      }
      if (
        branchId.length > 0 &&
        user.branch_scope !== 'ALL' &&
        !user.branch_ids.includes(branchId)
      ) {
        return false;
      }
      return true;
    });

    const totalCount = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map(cloneUser);
    const nextCursor = start + pageSize < totalCount ? String(page + 1) : null;

    const responseBody: PagedResult<User> = {
      items,
      page,
      page_size: pageSize,
      total_count: totalCount,
      next_cursor: nextCursor,
    };

    return HttpResponse.json(responseBody, { status: 200 });
  }),

  http.get('*/api/v1/users/:id', ({ params }) => {
    const id = typeof params.id === 'string' ? params.id : '';
    const user = mockUsers.find((item) => item.user_id === id);
    if (!user) {
      return userNotFoundResponse();
    }

    return HttpResponse.json(cloneUser(user), { status: 200 });
  }),

  http.post('*/api/v1/users', async ({ request }) => {
    const idempotencyError = requireIdempotencyKey(request);
    if (idempotencyError) {
      return idempotencyError;
    }

    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return malformedBodyResponse();
    }

    const details: NormalizedApiErrorDetail[] = [];

    const employeeId =
      typeof body.employee_id === 'string' ? body.employee_id.trim() : '';
    const username =
      typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const role = isRole(body.role) ? body.role : null;
    const branchScope = isBranchScope(body.branch_scope)
      ? body.branch_scope
      : null;
    const parsedBranchIds =
      body.branch_ids === undefined ? [] : parseBranchIds(body.branch_ids);

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

    if (password.length < MIN_PASSWORD_LENGTH) {
      details.push({
        field: 'password',
        issue: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
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

    if (body.branch_ids !== undefined && parsedBranchIds === null) {
      details.push({
        field: 'branch_ids',
        issue: 'Branch IDs must be a valid array of branch IDs.',
      });
    } else if (
      branchScope === 'ASSIGNED' &&
      (!parsedBranchIds || parsedBranchIds.length === 0)
    ) {
      details.push({
        field: 'branch_ids',
        issue: 'Select at least one branch for ASSIGNED scope.',
      });
    }

    if (details.length > 0 || !role || !branchScope || !parsedBranchIds) {
      return validationErrorResponse('Invalid user account details.', details);
    }

    const assignedAdmin = getAssignedAdminActor();
    if (assignedAdmin) {
      if (role === 'Admin' || branchScope === 'ALL') {
        return errorResponse(
          403,
          'FORBIDDEN',
          'Assigned branch administrators cannot create Admin or ALL-scope accounts.',
          'mock-trace-user-create-forbidden'
        );
      }
      if (
        !parsedBranchIds.every((id) => assignedAdmin.branch_ids.includes(id))
      ) {
        return errorResponse(
          403,
          'FORBIDDEN_BRANCH',
          'All assigned branches must belong to your authorized branches.',
          'mock-trace-user-create-branch-forbidden'
        );
      }
    }

    const normalizedEmployeeId = employeeId.toLowerCase();
    const duplicateEmployee = mockUsers.some(
      (item) => item.employee_id.toLowerCase() === normalizedEmployeeId
    );
    if (duplicateEmployee) {
      return errorResponse(
        409,
        'CONFLICT',
        'This employee already has a user account.',
        'mock-trace-user-employee-conflict',
        [
          {
            field: 'employee_id',
            issue: 'An account already exists for this employee.',
          },
        ]
      );
    }

    const normalizedUsername = username.toLowerCase();
    const duplicateUsername = mockUsers.some(
      (item) => item.username.toLowerCase() === normalizedUsername
    );
    if (duplicateUsername) {
      return errorResponse(
        409,
        'CONFLICT',
        `Username "${username}" is already taken in this organization.`,
        'mock-trace-user-username-conflict',
        [
          {
            field: 'username',
            issue: 'Username must be unique within the organization.',
          },
        ]
      );
    }

    const created: User = {
      user_id: nextMockUserId(),
      employee_id: employeeId,
      organization_id: ORGANIZATION_ID,
      username,
      role,
      branch_scope: branchScope,
      branch_ids: branchScope === 'ALL' ? [] : [...parsedBranchIds],
      is_active: true,
      access_failed_count: 0,
      lockout_end: null,
      last_login_at: null,
    };

    mockUsers = [created, ...mockUsers];
    return HttpResponse.json(cloneUser(created), { status: 201 });
  }),

  http.patch('*/api/v1/users/:id', async ({ params, request }) => {
    const idempotencyError = requireIdempotencyKey(request);
    if (idempotencyError) {
      return idempotencyError;
    }

    const id = typeof params.id === 'string' ? params.id : '';
    const index = mockUsers.findIndex((item) => item.user_id === id);
    if (index === -1) {
      return userNotFoundResponse();
    }

    const current = mockUsers[index];
    if (!current) {
      return userNotFoundResponse();
    }

    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return malformedBodyResponse();
    }

    const details: NormalizedApiErrorDetail[] = [];

    let nextRole = current.role;
    if (body.role !== undefined && body.role !== null) {
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
    if (body.branch_scope !== undefined && body.branch_scope !== null) {
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
    if (body.is_active !== undefined && body.is_active !== null) {
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

    const parsedBranchIds =
      body.branch_ids !== undefined && body.branch_ids !== null
        ? parseBranchIds(body.branch_ids)
        : undefined;

    if (parsedBranchIds === null) {
      details.push({
        field: 'branch_ids',
        issue: 'Branch IDs must be a valid array of branch IDs.',
      });
    } else if (nextScope === 'ASSIGNED') {
      const candidateBranchIds =
        parsedBranchIds !== undefined ? parsedBranchIds : current.branch_ids;
      if (candidateBranchIds.length === 0) {
        details.push({
          field: 'branch_ids',
          issue: 'Select at least one branch for ASSIGNED scope.',
        });
      }
    }

    if (details.length > 0 || parsedBranchIds === null) {
      return validationErrorResponse('Invalid user update details.', details);
    }

    const nextBranchIds =
      nextScope === 'ALL'
        ? []
        : parsedBranchIds !== undefined
          ? [...parsedBranchIds]
          : [...current.branch_ids];

    const assignedAdmin = getAssignedAdminActor();
    if (assignedAdmin) {
      if (nextRole === 'Admin' || nextScope === 'ALL') {
        return errorResponse(
          403,
          'FORBIDDEN',
          'Assigned branch administrators cannot assign Admin role or ALL scope.',
          'mock-trace-user-patch-forbidden'
        );
      }
      const targetError = authorizeAssignedAdminTarget(assignedAdmin, current);
      if (targetError) {
        return targetError;
      }
      if (!nextBranchIds.every((b) => assignedAdmin.branch_ids.includes(b))) {
        return errorResponse(
          403,
          'FORBIDDEN_BRANCH',
          'All assigned branches must belong to your authorized branches.',
          'mock-trace-user-patch-branch-forbidden'
        );
      }
    }

    const updated: User = {
      ...current,
      role: nextRole,
      branch_scope: nextScope,
      branch_ids: nextBranchIds,
      is_active: nextIsActive,
    };

    mockUsers = mockUsers.map((item, idx) => (idx === index ? updated : item));
    return HttpResponse.json(cloneUser(updated), { status: 200 });
  }),

  http.post('*/api/v1/users/:id/password-reset', ({ params, request }) =>
    handleResetPassword(
      typeof params.id === 'string' ? params.id : undefined,
      request
    )
  ),

  http.post('*/api/v1/users/:id/reset-password', ({ params, request }) =>
    handleResetPassword(
      typeof params.id === 'string' ? params.id : undefined,
      request
    )
  ),

  http.post('*/api/v1/users/:id/revoke-sessions', ({ params, request }) => {
    const idempotencyError = requireIdempotencyKey(request);
    if (idempotencyError) {
      return idempotencyError;
    }

    const id = typeof params.id === 'string' ? params.id : '';
    const user = mockUsers.find((item) => item.user_id === id);
    if (!user) {
      return userNotFoundResponse();
    }

    const assignedAdmin = getAssignedAdminActor();
    if (assignedAdmin) {
      const targetError = authorizeAssignedAdminTarget(assignedAdmin, user);
      if (targetError) {
        return targetError;
      }
    }

    return new HttpResponse(null, { status: 204 });
  }),
];
