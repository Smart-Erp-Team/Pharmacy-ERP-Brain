import { useQuery } from '@tanstack/react-query';
import { fetchAllPages } from '../../../lib/api/pagination';
import {
  getProduct,
  getReorderRule,
  listProductCategories,
  listProducts,
  listProductUoms,
  type ListProductCategoriesParams,
  type ListProductsParams,
} from '../api/catalogApi';
import {
  productsKeys,
  type AllProductCategoriesKeyParams,
  type AllProductsKeyParams,
} from './productsKeys';

export interface UseCatalogQueryOptions {
  enabled?: boolean;
}

export function useProductCategoriesQuery(
  params: ListProductCategoriesParams = {},
  options: UseCatalogQueryOptions = {}
) {
  return useQuery({
    queryKey: productsKeys.categoryList(params),
    queryFn: () => listProductCategories(params),
    enabled: options.enabled ?? true,
  });
}

export function useAllProductCategoriesQuery(
  params: AllProductCategoriesKeyParams = {},
  options: UseCatalogQueryOptions = {}
) {
  return useQuery({
    queryKey: productsKeys.allCategoryList(params),
    queryFn: () =>
      fetchAllPages((cursor, limit) =>
        listProductCategories({ ...params, cursor, limit })
      ),
    enabled: options.enabled ?? true,
  });
}

export function useProductsQuery(
  params: ListProductsParams = {},
  options: UseCatalogQueryOptions = {}
) {
  return useQuery({
    queryKey: productsKeys.list(params),
    queryFn: () => listProducts(params),
    enabled: options.enabled ?? true,
  });
}

export function useAllProductsQuery(
  params: AllProductsKeyParams = {},
  options: UseCatalogQueryOptions = {}
) {
  return useQuery({
    queryKey: productsKeys.allList(params),
    queryFn: () =>
      fetchAllPages((cursor, limit) =>
        listProducts({ ...params, cursor, limit })
      ),
    enabled: options.enabled ?? true,
  });
}

export function useProductQuery(
  productId: string | undefined,
  options: UseCatalogQueryOptions = {}
) {
  const normalizedProductId = productId?.trim() ?? '';

  return useQuery({
    queryKey: productsKeys.detail(normalizedProductId),
    queryFn: () => {
      if (!normalizedProductId) {
        return Promise.reject(new Error('Product ID is required.'));
      }
      return getProduct(normalizedProductId);
    },
    enabled: normalizedProductId.length > 0 && (options.enabled ?? true),
  });
}

export function useProductUomsQuery(
  productId: string | undefined,
  options: UseCatalogQueryOptions = {}
) {
  const normalizedProductId = productId?.trim() ?? '';

  return useQuery({
    queryKey: productsKeys.uoms(normalizedProductId),
    queryFn: () => {
      if (!normalizedProductId) {
        return Promise.reject(new Error('Product ID is required.'));
      }
      return listProductUoms(normalizedProductId);
    },
    enabled: normalizedProductId.length > 0 && (options.enabled ?? true),
  });
}

export function useReorderRuleQuery(
  branchId: string | undefined,
  productId: string | undefined,
  options: UseCatalogQueryOptions = {}
) {
  const normalizedBranchId = branchId?.trim() ?? '';
  const normalizedProductId = productId?.trim() ?? '';

  return useQuery({
    queryKey: productsKeys.reorderRule(normalizedBranchId, normalizedProductId),
    queryFn: () => {
      if (!normalizedBranchId || !normalizedProductId) {
        return Promise.reject(
          new Error('Branch ID and Product ID are required.')
        );
      }
      return getReorderRule(normalizedBranchId, normalizedProductId);
    },
    enabled:
      normalizedBranchId.length > 0 &&
      normalizedProductId.length > 0 &&
      (options.enabled ?? true),
  });
}
