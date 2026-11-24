import { ApiClientError } from './client';
import type { PagedResult } from '../../types/api';

export const MAX_CURSOR_PAGE_SIZE = 200;
export const DEFAULT_MAX_CURSOR_PAGES = 50;

interface RawPagedEnvelope<TItem> {
  readonly items: TItem[];
  readonly nextCursor?: string | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPagedEnvelope<TItem>(
  value: unknown
): value is RawPagedEnvelope<TItem> {
  if (!isPlainRecord(value) || !Array.isArray(value.items)) {
    return false;
  }

  const nextCursor = value.nextCursor;
  return (
    nextCursor === undefined ||
    nextCursor === null ||
    typeof nextCursor === 'string'
  );
}

/**
 * Validates that a list endpoint returned the contracted `PagedResult<T>`
 * envelope (`{ items: T[], nextCursor?: string | null }`). Rejects bare JSON
 * arrays or malformed objects so UI tables surface an integration error instead
 * of silently rendering an empty state.
 */
export function parsePagedResult<TItem>(
  data: unknown,
  endpoint: string
): PagedResult<TItem> {
  if (!isPagedEnvelope<TItem>(data)) {
    throw new ApiClientError({
      code: 'INVALID_RESPONSE',
      message: `Expected a paginated { items, nextCursor } response from ${endpoint}.`,
    });
  }

  return {
    items: data.items,
    nextCursor: data.nextCursor ?? null,
  };
}

/**
 * Validates that a non-paginated collection endpoint returned a JSON array.
 */
export function parseArrayResult<TItem>(
  data: unknown,
  endpoint: string
): TItem[] {
  if (!Array.isArray(data)) {
    throw new ApiClientError({
      code: 'INVALID_RESPONSE',
      message: `Expected an array response from ${endpoint}.`,
    });
  }

  return data;
}

export interface FetchAllPagesOptions {
  readonly pageSize?: number;
  readonly maxPages?: number;
}

/**
 * Follows opaque `nextCursor` tokens across pages until `nextCursor` is null/empty,
 * ensuring local aggregations and reference selectors do not truncate at 200 rows.
 */
export async function fetchAllPages<TItem>(
  fetchPage: (
    cursor: string | undefined,
    limit: number
  ) => Promise<PagedResult<TItem>>,
  options: FetchAllPagesOptions = {}
): Promise<TItem[]> {
  const pageSize = options.pageSize ?? MAX_CURSOR_PAGE_SIZE;
  const maxPages = options.maxPages ?? DEFAULT_MAX_CURSOR_PAGES;
  const items: TItem[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined = undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await fetchPage(cursor, pageSize);
    items.push(...response.items);

    const nextCursor = response.nextCursor?.trim();
    if (!nextCursor) {
      return items;
    }

    if (seenCursors.has(nextCursor)) {
      throw new ApiClientError({
        code: 'INVALID_RESPONSE',
        message: 'Pagination cursor repeated without advancing.',
      });
    }

    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return items;
}
