/**
 * Pharmacy ERP — Catalog & Inventory Runtime Contract Normalizers (Stage 1)
 *
 * Validates and normalizes ProductCategory, ProductUom, Product, ReorderRule,
 * InventoryLocation, InventoryBatch, StockBalance, InventorySummary,
 * InventoryTxnLine, and InventoryTxn responses against
 * `/contracts/schemas/catalog.json` and `/contracts/schemas/inventory.json`.
 *
 * Architectural invariant:
 *  - Imports primitive guards & shared helpers from `./normalizers`.
 *  - NEVER imports `client.ts` (zero circular imports).
 */

import type {
  AdjustmentsTxnType,
  BatchQualityStatus,
  InventoryTransactionStatus,
  InventoryTransactionType,
  LocationType,
  NormalizedInventoryBatch,
  NormalizedInventoryLocation,
  NormalizedInventorySummary,
  NormalizedInventoryTxn,
  NormalizedInventoryTxnLine,
  NormalizedProduct,
  NormalizedProductCategory,
  NormalizedProductUom,
  NormalizedReorderRule,
  NormalizedStockBalance,
} from '../../types/api';
import {
  ContractValidationError,
  isPlainRecord,
  requireArray,
  requireBoolean,
  requireEnum,
  requireInteger,
  requireNullableString,
  requireNumber,
  requireString,
} from './normalizers';

export type {
  NormalizedInventoryBatch,
  NormalizedInventoryLocation,
  NormalizedInventorySummary,
  NormalizedInventoryTxn,
  NormalizedInventoryTxnLine,
  NormalizedProduct,
  NormalizedProductCategory,
  NormalizedProductUom,
  NormalizedReorderRule,
  NormalizedStockBalance,
};

// ---------------------------------------------------------------------------
// Closed Stage 1 Inventory vocabularies & type predicates
// ---------------------------------------------------------------------------

export const LOCATION_TYPES = [
  'SELLABLE',
  'QUARANTINE',
  'DAMAGED',
  'SCRAP',
] as const satisfies readonly LocationType[];

export const BATCH_QUALITY_STATUSES = [
  'AVAILABLE',
  'QUARANTINED',
  'EXPIRED',
  'RECALLED',
] as const satisfies readonly BatchQualityStatus[];

export const INVENTORY_TRANSACTION_TYPES = [
  'OPENING_BALANCE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'SALE_ISSUE',
  'SALES_RETURN_IN',
  'PURCHASE_RECEIPT',
  'VENDOR_RETURN_OUT',
  'SCRAP_OUT',
  'REVERSAL',
] as const satisfies readonly InventoryTransactionType[];

export const ADJUSTMENTS_TXN_TYPES = [
  'OPENING_BALANCE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'REVERSAL',
] as const satisfies readonly AdjustmentsTxnType[];

export const INVENTORY_TRANSACTION_STATUSES = [
  'DRAFT',
  'POSTED',
  'CANCELLED',
] as const satisfies readonly InventoryTransactionStatus[];

export function isLocationType(value: unknown): value is LocationType {
  return (
    typeof value === 'string' &&
    LOCATION_TYPES.some((locationType) => locationType === value)
  );
}

export function isBatchQualityStatus(
  value: unknown
): value is BatchQualityStatus {
  return (
    typeof value === 'string' &&
    BATCH_QUALITY_STATUSES.some((status) => status === value)
  );
}

export function isInventoryTransactionType(
  value: unknown
): value is InventoryTransactionType {
  return (
    typeof value === 'string' &&
    INVENTORY_TRANSACTION_TYPES.some((txnType) => txnType === value)
  );
}

export function isAdjustmentsTxnType(
  value: unknown
): value is AdjustmentsTxnType {
  return (
    typeof value === 'string' &&
    ADJUSTMENTS_TXN_TYPES.some((txnType) => txnType === value)
  );
}

export function isInventoryTransactionStatus(
  value: unknown
): value is InventoryTransactionStatus {
  return (
    typeof value === 'string' &&
    INVENTORY_TRANSACTION_STATUSES.some((status) => status === value)
  );
}

// ---------------------------------------------------------------------------
// Nullable number primitive guard
// ---------------------------------------------------------------------------

function formatValidationMessage(
  fieldPath: string,
  reason: string,
  endpoint?: string
): string {
  const prefix = endpoint ? `${endpoint}: ` : '';
  return `${prefix}Expected valid "${fieldPath}" (${reason}).`;
}

/**
 * Validates an optional/nullable finite JSON number property.
 * Returns `null` for `null` or `undefined`, returns finite `number` for finite
 * numbers (including `0` and negatives), and throws `ContractValidationError`
 * on strings (e.g. legacy `"10.50"`), `NaN`, `Infinity`, or booleans.
 */
export function requireNullableNumber(
  record: Record<string, unknown>,
  field: string,
  endpoint?: string
): number | null {
  const value = record[field];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  throw new ContractValidationError(
    formatValidationMessage(field, 'must be a finite number or null', endpoint),
    endpoint
  );
}

// ---------------------------------------------------------------------------
// Catalog & Reorder Rule DTO normalizers (`/contracts/schemas/catalog.json`)
// ---------------------------------------------------------------------------

/**
 * Validates and normalizes a `ProductCategoryDto`
 * (`GET/POST/PATCH /product-categories`).
 */
export function normalizeProductCategory(
  raw: unknown,
  endpoint?: string
): NormalizedProductCategory {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage(
        'ProductCategoryDto',
        'must be a JSON object',
        endpoint
      ),
      endpoint
    );
  }

  return {
    category_id: requireString(raw, 'category_id', endpoint),
    organization_id: requireString(raw, 'organization_id', endpoint),
    parent_category_id: requireNullableString(
      raw,
      'parent_category_id',
      endpoint
    ),
    code: requireString(raw, 'code', endpoint),
    name: requireString(raw, 'name', endpoint),
    description: requireNullableString(raw, 'description', endpoint),
    is_active: requireBoolean(raw, 'is_active', endpoint),
    created_at: requireString(raw, 'created_at', endpoint),
    updated_at: requireString(raw, 'updated_at', endpoint),
  };
}

/**
 * Validates and normalizes a `ProductUomDto`
 * (`GET/POST/PATCH /products/{id}/uoms` and embedded `ProductDto.uoms`).
 */
export function normalizeProductUom(
  raw: unknown,
  endpoint?: string
): NormalizedProductUom {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage(
        'ProductUomDto',
        'must be a JSON object',
        endpoint
      ),
      endpoint
    );
  }

  return {
    product_uom_id: requireString(raw, 'product_uom_id', endpoint),
    product_id: requireString(raw, 'product_id', endpoint),
    uom_code: requireString(raw, 'uom_code', endpoint),
    display_name: requireString(raw, 'display_name', endpoint),
    conversion_to_base: requireNumber(raw, 'conversion_to_base', endpoint),
    sale_unit_price: requireNullableNumber(raw, 'sale_unit_price', endpoint),
    is_base: requireBoolean(raw, 'is_base', endpoint),
    is_sellable: requireBoolean(raw, 'is_sellable', endpoint),
    is_purchasable: requireBoolean(raw, 'is_purchasable', endpoint),
    is_active: requireBoolean(raw, 'is_active', endpoint),
    updated_at: requireString(raw, 'updated_at', endpoint),
  };
}

/**
 * Validates and normalizes a `ProductDto` (`GET/POST/PATCH /products`).
 */
export function normalizeProduct(
  raw: unknown,
  endpoint?: string
): NormalizedProduct {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage('ProductDto', 'must be a JSON object', endpoint),
      endpoint
    );
  }

  return {
    product_id: requireString(raw, 'product_id', endpoint),
    organization_id: requireString(raw, 'organization_id', endpoint),
    category_id: requireString(raw, 'category_id', endpoint),
    sku: requireString(raw, 'sku', endpoint),
    barcode: requireNullableString(raw, 'barcode', endpoint),
    name: requireString(raw, 'name', endpoint),
    generic_name: requireNullableString(raw, 'generic_name', endpoint),
    brand_name: requireNullableString(raw, 'brand_name', endpoint),
    base_uom_code: requireString(raw, 'base_uom_code', endpoint),
    tax_rate: requireNumber(raw, 'tax_rate', endpoint),
    image_url: requireNullableString(raw, 'image_url', endpoint),
    lot_tracking_required: requireBoolean(
      raw,
      'lot_tracking_required',
      endpoint
    ),
    expiry_alert_days: requireInteger(raw, 'expiry_alert_days', endpoint),
    is_active: requireBoolean(raw, 'is_active', endpoint),
    uoms: requireArray(
      raw,
      'uoms',
      (item) => normalizeProductUom(item, endpoint),
      endpoint
    ),
    created_at: requireString(raw, 'created_at', endpoint),
    updated_at: requireString(raw, 'updated_at', endpoint),
  };
}

/**
 * Validates and normalizes a `ReorderRuleDto`
 * (`GET/PUT /branches/{branchId}/products/{productId}/reorder-rule`).
 */
export function normalizeReorderRule(
  raw: unknown,
  endpoint?: string
): NormalizedReorderRule {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage(
        'ReorderRuleDto',
        'must be a JSON object',
        endpoint
      ),
      endpoint
    );
  }

  return {
    reorder_rule_id: requireString(raw, 'reorder_rule_id', endpoint),
    organization_id: requireString(raw, 'organization_id', endpoint),
    branch_id: requireString(raw, 'branch_id', endpoint),
    product_id: requireString(raw, 'product_id', endpoint),
    reorder_point_base: requireNumber(raw, 'reorder_point_base', endpoint),
    reorder_quantity_base: requireNumber(
      raw,
      'reorder_quantity_base',
      endpoint
    ),
    max_quantity_base: requireNullableNumber(
      raw,
      'max_quantity_base',
      endpoint
    ),
    is_active: requireBoolean(raw, 'is_active', endpoint),
    updated_at: requireString(raw, 'updated_at', endpoint),
  };
}

// ---------------------------------------------------------------------------
// Inventory DTO normalizers (`/contracts/schemas/inventory.json`)
// ---------------------------------------------------------------------------

/**
 * Validates and normalizes an `InventoryLocationDto`
 * (`GET/POST/PATCH /inventory/locations`).
 */
export function normalizeInventoryLocation(
  raw: unknown,
  endpoint?: string
): NormalizedInventoryLocation {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage(
        'InventoryLocationDto',
        'must be a JSON object',
        endpoint
      ),
      endpoint
    );
  }

  return {
    location_id: requireString(raw, 'location_id', endpoint),
    organization_id: requireString(raw, 'organization_id', endpoint),
    branch_id: requireString(raw, 'branch_id', endpoint),
    location_code: requireString(raw, 'location_code', endpoint),
    name: requireString(raw, 'name', endpoint),
    location_type: requireEnum(raw, 'location_type', isLocationType, endpoint),
    is_sellable: requireBoolean(raw, 'is_sellable', endpoint),
    is_active: requireBoolean(raw, 'is_active', endpoint),
    updated_at: requireString(raw, 'updated_at', endpoint),
  };
}

/**
 * Validates and normalizes an `InventoryBatchDto`
 * (`GET /inventory/batches`).
 */
export function normalizeInventoryBatch(
  raw: unknown,
  endpoint?: string
): NormalizedInventoryBatch {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage(
        'InventoryBatchDto',
        'must be a JSON object',
        endpoint
      ),
      endpoint
    );
  }

  return {
    batch_id: requireString(raw, 'batch_id', endpoint),
    organization_id: requireString(raw, 'organization_id', endpoint),
    product_id: requireString(raw, 'product_id', endpoint),
    batch_number: requireString(raw, 'batch_number', endpoint),
    manufactured_on: requireNullableString(raw, 'manufactured_on', endpoint),
    expires_on: requireNullableString(raw, 'expires_on', endpoint),
    quality_status: requireEnum(
      raw,
      'quality_status',
      isBatchQualityStatus,
      endpoint
    ),
    updated_at: requireString(raw, 'updated_at', endpoint),
  };
}

/**
 * Validates and normalizes a `StockBalanceDto`
 * (`GET /inventory/balances` and nested `InventorySummaryDto.locations_and_lots`).
 */
export function normalizeStockBalance(
  raw: unknown,
  endpoint?: string
): NormalizedStockBalance {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage(
        'StockBalanceDto',
        'must be a JSON object',
        endpoint
      ),
      endpoint
    );
  }

  return {
    organization_id: requireString(raw, 'organization_id', endpoint),
    branch_id: requireString(raw, 'branch_id', endpoint),
    product_id: requireString(raw, 'product_id', endpoint),
    product_sku: requireString(raw, 'product_sku', endpoint),
    product_name: requireString(raw, 'product_name', endpoint),
    base_uom_code: requireString(raw, 'base_uom_code', endpoint),
    location_id: requireString(raw, 'location_id', endpoint),
    location_code: requireString(raw, 'location_code', endpoint),
    location_type: requireEnum(raw, 'location_type', isLocationType, endpoint),
    is_location_sellable: requireBoolean(raw, 'is_location_sellable', endpoint),
    batch_id: requireString(raw, 'batch_id', endpoint),
    batch_number: requireString(raw, 'batch_number', endpoint),
    manufactured_on: requireNullableString(raw, 'manufactured_on', endpoint),
    expires_on: requireNullableString(raw, 'expires_on', endpoint),
    quality_status: requireEnum(
      raw,
      'quality_status',
      isBatchQualityStatus,
      endpoint
    ),
    on_hand_qty_base: requireNumber(raw, 'on_hand_qty_base', endpoint),
    available_qty_base: requireNumber(raw, 'available_qty_base', endpoint),
    average_unit_cost: requireNumber(raw, 'average_unit_cost', endpoint),
    updated_at: requireString(raw, 'updated_at', endpoint),
    row_version: requireInteger(raw, 'row_version', endpoint),
  };
}

/**
 * Validates and normalizes an `InventorySummaryDto`
 * (`GET /inventory/summary`).
 */
export function normalizeInventorySummary(
  raw: unknown,
  endpoint?: string
): NormalizedInventorySummary {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage(
        'InventorySummaryDto',
        'must be a JSON object',
        endpoint
      ),
      endpoint
    );
  }

  return {
    organization_id: requireString(raw, 'organization_id', endpoint),
    branch_id: requireString(raw, 'branch_id', endpoint),
    product_id: requireString(raw, 'product_id', endpoint),
    base_uom_code: requireString(raw, 'base_uom_code', endpoint),
    total_on_hand_qty_base: requireNumber(
      raw,
      'total_on_hand_qty_base',
      endpoint
    ),
    total_available_qty_base: requireNumber(
      raw,
      'total_available_qty_base',
      endpoint
    ),
    weighted_average_unit_cost_base: requireNumber(
      raw,
      'weighted_average_unit_cost_base',
      endpoint
    ),
    locations_and_lots: requireArray(
      raw,
      'locations_and_lots',
      (item) => normalizeStockBalance(item, endpoint),
      endpoint
    ),
  };
}

/**
 * Validates and normalizes an `InventoryTxnLineDto`
 * (embedded in `InventoryTxnDto.lines`).
 */
export function normalizeInventoryTxnLine(
  raw: unknown,
  endpoint?: string
): NormalizedInventoryTxnLine {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage(
        'InventoryTxnLineDto',
        'must be a JSON object',
        endpoint
      ),
      endpoint
    );
  }

  return {
    inventory_txn_line_id: requireString(
      raw,
      'inventory_txn_line_id',
      endpoint
    ),
    product_id: requireString(raw, 'product_id', endpoint),
    location_id: requireString(raw, 'location_id', endpoint),
    batch_id: requireString(raw, 'batch_id', endpoint),
    batch_number: requireString(raw, 'batch_number', endpoint),
    product_uom_id: requireString(raw, 'product_uom_id', endpoint),
    entered_qty: requireNumber(raw, 'entered_qty', endpoint),
    conversion_snapshot: requireNumber(raw, 'conversion_snapshot', endpoint),
    quantity_delta_base: requireNumber(raw, 'quantity_delta_base', endpoint),
    unit_cost_base: requireNumber(raw, 'unit_cost_base', endpoint),
  };
}

/**
 * Validates and normalizes an `InventoryTxnDto`
 * (`GET /inventory/transactions`, `GET /inventory/transactions/{id}`,
 * and `POST /inventory/adjustments`).
 */
export function normalizeInventoryTxn(
  raw: unknown,
  endpoint?: string
): NormalizedInventoryTxn {
  if (!isPlainRecord(raw)) {
    throw new ContractValidationError(
      formatValidationMessage(
        'InventoryTxnDto',
        'must be a JSON object',
        endpoint
      ),
      endpoint
    );
  }

  return {
    inventory_txn_id: requireString(raw, 'inventory_txn_id', endpoint),
    organization_id: requireString(raw, 'organization_id', endpoint),
    branch_id: requireString(raw, 'branch_id', endpoint),
    transaction_no: requireString(raw, 'transaction_no', endpoint),
    transaction_type: requireEnum(
      raw,
      'transaction_type',
      isInventoryTransactionType,
      endpoint
    ),
    status: requireEnum(raw, 'status', isInventoryTransactionStatus, endpoint),
    reason_code: requireNullableString(raw, 'reason_code', endpoint),
    note: requireNullableString(raw, 'note', endpoint),
    idempotency_key: requireString(raw, 'idempotency_key', endpoint, {
      allowEmpty: true,
    }),
    created_by_employee_id: requireString(
      raw,
      'created_by_employee_id',
      endpoint
    ),
    reverses_inventory_txn_id: requireNullableString(
      raw,
      'reverses_inventory_txn_id',
      endpoint
    ),
    posted_at: requireNullableString(raw, 'posted_at', endpoint),
    lines: requireArray(
      raw,
      'lines',
      (item) => normalizeInventoryTxnLine(item, endpoint),
      endpoint
    ),
  };
}
