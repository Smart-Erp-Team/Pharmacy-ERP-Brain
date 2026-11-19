import { describe, it, expect } from 'vitest';
import {
  branchDtoToFormValues,
  branchEnrollmentSchema,
  branchFormSchema,
  DEFAULT_BRANCH_FORM_VALUES,
  toBranchCreatePayload,
  toBranchPatchPayload,
} from './branchSchema';
import type { BranchDto } from '../../../types/api';

describe('branchSchema', () => {
  it('validates a complete branch payload and maps create/patch requests cleanly', () => {
    const valid = {
      code: ' CAI-01 ',
      name: ' Cairo Main Branch ',
      is_active: true,
      address: {
        line1: ' 15 Tahrir Square ',
        line2: '   ',
        city: ' Cairo ',
        region: ' Cairo Governorate ',
        postal_code: '',
        country_code: ' eg ',
      },
    };

    const parsed = branchFormSchema.parse(valid);
    const createPayload = toBranchCreatePayload(parsed);
    const patchPayload = toBranchPatchPayload(parsed);

    expect(createPayload).toEqual({
      code: 'CAI-01',
      name: 'Cairo Main Branch',
      is_active: true,
      address: {
        line1: '15 Tahrir Square',
        line2: null,
        city: 'Cairo',
        region: 'Cairo Governorate',
        postal_code: null,
        country_code: 'EG',
      },
    });

    expect(patchPayload).toEqual({
      name: 'Cairo Main Branch',
      is_active: true,
      address: createPayload.address,
    });
    expect('code' in patchPayload).toBe(false);
  });

  it('rejects missing required fields and invalid country codes', () => {
    const result = branchFormSchema.safeParse({
      ...DEFAULT_BRANCH_FORM_VALUES,
      address: {
        ...DEFAULT_BRANCH_FORM_VALUES.address,
        country_code: 'EGY',
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('code');
      expect(paths).toContain('name');
      expect(paths).toContain('address.line1');
      expect(paths).toContain('address.city');
      expect(paths).toContain('address.country_code');
    }
  });

  it('converts BranchDto with missing optional address fields to form values', () => {
    const branch: BranchDto = {
      branch_id: 'b-1',
      organization_id: 'org-1',
      code: 'ALX-01',
      name: 'Alexandria Branch',
      is_active: false,
      address: {
        line1: '10 Corniche Rd',
        city: 'Alexandria',
        country_code: 'EG',
      },
    };

    expect(branchDtoToFormValues(branch)).toEqual({
      code: 'ALX-01',
      name: 'Alexandria Branch',
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

  it('requires a non-empty enrollment token', () => {
    expect(branchEnrollmentSchema.safeParse({ token: '   ' }).success).toBe(
      false
    );
    expect(branchEnrollmentSchema.safeParse({ token: 'tok_123' }).success).toBe(
      true
    );
  });
});
