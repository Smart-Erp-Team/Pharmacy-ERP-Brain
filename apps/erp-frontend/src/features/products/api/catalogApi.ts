import { apiClient } from '../../../lib/api/client';
import {
  buildMutationConfig,
  type MutationRequestOptions,
} from '../../../lib/api/idempotency';
import {
  normalizeCursorParam,
  parseArrayResult,
  parsePagedResult,
} from '../../../lib/api/pagination';
import type {
  ApiComponents,
  ApiOperations,
  CreateProductRequest,
  PagedResult,
  ProductCategoryDto,
  ProductCategoryPatchRequest,
  ProductCategoryRequest,
  ProductDto,
  ProductPatchRequest,
  ProductUomDto,
  ProductUomPatchRequest,
  ProductUomRequest,
  ReorderRuleDto,
  ReorderRuleRequest,
  ReorderRuleWrapper,
} from '../../../types/api';

type PagedProductCategoryDto =
  ApiComponents['schemas']['PagedProductCategoryDto'];
type PagedProductDto = ApiComponents['schemas']['PagedProductDto'];
type GetReorderRuleResponse =
  | ReorderRuleWrapper
  | ApiOperations['getReorderRule']['responses'][200]['content']['application/json'];

export type { MutationRequestOptions };

export interface ListProductCategoriesParams {
  cursor?: string;
  limit?: number;
  includeInactive?: boolean;
}

export interface ListProductsParams {
  cursor?: string;
  limit?: number;
  search?: string;
  categoryId?: string;
  includeInactive?: boolean;
}

export async function listProductCategories(
  params: ListProductCategoriesParams = {}
): Promise<PagedResult<ProductCategoryDto>> {
  const cursor = normalizeCursorParam(params.cursor);
  const queryParams: ListProductCategoriesParams = {
    ...(cursor !== undefined ? { cursor } : {}),
    ...(params.limit !== undefined ? { limit: params.limit } : {}),
    ...(params.includeInactive !== undefined
      ? { includeInactive: params.includeInactive }
      : {}),
  };

  const { data } = await apiClient.get<PagedProductCategoryDto>(
    '/product-categories',
    { params: queryParams }
  );

  return parsePagedResult<ProductCategoryDto>(data, '/product-categories');
}

export async function getProductCategory(
  categoryId: string
): Promise<ProductCategoryDto> {
  const { data } = await apiClient.get<ProductCategoryDto>(
    `/product-categories/${encodeURIComponent(categoryId.trim())}`
  );
  return data;
}

export async function createProductCategory(
  payload: ProductCategoryRequest,
  options?: MutationRequestOptions
): Promise<ProductCategoryDto> {
  const { data } = await apiClient.post<ProductCategoryDto>(
    '/product-categories',
    payload,
    buildMutationConfig(options)
  );
  return data;
}

export async function patchProductCategory(
  categoryId: string,
  payload: ProductCategoryPatchRequest,
  options?: MutationRequestOptions
): Promise<ProductCategoryDto> {
  const { data } = await apiClient.patch<ProductCategoryDto>(
    `/product-categories/${encodeURIComponent(categoryId.trim())}`,
    payload,
    buildMutationConfig(options)
  );
  return data;
}

export async function listProducts(
  params: ListProductsParams = {}
): Promise<PagedResult<ProductDto>> {
  const cursor = normalizeCursorParam(params.cursor);
  const search = params.search?.trim();
  const categoryId = params.categoryId?.trim();
  const queryParams: ListProductsParams = {
    ...(cursor !== undefined ? { cursor } : {}),
    ...(params.limit !== undefined ? { limit: params.limit } : {}),
    ...(search ? { search } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(params.includeInactive !== undefined
      ? { includeInactive: params.includeInactive }
      : {}),
  };

  const { data } = await apiClient.get<PagedProductDto>('/products', {
    params: queryParams,
  });

  return parsePagedResult<ProductDto>(data, '/products');
}

export async function getProduct(productId: string): Promise<ProductDto> {
  const { data } = await apiClient.get<ProductDto>(
    `/products/${encodeURIComponent(productId.trim())}`
  );
  return data;
}

export async function createProduct(
  payload: CreateProductRequest,
  options?: MutationRequestOptions
): Promise<ProductDto> {
  const { data } = await apiClient.post<ProductDto>(
    '/products',
    payload,
    buildMutationConfig(options)
  );
  return data;
}

export async function patchProduct(
  productId: string,
  payload: ProductPatchRequest,
  options?: MutationRequestOptions
): Promise<ProductDto> {
  const { data } = await apiClient.patch<ProductDto>(
    `/products/${encodeURIComponent(productId.trim())}`,
    payload,
    buildMutationConfig(options)
  );
  return data;
}

export async function listProductUoms(
  productId: string
): Promise<ProductUomDto[]> {
  const path = `/products/${encodeURIComponent(productId.trim())}/uoms`;
  const { data } = await apiClient.get<ProductUomDto[]>(path);
  return parseArrayResult<ProductUomDto>(data, path);
}

export async function createProductUom(
  productId: string,
  payload: ProductUomRequest,
  options?: MutationRequestOptions
): Promise<ProductUomDto> {
  const { data } = await apiClient.post<ProductUomDto>(
    `/products/${encodeURIComponent(productId.trim())}/uoms`,
    payload,
    buildMutationConfig(options)
  );
  return data;
}

export async function patchProductUom(
  productId: string,
  uomId: string,
  payload: ProductUomPatchRequest,
  options?: MutationRequestOptions
): Promise<ProductUomDto> {
  const { data } = await apiClient.patch<ProductUomDto>(
    `/products/${encodeURIComponent(productId.trim())}/uoms/${encodeURIComponent(uomId.trim())}`,
    payload,
    buildMutationConfig(options)
  );
  return data;
}

export async function getReorderRule(
  branchId: string,
  productId: string
): Promise<ReorderRuleDto | null> {
  const { data } = await apiClient.get<GetReorderRuleResponse>(
    `/branches/${encodeURIComponent(branchId.trim())}/products/${encodeURIComponent(productId.trim())}/reorder-rule`
  );
  return data?.rule ?? null;
}

export async function putReorderRule(
  branchId: string,
  productId: string,
  payload: ReorderRuleRequest,
  options?: MutationRequestOptions
): Promise<ReorderRuleDto> {
  const { data } = await apiClient.put<ReorderRuleDto>(
    `/branches/${encodeURIComponent(branchId.trim())}/products/${encodeURIComponent(productId.trim())}/reorder-rule`,
    payload,
    buildMutationConfig(options)
  );
  return data;
}
