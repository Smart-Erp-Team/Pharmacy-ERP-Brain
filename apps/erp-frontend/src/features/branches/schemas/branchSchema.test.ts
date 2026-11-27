import { describe, it, expect, vi } from 'vitest';
import type { UseFormSetError } from 'react-hook-form';
import branchFixture from '@contracts/fixtures/branch.json';
import { ApiClientError } from '../../../lib/api/client';
import type { Branch } from '../../../types/api';
import {
  applyBranchEnrollmentApiError,
  applyBranchFormApiError,
  mapBranchEnrollmentApiError,
} from './branchErrorMapper';
import {
  branchDtoToFormValues,
  branchEnrollmentSchema,
  branchFormSchema,
  DEFAULT_BRANCH_FORM_VALUES,
  toBranchCreatePayload,
  toBranchPatchPayload,
  toRedeemBranchEnrollmentPayload,
  type BranchEnrollmentFormValues,
  type BranchFormValues,
} from './branchSchema';

describe('branchSchema', () => {
  it('validates a complete branch payload and maps create/patch requests cleanly', () => {
    const valid = {
      branch_code: ' MED-DT ',
      name: ' MedCare - Downtown Flagship ',
      is_active: true,
      address: {
        line1: ' 24 Talaat Harb Street ',
        line2: '   ',
        city: ' Cairo ',
        region: ' Downtown ',
        postal_code: '',
        country_code: ' eg ',
      },
    };

    const parsed = branchFormSchema.parse(valid);
    const createPayload = toBranchCreatePayload(parsed);
    const patchPayload = toBranchPatchPayload(parsed);

    expect(createPayload).toEqual({
      branch_code: 'MED-DT',
      name: 'MedCare - Downtown Flagship',
      address: {
        line1: '24 Talaat Harb Street',
        line2: null,
        city: 'Cairo',
        region: 'Downtown',
        postal_code: null,
        country_code: 'EG',
      },
    });
    expect('is_active' in createPayload).toBe(false);

    expect(patchPayload).toEqual({
      name: 'MedCare - Downtown Flagship',
      is_active: true,
      address: createPayload.address,
    });
    expect('branch_code' in patchPayload).toBe(false);
  });

  it('rejects missing required fields, over-length fields, and invalid country codes', () => {
    const missingResult = branchFormSchema.safeParse({
      ...DEFAULT_BRANCH_FORM_VALUES,
      address: {
        ...DEFAULT_BRANCH_FORM_VALUES.address,
        country_code: 'EGY',
      },
    });

    expect(missingResult.success).toBe(false);
    if (!missingResult.success) {
      const paths = missingResult.error.issues.map((issue) =>
        issue.path.join('.')
      );
      expect(paths).toContain('branch_code');
      expect(paths).toContain('name');
      expect(paths).toContain('address.line1');
      expect(paths).toContain('address.city');
      expect(paths).toContain('address.country_code');
    }

    const overLengthResult = branchFormSchema.safeParse({
      branch_code: 'A'.repeat(31),
      name: 'N'.repeat(151),
      is_active: true,
      address: {
        line1: '24 Talaat Harb Street',
        line2: '',
        city: 'Cairo',
        region: '',
        postal_code: '',
        country_code: 'EG',
      },
    });

    expect(overLengthResult.success).toBe(false);
    if (!overLengthResult.success) {
      const paths = overLengthResult.error.issues.map((issue) =>
        issue.path.join('.')
      );
      expect(paths).toContain('branch_code');
      expect(paths).toContain('name');
    }
  });

  it('converts a Stage 1 Branch with nullable address fields to form values', () => {
    const normalizedFixture: Branch = branchFixture;
    expect(branchDtoToFormValues(normalizedFixture)).toEqual({
      branch_code: 'MED-DT',
      name: 'MedCare - Downtown Flagship',
      is_active: true,
      address: {
        line1: '24 Talaat Harb Street',
        line2: 'Ground Floor',
        city: 'Cairo',
        region: 'Downtown',
        postal_code: '11511',
        country_code: 'EG',
      },
    });

    const branchWithNulls: Branch = {
      ...normalizedFixture,
      branch_code: 'MED-ALX',
      name: 'MedCare - Alexandria Corniche',
      is_active: false,
      address: {
        line1: '10 Corniche Rd',
        line2: null,
        city: 'Alexandria',
        region: null,
        postal_code: null,
        country_code: 'EG',
      },
    };

    expect(branchDtoToFormValues(branchWithNulls)).toEqual({
      branch_code: 'MED-ALX',
      name: 'MedCare - Alexandria Corniche',
      is_active: false,
      address: {
        line1: '10 Corniche Rd',
        line2: '',
        city: 'Alexandria',
        region: '',
        postal_code: '',
        country_code: 'EG',
      },
    });
  });

  it('validates and trims the branch enrollment token payload', () => {
    expect(branchEnrollmentSchema.safeParse({ token: '   ' }).success).toBe(
      false
    );
    const parsed = branchEnrollmentSchema.parse({
      token: '  enr_valid_token_01  ',
    });
    expect(toRedeemBranchEnrollmentPayload(parsed)).toEqual({
      token: 'enr_valid_token_01',
    });
  });
});

describe('branchErrorMapper', () => {
  it('maps 422 VALIDATION_ERROR details onto branch form fields and returns null when covered', () => {
    const setError = vi.fn<UseFormSetError<BranchFormValues>>();
    const error = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'One or more validation errors occurred.',
        details: [
          {
            field: 'branch_code',
            issue: 'Branch code must be at most 30 characters.',
          },
          { field: 'name', issue: 'Branch name is required.' },
          { field: 'is_active', issue: 'Active flag is invalid.' },
          { field: 'address.city', issue: 'City is required.' },
        ],
        trace_id: 'trace-val-422',
      },
      422
    );

    const banner = applyBranchFormApiError(error, setError);

    expect(banner).toBeNull();
    expect(setError).toHaveBeenCalledTimes(4);
    expect(setError).toHaveBeenCalledWith('branch_code', {
      type: 'server',
      message: 'Branch code must be at most 30 characters.',
    });
    expect(setError).toHaveBeenCalledWith('address.city', {
      type: 'server',
      message: 'City is required.',
    });
  });

  it('maps 409 CONFLICT field errors and still returns the alert banner with trace_id', () => {
    const setError = vi.fn<UseFormSetError<BranchFormValues>>();
    const error = new ApiClientError(
      {
        code: 'CONFLICT',
        message: 'Branch code "MED-DT" already exists.',
        details: [
          { field: 'branch_code', issue: 'Branch code must be unique.' },
        ],
        trace_id: 'trace-conflict-409',
      },
      409
    );

    const banner = applyBranchFormApiError(error, setError);

    expect(setError).toHaveBeenCalledWith('branch_code', {
      type: 'server',
      message: 'Branch code must be unique.',
    });
    expect(banner).toBe(
      'Branch code "MED-DT" already exists. (Trace: trace-conflict-409)'
    );
  });

  it('returns the error banner with trace_id for 400 MALFORMED_REQUEST and fallback for unknown errors', () => {
    const setError = vi.fn<UseFormSetError<BranchFormValues>>();
    const malformed = new ApiClientError(
      {
        code: 'MALFORMED_REQUEST',
        message: 'The idempotency key is required.',
        details: [
          {
            field: 'Idempotency-Key',
            issue: 'The idempotency key is required.',
          },
        ],
        trace_id: 'trace-bad-400',
      },
      400
    );

    expect(applyBranchFormApiError(malformed, setError)).toBe(
      'The idempotency key is required. (Trace: trace-bad-400)'
    );
    expect(setError).not.toHaveBeenCalled();

    expect(applyBranchFormApiError(new Error('Network down'), setError)).toBe(
      'Unable to save branch. Please try again.'
    );
  });

  it('maps 401 UNAUTHORIZED enrollment errors cleanly and sets field errors on 422', () => {
    const setError = vi.fn<UseFormSetError<BranchEnrollmentFormValues>>();

    const unauthorized = new ApiClientError(
      {
        code: 'UNAUTHORIZED',
        message: 'Enrollment token is invalid, expired, or already used.',
        details: [],
        trace_id: 'trace-enr-401',
      },
      401
    );
    expect(mapBranchEnrollmentApiError(unauthorized)).toEqual({
      title: 'Invalid or expired enrollment token',
      message:
        'This enrollment token is invalid, expired, or has already been used. Ask an administrator in the head office workspace to issue a fresh token.',
    });

    const validation = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Enrollment token is required.',
        details: [{ field: 'token', issue: 'Enrollment token is required.' }],
        trace_id: 'trace-enr-422',
      },
      422
    );
    const validationState = applyBranchEnrollmentApiError(validation, setError);
    expect(setError).toHaveBeenCalledWith('token', {
      type: 'server',
      message: 'Enrollment token is required.',
    });
    expect(validationState).toEqual({
      title: 'Invalid enrollment request',
      message: 'Enrollment token is required. (Trace: trace-enr-422)',
    });

    const malformed = new ApiClientError(
      {
        code: 'MALFORMED_REQUEST',
        message: 'Request body must be valid JSON.',
        details: [],
        trace_id: 'trace-enr-400',
      },
      400
    );
    expect(mapBranchEnrollmentApiError(malformed)).toEqual({
      title: 'Malformed enrollment request',
      message: 'Request body must be valid JSON. (Trace: trace-enr-400)',
    });
  });
});
