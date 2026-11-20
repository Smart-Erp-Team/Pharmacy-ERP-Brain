import { z } from 'zod';
import type {
  ProductUomDto,
  ProductUomPatchRequest,
  ProductUomRequest,
  ReorderRuleDto,
  ReorderRuleRequest,
} from '../../../types/api';

const NON_NEGATIVE_DECIMAL_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const POSITIVE_NUMERIC_6_PATTERN = /^(?!0+(\.0{1,6})?$)\d{1,12}(\.\d{1,6})?$/;
const NON_NEGATIVE_NUMERIC_4_PATTERN = /^\d{1,14}(\.\d{1,4})?$/;
const POSITIVE_NUMERIC_4_PATTERN = /^(?!0+(\.0{1,4})?$)\d{1,14}(\.\d{1,4})?$/;

function parseSignedDecimalInput(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
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

function compareNonNegativeDecimals(a: string, b: string): number {
  const [rawIntA = '', rawFracA = ''] = a.trim().split('.');
  const [rawIntB = '', rawFracB = ''] = b.trim().split('.');
  const intA = rawIntA.replace(/^0+(?=\d)/, '') || '0';
  const intB = rawIntB.replace(/^0+(?=\d)/, '') || '0';
  if (intA.length !== intB.length) {
    return intA.length < intB.length ? -1 : 1;
  }
  if (intA !== intB) {
    return intA < intB ? -1 : 1;
  }
  const fracA = rawFracA.replace(/0+$/, '');
  const fracB = rawFracB.replace(/0+$/, '');
  const maxLen = Math.max(fracA.length, fracB.length);
  const paddedA = fracA.padEnd(maxLen, '0');
  const paddedB = fracB.padEnd(maxLen, '0');
  if (paddedA === paddedB) {
    return 0;
  }
  return paddedA < paddedB ? -1 : 1;
}

function validateSellablePrice(
  isSellable: boolean,
  saleUnitPrice: string,
  ctx: z.RefinementCtx
): void {
  if (!isSellable) {
    return;
  }
  const trimmed = saleUnitPrice.trim();
  if (!trimmed) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sale_unit_price'],
      message: 'Sale unit price is required when UOM is sellable',
    });
    return;
  }
  const parsed = parseSignedDecimalInput(trimmed);
  if (trimmed.startsWith('-') || parsed === null || parsed < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sale_unit_price'],
      message: 'Sale unit price must be a non-negative number',
    });
    return;
  }
  if (!NON_NEGATIVE_NUMERIC_4_PATTERN.test(formatFixedDecimal(trimmed, 4))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sale_unit_price'],
      message: 'Sale unit price exceeds maximum supported value',
    });
  }
}

export const createUomFormSchema = z
  .object({
    uom_code: z
      .string()
      .trim()
      .min(1, 'UOM code is required')
      .max(20, 'UOM code must be at most 20 characters'),
    display_name: z
      .string()
      .trim()
      .min(1, 'Display name is required')
      .max(50, 'Display name must be at most 50 characters'),
    conversion_to_base: z.string().trim(),
    is_base: z.boolean(),
    is_sellable: z.boolean(),
    is_purchasable: z.boolean(),
    sale_unit_price: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    const rawConversion = values.conversion_to_base.trim();
    if (!rawConversion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['conversion_to_base'],
        message: 'Conversion factor is required',
      });
    } else {
      const parsedConversion = parseSignedDecimalInput(rawConversion);
      if (
        rawConversion.startsWith('-') ||
        parsedConversion === null ||
        parsedConversion <= 0 ||
        compareNonNegativeDecimals(formatFixedDecimal(rawConversion, 6), '0') <=
          0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conversion_to_base'],
          message: 'Conversion factor must be greater than 0',
        });
      } else if (
        !POSITIVE_NUMERIC_6_PATTERN.test(formatFixedDecimal(rawConversion, 6))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conversion_to_base'],
          message: 'Conversion factor exceeds maximum supported value',
        });
      } else if (
        values.is_base &&
        compareNonNegativeDecimals(rawConversion, '1') !== 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conversion_to_base'],
          message: 'Base UOM conversion factor must equal 1',
        });
      }
    }

    validateSellablePrice(values.is_sellable, values.sale_unit_price, ctx);
  });

export type CreateUomFormValues = z.infer<typeof createUomFormSchema>;

export const DEFAULT_CREATE_UOM_FORM_VALUES: CreateUomFormValues = {
  uom_code: '',
  display_name: '',
  conversion_to_base: '',
  is_base: false,
  is_sellable: false,
  is_purchasable: false,
  sale_unit_price: '',
};

export function toCreateUomPayload(
  values: CreateUomFormValues
): ProductUomRequest {
  return {
    uom_code: values.uom_code.trim(),
    display_name: values.display_name.trim(),
    conversion_to_base: values.is_base
      ? '1.000000'
      : formatFixedDecimal(values.conversion_to_base, 6),
    sale_unit_price: values.is_sellable
      ? formatFixedDecimal(values.sale_unit_price, 4)
      : null,
    is_base: values.is_base,
    is_sellable: values.is_sellable,
    is_purchasable: values.is_purchasable,
  };
}

export const editUomFormSchema = z
  .object({
    display_name: z
      .string()
      .trim()
      .min(1, 'Display name is required')
      .max(50, 'Display name must be at most 50 characters'),
    is_sellable: z.boolean(),
    is_purchasable: z.boolean(),
    sale_unit_price: z.string().trim(),
    is_active: z.boolean(),
  })
  .superRefine((values, ctx) => {
    validateSellablePrice(values.is_sellable, values.sale_unit_price, ctx);
  });

export type EditUomFormValues = z.infer<typeof editUomFormSchema>;

export function uomDtoToEditFormValues(uom: ProductUomDto): EditUomFormValues {
  return {
    display_name: uom.display_name,
    is_sellable: uom.is_sellable,
    is_purchasable: uom.is_purchasable,
    sale_unit_price: uom.sale_unit_price ?? '',
    is_active: uom.is_active,
  };
}

export function toUomPatchPayload(
  values: EditUomFormValues
): ProductUomPatchRequest {
  return {
    display_name: values.display_name.trim(),
    sale_unit_price: values.is_sellable
      ? formatFixedDecimal(values.sale_unit_price, 4)
      : null,
    is_sellable: values.is_sellable,
    is_purchasable: values.is_purchasable,
    is_active: values.is_active,
  };
}

export const reorderRuleFormSchema = z
  .object({
    reorder_point_base: z.string().trim(),
    reorder_quantity_base: z.string().trim(),
    max_quantity_base: z.string().trim(),
    is_active: z.boolean(),
  })
  .superRefine((values, ctx) => {
    let validPoint: string | null = null;
    if (!values.reorder_point_base) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reorder_point_base'],
        message: 'Reorder point is required',
      });
    } else {
      const parsedPoint = parseSignedDecimalInput(values.reorder_point_base);
      if (
        values.reorder_point_base.startsWith('-') ||
        parsedPoint === null ||
        parsedPoint < 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reorder_point_base'],
          message: 'Reorder point must be 0 or greater',
        });
      } else if (
        !NON_NEGATIVE_NUMERIC_4_PATTERN.test(
          formatFixedDecimal(values.reorder_point_base, 4)
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reorder_point_base'],
          message: 'Reorder point exceeds maximum supported value',
        });
      } else {
        validPoint = values.reorder_point_base;
      }
    }

    if (!values.reorder_quantity_base) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reorder_quantity_base'],
        message: 'Reorder quantity is required',
      });
    } else {
      const parsedQty = parseSignedDecimalInput(values.reorder_quantity_base);
      const formattedQty =
        !values.reorder_quantity_base.startsWith('-') && parsedQty !== null
          ? formatFixedDecimal(values.reorder_quantity_base, 4)
          : '0.0000';
      if (
        values.reorder_quantity_base.startsWith('-') ||
        parsedQty === null ||
        parsedQty <= 0 ||
        compareNonNegativeDecimals(formattedQty, '0') <= 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reorder_quantity_base'],
          message: 'Reorder quantity must be greater than 0',
        });
      } else if (!POSITIVE_NUMERIC_4_PATTERN.test(formattedQty)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reorder_quantity_base'],
          message: 'Reorder quantity exceeds maximum supported value',
        });
      }
    }

    if (values.max_quantity_base) {
      const parsedMax = parseSignedDecimalInput(values.max_quantity_base);
      if (
        values.max_quantity_base.startsWith('-') ||
        parsedMax === null ||
        parsedMax < 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['max_quantity_base'],
          message: 'Maximum stock quantity must be 0 or greater',
        });
      } else if (
        !NON_NEGATIVE_NUMERIC_4_PATTERN.test(
          formatFixedDecimal(values.max_quantity_base, 4)
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['max_quantity_base'],
          message: 'Maximum stock quantity exceeds maximum supported value',
        });
      } else if (
        validPoint !== null &&
        compareNonNegativeDecimals(values.max_quantity_base, validPoint) < 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['max_quantity_base'],
          message:
            'Maximum stock quantity must be greater than or equal to reorder point',
        });
      }
    }
  });

export type ReorderRuleFormValues = z.infer<typeof reorderRuleFormSchema>;

export const DEFAULT_REORDER_RULE_VALUES: ReorderRuleFormValues = {
  reorder_point_base: '',
  reorder_quantity_base: '',
  max_quantity_base: '',
  is_active: true,
};

export function reorderRuleDtoToFormValues(
  rule: ReorderRuleDto | null | undefined
): ReorderRuleFormValues {
  if (!rule) {
    return { ...DEFAULT_REORDER_RULE_VALUES };
  }
  return {
    reorder_point_base: rule.reorder_point_base,
    reorder_quantity_base: rule.reorder_quantity_base,
    max_quantity_base: rule.max_quantity_base ?? '',
    is_active: rule.is_active,
  };
}

export function toReorderRulePayload(
  values: ReorderRuleFormValues
): ReorderRuleRequest {
  const trimmedMax = values.max_quantity_base.trim();
  return {
    reorder_point_base: formatFixedDecimal(values.reorder_point_base, 4),
    reorder_quantity_base: formatFixedDecimal(values.reorder_quantity_base, 4),
    max_quantity_base:
      trimmedMax.length > 0 ? formatFixedDecimal(trimmedMax, 4) : null,
    is_active: values.is_active,
  };
}
