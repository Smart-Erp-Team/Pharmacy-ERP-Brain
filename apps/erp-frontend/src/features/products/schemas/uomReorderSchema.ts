import { z } from 'zod';
import type {
  CreateProductUomRequest,
  ProductUom,
  ReorderRule,
  UpdateProductUomRequest,
  UpsertReorderRuleRequest,
} from '../../../types/api';

const NON_NEGATIVE_DECIMAL_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const SIGNED_DECIMAL_PATTERN = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

function parseSignedDecimal(value: string): number | null {
  const trimmed = value.trim();
  if (!SIGNED_DECIMAL_PATTERN.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNonNegativeDecimal(value: string): number | null {
  const trimmed = value.trim();
  if (!NON_NEGATIVE_DECIMAL_PATTERN.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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
  const parsed = parseSignedDecimal(trimmed);
  if (trimmed.startsWith('-') || parsed === null || parsed < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sale_unit_price'],
      message: 'Sale unit price must be a non-negative number',
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
      const parsedConversion = parseSignedDecimal(rawConversion);
      if (
        rawConversion.startsWith('-') ||
        parsedConversion === null ||
        parsedConversion <= 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conversion_to_base'],
          message: 'Conversion factor must be greater than 0',
        });
      } else if (values.is_base && parsedConversion !== 1) {
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

export function toCreateProductUomPayload(
  values: CreateUomFormValues
): CreateProductUomRequest {
  return {
    uom_code: values.uom_code.trim(),
    display_name: values.display_name.trim(),
    conversion_to_base: values.is_base
      ? 1
      : (parseNonNegativeDecimal(values.conversion_to_base) ?? 0),
    sale_unit_price: values.is_sellable
      ? (parseNonNegativeDecimal(values.sale_unit_price) ?? 0)
      : null,
    is_base: values.is_base,
    is_sellable: values.is_sellable,
    is_purchasable: values.is_purchasable,
  };
}

export const toCreateUomPayload = toCreateProductUomPayload;

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

export function uomDtoToEditFormValues(uom: ProductUom): EditUomFormValues {
  return {
    display_name: uom.display_name,
    is_sellable: uom.is_sellable,
    is_purchasable: uom.is_purchasable,
    sale_unit_price:
      uom.sale_unit_price !== null ? String(uom.sale_unit_price) : '',
    is_active: uom.is_active,
  };
}

export function toPatchProductUomPayload(
  values: EditUomFormValues
): UpdateProductUomRequest {
  return {
    display_name: values.display_name.trim(),
    sale_unit_price: values.is_sellable
      ? (parseNonNegativeDecimal(values.sale_unit_price) ?? 0)
      : null,
    is_sellable: values.is_sellable,
    is_purchasable: values.is_purchasable,
    is_active: values.is_active,
  };
}

export const toUomPatchPayload = toPatchProductUomPayload;

export const reorderRuleFormSchema = z
  .object({
    reorder_point_base: z.string().trim(),
    reorder_quantity_base: z.string().trim(),
    max_quantity_base: z.string().trim(),
    is_active: z.boolean(),
  })
  .superRefine((values, ctx) => {
    let validPoint: number | null = null;
    if (!values.reorder_point_base) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reorder_point_base'],
        message: 'Reorder point is required',
      });
    } else {
      const parsedPoint = parseSignedDecimal(values.reorder_point_base);
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
      } else {
        validPoint = parsedPoint;
      }
    }

    if (!values.reorder_quantity_base) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reorder_quantity_base'],
        message: 'Reorder quantity is required',
      });
    } else {
      const parsedQty = parseSignedDecimal(values.reorder_quantity_base);
      if (
        values.reorder_quantity_base.startsWith('-') ||
        parsedQty === null ||
        parsedQty <= 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reorder_quantity_base'],
          message: 'Reorder quantity must be greater than 0',
        });
      }
    }

    if (values.max_quantity_base) {
      const parsedMax = parseSignedDecimal(values.max_quantity_base);
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
      } else if (validPoint !== null && parsedMax < validPoint) {
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
  rule: ReorderRule | null | undefined
): ReorderRuleFormValues {
  if (!rule) {
    return { ...DEFAULT_REORDER_RULE_VALUES };
  }
  return {
    reorder_point_base: String(rule.reorder_point_base),
    reorder_quantity_base: String(rule.reorder_quantity_base),
    max_quantity_base:
      rule.max_quantity_base !== null ? String(rule.max_quantity_base) : '',
    is_active: rule.is_active,
  };
}

export function toUpsertReorderRulePayload(
  values: ReorderRuleFormValues
): UpsertReorderRuleRequest {
  const trimmedMax = values.max_quantity_base.trim();
  return {
    reorder_point_base: parseNonNegativeDecimal(values.reorder_point_base) ?? 0,
    reorder_quantity_base:
      parseNonNegativeDecimal(values.reorder_quantity_base) ?? 0,
    max_quantity_base:
      trimmedMax.length > 0 ? parseNonNegativeDecimal(trimmedMax) : null,
    is_active: values.is_active,
  };
}

export const toReorderRulePayload = toUpsertReorderRulePayload;
