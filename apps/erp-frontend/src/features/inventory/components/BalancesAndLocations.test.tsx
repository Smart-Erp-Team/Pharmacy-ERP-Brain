/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
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
import currentUserFixture from '@contracts/fixtures/current-user-context.json';
import inventoryBalanceFixture from '@contracts/fixtures/inventory-balance.json';
import {
  branchHandlers,
  resetMockBranches,
} from '../../../mocks/branchHandlers';
import {
  INITIAL_BALANCES,
  INITIAL_LOCATIONS,
  inventoryHandlers,
  MOCK_BRANCH_IDS,
  MOCK_LOCATION_IDS,
  ORGANIZATION_ID,
  resetMockInventory,
} from '../../../mocks/inventoryHandlers';
import {
  productHandlers,
  resetMockCatalog,
} from '../../../mocks/productHandlers';
import { useAuthStore } from '../../../stores/authStore';
import type {
  CurrentUser,
  InventoryLocation,
  PermissionScope,
  Role,
  RuntimeMode,
} from '../../../types/api';
import { useInventoryBranchState } from '../hooks/useInventoryBranchState';
import { InventoryBranchBar } from './InventoryBranchBar';
import { StockBalancesTab } from './StockBalancesTab';
import { StockOverviewTab } from './StockOverviewTab';
import { StorageLocationsTab } from './StorageLocationsTab';

const DOWNTOWN_BRANCH_ID = MOCK_BRANCH_IDS.DOWNTOWN;
const server = setupServer(
  ...branchHandlers,
  ...productHandlers,
  ...inventoryHandlers
);

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

function setAuthUser(options: {
  role: Role;
  scopes: PermissionScope[];
  runtimeMode: RuntimeMode;
  branchScope?: 'ALL' | 'ASSIGNED';
  branchIds?: string[];
}) {
  const user: CurrentUser = {
    user_id: currentUserFixture.user_id,
    employee_id: currentUserFixture.employee_id,
    organization_id: currentUserFixture.organization_id,
    username: currentUserFixture.username,
    role: options.role,
    branch_scope: options.branchScope ?? 'ALL',
    branch_ids: options.branchIds ?? [],
    scopes: options.scopes,
    runtime_mode: options.runtimeMode,
  };
  useAuthStore.setState({
    currentUser: user,
    activeBranchId: DOWNTOWN_BRANCH_ID,
    isAuthenticated: true,
    isInitializing: false,
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

function BranchSelectorHarness() {
  const state = useInventoryBranchState();
  return (
    <div>
      <InventoryBranchBar
        branchId={state.branchId}
        branchOptions={state.branchOptions}
        isLoading={state.isBranchesLoading}
        error={state.branchesError}
        onSelectBranch={state.onSelectBranch}
        onRetry={state.onRetryBranches}
      />
      <p data-testid="active-branch-name">{state.branchName}</p>
    </div>
  );
}

beforeAll(() => server.listen());
beforeEach(() => {
  resetMockBranches();
  resetMockCatalog();
  resetMockInventory();
  setAuthUser({
    role: 'Admin',
    scopes: ['inventory:read', 'inventory:write'],
    runtimeMode: 'Cloud',
  });
});
afterEach(() => {
  server.resetHandlers();
  if (activeQueryClient) {
    activeQueryClient.clear();
    activeQueryClient = null;
  }
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

describe('InventoryBranchBar & useInventoryBranchState', () => {
  it('loads active MEDCARE branches with branch_code (MED-DT, MED-ALX) and switches active branch', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BranchSelectorHarness />);

    const branchSelect = await screen.findByLabelText('Branch');
    expect(branchSelect).toBeInstanceOf(HTMLSelectElement);
    if (!(branchSelect instanceof HTMLSelectElement)) return;

    const optionLabels = Array.from(branchSelect.options).map((o) => o.text);
    expect(optionLabels).toEqual([
      'MedCare - Downtown Flagship (MED-DT)',
      'MedCare - Alexandria Corniche (MED-ALX)',
    ]);
    expect(screen.getByTestId('active-branch-name').textContent).toBe(
      'MedCare - Downtown Flagship (MED-DT)'
    );

    await user.selectOptions(branchSelect, MOCK_BRANCH_IDS.ALEXANDRIA);
    expect(screen.getByTestId('active-branch-name').textContent).toBe(
      'MedCare - Alexandria Corniche (MED-ALX)'
    );
  });
});

describe('StockOverviewTab', () => {
  it('renders computed MEDCARE KPIs, explicit Unavailable Brain telemetry, and flagged lots', async () => {
    renderWithProviders(
      <StockOverviewTab
        branchId={DOWNTOWN_BRANCH_ID}
        branchName="MedCare - Downtown Flagship (MED-DT)"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('890')).toBeDefined();
    });

    expect(screen.getByText('Brain Telemetry — Unavailable')).toBeDefined();
    expect(screen.getByText('MEDCARE-LOT-EXP')).toBeDefined();
    expect(screen.getByText('MEDCARE-LOT-2602')).toBeDefined();
    expect(screen.getByText('DMG-01')).toBeDefined();
    expect(screen.getByText('Expired')).toBeDefined();
    expect(screen.getByText('Expiring soon')).toBeDefined();
  });

  it('shows Unavailable and retries cleanly when balances or locations fail', async () => {
    const user = userEvent.setup();
    let failBalancesOnce = true;
    server.use(
      http.get('*/api/v1/inventory/balances', () => {
        if (failBalancesOnce) {
          failBalancesOnce = false;
          return HttpResponse.json(
            { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Boom' } },
            { status: 500 }
          );
        }
        return undefined;
      })
    );

    const { unmount } = renderWithProviders(
      <StockOverviewTab
        branchId={DOWNTOWN_BRANCH_ID}
        branchName="MedCare - Downtown Flagship (MED-DT)"
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText('Could not load inventory overview')
      ).toBeDefined();
    });
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByText('890')).toBeDefined();
    });
    unmount();

    server.resetHandlers();
    let failLocationsOnce = true;
    server.use(
      http.get('*/api/v1/inventory/locations', () => {
        if (failLocationsOnce) {
          failLocationsOnce = false;
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Locations down',
              },
            },
            { status: 500 }
          );
        }
        return undefined;
      })
    );

    renderWithProviders(
      <StockOverviewTab
        branchId={DOWNTOWN_BRANCH_ID}
        branchName="MedCare - Downtown Flagship (MED-DT)"
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText('Could not load inventory overview')
      ).toBeDefined();
    });
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByText('MEDCARE-LOT-EXP')).toBeDefined();
    });
  });
});

describe('StockBalancesTab', () => {
  it('renders MEDCARE balances, FEFO order (LOT-EXP, LOT-2602 before LOT-2601), DAMAGED, NON-LOT, and zero Reserved', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StockBalancesTab branchId={DOWNTOWN_BRANCH_ID} />);

    await waitFor(() => {
      expect(
        screen.getByText('Augmentin 1g Film-Coated Tablets')
      ).toBeDefined();
      expect(screen.getByText('Panadol Extra 500mg')).toBeDefined();
      expect(screen.getByText('Vitamin D3 5000 IU')).toBeDefined();
    });

    expect(screen.queryByText(/Reserved/i)).toBeNull();
    expect(screen.getByText('MED-AUG-1000')).toBeDefined();
    expect(screen.getByText('MED-PAN-500')).toBeDefined();
    expect(screen.getByText('MED-VIT-D3')).toBeDefined();
    expect(screen.getByText('400')).toBeDefined();
    expect(screen.getByText('350')).toBeDefined();
    expect(screen.getByText('7.13')).toBeDefined();

    const typeSelect = screen.getByLabelText('Location type');
    expect(typeSelect).toBeInstanceOf(HTMLSelectElement);
    if (typeSelect instanceof HTMLSelectElement) {
      const optionValues = Array.from(typeSelect.options).map((o) => o.value);
      expect(optionValues).toEqual([
        'ALL',
        'SELLABLE',
        'QUARANTINE',
        'DAMAGED',
        'SCRAP',
      ]);
    }

    const expandAug = screen.getByRole('button', {
      name: 'Toggle batch breakdown for Augmentin 1g Film-Coated Tablets',
    });
    expect(expandAug.getAttribute('aria-expanded')).toBe('false');
    await user.click(expandAug);
    expect(expandAug.getAttribute('aria-expanded')).toBe('true');

    const batchCells = screen
      .getAllByText(/^MEDCARE-LOT-/)
      .map((node) => node.textContent);
    expect(batchCells).toEqual([
      'MEDCARE-LOT-EXP',
      'MEDCARE-LOT-2602',
      'MEDCARE-LOT-2601',
    ]);
    expect(screen.getByText('DMG-01')).toBeDefined();
    expect(screen.getByText('Expiring soon')).toBeDefined();
    expect(screen.getByText('EXPIRED')).toBeDefined();
    expect(screen.getByText('v3')).toBeDefined();

    const expandVitD = screen.getByRole('button', {
      name: 'Toggle batch breakdown for Vitamin D3 5000 IU',
    });
    await user.click(expandVitD);
    expect(screen.getAllByText('NON-LOT').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThanOrEqual(2);
  });

  it('filters by search, DAMAGED location type, NON_LOT expiry status, and clears filters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StockBalancesTab branchId={DOWNTOWN_BRANCH_ID} />);

    await waitFor(() => {
      expect(
        screen.getByText('Augmentin 1g Film-Coated Tablets')
      ).toBeDefined();
    });

    await user.type(screen.getByLabelText('Search products'), '6221001000019');
    expect(screen.getByText('Augmentin 1g Film-Coated Tablets')).toBeDefined();
    expect(screen.queryByText('Panadol Extra 500mg')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Panadol Extra 500mg')).toBeDefined();

    await user.selectOptions(screen.getByLabelText('Location type'), 'DAMAGED');
    expect(screen.getByText('Augmentin 1g Film-Coated Tablets')).toBeDefined();
    expect(screen.queryByText('Panadol Extra 500mg')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await user.selectOptions(screen.getByLabelText('Expiry status'), 'NON_LOT');
    expect(screen.getByText('Vitamin D3 5000 IU')).toBeDefined();
    expect(screen.queryByText('Augmentin 1g Film-Coated Tablets')).toBeNull();
  });

  it('breaks equal expiry ties by batch_id ascending rather than batch_number', async () => {
    const user = userEvent.setup();
    const batchIdFirst = '00000000-0000-4000-8000-000000000001';
    const batchIdSecond = '00000000-0000-4000-8000-000000000002';

    server.use(
      http.get('*/api/v1/inventory/batches', () =>
        HttpResponse.json({
          items: [
            {
              batch_id: batchIdSecond,
              organization_id: ORGANIZATION_ID,
              product_id: inventoryBalanceFixture.product_id,
              batch_number: 'LOT-AAA',
              manufactured_on: '2026-01-01',
              expires_on: '2027-06-01',
              quality_status: 'AVAILABLE',
              updated_at: '2026-11-25T10:00:00+00:00',
            },
            {
              batch_id: batchIdFirst,
              organization_id: ORGANIZATION_ID,
              product_id: inventoryBalanceFixture.product_id,
              batch_number: 'LOT-ZZZ',
              manufactured_on: '2026-01-01',
              expires_on: '2027-06-01',
              quality_status: 'AVAILABLE',
              updated_at: '2026-11-25T10:00:00+00:00',
            },
          ],
          page: 1,
          page_size: 200,
          total_count: 2,
          next_cursor: null,
        })
      ),
      http.get('*/api/v1/inventory/balances', () =>
        HttpResponse.json({
          items: [
            {
              ...INITIAL_BALANCES[0],
              batch_id: batchIdSecond,
              batch_number: 'LOT-AAA',
              expires_on: '2027-06-01',
              on_hand_qty_base: 10,
              available_qty_base: 10,
            },
            {
              ...INITIAL_BALANCES[0],
              batch_id: batchIdFirst,
              batch_number: 'LOT-ZZZ',
              expires_on: '2027-06-01',
              on_hand_qty_base: 20,
              available_qty_base: 20,
            },
          ],
          page: 1,
          page_size: 200,
          total_count: 2,
          next_cursor: null,
        })
      )
    );

    renderWithProviders(<StockBalancesTab branchId={DOWNTOWN_BRANCH_ID} />);
    await waitFor(() => {
      expect(
        screen.getByText('Augmentin 1g Film-Coated Tablets')
      ).toBeDefined();
    });

    await user.click(
      screen.getByRole('button', {
        name: 'Toggle batch breakdown for Augmentin 1g Film-Coated Tablets',
      })
    );

    const lotCells = screen
      .getAllByText(/^LOT-/)
      .map((node) => node.textContent);
    expect(lotCells).toEqual(['LOT-ZZZ', 'LOT-AAA']);
  });

  it('surfaces an error on bare array or /products failure and retries cleanly', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/v1/inventory/balances', () =>
        HttpResponse.json([inventoryBalanceFixture])
      )
    );

    const { unmount } = renderWithProviders(
      <StockBalancesTab branchId={DOWNTOWN_BRANCH_ID} />
    );

    await waitFor(() => {
      expect(screen.getByText('Could not load stock balances')).toBeDefined();
    });
    expect(screen.queryByText('No matching stock balances')).toBeNull();
    unmount();

    server.resetHandlers();
    let failProductsOnce = true;
    server.use(
      http.get('*/api/v1/products', () => {
        if (failProductsOnce) {
          failProductsOnce = false;
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Catalog down',
              },
            },
            { status: 500 }
          );
        }
        return undefined;
      })
    );

    renderWithProviders(<StockBalancesTab branchId={DOWNTOWN_BRANCH_ID} />);
    await waitFor(() => {
      expect(screen.getByText('Could not load stock balances')).toBeDefined();
    });

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(
        screen.getByText('Augmentin 1g Film-Coated Tablets')
      ).toBeDefined();
    });
  });

  it('drains multi-page PagedResult responses and rejects premature empty pages', async () => {
    const seenPages: string[] = [];
    server.use(
      http.get('*/api/v1/inventory/balances', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1';
        seenPages.push(page);
        if (page === '2') {
          return HttpResponse.json({
            items: [
              {
                ...INITIAL_BALANCES[0],
                location_id: MOCK_LOCATION_IDS.QUAR_01,
                location_code: 'QUAR-01',
                on_hand_qty_base: 300,
                available_qty_base: 300,
              },
            ],
            page: 2,
            page_size: 200,
            total_count: 2,
            next_cursor: null,
          });
        }
        return HttpResponse.json({
          items: [
            {
              ...INITIAL_BALANCES[0],
              on_hand_qty_base: 5000,
              available_qty_base: 5000,
            },
          ],
          page: 1,
          page_size: 200,
          total_count: 2,
          next_cursor: '2',
        });
      })
    );

    const { unmount } = renderWithProviders(
      <StockBalancesTab branchId={DOWNTOWN_BRANCH_ID} />
    );
    await waitFor(() => {
      expect(screen.getAllByText('5,300').length).toBeGreaterThanOrEqual(2);
    });
    expect(seenPages).toEqual(['1', '2']);
    unmount();

    server.use(
      http.get('*/api/v1/inventory/balances', () =>
        HttpResponse.json({
          items: [],
          page: 1,
          page_size: 200,
          total_count: 5,
          next_cursor: null,
        })
      )
    );

    renderWithProviders(<StockBalancesTab branchId={DOWNTOWN_BRANCH_ID} />);
    await waitFor(() => {
      expect(screen.getByText('Could not load stock balances')).toBeDefined();
    });
  });
});

describe('StorageLocationsTab', () => {
  it('filters by is_sellable and include_inactive, creates a DAMAGED location (is_sellable locked false), enforces immutable location_type on edit, and toggles active', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StorageLocationsTab branchId={DOWNTOWN_BRANCH_ID} />);

    await waitFor(() => {
      expect(screen.getByText('MAIN-SELLABLE')).toBeDefined();
      expect(screen.getByText('QUAR-01')).toBeDefined();
      expect(screen.getByText('DMG-01')).toBeDefined();
      expect(screen.getByText('SCRAP-01')).toBeDefined();
    });
    expect(screen.queryByText('OLD-BIN')).toBeNull();

    await user.selectOptions(
      screen.getByLabelText('Sellable filter'),
      'SELLABLE'
    );
    await waitFor(() => {
      expect(screen.getByText('MAIN-SELLABLE')).toBeDefined();
      expect(screen.queryByText('DMG-01')).toBeNull();
    });

    await user.selectOptions(
      screen.getByLabelText('Sellable filter'),
      'NON_SELLABLE'
    );
    await waitFor(() => {
      expect(screen.getByText('DMG-01')).toBeDefined();
      expect(screen.queryByText('MAIN-SELLABLE')).toBeNull();
    });

    await user.selectOptions(screen.getByLabelText('Sellable filter'), 'ALL');
    await user.click(screen.getByRole('switch', { name: 'Include inactive' }));
    await waitFor(() => {
      expect(screen.getByText('OLD-BIN')).toBeDefined();
    });
    await user.click(screen.getByRole('switch', { name: 'Include inactive' }));
    await waitFor(() => {
      expect(screen.queryByText('OLD-BIN')).toBeNull();
    });

    await user.click(screen.getByRole('button', { name: 'Add Location' }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).queryByRole('switch', { name: 'Active location' })
    ).toBeNull();

    await user.type(
      within(dialog).getByLabelText('Location code'),
      'MAIN-SELLABLE'
    );
    await user.type(
      within(dialog).getByLabelText('Location name'),
      'Duplicate Shelf'
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create location' })
    );

    await waitFor(() => {
      expect(within(dialog).getByText('Could not save location')).toBeDefined();
    });

    await user.clear(within(dialog).getByLabelText('Location code'));
    await user.type(within(dialog).getByLabelText('Location code'), 'DMG-02');
    await user.clear(within(dialog).getByLabelText('Location name'));
    await user.type(
      within(dialog).getByLabelText('Location name'),
      'Secondary Damaged Bay'
    );
    await user.selectOptions(
      within(dialog).getByLabelText('Location type'),
      'DAMAGED'
    );

    const sellableSwitch = within(dialog).getByRole('switch', {
      name: 'Sellable location',
    });
    expect(sellableSwitch.getAttribute('aria-checked')).toBe('false');
    expect(sellableSwitch).toBeInstanceOf(HTMLButtonElement);
    if (sellableSwitch instanceof HTMLButtonElement) {
      expect(sellableSwitch.disabled).toBe(true);
    }

    await user.click(
      within(dialog).getByRole('button', { name: 'Create location' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByText('DMG-02')).toBeDefined();
    });

    const dmgRow = screen.getByText('DMG-02').closest('tr');
    expect(dmgRow).not.toBeNull();
    if (!dmgRow) return;
    await user.click(within(dmgRow).getByRole('button', { name: 'Edit' }));

    const editDialog = screen.getByRole('dialog');
    expect(within(editDialog).queryByLabelText('Location type')).toBeNull();
    expect(within(editDialog).getByText('DAMAGED')).toBeDefined();
    expect(within(editDialog).getByText('Immutable')).toBeDefined();

    const editSellable = within(editDialog).getByRole('switch', {
      name: 'Sellable location',
    });
    expect(editSellable.getAttribute('aria-checked')).toBe('false');
    if (editSellable instanceof HTMLButtonElement) {
      expect(editSellable.disabled).toBe(true);
    }

    const saveButton = within(editDialog).getByRole('button', {
      name: 'Save changes',
    });
    expect(saveButton).toBeInstanceOf(HTMLButtonElement);
    if (saveButton instanceof HTMLButtonElement) {
      expect(saveButton.disabled).toBe(true);
    }

    const nameInput = within(editDialog).getByLabelText('Location name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Secondary Damaged Bay Updated');
    if (saveButton instanceof HTMLButtonElement) {
      expect(saveButton.disabled).toBe(false);
    }
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByText('Secondary Damaged Bay Updated')).toBeDefined();
    });

    await user.click(
      screen.getByRole('switch', { name: 'Toggle DMG-02 active' })
    );
    await waitFor(() => {
      expect(screen.queryByText('DMG-02')).toBeNull();
    });
  });

  it('supports Stage 1 server-side PagedResult pagination', async () => {
    const user = userEvent.setup();
    const generatedLocations: InventoryLocation[] = Array.from(
      { length: 22 },
      (_, index) => ({
        ...INITIAL_LOCATIONS[0],
        location_id: `11111111-9999-4111-8111-${String(index + 1).padStart(12, '0')}`,
        location_code: `BIN-${String(index + 1).padStart(2, '0')}`,
        name: `Shelf Bin ${index + 1}`,
      })
    );

    server.use(
      http.get('*/api/v1/inventory/locations', ({ request }) => {
        const url = new URL(request.url);
        const page = Number(url.searchParams.get('page') ?? '1');
        const pageSize = Number(url.searchParams.get('page_size') ?? '20');
        const start = (page - 1) * pageSize;
        const items = generatedLocations.slice(start, start + pageSize);
        return HttpResponse.json({
          items,
          page,
          page_size: pageSize,
          total_count: generatedLocations.length,
          next_cursor:
            page * pageSize < generatedLocations.length
              ? String(page + 1)
              : null,
        });
      })
    );

    renderWithProviders(<StorageLocationsTab branchId={DOWNTOWN_BRANCH_ID} />);

    await waitFor(() => {
      expect(screen.getByText('BIN-01')).toBeDefined();
      expect(screen.getByText('Showing 1–20 of 22')).toBeDefined();
    });

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => {
      expect(screen.getByText('BIN-21')).toBeDefined();
      expect(screen.getByText('BIN-22')).toBeDefined();
      expect(screen.getByText('Showing 21–22 of 22')).toBeDefined();
    });

    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    await waitFor(() => {
      expect(screen.getByText('BIN-01')).toBeDefined();
      expect(screen.getByText('Showing 1–20 of 22')).toBeDefined();
    });
  });

  it('allows Pharmacist write on both Cloud and BranchLocal, and keeps Cashier read-only on both', async () => {
    for (const runtimeMode of ['Cloud', 'BranchLocal'] as const) {
      setAuthUser({
        role: 'Pharmacist',
        scopes: ['inventory:read', 'inventory:write'],
        runtimeMode,
      });
      const { unmount } = renderWithProviders(
        <StorageLocationsTab branchId={DOWNTOWN_BRANCH_ID} />
      );
      await waitFor(() => {
        expect(screen.getByText('MAIN-SELLABLE')).toBeDefined();
      });
      expect(
        screen.getByRole('button', { name: 'Add Location' })
      ).toBeDefined();
      expect(
        screen.getAllByRole('button', { name: 'Edit' }).length
      ).toBeGreaterThan(0);
      unmount();
    }

    for (const runtimeMode of ['Cloud', 'BranchLocal'] as const) {
      setAuthUser({
        role: 'Cashier',
        scopes: ['inventory:read'],
        runtimeMode,
      });
      const { unmount } = renderWithProviders(
        <StorageLocationsTab branchId={DOWNTOWN_BRANCH_ID} />
      );
      await waitFor(() => {
        expect(screen.getByText('MAIN-SELLABLE')).toBeDefined();
      });
      expect(screen.getByText('Read-only access')).toBeDefined();
      expect(screen.queryByRole('button', { name: 'Add Location' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
      unmount();
    }
  });
});
