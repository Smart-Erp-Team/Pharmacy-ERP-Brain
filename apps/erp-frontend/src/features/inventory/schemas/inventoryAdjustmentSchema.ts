import { z } from 'zod';
import { ADJUSTMENTS_TXN_TYPES } from '../../../lib/api/catalogInventoryNormalizers';
import type {
  CreateInventoryAdjustmentLineRequest,
  CreateInventoryAdjustmentRequest,
} from '../../../types/api';

export { ADJUSTMENTS_TXN_TYPES };
export const ADJUSTMENT_TXN_TYPES = ADJUSTMENTS_TXN_TYPES;

const DECIMAL_INPUT_PATTERN = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_SCHEMA = z.string().uuid();

/**
 * Parses a numeric input string into a native finite JavaScript `number`.
 * Rejects empty strings, `-0`, `NaN`, `Infinity`, and non-decimal formats.
 */
export function parseFiniteNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!DECIMAL_INPUT_PATTERN.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  // Reject negative zero (-0, -0.0, etc.)
  if (trimmed.startsWith('-') && parsed === 0) {
    return null;
  }

  return parsed === 0 ? 0 : parsed;
}

/**
 * Validates that a string is a real calendar date in `YYYY-MM-DD` format.
 */
export function isValidIsoDate(value: string): boolean {
  const trimmed = value.trim();
  if (!ISO_DATE_PATTERN.test(trimmed)) {
    return false;
  }

  const [yearStr, monthStr, dayStr] = trimmed.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export interface FormatNumericDisplayOptions {
  minDecimals?: number;
  maxDecimals?: number;
  fallback?: string;
}

/**
 * Formats a native finite JSON `number` for UI display.
 * Null, undefined, `NaN`, and non-finite numbers return `fallback`
 * (default `'Unavailable'`).
 */
export function formatNumericDisplay(
  value: number | null | undefined,
  options: FormatNumericDisplayOptions = {}
): string {
  const fallback = options.fallback ?? 'Unavailable';
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  const rawMax = options.maxDecimals ?? 4;
  const maxDecimals = Math.min(Math.max(Math.floor(rawMax), 0), 20);
  const rawMin = options.minDecimals ?? 0;
  const minDecimals = Math.min(Math.max(Math.floor(rawMin), 0), maxDecimals);
  const normalized = Object.is(value, -0) ? 0 : value;

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(normalized);
}

export const inventoryAdjustmentLineSchema = z.object({
  product_id: z.string().trim(),
  product_uom_id: z.string().trim(),
  location_id: z.string().trim(),
  batch_number: z
    .string()
    .trim()
    .max(80, 'Batch number must be at most 80 characters'),
  manufactured_on: z.string().trim(),
  expires_on: z.string().trim(),
  entered_qty: z.string().trim(),
  unit_cost_entered: z.string().trim(),
});

export type InventoryAdjustmentLineFormValues = z.infer<
  typeof inventoryAdjustmentLineSchema
>;

export const DEFAULT_ADJUSTMENT_LINE: InventoryAdjustmentLineFormValues = {
  product_id: '',
  product_uom_id: '',
  location_id: '',
  batch_number: '',
  manufactured_on: '',
  expires_on: '',
  entered_qty: '',
  unit_cost_entered: '',
};

export function createEmptyAdjustmentLine(): InventoryAdjustmentLineFormValues {
  return { ...DEFAULT_ADJUSTMENT_LINE };
}

export const inventoryAdjustmentFormSchema = z
  .object({
    transaction_type: z.enum(ADJUSTMENTS_TXN_TYPES),
    reason_code: z
      .string()
      .trim()
      .max(40, 'Reason code must be at most 40 characters'),
    note: z.string().trim().max(500, 'Note must be at most 500 characters'),
    reverses_inventory_txn_id: z.string().trim(),
    lines: z.array(inventoryAdjustmentLineSchema),
  })
  .superRefine((values, ctx) => {
    if (values.transaction_type === 'REVERSAL') {
      const targetId = values.reverses_inventory_txn_id.trim();
      if (!targetId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reverses_inventory_txn_id'],
          message: 'Original transaction ID is required for a reversal',
        });
      } else if (!UUID_SCHEMA.safeParse(targetId).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reverses_inventory_txn_id'],
          message: 'Original transaction ID must be a valid UUID',
        });
      }
      return;
    }

    if (!values.reason_code.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason_code'],
        message: 'Reason code is required',
      });
    }

    if (values.lines.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lines'],
        message: 'At least one adjustment line is required',
      });
      return;
    }

    const requiresUnitCost =
      values.transaction_type === 'OPENING_BALANCE' ||
      values.transaction_type === 'ADJUSTMENT_IN';

    values.lines.forEach((line, index) => {
      if (!line.product_id.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'product_id'],
          message: 'Product is required',
        });
      }

      if (!line.product_uom_id.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'product_uom_id'],
          message: 'Unit of measure is required',
        });
      }

      if (!line.location_id.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'location_id'],
          message: 'Location is required',
        });
      }

      const manufacturedOn = line.manufactured_on.trim();
      const expiresOn = line.expires_on.trim();
      const manufacturedValid =
        manufacturedOn.length === 0 || isValidIsoDate(manufacturedOn);
      const expiresValid = expiresOn.length === 0 || isValidIsoDate(expiresOn);

      if (!manufacturedValid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'manufactured_on'],
          message: 'Manufactured date must be a valid YYYY-MM-DD date',
        });
      }

      if (!expiresValid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'expires_on'],
          message: 'Expiry date must be a valid YYYY-MM-DD date',
        });
      }

      if (
        manufacturedOn.length > 0 &&
        expiresOn.length > 0 &&
        manufacturedValid &&
        expiresValid &&
        expiresOn < manufacturedOn
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'expires_on'],
          message: 'Expiry date cannot be earlier than manufactured date',
        });
      }

      const qtyRaw = line.entered_qty.trim();
      if (!qtyRaw) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'entered_qty'],
          message: 'Quantity is required',
        });
      } else {
        const parsedQty = parseFiniteNumber(qtyRaw);
        if (parsedQty === null || parsedQty <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lines', index, 'entered_qty'],
            message: 'Quantity must be greater than 0',
          });
        }
      }

      const costRaw = line.unit_cost_entered.trim();
      if (requiresUnitCost) {
        if (!costRaw) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lines', index, 'unit_cost_entered'],
            message: 'Unit cost is required for stock-in adjustments',
          });
        } else {
          const parsedCost = parseFiniteNumber(costRaw);
          if (parsedCost === null || parsedCost < 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['lines', index, 'unit_cost_entered'],
              message: 'Unit cost must be 0 or greater',
            });
          }
        }
      } else if (costRaw) {
        const parsedCost = parseFiniteNumber(costRaw);
        if (parsedCost === null || parsedCost < 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lines', index, 'unit_cost_entered'],
            message: 'Unit cost must be 0 or greater',
          });
        }
      }
    });
  });

export type InventoryAdjustmentFormValues = z.infer<
  typeof inventoryAdjustmentFormSchema
>;

export const DEFAULT_ADJUSTMENT_FORM_VALUES: InventoryAdjustmentFormValues = {
  transaction_type: 'ADJUSTMENT_IN',
  reason_code: '',
  note: '',
  reverses_inventory_txn_id: '',
  lines: [{ ...DEFAULT_ADJUSTMENT_LINE }],
};

function normalizeOptionalString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toCreateInventoryAdjustmentPayload(
  values: InventoryAdjustmentFormValues,
  branchId: string
): CreateInventoryAdjustmentRequest {
  const normalizedBranchId = branchId.trim();
  const reasonCode = normalizeOptionalString(values.reason_code);
  const note = normalizeOptionalString(values.note);

  if (values.transaction_type === 'REVERSAL') {
    return {
      branch_id: normalizedBranchId,
      transaction_type: 'REVERSAL',
      reason_code: reasonCode,
      note,
      reverses_inventory_txn_id: normalizeOptionalString(
        values.reverses_inventory_txn_id
      ),
      lines: null,
    };
  }

  const includesUnitCost =
    values.transaction_type === 'OPENING_BALANCE' ||
    values.transaction_type === 'ADJUSTMENT_IN';

  const lines: CreateInventoryAdjustmentLineRequest[] = values.lines.map(
    (line) => {
      const parsedQty = parseFiniteNumber(line.entered_qty);
      const parsedCost = includesUnitCost
        ? parseFiniteNumber(line.unit_cost_entered)
        : null;

      return {
        product_id: line.product_id.trim(),
        product_uom_id: line.product_uom_id.trim(),
        location_id: line.location_id.trim(),
        batch_number: normalizeOptionalString(line.batch_number),
        manufactured_on: normalizeOptionalString(line.manufactured_on),
        expires_on: normalizeOptionalString(line.expires_on),
        entered_qty: parsedQty ?? 0,
        unit_cost_entered: includesUnitCost ? parsedCost : null,
      };
    }
  );

  return {
    branch_id: normalizedBranchId,
    transaction_type: values.transaction_type,
    reason_code: reasonCode,
    note,
    reverses_inventory_txn_id: null,
    lines,
  };
}
