/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
import currentUserFixture from '@contracts/fixtures/current-user-context.json';
import inventoryBalanceFixture from '@contracts/fixtures/inventory-balance.json';
import {
  branchHandlers,
  resetMockBranches,
} from '../../../mocks/branchHandlers';
import {
  inventoryHandlers,
  resetMockInventory,
} from '../../../mocks/inventoryHandlers';
import {
  productHandlers,
  resetMockCatalog,
} from '../../../mocks/productHandlers';
import { useAuthStore } from '../../../stores/authStore';
import type {
  CurrentUserContext,
  PermissionScope,
  Role,
  RuntimeMode,
} from '../../../types/api';
import { StockBalancesTab } from './StockBalancesTab';
import { StockOverviewTab } from './StockOverviewTab';
import { StorageLocationsTab } from './StorageLocationsTab';

const CAIRO_BRANCH_ID = inventoryBalanceFixture.branch_id;
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
  roles: Role[];
  scopes: PermissionScope[];
  runtime: RuntimeMode;
  branchScope?: 'ALL' | 'ASSIGNED';
}) {
  const user: CurrentUserContext = {
    ...currentUserFixture,
    user: {
      ...currentUserFixture.user,
      role: options.roles[0] ?? 'Admin',
      branch_scope: options.branchScope ?? 'ALL',
    },
    roles: options.roles,
    scopes: options.scopes,
    branch_scope: options.branchScope ?? 'ALL',
    branch_ids: [CAIRO_BRANCH_ID],
    runtime: options.runtime,
  };
  useAuthStore.setState({
    currentUser: user,
    activeBranchId: CAIRO_BRANCH_ID,
    isAuthenticated: true,
    isInitializing: false,
  });
}

function renderWithQuery(ui: React.ReactElement) {
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

beforeAll(() => server.listen());
beforeEach(() => {
  resetMockBranches();
  resetMockCatalog();
  resetMockInventory();
  setAuthUser({
    roles: ['Admin'],
    scopes: ['inventory:read', 'inventory:write'],
    runtime: 'Cloud',
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

describe('StockOverviewTab', () => {
  it('renders computed KPIs, explicit Unavailable Brain telemetry, and flagged lots', async () => {
    renderWithQuery(
      <StockOverviewTab
        branchId={CAIRO_BRANCH_ID}
        branchName="Cairo Main Branch (CAI-01)"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('7,600')).toBeDefined();
    });

    expect(screen.getByText('Brain Telemetry — Unavailable')).toBeDefined();
    expect(screen.getByText('AUG-2026-A')).toBeDefined();
    expect(screen.getByText('AUG-2026-Q')).toBeDefined();
    expect(screen.getByText('AUG-2020-E')).toBeDefined();
    expect(screen.getByText('Expiring soon')).toBeDefined();
    expect(screen.getByText('QUARANTINED')).toBeDefined();
    expect(screen.getByText('Expired')).toBeDefined();
  });

  it('shows Unavailable instead of fabricating 0 on error and retries cleanly', async () => {
    let failOnce = true;
    server.use(
      http.get('*/api/v1/inventory/balances', () => {
        if (failOnce) {
          failOnce = false;
          return HttpResponse.json(
            { error: { code: 'INTERNAL_ERROR', message: 'Boom' } },
            { status: 500 }
          );
        }
        return undefined;
      })
    );

    renderWithQuery(
      <StockOverviewTab
        branchId={CAIRO_BRANCH_ID}
        branchName="Cairo Main Branch (CAI-01)"
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText('Could not load inventory overview')
      ).toBeDefined();
    });
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByText('7,600')).toBeDefined();
    });
  });
});

describe('StockBalancesTab', () => {
  it('renders FEFO batch ordering, NON-LOT, nearing expiry, QUARANTINED/EXPIRED, and zero Reserved', async () => {
    renderWithQuery(<StockBalancesTab branchId={CAIRO_BRANCH_ID} />);

    await waitFor(() => {
      expect(screen.getByText('Augmentin 1g Tablets')).toBeDefined();
      expect(screen.getByText('Panadol 500mg Tablets')).toBeDefined();
    });

    expect(screen.queryByText(/Reserved/i)).toBeNull();

    const typeSelect = screen.getByLabelText(
      'Location type'
    ) as HTMLSelectElement;
    const optionValues = Array.from(typeSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(['ALL', 'SELLABLE', 'QUARANTINE', 'SCRAP']);
    expect(optionValues.includes('DAMAGED')).toBe(false);

    const expandAug = screen.getByRole('button', {
      name: 'Toggle batch breakdown for Augmentin 1g Tablets',
    });
    expect(expandAug.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(expandAug);
    expect(expandAug.getAttribute('aria-expanded')).toBe('true');

    const batchCells = screen
      .getAllByText(/^AUG-/)
      .map((node) => node.textContent);
    expect(batchCells).toEqual([
      'AUG-2020-E',
      'AUG-2026-A',
      'AUG-2026-Q',
      'AUG-2027-B',
    ]);
    expect(screen.getByText('Expiring soon')).toBeDefined();
    expect(screen.getByText('QUARANTINED')).toBeDefined();
    expect(screen.getByText('EXPIRED')).toBeDefined();

    const expandPanadol = screen.getByRole('button', {
      name: 'Toggle batch breakdown for Panadol 500mg Tablets',
    });
    fireEvent.click(expandPanadol);
    expect(screen.getAllByText('NON-LOT').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThanOrEqual(2);
  });

  it('filters by search, location type, expiry status, and clears filters', async () => {
    renderWithQuery(<StockBalancesTab branchId={CAIRO_BRANCH_ID} />);

    await waitFor(() => {
      expect(screen.getByText('Augmentin 1g Tablets')).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText('Search products'), {
      target: { value: '6221048002345' },
    });
    expect(screen.getByText('Augmentin 1g Tablets')).toBeDefined();
    expect(screen.queryByText('Panadol 500mg Tablets')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Panadol 500mg Tablets')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Location type'), {
      target: { value: 'QUARANTINE' },
    });
    expect(screen.getByText('Augmentin 1g Tablets')).toBeDefined();
    expect(screen.queryByText('Panadol 500mg Tablets')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    fireEvent.change(screen.getByLabelText('Expiry status'), {
      target: { value: 'NON_LOT' },
    });
    expect(screen.getByText('Panadol 500mg Tablets')).toBeDefined();
    expect(screen.queryByText('Augmentin 1g Tablets')).toBeNull();
  });
});

describe('StorageLocationsTab', () => {
  it('supports create, duplicate 409 mapping, edit, and soft toggle for Admin on Cloud', async () => {
    renderWithQuery(<StorageLocationsTab branchId={CAIRO_BRANCH_ID} />);

    await waitFor(() => {
      expect(screen.getByText('MAIN-SELL')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Location' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Location code'), {
      target: { value: 'MAIN-SELL' },
    });
    fireEvent.change(within(dialog).getByLabelText('Location name'), {
      target: { value: 'Duplicate Shelf' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Create location' })
    );

    await waitFor(() => {
      expect(within(dialog).getByText('Could not save location')).toBeDefined();
    });
    expect(within(dialog).getAllByRole('alert').length).toBeGreaterThanOrEqual(
      1
    );

    fireEvent.change(within(dialog).getByLabelText('Location code'), {
      target: { value: 'CAI-COLD' },
    });
    fireEvent.change(within(dialog).getByLabelText('Location name'), {
      target: { value: 'Cairo Cold Fridge' },
    });
    fireEvent.change(within(dialog).getByLabelText('Location type'), {
      target: { value: 'QUARANTINE' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Create location' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByText('CAI-COLD')).toBeDefined();
    });

    const editButtons = screen.getAllByRole('button', { name: 'Edit' });
    fireEvent.click(editButtons[0]);
    const editDialog = screen.getByRole('dialog');
    const saveButton = within(editDialog).getByRole('button', {
      name: 'Save changes',
    }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    fireEvent.change(within(editDialog).getByLabelText('Location name'), {
      target: { value: 'Cairo Cold Fridge Updated' },
    });
    expect(saveButton.disabled).toBe(false);
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByText('Cairo Cold Fridge Updated')).toBeDefined();
    });

    const toggleSwitch = screen.getByRole('switch', {
      name: 'Toggle CAI-COLD active',
    });
    fireEvent.click(toggleSwitch);
    await waitFor(() => {
      expect(screen.queryByText('CAI-COLD')).toBeNull();
    });
  });

  it('allows Pharmacist write on both Cloud and BranchLocal, and keeps Cashier read-only on both', async () => {
    for (const runtime of ['Cloud', 'BranchLocal'] as const) {
      setAuthUser({
        roles: ['Pharmacist'],
        scopes: ['inventory:read', 'inventory:write'],
        runtime,
      });
      const { unmount } = renderWithQuery(
        <StorageLocationsTab branchId={CAIRO_BRANCH_ID} />
      );
      await waitFor(() => {
        expect(screen.getByText('MAIN-SELL')).toBeDefined();
      });
      expect(
        screen.getByRole('button', { name: 'Add Location' })
      ).toBeDefined();
      expect(
        screen.getAllByRole('button', { name: 'Edit' }).length
      ).toBeGreaterThan(0);
      unmount();
    }

    for (const runtime of ['Cloud', 'BranchLocal'] as const) {
      setAuthUser({
        roles: ['Cashier'],
        scopes: ['inventory:read'],
        runtime,
      });
      const { unmount } = renderWithQuery(
        <StorageLocationsTab branchId={CAIRO_BRANCH_ID} />
      );
      await waitFor(() => {
        expect(screen.getByText('MAIN-SELL')).toBeDefined();
      });
      expect(screen.getByText('Read-only access')).toBeDefined();
      expect(screen.queryByRole('button', { name: 'Add Location' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
      unmount();
    }
  });
});
