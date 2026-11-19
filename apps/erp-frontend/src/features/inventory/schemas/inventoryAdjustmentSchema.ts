import { z } from 'zod';
import type {
  AdjustmentsTxnType,
  InventoryTxnDto,
  InventoryTxnLineRequest,
  InventoryTxnPatchRequest,
  InventoryTxnRequest,
} from '../../../types/api';

export const ADJUSTMENT_TXN_TYPES = [
  'OPENING_BALANCE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'REVERSAL',
] as const satisfies readonly AdjustmentsTxnType[];

const ADJUSTMENT_TXN_TYPE_SET: ReadonlySet<string> = new Set(
  ADJUSTMENT_TXN_TYPES
);

const DECIMAL_INPUT_PATTERN = /^(-)?(?:\d+(?:\.\d+)?|\.\d+)$/;
const NON_NEGATIVE_NUMERIC_4_PATTERN = /^\d{1,14}(\.\d{1,4})?$/;
const POSITIVE_NUMERIC_4_PATTERN = /^(?!0+(\.0{1,4})?$)\d{1,14}(\.\d{1,4})?$/;
const UUID_SCHEMA = z.string().uuid();

interface ParsedDecimalParts {
  isNegative: boolean;
  normInt: string;
  rawFrac: string;
  isZero: boolean;
}

function parseDecimalParts(value: string): ParsedDecimalParts | null {
  const trimmed = value.trim();
  const match = DECIMAL_INPUT_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }

  const isNegative = Boolean(match[1]);
  const unsigned = isNegative ? trimmed.slice(1) : trimmed;
  const [rawInt = '', rawFrac = ''] = unsigned.split('.');
  const normInt = rawInt.replace(/^0+(?=\d)/, '') || '0';
  const isZero = /^0+$/.test(normInt) && /^0*$/.test(rawFrac);

  // Reject -0 / -0.0 / -0.0000
  if (isNegative && isZero) {
    return null;
  }

  return {
    isNegative,
    normInt,
    rawFrac,
    isZero,
  };
}

function pow10(exponent: number): bigint {
  let result = 1n;
  for (let i = 0; i < exponent; i += 1) {
    result *= 10n;
  }
  return result;
}

function divideHalfUpUnsigned(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

/**
 * Parses a decimal string with up to 4 fractional digits into a BigInt scaled
 * by 10,000. Rejects `-0`, invalid formats, and values with >4 decimals.
 */
export function parseScaled4(value: string): bigint | null {
  const parts = parseDecimalParts(value);
  if (!parts || parts.rawFrac.length > 4) {
    return null;
  }
  if (parts.isZero) {
    return 0n;
  }
  const magnitude = BigInt(`${parts.normInt}${parts.rawFrac.padEnd(4, '0')}`);
  return parts.isNegative ? -magnitude : magnitude;
}

/**
 * Formats a scaled-by-10,000 BigInt back into a fixed-4 decimal string.
 */
export function formatScaled4(scaled: bigint): string {
  if (scaled === 0n) {
    return '0.0000';
  }
  const isNegative = scaled < 0n;
  const abs = isNegative ? -scaled : scaled;
  const digits = abs.toString().padStart(5, '0');
  const splitIndex = digits.length - 4;
  const formatted = `${digits.slice(0, splitIndex)}.${digits.slice(splitIndex)}`;
  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Normalizes any valid decimal string into a fixed-4 decimal string using pure
 * BigInt/string arithmetic (half-up rounding when >4 fractional digits).
 * Rejects `-0` and invalid inputs (returns `'0.0000'`).
 */
export function formatFixed4(value: string): string {
  const parts = parseDecimalParts(value);
  if (!parts) {
    return '0.0000';
  }
  if (parts.isZero) {
    return '0.0000';
  }
  if (parts.rawFrac.length <= 4) {
    const unsigned = `${parts.normInt}.${parts.rawFrac.padEnd(4, '0')}`;
    return parts.isNegative ? `-${unsigned}` : unsigned;
  }

  const keptFrac = parts.rawFrac.slice(0, 4);
  const nextDigit = parts.rawFrac[4] ?? '0';
  let magnitude = BigInt(`${parts.normInt}${keptFrac}`);
  if (nextDigit >= '5') {
    magnitude += 1n;
  }
  if (magnitude === 0n) {
    return '0.0000';
  }
  return formatScaled4(parts.isNegative ? -magnitude : magnitude);
}

/**
 * Formats a strictly positive decimal string matching OpenAPI `PositiveNumeric4`
 * (up to 14 integer digits, up to 4 fractional digits, > 0). Returns `null` if invalid.
 */
export function formatPositiveNumeric4(value: string): string | null {
  const parts = parseDecimalParts(value);
  if (!parts || parts.isNegative || parts.isZero || parts.rawFrac.length > 4) {
    return null;
  }
  const normalized = `${parts.normInt}.${parts.rawFrac.padEnd(4, '0')}`;
  return POSITIVE_NUMERIC_4_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Formats a non-negative decimal string matching OpenAPI `NonNegativeNumeric4`
 * (up to 14 integer digits, up to 4 fractional digits, >= 0). Returns `null` if invalid.
 */
export function formatNonNegativeNumeric4(value: string): string | null {
  const parts = parseDecimalParts(value);
  if (!parts || parts.isNegative || parts.rawFrac.length > 4) {
    return null;
  }
  if (parts.isZero) {
    return '0.0000';
  }
  const normalized = `${parts.normInt}.${parts.rawFrac.padEnd(4, '0')}`;
  return NON_NEGATIVE_NUMERIC_4_PATTERN.test(normalized) ? normalized : null;
}

function compareUnsignedParts(
  a: ParsedDecimalParts,
  b: ParsedDecimalParts
): number {
  if (a.normInt.length !== b.normInt.length) {
    return a.normInt.length < b.normInt.length ? -1 : 1;
  }
  if (a.normInt !== b.normInt) {
    return a.normInt < b.normInt ? -1 : 1;
  }
  const fracA = a.rawFrac.replace(/0+$/, '');
  const fracB = b.rawFrac.replace(/0+$/, '');
  const maxLen = Math.max(fracA.length, fracB.length);
  const paddedA = fracA.padEnd(maxLen, '0');
  const paddedB = fracB.padEnd(maxLen, '0');
  if (paddedA === paddedB) {
    return 0;
  }
  return paddedA < paddedB ? -1 : 1;
}

/**
 * Exact BigInt/string comparison of two decimal strings.
 * Returns `-1` if `a < b`, `0` if `a === b`, `1` if `a > b`.
 */
export function compareDecimalStrings(a: string, b: string): number {
  const parsedA = parseDecimalParts(a);
  const parsedB = parseDecimalParts(b);
  if (!parsedA || !parsedB) {
    throw new RangeError(
      'Invalid decimal string passed to compareDecimalStrings'
    );
  }

  if (parsedA.isZero && parsedB.isZero) {
    return 0;
  }
  if (parsedA.isNegative !== parsedB.isNegative) {
    return parsedA.isNegative ? -1 : 1;
  }
  const unsignedCmp = compareUnsignedParts(parsedA, parsedB);
  return parsedA.isNegative ? -unsignedCmp : unsignedCmp;
}

/**
 * Sums decimal strings with exact BigInt arithmetic and formats as a 4dp string.
 * Blank or unparseable entries are skipped safely for live UI totals.
 */
export function sumDecimalStrings(values: readonly string[]): string {
  const parsedEntries: ParsedDecimalParts[] = [];
  let maxFracLen = 4;

  for (const raw of values) {
    const parsed = parseDecimalParts(raw);
    if (!parsed) {
      continue;
    }
    parsedEntries.push(parsed);
    if (parsed.rawFrac.length > maxFracLen) {
      maxFracLen = parsed.rawFrac.length;
    }
  }

  if (parsedEntries.length === 0) {
    return '0.0000';
  }

  let total = 0n;
  for (const entry of parsedEntries) {
    if (entry.isZero) {
      continue;
    }
    const scaled = BigInt(
      `${entry.normInt}${entry.rawFrac.padEnd(maxFracLen, '0')}`
    );
    total += entry.isNegative ? -scaled : scaled;
  }

  if (total === 0n) {
    return '0.0000';
  }

  if (maxFracLen === 4) {
    return formatScaled4(total);
  }

  const isNegative = total < 0n;
  const abs = isNegative ? -total : total;
  const rounded = divideHalfUpUnsigned(abs, pow10(maxFracLen - 4));
  return formatScaled4(isNegative ? -rounded : rounded);
}

/**
 * Multiplies two decimal strings using pure BigInt arithmetic and returns a 4dp string.
 */
export function multiplyToFixed4(a: string, b: string): string {
  const parsedA = parseDecimalParts(a);
  const parsedB = parseDecimalParts(b);
  if (!parsedA || !parsedB || parsedA.isZero || parsedB.isZero) {
    return '0.0000';
  }

  const scaleA = parsedA.rawFrac.length;
  const scaleB = parsedB.rawFrac.length;
  const magA = BigInt(`${parsedA.normInt}${parsedA.rawFrac}`);
  const magB = BigInt(`${parsedB.normInt}${parsedB.rawFrac}`);
  const productMag = magA * magB;
  const totalScale = scaleA + scaleB;

  let scaled4Mag: bigint;
  if (totalScale === 4) {
    scaled4Mag = productMag;
  } else if (totalScale < 4) {
    scaled4Mag = productMag * pow10(4 - totalScale);
  } else {
    scaled4Mag = divideHalfUpUnsigned(productMag, pow10(totalScale - 4));
  }

  const resultNegative = parsedA.isNegative !== parsedB.isNegative;
  return formatScaled4(resultNegative ? -scaled4Mag : scaled4Mag);
}

export interface FormatNumericDisplayOptions {
  minDecimals?: number;
  maxDecimals?: number;
  fallback?: string;
}

/**
 * Formats a server decimal string for UI display using pure string/BigInt math.
 * Null/undefined/empty values return `fallback` (default `'Unavailable'`).
 */
export function formatNumericDisplay(
  value: string | null | undefined,
  options: FormatNumericDisplayOptions = {}
): string {
  const fallback = options.fallback ?? 'Unavailable';
  if (value === null || value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const parsed = parseDecimalParts(value);
  if (!parsed) {
    return fallback;
  }

  const rawMax = options.maxDecimals ?? 4;
  const maxDecimals = rawMax < 0 ? 0 : Math.floor(rawMax);
  const rawMin = options.minDecimals ?? 0;
  const minDecimals =
    rawMin < 0 ? 0 : Math.min(Math.floor(rawMin), maxDecimals);

  let roundedInt = parsed.normInt;
  let roundedFrac = parsed.rawFrac;
  let isZeroResult = parsed.isZero;

  if (parsed.rawFrac.length > maxDecimals) {
    const keptFrac = parsed.rawFrac.slice(0, maxDecimals);
    const nextDigit = parsed.rawFrac[maxDecimals] ?? '0';
    let scaled = BigInt(`${parsed.normInt}${keptFrac}`);
    if (nextDigit >= '5') {
      scaled += 1n;
    }
    if (scaled === 0n) {
      roundedInt = '0';
      roundedFrac = '';
      isZeroResult = true;
    } else if (maxDecimals === 0) {
      roundedInt = scaled.toString();
      roundedFrac = '';
      isZeroResult = false;
    } else {
      const digits = scaled.toString().padStart(maxDecimals + 1, '0');
      const splitIndex = digits.length - maxDecimals;
      roundedInt = digits.slice(0, splitIndex);
      roundedFrac = digits.slice(splitIndex);
      isZeroResult = false;
    }
  }

  const paddedMin = roundedFrac.padEnd(minDecimals, '0');
  const trimmedFrac =
    paddedMin.slice(0, minDecimals) +
    paddedMin.slice(minDecimals).replace(/0+$/, '');
  const groupedInt = roundedInt.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const signPrefix = parsed.isNegative && !isZeroResult ? '-' : '';

  return trimmedFrac.length > 0
    ? `${signPrefix}${groupedInt}.${trimmedFrac}`
    : `${signPrefix}${groupedInt}`;
}

export const inventoryAdjustmentLineSchema = z.object({
  product_id: z.string().trim().min(1, 'Product is required'),
  location_id: z.string().trim().min(1, 'Location is required'),
  batch_id: z.string().trim().min(1, 'Batch is required'),
  product_uom_id: z.string().trim().min(1, 'Unit of measure is required'),
  entered_qty: z.string().trim(),
  unit_cost_base: z.string().trim(),
});

export type InventoryAdjustmentLineFormValues = z.infer<
  typeof inventoryAdjustmentLineSchema
>;

export const DEFAULT_ADJUSTMENT_LINE: InventoryAdjustmentLineFormValues = {
  product_id: '',
  location_id: '',
  batch_id: '',
  product_uom_id: '',
  entered_qty: '',
  unit_cost_base: '',
};

export function createEmptyAdjustmentLine(): InventoryAdjustmentLineFormValues {
  return { ...DEFAULT_ADJUSTMENT_LINE };
}

export const inventoryAdjustmentFormSchema = z
  .object({
    transaction_type: z.enum(ADJUSTMENT_TXN_TYPES),
    reason_code: z
      .string()
      .trim()
      .min(1, 'Reason code is required')
      .max(40, 'Reason code must be at most 40 characters'),
    note: z.string().trim().max(500, 'Note must be at most 500 characters'),
    reverses_inventory_txn_id: z.string().trim(),
    lines: z
      .array(inventoryAdjustmentLineSchema)
      .min(1, 'At least one adjustment line is required'),
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
    }

    const requiresUnitCost =
      values.transaction_type === 'OPENING_BALANCE' ||
      values.transaction_type === 'ADJUSTMENT_IN';

    values.lines.forEach((line, index) => {
      const qtyRaw = line.entered_qty.trim();
      if (!qtyRaw) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'entered_qty'],
          message: 'Quantity is required',
        });
      } else {
        const parsedQty = parseDecimalParts(qtyRaw);
        if (!parsedQty || parsedQty.isNegative || parsedQty.isZero) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lines', index, 'entered_qty'],
            message: 'Quantity must be greater than 0',
          });
        } else if (parsedQty.rawFrac.length > 4) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lines', index, 'entered_qty'],
            message: 'Quantity must have at most 4 decimal places',
          });
        } else if (formatPositiveNumeric4(qtyRaw) === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lines', index, 'entered_qty'],
            message: 'Quantity exceeds maximum supported value',
          });
        }
      }

      if (!requiresUnitCost) {
        return;
      }

      const costRaw = line.unit_cost_base.trim();
      if (!costRaw) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines', index, 'unit_cost_base'],
          message: 'Unit cost is required for stock-in adjustments',
        });
      } else {
        const parsedCost = parseDecimalParts(costRaw);
        if (!parsedCost || parsedCost.isNegative) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lines', index, 'unit_cost_base'],
            message: 'Unit cost must be 0 or greater',
          });
        } else if (parsedCost.rawFrac.length > 4) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lines', index, 'unit_cost_base'],
            message: 'Unit cost must have at most 4 decimal places',
          });
        } else if (formatNonNegativeNumeric4(costRaw) === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['lines', index, 'unit_cost_base'],
            message: 'Unit cost exceeds maximum supported value',
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

function isAdjustmentTxnType(value: string): value is AdjustmentsTxnType {
  return ADJUSTMENT_TXN_TYPE_SET.has(value);
}

function toLineRequest(
  line: InventoryAdjustmentLineFormValues,
  transactionType: AdjustmentsTxnType
): InventoryTxnLineRequest {
  const requiresUnitCost =
    transactionType === 'OPENING_BALANCE' ||
    transactionType === 'ADJUSTMENT_IN';

  const baseLine: InventoryTxnLineRequest = {
    product_id: line.product_id.trim(),
    location_id: line.location_id.trim(),
    batch_id: line.batch_id.trim(),
    product_uom_id: line.product_uom_id.trim(),
    entered_qty:
      formatPositiveNumeric4(line.entered_qty) ??
      formatFixed4(line.entered_qty),
  };

  if (requiresUnitCost) {
    baseLine.unit_cost_base =
      formatNonNegativeNumeric4(line.unit_cost_base) ??
      formatFixed4(line.unit_cost_base);
  }

  return baseLine;
}

export function inventoryTxnDtoToPatchFormValues(
  txn: InventoryTxnDto
): InventoryAdjustmentFormValues {
  const txnType: AdjustmentsTxnType = isAdjustmentTxnType(txn.transaction_type)
    ? txn.transaction_type
    : 'ADJUSTMENT_IN';

  return {
    transaction_type: txnType,
    reason_code: txn.reason_code ?? '',
    note: txn.note ?? '',
    reverses_inventory_txn_id: txn.reverses_inventory_txn_id ?? '',
    lines:
      txn.lines.length > 0
        ? txn.lines.map((line) => ({
            product_id: line.product_id,
            location_id: line.location_id,
            batch_id: line.batch_id,
            product_uom_id: line.product_uom_id,
            entered_qty: line.entered_qty,
            unit_cost_base: line.unit_cost_base ?? '',
          }))
        : [createEmptyAdjustmentLine()],
  };
}

export function toInventoryTxnPayload(
  values: InventoryAdjustmentFormValues,
  branchId: string
): InventoryTxnRequest {
  return {
    transaction_type: values.transaction_type,
    branch_id: branchId.trim(),
    reason_code: values.reason_code.trim(),
    note: normalizeOptionalString(values.note),
    reverses_inventory_txn_id:
      values.transaction_type === 'REVERSAL'
        ? normalizeOptionalString(values.reverses_inventory_txn_id)
        : null,
    lines: values.lines.map((line) =>
      toLineRequest(line, values.transaction_type)
    ),
  };
}

export function toInventoryTxnPatchPayload(
  values: InventoryAdjustmentFormValues
): InventoryTxnPatchRequest {
  return {
    reason_code: values.reason_code.trim(),
    note: normalizeOptionalString(values.note),
    lines: values.lines.map((line) =>
      toLineRequest(line, values.transaction_type)
    ),
  };
}
