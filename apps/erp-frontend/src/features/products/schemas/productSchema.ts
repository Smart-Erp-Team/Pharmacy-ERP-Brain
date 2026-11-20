import { z } from 'zod';
import type {
  CreateProductRequest,
  ProductDto,
  ProductPatchRequest,
  ProductUomRequest,
} from '../../../types/api';

const NON_NEGATIVE_DECIMAL_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const NON_NEGATIVE_NUMERIC_4_PATTERN = /^\d{1,14}(\.\d{1,4})?$/;

function parseDecimalInput(value: string): number | null {
  const trimmed = value.trim();
  if (!NON_NEGATIVE_DECIMAL_PATTERN.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSignedDecimalInput(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeOptionalString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatFixedDecimal(value: string, decimals: number): string {
  const trimmed = value.trim();
  if (!NON_NEGATIVE_DECIMAL_PATTERN.test(trimmed)) {
    return (0).toFixed(decimals);
  }
  const [rawInt = '', rawFrac = ''] = trimmed.split('.');
  const normInt = rawInt.replace(/^0+(?=\d)/, '') || '0';
  if (rawFrac.length <= decimals) {
    return `${normInt}.${rawFrac.padEnd(decimals, '0')}`;
  }

  const keptFrac = rawFrac.slice(0, decimals);
  const nextDigit = Number(rawFrac[decimals] ?? '0');
  let scaled = BigInt(`${normInt}${keptFrac}`);
  if (nextDigit >= 5) {
    scaled += 1n;
  }
  const digits = scaled.toString().padStart(decimals + 1, '0');
  const splitIndex = digits.length - decimals;
  return `${digits.slice(0, splitIndex)}.${digits.slice(splitIndex)}`;
}

/**
 * Converts a fractional TaxRate DTO string (for example `"0.1400"`) into a
 * display percent string (for example `"14"` or `"14.5"`) without float drift.
 */
export function taxRateDtoToPercentString(taxRate: string): string {
  const trimmed = taxRate.trim();
  if (!NON_NEGATIVE_DECIMAL_PATTERN.test(trimmed)) {
    return '0';
  }

  const [intPart = '0', fracPart = ''] = trimmed.split('.');
  const paddedFrac = fracPart.padEnd(2, '0');
  const shiftedInt =
    `${intPart}${paddedFrac.slice(0, 2)}`.replace(/^0+(?=\d)/, '') || '0';
  const shiftedFrac = paddedFrac.slice(2).replace(/0+$/, '');

  return shiftedFrac.length > 0 ? `${shiftedInt}.${shiftedFrac}` : shiftedInt;
}

/**
 * Converts a percent string (`"14"` -> `"0.1400"`) into a fractional 4dp
 * TaxRate DTO string using integer scaling.
 */
export function percentToTaxRateDto(percent: string): string {
  const parsed = parseDecimalInput(percent);
  if (parsed === null) {
    return '0.0000';
  }
  const scaled = Math.round(parsed * 100) / 10000;
  return scaled.toFixed(4);
}

const optionalImageUrlSchema = z
  .string()
  .trim()
  .max(300, 'Image URL must be at most 300 characters')
  .refine(
    (value) => value === '' || isValidHttpUrl(value),
    'Image URL must be a valid http or https URL'
  );

const taxPercentSchema = z
  .string()
  .trim()
  .min(1, 'Tax rate is required')
  .superRefine((value, ctx) => {
    const parsed = parseSignedDecimalInput(value);
    if (parsed === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tax rate must be a valid number',
      });
      return;
    }
    if (value.startsWith('-') || parsed < 0 || parsed > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tax rate must be between 0 and 100',
      });
    }
  });

const expiryAlertDaysSchema = z
  .string()
  .trim()
  .min(1, 'Expiry alert days is required')
  .superRefine((value, ctx) => {
    if (!/^-?\d+$/.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Expiry alert days must be a whole number between 0 and 3650',
      });
      return;
    }
    const parsed = Number(value);
    if (
      value.startsWith('-') ||
      !Number.isInteger(parsed) ||
      parsed < 0 ||
      parsed > 3650
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Expiry alert days must be between 0 and 3650',
      });
    }
  });

const baseUomFormSchema = z
  .object({
    uom_code: z
      .string()
      .trim()
      .min(1, 'Base UOM code is required')
      .max(20, 'Base UOM code must be at most 20 characters'),
    display_name: z
      .string()
      .trim()
      .min(1, 'Display name is required')
      .max(50, 'Display name must be at most 50 characters'),
    is_sellable: z.boolean(),
    is_purchasable: z.boolean(),
    sale_unit_price: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (!values.is_sellable) {
      return;
    }
    if (!values.sale_unit_price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sale_unit_price'],
        message: 'Sale unit price is required when UOM is sellable',
      });
      return;
    }
    const parsed = parseSignedDecimalInput(values.sale_unit_price);
    if (
      values.sale_unit_price.startsWith('-') ||
      parsed === null ||
      parsed < 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sale_unit_price'],
        message: 'Sale unit price must be a non-negative number',
      });
      return;
    }
    if (
      !NON_NEGATIVE_NUMERIC_4_PATTERN.test(
        formatFixedDecimal(values.sale_unit_price, 4)
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sale_unit_price'],
        message: 'Sale unit price exceeds maximum supported value',
      });
    }
  });

const productCoreFields = {
  category_id: z.string().trim().min(1, 'Category is required'),
  name: z
    .string()
    .trim()
    .min(1, 'Product name is required')
    .max(180, 'Product name must be at most 180 characters'),
  barcode: z.string().trim().max(80, 'Barcode must be at most 80 characters'),
  generic_name: z
    .string()
    .trim()
    .max(180, 'Generic name must be at most 180 characters'),
  brand_name: z
    .string()
    .trim()
    .max(180, 'Brand name must be at most 180 characters'),
  image_url: optionalImageUrlSchema,
  tax_percent: taxPercentSchema,
  lot_tracking_required: z.boolean(),
  expiry_alert_days: expiryAlertDaysSchema,
};

export const createProductFormSchema = z.object({
  ...productCoreFields,
  sku: z
    .string()
    .trim()
    .min(1, 'SKU is required')
    .max(40, 'SKU must be at most 40 characters'),
  base_uom: baseUomFormSchema,
});

export type CreateProductFormValues = z.infer<typeof createProductFormSchema>;

export const DEFAULT_CREATE_PRODUCT_FORM_VALUES: CreateProductFormValues = {
  category_id: '',
  sku: '',
  name: '',
  barcode: '',
  generic_name: '',
  brand_name: '',
  image_url: '',
  tax_percent: '0',
  lot_tracking_required: false,
  expiry_alert_days: '0',
  base_uom: {
    uom_code: '',
    display_name: '',
    is_sellable: true,
    is_purchasable: true,
    sale_unit_price: '',
  },
};

export function toCreateProductPayload(
  values: CreateProductFormValues
): CreateProductRequest {
  const baseUomCode = values.base_uom.uom_code.trim();
  const baseUom: ProductUomRequest = {
    uom_code: baseUomCode,
    display_name: values.base_uom.display_name.trim(),
    conversion_to_base: '1.000000',
    sale_unit_price: values.base_uom.is_sellable
      ? formatFixedDecimal(values.base_uom.sale_unit_price, 4)
      : null,
    is_base: true,
    is_sellable: values.base_uom.is_sellable,
    is_purchasable: values.base_uom.is_purchasable,
  };

  return {
    category_id: values.category_id.trim(),
    sku: values.sku.trim(),
    barcode: normalizeOptionalString(values.barcode),
    name: values.name.trim(),
    generic_name: normalizeOptionalString(values.generic_name),
    brand_name: normalizeOptionalString(values.brand_name),
    base_uom_code: baseUomCode,
    tax_rate: percentToTaxRateDto(values.tax_percent),
    image_url: normalizeOptionalString(values.image_url),
    lot_tracking_required: values.lot_tracking_required,
    expiry_alert_days: Number(values.expiry_alert_days.trim()),
    uoms: [baseUom],
  };
}

export const editProductFormSchema = z.object({
  ...productCoreFields,
  is_active: z.boolean(),
});

export type EditProductFormValues = z.infer<typeof editProductFormSchema>;

export function productDtoToEditFormValues(
  product: ProductDto
): EditProductFormValues {
  return {
    category_id: product.category_id,
    name: product.name,
    barcode: product.barcode ?? '',
    generic_name: product.generic_name ?? '',
    brand_name: product.brand_name ?? '',
    image_url: product.image_url ?? '',
    tax_percent: taxRateDtoToPercentString(product.tax_rate),
    lot_tracking_required: product.lot_tracking_required,
    expiry_alert_days: String(product.expiry_alert_days),
    is_active: product.is_active,
  };
}

export function toProductPatchPayload(
  values: EditProductFormValues
): ProductPatchRequest {
  return {
    category_id: values.category_id.trim(),
    barcode: normalizeOptionalString(values.barcode),
    name: values.name.trim(),
    generic_name: normalizeOptionalString(values.generic_name),
    brand_name: normalizeOptionalString(values.brand_name),
    tax_rate: percentToTaxRateDto(values.tax_percent),
    image_url: normalizeOptionalString(values.image_url),
    lot_tracking_required: values.lot_tracking_required,
    expiry_alert_days: Number(values.expiry_alert_days.trim()),
    is_active: values.is_active,
  };
}
