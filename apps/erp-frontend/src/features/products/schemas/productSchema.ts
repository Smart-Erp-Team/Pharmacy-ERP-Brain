import { z } from 'zod';
import type {
  CreateProductRequest,
  CreateProductUomItemRequest,
  Product,
  UpdateProductRequest,
} from '../../../types/api';

const NON_NEGATIVE_DECIMAL_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const SIGNED_DECIMAL_PATTERN = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

function parseNonNegativeDecimal(value: string): number | null {
  const trimmed = value.trim();
  if (!NON_NEGATIVE_DECIMAL_PATTERN.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseSignedDecimal(value: string): number | null {
  const trimmed = value.trim();
  if (!SIGNED_DECIMAL_PATTERN.test(trimmed)) {
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

/**
 * Converts a Stage 1 fractional `tax_rate` number (`0..1`, e.g. `0.14`) into a
 * clean display percent string (e.g. `"14"` or `"14.5"`) without IEEE-754 float drift.
 */
export function taxRateDtoToPercentString(taxRate: number): string {
  if (!Number.isFinite(taxRate) || taxRate <= 0) {
    return '0';
  }
  const cleanPercent = Number((taxRate * 100).toPrecision(12));
  return String(cleanPercent);
}

/**
 * Converts a display percent string (`"14"` -> `0.14`) into a native Stage 1
 * fractional `tax_rate` number (`0..1`) without IEEE-754 float drift.
 */
export function percentToTaxRateDto(percent: string): number {
  const parsed = parseNonNegativeDecimal(percent);
  if (parsed === null || parsed <= 0) {
    return 0;
  }
  return Number((parsed / 100).toPrecision(12));
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
    const parsed = parseSignedDecimal(value);
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
    const parsed = parseSignedDecimal(values.sale_unit_price);
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
    }
  });

const productCoreFields = {
  category_id: z.string().trim().min(1, 'Category is required'),
  sku: z
    .string()
    .trim()
    .min(1, 'SKU is required')
    .max(40, 'SKU must be at most 40 characters'),
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
  const baseUom: CreateProductUomItemRequest = {
    uom_code: baseUomCode,
    display_name: values.base_uom.display_name.trim(),
    conversion_to_base: 1,
    sale_unit_price: values.base_uom.is_sellable
      ? (parseNonNegativeDecimal(values.base_uom.sale_unit_price) ?? 0)
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
  base_uom_code: z
    .string()
    .trim()
    .min(1, 'Base UOM code is required')
    .max(20, 'Base UOM code must be at most 20 characters'),
  is_active: z.boolean(),
});

export type EditProductFormValues = z.infer<typeof editProductFormSchema>;

export function productDtoToEditFormValues(
  product: Product
): EditProductFormValues {
  return {
    category_id: product.category_id,
    sku: product.sku,
    base_uom_code: product.base_uom_code,
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

export function toPatchProductPayload(
  values: EditProductFormValues
): UpdateProductRequest {
  return {
    category_id: values.category_id.trim(),
    sku: values.sku.trim(),
    base_uom_code: values.base_uom_code.trim(),
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

export const toProductPatchPayload = toPatchProductPayload;
export const toUpdateProductPayload = toPatchProductPayload;
