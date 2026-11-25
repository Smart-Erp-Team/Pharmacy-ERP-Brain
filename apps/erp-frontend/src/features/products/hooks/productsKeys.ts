import type {
  ListProductCategoriesParams,
  ListProductsParams,
} from '../api/catalogApi';

export type AllProductsKeyParams = Omit<ListProductsParams, 'cursor' | 'limit'>;
export type AllProductCategoriesKeyParams = Omit<
  ListProductCategoriesParams,
  'cursor' | 'limit'
>;

export const productsKeys = {
  all: ['products'] as const,
  lists: () => [...productsKeys.all, 'list'] as const,
  list: (params: ListProductsParams = {}) =>
    [...productsKeys.lists(), params] as const,
  allList: (params: AllProductsKeyParams = {}) =>
    [...productsKeys.lists(), 'all', params] as const,
  detail: (productId: string) =>
    [...productsKeys.all, 'detail', productId] as const,
  uoms: (productId: string) =>
    [...productsKeys.all, 'uoms', productId] as const,
  categories: () => [...productsKeys.all, 'categories'] as const,
  categoryLists: () => [...productsKeys.categories(), 'list'] as const,
  categoryList: (params: ListProductCategoriesParams = {}) =>
    [...productsKeys.categoryLists(), params] as const,
  allCategoryList: (params: AllProductCategoriesKeyParams = {}) =>
    [...productsKeys.categoryLists(), 'all', params] as const,
  categoryDetail: (categoryId: string) =>
    [...productsKeys.categories(), 'detail', categoryId] as const,
  reorderRules: () => [...productsKeys.all, 'reorder-rule'] as const,
  reorderRule: (branchId: string, productId: string) =>
    [...productsKeys.reorderRules(), branchId, productId] as const,
};
