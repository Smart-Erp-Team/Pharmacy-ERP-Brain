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
import { resetMockBranches } from '../../../mocks/branchHandlers';
import { resetMockEmployees } from '../../../mocks/employeeHandlers';
import { handlers } from '../../../mocks/handlers';
import {
  MOCK_BRANCH_IDS,
  MOCK_LOCATION_IDS,
  MOCK_PRODUCT_IDS,
  MOCK_TRANSACTION_IDS,
  resetMockInventory,
} from '../../../mocks/inventoryHandlers';
import { resetMockCatalog } from '../../../mocks/productHandlers';
import { useAuthStore } from '../../../stores/authStore';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type {
  CurrentUser,
  PermissionScope,
  Role,
  RuntimeMode,
} from '../../../types/api';
import { InventoryPage } from './InventoryPage';

const DOWNTOWN_BRANCH_ID = MOCK_BRANCH_IDS.DOWNTOWN;
const ALEXANDRIA_BRANCH_ID = MOCK_BRANCH_IDS.ALEXANDRIA;

const server = setupServer(...handlers);

function getSelectByLabel(
  container: HTMLElement,
  label: RegExp | string
): HTMLSelectElement {
  const el = within(container).getByLabelText(label);
  if (!(el instanceof HTMLSelectElement)) {
    throw new Error(`Expected HTMLSelectElement for ${String(label)}`);
  }
  return el;
}

function setAuthUser(options: {
  role: Role;
  scopes: PermissionScope[];
  runtime_mode: RuntimeMode;
  branchScope?: 'ALL' | 'ASSIGNED';
  branchIds?: string[];
  activeBranchId?: string | null;
}) {
  const branchScope = options.branchScope ?? 'ALL';
  const branchIds = options.branchIds ?? [DOWNTOWN_BRANCH_ID];
  const activeBranchId =
    options.activeBranchId !== undefined
      ? options.activeBranchId
      : DOWNTOWN_BRANCH_ID;

  const user: CurrentUser = {
    user_id: currentUserContext.user_id,
    employee_id: currentUserContext.employee_id,
    organization_id: currentUserContext.organization_id,
    username: currentUserContext.username,
    role: options.role,
    branch_scope: branchScope,
    branch_ids: branchIds,
    scopes: options.scopes,
    runtime_mode: options.runtime_mode,
  };

  useAuthStore.setState({
    currentUser: user,
    organizationCode: 'MEDCARE',
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
    organizationCode: null,
    activeBranchId: null,
    isAuthenticated: false,
    isInitializing: false,
  });
  cleanup();
  vi.restoreAllMocks();
});

afterAll(() => server.close());

describe('InventoryPage Integration (Stage 1 MEDCARE)', () => {
  it('Admin + Cloud + ALL: renders 5 tabs, switches MEDCARE branches, verifies FEFO batches & DAMAGED location, creates/toggles location, and enforces Cloud adjustment guard', async () => {
    const user = userEvent.setup();
    setAuthUser({
      role: 'Admin',
      scopes: [
        'user:admin',
        'inventory:read',
        'inventory:write',
        'sales:read',
        'sales:write',
      ],
      runtime_mode: 'Cloud',
      branchScope: 'ALL',
      branchIds: [],
      activeBranchId: DOWNTOWN_BRANCH_ID,
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
    expect(
      screen
        .getByRole('tab', { name: 'Stock Balances & Batches' })
        .getAttribute('aria-selected')
    ).toBe('true');

    // 2. Initial Balances loaded for MedCare - Downtown Cairo (MED-DT)
    expect(
      await screen.findByText('Augmentin 1g Film-Coated Tablets')
    ).toBeDefined();
    expect(screen.getByText('Panadol Extra 500mg')).toBeDefined();
    expect(screen.getByText('Vitamin D3 5000 IU')).toBeDefined();

    // 3. Switch branch to Alexandria (MED-ALX) and back to Downtown (MED-DT)
    await screen.findByLabelText('Branch');
    const branchSelect = getSelectByLabel(document.body, 'Branch');
    await user.selectOptions(branchSelect, ALEXANDRIA_BRANCH_ID);
    await waitFor(() => {
      expect(screen.queryByText('Panadol Extra 500mg')).toBeNull();
    });
    await user.selectOptions(branchSelect, DOWNTOWN_BRANCH_ID);
    expect(await screen.findByText('Panadol Extra 500mg')).toBeDefined();

    // 4. Expand Augmentin FEFO batches and Vitamin D3 NON-LOT batch
    await user.click(
      screen.getByRole('button', {
        name: 'Toggle batch breakdown for Augmentin 1g Film-Coated Tablets',
      })
    );
    expect(await screen.findByText('MEDCARE-LOT-2601')).toBeDefined();
    expect(screen.getByText('MEDCARE-LOT-2602')).toBeDefined();
    expect(screen.getByText('MEDCARE-LOT-EXP')).toBeDefined();

    await user.click(
      screen.getByRole('button', {
        name: 'Toggle batch breakdown for Vitamin D3 5000 IU',
      })
    );
    expect(screen.getAllByText('NON-LOT').length).toBeGreaterThanOrEqual(1);

    // 5. Switch to Stock Overview tab and verify Brain Telemetry — Unavailable
    await user.click(screen.getByRole('tab', { name: 'Stock Overview' }));
    expect(
      await screen.findByText('Brain Telemetry — Unavailable')
    ).toBeDefined();

    // 6. Switch to Storage Locations tab, verify DAMAGED bay, create a location, and toggle active
    await user.click(screen.getByRole('tab', { name: 'Storage Locations' }));
    expect(await screen.findByText('MAIN-SELLABLE')).toBeDefined();
    expect(screen.getByText('DMG-01')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Add Location' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText('Location code'),
      'DT-EXTRA-01'
    );
    await user.type(
      within(dialog).getByLabelText('Location name'),
      'Downtown Extra Shelf'
    );
    await user.selectOptions(
      getSelectByLabel(dialog, 'Location type'),
      'SELLABLE'
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create location' })
    );

    expect(await screen.findByText('DT-EXTRA-01')).toBeDefined();
    await user.click(
      screen.getByRole('switch', { name: 'Toggle DT-EXTRA-01 active' })
    );
    await waitFor(() => {
      expect(screen.queryByText('DT-EXTRA-01')).toBeNull();
    });

    // 7. Switch to Stock Adjustments & Opening Balance tab and verify Cloud read-only guard
    await user.click(
      screen.getByRole('tab', { name: 'Stock Adjustments & Opening Balance' })
    );
    expect(
      await screen.findByText('BranchLocal runtime required')
    ).toBeDefined();
    expect(
      screen.queryByRole('button', { name: 'Submit adjustment' })
    ).toBeNull();
  }, 15_000);

  it('Pharmacist + BranchLocal + ASSIGNED: opens inline ledger detail modal, posts REVERSAL updating balances, and posts Vitamin D3 NON-LOT adjustment', async () => {
    const user = userEvent.setup();
    setAuthUser({
      role: 'Pharmacist',
      scopes: ['inventory:read', 'inventory:write', 'sales:read'],
      runtime_mode: 'BranchLocal',
      branchScope: 'ASSIGNED',
      branchIds: [DOWNTOWN_BRANCH_ID],
      activeBranchId: DOWNTOWN_BRANCH_ID,
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
      renderWithProviders(<InventoryPage />);

      // 1. Navigate to Inventory Ledger History and inspect TXN-2026-000002 inline
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
      expect(detailRequests).toEqual([]);

      const detailDialog = await screen.findByRole('dialog');
      expect(
        within(detailDialog).getByText('Immutable posted record')
      ).toBeDefined();
      await user.click(
        within(detailDialog).getByRole('button', {
          name: 'Reverse transaction',
        })
      );

      // 2. Confirm transition to Stock Adjustments prefilled with REVERSAL and lines hidden
      expect(
        screen
          .getByRole('tab', { name: 'Stock Adjustments & Opening Balance' })
          .getAttribute('aria-selected')
      ).toBe('true');
      await screen.findByLabelText('Transaction type');
      expect(getSelectByLabel(document.body, 'Transaction type').value).toBe(
        'REVERSAL'
      );
      expect(
        getSelectByLabel(document.body, 'Original transaction to reverse').value
      ).toBe(MOCK_TRANSACTION_IDS.DOWNTOWN_ADJUSTMENT_IN);
      expect(screen.queryByText('Adjustment lines')).toBeNull();

      await user.type(
        screen.getByLabelText('Reason code'),
        'AUDIT_REVERT_TEST'
      );
      await user.click(
        screen.getByRole('button', { name: 'Submit adjustment' })
      );

      // 3. Verify reversal posted to Ledger (TXN-2026-000004) and reflected in Balances (400->330, 480->432)
      await user.click(
        screen.getByRole('tab', { name: 'Inventory Ledger History' })
      );
      expect(await screen.findByText('TXN-2026-000004')).toBeDefined();

      await user.click(
        screen.getByRole('tab', { name: 'Stock Balances & Batches' })
      );
      expect(await screen.findByText('330')).toBeDefined();
      expect(screen.getAllByText('432').length).toBeGreaterThanOrEqual(1);

      // 4. Post atomic ADJUSTMENT_IN for Vitamin D3 (non-lot product)
      await user.click(
        screen.getByRole('tab', { name: 'Stock Adjustments & Opening Balance' })
      );
      await user.selectOptions(
        getSelectByLabel(document.body, 'Transaction type'),
        'ADJUSTMENT_IN'
      );
      await user.type(screen.getByLabelText('Reason code'), 'VIT_D3_RESTOCK');

      const line1 = screen.getByRole('group', { name: 'Adjustment line 1' });
      await user.selectOptions(
        getSelectByLabel(line1, 'Product'),
        MOCK_PRODUCT_IDS.VITAMIN_D3
      );
      expect(
        within(line1).getByLabelText('Batch number').hasAttribute('disabled')
      ).toBe(true);

      await user.selectOptions(
        getSelectByLabel(line1, 'Location'),
        MOCK_LOCATION_IDS.MAIN_SELLABLE
      );
      await user.type(within(line1).getByLabelText('Quantity'), '15');
      await user.type(within(line1).getByLabelText('Unit cost'), '65');

      await user.click(
        screen.getByRole('button', { name: 'Submit adjustment' })
      );

      await user.click(
        screen.getByRole('tab', { name: 'Inventory Ledger History' })
      );
      expect(await screen.findByText('TXN-2026-000005')).toBeDefined();
    } finally {
      server.events.removeListener('request:start', recordUrl);
    }
  }, 15_000);

  it('Cashier + BranchLocal + ASSIGNED: hides Adjustments & Ledger tabs, shows read-only locations, and falls back to Balances on mid-session role switch', async () => {
    const user = userEvent.setup();
    setAuthUser({
      role: 'Pharmacist',
      scopes: ['inventory:read', 'inventory:write', 'sales:read'],
      runtime_mode: 'BranchLocal',
      branchScope: 'ASSIGNED',
      branchIds: [DOWNTOWN_BRANCH_ID],
      activeBranchId: DOWNTOWN_BRANCH_ID,
    });

    renderWithProviders(<InventoryPage />);

    await user.click(
      screen.getByRole('tab', { name: 'Inventory Ledger History' })
    );
    expect(await screen.findByText('TXN-2026-000002')).toBeDefined();

    // Switch role to Cashier mid-session
    setAuthUser({
      role: 'Cashier',
      scopes: ['inventory:read', 'sales:read', 'sales:write'],
      runtime_mode: 'BranchLocal',
      branchScope: 'ASSIGNED',
      branchIds: [DOWNTOWN_BRANCH_ID],
      activeBranchId: DOWNTOWN_BRANCH_ID,
    });

    await waitFor(() => {
      expect(
        screen
          .getByRole('tab', { name: 'Stock Balances & Batches' })
          .getAttribute('aria-selected')
      ).toBe('true');
    });

    expect(
      screen.queryByRole('tab', { name: 'Stock Adjustments & Opening Balance' })
    ).toBeNull();
    expect(
      screen.queryByRole('tab', { name: 'Inventory Ledger History' })
    ).toBeNull();

    expect(screen.getByRole('tab', { name: 'Stock Overview' })).toBeDefined();
    expect(
      screen.getByRole('tab', { name: 'Stock Balances & Batches' })
    ).toBeDefined();
    expect(
      screen.getByRole('tab', { name: 'Storage Locations' })
    ).toBeDefined();

    await user.click(screen.getByRole('tab', { name: 'Storage Locations' }));
    expect(await screen.findByText('Read-only access')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Add Location' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});
