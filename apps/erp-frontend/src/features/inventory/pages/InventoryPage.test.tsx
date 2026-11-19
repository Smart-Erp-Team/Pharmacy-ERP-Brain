/** @vitest-environment jsdom */
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { resetMockInventory } from '../../../mocks/inventoryHandlers';
import { resetMockCatalog } from '../../../mocks/productHandlers';
import { useAuthStore } from '../../../stores/authStore';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type {
  CurrentUserContext,
  PermissionScope,
  Role,
  RuntimeMode,
} from '../../../types/api';
import { InventoryPage } from './InventoryPage';

const CAIRO_BRANCH_ID = 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa';
const ALEX_BRANCH_ID = 'e5f6a7b8-4444-4d55-9e66-ccddeeff0011';
const CAIRO_SELL_LOCATION_ID = inventoryBalanceFixture.location_id;
const PANADOL_PRODUCT_ID = productFixture.product_id;
const PANADOL_NON_LOT_BATCH_ID = '4b53e1f6-9090-4c3f-9e5b-4d5e6f7a8b01';

const server = setupServer(...handlers);

function setAuthUser(options: {
  role?: Role;
  roles: Role[];
  scopes: PermissionScope[];
  runtime: RuntimeMode;
  branchScope?: 'ALL' | 'ASSIGNED';
  branchIds?: string[];
  activeBranchId?: string | null;
}) {
  const primaryRole = options.role ?? options.roles[0] ?? 'Admin';
  const branchScope = options.branchScope ?? 'ALL';
  const branchIds = options.branchIds ?? [CAIRO_BRANCH_ID];
  const activeBranchId =
    options.activeBranchId !== undefined
      ? options.activeBranchId
      : CAIRO_BRANCH_ID;

  const user: CurrentUserContext = {
    ...currentUserContext,
    user: {
      ...currentUserContext.user,
      role: primaryRole,
      branch_scope: branchScope,
    },
    roles: options.roles,
    scopes: options.scopes,
    branch_scope: branchScope,
    branch_ids: branchIds,
    runtime: options.runtime,
  };

  useAuthStore.setState({
    currentUser: user,
    activeBranchId,
    isAuthenticated: true,
    isInitializing: false,
  });
}

beforeAll(() => server.listen());

beforeEach(() => {
  resetMockBranches();
  resetMockEmployees();
  resetMockCatalog();
  resetMockInventory();
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

describe('InventoryPage Integration', () => {
  it('Admin + Cloud + ALL: renders 5 tabs, switches branches, verifies FEFO batches, checks Unavailable overview, creates/toggles location, and verifies Cloud adjustment notice', async () => {
    const user = userEvent.setup();
    setAuthUser({
      role: 'Admin',
      roles: ['Admin'],
      scopes: ['user:admin', 'inventory:read', 'inventory:write'],
      runtime: 'Cloud',
      branchScope: 'ALL',
      branchIds: [CAIRO_BRANCH_ID, ALEX_BRANCH_ID],
      activeBranchId: CAIRO_BRANCH_ID,
    });

    renderWithProviders(<InventoryPage />);

    // 1. Verify 5 tabs rendered and defaults to Stock Balances & Batches
    const expectedTabs = [
      'Stock Overview',
      'Stock Balances & Batches',
      'Storage Locations',
      'Stock Adjustments & Opening Balance',
      'Inventory Ledger History',
    ];
    for (const label of expectedTabs) {
      expect(screen.getByRole('tab', { name: label })).toBeDefined();
    }
    const defaultTab = screen.getByRole('tab', {
      name: 'Stock Balances & Batches',
    });
    expect(defaultTab.getAttribute('aria-selected')).toBe('true');

    // 2. Initial Balances table loaded for Cairo Main Branch
    expect(await screen.findByText('Augmentin 1g Tablets')).toBeDefined();
    expect(screen.getByText('Panadol 500mg Tablets')).toBeDefined();

    // 3. Switch branch to Alexandria Corniche Branch and back
    const branchSelect = (await screen.findByLabelText(
      'Branch'
    )) as HTMLSelectElement;
    await user.selectOptions(branchSelect, ALEX_BRANCH_ID);
    await waitFor(() => {
      expect(screen.getByText('ALX-01', { exact: false })).toBeDefined();
    });
    await user.selectOptions(branchSelect, CAIRO_BRANCH_ID);
    expect(await screen.findByText('Augmentin 1g Tablets')).toBeDefined();

    // 4. Expand Augmentin FEFO batches (AUG-2026-A / AUG-2027-B before NON-LOT)
    const expandAug = screen.getByRole('button', {
      name: 'Toggle batch breakdown for Augmentin 1g Tablets',
    });
    await user.click(expandAug);
    expect(await screen.findByText('AUG-2026-A')).toBeDefined();
    expect(screen.getByText('AUG-2027-B')).toBeDefined();

    const expandPanadol = screen.getByRole('button', {
      name: 'Toggle batch breakdown for Panadol 500mg Tablets',
    });
    await user.click(expandPanadol);
    expect(screen.getAllByText('NON-LOT').length).toBeGreaterThanOrEqual(1);

    // 5. Switch to Stock Overview tab and verify Brain Telemetry — Unavailable
    await user.click(screen.getByRole('tab', { name: 'Stock Overview' }));
    expect(
      await screen.findByText('Brain Telemetry — Unavailable')
    ).toBeDefined();

    // 6. Switch to Storage Locations tab, create a new location and toggle active
    await user.click(screen.getByRole('tab', { name: 'Storage Locations' }));
    expect(await screen.findByText('MAIN-SELL')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Add Location' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText('Location code'),
      'CAI-EXTRA-01'
    );
    await user.type(
      within(dialog).getByLabelText('Location name'),
      'Cairo Extra Shelf'
    );
    await user.selectOptions(
      within(dialog).getByLabelText('Location type'),
      'SELLABLE'
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create location' })
    );

    expect(await screen.findByText('CAI-EXTRA-01')).toBeDefined();
    const toggleSwitch = screen.getByRole('switch', {
      name: 'Toggle CAI-EXTRA-01 active',
    });
    await user.click(toggleSwitch);
    await waitFor(() => {
      expect(screen.queryByText('CAI-EXTRA-01')).toBeNull();
    });

    // 7. Switch to Stock Adjustments & Opening Balance tab and check Cloud notice
    await user.click(
      screen.getByRole('tab', { name: 'Stock Adjustments & Opening Balance' })
    );
    expect(
      await screen.findByText('BranchLocal runtime required')
    ).toBeDefined();
    expect(
      screen.queryByRole('button', { name: 'Submit adjustment' })
    ).toBeNull();
  });

  it('Pharmacist + BranchLocal + ASSIGNED: views POSTED txn, performs full reversal into ledger and balances, and posts Panadol NON-LOT adjustment', async () => {
    const user = userEvent.setup();
    setAuthUser({
      role: 'Pharmacist',
      roles: ['Pharmacist'],
      scopes: ['inventory:read', 'inventory:write'],
      runtime: 'BranchLocal',
      branchScope: 'ASSIGNED',
      branchIds: [CAIRO_BRANCH_ID],
      activeBranchId: CAIRO_BRANCH_ID,
    });

    renderWithProviders(<InventoryPage />);

    // 1. Navigate to Inventory Ledger History
    await user.click(
      screen.getByRole('tab', { name: 'Inventory Ledger History' })
    );
    const postedTxnCell = await screen.findByText('TXN-2026-000002');
    const postedRow = postedTxnCell.closest('tr');
    if (!postedRow) {
      throw new Error('Expected posted ledger row for TXN-2026-000002');
    }
    await user.click(
      within(postedRow).getByRole('button', { name: 'View details' })
    );

    // 2. View details modal and trigger Reversal
    const detailDialog = await screen.findByRole('dialog');
    expect(
      await within(detailDialog).findByText('Immutable posted record')
    ).toBeDefined();
    await user.click(
      within(detailDialog).getByRole('button', { name: 'Reverse transaction' })
    );

    // 3. Confirm clean transition to Stock Adjustments prefilled with REVERSAL
    expect(
      screen
        .getByRole('tab', { name: 'Stock Adjustments & Opening Balance' })
        .getAttribute('aria-selected')
    ).toBe('true');
    const typeSelect = (await screen.findByLabelText(
      'Transaction type'
    )) as HTMLSelectElement;
    expect(typeSelect.value).toBe('REVERSAL');
    const targetSelect = screen.getByLabelText(
      'Original transaction to reverse'
    ) as HTMLSelectElement;
    expect(targetSelect.value).toBe('7d9503b8-1001-4ca5-8a0b-cd4040620002');

    await user.type(screen.getByLabelText('Reason code'), 'AUDIT_REVERT_TEST');
    await user.click(screen.getByRole('button', { name: 'Submit adjustment' }));

    // 4. Verify reversal posted to Ledger and reflected in Balances
    await user.click(
      screen.getByRole('tab', { name: 'Inventory Ledger History' })
    );
    expect(await screen.findByText('TXN-2026-000005')).toBeDefined();

    await user.click(
      screen.getByRole('tab', { name: 'Stock Balances & Batches' })
    );
    // Verify updated on-hand balances reflected in Stock Balances & Batches
    expect(await screen.findByText('5,420')).toBeDefined();
    expect(screen.getAllByText('1,000').length).toBeGreaterThanOrEqual(1);

    // 5. Post an ADJUSTMENT_IN for Panadol (auto-locks to NON-LOT batch)
    await user.click(
      screen.getByRole('tab', { name: 'Stock Adjustments & Opening Balance' })
    );
    await user.selectOptions(
      screen.getByLabelText('Transaction type'),
      'ADJUSTMENT_IN'
    );
    await user.type(screen.getByLabelText('Reason code'), 'PANADOL_RECEIPT');

    const line1 = screen.getByRole('group', { name: 'Adjustment line 1' });
    await user.selectOptions(
      within(line1).getByLabelText('Product'),
      PANADOL_PRODUCT_ID
    );

    const batchSelect = within(line1).getByLabelText(
      'Batch'
    ) as HTMLSelectElement;
    expect(batchSelect.value).toBe(PANADOL_NON_LOT_BATCH_ID);
    expect(batchSelect.disabled).toBe(true);
    expect(
      within(line1).getByText('Locked to NON-LOT (lot tracking not required).')
    ).toBeDefined();

    await user.selectOptions(
      within(line1).getByLabelText('Location'),
      CAIRO_SELL_LOCATION_ID
    );
    await user.type(within(line1).getByLabelText('Quantity'), '30');
    await user.type(within(line1).getByLabelText('Unit cost (base)'), '0.90');

    await user.click(screen.getByRole('button', { name: 'Submit adjustment' }));

    await user.click(
      screen.getByRole('tab', { name: 'Inventory Ledger History' })
    );
    expect(await screen.findByText('TXN-2026-000006')).toBeDefined();
  });

  it('Cashier + BranchLocal + ASSIGNED: sees 3 tabs with read-only locations, write/ledger tabs hidden, and falls back to Balances on mid-session role switch', async () => {
    const user = userEvent.setup();
    // Start as Pharmacist on Inventory Ledger History tab
    setAuthUser({
      role: 'Pharmacist',
      roles: ['Pharmacist'],
      scopes: ['inventory:read', 'inventory:write'],
      runtime: 'BranchLocal',
      branchScope: 'ASSIGNED',
      branchIds: [CAIRO_BRANCH_ID],
      activeBranchId: CAIRO_BRANCH_ID,
    });

    renderWithProviders(<InventoryPage />);

    await user.click(
      screen.getByRole('tab', { name: 'Inventory Ledger History' })
    );
    expect(await screen.findByText('TXN-2026-000002')).toBeDefined();

    // Switch role to Cashier mid-session
    setAuthUser({
      role: 'Cashier',
      roles: ['Cashier'],
      scopes: ['inventory:read', 'sales:read', 'sales:write'],
      runtime: 'BranchLocal',
      branchScope: 'ASSIGNED',
      branchIds: [CAIRO_BRANCH_ID],
      activeBranchId: CAIRO_BRANCH_ID,
    });

    // Verify current tab falls back cleanly to Stock Balances & Batches
    await waitFor(() => {
      const balanceTab = screen.getByRole('tab', {
        name: 'Stock Balances & Batches',
      });
      expect(balanceTab.getAttribute('aria-selected')).toBe('true');
    });

    // Verify forbidden tabs are completely hidden
    expect(
      screen.queryByRole('tab', { name: 'Stock Adjustments & Opening Balance' })
    ).toBeNull();
    expect(
      screen.queryByRole('tab', { name: 'Inventory Ledger History' })
    ).toBeNull();

    // Verify visible tabs for Cashier
    expect(screen.getByRole('tab', { name: 'Stock Overview' })).toBeDefined();
    expect(
      screen.getByRole('tab', { name: 'Stock Balances & Batches' })
    ).toBeDefined();
    expect(
      screen.getByRole('tab', { name: 'Storage Locations' })
    ).toBeDefined();

    // Verify Storage Locations is read-only
    await user.click(screen.getByRole('tab', { name: 'Storage Locations' }));
    expect(await screen.findByText('Read-only access')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Add Location' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});
