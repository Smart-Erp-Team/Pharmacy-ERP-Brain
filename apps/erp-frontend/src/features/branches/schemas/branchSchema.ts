import { z } from 'zod';
import {
  addressSchema,
  DEFAULT_ADDRESS_VALUES,
  addressDtoToFormValues,
  toAddressDto,
} from '../../../lib/schemas/addressSchema';
import type {
  BranchDto,
  BranchPatchRequest,
  BranchRequest,
} from '../../../types/api';

export const branchFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Branch code is required')
    .max(30, 'Branch code must be at most 30 characters'),
  name: z
    .string()
    .trim()
    .min(1, 'Branch name is required')
    .max(150, 'Branch name must be at most 150 characters'),
  is_active: z.boolean(),
  address: addressSchema,
});

export type BranchFormValues = z.infer<typeof branchFormSchema>;

export const DEFAULT_BRANCH_FORM_VALUES: BranchFormValues = {
  code: '',
  name: '',
  is_active: true,
  address: { ...DEFAULT_ADDRESS_VALUES },
};

export function branchDtoToFormValues(branch: BranchDto): BranchFormValues {
  return {
    code: branch.code,
    name: branch.name,
    is_active: branch.is_active,
    address: addressDtoToFormValues(branch.address),
  };
}

export function toBranchCreatePayload(values: BranchFormValues): BranchRequest {
  return {
    code: values.code.trim(),
    name: values.name.trim(),
    is_active: values.is_active,
    address: toAddressDto(values.address),
  };
}

export function toBranchPatchPayload(
  values: BranchFormValues
): BranchPatchRequest {
  return {
    name: values.name.trim(),
    is_active: values.is_active,
    address: toAddressDto(values.address),
  };
}

export const branchEnrollmentSchema = z.object({
  token: z.string().trim().min(1, 'Enrollment token is required'),
});

export type BranchEnrollmentFormValues = z.infer<typeof branchEnrollmentSchema>;
