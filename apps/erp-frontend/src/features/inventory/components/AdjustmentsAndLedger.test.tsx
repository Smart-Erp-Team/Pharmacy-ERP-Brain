/** @vitest-environment jsdom */
import { useState } from 'react';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import currentUserContext from '@contracts/fixtures/current-user-context.json';
import { resetMockBranches } from '../../../mocks/branchHandlers';
import { resetMockEmployees } from '../../../mocks/employeeHandlers';
import { handlers } from '../../../mocks/handlers';
import {
  MOCK_BRANCH_IDS,
  MOCK_LOCATION_IDS,
  MOCK_PRODUCT_IDS,
  MOCK_PRODUCT_UOM_IDS,
  MOCK_TRANSACTION_IDS,
  resetMockInventory,
} from '../../../mocks/inventoryHandlers';
import { resetMockCatalog } from '../../../mocks/productHandlers';
import { useAuthStore } from '../../../stores/authStore';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type {
  CurrentUser,
  InventoryTxn,
  PermissionScope,
  Role,
  RuntimeMode,
} from '../../../types/api';
import { LedgerHistoryTab } from './LedgerHistoryTab';
import { StockAdjustmentsTab } from './StockAdjustmentsTab';

const DOWNTOWN_BRANCH_ID = MOCK_BRANCH_IDS.DOWNTOWN;

const server = setupServer(...handlers);

interface SeedAuthOverrides {
  role?: Role;
  branch_scope?: 'ALL' | 'ASSIGNED';
  branch_ids?: string[];
  scopes?: PermissionScope[];
  runtime_mode?: RuntimeMode;
}

function buildAuthUser(overrides: SeedAuthOverrides = {}): CurrentUser {
  const role = overrides.role ?? 'Admin';
  const branch_scope = overrides.branch_scope ?? 'ALL';
  const branch_ids = overrides.branch_ids ?? [];
  const scopes: PermissionScope[] = overrides.scopes ?? [
    'user:admin',
    'inventory:read',
    'inventory:write',
    'sales:read',
    'sales:write',
  ];
  const runtime_mode = overrides.runtime_mode ?? 'BranchLocal';

  return {
    user_id: currentUserContext.user_id,
    employee_id: currentUserContext.employee_id,
    organization_id: currentUserContext.organization_id,
    username: currentUserContext.username,
    role,
    branch_scope,
    branch_ids,
    scopes,
    runtime_mode,
  };
}

function seedAuth(
  overrides: SeedAuthOverrides = {},
  activeBranchId: string | null = DOWNTOWN_BRANCH_ID
) {
  useAuthStore.setState({
    currentUser: buildAuthUser(overrides),
    organizationCode: 'MEDCARE',
    activeBranchId,
    isAuthenticated: true,
    isInitializing: false,
  });
}

function getInput(
  container: HTMLElement,
  label: RegExp | string
): HTMLInputElement {
  const el = within(container).getByLabelText(label);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`Expected HTMLInputElement for ${String(label)}`);
  }
  return el;
}

function getSelect(
  container: HTMLElement,
  label: RegExp | string
): HTMLSelectElement {
  const el = within(container).getByLabelText(label);
  if (!(el instanceof HTMLSelectElement)) {
    throw new Error(`Expected HTMLSelectElement for ${String(label)}`);
  }
  return el;
}

function getAdjustmentsFormSection(): HTMLElement {
  const heading = screen.getByRole('heading', {
    name: 'Stock Adjustments & Opening Balance',
  });
  const section = heading.closest('section');
  if (!section) {
    throw new Error('Expected Stock Adjustments & Opening Balance card');
  }
  return section;
}

function getLedgerSection(): HTMLElement {
  const heading = screen.getByRole('heading', {
    name: 'Inventory Ledger History',
  });
  const section = heading.closest('section');
  if (!section) {
    throw new Error('Expected Inventory Ledger History card');
  }
  return section;
}

function CombinedInventoryHarness({ branchId }: { branchId: string }) {
  const [activeView, setActiveView] = useState<'adjustments' | 'ledger'>(
    'ledger'
  );
  const [reversalTxn, setReversalTxn] = useState<InventoryTxn | null>(null);

  return (
    <div>
      <div role="tablist" aria-label="Test inventory views">
        <button type="button" onClick={() => setActiveView('adjustments')}>
          Adjustments View
        </button>
        <button type="button" onClick={() => setActiveView('ledger')}>
          Ledger View
        </button>
      </div>
      {activeView === 'adjustments' ? (
        <StockAdjustmentsTab
          branchId={branchId}
          initialReversalTxn={reversalTxn}
          onClearReversal={() => setReversalTxn(null)}
        />
      ) : (
        <LedgerHistoryTab
          branchId={branchId}
          onRequestReversal={(txn) => {
            setReversalTxn(txn);
            setActiveView('adjustments');
          }}
        />
      )}
    </div>
  );
}

beforeAll(() => server.listen());

beforeEach(() => {
  resetMockBranches();
  resetMockEmployees();
  resetMockCatalog();
  resetMockInventory();
  seedAuth();
});

afterEach(() => {
  server.resetHandlers();
  useAuthStore.setState({
    currentUser: null,
    organizationCode: null,
    activeBranchId: null,
    isAuthenticated: false,
    isInitializing: false,
  });
  cleanup();
  vi.restoreAllMocks();
});

afterAll(() => server.close());

describe('StockAdjustmentsTab and LedgerHistoryTab (Stage 1 MEDCARE)', () => {
  it('blocks Cashier on both tabs with Access restricted and zero network calls', async () => {
    seedAuth({
      role: 'Cashier',
      branch_scope: 'ASSIGNED',
      branch_ids: [DOWNTOWN_BRANCH_ID],
      scopes: ['inventory:read', 'sales:read', 'sales:write'],
      runtime_mode: 'BranchLocal',
    });

    const requestedUrls: string[] = [];
    const recordUrl = ({ request }: { request: Request }) => {
      requestedUrls.push(request.url);
    };
    server.events.on('request:start', recordUrl);

    try {
      renderWithProviders(
        <>
          <StockAdjustmentsTab branchId={DOWNTOWN_BRANCH_ID} />
          <LedgerHistoryTab branchId={DOWNTOWN_BRANCH_ID} />
        </>
      );

      expect(screen.getAllByText('Access restricted')).toHaveLength(2);
      await waitFor(() => {
        expect(requestedUrls).toEqual([]);
      });
    } finally {
      server.events.removeListener('request:start', recordUrl);
    }
  });

  it('shows BranchLocal notice and disables writes for Admin on Cloud while Ledger resolves Omar Khaled & Mona Adel and opens inline detail modal with zero GET /transactions/:id calls', async () => {
    const user = userEvent.setup();
    seedAuth({
      role: 'Admin',
      scopes: ['user:admin', 'inventory:read', 'inventory:write'],
      runtime_mode: 'Cloud',
    });

    const detailRequests: string[] = [];
    const recordUrl = ({ request }: { request: Request }) => {
      const pathname = new URL(request.url).pathname;
      if (/\/api\/v1\/inventory\/transactions\/[^/]+$/.test(pathname)) {
        detailRequests.push(request.url);
      }
    };
    server.events.on('request:start', recordUrl);

    try {
      renderWithProviders(
        <>
          <StockAdjustmentsTab branchId={DOWNTOWN_BRANCH_ID} />
          <LedgerHistoryTab branchId={DOWNTOWN_BRANCH_ID} />
        </>
      );

      expect(
        await screen.findByText(
          /Stock adjustments and opening balances must be posted on the BranchLocal runtime\./i
        )
      ).toBeDefined();
      expect(
        screen.queryByRole('button', { name: 'Submit adjustment' })
      ).toBeNull();
      expect(screen.queryByText('Draft adjustments')).toBeNull();

      const adjSection = getAdjustmentsFormSection();
      expect(
        (
          await within(adjSection).findByLabelText('Transaction type')
        ).hasAttribute('disabled')
      ).toBe(true);

      const ledgerSection = getLedgerSection();
      expect(
        await within(ledgerSection).findByText('TXN-2026-000002')
      ).toBeDefined();
      expect(within(ledgerSection).getByText('TXN-2026-000001')).toBeDefined();
      expect(await within(ledgerSection).findByText('Mona Adel')).toBeDefined();
      expect(within(ledgerSection).getByText('Omar Khaled')).toBeDefined();

      const postedRow = within(ledgerSection)
        .getByText('TXN-2026-000002')
        .closest('tr');
      if (!postedRow) {
        throw new Error('Expected posted ledger row');
      }
      await user.click(
        within(postedRow).getByRole('button', { name: 'View details' })
      );

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Immutable posted record')).toBeDefined();
      expect(within(dialog).getByText('MEDCARE-PAN-01')).toBeDefined();
      expect(within(dialog).getByText('+48')).toBeDefined();
      expect(within(dialog).getByText('+70')).toBeDefined();
      expect(
        within(dialog).queryByRole('button', { name: 'Reverse transaction' })
      ).toBeNull();
      expect(detailRequests).toEqual([]);
    } finally {
      server.events.removeListener('request:start', recordUrl);
    }
  });

  it('never calls GET /employees for Pharmacist on BranchLocal and falls back to Employee <uuid8>', async () => {
    const employeeRequests: string[] = [];
    server.use(
      http.get('*/api/v1/employees', ({ request }) => {
        employeeRequests.push(request.url);
        return HttpResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Forbidden',
              details: [],
              trace_id: 'trace-forbidden-emp',
            },
          },
          { status: 403 }
        );
      })
    );

    seedAuth({
      role: 'Pharmacist',
      branch_scope: 'ASSIGNED',
      branch_ids: [DOWNTOWN_BRANCH_ID],
      scopes: ['inventory:read', 'inventory:write', 'sales:read'],
      runtime_mode: 'BranchLocal',
    });

    renderWithProviders(<LedgerHistoryTab branchId={DOWNTOWN_BRANCH_ID} />);

    expect(await screen.findByText('TXN-2026-000002')).toBeDefined();
    expect(screen.getAllByText('Employee 11111111').length).toBeGreaterThan(0);
    expect(employeeRequests).toHaveLength(0);
  });

  it('posts atomic immediate OPENING_BALANCE (with non-lot Vitamin D3 + multi-line Box UOM) and ADJUSTMENT_IN on BranchLocal', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <StockAdjustmentsTab branchId={DOWNTOWN_BRANCH_ID} />
        <LedgerHistoryTab branchId={DOWNTOWN_BRANCH_ID} />
      </>
    );

    const adjSection = getAdjustmentsFormSection();
    const ledgerSection = getLedgerSection();
    await within(adjSection).findByLabelText('Adjustment line 1');

    const removeLine1 = within(adjSection).getByRole('button', {
      name: 'Remove line 1',
    });
    expect(removeLine1.hasAttribute('disabled')).toBe(true);

    // 1. Atomic OPENING_BALANCE with Line 1 = Vitamin D3 (non-lot) in QUAR-01 and Line 2 = Augmentin Box UOM
    await user.selectOptions(
      getSelect(adjSection, 'Transaction type'),
      'OPENING_BALANCE'
    );
    await user.type(getInput(adjSection, 'Reason code'), 'OPENING_AUDIT');

    const line1 = within(adjSection).getByRole('group', {
      name: 'Adjustment line 1',
    });
    await user.selectOptions(
      getSelect(line1, 'Product'),
      MOCK_PRODUCT_IDS.VITAMIN_D3
    );

    expect(getSelect(line1, 'Unit of measure').value).toBe(
      MOCK_PRODUCT_UOM_IDS.VITAMIN_D3_BOTTLE
    );
    expect(getInput(line1, 'Batch number').hasAttribute('disabled')).toBe(true);
    expect(getInput(line1, 'Expiry date').hasAttribute('disabled')).toBe(true);
    expect(
      within(line1).getByText('Non-lot product (automatic NON-LOT batch)')
    ).toBeDefined();

    await user.selectOptions(
      getSelect(line1, 'Location'),
      MOCK_LOCATION_IDS.QUAR_01
    );
    await user.type(getInput(line1, 'Quantity'), '25');
    await user.type(getInput(line1, 'Unit cost'), '64');

    // Add second line, test remove, then re-add
    await user.click(
      within(adjSection).getByRole('button', { name: 'Add line' })
    );
    expect(
      within(adjSection).getByRole('group', { name: 'Adjustment line 2' })
    ).toBeDefined();
    expect(removeLine1.hasAttribute('disabled')).toBe(false);

    await user.click(
      within(adjSection).getByRole('button', { name: 'Remove line 2' })
    );
    expect(
      within(adjSection).queryByRole('group', { name: 'Adjustment line 2' })
    ).toBeNull();

    await user.click(
      within(adjSection).getByRole('button', { name: 'Add line' })
    );
    const line2 = within(adjSection).getByRole('group', {
      name: 'Adjustment line 2',
    });
    await user.selectOptions(
      getSelect(line2, 'Product'),
      MOCK_PRODUCT_IDS.AUGMENTIN_1G
    );
    await user.selectOptions(
      getSelect(line2, 'Unit of measure'),
      MOCK_PRODUCT_UOM_IDS.AUGMENTIN_BOX
    );
    await user.selectOptions(
      getSelect(line2, 'Location'),
      MOCK_LOCATION_IDS.MAIN_SELLABLE
    );
    await user.type(getInput(line2, 'Batch number'), 'MEDCARE-LOT-2801');
    await user.type(getInput(line2, 'Manufactured date'), '2026-06-01');
    await user.type(getInput(line2, 'Expiry date'), '2028-05-31');
    await user.type(getInput(line2, 'Quantity'), '2');
    await user.type(getInput(line2, 'Unit cost'), '100.8');

    await user.click(
      within(adjSection).getByRole('button', { name: 'Submit adjustment' })
    );

    expect(
      await within(ledgerSection).findByText('TXN-2026-000004')
    ).toBeDefined();

    // 2. Atomic ADJUSTMENT_IN for Panadol Extra using Box of 24 UOM
    await user.selectOptions(
      getSelect(adjSection, 'Transaction type'),
      'ADJUSTMENT_IN'
    );
    await user.type(getInput(adjSection, 'Reason code'), 'CYCLE_SURPLUS');

    const nextLine1 = within(adjSection).getByRole('group', {
      name: 'Adjustment line 1',
    });
    await user.selectOptions(
      getSelect(nextLine1, 'Product'),
      MOCK_PRODUCT_IDS.PANADOL_EXTRA
    );
    await user.selectOptions(
      getSelect(nextLine1, 'Unit of measure'),
      MOCK_PRODUCT_UOM_IDS.PANADOL_BOX
    );
    await user.selectOptions(
      getSelect(nextLine1, 'Location'),
      MOCK_LOCATION_IDS.MAIN_SELLABLE
    );
    await user.type(getInput(nextLine1, 'Batch number'), 'MEDCARE-PAN-01');
    await user.type(getInput(nextLine1, 'Expiry date'), '2027-03-31');
    await user.type(getInput(nextLine1, 'Quantity'), '2');
    await user.type(getInput(nextLine1, 'Unit cost'), '36');

    await user.click(
      within(adjSection).getByRole('button', { name: 'Submit adjustment' })
    );

    expect(
      await within(ledgerSection).findByText('TXN-2026-000005')
    ).toBeDefined();
  }, 15_000);

  it('enforces client-side lot_tracking_required validation on ADJUSTMENT_IN before hitting the API and succeeds once batch_number and expires_on are provided', async () => {
    const user = userEvent.setup();
    const postAdjustmentCalls: string[] = [];
    const recordPost = ({ request }: { request: Request }) => {
      if (
        request.method.toUpperCase() === 'POST' &&
        new URL(request.url).pathname.endsWith('/api/v1/inventory/adjustments')
      ) {
        postAdjustmentCalls.push(request.url);
      }
    };
    server.events.on('request:start', recordPost);

    try {
      renderWithProviders(
        <>
          <StockAdjustmentsTab branchId={DOWNTOWN_BRANCH_ID} />
          <LedgerHistoryTab branchId={DOWNTOWN_BRANCH_ID} />
        </>
      );

      const adjSection = getAdjustmentsFormSection();
      const ledgerSection = getLedgerSection();
      const line1 = await within(adjSection).findByRole('group', {
        name: 'Adjustment line 1',
      });

      await user.type(getInput(adjSection, 'Reason code'), 'LOT_REQUIRED_TEST');
      await user.selectOptions(
        getSelect(line1, 'Product'),
        MOCK_PRODUCT_IDS.AUGMENTIN_1G
      );
      expect(
        within(line1).getByText(
          'Required for lot-tracked product (cannot be NON-LOT)'
        )
      ).toBeDefined();
      expect(
        within(line1).getByText('Required for lot-tracked product')
      ).toBeDefined();

      await user.selectOptions(
        getSelect(line1, 'Location'),
        MOCK_LOCATION_IDS.MAIN_SELLABLE
      );
      await user.type(getInput(line1, 'Quantity'), '10');
      await user.type(getInput(line1, 'Unit cost'), '7.2');

      // 1. Missing batch_number and expires_on fails client-side without hitting API
      await user.click(
        within(adjSection).getByRole('button', { name: 'Submit adjustment' })
      );
      expect(
        await within(line1).findByText(
          'Batch number is required for lot-tracked products'
        )
      ).toBeDefined();
      expect(
        within(line1).getByText(
          'Expiry date is required for lot-tracked products'
        )
      ).toBeDefined();
      expect(postAdjustmentCalls).toHaveLength(0);

      // 2. Reserved NON-LOT batch_number is also rejected client-side
      await user.type(getInput(line1, 'Batch number'), 'non-lot');
      await user.click(
        within(adjSection).getByRole('button', { name: 'Submit adjustment' })
      );
      expect(
        await within(line1).findByText(
          /NON-LOT is reserved and cannot be used for lot-tracked products/i
        )
      ).toBeDefined();
      expect(postAdjustmentCalls).toHaveLength(0);

      // 3. Providing valid batch_number and expires_on passes validation and posts
      const batchInput = getInput(line1, 'Batch number');
      await user.clear(batchInput);
      await user.type(batchInput, 'MEDCARE-LOT-2601');
      await user.type(getInput(line1, 'Expiry date'), '2027-07-31');

      await user.click(
        within(adjSection).getByRole('button', { name: 'Submit adjustment' })
      );

      expect(
        await within(ledgerSection).findByText('TXN-2026-000004')
      ).toBeDefined();
      expect(postAdjustmentCalls).toHaveLength(1);
    } finally {
      server.events.removeListener('request:start', recordPost);
    }
  }, 15_000);

  it('hides/clears unit_cost_entered on ADJUSTMENT_OUT and maps 409 OUT_OF_STOCK and 422 EXPIRY_POLICY_VIOLATION inline', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StockAdjustmentsTab branchId={DOWNTOWN_BRANCH_ID} />);

    const line1 = await screen.findByRole('group', {
      name: 'Adjustment line 1',
    });

    // 1. Test 422 EXPIRY_POLICY_VIOLATION when placing expired MEDCARE-LOT-EXP into sellable MAIN-SELLABLE
    await user.type(screen.getByLabelText('Reason code'), 'EXPIRED_CHECK');
    await user.selectOptions(
      getSelect(line1, 'Product'),
      MOCK_PRODUCT_IDS.AUGMENTIN_1G
    );
    await user.selectOptions(
      getSelect(line1, 'Location'),
      MOCK_LOCATION_IDS.MAIN_SELLABLE
    );
    await user.type(getInput(line1, 'Batch number'), 'MEDCARE-LOT-EXP');
    await user.type(getInput(line1, 'Expiry date'), '2025-06-01');
    await user.type(getInput(line1, 'Quantity'), '5');
    await user.type(getInput(line1, 'Unit cost'), '7.2');

    await user.click(screen.getByRole('button', { name: 'Submit adjustment' }));

    expect(
      await within(line1).findByText(
        /Batch "MEDCARE-LOT-EXP" is expired and cannot enter a sellable location\./i
      )
    ).toBeDefined();
    expect(getInput(line1, 'Expiry date').getAttribute('aria-invalid')).toBe(
      'true'
    );
    expect(
      screen.getAllByText(/mock-trace-inventory-expiry-policy/i).length
    ).toBeGreaterThan(0);

    // 2. Switch to ADJUSTMENT_OUT -> hides and clears Unit cost
    await user.selectOptions(
      screen.getByLabelText('Transaction type'),
      'ADJUSTMENT_OUT'
    );
    expect(within(line1).queryByLabelText('Unit cost')).toBeNull();

    // Switch back briefly to confirm Unit cost was cleared to empty string, then back to ADJUSTMENT_OUT
    await user.selectOptions(
      screen.getByLabelText('Transaction type'),
      'ADJUSTMENT_IN'
    );
    expect(getInput(line1, 'Unit cost').value).toBe('');
    await user.selectOptions(
      screen.getByLabelText('Transaction type'),
      'ADJUSTMENT_OUT'
    );

    const batchInput = getInput(line1, 'Batch number');
    await user.clear(batchInput);
    await user.type(batchInput, 'MEDCARE-LOT-2601');
    const expInput = getInput(line1, 'Expiry date');
    await user.clear(expInput);
    await user.type(expInput, '2027-07-31');
    const qtyInput = getInput(line1, 'Quantity');
    await user.clear(qtyInput);
    await user.type(qtyInput, '9999');

    await user.click(screen.getByRole('button', { name: 'Submit adjustment' }));

    expect(
      await within(line1).findByText(/Available on-hand quantity is 280\./i)
    ).toBeDefined();
    expect(getInput(line1, 'Quantity').getAttribute('aria-invalid')).toBe(
      'true'
    );
    expect(
      screen.getAllByText(/mock-trace-inventory-out-of-stock/i).length
    ).toBeGreaterThan(0);
  });

  it('filters ledger history, paginates server pages, handles error/retry, and executes inline Detail -> Reverse transaction -> REVERSAL post flow', async () => {
    const user = userEvent.setup();
    let failFirstLedgerLoad = true;
    server.use(
      http.get('*/api/v1/inventory/transactions', () => {
        if (failFirstLedgerLoad) {
          failFirstLedgerLoad = false;
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Ledger temporarily unavailable',
                details: [],
                trace_id: 'trace-ledger-500',
              },
            },
            { status: 500 }
          );
        }
        return undefined;
      })
    );

    renderWithProviders(
      <CombinedInventoryHarness branchId={DOWNTOWN_BRANCH_ID} />
    );

    expect(
      await screen.findByText(
        /Ledger temporarily unavailable \(Trace: trace-ledger-500\)/i
      )
    ).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('TXN-2026-000002')).toBeDefined();
    expect(screen.getByText('TXN-2026-000001')).toBeDefined();
    expect(screen.getByText('Showing 1–2 of 2')).toBeDefined();

    // Filter by OPENING_BALANCE -> hides TXN-2026-000002
    await user.selectOptions(
      getSelect(document.body, 'Transaction type'),
      'OPENING_BALANCE'
    );
    await waitFor(() => {
      expect(screen.queryByText('TXN-2026-000002')).toBeNull();
    });
    expect(screen.getByText('TXN-2026-000001')).toBeDefined();

    // Filter by date window with no matches -> empty state + Clear filters recovery
    await user.type(screen.getByLabelText('From date'), '2026-11-24');
    expect(
      await screen.findByText('No matching ledger transactions')
    ).toBeDefined();
    await user.click(
      screen.getAllByRole('button', { name: 'Clear filters' })[0]
    );
    expect(await screen.findByText('TXN-2026-000002')).toBeDefined();

    // Open inline detail modal for TXN-2026-000002 and click Reverse transaction
    const postedRow = screen.getByText('TXN-2026-000002').closest('tr');
    if (!postedRow) {
      throw new Error('Expected posted row');
    }
    await user.click(
      within(postedRow).getByRole('button', { name: 'View details' })
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('+48')).toBeDefined();
    expect(within(dialog).getByText('+70')).toBeDefined();

    await user.click(
      within(dialog).getByRole('button', { name: 'Reverse transaction' })
    );

    // Switched to StockAdjustmentsTab with REVERSAL selected and lines hidden
    await screen.findByLabelText('Transaction type');
    expect(getSelect(document.body, 'Transaction type').value).toBe('REVERSAL');
    expect(
      getSelect(document.body, 'Original transaction to reverse').value
    ).toBe(MOCK_TRANSACTION_IDS.DOWNTOWN_ADJUSTMENT_IN);
    expect(screen.queryByText('Adjustment lines')).toBeNull();

    await user.type(screen.getByLabelText('Reason code'), 'AUDIT_REVERSAL');
    await user.click(screen.getByRole('button', { name: 'Submit adjustment' }));

    // Switch back to Ledger View and inspect the posted REVERSAL transaction
    await user.click(screen.getByRole('button', { name: 'Ledger View' }));
    expect(await screen.findByText('TXN-2026-000004')).toBeDefined();

    const reversalRow = screen.getByText('TXN-2026-000004').closest('tr');
    if (!reversalRow) {
      throw new Error('Expected reversal row');
    }
    await user.click(
      within(reversalRow).getByRole('button', { name: 'View details' })
    );
    const reversalDialog = await screen.findByRole('dialog');
    expect(within(reversalDialog).getByText('-48')).toBeDefined();
    expect(within(reversalDialog).getByText('-70')).toBeDefined();
    // Cannot reverse a REVERSAL transaction
    expect(
      within(reversalDialog).queryByRole('button', {
        name: 'Reverse transaction',
      })
    ).toBeNull();
  }, 15_000);
});
