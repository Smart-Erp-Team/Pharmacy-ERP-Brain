import { z } from 'zod';
import { LOCATION_TYPES } from '../../../lib/api/catalogInventoryNormalizers';
import type {
  CreateInventoryLocationRequest,
  InventoryLocation,
  LocationType,
  UpdateInventoryLocationRequest,
} from '../../../types/api';

export { LOCATION_TYPES };

export function isSellableAllowedForLocationType(
  locationType: LocationType
): boolean {
  return locationType === 'SELLABLE';
}

const locationNameSchema = z
  .string()
  .trim()
  .min(1, 'Location name is required')
  .max(100, 'Location name must be at most 100 characters');

export const createLocationFormSchema = z
  .object({
    location_code: z
      .string()
      .trim()
      .min(1, 'Location code is required')
      .max(30, 'Location code must be at most 30 characters'),
    name: locationNameSchema,
    location_type: z.enum(LOCATION_TYPES, {
      errorMap: () => ({
        message:
          'Location type must be SELLABLE, QUARANTINE, DAMAGED, or SCRAP',
      }),
    }),
    is_sellable: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (
      !isSellableAllowedForLocationType(values.location_type) &&
      values.is_sellable
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['is_sellable'],
        message: 'Only SELLABLE locations can be marked as sellable',
      });
    }
  });

export type CreateLocationFormValues = z.infer<typeof createLocationFormSchema>;

export const editLocationFormSchema = z.object({
  name: locationNameSchema,
  is_sellable: z.boolean(),
  is_active: z.boolean(),
});

export type EditLocationFormValues = z.infer<typeof editLocationFormSchema>;

export function createEditLocationFormSchema(locationType: LocationType) {
  return editLocationFormSchema.superRefine((values, ctx) => {
    if (!isSellableAllowedForLocationType(locationType) && values.is_sellable) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['is_sellable'],
        message: 'Only SELLABLE locations can be marked as sellable',
      });
    }
  });
}

export const DEFAULT_LOCATION_FORM_VALUES: CreateLocationFormValues = {
  location_code: '',
  name: '',
  location_type: 'SELLABLE',
  is_sellable: true,
};

export function locationDtoToFormValues(
  location: InventoryLocation
): EditLocationFormValues {
  return {
    name: location.name,
    is_sellable: location.is_sellable,
    is_active: location.is_active,
  };
}

export function toCreateLocationPayload(
  values: CreateLocationFormValues,
  branchId: string
): CreateInventoryLocationRequest {
  return {
    branch_id: branchId.trim(),
    location_code: values.location_code.trim(),
    name: values.name.trim(),
    location_type: values.location_type,
    is_sellable: isSellableAllowedForLocationType(values.location_type)
      ? values.is_sellable
      : false,
  };
}

export function toLocationPatchPayload(
  values: EditLocationFormValues
): UpdateInventoryLocationRequest {
  return {
    name: values.name.trim(),
    is_sellable: values.is_sellable,
    is_active: values.is_active,
  };
}
