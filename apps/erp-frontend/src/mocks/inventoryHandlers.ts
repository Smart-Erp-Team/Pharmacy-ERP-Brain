import { http, HttpResponse, type JsonBodyType } from 'msw';
import inventoryBalanceFixture from '@contracts/fixtures/inventory-balance.json';
import productFixture from '@contracts/fixtures/product.json';
import type {
  AdjustmentsTxnType,
  BatchQualityStatus,
  InventoryBalanceDto,
  InventoryBatchDto,
  InventoryLocationDto,
  InventoryTxnDto,
  InventoryTxnLineDto,
  InventoryTxnType,
  LocationType,
  ProductDto,
  ProductUomDto,
} from '../types/api';
import { INITIAL_PRODUCTS } from './productHandlers';

interface ValidationDetail {
  field: string;
  issue: string;
}

interface IdempotencyEntry {
  bodyText: string;
  status: number;
  responseBody: JsonBodyType;
}

const CAIRO_BRANCH_ID = 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa';
const ALEX_BRANCH_ID = 'e5f6a7b8-4444-4d55-9e66-ccddeeff0011';

const OMAR_EMPLOYEE_ID = 'a1111111-1111-4111-8111-111111111101';
const MONA_EMPLOYEE_ID = 'a1111111-1111-4111-8111-111111111102';
const YOUSSEF_EMPLOYEE_ID = 'a1111111-1111-4111-8111-111111111103';

const AUGMENTIN_PRODUCT_ID = inventoryBalanceFixture.product_id;
const AUGMENTIN_BASE_UOM_ID = 'c1d2e3f4-1111-4aaa-8a1b-111111110001';
const PANADOL_PRODUCT_ID = productFixture.product_id;
const PANADOL_BASE_UOM_ID = 'f1a2b3c4-0101-4fff-8a1b-56789012abcd';
const CETAL_PRODUCT_ID = 'd7e8f9a0-5555-4fff-9d4e-567890123bcd';
const CENTRUM_PRODUCT_ID = 'f9a0b1c2-7777-4bbb-9f6a-789012345def';

const CAIRO_SELL_LOCATION_ID = inventoryBalanceFixture.location_id;
const CAIRO_QUAR_LOCATION_ID = '2f31c9d4-7070-4a10-8b2d-ce0f1a2b3c15';
const CAIRO_SCRAP_LOCATION_ID = '2f31c9d4-7070-4a10-8b2d-ce0f1a2b3c16';
const CAIRO_INACTIVE_LOCATION_ID = '2f31c9d4-7070-4a10-8b2d-ce0f1a2b3c17';
const ALEX_SELL_LOCATION_ID = '3a41d0e5-7070-4a10-8b2d-ce0f1a2b3c21';
const ALEX_QUAR_LOCATION_ID = '3a41d0e5-7070-4a10-8b2d-ce0f1a2b3c22';
const ALEX_SCRAP_LOCATION_ID = '3a41d0e5-7070-4a10-8b2d-ce0f1a2b3c23';

const AUGMENTIN_BATCH_A_ID = inventoryBalanceFixture.batch_id;
const AUGMENTIN_BATCH_B_ID = '3a42d0e5-8080-4b2f-8d4a-3c4d5e6f8a17';
const AUGMENTIN_BATCH_Q_ID = '3a42d0e5-8080-4b2f-8d4a-3c4d5e6f8a18';
const AUGMENTIN_BATCH_E_ID = '3a42d0e5-8080-4b2f-8d4a-3c4d5e6f8a19';
const PANADOL_NON_LOT_BATCH_ID = '4b53e1f6-9090-4c3f-9e5b-4d5e6f7a8b01';
const CETAL_BATCH_A_ID = '5c64f2a7-9090-4c3f-9e5b-4d5e6f7a8b02';
const CENTRUM_NON_LOT_BATCH_ID = '6d7503b8-9090-4c3f-9e5b-4d5e6f7a8b03';

const VALID_LOCATION_TYPES: ReadonlySet<string> = new Set<LocationType>([
  'SELLABLE',
  'QUARANTINE',
  'SCRAP',
]);

const VALID_QUALITY_STATUSES: ReadonlySet<string> = new Set<BatchQualityStatus>(
  ['AVAILABLE', 'QUARANTINED', 'EXPIRED', 'RECALLED']
);

const VALID_ADJUSTMENT_TYPES: ReadonlySet<string> = new Set<AdjustmentsTxnType>(
  ['OPENING_BALANCE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL']
);

const VALID_TXN_TYPES: ReadonlySet<string> = new Set<InventoryTxnType>([
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

const DECIMAL_INPUT_PATTERN = /^(-)?(?:\d+(?:\.\d+)?|\.\d+)$/;
const NON_NEGATIVE_NUMERIC_4_PATTERN = /^\d{1,14}(\.\d{1,4})?$/;
const POSITIVE_NUMERIC_4_PATTERN = /^(?!0+(\.0{1,4})?$)\d{1,14}(\.\d{1,4})?$/;

function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function addUtcDays(daysOffset: number): string {
  const now = new Date();
  const utc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysOffset
  );
  return new Date(utc).toISOString().slice(0, 10);
}

function parseScaled4(raw: string): bigint | null {
  const trimmed = raw.trim();
  const match = DECIMAL_INPUT_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }
  const isNegative = Boolean(match[1]);
  const unsigned = isNegative ? trimmed.slice(1) : trimmed;
  const [rawInt = '', rawFrac = ''] = unsigned.split('.');
  if (rawFrac.length > 4) {
    return null;
  }
  const normInt = rawInt.replace(/^0+(?=\d)/, '') || '0';
  const isZero = /^0+$/.test(normInt) && /^0*$/.test(rawFrac);
  if (isNegative && isZero) {
    return null;
  }
  if (isZero) {
    return 0n;
  }
  const mag = BigInt(`${normInt}${rawFrac.padEnd(4, '0')}`);
  return isNegative ? -mag : mag;
}

function parseScaled6(raw: string): bigint | null {
  const trimmed = raw.trim();
  const match = DECIMAL_INPUT_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }
  const isNegative = Boolean(match[1]);
  const unsigned = isNegative ? trimmed.slice(1) : trimmed;
  const [rawInt = '', rawFrac = ''] = unsigned.split('.');
  if (rawFrac.length > 6) {
    return null;
  }
  const normInt = rawInt.replace(/^0+(?=\d)/, '') || '0';
  const isZero = /^0+$/.test(normInt) && /^0*$/.test(rawFrac);
  if (isNegative && isZero) {
    return null;
  }
  if (isZero) {
    return 0n;
  }
  const mag = BigInt(`${normInt}${rawFrac.padEnd(6, '0')}`);
  return isNegative ? -mag : mag;
}

function formatScaled4(scaled: bigint): string {
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

function divideHalfUpUnsigned(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

function multiplyQty4ByConversion6(
  qtyScaled4: bigint,
  conversionScaled6: bigint
): bigint {
  const product = qtyScaled4 * conversionScaled6;
  return divideHalfUpUnsigned(product, 1_000_000n);
}

function computeWeightedAvgCost4(
  oldQty4: bigint,
  oldCost4: bigint,
  addedQty4: bigint,
  addedCost4: bigint
): bigint {
  if (oldQty4 === 0n) {
    return addedCost4;
  }
  const newQty4 = oldQty4 + addedQty4;
  if (newQty4 <= 0n) {
    return oldCost4;
  }
  const numerator = oldQty4 * oldCost4 + addedQty4 * addedCost4;
  return divideHalfUpUnsigned(numerator, newQty4);
}

function normalizePositiveNumeric4(raw: string): string | null {
  const scaled = parseScaled4(raw);
  if (scaled === null || scaled <= 0n) {
    return null;
  }
  const formatted = formatScaled4(scaled);
  return POSITIVE_NUMERIC_4_PATTERN.test(formatted) ? formatted : null;
}

function normalizeNonNegativeNumeric4(raw: string): string | null {
  const scaled = parseScaled4(raw);
  if (scaled === null || scaled < 0n) {
    return null;
  }
  const formatted = formatScaled4(scaled);
  return NON_NEGATIVE_NUMERIC_4_PATTERN.test(formatted) ? formatted : null;
}

function isBatchEligibleForSale(
  batch: InventoryBatchDto | undefined,
  referenceDate: string
): boolean {
  if (!batch || batch.quality_status !== 'AVAILABLE') {
    return false;
  }
  if (batch.expires_on && batch.expires_on < referenceDate) {
    return false;
  }
  return true;
}

function isLocationEligibleForSale(
  location: InventoryLocationDto | undefined
): boolean {
  return Boolean(
    location &&
    location.location_type === 'SELLABLE' &&
    location.is_sellable &&
    location.is_active
  );
}

function deriveAvailableQtyBase(
  onHandQtyBase: string,
  location: InventoryLocationDto | undefined,
  batch: InventoryBatchDto | undefined
): string {
  if (
    isLocationEligibleForSale(location) &&
    isBatchEligibleForSale(batch, todayUtcDateString())
  ) {
    return onHandQtyBase;
  }
  return '0.0000';
}

export const INITIAL_INVENTORY_LOCATIONS: readonly InventoryLocationDto[] = [
  {
    location_id: CAIRO_SELL_LOCATION_ID,
    branch_id: CAIRO_BRANCH_ID,
    location_code: 'MAIN-SELL',
    name: 'Main Pharmacy Shelf',
    location_type: 'SELLABLE',
    is_sellable: true,
    is_active: true,
  },
  {
    location_id: CAIRO_QUAR_LOCATION_ID,
    branch_id: CAIRO_BRANCH_ID,
    location_code: 'CAI-QUAR',
    name: 'Cairo Quarantine Cage',
    location_type: 'QUARANTINE',
    is_sellable: false,
    is_active: true,
  },
  {
    location_id: CAIRO_SCRAP_LOCATION_ID,
    branch_id: CAIRO_BRANCH_ID,
    location_code: 'CAI-SCRAP',
    name: 'Cairo Disposal & Scrap Bin',
    location_type: 'SCRAP',
    is_sellable: false,
    is_active: true,
  },
  {
    location_id: CAIRO_INACTIVE_LOCATION_ID,
    branch_id: CAIRO_BRANCH_ID,
    location_code: 'CAI-SELL-OLD',
    name: 'Cairo Legacy Overflow Shelf',
    location_type: 'SELLABLE',
    is_sellable: true,
    is_active: false,
  },
  {
    location_id: ALEX_SELL_LOCATION_ID,
    branch_id: ALEX_BRANCH_ID,
    location_code: 'ALX-SELL',
    name: 'Alexandria Main Shelf',
    location_type: 'SELLABLE',
    is_sellable: true,
    is_active: true,
  },
  {
    location_id: ALEX_QUAR_LOCATION_ID,
    branch_id: ALEX_BRANCH_ID,
    location_code: 'ALX-QUAR',
    name: 'Alexandria Quarantine Area',
    location_type: 'QUARANTINE',
    is_sellable: false,
    is_active: true,
  },
  {
    location_id: ALEX_SCRAP_LOCATION_ID,
    branch_id: ALEX_BRANCH_ID,
    location_code: 'ALX-SCRAP',
    name: 'Alexandria Scrap Bin',
    location_type: 'SCRAP',
    is_sellable: false,
    is_active: true,
  },
];

export const INITIAL_INVENTORY_BATCHES: readonly InventoryBatchDto[] = [
  {
    batch_id: AUGMENTIN_BATCH_A_ID,
    product_id: AUGMENTIN_PRODUCT_ID,
    batch_number: 'AUG-2026-A',
    manufactured_on: addUtcDays(-300),
    expires_on: addUtcDays(25),
    quality_status: 'AVAILABLE',
    is_non_lot: false,
  },
  {
    batch_id: AUGMENTIN_BATCH_B_ID,
    product_id: AUGMENTIN_PRODUCT_ID,
    batch_number: 'AUG-2027-B',
    manufactured_on: addUtcDays(-60),
    expires_on: addUtcDays(365),
    quality_status: 'AVAILABLE',
    is_non_lot: false,
  },
  {
    batch_id: AUGMENTIN_BATCH_Q_ID,
    product_id: AUGMENTIN_PRODUCT_ID,
    batch_number: 'AUG-2026-Q',
    manufactured_on: addUtcDays(-120),
    expires_on: addUtcDays(180),
    quality_status: 'QUARANTINED',
    is_non_lot: false,
  },
  {
    batch_id: AUGMENTIN_BATCH_E_ID,
    product_id: AUGMENTIN_PRODUCT_ID,
    batch_number: 'AUG-2020-E',
    manufactured_on: '2018-05-01',
    expires_on: '2020-05-01',
    quality_status: 'EXPIRED',
    is_non_lot: false,
  },
  {
    batch_id: PANADOL_NON_LOT_BATCH_ID,
    product_id: PANADOL_PRODUCT_ID,
    batch_number: 'NON-LOT',
    manufactured_on: null,
    expires_on: null,
    quality_status: 'AVAILABLE',
    is_non_lot: true,
  },
  {
    batch_id: CETAL_BATCH_A_ID,
    product_id: CETAL_PRODUCT_ID,
    batch_number: 'CET-2027-A',
    manufactured_on: addUtcDays(-45),
    expires_on: addUtcDays(240),
    quality_status: 'AVAILABLE',
    is_non_lot: false,
  },
  {
    batch_id: CENTRUM_NON_LOT_BATCH_ID,
    product_id: CENTRUM_PRODUCT_ID,
    batch_number: 'NON-LOT',
    manufactured_on: null,
    expires_on: null,
    quality_status: 'AVAILABLE',
    is_non_lot: true,
  },
];

function buildInitialBalance(
  seed: Omit<InventoryBalanceDto, 'available_qty_base'>
): InventoryBalanceDto {
  const location = INITIAL_INVENTORY_LOCATIONS.find(
    (loc) => loc.location_id === seed.location_id
  );
  const batch = INITIAL_INVENTORY_BATCHES.find(
    (item) => item.batch_id === seed.batch_id
  );
  return {
    ...seed,
    available_qty_base: deriveAvailableQtyBase(
      seed.on_hand_qty_base,
      location,
      batch
    ),
  };
}

export const INITIAL_INVENTORY_BALANCES: readonly InventoryBalanceDto[] = [
  {
    ...inventoryBalanceFixture,
    available_qty_base: deriveAvailableQtyBase(
      inventoryBalanceFixture.on_hand_qty_base,
      INITIAL_INVENTORY_LOCATIONS.find(
        (loc) => loc.location_id === inventoryBalanceFixture.location_id
      ),
      INITIAL_INVENTORY_BATCHES.find(
        (batch) => batch.batch_id === inventoryBalanceFixture.batch_id
      )
    ),
  },
  buildInitialBalance({
    product_id: AUGMENTIN_PRODUCT_ID,
    branch_id: CAIRO_BRANCH_ID,
    location_id: CAIRO_SELL_LOCATION_ID,
    batch_id: AUGMENTIN_BATCH_B_ID,
    on_hand_qty_base: '1400.0000',
    average_unit_cost: '1.2500',
    row_version: 102,
    updated_at: '2026-10-15T09:40:12Z',
  }),
  buildInitialBalance({
    product_id: AUGMENTIN_PRODUCT_ID,
    branch_id: CAIRO_BRANCH_ID,
    location_id: CAIRO_QUAR_LOCATION_ID,
    batch_id: AUGMENTIN_BATCH_Q_ID,
    on_hand_qty_base: '280.0000',
    average_unit_cost: '1.2052',
    row_version: 103,
    updated_at: '2026-10-14T11:20:00Z',
  }),
  buildInitialBalance({
    product_id: AUGMENTIN_PRODUCT_ID,
    branch_id: CAIRO_BRANCH_ID,
    location_id: CAIRO_SCRAP_LOCATION_ID,
    batch_id: AUGMENTIN_BATCH_E_ID,
    on_hand_qty_base: '140.0000',
    average_unit_cost: '1.1500',
    row_version: 104,
    updated_at: '2026-10-12T15:05:00Z',
  }),
  buildInitialBalance({
    product_id: PANADOL_PRODUCT_ID,
    branch_id: CAIRO_BRANCH_ID,
    location_id: CAIRO_SELL_LOCATION_ID,
    batch_id: PANADOL_NON_LOT_BATCH_ID,
    on_hand_qty_base: '1200.0000',
    average_unit_cost: '0.8500',
    row_version: 105,
    updated_at: '2026-10-15T09:40:12Z',
  }),
  buildInitialBalance({
    product_id: AUGMENTIN_PRODUCT_ID,
    branch_id: ALEX_BRANCH_ID,
    location_id: ALEX_SELL_LOCATION_ID,
    batch_id: AUGMENTIN_BATCH_B_ID,
    on_hand_qty_base: '700.0000',
    average_unit_cost: '1.2500',
    row_version: 201,
    updated_at: '2026-10-10T10:00:00Z',
  }),
  buildInitialBalance({
    product_id: PANADOL_PRODUCT_ID,
    branch_id: ALEX_BRANCH_ID,
    location_id: ALEX_SELL_LOCATION_ID,
    batch_id: PANADOL_NON_LOT_BATCH_ID,
    on_hand_qty_base: '500.0000',
    average_unit_cost: '0.8500',
    row_version: 202,
    updated_at: '2026-10-10T10:00:00Z',
  }),
];

export const INITIAL_INVENTORY_TXNS: readonly InventoryTxnDto[] = [
  {
    inventory_txn_id: '7d9503b8-1001-4ca5-8a0b-cd4040620003',
    branch_id: CAIRO_BRANCH_ID,
    transaction_no: 'TXN-2026-000003',
    transaction_type: 'ADJUSTMENT_IN',
    status: 'DRAFT',
    reason_code: 'PENDING_RECOUNT',
    note: 'Pending recount verification for back-shelf box stock.',
    posted_at: null,
    created_by_employee_id: YOUSSEF_EMPLOYEE_ID,
    reverses_inventory_txn_id: null,
    sales_order_id: null,
    sales_return_id: null,
    purchase_order_id: null,
    vendor_return_id: null,
    lines: [
      {
        inventory_txn_line_id: '7d9503b8-2001-4ca5-8a0b-cd4040620301',
        product_id: AUGMENTIN_PRODUCT_ID,
        location_id: CAIRO_SELL_LOCATION_ID,
        batch_id: AUGMENTIN_BATCH_B_ID,
        product_uom_id: AUGMENTIN_BASE_UOM_ID,
        entered_qty: '70.0000',
        conversion_snapshot: '1.000000',
        quantity_delta_base: '70.0000',
        unit_cost_base: '1.2500',
        sales_order_line_id: null,
        sales_return_line_id: null,
        purchase_order_line_id: null,
        vendor_return_line_id: null,
      },
    ],
  },
  {
    inventory_txn_id: '7d9503b8-1001-4ca5-8a0b-cd4040620002',
    branch_id: CAIRO_BRANCH_ID,
    transaction_no: 'TXN-2026-000002',
    transaction_type: 'ADJUSTMENT_IN',
    status: 'POSTED',
    reason_code: 'CYCLE_COUNT_SURPLUS',
    note: 'Cycle count surplus verified on Cairo main shelf.',
    posted_at: '2026-10-15T09:40:12Z',
    created_by_employee_id: OMAR_EMPLOYEE_ID,
    reverses_inventory_txn_id: null,
    sales_order_id: null,
    sales_return_id: null,
    purchase_order_id: null,
    vendor_return_id: null,
    lines: [
      {
        inventory_txn_line_id: '7d9503b8-2001-4ca5-8a0b-cd4040620201',
        product_id: PANADOL_PRODUCT_ID,
        location_id: CAIRO_SELL_LOCATION_ID,
        batch_id: PANADOL_NON_LOT_BATCH_ID,
        product_uom_id: PANADOL_BASE_UOM_ID,
        entered_qty: '200.0000',
        conversion_snapshot: '1.000000',
        quantity_delta_base: '200.0000',
        unit_cost_base: '0.8500',
        sales_order_line_id: null,
        sales_return_line_id: null,
        purchase_order_line_id: null,
        vendor_return_line_id: null,
      },
      {
        inventory_txn_line_id: '7d9503b8-2001-4ca5-8a0b-cd4040620202',
        product_id: AUGMENTIN_PRODUCT_ID,
        location_id: CAIRO_SELL_LOCATION_ID,
        batch_id: AUGMENTIN_BATCH_B_ID,
        product_uom_id: AUGMENTIN_BASE_UOM_ID,
        entered_qty: '1400.0000',
        conversion_snapshot: '1.000000',
        quantity_delta_base: '1400.0000',
        unit_cost_base: '1.2500',
        sales_order_line_id: null,
        sales_return_line_id: null,
        purchase_order_line_id: null,
        vendor_return_line_id: null,
      },
    ],
  },
  {
    inventory_txn_id: '7d9503b8-1001-4ca5-8a0b-cd4040620001',
    branch_id: CAIRO_BRANCH_ID,
    transaction_no: 'TXN-2026-000001',
    transaction_type: 'OPENING_BALANCE',
    status: 'POSTED',
    reason_code: 'INITIAL_COUNT',
    note: 'Opening stock balance posted locally at Cairo branch launch.',
    posted_at: '2026-10-01T08:00:00Z',
    created_by_employee_id: YOUSSEF_EMPLOYEE_ID,
    reverses_inventory_txn_id: null,
    sales_order_id: null,
    sales_return_id: null,
    purchase_order_id: null,
    vendor_return_id: null,
    lines: [
      {
        inventory_txn_line_id: '7d9503b8-2001-4ca5-8a0b-cd4040620101',
        product_id: AUGMENTIN_PRODUCT_ID,
        location_id: CAIRO_SELL_LOCATION_ID,
        batch_id: AUGMENTIN_BATCH_A_ID,
        product_uom_id: AUGMENTIN_BASE_UOM_ID,
        entered_qty: '5000.0000',
        conversion_snapshot: '1.000000',
        quantity_delta_base: '5000.0000',
        unit_cost_base: '1.2052',
        sales_order_line_id: null,
        sales_return_line_id: null,
        purchase_order_line_id: null,
        vendor_return_line_id: null,
      },
      {
        inventory_txn_line_id: '7d9503b8-2001-4ca5-8a0b-cd4040620102',
        product_id: PANADOL_PRODUCT_ID,
        location_id: CAIRO_SELL_LOCATION_ID,
        batch_id: PANADOL_NON_LOT_BATCH_ID,
        product_uom_id: PANADOL_BASE_UOM_ID,
        entered_qty: '1000.0000',
        conversion_snapshot: '1.000000',
        quantity_delta_base: '1000.0000',
        unit_cost_base: '0.8500',
        sales_order_line_id: null,
        sales_return_line_id: null,
        purchase_order_line_id: null,
        vendor_return_line_id: null,
      },
    ],
  },
  {
    inventory_txn_id: '7d9503b8-1001-4ca5-8a0b-cd4040620004',
    branch_id: ALEX_BRANCH_ID,
    transaction_no: 'TXN-2026-000004',
    transaction_type: 'OPENING_BALANCE',
    status: 'POSTED',
    reason_code: 'INITIAL_COUNT',
    note: 'Opening stock balance posted locally at Alexandria branch launch.',
    posted_at: '2026-10-02T09:00:00Z',
    created_by_employee_id: MONA_EMPLOYEE_ID,
    reverses_inventory_txn_id: null,
    sales_order_id: null,
    sales_return_id: null,
    purchase_order_id: null,
    vendor_return_id: null,
    lines: [
      {
        inventory_txn_line_id: '7d9503b8-2001-4ca5-8a0b-cd4040620401',
        product_id: AUGMENTIN_PRODUCT_ID,
        location_id: ALEX_SELL_LOCATION_ID,
        batch_id: AUGMENTIN_BATCH_B_ID,
        product_uom_id: AUGMENTIN_BASE_UOM_ID,
        entered_qty: '700.0000',
        conversion_snapshot: '1.000000',
        quantity_delta_base: '700.0000',
        unit_cost_base: '1.2500',
        sales_order_line_id: null,
        sales_return_line_id: null,
        purchase_order_line_id: null,
        vendor_return_line_id: null,
      },
      {
        inventory_txn_line_id: '7d9503b8-2001-4ca5-8a0b-cd4040620402',
        product_id: PANADOL_PRODUCT_ID,
        location_id: ALEX_SELL_LOCATION_ID,
        batch_id: PANADOL_NON_LOT_BATCH_ID,
        product_uom_id: PANADOL_BASE_UOM_ID,
        entered_qty: '500.0000',
        conversion_snapshot: '1.000000',
        quantity_delta_base: '500.0000',
        unit_cost_base: '0.8500',
        sales_order_line_id: null,
        sales_return_line_id: null,
        purchase_order_line_id: null,
        vendor_return_line_id: null,
      },
    ],
  },
];

function cloneLocation(location: InventoryLocationDto): InventoryLocationDto {
  return { ...location };
}

function cloneBatch(batch: InventoryBatchDto): InventoryBatchDto {
  return { ...batch };
}

function cloneBalance(balance: InventoryBalanceDto): InventoryBalanceDto {
  return { ...balance };
}

function cloneTxnLine(line: InventoryTxnLineDto): InventoryTxnLineDto {
  return { ...line };
}

function cloneTxn(txn: InventoryTxnDto): InventoryTxnDto {
  return {
    ...txn,
    lines: txn.lines.map(cloneTxnLine),
  };
}

let mockLocations: InventoryLocationDto[] =
  INITIAL_INVENTORY_LOCATIONS.map(cloneLocation);
let mockBatches: InventoryBatchDto[] =
  INITIAL_INVENTORY_BATCHES.map(cloneBatch);
let mockBalances: InventoryBalanceDto[] =
  INITIAL_INVENTORY_BALANCES.map(cloneBalance);
let mockTxns: InventoryTxnDto[] = INITIAL_INVENTORY_TXNS.map(cloneTxn);
let idempotencyStore = new Map<string, IdempotencyEntry>();
let idCounter = 0;
let txnCounter = 4;

export function resetMockInventory(): void {
  mockLocations = INITIAL_INVENTORY_LOCATIONS.map(cloneLocation);
  mockBatches = INITIAL_INVENTORY_BATCHES.map(cloneBatch);
  mockBalances = INITIAL_INVENTORY_BALANCES.map(cloneBalance);
  mockTxns = INITIAL_INVENTORY_TXNS.map(cloneTxn);
  idempotencyStore = new Map<string, IdempotencyEntry>();
  idCounter = 0;
  txnCounter = 4;
}

function createMockUuid(): string {
  idCounter += 1;
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `10000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
}

function nextTransactionNo(): string {
  txnCounter += 1;
  return `TXN-2026-${String(txnCounter).padStart(6, '0')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isLocationType(value: string): value is LocationType {
  return VALID_LOCATION_TYPES.has(value);
}

function isBatchQualityStatus(value: string): value is BatchQualityStatus {
  return VALID_QUALITY_STATUSES.has(value);
}

function isAdjustmentsTxnType(value: string): value is AdjustmentsTxnType {
  return VALID_ADJUSTMENT_TYPES.has(value);
}

function isInventoryTxnType(value: string): value is InventoryTxnType {
  return VALID_TXN_TYPES.has(value);
}

function malformedRequestResponse(message: string) {
  return HttpResponse.json(
    {
      error: {
        code: 'MALFORMED_REQUEST',
        message,
        trace_id: 'mock-trace-inventory-malformed',
      },
    },
    { status: 400 }
  );
}

function notFoundResponse(message: string) {
  return HttpResponse.json(
    {
      error: {
        code: 'NOT_FOUND',
        message,
        trace_id: 'mock-trace-inventory-not-found',
      },
    },
    { status: 404 }
  );
}

function validationErrorResponse(message: string, details: ValidationDetail[]) {
  return HttpResponse.json(
    {
      error: {
        code: 'VALIDATION_ERROR',
        message,
        trace_id: 'mock-trace-inventory-validation',
        details,
      },
    },
    { status: 422 }
  );
}

function conflictResponse(message: string, details: ValidationDetail[] = []) {
  return HttpResponse.json(
    {
      error: {
        code: 'CONFLICT',
        message,
        trace_id: 'mock-trace-inventory-conflict',
        ...(details.length > 0 ? { details } : {}),
      },
    },
    { status: 409 }
  );
}

function outOfStockResponse(message: string, details: ValidationDetail[]) {
  return HttpResponse.json(
    {
      error: {
        code: 'OUT_OF_STOCK',
        message,
        trace_id: 'mock-trace-inventory-out-of-stock',
        details,
      },
    },
    { status: 409 }
  );
}

function idempotencyMismatchResponse() {
  return HttpResponse.json(
    {
      error: {
        code: 'IDEMPOTENCY_MISMATCH',
        message:
          'Idempotency-Key was already used with a different request payload.',
        trace_id: 'mock-trace-inventory-idempotency-mismatch',
      },
    },
    { status: 409 }
  );
}

function parsePaginationParams(url: URL): { start: number; limit: number } {
  const rawLimit = Number(url.searchParams.get('limit') ?? '50');
  const parsedLimit = Math.floor(rawLimit);
  const limit =
    Number.isFinite(rawLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 200)
      : 50;
  const rawCursor = Number(url.searchParams.get('cursor') ?? '0');
  const parsedCursor = Math.floor(rawCursor);
  const start =
    Number.isFinite(rawCursor) && parsedCursor >= 0 ? parsedCursor : 0;

  return { start, limit };
}

function checkIdempotency(
  request: Request,
  bodyText: string
): {
  key: string | null;
  replayResponse: Response | null;
} {
  const rawKey = request.headers.get('Idempotency-Key')?.trim() ?? '';
  if (!rawKey) {
    return { key: null, replayResponse: null };
  }
  const url = new URL(request.url);
  const compositeKey = `${request.method.toUpperCase()}:${url.pathname}:${rawKey}`;
  const existing = idempotencyStore.get(compositeKey);
  if (!existing) {
    return { key: compositeKey, replayResponse: null };
  }
  if (existing.bodyText !== bodyText) {
    return { key: compositeKey, replayResponse: idempotencyMismatchResponse() };
  }
  if (existing.status === 204) {
    return {
      key: compositeKey,
      replayResponse: new HttpResponse(null, { status: 204 }),
    };
  }
  return {
    key: compositeKey,
    replayResponse: HttpResponse.json(existing.responseBody, {
      status: existing.status,
    }),
  };
}

function storeIdempotencySuccess(
  compositeKey: string | null,
  bodyText: string,
  status: number,
  responseBody: JsonBodyType
): void {
  if (!compositeKey) {
    return;
  }
  idempotencyStore.set(compositeKey, {
    bodyText,
    status,
    responseBody,
  });
}

function parseJsonBody(bodyText: string): unknown {
  if (!bodyText) {
    return null;
  }
  try {
    return JSON.parse(bodyText);
  } catch {
    return null;
  }
}

function validateNullableString(
  rawValue: unknown,
  field: string,
  maxLength: number,
  label: string,
  details: ValidationDetail[]
): string | null {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }
  if (typeof rawValue !== 'string') {
    details.push({ field, issue: `${label} must be a string or null.` });
    return null;
  }
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    details.push({
      field,
      issue: `${label} must be at most ${maxLength} characters.`,
    });
    return null;
  }
  return trimmed;
}

function findProductAndUom(
  productId: string,
  uomId: string
): { product: ProductDto; uom: ProductUomDto; baseUom: ProductUomDto } | null {
  const product = INITIAL_PRODUCTS.find(
    (item) => item.product_id === productId
  );
  if (!product) {
    return null;
  }
  const uom = product.uoms.find((item) => item.product_uom_id === uomId);
  const baseUom = product.uoms.find((item) => item.is_base) ?? product.uoms[0];
  if (!uom || !baseUom) {
    return null;
  }
  return { product, uom, baseUom };
}

function balanceMapKey(
  branchId: string,
  locationId: string,
  batchId: string
): string {
  return `${branchId}:${locationId}:${batchId}`;
}

function findOriginalLineForReversal(
  originalTxn: InventoryTxnDto,
  productId: string,
  locationId: string,
  batchId: string,
  lineIndex: number
): InventoryTxnLineDto | undefined {
  return (
    originalTxn.lines.find(
      (line) =>
        line.product_id === productId &&
        line.location_id === locationId &&
        line.batch_id === batchId
    ) ??
    originalTxn.lines[lineIndex] ??
    originalTxn.lines[0]
  );
}

interface ResolvedLineBuildResult {
  lines: InventoryTxnLineDto[] | null;
  validationDetails: ValidationDetail[];
}

function buildTxnLinesFromRequest(
  rawLines: unknown,
  branchId: string,
  transactionType: AdjustmentsTxnType,
  originalTxn: InventoryTxnDto | null
): ResolvedLineBuildResult {
  const details: ValidationDetail[] = [];

  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    details.push({
      field: 'lines',
      issue: 'At least one adjustment line is required.',
    });
    return { lines: null, validationDetails: details };
  }

  const requiresUnitCost =
    transactionType === 'OPENING_BALANCE' ||
    transactionType === 'ADJUSTMENT_IN';

  const builtLines: InventoryTxnLineDto[] = [];

  for (let i = 0; i < rawLines.length; i += 1) {
    const lineDetailsStart = details.length;
    const rawLine: unknown = rawLines[i];
    if (!isRecord(rawLine)) {
      details.push({
        field: `lines[${i}].product_id`,
        issue: 'Adjustment line must be a JSON object.',
      });
      continue;
    }

    const productId = readTrimmedString(rawLine.product_id);
    const locationId = readTrimmedString(rawLine.location_id);
    const batchId = readTrimmedString(rawLine.batch_id);
    const productUomId = readTrimmedString(rawLine.product_uom_id);
    const enteredQtyRaw = readTrimmedString(rawLine.entered_qty);

    if (!productId) {
      details.push({
        field: `lines[${i}].product_id`,
        issue: 'Product is required.',
      });
    }
    if (!locationId) {
      details.push({
        field: `lines[${i}].location_id`,
        issue: 'Location is required.',
      });
    }
    if (!batchId) {
      details.push({
        field: `lines[${i}].batch_id`,
        issue: 'Batch is required.',
      });
    }
    if (!productUomId) {
      details.push({
        field: `lines[${i}].product_uom_id`,
        issue: 'Unit of measure is required.',
      });
    }

    const normalizedQty = enteredQtyRaw
      ? normalizePositiveNumeric4(enteredQtyRaw)
      : null;
    if (!normalizedQty) {
      details.push({
        field: `lines[${i}].entered_qty`,
        issue: 'Entered quantity must be a positive 4-decimal number.',
      });
    }

    const product = productId
      ? INITIAL_PRODUCTS.find((item) => item.product_id === productId)
      : undefined;
    if (productId && !product) {
      details.push({
        field: `lines[${i}].product_id`,
        issue: 'Referenced product was not found.',
      });
    }

    const location = locationId
      ? mockLocations.find((loc) => loc.location_id === locationId)
      : undefined;
    if (locationId && (!location || location.branch_id !== branchId)) {
      details.push({
        field: `lines[${i}].location_id`,
        issue: 'Location does not exist in this branch.',
      });
    }

    const batch = batchId
      ? mockBatches.find((item) => item.batch_id === batchId)
      : undefined;
    if (batchId && !batch) {
      details.push({
        field: `lines[${i}].batch_id`,
        issue: 'Referenced batch was not found.',
      });
    } else if (batch && productId && batch.product_id !== productId) {
      details.push({
        field: `lines[${i}].batch_id`,
        issue: 'Batch does not belong to the selected product.',
      });
    }

    const resolvedProductUom =
      product && productUomId
        ? findProductAndUom(product.product_id, productUomId)
        : null;
    if (product && productUomId && !resolvedProductUom) {
      details.push({
        field: `lines[${i}].product_uom_id`,
        issue: 'Unit of measure does not belong to the selected product.',
      });
    }

    let unitCostBase: string | null = null;
    if (requiresUnitCost) {
      if (typeof rawLine.unit_cost_base !== 'string') {
        details.push({
          field: `lines[${i}].unit_cost_base`,
          issue: 'Unit cost is required for stock-in adjustments.',
        });
      } else {
        const normalizedCost = normalizeNonNegativeNumeric4(
          rawLine.unit_cost_base
        );
        if (!normalizedCost) {
          details.push({
            field: `lines[${i}].unit_cost_base`,
            issue: 'Unit cost must be a non-negative 4-decimal number.',
          });
        } else {
          unitCostBase = normalizedCost;
        }
      }
    }

    if (
      details.length > lineDetailsStart ||
      !normalizedQty ||
      !resolvedProductUom ||
      !product ||
      !location ||
      !batch
    ) {
      continue;
    }

    const qtyScaled4 = parseScaled4(normalizedQty);
    const conversionScaled6 = parseScaled6(
      resolvedProductUom.uom.conversion_to_base
    );
    if (
      qtyScaled4 === null ||
      conversionScaled6 === null ||
      conversionScaled6 <= 0n
    ) {
      details.push({
        field: `lines[${i}].product_uom_id`,
        issue: 'UOM conversion factor must be greater than 0.',
      });
      continue;
    }

    const baseQtyScaled4 = multiplyQty4ByConversion6(
      qtyScaled4,
      conversionScaled6
    );
    if (baseQtyScaled4 <= 0n) {
      details.push({
        field: `lines[${i}].entered_qty`,
        issue: 'Converted base quantity must be greater than 0.',
      });
      continue;
    }

    const baseQtyStr = formatScaled4(baseQtyScaled4);
    let isNegativeDelta = transactionType === 'ADJUSTMENT_OUT';

    if (transactionType === 'REVERSAL' && originalTxn) {
      const originalLine = findOriginalLineForReversal(
        originalTxn,
        product.product_id,
        location.location_id,
        batch.batch_id,
        i
      );
      if (originalLine) {
        const origDelta = parseScaled4(originalLine.quantity_delta_base) ?? 0n;
        isNegativeDelta = origDelta > 0n;
        unitCostBase = originalLine.unit_cost_base ?? null;
      }
    }

    const quantityDeltaBase = isNegativeDelta ? `-${baseQtyStr}` : baseQtyStr;

    builtLines.push({
      inventory_txn_line_id: createMockUuid(),
      product_id: product.product_id,
      location_id: location.location_id,
      batch_id: batch.batch_id,
      product_uom_id: resolvedProductUom.baseUom.product_uom_id,
      entered_qty: baseQtyStr,
      conversion_snapshot: '1.000000',
      quantity_delta_base: quantityDeltaBase,
      unit_cost_base: unitCostBase,
      sales_order_line_id: null,
      sales_return_line_id: null,
      purchase_order_line_id: null,
      vendor_return_line_id: null,
    });
  }

  if (details.length > 0) {
    return { lines: null, validationDetails: details };
  }

  return { lines: builtLines, validationDetails: [] };
}

interface BalanceApplicationResult {
  errorResponse: Response | null;
  postedLines: InventoryTxnLineDto[];
  nextBalances: InventoryBalanceDto[];
}

function applyLinesToBalances(
  branchId: string,
  lines: readonly InventoryTxnLineDto[],
  timestamp: string
): BalanceApplicationResult {
  const workingMap = new Map<string, InventoryBalanceDto>(
    mockBalances.map((balance) => [
      balanceMapKey(balance.branch_id, balance.location_id, balance.batch_id),
      cloneBalance(balance),
    ])
  );

  const postedLines: InventoryTxnLineDto[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) {
      continue;
    }

    const deltaScaled4 = parseScaled4(line.quantity_delta_base);
    if (deltaScaled4 === null || deltaScaled4 === 0n) {
      return {
        errorResponse: validationErrorResponse('Invalid line quantity delta.', [
          { field: `lines[${i}].entered_qty`, issue: 'Delta cannot be zero.' },
        ]),
        postedLines: [],
        nextBalances: [],
      };
    }

    const key = balanceMapKey(branchId, line.location_id, line.batch_id);
    const existing = workingMap.get(key);
    const oldQty4 = existing
      ? (parseScaled4(existing.on_hand_qty_base) ?? 0n)
      : 0n;
    const oldCost4 = existing
      ? (parseScaled4(existing.average_unit_cost) ?? 0n)
      : 0n;

    const newQty4 = oldQty4 + deltaScaled4;
    if (newQty4 < 0n) {
      return {
        errorResponse: outOfStockResponse(
          'The requested quantity exceeds available on-hand stock.',
          [
            {
              field: `lines[${i}].entered_qty`,
              issue: `Available on-hand quantity is ${formatScaled4(oldQty4)}.`,
            },
          ]
        ),
        postedLines: [],
        nextBalances: [],
      };
    }

    let nextCost4 = oldCost4;
    let resolvedLineCost = line.unit_cost_base ?? null;

    if (deltaScaled4 > 0n) {
      const incomingCost4 =
        resolvedLineCost !== null
          ? (parseScaled4(resolvedLineCost) ?? oldCost4)
          : oldCost4;
      nextCost4 = computeWeightedAvgCost4(
        oldQty4,
        oldCost4,
        deltaScaled4,
        incomingCost4
      );
      resolvedLineCost = formatScaled4(incomingCost4);
    } else if (resolvedLineCost === null) {
      resolvedLineCost = formatScaled4(oldCost4);
    }

    const onHandStr = formatScaled4(newQty4);
    const location = mockLocations.find(
      (loc) => loc.location_id === line.location_id
    );
    const batch = mockBatches.find((item) => item.batch_id === line.batch_id);

    const updatedBalance: InventoryBalanceDto = {
      product_id: line.product_id,
      branch_id: branchId,
      location_id: line.location_id,
      batch_id: line.batch_id,
      on_hand_qty_base: onHandStr,
      average_unit_cost: formatScaled4(nextCost4),
      available_qty_base: deriveAvailableQtyBase(onHandStr, location, batch),
      row_version: (existing?.row_version ?? 0) + 1,
      updated_at: timestamp,
    };

    workingMap.set(key, updatedBalance);
    postedLines.push({
      ...line,
      unit_cost_base: resolvedLineCost,
    });
  }

  return {
    errorResponse: null,
    postedLines,
    nextBalances: Array.from(workingMap.values()),
  };
}

function recomputeBalanceAvailabilityForLocation(locationId: string): void {
  const location = mockLocations.find((loc) => loc.location_id === locationId);
  mockBalances = mockBalances.map((balance) => {
    if (balance.location_id !== locationId) {
      return balance;
    }
    const batch = mockBatches.find(
      (item) => item.batch_id === balance.batch_id
    );
    return {
      ...balance,
      available_qty_base: deriveAvailableQtyBase(
        balance.on_hand_qty_base,
        location,
        batch
      ),
    };
  });
}

function parseTimestampBoundary(
  raw: string,
  isEndBound: boolean
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const normalized =
    isEndBound && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      ? `${trimmed}T23:59:59.999Z`
      : trimmed;
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : ms;
}

export const inventoryHandlers = [
  // =========================================================================
  // INVENTORY LOCATIONS
  // =========================================================================
  http.get('*/api/v1/inventory/locations', ({ request }) => {
    const url = new URL(request.url);
    const branchId = url.searchParams.get('branchId')?.trim() ?? '';
    if (!branchId) {
      return malformedRequestResponse('Query parameter branchId is required.');
    }

    const locationTypeParam =
      url.searchParams.get('locationType')?.trim() ?? '';
    if (locationTypeParam && !isLocationType(locationTypeParam)) {
      return malformedRequestResponse('Invalid locationType query parameter.');
    }

    const includeInactive = url.searchParams.get('includeInactive') === 'true';
    const { start, limit } = parsePaginationParams(url);

    const filtered = mockLocations.filter((location) => {
      if (location.branch_id !== branchId) {
        return false;
      }
      if (!includeInactive && !location.is_active) {
        return false;
      }
      if (locationTypeParam && location.location_type !== locationTypeParam) {
        return false;
      }
      return true;
    });

    const items = filtered.slice(start, start + limit).map(cloneLocation);
    const nextOffset = start + limit;
    const nextCursor = nextOffset < filtered.length ? String(nextOffset) : null;

    return HttpResponse.json({ items, nextCursor }, { status: 200 });
  }),

  http.get('*/api/v1/inventory/locations/:locationId', ({ params }) => {
    const location = mockLocations.find(
      (item) => item.location_id === params.locationId
    );
    if (!location) {
      return notFoundResponse('Inventory location was not found.');
    }
    return HttpResponse.json(cloneLocation(location), { status: 200 });
  }),

  http.post('*/api/v1/inventory/locations', async ({ request }) => {
    const bodyText = await request.text();
    const { key: idempKey, replayResponse } = checkIdempotency(
      request,
      bodyText
    );
    if (replayResponse) {
      return replayResponse;
    }

    const body: unknown = parseJsonBody(bodyText);
    if (!isRecord(body)) {
      return malformedRequestResponse(
        'Request body must be a valid JSON object.'
      );
    }

    const details: ValidationDetail[] = [];
    const branchId = readTrimmedString(body.branch_id);
    const locationCode = readTrimmedString(body.location_code);
    const name = readTrimmedString(body.name);
    const rawLocationType = readTrimmedString(body.location_type);

    if (!branchId) {
      details.push({ field: 'branch_id', issue: 'Branch ID is required.' });
    }
    if (!locationCode) {
      details.push({
        field: 'location_code',
        issue: 'Location code is required.',
      });
    } else if (locationCode.length > 30) {
      details.push({
        field: 'location_code',
        issue: 'Location code must be at most 30 characters.',
      });
    }
    if (!name) {
      details.push({ field: 'name', issue: 'Location name is required.' });
    } else if (name.length > 100) {
      details.push({
        field: 'name',
        issue: 'Location name must be at most 100 characters.',
      });
    }
    if (!rawLocationType || !isLocationType(rawLocationType)) {
      details.push({
        field: 'location_type',
        issue: 'Location type must be SELLABLE, QUARANTINE, or SCRAP.',
      });
    }
    if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
      details.push({
        field: 'is_active',
        issue: 'Active status must be a boolean.',
      });
    }

    if (details.length > 0 || !isLocationType(rawLocationType)) {
      return validationErrorResponse('Invalid location details.', details);
    }

    const normalizedCode = locationCode.toUpperCase();
    const duplicate = mockLocations.some(
      (item) =>
        item.branch_id === branchId &&
        item.location_code.trim().toUpperCase() === normalizedCode
    );
    if (duplicate) {
      return conflictResponse(
        `Location code "${locationCode}" already exists in this branch.`,
        [
          {
            field: 'location_code',
            issue: 'Location code must be unique within the branch.',
          },
        ]
      );
    }

    const created: InventoryLocationDto = {
      location_id: createMockUuid(),
      branch_id: branchId,
      location_code: locationCode,
      name,
      location_type: rawLocationType,
      is_sellable: rawLocationType === 'SELLABLE',
      is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
    };

    mockLocations = [created, ...mockLocations];
    const responsePayload = cloneLocation(created);
    storeIdempotencySuccess(idempKey, bodyText, 201, responsePayload);
    return HttpResponse.json(responsePayload, { status: 201 });
  }),

  http.patch(
    '*/api/v1/inventory/locations/:locationId',
    async ({ params, request }) => {
      const bodyText = await request.text();
      const { key: idempKey, replayResponse } = checkIdempotency(
        request,
        bodyText
      );
      if (replayResponse) {
        return replayResponse;
      }

      const index = mockLocations.findIndex(
        (item) => item.location_id === params.locationId
      );
      if (index === -1) {
        return notFoundResponse('Inventory location was not found.');
      }

      const current = mockLocations[index];
      if (!current) {
        return notFoundResponse('Inventory location was not found.');
      }

      const body: unknown = parseJsonBody(bodyText);
      if (!isRecord(body)) {
        return malformedRequestResponse('Malformed location patch payload.');
      }

      const details: ValidationDetail[] = [];

      let nextName = current.name;
      if ('name' in body) {
        const candidate = readTrimmedString(body.name);
        if (!candidate) {
          details.push({ field: 'name', issue: 'Location name is required.' });
        } else if (candidate.length > 100) {
          details.push({
            field: 'name',
            issue: 'Location name must be at most 100 characters.',
          });
        } else {
          nextName = candidate;
        }
      }

      let nextLocationType = current.location_type;
      if ('location_type' in body) {
        const candidate = readTrimmedString(body.location_type);
        if (!candidate || !isLocationType(candidate)) {
          details.push({
            field: 'location_type',
            issue: 'Location type must be SELLABLE, QUARANTINE, or SCRAP.',
          });
        } else {
          nextLocationType = candidate;
        }
      }

      let nextIsActive = current.is_active;
      if ('is_active' in body) {
        if (typeof body.is_active !== 'boolean') {
          details.push({
            field: 'is_active',
            issue: 'Active status must be a boolean.',
          });
        } else {
          nextIsActive = body.is_active;
        }
      }

      if (details.length > 0) {
        return validationErrorResponse(
          'Invalid location update details.',
          details
        );
      }

      const updated: InventoryLocationDto = {
        ...current,
        name: nextName,
        location_type: nextLocationType,
        is_sellable: nextLocationType === 'SELLABLE',
        is_active: nextIsActive,
      };

      mockLocations = mockLocations.map((item, idx) =>
        idx === index ? updated : item
      );
      recomputeBalanceAvailabilityForLocation(updated.location_id);

      const responsePayload = cloneLocation(updated);
      storeIdempotencySuccess(idempKey, bodyText, 200, responsePayload);
      return HttpResponse.json(responsePayload, { status: 200 });
    }
  ),

  // =========================================================================
  // INVENTORY BATCHES
  // =========================================================================
  http.get('*/api/v1/inventory/batches', ({ request }) => {
    const url = new URL(request.url);
    const branchId = url.searchParams.get('branchId')?.trim() ?? '';
    if (!branchId) {
      return malformedRequestResponse('Query parameter branchId is required.');
    }

    const productId = url.searchParams.get('productId')?.trim() ?? '';
    const qualityStatus = url.searchParams.get('qualityStatus')?.trim() ?? '';
    if (qualityStatus && !isBatchQualityStatus(qualityStatus)) {
      return malformedRequestResponse('Invalid qualityStatus query parameter.');
    }

    const { start, limit } = parsePaginationParams(url);

    const filtered = mockBatches.filter((batch) => {
      if (productId && batch.product_id !== productId) {
        return false;
      }
      if (qualityStatus && batch.quality_status !== qualityStatus) {
        return false;
      }
      return true;
    });

    const items = filtered.slice(start, start + limit).map(cloneBatch);
    const nextOffset = start + limit;
    const nextCursor = nextOffset < filtered.length ? String(nextOffset) : null;

    return HttpResponse.json({ items, nextCursor }, { status: 200 });
  }),

  // =========================================================================
  // INVENTORY BALANCES
  // =========================================================================
  http.get('*/api/v1/inventory/balances', ({ request }) => {
    const url = new URL(request.url);
    const branchId = url.searchParams.get('branchId')?.trim() ?? '';
    if (!branchId) {
      return malformedRequestResponse('Query parameter branchId is required.');
    }

    const productId = url.searchParams.get('productId')?.trim() ?? '';
    const locationId = url.searchParams.get('locationId')?.trim() ?? '';
    const batchId = url.searchParams.get('batchId')?.trim() ?? '';
    const { start, limit } = parsePaginationParams(url);

    const filtered = mockBalances.filter((balance) => {
      if (balance.branch_id !== branchId) {
        return false;
      }
      if (productId && balance.product_id !== productId) {
        return false;
      }
      if (locationId && balance.location_id !== locationId) {
        return false;
      }
      if (batchId && balance.batch_id !== batchId) {
        return false;
      }
      return true;
    });

    const items = filtered.slice(start, start + limit).map(cloneBalance);
    const nextOffset = start + limit;
    const nextCursor = nextOffset < filtered.length ? String(nextOffset) : null;

    return HttpResponse.json({ items, nextCursor }, { status: 200 });
  }),

  // =========================================================================
  // INVENTORY TRANSACTIONS (LEDGER)
  // =========================================================================
  http.get('*/api/v1/inventory/transactions', ({ request }) => {
    const url = new URL(request.url);
    const branchId = url.searchParams.get('branchId')?.trim() ?? '';
    if (!branchId) {
      return malformedRequestResponse('Query parameter branchId is required.');
    }

    const txnTypeParam = url.searchParams.get('transactionType')?.trim() ?? '';
    if (txnTypeParam && !isInventoryTxnType(txnTypeParam)) {
      return malformedRequestResponse(
        'Invalid transactionType query parameter.'
      );
    }

    const productId = url.searchParams.get('productId')?.trim() ?? '';
    const fromRaw = url.searchParams.get('from')?.trim() ?? '';
    const toRaw = url.searchParams.get('to')?.trim() ?? '';
    const fromMs = fromRaw ? parseTimestampBoundary(fromRaw, false) : null;
    const toMs = toRaw ? parseTimestampBoundary(toRaw, true) : null;
    if ((fromRaw && fromMs === null) || (toRaw && toMs === null)) {
      return malformedRequestResponse('Invalid from/to timestamp filter.');
    }

    const { start, limit } = parsePaginationParams(url);

    const filtered = mockTxns.filter((txn) => {
      if (txn.branch_id !== branchId) {
        return false;
      }
      if (txnTypeParam && txn.transaction_type !== txnTypeParam) {
        return false;
      }
      if (
        productId &&
        !txn.lines.some((line) => line.product_id === productId)
      ) {
        return false;
      }
      if (fromMs !== null || toMs !== null) {
        if (!txn.posted_at) {
          return false;
        }
        const postedMs = Date.parse(txn.posted_at);
        if (Number.isNaN(postedMs)) {
          return false;
        }
        if (fromMs !== null && postedMs < fromMs) {
          return false;
        }
        if (toMs !== null && postedMs > toMs) {
          return false;
        }
      }
      return true;
    });

    const items = filtered.slice(start, start + limit).map(cloneTxn);
    const nextOffset = start + limit;
    const nextCursor = nextOffset < filtered.length ? String(nextOffset) : null;

    return HttpResponse.json({ items, nextCursor }, { status: 200 });
  }),

  http.get('*/api/v1/inventory/transactions/:txnId', ({ params }) => {
    const txn = mockTxns.find((item) => item.inventory_txn_id === params.txnId);
    if (!txn) {
      return notFoundResponse('Inventory transaction was not found.');
    }
    return HttpResponse.json(cloneTxn(txn), { status: 200 });
  }),

  // =========================================================================
  // INVENTORY ADJUSTMENTS
  // =========================================================================
  http.post('*/api/v1/inventory/adjustments', async ({ request }) => {
    const bodyText = await request.text();
    const { key: idempKey, replayResponse } = checkIdempotency(
      request,
      bodyText
    );
    if (replayResponse) {
      return replayResponse;
    }

    const body: unknown = parseJsonBody(bodyText);
    if (!isRecord(body)) {
      return malformedRequestResponse(
        'Request body must be a valid JSON object.'
      );
    }

    const details: ValidationDetail[] = [];
    const rawTxnType = readTrimmedString(body.transaction_type);
    const branchId = readTrimmedString(body.branch_id);
    const reasonCode = readTrimmedString(body.reason_code);
    const note = validateNullableString(
      body.note,
      'note',
      500,
      'Note',
      details
    );

    if (!rawTxnType || !isAdjustmentsTxnType(rawTxnType)) {
      details.push({
        field: 'transaction_type',
        issue:
          'Transaction type must be OPENING_BALANCE, ADJUSTMENT_IN, ADJUSTMENT_OUT, or REVERSAL.',
      });
    }
    if (!branchId) {
      details.push({ field: 'branch_id', issue: 'Branch ID is required.' });
    }
    if (!reasonCode) {
      details.push({
        field: 'reason_code',
        issue: 'Reason code is required.',
      });
    } else if (reasonCode.length > 40) {
      details.push({
        field: 'reason_code',
        issue: 'Reason code must be at most 40 characters.',
      });
    }

    let reversesTxnId: string | null = null;
    let originalTxn: InventoryTxnDto | null = null;
    if (rawTxnType === 'REVERSAL') {
      const candidateReverseId = readTrimmedString(
        body.reverses_inventory_txn_id
      );
      if (!candidateReverseId) {
        details.push({
          field: 'reverses_inventory_txn_id',
          issue: 'Original transaction ID is required for a reversal.',
        });
      } else {
        reversesTxnId = candidateReverseId;
        const foundOriginal = mockTxns.find(
          (item) => item.inventory_txn_id === candidateReverseId
        );
        if (!foundOriginal) {
          details.push({
            field: 'reverses_inventory_txn_id',
            issue: 'Target transaction to reverse was not found.',
          });
        } else if (branchId && foundOriginal.branch_id !== branchId) {
          details.push({
            field: 'reverses_inventory_txn_id',
            issue: 'Target transaction belongs to a different branch.',
          });
        } else {
          originalTxn = foundOriginal;
        }
      }
    }

    if (details.length > 0 || !isAdjustmentsTxnType(rawTxnType)) {
      return validationErrorResponse('Invalid inventory adjustment.', details);
    }

    if (rawTxnType === 'REVERSAL' && originalTxn) {
      if (originalTxn.status !== 'POSTED') {
        return conflictResponse(
          'Only POSTED inventory transactions can be reversed.',
          [
            {
              field: 'reverses_inventory_txn_id',
              issue: 'Target transaction is not POSTED.',
            },
          ]
        );
      }

      const alreadyReversed = mockTxns.some(
        (item) =>
          item.status === 'POSTED' &&
          item.transaction_type === 'REVERSAL' &&
          item.reverses_inventory_txn_id === originalTxn.inventory_txn_id
      );
      if (alreadyReversed) {
        return conflictResponse('This transaction has already been reversed.', [
          {
            field: 'reverses_inventory_txn_id',
            issue: 'Target transaction was already reversed.',
          },
        ]);
      }
    }

    const built = buildTxnLinesFromRequest(
      body.lines,
      branchId,
      rawTxnType,
      originalTxn
    );
    if (built.validationDetails.length > 0 || !built.lines) {
      return validationErrorResponse(
        'Invalid inventory adjustment lines.',
        built.validationDetails
      );
    }

    const now = new Date().toISOString();
    const balanceResult = applyLinesToBalances(branchId, built.lines, now);
    if (balanceResult.errorResponse) {
      return balanceResult.errorResponse;
    }

    mockBalances = balanceResult.nextBalances;

    const created: InventoryTxnDto = {
      inventory_txn_id: createMockUuid(),
      branch_id: branchId,
      transaction_no: nextTransactionNo(),
      transaction_type: rawTxnType,
      status: 'POSTED',
      reason_code: reasonCode,
      note,
      posted_at: now,
      created_by_employee_id: YOUSSEF_EMPLOYEE_ID,
      reverses_inventory_txn_id: reversesTxnId,
      sales_order_id: null,
      sales_return_id: null,
      purchase_order_id: null,
      vendor_return_id: null,
      lines: balanceResult.postedLines,
    };

    mockTxns = [created, ...mockTxns];
    const responsePayload = cloneTxn(created);
    storeIdempotencySuccess(idempKey, bodyText, 201, responsePayload);
    return HttpResponse.json(responsePayload, { status: 201 });
  }),

  http.patch(
    '*/api/v1/inventory/adjustments/:txnId',
    async ({ params, request }) => {
      const bodyText = await request.text();
      const { key: idempKey, replayResponse } = checkIdempotency(
        request,
        bodyText
      );
      if (replayResponse) {
        return replayResponse;
      }

      const txnIndex = mockTxns.findIndex(
        (item) => item.inventory_txn_id === params.txnId
      );
      if (txnIndex === -1) {
        return notFoundResponse('Inventory adjustment was not found.');
      }

      const current = mockTxns[txnIndex];
      if (!current) {
        return notFoundResponse('Inventory adjustment was not found.');
      }

      if (current.status !== 'DRAFT') {
        return conflictResponse(
          'Only DRAFT adjustments can be modified. POSTED and CANCELLED transactions are immutable.'
        );
      }

      const body: unknown = parseJsonBody(bodyText);
      if (!isRecord(body)) {
        return malformedRequestResponse('Malformed adjustment patch payload.');
      }

      const details: ValidationDetail[] = [];

      let nextReasonCode = current.reason_code ?? '';
      if ('reason_code' in body) {
        const candidate = readTrimmedString(body.reason_code);
        if (!candidate) {
          details.push({
            field: 'reason_code',
            issue: 'Reason code is required.',
          });
        } else if (candidate.length > 40) {
          details.push({
            field: 'reason_code',
            issue: 'Reason code must be at most 40 characters.',
          });
        } else {
          nextReasonCode = candidate;
        }
      }

      const nextNote =
        'note' in body
          ? validateNullableString(body.note, 'note', 500, 'Note', details)
          : (current.note ?? null);

      let nextLines = current.lines;
      if ('lines' in body) {
        const txnTypeForDraft: AdjustmentsTxnType = isAdjustmentsTxnType(
          current.transaction_type
        )
          ? current.transaction_type
          : 'ADJUSTMENT_IN';
        const originalTxn =
          txnTypeForDraft === 'REVERSAL' && current.reverses_inventory_txn_id
            ? (mockTxns.find(
                (item) =>
                  item.inventory_txn_id === current.reverses_inventory_txn_id
              ) ?? null)
            : null;
        const built = buildTxnLinesFromRequest(
          body.lines,
          current.branch_id,
          txnTypeForDraft,
          originalTxn
        );
        if (built.validationDetails.length > 0 || !built.lines) {
          details.push(...built.validationDetails);
        } else {
          nextLines = built.lines;
        }
      }

      if (details.length > 0) {
        return validationErrorResponse(
          'Invalid draft adjustment update.',
          details
        );
      }

      const updated: InventoryTxnDto = {
        ...current,
        reason_code: nextReasonCode,
        note: nextNote,
        lines: nextLines,
      };

      mockTxns = mockTxns.map((item, idx) =>
        idx === txnIndex ? updated : item
      );

      const responsePayload = cloneTxn(updated);
      storeIdempotencySuccess(idempKey, bodyText, 200, responsePayload);
      return HttpResponse.json(responsePayload, { status: 200 });
    }
  ),

  http.post(
    '*/api/v1/inventory/adjustments/:txnId',
    async ({ params, request }) => {
      const bodyText = await request.text();
      const { key: idempKey, replayResponse } = checkIdempotency(
        request,
        bodyText
      );
      if (replayResponse) {
        return replayResponse;
      }

      const txnIndex = mockTxns.findIndex(
        (item) => item.inventory_txn_id === params.txnId
      );
      if (txnIndex === -1) {
        return notFoundResponse('Inventory adjustment was not found.');
      }

      const current = mockTxns[txnIndex];
      if (!current) {
        return notFoundResponse('Inventory adjustment was not found.');
      }

      if (current.status !== 'DRAFT') {
        return conflictResponse(
          'Only DRAFT adjustments can be posted. POSTED and CANCELLED transactions are immutable.'
        );
      }

      const now = new Date().toISOString();
      const balanceResult = applyLinesToBalances(
        current.branch_id,
        current.lines,
        now
      );
      if (balanceResult.errorResponse) {
        return balanceResult.errorResponse;
      }

      mockBalances = balanceResult.nextBalances;

      const posted: InventoryTxnDto = {
        ...current,
        status: 'POSTED',
        posted_at: now,
        lines: balanceResult.postedLines,
      };

      mockTxns = mockTxns.map((item, idx) =>
        idx === txnIndex ? posted : item
      );

      const responsePayload = cloneTxn(posted);
      storeIdempotencySuccess(idempKey, bodyText, 201, responsePayload);
      return HttpResponse.json(responsePayload, { status: 201 });
    }
  ),

  http.post(
    '*/api/v1/inventory/adjustments/:txnId/cancel',
    async ({ params, request }) => {
      const bodyText = await request.text();
      const { key: idempKey, replayResponse } = checkIdempotency(
        request,
        bodyText
      );
      if (replayResponse) {
        return replayResponse;
      }

      const txnIndex = mockTxns.findIndex(
        (item) => item.inventory_txn_id === params.txnId
      );
      if (txnIndex === -1) {
        return notFoundResponse('Inventory adjustment was not found.');
      }

      const current = mockTxns[txnIndex];
      if (!current) {
        return notFoundResponse('Inventory adjustment was not found.');
      }

      if (current.status !== 'DRAFT') {
        return conflictResponse(
          'Only DRAFT adjustments can be cancelled. POSTED transactions are immutable.'
        );
      }

      const cancelled: InventoryTxnDto = {
        ...current,
        status: 'CANCELLED',
      };

      mockTxns = mockTxns.map((item, idx) =>
        idx === txnIndex ? cancelled : item
      );

      storeIdempotencySuccess(idempKey, bodyText, 204, null);
      return new HttpResponse(null, { status: 204 });
    }
  ),
];
