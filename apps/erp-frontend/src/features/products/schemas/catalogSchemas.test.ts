/** @vitest-environment jsdom */
import { zodResolver } from '@hookform/resolvers/zod';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useForm, type UseFormSetError } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import productFixture from '@contracts/fixtures/product.json';
import { normalizeProduct } from '../../../lib/api/catalogInventoryNormalizers';
import { ApiClientError } from '../../../lib/api/client';
import type {
  Product,
  ProductCategory,
  ProductUom,
  ReorderRule,
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
  toCreateCategoryPayload,
  toPatchCategoryPayload,
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
  toPatchProductPayload,
  toProductPatchPayload,
  toUpdateProductPayload,
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
  toCreateProductUomPayload,
  toCreateUomPayload,
  toPatchProductUomPayload,
  toReorderRulePayload,
  toUomPatchPayload,
  toUpdateUomPayload,
  toUpsertReorderRulePayload,
  uomDtoToEditFormValues,
  updateProductUomFormSchema,
  type CreateUomFormValues,
  type EditUomFormValues,
  type ReorderRuleFormValues,
} from './uomReorderSchema';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ORG_ID = '11111111-1111-4111-8111-111111111101';
const TIMESTAMP = '2026-11-25T10:00:00+00:00';

const ANALGESICS_CATEGORY: ProductCategory = {
  category_id: 'cat-root-a',
  organization_id: ORG_ID,
  parent_category_id: null,
  code: 'CAT-A',
  name: 'Analgesics',
  description: 'Pain relief',
  is_active: true,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
};

const SAMPLE_CATEGORIES: readonly ProductCategory[] = [
  {
    category_id: 'cat-root-b',
    organization_id: ORG_ID,
    parent_category_id: null,
    code: 'CAT-Z',
    name: 'Vitamins',
    description: null,
    is_active: true,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
  },
  ANALGESICS_CATEGORY,
  {
    category_id: 'cat-child-1',
    organization_id: ORG_ID,
    parent_category_id: 'cat-root-a',
    code: 'CAT-A1',
    name: 'Pediatric Analgesics',
    description: null,
    is_active: true,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
  },
  {
    category_id: 'cat-grandchild-1',
    organization_id: ORG_ID,
    parent_category_id: 'cat-child-1',
    code: 'CAT-A1A',
    name: 'Infant Drops',
    description: null,
    is_active: true,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
  },
  {
    category_id: 'cat-inactive',
    organization_id: ORG_ID,
    parent_category_id: null,
    code: 'CAT-OLD',
    name: 'Archived Parent',
    description: null,
    is_active: false,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
  },
  {
    category_id: 'cat-active-under-inactive',
    organization_id: ORG_ID,
    parent_category_id: 'cat-inactive',
    code: 'CAT-ORPHAN',
    name: 'Active Child Under Inactive',
    description: null,
    is_active: true,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
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

    const cyclic: ProductCategory[] = [
      {
        category_id: 'c-1',
        organization_id: ORG_ID,
        parent_category_id: 'c-3',
        code: 'C1',
        name: 'One',
        description: null,
        is_active: true,
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
      },
      {
        category_id: 'c-2',
        organization_id: ORG_ID,
        parent_category_id: 'c-1',
        code: 'C2',
        name: 'Two',
        description: null,
        is_active: true,
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
      },
      {
        category_id: 'c-3',
        organization_id: ORG_ID,
        parent_category_id: 'c-2',
        code: 'C3',
        name: 'Three',
        description: null,
        is_active: true,
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
      },
      {
        category_id: 'c-self',
        organization_id: ORG_ID,
        parent_category_id: 'c-self',
        code: 'CS',
        name: 'Self',
        description: null,
        is_active: true,
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
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
    const cyclic: ProductCategory[] = [
      {
        category_id: 'a',
        organization_id: ORG_ID,
        parent_category_id: 'b',
        code: 'A',
        name: 'Alpha',
        description: null,
        is_active: true,
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
      },
      {
        category_id: 'b',
        organization_id: ORG_ID,
        parent_category_id: 'a',
        code: 'B',
        name: 'Beta',
        description: null,
        is_active: true,
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
      },
    ];

    const tree = buildCategoryTree(cyclic, { includeInactive: true });
    expect(tree).toHaveLength(1);
    expect(tree[0]?.category.category_id).toBe('a');
    expect(tree[0]?.children.map((c) => c.category.category_id)).toEqual(['b']);

    const mixedCyclic: ProductCategory[] = [
      {
        category_id: 'z',
        organization_id: ORG_ID,
        parent_category_id: null,
        code: 'Z',
        name: 'Zebra',
        description: null,
        is_active: true,
        created_at: TIMESTAMP,
        updated_at: TIMESTAMP,
      },
      ...cyclic,
    ];
    const mixedTree = buildCategoryTree(mixedCyclic, { includeInactive: true });
    expect(mixedTree.map((n) => n.category.category_id)).toEqual(['a', 'z']);
  });

  it('validates category fields, prevents cycles, omits is_active on create, and omits code on patch', () => {
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

    const createPayload = toCategoryCreatePayload(valid);
    expect(createPayload).toEqual({
      parent_category_id: null,
      code: 'CAT-A',
      name: 'Analgesics',
      description: null,
    });
    expect('is_active' in createPayload).toBe(false);
    expect(toCreateCategoryPayload(valid)).toEqual(createPayload);

    const patchPayload = toCategoryPatchPayload(valid);
    expect(patchPayload).toEqual({
      parent_category_id: null,
      name: 'Analgesics',
      description: null,
      is_active: false,
    });
    expect('code' in patchPayload).toBe(false);
    expect(toPatchCategoryPayload(valid)).toEqual(patchPayload);

    const dtoValues = categoryDtoToFormValues(ANALGESICS_CATEGORY);
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
  it('converts native fractional tax_rate numbers to percent strings and back without IEEE-754 float drift', () => {
    expect(taxRateDtoToPercentString(0.14)).toBe('14');
    expect(taxRateDtoToPercentString(0.145)).toBe('14.5');
    expect(taxRateDtoToPercentString(0.1425)).toBe('14.25');
    expect(taxRateDtoToPercentString(0)).toBe('0');
    expect(taxRateDtoToPercentString(1)).toBe('100');
    expect(taxRateDtoToPercentString(0.29)).toBe('29');
    expect(taxRateDtoToPercentString(0.05)).toBe('5');
    expect(taxRateDtoToPercentString(0.005)).toBe('0.5');
    expect(taxRateDtoToPercentString(0.0005)).toBe('0.05');

    expect(percentToTaxRateDto('14')).toBe(0.14);
    expect(percentToTaxRateDto('14.5')).toBe(0.145);
    expect(percentToTaxRateDto('14.25')).toBe(0.1425);
    expect(percentToTaxRateDto('0')).toBe(0);
    expect(percentToTaxRateDto('100')).toBe(1);
    expect(percentToTaxRateDto('29')).toBe(0.29);
    expect(percentToTaxRateDto('5')).toBe(0.05);
  });

  it('validates createProductFormSchema and emits CreateProductRequest with native numbers', () => {
    const parsed = createProductFormSchema.parse({
      category_id: ' 11111111-5555-4111-8111-000000000003 ',
      sku: ' ANA-NEW-01 ',
      name: ' New Analgesic 500mg ',
      barcode: '   ',
      generic_name: ' Paracetamol ',
      brand_name: '',
      image_url: ' https://cdn.medcare.eg/p1.png ',
      tax_percent: '14.5',
      lot_tracking_required: true,
      expiry_alert_days: '60',
      base_uom: {
        uom_code: ' TAB ',
        display_name: ' Tablet ',
        is_sellable: true,
        is_purchasable: false,
        sale_unit_price: '2.5',
      },
    });

    const payload = toCreateProductPayload(parsed);
    expect(payload).toEqual({
      category_id: '11111111-5555-4111-8111-000000000003',
      sku: 'ANA-NEW-01',
      barcode: null,
      name: 'New Analgesic 500mg',
      generic_name: 'Paracetamol',
      brand_name: null,
      base_uom_code: 'TAB',
      tax_rate: 0.145,
      image_url: 'https://cdn.medcare.eg/p1.png',
      lot_tracking_required: true,
      expiry_alert_days: 60,
      uoms: [
        {
          uom_code: 'TAB',
          display_name: 'Tablet',
          conversion_to_base: 1,
          sale_unit_price: 2.5,
          is_base: true,
          is_sellable: true,
          is_purchasable: false,
        },
      ],
    });
    expect(typeof payload.tax_rate).toBe('number');
    expect(typeof payload.uoms?.[0]?.conversion_to_base).toBe('number');
    expect(typeof payload.uoms?.[0]?.sale_unit_price).toBe('number');
  });

  it('enforces sellable base UOM price, non-sellable null price, URL protocol, tax bounds, and integer expiry days', () => {
    const missingSellablePrice = createProductFormSchema.safeParse({
      ...DEFAULT_CREATE_PRODUCT_FORM_VALUES,
      category_id: 'cat-1',
      sku: 'SKU-1',
      name: 'Product 1',
      base_uom: {
        uom_code: 'TAB',
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
        uom_code: 'TAB',
        display_name: 'Tablet',
        is_sellable: false,
        is_purchasable: true,
        sale_unit_price: '',
      },
    });
    expect(
      toCreateProductPayload(nonSellableParsed).uoms?.[0]?.sale_unit_price
    ).toBeNull();

    const zeroPriceParsed = createProductFormSchema.parse({
      ...DEFAULT_CREATE_PRODUCT_FORM_VALUES,
      category_id: 'cat-1',
      sku: 'SKU-ZERO',
      name: 'Zero Price Sample',
      base_uom: {
        uom_code: 'TAB',
        display_name: 'Tablet',
        is_sellable: true,
        is_purchasable: false,
        sale_unit_price: '0',
      },
    });
    expect(
      toCreateProductPayload(zeroPriceParsed).uoms?.[0]?.sale_unit_price
    ).toBe(0);

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

    const negZero = createProductFormSchema.safeParse({
      ...DEFAULT_CREATE_PRODUCT_FORM_VALUES,
      category_id: 'cat-1',
      sku: 'SKU-4',
      name: 'Product 4',
      tax_percent: '-0',
      expiry_alert_days: '-0',
      base_uom: {
        uom_code: 'TAB',
        display_name: 'Tablet',
        is_sellable: true,
        is_purchasable: false,
        sale_unit_price: '-0',
      },
    });
    expect(negZero.success).toBe(false);
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
            uom_code: 'TAB',
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

  it('converts Product to EditProductFormValues and emits UpdateProductRequest with editable sku, base_uom_code, and native numbers', () => {
    const product: Product = normalizeProduct(productFixture);
    const formValues = productDtoToEditFormValues(product);

    expect(formValues).toEqual({
      category_id: product.category_id,
      sku: 'MED-AUG-1000',
      base_uom_code: 'TAB',
      name: 'Augmentin 1g Film-Coated Tablets',
      barcode: '6221001000019',
      generic_name: 'Amoxicillin 875mg + Clavulanic Acid 125mg',
      brand_name: 'GSK',
      image_url: '',
      tax_percent: '0',
      lot_tracking_required: true,
      expiry_alert_days: '90',
      is_active: true,
    });

    const parsed = editProductFormSchema.parse({
      ...formValues,
      sku: ' MED-AUG-1000-V2 ',
      base_uom_code: ' CAP ',
      barcode: '',
      tax_percent: '14',
      is_active: false,
    });
    const patchPayload = toPatchProductPayload(parsed);

    expect(patchPayload).toEqual({
      category_id: product.category_id,
      sku: 'MED-AUG-1000-V2',
      base_uom_code: 'CAP',
      barcode: null,
      name: 'Augmentin 1g Film-Coated Tablets',
      generic_name: 'Amoxicillin 875mg + Clavulanic Acid 125mg',
      brand_name: 'GSK',
      tax_rate: 0.14,
      image_url: null,
      lot_tracking_required: true,
      expiry_alert_days: 90,
      is_active: false,
    });
    expect(typeof patchPayload.tax_rate).toBe('number');
    expect(toProductPatchPayload(parsed)).toEqual(patchPayload);
    expect(toUpdateProductPayload(parsed)).toEqual(patchPayload);

    const invalidSkuAndBaseUom = editProductFormSchema.safeParse({
      ...formValues,
      sku: '   ',
      base_uom_code: 'B'.repeat(21),
    });
    expect(invalidSkuAndBaseUom.success).toBe(false);
    if (!invalidSkuAndBaseUom.success) {
      const paths = invalidSkuAndBaseUom.error.issues.map((i) =>
        i.path.join('.')
      );
      expect(paths).toContain('sku');
      expect(paths).toContain('base_uom_code');
    }
  });
});

describe('uomReorderSchema', () => {
  it('validates createUomFormSchema, enforces base factor === 1, and emits native numbers', () => {
    const validNonBase = createUomFormSchema.parse({
      uom_code: ' STRIP ',
      display_name: ' Strip of 7 ',
      conversion_to_base: '7',
      is_base: false,
      is_sellable: true,
      is_purchasable: false,
      sale_unit_price: '70.5',
    });
    const payload = toCreateProductUomPayload(validNonBase);
    expect(payload).toEqual({
      uom_code: 'STRIP',
      display_name: 'Strip of 7',
      conversion_to_base: 7,
      sale_unit_price: 70.5,
      is_base: false,
      is_sellable: true,
      is_purchasable: false,
    });
    expect(typeof payload.conversion_to_base).toBe('number');
    expect(typeof payload.sale_unit_price).toBe('number');
    expect(toCreateUomPayload(validNonBase)).toEqual(payload);

    const invalidBaseFactor = createUomFormSchema.safeParse({
      ...DEFAULT_CREATE_UOM_FORM_VALUES,
      uom_code: 'TAB',
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

    expect(
      createUomFormSchema.safeParse({
        ...DEFAULT_CREATE_UOM_FORM_VALUES,
        uom_code: 'ZERO',
        display_name: 'Zero',
        conversion_to_base: '0',
      }).success
    ).toBe(false);

    expect(
      createUomFormSchema.safeParse({
        ...DEFAULT_CREATE_UOM_FORM_VALUES,
        uom_code: 'BOX',
        display_name: 'Box',
        conversion_to_base: '20',
        is_sellable: true,
        sale_unit_price: '',
      }).success
    ).toBe(false);
  });

  it('validates editUomFormSchema with editable conversion_to_base for non-base UOMs and base lock === 1', () => {
    const uom: ProductUom = {
      product_uom_id: 'u-1',
      product_id: 'p-1',
      uom_code: 'STRIP',
      display_name: 'Strip of 10',
      conversion_to_base: 10,
      sale_unit_price: 12.5,
      is_base: false,
      is_sellable: true,
      is_purchasable: false,
      is_active: true,
      updated_at: TIMESTAMP,
    };

    const formValues = uomDtoToEditFormValues(uom);
    expect(formValues).toEqual({
      display_name: 'Strip of 10',
      conversion_to_base: '10',
      is_base: false,
      is_sellable: true,
      is_purchasable: false,
      sale_unit_price: '12.5',
      is_active: true,
    });

    const parsedSellable = updateProductUomFormSchema.parse({
      ...formValues,
      conversion_to_base: '12.5',
      sale_unit_price: '15.25',
    });
    expect(toPatchProductUomPayload(parsedSellable, uom)).toEqual({
      display_name: 'Strip of 10',
      conversion_to_base: 12.5,
      sale_unit_price: 15.25,
      is_sellable: true,
      is_purchasable: false,
      is_active: true,
    });

    const parsedNonSellable = editUomFormSchema.parse({
      ...formValues,
      is_sellable: false,
      sale_unit_price: '12.5',
      is_active: false,
    });
    const nonSellablePatch = toPatchProductUomPayload(parsedNonSellable);
    expect(nonSellablePatch).toEqual({
      display_name: 'Strip of 10',
      conversion_to_base: 10,
      sale_unit_price: null,
      is_sellable: false,
      is_purchasable: false,
      is_active: false,
    });
    expect(toUomPatchPayload(parsedNonSellable)).toEqual(nonSellablePatch);
    expect(toUpdateUomPayload(parsedNonSellable)).toEqual(nonSellablePatch);

    // Non-base UOM rejects zero/negative conversion factor
    expect(
      editUomFormSchema.safeParse({
        ...formValues,
        conversion_to_base: '0',
      }).success
    ).toBe(false);

    // Base UOM requires conversion_to_base === 1 and emits 1
    const baseUom: ProductUom = {
      ...uom,
      uom_code: 'TAB',
      conversion_to_base: 1,
      is_base: true,
    };
    const baseInvalid = editUomFormSchema.safeParse({
      ...uomDtoToEditFormValues(baseUom),
      conversion_to_base: '2',
    });
    expect(baseInvalid.success).toBe(false);
    if (!baseInvalid.success) {
      expect(baseInvalid.error.issues[0]).toMatchObject({
        path: ['conversion_to_base'],
        message: 'Base UOM conversion factor must equal 1',
      });
    }
    expect(
      toUpdateUomPayload(
        { ...uomDtoToEditFormValues(baseUom), conversion_to_base: '5' },
        baseUom
      ).conversion_to_base
    ).toBe(1);
  });

  it('validates reorderRuleFormSchema bounds and emits UpsertReorderRuleRequest with native numbers', () => {
    expect(reorderRuleDtoToFormValues(null)).toEqual(
      DEFAULT_REORDER_RULE_VALUES
    );

    const existingRule: ReorderRule = {
      reorder_rule_id: 'r-1',
      organization_id: ORG_ID,
      product_id: 'p-1',
      branch_id: 'b-1',
      reorder_point_base: 50,
      reorder_quantity_base: 200,
      max_quantity_base: null,
      is_active: true,
      updated_at: TIMESTAMP,
    };
    expect(reorderRuleDtoToFormValues(existingRule)).toEqual({
      reorder_point_base: '50',
      reorder_quantity_base: '200',
      max_quantity_base: '',
      is_active: true,
    });

    const parsedNoMax = reorderRuleFormSchema.parse({
      reorder_point_base: '0',
      reorder_quantity_base: '50.5',
      max_quantity_base: '   ',
      is_active: true,
    });
    const payloadNoMax = toUpsertReorderRulePayload(parsedNoMax);
    expect(payloadNoMax).toEqual({
      reorder_point_base: 0,
      reorder_quantity_base: 50.5,
      max_quantity_base: null,
      is_active: true,
    });
    expect(toReorderRulePayload(parsedNoMax)).toEqual(payloadNoMax);

    const equalBoundary = reorderRuleFormSchema.parse({
      reorder_point_base: '100',
      reorder_quantity_base: '50',
      max_quantity_base: '100',
      is_active: false,
    });
    expect(toUpsertReorderRulePayload(equalBoundary).max_quantity_base).toBe(
      100
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

    expect(
      reorderRuleFormSchema.safeParse({
        reorder_point_base: '-0',
        reorder_quantity_base: '1',
        max_quantity_base: '-0',
        is_active: true,
      }).success
    ).toBe(false);
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
});

describe('catalogErrorMapper', () => {
  it('handles 422 VALIDATION_ERROR, 409 CONFLICT, 400 MALFORMED_REQUEST, and 403 FORBIDDEN cleanly', () => {
    const setError = vi.fn<UseFormSetError<CategoryFormValues>>();

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

    setError.mockClear();
    const err400 = new ApiClientError(
      {
        code: 'MALFORMED_REQUEST',
        message: 'The idempotency key is required.',
        trace_id: 'tr-cat-400',
        details: [
          {
            field: 'Idempotency-Key',
            issue: 'The idempotency key is required.',
          },
        ],
      },
      400
    );
    expect(applyCategoryFormApiError(err400, setError)).toBe(
      'The idempotency key is required. (Trace: tr-cat-400)'
    );
    expect(setError).not.toHaveBeenCalled();

    const err403 = new ApiClientError(
      {
        code: 'FORBIDDEN',
        message: 'Cashier role cannot modify product categories.',
        trace_id: 'tr-cat-403',
        details: [],
      },
      403
    );
    expect(applyCategoryFormApiError(err403, setError)).toBe(
      'Cashier role cannot modify product categories. (Trace: tr-cat-403)'
    );
    expect(setError).not.toHaveBeenCalled();
  });

  it('maps create/edit product, UOM, and reorder rule errors including 403 FORBIDDEN_BRANCH and unmapped 422 details', () => {
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

    expect(
      applyCreateProductFormApiError(createErr, createProductSetError)
    ).toBeNull();
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

    // Unmapped 422 detail surfaces top-level banner while still setting mapped fields
    const unmapped422 = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Product validation failed.',
        trace_id: 'tr-unmapped-422',
        details: [
          { field: 'sku', issue: 'Bad SKU' },
          { field: 'uoms', issue: 'Exactly one base UOM required' },
        ],
      },
      422
    );
    expect(
      applyCreateProductFormApiError(unmapped422, createProductSetError)
    ).toBe('Product validation failed. (Trace: tr-unmapped-422)');

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
          {
            field: 'sku',
            issue: 'SKU must be unique.',
          },
          {
            field: 'base_uom_code',
            issue: 'Base UOM locked after stock history.',
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
    expect(editProductSetError).toHaveBeenCalledWith('sku', {
      type: 'server',
      message: 'SKU must be unique.',
    });
    expect(editProductSetError).toHaveBeenCalledWith('base_uom_code', {
      type: 'server',
      message: 'Base UOM locked after stock history.',
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

    const editUomSetError = vi.fn<UseFormSetError<EditUomFormValues>>();
    const editUomErr = new ApiClientError(
      {
        code: 'CONFLICT',
        message: 'Base UOM cannot be deactivated.',
        trace_id: 'tr-uom-base',
        details: [
          { field: 'is_active', issue: 'Base UOM must stay active' },
          {
            field: 'conversion_to_base',
            issue: 'Conversion factor locked by stock history.',
          },
        ],
      },
      409
    );
    expect(applyEditUomFormApiError(editUomErr, editUomSetError)).toBe(
      'Base UOM cannot be deactivated. (Trace: tr-uom-base)'
    );
    expect(editUomSetError).toHaveBeenCalledWith('conversion_to_base', {
      type: 'server',
      message: 'Conversion factor locked by stock history.',
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

    const forbiddenBranchErr = new ApiClientError(
      {
        code: 'FORBIDDEN_BRANCH',
        message: 'User is not authorized for this branch.',
        trace_id: 'tr-reorder-403',
        details: [],
      },
      403
    );
    expect(
      applyReorderRuleFormApiError(forbiddenBranchErr, reorderSetError)
    ).toBe('User is not authorized for this branch. (Trace: tr-reorder-403)');

    expect(
      applyReorderRuleFormApiError(new Error('network'), reorderSetError)
    ).toBe('Unable to save reorder rule. Please try again.');
  });
});
