import { useId, useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { useAuth } from '../../../hooks/useAuth';
import { ApiClientError } from '../../../lib/api/client';
import type { ProductCategoryDto, ProductDto } from '../../../types/api';
import {
  applyCategoryFormApiError,
  applyCreateProductFormApiError,
  applyEditProductFormApiError,
} from '../schemas/catalogErrorMapper';
import {
  buildCategoryTree,
  categoryDtoToFormValues,
  createCategoryFormSchema,
  DEFAULT_CATEGORY_FORM_VALUES,
  getEligibleParentCategories,
  toCategoryCreatePayload,
  toCategoryPatchPayload,
  type CategoryFormValues,
  type CategoryTreeNode,
} from '../schemas/categorySchema';
import {
  createProductFormSchema,
  DEFAULT_CREATE_PRODUCT_FORM_VALUES,
  editProductFormSchema,
  productDtoToEditFormValues,
  toCreateProductPayload,
  toProductPatchPayload,
  type CreateProductFormValues,
  type EditProductFormValues,
} from '../schemas/productSchema';
import {
  useCreateCategoryMutation,
  useCreateProductMutation,
  usePatchCategoryMutation,
  usePatchProductMutation,
} from './useCatalogMutations';
import {
  useAllProductCategoriesQuery,
  useProductsQuery,
} from './useCatalogQueries';

export const PRODUCTS_PAGE_SIZE = 20;

export const EDIT_PRODUCT_TEXT_FIELDS = [
  {
    name: 'name',
    label: 'Product name',
    placeholder: 'Panadol 500mg Tablets',
    maxLength: 180,
    type: 'text',
  },
  {
    name: 'barcode',
    label: 'Barcode (optional)',
    placeholder: '6221048001234',
    maxLength: 80,
    type: 'text',
  },
  {
    name: 'generic_name',
    label: 'Generic name (optional)',
    placeholder: 'Paracetamol 500mg',
    maxLength: 180,
    type: 'text',
  },
  {
    name: 'brand_name',
    label: 'Brand name (optional)',
    placeholder: 'Panadol',
    maxLength: 180,
    type: 'text',
  },
  {
    name: 'image_url',
    label: 'Product image URL (optional)',
    placeholder: 'https://cdn.pharmaplus.eg/products/item.jpg',
    maxLength: 300,
    type: 'url',
  },
  {
    name: 'tax_percent',
    label: 'Tax rate (%)',
    placeholder: '14',
    type: 'text',
    inputMode: 'decimal' as const,
    hint: 'Percentage 0–100 (stored as fractional 4dp, e.g. 14 → 0.1400)',
  },
  {
    name: 'expiry_alert_days',
    label: 'Expiry alert days',
    placeholder: '30',
    type: 'text',
    inputMode: 'numeric' as const,
    hint: 'Whole days between 0 and 3650',
  },
] as const;

export interface UseProductsPageStateOptions {
  pageSize?: number;
}

export interface CategoryModalState {
  open: boolean;
  category: ProductCategoryDto | null;
}

export interface ProductModalState {
  mode: 'create' | 'edit' | null;
  product: ProductDto | null;
}

export function useProductsPageState(
  options: UseProductsPageStateOptions = {}
) {
  const pageSize = options.pageSize ?? PRODUCTS_PAGE_SIZE;
  const { hasAnyRole, can, runtime } = useAuth();

  const canWriteCatalog =
    hasAnyRole(['Admin', 'Pharmacist']) &&
    can('inventory:write') &&
    runtime === 'Cloud';
  const isBranchLocal = runtime === 'BranchLocal';

  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);
  const [categoryModalState, setCategoryModalState] =
    useState<CategoryModalState>({
      open: false,
      category: null,
    });
  const [productModalState, setProductModalState] = useState<ProductModalState>(
    {
      mode: null,
      product: null,
    }
  );
  const [togglingProductIds, setTogglingProductIds] = useState<string[]>([]);
  const togglingIdsRef = useRef<Set<string>>(new Set());

  const categoriesQuery = useAllProductCategoriesQuery({
    includeInactive: true,
  });

  const normalizedSearch = searchTerm.trim();
  const productsQuery = useProductsQuery({
    cursor: cursorStack[pageIndex],
    limit: pageSize,
    search: normalizedSearch || undefined,
    categoryId: selectedCategoryId || undefined,
    includeInactive,
  });

  const patchProductMutation = usePatchProductMutation();

  const categories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data]
  );

  const products = useMemo(
    () => productsQuery.data?.items ?? [],
    [productsQuery.data?.items]
  );

  const categoryTree: readonly CategoryTreeNode[] = useMemo(
    () => buildCategoryTree(categories, { includeInactive }),
    [categories, includeInactive]
  );

  const categoryNameById: ReadonlyMap<string, string> = useMemo(() => {
    const map = new Map<string, string>();
    if (categoriesQuery.isError) {
      return map;
    }
    for (const category of categories) {
      map.set(category.category_id, category.name);
    }
    return map;
  }, [categories, categoriesQuery.isError]);

  const getCategoryName = (categoryId: string): string => {
    if (categoriesQuery.isError) {
      return 'Category unavailable';
    }
    if (categoriesQuery.isPending) {
      return 'Loading category...';
    }
    return categoryNameById.get(categoryId) ?? 'Category unavailable';
  };

  const resetPagination = () => {
    setCursorStack([undefined]);
    setPageIndex(0);
  };

  const handleSearchChange = (nextSearch: string) => {
    setSearchTerm(nextSearch);
    resetPagination();
  };

  const handleCategoryChange = (nextCategoryId: string) => {
    setSelectedCategoryId(nextCategoryId);
    resetPagination();
  };

  const handleCategorySelect = (categoryId: string) => {
    const nextId = selectedCategoryId === categoryId ? '' : categoryId;
    handleCategoryChange(nextId);
  };

  const handleIncludeInactiveChange = (nextIncludeInactive: boolean) => {
    setIncludeInactive(nextIncludeInactive);
    if (!nextIncludeInactive && selectedCategoryId) {
      const selected = categories.find(
        (item) => item.category_id === selectedCategoryId
      );
      if (selected && !selected.is_active) {
        setSelectedCategoryId('');
      }
    }
    resetPagination();
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCategoryId('');
    setIncludeInactive(false);
    resetPagination();
  };

  const handlePageChange = (nextPage: number) => {
    const nextIndex = nextPage - 1;
    if (nextIndex < 0) {
      return;
    }
    if (nextIndex < pageIndex && nextIndex < cursorStack.length) {
      setPageIndex(nextIndex);
      return;
    }
    if (nextIndex === pageIndex + 1) {
      const nextCursor = productsQuery.data?.nextCursor;
      if (nextCursor) {
        setCursorStack((prev) => [...prev.slice(0, nextIndex), nextCursor]);
        setPageIndex(nextIndex);
      }
    }
  };

  const openCreateCategoryModal = () => {
    if (!canWriteCatalog) {
      return;
    }
    setCategoryModalState({ open: true, category: null });
  };

  const openEditCategoryModal = (category: ProductCategoryDto) => {
    if (!canWriteCatalog) {
      return;
    }
    setCategoryModalState({ open: true, category });
  };

  const closeCategoryModal = () => {
    setCategoryModalState({ open: false, category: null });
  };

  const openCreateProductModal = () => {
    if (!canWriteCatalog) {
      return;
    }
    setProductModalState({ mode: 'create', product: null });
  };

  const openEditProductModal = (product: ProductDto) => {
    if (!canWriteCatalog) {
      return;
    }
    setProductModalState({ mode: 'edit', product });
  };

  const closeProductModal = () => {
    setProductModalState({ mode: null, product: null });
  };

  const handleToggleActive = async (
    product: ProductDto,
    nextActive: boolean
  ) => {
    if (!canWriteCatalog || togglingIdsRef.current.has(product.product_id)) {
      return;
    }

    togglingIdsRef.current.add(product.product_id);
    setTogglingProductIds((prev) =>
      prev.includes(product.product_id) ? prev : [...prev, product.product_id]
    );

    try {
      await patchProductMutation.mutateAsync({
        productId: product.product_id,
        payload: { is_active: nextActive },
      });
      toast.success(
        `${product.name} marked ${nextActive ? 'active' : 'inactive'}`
      );
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.trace_id
            ? `${error.message} (Trace: ${error.trace_id})`
            : error.message
          : 'Unable to update product status.';
      toast.error(message);
    } finally {
      togglingIdsRef.current.delete(product.product_id);
      setTogglingProductIds((prev) =>
        prev.filter((id) => id !== product.product_id)
      );
    }
  };

  const hasActiveFilters =
    normalizedSearch.length > 0 ||
    selectedCategoryId.length > 0 ||
    includeInactive;

  return {
    canWriteCatalog,
    isBranchLocal,
    selectedProductId,
    setSelectedProductId,
    searchTerm,
    selectedCategoryId,
    includeInactive,
    hasActiveFilters,
    pageIndex,
    pageSize,
    categories,
    categoryTree,
    categoryNameById,
    getCategoryName,
    products,
    categoriesQuery,
    productsQuery,
    categoryModalState,
    setCategoryModalState,
    openCreateCategoryModal,
    openEditCategoryModal,
    closeCategoryModal,
    productModalState,
    setProductModalState,
    openCreateProductModal,
    openEditProductModal,
    closeProductModal,
    togglingProductIds,
    handleSearchChange,
    handleCategoryChange,
    handleCategorySelect,
    handleIncludeInactiveChange,
    resetFilters,
    handlePageChange,
    handleToggleActive,
  };
}

export function buildEligibleParentOptions(
  editingCategoryId: string | null | undefined,
  categories: readonly ProductCategoryDto[],
  currentParentId?: string | null
) {
  const eligible = getEligibleParentCategories(editingCategoryId, categories);
  const options = [
    { value: '', label: 'No parent category' },
    ...eligible.map((item) => ({
      value: item.category_id,
      label: item.is_active
        ? `${item.name} (${item.code})`
        : `${item.name} (${item.code}) — Inactive`,
    })),
  ];

  if (
    currentParentId &&
    !categories.some((item) => item.category_id === currentParentId)
  ) {
    options.push({
      value: currentParentId,
      label: 'Current parent category',
    });
  }

  return options;
}

export interface ProductCategoryOptionsConfig {
  includeInactive?: boolean;
  emptyLabel: string;
  currentCategoryId?: string;
}

export function buildProductCategoryOptions(
  categories: readonly ProductCategoryDto[],
  {
    includeInactive = false,
    emptyLabel,
    currentCategoryId,
  }: ProductCategoryOptionsConfig
) {
  const visible = categories
    .filter(
      (category) =>
        includeInactive ||
        category.is_active ||
        (currentCategoryId !== undefined &&
          category.category_id === currentCategoryId)
    )
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const options = [
    { value: '', label: emptyLabel },
    ...visible.map((category) => ({
      value: category.category_id,
      label: category.is_active ? category.name : `${category.name} (Inactive)`,
    })),
  ];

  if (
    currentCategoryId &&
    !options.some((option) => option.value === currentCategoryId)
  ) {
    options.push({
      value: currentCategoryId,
      label: 'Category unavailable',
    });
  }

  return options;
}

export function useCategoryForm({
  category,
  categories,
  onClose,
}: {
  category: ProductCategoryDto | null;
  categories: readonly ProductCategoryDto[];
  onClose: () => void;
}) {
  const isEdit = category !== null;
  const formId = useId();
  const createMutation = useCreateCategoryMutation();
  const patchMutation = usePatchCategoryMutation();
  const isPending = createMutation.isPending || patchMutation.isPending;
  const [submitError, setSubmitError] = useState<string | null>(null);

  const schema = useMemo(
    () => createCategoryFormSchema(category?.category_id ?? null, categories),
    [category?.category_id, categories]
  );

  const parentOptions = useMemo(
    () =>
      buildEligibleParentOptions(
        category?.category_id ?? null,
        categories,
        category?.parent_category_id
      ),
    [categories, category?.category_id, category?.parent_category_id]
  );

  const rawDefaults = category
    ? categoryDtoToFormValues(category)
    : DEFAULT_CATEGORY_FORM_VALUES;
  const defaultValues: CategoryFormValues =
    rawDefaults.parent_category_id &&
    !parentOptions.some((opt) => opt.value === rawDefaults.parent_category_id)
      ? { ...rawDefaults, parent_category_id: '' }
      : rawDefaults;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues,
  });

  const handleClose = () => {
    if (!isPending) onClose();
  };

  const handleFormSubmit = handleSubmit(async (values) => {
    if (isPending || (isEdit && !isDirty)) return;
    setSubmitError(null);
    try {
      if (category) {
        await patchMutation.mutateAsync({
          categoryId: category.category_id,
          payload: toCategoryPatchPayload(values),
        });
        toast.success(`Category "${values.name.trim()}" updated`);
      } else {
        await createMutation.mutateAsync({
          payload: toCategoryCreatePayload(values),
        });
        toast.success(`Category "${values.name.trim()}" created`);
      }
      onClose();
    } catch (error) {
      const formError = applyCategoryFormApiError(error, setError);
      if (formError) {
        setSubmitError(formError);
        toast.error(formError);
      }
    }
  });

  return {
    isEdit,
    formId,
    isPending,
    submitError,
    parentOptions,
    register,
    control,
    errors,
    isDirty,
    handleClose,
    handleFormSubmit,
  };
}

export function useCreateProductForm({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const createMutation = useCreateProductMutation();
  const isPending = createMutation.isPending;
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<CreateProductFormValues>({
    resolver: zodResolver(createProductFormSchema),
    mode: 'onTouched',
    defaultValues: DEFAULT_CREATE_PRODUCT_FORM_VALUES,
  });

  const handleClose = () => {
    if (!isPending) onClose();
  };

  const handleSellableChange = (nextSellable: boolean) => {
    setValue('base_uom.is_sellable', nextSellable, {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (!nextSellable) {
      setValue('base_uom.sale_unit_price', '', { shouldDirty: true });
      clearErrors('base_uom.sale_unit_price');
    }
  };

  const handleFormSubmit = handleSubmit(async (values) => {
    if (isPending) return;
    setSubmitError(null);
    try {
      await createMutation.mutateAsync({
        payload: toCreateProductPayload(values),
      });
      toast.success(`Product "${values.name.trim()}" created`);
      onClose();
    } catch (error) {
      const formError = applyCreateProductFormApiError(error, setError);
      if (formError) {
        setSubmitError(formError);
        toast.error(formError);
      }
    }
  });

  return {
    formId,
    isPending,
    submitError,
    register,
    control,
    errors,
    handleClose,
    handleSellableChange,
    handleFormSubmit,
  };
}

export function useEditProductForm({
  product,
  onClose,
}: {
  product: ProductDto;
  onClose: () => void;
}) {
  const formId = useId();
  const patchMutation = usePatchProductMutation();
  const isPending = patchMutation.isPending;
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<EditProductFormValues>({
    resolver: zodResolver(editProductFormSchema),
    mode: 'onTouched',
    defaultValues: productDtoToEditFormValues(product),
  });

  const handleClose = () => {
    if (!isPending) onClose();
  };

  const handleFormSubmit = handleSubmit(async (values) => {
    if (isPending || !isDirty) return;
    setSubmitError(null);
    try {
      await patchMutation.mutateAsync({
        productId: product.product_id,
        payload: toProductPatchPayload(values),
      });
      toast.success(`Product "${values.name.trim()}" updated`);
      onClose();
    } catch (error) {
      const formError = applyEditProductFormApiError(error, setError);
      if (formError) {
        setSubmitError(formError);
        toast.error(formError);
      }
    }
  });

  return {
    formId,
    isPending,
    submitError,
    register,
    control,
    errors,
    isDirty,
    handleClose,
    handleFormSubmit,
  };
}
