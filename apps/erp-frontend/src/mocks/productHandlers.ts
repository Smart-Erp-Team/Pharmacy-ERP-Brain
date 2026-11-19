import { http, HttpResponse } from 'msw';
import inventoryBalanceFixture from '@contracts/fixtures/inventory-balance.json';
import productFixture from '@contracts/fixtures/product.json';
import type {
  ProductCategoryDto,
  ProductDto,
  ProductUomDto,
  ReorderRuleDto,
} from '../types/api';

interface ValidationDetail {
  field: string;
  issue: string;
}

const TAX_RATE_PATTERN = /^(0|0\.\d{1,4}|1(\.0{1,4})?)$/;
const POSITIVE_NUMERIC_6_PATTERN = /^(?!0+(\.0{1,6})?$)\d{1,12}(\.\d{1,6})?$/;
const NON_NEGATIVE_NUMERIC_4_PATTERN = /^\d{1,14}(\.\d{1,4})?$/;
const POSITIVE_NUMERIC_4_PATTERN = /^(?!0+(\.0{1,4})?$)\d{1,14}(\.\d{1,4})?$/;

export const LOCKED_HISTORY_PRODUCT_IDS: ReadonlySet<string> = new Set([
  inventoryBalanceFixture.product_id,
]);

export const INITIAL_CATEGORIES: readonly ProductCategoryDto[] = [
  {
    category_id: 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbb',
    parent_category_id: null,
    code: 'CAT-ANA',
    name: 'Analgesics',
    description: 'Pain relief and antipyretic medications',
    is_active: true,
    created_at: '2025-08-01T09:00:00Z',
    updated_at: '2025-08-01T09:00:00Z',
  },
  {
    category_id: 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbd',
    parent_category_id: 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbb',
    code: 'CAT-ANA-PED',
    name: 'Pediatric Analgesics',
    description: 'Pediatric analgesic syrups and suspensions',
    is_active: true,
    created_at: '2025-08-02T09:00:00Z',
    updated_at: '2025-08-02T09:00:00Z',
  },
  {
    category_id: 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbc',
    parent_category_id: null,
    code: 'CAT-ABX',
    name: 'Antibiotics',
    description: 'Prescription antibacterial therapies',
    is_active: true,
    created_at: '2025-08-01T09:05:00Z',
    updated_at: '2025-08-01T09:05:00Z',
  },
  {
    category_id: 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbe',
    parent_category_id: null,
    code: 'CAT-VIT',
    name: 'Vitamins & Supplements',
    description: 'Daily vitamins, minerals, and nutrition',
    is_active: true,
    created_at: '2025-08-03T10:00:00Z',
    updated_at: '2025-08-03T10:00:00Z',
  },
  {
    category_id: 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbf',
    parent_category_id: null,
    code: 'CAT-DIS',
    name: 'Discontinued Seasonal',
    description: 'Archived seasonal OTC category',
    is_active: false,
    created_at: '2025-07-15T10:00:00Z',
    updated_at: '2026-01-10T12:00:00Z',
  },
];

export const INITIAL_PRODUCTS: readonly ProductDto[] = [
  productFixture,
  {
    product_id: inventoryBalanceFixture.product_id,
    category_id: 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbc',
    sku: 'ABX-AUG-1000-TAB',
    barcode: '6221048002345',
    name: 'Augmentin 1g Tablets',
    generic_name: 'Amoxicillin 875mg / Clavulanic Acid 125mg',
    brand_name: 'Augmentin',
    base_uom_code: 'tablet',
    tax_rate: '0.1400',
    image_url: 'https://cdn.pharmaplus.eg/products/abx-aug-1000-tab.jpg',
    lot_tracking_required: true,
    expiry_alert_days: 90,
    is_active: true,
    uoms: [
      {
        product_uom_id: 'c1d2e3f4-1111-4aaa-8a1b-111111110001',
        uom_code: 'tablet',
        display_name: 'Tablet (base)',
        conversion_to_base: '1.000000',
        sale_unit_price: '12.5000',
        is_base: true,
        is_sellable: true,
        is_purchasable: false,
        is_active: true,
      },
      {
        product_uom_id: 'c1d2e3f4-1111-4aaa-8a1b-111111110002',
        uom_code: 'box',
        display_name: 'Box of 14',
        conversion_to_base: '14.000000',
        sale_unit_price: '175.0000',
        is_base: false,
        is_sellable: true,
        is_purchasable: true,
        is_active: true,
      },
    ],
    created_at: '2025-08-20T10:00:00Z',
    updated_at: '2026-10-05T11:15:00Z',
  },
  {
    product_id: 'd7e8f9a0-5555-4fff-9d4e-567890123bcd',
    category_id: 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbd',
    sku: 'ANA-CET-PED-SYR',
    barcode: '6221048003456',
    name: 'Cetal Pediatric Suspension 120ml',
    generic_name: 'Paracetamol 250mg/5ml',
    brand_name: 'Cetal',
    base_uom_code: 'bottle',
    tax_rate: '0.1400',
    image_url: null,
    lot_tracking_required: true,
    expiry_alert_days: 60,
    is_active: true,
    uoms: [
      {
        product_uom_id: 'c1d2e3f4-2222-4aaa-8a1b-111111110003',
        uom_code: 'bottle',
        display_name: 'Bottle 120ml',
        conversion_to_base: '1.000000',
        sale_unit_price: '38.0000',
        is_base: true,
        is_sellable: true,
        is_purchasable: true,
        is_active: true,
      },
    ],
    created_at: '2025-09-01T08:00:00Z',
    updated_at: '2026-09-12T10:00:00Z',
  },
  {
    product_id: 'e8f9a0b1-6666-4aaa-8e5f-678901234cde',
    category_id: 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbc',
    sku: 'ABX-ZTH-500-CAP',
    barcode: '6221048004567',
    name: 'Zithromax 500mg Capsules',
    generic_name: 'Azithromycin 500mg',
    brand_name: 'Zithromax',
    base_uom_code: 'capsule',
    tax_rate: '0.1400',
    image_url: null,
    lot_tracking_required: true,
    expiry_alert_days: 90,
    is_active: true,
    uoms: [
      {
        product_uom_id: 'c1d2e3f4-3333-4aaa-8a1b-111111110004',
        uom_code: 'capsule',
        display_name: 'Capsule (base)',
        conversion_to_base: '1.000000',
        sale_unit_price: '28.0000',
        is_base: true,
        is_sellable: true,
        is_purchasable: false,
        is_active: true,
      },
      {
        product_uom_id: 'c1d2e3f4-3333-4aaa-8a1b-111111110005',
        uom_code: 'pack',
        display_name: 'Pack of 3',
        conversion_to_base: '3.000000',
        sale_unit_price: '84.0000',
        is_base: false,
        is_sellable: true,
        is_purchasable: true,
        is_active: true,
      },
    ],
    created_at: '2025-09-10T11:00:00Z',
    updated_at: '2026-09-15T14:20:00Z',
  },
  {
    product_id: 'f9a0b1c2-7777-4bbb-9f6a-789012345def',
    category_id: 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbe',
    sku: 'VIT-CEN-ADU-TAB',
    barcode: '6221048005678',
    name: 'Centrum Adults Multivitamin',
    generic_name: 'Multivitamin & Minerals',
    brand_name: 'Centrum',
    base_uom_code: 'tablet',
    tax_rate: '0.1400',
    image_url: null,
    lot_tracking_required: false,
    expiry_alert_days: 45,
    is_active: true,
    uoms: [
      {
        product_uom_id: 'c1d2e3f4-4444-4aaa-8a1b-111111110006',
        uom_code: 'tablet',
        display_name: 'Tablet (base)',
        conversion_to_base: '1.000000',
        sale_unit_price: null,
        is_base: true,
        is_sellable: false,
        is_purchasable: false,
        is_active: true,
      },
      {
        product_uom_id: 'c1d2e3f4-4444-4aaa-8a1b-111111110007',
        uom_code: 'bottle60',
        display_name: 'Bottle of 60',
        conversion_to_base: '60.000000',
        sale_unit_price: '420.0000',
        is_base: false,
        is_sellable: true,
        is_purchasable: true,
        is_active: true,
      },
      {
        product_uom_id: 'c1d2e3f4-4444-4aaa-8a1b-111111110008',
        uom_code: 'bottle30',
        display_name: 'Legacy Bottle of 30',
        conversion_to_base: '30.000000',
        sale_unit_price: '220.0000',
        is_base: false,
        is_sellable: true,
        is_purchasable: false,
        is_active: false,
      },
    ],
    created_at: '2025-10-01T09:00:00Z',
    updated_at: '2026-08-22T16:10:00Z',
  },
  {
    product_id: 'a0b1c2d3-8888-4ccc-8a7b-890123456ef0',
    category_id: 'c9d8e7f6-4444-4d55-8e66-cbccddeeffbf',
    sku: 'DIS-ASP-075-TAB',
    barcode: null,
    name: 'Legacy Aspirin 75mg Tablets',
    generic_name: 'Acetylsalicylic Acid 75mg',
    brand_name: 'PharmaLegacy',
    base_uom_code: 'tablet',
    tax_rate: '0.0000',
    image_url: null,
    lot_tracking_required: false,
    expiry_alert_days: 0,
    is_active: false,
    uoms: [
      {
        product_uom_id: 'c1d2e3f4-5555-4aaa-8a1b-111111110009',
        uom_code: 'tablet',
        display_name: 'Tablet (base)',
        conversion_to_base: '1.000000',
        sale_unit_price: '0.7500',
        is_base: true,
        is_sellable: true,
        is_purchasable: false,
        is_active: true,
      },
    ],
    created_at: '2025-07-20T09:00:00Z',
    updated_at: '2026-01-10T12:00:00Z',
  },
];

export const INITIAL_REORDER_RULES: readonly ReorderRuleDto[] = [
  {
    reorder_rule_id: 'r1111111-1111-4111-8111-111111111101',
    product_id: productFixture.product_id,
    branch_id: inventoryBalanceFixture.branch_id,
    reorder_point_base: '200.0000',
    reorder_quantity_base: '500.0000',
    max_quantity_base: '1200.0000',
    is_active: true,
  },
];

function cloneCategory(category: ProductCategoryDto): ProductCategoryDto {
  return { ...category };
}

function cloneUom(uom: ProductUomDto): ProductUomDto {
  return { ...uom };
}

function cloneProduct(product: ProductDto): ProductDto {
  return {
    ...product,
    uoms: product.uoms.map(cloneUom),
  };
}

function cloneReorderRule(rule: ReorderRuleDto): ReorderRuleDto {
  return { ...rule };
}

function reorderRuleKey(branchId: string, productId: string): string {
  return `${branchId}:${productId}`;
}

function createInitialReorderMap(): Map<string, ReorderRuleDto> {
  return new Map(
    INITIAL_REORDER_RULES.map((rule) => [
      reorderRuleKey(rule.branch_id, rule.product_id),
      cloneReorderRule(rule),
    ])
  );
}

let mockCategories: ProductCategoryDto[] =
  INITIAL_CATEGORIES.map(cloneCategory);
let mockProducts: ProductDto[] = INITIAL_PRODUCTS.map(cloneProduct);
let mockReorderRules = createInitialReorderMap();
let idCounter = 0;

export function resetMockCatalog(): void {
  mockCategories = INITIAL_CATEGORIES.map(cloneCategory);
  mockProducts = INITIAL_PRODUCTS.map(cloneProduct);
  mockReorderRules = createInitialReorderMap();
  idCounter = 0;
}

function createMockUuid(): string {
  idCounter += 1;
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `ca000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function padValidatedDecimal(raw: string, decimals: number): string {
  const [rawInt = '0', rawFrac = ''] = raw.trim().split('.');
  const normInt = rawInt.replace(/^0+(?=\d)/, '') || '0';
  return `${normInt}.${rawFrac.padEnd(decimals, '0')}`;
}

function compareDecimalStrings(a: string, b: string): number {
  const [rawIntA = '0', rawFracA = ''] = a.trim().split('.');
  const [rawIntB = '0', rawFracB = ''] = b.trim().split('.');
  const intA = rawIntA.replace(/^0+(?=\d)/, '') || '0';
  const intB = rawIntB.replace(/^0+(?=\d)/, '') || '0';
  if (intA.length !== intB.length) {
    return intA.length < intB.length ? -1 : 1;
  }
  if (intA !== intB) {
    return intA < intB ? -1 : 1;
  }
  const fracA = rawFracA.replace(/0+$/, '');
  const fracB = rawFracB.replace(/0+$/, '');
  const maxLen = Math.max(fracA.length, fracB.length);
  const paddedA = fracA.padEnd(maxLen, '0');
  const paddedB = fracB.padEnd(maxLen, '0');
  if (paddedA === paddedB) {
    return 0;
  }
  return paddedA < paddedB ? -1 : 1;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function malformedRequestResponse(message: string) {
  return HttpResponse.json(
    {
      error: {
        code: 'MALFORMED_REQUEST',
        message,
        trace_id: 'mock-trace-catalog-malformed',
      },
    },
    { status: 400 }
  );
}

function notFoundResponse(message: string) {
  return HttpResponse.json(
    {
      error: {
        code: 'NOT_FOUND',
        message,
        trace_id: 'mock-trace-catalog-not-found',
      },
    },
    { status: 404 }
  );
}

function validationErrorResponse(message: string, details: ValidationDetail[]) {
  return HttpResponse.json(
    {
      error: {
        code: 'VALIDATION_ERROR',
        message,
        trace_id: 'mock-trace-catalog-validation',
        details,
      },
    },
    { status: 422 }
  );
}

function conflictResponse(message: string, details: ValidationDetail[] = []) {
  return HttpResponse.json(
    {
      error: {
        code: 'CONFLICT',
        message,
        trace_id: 'mock-trace-catalog-conflict',
        ...(details.length > 0 ? { details } : {}),
      },
    },
    { status: 409 }
  );
}

function parsePaginationParams(url: URL): { start: number; limit: number } {
  const rawLimit = Number(url.searchParams.get('limit') ?? '50');
  const parsedLimit = Math.floor(rawLimit);
  const limit =
    Number.isFinite(rawLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 200)
      : 50;
  const rawCursor = Number(url.searchParams.get('cursor') ?? '0');
  const parsedCursor = Math.floor(rawCursor);
  const start =
    Number.isFinite(rawCursor) && parsedCursor >= 0 ? parsedCursor : 0;

  return { start, limit };
}

function validateNullableOptionalString(
  rawValue: unknown,
  field: string,
  maxLength: number,
  label: string,
  details: ValidationDetail[]
): string | null {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }
  if (typeof rawValue !== 'string') {
    details.push({ field, issue: `${label} must be a string or null.` });
    return null;
  }
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    details.push({
      field,
      issue: `${label} must be at most ${maxLength} characters.`,
    });
    return null;
  }
  return trimmed;
}

function getCategoryDescendants(
  rootId: string,
  categories: readonly ProductCategoryDto[]
): Set<string> {
  const descendants = new Set<string>();
  const visited = new Set<string>([rootId]);
  const queue: string[] = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }
    for (const candidate of categories) {
      if (
        candidate.parent_category_id === currentId &&
        !visited.has(candidate.category_id)
      ) {
        visited.add(candidate.category_id);
        descendants.add(candidate.category_id);
        queue.push(candidate.category_id);
      }
    }
  }

  return descendants;
}

interface ParsedUomInput {
  uom_code: string;
  display_name: string;
  conversion_to_base: string;
  sale_unit_price: string | null;
  is_base: boolean;
  is_sellable: boolean;
  is_purchasable: boolean;
}

function parseUomInput(
  raw: unknown,
  prefix: string,
  details: ValidationDetail[]
): ParsedUomInput | null {
  if (!isRecord(raw)) {
    details.push({
      field: prefix || 'uom_code',
      issue: 'UOM entry must be a JSON object.',
    });
    return null;
  }

  const uomCodeField = prefix ? `${prefix}.uom_code` : 'uom_code';
  const displayNameField = prefix ? `${prefix}.display_name` : 'display_name';
  const conversionField = prefix
    ? `${prefix}.conversion_to_base`
    : 'conversion_to_base';
  const priceField = prefix ? `${prefix}.sale_unit_price` : 'sale_unit_price';
  const isBaseField = prefix ? `${prefix}.is_base` : 'is_base';
  const isSellableField = prefix ? `${prefix}.is_sellable` : 'is_sellable';
  const isPurchasableField = prefix
    ? `${prefix}.is_purchasable`
    : 'is_purchasable';

  const uomCode = readTrimmedString(raw.uom_code);
  const displayName = readTrimmedString(raw.display_name);
  const conversionRaw = readTrimmedString(raw.conversion_to_base);

  if (!uomCode) {
    details.push({ field: uomCodeField, issue: 'UOM code is required.' });
  } else if (uomCode.length > 20) {
    details.push({
      field: uomCodeField,
      issue: 'UOM code must be at most 20 characters.',
    });
  }

  if (!displayName) {
    details.push({
      field: displayNameField,
      issue: 'Display name is required.',
    });
  } else if (displayName.length > 50) {
    details.push({
      field: displayNameField,
      issue: 'Display name must be at most 50 characters.',
    });
  }

  if (!conversionRaw || !POSITIVE_NUMERIC_6_PATTERN.test(conversionRaw)) {
    details.push({
      field: conversionField,
      issue: 'Conversion factor must be a positive 6-decimal number.',
    });
  }

  let isBase = false;
  if (raw.is_base !== undefined) {
    if (typeof raw.is_base !== 'boolean') {
      details.push({ field: isBaseField, issue: 'is_base must be a boolean.' });
    } else {
      isBase = raw.is_base;
    }
  }

  let isSellable = false;
  if (raw.is_sellable !== undefined) {
    if (typeof raw.is_sellable !== 'boolean') {
      details.push({
        field: isSellableField,
        issue: 'is_sellable must be a boolean.',
      });
    } else {
      isSellable = raw.is_sellable;
    }
  }

  let isPurchasable = false;
  if (raw.is_purchasable !== undefined) {
    if (typeof raw.is_purchasable !== 'boolean') {
      details.push({
        field: isPurchasableField,
        issue: 'is_purchasable must be a boolean.',
      });
    } else {
      isPurchasable = raw.is_purchasable;
    }
  }

  if (
    isBase &&
    POSITIVE_NUMERIC_6_PATTERN.test(conversionRaw) &&
    padValidatedDecimal(conversionRaw, 6) !== '1.000000'
  ) {
    details.push({
      field: conversionField,
      issue: 'Base UOM conversion factor must equal 1.',
    });
  }

  let saleUnitPrice: string | null = null;
  if (isSellable) {
    if (
      raw.sale_unit_price !== undefined &&
      raw.sale_unit_price !== null &&
      typeof raw.sale_unit_price !== 'string'
    ) {
      details.push({
        field: priceField,
        issue: 'Sale unit price must be a non-negative 4-decimal number.',
      });
    } else {
      const rawPrice =
        typeof raw.sale_unit_price === 'string'
          ? raw.sale_unit_price.trim()
          : '';
      if (!rawPrice) {
        details.push({
          field: priceField,
          issue: 'Sale unit price is required when UOM is sellable.',
        });
      } else if (!NON_NEGATIVE_NUMERIC_4_PATTERN.test(rawPrice)) {
        details.push({
          field: priceField,
          issue: 'Sale unit price must be a non-negative 4-decimal number.',
        });
      } else {
        saleUnitPrice = padValidatedDecimal(rawPrice, 4);
      }
    }
  } else if (
    raw.sale_unit_price !== undefined &&
    raw.sale_unit_price !== null
  ) {
    if (typeof raw.sale_unit_price !== 'string') {
      details.push({
        field: priceField,
        issue:
          'Sale unit price must be a non-negative 4-decimal string or null.',
      });
    } else {
      const rawPrice = raw.sale_unit_price.trim();
      if (rawPrice && !NON_NEGATIVE_NUMERIC_4_PATTERN.test(rawPrice)) {
        details.push({
          field: priceField,
          issue: 'Sale unit price must be a non-negative 4-decimal number.',
        });
      }
    }
  }

  if (details.length > 0) {
    return null;
  }

  return {
    uom_code: uomCode,
    display_name: displayName,
    conversion_to_base: padValidatedDecimal(conversionRaw, 6),
    sale_unit_price: saleUnitPrice,
    is_base: isBase,
    is_sellable: isSellable,
    is_purchasable: isPurchasable,
  };
}

export const productHandlers = [
  // =========================================================================
  // PRODUCT CATEGORIES
  // =========================================================================
  http.get('*/api/v1/product-categories', ({ request }) => {
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get('includeInactive') === 'true';
    const { start, limit } = parsePaginationParams(url);

    const filtered = includeInactive
      ? mockCategories
      : mockCategories.filter((category) => category.is_active);
    const items = filtered.slice(start, start + limit).map(cloneCategory);
    const nextOffset = start + limit;
    const nextCursor = nextOffset < filtered.length ? String(nextOffset) : null;

    return HttpResponse.json({ items, nextCursor }, { status: 200 });
  }),

  http.get('*/api/v1/product-categories/:categoryId', ({ params }) => {
    const category = mockCategories.find(
      (item) => item.category_id === params.categoryId
    );
    if (!category) {
      return notFoundResponse('Product category was not found.');
    }
    return HttpResponse.json(cloneCategory(category), { status: 200 });
  }),

  http.post('*/api/v1/product-categories', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return malformedRequestResponse(
        'Request body must be a valid JSON object.'
      );
    }

    const details: ValidationDetail[] = [];
    const code = readTrimmedString(body.code);
    const name = readTrimmedString(body.name);
    const description = validateNullableOptionalString(
      body.description,
      'description',
      250,
      'Description',
      details
    );

    let parentCategoryId: string | null = null;
    if (
      body.parent_category_id !== undefined &&
      body.parent_category_id !== null
    ) {
      if (typeof body.parent_category_id !== 'string') {
        details.push({
          field: 'parent_category_id',
          issue: 'Parent category ID must be a string or null.',
        });
      } else {
        const trimmedParent = body.parent_category_id.trim();
        parentCategoryId = trimmedParent.length > 0 ? trimmedParent : null;
      }
    }

    if (!code) {
      details.push({ field: 'code', issue: 'Category code is required.' });
    } else if (code.length > 30) {
      details.push({
        field: 'code',
        issue: 'Category code must be at most 30 characters.',
      });
    }

    if (!name) {
      details.push({ field: 'name', issue: 'Category name is required.' });
    } else if (name.length > 100) {
      details.push({
        field: 'name',
        issue: 'Category name must be at most 100 characters.',
      });
    }

    if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
      details.push({
        field: 'is_active',
        issue: 'Active status must be a boolean.',
      });
    }

    if (details.length > 0) {
      return validationErrorResponse('Invalid category details.', details);
    }

    const normalizedCode = code.toUpperCase();
    const duplicate = mockCategories.some(
      (item) => item.code.trim().toUpperCase() === normalizedCode
    );
    if (duplicate) {
      return conflictResponse(
        `Category code "${code}" already exists in this organization.`,
        [{ field: 'code', issue: 'Category code must be unique.' }]
      );
    }

    const now = new Date().toISOString();
    const created: ProductCategoryDto = {
      category_id: createMockUuid(),
      parent_category_id: parentCategoryId,
      code,
      name,
      description,
      is_active: typeof body.is_active === 'boolean' ? body.is_active : true,
      created_at: now,
      updated_at: now,
    };

    mockCategories = [created, ...mockCategories];
    return HttpResponse.json(cloneCategory(created), { status: 201 });
  }),

  http.patch(
    '*/api/v1/product-categories/:categoryId',
    async ({ params, request }) => {
      const index = mockCategories.findIndex(
        (item) => item.category_id === params.categoryId
      );
      if (index === -1) {
        return notFoundResponse('Product category was not found.');
      }

      const current = mockCategories[index];
      if (!current) {
        return notFoundResponse('Product category was not found.');
      }

      const body: unknown = await request.json().catch(() => null);
      if (!isRecord(body)) {
        return malformedRequestResponse('Malformed category patch payload.');
      }

      const details: ValidationDetail[] = [];

      let nextCode = current.code;
      if ('code' in body) {
        const candidate = readTrimmedString(body.code);
        if (!candidate) {
          details.push({ field: 'code', issue: 'Category code is required.' });
        } else if (candidate.length > 30) {
          details.push({
            field: 'code',
            issue: 'Category code must be at most 30 characters.',
          });
        } else {
          nextCode = candidate;
        }
      }

      let nextName = current.name;
      if ('name' in body) {
        const candidate = readTrimmedString(body.name);
        if (!candidate) {
          details.push({ field: 'name', issue: 'Category name is required.' });
        } else if (candidate.length > 100) {
          details.push({
            field: 'name',
            issue: 'Category name must be at most 100 characters.',
          });
        } else {
          nextName = candidate;
        }
      }

      const nextDescription =
        'description' in body
          ? validateNullableOptionalString(
              body.description,
              'description',
              250,
              'Description',
              details
            )
          : (current.description ?? null);

      let nextParentId = current.parent_category_id ?? null;
      if ('parent_category_id' in body) {
        if (body.parent_category_id === null) {
          nextParentId = null;
        } else if (typeof body.parent_category_id !== 'string') {
          details.push({
            field: 'parent_category_id',
            issue: 'Parent category ID must be a string or null.',
          });
        } else {
          const candidate = body.parent_category_id.trim();
          if (candidate.length === 0) {
            nextParentId = null;
          } else if (candidate === current.category_id) {
            details.push({
              field: 'parent_category_id',
              issue: 'Category cannot be its own parent.',
            });
          } else {
            const descendants = getCategoryDescendants(
              current.category_id,
              mockCategories
            );
            if (descendants.has(candidate)) {
              details.push({
                field: 'parent_category_id',
                issue:
                  'Parent category cannot be a descendant of this category.',
              });
            } else {
              nextParentId = candidate;
            }
          }
        }
      }

      let nextIsActive = current.is_active;
      if ('is_active' in body) {
        if (typeof body.is_active !== 'boolean') {
          details.push({
            field: 'is_active',
            issue: 'Active status must be a boolean.',
          });
        } else {
          nextIsActive = body.is_active;
        }
      }

      if (details.length > 0) {
        return validationErrorResponse(
          'Invalid category update details.',
          details
        );
      }

      const duplicate = mockCategories.some(
        (item) =>
          item.category_id !== current.category_id &&
          item.code.trim().toUpperCase() === nextCode.toUpperCase()
      );
      if (duplicate) {
        return conflictResponse(
          `Category code "${nextCode}" already exists in this organization.`,
          [{ field: 'code', issue: 'Category code must be unique.' }]
        );
      }

      const updated: ProductCategoryDto = {
        ...current,
        parent_category_id: nextParentId,
        code: nextCode,
        name: nextName,
        description: nextDescription,
        is_active: nextIsActive,
        updated_at: new Date().toISOString(),
      };

      mockCategories = mockCategories.map((item, idx) =>
        idx === index ? updated : item
      );
      return HttpResponse.json(cloneCategory(updated), { status: 200 });
    }
  ),

  // =========================================================================
  // PRODUCTS
  // =========================================================================
  http.get('*/api/v1/products', ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';
    const categoryId = url.searchParams.get('categoryId')?.trim() ?? '';
    const includeInactive = url.searchParams.get('includeInactive') === 'true';
    const { start, limit } = parsePaginationParams(url);

    const filtered = mockProducts.filter((product) => {
      if (!includeInactive && !product.is_active) {
        return false;
      }
      if (categoryId && product.category_id !== categoryId) {
        return false;
      }
      if (search) {
        const matchesName = product.name.toLowerCase().includes(search);
        const matchesSku = product.sku.toLowerCase().includes(search);
        const matchesBarcode = (product.barcode ?? '')
          .toLowerCase()
          .includes(search);
        if (!matchesName && !matchesSku && !matchesBarcode) {
          return false;
        }
      }
      return true;
    });

    const items = filtered.slice(start, start + limit).map(cloneProduct);
    const nextOffset = start + limit;
    const nextCursor = nextOffset < filtered.length ? String(nextOffset) : null;

    return HttpResponse.json({ items, nextCursor }, { status: 200 });
  }),

  http.get('*/api/v1/products/:productId', ({ params }) => {
    const product = mockProducts.find(
      (item) => item.product_id === params.productId
    );
    if (!product) {
      return notFoundResponse('Product was not found.');
    }
    return HttpResponse.json(cloneProduct(product), { status: 200 });
  }),

  http.post('*/api/v1/products', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return malformedRequestResponse(
        'Request body must be a valid JSON object.'
      );
    }

    const details: ValidationDetail[] = [];

    const categoryId = readTrimmedString(body.category_id);
    const sku = readTrimmedString(body.sku);
    const name = readTrimmedString(body.name);
    const baseUomCode = readTrimmedString(body.base_uom_code);

    if (!categoryId) {
      details.push({ field: 'category_id', issue: 'Category is required.' });
    }
    if (!sku) {
      details.push({ field: 'sku', issue: 'SKU is required.' });
    } else if (sku.length > 40) {
      details.push({
        field: 'sku',
        issue: 'SKU must be at most 40 characters.',
      });
    }
    if (!name) {
      details.push({ field: 'name', issue: 'Product name is required.' });
    } else if (name.length > 180) {
      details.push({
        field: 'name',
        issue: 'Product name must be at most 180 characters.',
      });
    }
    if (!baseUomCode) {
      details.push({
        field: 'base_uom_code',
        issue: 'Base UOM code is required.',
      });
    } else if (baseUomCode.length > 20) {
      details.push({
        field: 'base_uom_code',
        issue: 'Base UOM code must be at most 20 characters.',
      });
    }

    const barcode = validateNullableOptionalString(
      body.barcode,
      'barcode',
      80,
      'Barcode',
      details
    );
    const genericName = validateNullableOptionalString(
      body.generic_name,
      'generic_name',
      180,
      'Generic name',
      details
    );
    const brandName = validateNullableOptionalString(
      body.brand_name,
      'brand_name',
      180,
      'Brand name',
      details
    );
    const imageUrl = validateNullableOptionalString(
      body.image_url,
      'image_url',
      300,
      'Image URL',
      details
    );
    if (imageUrl && !isValidHttpUrl(imageUrl)) {
      details.push({
        field: 'image_url',
        issue: 'Image URL must be a valid http or https URL.',
      });
    }

    let taxRate = '0.0000';
    if (body.tax_rate !== undefined) {
      const candidate = readTrimmedString(body.tax_rate);
      if (!candidate || !TAX_RATE_PATTERN.test(candidate)) {
        details.push({
          field: 'tax_rate',
          issue: 'Tax rate must be a fractional value between 0 and 1.',
        });
      } else {
        taxRate = padValidatedDecimal(candidate, 4);
      }
    }

    let lotTrackingRequired = false;
    if (body.lot_tracking_required !== undefined) {
      if (typeof body.lot_tracking_required !== 'boolean') {
        details.push({
          field: 'lot_tracking_required',
          issue: 'Lot tracking flag must be a boolean.',
        });
      } else {
        lotTrackingRequired = body.lot_tracking_required;
      }
    }

    let expiryAlertDays = 0;
    if (body.expiry_alert_days !== undefined) {
      if (
        typeof body.expiry_alert_days !== 'number' ||
        !Number.isInteger(body.expiry_alert_days) ||
        body.expiry_alert_days < 0 ||
        body.expiry_alert_days > 3650
      ) {
        details.push({
          field: 'expiry_alert_days',
          issue: 'Expiry alert days must be an integer between 0 and 3650.',
        });
      } else {
        expiryAlertDays = body.expiry_alert_days;
      }
    }

    const parsedUoms: ProductUomDto[] = [];
    if (!Array.isArray(body.uoms) || body.uoms.length === 0) {
      details.push({
        field: 'uoms[0].uom_code',
        issue: 'At least one base UOM is required.',
      });
    } else {
      const rawUoms: readonly unknown[] = body.uoms;
      const seenCodes = new Set<string>();
      let baseCount = 0;

      for (let i = 0; i < rawUoms.length; i += 1) {
        const uomDetails: ValidationDetail[] = [];
        const parsed = parseUomInput(rawUoms[i], `uoms[${i}]`, uomDetails);
        if (uomDetails.length > 0 || !parsed) {
          details.push(...uomDetails);
          continue;
        }

        const normalizedUomCode = parsed.uom_code.toLowerCase();
        if (seenCodes.has(normalizedUomCode)) {
          details.push({
            field: `uoms[${i}].uom_code`,
            issue: 'Duplicate UOM code in product request.',
          });
          continue;
        }
        seenCodes.add(normalizedUomCode);

        if (parsed.is_base) {
          baseCount += 1;
          if (baseUomCode && parsed.uom_code !== baseUomCode) {
            details.push({
              field: `uoms[${i}].uom_code`,
              issue: 'Base UOM code must match base_uom_code.',
            });
          }
        }

        parsedUoms.push({
          product_uom_id: createMockUuid(),
          uom_code: parsed.uom_code,
          display_name: parsed.display_name,
          conversion_to_base: parsed.conversion_to_base,
          sale_unit_price: parsed.sale_unit_price,
          is_base: parsed.is_base,
          is_sellable: parsed.is_sellable,
          is_purchasable: parsed.is_purchasable,
          is_active: true,
        });
      }

      if (baseCount !== 1 && parsedUoms.length === rawUoms.length) {
        details.push({
          field: 'uoms[0].uom_code',
          issue: 'Product must include exactly one base UOM.',
        });
      }
    }

    if (details.length > 0) {
      return validationErrorResponse('Invalid product details.', details);
    }

    const normalizedSku = sku.toUpperCase();
    if (
      mockProducts.some(
        (item) => item.sku.trim().toUpperCase() === normalizedSku
      )
    ) {
      return conflictResponse(`SKU "${sku}" already exists.`, [
        { field: 'sku', issue: 'SKU must be unique.' },
      ]);
    }

    if (barcode) {
      const normalizedBarcode = barcode.toUpperCase();
      if (
        mockProducts.some(
          (item) =>
            item.barcode !== null &&
            item.barcode !== undefined &&
            item.barcode.trim().toUpperCase() === normalizedBarcode
        )
      ) {
        return conflictResponse(`Barcode "${barcode}" already exists.`, [
          { field: 'barcode', issue: 'Barcode must be unique.' },
        ]);
      }
    }

    const now = new Date().toISOString();
    const created: ProductDto = {
      product_id: createMockUuid(),
      category_id: categoryId,
      sku,
      barcode,
      name,
      generic_name: genericName,
      brand_name: brandName,
      base_uom_code: baseUomCode,
      tax_rate: taxRate,
      image_url: imageUrl,
      lot_tracking_required: lotTrackingRequired,
      expiry_alert_days: expiryAlertDays,
      is_active: true,
      uoms: parsedUoms,
      created_at: now,
      updated_at: now,
    };

    mockProducts = [created, ...mockProducts];
    return HttpResponse.json(cloneProduct(created), { status: 201 });
  }),

  http.patch('*/api/v1/products/:productId', async ({ params, request }) => {
    const index = mockProducts.findIndex(
      (item) => item.product_id === params.productId
    );
    if (index === -1) {
      return notFoundResponse('Product was not found.');
    }

    const current = mockProducts[index];
    if (!current) {
      return notFoundResponse('Product was not found.');
    }

    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) {
      return malformedRequestResponse('Malformed product patch payload.');
    }

    const details: ValidationDetail[] = [];

    let nextCategoryId = current.category_id;
    if ('category_id' in body) {
      const candidate = readTrimmedString(body.category_id);
      if (!candidate) {
        details.push({ field: 'category_id', issue: 'Category is required.' });
      } else {
        nextCategoryId = candidate;
      }
    }

    let nextName = current.name;
    if ('name' in body) {
      const candidate = readTrimmedString(body.name);
      if (!candidate) {
        details.push({ field: 'name', issue: 'Product name is required.' });
      } else if (candidate.length > 180) {
        details.push({
          field: 'name',
          issue: 'Product name must be at most 180 characters.',
        });
      } else {
        nextName = candidate;
      }
    }

    const nextBarcode =
      'barcode' in body
        ? validateNullableOptionalString(
            body.barcode,
            'barcode',
            80,
            'Barcode',
            details
          )
        : (current.barcode ?? null);
    const nextGenericName =
      'generic_name' in body
        ? validateNullableOptionalString(
            body.generic_name,
            'generic_name',
            180,
            'Generic name',
            details
          )
        : (current.generic_name ?? null);
    const nextBrandName =
      'brand_name' in body
        ? validateNullableOptionalString(
            body.brand_name,
            'brand_name',
            180,
            'Brand name',
            details
          )
        : (current.brand_name ?? null);
    const nextImageUrl =
      'image_url' in body
        ? validateNullableOptionalString(
            body.image_url,
            'image_url',
            300,
            'Image URL',
            details
          )
        : (current.image_url ?? null);

    if ('image_url' in body && nextImageUrl && !isValidHttpUrl(nextImageUrl)) {
      details.push({
        field: 'image_url',
        issue: 'Image URL must be a valid http or https URL.',
      });
    }

    let nextTaxRate = current.tax_rate;
    if ('tax_rate' in body) {
      const candidate = readTrimmedString(body.tax_rate);
      if (!candidate || !TAX_RATE_PATTERN.test(candidate)) {
        details.push({
          field: 'tax_rate',
          issue: 'Tax rate must be a fractional value between 0 and 1.',
        });
      } else {
        nextTaxRate = padValidatedDecimal(candidate, 4);
      }
    }

    let nextLotTracking = current.lot_tracking_required;
    if ('lot_tracking_required' in body) {
      if (typeof body.lot_tracking_required !== 'boolean') {
        details.push({
          field: 'lot_tracking_required',
          issue: 'Lot tracking flag must be a boolean.',
        });
      } else {
        nextLotTracking = body.lot_tracking_required;
      }
    }

    let nextExpiryAlertDays = current.expiry_alert_days;
    if ('expiry_alert_days' in body) {
      if (
        typeof body.expiry_alert_days !== 'number' ||
        !Number.isInteger(body.expiry_alert_days) ||
        body.expiry_alert_days < 0 ||
        body.expiry_alert_days > 3650
      ) {
        details.push({
          field: 'expiry_alert_days',
          issue: 'Expiry alert days must be an integer between 0 and 3650.',
        });
      } else {
        nextExpiryAlertDays = body.expiry_alert_days;
      }
    }

    let nextIsActive = current.is_active;
    if ('is_active' in body) {
      if (typeof body.is_active !== 'boolean') {
        details.push({
          field: 'is_active',
          issue: 'Active status must be a boolean.',
        });
      } else {
        nextIsActive = body.is_active;
      }
    }

    if (details.length > 0) {
      return validationErrorResponse(
        'Invalid product update details.',
        details
      );
    }

    if (
      LOCKED_HISTORY_PRODUCT_IDS.has(current.product_id) &&
      nextLotTracking !== current.lot_tracking_required
    ) {
      return conflictResponse(
        'Lot tracking setting cannot be changed while stock or posted ledger history exists.',
        [
          {
            field: 'lot_tracking_required',
            issue:
              'Cannot change lot tracking while stock or posted ledger history exists.',
          },
        ]
      );
    }

    if (nextBarcode) {
      const normalizedBarcode = nextBarcode.toUpperCase();
      const duplicateBarcode = mockProducts.some(
        (item) =>
          item.product_id !== current.product_id &&
          item.barcode !== null &&
          item.barcode !== undefined &&
          item.barcode.trim().toUpperCase() === normalizedBarcode
      );
      if (duplicateBarcode) {
        return conflictResponse(`Barcode "${nextBarcode}" already exists.`, [
          { field: 'barcode', issue: 'Barcode must be unique.' },
        ]);
      }
    }

    const updated: ProductDto = {
      ...current,
      category_id: nextCategoryId,
      barcode: nextBarcode,
      name: nextName,
      generic_name: nextGenericName,
      brand_name: nextBrandName,
      tax_rate: nextTaxRate,
      image_url: nextImageUrl,
      lot_tracking_required: nextLotTracking,
      expiry_alert_days: nextExpiryAlertDays,
      is_active: nextIsActive,
      updated_at: new Date().toISOString(),
    };

    mockProducts = mockProducts.map((item, idx) =>
      idx === index ? updated : item
    );
    return HttpResponse.json(cloneProduct(updated), { status: 200 });
  }),

  // =========================================================================
  // PRODUCT UOMS
  // =========================================================================
  http.get('*/api/v1/products/:productId/uoms', ({ params }) => {
    const product = mockProducts.find(
      (item) => item.product_id === params.productId
    );
    if (!product) {
      return notFoundResponse('Product was not found.');
    }
    return HttpResponse.json(product.uoms.map(cloneUom), { status: 200 });
  }),

  http.post(
    '*/api/v1/products/:productId/uoms',
    async ({ params, request }) => {
      const productIndex = mockProducts.findIndex(
        (item) => item.product_id === params.productId
      );
      if (productIndex === -1) {
        return notFoundResponse('Product was not found.');
      }

      const product = mockProducts[productIndex];
      if (!product) {
        return notFoundResponse('Product was not found.');
      }

      const body: unknown = await request.json().catch(() => null);
      if (!isRecord(body)) {
        return malformedRequestResponse(
          'Request body must be a valid JSON object.'
        );
      }

      const details: ValidationDetail[] = [];
      const parsed = parseUomInput(body, '', details);
      if (details.length > 0 || !parsed) {
        return validationErrorResponse('Invalid UOM details.', details);
      }

      const duplicateCode = product.uoms.some(
        (uom) =>
          uom.uom_code.trim().toLowerCase() === parsed.uom_code.toLowerCase()
      );
      if (duplicateCode) {
        return conflictResponse(
          `UOM code "${parsed.uom_code}" already exists for this product.`,
          [{ field: 'uom_code', issue: 'UOM code must be unique per product.' }]
        );
      }

      if (parsed.is_base && product.uoms.some((uom) => uom.is_base)) {
        return conflictResponse('Product already has an active base UOM.', [
          { field: 'is_base', issue: 'Only one base UOM is permitted.' },
        ]);
      }

      const created: ProductUomDto = {
        product_uom_id: createMockUuid(),
        uom_code: parsed.uom_code,
        display_name: parsed.display_name,
        conversion_to_base: parsed.conversion_to_base,
        sale_unit_price: parsed.sale_unit_price,
        is_base: parsed.is_base,
        is_sellable: parsed.is_sellable,
        is_purchasable: parsed.is_purchasable,
        is_active: true,
      };

      const updatedProduct: ProductDto = {
        ...product,
        uoms: [...product.uoms, created],
        updated_at: new Date().toISOString(),
      };

      mockProducts = mockProducts.map((item, idx) =>
        idx === productIndex ? updatedProduct : item
      );
      return HttpResponse.json(cloneUom(created), { status: 201 });
    }
  ),

  http.patch(
    '*/api/v1/products/:productId/uoms/:uomId',
    async ({ params, request }) => {
      const productIndex = mockProducts.findIndex(
        (item) => item.product_id === params.productId
      );
      if (productIndex === -1) {
        return notFoundResponse('Product was not found.');
      }

      const product = mockProducts[productIndex];
      if (!product) {
        return notFoundResponse('Product was not found.');
      }

      const uomIndex = product.uoms.findIndex(
        (item) => item.product_uom_id === params.uomId
      );
      if (uomIndex === -1) {
        return notFoundResponse('Product UOM was not found.');
      }

      const currentUom = product.uoms[uomIndex];
      if (!currentUom) {
        return notFoundResponse('Product UOM was not found.');
      }

      const body: unknown = await request.json().catch(() => null);
      if (!isRecord(body)) {
        return malformedRequestResponse('Malformed UOM patch payload.');
      }

      if (
        LOCKED_HISTORY_PRODUCT_IDS.has(product.product_id) &&
        (('conversion_to_base' in body &&
          body.conversion_to_base !== currentUom.conversion_to_base) ||
          ('is_base' in body && body.is_base !== currentUom.is_base))
      ) {
        return conflictResponse(
          'Conversion factor and base UOM status are immutable once stock or posted document history exists.'
        );
      }

      if (body.is_active === false && currentUom.is_base) {
        return conflictResponse('Base UOM cannot be deactivated.', [
          {
            field: 'is_active',
            issue: 'The product base UOM must remain active.',
          },
        ]);
      }

      const details: ValidationDetail[] = [];

      let nextDisplayName = currentUom.display_name;
      if ('display_name' in body) {
        const candidate = readTrimmedString(body.display_name);
        if (!candidate) {
          details.push({
            field: 'display_name',
            issue: 'Display name is required.',
          });
        } else if (candidate.length > 50) {
          details.push({
            field: 'display_name',
            issue: 'Display name must be at most 50 characters.',
          });
        } else {
          nextDisplayName = candidate;
        }
      }

      let nextIsSellable = currentUom.is_sellable;
      if ('is_sellable' in body) {
        if (typeof body.is_sellable !== 'boolean') {
          details.push({
            field: 'is_sellable',
            issue: 'is_sellable must be a boolean.',
          });
        } else {
          nextIsSellable = body.is_sellable;
        }
      }

      let nextIsPurchasable = currentUom.is_purchasable;
      if ('is_purchasable' in body) {
        if (typeof body.is_purchasable !== 'boolean') {
          details.push({
            field: 'is_purchasable',
            issue: 'is_purchasable must be a boolean.',
          });
        } else {
          nextIsPurchasable = body.is_purchasable;
        }
      }

      let nextIsActive = currentUom.is_active;
      if ('is_active' in body) {
        if (typeof body.is_active !== 'boolean') {
          details.push({
            field: 'is_active',
            issue: 'is_active must be a boolean.',
          });
        } else {
          nextIsActive = body.is_active;
        }
      }

      let nextSaleUnitPrice = currentUom.sale_unit_price ?? null;
      if ('sale_unit_price' in body) {
        if (
          body.sale_unit_price === null ||
          body.sale_unit_price === undefined
        ) {
          if (nextIsSellable) {
            details.push({
              field: 'sale_unit_price',
              issue: 'Sale unit price is required when UOM is sellable.',
            });
          } else {
            nextSaleUnitPrice = null;
          }
        } else if (typeof body.sale_unit_price !== 'string') {
          details.push({
            field: 'sale_unit_price',
            issue:
              'Sale unit price must be a non-negative 4-decimal string or null.',
          });
        } else {
          const rawPrice = body.sale_unit_price.trim();
          if (!rawPrice) {
            if (nextIsSellable) {
              details.push({
                field: 'sale_unit_price',
                issue: 'Sale unit price is required when UOM is sellable.',
              });
            } else {
              nextSaleUnitPrice = null;
            }
          } else if (!NON_NEGATIVE_NUMERIC_4_PATTERN.test(rawPrice)) {
            details.push({
              field: 'sale_unit_price',
              issue: 'Sale unit price must be a non-negative 4-decimal number.',
            });
          } else {
            nextSaleUnitPrice = nextIsSellable
              ? padValidatedDecimal(rawPrice, 4)
              : null;
          }
        }
      } else if (nextIsSellable && !nextSaleUnitPrice) {
        details.push({
          field: 'sale_unit_price',
          issue: 'Sale unit price is required when UOM is sellable.',
        });
      } else if (!nextIsSellable) {
        nextSaleUnitPrice = null;
      }

      if (details.length > 0) {
        return validationErrorResponse('Invalid UOM update details.', details);
      }

      const updatedUom: ProductUomDto = {
        ...currentUom,
        display_name: nextDisplayName,
        sale_unit_price: nextSaleUnitPrice,
        is_sellable: nextIsSellable,
        is_purchasable: nextIsPurchasable,
        is_active: nextIsActive,
      };

      const updatedProduct: ProductDto = {
        ...product,
        uoms: product.uoms.map((item, idx) =>
          idx === uomIndex ? updatedUom : item
        ),
        updated_at: new Date().toISOString(),
      };

      mockProducts = mockProducts.map((item, idx) =>
        idx === productIndex ? updatedProduct : item
      );
      return HttpResponse.json(cloneUom(updatedUom), { status: 200 });
    }
  ),

  // =========================================================================
  // REORDER RULES
  // =========================================================================
  http.get(
    '*/api/v1/branches/:branchId/products/:productId/reorder-rule',
    ({ params }) => {
      const branchId = String(params.branchId ?? '').trim();
      const productId = String(params.productId ?? '').trim();

      const product = mockProducts.find(
        (item) => item.product_id === productId
      );
      if (!product) {
        return notFoundResponse('Product was not found.');
      }

      const rule = mockReorderRules.get(reorderRuleKey(branchId, productId));
      return HttpResponse.json(
        { rule: rule ? cloneReorderRule(rule) : null },
        { status: 200 }
      );
    }
  ),

  http.put(
    '*/api/v1/branches/:branchId/products/:productId/reorder-rule',
    async ({ params, request }) => {
      const branchId = String(params.branchId ?? '').trim();
      const productId = String(params.productId ?? '').trim();

      const product = mockProducts.find(
        (item) => item.product_id === productId
      );
      if (!product) {
        return notFoundResponse('Product was not found.');
      }

      const body: unknown = await request.json().catch(() => null);
      if (!isRecord(body)) {
        return malformedRequestResponse(
          'Request body must be a valid JSON object.'
        );
      }

      const details: ValidationDetail[] = [];

      const rawPoint = readTrimmedString(body.reorder_point_base);
      const rawQty = readTrimmedString(body.reorder_quantity_base);

      let validPoint = false;
      if (!rawPoint || !NON_NEGATIVE_NUMERIC_4_PATTERN.test(rawPoint)) {
        details.push({
          field: 'reorder_point_base',
          issue: 'Reorder point must be a non-negative 4-decimal number.',
        });
      } else {
        validPoint = true;
      }

      if (!rawQty || !POSITIVE_NUMERIC_4_PATTERN.test(rawQty)) {
        details.push({
          field: 'reorder_quantity_base',
          issue: 'Reorder quantity must be a positive 4-decimal number.',
        });
      }

      let maxQuantityBase: string | null = null;
      if (
        body.max_quantity_base !== undefined &&
        body.max_quantity_base !== null
      ) {
        if (typeof body.max_quantity_base !== 'string') {
          details.push({
            field: 'max_quantity_base',
            issue: 'Maximum quantity must be a decimal string or null.',
          });
        } else {
          const rawMax = body.max_quantity_base.trim();
          if (rawMax.length > 0) {
            if (!NON_NEGATIVE_NUMERIC_4_PATTERN.test(rawMax)) {
              details.push({
                field: 'max_quantity_base',
                issue:
                  'Maximum stock quantity must be a non-negative 4-decimal number.',
              });
            } else if (
              validPoint &&
              compareDecimalStrings(rawMax, rawPoint) < 0
            ) {
              details.push({
                field: 'max_quantity_base',
                issue:
                  'Maximum stock quantity must be greater than or equal to reorder point.',
              });
            } else {
              maxQuantityBase = padValidatedDecimal(rawMax, 4);
            }
          }
        }
      }

      let isActive = true;
      if (body.is_active !== undefined) {
        if (typeof body.is_active !== 'boolean') {
          details.push({
            field: 'is_active',
            issue: 'is_active must be a boolean.',
          });
        } else {
          isActive = body.is_active;
        }
      }

      if (details.length > 0) {
        return validationErrorResponse(
          'Invalid reorder rule details.',
          details
        );
      }

      const key = reorderRuleKey(branchId, productId);
      const existing = mockReorderRules.get(key);
      const saved: ReorderRuleDto = {
        reorder_rule_id: existing?.reorder_rule_id ?? createMockUuid(),
        product_id: productId,
        branch_id: branchId,
        reorder_point_base: padValidatedDecimal(rawPoint, 4),
        reorder_quantity_base: padValidatedDecimal(rawQty, 4),
        max_quantity_base: maxQuantityBase,
        is_active: isActive,
      };

      mockReorderRules.set(key, saved);
      return HttpResponse.json(cloneReorderRule(saved), { status: 200 });
    }
  ),
];
