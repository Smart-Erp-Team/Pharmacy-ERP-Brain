import { z } from 'zod';
import type {
  ProductCategoryDto,
  ProductCategoryPatchRequest,
  ProductCategoryRequest,
} from '../../../types/api';

export interface CategoryTreeNode {
  category: ProductCategoryDto;
  children: CategoryTreeNode[];
  depth: number;
}

export interface BuildCategoryTreeOptions {
  includeInactive?: boolean;
}

function compareCategories(
  a: ProductCategoryDto,
  b: ProductCategoryDto
): number {
  const nameDiff = a.name.localeCompare(b.name, undefined, {
    sensitivity: 'base',
  });
  if (nameDiff !== 0) {
    return nameDiff;
  }
  const exactNameDiff = a.name.localeCompare(b.name);
  if (exactNameDiff !== 0) {
    return exactNameDiff;
  }
  const codeDiff = a.code.localeCompare(b.code, undefined, {
    sensitivity: 'base',
  });
  if (codeDiff !== 0) {
    return codeDiff;
  }
  return a.category_id.localeCompare(b.category_id);
}

/**
 * Returns all descendant category IDs of `categoryId`, using a visited set to
 * stay cycle-safe on malformed parent references.
 */
export function getDescendantCategoryIds(
  categoryId: string,
  categories: readonly ProductCategoryDto[]
): Set<string> {
  const normalizedRootId = categoryId.trim();
  const descendants = new Set<string>();
  if (!normalizedRootId) {
    return descendants;
  }

  const childrenByParent = new Map<string, string[]>();
  for (const category of categories) {
    const categoryIdNormalized = category.category_id.trim();
    const parentId = category.parent_category_id?.trim() ?? '';
    if (!categoryIdNormalized || !parentId) {
      continue;
    }
    const existing = childrenByParent.get(parentId);
    if (existing) {
      existing.push(categoryIdNormalized);
    } else {
      childrenByParent.set(parentId, [categoryIdNormalized]);
    }
  }

  const visited = new Set<string>([normalizedRootId]);
  const queue: string[] = [normalizedRootId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }
    const children = childrenByParent.get(currentId);
    if (!children) {
      continue;
    }
    for (const childId of children) {
      if (visited.has(childId)) {
        continue;
      }
      visited.add(childId);
      descendants.add(childId);
      queue.push(childId);
    }
  }

  return descendants;
}

/**
 * Returns categories eligible to act as parent for `editingCategoryId`
 * (excluding the category itself and all of its descendants).
 */
export function getEligibleParentCategories(
  editingCategoryId: string | null | undefined,
  categories: readonly ProductCategoryDto[]
): ProductCategoryDto[] {
  const normalizedEditingId = editingCategoryId?.trim() ?? '';
  if (!normalizedEditingId) {
    return [...categories].sort(compareCategories);
  }

  const excludedIds = getDescendantCategoryIds(normalizedEditingId, categories);
  excludedIds.add(normalizedEditingId);

  return categories
    .filter((category) => !excludedIds.has(category.category_id))
    .sort(compareCategories);
}

/**
 * Builds a deterministically sorted category tree. Categories whose parent is
 * missing or filtered out (for example, an inactive parent when
 * `includeInactive` is false) are gracefully promoted to root nodes.
 */
export function buildCategoryTree(
  categories: readonly ProductCategoryDto[],
  options: BuildCategoryTreeOptions = {}
): CategoryTreeNode[] {
  const includeInactive = options.includeInactive ?? false;
  const dedupedById = new Map<string, ProductCategoryDto>();
  for (const category of categories) {
    if (!includeInactive && !category.is_active) {
      continue;
    }
    if (!dedupedById.has(category.category_id)) {
      dedupedById.set(category.category_id, category);
    }
  }
  const visible = Array.from(dedupedById.values()).sort(compareCategories);

  const visibleById = new Map<string, ProductCategoryDto>();
  for (const category of visible) {
    visibleById.set(category.category_id, category);
  }

  const childrenByParent = new Map<string, ProductCategoryDto[]>();
  const roots: ProductCategoryDto[] = [];

  for (const category of visible) {
    const parentId = category.parent_category_id;
    const hasVisibleParent =
      typeof parentId === 'string' &&
      parentId.length > 0 &&
      parentId !== category.category_id &&
      visibleById.has(parentId);

    if (!hasVisibleParent || typeof parentId !== 'string') {
      roots.push(category);
      continue;
    }

    const siblings = childrenByParent.get(parentId);
    if (siblings) {
      siblings.push(category);
    } else {
      childrenByParent.set(parentId, [category]);
    }
  }

  const visited = new Set<string>();

  const buildNode = (
    category: ProductCategoryDto,
    depth: number
  ): CategoryTreeNode => {
    visited.add(category.category_id);
    const childCategories = (childrenByParent.get(category.category_id) ?? [])
      .slice()
      .sort(compareCategories);

    const children: CategoryTreeNode[] = [];
    for (const child of childCategories) {
      if (visited.has(child.category_id)) {
        continue;
      }
      children.push(buildNode(child, depth + 1));
    }

    return {
      category,
      children,
      depth,
    };
  };

  const tree: CategoryTreeNode[] = [];
  for (const root of roots) {
    if (visited.has(root.category_id)) {
      continue;
    }
    tree.push(buildNode(root, 0));
  }

  // Promote any remaining nodes belonging to disconnected cycles so nothing is lost.
  for (const category of visible) {
    if (!visited.has(category.category_id)) {
      tree.push(buildNode(category, 0));
    }
  }

  tree.sort((a, b) => compareCategories(a.category, b.category));

  return tree;
}

const baseCategoryFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Category code is required')
    .max(30, 'Category code must be at most 30 characters'),
  name: z
    .string()
    .trim()
    .min(1, 'Category name is required')
    .max(100, 'Category name must be at most 100 characters'),
  description: z
    .string()
    .trim()
    .max(250, 'Description must be at most 250 characters'),
  parent_category_id: z.string().trim(),
  is_active: z.boolean(),
});

export type CategoryFormValues = z.infer<typeof baseCategoryFormSchema>;

export function createCategoryFormSchema(
  editingCategoryId: string | null | undefined = null,
  categories: readonly ProductCategoryDto[] = []
) {
  const normalizedEditingId = editingCategoryId?.trim() ?? '';

  return baseCategoryFormSchema.superRefine((values, ctx) => {
    if (!normalizedEditingId) {
      return;
    }
    const parentId = values.parent_category_id.trim();
    if (!parentId) {
      return;
    }
    if (parentId === normalizedEditingId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parent_category_id'],
        message: 'Category cannot be its own parent',
      });
      return;
    }
    const descendants = getDescendantCategoryIds(
      normalizedEditingId,
      categories
    );
    if (descendants.has(parentId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parent_category_id'],
        message: 'Parent category cannot be a descendant of this category',
      });
    }
  });
}

export const categoryFormSchema = createCategoryFormSchema(null, []);

export const DEFAULT_CATEGORY_FORM_VALUES: CategoryFormValues = {
  code: '',
  name: '',
  description: '',
  parent_category_id: '',
  is_active: true,
};

export function categoryDtoToFormValues(
  category: ProductCategoryDto
): CategoryFormValues {
  return {
    code: category.code,
    name: category.name,
    description: category.description ?? '',
    parent_category_id: category.parent_category_id ?? '',
    is_active: category.is_active,
  };
}

function normalizeOptionalString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toCategoryCreatePayload(
  values: CategoryFormValues
): ProductCategoryRequest {
  return {
    parent_category_id: normalizeOptionalString(values.parent_category_id),
    code: values.code.trim(),
    name: values.name.trim(),
    description: normalizeOptionalString(values.description),
    is_active: values.is_active,
  };
}

export function toCategoryPatchPayload(
  values: CategoryFormValues
): ProductCategoryPatchRequest {
  return {
    parent_category_id: normalizeOptionalString(values.parent_category_id),
    code: values.code.trim(),
    name: values.name.trim(),
    description: normalizeOptionalString(values.description),
    is_active: values.is_active,
  };
}
