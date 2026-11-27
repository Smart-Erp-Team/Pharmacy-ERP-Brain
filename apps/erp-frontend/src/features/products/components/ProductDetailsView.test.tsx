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
import {
  branchHandlers,
  MOCK_BRANCH_IDS,
  resetMockBranches,
} from '../../../mocks/branchHandlers';
import {
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  MOCK_PRODUCT_IDS,
  ORGANIZATION_ID,
  productHandlers,
  resetMockCatalog,
} from '../../../mocks/productHandlers';
import { useAuthStore } from '../../../stores/authStore';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { CurrentUser, Product } from '../../../types/api';
import { BranchReorderTab } from './BranchReorderTab';
import { ProductDetailsView } from './ProductDetailsView';

const AUGMENTIN = INITIAL_PRODUCTS[0];
const PANADOL = INITIAL_PRODUCTS[1];
const VITAMIN_D3 = INITIAL_PRODUCTS[2];
const DISCONTINUED = INITIAL_PRODUCTS[3];

const server = setupServer(...branchHandlers, ...productHandlers);

function requireInput(element: HTMLElement): HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) {
    throw new Error('Expected HTMLInputElement');
  }
  return element;
}

function requireSelect(element: HTMLElement): HTMLSelectElement {
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error('Expected HTMLSelectElement');
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
  activeBranchId: string | null = null
) {
  useAuthStore.setState({
    currentUser: buildAuthUser(overrides),
    organizationCode: 'MEDCARE',
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
    organizationCode: null,
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
      })
    );

    renderWithProviders(
      <ProductDetailsView
        productId={AUGMENTIN.product_id}
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
      await screen.findByRole('heading', {
        name: 'Augmentin 1g Film-Coated Tablets',
      })
    ).toBeDefined();
    expect(screen.getAllByText('MED-AUG-1000')).toHaveLength(2);
    expect(screen.getByText('Active')).toBeDefined();
    expect(screen.getAllByText('Penicillins').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Edit product' }));
    expect(onEditProduct).toHaveBeenCalledWith(
      expect.objectContaining({ product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G })
    );

    // Product Information fields (Augmentin: tax_rate 0, base price 10.5 -> EGP 10.50, lot_tracking true, 90 days)
    expect(screen.getByText('EGP 10.50')).toBeDefined();
    expect(screen.getByText('0%')).toBeDefined();
    expect(screen.getByText('(0)')).toBeDefined();
    expect(screen.getByText('Required')).toBeDefined();
    expect(screen.getByText('90 days')).toBeDefined();
    expect(screen.getByText('6221001000019')).toBeDefined();
    expect(
      screen.getByText('Amoxicillin 875mg + Clavulanic Acid 125mg')
    ).toBeDefined();
    expect(screen.getByText('GSK')).toBeDefined();

    cleanup();

    // Verify Vitamin D3 fractional tax_rate (0.14 -> 14%), non-lot tracking, and EGP 120.00 base price
    renderWithProviders(
      <ProductDetailsView
        productId={VITAMIN_D3.product_id}
        initialProduct={VITAMIN_D3}
        categories={INITIAL_CATEGORIES}
        onBack={onBack}
      />
    );
    expect(
      screen.getByRole('heading', { name: 'Vitamin D3 5000 IU' })
    ).toBeDefined();
    expect(screen.getByText('14%')).toBeDefined();
    expect(screen.getByText('(0.14)')).toBeDefined();
    expect(screen.getByText('EGP 120.00')).toBeDefined();
    expect(screen.getByText('Not required')).toBeDefined();
    expect(screen.getByText('30 days')).toBeDefined();

    cleanup();

    // Verify initialProduct fallback while query is still pending + explicit Unavailable for null optional fields & 0 days
    const sparseProduct: Product = {
      ...DISCONTINUED,
      category_id: 'missing-category-id',
      barcode: null,
      generic_name: null,
      brand_name: '',
      image_url: null,
      tax_rate: 0,
      expiry_alert_days: 0,
      uoms: [],
      created_at: '',
      updated_at: '',
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
      screen.getByRole('heading', { name: 'Discontinued Cough Syrup' })
    ).toBeDefined();
    expect(screen.getAllByText('Category unavailable')).toHaveLength(2);
    expect(screen.getByText('0%')).toBeDefined();
    expect(screen.getByText('0 days')).toBeDefined();
    expect(screen.getAllByText('Unavailable')).toHaveLength(7);
    expect(screen.queryByRole('button', { name: 'Edit product' })).toBeNull();
  });

  it('manages UOMs & Pricing: include_inactive toggle, base toggle disabled, add/edit validation, 409 errors, and BranchLocal read-only gating', async () => {
    const user = userEvent.setup();

    const { rerender } = renderWithProviders(
      <ProductDetailsView
        productId={AUGMENTIN.product_id}
        initialProduct={AUGMENTIN}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'UOMs & Pricing' }));

    // Augmentin seeded UOMs: TAB (1, EGP 10.50), STRIP (7, EGP 70.00), BOX (14, EGP 138.00)
    expect(await screen.findByText('Strip of 7')).toBeDefined();
    expect(screen.getByText('Box of 14')).toBeDefined();
    const tabRow = screen.getByText('Tablet').closest('tr');
    if (!tabRow) throw new Error('Expected Tablet row');
    expect(within(tabRow).getByText('Base unit')).toBeDefined();
    expect(within(tabRow).getByText('EGP 10.50')).toBeDefined();
    expect(screen.getByText('EGP 70.00')).toBeDefined();
    expect(screen.getByText('EGP 138.00')).toBeDefined();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();

    const baseToggle = screen.getByRole('switch', {
      name: 'Toggle status for TAB',
    });
    expect(baseToggle.hasAttribute('disabled')).toBe(true);

    // Soft-toggle STRIP inactive via PATCH; remains visible via include_inactive=true
    const stripToggle = screen.getByRole('switch', {
      name: 'Toggle status for STRIP',
    });
    expect(stripToggle.getAttribute('aria-checked')).toBe('true');
    await user.click(stripToggle);
    await waitFor(() => {
      expect(stripToggle.getAttribute('aria-checked')).toBe('false');
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

    await user.type(within(addDialog).getByLabelText('UOM code'), 'BOX');
    await user.type(
      within(addDialog).getByLabelText('Display name'),
      'Duplicate Box'
    );
    await user.type(
      within(addDialog).getByLabelText('Conversion factor'),
      '14'
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
      '1350'
    );
    await user.click(
      within(addDialog).getByRole('button', { name: 'Add UOM' })
    );
    expect(
      await within(addDialog).findByText(
        /UOM code "BOX" already exists for this product/i
      )
    ).toBeDefined();

    const codeInput = within(addDialog).getByLabelText('UOM code');
    await user.clear(codeInput);
    await user.type(codeInput, 'CARTON');
    const nameInput = within(addDialog).getByLabelText('Display name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Carton of 140');
    const factorInput = within(addDialog).getByLabelText('Conversion factor');
    await user.clear(factorInput);
    await user.type(factorInput, '140');
    await user.click(
      within(addDialog).getByRole('switch', { name: 'Purchasable' })
    );
    await user.click(
      within(addDialog).getByRole('button', { name: 'Add UOM' })
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(await screen.findByText('Carton of 140')).toBeDefined();
    expect(screen.getByText('EGP 1350.00')).toBeDefined();

    // Edit UOM: enforces !isDirty, immutable code/conversion, immutability notice, and 409 error surfacing
    const boxRow = screen.getByText('Box of 14').closest('tr');
    if (!boxRow) throw new Error('Expected Box of 14 row');
    await user.click(within(boxRow).getByRole('button', { name: 'Edit' }));

    const editDialog = screen.getByRole('dialog');
    expect(
      within(editDialog).getByText(
        /conversion_to_base and is_base become immutable once referenced by a posted document or stock/i
      )
    ).toBeDefined();
    expect(within(editDialog).queryByLabelText('UOM code')).toBeNull();
    expect(within(editDialog).queryByLabelText('Conversion factor')).toBeNull();
    expect(within(editDialog).getByText('Factor: 14')).toBeDefined();

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
    await user.type(editName, 'Box of 14 Updated');
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
    expect(await screen.findByText('Box of 14 Updated')).toBeDefined();

    // BranchLocal hides Add UOM & Edit buttons, disables toggles, and displays Cloud deployment notice
    seedAuth({ runtime_mode: 'BranchLocal' });
    rerender(
      <ProductDetailsView
        productId={AUGMENTIN.product_id}
        initialProduct={AUGMENTIN}
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
        .getByRole('switch', { name: 'Toggle status for BOX' })
        .hasAttribute('disabled')
    ).toBe(true);
  }, 15_000);

  it('shows Branch Reorder Settings read-only for Cashier, allows Admin PUT on Cloud with native numbers, and locks BranchLocal', async () => {
    const user = userEvent.setup();

    // 1. Cashier with inventory:read CAN view Branch Reorder Settings read-only
    seedAuth(
      {
        role: 'Cashier',
        branch_scope: 'ASSIGNED',
        branch_ids: [MOCK_BRANCH_IDS.DOWNTOWN],
        scopes: ['inventory:read', 'sales:read', 'sales:write'],
        runtime_mode: 'Cloud',
      },
      MOCK_BRANCH_IDS.DOWNTOWN
    );
    const { rerender } = renderWithProviders(
      <ProductDetailsView
        productId={AUGMENTIN.product_id}
        initialProduct={AUGMENTIN}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
        onEditProduct={() => undefined}
      />
    );

    expect(screen.queryByRole('button', { name: 'Edit product' })).toBeNull();
    await user.click(
      screen.getByRole('tab', { name: 'Branch Reorder Settings' })
    );

    const cashierBranchSelect = requireSelect(
      await screen.findByLabelText('Branch')
    );
    expect(cashierBranchSelect.value).toBe(MOCK_BRANCH_IDS.DOWNTOWN);
    expect(
      screen.getByRole('option', {
        name: 'MED-DT — MedCare - Downtown Flagship',
      })
    ).toBeDefined();

    await waitFor(() => {
      expect(requireInput(screen.getByLabelText('Reorder point')).value).toBe(
        '50'
      );
    });
    expect(requireInput(screen.getByLabelText('Reorder quantity')).value).toBe(
      '200'
    );
    expect(
      requireInput(screen.getByLabelText('Maximum stock quantity')).value
    ).toBe('500');
    expect(requireInput(screen.getByLabelText('Reorder point')).disabled).toBe(
      true
    );
    expect(
      screen
        .getByRole('switch', { name: 'Active reorder rule' })
        .hasAttribute('disabled')
    ).toBe(true);
    expect(
      screen.queryByRole('button', { name: 'Save reorder rule' })
    ).toBeNull();
    expect(
      screen.getByText(/Read-only access — reorder configuration writes/i)
    ).toBeDefined();

    // 2. Admin on Cloud with activeBranchId=Alexandria defaults to MED-ALX (unconfigured rule)
    seedAuth({}, MOCK_BRANCH_IDS.ALEXANDRIA);
    rerender(
      <ProductDetailsView
        productId={AUGMENTIN.product_id}
        initialProduct={AUGMENTIN}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
        onEditProduct={() => undefined}
      />
    );

    const branchSelect = requireSelect(await screen.findByLabelText('Branch'));
    await waitFor(() => {
      expect(
        screen.queryByRole('option', {
          name: 'MED-ALX — MedCare - Alexandria Corniche',
        })
      ).not.toBeNull();
    });
    await user.selectOptions(branchSelect, MOCK_BRANCH_IDS.ALEXANDRIA);
    expect(branchSelect.value).toBe(MOCK_BRANCH_IDS.ALEXANDRIA);
    expect(screen.getByText('Base unit: TAB')).toBeDefined();
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

    // Switch to Downtown (MED-DT) -> loads seeded rule (50 / 200 / 500)
    await user.selectOptions(branchSelect, MOCK_BRANCH_IDS.DOWNTOWN);
    await waitFor(() => {
      expect(requireInput(screen.getByLabelText('Reorder point')).value).toBe(
        '50'
      );
    });
    expect(requireInput(screen.getByLabelText('Reorder quantity')).value).toBe(
      '200'
    );
    expect(
      requireInput(screen.getByLabelText('Maximum stock quantity')).value
    ).toBe('500');

    // Switch to BranchLocal -> read-only mode
    seedAuth({ runtime_mode: 'BranchLocal' }, MOCK_BRANCH_IDS.DOWNTOWN);
    rerender(
      <ProductDetailsView
        productId={AUGMENTIN.product_id}
        initialProduct={AUGMENTIN}
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
    expect(requireInput(screen.getByLabelText('Reorder point')).disabled).toBe(
      true
    );
    expect(
      screen
        .getByRole('switch', { name: 'Active reorder rule' })
        .hasAttribute('disabled')
    ).toBe(true);

    // Losing inventory:read scope hides Branch Reorder Settings and falls back safely
    seedAuth({ role: 'Cashier', scopes: ['sales:read'] });
    rerender(
      <ProductDetailsView
        productId={AUGMENTIN.product_id}
        initialProduct={AUGMENTIN}
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

  it('allows Pharmacist with assigned branch to load MED-DT and save reorder rules via PUT', async () => {
    const user = userEvent.setup();

    seedAuth(
      {
        role: 'Pharmacist',
        branch_scope: 'ASSIGNED',
        branch_ids: [MOCK_BRANCH_IDS.DOWNTOWN],
        scopes: ['inventory:read', 'inventory:write', 'sales:read'],
        runtime_mode: 'Cloud',
      },
      MOCK_BRANCH_IDS.DOWNTOWN
    );

    renderWithProviders(
      <ProductDetailsView
        productId={AUGMENTIN.product_id}
        initialProduct={AUGMENTIN}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
      />
    );

    await user.click(
      screen.getByRole('tab', { name: 'Branch Reorder Settings' })
    );

    await waitFor(() => {
      expect(requireInput(screen.getByLabelText('Reorder point')).value).toBe(
        '50'
      );
    });
    expect(
      screen.getByRole('option', {
        name: 'MED-DT — MedCare - Downtown Flagship',
      })
    ).toBeDefined();
    expect(
      screen.queryByRole('option', {
        name: 'MED-ALX — MedCare - Alexandria Corniche',
      })
    ).toBeNull();

    const pointInput = requireInput(screen.getByLabelText('Reorder point'));
    await user.clear(pointInput);
    await user.type(pointInput, '75');
    await user.click(screen.getByRole('button', { name: 'Save reorder rule' }));

    await waitFor(() => {
      expect(pointInput.value).toBe('75');
    });
  });

  it('renders AI Demand Forecast with explicit Unavailable status and zero invented numbers', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ProductDetailsView
        productId={AUGMENTIN.product_id}
        initialProduct={AUGMENTIN}
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
                code: 'INTERNAL_SERVER_ERROR',
                message: 'UOM fetch error',
                details: [],
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
            {
              error: {
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Branches down',
                details: [],
                trace_id: 'tr-br-500',
              },
            },
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
                  code: 'INTERNAL_SERVER_ERROR',
                  message: 'Reorder service busy',
                  details: [],
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

    renderWithProviders(
      <ProductDetailsView
        productId={PANADOL.product_id}
        initialProduct={PANADOL}
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
    expect(await screen.findByText('Box of 24')).toBeDefined();

    // Base UOM edit keeps Active UOM toggle disabled and enforces price when Sellable is ON
    const baseRow = screen.getByText('Tablet').closest('tr');
    if (!baseRow) throw new Error('Expected Tablet row');
    await user.click(within(baseRow).getByRole('button', { name: 'Edit' }));
    const editBaseDialog = screen.getByRole('dialog');
    expect(
      within(editBaseDialog)
        .getByRole('switch', { name: 'Active UOM' })
        .hasAttribute('disabled')
    ).toBe(true);
    const priceInput = within(editBaseDialog).getByLabelText(
      'Sale unit price (EGP)'
    );
    await user.clear(priceInput);
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
    expect(
      await screen.findByText(/Branches down \(Trace: tr-br-500\)/i)
    ).toBeDefined();
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
                trace_id: 'tr-reo-422',
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
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Temporary refresh failure',
                details: [],
                trace_id: 'trace-bg-500',
              },
            },
            { status: 500 }
          );
        }
        return HttpResponse.json(
          { ...AUGMENTIN, name: 'Augmentin 1g Refreshed' },
          { status: 200 }
        );
      })
    );

    renderWithProviders(
      <ProductDetailsView
        productId={AUGMENTIN.product_id}
        initialProduct={AUGMENTIN}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Augmentin 1g Film-Coated Tablets' })
    ).toBeDefined();
    expect(await screen.findByText('Could not refresh product')).toBeDefined();
    expect(
      screen.getByText(/Temporary refresh failure \(Trace: trace-bg-500\)/i)
    ).toBeDefined();

    failRefresh = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('heading', { name: 'Augmentin 1g Refreshed' })
    ).toBeDefined();
    expect(screen.queryByText('Could not refresh product')).toBeNull();
  });

  it('covers UOM modal edge cases: hasBaseUom=false, clearing price when Sellable toggled off, toggle errors, numeric price formatting, and auto-close on BranchLocal', async () => {
    const user = userEvent.setup();
    const noBaseProduct: Product = { ...PANADOL, uoms: [] };

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
    const factorField = requireInput(
      within(createDialog).getByLabelText('Conversion factor')
    );

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
                trace_id: 'tr-uom-flags',
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

    await user.type(within(createDialog).getByLabelText('UOM code'), 'TAB');
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
    seedAuth({ runtime_mode: 'BranchLocal' });
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

    // Reset to Cloud with numeric 0, 0.5, and null prices, and test Sellable OFF clears sale_unit_price
    seedAuth({ runtime_mode: 'Cloud' });
    server.resetHandlers();
    server.use(
      http.get(
        '*/api/v1/products/:productId/uoms',
        () =>
          HttpResponse.json(
            [
              ...PANADOL.uoms,
              {
                product_uom_id: '11111111-7777-4111-8111-000000000090',
                product_id: PANADOL.product_id,
                uom_code: 'SAMPLE',
                display_name: 'Free Sample',
                conversion_to_base: 1,
                sale_unit_price: 0,
                is_base: false,
                is_sellable: true,
                is_purchasable: false,
                is_active: true,
                updated_at: '2026-11-25T10:00:00+00:00',
              },
              {
                product_uom_id: '11111111-7777-4111-8111-000000000091',
                product_id: PANADOL.product_id,
                uom_code: 'DROP',
                display_name: 'Single Drop',
                conversion_to_base: 0.5,
                sale_unit_price: 0.5,
                is_base: false,
                is_sellable: true,
                is_purchasable: false,
                is_active: true,
                updated_at: '2026-11-25T10:00:00+00:00',
              },
              {
                product_uom_id: '11111111-7777-4111-8111-000000000092',
                product_id: PANADOL.product_id,
                uom_code: 'BULK',
                display_name: 'Bulk Drum',
                conversion_to_base: 100,
                sale_unit_price: null,
                is_base: false,
                is_sellable: false,
                is_purchasable: false,
                is_active: true,
                updated_at: '2026-11-25T10:00:00+00:00',
              },
            ],
            { status: 200 }
          ),
        { once: true }
      )
    );

    renderWithProviders(
      <ProductDetailsView
        productId={PANADOL.product_id}
        initialProduct={PANADOL}
        categories={INITIAL_CATEGORIES}
        onBack={() => undefined}
      />
    );
    await user.click(screen.getByRole('tab', { name: 'UOMs & Pricing' }));
    expect(await screen.findByText('EGP 0.00')).toBeDefined();
    expect(screen.getByText('EGP 0.50')).toBeDefined();
    const bulkRow = screen.getByText('Bulk Drum').closest('tr');
    if (!bulkRow) throw new Error('Expected Bulk Drum row');
    expect(within(bulkRow).getByText('Inactive flags')).toBeDefined();
    expect(within(bulkRow).getByText('Unavailable')).toBeDefined();

    const boxRow = screen.getByText('Box of 24').closest('tr');
    if (!boxRow) throw new Error('Expected Box of 24 row');
    await user.click(within(boxRow).getByRole('button', { name: 'Edit' }));

    const editDialog = screen.getByRole('dialog');
    const priceInput = requireInput(
      within(editDialog).getByLabelText('Sale unit price (EGP)')
    );
    expect(priceInput.value).toBe('55');
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

  it('guards direct BranchReorderTab mount without inventory:read and clears max_quantity_base to null + is_active=false with native numbers on PUT', async () => {
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

    seedAuth({ role: 'Cashier', scopes: ['sales:read'] });
    renderWithProviders(<BranchReorderTab product={AUGMENTIN} />);
    expect(screen.getByText('Access restricted')).toBeDefined();
    expect(branchCalls).toBe(0);
    expect(reorderGetCalls).toBe(0);

    cleanup();

    seedAuth({}, MOCK_BRANCH_IDS.DOWNTOWN);
    renderWithProviders(<BranchReorderTab product={AUGMENTIN} />);

    const maxInput = requireInput(
      await screen.findByLabelText('Maximum stock quantity')
    );
    await waitFor(() => {
      expect(maxInput.value).toBe('500');
    });

    await user.clear(maxInput);
    const activeSwitch = screen.getByRole('switch', {
      name: 'Active reorder rule',
    });
    await user.click(activeSwitch);
    await user.click(screen.getByRole('button', { name: 'Save reorder rule' }));

    await waitFor(() => {
      expect(capturedPut).toEqual({
        reorder_point_base: 50,
        reorder_quantity_base: 200,
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
