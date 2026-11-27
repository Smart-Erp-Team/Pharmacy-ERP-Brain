import {
  ApiClientError,
  apiClient,
  toInvalidResponseError,
} from '../../../lib/api/client';
import {
  normalizeProduct,
  normalizeProductCategory,
  normalizeProductUom,
  normalizeReorderRule,
} from '../../../lib/api/catalogInventoryNormalizers';
import {
  buildMutationConfig,
  type MutationRequestOptions,
} from '../../../lib/api/idempotency';
import { ContractValidationError } from '../../../lib/api/normalizers';
import {
  buildPaginationQueryParams,
  parseArrayResult,
  parsePagedResult,
} from '../../../lib/api/pagination';
import type {
  CreateProductCategoryRequest,
  CreateProductRequest,
  CreateProductUomRequest,
  PagedResult,
  Product,
  ProductCategory,
  ProductUom,
  ReorderRule,
  UpdateProductCategoryRequest,
  UpdateProductRequest,
  UpdateProductUomRequest,
  UpsertReorderRuleRequest,
} from '../../../types/api';

export type { MutationRequestOptions };

export interface ListProductCategoriesParams {
  page?: number;
  page_size?: number;
  parent_category_id?: string;
  include_inactive?: boolean;
  search?: string;
}

export interface ListProductsParams {
  page?: number;
  page_size?: number;
  category_id?: string;
  include_inactive?: boolean;
  search?: string;
}

export interface ListProductUomsParams {
  include_inactive?: boolean;
}

function normalizeContractResponse<T>(
  normalizer: (raw: unknown, endpoint?: string) => T,
  data: unknown,
  endpoint: string,
  status?: number
): T {
  try {
    return normalizer(data, endpoint);
  } catch (error: unknown) {
    if (error instanceof ContractValidationError) {
      throw toInvalidResponseError(error, status);
    }
    throw error;
  }
}

export async function listProductCategories(
  params: ListProductCategoriesParams = {}
): Promise<PagedResult<ProductCategory>> {
  const endpoint = '/product-categories';
  const parentCategoryId = params.parent_category_id?.trim();
  const search = params.search?.trim();

  const queryParams: ListProductCategoriesParams = {
    ...buildPaginationQueryParams({
      page: params.page,
      page_size: params.page_size,
    }),
    ...(parentCategoryId ? { parent_category_id: parentCategoryId } : {}),
    ...(params.include_inactive !== undefined
      ? { include_inactive: params.include_inactive }
      : {}),
    ...(search ? { search } : {}),
  };

  const { data } = await apiClient.get<unknown>(endpoint, {
    params: queryParams,
  });

  return parsePagedResult<ProductCategory>(data, endpoint, (item) =>
    normalizeProductCategory(item, endpoint)
  );
}

export async function getProductCategory(
  categoryId: string
): Promise<ProductCategory> {
  const endpoint = `/product-categories/${encodeURIComponent(categoryId.trim())}`;
  const { data, status } = await apiClient.get<unknown>(endpoint);
  return normalizeContractResponse(
    normalizeProductCategory,
    data,
    endpoint,
    status
  );
}

export async function createProductCategory(
  payload: CreateProductCategoryRequest,
  options?: MutationRequestOptions
): Promise<ProductCategory> {
  const endpoint = '/product-categories';
  const { data, status } = await apiClient.post<unknown>(
    endpoint,
    payload,
    buildMutationConfig(options)
  );
  return normalizeContractResponse(
    normalizeProductCategory,
    data,
    endpoint,
    status
  );
}

export async function patchProductCategory(
  categoryId: string,
  payload: UpdateProductCategoryRequest,
  options?: MutationRequestOptions
): Promise<ProductCategory> {
  const endpoint = `/product-categories/${encodeURIComponent(categoryId.trim())}`;
  const { data, status } = await apiClient.patch<unknown>(
    endpoint,
    payload,
    buildMutationConfig(options)
  );
  return normalizeContractResponse(
    normalizeProductCategory,
    data,
    endpoint,
    status
  );
}

export async function listProducts(
  params: ListProductsParams = {}
): Promise<PagedResult<Product>> {
  const endpoint = '/products';
  const categoryId = params.category_id?.trim();
  const search = params.search?.trim();

  const queryParams: ListProductsParams = {
    ...buildPaginationQueryParams({
      page: params.page,
      page_size: params.page_size,
    }),
    ...(categoryId ? { category_id: categoryId } : {}),
    ...(params.include_inactive !== undefined
      ? { include_inactive: params.include_inactive }
      : {}),
    ...(search ? { search } : {}),
  };

  const { data } = await apiClient.get<unknown>(endpoint, {
    params: queryParams,
  });

  return parsePagedResult<Product>(data, endpoint, (item) =>
    normalizeProduct(item, endpoint)
  );
}

export async function getProduct(productId: string): Promise<Product> {
  const endpoint = `/products/${encodeURIComponent(productId.trim())}`;
  const { data, status } = await apiClient.get<unknown>(endpoint);
  return normalizeContractResponse(normalizeProduct, data, endpoint, status);
}

export async function createProduct(
  payload: CreateProductRequest,
  options?: MutationRequestOptions
): Promise<Product> {
  const endpoint = '/products';
  const { data, status } = await apiClient.post<unknown>(
    endpoint,
    payload,
    buildMutationConfig(options)
  );
  return normalizeContractResponse(normalizeProduct, data, endpoint, status);
}

export async function patchProduct(
  productId: string,
  payload: UpdateProductRequest,
  options?: MutationRequestOptions
): Promise<Product> {
  const endpoint = `/products/${encodeURIComponent(productId.trim())}`;
  const { data, status } = await apiClient.patch<unknown>(
    endpoint,
    payload,
    buildMutationConfig(options)
  );
  return normalizeContractResponse(normalizeProduct, data, endpoint, status);
}

export async function listProductUoms(
  productId: string,
  params: ListProductUomsParams = {}
): Promise<ProductUom[]> {
  const endpoint = `/products/${encodeURIComponent(productId.trim())}/uoms`;
  const queryParams: ListProductUomsParams =
    params.include_inactive !== undefined
      ? { include_inactive: params.include_inactive }
      : {};

  const { data } = await apiClient.get<unknown>(endpoint, {
    params: queryParams,
  });

  return parseArrayResult<ProductUom>(data, endpoint, (item) =>
    normalizeProductUom(item, endpoint)
  );
}

export async function createProductUom(
  productId: string,
  payload: CreateProductUomRequest,
  options?: MutationRequestOptions
): Promise<ProductUom> {
  const endpoint = `/products/${encodeURIComponent(productId.trim())}/uoms`;
  const { data, status } = await apiClient.post<unknown>(
    endpoint,
    payload,
    buildMutationConfig(options)
  );
  return normalizeContractResponse(normalizeProductUom, data, endpoint, status);
}

export async function patchProductUom(
  productId: string,
  uomId: string,
  payload: UpdateProductUomRequest,
  options?: MutationRequestOptions
): Promise<ProductUom> {
  const endpoint = `/products/${encodeURIComponent(productId.trim())}/uoms/${encodeURIComponent(uomId.trim())}`;
  const { data, status } = await apiClient.patch<unknown>(
    endpoint,
    payload,
    buildMutationConfig(options)
  );
  return normalizeContractResponse(normalizeProductUom, data, endpoint, status);
}

export async function getReorderRule(
  branchId: string,
  productId: string
): Promise<ReorderRule | null> {
  const endpoint = `/branches/${encodeURIComponent(branchId.trim())}/products/${encodeURIComponent(productId.trim())}/reorder-rule`;
  try {
    const { data, status } = await apiClient.get<unknown>(endpoint);
    return normalizeContractResponse(
      normalizeReorderRule,
      data,
      endpoint,
      status
    );
  } catch (error: unknown) {
    if (
      error instanceof ApiClientError &&
      error.code === 'NOT_FOUND' &&
      (error.status === undefined || error.status === 404)
    ) {
      return null;
    }
    throw error;
  }
}

export async function upsertReorderRule(
  branchId: string,
  productId: string,
  payload: UpsertReorderRuleRequest,
  options?: MutationRequestOptions
): Promise<ReorderRule> {
  const endpoint = `/branches/${encodeURIComponent(branchId.trim())}/products/${encodeURIComponent(productId.trim())}/reorder-rule`;
  const { data, status } = await apiClient.put<unknown>(
    endpoint,
    payload,
    buildMutationConfig(options)
  );
  return normalizeContractResponse(
    normalizeReorderRule,
    data,
    endpoint,
    status
  );
}

export const putReorderRule = upsertReorderRule;
