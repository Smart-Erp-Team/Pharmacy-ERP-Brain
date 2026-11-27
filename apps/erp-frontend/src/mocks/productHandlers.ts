import { http, HttpResponse } from 'msw';
import inventoryBalanceFixture from '@contracts/fixtures/inventory-balance.json';
import productFixture from '@contracts/fixtures/product.json';
import { normalizeProduct } from '../lib/api/catalogInventoryNormalizers';
import { IDEMPOTENCY_KEY_MAX_LENGTH } from '../lib/api/idempotency';
import { isPlainRecord } from '../lib/api/normalizers';
import type {
  ErrorCode,
  NormalizedApiErrorDetail,
  NormalizedApiErrorEnvelope,
  PagedResult,
  Product,
  ProductCategory,
  ProductUom,
  ReorderRule,
} from '../types/api';
import { MOCK_BRANCH_IDS } from './branchHandlers';

export const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111101';

export { MOCK_BRANCH_IDS };

export const MOCK_CATEGORY_IDS = {
  ANTIBIOTICS: '11111111-5555-4111-8111-000000000001',
  PENICILLINS: '11111111-5555-4111-8111-000000000002',
  ANALGESICS: '11111111-5555-4111-8111-000000000003',
  VITAMINS: '11111111-5555-4111-8111-000000000004',
  ARCHIVED: '11111111-5555-4111-8111-000000000005',
} as const;

export const MOCK_PRODUCT_IDS = {
  AUGMENTIN_1G: '6dbdb1a7-c723-da4c-8e0e-b067c18bc710',
  PANADOL_EXTRA: '11111111-6666-4111-8111-000000000002',
  VITAMIN_D3: '11111111-6666-4111-8111-000000000003',
  DISCONTINUED_SYRUP: '11111111-6666-4111-8111-000000000004',
} as const;

export const MOCK_PRODUCT_UOM_IDS = {
  AUGMENTIN_TAB: '9d28eb00-b850-564b-a237-ea00d077d047',
  AUGMENTIN_STRIP: 'b554caea-c8f3-f349-902e-8bc2049041bd',
  AUGMENTIN_BOX: 'db06a376-50a7-224c-b9c5-4f342c45debb',
  PANADOL_TAB: '11111111-7777-4111-8111-000000000001',
  PANADOL_BOX: '11111111-7777-4111-8111-000000000002',
  VITAMIN_D3_BOTTLE: '11111111-7777-4111-8111-000000000003',
  DISCONTINUED_BOTTLE: '11111111-7777-4111-8111-000000000004',
} as const;

export const LOCKED_HISTORY_PRODUCT_IDS: ReadonlySet<string> = new Set([
  inventoryBalanceFixture.product_id,
]);

export const INITIAL_CATEGORIES: readonly ProductCategory[] = [
  {
    category_id: MOCK_CATEGORY_IDS.ANTIBIOTICS,
    organization_id: ORGANIZATION_ID,
    parent_category_id: null,
    code: 'CAT-ANT',
    name: 'Antibiotics',
    description: 'Systemic and topical antibacterial medications',
    is_active: true,
    created_at: '2026-01-15T08:00:00+00:00',
    updated_at: '2026-11-25T10:00:00+00:00',
  },
  {
    category_id: MOCK_CATEGORY_IDS.PENICILLINS,
    organization_id: ORGANIZATION_ID,
    parent_category_id: MOCK_CATEGORY_IDS.ANTIBIOTICS,
    code: 'CAT-ANT-PEN',
    name: 'Penicillins',
    description: 'Beta-lactam penicillin combinations',
    is_active: true,
    created_at: '2026-01-15T08:02:00+00:00',
    updated_at: '2026-11-25T10:00:00+00:00',
  },
  {
    category_id: MOCK_CATEGORY_IDS.ANALGESICS,
    organization_id: ORGANIZATION_ID,
    parent_category_id: null,
    code: 'CAT-ANA',
    name: 'Analgesics',
    description: 'Pain relief and antipyretic medications',
    is_active: true,
    created_at: '2026-01-15T08:03:00+00:00',
    updated_at: '2026-11-25T10:00:00+00:00',
  },
  {
    category_id: MOCK_CATEGORY_IDS.VITAMINS,
    organization_id: ORGANIZATION_ID,
    parent_category_id: null,
    code: 'CAT-VIT',
    name: 'Vitamins & Supplements',
    description: 'Daily vitamins, minerals, and nutritional support',
    is_active: true,
    created_at: '2026-01-15T08:04:00+00:00',
    updated_at: '2026-11-25T10:00:00+00:00',
  },
  {
    category_id: MOCK_CATEGORY_IDS.ARCHIVED,
    organization_id: ORGANIZATION_ID,
    parent_category_id: null,
    code: 'CAT-ARCH',
    name: 'Archived Catalog',
    description: 'Discontinued and archived OTC items',
    is_active: false,
    created_at: '2026-01-10T08:00:00+00:00',
    updated_at: '2026-11-25T10:00:00+00:00',
  },
];

const VERBATIM_AUGMENTIN_PRODUCT: Product = normalizeProduct(
  productFixture,
  '@contracts/fixtures/product.json'
);

export const INITIAL_PRODUCTS: readonly Product[] = [
  VERBATIM_AUGMENTIN_PRODUCT,
  {
    product_id: MOCK_PRODUCT_IDS.PANADOL_EXTRA,
    organization_id: ORGANIZATION_ID,
    category_id: MOCK_CATEGORY_IDS.ANALGESICS,
    sku: 'MED-PAN-500',
    barcode: '6221001000026',
    name: 'Panadol Extra 500mg',
    generic_name: 'Paracetamol 500mg + Caffeine 65mg',
    brand_name: 'Haleon',
    base_uom_code: 'TAB',
    tax_rate: 0.05,
    image_url: null,
    lot_tracking_required: true,
    expiry_alert_days: 60,
    is_active: true,
    uoms: [
      {
        product_uom_id: MOCK_PRODUCT_UOM_IDS.PANADOL_TAB,
        product_id: MOCK_PRODUCT_IDS.PANADOL_EXTRA,
        uom_code: 'TAB',
        display_name: 'Tablet',
        conversion_to_base: 1,
        sale_unit_price: 2.5,
        is_base: true,
        is_sellable: true,
        is_purchasable: false,
        is_active: true,
        updated_at: '2026-11-25T10:00:00+00:00',
      },
      {
        product_uom_id: MOCK_PRODUCT_UOM_IDS.PANADOL_BOX,
        product_id: MOCK_PRODUCT_IDS.PANADOL_EXTRA,
        uom_code: 'BOX',
        display_name: 'Box of 24',
        conversion_to_base: 24,
        sale_unit_price: 55.0,
        is_base: false,
        is_sellable: true,
        is_purchasable: true,
        is_active: true,
        updated_at: '2026-11-25T10:00:00+00:00',
      },
    ],
    created_at: '2026-01-16T09:00:00+00:00',
    updated_at: '2026-11-25T10:00:00+00:00',
  },
  {
    product_id: MOCK_PRODUCT_IDS.VITAMIN_D3,
    organization_id: ORGANIZATION_ID,
    category_id: MOCK_CATEGORY_IDS.VITAMINS,
    sku: 'MED-VIT-D3',
    barcode: '6221001000033',
    name: 'Vitamin D3 5000 IU',
    generic_name: 'Cholecalciferol 5000 IU',
    brand_name: 'Now Foods',
    base_uom_code: 'BOTTLE',
    tax_rate: 0.14,
    image_url: null,
    lot_tracking_required: false,
    expiry_alert_days: 30,
    is_active: true,
    uoms: [
      {
        product_uom_id: MOCK_PRODUCT_UOM_IDS.VITAMIN_D3_BOTTLE,
        product_id: MOCK_PRODUCT_IDS.VITAMIN_D3,
        uom_code: 'BOTTLE',
        display_name: 'Bottle of 60 Softgels',
        conversion_to_base: 1,
        sale_unit_price: 120.0,
        is_base: true,
        is_sellable: true,
        is_purchasable: true,
        is_active: true,
        updated_at: '2026-11-25T10:00:00+00:00',
      },
    ],
    created_at: '2026-01-17T09:00:00+00:00',
    updated_at: '2026-11-25T10:00:00+00:00',
  },
  {
    product_id: MOCK_PRODUCT_IDS.DISCONTINUED_SYRUP,
    organization_id: ORGANIZATION_ID,
    category_id: MOCK_CATEGORY_IDS.ARCHIVED,
    sku: 'MED-OLD-01',
    barcode: null,
    name: 'Discontinued Cough Syrup',
    generic_name: 'Dextromethorphan HBr 15mg/5ml',
    brand_name: 'MedCare Legacy',
    base_uom_code: 'BOTTLE',
    tax_rate: 0.0,
    image_url: null,
    lot_tracking_required: false,
    expiry_alert_days: 0,
    is_active: false,
    uoms: [
      {
        product_uom_id: MOCK_PRODUCT_UOM_IDS.DISCONTINUED_BOTTLE,
        product_id: MOCK_PRODUCT_IDS.DISCONTINUED_SYRUP,
        uom_code: 'BOTTLE',
        display_name: 'Bottle 120ml',
        conversion_to_base: 1,
        sale_unit_price: 45.0,
        is_base: true,
        is_sellable: true,
        is_purchasable: false,
        is_active: true,
        updated_at: '2026-11-25T10:00:00+00:00',
      },
    ],
    created_at: '2026-01-10T09:00:00+00:00',
    updated_at: '2026-11-25T10:00:00+00:00',
  },
];

export const INITIAL_REORDER_RULES: readonly ReorderRule[] = [
  {
    reorder_rule_id: '11111111-8888-4111-8111-000000000001',
    organization_id: ORGANIZATION_ID,
    branch_id: MOCK_BRANCH_IDS.DOWNTOWN,
    product_id: MOCK_PRODUCT_IDS.AUGMENTIN_1G,
    reorder_point_base: 50,
    reorder_quantity_base: 200,
    max_quantity_base: 500,
    is_active: true,
    updated_at: '2026-11-25T10:00:00+00:00',
  },
];

function cloneCategory(category: ProductCategory): ProductCategory {
  return { ...category };
}

function cloneUom(uom: ProductUom): ProductUom {
  return { ...uom };
}

function cloneProduct(product: Product): Product {
  return {
    ...product,
    uoms: product.uoms.map(cloneUom),
  };
}

function cloneReorderRule(rule: ReorderRule): ReorderRule {
  return { ...rule };
}

function reorderRuleKey(branchId: string, productId: string): string {
  return `${branchId}:${productId}`;
}

function createInitialReorderMap(): Map<string, ReorderRule> {
  return new Map(
    INITIAL_REORDER_RULES.map((rule) => [
      reorderRuleKey(rule.branch_id, rule.product_id),
      cloneReorderRule(rule),
    ])
  );
}

let mockCategories: ProductCategory[] = INITIAL_CATEGORIES.map(cloneCategory);
let mockProducts: Product[] = INITIAL_PRODUCTS.map(cloneProduct);
let mockReorderRules = createInitialReorderMap();
let idCounter = 100;

export function resetMockCatalog(): void {
  mockCategories = INITIAL_CATEGORIES.map(cloneCategory);
  mockProducts = INITIAL_PRODUCTS.map(cloneProduct);
  mockReorderRules = createInitialReorderMap();
  idCounter = 100;
}

function createMockUuid(segment: string): string {
  idCounter += 1;
  return `11111111-${segment}-4111-8111-${String(idCounter).padStart(12, '0')}`;
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function createMockErrorEnvelope(
  code: ErrorCode,
  message: string,
  traceId: string,
  details: NormalizedApiErrorDetail[] = []
): NormalizedApiErrorEnvelope {
  return {
    error: {
      code,
      message,
      details,
      trace_id: traceId,
    },
  };
}

function malformedRequestResponse(
  message: string,
  details: NormalizedApiErrorDetail[] = []
) {
  return HttpResponse.json(
    createMockErrorEnvelope(
      'MALFORMED_REQUEST',
      message,
      'mock-trace-catalog-malformed',
      details
    ),
    { status: 400 }
  );
}

function notFoundResponse(message: string) {
  return HttpResponse.json(
    createMockErrorEnvelope(
      'NOT_FOUND',
      message,
      'mock-trace-catalog-not-found'
    ),
    { status: 404 }
  );
}

function validationErrorResponse(
  message: string,
  details: NormalizedApiErrorDetail[]
) {
  return HttpResponse.json(
    createMockErrorEnvelope(
      'VALIDATION_ERROR',
      message,
      'mock-trace-catalog-validation',
      details
    ),
    { status: 422 }
  );
}

function conflictResponse(
  message: string,
  details: NormalizedApiErrorDetail[] = []
) {
  return HttpResponse.json(
    createMockErrorEnvelope(
      'CONFLICT',
      message,
      'mock-trace-catalog-conflict',
      details
    ),
    { status: 409 }
  );
}

function validateIdempotencyKeyHeader(
  request: Request,
  body: Record<string, unknown>
): Response | null {
  const headerKey = request.headers.get('Idempotency-Key')?.trim() ?? '';
  const bodyKey =
    typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
  const effectiveKey = headerKey || bodyKey;

  if (!effectiveKey) {
    return malformedRequestResponse('The idempotency key is required.', [
      { field: 'Idempotency-Key', issue: 'The idempotency key is required.' },
    ]);
  }
  if (effectiveKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return validationErrorResponse('Invalid idempotency key.', [
      {
        field: 'idempotency_key',
        issue: `Idempotency key must be at most ${IDEMPOTENCY_KEY_MAX_LENGTH} characters.`,
      },
    ]);
  }
  return null;
}

function parsePositiveIntegerParam(raw: string | null, fallback: number) {
  if (raw === null) {
    return { valid: true as const, value: fallback };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { valid: false as const, value: fallback };
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    return { valid: false as const, value: fallback };
  }
  return { valid: true as const, value: parsed };
}

function paginateItems<TItem>(
  url: URL,
  filtered: readonly TItem[],
  cloneItem: (item: TItem) => TItem
):
  | { ok: true; payload: PagedResult<TItem> }
  | { ok: false; response: Response } {
  const pageResult = parsePositiveIntegerParam(url.searchParams.get('page'), 1);
  const pageSizeResult = parsePositiveIntegerParam(
    url.searchParams.get('page_size'),
    25
  );

  const details: NormalizedApiErrorDetail[] = [];
  if (!pageResult.valid || pageResult.value < 1) {
    details.push({
      field: 'page',
      issue: 'Page must be an integer greater than or equal to 1.',
    });
  }
  if (
    !pageSizeResult.valid ||
    pageSizeResult.value < 1 ||
    pageSizeResult.value > 200
  ) {
    details.push({
      field: 'page_size',
      issue: 'Page size must be an integer between 1 and 200.',
    });
  }

  if (details.length > 0) {
    return {
      ok: false,
      response: validationErrorResponse(
        'Invalid pagination parameters.',
        details
      ),
    };
  }

  const page = pageResult.value;
  const pageSize = pageSizeResult.value;
  const totalCount = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map(cloneItem);
  const nextCursor = page * pageSize < totalCount ? String(page + 1) : null;

  return {
    ok: true,
    payload: {
      items,
      page,
      page_size: pageSize,
      total_count: totalCount,
      next_cursor: nextCursor,
    },
  };
}

function validateNullableOptionalString(
  rawValue: unknown,
  field: string,
  maxLength: number,
  label: string,
  details: NormalizedApiErrorDetail[]
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
  categories: readonly ProductCategory[]
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
  conversion_to_base: number;
  sale_unit_price: number | null;
  is_base: boolean;
  is_sellable: boolean;
  is_purchasable: boolean;
}

function parseUomInput(
  raw: unknown,
  prefix: string,
  details: NormalizedApiErrorDetail[]
): ParsedUomInput | null {
  if (!isPlainRecord(raw)) {
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

  let conversionToBase = 0;
  if (!isFiniteNumber(raw.conversion_to_base) || raw.conversion_to_base <= 0) {
    details.push({
      field: conversionField,
      issue: 'Conversion factor must be a finite number greater than 0.',
    });
  } else {
    conversionToBase = raw.conversion_to_base;
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
    isFiniteNumber(raw.conversion_to_base) &&
    raw.conversion_to_base > 0 &&
    raw.conversion_to_base !== 1
  ) {
    details.push({
      field: conversionField,
      issue: 'Base UOM conversion factor must equal 1.',
    });
  }

  let saleUnitPrice: number | null = null;
  if (isSellable) {
    if (raw.sale_unit_price === undefined || raw.sale_unit_price === null) {
      details.push({
        field: priceField,
        issue: 'Sale unit price is required when UOM is sellable.',
      });
    } else if (
      !isFiniteNumber(raw.sale_unit_price) ||
      raw.sale_unit_price < 0
    ) {
      details.push({
        field: priceField,
        issue: 'Sale unit price must be a finite non-negative number.',
      });
    } else {
      saleUnitPrice = raw.sale_unit_price;
    }
  } else if (
    raw.sale_unit_price !== undefined &&
    raw.sale_unit_price !== null
  ) {
    if (!isFiniteNumber(raw.sale_unit_price) || raw.sale_unit_price < 0) {
      details.push({
        field: priceField,
        issue: 'Sale unit price must be a finite non-negative number or null.',
      });
    } else {
      saleUnitPrice = raw.sale_unit_price;
    }
  }

  if (details.length > 0) {
    return null;
  }

  return {
    uom_code: uomCode,
    display_name: displayName,
    conversion_to_base: conversionToBase,
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
    const includeInactive = url.searchParams.get('include_inactive') === 'true';
    const parentCategoryId =
      url.searchParams.get('parent_category_id')?.trim() ?? '';
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? '';

    const filtered = mockCategories.filter((category) => {
      if (!includeInactive && !category.is_active) {
        return false;
      }
      if (
        parentCategoryId &&
        category.parent_category_id !== parentCategoryId
      ) {
        return false;
      }
      if (search) {
        const matchesCode = category.code.toLowerCase().includes(search);
        const matchesName = category.name.toLowerCase().includes(search);
        const matchesDescription = (category.description ?? '')
          .toLowerCase()
          .includes(search);
        if (!matchesCode && !matchesName && !matchesDescription) {
          return false;
        }
      }
      return true;
    });

    const pageResult = paginateItems(url, filtered, cloneCategory);
    if (!pageResult.ok) {
      return pageResult.response;
    }
    return HttpResponse.json(pageResult.payload, { status: 200 });
  }),

  http.get('*/api/v1/product-categories/:categoryId', ({ params }) => {
    const categoryId =
      typeof params.categoryId === 'string' ? params.categoryId : '';
    const category = mockCategories.find(
      (item) => item.category_id === categoryId
    );
    if (!category) {
      return notFoundResponse('Product category was not found.');
    }
    return HttpResponse.json(cloneCategory(category), { status: 200 });
  }),

  http.post('*/api/v1/product-categories', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);
    if (!isPlainRecord(body)) {
      return malformedRequestResponse(
        'Request body must be a valid JSON object.'
      );
    }

    const idempotencyError = validateIdempotencyKeyHeader(request, body);
    if (idempotencyError) {
      return idempotencyError;
    }

    const details: NormalizedApiErrorDetail[] = [];
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
        if (trimmedParent.length > 0) {
          const parentExists = mockCategories.some(
            (item) => item.category_id === trimmedParent
          );
          if (!parentExists) {
            details.push({
              field: 'parent_category_id',
              issue: 'Parent category was not found.',
            });
          } else {
            parentCategoryId = trimmedParent;
          }
        }
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
    const created: ProductCategory = {
      category_id: createMockUuid('5555'),
      organization_id: ORGANIZATION_ID,
      parent_category_id: parentCategoryId,
      code,
      name,
      description,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    mockCategories = [created, ...mockCategories];
    return HttpResponse.json(cloneCategory(created), { status: 201 });
  }),

  http.patch(
    '*/api/v1/product-categories/:categoryId',
    async ({ params, request }) => {
      const categoryId =
        typeof params.categoryId === 'string' ? params.categoryId : '';
      const index = mockCategories.findIndex(
        (item) => item.category_id === categoryId
      );
      const current = index >= 0 ? mockCategories[index] : undefined;
      if (!current) {
        return notFoundResponse('Product category was not found.');
      }

      const body: unknown = await request.json().catch(() => null);
      if (!isPlainRecord(body)) {
        return malformedRequestResponse('Malformed category patch payload.');
      }

      const idempotencyError = validateIdempotencyKeyHeader(request, body);
      if (idempotencyError) {
        return idempotencyError;
      }

      const details: NormalizedApiErrorDetail[] = [];

      let nextName = current.name;
      if (body.name !== undefined && body.name !== null) {
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
          : current.description;

      let nextParentId = current.parent_category_id;
      if ('parent_category_id' in body) {
        if (
          body.parent_category_id === null ||
          body.parent_category_id === undefined
        ) {
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
            } else if (
              !mockCategories.some((item) => item.category_id === candidate)
            ) {
              details.push({
                field: 'parent_category_id',
                issue: 'Parent category was not found.',
              });
            } else {
              nextParentId = candidate;
            }
          }
        }
      }

      let nextIsActive = current.is_active;
      if (body.is_active !== undefined && body.is_active !== null) {
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

      const updated: ProductCategory = {
        ...current,
        parent_category_id: nextParentId,
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
    const categoryId = url.searchParams.get('category_id')?.trim() ?? '';
    const includeInactive = url.searchParams.get('include_inactive') === 'true';

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
        const matchesGeneric = (product.generic_name ?? '')
          .toLowerCase()
          .includes(search);
        const matchesBrand = (product.brand_name ?? '')
          .toLowerCase()
          .includes(search);
        if (
          !matchesName &&
          !matchesSku &&
          !matchesBarcode &&
          !matchesGeneric &&
          !matchesBrand
        ) {
          return false;
        }
      }
      return true;
    });

    const pageResult = paginateItems(url, filtered, cloneProduct);
    if (!pageResult.ok) {
      return pageResult.response;
    }
    return HttpResponse.json(pageResult.payload, { status: 200 });
  }),

  http.get('*/api/v1/products/:productId', ({ params }) => {
    const productId =
      typeof params.productId === 'string' ? params.productId : '';
    const product = mockProducts.find((item) => item.product_id === productId);
    if (!product) {
      return notFoundResponse('Product was not found.');
    }
    return HttpResponse.json(cloneProduct(product), { status: 200 });
  }),

  http.post('*/api/v1/products', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);
    if (!isPlainRecord(body)) {
      return malformedRequestResponse(
        'Request body must be a valid JSON object.'
      );
    }

    const idempotencyError = validateIdempotencyKeyHeader(request, body);
    if (idempotencyError) {
      return idempotencyError;
    }

    const details: NormalizedApiErrorDetail[] = [];

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

    let taxRate = 0;
    if (body.tax_rate !== undefined) {
      if (
        !isFiniteNumber(body.tax_rate) ||
        body.tax_rate < 0 ||
        body.tax_rate > 1
      ) {
        details.push({
          field: 'tax_rate',
          issue: 'Tax rate must be a finite number between 0 and 1.',
        });
      } else {
        taxRate = body.tax_rate;
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
        !isFiniteNumber(body.expiry_alert_days) ||
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

    const now = new Date().toISOString();
    const newProductId = createMockUuid('6666');
    const parsedUoms: ProductUom[] = [];

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
        const uomDetails: NormalizedApiErrorDetail[] = [];
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
          product_uom_id: createMockUuid('7777'),
          product_id: newProductId,
          uom_code: parsed.uom_code,
          display_name: parsed.display_name,
          conversion_to_base: parsed.conversion_to_base,
          sale_unit_price: parsed.sale_unit_price,
          is_base: parsed.is_base,
          is_sellable: parsed.is_sellable,
          is_purchasable: parsed.is_purchasable,
          is_active: true,
          updated_at: now,
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
            item.barcode.trim().toUpperCase() === normalizedBarcode
        )
      ) {
        return conflictResponse(`Barcode "${barcode}" already exists.`, [
          { field: 'barcode', issue: 'Barcode must be unique.' },
        ]);
      }
    }

    const created: Product = {
      product_id: newProductId,
      organization_id: ORGANIZATION_ID,
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
    const productId =
      typeof params.productId === 'string' ? params.productId : '';
    const index = mockProducts.findIndex(
      (item) => item.product_id === productId
    );
    const current = index >= 0 ? mockProducts[index] : undefined;
    if (!current) {
      return notFoundResponse('Product was not found.');
    }

    const body: unknown = await request.json().catch(() => null);
    if (!isPlainRecord(body)) {
      return malformedRequestResponse('Malformed product patch payload.');
    }

    const idempotencyError = validateIdempotencyKeyHeader(request, body);
    if (idempotencyError) {
      return idempotencyError;
    }

    const details: NormalizedApiErrorDetail[] = [];

    let nextCategoryId = current.category_id;
    if (body.category_id !== undefined && body.category_id !== null) {
      const candidate = readTrimmedString(body.category_id);
      if (!candidate) {
        details.push({ field: 'category_id', issue: 'Category is required.' });
      } else {
        nextCategoryId = candidate;
      }
    }

    let nextSku = current.sku;
    if (body.sku !== undefined && body.sku !== null) {
      const candidate = readTrimmedString(body.sku);
      if (!candidate) {
        details.push({ field: 'sku', issue: 'SKU is required.' });
      } else if (candidate.length > 40) {
        details.push({
          field: 'sku',
          issue: 'SKU must be at most 40 characters.',
        });
      } else {
        nextSku = candidate;
      }
    }

    let nextName = current.name;
    if (body.name !== undefined && body.name !== null) {
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

    let nextBaseUomCode = current.base_uom_code;
    if (body.base_uom_code !== undefined && body.base_uom_code !== null) {
      const candidate = readTrimmedString(body.base_uom_code);
      if (!candidate) {
        details.push({
          field: 'base_uom_code',
          issue: 'Base UOM code is required.',
        });
      } else if (candidate.length > 20) {
        details.push({
          field: 'base_uom_code',
          issue: 'Base UOM code must be at most 20 characters.',
        });
      } else {
        nextBaseUomCode = candidate;
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
        : current.barcode;
    const nextGenericName =
      'generic_name' in body
        ? validateNullableOptionalString(
            body.generic_name,
            'generic_name',
            180,
            'Generic name',
            details
          )
        : current.generic_name;
    const nextBrandName =
      'brand_name' in body
        ? validateNullableOptionalString(
            body.brand_name,
            'brand_name',
            180,
            'Brand name',
            details
          )
        : current.brand_name;
    const nextImageUrl =
      'image_url' in body
        ? validateNullableOptionalString(
            body.image_url,
            'image_url',
            300,
            'Image URL',
            details
          )
        : current.image_url;

    if ('image_url' in body && nextImageUrl && !isValidHttpUrl(nextImageUrl)) {
      details.push({
        field: 'image_url',
        issue: 'Image URL must be a valid http or https URL.',
      });
    }

    let nextTaxRate = current.tax_rate;
    if (body.tax_rate !== undefined && body.tax_rate !== null) {
      if (
        !isFiniteNumber(body.tax_rate) ||
        body.tax_rate < 0 ||
        body.tax_rate > 1
      ) {
        details.push({
          field: 'tax_rate',
          issue: 'Tax rate must be a finite number between 0 and 1.',
        });
      } else {
        nextTaxRate = body.tax_rate;
      }
    }

    let nextLotTracking = current.lot_tracking_required;
    if (
      body.lot_tracking_required !== undefined &&
      body.lot_tracking_required !== null
    ) {
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
    if (
      body.expiry_alert_days !== undefined &&
      body.expiry_alert_days !== null
    ) {
      if (
        !isFiniteNumber(body.expiry_alert_days) ||
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
    if (body.is_active !== undefined && body.is_active !== null) {
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

    if (LOCKED_HISTORY_PRODUCT_IDS.has(current.product_id)) {
      if (nextLotTracking !== current.lot_tracking_required) {
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
      if (nextBaseUomCode !== current.base_uom_code) {
        return conflictResponse(
          'Base UOM code cannot be changed while stock or posted ledger history exists.',
          [
            {
              field: 'base_uom_code',
              issue:
                'Cannot change base UOM code while stock or posted ledger history exists.',
            },
          ]
        );
      }
    }

    const normalizedNextSku = nextSku.toUpperCase();
    const duplicateSku = mockProducts.some(
      (item) =>
        item.product_id !== current.product_id &&
        item.sku.trim().toUpperCase() === normalizedNextSku
    );
    if (duplicateSku) {
      return conflictResponse(`SKU "${nextSku}" already exists.`, [
        { field: 'sku', issue: 'SKU must be unique.' },
      ]);
    }

    if (nextBarcode) {
      const normalizedBarcode = nextBarcode.toUpperCase();
      const duplicateBarcode = mockProducts.some(
        (item) =>
          item.product_id !== current.product_id &&
          item.barcode !== null &&
          item.barcode.trim().toUpperCase() === normalizedBarcode
      );
      if (duplicateBarcode) {
        return conflictResponse(`Barcode "${nextBarcode}" already exists.`, [
          { field: 'barcode', issue: 'Barcode must be unique.' },
        ]);
      }
    }

    const baseUomCodeChanged = nextBaseUomCode !== current.base_uom_code;
    if (baseUomCodeChanged) {
      const conflictingUom = current.uoms.some(
        (uom) =>
          !uom.is_base &&
          uom.uom_code.trim().toUpperCase() === nextBaseUomCode.toUpperCase()
      );
      if (conflictingUom) {
        return conflictResponse(
          `Base UOM code "${nextBaseUomCode}" conflicts with an existing non-base UOM.`,
          [
            {
              field: 'base_uom_code',
              issue: 'Base UOM code must not match an existing non-base UOM.',
            },
          ]
        );
      }
    }

    const now = new Date().toISOString();
    const nextUoms = baseUomCodeChanged
      ? current.uoms.map((uom) =>
          uom.is_base
            ? { ...uom, uom_code: nextBaseUomCode, updated_at: now }
            : uom
        )
      : current.uoms;

    const updated: Product = {
      ...current,
      category_id: nextCategoryId,
      sku: nextSku,
      barcode: nextBarcode,
      name: nextName,
      generic_name: nextGenericName,
      brand_name: nextBrandName,
      base_uom_code: nextBaseUomCode,
      tax_rate: nextTaxRate,
      image_url: nextImageUrl,
      lot_tracking_required: nextLotTracking,
      expiry_alert_days: nextExpiryAlertDays,
      is_active: nextIsActive,
      uoms: nextUoms,
      updated_at: now,
    };

    mockProducts = mockProducts.map((item, idx) =>
      idx === index ? updated : item
    );
    return HttpResponse.json(cloneProduct(updated), { status: 200 });
  }),

  // =========================================================================
  // PRODUCT UOMS
  // =========================================================================
  http.get('*/api/v1/products/:productId/uoms', ({ params, request }) => {
    const productId =
      typeof params.productId === 'string' ? params.productId : '';
    const product = mockProducts.find((item) => item.product_id === productId);
    if (!product) {
      return notFoundResponse('Product was not found.');
    }

    const url = new URL(request.url);
    const includeInactive = url.searchParams.get('include_inactive') === 'true';
    const visibleUoms = includeInactive
      ? product.uoms
      : product.uoms.filter((uom) => uom.is_active);

    return HttpResponse.json(visibleUoms.map(cloneUom), { status: 200 });
  }),

  http.post(
    '*/api/v1/products/:productId/uoms',
    async ({ params, request }) => {
      const productId =
        typeof params.productId === 'string' ? params.productId : '';
      const productIndex = mockProducts.findIndex(
        (item) => item.product_id === productId
      );
      const product =
        productIndex >= 0 ? mockProducts[productIndex] : undefined;
      if (!product) {
        return notFoundResponse('Product was not found.');
      }

      const body: unknown = await request.json().catch(() => null);
      if (!isPlainRecord(body)) {
        return malformedRequestResponse(
          'Request body must be a valid JSON object.'
        );
      }

      const idempotencyError = validateIdempotencyKeyHeader(request, body);
      if (idempotencyError) {
        return idempotencyError;
      }

      const details: NormalizedApiErrorDetail[] = [];
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

      const now = new Date().toISOString();
      const created: ProductUom = {
        product_uom_id: createMockUuid('7777'),
        product_id: product.product_id,
        uom_code: parsed.uom_code,
        display_name: parsed.display_name,
        conversion_to_base: parsed.conversion_to_base,
        sale_unit_price: parsed.sale_unit_price,
        is_base: parsed.is_base,
        is_sellable: parsed.is_sellable,
        is_purchasable: parsed.is_purchasable,
        is_active: true,
        updated_at: now,
      };

      const updatedProduct: Product = {
        ...product,
        uoms: [...product.uoms, created],
        updated_at: now,
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
      const productId =
        typeof params.productId === 'string' ? params.productId : '';
      const uomId = typeof params.uomId === 'string' ? params.uomId : '';
      const productIndex = mockProducts.findIndex(
        (item) => item.product_id === productId
      );
      const product =
        productIndex >= 0 ? mockProducts[productIndex] : undefined;
      if (!product) {
        return notFoundResponse('Product was not found.');
      }

      const uomIndex = product.uoms.findIndex(
        (item) => item.product_uom_id === uomId
      );
      const currentUom = uomIndex >= 0 ? product.uoms[uomIndex] : undefined;
      if (!currentUom) {
        return notFoundResponse('Product UOM was not found.');
      }

      const body: unknown = await request.json().catch(() => null);
      if (!isPlainRecord(body)) {
        return malformedRequestResponse('Malformed UOM patch payload.');
      }

      const idempotencyError = validateIdempotencyKeyHeader(request, body);
      if (idempotencyError) {
        return idempotencyError;
      }

      if (body.is_active === false && currentUom.is_base) {
        return conflictResponse('Base UOM cannot be deactivated.', [
          {
            field: 'is_active',
            issue: 'The product base UOM must remain active.',
          },
        ]);
      }

      const details: NormalizedApiErrorDetail[] = [];

      if (
        'is_base' in body &&
        body.is_base !== undefined &&
        body.is_base !== null
      ) {
        if (typeof body.is_base !== 'boolean') {
          details.push({
            field: 'is_base',
            issue: 'is_base must be a boolean.',
          });
        } else if (body.is_base !== currentUom.is_base) {
          return conflictResponse(
            'Base unit status cannot be changed on an existing UOM.',
            [
              {
                field: 'is_base',
                issue: 'Base unit status cannot be changed on an existing UOM.',
              },
            ]
          );
        }
      }

      let nextDisplayName = currentUom.display_name;
      if (body.display_name !== undefined && body.display_name !== null) {
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

      let nextConversion = currentUom.conversion_to_base;
      if (
        body.conversion_to_base !== undefined &&
        body.conversion_to_base !== null
      ) {
        if (
          !isFiniteNumber(body.conversion_to_base) ||
          body.conversion_to_base <= 0
        ) {
          details.push({
            field: 'conversion_to_base',
            issue: 'Conversion factor must be a finite number greater than 0.',
          });
        } else if (currentUom.is_base && body.conversion_to_base !== 1) {
          details.push({
            field: 'conversion_to_base',
            issue: 'Base UOM conversion factor must equal 1.',
          });
        } else {
          nextConversion = body.conversion_to_base;
        }
      }

      let nextIsSellable = currentUom.is_sellable;
      if (body.is_sellable !== undefined && body.is_sellable !== null) {
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
      if (body.is_purchasable !== undefined && body.is_purchasable !== null) {
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
      if (body.is_active !== undefined && body.is_active !== null) {
        if (typeof body.is_active !== 'boolean') {
          details.push({
            field: 'is_active',
            issue: 'is_active must be a boolean.',
          });
        } else {
          nextIsActive = body.is_active;
        }
      }

      let nextSaleUnitPrice = currentUom.sale_unit_price;
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
        } else if (
          !isFiniteNumber(body.sale_unit_price) ||
          body.sale_unit_price < 0
        ) {
          details.push({
            field: 'sale_unit_price',
            issue:
              'Sale unit price must be a finite non-negative number or null.',
          });
        } else {
          nextSaleUnitPrice = nextIsSellable ? body.sale_unit_price : null;
        }
      } else if (nextIsSellable && nextSaleUnitPrice === null) {
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

      if (
        LOCKED_HISTORY_PRODUCT_IDS.has(product.product_id) &&
        nextConversion !== currentUom.conversion_to_base
      ) {
        return conflictResponse(
          'Conversion factor is immutable once stock or posted document history exists.',
          [
            {
              field: 'conversion_to_base',
              issue:
                'Cannot change conversion factor while stock or posted ledger history exists.',
            },
          ]
        );
      }

      const now = new Date().toISOString();
      const updatedUom: ProductUom = {
        ...currentUom,
        display_name: nextDisplayName,
        conversion_to_base: nextConversion,
        sale_unit_price: nextSaleUnitPrice,
        is_sellable: nextIsSellable,
        is_purchasable: nextIsPurchasable,
        is_active: nextIsActive,
        updated_at: now,
      };

      const updatedProduct: Product = {
        ...product,
        uoms: product.uoms.map((item, idx) =>
          idx === uomIndex ? updatedUom : item
        ),
        updated_at: now,
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
      const branchId =
        typeof params.branchId === 'string' ? params.branchId.trim() : '';
      const productId =
        typeof params.productId === 'string' ? params.productId.trim() : '';

      const product = mockProducts.find(
        (item) => item.product_id === productId
      );
      if (!product) {
        return notFoundResponse('Product was not found.');
      }

      const rule = mockReorderRules.get(reorderRuleKey(branchId, productId));
      if (!rule) {
        return notFoundResponse(
          'Reorder rule was not found for this branch and product.'
        );
      }

      return HttpResponse.json(cloneReorderRule(rule), { status: 200 });
    }
  ),

  http.put(
    '*/api/v1/branches/:branchId/products/:productId/reorder-rule',
    async ({ params, request }) => {
      const branchId =
        typeof params.branchId === 'string' ? params.branchId.trim() : '';
      const productId =
        typeof params.productId === 'string' ? params.productId.trim() : '';

      const product = mockProducts.find(
        (item) => item.product_id === productId
      );
      if (!product) {
        return notFoundResponse('Product was not found.');
      }

      const body: unknown = await request.json().catch(() => null);
      if (!isPlainRecord(body)) {
        return malformedRequestResponse(
          'Request body must be a valid JSON object.'
        );
      }

      const idempotencyError = validateIdempotencyKeyHeader(request, body);
      if (idempotencyError) {
        return idempotencyError;
      }

      const details: NormalizedApiErrorDetail[] = [];

      let reorderPointBase = 0;
      let validPoint = false;
      if (
        !isFiniteNumber(body.reorder_point_base) ||
        body.reorder_point_base < 0
      ) {
        details.push({
          field: 'reorder_point_base',
          issue:
            'Reorder point must be a finite number greater than or equal to 0.',
        });
      } else {
        reorderPointBase = body.reorder_point_base;
        validPoint = true;
      }

      let reorderQuantityBase = 0;
      if (
        !isFiniteNumber(body.reorder_quantity_base) ||
        body.reorder_quantity_base <= 0
      ) {
        details.push({
          field: 'reorder_quantity_base',
          issue: 'Reorder quantity must be a finite number greater than 0.',
        });
      } else {
        reorderQuantityBase = body.reorder_quantity_base;
      }

      let maxQuantityBase: number | null = null;
      if (
        body.max_quantity_base !== undefined &&
        body.max_quantity_base !== null
      ) {
        if (
          !isFiniteNumber(body.max_quantity_base) ||
          body.max_quantity_base < 0
        ) {
          details.push({
            field: 'max_quantity_base',
            issue:
              'Maximum stock quantity must be a finite non-negative number or null.',
          });
        } else if (validPoint && body.max_quantity_base < reorderPointBase) {
          details.push({
            field: 'max_quantity_base',
            issue:
              'Maximum stock quantity must be greater than or equal to reorder point.',
          });
        } else {
          maxQuantityBase = body.max_quantity_base;
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
      const saved: ReorderRule = {
        reorder_rule_id: existing?.reorder_rule_id ?? createMockUuid('8888'),
        organization_id: ORGANIZATION_ID,
        branch_id: branchId,
        product_id: productId,
        reorder_point_base: reorderPointBase,
        reorder_quantity_base: reorderQuantityBase,
        max_quantity_base: maxQuantityBase,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };

      mockReorderRules.set(key, saved);
      return HttpResponse.json(cloneReorderRule(saved), { status: 200 });
    }
  ),
];
