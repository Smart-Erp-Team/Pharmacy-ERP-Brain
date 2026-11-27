import { describe, expect, it } from 'vitest';
import { ApiClientError } from './client';
import { ContractValidationError, requireString } from './normalizers';
import {
  hasNextNumberedPage,
  MAX_PAGE_SIZE,
  buildPaginationQueryParams,
  fetchAllPages,
  parseArrayResult,
  parsePagedResult,
} from './pagination';

function expectInvalidResponseError(fn: () => unknown): void {
  try {
    fn();
    expect.fail('Expected ApiClientError to be thrown');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ApiClientError);
    if (error instanceof ApiClientError) {
      expect(error.code).toBe('INVALID_RESPONSE');
    }
  }
}

describe('Stage 1 pagination helpers', () => {
  it.each([
    [1, 0, false],
    [1, 25, false],
    [1, 26, true],
    [1, 50, true],
    [2, 50, false],
  ] as const)(
    'page %i of %i records hasNext=%s',
    (page, total_count, expected) => {
      expect(hasNextNumberedPage({ page, page_size: 25, total_count })).toBe(
        expected
      );
    }
  );
  it('parsePagedResult accepts valid Stage 1 PagedResult envelopes', () => {
    const page = parsePagedResult<{ id: string }>(
      {
        items: [{ id: '1' }],
        page: 1,
        page_size: 25,
        total_count: 1,
        next_cursor: '2',
      },
      '/inventory/balances'
    );
    expect(page).toEqual({
      items: [{ id: '1' }],
      page: 1,
      page_size: 25,
      total_count: 1,
      next_cursor: '2',
    });

    const emptyPage = parsePagedResult<{ id: string }>(
      {
        items: [],
        page: 1,
        page_size: 25,
        total_count: 0,
        next_cursor: null,
      },
      '/inventory/balances'
    );
    expect(emptyPage).toEqual({
      items: [],
      page: 1,
      page_size: 25,
      total_count: 0,
      next_cursor: null,
    });
  });

  it('parsePagedResult rejects bare arrays, invalid metadata, and blank next_cursor with INVALID_RESPONSE', () => {
    expectInvalidResponseError(() =>
      parsePagedResult([{ on_hand_qty_base: 10 }], '/inventory/balances')
    );
    expectInvalidResponseError(() => parsePagedResult(null, '/products'));
    expectInvalidResponseError(() =>
      parsePagedResult({ results: [] }, '/products')
    );
    expectInvalidResponseError(() =>
      parsePagedResult(
        {
          items: [],
          page: 0,
          page_size: 25,
          total_count: 0,
          next_cursor: null,
        },
        '/products'
      )
    );
    expectInvalidResponseError(() =>
      parsePagedResult(
        {
          items: [],
          page: 1,
          page_size: MAX_PAGE_SIZE + 1,
          total_count: 0,
          next_cursor: null,
        },
        '/products'
      )
    );
    expectInvalidResponseError(() =>
      parsePagedResult(
        {
          items: [],
          page: 1,
          page_size: 25,
          total_count: -1,
          next_cursor: null,
        },
        '/products'
      )
    );
    expectInvalidResponseError(() =>
      parsePagedResult(
        {
          items: [],
          page: 1,
          page_size: 25,
          total_count: 0,
        },
        '/products'
      )
    );
    expectInvalidResponseError(() =>
      parsePagedResult(
        {
          items: [{ id: '1' }],
          page: 1,
          page_size: 25,
          total_count: 1,
          next_cursor: '',
        },
        '/products'
      )
    );
    expectInvalidResponseError(() =>
      parsePagedResult(
        {
          items: [{ id: '1' }],
          page: 1,
          page_size: 25,
          total_count: 1,
          next_cursor: '   ',
        },
        '/products'
      )
    );
    expectInvalidResponseError(() =>
      parsePagedResult(
        {
          items: [{ id: '1' }],
          page: 1,
          page_size: 25,
          total_count: 1,
          next_cursor: 123,
        },
        '/products'
      )
    );
  });

  it('wraps ContractValidationError thrown by normalizeItem into ApiClientError(INVALID_RESPONSE)', () => {
    const normalizeItem = (item: unknown) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        throw new ContractValidationError(
          'Item must be an object',
          '/branches'
        );
      }
      const record: Record<string, unknown> = Object.fromEntries(
        Object.entries(item)
      );
      return { id: requireString(record, 'id', '/branches') };
    };

    expect(
      parsePagedResult(
        {
          items: [{ id: 'branch-1' }],
          page: 1,
          page_size: 25,
          total_count: 1,
          next_cursor: null,
        },
        '/branches',
        normalizeItem
      ).items
    ).toEqual([{ id: 'branch-1' }]);

    expectInvalidResponseError(() =>
      parsePagedResult(
        {
          items: [{ id: '' }],
          page: 1,
          page_size: 25,
          total_count: 1,
          next_cursor: null,
        },
        '/branches',
        normalizeItem
      )
    );

    expectInvalidResponseError(() =>
      parseArrayResult([{ id: 42 }], '/products/1/uoms', normalizeItem)
    );
  });

  it('parseArrayResult accepts JSON arrays and rejects non-arrays', () => {
    expect(
      parseArrayResult<{ code: string }>([{ code: 'TAB' }], '/products/1/uoms')
    ).toEqual([{ code: 'TAB' }]);
    expectInvalidResponseError(() =>
      parseArrayResult({ items: [] }, '/products/1/uoms')
    );
  });

  it('buildPaginationQueryParams includes valid bounds and omits invalid values', () => {
    expect(buildPaginationQueryParams()).toEqual({});
    expect(buildPaginationQueryParams({ page: 2, page_size: 50 })).toEqual({
      page: 2,
      page_size: 50,
    });
    expect(
      buildPaginationQueryParams({ page: 0, page_size: MAX_PAGE_SIZE + 1 })
    ).toEqual({});
    expect(buildPaginationQueryParams({ page: 1.5, page_size: -5 })).toEqual(
      {}
    );
  });

  it('fetchAllPages returns [] immediately when total_count is 0', async () => {
    const calls: Array<{ page: number; pageSize: number }> = [];
    const items = await fetchAllPages(async (page, pageSize) => {
      calls.push({ page, pageSize });
      return {
        items: [],
        page,
        page_size: pageSize,
        total_count: 0,
        next_cursor: null,
      };
    });

    expect(items).toEqual([]);
    expect(calls).toEqual([{ page: 1, pageSize: MAX_PAGE_SIZE }]);
  });

  it('fetchAllPages drains multiple sequential pages until total_count is reached', async () => {
    const firstPageItems = Array.from({ length: 200 }, (_, i) => ({
      index: i + 1,
    }));
    const secondPageItems = [{ index: 201 }];
    const calls: Array<{ page: number; pageSize: number }> = [];

    const all = await fetchAllPages(async (page, pageSize) => {
      calls.push({ page, pageSize });
      if (page === 1) {
        return {
          items: firstPageItems,
          page: 1,
          page_size: pageSize,
          total_count: 201,
          next_cursor: '2',
        };
      }
      return {
        items: secondPageItems,
        page: 2,
        page_size: pageSize,
        total_count: 201,
        next_cursor: null,
      };
    });

    expect(calls).toEqual([
      { page: 1, pageSize: 200 },
      { page: 2, pageSize: 200 },
    ]);
    expect(all).toHaveLength(201);
    expect(all[200]).toEqual({ index: 201 });
  });

  it('fetchAllPages rejects empty pages before reaching total_count', async () => {
    await expect(
      fetchAllPages(async (page, pageSize) => ({
        items: [],
        page,
        page_size: pageSize,
        total_count: 5,
        next_cursor: null,
      }))
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'INVALID_RESPONSE',
    });
  });

  it('fetchAllPages enforces maxPages guard against infinite pagination', async () => {
    await expect(
      fetchAllPages(
        async (page, pageSize) => ({
          items: [{ page }],
          page,
          page_size: pageSize,
          total_count: 5,
          next_cursor: String(page + 1),
        }),
        { pageSize: 1, maxPages: 2 }
      )
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'INVALID_RESPONSE',
    });

    await expect(
      fetchAllPages(
        async () => ({
          items: [],
          page: 1,
          page_size: 25,
          total_count: 0,
          next_cursor: null,
        }),
        { pageSize: MAX_PAGE_SIZE + 1 }
      )
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'INVALID_RESPONSE',
    });
  });
});
