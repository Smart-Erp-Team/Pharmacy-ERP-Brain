import { http, HttpResponse } from 'msw';
import branchFixture from '@contracts/fixtures/branch.json';
import currentUserContext from '@contracts/fixtures/current-user-context.json';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
} from '../lib/api/idempotency';
import { isPlainRecord } from '../lib/api/normalizers';
import type {
  Branch,
  EnrollmentToken,
  ErrorCode,
  NormalizedAddress,
  NormalizedApiErrorDetail,
  NormalizedApiErrorEnvelope,
  PagedResult,
  RedeemEnrollment,
} from '../types/api';

const ORGANIZATION_ID = currentUserContext.organization_id;

export const MOCK_BRANCH_IDS = {
  DOWNTOWN: '11111111-2222-4111-8111-000000000001',
  ALEXANDRIA: '11111111-2222-4111-8111-000000000002',
  GIZA: '11111111-2222-4111-8111-000000000003',
} as const;

export const MOCK_VALID_ENROLLMENT_TOKEN = 'enr_valid_token_01';

const INITIAL_BRANCHES: readonly Branch[] = [
  {
    ...branchFixture,
    branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
    organization_id: ORGANIZATION_ID,
    address: { ...branchFixture.address },
  },
  {
    branch_id: MOCK_BRANCH_IDS.ALEXANDRIA,
    organization_id: ORGANIZATION_ID,
    branch_code: 'MED-ALX',
    name: 'MedCare - Alexandria Corniche',
    address: {
      line1: '240 El Geish Road',
      line2: null,
      city: 'Alexandria',
      region: 'Alexandria Governorate',
      postal_code: '21500',
      country_code: 'EG',
    },
    is_active: true,
    created_at: '2026-01-16T10:30:00+00:00',
    updated_at: '2026-11-25T10:00:00+00:00',
  },
  {
    branch_id: MOCK_BRANCH_IDS.GIZA,
    organization_id: ORGANIZATION_ID,
    branch_code: 'MED-GZ',
    name: 'MedCare - Giza Storage',
    address: {
      line1: '88 El Tahrir Street',
      line2: null,
      city: 'Giza',
      region: 'Giza Governorate',
      postal_code: '12311',
      country_code: 'EG',
    },
    is_active: false,
    created_at: '2026-01-18T11:00:00+00:00',
    updated_at: '2026-11-25T10:00:00+00:00',
  },
];

interface MockEnrollmentTokenRecord {
  branch_id: string;
  expires_at: string;
  consumed: boolean;
}

function cloneInitialBranches(): Branch[] {
  return INITIAL_BRANCHES.map((branch) => ({
    ...branch,
    address: { ...branch.address },
  }));
}

function createInitialEnrollmentTokens(): Map<
  string,
  MockEnrollmentTokenRecord
> {
  return new Map<string, MockEnrollmentTokenRecord>([
    [
      MOCK_VALID_ENROLLMENT_TOKEN,
      {
        branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        consumed: false,
      },
    ],
    [
      'expired-token',
      {
        branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
        expires_at: '2026-01-01T00:00:00.000Z',
        consumed: false,
      },
    ],
  ]);
}

let mockBranches: Branch[] = cloneInitialBranches();
let mockEnrollmentTokens: Map<string, MockEnrollmentTokenRecord> =
  createInitialEnrollmentTokens();
let nextBranchSequence = 100;
let enrollmentTokenSequence = 0;

export function resetMockBranches(): void {
  mockBranches = cloneInitialBranches();
  mockEnrollmentTokens = createInitialEnrollmentTokens();
  nextBranchSequence = 100;
  enrollmentTokenSequence = 0;
}

function createMockErrorEnvelope(
  code: ErrorCode,
  message: string,
  traceId: string,
  details: NormalizedApiErrorDetail[] = []
): NormalizedApiErrorEnvelope {
  return {
    error: {
      code,
      message,
      details,
      trace_id: traceId,
    },
  };
}

function requireIdempotencyKey(request: Request): Response | null {
  const key = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim() ?? '';
  if (key.length === 0) {
    return HttpResponse.json(
      createMockErrorEnvelope(
        'MALFORMED_REQUEST',
        'The idempotency key is required.',
        'mock-trace-branch-idempotency-missing',
        [
          {
            field: IDEMPOTENCY_KEY_HEADER,
            issue: 'The idempotency key is required.',
          },
        ]
      ),
      { status: 400 }
    );
  }
  if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return HttpResponse.json(
      createMockErrorEnvelope(
        'MALFORMED_REQUEST',
        `The idempotency key must be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`,
        'mock-trace-branch-idempotency-length',
        [
          {
            field: IDEMPOTENCY_KEY_HEADER,
            issue: `The idempotency key must be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`,
          },
        ]
      ),
      { status: 400 }
    );
  }
  return null;
}

function readOptionalNullableString(
  record: Record<string, unknown>,
  field: string,
  fieldPath: string,
  maxLength: number,
  details: NormalizedApiErrorDetail[]
): string | null {
  const value = record[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    details.push({
      field: fieldPath,
      issue: `${fieldPath} must be a string or null.`,
    });
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    details.push({
      field: fieldPath,
      issue: `${fieldPath} must be at most ${maxLength} characters.`,
    });
  }
  return trimmed.length > 0 ? trimmed : null;
}

function parseAddressInput(
  raw: unknown,
  details: NormalizedApiErrorDetail[]
): NormalizedAddress | null {
  if (!isPlainRecord(raw)) {
    details.push({
      field: 'address',
      issue: 'Address is required.',
    });
    return null;
  }

  const line1 = typeof raw.line1 === 'string' ? raw.line1.trim() : '';
  if (!line1) {
    details.push({
      field: 'address.line1',
      issue: 'Address line 1 is required.',
    });
  } else if (line1.length > 200) {
    details.push({
      field: 'address.line1',
      issue: 'Address line 1 must be at most 200 characters.',
    });
  }

  const line2 = readOptionalNullableString(
    raw,
    'line2',
    'address.line2',
    200,
    details
  );

  const city = typeof raw.city === 'string' ? raw.city.trim() : '';
  if (!city) {
    details.push({
      field: 'address.city',
      issue: 'City is required.',
    });
  } else if (city.length > 100) {
    details.push({
      field: 'address.city',
      issue: 'City must be at most 100 characters.',
    });
  }

  const region = readOptionalNullableString(
    raw,
    'region',
    'address.region',
    100,
    details
  );

  const postal_code = readOptionalNullableString(
    raw,
    'postal_code',
    'address.postal_code',
    20,
    details
  );

  const countryCode =
    typeof raw.country_code === 'string'
      ? raw.country_code.trim().toUpperCase()
      : '';
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    details.push({
      field: 'address.country_code',
      issue: 'Country code must be a 2-letter ISO code.',
    });
  }

  if (details.length > 0) {
    return null;
  }

  return {
    line1,
    line2,
    city,
    region,
    postal_code,
    country_code: countryCode,
  };
}

function parsePositiveIntegerParam(raw: string | null, fallback: number) {
  if (raw === null) {
    return { valid: true as const, value: fallback };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { valid: false as const, value: fallback };
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return { valid: false as const, value: fallback };
  }
  return { valid: true as const, value: parsed };
}

export const branchHandlers = [
  http.get('*/api/v1/branches', ({ request }) => {
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get('include_inactive') === 'true';
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();

    const pageResult = parsePositiveIntegerParam(
      url.searchParams.get('page'),
      1
    );
    const pageSizeResult = parsePositiveIntegerParam(
      url.searchParams.get('page_size'),
      25
    );

    const validationDetails: NormalizedApiErrorDetail[] = [];
    if (!pageResult.valid || pageResult.value < 1) {
      validationDetails.push({
        field: 'page',
        issue: 'Page must be an integer greater than or equal to 1.',
      });
    }
    if (
      !pageSizeResult.valid ||
      pageSizeResult.value < 1 ||
      pageSizeResult.value > 200
    ) {
      validationDetails.push({
        field: 'page_size',
        issue: 'Page size must be an integer between 1 and 200.',
      });
    }

    if (validationDetails.length > 0) {
      return HttpResponse.json(
        createMockErrorEnvelope(
          'VALIDATION_ERROR',
          'Invalid pagination parameters.',
          'mock-trace-branches-pagination',
          validationDetails
        ),
        { status: 422 }
      );
    }

    const page = pageResult.value;
    const pageSize = pageSizeResult.value;

    const filtered = mockBranches.filter((branch) => {
      if (!includeInactive && !branch.is_active) {
        return false;
      }
      if (!search) {
        return true;
      }
      return (
        branch.branch_code.toLowerCase().includes(search) ||
        branch.name.toLowerCase().includes(search)
      );
    });

    const totalCount = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    const nextCursor = page * pageSize < totalCount ? String(page + 1) : null;

    const payload: PagedResult<Branch> = {
      items,
      page,
      page_size: pageSize,
      total_count: totalCount,
      next_cursor: nextCursor,
    };

    return HttpResponse.json(payload, { status: 200 });
  }),

  http.get('*/api/v1/branches/:branchId', ({ params }) => {
    const branchId = typeof params.branchId === 'string' ? params.branchId : '';
    const branch = mockBranches.find((item) => item.branch_id === branchId);
    if (!branch) {
      return HttpResponse.json(
        createMockErrorEnvelope(
          'NOT_FOUND',
          'Branch was not found.',
          'mock-trace-branch-not-found'
        ),
        { status: 404 }
      );
    }
    return HttpResponse.json(branch, { status: 200 });
  }),

  http.post('*/api/v1/branches', async ({ request }) => {
    const idempotencyError = requireIdempotencyKey(request);
    if (idempotencyError) {
      return idempotencyError;
    }

    const body: unknown = await request.json().catch(() => null);
    if (!isPlainRecord(body)) {
      return HttpResponse.json(
        createMockErrorEnvelope(
          'MALFORMED_REQUEST',
          'Branch request body must be a JSON object.',
          'mock-trace-branch-malformed'
        ),
        { status: 400 }
      );
    }

    const details: NormalizedApiErrorDetail[] = [];
    const branchCode =
      typeof body.branch_code === 'string' ? body.branch_code.trim() : '';
    if (!branchCode) {
      details.push({
        field: 'branch_code',
        issue: 'Branch code is required.',
      });
    } else if (branchCode.length > 30) {
      details.push({
        field: 'branch_code',
        issue: 'Branch code must be at most 30 characters.',
      });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      details.push({
        field: 'name',
        issue: 'Branch name is required.',
      });
    } else if (name.length > 150) {
      details.push({
        field: 'name',
        issue: 'Branch name must be at most 150 characters.',
      });
    }

    const addressDetails: NormalizedApiErrorDetail[] = [];
    const parsedAddress = parseAddressInput(body.address, addressDetails);
    details.push(...addressDetails);

    if (details.length > 0 || !parsedAddress) {
      return HttpResponse.json(
        createMockErrorEnvelope(
          'VALIDATION_ERROR',
          'Invalid branch details.',
          'mock-trace-branch-validation',
          details
        ),
        { status: 422 }
      );
    }

    const normalizedCode = branchCode.toUpperCase();
    const duplicate = mockBranches.some(
      (item) => item.branch_code.toUpperCase() === normalizedCode
    );
    if (duplicate) {
      return HttpResponse.json(
        createMockErrorEnvelope(
          'CONFLICT',
          `Branch code "${branchCode}" already exists in this organization.`,
          'mock-trace-branch-conflict',
          [{ field: 'branch_code', issue: 'Branch code must be unique.' }]
        ),
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    nextBranchSequence += 1;
    const created: Branch = {
      branch_id: `11111111-2222-4111-8111-${String(nextBranchSequence).padStart(12, '0')}`,
      organization_id: ORGANIZATION_ID,
      branch_code: branchCode,
      name,
      address: parsedAddress,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    mockBranches = [created, ...mockBranches];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.patch('*/api/v1/branches/:branchId', async ({ params, request }) => {
    const idempotencyError = requireIdempotencyKey(request);
    if (idempotencyError) {
      return idempotencyError;
    }

    const branchId = typeof params.branchId === 'string' ? params.branchId : '';
    const index = mockBranches.findIndex((item) => item.branch_id === branchId);
    const current = index >= 0 ? mockBranches[index] : undefined;
    if (!current) {
      return HttpResponse.json(
        createMockErrorEnvelope(
          'NOT_FOUND',
          'Branch was not found.',
          'mock-trace-branch-not-found'
        ),
        { status: 404 }
      );
    }

    const body: unknown = await request.json().catch(() => null);
    if (!isPlainRecord(body)) {
      return HttpResponse.json(
        createMockErrorEnvelope(
          'MALFORMED_REQUEST',
          'Branch update body must be a JSON object.',
          'mock-trace-branch-patch-malformed'
        ),
        { status: 400 }
      );
    }

    const details: NormalizedApiErrorDetail[] = [];

    let nextName = current.name;
    if (body.name !== undefined && body.name !== null) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        details.push({
          field: 'name',
          issue: 'Branch name must be a non-empty string.',
        });
      } else if (body.name.trim().length > 150) {
        details.push({
          field: 'name',
          issue: 'Branch name must be at most 150 characters.',
        });
      } else {
        nextName = body.name.trim();
      }
    }

    let nextAddress = current.address;
    if (body.address !== undefined && body.address !== null) {
      const addressDetails: NormalizedApiErrorDetail[] = [];
      const parsedAddress = parseAddressInput(body.address, addressDetails);
      if (addressDetails.length > 0 || !parsedAddress) {
        details.push(...addressDetails);
      } else {
        nextAddress = parsedAddress;
      }
    }

    let nextIsActive = current.is_active;
    if (body.is_active !== undefined && body.is_active !== null) {
      if (typeof body.is_active !== 'boolean') {
        details.push({
          field: 'is_active',
          issue: 'is_active must be a boolean.',
        });
      } else {
        nextIsActive = body.is_active;
      }
    }

    if (details.length > 0) {
      return HttpResponse.json(
        createMockErrorEnvelope(
          'VALIDATION_ERROR',
          'Invalid branch update details.',
          'mock-trace-branch-patch-validation',
          details
        ),
        { status: 422 }
      );
    }

    const updated: Branch = {
      ...current,
      name: nextName,
      address: nextAddress,
      is_active: nextIsActive,
      updated_at: new Date().toISOString(),
    };

    mockBranches = mockBranches.map((item, idx) =>
      idx === index ? updated : item
    );
    return HttpResponse.json(updated, { status: 200 });
  }),

  http.post(
    '*/api/v1/branches/:branchId/enrollment-tokens',
    ({ params, request }) => {
      const idempotencyError = requireIdempotencyKey(request);
      if (idempotencyError) {
        return idempotencyError;
      }

      const branchId =
        typeof params.branchId === 'string' ? params.branchId : '';
      const branch = mockBranches.find((item) => item.branch_id === branchId);
      if (!branch) {
        return HttpResponse.json(
          createMockErrorEnvelope(
            'NOT_FOUND',
            'Branch was not found.',
            'mock-trace-branch-not-found'
          ),
          { status: 404 }
        );
      }

      if (!branch.is_active) {
        return HttpResponse.json(
          createMockErrorEnvelope(
            'CONFLICT',
            'Cannot issue an enrollment token for an inactive branch.',
            'mock-trace-enrollment-inactive'
          ),
          { status: 409 }
        );
      }

      enrollmentTokenSequence += 1;
      const token = `enr_live_${branch.branch_code.toLowerCase()}_${String(enrollmentTokenSequence).padStart(4, '0')}`;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      mockEnrollmentTokens.set(token, {
        branch_id: branch.branch_id,
        expires_at: expiresAt,
        consumed: false,
      });

      const tokenPayload: EnrollmentToken = {
        token,
        expires_at: expiresAt,
      };

      return HttpResponse.json(tokenPayload, { status: 201 });
    }
  ),

  http.post('*/api/v1/branch-enrollment', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);
    if (!isPlainRecord(body)) {
      return HttpResponse.json(
        createMockErrorEnvelope(
          'MALFORMED_REQUEST',
          'Branch enrollment request body must be a JSON object.',
          'mock-trace-enrollment-malformed'
        ),
        { status: 400 }
      );
    }

    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) {
      return HttpResponse.json(
        createMockErrorEnvelope(
          'VALIDATION_ERROR',
          'Enrollment token is required.',
          'mock-trace-enrollment-validation',
          [{ field: 'token', issue: 'Enrollment token is required.' }]
        ),
        { status: 422 }
      );
    }

    const record = mockEnrollmentTokens.get(token);
    const isExpired =
      record !== undefined && Date.parse(record.expires_at) <= Date.now();

    if (!record || record.consumed || isExpired) {
      return HttpResponse.json(
        createMockErrorEnvelope(
          'UNAUTHORIZED',
          'The enrollment token is invalid, expired, or has already been used.',
          'mock-trace-enrollment-unauthorized'
        ),
        { status: 401 }
      );
    }

    record.consumed = true;

    const result: RedeemEnrollment = {
      organization_id: ORGANIZATION_ID,
      branch_id: record.branch_id,
      runtime_credential: `rc_live_branch_device_credential_${record.branch_id}`,
      initial_sync_cursor: 0,
      credential_expiry: new Date(
        Date.now() + 90 * 24 * 60 * 60 * 1000
      ).toISOString(),
    };

    return HttpResponse.json(result, { status: 200 });
  }),
];
