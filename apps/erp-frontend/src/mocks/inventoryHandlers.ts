import { http, HttpResponse } from 'msw';
import inventoryBalanceFixture from '@contracts/fixtures/inventory-balance.json';
import {
  isAdjustmentsTxnType,
  isBatchQualityStatus,
  isInventoryTransactionType,
  isLocationType,
  normalizeStockBalance,
} from '../lib/api/catalogInventoryNormalizers';
import { IDEMPOTENCY_KEY_MAX_LENGTH } from '../lib/api/idempotency';
import { isPlainRecord } from '../lib/api/normalizers';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../lib/api/pagination';
import type {
  ErrorCode,
  InventoryBatch,
  InventoryLocation,
  InventorySummary,
  InventoryTxn,
  InventoryTxnLine,
  NormalizedApiErrorDetail,
  NormalizedApiErrorEnvelope,
  PagedResult,
  Product,
  ProductUom,
  StockBalance,
} from '../types/api';
import { MOCK_BRANCH_IDS } from './branchHandlers';
import { INITIAL_EMPLOYEES } from './employeeHandlers';
import {
  INITIAL_PRODUCTS,
  MOCK_PRODUCT_IDS,
  MOCK_PRODUCT_UOM_IDS,
  ORGANIZATION_ID,
} from './productHandlers';

export {
  MOCK_BRANCH_IDS,
  MOCK_PRODUCT_IDS,
  MOCK_PRODUCT_UOM_IDS,
  ORGANIZATION_ID,
};

export const MOCK_EMPLOYEE_IDS = {
  EMP_001:
    INITIAL_EMPLOYEES[0]?.employee_id ?? '11111111-3333-4111-8111-000000000001',
  EMP_002:
    INITIAL_EMPLOYEES[1]?.employee_id ?? '11111111-3333-4111-8111-000000000002',
} as const;

export const MOCK_LOCATION_IDS = {
  MAIN_SELLABLE: '694cb9a9-c19d-3c46-be41-a7fc76fcdc9f',
  QUAR_01: '11111111-9999-4111-8111-000000000002',
  DMG_01: '11111111-9999-4111-8111-000000000003',
  SCRAP_01: '11111111-9999-4111-8111-000000000004',
  OLD_BIN: '11111111-9999-4111-8111-000000000005',
  ALX_SELL_01: '11111111-9999-4111-8111-000000000006',
} as const;

export const MOCK_BATCH_IDS = {
  MEDCARE_LOT_2601: '7a8b9c0d-1e2f-5a3b-8c4d-5e6f7a8b9c0d',
  MEDCARE_LOT_2602: '11111111-aaaa-4111-8111-000000000002',
  MEDCARE_LOT_EXP: '11111111-aaaa-4111-8111-000000000003',
  MEDCARE_PAN_01: '11111111-aaaa-4111-8111-000000000004',
  VITAMIN_D3_NON_LOT: '11111111-aaaa-4111-8111-000000000005',
} as const;

export const MOCK_TRANSACTION_IDS = {
  DOWNTOWN_OPENING_BALANCE: '11111111-bbbb-4111-8111-000000000001',
  DOWNTOWN_ADJUSTMENT_IN: '11111111-bbbb-4111-8111-000000000002',
  ALEXANDRIA_OPENING_BALANCE: '11111111-bbbb-4111-8111-000000000003',
} as const;

const NON_LOT_BATCH_NUMBER = 'NON-LOT';

export const INITIAL_LOCATIONS: readonly InventoryLocation[] = [
  {
    location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
    organization_id: ORGANIZATION_ID,
    branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
    location_code: 'MAIN-SELLABLE',
    name: 'Downtown Main Dispensary Shelf',
    location_type: 'SELLABLE',
    is_sellable: true,
    is_active: true,
    updated_at: '2026-11-25T10:00:00+00:00',
  },
  {
    location_id: MOCK_LOCATION_IDS.QUAR_01,
    organization_id: ORGANIZATION_ID,
    branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
    location_code: 'QUAR-01',
    name: 'Downtown Quarantine Cage',
    location_type: 'QUARANTINE',
    is_sellable: false,
    is_active: true,
    updated_at: '2026-11-25T10:00:00+00:00',
  },
  {
    location_id: MOCK_LOCATION_IDS.DMG_01,
    organization_id: ORGANIZATION_ID,
    branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
    location_code: 'DMG-01',
    name: 'Downtown Damaged Stock Bay',
    location_type: 'DAMAGED',
    is_sellable: false,
    is_active: true,
    updated_at: '2026-11-25T10:00:00+00:00',
  },
  {
    location_id: MOCK_LOCATION_IDS.SCRAP_01,
    organization_id: ORGANIZATION_ID,
    branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
    location_code: 'SCRAP-01',
    name: 'Downtown Disposal & Scrap Bin',
    location_type: 'SCRAP',
    is_sellable: false,
    is_active: true,
    updated_at: '2026-11-25T10:00:00+00:00',
  },
  {
    location_id: MOCK_LOCATION_IDS.OLD_BIN,
    organization_id: ORGANIZATION_ID,
    branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
    location_code: 'OLD-BIN',
    name: 'Downtown Legacy Overflow Bin',
    location_type: 'SELLABLE',
    is_sellable: false,
    is_active: false,
    updated_at: '2026-11-20T09:00:00+00:00',
  },
  {
    location_id: MOCK_LOCATION_IDS.ALX_SELL_01,
    organization_id: ORGANIZATION_ID,
    branch_id: MOCK_BRANCH_IDS.ALEXANDRIA,
    location_code: 'ALX-SELL-01',
    name: 'Alexandria Main Dispensary Shelf',
    location_type: 'SELLABLE',
    is_sellable: true,
    is_active: true,
    updated_at: '2026-11-25T10:00:00+00:00',
  },
];

export const INITIAL_BATCHES: readonly InventoryBatch[] = [
  {
    batch_id: MOCK_BATCH_IDS.MEDCARE_LOT_2601,
    organization_id: ORGANIZATION_ID,
    product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
    batch_number: 'MEDCARE-LOT-2601',
    manufactured_on: '2026-01-10',
    expires_on: '2027-07-31',
    quality_status: 'AVAILABLE',
    updated_at: '2026-11-25T10:15:00+00:00',
  },
  {
    batch_id: MOCK_BATCH_IDS.MEDCARE_LOT_2602,
    organization_id: ORGANIZATION_ID,
    product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
    batch_number: 'MEDCARE-LOT-2602',
    manufactured_on: '2025-12-15',
    expires_on: '2026-12-15',
    quality_status: 'AVAILABLE',
    updated_at: '2026-11-25T10:20:00+00:00',
  },
  {
    batch_id: MOCK_BATCH_IDS.MEDCARE_LOT_EXP,
    organization_id: ORGANIZATION_ID,
    product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
    batch_number: 'MEDCARE-LOT-EXP',
    manufactured_on: '2023-06-01',
    expires_on: '2025-06-01',
    quality_status: 'EXPIRED',
    updated_at: '2026-11-24T14:00:00+00:00',
  },
  {
    batch_id: MOCK_BATCH_IDS.MEDCARE_PAN_01,
    organization_id: ORGANIZATION_ID,
    product_id: MOCK_PRODUCT_IDS.PANADOL_EXTRA,
    batch_number: 'MEDCARE-PAN-01',
    manufactured_on: '2026-03-01',
    expires_on: '2027-03-31',
    quality_status: 'AVAILABLE',
    updated_at: '2026-11-25T10:30:00+00:00',
  },
  {
    batch_id: MOCK_BATCH_IDS.VITAMIN_D3_NON_LOT,
    organization_id: ORGANIZATION_ID,
    product_id: MOCK_PRODUCT_IDS.VITAMIN_D3,
    batch_number: NON_LOT_BATCH_NUMBER,
    manufactured_on: null,
    expires_on: null,
    quality_status: 'AVAILABLE',
    updated_at: '2026-11-25T10:45:00+00:00',
  },
];

const VERBATIM_AUGMENTIN_BALANCE: StockBalance = normalizeStockBalance(
  inventoryBalanceFixture,
  '@contracts/fixtures/inventory-balance.json'
);

export const INITIAL_BALANCES: readonly StockBalance[] = [
  VERBATIM_AUGMENTIN_BALANCE,
  {
    organization_id: ORGANIZATION_ID,
    branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
    product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
    product_sku: 'MED-AUG-1000',
    product_name: 'Augmentin 1g Film-Coated Tablets',
    base_uom_code: 'TAB',
    location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
    location_code: 'MAIN-SELLABLE',
    location_type: 'SELLABLE',
    is_location_sellable: true,
    batch_id: MOCK_BATCH_IDS.MEDCARE_LOT_2602,
    batch_number: 'MEDCARE-LOT-2602',
    manufactured_on: '2025-12-15',
    expires_on: '2026-12-15',
    quality_status: 'AVAILABLE',
    on_hand_qty_base: 70,
    available_qty_base: 70,
    average_unit_cost: 7.0,
    updated_at: '2026-11-25T10:20:00+00:00',
    row_version: 2,
  },
  {
    organization_id: ORGANIZATION_ID,
    branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
    product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
    product_sku: 'MED-AUG-1000',
    product_name: 'Augmentin 1g Film-Coated Tablets',
    base_uom_code: 'TAB',
    location_id: MOCK_LOCATION_IDS.DMG_01,
    location_code: 'DMG-01',
    location_type: 'DAMAGED',
    is_location_sellable: false,
    batch_id: MOCK_BATCH_IDS.MEDCARE_LOT_EXP,
    batch_number: 'MEDCARE-LOT-EXP',
    manufactured_on: '2023-06-01',
    expires_on: '2025-06-01',
    quality_status: 'EXPIRED',
    on_hand_qty_base: 50,
    available_qty_base: 0,
    average_unit_cost: 6.92,
    updated_at: '2026-11-24T14:00:00+00:00',
    row_version: 1,
  },
  {
    organization_id: ORGANIZATION_ID,
    branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
    product_id: MOCK_PRODUCT_IDS.PANADOL_EXTRA,
    product_sku: 'MED-PAN-500',
    product_name: 'Panadol Extra 500mg',
    base_uom_code: 'TAB',
    location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
    location_code: 'MAIN-SELLABLE',
    location_type: 'SELLABLE',
    is_location_sellable: true,
    batch_id: MOCK_BATCH_IDS.MEDCARE_PAN_01,
    batch_number: 'MEDCARE-PAN-01',
    manufactured_on: '2026-03-01',
    expires_on: '2027-03-31',
    quality_status: 'AVAILABLE',
    on_hand_qty_base: 480,
    available_qty_base: 480,
    average_unit_cost: 1.5,
    updated_at: '2026-11-25T10:30:00+00:00',
    row_version: 2,
  },
  {
    organization_id: ORGANIZATION_ID,
    branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
    product_id: MOCK_PRODUCT_IDS.VITAMIN_D3,
    product_sku: 'MED-VIT-D3',
    product_name: 'Vitamin D3 5000 IU',
    base_uom_code: 'BOTTLE',
    location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
    location_code: 'MAIN-SELLABLE',
    location_type: 'SELLABLE',
    is_location_sellable: true,
    batch_id: MOCK_BATCH_IDS.VITAMIN_D3_NON_LOT,
    batch_number: NON_LOT_BATCH_NUMBER,
    manufactured_on: null,
    expires_on: null,
    quality_status: 'AVAILABLE',
    on_hand_qty_base: 60,
    available_qty_base: 60,
    average_unit_cost: 65.0,
    updated_at: '2026-11-25T10:45:00+00:00',
    row_version: 1,
  },
  {
    organization_id: ORGANIZATION_ID,
    branch_id: MOCK_BRANCH_IDS.ALEXANDRIA,
    product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
    product_sku: 'MED-AUG-1000',
    product_name: 'Augmentin 1g Film-Coated Tablets',
    base_uom_code: 'TAB',
    location_id: MOCK_LOCATION_IDS.ALX_SELL_01,
    location_code: 'ALX-SELL-01',
    location_type: 'SELLABLE',
    is_location_sellable: true,
    batch_id: MOCK_BATCH_IDS.MEDCARE_LOT_2601,
    batch_number: 'MEDCARE-LOT-2601',
    manufactured_on: '2026-01-10',
    expires_on: '2027-07-31',
    quality_status: 'AVAILABLE',
    on_hand_qty_base: 140,
    available_qty_base: 140,
    average_unit_cost: 7.2,
    updated_at: '2026-11-25T11:00:00+00:00',
    row_version: 1,
  },
];

export const INITIAL_TRANSACTIONS: readonly InventoryTxn[] = [
  {
    inventory_txn_id: MOCK_TRANSACTION_IDS.DOWNTOWN_ADJUSTMENT_IN,
    organization_id: ORGANIZATION_ID,
    branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
    transaction_no: 'TXN-2026-000002',
    transaction_type: 'ADJUSTMENT_IN',
    status: 'POSTED',
    reason_code: 'CYCLE_COUNT_SURPLUS',
    note: 'Cycle count surplus verified on Downtown main shelf.',
    idempotency_key: 'seed-medcare-dt-adj-in-002',
    created_by_employee_id: MOCK_EMPLOYEE_IDS.EMP_002,
    reverses_inventory_txn_id: null,
    posted_at: '2026-11-25T10:30:00+00:00',
    lines: [
      {
        inventory_txn_line_id: '11111111-cccc-4111-8111-000000000201',
        product_id: MOCK_PRODUCT_IDS.PANADOL_EXTRA,
        location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
        batch_id: MOCK_BATCH_IDS.MEDCARE_PAN_01,
        batch_number: 'MEDCARE-PAN-01',
        product_uom_id: MOCK_PRODUCT_UOM_IDS.PANADOL_TAB,
        entered_qty: 48,
        conversion_snapshot: 1,
        quantity_delta_base: 48,
        unit_cost_base: 1.5,
      },
      {
        inventory_txn_line_id: '11111111-cccc-4111-8111-000000000202',
        product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
        location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
        batch_id: MOCK_BATCH_IDS.MEDCARE_LOT_2602,
        batch_number: 'MEDCARE-LOT-2602',
        product_uom_id: MOCK_PRODUCT_UOM_IDS.AUGMENTIN_TAB,
        entered_qty: 70,
        conversion_snapshot: 1,
        quantity_delta_base: 70,
        unit_cost_base: 7.0,
      },
    ],
  },
  {
    inventory_txn_id: MOCK_TRANSACTION_IDS.DOWNTOWN_OPENING_BALANCE,
    organization_id: ORGANIZATION_ID,
    branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
    transaction_no: 'TXN-2026-000001',
    transaction_type: 'OPENING_BALANCE',
    status: 'POSTED',
    reason_code: 'INITIAL_STOCK_LOAD',
    note: 'Opening stock balance posted locally at Downtown Cairo launch.',
    idempotency_key: 'seed-medcare-dt-opening-001',
    created_by_employee_id: MOCK_EMPLOYEE_IDS.EMP_001,
    reverses_inventory_txn_id: null,
    posted_at: '2026-11-20T08:00:00+00:00',
    lines: [
      {
        inventory_txn_line_id: '11111111-cccc-4111-8111-000000000101',
        product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
        location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
        batch_id: MOCK_BATCH_IDS.MEDCARE_LOT_2601,
        batch_number: 'MEDCARE-LOT-2601',
        product_uom_id: MOCK_PRODUCT_UOM_IDS.AUGMENTIN_TAB,
        entered_qty: 280,
        conversion_snapshot: 1,
        quantity_delta_base: 280,
        unit_cost_base: 7.2,
      },
      {
        inventory_txn_line_id: '11111111-cccc-4111-8111-000000000102',
        product_id: MOCK_PRODUCT_IDS.VITAMIN_D3,
        location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
        batch_id: MOCK_BATCH_IDS.VITAMIN_D3_NON_LOT,
        batch_number: NON_LOT_BATCH_NUMBER,
        product_uom_id: MOCK_PRODUCT_UOM_IDS.VITAMIN_D3_BOTTLE,
        entered_qty: 60,
        conversion_snapshot: 1,
        quantity_delta_base: 60,
        unit_cost_base: 65.0,
      },
    ],
  },
  {
    inventory_txn_id: MOCK_TRANSACTION_IDS.ALEXANDRIA_OPENING_BALANCE,
    organization_id: ORGANIZATION_ID,
    branch_id: MOCK_BRANCH_IDS.ALEXANDRIA,
    transaction_no: 'TXN-2026-000003',
    transaction_type: 'OPENING_BALANCE',
    status: 'POSTED',
    reason_code: 'INITIAL_STOCK_LOAD',
    note: 'Opening stock balance posted locally at Alexandria Corniche launch.',
    idempotency_key: 'seed-medcare-alx-opening-003',
    created_by_employee_id: MOCK_EMPLOYEE_IDS.EMP_002,
    reverses_inventory_txn_id: null,
    posted_at: '2026-11-21T09:00:00+00:00',
    lines: [
      {
        inventory_txn_line_id: '11111111-cccc-4111-8111-000000000301',
        product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
        location_id: MOCK_LOCATION_IDS.ALX_SELL_01,
        batch_id: MOCK_BATCH_IDS.MEDCARE_LOT_2601,
        batch_number: 'MEDCARE-LOT-2601',
        product_uom_id: MOCK_PRODUCT_UOM_IDS.AUGMENTIN_TAB,
        entered_qty: 140,
        conversion_snapshot: 1,
        quantity_delta_base: 140,
        unit_cost_base: 7.2,
      },
    ],
  },
];

interface IdempotencyEntry {
  payloadSignature: string;
  status: number;
  kind: 'location' | 'txn';
  locationBody?: InventoryLocation;
  txnBody?: InventoryTxn;
  locationHeader?: string;
}

function cloneLocation(location: InventoryLocation): InventoryLocation {
  return { ...location };
}

function cloneBatch(batch: InventoryBatch): InventoryBatch {
  return { ...batch };
}

function cloneBalance(balance: StockBalance): StockBalance {
  return { ...balance };
}

function cloneTxnLine(line: InventoryTxnLine): InventoryTxnLine {
  return { ...line };
}

function cloneTxn(txn: InventoryTxn): InventoryTxn {
  return {
    ...txn,
    lines: txn.lines.map(cloneTxnLine),
  };
}

let mockLocations: InventoryLocation[] = INITIAL_LOCATIONS.map(cloneLocation);
let mockBatches: InventoryBatch[] = INITIAL_BATCHES.map(cloneBatch);
let mockBalances: StockBalance[] = INITIAL_BALANCES.map(cloneBalance);
let mockTransactions: InventoryTxn[] = INITIAL_TRANSACTIONS.map(cloneTxn);
let idempotencyStore = new Map<string, IdempotencyEntry>();
let idCounter = 100;
let txnCounter = 3;

export function resetMockInventory(): void {
  mockLocations = INITIAL_LOCATIONS.map(cloneLocation);
  mockBatches = INITIAL_BATCHES.map(cloneBatch);
  mockBalances = INITIAL_BALANCES.map(cloneBalance);
  mockTransactions = INITIAL_TRANSACTIONS.map(cloneTxn);
  idempotencyStore = new Map<string, IdempotencyEntry>();
  idCounter = 100;
  txnCounter = 3;
}

function createMockUuid(segment: string): string {
  idCounter += 1;
  return `11111111-${segment}-4111-8111-${String(idCounter).padStart(12, '0')}`;
}

function nextTransactionNo(): string {
  txnCounter += 1;
  return `TXN-2026-${String(txnCounter).padStart(6, '0')}`;
}

function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function round4(value: number): number {
  if (value === 0 || !Number.isFinite(value)) {
    return 0;
  }
  const sign = value < 0 ? -1 : 1;
  const rounded =
    sign * (Math.round((Math.abs(value) + Number.EPSILON) * 10_000) / 10_000);
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [yearStr, monthStr, dayStr] = value.split('-');
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

function compareFefoBatches(
  left: { expires_on: string | null; batch_number: string },
  right: { expires_on: string | null; batch_number: string }
): number {
  if (left.expires_on !== right.expires_on) {
    if (left.expires_on === null) {
      return 1;
    }
    if (right.expires_on === null) {
      return -1;
    }
    return left.expires_on.localeCompare(right.expires_on);
  }
  return left.batch_number.localeCompare(right.batch_number);
}

function isBatchEligibleForSale(
  batch: Pick<InventoryBatch, 'quality_status' | 'expires_on'> | undefined,
  businessDate: string
): boolean {
  if (!batch || batch.quality_status !== 'AVAILABLE') {
    return false;
  }
  if (batch.expires_on !== null && batch.expires_on <= businessDate) {
    return false;
  }
  return true;
}

function isLocationEligibleForSale(
  location:
    | Pick<InventoryLocation, 'location_type' | 'is_sellable' | 'is_active'>
    | undefined
): boolean {
  return Boolean(
    location &&
    location.location_type === 'SELLABLE' &&
    location.is_sellable &&
    location.is_active
  );
}

function deriveAvailableQtyBase(
  onHandQtyBase: number,
  location: InventoryLocation | undefined,
  batch: InventoryBatch | undefined,
  businessDate: string
): number {
  if (onHandQtyBase <= 0) {
    return 0;
  }
  if (
    isLocationEligibleForSale(location) &&
    isBatchEligibleForSale(batch, businessDate)
  ) {
    return round4(onHandQtyBase);
  }
  return 0;
}

function createMockErrorEnvelope(
  code: ErrorCode,
  message: string,
  traceId: string,
  details: NormalizedApiErrorDetail[] = []
): NormalizedApiErrorEnvelope {
  return {
    error: {
      code,
      message,
      details,
      trace_id: traceId,
    },
  };
}

function malformedRequestResponse(
  message: string,
  details: NormalizedApiErrorDetail[] = []
) {
  return HttpResponse.json(
    createMockErrorEnvelope(
      'MALFORMED_REQUEST',
      message,
      'mock-trace-inventory-malformed',
      details
    ),
    { status: 400 }
  );
}

function notFoundResponse(message: string) {
  return HttpResponse.json(
    createMockErrorEnvelope(
      'NOT_FOUND',
      message,
      'mock-trace-inventory-not-found'
    ),
    { status: 404 }
  );
}

function validationErrorResponse(
  message: string,
  details: NormalizedApiErrorDetail[]
) {
  return HttpResponse.json(
    createMockErrorEnvelope(
      'VALIDATION_ERROR',
      message,
      'mock-trace-inventory-validation',
      details
    ),
    { status: 422 }
  );
}

function expiryPolicyViolationResponse(
  message: string,
  details: NormalizedApiErrorDetail[]
) {
  return HttpResponse.json(
    createMockErrorEnvelope(
      'EXPIRY_POLICY_VIOLATION',
      message,
      'mock-trace-inventory-expiry-policy',
      details
    ),
    { status: 422 }
  );
}

function conflictResponse(
  message: string,
  details: NormalizedApiErrorDetail[] = []
) {
  return HttpResponse.json(
    createMockErrorEnvelope(
      'CONFLICT',
      message,
      'mock-trace-inventory-conflict',
      details
    ),
    { status: 409 }
  );
}

function invalidStateTransitionResponse(
  message: string,
  details: NormalizedApiErrorDetail[] = []
) {
  return HttpResponse.json(
    createMockErrorEnvelope(
      'INVALID_STATE_TRANSITION',
      message,
      'mock-trace-inventory-invalid-state',
      details
    ),
    { status: 409 }
  );
}

function outOfStockResponse(
  message: string,
  details: NormalizedApiErrorDetail[]
) {
  return HttpResponse.json(
    createMockErrorEnvelope(
      'OUT_OF_STOCK',
      message,
      'mock-trace-inventory-out-of-stock',
      details
    ),
    { status: 409 }
  );
}

function idempotencyMismatchResponse() {
  return HttpResponse.json(
    createMockErrorEnvelope(
      'IDEMPOTENCY_MISMATCH',
      'Idempotency-Key was already used with a different request payload.',
      'mock-trace-inventory-idempotency-mismatch'
    ),
    { status: 409 }
  );
}

function parsePositiveIntegerParam(raw: string | null, fallback: number) {
  if (raw === null) {
    return { valid: true as const, value: fallback };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { valid: false as const, value: fallback };
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return { valid: false as const, value: fallback };
  }
  return { valid: true as const, value: parsed };
}

function validatePaginationParams(
  url: URL,
  details: NormalizedApiErrorDetail[]
): { page: number; pageSize: number } {
  const pageResult = parsePositiveIntegerParam(
    url.searchParams.get('page'),
    DEFAULT_PAGE
  );
  const pageSizeResult = parsePositiveIntegerParam(
    url.searchParams.get('page_size'),
    DEFAULT_PAGE_SIZE
  );

  if (!pageResult.valid || pageResult.value < 1) {
    details.push({
      field: 'page',
      issue: 'Page must be an integer greater than or equal to 1.',
    });
  }
  if (
    !pageSizeResult.valid ||
    pageSizeResult.value < 1 ||
    pageSizeResult.value > MAX_PAGE_SIZE
  ) {
    details.push({
      field: 'page_size',
      issue: `Page size must be an integer between 1 and ${MAX_PAGE_SIZE}.`,
    });
  }

  return {
    page: pageResult.value,
    pageSize: pageSizeResult.value,
  };
}

function buildPagedPayload<TItem>(
  filtered: readonly TItem[],
  page: number,
  pageSize: number,
  cloneItem: (item: TItem) => TItem
): PagedResult<TItem> {
  const totalCount = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map(cloneItem);
  const nextCursor = page * pageSize < totalCount ? String(page + 1) : null;

  return {
    items,
    page,
    page_size: pageSize,
    total_count: totalCount,
    next_cursor: nextCursor,
  };
}

function computePayloadSignature(body: Record<string, unknown>): string {
  const entries = Object.entries(body)
    .filter(([key]) => key !== 'idempotency_key')
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(Object.fromEntries(entries));
}

function resolveIdempotency(
  request: Request,
  body: Record<string, unknown>
):
  | {
      ok: true;
      effectiveKey: string;
      compositeKey: string;
      payloadSignature: string;
      replayResponse: Response | null;
    }
  | {
      ok: false;
      errorResponse: Response;
    } {
  const headerKey = request.headers.get('Idempotency-Key')?.trim() ?? '';

  if (!headerKey) {
    return {
      ok: false,
      errorResponse: malformedRequestResponse(
        'The idempotency key is required.',
        [
          {
            field: 'Idempotency-Key',
            issue: 'The idempotency key is required.',
          },
        ]
      ),
    };
  }

  const effectiveKey = headerKey;

  if (effectiveKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return {
      ok: false,
      errorResponse: validationErrorResponse('Invalid idempotency key.', [
        {
          field: 'idempotency_key',
          issue: `IdempotencyKey cannot exceed ${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`,
        },
      ]),
    };
  }

  const url = new URL(request.url);
  const compositeKey = `${request.method.toUpperCase()}:${url.pathname}:${effectiveKey}`;
  const payloadSignature = computePayloadSignature(body);
  const existing = idempotencyStore.get(compositeKey);

  if (!existing) {
    return {
      ok: true,
      effectiveKey,
      compositeKey,
      payloadSignature,
      replayResponse: null,
    };
  }

  if (existing.payloadSignature !== payloadSignature) {
    return {
      ok: false,
      errorResponse: idempotencyMismatchResponse(),
    };
  }

  const headers = existing.locationHeader
    ? { Location: existing.locationHeader }
    : undefined;

  if (existing.kind === 'location' && existing.locationBody) {
    return {
      ok: true,
      effectiveKey,
      compositeKey,
      payloadSignature,
      replayResponse: HttpResponse.json(cloneLocation(existing.locationBody), {
        status: existing.status,
        headers,
      }),
    };
  }

  if (existing.kind === 'txn' && existing.txnBody) {
    return {
      ok: true,
      effectiveKey,
      compositeKey,
      payloadSignature,
      replayResponse: HttpResponse.json(cloneTxn(existing.txnBody), {
        status: existing.status,
        headers,
      }),
    };
  }

  return {
    ok: true,
    effectiveKey,
    compositeKey,
    payloadSignature,
    replayResponse: null,
  };
}

function validateNullableOptionalString(
  rawValue: unknown,
  field: string,
  maxLength: number,
  label: string,
  details: NormalizedApiErrorDetail[]
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
      issue: `${label} cannot exceed ${maxLength} characters.`,
    });
    return null;
  }
  return trimmed;
}

function parseTimestampBoundary(
  raw: string,
  isEndBound: boolean
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    if (!isValidIsoDate(trimmed)) {
      return null;
    }
    const iso = isEndBound
      ? `${trimmed}T23:59:59.999Z`
      : `${trimmed}T00:00:00.000Z`;
    return Date.parse(iso);
  }
  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? null : ms;
}

function balanceMapKey(
  branchId: string,
  locationId: string,
  batchId: string
): string {
  return `${branchId}:${locationId}:${batchId}`;
}

function recomputeBalanceAvailabilityForLocation(
  location: InventoryLocation
): void {
  const businessDate = todayUtcDateString();
  mockBalances = mockBalances.map((balance) => {
    if (balance.location_id !== location.location_id) {
      return balance;
    }
    const batch = mockBatches.find(
      (item) => item.batch_id === balance.batch_id
    );
    return {
      ...balance,
      location_code: location.location_code,
      location_type: location.location_type,
      is_location_sellable: location.is_sellable,
      available_qty_base: deriveAvailableQtyBase(
        balance.on_hand_qty_base,
        location,
        batch,
        businessDate
      ),
    };
  });
}

function findCatalogProduct(productId: string): Product | undefined {
  return INITIAL_PRODUCTS.find((item) => item.product_id === productId);
}

function findActiveProductUoms(
  product: Product,
  productUomId: string
): { enteredUom: ProductUom | undefined; baseUom: ProductUom | undefined } {
  const enteredUom = product.uoms.find(
    (uom) => uom.product_uom_id === productUomId && uom.is_active
  );
  const baseUom = product.uoms.find((uom) => uom.is_base && uom.is_active);
  return { enteredUom, baseUom };
}

interface ValidatedStandardLine {
  lineIndex: number;
  product: Product;
  location: InventoryLocation;
  enteredUom: ProductUom;
  baseUom: ProductUom;
  batchNumberInput: string | null;
  manufacturedOn: string | null;
  expiresOn: string | null;
  enteredQty: number;
  unitCostEntered: number | null;
}

export const inventoryHandlers = [
  // =========================================================================
  // INVENTORY LOCATIONS
  // =========================================================================
  http.get('*/api/v1/inventory/locations', ({ request }) => {
    const url = new URL(request.url);
    const details: NormalizedApiErrorDetail[] = [];

    const branchId = url.searchParams.get('branch_id')?.trim() ?? '';
    if (!branchId) {
      details.push({ field: 'branch_id', issue: 'BranchId is required.' });
    }

    const rawIsSellable = url.searchParams.get('is_sellable');
    let isSellableFilter: boolean | undefined;
    if (rawIsSellable !== null && rawIsSellable.trim() !== '') {
      const normalized = rawIsSellable.trim().toLowerCase();
      if (normalized === 'true') {
        isSellableFilter = true;
      } else if (normalized === 'false') {
        isSellableFilter = false;
      } else {
        details.push({
          field: 'is_sellable',
          issue: 'is_sellable must be true or false.',
        });
      }
    }

    const rawIncludeInactive = url.searchParams.get('include_inactive');
    let includeInactive = false;
    if (rawIncludeInactive !== null && rawIncludeInactive.trim() !== '') {
      const normalized = rawIncludeInactive.trim().toLowerCase();
      if (normalized === 'true') {
        includeInactive = true;
      } else if (normalized === 'false') {
        includeInactive = false;
      } else {
        details.push({
          field: 'include_inactive',
          issue: 'include_inactive must be true or false.',
        });
      }
    }

    const { page, pageSize } = validatePaginationParams(url, details);

    if (details.length > 0) {
      return validationErrorResponse(
        'Invalid location query parameters.',
        details
      );
    }

    const filtered = mockLocations.filter((location) => {
      if (location.branch_id !== branchId) {
        return false;
      }
      if (!includeInactive && !location.is_active) {
        return false;
      }
      if (
        isSellableFilter !== undefined &&
        location.is_sellable !== isSellableFilter
      ) {
        return false;
      }
      return true;
    });

    return HttpResponse.json(
      buildPagedPayload(filtered, page, pageSize, cloneLocation),
      { status: 200 }
    );
  }),

  http.post('*/api/v1/inventory/locations', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);
    if (!isPlainRecord(body)) {
      return malformedRequestResponse(
        'Request body must be a valid JSON object.'
      );
    }

    const idempotency = resolveIdempotency(request, body);
    if (!idempotency.ok) {
      return idempotency.errorResponse;
    }
    if (idempotency.replayResponse) {
      return idempotency.replayResponse;
    }

    const details: NormalizedApiErrorDetail[] = [];
    const branchId = readTrimmedString(body.branch_id);
    const locationCode = readTrimmedString(body.location_code);
    const name = readTrimmedString(body.name);
    const rawLocationType = body.location_type;

    if (!branchId) {
      details.push({ field: 'branch_id', issue: 'BranchId is required.' });
    }
    if (!locationCode) {
      details.push({
        field: 'location_code',
        issue: 'LocationCode is required.',
      });
    } else if (locationCode.length > 30) {
      details.push({
        field: 'location_code',
        issue: 'LocationCode cannot exceed 30 characters.',
      });
    }
    if (!name) {
      details.push({ field: 'name', issue: 'Name is required.' });
    } else if (name.length > 100) {
      details.push({
        field: 'name',
        issue: 'Name cannot exceed 100 characters.',
      });
    }

    const validLocationType = isLocationType(rawLocationType)
      ? rawLocationType
      : null;
    if (!validLocationType) {
      details.push({
        field: 'location_type',
        issue: 'LocationType must be SELLABLE, QUARANTINE, DAMAGED, or SCRAP.',
      });
    }

    let isSellable = validLocationType === 'SELLABLE';
    if (body.is_sellable !== undefined) {
      if (typeof body.is_sellable !== 'boolean') {
        details.push({
          field: 'is_sellable',
          issue: 'is_sellable must be a boolean.',
        });
      } else {
        isSellable = body.is_sellable;
      }
    }

    if (validLocationType && validLocationType !== 'SELLABLE' && isSellable) {
      details.push({
        field: 'is_sellable',
        issue: 'Only SELLABLE location type can have IsSellable set to true.',
      });
    }

    if (details.length > 0 || !validLocationType) {
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

    const now = new Date().toISOString();
    const created: InventoryLocation = {
      location_id: createMockUuid('9999'),
      organization_id: ORGANIZATION_ID,
      branch_id: branchId,
      location_code: locationCode,
      name,
      location_type: validLocationType,
      is_sellable: validLocationType === 'SELLABLE' ? isSellable : false,
      is_active: true,
      updated_at: now,
    };

    mockLocations = [created, ...mockLocations];
    const locationHeader = `/api/v1/inventory/locations/${created.location_id}`;
    idempotencyStore.set(idempotency.compositeKey, {
      payloadSignature: idempotency.payloadSignature,
      status: 201,
      kind: 'location',
      locationBody: cloneLocation(created),
      locationHeader,
    });

    return HttpResponse.json(cloneLocation(created), {
      status: 201,
      headers: { Location: locationHeader },
    });
  }),

  http.patch(
    '*/api/v1/inventory/locations/:id',
    async ({ params, request }) => {
      const body: unknown = await request.json().catch(() => null);
      if (!isPlainRecord(body)) {
        return malformedRequestResponse('Malformed location patch payload.');
      }

      const idempotency = resolveIdempotency(request, body);
      if (!idempotency.ok) {
        return idempotency.errorResponse;
      }
      if (idempotency.replayResponse) {
        return idempotency.replayResponse;
      }

      const locationId = typeof params.id === 'string' ? params.id.trim() : '';
      const index = mockLocations.findIndex(
        (item) => item.location_id === locationId
      );
      const current = index >= 0 ? mockLocations[index] : undefined;
      if (!current) {
        return notFoundResponse('Inventory location was not found.');
      }

      const details: NormalizedApiErrorDetail[] = [];

      let nextName = current.name;
      if (body.name !== undefined && body.name !== null) {
        if (typeof body.name !== 'string') {
          details.push({ field: 'name', issue: 'Name must be a string.' });
        } else {
          const trimmedName = body.name.trim();
          if (!trimmedName) {
            details.push({ field: 'name', issue: 'Name cannot be empty.' });
          } else if (trimmedName.length > 100) {
            details.push({
              field: 'name',
              issue: 'Name cannot exceed 100 characters.',
            });
          } else {
            nextName = trimmedName;
          }
        }
      }

      let nextIsSellable = current.is_sellable;
      if (body.is_sellable !== undefined && body.is_sellable !== null) {
        if (typeof body.is_sellable !== 'boolean') {
          details.push({
            field: 'is_sellable',
            issue: 'is_sellable must be a boolean.',
          });
        } else {
          nextIsSellable = body.is_sellable;
        }
      }

      let nextIsActive = current.is_active;
      if (body.is_active !== undefined && body.is_active !== null) {
        if (typeof body.is_active !== 'boolean') {
          details.push({
            field: 'is_active',
            issue: 'is_active must be a boolean.',
          });
        } else {
          nextIsActive = body.is_active;
        }
      }

      if (current.location_type !== 'SELLABLE' && nextIsSellable) {
        details.push({
          field: 'is_sellable',
          issue: 'Only SELLABLE location type can have IsSellable set to true.',
        });
      }

      if (details.length > 0) {
        return validationErrorResponse(
          'Invalid location update details.',
          details
        );
      }

      const updated: InventoryLocation = {
        ...current,
        name: nextName,
        is_sellable:
          current.location_type === 'SELLABLE' ? nextIsSellable : false,
        is_active: nextIsActive,
        updated_at: new Date().toISOString(),
      };

      mockLocations = mockLocations.map((item, idx) =>
        idx === index ? updated : item
      );
      recomputeBalanceAvailabilityForLocation(updated);

      idempotencyStore.set(idempotency.compositeKey, {
        payloadSignature: idempotency.payloadSignature,
        status: 200,
        kind: 'location',
        locationBody: cloneLocation(updated),
      });

      return HttpResponse.json(cloneLocation(updated), { status: 200 });
    }
  ),

  // =========================================================================
  // INVENTORY BATCHES (ORG-SCOPED)
  // =========================================================================
  http.get('*/api/v1/inventory/batches', ({ request }) => {
    const url = new URL(request.url);
    const details: NormalizedApiErrorDetail[] = [];

    const productId = url.searchParams.get('product_id')?.trim() ?? '';
    const statusParam = url.searchParams.get('status')?.trim() ?? '';
    const expiringBefore =
      url.searchParams.get('expiring_before')?.trim() ?? '';

    if (statusParam && !isBatchQualityStatus(statusParam)) {
      details.push({
        field: 'status',
        issue: 'status must be AVAILABLE, QUARANTINED, EXPIRED, or RECALLED.',
      });
    }

    if (expiringBefore && !isValidIsoDate(expiringBefore)) {
      details.push({
        field: 'expiring_before',
        issue: 'expiring_before must be a valid YYYY-MM-DD date.',
      });
    }

    const { page, pageSize } = validatePaginationParams(url, details);

    if (details.length > 0) {
      return validationErrorResponse(
        'Invalid batch query parameters.',
        details
      );
    }

    const filtered = mockBatches
      .filter((batch) => {
        if (productId && batch.product_id !== productId) {
          return false;
        }
        if (statusParam && batch.quality_status !== statusParam) {
          return false;
        }
        if (
          expiringBefore &&
          (batch.expires_on === null || batch.expires_on > expiringBefore)
        ) {
          return false;
        }
        return true;
      })
      .sort(compareFefoBatches);

    return HttpResponse.json(
      buildPagedPayload(filtered, page, pageSize, cloneBatch),
      { status: 200 }
    );
  }),

  // =========================================================================
  // INVENTORY BALANCES
  // =========================================================================
  http.get('*/api/v1/inventory/balances', ({ request }) => {
    const url = new URL(request.url);
    const details: NormalizedApiErrorDetail[] = [];

    const branchId = url.searchParams.get('branch_id')?.trim() ?? '';
    if (!branchId) {
      details.push({ field: 'branch_id', issue: 'BranchId is required.' });
    }

    const productId = url.searchParams.get('product_id')?.trim() ?? '';
    const locationId = url.searchParams.get('location_id')?.trim() ?? '';
    const batchId = url.searchParams.get('batch_id')?.trim() ?? '';

    const { page, pageSize } = validatePaginationParams(url, details);

    if (details.length > 0) {
      return validationErrorResponse(
        'Invalid balance query parameters.',
        details
      );
    }

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

    return HttpResponse.json(
      buildPagedPayload(filtered, page, pageSize, cloneBalance),
      { status: 200 }
    );
  }),

  // =========================================================================
  // INVENTORY SUMMARY
  // =========================================================================
  http.get('*/api/v1/inventory/summary', ({ request }) => {
    const url = new URL(request.url);
    const details: NormalizedApiErrorDetail[] = [];

    const branchId = url.searchParams.get('branch_id')?.trim() ?? '';
    const productId = url.searchParams.get('product_id')?.trim() ?? '';

    if (!branchId) {
      details.push({ field: 'branch_id', issue: 'BranchId is required.' });
    }
    if (!productId) {
      details.push({ field: 'product_id', issue: 'ProductId is required.' });
    }

    if (details.length > 0) {
      return validationErrorResponse(
        'Branch ID and Product ID are required.',
        details
      );
    }

    const product = findCatalogProduct(productId);
    if (!product) {
      return notFoundResponse('Product was not found.');
    }

    const matchingLots = mockBalances
      .filter(
        (balance) =>
          balance.branch_id === branchId && balance.product_id === productId
      )
      .map(cloneBalance)
      .sort(compareFefoBatches);

    const totalOnHand = round4(
      matchingLots.reduce((acc, item) => acc + item.on_hand_qty_base, 0)
    );
    const totalAvailable = round4(
      matchingLots.reduce((acc, item) => acc + item.available_qty_base, 0)
    );
    const totalInventoryValue = matchingLots.reduce(
      (acc, item) => acc + item.on_hand_qty_base * item.average_unit_cost,
      0
    );
    const weightedAverageUnitCost =
      totalOnHand > 0 ? round4(totalInventoryValue / totalOnHand) : 0;

    const summary: InventorySummary = {
      organization_id: ORGANIZATION_ID,
      branch_id: branchId,
      product_id: productId,
      base_uom_code: product.base_uom_code,
      total_on_hand_qty_base: totalOnHand,
      total_available_qty_base: totalAvailable,
      weighted_average_unit_cost_base: weightedAverageUnitCost,
      locations_and_lots: matchingLots,
    };

    return HttpResponse.json(summary, { status: 200 });
  }),

  // =========================================================================
  // INVENTORY TRANSACTIONS (APPEND-ONLY LEDGER)
  // =========================================================================
  http.get('*/api/v1/inventory/transactions', ({ request }) => {
    const url = new URL(request.url);
    const details: NormalizedApiErrorDetail[] = [];

    const branchId = url.searchParams.get('branch_id')?.trim() ?? '';
    if (!branchId) {
      details.push({ field: 'branch_id', issue: 'BranchId is required.' });
    }

    const typeParam = url.searchParams.get('type')?.trim() ?? '';
    if (typeParam && !isInventoryTransactionType(typeParam)) {
      details.push({
        field: 'type',
        issue: 'Invalid inventory transaction type.',
      });
    }

    const productId = url.searchParams.get('product_id')?.trim() ?? '';
    const fromDateRaw = url.searchParams.get('from_date')?.trim() ?? '';
    const toDateRaw = url.searchParams.get('to_date')?.trim() ?? '';

    const fromMs = fromDateRaw
      ? parseTimestampBoundary(fromDateRaw, false)
      : null;
    const toMs = toDateRaw ? parseTimestampBoundary(toDateRaw, true) : null;

    if (fromDateRaw && fromMs === null) {
      details.push({
        field: 'from_date',
        issue: 'from_date must be a valid ISO date or timestamp.',
      });
    }
    if (toDateRaw && toMs === null) {
      details.push({
        field: 'to_date',
        issue: 'to_date must be a valid ISO date or timestamp.',
      });
    }

    const { page, pageSize } = validatePaginationParams(url, details);

    if (details.length > 0) {
      return validationErrorResponse(
        'Invalid transaction query parameters.',
        details
      );
    }

    const filtered = mockTransactions.filter((txn) => {
      if (txn.branch_id !== branchId) {
        return false;
      }
      if (typeParam && txn.transaction_type !== typeParam) {
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

    return HttpResponse.json(
      buildPagedPayload(filtered, page, pageSize, cloneTxn),
      { status: 200 }
    );
  }),

  // =========================================================================
  // INVENTORY ADJUSTMENTS & REVERSALS (ATOMIC IMMEDIATE POSTED)
  // =========================================================================
  http.post('*/api/v1/inventory/adjustments', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);
    if (!isPlainRecord(body)) {
      return malformedRequestResponse(
        'Request body must be a valid JSON object.'
      );
    }

    const idempotency = resolveIdempotency(request, body);
    if (!idempotency.ok) {
      return idempotency.errorResponse;
    }
    if (idempotency.replayResponse) {
      return idempotency.replayResponse;
    }

    const details: NormalizedApiErrorDetail[] = [];
    const branchId = readTrimmedString(body.branch_id);
    const rawTxnType = body.transaction_type;

    if (!branchId) {
      details.push({ field: 'branch_id', issue: 'BranchId is required.' });
    }

    const reasonCode = validateNullableOptionalString(
      body.reason_code,
      'reason_code',
      40,
      'ReasonCode',
      details
    );
    const note = validateNullableOptionalString(
      body.note,
      'note',
      500,
      'Note',
      details
    );

    if (!isAdjustmentsTxnType(rawTxnType)) {
      details.push({
        field: 'transaction_type',
        issue:
          'TransactionType must be OPENING_BALANCE, ADJUSTMENT_IN, ADJUSTMENT_OUT, or REVERSAL.',
      });
      return validationErrorResponse('Invalid inventory adjustment.', details);
    }

    const now = new Date().toISOString();
    const businessDate = todayUtcDateString();
    const workingBatches = mockBatches.map(cloneBatch);
    const workingBalances = new Map<string, StockBalance>(
      mockBalances.map((balance) => [
        balanceMapKey(balance.branch_id, balance.location_id, balance.batch_id),
        cloneBalance(balance),
      ])
    );

    if (rawTxnType === 'REVERSAL') {
      const reversesTxnId = readTrimmedString(body.reverses_inventory_txn_id);
      if (!reversesTxnId) {
        details.push({
          field: 'reverses_inventory_txn_id',
          issue:
            'ReversesInventoryTxnId is required for REVERSAL transactions.',
        });
      }
      if (details.length > 0) {
        return validationErrorResponse('Invalid reversal request.', details);
      }

      const originalTxn = mockTransactions.find(
        (txn) =>
          txn.inventory_txn_id === reversesTxnId && txn.branch_id === branchId
      );
      if (!originalTxn) {
        return notFoundResponse(
          'Inventory transaction to reverse was not found.'
        );
      }

      if (
        originalTxn.status !== 'POSTED' ||
        originalTxn.transaction_type === 'REVERSAL'
      ) {
        return invalidStateTransitionResponse(
          'Only POSTED non-reversal inventory transactions can be reversed.',
          [
            {
              field: 'reverses_inventory_txn_id',
              issue:
                'Target transaction must be POSTED and cannot itself be a REVERSAL.',
            },
          ]
        );
      }

      const alreadyReversed = mockTransactions.some(
        (txn) =>
          txn.branch_id === branchId &&
          txn.status === 'POSTED' &&
          txn.transaction_type === 'REVERSAL' &&
          txn.reverses_inventory_txn_id === originalTxn.inventory_txn_id
      );
      if (alreadyReversed) {
        return invalidStateTransitionResponse(
          'This inventory transaction has already been reversed.',
          [
            {
              field: 'reverses_inventory_txn_id',
              issue: 'Target transaction was already reversed.',
            },
          ]
        );
      }

      const reversalLines: InventoryTxnLine[] = [];

      for (const originalLine of originalTxn.lines) {
        const invertedDelta = round4(-originalLine.quantity_delta_base);
        const key = balanceMapKey(
          branchId,
          originalLine.location_id,
          originalLine.batch_id
        );
        const existingBalance = workingBalances.get(key);
        const location = mockLocations.find(
          (loc) => loc.location_id === originalLine.location_id
        );
        const batch = workingBatches.find(
          (item) => item.batch_id === originalLine.batch_id
        );
        const product = findCatalogProduct(originalLine.product_id);

        if (invertedDelta < 0) {
          const outboundQty = Math.abs(invertedDelta);
          const currentOnHand = existingBalance?.on_hand_qty_base ?? 0;
          if (currentOnHand < outboundQty) {
            return outOfStockResponse(
              'Insufficient stock available to reverse this transaction.',
              [
                {
                  field: 'reverses_inventory_txn_id',
                  issue: `Available on-hand quantity (${currentOnHand}) is lower than required reversal quantity (${outboundQty}).`,
                },
              ]
            );
          }

          const outgoingCost =
            existingBalance?.average_unit_cost ?? originalLine.unit_cost_base;
          const nextOnHand = round4(currentOnHand - outboundQty);

          if (existingBalance) {
            workingBalances.set(key, {
              ...existingBalance,
              on_hand_qty_base: nextOnHand,
              available_qty_base: deriveAvailableQtyBase(
                nextOnHand,
                location,
                batch,
                businessDate
              ),
              updated_at: now,
              row_version: existingBalance.row_version + 1,
            });
          }

          reversalLines.push({
            inventory_txn_line_id: createMockUuid('cccc'),
            product_id: originalLine.product_id,
            location_id: originalLine.location_id,
            batch_id: originalLine.batch_id,
            batch_number: originalLine.batch_number,
            product_uom_id: originalLine.product_uom_id,
            entered_qty: originalLine.entered_qty,
            conversion_snapshot: originalLine.conversion_snapshot,
            quantity_delta_base: invertedDelta,
            unit_cost_base: outgoingCost,
          });
        } else {
          const incomingQty = invertedDelta;
          const incomingCost = originalLine.unit_cost_base;
          const oldQty = existingBalance?.on_hand_qty_base ?? 0;
          const oldCost = existingBalance?.average_unit_cost ?? 0;
          const nextOnHand = round4(oldQty + incomingQty);
          const nextCost =
            nextOnHand > 0
              ? round4(
                  (oldQty * oldCost + incomingQty * incomingCost) / nextOnHand
                )
              : incomingCost;

          workingBalances.set(key, {
            organization_id: ORGANIZATION_ID,
            branch_id: branchId,
            product_id: originalLine.product_id,
            product_sku:
              existingBalance?.product_sku ?? product?.sku ?? 'UNKNOWN',
            product_name:
              existingBalance?.product_name ?? product?.name ?? 'Unknown',
            base_uom_code:
              existingBalance?.base_uom_code ?? product?.base_uom_code ?? 'PCS',
            location_id: originalLine.location_id,
            location_code:
              existingBalance?.location_code ??
              location?.location_code ??
              'UNKNOWN',
            location_type:
              existingBalance?.location_type ??
              location?.location_type ??
              'SELLABLE',
            is_location_sellable:
              location?.is_sellable ??
              existingBalance?.is_location_sellable ??
              false,
            batch_id: originalLine.batch_id,
            batch_number: originalLine.batch_number,
            manufactured_on:
              batch?.manufactured_on ??
              existingBalance?.manufactured_on ??
              null,
            expires_on:
              batch?.expires_on ?? existingBalance?.expires_on ?? null,
            quality_status:
              batch?.quality_status ??
              existingBalance?.quality_status ??
              'AVAILABLE',
            on_hand_qty_base: nextOnHand,
            available_qty_base: deriveAvailableQtyBase(
              nextOnHand,
              location,
              batch,
              businessDate
            ),
            average_unit_cost: nextCost,
            updated_at: now,
            row_version: (existingBalance?.row_version ?? 0) + 1,
          });

          reversalLines.push({
            inventory_txn_line_id: createMockUuid('cccc'),
            product_id: originalLine.product_id,
            location_id: originalLine.location_id,
            batch_id: originalLine.batch_id,
            batch_number: originalLine.batch_number,
            product_uom_id: originalLine.product_uom_id,
            entered_qty: originalLine.entered_qty,
            conversion_snapshot: originalLine.conversion_snapshot,
            quantity_delta_base: invertedDelta,
            unit_cost_base: incomingCost,
          });
        }
      }

      const createdReversal: InventoryTxn = {
        inventory_txn_id: createMockUuid('bbbb'),
        organization_id: ORGANIZATION_ID,
        branch_id: branchId,
        transaction_no: nextTransactionNo(),
        transaction_type: 'REVERSAL',
        status: 'POSTED',
        reason_code: reasonCode,
        note,
        idempotency_key: idempotency.effectiveKey,
        created_by_employee_id: MOCK_EMPLOYEE_IDS.EMP_001,
        reverses_inventory_txn_id: originalTxn.inventory_txn_id,
        posted_at: now,
        lines: reversalLines,
      };

      mockBalances = Array.from(workingBalances.values());
      mockTransactions = [createdReversal, ...mockTransactions];

      const locationHeader = `/api/v1/inventory/transactions/${createdReversal.inventory_txn_id}`;
      idempotencyStore.set(idempotency.compositeKey, {
        payloadSignature: idempotency.payloadSignature,
        status: 201,
        kind: 'txn',
        txnBody: cloneTxn(createdReversal),
        locationHeader,
      });

      return HttpResponse.json(cloneTxn(createdReversal), {
        status: 201,
        headers: { Location: locationHeader },
      });
    }

    // Standard Adjustment: OPENING_BALANCE | ADJUSTMENT_IN | ADJUSTMENT_OUT
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      details.push({
        field: 'lines',
        issue: 'Adjustment must contain at least one line.',
      });
      return validationErrorResponse('Invalid inventory adjustment.', details);
    }

    const requiresUnitCost =
      rawTxnType === 'OPENING_BALANCE' || rawTxnType === 'ADJUSTMENT_IN';

    const parsedLines: Array<{
      lineIndex: number;
      productId: string;
      productUomId: string;
      locationId: string;
      batchNumberInput: string | null;
      manufacturedOn: string | null;
      expiresOn: string | null;
      enteredQty: number;
      unitCostEntered: number | null;
    }> = [];

    for (let index = 0; index < body.lines.length; index += 1) {
      const rawLine: unknown = body.lines[index];
      const prefix = `lines[${index}]`;

      if (!isPlainRecord(rawLine)) {
        details.push({
          field: prefix,
          issue: 'Adjustment line must be a JSON object.',
        });
        continue;
      }

      const productId = readTrimmedString(rawLine.product_id);
      const productUomId = readTrimmedString(rawLine.product_uom_id);
      const locationId = readTrimmedString(rawLine.location_id);

      if (!productId) {
        details.push({
          field: `${prefix}.product_id`,
          issue: 'ProductId is required.',
        });
      }
      if (!productUomId) {
        details.push({
          field: `${prefix}.product_uom_id`,
          issue: 'ProductUomId is required.',
        });
      }
      if (!locationId) {
        details.push({
          field: `${prefix}.location_id`,
          issue: 'LocationId is required.',
        });
      }

      const batchNumberInput = validateNullableOptionalString(
        rawLine.batch_number,
        `${prefix}.batch_number`,
        80,
        'BatchNumber',
        details
      );

      let manufacturedOn: string | null = null;
      if (
        rawLine.manufactured_on !== null &&
        rawLine.manufactured_on !== undefined
      ) {
        if (typeof rawLine.manufactured_on !== 'string') {
          details.push({
            field: `${prefix}.manufactured_on`,
            issue: 'manufactured_on must be a YYYY-MM-DD date string or null.',
          });
        } else {
          const trimmedMfg = rawLine.manufactured_on.trim();
          if (trimmedMfg.length > 0) {
            if (!isValidIsoDate(trimmedMfg)) {
              details.push({
                field: `${prefix}.manufactured_on`,
                issue: 'manufactured_on must be a valid YYYY-MM-DD date.',
              });
            } else {
              manufacturedOn = trimmedMfg;
            }
          }
        }
      }

      let expiresOn: string | null = null;
      if (rawLine.expires_on !== null && rawLine.expires_on !== undefined) {
        if (typeof rawLine.expires_on !== 'string') {
          details.push({
            field: `${prefix}.expires_on`,
            issue: 'expires_on must be a YYYY-MM-DD date string or null.',
          });
        } else {
          const trimmedExp = rawLine.expires_on.trim();
          if (trimmedExp.length > 0) {
            if (!isValidIsoDate(trimmedExp)) {
              details.push({
                field: `${prefix}.expires_on`,
                issue: 'expires_on must be a valid YYYY-MM-DD date.',
              });
            } else {
              expiresOn = trimmedExp;
            }
          }
        }
      }

      if (manufacturedOn && expiresOn && manufacturedOn > expiresOn) {
        details.push({
          field: `${prefix}.expires_on`,
          issue: 'Manufacturing date cannot be after expiry date.',
        });
      }

      let enteredQty = 0;
      if (!isFiniteNumber(rawLine.entered_qty) || rawLine.entered_qty <= 0) {
        details.push({
          field: `${prefix}.entered_qty`,
          issue: 'EnteredQty must be a finite number greater than zero.',
        });
      } else {
        enteredQty = rawLine.entered_qty;
      }

      let unitCostEntered: number | null = null;
      if (requiresUnitCost) {
        if (
          !isFiniteNumber(rawLine.unit_cost_entered) ||
          rawLine.unit_cost_entered < 0
        ) {
          details.push({
            field: `${prefix}.unit_cost_entered`,
            issue:
              'Incoming transactions require valid non-negative UnitCostEntered.',
          });
        } else {
          unitCostEntered = rawLine.unit_cost_entered;
        }
      } else if (
        rawLine.unit_cost_entered !== null &&
        rawLine.unit_cost_entered !== undefined
      ) {
        if (
          !isFiniteNumber(rawLine.unit_cost_entered) ||
          rawLine.unit_cost_entered < 0
        ) {
          details.push({
            field: `${prefix}.unit_cost_entered`,
            issue: 'UnitCostEntered must be a non-negative number or null.',
          });
        } else {
          unitCostEntered = rawLine.unit_cost_entered;
        }
      }

      parsedLines.push({
        lineIndex: index,
        productId,
        productUomId,
        locationId,
        batchNumberInput,
        manufacturedOn,
        expiresOn,
        enteredQty,
        unitCostEntered,
      });
    }

    if (details.length > 0) {
      return validationErrorResponse(
        'Invalid inventory adjustment lines.',
        details
      );
    }

    const validatedLines: ValidatedStandardLine[] = [];

    for (const parsed of parsedLines) {
      const location = mockLocations.find(
        (loc) =>
          loc.location_id === parsed.locationId &&
          loc.branch_id === branchId &&
          loc.is_active
      );
      if (!location) {
        return notFoundResponse('Inventory location was not found.');
      }

      const product = findCatalogProduct(parsed.productId);
      if (!product) {
        return notFoundResponse('Product was not found.');
      }

      const { enteredUom, baseUom } = findActiveProductUoms(
        product,
        parsed.productUomId
      );
      if (!enteredUom) {
        return notFoundResponse('Product UOM was not found.');
      }
      if (!baseUom) {
        return conflictResponse('Product has no active base UOM.');
      }

      validatedLines.push({
        lineIndex: parsed.lineIndex,
        product,
        location,
        enteredUom,
        baseUom,
        batchNumberInput: parsed.batchNumberInput,
        manufacturedOn: parsed.manufacturedOn,
        expiresOn: parsed.expiresOn,
        enteredQty: parsed.enteredQty,
        unitCostEntered: parsed.unitCostEntered,
      });
    }

    const resolvedLinesWithBatches: Array<{
      validated: ValidatedStandardLine;
      batch: InventoryBatch;
    }> = [];

    for (const validated of validatedLines) {
      const prefix = `lines[${validated.lineIndex}]`;
      const isNonLotInput =
        validated.batchNumberInput === null ||
        validated.batchNumberInput.toUpperCase() === NON_LOT_BATCH_NUMBER;

      if (!validated.product.lot_tracking_required) {
        if (
          !isNonLotInput ||
          validated.expiresOn !== null ||
          validated.manufacturedOn !== null
        ) {
          return validationErrorResponse('Invalid non-lot batch input.', [
            {
              field: `${prefix}.batch_number`,
              issue:
                'Non-lot-tracked products must omit batch_number (or use NON-LOT) and omit expires_on.',
            },
          ]);
        }

        let nonLotBatch = workingBatches.find(
          (item) =>
            item.product_id === validated.product.product_id &&
            item.batch_number.toUpperCase() === NON_LOT_BATCH_NUMBER
        );
        if (!nonLotBatch) {
          nonLotBatch = {
            batch_id: createMockUuid('aaaa'),
            organization_id: ORGANIZATION_ID,
            product_id: validated.product.product_id,
            batch_number: NON_LOT_BATCH_NUMBER,
            manufactured_on: null,
            expires_on: null,
            quality_status: 'AVAILABLE',
            updated_at: now,
          };
          workingBatches.push(nonLotBatch);
        }

        resolvedLinesWithBatches.push({ validated, batch: nonLotBatch });
        continue;
      }

      // Lot-tracked product
      if (isNonLotInput || !validated.batchNumberInput) {
        return validationErrorResponse('Batch number is required.', [
          {
            field: `${prefix}.batch_number`,
            issue:
              'Cannot use empty or NON-LOT batch for a lot-tracked product.',
          },
        ]);
      }

      const normalizedBatchNumber = validated.batchNumberInput;
      let resolvedBatch = workingBatches.find(
        (item) =>
          item.product_id === validated.product.product_id &&
          item.batch_number.toUpperCase() ===
            normalizedBatchNumber.toUpperCase()
      );

      if (!resolvedBatch) {
        if (rawTxnType === 'ADJUSTMENT_OUT') {
          return outOfStockResponse(
            'Insufficient stock available to complete this adjustment.',
            [
              {
                field: `${prefix}.entered_qty`,
                issue: `Batch "${normalizedBatchNumber}" has 0 available on-hand stock.`,
              },
            ]
          );
        }

        if (!validated.expiresOn) {
          return validationErrorResponse('Expiry date is required.', [
            {
              field: `${prefix}.expires_on`,
              issue: 'Expiry date is required for lot-tracked products.',
            },
          ]);
        }

        const isAlreadyExpired = validated.expiresOn <= businessDate;
        resolvedBatch = {
          batch_id: createMockUuid('aaaa'),
          organization_id: ORGANIZATION_ID,
          product_id: validated.product.product_id,
          batch_number: normalizedBatchNumber,
          manufactured_on: validated.manufacturedOn,
          expires_on: validated.expiresOn,
          quality_status: isAlreadyExpired ? 'EXPIRED' : 'AVAILABLE',
          updated_at: now,
        };
        workingBatches.push(resolvedBatch);
      }

      if (
        requiresUnitCost &&
        validated.location.is_sellable &&
        (resolvedBatch.quality_status === 'EXPIRED' ||
          (resolvedBatch.expires_on !== null &&
            resolvedBatch.expires_on <= businessDate))
      ) {
        return expiryPolicyViolationResponse(
          'Cannot place expired stock into a sellable location.',
          [
            {
              field: `${prefix}.expires_on`,
              issue: `Batch "${resolvedBatch.batch_number}" is expired and cannot enter a sellable location.`,
            },
          ]
        );
      }

      resolvedLinesWithBatches.push({ validated, batch: resolvedBatch });
    }

    if (rawTxnType === 'OPENING_BALANCE') {
      const seenKeys = new Set<string>();
      for (const { validated, batch } of resolvedLinesWithBatches) {
        const prefix = `lines[${validated.lineIndex}]`;
        const key = balanceMapKey(
          branchId,
          validated.location.location_id,
          batch.batch_id
        );
        if (seenKeys.has(key)) {
          return invalidStateTransitionResponse(
            'Duplicate location and batch in OPENING_BALANCE request.',
            [
              {
                field: 'lines',
                issue:
                  'Each (location_id, batch) pair may appear at most once in an opening balance.',
              },
            ]
          );
        }
        seenKeys.add(key);

        const existingBalance = workingBalances.get(key);
        const hasLedgerHistory = mockTransactions.some(
          (txn) =>
            txn.branch_id === branchId &&
            txn.lines.some(
              (line) =>
                line.location_id === validated.location.location_id &&
                line.batch_id === batch.batch_id
            )
        );
        if (
          (existingBalance && existingBalance.on_hand_qty_base !== 0) ||
          hasLedgerHistory
        ) {
          return invalidStateTransitionResponse(
            'OPENING_BALANCE is not allowed when stock or ledger history already exists for this location and batch.',
            [
              {
                field: `${prefix}.batch_number`,
                issue:
                  'Stock or ledger history already exists for this location and batch.',
              },
            ]
          );
        }
      }
    }

    const postedLines: InventoryTxnLine[] = [];

    for (const { validated, batch } of resolvedLinesWithBatches) {
      const prefix = `lines[${validated.lineIndex}]`;
      const conversionFactor = validated.enteredUom.conversion_to_base;
      const quantityBase = round4(validated.enteredQty * conversionFactor);
      const key = balanceMapKey(
        branchId,
        validated.location.location_id,
        batch.batch_id
      );
      const existingBalance = workingBalances.get(key);

      if (rawTxnType === 'OPENING_BALANCE' || rawTxnType === 'ADJUSTMENT_IN') {
        const incomingCostBase =
          validated.unitCostEntered !== null
            ? round4(validated.unitCostEntered / conversionFactor)
            : (existingBalance?.average_unit_cost ?? 0);
        const oldQty = existingBalance?.on_hand_qty_base ?? 0;
        const oldCost = existingBalance?.average_unit_cost ?? 0;
        const nextOnHand = round4(oldQty + quantityBase);
        const nextCost =
          nextOnHand > 0
            ? round4(
                (oldQty * oldCost + quantityBase * incomingCostBase) /
                  nextOnHand
              )
            : incomingCostBase;

        workingBalances.set(key, {
          organization_id: ORGANIZATION_ID,
          branch_id: branchId,
          product_id: validated.product.product_id,
          product_sku: validated.product.sku,
          product_name: validated.product.name,
          base_uom_code: validated.product.base_uom_code,
          location_id: validated.location.location_id,
          location_code: validated.location.location_code,
          location_type: validated.location.location_type,
          is_location_sellable: validated.location.is_sellable,
          batch_id: batch.batch_id,
          batch_number: batch.batch_number,
          manufactured_on: batch.manufactured_on,
          expires_on: batch.expires_on,
          quality_status: batch.quality_status,
          on_hand_qty_base: nextOnHand,
          available_qty_base: deriveAvailableQtyBase(
            nextOnHand,
            validated.location,
            batch,
            businessDate
          ),
          average_unit_cost: nextCost,
          updated_at: now,
          row_version: (existingBalance?.row_version ?? 0) + 1,
        });

        postedLines.push({
          inventory_txn_line_id: createMockUuid('cccc'),
          product_id: validated.product.product_id,
          location_id: validated.location.location_id,
          batch_id: batch.batch_id,
          batch_number: batch.batch_number,
          product_uom_id: validated.baseUom.product_uom_id,
          entered_qty: quantityBase,
          conversion_snapshot: 1,
          quantity_delta_base: quantityBase,
          unit_cost_base: incomingCostBase,
        });
      } else {
        // ADJUSTMENT_OUT
        const oldQty = existingBalance?.on_hand_qty_base ?? 0;
        if (oldQty < quantityBase) {
          return outOfStockResponse(
            'Insufficient stock available to complete this adjustment.',
            [
              {
                field: `${prefix}.entered_qty`,
                issue: `Available on-hand quantity is ${oldQty}.`,
              },
            ]
          );
        }

        const outgoingCostBase = existingBalance?.average_unit_cost ?? 0;
        const nextOnHand = round4(oldQty - quantityBase);

        if (existingBalance) {
          workingBalances.set(key, {
            ...existingBalance,
            on_hand_qty_base: nextOnHand,
            available_qty_base: deriveAvailableQtyBase(
              nextOnHand,
              validated.location,
              batch,
              businessDate
            ),
            updated_at: now,
            row_version: existingBalance.row_version + 1,
          });
        }

        postedLines.push({
          inventory_txn_line_id: createMockUuid('cccc'),
          product_id: validated.product.product_id,
          location_id: validated.location.location_id,
          batch_id: batch.batch_id,
          batch_number: batch.batch_number,
          product_uom_id: validated.baseUom.product_uom_id,
          entered_qty: quantityBase,
          conversion_snapshot: 1,
          quantity_delta_base: round4(-quantityBase),
          unit_cost_base: outgoingCostBase,
        });
      }
    }

    const createdTxn: InventoryTxn = {
      inventory_txn_id: createMockUuid('bbbb'),
      organization_id: ORGANIZATION_ID,
      branch_id: branchId,
      transaction_no: nextTransactionNo(),
      transaction_type: rawTxnType,
      status: 'POSTED',
      reason_code: reasonCode,
      note,
      idempotency_key: idempotency.effectiveKey,
      created_by_employee_id: MOCK_EMPLOYEE_IDS.EMP_001,
      reverses_inventory_txn_id: null,
      posted_at: now,
      lines: postedLines,
    };

    mockBatches = workingBatches;
    mockBalances = Array.from(workingBalances.values());
    mockTransactions = [createdTxn, ...mockTransactions];

    const locationHeader = `/api/v1/inventory/transactions/${createdTxn.inventory_txn_id}`;
    idempotencyStore.set(idempotency.compositeKey, {
      payloadSignature: idempotency.payloadSignature,
      status: 201,
      kind: 'txn',
      txnBody: cloneTxn(createdTxn),
      locationHeader,
    });

    return HttpResponse.json(cloneTxn(createdTxn), {
      status: 201,
      headers: { Location: locationHeader },
    });
  }),
];
