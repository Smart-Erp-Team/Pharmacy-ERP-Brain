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
  productHandlers,
  resetMockCatalog,
} from '../../../mocks/productHandlers';
import type { CreateProductRequest, ProductDto } from '../../../types/api';
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
  putReorderRule,
} from '../api/catalogApi';
import { productsKeys } from './productsKeys';
import {
  useCreateCategoryMutation,
  useCreateProductMutation,
  useCreateProductUomMutation,
  usePatchCategoryMutation,
  usePatchProductMutation,
  usePatchProductUomMutation,
  usePutReorderRuleMutation,
} from './useCatalogMutations';
import {
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
    ]);
  });
});

describe('catalogApi and productHandlers integration', () => {
  it('omits blank query params and encodes path segments across catalog endpoints', async () => {
    const requestedUrls: string[] = [];
    server.use(
      http.get('*/api/v1/products', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
      http.get('*/api/v1/product-categories', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json({ items: [], nextCursor: null });
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
          return HttpResponse.json({ rule: null });
        }
      )
    );

    await listProducts({
      cursor: '   ',
      search: '  ',
      categoryId: '',
      limit: 10,
      includeInactive: false,
    });
    await listProductCategories({ cursor: '   ', limit: 15 });
    await getProductCategory(' cat/1 ');
    await listProductUoms(' prod/1 ');
    await getReorderRule(' br/1 ', ' prod/2 ');

    expect(requestedUrls).toHaveLength(5);

    const productsUrl = new URL(requestedUrls[0] ?? '');
    expect(productsUrl.searchParams.has('cursor')).toBe(false);
    expect(productsUrl.searchParams.has('search')).toBe(false);
    expect(productsUrl.searchParams.has('categoryId')).toBe(false);
    expect(productsUrl.searchParams.get('limit')).toBe('10');
    expect(productsUrl.searchParams.get('includeInactive')).toBe('false');

    const categoriesUrl = new URL(requestedUrls[1] ?? '');
    expect(categoriesUrl.searchParams.has('cursor')).toBe(false);
    expect(categoriesUrl.searchParams.get('limit')).toBe('15');

    expect(new URL(requestedUrls[2] ?? '').pathname).toBe(
      '/api/v1/product-categories/cat%2F1'
    );
    expect(new URL(requestedUrls[3] ?? '').pathname).toBe(
      '/api/v1/products/prod%2F1/uoms'
    );
    expect(new URL(requestedUrls[4] ?? '').pathname).toBe(
      '/api/v1/branches/br%2F1/products/prod%2F2/reorder-rule'
    );
  });

  it('lists, gets, creates, and patches categories with includeInactive, 409 conflicts, and 422 cycle guards', async () => {
    const activeOnly = await listProductCategories();
    expect(activeOnly.items).toHaveLength(4);
    expect(activeOnly.items.every((c) => c.is_active)).toBe(true);

    const allCats = await listProductCategories({
      includeInactive: true,
      limit: 2,
    });
    expect(allCats.items).toHaveLength(2);
    expect(allCats.nextCursor).toBe('2');

    const nextCats = await listProductCategories({
      includeInactive: true,
      cursor: allCats.nextCursor ?? undefined,
      limit: 10,
    });
    expect(nextCats.items).toHaveLength(3);
    expect(nextCats.nextCursor).toBeNull();

    const fetched = await getProductCategory(
      'c9d8e7f6-4444-4d55-8e66-cbccddeeffbb'
    );
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
      is_active: true,
    });
    expect(created.code).toBe('CAT-DERM');

    await expect(
      createProductCategory({
        code: 'cat-ana',
        name: 'Duplicate Code',
        is_active: true,
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: [{ field: 'code', issue: 'Category code must be unique.' }],
    });

    // Self-parenting and descendant cycle checks on PATCH
    await expect(
      patchProductCategory('c9d8e7f6-4444-4d55-8e66-cbccddeeffbb', {
        parent_category_id: 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbb',
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    await expect(
      patchProductCategory('c9d8e7f6-4444-4d55-8e66-cbccddeeffbb', {
        parent_category_id: 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbd',
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

  it('lists products with cursor pagination, search, categoryId, includeInactive, and enforces 409 stock lock on Augmentin', async () => {
    expect(INITIAL_PRODUCTS.length).toBeGreaterThanOrEqual(6);

    const page1 = await listProducts({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBe('2');

    const page2 = await listProducts({
      cursor: page1.nextCursor ?? undefined,
      limit: 2,
    });
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).toBe('4');

    const page3 = await listProducts({
      cursor: page2.nextCursor ?? undefined,
      limit: 2,
    });
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();

    const withInactive = await listProducts({ includeInactive: true });
    expect(withInactive.items).toHaveLength(6);

    // Search by SKU, barcode, name
    const bySku = await listProducts({ search: 'ABX-AUG-1000' });
    expect(bySku.items.map((p) => p.product_id)).toEqual([
      inventoryBalanceFixture.product_id,
    ]);
    const byBarcode = await listProducts({ search: '6221048001234' });
    expect(byBarcode.items.map((p) => p.product_id)).toEqual([
      productFixture.product_id,
    ]);
    const byName = await listProducts({ search: 'panadol' });
    expect(byName.items).toHaveLength(1);

    const byCategory = await listProducts({
      categoryId: 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbc',
    });
    expect(byCategory.items).toHaveLength(2);

    const panadol = await getProduct(productFixture.product_id);
    expect(panadol.name).toBe('Panadol 500mg Tablets');

    // Panadol has no stock lock -> lot_tracking_required is editable
    const panadolUpdated = await patchProduct(productFixture.product_id, {
      lot_tracking_required: true,
    });
    expect(panadolUpdated.lot_tracking_required).toBe(true);

    // Augmentin (inventory-balance.json) has stock/posted history -> 409 CONFLICT
    await expect(
      patchProduct(inventoryBalanceFixture.product_id, {
        lot_tracking_required: false,
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: expect.arrayContaining([
        expect.objectContaining({ field: 'lot_tracking_required' }),
      ]),
    });

    // Raw PATCH preserves immutable sku and base_uom_code
    const rawPatchRes = await apiClient.patch<ProductDto>(
      `/products/${productFixture.product_id}`,
      { sku: 'CHANGED-SKU', base_uom_code: 'changed' }
    );
    expect(rawPatchRes.data.sku).toBe(productFixture.sku);
    expect(rawPatchRes.data.base_uom_code).toBe(productFixture.base_uom_code);

    // Duplicate SKU and barcode conflicts on create
    const validCreatePayload: CreateProductRequest = {
      category_id: 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbb',
      sku: 'ANA-IBP-400-TAB',
      barcode: '6221048009999',
      name: 'Brufen 400mg Tablets',
      generic_name: 'Ibuprofen 400mg',
      brand_name: 'Brufen',
      base_uom_code: 'tablet',
      tax_rate: '0.1400',
      image_url: null,
      lot_tracking_required: false,
      expiry_alert_days: 30,
      uoms: [
        {
          uom_code: 'tablet',
          display_name: 'Tablet (base)',
          conversion_to_base: '1.000000',
          sale_unit_price: '2.0000',
          is_base: true,
          is_sellable: true,
          is_purchasable: true,
        },
      ],
    };

    const createdProduct = await createProduct(validCreatePayload);
    expect(createdProduct.sku).toBe('ANA-IBP-400-TAB');

    await expect(
      createProduct({
        ...validCreatePayload,
        sku: 'ana-ibp-400-tab',
        barcode: '6221048009998',
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: [{ field: 'sku', issue: 'SKU must be unique.' }],
    });

    await expect(
      createProduct({
        ...validCreatePayload,
        sku: 'ANA-IBP-400-UNIQUE',
        barcode: '6221048009999',
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: [{ field: 'barcode', issue: 'Barcode must be unique.' }],
    });
  });

  it('manages product UOMs including inactive visibility, 409 conflicts, and 422 sellable validation', async () => {
    // Centrum has an inactive UOM that must be returned
    const centrumUoms = await listProductUoms(
      'f9a0b1c2-7777-4bbb-9f6a-789012345def'
    );
    expect(centrumUoms.some((u) => !u.is_active)).toBe(true);

    const addedUom = await createProductUom(productFixture.product_id, {
      uom_code: 'carton',
      display_name: 'Carton of 1000',
      conversion_to_base: '1000.000000',
      sale_unit_price: null,
      is_base: false,
      is_sellable: false,
      is_purchasable: true,
    });
    expect(addedUom.uom_code).toBe('carton');

    // Duplicate UOM code -> 409
    await expect(
      createProductUom(productFixture.product_id, {
        uom_code: 'STRIP',
        display_name: 'Duplicate Strip',
        conversion_to_base: '10.000000',
        sale_unit_price: '12.0000',
        is_base: false,
        is_sellable: true,
        is_purchasable: false,
      })
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });

    // Missing price for sellable UOM -> 422
    await expect(
      createProductUom(productFixture.product_id, {
        uom_code: 'pack',
        display_name: 'Pack of 20',
        conversion_to_base: '20.000000',
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
    const baseUomId = productFixture.uoms[0].product_uom_id;
    await expect(
      patchProductUom(productFixture.product_id, baseUomId, {
        is_active: false,
      })
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });

    // Locked Augmentin base conversion patch -> 409; non-historical metadata edit stays allowed
    await expect(
      apiClient.patch(
        `/products/${inventoryBalanceFixture.product_id}/uoms/c1d2e3f4-1111-4aaa-8a1b-111111110002`,
        { conversion_to_base: '20.000000' }
      )
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });

    const augmentinNamePatch = await patchProduct(
      inventoryBalanceFixture.product_id,
      { name: 'Augmentin 1g Tablets Updated', lot_tracking_required: true }
    );
    expect(augmentinNamePatch.name).toBe('Augmentin 1g Tablets Updated');

    // Second base UOM -> 409; invalid non-string sale_unit_price when non-sellable -> 422
    await expect(
      createProductUom(productFixture.product_id, {
        uom_code: 'base2',
        display_name: 'Second Base',
        conversion_to_base: '1.000000',
        sale_unit_price: null,
        is_base: true,
        is_sellable: false,
        is_purchasable: false,
      })
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });

    await expect(
      apiClient.post(`/products/${productFixture.product_id}/uoms`, {
        uom_code: 'badprice',
        display_name: 'Bad Price Type',
        conversion_to_base: '5',
        is_base: false,
        is_sellable: false,
        is_purchasable: false,
        sale_unit_price: 123,
      })
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      details: expect.arrayContaining([
        expect.objectContaining({ field: 'sale_unit_price' }),
      ]),
    });

    // 12-digit PositiveNumeric6 conversion precision preserved without float drift
    const highPrecisionUom = await createProductUom(productFixture.product_id, {
      uom_code: 'mega',
      display_name: 'Mega Pack',
      conversion_to_base: '999999999999.999999',
      sale_unit_price: null,
      is_base: false,
      is_sellable: false,
      is_purchasable: true,
    });
    expect(highPrecisionUom.conversion_to_base).toBe('999999999999.999999');

    const deactivatedNonBase = await patchProductUom(
      productFixture.product_id,
      addedUom.product_uom_id,
      { is_active: false, display_name: 'Carton (Archived)' }
    );
    expect(deactivatedNonBase.is_active).toBe(false);
    expect(deactivatedNonBase.display_name).toBe('Carton (Archived)');
  });

  it('unwraps reorder rule responses ({ rule }, { rule: null }, null, {}) and validates PUT constraints', async () => {
    const existingRule = await getReorderRule(
      inventoryBalanceFixture.branch_id,
      productFixture.product_id
    );
    expect(existingRule).not.toBeNull();
    expect(existingRule?.reorder_point_base).toBe('200.0000');

    const missingRule = await getReorderRule(
      inventoryBalanceFixture.branch_id,
      inventoryBalanceFixture.product_id
    );
    expect(missingRule).toBeNull();

    server.use(
      http.get(
        '*/api/v1/branches/:branchId/products/:productId/reorder-rule',
        ({ params }) => {
          if (params.branchId === 'raw-null') {
            return HttpResponse.json(null, { status: 200 });
          }
          return HttpResponse.json({}, { status: 200 });
        }
      )
    );
    expect(
      await getReorderRule('raw-null', productFixture.product_id)
    ).toBeNull();
    expect(
      await getReorderRule('empty-obj', productFixture.product_id)
    ).toBeNull();

    server.resetHandlers();

    await expect(
      getReorderRule(inventoryBalanceFixture.branch_id, 'missing-product')
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });

    await expect(
      putReorderRule(
        inventoryBalanceFixture.branch_id,
        inventoryBalanceFixture.product_id,
        {
          reorder_point_base: '150.0000',
          reorder_quantity_base: '300.0000',
          max_quantity_base: '100.0000',
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

    const upserted = await putReorderRule(
      inventoryBalanceFixture.branch_id,
      inventoryBalanceFixture.product_id,
      {
        reorder_point_base: '150.0000',
        reorder_quantity_base: '300.0000',
        max_quantity_base: '600.0000',
        is_active: true,
      }
    );
    expect(upserted.reorder_point_base).toBe('150.0000');
    expect(upserted.max_quantity_base).toBe('600.0000');

    // Exact 14-digit decimal comparison and preservation on PUT reorder-rule
    await expect(
      putReorderRule(
        inventoryBalanceFixture.branch_id,
        inventoryBalanceFixture.product_id,
        {
          reorder_point_base: '99999999999999.9999',
          reorder_quantity_base: '1.0000',
          max_quantity_base: '99999999999999.9998',
          is_active: true,
        }
      )
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

    const maxPrecisionRule = await putReorderRule(
      inventoryBalanceFixture.branch_id,
      inventoryBalanceFixture.product_id,
      {
        reorder_point_base: '99999999999999.9999',
        reorder_quantity_base: '99999999999999.9999',
        max_quantity_base: '99999999999999.9999',
        is_active: true,
      }
    );
    expect(maxPrecisionRule.reorder_point_base).toBe('99999999999999.9999');
    expect(maxPrecisionRule.max_quantity_base).toBe('99999999999999.9999');
  });
});

describe('useCatalogQueries hooks', () => {
  it('guards blank/undefined IDs via enabled and executes queries when IDs are provided', async () => {
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
      () => useReorderRuleQuery('  ', productFixture.product_id),
      { wrapper }
    );
    const { result: blankReorderProd } = renderHook(
      () => useReorderRuleQuery(inventoryBalanceFixture.branch_id, undefined),
      { wrapper }
    );
    const { result: disabledLists } = renderHook(
      () => ({
        products: useProductsQuery({}, { enabled: false }),
        categories: useProductCategoriesQuery({}, { enabled: false }),
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

    const { result: liveQueries } = renderHook(
      () => ({
        categories: useProductCategoriesQuery(),
        products: useProductsQuery(),
        product: useProductQuery(` ${productFixture.product_id} `),
        uoms: useProductUomsQuery(productFixture.product_id),
        reorderRule: useReorderRuleQuery(
          inventoryBalanceFixture.branch_id,
          productFixture.product_id
        ),
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(liveQueries.current.categories.isSuccess).toBe(true);
      expect(liveQueries.current.products.isSuccess).toBe(true);
      expect(liveQueries.current.product.isSuccess).toBe(true);
      expect(liveQueries.current.uoms.isSuccess).toBe(true);
      expect(liveQueries.current.reorderRule.isSuccess).toBe(true);
    });

    expect(liveQueries.current.categories.data?.items).toHaveLength(4);
    expect(liveQueries.current.products.data?.items).toHaveLength(5);
    expect(liveQueries.current.product.data?.name).toBe(
      'Panadol 500mg Tablets'
    );
    expect(liveQueries.current.uoms.data).toHaveLength(3);
    expect(liveQueries.current.reorderRule.data?.reorder_point_base).toBe(
      '200.0000'
    );
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
      putReorder: Array<string | null>;
    } = {
      createCategory: [],
      patchCategory: [],
      createProduct: [],
      patchProduct: [],
      createUom: [],
      patchUom: [],
      putReorder: [],
    };

    const failOnce: Record<keyof typeof keysByOp, boolean> = {
      createCategory: true,
      patchCategory: true,
      createProduct: true,
      patchProduct: true,
      createUom: true,
      patchUom: true,
      putReorder: true,
    };

    function serverFailure(message: string) {
      return HttpResponse.json(
        { error: { code: 'INTERNAL_ERROR', message } },
        { status: 500 }
      );
    }

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
          keysByOp.putReorder.push(request.headers.get('Idempotency-Key'));
          if (failOnce.putReorder) {
            failOnce.putReorder = false;
            return serverFailure('Temporary reorder put failure');
          }
          return HttpResponse.json(
            {
              reorder_rule_id: 'r-1',
              product_id: productFixture.product_id,
              branch_id: inventoryBalanceFixture.branch_id,
              reorder_point_base: '100.0000',
              reorder_quantity_base: '200.0000',
              max_quantity_base: null,
              is_active: true,
            },
            { status: 200 }
          );
        }
      )
    );

    const categoryId = 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbb';
    const productId = productFixture.product_id;
    const uomId = productFixture.uoms[0].product_uom_id;
    const branchId = inventoryBalanceFixture.branch_id;

    // 1. Create Category (fail -> same payload retry reuses key -> changed payload after failure rotates key -> success clears key)
    const { result: createCatHook } = renderHook(
      () => useCreateCategoryMutation(),
      { wrapper }
    );
    const catPayload = { code: 'CAT-NEW', name: 'New Cat', is_active: true };
    const catPayloadEdited = {
      code: 'CAT-NEW-2',
      name: 'New Cat Edited',
      is_active: true,
    };
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
    // Trigger another failure then immediately change payload before success
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
      base_uom_code: 'tab',
      tax_rate: '0.1400',
      lot_tracking_required: false,
      expiry_alert_days: 0,
      uoms: [
        {
          uom_code: 'tab',
          display_name: 'Tablet',
          conversion_to_base: '1.000000',
          sale_unit_price: '5.0000',
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
          payload: { name: 'Panadol Extra' },
        })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await patchProdHook.current.mutateAsync({
        productId,
        payload: { name: 'Panadol Extra' },
      });
    });
    await act(async () => {
      await patchProdHook.current.mutateAsync({
        productId,
        payload: { name: 'Panadol Advance' },
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

    // 5. Create Product UOM (must invalidate uoms, detail, and lists)
    invalidateSpy.mockClear();
    const { result: createUomHook } = renderHook(
      () => useCreateProductUomMutation(),
      { wrapper }
    );
    const uomPayload = {
      uom_code: 'pack',
      display_name: 'Pack',
      conversion_to_base: '20.000000',
      sale_unit_price: '24.0000',
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

    // 6. Patch Product UOM (must invalidate uoms, detail, and lists)
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
          payload: { sale_unit_price: '1.5000' },
        })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await patchUomHook.current.mutateAsync({
        productId,
        uomId,
        payload: { sale_unit_price: '1.5000' },
      });
    });
    await act(async () => {
      await patchUomHook.current.mutateAsync({
        productId,
        uomId,
        payload: { sale_unit_price: '1.7500' },
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

    // 7. Put Reorder Rule
    invalidateSpy.mockClear();
    const { result: putReorderHook } = renderHook(
      () => usePutReorderRuleMutation(),
      { wrapper }
    );
    const reorderPayload = {
      reorder_point_base: '100.0000',
      reorder_quantity_base: '200.0000',
      max_quantity_base: null,
      is_active: true,
    };
    await act(async () => {
      await expect(
        putReorderHook.current.mutateAsync({
          branchId,
          productId,
          payload: reorderPayload,
        })
      ).rejects.toBeInstanceOf(ApiClientError);
    });
    await act(async () => {
      await putReorderHook.current.mutateAsync({
        branchId,
        productId,
        payload: reorderPayload,
      });
    });
    await act(async () => {
      await putReorderHook.current.mutateAsync({
        branchId,
        productId,
        payload: { ...reorderPayload, is_active: false },
      });
    });
    expect(keysByOp.putReorder).toHaveLength(3);
    expect(keysByOp.putReorder[0]).toBe(keysByOp.putReorder[1]);
    expect(keysByOp.putReorder[2]).not.toBe(keysByOp.putReorder[1]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: productsKeys.reorderRule(branchId, productId),
    });
  });
});
