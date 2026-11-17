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
import currentUserContextFixture from '@contracts/fixtures/current-user-context.json';
import productFixture from '@contracts/fixtures/product.json';
import { resetMockBranches } from '../../../mocks/branchHandlers';
import { handlers } from '../../../mocks/handlers';
import {
  INITIAL_CATEGORIES,
  resetMockCatalog,
} from '../../../mocks/productHandlers';
import { useAuthStore } from '../../../stores/authStore';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { CurrentUserContext } from '../../../types/api';
import { ProductsPage } from './ProductsPage';

const server = setupServer(...handlers);

function seedAuth(
  overrides: Partial<CurrentUserContext> = {},
  activeBranchId: string | null = 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa'
) {
  useAuthStore.setState({
    currentUser: {
      ...(currentUserContextFixture as CurrentUserContext),
      roles: ['Admin'],
      scopes: ['inventory:read', 'inventory:write'],
      runtime: 'Cloud',
      branch_scope: 'ALL',
      branch_ids: [],
      ...overrides,
    },
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
      activeBranchId: null,
      isAuthenticated: false,
      isInitializing: false,
    });
  });

  it('loads the catalog list and tree, navigates to Product Details, edits from details, and returns to list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductsPage />);

    expect(
      await screen.findByRole('heading', { name: 'Products' })
    ).toBeDefined();

    const productButton = await screen.findByRole('button', {
      name: productFixture.name,
    });
    expect(productButton).toBeDefined();
    const categoryList = screen.getByRole('list', {
      name: 'Product categories',
    });
    expect(within(categoryList).getByText('Analgesics')).toBeDefined();

    await user.click(productButton);

    expect(
      await screen.findByRole('heading', { name: productFixture.name })
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: /Back to products/i })
    ).toBeDefined();
    expect(screen.getByText('Tax rate')).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Edit product/i }));
    const dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText('Product name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Panadol Extra 500mg Tablets');
    await user.click(
      within(dialog).getByRole('button', { name: /Save changes/i })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    expect(
      await screen.findByRole('heading', {
        name: 'Panadol Extra 500mg Tablets',
      })
    ).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Back to products/i }));

    expect(
      await screen.findByRole('button', {
        name: 'Panadol Extra 500mg Tablets',
      })
    ).toBeDefined();
  });

  it('navigates all 4 Product Details tabs and mutates UOM and branch reorder settings via global MSW handlers', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductsPage />);

    await user.click(
      await screen.findByRole('button', { name: productFixture.name })
    );

    await user.click(screen.getByRole('tab', { name: 'UOMs & Pricing' }));
    expect(await screen.findByText('Tablet (base)')).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Add UOM/i }));
    const uomDialog = await screen.findByRole('dialog');
    await user.type(within(uomDialog).getByLabelText('UOM code'), 'carton');
    await user.type(
      within(uomDialog).getByLabelText('Conversion factor'),
      '240'
    );
    await user.type(
      within(uomDialog).getByLabelText('Display name'),
      'Carton of 240'
    );
    await user.type(
      within(uomDialog).getByLabelText('Sale unit price (EGP)'),
      '275.00'
    );
    await user.click(
      within(uomDialog).getByRole('button', { name: /Add UOM/i })
    );

    expect(await screen.findByText('Carton of 240')).toBeDefined();

    await user.click(
      screen.getByRole('tab', { name: 'Branch Reorder Settings' })
    );
    const maxInput = await screen.findByLabelText('Maximum stock quantity');
    await user.clear(maxInput);
    await user.type(maxInput, '500');
    await user.click(
      screen.getByRole('button', { name: /Save reorder rule/i })
    );

    expect(
      await screen.findByText(`Reorder rule saved for ${productFixture.name}`)
    ).toBeDefined();

    await user.click(screen.getByRole('tab', { name: 'AI Demand Forecast' }));
    expect(screen.getByText('Model: Unavailable')).toBeDefined();
    expect(screen.getByText('Seasonal indicator: Unavailable')).toBeDefined();
  });

  it('creates a new category and a new product from the list screen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductsPage />);

    await screen.findByRole('button', { name: productFixture.name });

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
      INITIAL_CATEGORIES[0].category_id
    );
    await user.type(within(prodDialog).getByLabelText('SKU'), 'VIT-D3-1000');
    await user.type(
      within(prodDialog).getByLabelText('Product name'),
      'Vitamin D3 1000 IU'
    );
    await user.type(within(prodDialog).getByLabelText('Base UOM code'), 'cap');
    await user.type(
      within(prodDialog).getByLabelText('Display name'),
      'Capsule'
    );
    await user.type(
      within(prodDialog).getByLabelText('Sale unit price'),
      '85.00'
    );
    await user.click(
      within(prodDialog).getByRole('button', { name: /Create product/i })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(
      await screen.findByRole('button', { name: 'Vitamin D3 1000 IU' })
    ).toBeDefined();
  });

  it('enforces single read-only banner on BranchLocal and hides Branch Reorder Settings for Cashier', async () => {
    const user = userEvent.setup();
    seedAuth({ runtime: 'BranchLocal' });
    renderWithProviders(<ProductsPage />);

    const notices = await screen.findAllByText(
      /Catalog changes require the Cloud deployment\./i
    );
    expect(notices).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Add product/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add category/i })).toBeNull();

    await user.click(
      await screen.findByRole('button', { name: productFixture.name })
    );
    expect(screen.queryByRole('button', { name: /Edit product/i })).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'UOMs & Pricing' }));
    expect(
      await screen.findByText(/UOM changes require the Cloud deployment/i)
    ).toBeDefined();

    cleanup();
    seedAuth({
      roles: ['Cashier'],
      scopes: ['inventory:read'],
      runtime: 'Cloud',
      branch_scope: 'ASSIGNED',
      branch_ids: ['d4e5f6a7-3333-4c44-9d55-bbccddeeffaa'],
    });
    renderWithProviders(<ProductsPage />);

    await user.click(
      await screen.findByRole('button', { name: productFixture.name })
    );
    expect(
      screen.queryByRole('tab', { name: 'Branch Reorder Settings' })
    ).toBeNull();
  });
});
