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
import productFixture from '@contracts/fixtures/product.json';
import { ApiClientError, apiClient } from '../../../lib/api/client';
import {
  INITIAL_INVENTORY_BALANCES,
  INITIAL_INVENTORY_BATCHES,
  INITIAL_INVENTORY_LOCATIONS,
  INITIAL_INVENTORY_TXNS,
  inventoryHandlers,
  resetMockInventory,
} from '../../../mocks/inventoryHandlers';
import type { InventoryLocationDto, InventoryTxnDto } from '../../../types/api';
import {
  cancelInventoryAdjustment,
  createInventoryLocation,
  getInventoryLocation,
  getInventoryTransaction,
  listInventoryBalances,
  listInventoryBatches,
  listInventoryLocations,
  listInventoryTransactions,
  patchInventoryAdjustment,
  patchInventoryLocation,
  postInventoryAdjustment,
  postInventoryAdjustmentById,
} from '../api/inventoryApi';
import { inventoryKeys } from './inventoryKeys';
import {
  useCancelInventoryAdjustmentMutation,
  useCreateInventoryLocationMutation,
  usePatchInventoryAdjustmentMutation,
  usePatchInventoryLocationMutation,
  usePostInventoryAdjustmentByIdMutation,
  usePostInventoryAdjustmentMutation,
} from './useInventoryMutations';
import {
  useInventoryBalancesQuery,
  useInventoryBatchesQuery,
  useInventoryLocationQuery,
  useInventoryLocationsQuery,
  useInventoryTransactionQuery,
  useInventoryTransactionsQuery,
} from './useInventoryQueries';

const CAIRO_BRANCH_ID = inventoryBalanceFixture.branch_id;
const ALEX_BRANCH_ID = 'e5f6a7b8-4444-4d55-9e66-ccddeeff0011';
const AUGMENTIN_ID = inventoryBalanceFixture.product_id;
const AUGMENTIN_BOX_UOM_ID = 'c1d2e3f4-1111-4aaa-8a1b-111111110002';
const AUGMENTIN_BASE_UOM_ID = 'c1d2e3f4-1111-4aaa-8a1b-111111110001';
const CAIRO_MAIN_SELL_ID = inventoryBalanceFixture.location_id;
const AUGMENTIN_BATCH_A_ID = inventoryBalanceFixture.batch_id;
const AUGMENTIN_BATCH_B_ID = '3a42d0e5-8080-4b2f-8d4a-3c4d5e6f8a17';
const DRAFT_TXN_ID = '7d9503b8-1001-4ca5-8a0b-cd4040620003';
const POSTED_SURPLUS_TXN_ID = '7d9503b8-1001-4ca5-8a0b-cd4040620002';

const server = setupServer(...inventoryHandlers);

let activeQueryClient: QueryClient | null = null;

function createTestQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
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

beforeAll(() => server.listen());
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

describe('inventoryApi and inventoryHandlers integration', () => {
  it('omits blank optional params and encodes path segments across inventory endpoints', async () => {
    const requestedUrls: string[] = [];
    server.use(
      http.get('*/api/v1/inventory/locations', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
      http.get('*/api/v1/inventory/locations/:locationId', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json(INITIAL_INVENTORY_LOCATIONS[0]);
      }),
      http.get('*/api/v1/inventory/batches', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
      http.get('*/api/v1/inventory/balances', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
      http.get('*/api/v1/inventory/transactions', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
      http.get('*/api/v1/inventory/transactions/:txnId', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json(INITIAL_INVENTORY_TXNS[0]);
      })
    );

    await listInventoryLocations({
      branchId: ` ${CAIRO_BRANCH_ID} `,
      cursor: '   ',
      limit: 10,
      includeInactive: false,
    });
    await getInventoryLocation(' loc/1 ');
    await listInventoryBatches({
      branchId: CAIRO_BRANCH_ID,
      cursor: '  ',
      productId: '   ',
    });
    await listInventoryBalances({
      branchId: CAIRO_BRANCH_ID,
      productId: ' ',
      locationId: '',
      batchId: ' ',
    });
    await listInventoryTransactions({
      branchId: CAIRO_BRANCH_ID,
      from: '  ',
      to: '',
      productId: '  ',
    });
    await getInventoryTransaction(' txn/1 ');

    expect(requestedUrls).toHaveLength(6);

    const locUrl = new URL(requestedUrls[0] ?? '');
    expect(locUrl.searchParams.get('branchId')).toBe(CAIRO_BRANCH_ID);
    expect(locUrl.searchParams.has('cursor')).toBe(false);
    expect(locUrl.searchParams.get('limit')).toBe('10');

    expect(new URL(requestedUrls[1] ?? '').pathname).toBe(
      '/api/v1/inventory/locations/loc%2F1'
    );

    const batchUrl = new URL(requestedUrls[2] ?? '');
    expect(batchUrl.searchParams.has('productId')).toBe(false);

    const balUrl = new URL(requestedUrls[3] ?? '');
    expect(balUrl.searchParams.has('locationId')).toBe(false);
    expect(balUrl.searchParams.has('batchId')).toBe(false);

    const txnListUrl = new URL(requestedUrls[4] ?? '');
    expect(txnListUrl.searchParams.has('from')).toBe(false);
    expect(txnListUrl.searchParams.has('to')).toBe(false);

    expect(new URL(requestedUrls[5] ?? '').pathname).toBe(
      '/api/v1/inventory/transactions/txn%2F1'
    );
  });

  it('enforces branchId required, manages locations, and updates balance availability when location type changes', async () => {
    await expect(
      listInventoryLocations({ branchId: '   ' })
    ).rejects.toMatchObject({ status: 400, code: 'MALFORMED_REQUEST' });

    const cairoActive = await listInventoryLocations({
      branchId: CAIRO_BRANCH_ID,
    });
    expect(cairoActive.items).toHaveLength(3);
    expect(cairoActive.items.every((loc) => loc.is_active)).toBe(true);

    const cairoAll = await listInventoryLocations({
      branchId: CAIRO_BRANCH_ID,
      includeInactive: true,
    });
    expect(cairoAll.items).toHaveLength(4);
    expect(
      cairoAll.items.some((loc) => loc.location_code === 'CAI-SELL-OLD')
    ).toBe(true);

    const alexSellable = await listInventoryLocations({
      branchId: ALEX_BRANCH_ID,
      locationType: 'SELLABLE',
    });
    expect(alexSellable.items).toHaveLength(1);
    expect(alexSellable.items[0]?.location_code).toBe('ALX-SELL');

    const createdLoc = await createInventoryLocation({
      branch_id: CAIRO_BRANCH_ID,
      location_code: 'CAI-COLD-01',
      name: 'Cairo Cold Storage',
      location_type: 'QUARANTINE',
      is_active: true,
    });
    expect(createdLoc.is_sellable).toBe(false);

    await expect(
      createInventoryLocation({
        branch_id: CAIRO_BRANCH_ID,
        location_code: 'main-sell',
        name: 'Duplicate',
        location_type: 'SELLABLE',
        is_active: true,
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: expect.arrayContaining([
        expect.objectContaining({ field: 'location_code' }),
      ]),
    });

    // Patching MAIN-SELL to QUARANTINE turns derived available_qty_base to 0.0000 while keeping location_code immutable
    const rawPatched = await apiClient.patch<InventoryLocationDto>(
      `/inventory/locations/${CAIRO_MAIN_SELL_ID}`,
      {
        location_code: 'HACKED-CODE',
        location_type: 'QUARANTINE',
      }
    );
    expect(rawPatched.data.location_code).toBe('MAIN-SELL');
    expect(rawPatched.data.is_sellable).toBe(false);

    const balancesAfterQuarantine = await listInventoryBalances({
      branchId: CAIRO_BRANCH_ID,
      locationId: CAIRO_MAIN_SELL_ID,
    });
    expect(
      balancesAfterQuarantine.items.every(
        (b) => b.available_qty_base === '0.0000'
      )
    ).toBe(true);

    const fetchedLoc = await getInventoryLocation(CAIRO_MAIN_SELL_ID);
    expect(fetchedLoc.location_type).toBe('QUARANTINE');

    const restoredLoc = await patchInventoryLocation(CAIRO_MAIN_SELL_ID, {
      name: 'Main Pharmacy Shelf (Restored)',
      location_type: 'SELLABLE',
      is_active: true,
    });
    expect(restoredLoc.is_sellable).toBe(true);
    expect(restoredLoc.name).toBe('Main Pharmacy Shelf (Restored)');
  });

  it('serves batches and balances with strict derived availability across lot and NON-LOT items', async () => {
    expect(INITIAL_INVENTORY_BATCHES.length).toBeGreaterThanOrEqual(5);
    expect(INITIAL_INVENTORY_BALANCES.length).toBeGreaterThanOrEqual(5);

    const augBatches = await listInventoryBatches({
      branchId: CAIRO_BRANCH_ID,
      productId: AUGMENTIN_ID,
    });
    expect(augBatches.items.map((b) => b.batch_number)).toEqual([
      'AUG-2026-A',
      'AUG-2027-B',
      'AUG-2026-Q',
      'AUG-2020-E',
    ]);

    const panadolBatches = await listInventoryBatches({
      branchId: CAIRO_BRANCH_ID,
      productId: productFixture.product_id,
    });
    expect(panadolBatches.items).toHaveLength(1);
    expect(panadolBatches.items[0]?.batch_number).toBe('NON-LOT');
    expect(panadolBatches.items[0]?.is_non_lot).toBe(true);
    expect(panadolBatches.items[0]?.expires_on).toBeNull();

    const cairoBalances = await listInventoryBalances({
      branchId: CAIRO_BRANCH_ID,
      productId: AUGMENTIN_ID,
    });
    const batchABal = cairoBalances.items.find(
      (b) => b.batch_id === AUGMENTIN_BATCH_A_ID
    );
    const batchQBal = cairoBalances.items.find(
      (b) => b.batch_id === '3a42d0e5-8080-4b2f-8d4a-3c4d5e6f8a18'
    );
    expect(batchABal?.on_hand_qty_base).toBe('5000.0000');
    expect(batchABal?.available_qty_base).toBe('5000.0000');
    expect(batchQBal?.on_hand_qty_base).toBe('280.0000');
    expect(batchQBal?.available_qty_base).toBe('0.0000');
  });

  it('enforces UOM conversion snapshots, BigInt weighted-avg balance updates, 409 OUT_OF_STOCK, DRAFT lifecycle, and REVERSAL', async () => {
    // 1. Post ADJUSTMENT_IN using Box of 14 UOM (2 boxes = 28 base units)
    const postedIn = await postInventoryAdjustment({
      transaction_type: 'ADJUSTMENT_IN',
      branch_id: CAIRO_BRANCH_ID,
      reason_code: 'FOUND_BOXES',
      note: 'Two unopened boxes found',
      reverses_inventory_txn_id: null,
      lines: [
        {
          product_id: AUGMENTIN_ID,
          location_id: CAIRO_MAIN_SELL_ID,
          batch_id: AUGMENTIN_BATCH_B_ID,
          product_uom_id: AUGMENTIN_BOX_UOM_ID,
          entered_qty: '2.0000',
          unit_cost_base: '1.5000',
        },
      ],
    });

    expect(postedIn.status).toBe('POSTED');
    expect(postedIn.lines[0]?.product_uom_id).toBe(AUGMENTIN_BASE_UOM_ID);
    expect(postedIn.lines[0]?.entered_qty).toBe('28.0000');
    expect(postedIn.lines[0]?.conversion_snapshot).toBe('1.000000');
    expect(postedIn.lines[0]?.quantity_delta_base).toBe('28.0000');

    // Old balance on AUG-2027-B was 1400.0000 @ 1.2500 -> + 28.0000 @ 1.5000 = 1428.0000 @ 1.2549
    const updatedBalances = await listInventoryBalances({
      branchId: CAIRO_BRANCH_ID,
      locationId: CAIRO_MAIN_SELL_ID,
      batchId: AUGMENTIN_BATCH_B_ID,
    });
    expect(updatedBalances.items[0]?.on_hand_qty_base).toBe('1428.0000');
    expect(updatedBalances.items[0]?.average_unit_cost).toBe('1.2549');

    // 2. Reject ADJUSTMENT_OUT exceeding on_hand_qty_base with 409 OUT_OF_STOCK
    await expect(
      postInventoryAdjustment({
        transaction_type: 'ADJUSTMENT_OUT',
        branch_id: CAIRO_BRANCH_ID,
        reason_code: 'SHRINKAGE',
        note: null,
        reverses_inventory_txn_id: null,
        lines: [
          {
            product_id: AUGMENTIN_ID,
            location_id: CAIRO_MAIN_SELL_ID,
            batch_id: AUGMENTIN_BATCH_B_ID,
            product_uom_id: AUGMENTIN_BASE_UOM_ID,
            entered_qty: '2000.0000',
          },
        ],
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'OUT_OF_STOCK',
      details: [{ field: 'lines[0].entered_qty', issue: expect.any(String) }],
    });

    // 3. Valid ADJUSTMENT_OUT subtracts stock
    const postedOut = await postInventoryAdjustment({
      transaction_type: 'ADJUSTMENT_OUT',
      branch_id: CAIRO_BRANCH_ID,
      reason_code: 'SAMPLE_DISPENSE',
      note: null,
      reverses_inventory_txn_id: null,
      lines: [
        {
          product_id: AUGMENTIN_ID,
          location_id: CAIRO_MAIN_SELL_ID,
          batch_id: AUGMENTIN_BATCH_B_ID,
          product_uom_id: AUGMENTIN_BOX_UOM_ID,
          entered_qty: '2.0000',
        },
      ],
    });
    expect(postedOut.lines[0]?.quantity_delta_base).toBe('-28.0000');
    expect(postedOut.lines[0]?.unit_cost_base).toBe('1.2549');

    const afterOutBalances = await listInventoryBalances({
      branchId: CAIRO_BRANCH_ID,
      locationId: CAIRO_MAIN_SELL_ID,
      batchId: AUGMENTIN_BATCH_B_ID,
    });
    expect(afterOutBalances.items[0]?.on_hand_qty_base).toBe('1400.0000');

    // 4. Draft PATCH then POST by ID, then POSTED immutability (409)
    const patchedDraft = await patchInventoryAdjustment(DRAFT_TXN_ID, {
      reason_code: 'RECOUNT_VERIFIED',
      note: 'Verified 1 box = 14 tabs',
      lines: [
        {
          product_id: AUGMENTIN_ID,
          location_id: CAIRO_MAIN_SELL_ID,
          batch_id: AUGMENTIN_BATCH_B_ID,
          product_uom_id: AUGMENTIN_BOX_UOM_ID,
          entered_qty: '1.0000',
          unit_cost_base: '1.2549',
        },
      ],
    });
    expect(patchedDraft.status).toBe('DRAFT');
    expect(patchedDraft.lines[0]?.entered_qty).toBe('14.0000');

    const postedDraft = await postInventoryAdjustmentById(DRAFT_TXN_ID);
    expect(postedDraft.status).toBe('POSTED');
    expect(postedDraft.posted_at).not.toBeNull();

    await expect(
      patchInventoryAdjustment(DRAFT_TXN_ID, { reason_code: 'ILLEGAL' })
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
    await expect(
      postInventoryAdjustmentById(DRAFT_TXN_ID)
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
    await expect(cancelInventoryAdjustment(DRAFT_TXN_ID)).rejects.toMatchObject(
      { status: 409, code: 'CONFLICT' }
    );

    // 5. Reversal of POSTED transaction negates lines and stays unique
    const reversal = await postInventoryAdjustment({
      transaction_type: 'REVERSAL',
      branch_id: CAIRO_BRANCH_ID,
      reason_code: 'CORRECTION',
      note: 'Reversing posted surplus',
      reverses_inventory_txn_id: POSTED_SURPLUS_TXN_ID,
      lines: [
        {
          product_id: productFixture.product_id,
          location_id: CAIRO_MAIN_SELL_ID,
          batch_id: '4b53e1f6-9090-4c3f-9e5b-4d5e6f7a8b01',
          product_uom_id: 'f1a2b3c4-0101-4fff-8a1b-56789012abcd',
          entered_qty: '200.0000',
        },
      ],
    });
    expect(reversal.status).toBe('POSTED');
    expect(reversal.lines[0]?.quantity_delta_base).toBe('-200.0000');

    await expect(
      postInventoryAdjustment({
        transaction_type: 'REVERSAL',
        branch_id: CAIRO_BRANCH_ID,
        reason_code: 'DOUBLE_REVERSAL',
        note: null,
        reverses_inventory_txn_id: POSTED_SURPLUS_TXN_ID,
        lines: [
          {
            product_id: productFixture.product_id,
            location_id: CAIRO_MAIN_SELL_ID,
            batch_id: '4b53e1f6-9090-4c3f-9e5b-4d5e6f7a8b01',
            product_uom_id: 'f1a2b3c4-0101-4fff-8a1b-56789012abcd',
            entered_qty: '200.0000',
          },
        ],
      })
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });

    const fetchedTxn = await getInventoryTransaction(reversal.inventory_txn_id);
    expect(fetchedTxn.reverses_inventory_txn_id).toBe(POSTED_SURPLUS_TXN_ID);

    const filteredTxns = await listInventoryTransactions({
      branchId: CAIRO_BRANCH_ID,
      transactionType: 'REVERSAL',
      from: '2026-01-01T00:00:00Z',
    });
    expect(filteredTxns.items).toHaveLength(1);
  });

  it('cancels an unposted DRAFT via POST /inventory/adjustments/:txnId/cancel (204)', async () => {
    await cancelInventoryAdjustment(DRAFT_TXN_ID);
    const cancelled = await getInventoryTransaction(DRAFT_TXN_ID);
    expect(cancelled.status).toBe('CANCELLED');
  });
});

describe('useInventoryQueries hooks', () => {
  it('guards blank/null/undefined branchId and detail IDs via enabled and fetches when valid', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);

    const { result: idleHooks } = renderHook(
      () => ({
        locsBlank: useInventoryLocationsQuery({ branchId: '   ' }),
        locsNull: useInventoryLocationsQuery({ branchId: null }),
        locDetailUndef: useInventoryLocationQuery(undefined),
        batchesUndef: useInventoryBatchesQuery({ branchId: undefined }),
        balancesBlank: useInventoryBalancesQuery({ branchId: '' }),
        txnsDisabled: useInventoryTransactionsQuery(
          { branchId: CAIRO_BRANCH_ID },
          { enabled: false }
        ),
        txnDetailBlank: useInventoryTransactionQuery('  '),
      }),
      { wrapper }
    );

    expect(idleHooks.current.locsBlank.fetchStatus).toBe('idle');
    expect(idleHooks.current.locsNull.fetchStatus).toBe('idle');
    expect(idleHooks.current.locDetailUndef.fetchStatus).toBe('idle');
    expect(idleHooks.current.batchesUndef.fetchStatus).toBe('idle');
    expect(idleHooks.current.balancesBlank.fetchStatus).toBe('idle');
    expect(idleHooks.current.txnsDisabled.fetchStatus).toBe('idle');
    expect(idleHooks.current.txnDetailBlank.fetchStatus).toBe('idle');

    const { result: liveHooks } = renderHook(
      () => ({
        locations: useInventoryLocationsQuery({
          branchId: ` ${CAIRO_BRANCH_ID} `,
        }),
        location: useInventoryLocationQuery(CAIRO_MAIN_SELL_ID),
        batches: useInventoryBatchesQuery({ branchId: CAIRO_BRANCH_ID }),
        balances: useInventoryBalancesQuery({ branchId: CAIRO_BRANCH_ID }),
        transactions: useInventoryTransactionsQuery({
          branchId: CAIRO_BRANCH_ID,
        }),
        transaction: useInventoryTransactionQuery(POSTED_SURPLUS_TXN_ID),
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(liveHooks.current.locations.isSuccess).toBe(true);
      expect(liveHooks.current.location.isSuccess).toBe(true);
      expect(liveHooks.current.batches.isSuccess).toBe(true);
      expect(liveHooks.current.balances.isSuccess).toBe(true);
      expect(liveHooks.current.transactions.isSuccess).toBe(true);
      expect(liveHooks.current.transaction.isSuccess).toBe(true);
    });

    expect(liveHooks.current.locations.data?.items).toHaveLength(3);
    expect(liveHooks.current.location.data?.location_code).toBe('MAIN-SELL');
    expect(liveHooks.current.batches.data?.items.length).toBeGreaterThanOrEqual(
      5
    );
    expect(liveHooks.current.balances.data?.items).toHaveLength(5);
    expect(liveHooks.current.transactions.data?.items).toHaveLength(3);
    expect(liveHooks.current.transaction.data?.transaction_no).toBe(
      'TXN-2026-000002'
    );
  });
});

describe('useInventoryMutations hooks', () => {
  it('stabilizes Idempotency-Key across retries and re-renders, rotates on change, clears on success, and invalidates inventoryKeys', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const keysByOp: {
      createLoc: Array<string | null>;
      patchLoc: Array<string | null>;
      postAdj: Array<string | null>;
      patchAdj: Array<string | null>;
      postAdjById: Array<string | null>;
      cancelAdj: Array<string | null>;
    } = {
      createLoc: [],
      patchLoc: [],
      postAdj: [],
      patchAdj: [],
      postAdjById: [],
      cancelAdj: [],
    };

    const failOnce: Record<keyof typeof keysByOp, boolean> = {
      createLoc: true,
      patchLoc: true,
      postAdj: true,
      patchAdj: true,
      postAdjById: true,
      cancelAdj: true,
    };

    function serverFailure(message: string) {
      return HttpResponse.json(
        { error: { code: 'INTERNAL_ERROR', message } },
        { status: 500 }
      );
    }

    server.use(
      http.post('*/api/v1/inventory/locations', ({ request }) => {
        keysByOp.createLoc.push(request.headers.get('Idempotency-Key'));
        if (failOnce.createLoc) {
          failOnce.createLoc = false;
          return serverFailure('Temp create location failure');
        }
        return HttpResponse.json(INITIAL_INVENTORY_LOCATIONS[0], {
          status: 201,
        });
      }),
      http.patch('*/api/v1/inventory/locations/:locationId', ({ request }) => {
        keysByOp.patchLoc.push(request.headers.get('Idempotency-Key'));
        if (failOnce.patchLoc) {
          failOnce.patchLoc = false;
          return serverFailure('Temp patch location failure');
        }
        return HttpResponse.json(INITIAL_INVENTORY_LOCATIONS[0], {
          status: 200,
        });
      }),
      http.post('*/api/v1/inventory/adjustments', ({ request }) => {
        keysByOp.postAdj.push(request.headers.get('Idempotency-Key'));
        if (failOnce.postAdj) {
          failOnce.postAdj = false;
          return serverFailure('Temp post adjustment failure');
        }
        return HttpResponse.json(INITIAL_INVENTORY_TXNS[1], { status: 201 });
      }),
      http.patch('*/api/v1/inventory/adjustments/:txnId', ({ request }) => {
        keysByOp.patchAdj.push(request.headers.get('Idempotency-Key'));
        if (failOnce.patchAdj) {
          failOnce.patchAdj = false;
          return serverFailure('Temp patch adjustment failure');
        }
        return HttpResponse.json(INITIAL_INVENTORY_TXNS[0], { status: 200 });
      }),
      http.post('*/api/v1/inventory/adjustments/:txnId', ({ request }) => {
        keysByOp.postAdjById.push(request.headers.get('Idempotency-Key'));
        if (failOnce.postAdjById) {
          failOnce.postAdjById = false;
          return serverFailure('Temp post draft failure');
        }
        const postedTxn: InventoryTxnDto = {
          ...INITIAL_INVENTORY_TXNS[0],
          status: 'POSTED',
        };
        return HttpResponse.json(postedTxn, { status: 201 });
      }),
      http.post(
        '*/api/v1/inventory/adjustments/:txnId/cancel',
        ({ request }) => {
          keysByOp.cancelAdj.push(request.headers.get('Idempotency-Key'));
          if (failOnce.cancelAdj) {
            failOnce.cancelAdj = false;
            return serverFailure('Temp cancel draft failure');
          }
          return new HttpResponse(null, { status: 204 });
        }
      )
    );

    // 1. Create Location + verify key stability across rerender()
    const { result: createLocHook, rerender: rerenderCreateLoc } = renderHook(
      () => useCreateInventoryLocationMutation(),
      { wrapper }
    );
    const locPayload = {
      branch_id: CAIRO_BRANCH_ID,
      location_code: 'CAI-NEW-1',
      name: 'New Shelf',
      location_type: 'SELLABLE' as const,
      is_active: true,
    };

    await act(async () => {
      await expect(
        createLocHook.current.mutateAsync({ payload: locPayload })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    rerenderCreateLoc();
    await act(async () => {
      await createLocHook.current.mutateAsync({
        payload: { ...locPayload },
      });
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
          locationId: CAIRO_MAIN_SELL_ID,
          payload: { name: 'Shelf A' },
        })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await patchLocHook.current.mutateAsync({
        locationId: CAIRO_MAIN_SELL_ID,
        payload: { name: 'Shelf B' },
      });
    });
    expect(keysByOp.patchLoc).toHaveLength(2);
    expect(keysByOp.patchLoc[1]).not.toBe(keysByOp.patchLoc[0]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.locationLists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.locationDetail(CAIRO_MAIN_SELL_ID),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.balanceLists(),
    });

    // 3. Post Adjustment
    invalidateSpy.mockClear();
    const { result: postAdjHook, rerender: rerenderPostAdj } = renderHook(
      () => usePostInventoryAdjustmentMutation(),
      { wrapper }
    );
    const adjPayload = {
      transaction_type: 'ADJUSTMENT_IN' as const,
      branch_id: CAIRO_BRANCH_ID,
      reason_code: 'CYCLE_COUNT',
      note: null,
      reverses_inventory_txn_id: null,
      lines: [
        {
          product_id: AUGMENTIN_ID,
          location_id: CAIRO_MAIN_SELL_ID,
          batch_id: AUGMENTIN_BATCH_A_ID,
          product_uom_id: AUGMENTIN_BASE_UOM_ID,
          entered_qty: '10.0000',
          unit_cost_base: '1.2052',
        },
      ],
    };
    await act(async () => {
      await expect(
        postAdjHook.current.mutateAsync({ payload: adjPayload })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    rerenderPostAdj();
    await act(async () => {
      await postAdjHook.current.mutateAsync({ payload: adjPayload });
    });
    expect(keysByOp.postAdj).toHaveLength(2);
    expect(keysByOp.postAdj[0]).toBe(keysByOp.postAdj[1]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.transactionLists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.balanceLists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.batchLists(),
    });

    // 4. Patch Draft Adjustment
    invalidateSpy.mockClear();
    const { result: patchAdjHook } = renderHook(
      () => usePatchInventoryAdjustmentMutation(),
      { wrapper }
    );
    await act(async () => {
      await expect(
        patchAdjHook.current.mutateAsync({
          txnId: DRAFT_TXN_ID,
          payload: { reason_code: 'UPDATED' },
        })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await patchAdjHook.current.mutateAsync({
        txnId: DRAFT_TXN_ID,
        payload: { reason_code: 'UPDATED' },
      });
    });
    expect(keysByOp.patchAdj[0]).toBe(keysByOp.patchAdj[1]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.transactionLists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.transactionDetail(DRAFT_TXN_ID),
    });

    // 5. Post Draft Adjustment By ID
    invalidateSpy.mockClear();
    const { result: postDraftHook } = renderHook(
      () => usePostInventoryAdjustmentByIdMutation(),
      { wrapper }
    );
    await act(async () => {
      await expect(
        postDraftHook.current.mutateAsync({ txnId: DRAFT_TXN_ID })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await postDraftHook.current.mutateAsync({ txnId: DRAFT_TXN_ID });
    });
    expect(keysByOp.postAdjById[0]).toBe(keysByOp.postAdjById[1]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.balanceLists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.transactionDetail(DRAFT_TXN_ID),
    });

    // 6. Cancel Draft Adjustment
    invalidateSpy.mockClear();
    const { result: cancelDraftHook } = renderHook(
      () => useCancelInventoryAdjustmentMutation(),
      { wrapper }
    );
    await act(async () => {
      await expect(
        cancelDraftHook.current.mutateAsync({ txnId: DRAFT_TXN_ID })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await cancelDraftHook.current.mutateAsync({ txnId: DRAFT_TXN_ID });
    });
    expect(keysByOp.cancelAdj[0]).toBe(keysByOp.cancelAdj[1]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.transactionLists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: inventoryKeys.transactionDetail(DRAFT_TXN_ID),
    });
  });

  it('updates live balance projection queries after posting an adjustment and enforces MSW idempotency replay/mismatch', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);

    const { result } = renderHook(
      () => ({
        balances: useInventoryBalancesQuery({
          branchId: CAIRO_BRANCH_ID,
          locationId: CAIRO_MAIN_SELL_ID,
          batchId: AUGMENTIN_BATCH_A_ID,
        }),
        postAdj: usePostInventoryAdjustmentMutation(),
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.balances.isSuccess).toBe(true);
    });
    expect(result.current.balances.data?.items[0]?.on_hand_qty_base).toBe(
      '5000.0000'
    );

    const replayPayload = {
      transaction_type: 'ADJUSTMENT_IN' as const,
      branch_id: CAIRO_BRANCH_ID,
      reason_code: 'RECOUNT_PLUS',
      note: null,
      reverses_inventory_txn_id: null,
      lines: [
        {
          product_id: AUGMENTIN_ID,
          location_id: CAIRO_MAIN_SELL_ID,
          batch_id: AUGMENTIN_BATCH_A_ID,
          product_uom_id: AUGMENTIN_BASE_UOM_ID,
          entered_qty: '100.0000',
          unit_cost_base: '1.2052',
        },
      ],
    };

    const explicitKey = 'inventory-replay-key-1234567890';
    await act(async () => {
      await result.current.postAdj.mutateAsync({
        payload: replayPayload,
        idempotencyKey: explicitKey,
      });
    });

    // Replaying exact same key + payload must NOT double-add stock
    await act(async () => {
      await result.current.postAdj.mutateAsync({
        payload: replayPayload,
        idempotencyKey: explicitKey,
      });
    });

    await waitFor(() => {
      expect(result.current.balances.data?.items[0]?.on_hand_qty_base).toBe(
        '5100.0000'
      );
    });

    // Reusing same key with a different payload returns 409 IDEMPOTENCY_MISMATCH
    await act(async () => {
      await expect(
        result.current.postAdj.mutateAsync({
          payload: {
            ...replayPayload,
            reason_code: 'DIFFERENT_REASON',
          },
          idempotencyKey: explicitKey,
        })
      ).rejects.toMatchObject({
        status: 409,
        code: 'IDEMPOTENCY_MISMATCH',
      });
    });
  });
});
