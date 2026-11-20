import { http, HttpResponse } from 'msw';
import currentUserContext from '@contracts/fixtures/current-user-context.json';
import type {
  BranchDto,
  BranchEnrollmentResult,
  BranchPatchRequest,
  BranchRequest,
  EnrollmentTokenDto,
} from '../types/api';

const ORGANIZATION_ID = currentUserContext.organization_id;

const INITIAL_BRANCHES: readonly BranchDto[] = [
  {
    branch_id: 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa',
    organization_id: ORGANIZATION_ID,
    code: 'CAI-01',
    name: 'Cairo Main Branch',
    is_active: true,
    address: {
      line1: '15 Tahrir Square',
      line2: 'Floor 1',
      city: 'Cairo',
      region: 'Cairo Governorate',
      postal_code: '11511',
      country_code: 'EG',
    },
    created_at: '2026-01-10T09:00:00.000Z',
    updated_at: '2026-01-10T09:00:00.000Z',
  },
  {
    branch_id: 'e5f6a7b8-4444-4d55-9e66-ccddeeff0011',
    organization_id: ORGANIZATION_ID,
    code: 'ALX-01',
    name: 'Alexandria Corniche Branch',
    is_active: true,
    address: {
      line1: '240 El Geish Road',
      line2: null,
      city: 'Alexandria',
      region: 'Alexandria Governorate',
      postal_code: '21500',
      country_code: 'EG',
    },
    created_at: '2026-01-12T10:30:00.000Z',
    updated_at: '2026-01-12T10:30:00.000Z',
  },
  {
    branch_id: 'f6a7b8c9-5555-4e66-9f77-ddeeff001122',
    organization_id: ORGANIZATION_ID,
    code: 'GIZ-01',
    name: 'Giza Dokki Branch',
    is_active: false,
    address: {
      line1: '88 El Tahrir Street',
      line2: null,
      city: 'Giza',
      region: 'Giza Governorate',
      postal_code: '12311',
      country_code: 'EG',
    },
    created_at: '2026-01-14T11:00:00.000Z',
    updated_at: '2026-02-01T14:00:00.000Z',
  },
];

let mockBranches: BranchDto[] = INITIAL_BRANCHES.map((branch) => ({
  ...branch,
  address: branch.address ? { ...branch.address } : undefined,
}));

export function resetMockBranches(): void {
  mockBranches = INITIAL_BRANCHES.map((branch) => ({
    ...branch,
    address: branch.address ? { ...branch.address } : undefined,
  }));
}

export const branchHandlers = [
  http.get('*/api/v1/branches', ({ request }) => {
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get('includeInactive') === 'true';
    const rawLimit = Number(url.searchParams.get('limit') ?? '20');
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 20;
    const rawCursor = Number(url.searchParams.get('cursor') ?? '0');
    const start = Number.isFinite(rawCursor) && rawCursor >= 0 ? rawCursor : 0;

    const filtered = includeInactive
      ? mockBranches
      : mockBranches.filter((branch) => branch.is_active);
    const items = filtered.slice(start, start + limit);
    const nextOffset = start + limit;
    const nextCursor = nextOffset < filtered.length ? String(nextOffset) : null;

    return HttpResponse.json({ items, nextCursor }, { status: 200 });
  }),

  http.get('*/api/v1/branches/:branchId', ({ params }) => {
    const branch = mockBranches.find(
      (item) => item.branch_id === params.branchId
    );
    if (!branch) {
      return HttpResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Branch was not found.',
            trace_id: 'mock-trace-branch-not-found',
          },
        },
        { status: 404 }
      );
    }
    return HttpResponse.json(branch, { status: 200 });
  }),

  http.post('*/api/v1/branches', async ({ request }) => {
    const body = (await request
      .json()
      .catch(() => null)) as Partial<BranchRequest> | null;

    if (!body?.code?.trim() || !body?.name?.trim() || !body.address) {
      return HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid branch details.',
            trace_id: 'mock-trace-branch-validation',
            details: [
              { field: 'code', issue: 'Branch code is required.' },
              { field: 'name', issue: 'Branch name is required.' },
            ],
          },
        },
        { status: 422 }
      );
    }

    const normalizedCode = body.code.trim().toUpperCase();
    const duplicate = mockBranches.some(
      (item) => item.code.toUpperCase() === normalizedCode
    );
    if (duplicate) {
      return HttpResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: `Branch code "${body.code.trim()}" already exists in this organization.`,
            trace_id: 'mock-trace-branch-conflict',
            details: [{ field: 'code', issue: 'Branch code must be unique.' }],
          },
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const created: BranchDto = {
      branch_id: `branch-${Date.now()}-${mockBranches.length + 1}`,
      organization_id: ORGANIZATION_ID,
      code: body.code.trim(),
      name: body.name.trim(),
      address: body.address,
      is_active: body.is_active ?? true,
      created_at: now,
      updated_at: now,
    };

    mockBranches = [created, ...mockBranches];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.patch('*/api/v1/branches/:branchId', async ({ params, request }) => {
    const index = mockBranches.findIndex(
      (item) => item.branch_id === params.branchId
    );
    if (index === -1) {
      return HttpResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Branch was not found.',
            trace_id: 'mock-trace-branch-not-found',
          },
        },
        { status: 404 }
      );
    }

    const body = (await request
      .json()
      .catch(() => null)) as BranchPatchRequest | null;
    const current = mockBranches[index];
    const updated: BranchDto = {
      ...current,
      name: body?.name?.trim() ?? current.name,
      address: body?.address ?? current.address,
      is_active:
        typeof body?.is_active === 'boolean'
          ? body.is_active
          : current.is_active,
      updated_at: new Date().toISOString(),
    };

    mockBranches = mockBranches.map((item, idx) =>
      idx === index ? updated : item
    );
    return HttpResponse.json(updated, { status: 200 });
  }),

  http.post('*/api/v1/branches/:branchId/enrollment-tokens', ({ params }) => {
    const branch = mockBranches.find(
      (item) => item.branch_id === params.branchId
    );
    if (!branch) {
      return HttpResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Branch was not found.',
            trace_id: 'mock-trace-branch-not-found',
          },
        },
        { status: 404 }
      );
    }

    if (!branch.is_active) {
      return HttpResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: 'Cannot issue an enrollment token for an inactive branch.',
            trace_id: 'mock-trace-enrollment-inactive',
          },
        },
        { status: 409 }
      );
    }

    const tokenPayload: EnrollmentTokenDto = {
      enrollment_id: `enr-${Date.now()}`,
      token: `enr_live_${branch.code.toLowerCase()}_9f8c7d6e`,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };

    return HttpResponse.json(tokenPayload, { status: 201 });
  }),

  http.post('*/api/v1/branch-enrollment', async ({ request }) => {
    const body = (await request.json().catch(() => null)) as {
      token?: string;
    } | null;
    const token = body?.token?.trim() ?? '';

    if (!token) {
      return HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Enrollment token is required.',
            trace_id: 'mock-trace-enrollment-validation',
            details: [
              { field: 'token', issue: 'Enrollment token is required.' },
            ],
          },
        },
        { status: 422 }
      );
    }

    if (token === 'expired-token') {
      return HttpResponse.json(
        {
          error: {
            code: 'GONE',
            message:
              'This enrollment token has expired or has already been redeemed.',
            trace_id: 'mock-trace-enrollment-gone',
          },
        },
        { status: 410 }
      );
    }

    if (token === 'invalid-token') {
      return HttpResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'The enrollment token was not recognized.',
            trace_id: 'mock-trace-enrollment-unauthorized',
          },
        },
        { status: 401 }
      );
    }

    const result: BranchEnrollmentResult = {
      organization_id: ORGANIZATION_ID,
      branch_id: INITIAL_BRANCHES[0].branch_id,
      runtime_credential: 'rc_live_branch_device_credential_token',
      initial_cursor: 'cursor_sync_0001',
      credential_expires_at: new Date(
        Date.now() + 90 * 24 * 60 * 60 * 1000
      ).toISOString(),
    };

    return HttpResponse.json(result, { status: 200 });
  }),
];
