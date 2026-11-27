/**
 * Pharmacy ERP — Stage 1 Pagination Helpers
 *
 * Validates standard Stage 1 `PagedResult<T>` envelopes
 * (`{ items, page, page_size, total_count, next_cursor }`), unpaginated array
 * responses, pagination query parameter serialization, and bounded multi-page
 * collection (`fetchAllPages`).
 */

import { ApiClientError, toInvalidResponseError } from './client';
import { ContractValidationError, isPlainRecord } from './normalizers';
import type { PagedResult } from '../../types/api';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;
export const DEFAULT_MAX_PAGES = 50;

export function hasNextNumberedPage(
  data:
    Pick<PagedResult<unknown>, 'page' | 'page_size' | 'total_count'> | undefined
): boolean {
  return data !== undefined && data.page * data.page_size < data.total_count;
}

export interface PaginationQueryParams {
  page?: number;
  page_size?: number;
}

export interface FetchAllPagesOptions {
  readonly pageSize?: number;
  readonly maxPages?: number;
}

function isValidPage(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isValidPageSize(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_PAGE_SIZE
  );
}

function isValidTotalCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isValidNextCursor(value: unknown): value is string | null {
  return (
    value === null || (typeof value === 'string' && value.trim().length > 0)
  );
}

/**
 * Builds Stage 1 pagination query parameters (`page`, `page_size`), including
 * only valid positive integer values within contract bounds.
 */
export function buildPaginationQueryParams(
  params?: PaginationQueryParams
): PaginationQueryParams {
  const query: PaginationQueryParams = {};

  if (params?.page !== undefined && isValidPage(params.page)) {
    query.page = params.page;
  }

  if (params?.page_size !== undefined && isValidPageSize(params.page_size)) {
    query.page_size = params.page_size;
  }

  return query;
}

/**
 * Validates that a list endpoint returned the contracted Stage 1
 * `PagedResult<T>` envelope
 * (`{ items: T[], page: int >= 1, page_size: 1..200, total_count: int >= 0, next_cursor: string | null }`).
 * Rejects bare arrays, missing fields, out-of-range integers, blank
 * `next_cursor` strings, and item normalization failures with
 * `ApiClientError('INVALID_RESPONSE')`.
 */
export function parsePagedResult<TItem>(
  data: unknown,
  endpoint: string,
  normalizeItem?: (item: unknown, index: number) => TItem
): PagedResult<TItem> {
  if (!isPlainRecord(data)) {
    throw new ApiClientError({
      code: 'INVALID_RESPONSE',
      message: `Expected a paginated { items, page, page_size, total_count, next_cursor } response from ${endpoint}.`,
    });
  }

  const rawItems = data.items;
  const page = data.page;
  const pageSize = data.page_size;
  const totalCount = data.total_count;
  const hasNextCursor = 'next_cursor' in data;
  const nextCursor = data.next_cursor;

  if (
    !Array.isArray(rawItems) ||
    !isValidPage(page) ||
    !isValidPageSize(pageSize) ||
    !isValidTotalCount(totalCount) ||
    !hasNextCursor ||
    !isValidNextCursor(nextCursor)
  ) {
    throw new ApiClientError({
      code: 'INVALID_RESPONSE',
      message: `Expected a valid paginated { items, page, page_size, total_count, next_cursor } response from ${endpoint}.`,
    });
  }

  let items: TItem[];
  if (normalizeItem) {
    try {
      items = rawItems.map((item: unknown, index: number) =>
        normalizeItem(item, index)
      );
    } catch (error: unknown) {
      if (error instanceof ContractValidationError) {
        throw toInvalidResponseError(error);
      }
      if (error instanceof ApiClientError) {
        throw error;
      }
      throw new ApiClientError({
        code: 'INVALID_RESPONSE',
        message: `Failed to normalize paginated items from ${endpoint}.`,
      });
    }
  } else {
    items = rawItems;
  }

  return {
    items,
    page,
    page_size: pageSize,
    total_count: totalCount,
    next_cursor: nextCursor,
  };
}

/**
 * Validates that an unpaginated collection endpoint returned a JSON array,
 * optionally normalizing each element and wrapping contract failures into
 * `ApiClientError('INVALID_RESPONSE')`.
 */
export function parseArrayResult<TItem>(
  data: unknown,
  endpoint: string,
  normalizeItem?: (item: unknown, index: number) => TItem
): TItem[] {
  if (!Array.isArray(data)) {
    throw new ApiClientError({
      code: 'INVALID_RESPONSE',
      message: `Expected an array response from ${endpoint}.`,
    });
  }

  if (!normalizeItem) {
    return data;
  }

  try {
    return data.map((item: unknown, index: number) =>
      normalizeItem(item, index)
    );
  } catch (error: unknown) {
    if (error instanceof ContractValidationError) {
      throw toInvalidResponseError(error);
    }
    if (error instanceof ApiClientError) {
      throw error;
    }
    throw new ApiClientError({
      code: 'INVALID_RESPONSE',
      message: `Failed to normalize array items from ${endpoint}.`,
    });
  }
}

/**
 * Fetches sequential 1-indexed pages (`page = 1, 2, ...`) until
 * `items.length >= response.total_count` (or `total_count === 0`), protecting
 * callers from silent truncation when an empty page arrives prematurely or
 * `maxPages` is exhausted before reaching `total_count`.
 */
export async function fetchAllPages<TItem>(
  fetchPage: (page: number, pageSize: number) => Promise<PagedResult<TItem>>,
  options: FetchAllPagesOptions = {}
): Promise<TItem[]> {
  const pageSize = options.pageSize ?? MAX_PAGE_SIZE;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

  if (!isValidPageSize(pageSize)) {
    throw new ApiClientError({
      code: 'INVALID_RESPONSE',
      message: `Pagination pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}.`,
    });
  }

  if (!isValidPage(maxPages)) {
    throw new ApiClientError({
      code: 'INVALID_RESPONSE',
      message: 'Pagination maxPages must be an integer of at least 1.',
    });
  }

  const items: TItem[] = [];

  for (let page = DEFAULT_PAGE; page <= maxPages; page += 1) {
    const response = await fetchPage(page, pageSize);

    if (
      !Array.isArray(response.items) ||
      !isValidTotalCount(response.total_count)
    ) {
      throw new ApiClientError({
        code: 'INVALID_RESPONSE',
        message: 'Pagination response contained invalid items or total_count.',
      });
    }

    if (response.total_count === 0) {
      return items;
    }

    if (response.items.length === 0 && items.length < response.total_count) {
      throw new ApiClientError({
        code: 'INVALID_RESPONSE',
        message: `Pagination returned an empty page ${page} before reaching total_count (${response.total_count}).`,
      });
    }

    items.push(...response.items);

    if (items.length >= response.total_count) {
      return items;
    }
  }

  throw new ApiClientError({
    code: 'INVALID_RESPONSE',
    message: `Pagination exceeded the maximum limit of ${maxPages} pages before reaching the end of results.`,
  });
}
