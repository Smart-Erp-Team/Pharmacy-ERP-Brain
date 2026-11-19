import { z } from 'zod';
import type {
  InventoryLocationDto,
  InventoryLocationPatchRequest,
  InventoryLocationRequest,
  LocationType,
} from '../../../types/api';

export const LOCATION_TYPES = [
  'SELLABLE',
  'QUARANTINE',
  'SCRAP',
] as const satisfies readonly LocationType[];

const locationCoreFields = {
  name: z
    .string()
    .trim()
    .min(1, 'Location name is required')
    .max(100, 'Location name must be at most 100 characters'),
  location_type: z.enum(LOCATION_TYPES, {
    errorMap: () => ({
      message: 'Location type must be SELLABLE, QUARANTINE, or SCRAP',
    }),
  }),
  is_active: z.boolean(),
};

export const createLocationFormSchema = z.object({
  location_code: z
    .string()
    .trim()
    .min(1, 'Location code is required')
    .max(30, 'Location code must be at most 30 characters'),
  ...locationCoreFields,
});

export type CreateLocationFormValues = z.infer<typeof createLocationFormSchema>;

export const editLocationFormSchema = z.object({
  ...locationCoreFields,
});

export type EditLocationFormValues = z.infer<typeof editLocationFormSchema>;

export const DEFAULT_LOCATION_FORM_VALUES: CreateLocationFormValues = {
  location_code: '',
  name: '',
  location_type: 'SELLABLE',
  is_active: true,
};

export function locationDtoToFormValues(
  location: InventoryLocationDto
): EditLocationFormValues {
  return {
    name: location.name,
    location_type: location.location_type,
    is_active: location.is_active,
  };
}

export function toCreateLocationPayload(
  values: CreateLocationFormValues,
  branchId: string
): InventoryLocationRequest {
  return {
    branch_id: branchId.trim(),
    location_code: values.location_code.trim(),
    name: values.name.trim(),
    location_type: values.location_type,
    is_active: values.is_active,
  };
}

export function toLocationPatchPayload(
  values: EditLocationFormValues
): InventoryLocationPatchRequest {
  return {
    name: values.name.trim(),
    location_type: values.location_type,
    is_active: values.is_active,
  };
}
