import { z } from 'zod';
import type { AddressDto } from '../../types/api';

export const addressSchema = z.object({
  line1: z
    .string()
    .trim()
    .min(1, 'Address line 1 is required')
    .max(200, 'Address line 1 must be at most 200 characters'),
  line2: z
    .string()
    .trim()
    .max(200, 'Address line 2 must be at most 200 characters'),
  city: z
    .string()
    .trim()
    .min(1, 'City is required')
    .max(100, 'City must be at most 100 characters'),
  region: z.string().trim().max(100, 'Region must be at most 100 characters'),
  postal_code: z
    .string()
    .trim()
    .max(20, 'Postal code must be at most 20 characters'),
  country_code: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z]{2}$/,
      'Country code must be a 2-letter ISO code (for example EG)'
    ),
});

export type AddressFormValues = z.infer<typeof addressSchema>;

export const DEFAULT_ADDRESS_VALUES: AddressFormValues = {
  line1: '',
  line2: '',
  city: '',
  region: '',
  postal_code: '',
  country_code: 'EG',
};

export function addressDtoToFormValues(
  address?: AddressDto
): AddressFormValues {
  if (!address) {
    return { ...DEFAULT_ADDRESS_VALUES };
  }
  return {
    line1: address.line1,
    line2: address.line2 ?? '',
    city: address.city,
    region: address.region ?? '',
    postal_code: address.postal_code ?? '',
    country_code: address.country_code,
  };
}

export function toAddressDto(values: AddressFormValues): AddressDto {
  const line2 = values.line2.trim();
  const region = values.region.trim();
  const postalCode = values.postal_code.trim();

  return {
    line1: values.line1.trim(),
    line2: line2.length > 0 ? line2 : null,
    city: values.city.trim(),
    region: region.length > 0 ? region : null,
    postal_code: postalCode.length > 0 ? postalCode : null,
    country_code: values.country_code.trim().toUpperCase(),
  };
}
