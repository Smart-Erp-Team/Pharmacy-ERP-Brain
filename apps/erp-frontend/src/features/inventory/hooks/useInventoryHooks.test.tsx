/** @vitest-environment jsdom */
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import inventoryBalanceFixture from '@contracts/fixtures/inventory-balance.json';
import { ApiClientError, apiClient } from '../../../lib/api/client';
import {
  INITIAL_BALANCES,
  INITIAL_BATCHES,
  INITIAL_LOCATIONS,
  INITIAL_TRANSACTIONS,
  inventoryHandlers,
  MOCK_BATCH_IDS,
  MOCK_BRANCH_IDS,
  MOCK_EMPLOYEE_IDS,
  MOCK_LOCATION_IDS,
  MOCK_PRODUCT_IDS,
  MOCK_PRODUCT_UOM_IDS,
  MOCK_TRANSACTION_IDS,
  ORGANIZATION_ID,
  resetMockInventory,
} from '../../../mocks/inventoryHandlers';
import type {
  CreateInventoryAdjustmentRequest,
  CreateInventoryLocationRequest,
  InventoryTxn,
} from '../../../types/api';
import {
  createInventoryAdjustment,
  createInventoryLocation,
  getInventorySummary,
  listInventoryBalances,
  listInventoryBatches,
  listInventoryLocations,
  listInventoryTransactions,
  patchInventoryLocation,
} from '../api/inventoryApi';
import { inventoryKeys } from './inventoryKeys';
import {
  useCreateInventoryAdjustmentMutation,
  useCreateInventoryLocationMutation,
  usePatchInventoryLocationMutation,
} from './useInventoryMutations';
import {
  useAllInventoryBalancesQuery,
  useAllInventoryBatchesQuery,
  useAllInventoryLocationsQuery,
  useAllInventoryTransactionsQuery,
  useInventoryBalancesQuery,
  useInventoryBatchesQuery,
  useInventoryLocationsQuery,
  useInventorySummaryQuery,
  useInventoryTransactionsQuery,
} from './useInventoryQueries';

const server = setupServer(...inventoryHandlers);

let activeQueryClient: QueryClient | null = null;

function createTestQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  activeQueryClient = client;
  return client;
}

function createQueryWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children?: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  resetMockInventory();
});
afterEach(() => {
  server.resetHandlers();
  if (activeQueryClient) {
    activeQueryClient.clear();
    activeQueryClient = null;
  }
  cleanup();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('inventoryHandlers Stage 1 MEDCARE seed invariants', () => {
  it('exposes verbatim inventory-balance.json, DAMAGED location, FEFO/expired/NON-LOT batches, and POSTED ledger history', () => {
    expect(ORGANIZATION_ID).toBe('11111111-1111-4111-8111-111111111101');
    expect(INITIAL_LOCATIONS).toHaveLength(6);
    expect(INITIAL_LOCATIONS.map((loc) => loc.location_code)).toEqual([
      'MAIN-SELLABLE',
      'QUAR-01',
      'DMG-01',
      'SCRAP-01',
      'OLD-BIN',
      'ALX-SELL-01',
    ]);
    expect(
      INITIAL_LOCATIONS.find(
        (loc) => loc.location_id === MOCK_LOCATION_IDS.DMG_01
      )
    ).toMatchObject({
      location_type: 'DAMAGED',
      is_sellable: false,
      is_active: true,
    });

    expect(INITIAL_BATCHES).toHaveLength(5);
    expect(INITIAL_BATCHES.map((batch) => batch.batch_number)).toEqual([
      'MEDCARE-LOT-2601',
      'MEDCARE-LOT-2602',
      'MEDCARE-LOT-EXP',
      'MEDCARE-PAN-01',
      'NON-LOT',
    ]);

    expect(INITIAL_BALANCES).toHaveLength(6);
    expect(INITIAL_BALANCES[0]).toEqual(inventoryBalanceFixture);

    expect(INITIAL_TRANSACTIONS).toHaveLength(3);
    expect(INITIAL_TRANSACTIONS.every((txn) => txn.status === 'POSTED')).toBe(
      true
    );
    expect(
      INITIAL_TRANSACTIONS.map((txn) => txn.created_by_employee_id)
    ).toEqual([
      MOCK_EMPLOYEE_IDS.EMP_002,
      MOCK_EMPLOYEE_IDS.EMP_001,
      MOCK_EMPLOYEE_IDS.EMP_002,
    ]);
  });
});

describe('inventoryApi and inventoryHandlers Stage 1 integration', () => {
  it('serializes snake_case query params, omits blank strings, encodes location IDs, and wraps malformed wire payloads as INVALID_RESPONSE', async () => {
    const requestedUrls: string[] = [];
    server.use(
      http.get('*/api/v1/inventory/locations', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({
          items: [],
          page: 1,
          page_size: 10,
          total_count: 0,
          next_cursor: null,
        });
      }),
      http.patch('*/api/v1/inventory/locations/:id', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json(INITIAL_LOCATIONS[0]);
      }),
      http.get('*/api/v1/inventory/batches', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({
          items: [],
          page: 1,
          page_size: 25,
          total_count: 0,
          next_cursor: null,
        });
      }),
      http.get('*/api/v1/inventory/balances', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({
          items: [],
          page: 1,
          page_size: 25,
          total_count: 0,
          next_cursor: null,
        });
      }),
      http.get('*/api/v1/inventory/summary', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({
          organization_id: ORGANIZATION_ID,
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
          product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
          base_uom_code: 'TAB',
          total_on_hand_qty_base: 0,
          total_available_qty_base: 0,
          weighted_average_unit_cost_base: 0,
          locations_and_lots: [],
        });
      }),
      http.get('*/api/v1/inventory/transactions', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({
          items: [],
          page: 2,
          page_size: 15,
          total_count: 0,
          next_cursor: null,
        });
      })
    );

    await listInventoryLocations({
      branch_id: ` ${MOCK_BRANCH_IDS.DOWNTOWN} `,
      is_sellable: true,
      include_inactive: false,
      page: 1,
      page_size: 10,
    });
    await patchInventoryLocation(
      ' loc/1 ',
      { name: 'Updated Shelf' },
      { idempotencyKey: 'patch-loc-key-1' }
    );
    await listInventoryBatches({
      product_id: '   ',
      status: 'AVAILABLE',
      expiring_before: ' ',
    });
    await listInventoryBalances({
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      product_id: ' ',
      location_id: '',
      batch_id: '  ',
    });
    await getInventorySummary({
      branch_id: ` ${MOCK_BRANCH_IDS.DOWNTOWN} `,
      product_id: ` ${MOCK_PRODUCT_IDS.AUGMENTIN_1G} `,
    });
    await listInventoryTransactions({
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      type: 'ADJUSTMENT_IN',
      product_id: '  ',
      from_date: ' ',
      to_date: '',
      page: 2,
      page_size: 15,
    });

    expect(requestedUrls).toHaveLength(6);

    const locUrl = new URL(requestedUrls[0] ?? '');
    expect(locUrl.searchParams.get('branch_id')).toBe(MOCK_BRANCH_IDS.DOWNTOWN);
    expect(locUrl.searchParams.get('is_sellable')).toBe('true');
    expect(locUrl.searchParams.get('include_inactive')).toBe('false');
    expect(locUrl.searchParams.get('page_size')).toBe('10');

    expect(new URL(requestedUrls[1] ?? '').pathname).toBe(
      '/api/v1/inventory/locations/loc%2F1'
    );

    const batchUrl = new URL(requestedUrls[2] ?? '');
    expect(batchUrl.searchParams.get('status')).toBe('AVAILABLE');
    expect(batchUrl.searchParams.has('product_id')).toBe(false);
    expect(batchUrl.searchParams.has('expiring_before')).toBe(false);

    const balUrl = new URL(requestedUrls[3] ?? '');
    expect(balUrl.searchParams.get('branch_id')).toBe(MOCK_BRANCH_IDS.DOWNTOWN);
    expect(balUrl.searchParams.has('product_id')).toBe(false);
    expect(balUrl.searchParams.has('location_id')).toBe(false);
    expect(balUrl.searchParams.has('batch_id')).toBe(false);

    const summaryUrl = new URL(requestedUrls[4] ?? '');
    expect(summaryUrl.searchParams.get('branch_id')).toBe(
      MOCK_BRANCH_IDS.DOWNTOWN
    );
    expect(summaryUrl.searchParams.get('product_id')).toBe(
      MOCK_PRODUCT_IDS.AUGMENTIN_1G
    );

    const txnUrl = new URL(requestedUrls[5] ?? '');
    expect(txnUrl.searchParams.get('type')).toBe('ADJUSTMENT_IN');
    expect(txnUrl.searchParams.get('page')).toBe('2');
    expect(txnUrl.searchParams.has('from_date')).toBe(false);
    expect(txnUrl.searchParams.has('to_date')).toBe(false);

    // Reject legacy string decimals on wire with INVALID_RESPONSE
    server.use(
      http.get('*/api/v1/inventory/balances', () =>
        HttpResponse.json({
          items: [{ ...inventoryBalanceFixture, on_hand_qty_base: '280.0000' }],
          page: 1,
          page_size: 25,
          total_count: 1,
          next_cursor: null,
        })
      )
    );
    await expect(
      listInventoryBalances({ branch_id: MOCK_BRANCH_IDS.DOWNTOWN })
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('lists, creates, and patches locations (including DAMAGED), enforces sellability rules, and updates balance availability', async () => {
    await expect(listInventoryLocations({})).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'branch_id', issue: expect.any(String) }],
    });

    const dtActive = await listInventoryLocations({
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
    });
    expect(dtActive.items).toHaveLength(4);
    expect(dtActive.total_count).toBe(4);
    expect(dtActive.items.map((loc) => loc.location_type)).toEqual([
      'SELLABLE',
      'QUARANTINE',
      'DAMAGED',
      'SCRAP',
    ]);

    const dtAll = await listInventoryLocations({
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      include_inactive: true,
    });
    expect(dtAll.items).toHaveLength(5);
    expect(dtAll.items.some((loc) => loc.location_code === 'OLD-BIN')).toBe(
      true
    );

    const dtSellable = await listInventoryLocations({
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      is_sellable: true,
    });
    expect(dtSellable.items.map((loc) => loc.location_code)).toEqual([
      'MAIN-SELLABLE',
    ]);

    // Reject non-SELLABLE location marked as is_sellable: true
    await expect(
      createInventoryLocation({
        branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
        location_code: 'DMG-BAD',
        name: 'Invalid Sellable Damaged Bay',
        location_type: 'DAMAGED',
        is_sellable: true,
      })
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'is_sellable', issue: expect.any(String) }],
    });

    const createdDamaged = await createInventoryLocation({
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      location_code: 'DMG-02',
      name: 'Secondary Damaged Cage',
      location_type: 'DAMAGED',
      is_sellable: false,
    });
    expect(createdDamaged.location_type).toBe('DAMAGED');
    expect(createdDamaged.is_sellable).toBe(false);
    expect(createdDamaged.is_active).toBe(true);

    // Duplicate location_code in same branch -> 409 CONFLICT
    await expect(
      createInventoryLocation({
        branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
        location_code: 'main-sellable',
        name: 'Duplicate Main Shelf',
        location_type: 'SELLABLE',
        is_sellable: true,
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: [{ field: 'location_code', issue: expect.any(String) }],
    });

    // Reject PATCH setting is_sellable: true on DAMAGED location
    await expect(
      patchInventoryLocation(MOCK_LOCATION_IDS.DMG_01, { is_sellable: true })
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'is_sellable', issue: expect.any(String) }],
    });

    // Toggling MAIN-SELLABLE to is_sellable: false sets derived available_qty_base to 0 while keeping location_code immutable
    const rawPatched = await apiClient.patch(
      `/inventory/locations/${MOCK_LOCATION_IDS.MAIN_SELLABLE}`,
      {
        location_code: 'IGNORED-CODE',
        name: 'Downtown Main Shelf (Hold)',
        is_sellable: false,
      }
    );
    expect(rawPatched.data).toMatchObject({
      location_code: 'MAIN-SELLABLE',
      name: 'Downtown Main Shelf (Hold)',
      is_sellable: false,
    });

    const heldSummary = await getInventorySummary({
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
    });
    expect(heldSummary.total_on_hand_qty_base).toBe(400);
    expect(heldSummary.total_available_qty_base).toBe(0);

    const restored = await patchInventoryLocation(
      MOCK_LOCATION_IDS.MAIN_SELLABLE,
      {
        name: 'Downtown Main Dispensary Shelf',
        is_sellable: true,
        is_active: true,
      }
    );
    expect(restored.is_sellable).toBe(true);
  });

  it('serves org-scoped batches in FEFO order and computes InventorySummary aggregates and error responses', async () => {
    const allBatches = await listInventoryBatches();
    expect(allBatches.items.map((b) => b.batch_number)).toEqual([
      'MEDCARE-LOT-EXP',
      'MEDCARE-LOT-2602',
      'MEDCARE-PAN-01',
      'MEDCARE-LOT-2601',
      'NON-LOT',
    ]);

    const augAvailable = await listInventoryBatches({
      product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
      status: 'AVAILABLE',
    });
    expect(augAvailable.items.map((b) => b.batch_number)).toEqual([
      'MEDCARE-LOT-2602',
      'MEDCARE-LOT-2601',
    ]);

    const expiringSoon = await listInventoryBatches({
      expiring_before: '2026-12-31',
    });
    expect(expiringSoon.items.map((b) => b.batch_number)).toEqual([
      'MEDCARE-LOT-EXP',
      'MEDCARE-LOT-2602',
    ]);

    const summary = await getInventorySummary({
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
    });
    expect(summary).toMatchObject({
      organization_id: ORGANIZATION_ID,
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
      base_uom_code: 'TAB',
      total_on_hand_qty_base: 400,
      total_available_qty_base: 350,
      weighted_average_unit_cost_base: 7.13,
    });
    expect(summary.locations_and_lots.map((b) => b.batch_number)).toEqual([
      'MEDCARE-LOT-EXP',
      'MEDCARE-LOT-2602',
      'MEDCARE-LOT-2601',
    ]);

    // Known product with zero stock in Alexandria returns 0s and empty locations_and_lots
    const zeroSummary = await getInventorySummary({
      branch_id: MOCK_BRANCH_IDS.ALEXANDRIA,
      product_id: MOCK_PRODUCT_IDS.PANADOL_EXTRA,
    });
    expect(zeroSummary.total_on_hand_qty_base).toBe(0);
    expect(zeroSummary.weighted_average_unit_cost_base).toBe(0);
    expect(zeroSummary.locations_and_lots).toEqual([]);

    // Missing params -> 422 VALIDATION_ERROR; unknown product -> 404 NOT_FOUND
    await expect(
      getInventorySummary({
        branch_id: '',
        product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    await expect(
      getInventorySummary({
        branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
        product_id: '99999999-9999-4999-8999-999999999999',
      })
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('executes atomic POST /inventory/adjustments for OPENING_BALANCE, ADJUSTMENT_IN (UOM conversion), EXPIRY_POLICY_VIOLATION, ADJUSTMENT_OUT (409 OUT_OF_STOCK), and REVERSAL', async () => {
    // 1. OPENING_BALANCE for a brand-new batch succeeds once, then rejects repeat with 409 INVALID_STATE_TRANSITION
    const openingTxn = await createInventoryAdjustment({
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      transaction_type: 'OPENING_BALANCE',
      reason_code: 'NEW_LOT_OPENING',
      note: 'Initial count for new Panadol lot',
      reverses_inventory_txn_id: null,
      lines: [
        {
          product_id: MOCK_PRODUCT_IDS.PANADOL_EXTRA,
          product_uom_id: MOCK_PRODUCT_UOM_IDS.PANADOL_BOX,
          location_id: MOCK_LOCATION_IDS.QUAR_01,
          batch_number: 'MEDCARE-PAN-OPEN-01',
          manufactured_on: '2026-06-01',
          expires_on: '2028-06-01',
          entered_qty: 5,
          unit_cost_entered: 48,
        },
      ],
    });
    expect(openingTxn.status).toBe('POSTED');
    expect(openingTxn.lines[0]).toMatchObject({
      product_uom_id: MOCK_PRODUCT_UOM_IDS.PANADOL_TAB,
      batch_number: 'MEDCARE-PAN-OPEN-01',
      entered_qty: 120,
      conversion_snapshot: 1,
      quantity_delta_base: 120,
      unit_cost_base: 2,
    });

    await expect(
      createInventoryAdjustment({
        branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
        transaction_type: 'OPENING_BALANCE',
        reason_code: 'DUPLICATE_OPENING',
        note: null,
        reverses_inventory_txn_id: null,
        lines: [
          {
            product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
            product_uom_id: MOCK_PRODUCT_UOM_IDS.AUGMENTIN_TAB,
            location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
            batch_number: 'MEDCARE-LOT-2601',
            manufactured_on: '2026-01-10',
            expires_on: '2027-07-31',
            entered_qty: 10,
            unit_cost_entered: 7.2,
          },
        ],
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'INVALID_STATE_TRANSITION',
    });

    // 2. Expired batch into sellable location -> 422 EXPIRY_POLICY_VIOLATION
    await expect(
      createInventoryAdjustment({
        branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
        transaction_type: 'ADJUSTMENT_IN',
        reason_code: 'BAD_RECEIVE',
        note: null,
        reverses_inventory_txn_id: null,
        lines: [
          {
            product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
            product_uom_id: MOCK_PRODUCT_UOM_IDS.AUGMENTIN_TAB,
            location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
            batch_number: 'MEDCARE-LOT-EXP',
            manufactured_on: null,
            expires_on: '2025-06-01',
            entered_qty: 10,
            unit_cost_entered: 6.5,
          },
        ],
      })
    ).rejects.toMatchObject({
      status: 422,
      code: 'EXPIRY_POLICY_VIOLATION',
    });

    // 3. ADJUSTMENT_IN with Box of 14 UOM (2 boxes @ 112/box -> 28 tabs @ 8.0/tab) + NON-LOT Vitamin D3
    const adjIn = await createInventoryAdjustment({
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      transaction_type: 'ADJUSTMENT_IN',
      reason_code: 'CYCLE_SURPLUS',
      note: 'Found 2 unopened boxes and 5 Vitamin D3 bottles',
      reverses_inventory_txn_id: null,
      lines: [
        {
          product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
          product_uom_id: MOCK_PRODUCT_UOM_IDS.AUGMENTIN_BOX,
          location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
          batch_number: 'MEDCARE-LOT-2601',
          manufactured_on: null,
          expires_on: null,
          entered_qty: 2,
          unit_cost_entered: 112,
        },
        {
          product_id: MOCK_PRODUCT_IDS.VITAMIN_D3,
          product_uom_id: MOCK_PRODUCT_UOM_IDS.VITAMIN_D3_BOTTLE,
          location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
          batch_number: null,
          manufactured_on: null,
          expires_on: null,
          entered_qty: 5,
          unit_cost_entered: 65,
        },
      ],
    });
    expect(adjIn.lines[0]).toMatchObject({
      product_uom_id: MOCK_PRODUCT_UOM_IDS.AUGMENTIN_TAB,
      entered_qty: 28,
      conversion_snapshot: 1,
      quantity_delta_base: 28,
      unit_cost_base: 8,
    });
    expect(adjIn.lines[1]).toMatchObject({
      batch_number: 'NON-LOT',
      quantity_delta_base: 5,
    });

    // Balance on MEDCARE-LOT-2601 was 280 @ 7.2 (row_version 3) -> + 28 @ 8.0 = 308 @ 7.2727 (row_version 4)
    const updatedLot2601 = await listInventoryBalances({
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
      batch_id: MOCK_BATCH_IDS.MEDCARE_LOT_2601,
    });
    expect(updatedLot2601.items[0]).toMatchObject({
      on_hand_qty_base: 308,
      available_qty_base: 308,
      average_unit_cost: 7.2727,
      row_version: 4,
    });

    // 4. ADJUSTMENT_OUT exceeding on_hand_qty_base -> 409 OUT_OF_STOCK without mutating state
    await expect(
      createInventoryAdjustment({
        branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
        transaction_type: 'ADJUSTMENT_OUT',
        reason_code: 'SHRINKAGE',
        note: null,
        reverses_inventory_txn_id: null,
        lines: [
          {
            product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
            product_uom_id: MOCK_PRODUCT_UOM_IDS.AUGMENTIN_TAB,
            location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
            batch_number: 'MEDCARE-LOT-2601',
            manufactured_on: null,
            expires_on: null,
            entered_qty: 1000,
            unit_cost_entered: null,
          },
        ],
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'OUT_OF_STOCK',
      details: [{ field: 'lines[0].entered_qty', issue: expect.any(String) }],
    });

    // Valid ADJUSTMENT_OUT subtracts 8 tabs at current average_unit_cost (7.2727) -> 300 on hand, row_version 5
    const adjOut = await createInventoryAdjustment({
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      transaction_type: 'ADJUSTMENT_OUT',
      reason_code: 'DAMAGED_TABS',
      note: null,
      reverses_inventory_txn_id: null,
      lines: [
        {
          product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
          product_uom_id: MOCK_PRODUCT_UOM_IDS.AUGMENTIN_TAB,
          location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
          batch_number: 'MEDCARE-LOT-2601',
          manufactured_on: null,
          expires_on: null,
          entered_qty: 8,
          unit_cost_entered: null,
        },
      ],
    });
    expect(adjOut.lines[0]).toMatchObject({
      quantity_delta_base: -8,
      unit_cost_base: 7.2727,
    });

    // 5. REVERSAL of seeded DOWNTOWN_ADJUSTMENT_IN negates lines and blocks second reversal with 409 INVALID_STATE_TRANSITION
    const reversal = await createInventoryAdjustment({
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      transaction_type: 'REVERSAL',
      reason_code: 'POSTED_IN_ERROR',
      note: 'Reversing seeded surplus',
      reverses_inventory_txn_id: MOCK_TRANSACTION_IDS.DOWNTOWN_ADJUSTMENT_IN,
      lines: null,
    });
    expect(reversal.status).toBe('POSTED');
    expect(reversal.reverses_inventory_txn_id).toBe(
      MOCK_TRANSACTION_IDS.DOWNTOWN_ADJUSTMENT_IN
    );
    expect(reversal.lines.map((l) => l.quantity_delta_base)).toEqual([
      -48, -70,
    ]);

    await expect(
      createInventoryAdjustment({
        branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
        transaction_type: 'REVERSAL',
        reason_code: 'DOUBLE_REVERSAL',
        note: null,
        reverses_inventory_txn_id: MOCK_TRANSACTION_IDS.DOWNTOWN_ADJUSTMENT_IN,
        lines: null,
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'INVALID_STATE_TRANSITION',
    });

    const reversalHistory = await listInventoryTransactions({
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      type: 'REVERSAL',
      from_date: '2026-01-01',
    });
    expect(reversalHistory.items).toHaveLength(1);
    expect(reversalHistory.items[0]?.inventory_txn_id).toBe(
      reversal.inventory_txn_id
    );
  });
});

describe('useInventoryQueries hooks', () => {
  it('guards blank/null/undefined branch_id and product_id via enabled and fetches single-page and all-pages Stage 1 queries', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);

    const { result: idleHooks } = renderHook(
      () => ({
        locsBlank: useInventoryLocationsQuery({ branch_id: '   ' }),
        allLocsNull: useAllInventoryLocationsQuery({ branch_id: null }),
        batchesDisabled: useInventoryBatchesQuery({}, { enabled: false }),
        allBatchesDisabled: useAllInventoryBatchesQuery({}, { enabled: false }),
        balancesBlank: useInventoryBalancesQuery({ branch_id: '' }),
        allBalancesNull: useAllInventoryBalancesQuery({ branch_id: null }),
        summaryNoBranch: useInventorySummaryQuery({
          branch_id: null,
          product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
        }),
        summaryNoProduct: useInventorySummaryQuery({
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
          product_id: '  ',
        }),
        txnsBlank: useInventoryTransactionsQuery({ branch_id: ' ' }),
        allTxnsUndef: useAllInventoryTransactionsQuery({
          branch_id: undefined,
        }),
      }),
      { wrapper }
    );

    expect(idleHooks.current.locsBlank.fetchStatus).toBe('idle');
    expect(idleHooks.current.allLocsNull.fetchStatus).toBe('idle');
    expect(idleHooks.current.batchesDisabled.fetchStatus).toBe('idle');
    expect(idleHooks.current.allBatchesDisabled.fetchStatus).toBe('idle');
    expect(idleHooks.current.balancesBlank.fetchStatus).toBe('idle');
    expect(idleHooks.current.allBalancesNull.fetchStatus).toBe('idle');
    expect(idleHooks.current.summaryNoBranch.fetchStatus).toBe('idle');
    expect(idleHooks.current.summaryNoProduct.fetchStatus).toBe('idle');
    expect(idleHooks.current.txnsBlank.fetchStatus).toBe('idle');
    expect(idleHooks.current.allTxnsUndef.fetchStatus).toBe('idle');

    const { result: liveHooks } = renderHook(
      () => ({
        locations: useInventoryLocationsQuery({
          branch_id: ` ${MOCK_BRANCH_IDS.DOWNTOWN} `,
        }),
        allLocations: useAllInventoryLocationsQuery({
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
          include_inactive: true,
        }),
        batches: useInventoryBatchesQuery({
          product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
        }),
        allBatches: useAllInventoryBatchesQuery(),
        balances: useInventoryBalancesQuery({
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
        }),
        allBalances: useAllInventoryBalancesQuery({
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
        }),
        summary: useInventorySummaryQuery({
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
          product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
        }),
        transactions: useInventoryTransactionsQuery({
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
        }),
        allTransactions: useAllInventoryTransactionsQuery({
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
        }),
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(liveHooks.current.locations.isSuccess).toBe(true);
      expect(liveHooks.current.allLocations.isSuccess).toBe(true);
      expect(liveHooks.current.batches.isSuccess).toBe(true);
      expect(liveHooks.current.allBatches.isSuccess).toBe(true);
      expect(liveHooks.current.balances.isSuccess).toBe(true);
      expect(liveHooks.current.allBalances.isSuccess).toBe(true);
      expect(liveHooks.current.summary.isSuccess).toBe(true);
      expect(liveHooks.current.transactions.isSuccess).toBe(true);
      expect(liveHooks.current.allTransactions.isSuccess).toBe(true);
    });

    expect(liveHooks.current.locations.data?.items).toHaveLength(4);
    expect(liveHooks.current.allLocations.data).toHaveLength(5);
    expect(liveHooks.current.batches.data?.items).toHaveLength(3);
    expect(liveHooks.current.allBatches.data).toHaveLength(5);
    expect(liveHooks.current.balances.data?.items).toHaveLength(5);
    expect(liveHooks.current.allBalances.data).toHaveLength(5);
    expect(liveHooks.current.summary.data?.total_on_hand_qty_base).toBe(400);
    expect(liveHooks.current.summary.data?.total_available_qty_base).toBe(350);
    expect(liveHooks.current.transactions.data?.items).toHaveLength(2);
    expect(liveHooks.current.allTransactions.data).toHaveLength(2);
  });
});

describe('useInventoryMutations hooks', () => {
  it('stabilizes Idempotency-Key across retries and re-renders, rotates on payload change, clears on success, and invalidates Stage 1 inventoryKeys', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const keysByOp: {
      createLoc: Array<string | null>;
      patchLoc: Array<string | null>;
      createAdj: Array<string | null>;
    } = {
      createLoc: [],
      patchLoc: [],
      createAdj: [],
    };

    const failOnce: Record<keyof typeof keysByOp, boolean> = {
      createLoc: true,
      patchLoc: true,
      createAdj: true,
    };

    function serverFailure(message: string) {
      return HttpResponse.json(
        {
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message,
            details: [],
            trace_id: 'tr-500',
          },
        },
        { status: 500 }
      );
    }

    server.use(
      http.post('*/api/v1/inventory/locations', ({ request }) => {
        keysByOp.createLoc.push(request.headers.get('Idempotency-Key'));
        if (failOnce.createLoc) {
          failOnce.createLoc = false;
          return serverFailure('Temporary create location failure');
        }
        return HttpResponse.json(INITIAL_LOCATIONS[0], { status: 201 });
      }),
      http.patch('*/api/v1/inventory/locations/:id', ({ request }) => {
        keysByOp.patchLoc.push(request.headers.get('Idempotency-Key'));
        if (failOnce.patchLoc) {
          failOnce.patchLoc = false;
          return serverFailure('Temporary patch location failure');
        }
        return HttpResponse.json(INITIAL_LOCATIONS[0], { status: 200 });
      }),
      http.post('*/api/v1/inventory/adjustments', ({ request }) => {
        keysByOp.createAdj.push(request.headers.get('Idempotency-Key'));
        if (failOnce.createAdj) {
          failOnce.createAdj = false;
          return serverFailure('Temporary post adjustment failure');
        }
        const savedTxn: InventoryTxn = INITIAL_TRANSACTIONS[0] ?? {
          inventory_txn_id: MOCK_TRANSACTION_IDS.DOWNTOWN_ADJUSTMENT_IN,
          organization_id: ORGANIZATION_ID,
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
          transaction_no: 'TXN-2026-000002',
          transaction_type: 'ADJUSTMENT_IN',
          status: 'POSTED',
          reason_code: 'CYCLE_COUNT_SURPLUS',
          note: null,
          idempotency_key: 'idemp-1',
          created_by_employee_id: MOCK_EMPLOYEE_IDS.EMP_001,
          reverses_inventory_txn_id: null,
          posted_at: '2026-11-25T10:30:00+00:00',
          lines: [],
        };
        return HttpResponse.json(savedTxn, { status: 201 });
      })
    );

    // 1. Create Location + verify key stability across rerender()
    const { result: createLocHook, rerender: rerenderCreateLoc } = renderHook(
      () => useCreateInventoryLocationMutation(),
      { wrapper }
    );
    const locPayload: CreateInventoryLocationRequest = {
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      location_code: 'DT-COLD-01',
      name: 'Downtown Cold Chain Fridge',
      location_type: 'SELLABLE',
      is_sellable: true,
    };

    await act(async () => {
      await expect(
        createLocHook.current.mutateAsync({ payload: locPayload })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    rerenderCreateLoc();
    await act(async () => {
      await createLocHook.current.mutateAsync({ payload: { ...locPayload } });
    });
    await act(async () => {
      await createLocHook.current.mutateAsync({ payload: locPayload });
    });

    expect(keysByOp.createLoc).toHaveLength(3);
    expect(keysByOp.createLoc[0]).toBe(keysByOp.createLoc[1]);
    expect(keysByOp.createLoc[2]).not.toBe(keysByOp.createLoc[1]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.locationLists(),
    });

    // 2. Patch Location + rotate after failure when payload changes
    invalidateSpy.mockClear();
    const { result: patchLocHook } = renderHook(
      () => usePatchInventoryLocationMutation(),
      { wrapper }
    );
    await act(async () => {
      await expect(
        patchLocHook.current.mutateAsync({
          locationId: MOCK_LOCATION_IDS.MAIN_SELLABLE,
          payload: { name: 'Main Shelf A' },
        })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await patchLocHook.current.mutateAsync({
        locationId: MOCK_LOCATION_IDS.MAIN_SELLABLE,
        payload: { name: 'Main Shelf B' },
      });
    });

    expect(keysByOp.patchLoc).toHaveLength(2);
    expect(keysByOp.patchLoc[1]).not.toBe(keysByOp.patchLoc[0]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.locationLists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.balanceLists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.summaries(),
    });

    // 3. Create Adjustment + invalidates balanceLists, batchLists, summaries, transactionLists
    invalidateSpy.mockClear();
    const { result: createAdjHook, rerender: rerenderCreateAdj } = renderHook(
      () => useCreateInventoryAdjustmentMutation(),
      { wrapper }
    );
    const adjPayload: CreateInventoryAdjustmentRequest = {
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      transaction_type: 'ADJUSTMENT_IN',
      reason_code: 'CYCLE_COUNT',
      note: null,
      reverses_inventory_txn_id: null,
      lines: [
        {
          product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
          product_uom_id: MOCK_PRODUCT_UOM_IDS.AUGMENTIN_TAB,
          location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
          batch_number: 'MEDCARE-LOT-2601',
          manufactured_on: null,
          expires_on: null,
          entered_qty: 10,
          unit_cost_entered: 7.2,
        },
      ],
    };

    await act(async () => {
      await expect(
        createAdjHook.current.mutateAsync({ payload: adjPayload })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    rerenderCreateAdj();
    await act(async () => {
      await createAdjHook.current.mutateAsync({ payload: adjPayload });
    });

    expect(keysByOp.createAdj).toHaveLength(2);
    expect(keysByOp.createAdj[0]).toBe(keysByOp.createAdj[1]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.balanceLists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.batchLists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.summaries(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.transactionLists(),
    });
  });

  it('executes OPENING_BALANCE, ADJUSTMENT_OUT 409 OUT_OF_STOCK, REVERSAL, live summary/balance invalidation, and idempotency replay/mismatch via useCreateInventoryAdjustmentMutation', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);

    const { result } = renderHook(
      () => ({
        balances: useInventoryBalancesQuery({
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
          location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
          batch_id: MOCK_BATCH_IDS.MEDCARE_LOT_2601,
        }),
        summary: useInventorySummaryQuery({
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
          product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
        }),
        transactions: useInventoryTransactionsQuery({
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
        }),
        createAdj: useCreateInventoryAdjustmentMutation(),
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.balances.isSuccess).toBe(true);
      expect(result.current.summary.isSuccess).toBe(true);
      expect(result.current.transactions.isSuccess).toBe(true);
    });
    expect(result.current.balances.data?.items[0]?.on_hand_qty_base).toBe(280);
    expect(result.current.summary.data?.total_on_hand_qty_base).toBe(400);

    // 1. OPENING_BALANCE on new Augmentin batch via mutation hook
    await act(async () => {
      const openingRes = await result.current.createAdj.mutateAsync({
        payload: {
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
          transaction_type: 'OPENING_BALANCE',
          reason_code: 'INITIAL_BACKROOM_LOT',
          note: null,
          reverses_inventory_txn_id: null,
          lines: [
            {
              product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
              product_uom_id: MOCK_PRODUCT_UOM_IDS.AUGMENTIN_STRIP,
              location_id: MOCK_LOCATION_IDS.QUAR_01,
              batch_number: 'MEDCARE-LOT-2603',
              manufactured_on: '2026-08-01',
              expires_on: '2028-08-01',
              entered_qty: 10,
              unit_cost_entered: 49,
            },
          ],
        },
      });
      expect(openingRes.transaction_type).toBe('OPENING_BALANCE');
      expect(openingRes.lines[0]?.quantity_delta_base).toBe(70);
      expect(openingRes.lines[0]?.unit_cost_base).toBe(7);
    });

    await waitFor(() => {
      expect(result.current.summary.data?.total_on_hand_qty_base).toBe(470);
    });

    // 2. ADJUSTMENT_OUT 409 OUT_OF_STOCK via mutation hook
    await act(async () => {
      await expect(
        result.current.createAdj.mutateAsync({
          payload: {
            branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
            transaction_type: 'ADJUSTMENT_OUT',
            reason_code: 'EXCESS_SHRINK',
            note: null,
            reverses_inventory_txn_id: null,
            lines: [
              {
                product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
                product_uom_id: MOCK_PRODUCT_UOM_IDS.AUGMENTIN_TAB,
                location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
                batch_number: 'MEDCARE-LOT-2601',
                manufactured_on: null,
                expires_on: null,
                entered_qty: 500,
                unit_cost_entered: null,
              },
            ],
          },
        })
      ).rejects.toMatchObject({ status: 409, code: 'OUT_OF_STOCK' });
    });

    // 3. Idempotency replay & 409 IDEMPOTENCY_MISMATCH on ADJUSTMENT_IN
    const replayPayload: CreateInventoryAdjustmentRequest = {
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      transaction_type: 'ADJUSTMENT_IN',
      reason_code: 'RECOUNT_PLUS',
      note: null,
      reverses_inventory_txn_id: null,
      lines: [
        {
          product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
          product_uom_id: MOCK_PRODUCT_UOM_IDS.AUGMENTIN_TAB,
          location_id: MOCK_LOCATION_IDS.MAIN_SELLABLE,
          batch_number: 'MEDCARE-LOT-2601',
          manufactured_on: null,
          expires_on: null,
          entered_qty: 20,
          unit_cost_entered: 7.2,
        },
      ],
    };

    const explicitKey = 'inventory-replay-key-stage1-001';
    await act(async () => {
      await result.current.createAdj.mutateAsync({
        payload: replayPayload,
        idempotencyKey: explicitKey,
      });
    });

    // Replaying exact same key + payload must NOT double-add stock
    await act(async () => {
      await result.current.createAdj.mutateAsync({
        payload: replayPayload,
        idempotencyKey: explicitKey,
      });
    });

    await waitFor(() => {
      expect(result.current.balances.data?.items[0]?.on_hand_qty_base).toBe(
        300
      );
    });

    await act(async () => {
      await expect(
        result.current.createAdj.mutateAsync({
          payload: { ...replayPayload, reason_code: 'CHANGED_REASON' },
          idempotencyKey: explicitKey,
        })
      ).rejects.toMatchObject({
        status: 409,
        code: 'IDEMPOTENCY_MISMATCH',
      });
    });

    // 4. REVERSAL via mutation hook
    await act(async () => {
      const reversed = await result.current.createAdj.mutateAsync({
        payload: {
          branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
          transaction_type: 'REVERSAL',
          reason_code: 'AUDIT_CORRECTION',
          note: 'Reverse seeded surplus adjustment',
          reverses_inventory_txn_id:
            MOCK_TRANSACTION_IDS.DOWNTOWN_ADJUSTMENT_IN,
          lines: null,
        },
      });
      expect(reversed.transaction_type).toBe('REVERSAL');
      expect(reversed.reverses_inventory_txn_id).toBe(
        MOCK_TRANSACTION_IDS.DOWNTOWN_ADJUSTMENT_IN
      );
    });

    await waitFor(() => {
      expect(result.current.transactions.data?.total_count).toBe(5);
    });
  });
});
