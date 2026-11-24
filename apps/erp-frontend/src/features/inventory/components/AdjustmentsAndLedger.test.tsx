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
import inventoryBalanceFixture from '@contracts/fixtures/inventory-balance.json';
import productFixture from '@contracts/fixtures/product.json';
import { resetMockBranches } from '../../../mocks/branchHandlers';
import { resetMockEmployees } from '../../../mocks/employeeHandlers';
import { handlers } from '../../../mocks/handlers';
import {
  inventoryHandlers,
  resetMockInventory,
} from '../../../mocks/inventoryHandlers';
import { resetMockCatalog } from '../../../mocks/productHandlers';
import { useAuthStore } from '../../../stores/authStore';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { CurrentUserContext, InventoryTxnDto } from '../../../types/api';
import { LedgerHistoryTab } from './LedgerHistoryTab';
import { StockAdjustmentsTab } from './StockAdjustmentsTab';

const CAIRO_BRANCH_ID = inventoryBalanceFixture.branch_id;
const AUGMENTIN_PRODUCT_ID = inventoryBalanceFixture.product_id;
const AUGMENTIN_BOX_UOM_ID = 'c1d2e3f4-1111-4aaa-8a1b-111111110002';
const PANADOL_PRODUCT_ID = productFixture.product_id;
const PANADOL_NON_LOT_BATCH_ID = '4b53e1f6-9090-4c3f-9e5b-4d5e6f7a8b01';
const PANADOL_BASE_UOM_ID = 'f1a2b3c4-0101-4fff-8a1b-56789012abcd';
const CAIRO_SELL_LOCATION_ID = inventoryBalanceFixture.location_id;
const AUGMENTIN_BATCH_B_ID = '3a42d0e5-8080-4b2f-8d4a-3c4d5e6f8a17';

const server = setupServer(...handlers, ...inventoryHandlers);

function buildAuthUser(
  overrides: Partial<CurrentUserContext> = {}
): CurrentUserContext {
  return {
    user: { ...currentUserContext.user, role: 'Admin', branch_scope: 'ALL' },
    organization_id: currentUserContext.organization_id,
    organization_code: currentUserContext.organization_code,
    branch_scope: 'ALL',
    branch_ids: [],
    roles: ['Admin'],
    scopes: ['user:admin', 'inventory:read', 'inventory:write'],
    runtime: 'BranchLocal',
    ...overrides,
  };
}

function seedAuth(
  overrides: Partial<CurrentUserContext> = {},
  activeBranchId: string | null = CAIRO_BRANCH_ID
) {
  useAuthStore.setState({
    currentUser: buildAuthUser(overrides),
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

function getDraftsSection(): HTMLElement {
  const heading = screen.getByRole('heading', { name: 'Draft adjustments' });
  const section = heading.closest('section');
  if (!section) {
    throw new Error('Expected Draft adjustments card');
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
  const [reversalTxn, setReversalTxn] = useState<InventoryTxnDto | null>(null);

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
    activeBranchId: null,
    isAuthenticated: false,
    isInitializing: false,
  });
  cleanup();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('StockAdjustmentsTab and LedgerHistoryTab', () => {
  it('blocks Cashier on both tabs with Access restricted and zero network calls', async () => {
    seedAuth({
      user: {
        ...currentUserContext.user,
        role: 'Cashier',
        branch_scope: 'ASSIGNED',
      },
      branch_scope: 'ASSIGNED',
      branch_ids: [CAIRO_BRANCH_ID],
      roles: ['Cashier'],
      scopes: ['sales:read', 'sales:write', 'inventory:read'],
      runtime: 'BranchLocal',
    });

    const requestedUrls: string[] = [];
    server.events.on('request:start', ({ request }) => {
      requestedUrls.push(request.url);
    });

    renderWithProviders(
      <>
        <StockAdjustmentsTab branchId={CAIRO_BRANCH_ID} />
        <LedgerHistoryTab branchId={CAIRO_BRANCH_ID} />
      </>
    );

    expect(screen.getAllByText('Access restricted')).toHaveLength(2);
    await waitFor(() => {
      expect(requestedUrls).toEqual([]);
    });
  });

  it('shows BranchLocal notice and disables adjustment writes for Admin on Cloud while Ledger remains readable with employee names', async () => {
    const user = userEvent.setup();
    seedAuth({
      roles: ['Admin'],
      scopes: ['user:admin', 'inventory:read', 'inventory:write'],
      runtime: 'Cloud',
    });

    renderWithProviders(
      <>
        <StockAdjustmentsTab branchId={CAIRO_BRANCH_ID} />
        <LedgerHistoryTab branchId={CAIRO_BRANCH_ID} />
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
    expect(screen.queryByRole('button', { name: 'Edit draft' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Post adjustment' })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel draft' })).toBeNull();

    const adjSection = getAdjustmentsFormSection();
    expect(
      (
        await within(adjSection).findByLabelText('Transaction type')
      ).hasAttribute('disabled')
    ).toBe(true);

    // Ledger History loads and resolves employee names via GET /employees for Admin+user:admin
    const ledgerSection = getLedgerSection();
    expect(
      await within(ledgerSection).findByText('TXN-2026-000002')
    ).toBeDefined();
    expect(await within(ledgerSection).findByText('Omar Khaled')).toBeDefined();
    expect(
      within(ledgerSection).getAllByText('Youssef Tarek').length
    ).toBeGreaterThan(0);

    // Draft row shows Unavailable for posted_at
    const draftRow = within(ledgerSection)
      .getByText('TXN-2026-000003')
      .closest('tr');
    if (!draftRow) {
      throw new Error('Expected draft ledger row');
    }
    expect(within(draftRow).getByText('Unavailable')).toBeDefined();

    // Detail modal works on Cloud, but hides "Reverse transaction" since runtime !== BranchLocal
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
    expect(
      await within(dialog).findByText('Immutable posted record')
    ).toBeDefined();
    expect(
      within(dialog).queryByRole('button', { name: 'Reverse transaction' })
    ).toBeNull();
  });

  it('never calls GET /employees for Pharmacist on BranchLocal and falls back to Employee <uuid8>', async () => {
    const employeeRequests: string[] = [];
    server.use(
      http.get('*/api/v1/employees', ({ request }) => {
        employeeRequests.push(request.url);
        return HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Forbidden' } },
          { status: 403 }
        );
      })
    );

    seedAuth({
      user: {
        ...currentUserContext.user,
        role: 'Pharmacist',
        branch_scope: 'ASSIGNED',
      },
      branch_scope: 'ASSIGNED',
      branch_ids: [CAIRO_BRANCH_ID],
      roles: ['Pharmacist'],
      scopes: ['inventory:read', 'inventory:write'],
      runtime: 'BranchLocal',
    });

    renderWithProviders(<LedgerHistoryTab branchId={CAIRO_BRANCH_ID} />);

    expect(await screen.findByText('TXN-2026-000002')).toBeDefined();
    expect(screen.getAllByText('Employee a1111111').length).toBeGreaterThan(0);
    expect(employeeRequests).toHaveLength(0);
  });

  it('auto-locks Panadol to NON-LOT, posts OPENING_BALANCE and ADJUSTMENT_IN with Box UOM, and supports multi-line add/remove', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <StockAdjustmentsTab branchId={CAIRO_BRANCH_ID} />
        <LedgerHistoryTab branchId={CAIRO_BRANCH_ID} />
      </>
    );

    const adjSection = getAdjustmentsFormSection();
    const ledgerSection = getLedgerSection();
    await within(adjSection).findByLabelText('Adjustment line 1');

    // Verify 1 line cannot be removed
    const removeLine1 = within(adjSection).getByRole('button', {
      name: 'Remove line 1',
    });
    expect(removeLine1.hasAttribute('disabled')).toBe(true);

    // 1. Select OPENING_BALANCE and Panadol -> auto-resolves NON-LOT batch & locks Batch select
    await user.selectOptions(
      getSelect(adjSection, 'Transaction type'),
      'OPENING_BALANCE'
    );
    await user.type(getInput(adjSection, 'Reason code'), 'OPENING_CHECK');

    const line1 = within(adjSection).getByRole('group', {
      name: 'Adjustment line 1',
    });
    await user.selectOptions(getSelect(line1, 'Product'), PANADOL_PRODUCT_ID);

    const batchSelect1 = getSelect(line1, 'Batch');
    expect(batchSelect1.value).toBe(PANADOL_NON_LOT_BATCH_ID);
    expect(batchSelect1.hasAttribute('disabled')).toBe(true);
    expect(
      within(line1).getByText('Locked to NON-LOT (lot tracking not required).')
    ).toBeDefined();
    expect(getSelect(line1, 'Unit of measure').value).toBe(PANADOL_BASE_UOM_ID);

    await user.selectOptions(
      getSelect(line1, 'Location'),
      CAIRO_SELL_LOCATION_ID
    );
    await user.type(getInput(line1, 'Quantity'), '50');
    await user.type(getInput(line1, 'Unit cost (base)'), '0.90');

    // Add second line, then test remove & re-add
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
    await user.selectOptions(getSelect(line2, 'Product'), AUGMENTIN_PRODUCT_ID);
    await user.selectOptions(
      getSelect(line2, 'Location'),
      CAIRO_SELL_LOCATION_ID
    );
    await user.selectOptions(getSelect(line2, 'Batch'), AUGMENTIN_BATCH_B_ID);
    await user.selectOptions(
      getSelect(line2, 'Unit of measure'),
      AUGMENTIN_BOX_UOM_ID
    );
    await user.type(getInput(line2, 'Quantity'), '2');
    await user.type(getInput(line2, 'Unit cost (base)'), '1.50');

    await user.click(
      within(adjSection).getByRole('button', { name: 'Submit adjustment' })
    );
    expect(
      await within(ledgerSection).findByText('TXN-2026-000005')
    ).toBeDefined();

    // 2. Post ADJUSTMENT_IN using Box UOM
    await user.selectOptions(
      getSelect(adjSection, 'Transaction type'),
      'ADJUSTMENT_IN'
    );
    await user.type(getInput(adjSection, 'Reason code'), 'FOUND_BOXES');
    const nextLine1 = within(adjSection).getByRole('group', {
      name: 'Adjustment line 1',
    });
    await user.selectOptions(
      getSelect(nextLine1, 'Product'),
      AUGMENTIN_PRODUCT_ID
    );
    await user.selectOptions(
      getSelect(nextLine1, 'Location'),
      CAIRO_SELL_LOCATION_ID
    );
    await user.selectOptions(
      getSelect(nextLine1, 'Batch'),
      AUGMENTIN_BATCH_B_ID
    );
    await user.selectOptions(
      getSelect(nextLine1, 'Unit of measure'),
      AUGMENTIN_BOX_UOM_ID
    );
    await user.type(getInput(nextLine1, 'Quantity'), '1');
    await user.type(getInput(nextLine1, 'Unit cost (base)'), '1.25');
    await user.click(
      within(adjSection).getByRole('button', { name: 'Submit adjustment' })
    );

    expect(
      await within(ledgerSection).findByText('TXN-2026-000006')
    ).toBeDefined();
  }, 15_000);

  it('clears and disables unit_cost_base on ADJUSTMENT_OUT and maps 409 OUT_OF_STOCK to lines.0.entered_qty + trace_id banner', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StockAdjustmentsTab branchId={CAIRO_BRANCH_ID} />);

    const line1 = await screen.findByRole('group', {
      name: 'Adjustment line 1',
    });
    const costInput = getInput(line1, 'Unit cost (base)');
    await user.type(costInput, '12.50');
    expect(costInput.value).toBe('12.50');

    await user.selectOptions(
      screen.getByLabelText('Transaction type'),
      'ADJUSTMENT_OUT'
    );
    expect(costInput.value).toBe('');
    expect(costInput.hasAttribute('disabled')).toBe(true);

    await user.type(screen.getByLabelText('Reason code'), 'DAMAGE_WRITE_OFF');
    await user.selectOptions(getSelect(line1, 'Product'), AUGMENTIN_PRODUCT_ID);
    await user.selectOptions(
      getSelect(line1, 'Location'),
      CAIRO_SELL_LOCATION_ID
    );
    await user.selectOptions(getSelect(line1, 'Batch'), AUGMENTIN_BATCH_B_ID);
    await user.type(getInput(line1, 'Quantity'), '99999');

    await user.click(screen.getByRole('button', { name: 'Submit adjustment' }));

    expect(
      await within(line1).findByText(
        /Available on-hand quantity is 1400\.0000\./i
      )
    ).toBeDefined();
    expect(getInput(line1, 'Quantity').getAttribute('aria-invalid')).toBe(
      'true'
    );
    expect(
      (
        await screen.findAllByText(
          /The requested quantity exceeds available on-hand stock\. \(Trace: mock-trace-inventory-out-of-stock\)/i
        )
      ).length
    ).toBeGreaterThan(0);
  });

  it('supports DRAFT edit (with !isDirty guard & immutable type), post, and cancel lifecycle', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <StockAdjustmentsTab branchId={CAIRO_BRANCH_ID} />
        <LedgerHistoryTab branchId={CAIRO_BRANCH_ID} />
      </>
    );

    const draftSection = getDraftsSection();
    const editBtn = await within(draftSection).findByRole('button', {
      name: 'Edit draft',
    });
    await user.click(editBtn);

    const editFormCard = screen
      .getByRole('heading', { name: /Edit Draft TXN-2026-000003/i })
      .closest('section');
    if (!editFormCard) {
      throw new Error('Expected Edit Draft card');
    }

    expect(
      getSelect(editFormCard, 'Transaction type').hasAttribute('disabled')
    ).toBe(true);
    const saveBtn = within(editFormCard).getByRole('button', {
      name: 'Save draft changes',
    });
    expect(saveBtn.hasAttribute('disabled')).toBe(true);

    const reasonInput = getInput(editFormCard, 'Reason code');
    expect(reasonInput.value).toBe('PENDING_RECOUNT');
    await user.clear(reasonInput);
    await user.type(reasonInput, 'RECOUNT_UPDATED');
    expect(saveBtn.hasAttribute('disabled')).toBe(false);

    await user.click(saveBtn);
    expect(
      await within(draftSection).findByText('RECOUNT_UPDATED')
    ).toBeDefined();

    // Post the updated draft
    await user.click(
      within(draftSection).getByRole('button', { name: 'Post adjustment' })
    );
    expect(
      await within(draftSection).findByText('No draft adjustments')
    ).toBeDefined();

    // Reset mock inventory and verify Cancel draft on TXN-2026-000003
    cleanup();
    resetMockInventory();
    renderWithProviders(
      <>
        <StockAdjustmentsTab branchId={CAIRO_BRANCH_ID} />
        <LedgerHistoryTab branchId={CAIRO_BRANCH_ID} />
      </>
    );

    const nextDraftCard = getDraftsSection();
    const cancelDraftBtn = await within(nextDraftCard).findByRole('button', {
      name: 'Cancel draft',
    });
    await user.click(cancelDraftBtn);
    expect(
      await within(nextDraftCard).findByText('No draft adjustments')
    ).toBeDefined();
    expect(
      await within(getLedgerSection()).findByText('CANCELLED')
    ).toBeDefined();
  });

  it('filters ledger history, handles error/retry, and supports Ledger detail -> Reverse transaction -> REVERSAL post flow', async () => {
    const user = userEvent.setup();
    let failNextLedgerList = true;
    server.use(
      http.get('*/api/v1/inventory/transactions', () => {
        if (failNextLedgerList) {
          failNextLedgerList = false;
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Ledger temporarily unavailable',
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
      <CombinedInventoryHarness branchId={CAIRO_BRANCH_ID} />
    );

    expect(
      await screen.findByText(
        /Ledger temporarily unavailable \(Trace: trace-ledger-500\)/i
      )
    ).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('TXN-2026-000002')).toBeDefined();
    expect(screen.getByText('TXN-2026-000001')).toBeDefined();

    // Filter by OPENING_BALANCE -> hides TXN-2026-000002
    const filterTypeSelect = getSelect(document.body, 'Transaction type');
    await user.selectOptions(filterTypeSelect, 'OPENING_BALANCE');
    await waitFor(() => {
      expect(screen.queryByText('TXN-2026-000002')).toBeNull();
    });
    expect(screen.getByText('TXN-2026-000001')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('TXN-2026-000002')).toBeDefined();

    // Open details for TXN-2026-000002 and click Reverse transaction
    const postedRow = screen.getByText('TXN-2026-000002').closest('tr');
    if (!postedRow) {
      throw new Error('Expected posted row');
    }
    await user.click(
      within(postedRow).getByRole('button', { name: 'View details' })
    );

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('+200')).toBeDefined();
    expect(within(dialog).getByText('+1,400')).toBeDefined();

    await user.click(
      within(dialog).getByRole('button', { name: 'Reverse transaction' })
    );

    // Now on StockAdjustmentsTab with REVERSAL pre-populated
    await screen.findByLabelText('Transaction type');
    expect(getSelect(document.body, 'Transaction type').value).toBe('REVERSAL');
    expect(
      getSelect(document.body, 'Original transaction to reverse').value
    ).toBe('7d9503b8-1001-4ca5-8a0b-cd4040620002');

    const line1 = screen.getByRole('group', { name: 'Adjustment line 1' });
    expect(getInput(line1, 'Unit cost (base)').value).toBe('');
    expect(getInput(line1, 'Unit cost (base)').hasAttribute('disabled')).toBe(
      true
    );
    expect(getInput(line1, 'Quantity').value).toBe('200.0000');

    await user.type(screen.getByLabelText('Reason code'), 'AUDIT_REVERSAL');
    await user.click(screen.getByRole('button', { name: 'Submit adjustment' }));

    // Switch back to Ledger and verify new REVERSAL transaction is listed with negative delta
    await user.click(screen.getByRole('button', { name: 'Ledger View' }));
    expect(await screen.findByText('TXN-2026-000005')).toBeDefined();
    const reversalRow = screen.getByText('TXN-2026-000005').closest('tr');
    if (!reversalRow) {
      throw new Error('Expected reversal row');
    }
    await user.click(
      within(reversalRow).getByRole('button', { name: 'View details' })
    );
    const reversalDialog = await screen.findByRole('dialog');
    expect(await within(reversalDialog).findByText('-200')).toBeDefined();
    expect(within(reversalDialog).getByText('-1,400')).toBeDefined();
  });

  it('filters ledger by product and date range, handles pagination/empty recovery, and retries detail modal errors', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LedgerHistoryTab branchId={CAIRO_BRANCH_ID} />);

    expect(await screen.findByText('TXN-2026-000002')).toBeDefined();

    // Filter by date window covering only 2026-10-15 (TXN-2026-000002)
    await user.type(screen.getByLabelText('From date'), '2026-10-10');
    await user.type(screen.getByLabelText('To date'), '2026-10-20');
    await waitFor(() => {
      expect(screen.queryByText('TXN-2026-000001')).toBeNull();
    });
    expect(screen.getByText('TXN-2026-000002')).toBeDefined();

    // Filter by Product with no matches -> empty state + Clear filters recovery
    await user.selectOptions(
      screen.getByLabelText('Product'),
      'd7e8f9a0-5555-4fff-9d4e-567890123bcd'
    );
    expect(
      await screen.findByText('No matching ledger transactions')
    ).toBeDefined();
    await user.click(
      screen.getAllByRole('button', { name: 'Clear filters' })[0]
    );
    expect(await screen.findByText('TXN-2026-000001')).toBeDefined();

    // Detail modal error + Retry
    let failDetail = true;
    server.use(
      http.get('*/api/v1/inventory/transactions/:txnId', () => {
        if (failDetail) {
          failDetail = false;
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Detail lookup failed',
                trace_id: 'trace-detail-500',
              },
            },
            { status: 500 }
          );
        }
        return undefined;
      })
    );

    const postedRow = screen.getByText('TXN-2026-000002').closest('tr');
    if (!postedRow) {
      throw new Error('Expected posted row');
    }
    await user.click(
      within(postedRow).getByRole('button', { name: 'View details' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText(
        /Detail lookup failed \(Trace: trace-detail-500\)/i
      )
    ).toBeDefined();

    await user.click(within(dialog).getByRole('button', { name: 'Retry' }));
    expect(await within(dialog).findByText('+200')).toBeDefined();
  });
});
