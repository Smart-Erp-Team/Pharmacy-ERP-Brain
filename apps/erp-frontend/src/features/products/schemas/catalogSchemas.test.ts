/** @vitest-environment jsdom */
import { zodResolver } from '@hookform/resolvers/zod';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UseFormSetError } from 'react-hook-form';
import productFixture from '@contracts/fixtures/product.json';
import { ApiClientError } from '../../../lib/api/client';
import type {
  ProductCategoryDto,
  ProductDto,
  ProductUomDto,
  ReorderRuleDto,
} from '../../../types/api';
import {
  applyCategoryFormApiError,
  applyCreateProductFormApiError,
  applyCreateUomFormApiError,
  applyEditProductFormApiError,
  applyEditUomFormApiError,
  applyReorderRuleFormApiError,
} from './catalogErrorMapper';
import {
  buildCategoryTree,
  categoryDtoToFormValues,
  categoryFormSchema,
  createCategoryFormSchema,
  DEFAULT_CATEGORY_FORM_VALUES,
  getDescendantCategoryIds,
  getEligibleParentCategories,
  toCategoryCreatePayload,
  toCategoryPatchPayload,
  type CategoryFormValues,
} from './categorySchema';
import {
  createProductFormSchema,
  DEFAULT_CREATE_PRODUCT_FORM_VALUES,
  editProductFormSchema,
  percentToTaxRateDto,
  productDtoToEditFormValues,
  taxRateDtoToPercentString,
  toCreateProductPayload,
  toProductPatchPayload,
  type CreateProductFormValues,
  type EditProductFormValues,
} from './productSchema';
import {
  createUomFormSchema,
  DEFAULT_CREATE_UOM_FORM_VALUES,
  DEFAULT_REORDER_RULE_VALUES,
  editUomFormSchema,
  reorderRuleDtoToFormValues,
  reorderRuleFormSchema,
  toCreateUomPayload,
  toReorderRulePayload,
  toUomPatchPayload,
  uomDtoToEditFormValues,
  type CreateUomFormValues,
  type EditUomFormValues,
  type ReorderRuleFormValues,
} from './uomReorderSchema';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SAMPLE_CATEGORIES: readonly ProductCategoryDto[] = [
  {
    category_id: 'cat-root-b',
    parent_category_id: null,
    code: 'CAT-Z',
    name: 'Vitamins',
    description: null,
    is_active: true,
  },
  {
    category_id: 'cat-root-a',
    parent_category_id: null,
    code: 'CAT-A',
    name: 'Analgesics',
    description: 'Pain relief',
    is_active: true,
  },
  {
    category_id: 'cat-child-1',
    parent_category_id: 'cat-root-a',
    code: 'CAT-A1',
    name: 'Pediatric Analgesics',
    description: null,
    is_active: true,
  },
  {
    category_id: 'cat-grandchild-1',
    parent_category_id: 'cat-child-1',
    code: 'CAT-A1A',
    name: 'Infant Drops',
    description: null,
    is_active: true,
  },
  {
    category_id: 'cat-inactive',
    parent_category_id: null,
    code: 'CAT-OLD',
    name: 'Archived Parent',
    description: null,
    is_active: false,
  },
  {
    category_id: 'cat-active-under-inactive',
    parent_category_id: 'cat-inactive',
    code: 'CAT-ORPHAN',
    name: 'Active Child Under Inactive',
    description: null,
    is_active: true,
  },
];

describe('categorySchema and tree helpers', () => {
  it('computes descendant IDs safely even with self and multi-node cycles', () => {
    expect(getDescendantCategoryIds('cat-root-a', SAMPLE_CATEGORIES)).toEqual(
      new Set(['cat-child-1', 'cat-grandchild-1'])
    );
    expect(getDescendantCategoryIds('   ', SAMPLE_CATEGORIES)).toEqual(
      new Set()
    );

    const cyclic: ProductCategoryDto[] = [
      {
        category_id: 'c-1',
        parent_category_id: 'c-3',
        code: 'C1',
        name: 'One',
        is_active: true,
      },
      {
        category_id: 'c-2',
        parent_category_id: 'c-1',
        code: 'C2',
        name: 'Two',
        is_active: true,
      },
      {
        category_id: 'c-3',
        parent_category_id: 'c-2',
        code: 'C3',
        name: 'Three',
        is_active: true,
      },
      {
        category_id: 'c-self',
        parent_category_id: 'c-self',
        code: 'CS',
        name: 'Self',
        is_active: true,
      },
    ];

    expect(getDescendantCategoryIds('c-1', cyclic)).toEqual(
      new Set(['c-2', 'c-3'])
    );
    expect(getDescendantCategoryIds('c-self', cyclic)).toEqual(new Set());
  });

  it('filters self and descendants out of eligible parent options with deterministic sorting', () => {
    const eligibleForRootA = getEligibleParentCategories(
      'cat-root-a',
      SAMPLE_CATEGORIES
    );
    expect(eligibleForRootA.map((c) => c.category_id)).toEqual([
      'cat-active-under-inactive',
      'cat-inactive',
      'cat-root-b',
    ]);

    const eligibleForNew = getEligibleParentCategories(null, SAMPLE_CATEGORIES);
    expect(eligibleForNew).toHaveLength(SAMPLE_CATEGORIES.length);
  });

  it('builds a deterministically sorted tree and promotes active children when inactive parents are filtered out', () => {
    const activeTree = buildCategoryTree(SAMPLE_CATEGORIES, {
      includeInactive: false,
    });

    expect(activeTree.map((n) => [n.category.code, n.depth])).toEqual([
      ['CAT-ORPHAN', 0],
      ['CAT-A', 0],
      ['CAT-Z', 0],
    ]);

    const analgesicsNode = activeTree[1];
    expect(analgesicsNode?.children).toHaveLength(1);
    expect(analgesicsNode?.children[0]?.category.code).toBe('CAT-A1');
    expect(analgesicsNode?.children[0]?.depth).toBe(1);
    expect(analgesicsNode?.children[0]?.children[0]?.category.code).toBe(
      'CAT-A1A'
    );
    expect(analgesicsNode?.children[0]?.children[0]?.depth).toBe(2);

    const fullTree = buildCategoryTree(SAMPLE_CATEGORIES, {
      includeInactive: true,
    });
    const archivedParent = fullTree.find((n) => n.category.code === 'CAT-OLD');
    expect(archivedParent).toBeDefined();
    expect(archivedParent?.children.map((c) => c.category.code)).toEqual([
      'CAT-ORPHAN',
    ]);
    expect(archivedParent?.children[0]?.depth).toBe(1);
  });

  it('handles pure parent cycles in buildCategoryTree without infinite loops or dropped nodes', () => {
    const cyclic: ProductCategoryDto[] = [
      {
        category_id: 'a',
        parent_category_id: 'b',
        code: 'A',
        name: 'Alpha',
        is_active: true,
      },
      {
        category_id: 'b',
        parent_category_id: 'a',
        code: 'B',
        name: 'Beta',
        is_active: true,
      },
    ];

    const tree = buildCategoryTree(cyclic, { includeInactive: true });
    expect(tree).toHaveLength(1);
    expect(tree[0]?.category.category_id).toBe('a');
    expect(tree[0]?.children.map((c) => c.category.category_id)).toEqual(['b']);

    // Promoted cycle roots sort deterministically alongside regular roots
    const mixedCyclic: ProductCategoryDto[] = [
      {
        category_id: 'z',
        parent_category_id: null,
        code: 'Z',
        name: 'Zebra',
        is_active: true,
      },
      ...cyclic,
    ];
    const mixedTree = buildCategoryTree(mixedCyclic, { includeInactive: true });
    expect(mixedTree.map((n) => n.category.category_id)).toEqual(['a', 'z']);
  });

  it('validates category fields, prevents self/descendant cycles, and converts payloads', () => {
    const schema = createCategoryFormSchema('cat-root-a', SAMPLE_CATEGORIES);

    const selfParent = schema.safeParse({
      code: 'CAT-A',
      name: 'Analgesics',
      description: '',
      parent_category_id: 'cat-root-a',
      is_active: true,
    });
    expect(selfParent.success).toBe(false);
    if (!selfParent.success) {
      expect(selfParent.error.issues[0]).toMatchObject({
        path: ['parent_category_id'],
        message: 'Category cannot be its own parent',
      });
    }

    const descendantParent = schema.safeParse({
      code: 'CAT-A',
      name: 'Analgesics',
      description: '',
      parent_category_id: 'cat-grandchild-1',
      is_active: true,
    });
    expect(descendantParent.success).toBe(false);
    if (!descendantParent.success) {
      expect(descendantParent.error.issues[0]).toMatchObject({
        path: ['parent_category_id'],
        message: 'Parent category cannot be a descendant of this category',
      });
    }

    const valid = schema.parse({
      code: ' CAT-A ',
      name: ' Analgesics ',
      description: '   ',
      parent_category_id: '   ',
      is_active: false,
    });
    expect(toCategoryCreatePayload(valid)).toEqual({
      parent_category_id: null,
      code: 'CAT-A',
      name: 'Analgesics',
      description: null,
      is_active: false,
    });
    expect(toCategoryPatchPayload(valid)).toEqual({
      parent_category_id: null,
      code: 'CAT-A',
      name: 'Analgesics',
      description: null,
      is_active: false,
    });

    const dtoValues = categoryDtoToFormValues(SAMPLE_CATEGORIES[1]);
    expect(dtoValues).toEqual({
      code: 'CAT-A',
      name: 'Analgesics',
      description: 'Pain relief',
      parent_category_id: '',
      is_active: true,
    });

    const overMax = categoryFormSchema.safeParse({
      ...DEFAULT_CATEGORY_FORM_VALUES,
      code: 'C'.repeat(31),
      name: 'N'.repeat(101),
      description: 'D'.repeat(251),
    });
    expect(overMax.success).toBe(false);
    if (!overMax.success) {
      const paths = overMax.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('code');
      expect(paths).toContain('name');
      expect(paths).toContain('description');
    }
  });

  it('integrates createCategoryFormSchema with React Hook Form zodResolver', async () => {
    const { result } = renderHook(() => {
      const form = useForm<CategoryFormValues>({
        resolver: zodResolver(categoryFormSchema),
        defaultValues: DEFAULT_CATEGORY_FORM_VALUES,
      });
      return {
        trigger: form.trigger,
        codeError: form.formState.errors.code?.message,
        nameError: form.formState.errors.name?.message,
      };
    });

    let valid = true;
    await act(async () => {
      valid = await result.current.trigger();
    });
    expect(valid).toBe(false);
    await waitFor(() => {
      expect(result.current.codeError).toBe('Category code is required');
      expect(result.current.nameError).toBe('Category name is required');
    });
  });
});

describe('productSchema and tax conversion helpers', () => {
  it('converts fractional tax rates to percent strings and back without float drift', () => {
    expect(taxRateDtoToPercentString('0.1400')).toBe('14');
    expect(taxRateDtoToPercentString('0.1450')).toBe('14.5');
    expect(taxRateDtoToPercentString('0.1425')).toBe('14.25');
    expect(taxRateDtoToPercentString('0.0000')).toBe('0');
    expect(taxRateDtoToPercentString('1.0000')).toBe('100');
    expect(taxRateDtoToPercentString('0.2900')).toBe('29');
    expect(taxRateDtoToPercentString('0.05')).toBe('5');
    expect(taxRateDtoToPercentString('.14')).toBe('14');
    expect(taxRateDtoToPercentString('0.0050')).toBe('0.5');
    expect(taxRateDtoToPercentString('0.0005')).toBe('0.05');

    expect(percentToTaxRateDto('14')).toBe('0.1400');
    expect(percentToTaxRateDto('14.5')).toBe('0.1450');
    expect(percentToTaxRateDto('0')).toBe('0.0000');
    expect(percentToTaxRateDto('100')).toBe('1.0000');
    expect(percentToTaxRateDto('29')).toBe('0.2900');
  });

  it('validates createProductFormSchema and emits CreateProductRequest with base UOM factor 1.000000', () => {
    const parsed = createProductFormSchema.parse({
      category_id: ' c9d8e7f6-4444-4d55-8e66-cbccddeeffbb ',
      sku: ' ANA-NEW-01 ',
      name: ' New Analgesic 500mg ',
      barcode: '   ',
      generic_name: ' Paracetamol ',
      brand_name: '',
      image_url: ' https://cdn.pharmaplus.eg/p1.png ',
      tax_percent: '14.5',
      lot_tracking_required: true,
      expiry_alert_days: '60',
      base_uom: {
        uom_code: ' tablet ',
        display_name: ' Tablet ',
        is_sellable: true,
        is_purchasable: false,
        sale_unit_price: '2.5',
      },
    });

    const payload = toCreateProductPayload(parsed);
    expect(payload).toEqual({
      category_id: 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbb',
      sku: 'ANA-NEW-01',
      barcode: null,
      name: 'New Analgesic 500mg',
      generic_name: 'Paracetamol',
      brand_name: null,
      base_uom_code: 'tablet',
      tax_rate: '0.1450',
      image_url: 'https://cdn.pharmaplus.eg/p1.png',
      lot_tracking_required: true,
      expiry_alert_days: 60,
      uoms: [
        {
          uom_code: 'tablet',
          display_name: 'Tablet',
          conversion_to_base: '1.000000',
          sale_unit_price: '2.5000',
          is_base: true,
          is_sellable: true,
          is_purchasable: false,
        },
      ],
    });
    expect('primary_supplier_id' in payload).toBe(false);
  });

  it('enforces sellable base UOM price, non-sellable null price, URL protocol, tax bounds, and integer expiry days', () => {
    const missingSellablePrice = createProductFormSchema.safeParse({
      ...DEFAULT_CREATE_PRODUCT_FORM_VALUES,
      category_id: 'cat-1',
      sku: 'SKU-1',
      name: 'Product 1',
      base_uom: {
        uom_code: 'tab',
        display_name: 'Tablet',
        is_sellable: true,
        is_purchasable: true,
        sale_unit_price: '',
      },
    });
    expect(missingSellablePrice.success).toBe(false);
    if (!missingSellablePrice.success) {
      expect(missingSellablePrice.error.issues[0]?.path).toEqual([
        'base_uom',
        'sale_unit_price',
      ]);
    }

    const nonSellableParsed = createProductFormSchema.parse({
      ...DEFAULT_CREATE_PRODUCT_FORM_VALUES,
      category_id: 'cat-1',
      sku: 'SKU-2',
      name: 'Product 2',
      base_uom: {
        uom_code: 'tab',
        display_name: 'Tablet',
        is_sellable: false,
        is_purchasable: true,
        sale_unit_price: '',
      },
    });
    expect(
      toCreateProductPayload(nonSellableParsed).uoms[0]?.sale_unit_price
    ).toBeNull();

    const invalidBounds = createProductFormSchema.safeParse({
      ...DEFAULT_CREATE_PRODUCT_FORM_VALUES,
      category_id: 'cat-1',
      sku: 'S'.repeat(41),
      name: 'N'.repeat(181),
      image_url: 'ftp://example.com/img.png',
      tax_percent: '101',
      expiry_alert_days: '12.5',
      base_uom: {
        uom_code: 'U'.repeat(21),
        display_name: 'D'.repeat(51),
        is_sellable: true,
        is_purchasable: false,
        sale_unit_price: '-1',
      },
    });
    expect(invalidBounds.success).toBe(false);
    if (!invalidBounds.success) {
      const paths = invalidBounds.error.issues.map((issue) =>
        issue.path.join('.')
      );
      expect(paths).toContain('sku');
      expect(paths).toContain('name');
      expect(paths).toContain('image_url');
      expect(paths).toContain('tax_percent');
      expect(paths).toContain('expiry_alert_days');
      expect(paths).toContain('base_uom.uom_code');
      expect(paths).toContain('base_uom.display_name');
      expect(paths).toContain('base_uom.sale_unit_price');
    }

    const overMaxExpiry = createProductFormSchema.safeParse({
      ...DEFAULT_CREATE_PRODUCT_FORM_VALUES,
      category_id: 'cat-1',
      sku: 'SKU-3',
      name: 'Product 3',
      expiry_alert_days: '3651',
      base_uom: {
        uom_code: 'tab',
        display_name: 'Tablet',
        is_sellable: false,
        is_purchasable: false,
        sale_unit_price: '',
      },
    });
    expect(overMaxExpiry.success).toBe(false);

    // Negative zero and OpenAPI Numeric4 overflow must be rejected
    const negZeroAndOverflow = createProductFormSchema.safeParse({
      ...DEFAULT_CREATE_PRODUCT_FORM_VALUES,
      category_id: 'cat-1',
      sku: 'SKU-4',
      name: 'Product 4',
      tax_percent: '-0',
      expiry_alert_days: '-0',
      base_uom: {
        uom_code: 'tab',
        display_name: 'Tablet',
        is_sellable: true,
        is_purchasable: false,
        sale_unit_price: '-0',
      },
    });
    expect(negZeroAndOverflow.success).toBe(false);
    if (!negZeroAndOverflow.success) {
      const paths = negZeroAndOverflow.error.issues.map((issue) =>
        issue.path.join('.')
      );
      expect(paths).toContain('tax_percent');
      expect(paths).toContain('expiry_alert_days');
      expect(paths).toContain('base_uom.sale_unit_price');
    }

    const priceOverflow = createProductFormSchema.safeParse({
      ...DEFAULT_CREATE_PRODUCT_FORM_VALUES,
      category_id: 'cat-1',
      sku: 'SKU-5',
      name: 'Product 5',
      base_uom: {
        uom_code: 'tab',
        display_name: 'Tablet',
        is_sellable: true,
        is_purchasable: false,
        sale_unit_price: '100000000000000',
      },
    });
    expect(priceOverflow.success).toBe(false);

    // Max 14-digit Numeric4 precision must remain exact without float corruption
    const maxPrecisionProduct = createProductFormSchema.parse({
      ...DEFAULT_CREATE_PRODUCT_FORM_VALUES,
      category_id: 'cat-1',
      sku: 'SKU-6',
      name: 'Product 6',
      base_uom: {
        uom_code: 'tab',
        display_name: 'Tablet',
        is_sellable: true,
        is_purchasable: false,
        sale_unit_price: '99999999999999.9999',
      },
    });
    expect(
      toCreateProductPayload(maxPrecisionProduct).uoms[0]?.sale_unit_price
    ).toBe('99999999999999.9999');
  });

  it('integrates createProductFormSchema with React Hook Form zodResolver including nested base_uom paths', async () => {
    const { result } = renderHook(() => {
      const form = useForm<CreateProductFormValues>({
        resolver: zodResolver(createProductFormSchema),
        defaultValues: {
          ...DEFAULT_CREATE_PRODUCT_FORM_VALUES,
          category_id: 'cat-1',
          sku: 'SKU-RHF',
          name: 'RHF Product',
          base_uom: {
            uom_code: 'tab',
            display_name: 'Tablet',
            is_sellable: true,
            is_purchasable: true,
            sale_unit_price: '',
          },
        },
      });
      return {
        trigger: form.trigger,
        priceError: form.formState.errors.base_uom?.sale_unit_price?.message,
      };
    });

    let valid = true;
    await act(async () => {
      valid = await result.current.trigger();
    });
    expect(valid).toBe(false);
    await waitFor(() => {
      expect(result.current.priceError).toBe(
        'Sale unit price is required when UOM is sellable'
      );
    });
  });

  it('converts ProductDto to EditProductFormValues and omits immutable sku/base_uom_code from ProductPatchRequest', () => {
    const product: ProductDto = productFixture;
    const formValues = productDtoToEditFormValues(product);

    expect(formValues).toEqual({
      category_id: product.category_id,
      name: 'Panadol 500mg Tablets',
      barcode: '6221048001234',
      generic_name: 'Paracetamol 500mg',
      brand_name: 'Panadol',
      image_url: 'https://cdn.pharmaplus.eg/products/ana-pcm-500-tab.jpg',
      tax_percent: '14',
      lot_tracking_required: false,
      expiry_alert_days: '30',
      is_active: true,
    });
    expect('sku' in formValues).toBe(false);
    expect('base_uom_code' in formValues).toBe(false);

    const parsed = editProductFormSchema.parse({
      ...formValues,
      barcode: '',
      is_active: false,
    });
    const patchPayload = toProductPatchPayload(parsed);

    expect(patchPayload).toEqual({
      category_id: product.category_id,
      barcode: null,
      name: 'Panadol 500mg Tablets',
      generic_name: 'Paracetamol 500mg',
      brand_name: 'Panadol',
      tax_rate: '0.1400',
      image_url: 'https://cdn.pharmaplus.eg/products/ana-pcm-500-tab.jpg',
      lot_tracking_required: false,
      expiry_alert_days: 30,
      is_active: false,
    });
    expect('sku' in patchPayload).toBe(false);
    expect('base_uom_code' in patchPayload).toBe(false);
  });
});

describe('uomReorderSchema', () => {
  it('validates createUomFormSchema, enforces base factor === 1, and formats 6dp/4dp strings', () => {
    const validNonBase = createUomFormSchema.parse({
      uom_code: ' strip ',
      display_name: ' Strip of 10 ',
      conversion_to_base: '10',
      is_base: false,
      is_sellable: true,
      is_purchasable: false,
      sale_unit_price: '12.5',
    });
    expect(toCreateUomPayload(validNonBase)).toEqual({
      uom_code: 'strip',
      display_name: 'Strip of 10',
      conversion_to_base: '10.000000',
      sale_unit_price: '12.5000',
      is_base: false,
      is_sellable: true,
      is_purchasable: false,
    });

    const invalidBaseFactor = createUomFormSchema.safeParse({
      ...DEFAULT_CREATE_UOM_FORM_VALUES,
      uom_code: 'tab',
      display_name: 'Tablet',
      conversion_to_base: '2',
      is_base: true,
    });
    expect(invalidBaseFactor.success).toBe(false);
    if (!invalidBaseFactor.success) {
      expect(invalidBaseFactor.error.issues[0]).toMatchObject({
        path: ['conversion_to_base'],
        message: 'Base UOM conversion factor must equal 1',
      });
    }

    const tinyFactor = createUomFormSchema.safeParse({
      ...DEFAULT_CREATE_UOM_FORM_VALUES,
      uom_code: 'micro',
      display_name: 'Micro',
      conversion_to_base: '0.0000001',
    });
    expect(tinyFactor.success).toBe(false);

    const missingSellablePrice = createUomFormSchema.safeParse({
      ...DEFAULT_CREATE_UOM_FORM_VALUES,
      uom_code: 'box',
      display_name: 'Box',
      conversion_to_base: '20',
      is_sellable: true,
      sale_unit_price: '',
    });
    expect(missingSellablePrice.success).toBe(false);
  });

  it('validates editUomFormSchema strictly with ProductUomPatchRequest fields', () => {
    const uom: ProductUomDto = {
      product_uom_id: 'u-1',
      uom_code: 'strip',
      display_name: 'Strip of 10',
      conversion_to_base: '10.000000',
      sale_unit_price: '12.0000',
      is_base: false,
      is_sellable: true,
      is_purchasable: false,
      is_active: true,
    };

    const formValues = uomDtoToEditFormValues(uom);
    expect(formValues).toEqual({
      display_name: 'Strip of 10',
      is_sellable: true,
      is_purchasable: false,
      sale_unit_price: '12.0000',
      is_active: true,
    });
    expect('conversion_to_base' in formValues).toBe(false);
    expect('is_base' in formValues).toBe(false);

    const parsed = editUomFormSchema.parse({
      ...formValues,
      is_sellable: false,
      sale_unit_price: '12.0000',
      is_active: false,
    });
    expect(toUomPatchPayload(parsed)).toEqual({
      display_name: 'Strip of 10',
      sale_unit_price: null,
      is_sellable: false,
      is_purchasable: false,
      is_active: false,
    });
  });

  it('validates reorderRuleFormSchema bounds including max >= reorder_point and optional empty max', () => {
    expect(reorderRuleDtoToFormValues(null)).toEqual(
      DEFAULT_REORDER_RULE_VALUES
    );

    const existingRule: ReorderRuleDto = {
      reorder_rule_id: 'r-1',
      product_id: 'p-1',
      branch_id: 'b-1',
      reorder_point_base: '100.0000',
      reorder_quantity_base: '250.0000',
      max_quantity_base: null,
      is_active: true,
    };
    expect(reorderRuleDtoToFormValues(existingRule)).toEqual({
      reorder_point_base: '100.0000',
      reorder_quantity_base: '250.0000',
      max_quantity_base: '',
      is_active: true,
    });

    const parsedNoMax = reorderRuleFormSchema.parse({
      reorder_point_base: '0',
      reorder_quantity_base: '50',
      max_quantity_base: '   ',
      is_active: true,
    });
    expect(toReorderRulePayload(parsedNoMax)).toEqual({
      reorder_point_base: '0.0000',
      reorder_quantity_base: '50.0000',
      max_quantity_base: null,
      is_active: true,
    });

    const equalBoundary = reorderRuleFormSchema.parse({
      reorder_point_base: '100',
      reorder_quantity_base: '50',
      max_quantity_base: '100',
      is_active: false,
    });
    expect(toReorderRulePayload(equalBoundary).max_quantity_base).toBe(
      '100.0000'
    );

    const invalidMax = reorderRuleFormSchema.safeParse({
      reorder_point_base: '100',
      reorder_quantity_base: '0',
      max_quantity_base: '99.5',
      is_active: true,
    });
    expect(invalidMax.success).toBe(false);
    if (!invalidMax.success) {
      const paths = invalidMax.error.issues.map((issue) =>
        issue.path.join('.')
      );
      expect(paths).toContain('reorder_quantity_base');
      expect(paths).toContain('max_quantity_base');
    }
  });

  it('integrates reorderRuleFormSchema with React Hook Form zodResolver', async () => {
    const { result } = renderHook(() => {
      const form = useForm<ReorderRuleFormValues>({
        resolver: zodResolver(reorderRuleFormSchema),
        defaultValues: {
          reorder_point_base: '200',
          reorder_quantity_base: '100',
          max_quantity_base: '150',
          is_active: true,
        },
      });
      return {
        trigger: form.trigger,
        maxError: form.formState.errors.max_quantity_base?.message,
      };
    });

    let valid = true;
    await act(async () => {
      valid = await result.current.trigger();
    });
    expect(valid).toBe(false);
    await waitFor(() => {
      expect(result.current.maxError).toBe(
        'Maximum stock quantity must be greater than or equal to reorder point'
      );
    });
  });

  it('rejects -0 and OpenAPI digit overflows while preserving exact 12dp/14dp boundary precision', () => {
    const uomBoundary = createUomFormSchema.parse({
      uom_code: 'bulk',
      display_name: 'Bulk',
      conversion_to_base: '999999999999.999999',
      is_base: false,
      is_sellable: true,
      is_purchasable: true,
      sale_unit_price: '99999999999999.9999',
    });
    expect(toCreateUomPayload(uomBoundary)).toMatchObject({
      conversion_to_base: '999999999999.999999',
      sale_unit_price: '99999999999999.9999',
    });

    expect(
      createUomFormSchema.safeParse({
        ...DEFAULT_CREATE_UOM_FORM_VALUES,
        uom_code: 'bad',
        display_name: 'Bad',
        conversion_to_base: '1000000000000',
        is_sellable: true,
        sale_unit_price: '-0',
      }).success
    ).toBe(false);

    expect(
      reorderRuleFormSchema.safeParse({
        reorder_point_base: '-0',
        reorder_quantity_base: '1',
        max_quantity_base: '-0',
        is_active: true,
      }).success
    ).toBe(false);

    // Exact decimal comparison catches 14-digit .9998 < .9999 where float collapses
    expect(
      reorderRuleFormSchema.safeParse({
        reorder_point_base: '99999999999999.9999',
        reorder_quantity_base: '1',
        max_quantity_base: '99999999999999.9998',
        is_active: true,
      }).success
    ).toBe(false);

    const exactReorder = reorderRuleFormSchema.parse({
      reorder_point_base: '99999999999999.9999',
      reorder_quantity_base: '99999999999999.9999',
      max_quantity_base: '99999999999999.9999',
      is_active: true,
    });
    expect(toReorderRulePayload(exactReorder)).toEqual({
      reorder_point_base: '99999999999999.9999',
      reorder_quantity_base: '99999999999999.9999',
      max_quantity_base: '99999999999999.9999',
      is_active: true,
    });
  });
});

describe('catalogErrorMapper', () => {
  it('maps category 422 and 409 errors cleanly', () => {
    const setError = vi.fn();
    const err422 = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Invalid category',
        details: [
          { field: 'parent_category_id', issue: 'Cycle detected' },
          { field: 'name', issue: 'Name too long' },
        ],
      },
      422
    );

    expect(applyCategoryFormApiError(err422, setError)).toBeNull();
    expect(setError).toHaveBeenCalledWith('parent_category_id', {
      type: 'server',
      message: 'Cycle detected',
    });
    expect(setError).toHaveBeenCalledWith('name', {
      type: 'server',
      message: 'Name too long',
    });

    const err409 = new ApiClientError(
      {
        code: 'CONFLICT',
        message: 'Category code already exists.',
        trace_id: 'tr-cat-409',
        details: [{ field: 'code', issue: 'Must be unique' }],
      },
      409
    );
    expect(applyCategoryFormApiError(err409, setError)).toBe(
      'Category code already exists. (Trace: tr-cat-409)'
    );
    expect(setError).toHaveBeenCalledWith('code', {
      type: 'server',
      message: 'Must be unique',
    });
  });

  it('maps create/edit product, UOM, and reorder rule errors cleanly', () => {
    const createProductSetError =
      vi.fn<UseFormSetError<CreateProductFormValues>>();
    const createErr = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Invalid product',
        details: [
          { field: 'uoms[0].uom_code', issue: 'Invalid UOM code' },
          { field: 'uoms[0].sale_unit_price', issue: 'Price required' },
          { field: 'tax_rate', issue: 'Invalid tax' },
          { field: 'sku', issue: 'Invalid SKU' },
          { field: 'lot_tracking_required', issue: 'Invalid lot flag' },
        ],
      },
      422
    );

    const createBanner = applyCreateProductFormApiError(
      createErr,
      createProductSetError
    );
    expect(createBanner).toBeNull();
    expect(createProductSetError).toHaveBeenCalledWith('base_uom.uom_code', {
      type: 'server',
      message: 'Invalid UOM code',
    });
    expect(createProductSetError).toHaveBeenCalledWith(
      'base_uom.sale_unit_price',
      {
        type: 'server',
        message: 'Price required',
      }
    );
    expect(createProductSetError).toHaveBeenCalledWith('tax_percent', {
      type: 'server',
      message: 'Invalid tax',
    });
    expect(createProductSetError).toHaveBeenCalledWith('sku', {
      type: 'server',
      message: 'Invalid SKU',
    });
    expect(createProductSetError).toHaveBeenCalledWith(
      'lot_tracking_required',
      {
        type: 'server',
        message: 'Invalid lot flag',
      }
    );

    const editProductSetError = vi.fn<UseFormSetError<EditProductFormValues>>();
    const editConflict = new ApiClientError(
      {
        code: 'CONFLICT',
        message: 'Lot tracking locked by stock history.',
        trace_id: 'tr-lot-409',
        details: [
          {
            field: 'lot_tracking_required',
            issue: 'Cannot change while stock exists.',
          },
        ],
      },
      409
    );
    expect(
      applyEditProductFormApiError(editConflict, editProductSetError)
    ).toBe('Lot tracking locked by stock history. (Trace: tr-lot-409)');
    expect(editProductSetError).toHaveBeenCalledWith('lot_tracking_required', {
      type: 'server',
      message: 'Cannot change while stock exists.',
    });

    const createUomSetError = vi.fn<UseFormSetError<CreateUomFormValues>>();
    const createUomErr = new ApiClientError(
      {
        code: 'CONFLICT',
        message: 'Duplicate UOM code',
        trace_id: 'tr-uom-409',
        details: [{ field: 'uom_code', issue: 'Already exists' }],
      },
      409
    );
    expect(applyCreateUomFormApiError(createUomErr, createUomSetError)).toBe(
      'Duplicate UOM code (Trace: tr-uom-409)'
    );
    expect(createUomSetError).toHaveBeenCalledWith('uom_code', {
      type: 'server',
      message: 'Already exists',
    });

    const editUomSetError = vi.fn<UseFormSetError<EditUomFormValues>>();
    const editUomErr = new ApiClientError(
      {
        code: 'CONFLICT',
        message: 'Base UOM cannot be deactivated.',
        trace_id: 'tr-uom-base',
        details: [{ field: 'is_active', issue: 'Base UOM must stay active' }],
      },
      409
    );
    expect(applyEditUomFormApiError(editUomErr, editUomSetError)).toBe(
      'Base UOM cannot be deactivated. (Trace: tr-uom-base)'
    );
    expect(editUomSetError).toHaveBeenCalledWith('is_active', {
      type: 'server',
      message: 'Base UOM must stay active',
    });

    const reorderSetError = vi.fn<UseFormSetError<ReorderRuleFormValues>>();
    const reorderErr = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Invalid reorder rule',
        details: [
          { field: 'reorder_point_base', issue: 'Must be >= 0' },
          { field: 'reorder_quantity_base', issue: 'Must be > 0' },
          { field: 'max_quantity_base', issue: 'Must be >= reorder point' },
        ],
      },
      422
    );
    expect(
      applyReorderRuleFormApiError(reorderErr, reorderSetError)
    ).toBeNull();
    expect(reorderSetError).toHaveBeenCalledTimes(3);

    expect(
      applyReorderRuleFormApiError(new Error('network'), reorderSetError)
    ).toBe('Unable to save reorder rule. Please try again.');
  });
});
