import { describe, expect, it } from 'vitest';
import inventoryBalanceFixture from '@contracts/fixtures/inventory-balance.json';
import productFixture from '@contracts/fixtures/product.json';
import { ContractValidationError } from './normalizers';
import {
  ADJUSTMENTS_TXN_TYPES,
  BATCH_QUALITY_STATUSES,
  INVENTORY_TRANSACTION_STATUSES,
  INVENTORY_TRANSACTION_TYPES,
  LOCATION_TYPES,
  isAdjustmentsTxnType,
  isBatchQualityStatus,
  isInventoryTransactionStatus,
  isInventoryTransactionType,
  isLocationType,
  normalizeInventoryBatch,
  normalizeInventoryLocation,
  normalizeInventorySummary,
  normalizeInventoryTxn,
  normalizeInventoryTxnLine,
  normalizeProduct,
  normalizeProductCategory,
  normalizeProductUom,
  normalizeReorderRule,
  normalizeStockBalance,
  requireNullableNumber,
} from './catalogInventoryNormalizers';

function expectInvalidResponse(fn: () => unknown, endpoint?: string): void {
  try {
    fn();
    expect.fail('Expected ContractValidationError to be thrown');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ContractValidationError);
    if (error instanceof ContractValidationError) {
      expect(error.code).toBe('INVALID_RESPONSE');
      if (endpoint !== undefined) {
        expect(error.endpoint).toBe(endpoint);
      }
    }
  }
}

const VALID_CATEGORY_PAYLOAD = {
  category_id: '11111111-5555-4111-8111-000000000002',
  organization_id: '11111111-1111-4111-8111-111111111101',
  parent_category_id: '11111111-5555-4111-8111-000000000001',
  code: 'ANTIBIOTICS',
  name: 'Antibiotics',
  description: 'Systemic antibacterial medications',
  is_active: true,
  created_at: '2026-01-15T08:00:00+00:00',
  updated_at: '2026-11-25T10:00:00+00:00',
};

const VALID_REORDER_RULE_PAYLOAD = {
  reorder_rule_id: '11111111-6666-4111-8111-000000000001',
  organization_id: '11111111-1111-4111-8111-111111111101',
  branch_id: '11111111-2222-4111-8111-000000000001',
  product_id: '6dbdb1a7-c723-da4c-8e0e-b067c18bc710',
  reorder_point_base: 56,
  reorder_quantity_base: 140,
  max_quantity_base: 420,
  is_active: true,
  updated_at: '2026-11-25T10:00:00+00:00',
};

const VALID_LOCATION_PAYLOAD = {
  location_id: '694cb9a9-c19d-3c46-be41-a7fc76fcdc9f',
  organization_id: '11111111-1111-4111-8111-111111111101',
  branch_id: '11111111-2222-4111-8111-000000000001',
  location_code: 'MAIN-DAMAGED',
  name: 'Damaged Stock Hold Cage',
  location_type: 'DAMAGED',
  is_sellable: false,
  is_active: true,
  updated_at: '2026-11-25T10:15:00+00:00',
};

const VALID_BATCH_PAYLOAD = {
  batch_id: '7a8b9c0d-1e2f-5a3b-8c4d-5e6f7a8b9c0d',
  organization_id: '11111111-1111-4111-8111-111111111101',
  product_id: '6dbdb1a7-c723-da4c-8e0e-b067c18bc710',
  batch_number: 'MEDCARE-LOT-2601',
  manufactured_on: '2026-01-10',
  expires_on: '2027-07-31',
  quality_status: 'AVAILABLE',
  updated_at: '2026-11-25T10:15:00+00:00',
};

const VALID_TXN_LINE_PAYLOAD = {
  inventory_txn_line_id: '11111111-7777-4111-8111-000000000001',
  product_id: '6dbdb1a7-c723-da4c-8e0e-b067c18bc710',
  location_id: '694cb9a9-c19d-3c46-be41-a7fc76fcdc9f',
  batch_id: '7a8b9c0d-1e2f-5a3b-8c4d-5e6f7a8b9c0d',
  batch_number: 'MEDCARE-LOT-2601',
  product_uom_id: 'b554caea-c8f3-f349-902e-8bc2049041bd',
  entered_qty: -2,
  conversion_snapshot: 7,
  quantity_delta_base: -14,
  unit_cost_base: 7.2,
};

const VALID_TXN_PAYLOAD = {
  inventory_txn_id: '11111111-8888-4111-8111-000000000001',
  organization_id: '11111111-1111-4111-8111-111111111101',
  branch_id: '11111111-2222-4111-8111-000000000001',
  transaction_no: 'INV-2026-00042',
  transaction_type: 'ADJUSTMENT_OUT',
  status: 'POSTED',
  reason_code: 'CYCLE_COUNT_VARIANCE',
  note: 'Physical count adjustment',
  idempotency_key: 'idem-adj-00042',
  created_by_employee_id: '11111111-3333-4111-8111-000000000001',
  reverses_inventory_txn_id: null,
  posted_at: '2026-11-25T11:00:00+00:00',
  lines: [VALID_TXN_LINE_PAYLOAD],
};

describe('Stage 1 Inventory closed vocabularies and predicates', () => {
  it('validates LocationType including DAMAGED', () => {
    expect(LOCATION_TYPES).toEqual([
      'SELLABLE',
      'QUARANTINE',
      'DAMAGED',
      'SCRAP',
    ]);
    for (const value of LOCATION_TYPES) {
      expect(isLocationType(value)).toBe(true);
    }
    expect(isLocationType('DAMAGED')).toBe(true);
    expect(isLocationType('damaged')).toBe(false);
    expect(isLocationType('RECEIVING')).toBe(false);
    expect(isLocationType(null)).toBe(false);
    expect(isLocationType(undefined)).toBe(false);
    expect(isLocationType(123)).toBe(false);
  });

  it('validates BatchQualityStatus', () => {
    expect(BATCH_QUALITY_STATUSES).toEqual([
      'AVAILABLE',
      'QUARANTINED',
      'EXPIRED',
      'RECALLED',
    ]);
    for (const value of BATCH_QUALITY_STATUSES) {
      expect(isBatchQualityStatus(value)).toBe(true);
    }
    expect(isBatchQualityStatus('DAMAGED')).toBe(false);
    expect(isBatchQualityStatus(null)).toBe(false);
    expect(isBatchQualityStatus(false)).toBe(false);
  });

  it('validates InventoryTransactionType and AdjustmentsTxnType subset', () => {
    expect(INVENTORY_TRANSACTION_TYPES).toEqual([
      'OPENING_BALANCE',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'SALE_ISSUE',
      'SALES_RETURN_IN',
      'PURCHASE_RECEIPT',
      'VENDOR_RETURN_OUT',
      'SCRAP_OUT',
      'REVERSAL',
    ]);
    expect(ADJUSTMENTS_TXN_TYPES).toEqual([
      'OPENING_BALANCE',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'REVERSAL',
    ]);

    for (const value of INVENTORY_TRANSACTION_TYPES) {
      expect(isInventoryTransactionType(value)).toBe(true);
    }
    for (const value of ADJUSTMENTS_TXN_TYPES) {
      expect(isAdjustmentsTxnType(value)).toBe(true);
    }

    expect(isAdjustmentsTxnType('SALE_ISSUE')).toBe(false);
    expect(isAdjustmentsTxnType('PURCHASE_RECEIPT')).toBe(false);
    expect(isAdjustmentsTxnType('SCRAP_OUT')).toBe(false);
    expect(isInventoryTransactionType('TRANSFER_OUT')).toBe(false);
    expect(isInventoryTransactionType(undefined)).toBe(false);
  });

  it('validates InventoryTransactionStatus', () => {
    expect(INVENTORY_TRANSACTION_STATUSES).toEqual([
      'DRAFT',
      'POSTED',
      'CANCELLED',
    ]);
    for (const value of INVENTORY_TRANSACTION_STATUSES) {
      expect(isInventoryTransactionStatus(value)).toBe(true);
    }
    expect(isInventoryTransactionStatus('VOIDED')).toBe(false);
    expect(isInventoryTransactionStatus({})).toBe(false);
  });
});

describe('requireNullableNumber', () => {
  it('returns finite numbers (including 0 and negatives) and normalizes explicit null to null', () => {
    expect(requireNullableNumber({ price: 10.5 }, 'price', '/uoms')).toBe(10.5);
    expect(requireNullableNumber({ price: 0 }, 'price', '/uoms')).toBe(0);
    expect(requireNullableNumber({ delta: -7.25 }, 'delta', '/txns')).toBe(
      -7.25
    );
    expect(requireNullableNumber({ price: null }, 'price', '/uoms')).toBeNull();
    expect(
      requireNullableNumber({}, 'price', '/uoms', { allowUndefined: true })
    ).toBeNull();
    expect(
      requireNullableNumber({ price: undefined }, 'price', '/uoms', {
        allowUndefined: true,
      })
    ).toBeNull();
  });

  it('rejects missing keys, undefined (by default), string decimals, NaN, Infinity, booleans, and objects with INVALID_RESPONSE', () => {
    expectInvalidResponse(
      () => requireNullableNumber({}, 'price', '/uoms'),
      '/uoms'
    );
    expectInvalidResponse(
      () => requireNullableNumber({ price: undefined }, 'price', '/uoms'),
      '/uoms'
    );
    expectInvalidResponse(
      () => requireNullableNumber({ price: '10.50' }, 'price', '/uoms'),
      '/uoms'
    );
    expectInvalidResponse(
      () => requireNullableNumber({ price: '' }, 'price', '/uoms'),
      '/uoms'
    );
    expectInvalidResponse(
      () => requireNullableNumber({ price: Number.NaN }, 'price', '/uoms'),
      '/uoms'
    );
    expectInvalidResponse(
      () =>
        requireNullableNumber(
          { price: Number.POSITIVE_INFINITY },
          'price',
          '/uoms'
        ),
      '/uoms'
    );
    expectInvalidResponse(
      () =>
        requireNullableNumber(
          { price: Number.NEGATIVE_INFINITY },
          'price',
          '/uoms'
        ),
      '/uoms'
    );
    expectInvalidResponse(
      () => requireNullableNumber({ price: true }, 'price', '/uoms'),
      '/uoms'
    );
    expectInvalidResponse(
      () => requireNullableNumber({ price: {} }, 'price', '/uoms'),
      '/uoms'
    );
  });
});

describe('normalizeProductCategory', () => {
  it('accepts valid ProductCategoryDto with explicit null nullable strings and rejects missing keys', () => {
    const populated = normalizeProductCategory(
      VALID_CATEGORY_PAYLOAD,
      '/product-categories'
    );
    expect(populated).toEqual(VALID_CATEGORY_PAYLOAD);

    const rootCategory = normalizeProductCategory(
      {
        ...VALID_CATEGORY_PAYLOAD,
        parent_category_id: null,
        description: null,
        is_active: false,
      },
      '/product-categories'
    );
    expect(rootCategory.parent_category_id).toBeNull();
    expect(rootCategory.description).toBeNull();
    expect(rootCategory.is_active).toBe(false);

    expectInvalidResponse(
      () =>
        normalizeProductCategory(
          { ...VALID_CATEGORY_PAYLOAD, parent_category_id: undefined },
          '/product-categories'
        ),
      '/product-categories'
    );
    expectInvalidResponse(
      () =>
        normalizeProductCategory(
          { ...VALID_CATEGORY_PAYLOAD, description: undefined },
          '/product-categories'
        ),
      '/product-categories'
    );
  });

  it('rejects malformed ProductCategoryDto payloads with INVALID_RESPONSE', () => {
    expectInvalidResponse(
      () => normalizeProductCategory(null, '/product-categories'),
      '/product-categories'
    );
    expectInvalidResponse(
      () =>
        normalizeProductCategory(
          { ...VALID_CATEGORY_PAYLOAD, code: '   ' },
          '/product-categories'
        ),
      '/product-categories'
    );
    expectInvalidResponse(
      () =>
        normalizeProductCategory(
          { ...VALID_CATEGORY_PAYLOAD, parent_category_id: 42 },
          '/product-categories'
        ),
      '/product-categories'
    );
    expectInvalidResponse(
      () =>
        normalizeProductCategory(
          { ...VALID_CATEGORY_PAYLOAD, is_active: 'true' },
          '/product-categories'
        ),
      '/product-categories'
    );
  });
});

describe('normalizeProductUom', () => {
  it('accepts valid ProductUomDto including 0 and explicit null sale_unit_price while rejecting omitted sale_unit_price', () => {
    const baseUom = normalizeProductUom(productFixture.uoms[0], '/uoms');
    expect(baseUom.uom_code).toBe('TAB');
    expect(baseUom.conversion_to_base).toBe(1);
    expect(baseUom.sale_unit_price).toBe(10.5);

    const nonSellableUom = normalizeProductUom(
      {
        ...productFixture.uoms[0],
        sale_unit_price: null,
        is_sellable: false,
      },
      '/uoms'
    );
    expect(nonSellableUom.sale_unit_price).toBeNull();

    const zeroPriceUom = normalizeProductUom(
      {
        ...productFixture.uoms[0],
        sale_unit_price: 0,
      },
      '/uoms'
    );
    expect(zeroPriceUom.sale_unit_price).toBe(0);

    expectInvalidResponse(
      () =>
        normalizeProductUom(
          { ...productFixture.uoms[0], sale_unit_price: undefined },
          '/uoms'
        ),
      '/uoms'
    );
  });

  it('rejects legacy string decimals on conversion_to_base and sale_unit_price', () => {
    expectInvalidResponse(
      () => normalizeProductUom('invalid', '/uoms'),
      '/uoms'
    );
    expectInvalidResponse(
      () =>
        normalizeProductUom(
          { ...productFixture.uoms[0], sale_unit_price: '10.50' },
          '/uoms'
        ),
      '/uoms'
    );
    expectInvalidResponse(
      () =>
        normalizeProductUom(
          { ...productFixture.uoms[0], conversion_to_base: '1' },
          '/uoms'
        ),
      '/uoms'
    );
  });
});

describe('normalizeProduct', () => {
  it('validates @contracts/fixtures/product.json verbatim', () => {
    const normalized = normalizeProduct(productFixture, '/products');
    expect(normalized).toEqual(productFixture);
    expect(normalized.tax_rate).toBe(0);
    expect(normalized.image_url).toBeNull();
    expect(normalized.expiry_alert_days).toBe(90);
    expect(normalized.uoms).toHaveLength(3);
  });

  it('accepts 0 values, empty uoms array, and explicit null nullable strings while rejecting omitted nullable keys', () => {
    const minimalProduct = normalizeProduct(
      {
        ...productFixture,
        barcode: null,
        generic_name: null,
        brand_name: null,
        image_url: null,
        tax_rate: 0,
        expiry_alert_days: 0,
        lot_tracking_required: false,
        uoms: [],
      },
      '/products'
    );
    expect(minimalProduct.barcode).toBeNull();
    expect(minimalProduct.generic_name).toBeNull();
    expect(minimalProduct.brand_name).toBeNull();
    expect(minimalProduct.image_url).toBeNull();
    expect(minimalProduct.tax_rate).toBe(0);
    expect(minimalProduct.expiry_alert_days).toBe(0);
    expect(minimalProduct.uoms).toEqual([]);

    expectInvalidResponse(
      () =>
        normalizeProduct(
          { ...productFixture, barcode: undefined },
          '/products'
        ),
      '/products'
    );
  });

  it('rejects legacy string decimals, non-integer expiry_alert_days, or invalid nested UOMs', () => {
    expectInvalidResponse(
      () => normalizeProduct(undefined, '/products'),
      '/products'
    );
    expectInvalidResponse(
      () =>
        normalizeProduct({ ...productFixture, tax_rate: '0.14' }, '/products'),
      '/products'
    );
    expectInvalidResponse(
      () =>
        normalizeProduct(
          { ...productFixture, expiry_alert_days: 30.5 },
          '/products'
        ),
      '/products'
    );
    expectInvalidResponse(
      () =>
        normalizeProduct(
          { ...productFixture, expiry_alert_days: '90' },
          '/products'
        ),
      '/products'
    );
    expectInvalidResponse(
      () => normalizeProduct({ ...productFixture, uoms: null }, '/products'),
      '/products'
    );
    expectInvalidResponse(
      () =>
        normalizeProduct(
          {
            ...productFixture,
            uoms: [{ ...productFixture.uoms[0], sale_unit_price: '10.50' }],
          },
          '/products'
        ),
      '/products'
    );
  });
});

describe('normalizeReorderRule', () => {
  it('accepts valid ReorderRuleDto including reorder_point_base: 0 and explicit null max_quantity_base while rejecting missing max_quantity_base', () => {
    const normalized = normalizeReorderRule(
      VALID_REORDER_RULE_PAYLOAD,
      '/reorder-rule'
    );
    expect(normalized).toEqual(VALID_REORDER_RULE_PAYLOAD);

    const zeroPointNoMax = normalizeReorderRule(
      {
        ...VALID_REORDER_RULE_PAYLOAD,
        reorder_point_base: 0,
        reorder_quantity_base: 0,
        max_quantity_base: null,
      },
      '/reorder-rule'
    );
    expect(zeroPointNoMax.reorder_point_base).toBe(0);
    expect(zeroPointNoMax.reorder_quantity_base).toBe(0);
    expect(zeroPointNoMax.max_quantity_base).toBeNull();

    expectInvalidResponse(
      () =>
        normalizeReorderRule(
          { ...VALID_REORDER_RULE_PAYLOAD, max_quantity_base: undefined },
          '/reorder-rule'
        ),
      '/reorder-rule'
    );
  });

  it('rejects string decimals or missing fields on ReorderRuleDto', () => {
    expectInvalidResponse(
      () => normalizeReorderRule([], '/reorder-rule'),
      '/reorder-rule'
    );
    expectInvalidResponse(
      () =>
        normalizeReorderRule(
          { ...VALID_REORDER_RULE_PAYLOAD, reorder_point_base: '56' },
          '/reorder-rule'
        ),
      '/reorder-rule'
    );
    expectInvalidResponse(
      () =>
        normalizeReorderRule(
          { ...VALID_REORDER_RULE_PAYLOAD, max_quantity_base: '420.00' },
          '/reorder-rule'
        ),
      '/reorder-rule'
    );
  });
});

describe('normalizeInventoryLocation', () => {
  it('accepts valid InventoryLocationDto including DAMAGED location_type', () => {
    const damaged = normalizeInventoryLocation(
      VALID_LOCATION_PAYLOAD,
      '/inventory/locations'
    );
    expect(damaged).toEqual(VALID_LOCATION_PAYLOAD);
    expect(damaged.location_type).toBe('DAMAGED');
    expect(damaged.is_sellable).toBe(false);
  });

  it('rejects invalid location_type or malformed fields', () => {
    expectInvalidResponse(
      () => normalizeInventoryLocation(null, '/inventory/locations'),
      '/inventory/locations'
    );
    expectInvalidResponse(
      () =>
        normalizeInventoryLocation(
          { ...VALID_LOCATION_PAYLOAD, location_type: 'BACKROOM' },
          '/inventory/locations'
        ),
      '/inventory/locations'
    );
    expectInvalidResponse(
      () =>
        normalizeInventoryLocation(
          { ...VALID_LOCATION_PAYLOAD, location_code: '' },
          '/inventory/locations'
        ),
      '/inventory/locations'
    );
  });
});

describe('normalizeInventoryBatch', () => {
  it('accepts valid InventoryBatchDto with explicit null dates and rejects missing nullable date keys', () => {
    const fullBatch = normalizeInventoryBatch(
      VALID_BATCH_PAYLOAD,
      '/inventory/batches'
    );
    expect(fullBatch).toEqual(VALID_BATCH_PAYLOAD);

    const undatedBatch = normalizeInventoryBatch(
      {
        ...VALID_BATCH_PAYLOAD,
        manufactured_on: null,
        expires_on: null,
        quality_status: 'QUARANTINED',
      },
      '/inventory/batches'
    );
    expect(undatedBatch.manufactured_on).toBeNull();
    expect(undatedBatch.expires_on).toBeNull();
    expect(undatedBatch.quality_status).toBe('QUARANTINED');

    expectInvalidResponse(
      () =>
        normalizeInventoryBatch(
          { ...VALID_BATCH_PAYLOAD, manufactured_on: undefined },
          '/inventory/batches'
        ),
      '/inventory/batches'
    );
    expectInvalidResponse(
      () =>
        normalizeInventoryBatch(
          { ...VALID_BATCH_PAYLOAD, expires_on: undefined },
          '/inventory/batches'
        ),
      '/inventory/batches'
    );
  });

  it('rejects invalid quality_status or non-string dates', () => {
    expectInvalidResponse(
      () => normalizeInventoryBatch(123, '/inventory/batches'),
      '/inventory/batches'
    );
    expectInvalidResponse(
      () =>
        normalizeInventoryBatch(
          { ...VALID_BATCH_PAYLOAD, quality_status: 'BLOCKED' },
          '/inventory/batches'
        ),
      '/inventory/batches'
    );
    expectInvalidResponse(
      () =>
        normalizeInventoryBatch(
          { ...VALID_BATCH_PAYLOAD, expires_on: 20270731 },
          '/inventory/batches'
        ),
      '/inventory/batches'
    );
  });
});

describe('normalizeStockBalance', () => {
  it('validates @contracts/fixtures/inventory-balance.json verbatim', () => {
    const normalized = normalizeStockBalance(
      inventoryBalanceFixture,
      '/inventory/balances'
    );
    expect(normalized).toEqual(inventoryBalanceFixture);
    expect(normalized.on_hand_qty_base).toBe(280);
    expect(normalized.available_qty_base).toBe(280);
    expect(normalized.average_unit_cost).toBe(7.2);
    expect(normalized.row_version).toBe(3);
  });

  it('accepts DAMAGED location_type, 0 quantities/costs/row_version, and explicit null dates while rejecting missing date keys', () => {
    const zeroDamagedBalance = normalizeStockBalance(
      {
        ...inventoryBalanceFixture,
        location_type: 'DAMAGED',
        is_location_sellable: false,
        manufactured_on: null,
        expires_on: null,
        quality_status: 'EXPIRED',
        on_hand_qty_base: 0,
        available_qty_base: 0,
        average_unit_cost: 0,
        row_version: 0,
      },
      '/inventory/balances'
    );
    expect(zeroDamagedBalance.location_type).toBe('DAMAGED');
    expect(zeroDamagedBalance.manufactured_on).toBeNull();
    expect(zeroDamagedBalance.expires_on).toBeNull();
    expect(zeroDamagedBalance.on_hand_qty_base).toBe(0);
    expect(zeroDamagedBalance.available_qty_base).toBe(0);
    expect(zeroDamagedBalance.average_unit_cost).toBe(0);
    expect(zeroDamagedBalance.row_version).toBe(0);

    expectInvalidResponse(
      () =>
        normalizeStockBalance(
          { ...inventoryBalanceFixture, expires_on: undefined },
          '/inventory/balances'
        ),
      '/inventory/balances'
    );
  });

  it('rejects legacy string decimals and non-integer row_version', () => {
    expectInvalidResponse(
      () => normalizeStockBalance(null, '/inventory/balances'),
      '/inventory/balances'
    );
    expectInvalidResponse(
      () =>
        normalizeStockBalance(
          { ...inventoryBalanceFixture, on_hand_qty_base: '280' },
          '/inventory/balances'
        ),
      '/inventory/balances'
    );
    expectInvalidResponse(
      () =>
        normalizeStockBalance(
          { ...inventoryBalanceFixture, average_unit_cost: '7.20' },
          '/inventory/balances'
        ),
      '/inventory/balances'
    );
    expectInvalidResponse(
      () =>
        normalizeStockBalance(
          { ...inventoryBalanceFixture, row_version: 3.14 },
          '/inventory/balances'
        ),
      '/inventory/balances'
    );
    expectInvalidResponse(
      () =>
        normalizeStockBalance(
          { ...inventoryBalanceFixture, row_version: '3' },
          '/inventory/balances'
        ),
      '/inventory/balances'
    );
  });
});

describe('normalizeInventorySummary', () => {
  it('accepts valid InventorySummaryDto with nested locations_and_lots and 0 totals', () => {
    const summaryWithLots = normalizeInventorySummary(
      {
        organization_id: '11111111-1111-4111-8111-111111111101',
        branch_id: '11111111-2222-4111-8111-000000000001',
        product_id: '6dbdb1a7-c723-da4c-8e0e-b067c18bc710',
        base_uom_code: 'TAB',
        total_on_hand_qty_base: 280,
        total_available_qty_base: 280,
        weighted_average_unit_cost_base: 7.2,
        locations_and_lots: [inventoryBalanceFixture],
      },
      '/inventory/summary'
    );
    expect(summaryWithLots.locations_and_lots).toHaveLength(1);
    expect(summaryWithLots.locations_and_lots[0]).toEqual(
      inventoryBalanceFixture
    );

    const emptySummary = normalizeInventorySummary(
      {
        organization_id: '11111111-1111-4111-8111-111111111101',
        branch_id: '11111111-2222-4111-8111-000000000001',
        product_id: '6dbdb1a7-c723-da4c-8e0e-b067c18bc710',
        base_uom_code: 'TAB',
        total_on_hand_qty_base: 0,
        total_available_qty_base: 0,
        weighted_average_unit_cost_base: 0,
        locations_and_lots: [],
      },
      '/inventory/summary'
    );
    expect(emptySummary.total_on_hand_qty_base).toBe(0);
    expect(emptySummary.total_available_qty_base).toBe(0);
    expect(emptySummary.weighted_average_unit_cost_base).toBe(0);
    expect(emptySummary.locations_and_lots).toEqual([]);
  });

  it('rejects string decimals or invalid nested balance items in InventorySummaryDto', () => {
    expectInvalidResponse(
      () => normalizeInventorySummary(undefined, '/inventory/summary'),
      '/inventory/summary'
    );
    expectInvalidResponse(
      () =>
        normalizeInventorySummary(
          {
            organization_id: '11111111-1111-4111-8111-111111111101',
            branch_id: '11111111-2222-4111-8111-000000000001',
            product_id: '6dbdb1a7-c723-da4c-8e0e-b067c18bc710',
            base_uom_code: 'TAB',
            total_on_hand_qty_base: '280',
            total_available_qty_base: 280,
            weighted_average_unit_cost_base: 7.2,
            locations_and_lots: [],
          },
          '/inventory/summary'
        ),
      '/inventory/summary'
    );
    expectInvalidResponse(
      () =>
        normalizeInventorySummary(
          {
            organization_id: '11111111-1111-4111-8111-111111111101',
            branch_id: '11111111-2222-4111-8111-000000000001',
            product_id: '6dbdb1a7-c723-da4c-8e0e-b067c18bc710',
            base_uom_code: 'TAB',
            total_on_hand_qty_base: 280,
            total_available_qty_base: 280,
            weighted_average_unit_cost_base: 7.2,
            locations_and_lots: [
              { ...inventoryBalanceFixture, available_qty_base: '280.0' },
            ],
          },
          '/inventory/summary'
        ),
      '/inventory/summary'
    );
  });
});

describe('normalizeInventoryTxnLine', () => {
  it('accepts negative, 0, and positive numeric deltas and unit costs', () => {
    const negativeLine = normalizeInventoryTxnLine(
      VALID_TXN_LINE_PAYLOAD,
      '/inventory/transactions'
    );
    expect(negativeLine).toEqual(VALID_TXN_LINE_PAYLOAD);
    expect(negativeLine.entered_qty).toBe(-2);
    expect(negativeLine.quantity_delta_base).toBe(-14);

    const zeroLine = normalizeInventoryTxnLine(
      {
        ...VALID_TXN_LINE_PAYLOAD,
        entered_qty: 0,
        conversion_snapshot: 0,
        quantity_delta_base: 0,
        unit_cost_base: 0,
      },
      '/inventory/transactions'
    );
    expect(zeroLine.entered_qty).toBe(0);
    expect(zeroLine.conversion_snapshot).toBe(0);
    expect(zeroLine.quantity_delta_base).toBe(0);
    expect(zeroLine.unit_cost_base).toBe(0);
  });

  it('rejects legacy string decimals on InventoryTxnLineDto', () => {
    expectInvalidResponse(
      () => normalizeInventoryTxnLine(null, '/inventory/transactions'),
      '/inventory/transactions'
    );
    expectInvalidResponse(
      () =>
        normalizeInventoryTxnLine(
          { ...VALID_TXN_LINE_PAYLOAD, quantity_delta_base: '-14.0' },
          '/inventory/transactions'
        ),
      '/inventory/transactions'
    );
    expectInvalidResponse(
      () =>
        normalizeInventoryTxnLine(
          { ...VALID_TXN_LINE_PAYLOAD, unit_cost_base: '7.20' },
          '/inventory/transactions'
        ),
      '/inventory/transactions'
    );
  });
});

describe('normalizeInventoryTxn', () => {
  it('accepts valid InventoryTxnDto, empty idempotency_key, and explicit null nullable strings while rejecting missing nullable keys', () => {
    const posted = normalizeInventoryTxn(
      VALID_TXN_PAYLOAD,
      '/inventory/transactions'
    );
    expect(posted).toEqual(VALID_TXN_PAYLOAD);

    const draftReversal = normalizeInventoryTxn(
      {
        ...VALID_TXN_PAYLOAD,
        transaction_type: 'REVERSAL',
        status: 'DRAFT',
        reason_code: null,
        note: null,
        idempotency_key: '',
        reverses_inventory_txn_id: '11111111-8888-4111-8111-000000000000',
        posted_at: null,
        lines: [],
      },
      '/inventory/transactions'
    );
    expect(draftReversal.transaction_type).toBe('REVERSAL');
    expect(draftReversal.status).toBe('DRAFT');
    expect(draftReversal.reason_code).toBeNull();
    expect(draftReversal.note).toBeNull();
    expect(draftReversal.idempotency_key).toBe('');
    expect(draftReversal.reverses_inventory_txn_id).toBe(
      '11111111-8888-4111-8111-000000000000'
    );
    expect(draftReversal.posted_at).toBeNull();
    expect(draftReversal.lines).toEqual([]);

    expectInvalidResponse(
      () =>
        normalizeInventoryTxn(
          { ...VALID_TXN_PAYLOAD, reason_code: undefined },
          '/inventory/transactions'
        ),
      '/inventory/transactions'
    );
    expectInvalidResponse(
      () =>
        normalizeInventoryTxn(
          { ...VALID_TXN_PAYLOAD, posted_at: undefined },
          '/inventory/transactions'
        ),
      '/inventory/transactions'
    );
  });

  it('rejects non-string idempotency_key, invalid enums, or malformed lines', () => {
    expectInvalidResponse(
      () => normalizeInventoryTxn('invalid', '/inventory/transactions'),
      '/inventory/transactions'
    );
    expectInvalidResponse(
      () =>
        normalizeInventoryTxn(
          { ...VALID_TXN_PAYLOAD, idempotency_key: null },
          '/inventory/transactions'
        ),
      '/inventory/transactions'
    );
    expectInvalidResponse(
      () =>
        normalizeInventoryTxn(
          { ...VALID_TXN_PAYLOAD, idempotency_key: undefined },
          '/inventory/transactions'
        ),
      '/inventory/transactions'
    );
    expectInvalidResponse(
      () =>
        normalizeInventoryTxn(
          { ...VALID_TXN_PAYLOAD, transaction_type: 'MANUAL_FIX' },
          '/inventory/transactions'
        ),
      '/inventory/transactions'
    );
    expectInvalidResponse(
      () =>
        normalizeInventoryTxn(
          { ...VALID_TXN_PAYLOAD, status: 'PENDING' },
          '/inventory/transactions'
        ),
      '/inventory/transactions'
    );
    expectInvalidResponse(
      () =>
        normalizeInventoryTxn(
          {
            ...VALID_TXN_PAYLOAD,
            lines: [{ ...VALID_TXN_LINE_PAYLOAD, entered_qty: '-2' }],
          },
          '/inventory/transactions'
        ),
      '/inventory/transactions'
    );
  });
});
