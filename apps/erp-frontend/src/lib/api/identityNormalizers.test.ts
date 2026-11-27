import { describe, expect, it } from 'vitest';
import branchFixture from '@contracts/fixtures/branch.json';
import organizationFixture from '@contracts/fixtures/organization.json';
import { ContractValidationError } from './normalizers';
import {
  normalizeBranch,
  normalizeEmployee,
  normalizeEnrollmentToken,
  normalizeOrganization,
  normalizeRedeemEnrollment,
  normalizeUser,
} from './identityNormalizers';

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

const VALID_EMPLOYEE_PAYLOAD = {
  employee_id: '11111111-3333-4111-8111-000000000001',
  organization_id: '11111111-1111-4111-8111-111111111101',
  branch_id: '11111111-2222-4111-8111-000000000001',
  employee_no: 'EMP-001',
  full_name: 'Dr. Sarah Hassan',
  email: 'sarah.pharm@medcare.test',
  phone: '+201001234567',
  job_title: 'Lead Pharmacist',
  address: branchFixture.address,
  hired_on: '2026-01-15',
  is_active: true,
  created_at: '2026-01-15T08:00:00+00:00',
  updated_at: '2026-11-25T10:00:00+00:00',
};

const VALID_USER_PAYLOAD = {
  user_id: '11111111-4444-4111-8111-000000000001',
  employee_id: '11111111-3333-4111-8111-000000000001',
  organization_id: '11111111-1111-4111-8111-111111111101',
  username: 'admin@medcare.test',
  role: 'Admin',
  branch_scope: 'ALL',
  is_active: true,
  branch_ids: [],
  last_login_at: '2026-11-25T09:30:00+00:00',
  lockout_end: null,
  access_failed_count: 0,
};

describe('normalizeOrganization', () => {
  it('accepts valid OrganizationDto fixture payload', () => {
    const normalized = normalizeOrganization(
      organizationFixture,
      '/organizations'
    );
    expect(normalized).toEqual({
      organization_id: '11111111-1111-4111-8111-111111111101',
      organization_code: 'MEDCARE',
      name: 'MedCare Wellness Pharmacies',
      base_currency: 'EGP',
      time_zone_id: 'Africa/Cairo',
      initial_branch_id: '11111111-2222-4111-8111-000000000001',
      initial_employee_id: '11111111-3333-4111-8111-000000000001',
      initial_admin_user_id: '11111111-4444-4111-8111-000000000001',
      enrollment_setup_state: 'PENDING',
    });
  });

  it('rejects non-objects, missing fields, and blank strings with INVALID_RESPONSE', () => {
    expectInvalidResponse(
      () => normalizeOrganization(null, '/organizations'),
      '/organizations'
    );
    expectInvalidResponse(
      () => normalizeOrganization([], '/organizations'),
      '/organizations'
    );
    expectInvalidResponse(
      () =>
        normalizeOrganization(
          { ...organizationFixture, organization_code: '   ' },
          '/organizations'
        ),
      '/organizations'
    );
    expectInvalidResponse(
      () =>
        normalizeOrganization(
          { ...organizationFixture, enrollment_setup_state: undefined },
          '/organizations'
        ),
      '/organizations'
    );
  });
});

describe('normalizeBranch', () => {
  it('accepts valid BranchDto fixture payload and normalizes nested address', () => {
    const normalized = normalizeBranch(branchFixture, '/branches');
    expect(normalized).toEqual({
      branch_id: '11111111-2222-4111-8111-000000000001',
      organization_id: '11111111-1111-4111-8111-111111111101',
      branch_code: 'MED-DT',
      name: 'MedCare - Downtown Flagship',
      address: {
        line1: '24 Talaat Harb Street',
        line2: 'Ground Floor',
        city: 'Cairo',
        region: 'Downtown',
        postal_code: '11511',
        country_code: 'EG',
      },
      is_active: true,
      created_at: '2026-01-15T08:00:00+00:00',
      updated_at: '2026-11-25T10:00:00+00:00',
    });
  });

  it('normalizes omitted or null optional address fields to null', () => {
    const normalized = normalizeBranch(
      {
        ...branchFixture,
        is_active: false,
        address: {
          line1: '10 Nile Corniche',
          line2: undefined,
          city: 'Giza',
          region: null,
          postal_code: undefined,
          country_code: 'EG',
        },
      },
      '/branches'
    );
    expect(normalized.is_active).toBe(false);
    expect(normalized.address).toEqual({
      line1: '10 Nile Corniche',
      line2: null,
      city: 'Giza',
      region: null,
      postal_code: null,
      country_code: 'EG',
    });
  });

  it('rejects malformed branch fields or invalid nested address', () => {
    expectInvalidResponse(
      () => normalizeBranch('invalid', '/branches'),
      '/branches'
    );
    expectInvalidResponse(
      () =>
        normalizeBranch({ ...branchFixture, is_active: 'true' }, '/branches'),
      '/branches'
    );
    expectInvalidResponse(
      () => normalizeBranch({ ...branchFixture, address: null }, '/branches'),
      '/branches'
    );
    expectInvalidResponse(
      () =>
        normalizeBranch(
          {
            ...branchFixture,
            address: { ...branchFixture.address, city: '' },
          },
          '/branches'
        ),
      '/branches'
    );
  });
});

describe('normalizeEnrollmentToken', () => {
  it('accepts valid EnrollmentTokenResponse payload', () => {
    const endpoint =
      '/branches/11111111-2222-4111-8111-000000000001/enrollment-tokens';
    const normalized = normalizeEnrollmentToken(
      {
        token: 'enroll-fixture-placeholder-001',
        expires_at: '2026-11-26T14:00:00+00:00',
      },
      endpoint
    );
    expect(normalized).toEqual({
      token: 'enroll-fixture-placeholder-001',
      expires_at: '2026-11-26T14:00:00+00:00',
    });
  });

  it('rejects missing or empty token and expires_at fields', () => {
    const endpoint = '/branches/id/enrollment-tokens';
    expectInvalidResponse(
      () => normalizeEnrollmentToken(null, endpoint),
      endpoint
    );
    expectInvalidResponse(
      () =>
        normalizeEnrollmentToken(
          { token: '', expires_at: '2026-11-26T14:00:00+00:00' },
          endpoint
        ),
      endpoint
    );
    expectInvalidResponse(
      () =>
        normalizeEnrollmentToken(
          { token: 'enroll-fixture-placeholder-001' },
          endpoint
        ),
      endpoint
    );
  });
});

describe('normalizeRedeemEnrollment', () => {
  it('accepts valid RedeemBranchEnrollmentResponse including initial_sync_cursor: 0', () => {
    const zeroCursor = normalizeRedeemEnrollment(
      {
        organization_id: '11111111-1111-4111-8111-111111111101',
        branch_id: '11111111-2222-4111-8111-000000000001',
        runtime_credential: 'runtime-cred-fixture-placeholder',
        initial_sync_cursor: 0,
        credential_expiry: '2027-01-01T00:00:00+00:00',
      },
      '/branch-enrollment'
    );
    expect(zeroCursor.initial_sync_cursor).toBe(0);
    expect(zeroCursor.branch_id).toBe('11111111-2222-4111-8111-000000000001');

    const positiveCursor = normalizeRedeemEnrollment(
      {
        organization_id: '11111111-1111-4111-8111-111111111101',
        branch_id: '11111111-2222-4111-8111-000000000001',
        runtime_credential: 'runtime-cred-fixture-placeholder',
        initial_sync_cursor: 4205,
        credential_expiry: '2027-01-01T00:00:00+00:00',
      },
      '/branch-enrollment'
    );
    expect(positiveCursor.initial_sync_cursor).toBe(4205);
  });

  it('rejects non-integer initial_sync_cursor or missing fields', () => {
    expectInvalidResponse(
      () => normalizeRedeemEnrollment(undefined, '/branch-enrollment'),
      '/branch-enrollment'
    );
    expectInvalidResponse(
      () =>
        normalizeRedeemEnrollment(
          {
            organization_id: '11111111-1111-4111-8111-111111111101',
            branch_id: '11111111-2222-4111-8111-000000000001',
            runtime_credential: 'runtime-cred-fixture-placeholder',
            initial_sync_cursor: 1.5,
            credential_expiry: '2027-01-01T00:00:00+00:00',
          },
          '/branch-enrollment'
        ),
      '/branch-enrollment'
    );
    expectInvalidResponse(
      () =>
        normalizeRedeemEnrollment(
          {
            organization_id: '11111111-1111-4111-8111-111111111101',
            branch_id: '11111111-2222-4111-8111-000000000001',
            runtime_credential: 'runtime-cred-fixture-placeholder',
            initial_sync_cursor: '0',
            credential_expiry: '2027-01-01T00:00:00+00:00',
          },
          '/branch-enrollment'
        ),
      '/branch-enrollment'
    );
  });
});

describe('normalizeEmployee', () => {
  it('accepts valid EmployeeDto payload with populated nullable fields', () => {
    const normalized = normalizeEmployee(VALID_EMPLOYEE_PAYLOAD, '/employees');
    expect(normalized.employee_no).toBe('EMP-001');
    expect(normalized.email).toBe('sarah.pharm@medcare.test');
    expect(normalized.phone).toBe('+201001234567');
    expect(normalized.address.city).toBe('Cairo');
  });

  it('normalizes email and phone set to null or undefined to null', () => {
    const withNulls = normalizeEmployee(
      {
        ...VALID_EMPLOYEE_PAYLOAD,
        email: null,
        phone: null,
      },
      '/employees'
    );
    expect(withNulls.email).toBeNull();
    expect(withNulls.phone).toBeNull();

    const withUndefined = normalizeEmployee(
      {
        ...VALID_EMPLOYEE_PAYLOAD,
        email: undefined,
        phone: undefined,
      },
      '/employees'
    );
    expect(withUndefined.email).toBeNull();
    expect(withUndefined.phone).toBeNull();
  });

  it('rejects malformed nullable fields, missing strings, or invalid address', () => {
    expectInvalidResponse(
      () => normalizeEmployee(null, '/employees'),
      '/employees'
    );
    expectInvalidResponse(
      () =>
        normalizeEmployee(
          { ...VALID_EMPLOYEE_PAYLOAD, email: 12345 },
          '/employees'
        ),
      '/employees'
    );
    expectInvalidResponse(
      () =>
        normalizeEmployee(
          { ...VALID_EMPLOYEE_PAYLOAD, phone: false },
          '/employees'
        ),
      '/employees'
    );
    expectInvalidResponse(
      () =>
        normalizeEmployee(
          { ...VALID_EMPLOYEE_PAYLOAD, full_name: '  ' },
          '/employees'
        ),
      '/employees'
    );
    expectInvalidResponse(
      () =>
        normalizeEmployee(
          { ...VALID_EMPLOYEE_PAYLOAD, address: {} },
          '/employees'
        ),
      '/employees'
    );
  });
});

describe('normalizeUser', () => {
  it('accepts valid UserDto payloads including ALL scope with empty branch_ids and access_failed_count: 0', () => {
    const admin = normalizeUser(VALID_USER_PAYLOAD, '/users');
    expect(admin.role).toBe('Admin');
    expect(admin.branch_scope).toBe('ALL');
    expect(admin.branch_ids).toEqual([]);
    expect(admin.access_failed_count).toBe(0);
    expect(admin.lockout_end).toBeNull();

    const cashier = normalizeUser(
      {
        ...VALID_USER_PAYLOAD,
        role: 'Cashier',
        branch_scope: 'ASSIGNED',
        branch_ids: ['11111111-2222-4111-8111-000000000001'],
        last_login_at: undefined,
        lockout_end: '2026-11-26T15:00:00+00:00',
        access_failed_count: 3,
        is_active: false,
      },
      '/users'
    );
    expect(cashier.role).toBe('Cashier');
    expect(cashier.branch_scope).toBe('ASSIGNED');
    expect(cashier.branch_ids).toEqual([
      '11111111-2222-4111-8111-000000000001',
    ]);
    expect(cashier.last_login_at).toBeNull();
    expect(cashier.lockout_end).toBe('2026-11-26T15:00:00+00:00');
    expect(cashier.access_failed_count).toBe(3);
    expect(cashier.is_active).toBe(false);
  });

  it('rejects invalid enums, malformed branch_ids, non-integer access_failed_count, or bad nullable dates', () => {
    expectInvalidResponse(() => normalizeUser(null, '/users'), '/users');
    expectInvalidResponse(
      () => normalizeUser({ ...VALID_USER_PAYLOAD, role: 'Manager' }, '/users'),
      '/users'
    );
    expectInvalidResponse(
      () =>
        normalizeUser(
          { ...VALID_USER_PAYLOAD, branch_scope: 'SINGLE' },
          '/users'
        ),
      '/users'
    );
    expectInvalidResponse(
      () =>
        normalizeUser({ ...VALID_USER_PAYLOAD, branch_ids: 'none' }, '/users'),
      '/users'
    );
    expectInvalidResponse(
      () =>
        normalizeUser({ ...VALID_USER_PAYLOAD, branch_ids: ['   '] }, '/users'),
      '/users'
    );
    expectInvalidResponse(
      () =>
        normalizeUser(
          { ...VALID_USER_PAYLOAD, last_login_at: 1700000000 },
          '/users'
        ),
      '/users'
    );
    expectInvalidResponse(
      () =>
        normalizeUser({ ...VALID_USER_PAYLOAD, lockout_end: true }, '/users'),
      '/users'
    );
    expectInvalidResponse(
      () =>
        normalizeUser(
          { ...VALID_USER_PAYLOAD, access_failed_count: 1.25 },
          '/users'
        ),
      '/users'
    );
    expectInvalidResponse(
      () =>
        normalizeUser(
          { ...VALID_USER_PAYLOAD, access_failed_count: undefined },
          '/users'
        ),
      '/users'
    );
  });
});
