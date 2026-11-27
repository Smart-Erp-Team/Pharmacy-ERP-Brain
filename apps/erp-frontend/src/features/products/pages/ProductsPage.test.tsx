/** @vitest-environment jsdom */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { setupServer } from 'msw/node';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  branchHandlers,
  MOCK_BRANCH_IDS,
  resetMockBranches,
} from '../../../mocks/branchHandlers';
import {
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  ORGANIZATION_ID,
  productHandlers,
  resetMockCatalog,
} from '../../../mocks/productHandlers';
import { useAuthStore } from '../../../stores/authStore';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { CurrentUser } from '../../../types/api';
import { ProductsPage } from './ProductsPage';

const AUGMENTIN = INITIAL_PRODUCTS[0];
const server = setupServer(...branchHandlers, ...productHandlers);

function requireInput(element: HTMLElement): HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) {
    throw new Error('Expected HTMLInputElement');
  }
  return element;
}

function buildAuthUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    user_id: '11111111-4444-4111-8111-000000000001',
    employee_id: '11111111-3333-4111-8111-000000000001',
    organization_id: ORGANIZATION_ID,
    username: 'admin@medcare.test',
    role: 'Admin',
    branch_scope: 'ALL',
    branch_ids: [],
    scopes: [
      'user:admin',
      'inventory:read',
      'inventory:write',
      'sales:read',
      'sales:write',
    ],
    runtime_mode: 'Cloud',
    ...overrides,
  };
}

function seedAuth(
  overrides: Partial<CurrentUser> = {},
  activeBranchId: string | null = MOCK_BRANCH_IDS.DOWNTOWN
) {
  useAuthStore.setState({
    currentUser: buildAuthUser(overrides),
    organizationCode: 'MEDCARE',
    activeBranchId,
    isAuthenticated: true,
    isInitializing: false,
  });
}

describe('ProductsPage integration', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    resetMockCatalog();
    resetMockBranches();
    seedAuth();
  });

  afterEach(() => {
    cleanup();
    useAuthStore.setState({
      currentUser: null,
      organizationCode: null,
      activeBranchId: null,
      isAuthenticated: false,
      isInitializing: false,
    });
  });

  it('loads the MEDCARE catalog list and tree, navigates to Product Details, edits from details, and returns to list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductsPage />);

    expect(
      await screen.findByRole('heading', { name: 'Products' })
    ).toBeDefined();

    const productButton = await screen.findByRole('button', {
      name: AUGMENTIN.name,
    });
    expect(productButton).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Panadol Extra 500mg' })
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Vitamin D3 5000 IU' })
    ).toBeDefined();
    const categoryList = screen.getByRole('list', {
      name: 'Product categories',
    });
    expect(within(categoryList).getByText('Antibiotics')).toBeDefined();
    expect(within(categoryList).getByText('Analgesics')).toBeDefined();

    await user.click(productButton);

    expect(
      await screen.findByRole('heading', { name: AUGMENTIN.name })
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: /Back to products/i })
    ).toBeDefined();
    expect(screen.getByText('Tax rate')).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Edit product/i }));
    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText('Product name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Augmentin 1g Tablets Updated');
    await user.click(
      within(dialog).getByRole('button', { name: /Save changes/i })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    expect(
      await screen.findByRole('heading', {
        name: 'Augmentin 1g Tablets Updated',
      })
    ).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Back to products/i }));

    expect(
      await screen.findByRole('button', {
        name: 'Augmentin 1g Tablets Updated',
      })
    ).toBeDefined();
  });

  it('navigates all 4 Product Details tabs and mutates UOM and MED-DT branch reorder settings', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductsPage />);

    await user.click(
      await screen.findByRole('button', { name: AUGMENTIN.name })
    );

    await user.click(screen.getByRole('tab', { name: 'UOMs & Pricing' }));
    expect(await screen.findByText('Strip of 7')).toBeDefined();
    expect(screen.getByText('Box of 14')).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Add UOM/i }));
    const uomDialog = await screen.findByRole('dialog');
    await user.type(within(uomDialog).getByLabelText('UOM code'), 'CARTON');
    await user.type(
      within(uomDialog).getByLabelText('Conversion factor'),
      '140'
    );
    await user.type(
      within(uomDialog).getByLabelText('Display name'),
      'Carton of 140'
    );
    await user.click(
      within(uomDialog).getByRole('switch', { name: 'Sellable' })
    );
    await user.type(
      within(uomDialog).getByLabelText('Sale unit price (EGP)'),
      '1350.00'
    );
    await user.click(
      within(uomDialog).getByRole('button', { name: /Add UOM/i })
    );

    expect(await screen.findByText('Carton of 140')).toBeDefined();

    await user.click(
      screen.getByRole('tab', { name: 'Branch Reorder Settings' })
    );
    const maxInput = requireInput(
      await screen.findByLabelText('Maximum stock quantity')
    );
    await waitFor(() => {
      expect(maxInput.value).toBe('500');
    });
    await user.clear(maxInput);
    await user.type(maxInput, '650');
    await user.click(
      screen.getByRole('button', { name: /Save reorder rule/i })
    );

    expect(
      await screen.findByText(`Reorder rule saved for ${AUGMENTIN.name}`)
    ).toBeDefined();

    await user.click(screen.getByRole('tab', { name: 'AI Demand Forecast' }));
    expect(screen.getByText('Model: Unavailable')).toBeDefined();
    expect(screen.getByText('Seasonal indicator: Unavailable')).toBeDefined();
  });

  it('creates a new category and a new product from the list screen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductsPage />);

    await screen.findByRole('button', { name: AUGMENTIN.name });

    await user.click(screen.getByRole('button', { name: /Add category/i }));
    const catDialog = await screen.findByRole('dialog');
    await user.type(
      within(catDialog).getByLabelText('Category code'),
      'CAT-SUP'
    );
    await user.type(
      within(catDialog).getByLabelText('Category name'),
      'Supplements'
    );
    await user.click(
      within(catDialog).getByRole('button', { name: /Create category/i })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    const categoryList = screen.getByRole('list', {
      name: 'Product categories',
    });
    expect(within(categoryList).getByText('Supplements')).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Add product/i }));
    const prodDialog = await screen.findByRole('dialog');
    await user.selectOptions(
      within(prodDialog).getByLabelText('Category'),
      INITIAL_CATEGORIES[2].category_id
    );
    await user.type(within(prodDialog).getByLabelText('SKU'), 'MED-IBP-400');
    await user.type(
      within(prodDialog).getByLabelText('Product name'),
      'Brufen 400mg Tablets'
    );
    await user.type(within(prodDialog).getByLabelText('Base UOM code'), 'TAB');
    await user.type(
      within(prodDialog).getByLabelText('Display name'),
      'Tablet'
    );
    await user.type(
      within(prodDialog).getByLabelText('Sale unit price'),
      '2.50'
    );
    await user.click(
      within(prodDialog).getByRole('button', { name: /Create product/i })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(
      await screen.findByRole('button', { name: 'Brufen 400mg Tablets' })
    ).toBeDefined();
  });

  it('enforces single read-only banner on BranchLocal and allows Cashier read-only Branch Reorder Settings on Cloud', async () => {
    const user = userEvent.setup();
    seedAuth({ runtime_mode: 'BranchLocal' });
    renderWithProviders(<ProductsPage />);

    const notices = await screen.findAllByText(
      /Catalog changes require the Cloud deployment\./i
    );
    expect(notices).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Add product/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add category/i })).toBeNull();

    await user.click(
      await screen.findByRole('button', { name: AUGMENTIN.name })
    );
    expect(screen.queryByRole('button', { name: /Edit product/i })).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'UOMs & Pricing' }));
    expect(
      await screen.findByText(/UOM changes require the Cloud deployment/i)
    ).toBeDefined();

    cleanup();
    seedAuth(
      {
        role: 'Cashier',
        scopes: ['inventory:read', 'sales:read', 'sales:write'],
        runtime_mode: 'Cloud',
        branch_scope: 'ASSIGNED',
        branch_ids: [MOCK_BRANCH_IDS.DOWNTOWN],
      },
      MOCK_BRANCH_IDS.DOWNTOWN
    );
    renderWithProviders(<ProductsPage />);

    await user.click(
      await screen.findByRole('button', { name: AUGMENTIN.name })
    );
    expect(screen.queryByRole('button', { name: /Edit product/i })).toBeNull();

    await user.click(
      screen.getByRole('tab', { name: 'Branch Reorder Settings' })
    );
    await waitFor(() => {
      expect(requireInput(screen.getByLabelText('Reorder point')).value).toBe(
        '50'
      );
    });
    expect(requireInput(screen.getByLabelText('Reorder point')).disabled).toBe(
      true
    );
    expect(
      screen.queryByRole('button', { name: /Save reorder rule/i })
    ).toBeNull();
  });
});
