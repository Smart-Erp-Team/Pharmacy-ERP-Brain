/** @vitest-environment jsdom */
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
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
import inventoryBalanceFixture from '@contracts/fixtures/inventory-balance.json';
import productFixture from '@contracts/fixtures/product.json';
import { ApiClientError, apiClient } from '../../../lib/api/client';
import {
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_REORDER_RULES,
  LOCKED_HISTORY_PRODUCT_IDS,
  MOCK_BRANCH_IDS,
  MOCK_CATEGORY_IDS,
  MOCK_PRODUCT_IDS,
  MOCK_PRODUCT_UOM_IDS,
  ORGANIZATION_ID,
  productHandlers,
  resetMockCatalog,
} from '../../../mocks/productHandlers';
import type { CreateProductRequest, ReorderRule } from '../../../types/api';
import * as productsBarrel from '../index';
import {
  createProduct,
  createProductCategory,
  createProductUom,
  getProduct,
  getProductCategory,
  getReorderRule,
  listProductCategories,
  listProducts,
  listProductUoms,
  patchProduct,
  patchProductCategory,
  patchProductUom,
  upsertReorderRule,
} from '../api/catalogApi';
import { productsKeys } from './productsKeys';
import {
  useCreateCategoryMutation,
  useCreateProductMutation,
  useCreateProductUomMutation,
  usePatchCategoryMutation,
  usePatchProductMutation,
  usePatchProductUomMutation,
  useUpsertReorderRuleMutation,
} from './useCatalogMutations';
import {
  useAllProductCategoriesQuery,
  useAllProductsQuery,
  useProductCategoriesQuery,
  useProductQuery,
  useProductsQuery,
  useProductUomsQuery,
  useReorderRuleQuery,
} from './useCatalogQueries';

const server = setupServer(...productHandlers);

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

function createQueryWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children?: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

beforeAll(() => server.listen());
beforeEach(() => {
  resetMockCatalog();
});
afterEach(() => {
  server.resetHandlers();
  if (activeQueryClient) {
    activeQueryClient.clear();
    activeQueryClient = null;
  }
  cleanup();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('products read-only barrel', () => {
  it('exports only read-only query hooks and no mutation hooks or API functions', () => {
    expect(Object.keys(productsBarrel).sort()).toEqual([
      'useAllProductCategoriesQuery',
      'useAllProductsQuery',
      'useProductCategoriesQuery',
      'useProductQuery',
      'useProductUomsQuery',
      'useProductsQuery',
      'useReorderRuleQuery',
    ]);
  });
});

describe('productHandlers Stage 1 seed invariants', () => {
  it('exposes exact MEDCARE organization, branch, category, product, and reorder rule seeds', () => {
    expect(ORGANIZATION_ID).toBe('11111111-1111-4111-8111-111111111101');
    expect(MOCK_BRANCH_IDS).toEqual({
      DOWNTOWN: '11111111-2222-4111-8111-000000000001',
      ALEXANDRIA: '11111111-2222-4111-8111-000000000002',
      GIZA: '11111111-2222-4111-8111-000000000003',
    });

    expect(INITIAL_CATEGORIES).toHaveLength(5);
    expect(INITIAL_CATEGORIES.map((c) => c.code)).toEqual([
      'CAT-ANT',
      'CAT-ANT-PEN',
      'CAT-ANA',
      'CAT-VIT',
      'CAT-ARCH',
    ]);

    expect(INITIAL_PRODUCTS).toHaveLength(4);
    expect(INITIAL_PRODUCTS[0]).toEqual(productFixture);
    expect(INITIAL_PRODUCTS.map((p) => p.sku)).toEqual([
      'MED-AUG-1000',
      'MED-PAN-500',
      'MED-VIT-D3',
      'MED-OLD-01',
    ]);
    expect(
      LOCKED_HISTORY_PRODUCT_IDS.has(inventoryBalanceFixture.product_id)
    ).toBe(true);
    expect(INITIAL_REORDER_RULES).toHaveLength(1);
    expect(INITIAL_REORDER_RULES[0]).toMatchObject({
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
      reorder_point_base: 50,
      reorder_quantity_base: 200,
      max_quantity_base: 500,
      is_active: true,
    });
  });
});

describe('catalogApi and productHandlers Stage 1 integration', () => {
  it('serializes snake_case query params, omits blank strings, and encodes path segments', async () => {
    const requestedUrls: string[] = [];
    server.use(
      http.get('*/api/v1/products', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({
          items: [],
          page: 2,
          page_size: 10,
          total_count: 0,
          next_cursor: null,
        });
      }),
      http.get('*/api/v1/product-categories', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({
          items: [],
          page: 1,
          page_size: 15,
          total_count: 0,
          next_cursor: null,
        });
      }),
      http.get('*/api/v1/product-categories/:categoryId', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json(INITIAL_CATEGORIES[0]);
      }),
      http.get('*/api/v1/products/:productId/uoms', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json([]);
      }),
      http.get(
        '*/api/v1/branches/:branchId/products/:productId/reorder-rule',
        ({ request }) => {
          requestedUrls.push(request.url);
          return HttpResponse.json(
            {
              error: {
                code: 'NOT_FOUND',
                message: 'Reorder rule not found.',
                details: [],
                trace_id: 'tr-404',
              },
            },
            { status: 404 }
          );
        }
      )
    );

    await listProducts({
      page: 2,
      page_size: 10,
      search: '  ',
      category_id: '',
      include_inactive: false,
    });
    await listProductCategories({
      page: 1,
      page_size: 15,
      parent_category_id: '   ',
      search: ' ',
      include_inactive: true,
    });
    await getProductCategory(' cat/1 ');
    await listProductUoms(' prod/1 ', { include_inactive: true });
    const missingRule = await getReorderRule(' br/1 ', ' prod/2 ');
    expect(missingRule).toBeNull();

    expect(requestedUrls).toHaveLength(5);

    const productsUrl = new URL(requestedUrls[0] ?? '');
    expect(productsUrl.searchParams.get('page')).toBe('2');
    expect(productsUrl.searchParams.get('page_size')).toBe('10');
    expect(productsUrl.searchParams.get('include_inactive')).toBe('false');
    expect(productsUrl.searchParams.has('search')).toBe(false);
    expect(productsUrl.searchParams.has('category_id')).toBe(false);

    const categoriesUrl = new URL(requestedUrls[1] ?? '');
    expect(categoriesUrl.searchParams.get('page')).toBe('1');
    expect(categoriesUrl.searchParams.get('page_size')).toBe('15');
    expect(categoriesUrl.searchParams.get('include_inactive')).toBe('true');
    expect(categoriesUrl.searchParams.has('parent_category_id')).toBe(false);
    expect(categoriesUrl.searchParams.has('search')).toBe(false);

    expect(new URL(requestedUrls[2] ?? '').pathname).toBe(
      '/api/v1/product-categories/cat%2F1'
    );
    const uomsUrl = new URL(requestedUrls[3] ?? '');
    expect(uomsUrl.pathname).toBe('/api/v1/products/prod%2F1/uoms');
    expect(uomsUrl.searchParams.get('include_inactive')).toBe('true');
    expect(new URL(requestedUrls[4] ?? '').pathname).toBe(
      '/api/v1/branches/br%2F1/products/prod%2F2/reorder-rule'
    );
  });

  it('lists, gets, creates, and patches categories with PagedResult, filters, 409 conflicts, and 422 cycle guards', async () => {
    const activeOnly = await listProductCategories();
    expect(activeOnly.items).toHaveLength(4);
    expect(activeOnly.total_count).toBe(4);
    expect(activeOnly.items.every((c) => c.is_active)).toBe(true);

    const childOnly = await listProductCategories({
      parent_category_id: MOCK_CATEGORY_IDS.ANTIBIOTICS,
    });
    expect(childOnly.items.map((c) => c.code)).toEqual(['CAT-ANT-PEN']);

    const searchCats = await listProductCategories({ search: 'penicillin' });
    expect(searchCats.items.map((c) => c.code)).toEqual(['CAT-ANT-PEN']);

    const page1 = await listProductCategories({
      include_inactive: true,
      page: 1,
      page_size: 2,
    });
    expect(page1.items).toHaveLength(2);
    expect(page1.total_count).toBe(5);
    expect(page1.next_cursor).toBe('2');

    const page3 = await listProductCategories({
      include_inactive: true,
      page: 3,
      page_size: 2,
    });
    expect(page3.items).toHaveLength(1);
    expect(page3.next_cursor).toBeNull();

    await expect(
      apiClient.get('/product-categories?page=0&page_size=250')
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
    });

    const fetched = await getProductCategory(MOCK_CATEGORY_IDS.ANALGESICS);
    expect(fetched.code).toBe('CAT-ANA');

    await expect(getProductCategory('missing-cat')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });

    const created = await createProductCategory({
      code: 'CAT-DERM',
      name: 'Dermatology',
      description: 'Topical skin treatments',
      parent_category_id: null,
    });
    expect(created.code).toBe('CAT-DERM');
    expect(created.is_active).toBe(true);
    expect(created.organization_id).toBe(ORGANIZATION_ID);

    await expect(
      createProductCategory({
        code: 'cat-ana',
        name: 'Duplicate Code',
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: [{ field: 'code', issue: 'Category code must be unique.' }],
    });

    // Self-parenting and descendant cycle checks on PATCH
    await expect(
      patchProductCategory(MOCK_CATEGORY_IDS.ANTIBIOTICS, {
        parent_category_id: MOCK_CATEGORY_IDS.ANTIBIOTICS,
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    await expect(
      patchProductCategory(MOCK_CATEGORY_IDS.ANTIBIOTICS, {
        parent_category_id: MOCK_CATEGORY_IDS.PENICILLINS,
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    const patched = await patchProductCategory(created.category_id, {
      name: 'Dermatology & Skincare',
      is_active: false,
    });
    expect(patched.name).toBe('Dermatology & Skincare');
    expect(patched.is_active).toBe(false);

    await expect(
      apiClient.post('/product-categories', ['bad-body'])
    ).rejects.toMatchObject({ status: 400, code: 'MALFORMED_REQUEST' });
  });

  it('lists, creates, and patches products with native numbers and enforces 409 stock lock on Augmentin', async () => {
    const page1 = await listProducts({ page: 1, page_size: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total_count).toBe(3);
    expect(page1.next_cursor).toBe('2');

    const page2 = await listProducts({ page: 2, page_size: 2 });
    expect(page2.items).toHaveLength(1);
    expect(page2.next_cursor).toBeNull();

    const withInactive = await listProducts({ include_inactive: true });
    expect(withInactive.items).toHaveLength(4);

    const bySku = await listProducts({ search: 'MED-AUG-1000' });
    expect(bySku.items.map((p) => p.product_id)).toEqual([
      MOCK_PRODUCT_IDS.AUGMENTIN_1G,
    ]);

    const byBarcode = await listProducts({ search: '6221001000026' });
    expect(byBarcode.items.map((p) => p.product_id)).toEqual([
      MOCK_PRODUCT_IDS.PANADOL_EXTRA,
    ]);

    const byCategory = await listProducts({
      category_id: MOCK_CATEGORY_IDS.VITAMINS,
    });
    expect(byCategory.items.map((p) => p.sku)).toEqual(['MED-VIT-D3']);

    const panadol = await getProduct(MOCK_PRODUCT_IDS.PANADOL_EXTRA);
    expect(panadol.name).toBe('Panadol Extra 500mg');
    expect(panadol.tax_rate).toBe(0.05);

    // Panadol has no stock lock -> lot_tracking_required is editable
    const panadolUpdated = await patchProduct(MOCK_PRODUCT_IDS.PANADOL_EXTRA, {
      lot_tracking_required: false,
    });
    expect(panadolUpdated.lot_tracking_required).toBe(false);

    // Augmentin has stock/posted history -> 409 CONFLICT on lot_tracking_required change
    await expect(
      patchProduct(MOCK_PRODUCT_IDS.AUGMENTIN_1G, {
        lot_tracking_required: false,
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: expect.arrayContaining([
        expect.objectContaining({ field: 'lot_tracking_required' }),
      ]),
    });

    // Non-historical metadata edit on Augmentin stays allowed
    const augmentinNamePatch = await patchProduct(
      MOCK_PRODUCT_IDS.AUGMENTIN_1G,
      { name: 'Augmentin 1g Tablets Updated', lot_tracking_required: true }
    );
    expect(augmentinNamePatch.name).toBe('Augmentin 1g Tablets Updated');

    const validCreatePayload: CreateProductRequest = {
      category_id: MOCK_CATEGORY_IDS.ANALGESICS,
      sku: 'MED-IBP-400',
      barcode: '6221001009999',
      name: 'Brufen 400mg Tablets',
      generic_name: 'Ibuprofen 400mg',
      brand_name: 'Abbott',
      base_uom_code: 'TAB',
      tax_rate: 0.14,
      image_url: null,
      lot_tracking_required: false,
      expiry_alert_days: 30,
      uoms: [
        {
          uom_code: 'TAB',
          display_name: 'Tablet (base)',
          conversion_to_base: 1,
          sale_unit_price: 2.0,
          is_base: true,
          is_sellable: true,
          is_purchasable: true,
        },
      ],
    };

    const createdProduct = await createProduct(validCreatePayload);
    expect(createdProduct.sku).toBe('MED-IBP-400');
    expect(createdProduct.tax_rate).toBe(0.14);

    // String tax_rate is rejected with 422 VALIDATION_ERROR on the server
    await expect(
      apiClient.post('/products', {
        ...validCreatePayload,
        sku: 'MED-BAD-STR',
        barcode: null,
        tax_rate: '0.1400',
      })
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      details: expect.arrayContaining([
        expect.objectContaining({ field: 'tax_rate' }),
      ]),
    });

    await expect(
      createProduct({
        ...validCreatePayload,
        sku: 'med-ibp-400',
        barcode: '6221001009998',
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: [{ field: 'sku', issue: 'SKU must be unique.' }],
    });

    await expect(
      createProduct({
        ...validCreatePayload,
        sku: 'MED-IBP-400-2',
        barcode: '6221001009999',
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: [{ field: 'barcode', issue: 'Barcode must be unique.' }],
    });
  });

  it('manages product UOMs including include_inactive filter, native numbers, 409 conflicts, and 422 validation', async () => {
    const addedUom = await createProductUom(MOCK_PRODUCT_IDS.PANADOL_EXTRA, {
      uom_code: 'CARTON',
      display_name: 'Carton of 240',
      conversion_to_base: 240,
      sale_unit_price: null,
      is_base: false,
      is_sellable: false,
      is_purchasable: true,
    });
    expect(addedUom.uom_code).toBe('CARTON');
    expect(addedUom.conversion_to_base).toBe(240);

    // Deactivate non-base UOM and verify include_inactive filter
    const deactivated = await patchProductUom(
      MOCK_PRODUCT_IDS.PANADOL_EXTRA,
      addedUom.product_uom_id,
      { is_active: false, display_name: 'Carton (Archived)' }
    );
    expect(deactivated.is_active).toBe(false);

    const activeUoms = await listProductUoms(MOCK_PRODUCT_IDS.PANADOL_EXTRA);
    expect(activeUoms.some((u) => u.uom_code === 'CARTON')).toBe(false);

    const allUoms = await listProductUoms(MOCK_PRODUCT_IDS.PANADOL_EXTRA, {
      include_inactive: true,
    });
    expect(allUoms.some((u) => u.uom_code === 'CARTON' && !u.is_active)).toBe(
      true
    );

    // Duplicate UOM code -> 409
    await expect(
      createProductUom(MOCK_PRODUCT_IDS.PANADOL_EXTRA, {
        uom_code: 'box',
        display_name: 'Duplicate Box',
        conversion_to_base: 24,
        sale_unit_price: 55,
        is_base: false,
        is_sellable: true,
        is_purchasable: true,
      })
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });

    // Missing price for sellable UOM -> 422
    await expect(
      createProductUom(MOCK_PRODUCT_IDS.PANADOL_EXTRA, {
        uom_code: 'PACK',
        display_name: 'Pack of 12',
        conversion_to_base: 12,
        sale_unit_price: null,
        is_base: false,
        is_sellable: true,
        is_purchasable: false,
      })
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      details: expect.arrayContaining([
        expect.objectContaining({ field: 'sale_unit_price' }),
      ]),
    });

    // Cannot deactivate base UOM -> 409
    await expect(
      patchProductUom(
        MOCK_PRODUCT_IDS.PANADOL_EXTRA,
        MOCK_PRODUCT_UOM_IDS.PANADOL_TAB,
        { is_active: false }
      )
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });

    // Locked Augmentin conversion patch -> 409
    await expect(
      patchProductUom(
        MOCK_PRODUCT_IDS.AUGMENTIN_1G,
        MOCK_PRODUCT_UOM_IDS.AUGMENTIN_BOX,
        { conversion_to_base: 28 }
      )
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });

    // Second base UOM -> 409
    await expect(
      createProductUom(MOCK_PRODUCT_IDS.PANADOL_EXTRA, {
        uom_code: 'BASE2',
        display_name: 'Second Base',
        conversion_to_base: 1,
        sale_unit_price: null,
        is_base: true,
        is_sellable: false,
        is_purchasable: false,
      })
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
  });

  it('handles direct ReorderRuleDto responses, returns null on 404 NOT_FOUND, and wraps contract mismatches with INVALID_RESPONSE', async () => {
    const existingRule = await getReorderRule(
      MOCK_BRANCH_IDS.DOWNTOWN,
      MOCK_PRODUCT_IDS.AUGMENTIN_1G
    );
    expect(existingRule).not.toBeNull();
    expect(existingRule?.reorder_point_base).toBe(50);
    expect(existingRule?.reorder_quantity_base).toBe(200);
    expect(existingRule?.max_quantity_base).toBe(500);

    // Unconfigured branch + product returns 404 NOT_FOUND on wire -> mapped to null
    const unconfiguredRule = await getReorderRule(
      MOCK_BRANCH_IDS.ALEXANDRIA,
      MOCK_PRODUCT_IDS.AUGMENTIN_1G
    );
    expect(unconfiguredRule).toBeNull();

    // Legacy { rule } wrapper or string decimals must be rejected as INVALID_RESPONSE
    server.use(
      http.get(
        '*/api/v1/branches/:branchId/products/:productId/reorder-rule',
        () => HttpResponse.json({ rule: INITIAL_REORDER_RULES[0] })
      ),
      http.get('*/api/v1/products/:productId', () =>
        HttpResponse.json({ ...productFixture, tax_rate: '0.1400' })
      )
    );

    await expect(
      getReorderRule(MOCK_BRANCH_IDS.DOWNTOWN, MOCK_PRODUCT_IDS.AUGMENTIN_1G)
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

    await expect(
      getProduct(MOCK_PRODUCT_IDS.AUGMENTIN_1G)
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

    server.resetHandlers();

    await expect(
      upsertReorderRule(
        MOCK_BRANCH_IDS.ALEXANDRIA,
        MOCK_PRODUCT_IDS.AUGMENTIN_1G,
        {
          reorder_point_base: 150,
          reorder_quantity_base: 300,
          max_quantity_base: 100,
          is_active: true,
        }
      )
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      details: expect.arrayContaining([
        expect.objectContaining({ field: 'max_quantity_base' }),
      ]),
    });

    const upserted = await upsertReorderRule(
      MOCK_BRANCH_IDS.ALEXANDRIA,
      MOCK_PRODUCT_IDS.AUGMENTIN_1G,
      {
        reorder_point_base: 150,
        reorder_quantity_base: 300,
        max_quantity_base: 600,
        is_active: true,
      }
    );
    expect(upserted.reorder_point_base).toBe(150);
    expect(upserted.max_quantity_base).toBe(600);
  });
});

describe('useCatalogQueries hooks', () => {
  it('guards blank/undefined IDs via enabled and executes single-page and multi-page queries', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);

    const { result: blankProduct } = renderHook(() => useProductQuery('   '), {
      wrapper,
    });
    const { result: undefProduct } = renderHook(
      () => useProductQuery(undefined),
      { wrapper }
    );
    const { result: blankUoms } = renderHook(() => useProductUomsQuery('  '), {
      wrapper,
    });
    const { result: blankReorderBranch } = renderHook(
      () => useReorderRuleQuery('  ', MOCK_PRODUCT_IDS.AUGMENTIN_1G),
      { wrapper }
    );
    const { result: blankReorderProd } = renderHook(
      () => useReorderRuleQuery(MOCK_BRANCH_IDS.DOWNTOWN, undefined),
      { wrapper }
    );
    const { result: disabledLists } = renderHook(
      () => ({
        products: useProductsQuery({}, { enabled: false }),
        categories: useProductCategoriesQuery({}, { enabled: false }),
        uoms: useProductUomsQuery(MOCK_PRODUCT_IDS.AUGMENTIN_1G, {
          enabled: false,
        }),
      }),
      { wrapper }
    );

    expect(blankProduct.current.fetchStatus).toBe('idle');
    expect(undefProduct.current.fetchStatus).toBe('idle');
    expect(blankUoms.current.fetchStatus).toBe('idle');
    expect(blankReorderBranch.current.fetchStatus).toBe('idle');
    expect(blankReorderProd.current.fetchStatus).toBe('idle');
    expect(disabledLists.current.products.fetchStatus).toBe('idle');
    expect(disabledLists.current.categories.fetchStatus).toBe('idle');
    expect(disabledLists.current.uoms.fetchStatus).toBe('idle');

    const { result: liveQueries } = renderHook(
      () => ({
        categories: useProductCategoriesQuery(),
        allCategories: useAllProductCategoriesQuery({ include_inactive: true }),
        products: useProductsQuery(),
        allProducts: useAllProductsQuery({ include_inactive: true }),
        product: useProductQuery(` ${MOCK_PRODUCT_IDS.AUGMENTIN_1G} `),
        uoms: useProductUomsQuery(MOCK_PRODUCT_IDS.AUGMENTIN_1G, {
          include_inactive: true,
        }),
        reorderRule: useReorderRuleQuery(
          MOCK_BRANCH_IDS.DOWNTOWN,
          MOCK_PRODUCT_IDS.AUGMENTIN_1G
        ),
        missingReorderRule: useReorderRuleQuery(
          MOCK_BRANCH_IDS.ALEXANDRIA,
          MOCK_PRODUCT_IDS.AUGMENTIN_1G
        ),
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(liveQueries.current.categories.isSuccess).toBe(true);
      expect(liveQueries.current.allCategories.isSuccess).toBe(true);
      expect(liveQueries.current.products.isSuccess).toBe(true);
      expect(liveQueries.current.allProducts.isSuccess).toBe(true);
      expect(liveQueries.current.product.isSuccess).toBe(true);
      expect(liveQueries.current.uoms.isSuccess).toBe(true);
      expect(liveQueries.current.reorderRule.isSuccess).toBe(true);
      expect(liveQueries.current.missingReorderRule.isSuccess).toBe(true);
    });

    expect(liveQueries.current.categories.data?.items).toHaveLength(4);
    expect(liveQueries.current.allCategories.data).toHaveLength(5);
    expect(liveQueries.current.products.data?.items).toHaveLength(3);
    expect(liveQueries.current.allProducts.data).toHaveLength(4);
    expect(liveQueries.current.product.data?.name).toBe(
      'Augmentin 1g Film-Coated Tablets'
    );
    expect(liveQueries.current.uoms.data).toHaveLength(3);
    expect(liveQueries.current.reorderRule.data?.reorder_point_base).toBe(50);
    expect(liveQueries.current.missingReorderRule.data).toBeNull();
  });
});

describe('useCatalogMutations hooks', () => {
  it('stabilizes Idempotency-Key on retry, rotates on payload change, clears on success, and invalidates all affected keys', async () => {
    const queryClient = createTestQueryClient();
    const wrapper = createQueryWrapper(queryClient);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const keysByOp: {
      createCategory: Array<string | null>;
      patchCategory: Array<string | null>;
      createProduct: Array<string | null>;
      patchProduct: Array<string | null>;
      createUom: Array<string | null>;
      patchUom: Array<string | null>;
      upsertReorder: Array<string | null>;
    } = {
      createCategory: [],
      patchCategory: [],
      createProduct: [],
      patchProduct: [],
      createUom: [],
      patchUom: [],
      upsertReorder: [],
    };

    const failOnce: Record<keyof typeof keysByOp, boolean> = {
      createCategory: true,
      patchCategory: true,
      createProduct: true,
      patchProduct: true,
      createUom: true,
      patchUom: true,
      upsertReorder: true,
    };

    function serverFailure(message: string) {
      return HttpResponse.json(
        {
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message,
            details: [],
            trace_id: 'tr-500',
          },
        },
        { status: 500 }
      );
    }

    const mockSavedRule: ReorderRule = {
      reorder_rule_id: '11111111-8888-4111-8111-000000000099',
      organization_id: ORGANIZATION_ID,
      branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
      product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
      reorder_point_base: 100,
      reorder_quantity_base: 200,
      max_quantity_base: null,
      is_active: true,
      updated_at: '2026-11-25T10:00:00+00:00',
    };

    server.use(
      http.post('*/api/v1/product-categories', ({ request }) => {
        keysByOp.createCategory.push(request.headers.get('Idempotency-Key'));
        if (failOnce.createCategory) {
          failOnce.createCategory = false;
          return serverFailure('Temporary category create failure');
        }
        return HttpResponse.json(INITIAL_CATEGORIES[0], { status: 201 });
      }),
      http.patch('*/api/v1/product-categories/:categoryId', ({ request }) => {
        keysByOp.patchCategory.push(request.headers.get('Idempotency-Key'));
        if (failOnce.patchCategory) {
          failOnce.patchCategory = false;
          return serverFailure('Temporary category patch failure');
        }
        return HttpResponse.json(INITIAL_CATEGORIES[0], { status: 200 });
      }),
      http.post('*/api/v1/products', ({ request }) => {
        keysByOp.createProduct.push(request.headers.get('Idempotency-Key'));
        if (failOnce.createProduct) {
          failOnce.createProduct = false;
          return serverFailure('Temporary product create failure');
        }
        return HttpResponse.json(productFixture, { status: 201 });
      }),
      http.patch('*/api/v1/products/:productId', ({ request }) => {
        keysByOp.patchProduct.push(request.headers.get('Idempotency-Key'));
        if (failOnce.patchProduct) {
          failOnce.patchProduct = false;
          return serverFailure('Temporary product patch failure');
        }
        return HttpResponse.json(productFixture, { status: 200 });
      }),
      http.post('*/api/v1/products/:productId/uoms', ({ request }) => {
        keysByOp.createUom.push(request.headers.get('Idempotency-Key'));
        if (failOnce.createUom) {
          failOnce.createUom = false;
          return serverFailure('Temporary UOM create failure');
        }
        return HttpResponse.json(productFixture.uoms[0], { status: 201 });
      }),
      http.patch('*/api/v1/products/:productId/uoms/:uomId', ({ request }) => {
        keysByOp.patchUom.push(request.headers.get('Idempotency-Key'));
        if (failOnce.patchUom) {
          failOnce.patchUom = false;
          return serverFailure('Temporary UOM patch failure');
        }
        return HttpResponse.json(productFixture.uoms[0], { status: 200 });
      }),
      http.put(
        '*/api/v1/branches/:branchId/products/:productId/reorder-rule',
        ({ request }) => {
          keysByOp.upsertReorder.push(request.headers.get('Idempotency-Key'));
          if (failOnce.upsertReorder) {
            failOnce.upsertReorder = false;
            return serverFailure('Temporary reorder put failure');
          }
          return HttpResponse.json(mockSavedRule, { status: 200 });
        }
      )
    );

    const categoryId = MOCK_CATEGORY_IDS.ANALGESICS;
    const productId = MOCK_PRODUCT_IDS.AUGMENTIN_1G;
    const uomId = MOCK_PRODUCT_UOM_IDS.AUGMENTIN_TAB;
    const branchId = MOCK_BRANCH_IDS.DOWNTOWN;

    // 1. Create Category
    const { result: createCatHook } = renderHook(
      () => useCreateCategoryMutation(),
      { wrapper }
    );
    const catPayload = { code: 'CAT-NEW', name: 'New Cat' };
    const catPayloadEdited = { code: 'CAT-NEW-2', name: 'New Cat Edited' };
    await act(async () => {
      await expect(
        createCatHook.current.mutateAsync({ payload: catPayload })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await createCatHook.current.mutateAsync({ payload: catPayload });
    });
    await act(async () => {
      await createCatHook.current.mutateAsync({ payload: catPayload });
    });
    failOnce.createCategory = true;
    await act(async () => {
      await expect(
        createCatHook.current.mutateAsync({ payload: catPayload })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await createCatHook.current.mutateAsync({ payload: catPayloadEdited });
    });
    expect(keysByOp.createCategory).toHaveLength(5);
    expect(keysByOp.createCategory[0]).toBe(keysByOp.createCategory[1]);
    expect(keysByOp.createCategory[2]).not.toBe(keysByOp.createCategory[1]);
    expect(keysByOp.createCategory[4]).not.toBe(keysByOp.createCategory[3]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: productsKeys.categoryLists(),
    });

    // 2. Patch Category
    const { result: patchCatHook } = renderHook(
      () => usePatchCategoryMutation(),
      { wrapper }
    );
    await act(async () => {
      await expect(
        patchCatHook.current.mutateAsync({
          categoryId,
          payload: { name: 'Updated' },
        })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await patchCatHook.current.mutateAsync({
        categoryId,
        payload: { name: 'Updated' },
      });
    });
    await act(async () => {
      await patchCatHook.current.mutateAsync({
        categoryId,
        payload: { name: 'Updated Again' },
      });
    });
    expect(keysByOp.patchCategory).toHaveLength(3);
    expect(keysByOp.patchCategory[0]).toBe(keysByOp.patchCategory[1]);
    expect(keysByOp.patchCategory[2]).not.toBe(keysByOp.patchCategory[1]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: productsKeys.categoryLists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: productsKeys.categoryDetail(categoryId),
    });

    // 3. Create Product
    const { result: createProdHook } = renderHook(
      () => useCreateProductMutation(),
      { wrapper }
    );
    const prodPayload: CreateProductRequest = {
      category_id: categoryId,
      sku: 'SKU-NEW-1',
      name: 'New Product',
      base_uom_code: 'TAB',
      tax_rate: 0.14,
      lot_tracking_required: false,
      expiry_alert_days: 0,
      uoms: [
        {
          uom_code: 'TAB',
          display_name: 'Tablet',
          conversion_to_base: 1,
          sale_unit_price: 5,
          is_base: true,
          is_sellable: true,
          is_purchasable: true,
        },
      ],
    };
    await act(async () => {
      await expect(
        createProdHook.current.mutateAsync({ payload: prodPayload })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await createProdHook.current.mutateAsync({ payload: prodPayload });
    });
    await act(async () => {
      await createProdHook.current.mutateAsync({
        payload: prodPayload,
        idempotencyKey: 'explicit-product-key-123456',
      });
    });
    expect(keysByOp.createProduct).toHaveLength(3);
    expect(keysByOp.createProduct[0]).toBe(keysByOp.createProduct[1]);
    expect(keysByOp.createProduct[2]).toBe('explicit-product-key-123456');
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: productsKeys.lists(),
    });

    // 4. Patch Product
    const { result: patchProdHook } = renderHook(
      () => usePatchProductMutation(),
      { wrapper }
    );
    await act(async () => {
      await expect(
        patchProdHook.current.mutateAsync({
          productId,
          payload: { name: 'Augmentin Extra' },
        })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await patchProdHook.current.mutateAsync({
        productId,
        payload: { name: 'Augmentin Extra' },
      });
    });
    await act(async () => {
      await patchProdHook.current.mutateAsync({
        productId,
        payload: { name: 'Augmentin Advance' },
      });
    });
    expect(keysByOp.patchProduct).toHaveLength(3);
    expect(keysByOp.patchProduct[0]).toBe(keysByOp.patchProduct[1]);
    expect(keysByOp.patchProduct[2]).not.toBe(keysByOp.patchProduct[1]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: productsKeys.lists(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: productsKeys.detail(productId),
    });

    // 5. Create Product UOM
    invalidateSpy.mockClear();
    const { result: createUomHook } = renderHook(
      () => useCreateProductUomMutation(),
      { wrapper }
    );
    const uomPayload = {
      uom_code: 'PACK',
      display_name: 'Pack',
      conversion_to_base: 20,
      sale_unit_price: 24,
      is_base: false,
      is_sellable: true,
      is_purchasable: true,
    };
    await act(async () => {
      await expect(
        createUomHook.current.mutateAsync({ productId, payload: uomPayload })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await createUomHook.current.mutateAsync({
        productId,
        payload: uomPayload,
      });
    });
    await act(async () => {
      await createUomHook.current.mutateAsync({
        productId,
        payload: uomPayload,
      });
    });
    expect(keysByOp.createUom).toHaveLength(3);
    expect(keysByOp.createUom[0]).toBe(keysByOp.createUom[1]);
    expect(keysByOp.createUom[2]).not.toBe(keysByOp.createUom[1]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: productsKeys.uoms(productId),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: productsKeys.detail(productId),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: productsKeys.lists(),
    });

    // 6. Patch Product UOM
    invalidateSpy.mockClear();
    const { result: patchUomHook } = renderHook(
      () => usePatchProductUomMutation(),
      { wrapper }
    );
    await act(async () => {
      await expect(
        patchUomHook.current.mutateAsync({
          productId,
          uomId,
          payload: { sale_unit_price: 1.5 },
        })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await patchUomHook.current.mutateAsync({
        productId,
        uomId,
        payload: { sale_unit_price: 1.5 },
      });
    });
    await act(async () => {
      await patchUomHook.current.mutateAsync({
        productId,
        uomId,
        payload: { sale_unit_price: 1.75 },
      });
    });
    expect(keysByOp.patchUom).toHaveLength(3);
    expect(keysByOp.patchUom[0]).toBe(keysByOp.patchUom[1]);
    expect(keysByOp.patchUom[2]).not.toBe(keysByOp.patchUom[1]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: productsKeys.uoms(productId),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: productsKeys.detail(productId),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: productsKeys.lists(),
    });

    // 7. Upsert Reorder Rule
    invalidateSpy.mockClear();
    const { result: upsertReorderHook } = renderHook(
      () => useUpsertReorderRuleMutation(),
      { wrapper }
    );
    const reorderPayload = {
      reorder_point_base: 100,
      reorder_quantity_base: 200,
      max_quantity_base: null,
      is_active: true,
    };
    await act(async () => {
      await expect(
        upsertReorderHook.current.mutateAsync({
          branchId,
          productId,
          payload: reorderPayload,
        })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await upsertReorderHook.current.mutateAsync({
        branchId,
        productId,
        payload: reorderPayload,
      });
    });
    await act(async () => {
      await upsertReorderHook.current.mutateAsync({
        branchId,
        productId,
        payload: { ...reorderPayload, is_active: false },
      });
    });
    expect(keysByOp.upsertReorder).toHaveLength(3);
    expect(keysByOp.upsertReorder[0]).toBe(keysByOp.upsertReorder[1]);
    expect(keysByOp.upsertReorder[2]).not.toBe(keysByOp.upsertReorder[1]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: productsKeys.reorderRule(branchId, productId),
    });
  });
});
