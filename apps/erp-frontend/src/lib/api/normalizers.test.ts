import { describe, expect, it } from 'vitest';
import authTokenPairFixture from '@contracts/fixtures/auth-token-pair.json';
import branchFixture from '@contracts/fixtures/branch.json';
import currentUserContextFixture from '@contracts/fixtures/current-user-context.json';
import {
  BRANCH_SCOPES,
  ContractValidationError,
  ERP_RUNTIME_MODES,
  ERROR_CODES,
  PERMISSION_SCOPES,
  USER_ROLES,
  isBranchScope,
  isErpRuntimeMode,
  isErrorCode,
  isPermissionScope,
  isUserRole,
  normalizeAddress,
  normalizeApiErrorEnvelope,
  normalizeCurrentUser,
  normalizeLoginResponse,
} from './normalizers';

function expectInvalidResponse(fn: () => unknown, endpoint?: string): void {
  try {
    fn();
    expect.fail('Expected ContractValidationError to be thrown');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ContractValidationError);
    if (error instanceof ContractValidationError) {
      expect(error.code).toBe('INVALID_RESPONSE');
      if (endpoint !== undefined) {
        expect(error.endpoint).toBe(endpoint);
      }
    }
  }
}

describe('Stage 1 enum predicates', () => {
  it('validates UserRole values', () => {
    for (const role of USER_ROLES) {
      expect(isUserRole(role)).toBe(true);
    }
    expect(isUserRole('Manager')).toBe(false);
    expect(isUserRole('')).toBe(false);
    expect(isUserRole(null)).toBe(false);
  });

  it('validates BranchScope values', () => {
    for (const scope of BRANCH_SCOPES) {
      expect(isBranchScope(scope)).toBe(true);
    }
    expect(isBranchScope('ORG')).toBe(false);
    expect(isBranchScope(undefined)).toBe(false);
  });

  it('validates ErpRuntimeMode values', () => {
    for (const mode of ERP_RUNTIME_MODES) {
      expect(isErpRuntimeMode(mode)).toBe(true);
    }
    expect(isErpRuntimeMode('Local')).toBe(false);
    expect(isErpRuntimeMode(0)).toBe(false);
  });

  it('validates PermissionScope closed vocabulary', () => {
    for (const scope of PERMISSION_SCOPES) {
      expect(isPermissionScope(scope)).toBe(true);
    }
    expect(isPermissionScope('branch:admin')).toBe(false);
    expect(isPermissionScope('employee:admin')).toBe(false);
    expect(isPermissionScope(123)).toBe(false);
  });

  it('validates ErrorCode closed vocabulary', () => {
    for (const code of ERROR_CODES) {
      expect(isErrorCode(code)).toBe(true);
    }
    expect(isErrorCode('INTERNAL_ERROR')).toBe(false);
    expect(isErrorCode('GONE')).toBe(false);
    expect(isErrorCode(null)).toBe(false);
  });
});

describe('normalizeCurrentUser', () => {
  it('accepts valid Stage 1 CurrentUserDto payloads', () => {
    const admin = normalizeCurrentUser(currentUserContextFixture, '/auth/me');
    expect(admin.username).toBe('admin@medcare.test');
    expect(admin.role).toBe('Admin');
    expect(admin.branch_scope).toBe('ALL');
    expect(admin.branch_ids).toEqual([]);
    expect(admin.runtime_mode).toBe('Cloud');

    const pharmacist = normalizeCurrentUser(
      {
        ...currentUserContextFixture,
        role: 'Pharmacist',
        branch_scope: 'ASSIGNED',
        branch_ids: ['11111111-2222-4111-8111-000000000001'],
        scopes: ['inventory:read', 'inventory:write', 'sales:read'],
        runtime_mode: 'BranchLocal',
      },
      '/auth/me'
    );
    expect(pharmacist.runtime_mode).toBe('BranchLocal');
    expect(pharmacist.branch_ids).toHaveLength(1);
  });

  it('rejects non-objects, missing fields, and invalid enums with ContractValidationError', () => {
    expectInvalidResponse(
      () => normalizeCurrentUser(null, '/auth/me'),
      '/auth/me'
    );
    expectInvalidResponse(
      () => normalizeCurrentUser([], '/auth/me'),
      '/auth/me'
    );

    expectInvalidResponse(
      () =>
        normalizeCurrentUser(
          { ...currentUserContextFixture, username: '   ' },
          '/auth/me'
        ),
      '/auth/me'
    );

    expectInvalidResponse(
      () =>
        normalizeCurrentUser(
          { ...currentUserContextFixture, role: 'SuperAdmin' },
          '/auth/me'
        ),
      '/auth/me'
    );

    expectInvalidResponse(
      () =>
        normalizeCurrentUser(
          { ...currentUserContextFixture, branch_scope: 'NONE' },
          '/auth/me'
        ),
      '/auth/me'
    );

    expectInvalidResponse(
      () =>
        normalizeCurrentUser(
          { ...currentUserContextFixture, branch_ids: [''] },
          '/auth/me'
        ),
      '/auth/me'
    );

    expectInvalidResponse(
      () =>
        normalizeCurrentUser(
          { ...currentUserContextFixture, scopes: ['branch:admin'] },
          '/auth/me'
        ),
      '/auth/me'
    );

    expectInvalidResponse(
      () =>
        normalizeCurrentUser(
          { ...currentUserContextFixture, runtime_mode: 'Hybrid' },
          '/auth/me'
        ),
      '/auth/me'
    );
  });
});

describe('normalizeLoginResponse', () => {
  it('accepts a valid Stage 1 LoginResponse payload', () => {
    const normalized = normalizeLoginResponse(
      authTokenPairFixture,
      '/auth/login'
    );
    expect(normalized.token_type).toBe('Bearer');
    expect(normalized.user.username).toBe('sarah.pharm@medcare.test');
    expect(normalized.user.role).toBe('Pharmacist');
    expect(normalized.issuer).toBe('PharmacyERP');
    expect(normalized.audience).toBe('PharmacyERP.Api');
  });

  it('rejects missing token fields or invalid nested user with INVALID_RESPONSE', () => {
    expectInvalidResponse(
      () => normalizeLoginResponse(null, '/auth/login'),
      '/auth/login'
    );
    expectInvalidResponse(
      () =>
        normalizeLoginResponse(
          { ...authTokenPairFixture, refresh_token: '' },
          '/auth/refresh'
        ),
      '/auth/refresh'
    );
    expectInvalidResponse(
      () =>
        normalizeLoginResponse(
          { ...authTokenPairFixture, key_id: undefined },
          '/auth/login'
        ),
      '/auth/login'
    );
    expectInvalidResponse(
      () =>
        normalizeLoginResponse(
          {
            ...authTokenPairFixture,
            user: { ...authTokenPairFixture.user, role: 'Unknown' },
          },
          '/auth/login'
        ),
      '/auth/login'
    );
  });
});

describe('normalizeApiErrorEnvelope', () => {
  it('accepts valid Stage 1 error envelopes and defaults omitted optional fields', () => {
    const full = normalizeApiErrorEnvelope({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed.',
        details: [{ field: 'username', issue: 'Username is required.' }],
        trace_id: 'trace-123',
      },
    });
    expect(full).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed.',
        details: [{ field: 'username', issue: 'Username is required.' }],
        trace_id: 'trace-123',
      },
    });

    const minimal = normalizeApiErrorEnvelope({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected error.',
      },
    });
    expect(minimal).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected error.',
        details: [],
        trace_id: '',
      },
    });
  });

  it('returns null for non-envelope or malformed payloads', () => {
    expect(normalizeApiErrorEnvelope(null)).toBeNull();
    expect(normalizeApiErrorEnvelope('html')).toBeNull();
    expect(normalizeApiErrorEnvelope({ error: null })).toBeNull();
    expect(
      normalizeApiErrorEnvelope({
        error: { code: 'UNKNOWN_CODE', message: 'Bad' },
      })
    ).toBeNull();
    expect(
      normalizeApiErrorEnvelope({
        error: { code: 'UNAUTHORIZED', message: '   ' },
      })
    ).toBeNull();
    expect(
      normalizeApiErrorEnvelope({
        error: { code: 'UNAUTHORIZED', message: 'Denied', trace_id: 42 },
      })
    ).toBeNull();
    expect(
      normalizeApiErrorEnvelope({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Bad',
          details: 'not-an-array',
        },
      })
    ).toBeNull();
    expect(
      normalizeApiErrorEnvelope({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Bad',
          details: [{ field: 'x', issue: 123 }],
        },
      })
    ).toBeNull();
  });
});

describe('normalizeAddress', () => {
  it('normalizes required and nullable address fields', () => {
    const address = normalizeAddress(branchFixture.address, '/branches');
    expect(address).toEqual({
      line1: '24 Talaat Harb Street',
      line2: 'Ground Floor',
      city: 'Cairo',
      region: 'Downtown',
      postal_code: '11511',
      country_code: 'EG',
    });

    const minimal = normalizeAddress({
      line1: '10 Nile Corniche',
      city: 'Giza',
      country_code: 'EG',
    });
    expect(minimal).toEqual({
      line1: '10 Nile Corniche',
      line2: null,
      city: 'Giza',
      region: null,
      postal_code: null,
      country_code: 'EG',
    });
  });

  it('rejects malformed addresses with ContractValidationError', () => {
    expectInvalidResponse(
      () => normalizeAddress(null, '/branches'),
      '/branches'
    );
    expectInvalidResponse(
      () =>
        normalizeAddress(
          { line1: '', city: 'Cairo', country_code: 'EG' },
          '/branches'
        ),
      '/branches'
    );
    expectInvalidResponse(
      () =>
        normalizeAddress(
          {
            line1: '24 Main St',
            line2: 123,
            city: 'Cairo',
            country_code: 'EG',
          },
          '/branches'
        ),
      '/branches'
    );
  });
});
