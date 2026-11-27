import { describe, it, expect, vi } from 'vitest';
import type { UseFormSetError } from 'react-hook-form';
import { ApiClientError } from '../../../lib/api/client';
import type { Employee } from '../../../types/api';
import { applyEmployeeFormApiError } from './employeeErrorMapper';
import {
  DEFAULT_EMPLOYEE_FORM_VALUES,
  employeeDtoToFormValues,
  employeeFormSchema,
  toEmployeeCreatePayload,
  toEmployeePatchPayload,
  type EmployeeFormValues,
} from './employeeSchema';

const VALID_BRANCH_ID = '11111111-2222-4111-8111-000000000001';

describe('employeeSchema', () => {
  it('validates a complete employee payload, omits is_active on create, and omits immutable fields on patch', () => {
    const parsed = employeeFormSchema.parse({
      branch_id: ` ${VALID_BRANCH_ID} `,
      employee_no: ' EMP-010 ',
      full_name: ' Nadia Samir ',
      job_title: ' Clinical Pharmacist ',
      email: '',
      phone: '   ',
      hired_on: '2026-02-15',
      is_active: false,
      address: {
        line1: ' 22 Nile Corniche ',
        line2: '',
        city: ' Cairo ',
        region: '   ',
        postal_code: '',
        country_code: ' eg ',
      },
    });

    const createPayload = toEmployeeCreatePayload(parsed);
    expect(createPayload).toEqual({
      branch_id: VALID_BRANCH_ID,
      employee_no: 'EMP-010',
      full_name: 'Nadia Samir',
      job_title: 'Clinical Pharmacist',
      email: null,
      phone: null,
      hired_on: '2026-02-15',
      address: {
        line1: '22 Nile Corniche',
        line2: null,
        city: 'Cairo',
        region: null,
        postal_code: null,
        country_code: 'EG',
      },
    });
    expect('is_active' in createPayload).toBe(false);

    const patchPayload = toEmployeePatchPayload(parsed);
    expect(patchPayload).toEqual({
      full_name: 'Nadia Samir',
      job_title: 'Clinical Pharmacist',
      email: null,
      phone: null,
      is_active: false,
      address: {
        line1: '22 Nile Corniche',
        line2: null,
        city: 'Cairo',
        region: null,
        postal_code: null,
        country_code: 'EG',
      },
    });
    expect('branch_id' in patchPayload).toBe(false);
    expect('employee_no' in patchPayload).toBe(false);
    expect('hired_on' in patchPayload).toBe(false);
  });

  it('keeps trimmed non-empty optional email and phone on create and patch payloads', () => {
    const parsed = employeeFormSchema.parse({
      branch_id: VALID_BRANCH_ID,
      employee_no: 'EMP-011',
      full_name: 'Heba Nabil',
      job_title: ' Shift Lead ',
      email: ' heba@medcare.test ',
      phone: ' +20 100 000 1111 ',
      hired_on: '2024-02-29',
      is_active: true,
      address: {
        line1: '10 Nasr St',
        line2: 'Floor 2',
        city: 'Cairo',
        region: 'Cairo Governorate',
        postal_code: '11511',
        country_code: 'EG',
      },
    });

    const createPayload = toEmployeeCreatePayload(parsed);
    expect(createPayload.job_title).toBe('Shift Lead');
    expect(createPayload.email).toBe('heba@medcare.test');
    expect(createPayload.phone).toBe('+20 100 000 1111');

    const patchPayload = toEmployeePatchPayload(parsed);
    expect(patchPayload.job_title).toBe('Shift Lead');
    expect(patchPayload.email).toBe('heba@medcare.test');
    expect(patchPayload.phone).toBe('+20 100 000 1111');
  });

  it('rejects missing required fields including job_title, invalid email, and impossible calendar dates', () => {
    const result = employeeFormSchema.safeParse({
      ...DEFAULT_EMPLOYEE_FORM_VALUES,
      job_title: '   ',
      email: 'not-an-email',
      hired_on: '2025-02-29',
      address: {
        ...DEFAULT_EMPLOYEE_FORM_VALUES.address,
        country_code: 'EGY',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('branch_id');
      expect(paths).toContain('employee_no');
      expect(paths).toContain('full_name');
      expect(paths).toContain('job_title');
      expect(paths).toContain('email');
      expect(paths).toContain('hired_on');
      expect(paths).toContain('address.line1');
      expect(paths).toContain('address.city');
      expect(paths).toContain('address.country_code');
    }
  });

  it('rejects non-UUID branch_id values', () => {
    const result = employeeFormSchema.safeParse({
      ...DEFAULT_EMPLOYEE_FORM_VALUES,
      branch_id: 'not-a-uuid',
      employee_no: 'EMP-1',
      full_name: 'Test User',
      job_title: 'Pharmacist',
      hired_on: '2026-01-15',
      address: {
        ...DEFAULT_EMPLOYEE_FORM_VALUES.address,
        line1: '10 Nile St',
        city: 'Cairo',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const branchIssues = result.error.issues.filter(
        (issue) => issue.path.join('.') === 'branch_id'
      );
      expect(branchIssues).toHaveLength(1);
      expect(branchIssues[0]?.message).toBe('Home branch must be a valid UUID');
    }
  });

  it('emits only required error when hired_on is empty and rejects malformed dates', () => {
    const emptyResult = employeeFormSchema.safeParse({
      ...DEFAULT_EMPLOYEE_FORM_VALUES,
      branch_id: VALID_BRANCH_ID,
      employee_no: 'EMP-1',
      full_name: 'Test User',
      job_title: 'Pharmacist',
      address: {
        ...DEFAULT_EMPLOYEE_FORM_VALUES.address,
        line1: '10 Nile St',
        city: 'Cairo',
      },
      hired_on: '   ',
    });

    expect(emptyResult.success).toBe(false);
    if (!emptyResult.success) {
      const hireIssues = emptyResult.error.issues.filter(
        (issue) => issue.path.join('.') === 'hired_on'
      );
      expect(hireIssues).toHaveLength(1);
      expect(hireIssues[0]?.message).toBe('Hire date is required');
    }

    const badFormat = employeeFormSchema.safeParse({
      ...DEFAULT_EMPLOYEE_FORM_VALUES,
      branch_id: VALID_BRANCH_ID,
      employee_no: 'EMP-1',
      full_name: 'Test User',
      job_title: 'Pharmacist',
      address: {
        ...DEFAULT_EMPLOYEE_FORM_VALUES.address,
        line1: '10 Nile St',
        city: 'Cairo',
      },
      hired_on: '2026-13-01',
    });
    expect(badFormat.success).toBe(false);
  });

  it('enforces max lengths on employee_no, full_name, job_title, email, and phone', () => {
    const result = employeeFormSchema.safeParse({
      branch_id: VALID_BRANCH_ID,
      employee_no: 'E'.repeat(31),
      full_name: 'N'.repeat(151),
      job_title: 'J'.repeat(81),
      email: `${'a'.repeat(245)}@example.com`,
      phone: '1'.repeat(31),
      hired_on: '2026-01-10',
      is_active: true,
      address: {
        line1: '10 Tahrir Sq',
        line2: '',
        city: 'Cairo',
        region: '',
        postal_code: '',
        country_code: 'EG',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('employee_no');
      expect(paths).toContain('full_name');
      expect(paths).toContain('job_title');
      expect(paths).toContain('email');
      expect(paths).toContain('phone');
    }
  });

  it('converts Stage 1 Employee with nullable contact fields into form values', () => {
    const employee: Employee = {
      employee_id: '11111111-3333-4111-8111-000000000009',
      organization_id: '11111111-1111-4111-8111-111111111101',
      branch_id: VALID_BRANCH_ID,
      employee_no: 'EMP-009',
      full_name: 'Tamer Fathy',
      email: null,
      phone: null,
      job_title: 'Dispensing Pharmacist',
      hired_on: '2025-05-01',
      is_active: false,
      address: {
        line1: '5 Corniche Rd',
        line2: null,
        city: 'Alexandria',
        region: null,
        postal_code: null,
        country_code: 'EG',
      },
      created_at: '2025-05-01T09:00:00.000Z',
      updated_at: '2025-05-01T09:00:00.000Z',
    };

    expect(employeeDtoToFormValues(employee)).toEqual({
      branch_id: VALID_BRANCH_ID,
      employee_no: 'EMP-009',
      full_name: 'Tamer Fathy',
      job_title: 'Dispensing Pharmacist',
      email: '',
      phone: '',
      hired_on: '2025-05-01',
      is_active: false,
      address: {
        line1: '5 Corniche Rd',
        line2: '',
        city: 'Alexandria',
        region: '',
        postal_code: '',
        country_code: 'EG',
      },
    });
  });
});

describe('applyEmployeeFormApiError', () => {
  it('maps 422 VALIDATION_ERROR field details via setError and returns null', () => {
    const setError = vi.fn<UseFormSetError<EmployeeFormValues>>();
    const error = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        trace_id: 'trace-emp-422',
        details: [
          { field: 'job_title', issue: 'Job title is required.' },
          { field: 'email', issue: 'Email is already in use.' },
          { field: 'address.city', issue: 'Invalid city.' },
          { field: 'hired_on', issue: 'Hire date cannot be in the future.' },
          { field: 'is_active', issue: 'Active status must be a boolean.' },
        ],
      },
      422
    );

    const result = applyEmployeeFormApiError(error, setError);

    expect(result).toBeNull();
    expect(setError).toHaveBeenCalledTimes(5);
    expect(setError).toHaveBeenCalledWith('job_title', {
      type: 'server',
      message: 'Job title is required.',
    });
    expect(setError).toHaveBeenCalledWith('email', {
      type: 'server',
      message: 'Email is already in use.',
    });
    expect(setError).toHaveBeenCalledWith('address.city', {
      type: 'server',
      message: 'Invalid city.',
    });
    expect(setError).toHaveBeenCalledWith('hired_on', {
      type: 'server',
      message: 'Hire date cannot be in the future.',
    });
    expect(setError).toHaveBeenCalledWith('is_active', {
      type: 'server',
      message: 'Active status must be a boolean.',
    });
  });

  it('returns message and trace_id on 422 VALIDATION_ERROR when no fields map', () => {
    const setError = vi.fn<UseFormSetError<EmployeeFormValues>>();
    const error = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed.',
        trace_id: 'trace-emp-422-unmapped',
        details: [
          { field: 'idempotency_key', issue: 'Key exceeds 100 characters.' },
        ],
      },
      422
    );

    const result = applyEmployeeFormApiError(error, setError);

    expect(setError).not.toHaveBeenCalled();
    expect(result).toBe('Validation failed. (Trace: trace-emp-422-unmapped)');
  });

  it('returns message and trace_id on 409 CONFLICT even when details map to employee_no', () => {
    const setError = vi.fn<UseFormSetError<EmployeeFormValues>>();
    const error = new ApiClientError(
      {
        code: 'CONFLICT',
        message: 'Employee number "EMP-001" already exists.',
        trace_id: 'trace-emp-409',
        details: [
          {
            field: 'employee_no',
            issue: 'Employee number must be unique within the organization.',
          },
        ],
      },
      409
    );

    const result = applyEmployeeFormApiError(error, setError);

    expect(setError).toHaveBeenCalledWith('employee_no', {
      type: 'server',
      message: 'Employee number must be unique within the organization.',
    });
    expect(result).toBe(
      'Employee number "EMP-001" already exists. (Trace: trace-emp-409)'
    );
  });

  it('returns message and trace_id on 400 MALFORMED_REQUEST', () => {
    const setError = vi.fn<UseFormSetError<EmployeeFormValues>>();
    const error = new ApiClientError(
      {
        code: 'MALFORMED_REQUEST',
        message: 'Request body must be a valid JSON object.',
        trace_id: 'trace-emp-400',
        details: [],
      },
      400
    );

    const result = applyEmployeeFormApiError(error, setError);

    expect(setError).not.toHaveBeenCalled();
    expect(result).toBe(
      'Request body must be a valid JSON object. (Trace: trace-emp-400)'
    );
  });

  it('returns fallback message for non-ApiClientError failures', () => {
    const setError = vi.fn<UseFormSetError<EmployeeFormValues>>();

    expect(applyEmployeeFormApiError(new Error('Network down'), setError)).toBe(
      'Unable to save employee. Please try again.'
    );
    expect(setError).not.toHaveBeenCalled();
  });
});
