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
import currentUserContext from '@contracts/fixtures/current-user-context.json';
import inventoryBalanceFixture from '@contracts/fixtures/inventory-balance.json';
import productFixture from '@contracts/fixtures/product.json';
import {
  branchHandlers,
  resetMockBranches,
} from '../../../mocks/branchHandlers';
import {
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  productHandlers,
  resetMockCatalog,
} from '../../../mocks/productHandlers';
import { useAuthStore } from '../../../stores/authStore';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { CurrentUserContext, ProductDto } from '../../../types/api';
import { BranchReorderTab } from './BranchReorderTab';
import { ProductDetailsView } from './ProductDetailsView';

const CAIRO_BRANCH_ID = inventoryBalanceFixture.branch_id;
const ALEX_BRANCH_ID = 'e5f6a7b8-4444-4d55-9e66-ccddeeff0011';

const server = setupServer(...branchHandlers, ...productHandlers);

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
    scopes: ['inventory:read', 'inventory:write'],
    runtime: 'Cloud',
    ...overrides,
  };
}

function seedAuth(
  overrides: Partial<CurrentUserContext> = {},
  activeBranchId: string | null = null
) {
  useAuthStore.setState({
    currentUser: buildAuthUser(overrides),
    activeBranchId,
    isAuthenticated: true,
    isInitializing: false,
  });
}

beforeAll(() => server.listen());

beforeEach(() => {
  resetMockBranches();
  resetMockCatalog();
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

describe('ProductDetailsView', () => {
  it('handles loading skeleton, error retry, initialProduct fallback, header actions, and ProductInfoTab fields including Unavailable states', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onEditProduct = vi.fn();

    let failDetail = true;
    let resolvePending: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      resolvePending = resolve;
    });

    server.use(
      http.get('*/api/v1/products/:productId', async () => {
        if (failDetail) {
          await gate;
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
      })
    );

    renderWithProviders(
      <ProductDetailsView
        productId={productFixture.product_id}
        categories={INITIAL_CATEGORIES}
        onBack={onBack}
        onEditProduct={onEditProduct}
      />
    );

    expect(
      screen.getByRole('status', { name: 'Loading product details' })
    ).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Back to products' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    resolvePending?.();
    expect(
      await screen.findByText(
        /Temporary catalog outage \(Trace: trace-prod-500\)/i
      )
    ).toBeDefined();

    failDetail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole('heading', { name: 'Panadol 500mg Tablets' })
    ).toBeDefined();
    expect(screen.getAllByText('ANA-PCM-500-TAB')).toHaveLength(2);
    expect(screen.getByText('Active')).toBeDefined();
    expect(screen.getAllByText('Analgesics').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Edit product' }));
    expect(onEditProduct).toHaveBeenCalledWith(
      expect.objectContaining({ product_id: productFixture.product_id })
    );

    // Product Information fields
    expect(screen.getByText('14%')).toBeDefined();
    expect(screen.getByText('(0.1400)')).toBeDefined();
    expect(screen.getByText('Not required')).toBeDefined();
    expect(screen.getByText('30 days')).toBeDefined();
    expect(screen.getByText('6221048001234')).toBeDefined();
    expect(screen.getByText('Paracetamol 500mg')).toBeDefined();
    expect(
      screen.getByText('https://cdn.pharmaplus.eg/products/ana-pcm-500-tab.jpg')
    ).toBeDefined();

    cleanup();

    // Verify initialProduct fallback while query is still pending + explicit Unavailable for null optional fields & 0 days
    const sparseProduct: ProductDto = {
      ...INITIAL_PRODUCTS[5],
      category_id: 'missing-category-id',
      barcode: null,
      generic_name: null,
      brand_name: '',
      image_url: null,
      tax_rate: '0.0000',
      expiry_alert_days: 0,
      created_at: undefined,
      updated_at: undefined,
    };

    server.use(
      http.get('*/api/v1/products/:productId', async () => {
        await new Promise(() => undefined);
      })
    );

    renderWithProviders(
      <ProductDetailsView
        productId={sparseProduct.product_id}
        initialProduct={sparseProduct}
        categories={INITIAL_CATEGORIES}
        onBack={onBack}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Legacy Aspirin 75mg Tablets' })
    ).toBeDefined();
    expect(screen.getAllByText('Category unavailable').length).toBe(2);
    expect(screen.getByText('0%')).toBeDefined();
    expect(screen.getByText('0 days')).toBeDefined();
    expect(screen.getAllByText('Unavailable')).toHaveLength(6);
    expect(screen.queryByRole('button', { name: 'Edit product' })).toBeNull();
  });

  it('manages UOMs & Pricing: base toggle disabled, add sellable UOM validation, edit !isDirty & 409 errors, and BranchLocal read-only gating', async () => {
    const user = userEvent.setup();
    const centrumProduct = INITIAL_PRODUCTS[4];

    const { rerender } = renderWithProviders(
      <ProductDetailsView
        productId={centrumProduct.product_id}
        initialProduct={centrumProduct}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'UOMs & Pricing' }));

    // Centrum has non-sellable/non-purchasable base tablet (Unavailable price + Inactive flags) plus active/inactive bottles
    expect(await screen.findByText('Bottle of 60')).toBeDefined();
    expect(screen.getByText('Legacy Bottle of 30')).toBeDefined();
    const tabletRow = screen.getByText('Tablet (base)').closest('tr');
    if (!tabletRow) throw new Error('Expected Tablet (base) row');
    expect(within(tabletRow).getByText('Base unit')).toBeDefined();
    expect(within(tabletRow).getByText('Inactive flags')).toBeDefined();
    expect(within(tabletRow).getByText('Unavailable')).toBeDefined();
    expect(screen.getByText('EGP 420.00')).toBeDefined();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();

    const baseToggle = screen.getByRole('switch', {
      name: 'Toggle status for tablet',
    });
    expect(baseToggle.hasAttribute('disabled')).toBe(true);

    // Soft-toggle bottle60 inactive via PATCH
    const bottle60Toggle = screen.getByRole('switch', {
      name: 'Toggle status for bottle60',
    });
    expect(bottle60Toggle.getAttribute('aria-checked')).toBe('true');
    await user.click(bottle60Toggle);
    await waitFor(() => {
      expect(bottle60Toggle.getAttribute('aria-checked')).toBe('false');
    });

    // Add sellable UOM -> validates price required when sellable, handles 409 duplicate code, then succeeds
    await user.click(screen.getByRole('button', { name: 'Add UOM' }));
    const addDialog = screen.getByRole('dialog');
    expect(
      within(addDialog).getByText(/Additional UOM \(non-base\)/i)
    ).toBeDefined();

    await user.click(
      within(addDialog).getByRole('button', { name: 'Add UOM' })
    );
    expect(
      await within(addDialog).findByText('UOM code is required')
    ).toBeDefined();
    expect(
      within(addDialog).getByText('Display name is required')
    ).toBeDefined();
    expect(
      within(addDialog).getByText('Conversion factor is required')
    ).toBeDefined();

    await user.type(within(addDialog).getByLabelText('UOM code'), 'bottle60');
    await user.type(
      within(addDialog).getByLabelText('Display name'),
      'Duplicate Bottle'
    );
    await user.type(
      within(addDialog).getByLabelText('Conversion factor'),
      '60'
    );
    await user.click(
      within(addDialog).getByRole('switch', { name: 'Sellable' })
    );
    await user.click(
      within(addDialog).getByRole('button', { name: 'Add UOM' })
    );
    expect(
      await within(addDialog).findByText(
        'Sale unit price is required when UOM is sellable'
      )
    ).toBeDefined();

    await user.type(
      within(addDialog).getByLabelText('Sale unit price (EGP)'),
      '410'
    );
    await user.click(
      within(addDialog).getByRole('button', { name: 'Add UOM' })
    );
    expect(
      await within(addDialog).findByText(
        /UOM code "bottle60" already exists for this product/i
      )
    ).toBeDefined();

    const codeInput = within(addDialog).getByLabelText('UOM code');
    await user.clear(codeInput);
    await user.type(codeInput, 'box120');
    const nameInput = within(addDialog).getByLabelText('Display name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Box of 120');
    const factorInput = within(addDialog).getByLabelText('Conversion factor');
    await user.clear(factorInput);
    await user.type(factorInput, '120');
    await user.click(
      within(addDialog).getByRole('switch', { name: 'Purchasable' })
    );
    await user.click(
      within(addDialog).getByRole('button', { name: 'Add UOM' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await screen.findByText('Box of 120')).toBeDefined();
    expect(screen.getByText('EGP 410.00')).toBeDefined();

    // Edit UOM: enforces !isDirty, immutable code/conversion, immutability notice, and 409 error surfacing
    const bottle60Row = screen.getByText('Bottle of 60').closest('tr');
    if (!bottle60Row) throw new Error('Expected Bottle of 60 row');
    await user.click(within(bottle60Row).getByRole('button', { name: 'Edit' }));

    const editDialog = screen.getByRole('dialog');
    expect(
      within(editDialog).getByText(
        /conversion_to_base and is_base become immutable once referenced by a posted document or stock/i
      )
    ).toBeDefined();
    expect(within(editDialog).queryByLabelText('UOM code')).toBeNull();
    expect(within(editDialog).queryByLabelText('Conversion factor')).toBeNull();
    expect(within(editDialog).getByText('Factor: 60')).toBeDefined();

    const saveBtn = within(editDialog).getByRole('button', {
      name: 'Save changes',
    });
    expect(saveBtn.hasAttribute('disabled')).toBe(true);

    server.use(
      http.patch(
        '*/api/v1/products/:productId/uoms/:uomId',
        () =>
          HttpResponse.json(
            {
              error: {
                code: 'CONFLICT',
                message: 'UOM update conflicted with posted stock.',
                trace_id: 'trace-uom-409',
                details: [
                  {
                    field: 'is_active',
                    issue: 'Cannot modify status during stock count.',
                  },
                ],
              },
            },
            { status: 409 }
          ),
        { once: true }
      )
    );

    const editName = within(editDialog).getByLabelText('Display name');
    await user.clear(editName);
    await user.type(editName, 'Bottle of 60 Updated');
    expect(saveBtn.hasAttribute('disabled')).toBe(false);
    await user.click(saveBtn);

    expect(
      await within(editDialog).findByText(
        /UOM update conflicted with posted stock\. \(Trace: trace-uom-409\)/i
      )
    ).toBeDefined();
    expect(
      within(editDialog).getByText('Cannot modify status during stock count.')
    ).toBeDefined();

    await user.click(saveBtn);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await screen.findByText('Bottle of 60 Updated')).toBeDefined();

    // BranchLocal hides Add UOM & Edit buttons, disables toggles, and displays Cloud deployment notice
    seedAuth({ runtime: 'BranchLocal' });
    rerender(
      <ProductDetailsView
        productId={centrumProduct.product_id}
        initialProduct={centrumProduct}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
      />
    );

    expect(
      screen.getByText('UOM changes require the Cloud deployment')
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Add UOM' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(
      screen
        .getByRole('switch', { name: 'Toggle status for bottle60' })
        .hasAttribute('disabled')
    ).toBe(true);
  });

  it('hides Branch Reorder Settings from Cashier, falls back safely on role switch, validates & saves PUT on Cloud, and locks BranchLocal', async () => {
    const user = userEvent.setup();
    let reorderRequests = 0;
    let branchRequests = 0;

    server.use(
      http.get('*/api/v1/branches', () => {
        branchRequests += 1;
        return undefined;
      }),
      http.get(
        '*/api/v1/branches/:branchId/products/:productId/reorder-rule',
        () => {
          reorderRequests += 1;
          return undefined;
        }
      )
    );

    // 1. Cashier cannot see Branch Reorder Settings and fires zero reorder/branch requests
    seedAuth({ roles: ['Cashier'], scopes: ['inventory:read'] });
    const { rerender } = renderWithProviders(
      <ProductDetailsView
        productId={productFixture.product_id}
        initialProduct={productFixture}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
        onEditProduct={() => undefined}
      />
    );

    expect(
      screen.queryByRole('tab', { name: 'Branch Reorder Settings' })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit product' })).toBeNull();
    expect(reorderRequests).toBe(0);
    expect(branchRequests).toBe(0);

    // 2. Admin on Cloud with activeBranchId=Alexandria defaults to Alexandria (unconfigured rule)
    seedAuth({}, ALEX_BRANCH_ID);
    rerender(
      <ProductDetailsView
        productId={productFixture.product_id}
        initialProduct={productFixture}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
        onEditProduct={() => undefined}
      />
    );

    await user.click(
      screen.getByRole('tab', { name: 'Branch Reorder Settings' })
    );

    const branchSelect = (await screen.findByLabelText(
      'Branch'
    )) as HTMLSelectElement;
    expect(branchSelect.value).toBe(ALEX_BRANCH_ID);
    expect(screen.getByText('Base unit: tablet')).toBeDefined();
    expect(
      await screen.findByText('No reorder rule configured yet for this branch')
    ).toBeDefined();

    // Validation: max_quantity_base >= reorder_point_base
    await user.type(screen.getByLabelText('Reorder point'), '200');
    await user.type(screen.getByLabelText('Reorder quantity'), '100');
    await user.type(screen.getByLabelText('Maximum stock quantity'), '150');
    await user.click(screen.getByRole('button', { name: 'Save reorder rule' }));

    expect(
      await screen.findByText(
        'Maximum stock quantity must be greater than or equal to reorder point'
      )
    ).toBeDefined();

    const maxInput = screen.getByLabelText('Maximum stock quantity');
    await user.clear(maxInput);
    await user.type(maxInput, '600');
    await user.click(screen.getByRole('button', { name: 'Save reorder rule' }));

    await waitFor(() => {
      expect(
        screen.queryByText('No reorder rule configured yet for this branch')
      ).toBeNull();
    });
    expect(
      screen
        .getByRole('button', { name: 'Save reorder rule' })
        .hasAttribute('disabled')
    ).toBe(true);

    // Switch to Cairo -> loads seeded rule (200.0000 / 500.0000 / 1200.0000)
    await user.selectOptions(branchSelect, CAIRO_BRANCH_ID);
    await waitFor(() => {
      expect(
        (screen.getByLabelText('Reorder point') as HTMLInputElement).value
      ).toBe('200.0000');
    });
    expect(
      (screen.getByLabelText('Reorder quantity') as HTMLInputElement).value
    ).toBe('500.0000');
    expect(
      (screen.getByLabelText('Maximum stock quantity') as HTMLInputElement)
        .value
    ).toBe('1200.0000');

    // Switch to BranchLocal -> read-only mode
    seedAuth({ runtime: 'BranchLocal' }, CAIRO_BRANCH_ID);
    rerender(
      <ProductDetailsView
        productId={productFixture.product_id}
        initialProduct={productFixture}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
        onEditProduct={() => undefined}
      />
    );

    expect(
      screen.getByText(
        'Reorder configuration writes require the Cloud deployment'
      )
    ).toBeDefined();
    expect(
      screen.queryByRole('button', { name: 'Save reorder rule' })
    ).toBeNull();
    expect(
      (screen.getByLabelText('Reorder point') as HTMLInputElement).disabled
    ).toBe(true);
    expect(
      screen
        .getByRole('switch', { name: 'Active reorder rule' })
        .hasAttribute('disabled')
    ).toBe(true);

    // Role switch to Cashier falls back safely to Product Information
    seedAuth({ roles: ['Cashier'], scopes: ['inventory:read'] });
    rerender(
      <ProductDetailsView
        productId={productFixture.product_id}
        initialProduct={productFixture}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
      />
    );
    expect(
      screen.queryByRole('tab', { name: 'Branch Reorder Settings' })
    ).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Product Information' })
    ).toBeDefined();
  });

  it('allows Pharmacist with assigned branches to read and save reorder rules without calling GET /branches', async () => {
    const user = userEvent.setup();
    let branchListCalls = 0;

    server.use(
      http.get('*/api/v1/branches', () => {
        branchListCalls += 1;
        return HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Admin only' } },
          { status: 403 }
        );
      })
    );

    seedAuth(
      {
        roles: ['Pharmacist'],
        branch_scope: 'ASSIGNED',
        branch_ids: [CAIRO_BRANCH_ID],
        scopes: ['inventory:read', 'inventory:write'],
        runtime: 'Cloud',
      },
      CAIRO_BRANCH_ID
    );

    renderWithProviders(
      <ProductDetailsView
        productId={productFixture.product_id}
        initialProduct={productFixture}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
      />
    );

    await user.click(
      screen.getByRole('tab', { name: 'Branch Reorder Settings' })
    );

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Reorder point') as HTMLInputElement).value
      ).toBe('200.0000');
    });
    expect(branchListCalls).toBe(0);

    const pointInput = screen.getByLabelText('Reorder point');
    await user.clear(pointInput);
    await user.type(pointInput, '250');
    await user.click(screen.getByRole('button', { name: 'Save reorder rule' }));

    await waitFor(() => {
      expect((pointInput as HTMLInputElement).value).toBe('250.0000');
    });
  });

  it('renders AI Demand Forecast with explicit Unavailable status and zero invented numbers', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProductDetailsView
        productId={productFixture.product_id}
        initialProduct={productFixture}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'AI Demand Forecast' }));

    expect(
      screen.getByRole('heading', { name: 'AI Demand Forecast' })
    ).toBeDefined();
    expect(screen.getByText('Model: Unavailable')).toBeDefined();
    expect(screen.getByText('Seasonal indicator: Unavailable')).toBeDefined();
    expect(screen.getByText('Actual history (Unavailable)')).toBeDefined();
    expect(screen.getByText('Predicted demand (Unavailable)')).toBeDefined();
    expect(
      screen.getByText(
        /Awaiting Brain telemetry — forecast series and seasonal indicators \(flu\/Ramadan\) remain Unavailable until connected/i
      )
    ).toBeDefined();
  });

  it('handles UOM query retry, base UOM edit restrictions, and BranchReorder error retry + 422 mapping', async () => {
    const user = userEvent.setup();
    let failUoms = true;
    let failBranches = true;
    let failReorder = true;

    server.use(
      http.get('*/api/v1/products/:productId/uoms', () => {
        if (failUoms) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'UOM fetch error',
                trace_id: 'tr-uom-500',
              },
            },
            { status: 500 }
          );
        }
        return undefined;
      }),
      http.get('*/api/v1/branches', () => {
        if (failBranches) {
          return HttpResponse.json(
            { error: { code: 'INTERNAL_ERROR', message: 'Branches down' } },
            { status: 500 }
          );
        }
        return undefined;
      }),
      http.get(
        '*/api/v1/branches/:branchId/products/:productId/reorder-rule',
        () => {
          if (failReorder) {
            return HttpResponse.json(
              {
                error: {
                  code: 'INTERNAL_ERROR',
                  message: 'Reorder service busy',
                  trace_id: 'tr-reo-500',
                },
              },
              { status: 500 }
            );
          }
          return undefined;
        }
      )
    );

    const centrum = INITIAL_PRODUCTS[4];
    renderWithProviders(
      <ProductDetailsView
        productId={centrum.product_id}
        initialProduct={centrum}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'UOMs & Pricing' }));
    expect(
      await screen.findByText(/UOM fetch error \(Trace: tr-uom-500\)/i)
    ).toBeDefined();
    failUoms = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Tablet (base)')).toBeDefined();

    // Base UOM edit keeps Active UOM toggle disabled and enforces price when Sellable toggled ON
    const baseRow = screen.getByText('Tablet (base)').closest('tr');
    if (!baseRow) throw new Error('Expected Tablet (base) row');
    await user.click(within(baseRow).getByRole('button', { name: 'Edit' }));
    const editBaseDialog = screen.getByRole('dialog');
    expect(
      within(editBaseDialog)
        .getByRole('switch', { name: 'Active UOM' })
        .hasAttribute('disabled')
    ).toBe(true);
    await user.click(
      within(editBaseDialog).getByRole('switch', { name: 'Sellable' })
    );
    await user.click(
      within(editBaseDialog).getByRole('button', { name: 'Save changes' })
    );
    expect(
      await within(editBaseDialog).findByText(
        'Sale unit price is required when UOM is sellable'
      )
    ).toBeDefined();
    await user.click(
      within(editBaseDialog).getByRole('button', { name: 'Cancel' })
    );

    // Branch Reorder error + Retry for both branches and reorder-rule, plus 422 field error
    await user.click(
      screen.getByRole('tab', { name: 'Branch Reorder Settings' })
    );
    expect(await screen.findByText('Branches down')).toBeDefined();
    failBranches = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByText(/Reorder service busy \(Trace: tr-reo-500\)/i)
    ).toBeDefined();
    failReorder = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByText('No reorder rule configured yet for this branch')
    ).toBeDefined();

    server.use(
      http.put(
        '*/api/v1/branches/:branchId/products/:productId/reorder-rule',
        () =>
          HttpResponse.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid threshold',
                details: [
                  {
                    field: 'reorder_point_base',
                    issue: 'Reorder point rejected by branch policy',
                  },
                ],
              },
            },
            { status: 422 }
          ),
        { once: true }
      )
    );

    await user.type(screen.getByLabelText('Reorder point'), '25');
    await user.type(screen.getByLabelText('Reorder quantity'), '50');
    await user.click(screen.getByRole('button', { name: 'Save reorder rule' }));
    expect(
      await screen.findByText('Reorder point rejected by branch policy')
    ).toBeDefined();
  });

  it('renders EmptyState for blank productId and warning Alert on background refresh failure with initialProduct', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <ProductDetailsView
        productId=""
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
      />
    );

    expect(screen.getByText('Product unavailable')).toBeDefined();
    expect(
      screen.queryByRole('status', { name: 'Loading product details' })
    ).toBeNull();

    cleanup();

    let failRefresh = true;
    server.use(
      http.get('*/api/v1/products/:productId', () => {
        if (failRefresh) {
          return HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Temporary refresh failure',
                trace_id: 'trace-bg-500',
              },
            },
            { status: 500 }
          );
        }
        return HttpResponse.json(
          { ...productFixture, name: 'Panadol Extra 500mg' },
          { status: 200 }
        );
      })
    );

    renderWithProviders(
      <ProductDetailsView
        productId={productFixture.product_id}
        initialProduct={productFixture}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Panadol 500mg Tablets' })
    ).toBeDefined();
    expect(await screen.findByText('Could not refresh product')).toBeDefined();
    expect(
      screen.getByText(/Temporary refresh failure \(Trace: trace-bg-500\)/i)
    ).toBeDefined();

    failRefresh = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('heading', { name: 'Panadol Extra 500mg' })
    ).toBeDefined();
    expect(screen.queryByText('Could not refresh product')).toBeNull();
  });

  it('covers UOM modal edge cases: hasBaseUom=false, clearing price when Sellable toggled off, toggle errors, price formatting, and auto-close on BranchLocal', async () => {
    const user = userEvent.setup();
    const noBaseProduct: ProductDto = { ...productFixture, uoms: [] };

    server.use(
      http.get('*/api/v1/products/:productId/uoms', () =>
        HttpResponse.json([], { status: 200 })
      )
    );

    const { rerender } = renderWithProviders(
      <ProductDetailsView
        productId={noBaseProduct.product_id}
        initialProduct={noBaseProduct}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'UOMs & Pricing' }));
    expect(await screen.findByText('No units of measure found')).toBeDefined();

    await user.click(screen.getAllByRole('button', { name: 'Add UOM' })[0]);
    const createDialog = screen.getByRole('dialog');
    const baseToggle = within(createDialog).getByRole('switch', {
      name: 'Base unit',
    });
    const factorField = within(createDialog).getByLabelText(
      'Conversion factor'
    ) as HTMLInputElement;

    await user.click(baseToggle);
    expect(factorField.value).toBe('1');
    expect(factorField.disabled).toBe(true);
    await user.click(baseToggle);
    expect(factorField.disabled).toBe(false);

    // 422 errors targeting boolean toggle fields must render inline instead of being swallowed
    server.use(
      http.post(
        '*/api/v1/products/:productId/uoms',
        () =>
          HttpResponse.json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid flags',
                details: [
                  { field: 'is_sellable', issue: 'Sellable flag blocked' },
                  {
                    field: 'is_purchasable',
                    issue: 'Purchasable flag blocked',
                  },
                ],
              },
            },
            { status: 422 }
          ),
        { once: true }
      )
    );

    await user.type(within(createDialog).getByLabelText('UOM code'), 'tablet');
    await user.type(factorField, '1');
    await user.type(
      within(createDialog).getByLabelText('Display name'),
      'Tablet'
    );
    await user.click(
      within(createDialog).getByRole('button', { name: 'Add UOM' })
    );
    expect(
      await within(createDialog).findByText('Sellable flag blocked')
    ).toBeDefined();
    expect(
      within(createDialog).getByText('Purchasable flag blocked')
    ).toBeDefined();

    // Switching runtime to BranchLocal while modal is open must immediately close it
    seedAuth({ runtime: 'BranchLocal' });
    rerender(
      <ProductDetailsView
        productId={noBaseProduct.product_id}
        initialProduct={noBaseProduct}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    cleanup();

    // Reset to Cloud with Centrum UOMs + leading-dot & zero prices, and test Sellable OFF clears sale_unit_price
    seedAuth({ runtime: 'Cloud' });
    server.resetHandlers();
    const centrum = INITIAL_PRODUCTS[4];
    server.use(
      http.get(
        '*/api/v1/products/:productId/uoms',
        () =>
          HttpResponse.json(
            [
              ...centrum.uoms,
              {
                product_uom_id: 'u-zero',
                uom_code: 'sample',
                display_name: 'Free Sample',
                conversion_to_base: '1.000000',
                sale_unit_price: '0.0000',
                is_base: false,
                is_sellable: true,
                is_purchasable: false,
                is_active: true,
              },
              {
                product_uom_id: 'u-dot',
                uom_code: 'drop',
                display_name: 'Single Drop',
                conversion_to_base: '0.500000',
                sale_unit_price: '.5',
                is_base: false,
                is_sellable: true,
                is_purchasable: false,
                is_active: true,
              },
            ],
            { status: 200 }
          ),
        { once: true }
      )
    );

    renderWithProviders(
      <ProductDetailsView
        productId={centrum.product_id}
        initialProduct={centrum}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
      />
    );
    await user.click(screen.getByRole('tab', { name: 'UOMs & Pricing' }));
    expect(await screen.findByText('EGP 0.00')).toBeDefined();
    expect(screen.getByText('EGP 0.50')).toBeDefined();

    const bottle60Row = screen.getByText('Bottle of 60').closest('tr');
    if (!bottle60Row) throw new Error('Expected Bottle of 60 row');
    await user.click(within(bottle60Row).getByRole('button', { name: 'Edit' }));

    const editDialog = screen.getByRole('dialog');
    const priceInput = within(editDialog).getByLabelText(
      'Sale unit price (EGP)'
    ) as HTMLInputElement;
    expect(priceInput.value).toBe('420.0000');
    await user.click(
      within(editDialog).getByRole('switch', { name: 'Sellable' })
    );
    expect(priceInput.disabled).toBe(true);
    expect(priceInput.value).toBe('');
    await user.click(
      within(editDialog).getByRole('button', { name: 'Save changes' })
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('guards direct BranchReorderTab mount from Cashier and clears max_quantity_base to null + is_active=false on PUT', async () => {
    const user = userEvent.setup();
    let branchCalls = 0;
    let reorderGetCalls = 0;
    let capturedPut: unknown = null;

    server.use(
      http.get('*/api/v1/branches', () => {
        branchCalls += 1;
        return undefined;
      }),
      http.get(
        '*/api/v1/branches/:branchId/products/:productId/reorder-rule',
        () => {
          reorderGetCalls += 1;
          return undefined;
        }
      ),
      http.put(
        '*/api/v1/branches/:branchId/products/:productId/reorder-rule',
        async ({ request }) => {
          capturedPut = await request.clone().json();
          return undefined;
        }
      )
    );

    seedAuth({ roles: ['Cashier'], scopes: ['inventory:read'] });
    renderWithProviders(<BranchReorderTab product={productFixture} />);
    expect(screen.getByText('Access restricted')).toBeDefined();
    expect(branchCalls).toBe(0);
    expect(reorderGetCalls).toBe(0);

    cleanup();

    seedAuth({}, CAIRO_BRANCH_ID);
    renderWithProviders(<BranchReorderTab product={productFixture} />);

    const maxInput = (await screen.findByLabelText(
      'Maximum stock quantity'
    )) as HTMLInputElement;
    await waitFor(() => {
      expect(maxInput.value).toBe('1200.0000');
    });

    await user.clear(maxInput);
    const activeSwitch = screen.getByRole('switch', {
      name: 'Active reorder rule',
    });
    await user.click(activeSwitch);
    await user.click(screen.getByRole('button', { name: 'Save reorder rule' }));

    await waitFor(() => {
      expect(capturedPut).toEqual({
        reorder_point_base: '200.0000',
        reorder_quantity_base: '500.0000',
        max_quantity_base: null,
        is_active: false,
      });
    });
    await waitFor(() => {
      expect(
        screen
          .getByRole('button', { name: 'Save reorder rule' })
          .hasAttribute('disabled')
      ).toBe(true);
    });
  });
});
