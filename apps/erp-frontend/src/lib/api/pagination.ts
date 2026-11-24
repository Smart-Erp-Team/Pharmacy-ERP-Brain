import { ApiClientError } from './client';
import type { PagedResult } from '../../types/api';

export const MAX_CURSOR_PAGE_SIZE = 200;
export const DEFAULT_MAX_CURSOR_PAGES = 50;

interface RawPagedEnvelope<TItem> {
  readonly items: TItem[];
  readonly nextCursor: string | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidNextCursor(value: unknown): value is string | null {
  return (
    value === null || (typeof value === 'string' && value.trim().length > 0)
  );
}

function isPagedEnvelope<TItem>(
  value: unknown
): value is RawPagedEnvelope<TItem> {
  if (
    !isPlainRecord(value) ||
    !Array.isArray(value.items) ||
    !('nextCursor' in value)
  ) {
    return false;
  }

  return isValidNextCursor(value.nextCursor);
}

/**
 * Preserves non-blank opaque cursor tokens verbatim (without trimming),
 * while omitting empty or whitespace-only caller input from query params.
 */
export function normalizeCursorParam(
  cursor: string | undefined
): string | undefined {
  return cursor !== undefined && cursor.trim().length > 0 ? cursor : undefined;
}

/**
 * Validates that a list endpoint returned the contracted `PagedResult<T>`
 * envelope (`{ items: T[], nextCursor: string | null }`). Rejects bare JSON
 * arrays, envelopes missing `nextCursor`, or blank/whitespace-only `nextCursor`
 * strings so UI tables surface an integration error instead of silently
 * rendering an empty or truncated state.
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
    nextCursor: data.nextCursor,
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
 * Follows opaque `nextCursor` tokens verbatim across pages until
 * `nextCursor === null`, ensuring local aggregations and reference selectors
 * do not truncate at 200 rows or silently stop on malformed cursor strings.
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
  if (maxPages < 1) {
    throw new ApiClientError({
      code: 'INVALID_RESPONSE',
      message: 'Pagination maxPages must be at least 1.',
    });
  }

  const items: TItem[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined = undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await fetchPage(cursor, pageSize);
    items.push(...response.items);

    const nextCursor = response.nextCursor;
    if (nextCursor === null) {
      return items;
    }

    if (typeof nextCursor !== 'string' || nextCursor.trim().length === 0) {
      throw new ApiClientError({
        code: 'INVALID_RESPONSE',
        message:
          'Pagination nextCursor must be null or a non-blank opaque string.',
      });
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

  throw new ApiClientError({
    code: 'INVALID_RESPONSE',
    message: `Pagination exceeded the maximum limit of ${maxPages} pages before reaching the end of results.`,
  });
}
