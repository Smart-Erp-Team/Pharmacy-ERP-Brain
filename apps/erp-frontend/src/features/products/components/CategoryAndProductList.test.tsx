/** @vitest-environment jsdom */
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
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Plus } from 'lucide-react';
import { toast } from 'react-toastify';
import currentUserContextFixture from '@contracts/fixtures/current-user-context.json';
import inventoryBalanceFixture from '@contracts/fixtures/inventory-balance.json';
import productFixture from '@contracts/fixtures/product.json';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { PageHeading } from '../../../components/ui/PageHeading';
import { ApiClientError } from '../../../lib/api/client';
import {
  INITIAL_PRODUCTS,
  productHandlers,
  resetMockCatalog,
} from '../../../mocks/productHandlers';
import { useAuthStore } from '../../../stores/authStore';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type {
  CurrentUserContext,
  ProductCategoryDto,
} from '../../../types/api';
import { useProductsPageState } from '../hooks/useProductsPageState';
import { CategoryFormModal } from './CategoryFormModal';
import { CategoryTreePanel } from './CategoryTreePanel';
import { CreateProductModal } from './CreateProductModal';
import { EditProductModal } from './EditProductModal';
import { ProductsFilterBar } from './ProductsFilterBar';
import { ProductsTable } from './ProductsTable';

const server = setupServer(...productHandlers);

function buildSessionUser(
  overrides: Partial<CurrentUserContext> = {}
): CurrentUserContext {
  return {
    ...(currentUserContextFixture as CurrentUserContext),
    roles: ['Admin'],
    scopes: ['inventory:read', 'inventory:write'],
    runtime: 'Cloud',
    ...overrides,
  };
}

function seedAuthSession(overrides: Partial<CurrentUserContext> = {}) {
  useAuthStore.setState({
    currentUser: buildSessionUser(overrides),
    activeBranchId: 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa',
    isAuthenticated: true,
    isInitializing: false,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function CatalogWorkbenchHarness({ pageSize }: { pageSize?: number }) {
  const state = useProductsPageState({ pageSize });

  const productsError = state.productsQuery.isError
    ? state.productsQuery.error instanceof ApiClientError
      ? state.productsQuery.error.message
      : 'Unable to load products.'
    : null;

  const categoriesError = state.categoriesQuery.isError
    ? state.categoriesQuery.error instanceof ApiClientError
      ? state.categoriesQuery.error.message
      : 'Unable to load categories.'
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow="Operations"
        title="Products"
        description="Product catalog, units of measure, prices and the category tree."
        actions={
          state.canWriteCatalog ? (
            <Button
              variant="primary"
              leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
              onClick={state.openCreateProductModal}
            >
              Add product
            </Button>
          ) : undefined
        }
      />

      {state.selectedProductId ? (
        <div data-testid="selected-product-id">{state.selectedProductId}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(350px,1fr)]">
        <Card>
          <CardHeader title="Product list" />
          <ProductsFilterBar
            searchTerm={state.searchTerm}
            selectedCategoryId={state.selectedCategoryId}
            includeInactive={state.includeInactive}
            categories={state.categories}
            hasActiveFilters={state.hasActiveFilters}
            isBranchLocal={state.isBranchLocal}
            onSearchChange={state.handleSearchChange}
            onCategoryChange={state.handleCategoryChange}
            onIncludeInactiveChange={state.handleIncludeInactiveChange}
            onResetFilters={state.resetFilters}
          />
          <ProductsTable
            products={state.products}
            categoryNameById={state.categoryNameById}
            getCategoryName={state.getCategoryName}
            canWriteCatalog={state.canWriteCatalog}
            isLoading={state.productsQuery.isPending}
            errorMessage={productsError}
            togglingProductIds={state.togglingProductIds}
            hasActiveFilters={state.hasActiveFilters}
            pageIndex={state.pageIndex}
            pageSize={state.pageSize}
            nextCursor={state.productsQuery.data?.nextCursor}
            onPageChange={state.handlePageChange}
            onRetry={() => {
              void state.productsQuery.refetch();
            }}
            onResetFilters={state.resetFilters}
            onAddProduct={state.openCreateProductModal}
            onViewProduct={(product) =>
              state.setSelectedProductId(product.product_id)
            }
            onEditProduct={state.openEditProductModal}
            onToggleActive={(product, nextActive) => {
              void state.handleToggleActive(product, nextActive);
            }}
          />
        </Card>

        <CategoryTreePanel
          nodes={state.categoryTree}
          selectedCategoryId={state.selectedCategoryId}
          includeInactive={state.includeInactive}
          canWriteCatalog={state.canWriteCatalog}
          isLoading={state.categoriesQuery.isPending}
          errorMessage={categoriesError}
          onRetry={() => {
            void state.categoriesQuery.refetch();
          }}
          onSelectCategory={state.handleCategorySelect}
          onAddCategory={state.openCreateCategoryModal}
          onEditCategory={state.openEditCategoryModal}
        />
      </div>

      <CategoryFormModal
        open={state.categoryModalState.open}
        category={state.categoryModalState.category}
        categories={state.categories}
        onClose={state.closeCategoryModal}
      />

      <CreateProductModal
        open={state.productModalState.mode === 'create'}
        categories={state.categories}
        isCategoriesError={state.categoriesQuery.isError}
        isRetryingCategories={state.categoriesQuery.isFetching}
        onRetryCategories={() => {
          void state.categoriesQuery.refetch();
        }}
        onClose={state.closeProductModal}
      />

      <EditProductModal
        open={state.productModalState.mode === 'edit'}
        product={state.productModalState.product}
        categories={state.categories}
        isCategoriesError={state.categoriesQuery.isError}
        isRetryingCategories={state.categoriesQuery.isFetching}
        onRetryCategories={() => {
          void state.categoriesQuery.refetch();
        }}
        onClose={state.closeProductModal}
      />
    </div>
  );
}

beforeAll(() => server.listen());
beforeEach(() => {
  resetMockCatalog();
  seedAuthSession();
});
afterEach(() => {
  toast.dismiss();
  server.resetHandlers();
  cleanup();
  useAuthStore.setState({
    currentUser: null,
    activeBranchId: null,
    isAuthenticated: false,
    isInitializing: false,
  });
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('CategoryTreePanel and CategoryFormModal', () => {
  it('renders category hierarchy with depth indentation capped at 3, toggles filter on click, and excludes self + descendants when editing', async () => {
    const user = userEvent.setup();
    const deepCategories: ProductCategoryDto[] = [
      {
        category_id: 'cat-0',
        parent_category_id: null,
        code: 'CAT-D0',
        name: 'Level Zero',
        description: 'Root group',
        is_active: true,
      },
      {
        category_id: 'cat-1',
        parent_category_id: 'cat-0',
        code: 'CAT-D1',
        name: 'Level One',
        is_active: true,
      },
      {
        category_id: 'cat-2',
        parent_category_id: 'cat-1',
        code: 'CAT-D2',
        name: 'Level Two',
        is_active: true,
      },
      {
        category_id: 'cat-3',
        parent_category_id: 'cat-2',
        code: 'CAT-D3',
        name: 'Level Three',
        is_active: true,
      },
      {
        category_id: 'cat-4',
        parent_category_id: 'cat-3',
        code: 'CAT-D4',
        name: 'Level Four',
        is_active: true,
      },
      {
        category_id: 'cat-other',
        parent_category_id: null,
        code: 'CAT-OTH',
        name: 'Other Root',
        is_active: true,
      },
    ];

    server.use(
      http.get('*/api/v1/product-categories', () =>
        HttpResponse.json({ items: deepCategories, nextCursor: null })
      )
    );

    renderWithProviders(<CatalogWorkbenchHarness />);

    const categoryTree = await screen.findByRole('list', {
      name: 'Product categories',
    });
    const levelZeroBtn = within(categoryTree).getByRole('button', {
      name: /^Level Zero/i,
    });
    const levelThreeBtn = within(categoryTree).getByRole('button', {
      name: /^Level Three/i,
    });
    const levelFourBtn = within(categoryTree).getByRole('button', {
      name: /^Level Four/i,
    });

    expect(
      levelZeroBtn.closest('[data-depth]')?.getAttribute('data-depth')
    ).toBe('0');
    expect(
      levelThreeBtn.closest('[data-depth]')?.getAttribute('data-depth')
    ).toBe('3');
    expect(
      levelFourBtn.closest('[data-depth]')?.getAttribute('data-depth')
    ).toBe('3');
    expect(
      levelFourBtn.closest('[data-depth]')?.className.includes('pl-12')
    ).toBe(true);

    // Click to filter by Level Zero, then click again to clear
    await user.click(levelZeroBtn);
    expect(levelZeroBtn.getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe(
      'cat-0'
    );

    await user.click(levelZeroBtn);
    expect(levelZeroBtn.getAttribute('aria-pressed')).toBe('false');
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe(
      ''
    );

    // Edit Level Zero -> Parent select excludes self (cat-0) and all descendants (cat-1..cat-4)
    await user.click(screen.getByRole('button', { name: 'Edit Level Zero' }));
    const dialog = screen.getByRole('dialog');
    const parentSelect = within(dialog).getByLabelText('Parent category');
    const parentOptionValues = Array.from(
      parentSelect.querySelectorAll('option')
    ).map((opt) => opt.value);

    expect(parentOptionValues).toEqual(['', 'cat-other']);
    expect(
      within(dialog)
        .getByRole('button', { name: 'Save changes' })
        .hasAttribute('disabled')
    ).toBe(true);
  });

  it('creates and edits categories, maps 409 duplicate code, and supports inactive inspection', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CatalogWorkbenchHarness />);

    const categoryTree = await screen.findByRole('list', {
      name: 'Product categories',
    });
    expect(within(categoryTree).getByText('Analgesics')).toBeDefined();
    expect(screen.queryByText('Discontinued Seasonal')).toBeNull();

    // Create validation & 409 duplicate code
    await user.click(screen.getByRole('button', { name: 'Add category' }));
    const dialog = screen.getByRole('dialog');

    await user.click(
      within(dialog).getByRole('button', { name: 'Create category' })
    );
    expect(
      await within(dialog).findByText('Category code is required')
    ).toBeDefined();
    expect(within(dialog).getByText('Category name is required')).toBeDefined();

    await user.type(within(dialog).getByLabelText('Category code'), 'CAT-ANA');
    await user.type(
      within(dialog).getByLabelText('Category name'),
      'Duplicate Pain'
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create category' })
    );

    expect(
      await within(dialog).findByText(/already exists in this organization/i)
    ).toBeDefined();
    expect(
      within(dialog).getByText('Category code must be unique.')
    ).toBeDefined();

    // Fix code & create under Analgesics
    const codeInput = within(dialog).getByLabelText('Category code');
    const nameInput = within(dialog).getByLabelText('Category name');
    await user.clear(codeInput);
    await user.type(codeInput, 'CAT-DERM');
    await user.clear(nameInput);
    await user.type(nameInput, 'Dermatology');
    await user.type(
      within(dialog).getByLabelText('Description (optional)'),
      'Skin treatments'
    );
    await user.selectOptions(
      within(dialog).getByLabelText('Parent category'),
      'c9d8e7f6-4444-4d55-8e66-cbccddeeffbb'
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create category' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await within(categoryTree).findByText('Dermatology')).toBeDefined();
    expect(within(categoryTree).getByText('CAT-DERM')).toBeDefined();

    // Edit Dermatology -> rename and deactivate
    await user.click(screen.getByRole('button', { name: 'Edit Dermatology' }));
    const editDialog = screen.getByRole('dialog');
    const editName = within(editDialog).getByLabelText('Category name');
    await user.clear(editName);
    await user.type(editName, 'Dermatology & Topical');
    await user.click(
      within(editDialog).getByRole('switch', { name: 'Active category' })
    );
    await user.click(
      within(editDialog).getByRole('button', { name: 'Save changes' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(
      within(categoryTree).queryByText('Dermatology & Topical')
    ).toBeNull();

    // Enable Include inactive -> shows both archived categories with Inactive badge
    await user.click(screen.getByRole('switch', { name: 'Include inactive' }));
    expect(
      await within(categoryTree).findByText('Dermatology & Topical')
    ).toBeDefined();
    expect(
      within(categoryTree).getByText('Discontinued Seasonal')
    ).toBeDefined();
  });
});

describe('ProductsTable, filters, pagination, and Create/Edit Product modals', () => {
  it('renders loading skeleton, handles errors with retry and Category unavailable fallback, filters, paginates, and shows no delete button', async () => {
    const user = userEvent.setup();
    let failProducts = true;
    let resolveGate: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      resolveGate = resolve;
    });

    server.use(
      http.get('*/api/v1/products', async () => {
        await gate;
        if (failProducts) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Temporary catalog outage',
                trace_id: 'trace-prod-500',
              },
            },
            { status: 500 }
          );
        }
        return undefined;
      }),
      http.get('*/api/v1/product-categories', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Categories down' } },
          { status: 500 }
        )
      )
    );

    renderWithProviders(<CatalogWorkbenchHarness />);

    const loadingRegion = screen.getByRole('status', {
      name: 'Loading products',
    });
    expect(loadingRegion.getAttribute('aria-busy')).toBe('true');

    resolveGate?.();
    expect(await screen.findByText('Temporary catalog outage')).toBeDefined();
    expect(await screen.findByText('Categories down')).toBeDefined();

    // Retry products while categories stay down -> 'Category unavailable' fallback
    failProducts = false;
    await user.click(screen.getAllByRole('button', { name: 'Retry' })[0]);
    expect(await screen.findByText('Panadol 500mg Tablets')).toBeDefined();
    expect(screen.getAllByText('Category unavailable').length).toBeGreaterThan(
      0
    );
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();

    // Recover categories via tree Retry
    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.queryByText('Category unavailable')).toBeNull();
    });

    // Search by barcode and SKU
    const searchInput = screen.getByLabelText('Search products');
    await user.type(searchInput, '6221048001234');
    await waitFor(() => {
      expect(screen.queryByText('Augmentin 1g Tablets')).toBeNull();
    });
    expect(screen.getByText('Panadol 500mg Tablets')).toBeDefined();

    // Click product name opens details callback; View button also opens details
    await user.click(
      screen.getByRole('button', { name: 'Panadol 500mg Tablets' })
    );
    expect(screen.getByTestId('selected-product-id').textContent).toBe(
      productFixture.product_id
    );

    const panadolRow = screen.getByText('Panadol 500mg Tablets').closest('tr');
    if (!panadolRow) {
      throw new Error('Expected Panadol row');
    }
    await user.click(within(panadolRow).getByRole('button', { name: 'View' }));
    expect(screen.getByTestId('selected-product-id').textContent).toBe(
      productFixture.product_id
    );

    // Search with no matches triggers filtered empty state -> Clear filters recovers
    await user.clear(searchInput);
    await user.type(searchInput, 'NON-EXISTENT-SKU');
    expect(
      await screen.findByText('No products match your filters')
    ).toBeDefined();

    // Clear filters -> test Include inactive shows Legacy Aspirin with barcode 'Unavailable'
    const clearButtons = screen.getAllByRole('button', {
      name: 'Clear filters',
    });
    expect(clearButtons).toHaveLength(2);
    await user.click(clearButtons[1]);
    expect(await screen.findByText('Augmentin 1g Tablets')).toBeDefined();
    await user.click(screen.getByRole('switch', { name: 'Include inactive' }));
    expect(
      await screen.findByText('Legacy Aspirin 75mg Tablets')
    ).toBeDefined();
    const aspirinRow = screen
      .getByText('Legacy Aspirin 75mg Tablets')
      .closest('tr');
    if (!aspirinRow) {
      throw new Error('Expected Legacy Aspirin row');
    }
    expect(within(aspirinRow).getByText('Unavailable')).toBeDefined();
    expect(within(aspirinRow).getByText('0%')).toBeDefined();
  });

  it('paginates with fresh forward cursor and resets pagination on filter changes', async () => {
    const user = userEvent.setup();
    let page1Requests = 0;
    const seenCursors: Array<string | null> = [];

    server.use(
      http.get('*/api/v1/products', ({ request }) => {
        const url = new URL(request.url);
        const cursor = url.searchParams.get('cursor');
        seenCursors.push(cursor);
        if (cursor === 'cursor-2-fresh' || cursor === 'cursor-2') {
          return HttpResponse.json({
            items: [INITIAL_PRODUCTS[2]],
            nextCursor: null,
          });
        }
        page1Requests += 1;
        return HttpResponse.json({
          items: [INITIAL_PRODUCTS[0], INITIAL_PRODUCTS[1]],
          nextCursor: page1Requests === 1 ? 'cursor-2' : 'cursor-2-fresh',
        });
      })
    );

    renderWithProviders(<CatalogWorkbenchHarness pageSize={2} />);
    expect(await screen.findByText('Panadol 500mg Tablets')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(
      await screen.findByText('Cetal Pediatric Suspension 120ml')
    ).toBeDefined();

    // Back to page 1, then filter resets pagination cleanly
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(await screen.findByText('Panadol 500mg Tablets')).toBeDefined();

    // Filter change triggers fresh page 1 fetch; going forward uses fresh nextCursor
    await user.selectOptions(
      screen.getByLabelText('Category'),
      'c9d8e7f6-4444-4d55-8e66-cbccddeeffbb'
    );
    await waitFor(() => {
      expect(page1Requests).toBeGreaterThanOrEqual(2);
    });
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => {
      expect(seenCursors).toContain('cursor-2-fresh');
    });
  });

  it('toggles product active status per row without overwriting concurrent row locks', async () => {
    const user = userEvent.setup();
    let resolveFirst: (() => void) | undefined;
    let resolveSecond: (() => void) | undefined;
    const gates: Array<Promise<void>> = [
      new Promise<void>((r) => {
        resolveFirst = r;
      }),
      new Promise<void>((r) => {
        resolveSecond = r;
      }),
    ];
    let patchIndex = 0;

    server.use(
      http.patch('*/api/v1/products/:productId', async ({ params }) => {
        const currentGate = gates[patchIndex] ?? Promise.resolve();
        patchIndex += 1;
        await currentGate;
        const target = INITIAL_PRODUCTS.find(
          (p) => p.product_id === params.productId
        );
        return HttpResponse.json({
          ...(target ?? productFixture),
          is_active: false,
        });
      })
    );

    renderWithProviders(<CatalogWorkbenchHarness />);
    await screen.findByText('Panadol 500mg Tablets');

    const panadolSwitch = screen.getByRole('switch', {
      name: 'Toggle status for Panadol 500mg Tablets',
    });
    const augmentinSwitch = screen.getByRole('switch', {
      name: 'Toggle status for Augmentin 1g Tablets',
    });

    await user.click(panadolSwitch);
    await user.click(augmentinSwitch);

    expect(panadolSwitch.hasAttribute('disabled')).toBe(true);
    expect(augmentinSwitch.hasAttribute('disabled')).toBe(true);

    // Resolving first must NOT unlock second while second is still pending
    resolveFirst?.();
    await waitFor(() => {
      expect(panadolSwitch.hasAttribute('disabled')).toBe(false);
    });
    expect(augmentinSwitch.hasAttribute('disabled')).toBe(true);

    resolveSecond?.();
    await waitFor(() => {
      expect(augmentinSwitch.hasAttribute('disabled')).toBe(false);
    });
    expect(
      await screen.findByText('Panadol 500mg Tablets marked inactive')
    ).toBeDefined();

    // Toggle error surfaces trace-annotated toast
    server.use(
      http.patch('*/api/v1/products/:productId', () =>
        HttpResponse.json(
          {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Product toggle failed',
              trace_id: 'tr-toggle-500',
            },
          },
          { status: 500 }
        )
      )
    );
    await user.click(panadolSwitch);
    expect(
      await screen.findByText('Product toggle failed (Trace: tr-toggle-500)')
    ).toBeDefined();
  });

  it('shows empty catalog state and allows creating a non-sellable base UOM product with null price', async () => {
    const user = userEvent.setup();
    const postedBodies: Array<Record<string, unknown>> = [];

    server.use(
      http.get('*/api/v1/products', () =>
        HttpResponse.json({ items: [], nextCursor: null })
      ),
      http.post('*/api/v1/products', async ({ request }) => {
        const cloned = request.clone();
        const body: unknown = await cloned.json().catch(() => null);
        if (isRecord(body)) {
          postedBodies.push(body);
        }
        return undefined;
      })
    );

    renderWithProviders(<CatalogWorkbenchHarness />);
    expect(await screen.findByText('No products yet')).toBeDefined();

    const addButtons = screen.getAllByRole('button', { name: 'Add product' });
    await user.click(addButtons[addButtons.length - 1]);
    const dialog = screen.getByRole('dialog');

    await user.selectOptions(
      within(dialog).getByLabelText('Category'),
      'c9d8e7f6-4444-4d55-8e66-cbccddeeffbb'
    );
    await user.type(within(dialog).getByLabelText('SKU'), 'ANA-BULK-001');
    await user.type(
      within(dialog).getByLabelText('Product name'),
      'Bulk Paracetamol'
    );
    await user.type(within(dialog).getByLabelText('Base UOM code'), 'tablet');
    await user.type(
      within(dialog).getByLabelText('Display name'),
      'Tablet (bulk base)'
    );
    await user.click(within(dialog).getByRole('switch', { name: 'Sellable' }));
    await user.click(
      within(dialog).getByRole('button', { name: 'Create product' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    expect(postedBodies[0]).toMatchObject({
      sku: 'ANA-BULK-001',
      uoms: [
        {
          uom_code: 'tablet',
          is_base: true,
          is_sellable: false,
          sale_unit_price: null,
        },
      ],
    });
  });

  it('creates a product with tax % -> 0.1400, sellable base UOM validation, no primary supplier field, and handles 409 duplicate SKU', async () => {
    const user = userEvent.setup();
    const postedBodies: Array<Record<string, unknown>> = [];

    server.use(
      http.post('*/api/v1/products', async ({ request }) => {
        const cloned = request.clone();
        const body: unknown = await cloned.json().catch(() => null);
        if (isRecord(body)) {
          postedBodies.push(body);
        }
        return undefined;
      })
    );

    renderWithProviders(<CatalogWorkbenchHarness />);
    await screen.findByText('Panadol 500mg Tablets');

    await user.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = screen.getByRole('dialog');

    // No uncontracted Primary Supplier field
    expect(within(dialog).queryByLabelText(/supplier/i)).toBeNull();

    // Toggling Sellable off disables and clears Sale unit price
    const sellableToggle = within(dialog).getByRole('switch', {
      name: 'Sellable',
    });
    const priceInput = within(dialog).getByLabelText(
      'Sale unit price'
    ) as HTMLInputElement;
    await user.type(priceInput, '15.5');
    await user.click(sellableToggle);
    expect(priceInput.disabled).toBe(true);
    expect(priceInput.value).toBe('');

    // Re-enabling Sellable requires price >= 0
    await user.click(sellableToggle);
    expect(priceInput.disabled).toBe(false);
    await user.click(
      within(dialog).getByRole('button', { name: 'Create product' })
    );
    expect(
      await within(dialog).findByText(
        'Sale unit price is required when UOM is sellable'
      )
    ).toBeDefined();

    // Fill valid fields with duplicate SKU -> 409 conflict
    await user.selectOptions(
      within(dialog).getByLabelText('Category'),
      'c9d8e7f6-4444-4d55-8e66-cbccddeeffbb'
    );
    await user.type(within(dialog).getByLabelText('SKU'), 'ABX-AUG-1000-TAB');
    await user.type(
      within(dialog).getByLabelText('Product name'),
      'Brufen 400mg'
    );
    const taxInput = within(dialog).getByLabelText('Tax rate (%)');
    await user.clear(taxInput);
    await user.type(taxInput, '14');
    const expiryInput = within(dialog).getByLabelText('Expiry alert days');
    await user.clear(expiryInput);
    await user.type(expiryInput, '45');

    await user.type(within(dialog).getByLabelText('Base UOM code'), 'tablet');
    await user.type(
      within(dialog).getByLabelText('Display name'),
      'Tablet (base)'
    );
    await user.type(priceInput, '3.25');

    await user.click(
      within(dialog).getByRole('button', { name: 'Create product' })
    );
    expect(
      await within(dialog).findByText(/SKU "ABX-AUG-1000-TAB" already exists/i)
    ).toBeDefined();
    expect(within(dialog).getByText('SKU must be unique.')).toBeDefined();

    // Change to unique SKU -> succeeds with tax_rate "0.1400"
    const skuInput = within(dialog).getByLabelText('SKU');
    await user.clear(skuInput);
    await user.type(skuInput, 'ANA-BRU-400-TAB');
    await user.click(
      within(dialog).getByRole('button', { name: 'Create product' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    const successPayload = postedBodies[1];
    expect(successPayload).toMatchObject({
      sku: 'ANA-BRU-400-TAB',
      name: 'Brufen 400mg',
      tax_rate: '0.1400',
      expiry_alert_days: 45,
      base_uom_code: 'tablet',
      uoms: [
        {
          uom_code: 'tablet',
          display_name: 'Tablet (base)',
          conversion_to_base: '1.000000',
          sale_unit_price: '3.2500',
          is_base: true,
          is_sellable: true,
          is_purchasable: true,
        },
      ],
    });
    expect(await screen.findByText('Brufen 400mg')).toBeDefined();
  });

  it('edits product with immutable SKU/Base UOM, !isDirty guard, 409 lot tracking lock inline on Augmentin, and Idempotency-Key stability on retry', async () => {
    const user = userEvent.setup();
    const seenKeys: Array<string | null> = [];
    let failOnce = false;

    server.use(
      http.patch('*/api/v1/products/:productId', async ({ request }) => {
        seenKeys.push(request.headers.get('Idempotency-Key'));
        if (failOnce) {
          failOnce = false;
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Temporary save error',
                trace_id: 'trace-edit-retry',
              },
            },
            { status: 500 }
          );
        }
        return undefined;
      })
    );

    renderWithProviders(<CatalogWorkbenchHarness />);
    await screen.findByText('Augmentin 1g Tablets');

    const augmentinRow = screen.getByText('Augmentin 1g Tablets').closest('tr');
    if (!augmentinRow) {
      throw new Error('Expected Augmentin row');
    }
    await user.click(
      within(augmentinRow).getByRole('button', { name: 'Edit' })
    );

    const dialog = screen.getByRole('dialog');
    const skuInput = within(dialog).getByLabelText('SKU') as HTMLInputElement;
    const baseUomInput = within(dialog).getByLabelText(
      'Base UOM'
    ) as HTMLInputElement;
    expect(skuInput.disabled).toBe(true);
    expect(skuInput.readOnly).toBe(true);
    expect(baseUomInput.disabled).toBe(true);
    expect(baseUomInput.readOnly).toBe(true);

    const saveBtn = within(dialog).getByRole('button', {
      name: 'Save changes',
    }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    // Toggle lot tracking off on Augmentin -> 409 inline + alert
    const lotToggle = within(dialog).getByRole('switch', {
      name: 'Lot tracking required',
    });
    await user.click(lotToggle);
    expect(saveBtn.disabled).toBe(false);
    await user.click(saveBtn);

    expect(
      await within(dialog).findByText(
        /Lot tracking setting cannot be changed while stock or posted ledger history exists/i
      )
    ).toBeDefined();
    const inlineLotError = within(dialog).getByText(
      'Cannot change lot tracking while stock or posted ledger history exists.'
    );
    expect(inlineLotError.getAttribute('role')).toBe('alert');

    // Revert lot toggle, edit name, fail 500 once then retry with identical Idempotency-Key
    await user.click(lotToggle);
    const nameInput = within(dialog).getByLabelText('Product name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Augmentin 1g Tablets Updated');
    seenKeys.length = 0;
    failOnce = true;

    await user.click(saveBtn);
    expect(
      await within(dialog).findByText(/Temporary save error/i)
    ).toBeDefined();

    await user.click(saveBtn);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    expect(seenKeys).toHaveLength(2);
    expect(seenKeys[0]).not.toBeNull();
    expect(seenKeys[0]).toBe(seenKeys[1]);
    expect(
      await screen.findByText('Augmentin 1g Tablets Updated')
    ).toBeDefined();
    expect(inventoryBalanceFixture.product_id).toBeTruthy();
  });
});

describe('Catalog RBAC and Runtime gating', () => {
  it('hides write actions and shows Cloud deployment notice on BranchLocal', async () => {
    seedAuthSession({
      roles: ['Admin'],
      scopes: ['inventory:read', 'inventory:write'],
      runtime: 'BranchLocal',
    });

    renderWithProviders(<CatalogWorkbenchHarness />);
    expect(await screen.findByText('Panadol 500mg Tablets')).toBeDefined();
    const categoryTree = await screen.findByRole('list', {
      name: 'Product categories',
    });
    expect(within(categoryTree).getByText('Analgesics')).toBeDefined();

    expect(
      screen.getByText(/Catalog changes require the Cloud deployment/i)
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Add product' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add category' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Edit/i })).toBeNull();
    expect(
      screen.queryByRole('switch', { name: /Toggle status for/i })
    ).toBeNull();
    expect(screen.getAllByRole('button', { name: 'View' }).length).toBe(5);
  });

  it('hides write actions for Cashier on Cloud without showing the BranchLocal notice', async () => {
    seedAuthSession({
      roles: ['Cashier'],
      scopes: ['inventory:read', 'sales:read', 'sales:write'],
      runtime: 'Cloud',
    });

    renderWithProviders(<CatalogWorkbenchHarness />);
    expect(await screen.findByText('Panadol 500mg Tablets')).toBeDefined();
    const categoryTree = await screen.findByRole('list', {
      name: 'Product categories',
    });
    expect(within(categoryTree).getByText('Analgesics')).toBeDefined();

    expect(
      screen.queryByText(/Catalog changes require the Cloud deployment/i)
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add product' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add category' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Edit/i })).toBeNull();
    expect(
      screen.queryByRole('switch', { name: /Toggle status for/i })
    ).toBeNull();
  });

  it('allows catalog write actions for Pharmacist on Cloud with inventory:write', async () => {
    seedAuthSession({
      roles: ['Pharmacist'],
      scopes: ['inventory:read', 'inventory:write'],
      runtime: 'Cloud',
    });

    renderWithProviders(<CatalogWorkbenchHarness />);
    expect(await screen.findByText('Panadol 500mg Tablets')).toBeDefined();
    const categoryTree = await screen.findByRole('list', {
      name: 'Product categories',
    });
    expect(within(categoryTree).getByText('Analgesics')).toBeDefined();

    expect(screen.getByRole('button', { name: 'Add product' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add category' })).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBe(5);
    expect(
      screen.getAllByRole('switch', { name: /Toggle status for/i }).length
    ).toBe(5);
  });
});

describe('Catalog edge cases and error boundaries', () => {
  it('maps 422 is_active and parent cycle errors in CategoryFormModal, excludes cyclic parents while preserving missing >200 parent fallback, and blocks Escape while pending', async () => {
    const user = userEvent.setup();
    const cyclicAndTruncated: ProductCategoryDto[] = [
      {
        category_id: 'cat-cyclic',
        parent_category_id: 'cat-cyclic',
        code: 'CAT-CYC',
        name: 'Cyclic Self',
        is_active: true,
      },
      {
        category_id: 'cat-truncated-child',
        parent_category_id: 'cat-beyond-200',
        code: 'CAT-CHILD',
        name: 'Truncated Parent Child',
        is_active: true,
      },
    ];

    let patchMode: 'active422' | 'cycle422' | 'pending' = 'active422';
    let resolvePending: (() => void) | undefined;
    const pendingGate = new Promise<void>((resolve) => {
      resolvePending = resolve;
    });

    server.use(
      http.get('*/api/v1/product-categories', () =>
        HttpResponse.json({ items: cyclicAndTruncated, nextCursor: null })
      ),
      http.patch('*/api/v1/product-categories/:categoryId', async () => {
        if (patchMode === 'active422') {
          return HttpResponse.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Category validation failed',
                details: [
                  {
                    field: 'is_active',
                    issue: 'Category still contains active products.',
                  },
                ],
              },
            },
            { status: 422 }
          );
        }
        if (patchMode === 'cycle422') {
          return HttpResponse.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid parent category',
                details: [
                  {
                    field: 'parent_category_id',
                    issue: 'Parent category creates a hierarchy cycle.',
                  },
                ],
              },
            },
            { status: 422 }
          );
        }
        await pendingGate;
        return HttpResponse.json(cyclicAndTruncated[0], { status: 200 });
      })
    );

    renderWithProviders(<CatalogWorkbenchHarness />);
    const categoryTree = await screen.findByRole('list', {
      name: 'Product categories',
    });
    expect(
      await within(categoryTree).findByText('Truncated Parent Child')
    ).toBeDefined();

    // Missing >200 parent preserves 'Current parent category' fallback option
    await user.click(
      screen.getByRole('button', { name: 'Edit Truncated Parent Child' })
    );
    const truncatedDialog = screen.getByRole('dialog');
    const truncatedParentSelect = within(truncatedDialog).getByLabelText(
      'Parent category'
    ) as HTMLSelectElement;
    expect(truncatedParentSelect.value).toBe('cat-beyond-200');
    expect(
      within(truncatedParentSelect).getByRole('option', {
        name: 'Current parent category',
      })
    ).toBeDefined();
    await user.click(
      within(truncatedDialog).getByRole('button', { name: 'Cancel' })
    );

    // Cyclic self-parent is never re-injected as 'Current parent category'
    await user.click(screen.getByRole('button', { name: 'Edit Cyclic Self' }));
    const dialog = screen.getByRole('dialog');
    const parentSelect = within(dialog).getByLabelText(
      'Parent category'
    ) as HTMLSelectElement;
    const parentOptionValues = Array.from(
      parentSelect.querySelectorAll('option')
    ).map((opt) => opt.value);
    expect(parentOptionValues).toEqual(['', 'cat-truncated-child']);

    // 422 on is_active renders inline role="alert" below Active category toggle
    await user.click(
      within(dialog).getByRole('switch', { name: 'Active category' })
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );
    const activeError = await within(dialog).findByText(
      'Category still contains active products.'
    );
    expect(activeError.getAttribute('role')).toBe('alert');

    // 422 on parent_category_id renders inline role="alert" below Parent category
    patchMode = 'cycle422';
    await user.selectOptions(parentSelect, 'cat-truncated-child');
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );
    const parentError = await within(dialog).findByText(
      'Parent category creates a hierarchy cycle.'
    );
    expect(parentError.getAttribute('role')).toBe('alert');

    // Escape & Cancel are blocked while category PATCH is pending
    patchMode = 'pending';
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(
      within(dialog)
        .getByRole('button', { name: 'Cancel' })
        .hasAttribute('disabled')
    ).toBe(true);

    resolvePending?.();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('maps 422 fields and blocks Escape while pending in CreateProductModal, and recovers categories in EditProductModal', async () => {
    const user = userEvent.setup();
    let failCategories = true;
    let createMode: '422' | 'pending' = '422';
    let resolveCreate: (() => void) | undefined;
    const createGate = new Promise<void>((resolve) => {
      resolveCreate = resolve;
    });
    let resolveEdit: (() => void) | undefined;
    const editGate = new Promise<void>((resolve) => {
      resolveEdit = resolve;
    });

    server.use(
      http.get('*/api/v1/product-categories', () => {
        if (failCategories) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Categories temporarily down',
              },
            },
            { status: 500 }
          );
        }
        return undefined;
      }),
      http.post('*/api/v1/products', async () => {
        if (createMode === '422') {
          return HttpResponse.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Product validation failed',
                details: [
                  {
                    field: 'tax_rate',
                    issue: 'Tax rate is unsupported in this region.',
                  },
                  {
                    field: 'uoms[0].sale_unit_price',
                    issue: 'Base price precision invalid.',
                  },
                ],
              },
            },
            { status: 422 }
          );
        }
        await createGate;
        return HttpResponse.json(productFixture, { status: 201 });
      }),
      http.patch('*/api/v1/products/:productId', async () => {
        await editGate;
        return HttpResponse.json(productFixture, { status: 200 });
      })
    );

    renderWithProviders(<CatalogWorkbenchHarness />);
    await screen.findByText('Panadol 500mg Tablets');

    // Edit modal while categories failed -> shows warning + Category unavailable -> Retry recovers
    const panadolRow = screen.getByText('Panadol 500mg Tablets').closest('tr');
    if (!panadolRow) {
      throw new Error('Expected Panadol row');
    }
    await user.click(within(panadolRow).getByRole('button', { name: 'Edit' }));
    const editDialog = screen.getByRole('dialog');
    expect(
      within(editDialog).getByText('Categories unavailable')
    ).toBeDefined();
    const editCatSelect = within(editDialog).getByLabelText(
      'Category'
    ) as HTMLSelectElement;
    expect(editCatSelect.value).toBe(productFixture.category_id);

    failCategories = false;
    await user.click(within(editDialog).getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(
        within(editDialog).queryByText('Categories unavailable')
      ).toBeNull();
    });
    expect(
      within(editCatSelect).getByRole('option', { name: 'Analgesics' })
    ).toBeDefined();

    // Edit Escape blocked while pending
    const editName = within(editDialog).getByLabelText('Product name');
    await user.clear(editName);
    await user.type(editName, 'Panadol 500mg Updated');
    await user.click(
      within(editDialog).getByRole('button', { name: 'Save changes' })
    );
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeDefined();
    resolveEdit?.();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    // Create product 422 mapping inside modal DOM + Escape blocked while pending
    await user.click(screen.getByRole('button', { name: 'Add product' }));
    const createDialog = screen.getByRole('dialog');
    await user.selectOptions(
      within(createDialog).getByLabelText('Category'),
      'c9d8e7f6-4444-4d55-8e66-cbccddeeffbb'
    );
    await user.type(within(createDialog).getByLabelText('SKU'), 'ANA-422-TEST');
    await user.type(
      within(createDialog).getByLabelText('Product name'),
      '422 Test Product'
    );
    await user.type(
      within(createDialog).getByLabelText('Base UOM code'),
      'tablet'
    );
    await user.type(
      within(createDialog).getByLabelText('Display name'),
      'Tablet'
    );
    await user.type(
      within(createDialog).getByLabelText('Sale unit price'),
      '5'
    );

    await user.click(
      within(createDialog).getByRole('button', { name: 'Create product' })
    );
    expect(
      await within(createDialog).findByText(
        'Tax rate is unsupported in this region.'
      )
    ).toBeDefined();
    expect(
      within(createDialog).getByText('Base price precision invalid.')
    ).toBeDefined();

    createMode = 'pending';
    await user.click(
      within(createDialog).getByRole('button', { name: 'Create product' })
    );
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeDefined();

    resolveCreate?.();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('clears inactive selectedCategoryId when Include inactive is turned off and keeps Pagination on empty page 2', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CatalogWorkbenchHarness pageSize={3} />);

    const categoryTree = await screen.findByRole('list', {
      name: 'Product categories',
    });
    expect(await screen.findByText('Panadol 500mg Tablets')).toBeDefined();

    // Include inactive -> select inactive category -> turn Include inactive off -> clears category filter
    await user.click(screen.getByRole('switch', { name: 'Include inactive' }));
    const archivedBtn = await within(categoryTree).findByRole('button', {
      name: /^Discontinued Seasonal/i,
    });
    await user.click(archivedBtn);
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe(
      'c9d8e7f6-4444-4d55-8e66-cbccddeeffbf'
    );
    expect(
      await screen.findByText('Legacy Aspirin 75mg Tablets')
    ).toBeDefined();

    await user.click(screen.getByRole('switch', { name: 'Include inactive' }));
    expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe(
      ''
    );
    expect(await screen.findByText('Panadol 500mg Tablets')).toBeDefined();

    // Navigate to page 2 (with 2 items) and deactivate both so page 2 becomes empty -> Pagination stays visible
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Zithromax 500mg Capsules')).toBeDefined();
    expect(screen.getByText('Page 2')).toBeDefined();

    await user.click(
      screen.getByRole('switch', {
        name: 'Toggle status for Zithromax 500mg Capsules',
      })
    );
    await user.click(
      screen.getByRole('switch', {
        name: 'Toggle status for Centrum Adults Multivitamin',
      })
    );

    expect(await screen.findByText('No products yet')).toBeDefined();
    const prevBtn = screen.getByRole('button', { name: 'Previous page' });
    expect(prevBtn.hasAttribute('disabled')).toBe(false);
    await user.click(prevBtn);
    expect(await screen.findByText('Panadol 500mg Tablets')).toBeDefined();
  });
});
