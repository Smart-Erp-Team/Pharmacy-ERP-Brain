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
import { toast } from 'react-toastify';
import currentUserContextFixture from '@contracts/fixtures/current-user-context.json';
import inventoryBalanceFixture from '@contracts/fixtures/inventory-balance.json';
import productFixture from '@contracts/fixtures/product.json';
import {
  INITIAL_PRODUCTS,
  MOCK_BRANCH_IDS,
  MOCK_CATEGORY_IDS,
  MOCK_PRODUCT_IDS,
  ORGANIZATION_ID,
  productHandlers,
  resetMockCatalog,
} from '../../../mocks/productHandlers';
import { useAuthStore } from '../../../stores/authStore';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type {
  CurrentUser,
  PagedResult,
  ProductCategory,
} from '../../../types/api';
import { useProductsPageState } from '../hooks/useProductsPageState';
import { CategoryFormModal } from './CategoryFormModal';
import { CreateProductModal } from './CreateProductModal';
import { EditProductModal } from './EditProductModal';
import { ProductsCatalogView } from './ProductsCatalogView';

const server = setupServer(...productHandlers);

function buildSessionUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    user_id: currentUserContextFixture.user_id,
    employee_id: currentUserContextFixture.employee_id,
    organization_id: currentUserContextFixture.organization_id,
    username: currentUserContextFixture.username,
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

function seedAuthSession(overrides: Partial<CurrentUser> = {}) {
  useAuthStore.setState({
    currentUser: buildSessionUser(overrides),
    organizationCode: 'MEDCARE',
    activeBranchId: MOCK_BRANCH_IDS.DOWNTOWN,
    isAuthenticated: true,
    isInitializing: false,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function expectSelectElement(element: HTMLElement): HTMLSelectElement {
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error('Expected an HTMLSelectElement');
  }
  return element;
}

function expectInputElement(element: HTMLElement): HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) {
    throw new Error('Expected an HTMLInputElement');
  }
  return element;
}

function expectButtonElement(element: HTMLElement): HTMLButtonElement {
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error('Expected an HTMLButtonElement');
  }
  return element;
}

function makePagedResponse<T>(
  items: T[],
  page = 1,
  pageSize = 25,
  totalCount = items.length,
  nextCursor: string | null = null
): PagedResult<T> {
  return {
    items,
    page,
    page_size: pageSize,
    total_count: totalCount,
    next_cursor: nextCursor,
  };
}

function makeCategoryFixture(
  overrides: Partial<ProductCategory> &
    Pick<ProductCategory, 'category_id' | 'code' | 'name'>
): ProductCategory {
  return {
    organization_id: ORGANIZATION_ID,
    parent_category_id: null,
    description: null,
    is_active: true,
    created_at: '2026-01-15T08:00:00+00:00',
    updated_at: '2026-11-25T10:00:00+00:00',
    ...overrides,
  };
}

function CatalogWorkbenchHarness({ pageSize }: { pageSize?: number }) {
  const state = useProductsPageState({ pageSize });

  return (
    <>
      {state.selectedProductId ? (
        <div data-testid="selected-product-id">{state.selectedProductId}</div>
      ) : null}

      <ProductsCatalogView state={state} />

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
    </>
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
    organizationCode: null,
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
    const deepCategories: ProductCategory[] = [
      makeCategoryFixture({
        category_id: 'cat-0',
        code: 'CAT-D0',
        name: 'Level Zero',
        description: 'Root group',
      }),
      makeCategoryFixture({
        category_id: 'cat-1',
        parent_category_id: 'cat-0',
        code: 'CAT-D1',
        name: 'Level One',
      }),
      makeCategoryFixture({
        category_id: 'cat-2',
        parent_category_id: 'cat-1',
        code: 'CAT-D2',
        name: 'Level Two',
      }),
      makeCategoryFixture({
        category_id: 'cat-3',
        parent_category_id: 'cat-2',
        code: 'CAT-D3',
        name: 'Level Three',
      }),
      makeCategoryFixture({
        category_id: 'cat-4',
        parent_category_id: 'cat-3',
        code: 'CAT-D4',
        name: 'Level Four',
      }),
      makeCategoryFixture({
        category_id: 'cat-other',
        code: 'CAT-OTH',
        name: 'Other Root',
      }),
    ];

    server.use(
      http.get('*/api/v1/product-categories', () =>
        HttpResponse.json(makePagedResponse(deepCategories))
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
    expect(expectSelectElement(screen.getByLabelText('Category')).value).toBe(
      'cat-0'
    );

    await user.click(levelZeroBtn);
    expect(levelZeroBtn.getAttribute('aria-pressed')).toBe('false');
    expect(expectSelectElement(screen.getByLabelText('Category')).value).toBe(
      ''
    );

    // Edit Level Zero -> code is locked, Parent select excludes self and descendants
    await user.click(screen.getByRole('button', { name: 'Edit Level Zero' }));
    const dialog = screen.getByRole('dialog');
    const codeInput = expectInputElement(
      within(dialog).getByLabelText('Category code')
    );
    expect(codeInput.disabled).toBe(true);
    expect(codeInput.readOnly).toBe(true);

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

  it('creates categories without is_active, edits with locked code omitting code from PATCH, maps 409 duplicate code, and supports inactive inspection', async () => {
    const user = userEvent.setup();
    const categoryPostBodies: Array<Record<string, unknown>> = [];
    const categoryPatchBodies: Array<Record<string, unknown>> = [];

    server.use(
      http.post('*/api/v1/product-categories', async ({ request }) => {
        const cloned = request.clone();
        const body: unknown = await cloned.json().catch(() => null);
        if (isRecord(body)) {
          categoryPostBodies.push(body);
        }
        return undefined;
      }),
      http.patch(
        '*/api/v1/product-categories/:categoryId',
        async ({ request }) => {
          const cloned = request.clone();
          const body: unknown = await cloned.json().catch(() => null);
          if (isRecord(body)) {
            categoryPatchBodies.push(body);
          }
          return undefined;
        }
      )
    );

    renderWithProviders(<CatalogWorkbenchHarness />);

    const categoryTree = await screen.findByRole('list', {
      name: 'Product categories',
    });
    expect(within(categoryTree).getByText('Antibiotics')).toBeDefined();
    expect(within(categoryTree).getByText('Penicillins')).toBeDefined();
    expect(within(categoryTree).getByText('Analgesics')).toBeDefined();
    expect(screen.queryByText('Archived Catalog')).toBeNull();

    // Create validation, omitted is_active toggle, & 409 duplicate code
    await user.click(screen.getByRole('button', { name: 'Add category' }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).queryByRole('switch', { name: 'Active category' })
    ).toBeNull();

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
      MOCK_CATEGORY_IDS.ANALGESICS
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create category' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(categoryPostBodies[1]).toEqual({
      parent_category_id: MOCK_CATEGORY_IDS.ANALGESICS,
      code: 'CAT-DERM',
      name: 'Dermatology',
      description: 'Skin treatments',
    });
    expect('is_active' in categoryPostBodies[1]).toBe(false);
    expect(await within(categoryTree).findByText('Dermatology')).toBeDefined();
    expect(within(categoryTree).getByText('CAT-DERM')).toBeDefined();

    // Edit Dermatology -> code is locked, PATCH omits code, rename and deactivate
    await user.click(screen.getByRole('button', { name: 'Edit Dermatology' }));
    const editDialog = screen.getByRole('dialog');
    const editCodeInput = expectInputElement(
      within(editDialog).getByLabelText('Category code')
    );
    expect(editCodeInput.disabled).toBe(true);
    expect(editCodeInput.readOnly).toBe(true);

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
    expect(categoryPatchBodies[0]).toEqual({
      parent_category_id: MOCK_CATEGORY_IDS.ANALGESICS,
      name: 'Dermatology & Topical',
      description: 'Skin treatments',
      is_active: false,
    });
    expect('code' in categoryPatchBodies[0]).toBe(false);
    expect(
      within(categoryTree).queryByText('Dermatology & Topical')
    ).toBeNull();

    // Enable Include inactive -> shows both archived categories with Inactive badge
    await user.click(screen.getByRole('switch', { name: 'Include inactive' }));
    expect(
      await within(categoryTree).findByText('Dermatology & Topical')
    ).toBeDefined();
    expect(within(categoryTree).getByText('Archived Catalog')).toBeDefined();
  });
});

describe('ProductsTable, filters, pagination, and Create/Edit Product modals', () => {
  it('renders loading skeleton, displays tax_rate and base UOM price, handles errors with retry, filters, and shows no delete button', async () => {
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
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Temporary catalog outage',
                details: [],
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
          {
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Categories down',
              details: [],
              trace_id: 'trace-cat-500',
            },
          },
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
    expect(await screen.findByText(/Temporary catalog outage/)).toBeDefined();
    expect(await screen.findByText(/Categories down/)).toBeDefined();

    // Retry products while categories stay down -> 'Category unavailable' fallback
    failProducts = false;
    await user.click(screen.getAllByRole('button', { name: 'Retry' })[0]);
    expect(await screen.findByText('Panadol Extra 500mg')).toBeDefined();
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

    // Verify numeric tax_rate and base UOM sale_unit_price formatting on Panadol Extra 500mg
    const panadolRowInitial = screen
      .getByText('Panadol Extra 500mg')
      .closest('tr');
    if (!panadolRowInitial) {
      throw new Error('Expected Panadol row');
    }
    expect(within(panadolRowInitial).getByText('5%')).toBeDefined();
    expect(within(panadolRowInitial).getByText('EGP 2.50')).toBeDefined();

    // Search by barcode and SKU
    const searchInput = screen.getByLabelText('Search products');
    await user.type(searchInput, '6221001000026');
    await waitFor(() => {
      expect(screen.queryByText('Augmentin 1g Film-Coated Tablets')).toBeNull();
    });
    expect(screen.getByText('Panadol Extra 500mg')).toBeDefined();

    // Click product name opens details callback; View button also opens details
    await user.click(
      screen.getByRole('button', { name: 'Panadol Extra 500mg' })
    );
    expect(screen.getByTestId('selected-product-id').textContent).toBe(
      MOCK_PRODUCT_IDS.PANADOL_EXTRA
    );

    const panadolRow = screen.getByText('Panadol Extra 500mg').closest('tr');
    if (!panadolRow) {
      throw new Error('Expected Panadol row');
    }
    await user.click(within(panadolRow).getByRole('button', { name: 'View' }));
    expect(screen.getByTestId('selected-product-id').textContent).toBe(
      MOCK_PRODUCT_IDS.PANADOL_EXTRA
    );

    // Search with no matches triggers filtered empty state -> Clear filters recovers
    await user.clear(searchInput);
    await user.type(searchInput, 'NON-EXISTENT-SKU');
    expect(
      await screen.findByText('No products match your filters')
    ).toBeDefined();

    // Clear filters -> test Include inactive shows Discontinued Cough Syrup with barcode 'Unavailable'
    const clearButtons = screen.getAllByRole('button', {
      name: 'Clear filters',
    });
    expect(clearButtons).toHaveLength(2);
    await user.click(clearButtons[1]);
    expect(
      await screen.findByText('Augmentin 1g Film-Coated Tablets')
    ).toBeDefined();
    await user.click(screen.getByRole('switch', { name: 'Include inactive' }));
    expect(await screen.findByText('Discontinued Cough Syrup')).toBeDefined();
    const discontinuedRow = screen
      .getByText('Discontinued Cough Syrup')
      .closest('tr');
    if (!discontinuedRow) {
      throw new Error('Expected Discontinued Cough Syrup row');
    }
    expect(within(discontinuedRow).getByText('Unavailable')).toBeDefined();
    expect(within(discontinuedRow).getByText('0%')).toBeDefined();
    expect(within(discontinuedRow).getByText('EGP 45.00')).toBeDefined();
  });

  it('paginates with Stage 1 PagedResult (page, page_size, total_count, next_cursor) and resets page to 1 on filter changes', async () => {
    const user = userEvent.setup();
    const seenRequests: Array<{
      page: string | null;
      pageSize: string | null;
      categoryId: string | null;
      search: string | null;
    }> = [];

    server.use(
      http.get('*/api/v1/products', ({ request }) => {
        const url = new URL(request.url);
        const pageParam = url.searchParams.get('page');
        const pageSizeParam = url.searchParams.get('page_size');
        const categoryIdParam = url.searchParams.get('category_id');
        const searchParam = url.searchParams.get('search');

        seenRequests.push({
          page: pageParam,
          pageSize: pageSizeParam,
          categoryId: categoryIdParam,
          search: searchParam,
        });

        const pageNumber = Number(pageParam ?? '1');
        if (pageNumber === 2) {
          return HttpResponse.json(
            makePagedResponse([INITIAL_PRODUCTS[2]], 2, 2, 3, null)
          );
        }
        return HttpResponse.json(
          makePagedResponse(
            [INITIAL_PRODUCTS[0], INITIAL_PRODUCTS[1]],
            1,
            2,
            3,
            '2'
          )
        );
      })
    );

    renderWithProviders(<CatalogWorkbenchHarness pageSize={2} />);
    expect(await screen.findByText('Panadol Extra 500mg')).toBeDefined();
    expect(screen.getByText('Showing 1–2 of 3')).toBeDefined();
    expect(screen.getByText('Page 1')).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Vitamin D3 5000 IU')).toBeDefined();
    expect(screen.getByText('Showing 3–3 of 3')).toBeDefined();
    expect(screen.getByText('Page 2')).toBeDefined();

    // Filter change resets page back to 1
    await user.selectOptions(
      screen.getByLabelText('Category'),
      MOCK_CATEGORY_IDS.ANALGESICS
    );
    expect(await screen.findByText('Panadol Extra 500mg')).toBeDefined();
    expect(screen.getByText('Page 1')).toBeDefined();

    expect(seenRequests).toContainEqual({
      page: '1',
      pageSize: '2',
      categoryId: MOCK_CATEGORY_IDS.ANALGESICS,
      search: null,
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
          ...(target ?? INITIAL_PRODUCTS[0]),
          is_active: false,
        });
      })
    );

    renderWithProviders(<CatalogWorkbenchHarness />);
    await screen.findByText('Panadol Extra 500mg');

    const panadolSwitch = screen.getByRole('switch', {
      name: 'Toggle status for Panadol Extra 500mg',
    });
    const augmentinSwitch = screen.getByRole('switch', {
      name: 'Toggle status for Augmentin 1g Film-Coated Tablets',
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
      await screen.findByText('Panadol Extra 500mg marked inactive')
    ).toBeDefined();

    // Toggle error surfaces trace-annotated toast
    server.use(
      http.patch('*/api/v1/products/:productId', () =>
        HttpResponse.json(
          {
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Product toggle failed',
              details: [],
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
        HttpResponse.json(makePagedResponse([], 1, 25, 0, null))
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
      MOCK_CATEGORY_IDS.ANALGESICS
    );
    await user.type(within(dialog).getByLabelText('SKU'), 'MED-BULK-001');
    await user.type(
      within(dialog).getByLabelText('Product name'),
      'Bulk Paracetamol'
    );
    await user.type(within(dialog).getByLabelText('Base UOM code'), 'TAB');
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
      sku: 'MED-BULK-001',
      tax_rate: 0,
      uoms: [
        {
          uom_code: 'TAB',
          conversion_to_base: 1,
          is_base: true,
          is_sellable: false,
          sale_unit_price: null,
        },
      ],
    });
  });

  it('creates a product with native numeric tax_rate (0.14) and sale_unit_price, no supplier field, and handles 409 duplicate SKU', async () => {
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
    await screen.findByText('Panadol Extra 500mg');

    await user.click(screen.getByRole('button', { name: 'Add product' }));
    const dialog = screen.getByRole('dialog');

    // No uncontracted Primary Supplier field
    expect(within(dialog).queryByLabelText(/supplier/i)).toBeNull();

    // Toggling Sellable off disables and clears Sale unit price
    const sellableToggle = within(dialog).getByRole('switch', {
      name: 'Sellable',
    });
    const priceInput = expectInputElement(
      within(dialog).getByLabelText('Sale unit price')
    );
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
      MOCK_CATEGORY_IDS.ANALGESICS
    );
    await user.type(within(dialog).getByLabelText('SKU'), 'MED-AUG-1000');
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

    await user.type(within(dialog).getByLabelText('Base UOM code'), 'TAB');
    await user.type(
      within(dialog).getByLabelText('Display name'),
      'Tablet (base)'
    );
    await user.type(priceInput, '25.5');

    await user.click(
      within(dialog).getByRole('button', { name: 'Create product' })
    );
    expect(
      await within(dialog).findByText(/SKU "MED-AUG-1000" already exists/i)
    ).toBeDefined();
    expect(within(dialog).getByText('SKU must be unique.')).toBeDefined();

    // Change to unique SKU -> succeeds with native numeric tax_rate 0.14
    const skuInput = within(dialog).getByLabelText('SKU');
    await user.clear(skuInput);
    await user.type(skuInput, 'MED-BRU-400');
    await user.click(
      within(dialog).getByRole('button', { name: 'Create product' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    const successPayload = postedBodies[1];
    expect(successPayload).toMatchObject({
      sku: 'MED-BRU-400',
      name: 'Brufen 400mg',
      tax_rate: 0.14,
      expiry_alert_days: 45,
      base_uom_code: 'TAB',
      uoms: [
        {
          uom_code: 'TAB',
          display_name: 'Tablet (base)',
          conversion_to_base: 1,
          sale_unit_price: 25.5,
          is_base: true,
          is_sellable: true,
          is_purchasable: true,
        },
      ],
    });
    expect(await screen.findByText('Brufen 400mg')).toBeDefined();
    expect(screen.getByText('EGP 25.50')).toBeDefined();
  });

  it('edits product with unlocked SKU/Base UOM, !isDirty guard, 409 conflict alerts (lot/base UOM/duplicate SKU), and Idempotency-Key stability on retry', async () => {
    const user = userEvent.setup();
    const seenKeys: Array<string | null> = [];
    const patchedBodies: Array<Record<string, unknown>> = [];
    let failOnce = false;

    server.use(
      http.patch('*/api/v1/products/:productId', async ({ request }) => {
        seenKeys.push(request.headers.get('Idempotency-Key'));
        const cloned = request.clone();
        const body: unknown = await cloned.json().catch(() => null);
        if (isRecord(body)) {
          patchedBodies.push(body);
        }
        if (failOnce) {
          failOnce = false;
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Temporary save error',
                details: [],
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
    await screen.findByText('Augmentin 1g Film-Coated Tablets');

    const augmentinRow = screen
      .getByText('Augmentin 1g Film-Coated Tablets')
      .closest('tr');
    if (!augmentinRow) {
      throw new Error('Expected Augmentin row');
    }
    await user.click(
      within(augmentinRow).getByRole('button', { name: 'Edit' })
    );

    const dialog = screen.getByRole('dialog');
    const skuInput = expectInputElement(within(dialog).getByLabelText('SKU'));
    const baseUomInput = expectInputElement(
      within(dialog).getByLabelText('Base UOM')
    );
    expect(skuInput.disabled).toBe(false);
    expect(skuInput.readOnly).toBe(false);
    expect(baseUomInput.disabled).toBe(false);
    expect(baseUomInput.readOnly).toBe(false);
    expect(skuInput.value).toBe('MED-AUG-1000');
    expect(baseUomInput.value).toBe('TAB');

    const saveBtn = expectButtonElement(
      within(dialog).getByRole('button', { name: 'Save changes' })
    );
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

    // Revert lot toggle, try changing Base UOM on Augmentin (has history) -> 409 inline + alert
    await user.click(lotToggle);
    await user.clear(baseUomInput);
    await user.type(baseUomInput, 'CAP');
    await user.click(saveBtn);
    expect(
      await within(dialog).findByText(
        /Base UOM code cannot be changed while stock or posted ledger history exists/i
      )
    ).toBeDefined();
    expect(
      within(dialog)
        .getByText(
          'Cannot change base UOM code while stock or posted ledger history exists.'
        )
        .getAttribute('role')
    ).toBe('alert');

    // Revert Base UOM, try duplicate SKU -> 409 inline + alert
    await user.clear(baseUomInput);
    await user.type(baseUomInput, 'TAB');
    await user.clear(skuInput);
    await user.type(skuInput, 'MED-PAN-500');
    await user.click(saveBtn);
    expect(
      await within(dialog).findByText(/SKU "MED-PAN-500" already exists/i)
    ).toBeDefined();
    expect(
      within(dialog).getByText('SKU must be unique.').getAttribute('role')
    ).toBe('alert');

    // Restore valid SKU, edit name & tax %, fail 500 once then retry with identical Idempotency-Key
    await user.clear(skuInput);
    await user.type(skuInput, 'MED-AUG-1000');
    const nameInput = within(dialog).getByLabelText('Product name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Augmentin 1g Tablets Updated');
    const taxInput = within(dialog).getByLabelText('Tax rate (%)');
    await user.clear(taxInput);
    await user.type(taxInput, '14');
    seenKeys.length = 0;
    patchedBodies.length = 0;
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
    expect(patchedBodies[1]).toMatchObject({
      sku: 'MED-AUG-1000',
      base_uom_code: 'TAB',
      name: 'Augmentin 1g Tablets Updated',
      tax_rate: 0.14,
    });
    expect(
      await screen.findByText('Augmentin 1g Tablets Updated')
    ).toBeDefined();
    expect(inventoryBalanceFixture.product_id).toBe(
      MOCK_PRODUCT_IDS.AUGMENTIN_1G
    );

    // Edit SKU and Base UOM on Panadol Extra (no history lock) -> sends both in PATCH and updates row
    const panadolRow = screen.getByText('Panadol Extra 500mg').closest('tr');
    if (!panadolRow) {
      throw new Error('Expected Panadol row');
    }
    await user.click(within(panadolRow).getByRole('button', { name: 'Edit' }));
    const panadolDialog = screen.getByRole('dialog');
    const panadolSku = expectInputElement(
      within(panadolDialog).getByLabelText('SKU')
    );
    const panadolBaseUom = expectInputElement(
      within(panadolDialog).getByLabelText('Base UOM')
    );
    await user.clear(panadolSku);
    await user.type(panadolSku, 'MED-PAN-500-V2');
    await user.clear(panadolBaseUom);
    await user.type(panadolBaseUom, 'CAP');
    patchedBodies.length = 0;
    await user.click(
      within(panadolDialog).getByRole('button', { name: 'Save changes' })
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(patchedBodies[0]).toMatchObject({
      sku: 'MED-PAN-500-V2',
      base_uom_code: 'CAP',
    });
    expect(await screen.findByText('MED-PAN-500-V2')).toBeDefined();
  });
});

describe('Catalog RBAC and Runtime gating', () => {
  it('hides write actions and shows Cloud deployment notice on BranchLocal', async () => {
    seedAuthSession({
      role: 'Admin',
      scopes: ['inventory:read', 'inventory:write'],
      runtime_mode: 'BranchLocal',
    });

    renderWithProviders(<CatalogWorkbenchHarness />);
    expect(await screen.findByText('Panadol Extra 500mg')).toBeDefined();
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
    expect(screen.getAllByRole('button', { name: 'View' }).length).toBe(3);
  });

  it('hides write actions for Cashier on Cloud without showing the BranchLocal notice', async () => {
    seedAuthSession({
      role: 'Cashier',
      scopes: ['inventory:read', 'sales:read', 'sales:write'],
      runtime_mode: 'Cloud',
    });

    renderWithProviders(<CatalogWorkbenchHarness />);
    expect(await screen.findByText('Panadol Extra 500mg')).toBeDefined();
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
      role: 'Pharmacist',
      scopes: ['inventory:read', 'inventory:write'],
      runtime_mode: 'Cloud',
    });

    renderWithProviders(<CatalogWorkbenchHarness />);
    expect(await screen.findByText('Panadol Extra 500mg')).toBeDefined();
    const categoryTree = await screen.findByRole('list', {
      name: 'Product categories',
    });
    expect(within(categoryTree).getByText('Analgesics')).toBeDefined();

    expect(screen.getByRole('button', { name: 'Add product' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add category' })).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBe(3);
    expect(
      screen.getAllByRole('switch', { name: /Toggle status for/i }).length
    ).toBe(3);
  });
});

describe('Catalog edge cases and error boundaries', () => {
  it('maps 422 is_active and parent cycle errors in CategoryFormModal, excludes cyclic parents while preserving missing >200 parent fallback, and blocks Escape while pending', async () => {
    const user = userEvent.setup();
    const cyclicAndTruncated: ProductCategory[] = [
      makeCategoryFixture({
        category_id: 'cat-cyclic',
        parent_category_id: 'cat-cyclic',
        code: 'CAT-CYC',
        name: 'Cyclic Self',
      }),
      makeCategoryFixture({
        category_id: 'cat-truncated-child',
        parent_category_id: 'cat-beyond-200',
        code: 'CAT-CHILD',
        name: 'Truncated Parent Child',
      }),
    ];

    let patchMode: 'active422' | 'cycle422' | 'pending' = 'active422';
    let resolvePending: (() => void) | undefined;
    const pendingGate = new Promise<void>((resolve) => {
      resolvePending = resolve;
    });

    server.use(
      http.get('*/api/v1/product-categories', () =>
        HttpResponse.json(makePagedResponse(cyclicAndTruncated))
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
                trace_id: 'trace-cat-422-active',
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
                trace_id: 'trace-cat-422-cycle',
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
    const truncatedParentSelect = expectSelectElement(
      within(truncatedDialog).getByLabelText('Parent category')
    );
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
    const parentSelect = expectSelectElement(
      within(dialog).getByLabelText('Parent category')
    );
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
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Categories temporarily down',
                details: [],
                trace_id: 'trace-cat-temp',
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
                trace_id: 'trace-prod-422',
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
    await screen.findByText('Panadol Extra 500mg');

    // Edit modal while categories failed -> shows warning + Category unavailable -> Retry recovers
    const panadolRow = screen.getByText('Panadol Extra 500mg').closest('tr');
    if (!panadolRow) {
      throw new Error('Expected Panadol row');
    }
    await user.click(within(panadolRow).getByRole('button', { name: 'Edit' }));
    const editDialog = screen.getByRole('dialog');
    expect(
      within(editDialog).getByText('Categories unavailable')
    ).toBeDefined();
    const editCatSelect = expectSelectElement(
      within(editDialog).getByLabelText('Category')
    );
    expect(editCatSelect.value).toBe(MOCK_CATEGORY_IDS.ANALGESICS);

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
    await user.type(editName, 'Panadol Extra Updated');
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
      MOCK_CATEGORY_IDS.ANALGESICS
    );
    await user.type(within(createDialog).getByLabelText('SKU'), 'MED-422-TEST');
    await user.type(
      within(createDialog).getByLabelText('Product name'),
      '422 Test Product'
    );
    await user.type(
      within(createDialog).getByLabelText('Base UOM code'),
      'TAB'
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
    renderWithProviders(<CatalogWorkbenchHarness pageSize={2} />);

    const categoryTree = await screen.findByRole('list', {
      name: 'Product categories',
    });
    expect(await screen.findByText('Panadol Extra 500mg')).toBeDefined();

    // Include inactive -> select inactive category -> turn Include inactive off -> clears category filter
    await user.click(screen.getByRole('switch', { name: 'Include inactive' }));
    const archivedBtn = await within(categoryTree).findByRole('button', {
      name: /^Archived Catalog/i,
    });
    await user.click(archivedBtn);
    expect(expectSelectElement(screen.getByLabelText('Category')).value).toBe(
      MOCK_CATEGORY_IDS.ARCHIVED
    );
    expect(await screen.findByText('Discontinued Cough Syrup')).toBeDefined();

    await user.click(screen.getByRole('switch', { name: 'Include inactive' }));
    expect(expectSelectElement(screen.getByLabelText('Category')).value).toBe(
      ''
    );
    expect(await screen.findByText('Panadol Extra 500mg')).toBeDefined();

    // Navigate to page 2 (1 item: Vitamin D3 5000 IU) and deactivate it so page 2 becomes empty -> Pagination stays visible
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Vitamin D3 5000 IU')).toBeDefined();
    expect(screen.getByText('Page 2')).toBeDefined();

    await user.click(
      screen.getByRole('switch', {
        name: 'Toggle status for Vitamin D3 5000 IU',
      })
    );

    expect(await screen.findByText('No products yet')).toBeDefined();
    const prevBtn = screen.getByRole('button', { name: 'Previous page' });
    expect(prevBtn.hasAttribute('disabled')).toBe(false);
    await user.click(prevBtn);
    expect(await screen.findByText('Panadol Extra 500mg')).toBeDefined();
  });
});
