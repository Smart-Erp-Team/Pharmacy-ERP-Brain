import { describe, expect, it } from 'vitest';
import { ApiClientError } from './client';
import {
  fetchAllPages,
  normalizeCursorParam,
  parseArrayResult,
  parsePagedResult,
} from './pagination';

describe('pagination helpers', () => {
  it('parsePagedResult accepts valid { items, nextCursor } envelopes and preserves opaque cursor whitespace', () => {
    const page = parsePagedResult<{ id: string }>(
      { items: [{ id: '1' }], nextCursor: ' opaque-cursor-2 ' },
      '/inventory/balances'
    );
    expect(page).toEqual({
      items: [{ id: '1' }],
      nextCursor: ' opaque-cursor-2 ',
    });

    const terminalPage = parsePagedResult<{ id: string }>(
      { items: [], nextCursor: null },
      '/inventory/balances'
    );
    expect(terminalPage).toEqual({ items: [], nextCursor: null });
  });

  it('parsePagedResult rejects bare JSON arrays and malformed or blank nextCursor envelopes with INVALID_RESPONSE', () => {
    expect(() =>
      parsePagedResult([{ on_hand_qty_base: '10.0000' }], '/inventory/balances')
    ).toThrowError(ApiClientError);

    try {
      parsePagedResult(
        [{ on_hand_qty_base: '10.0000' }],
        '/inventory/balances'
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      if (error instanceof ApiClientError) {
        expect(error.code).toBe('INVALID_RESPONSE');
      }
    }

    expect(() => parsePagedResult(null, '/products')).toThrowError(
      ApiClientError
    );
    expect(() => parsePagedResult({ results: [] }, '/products')).toThrowError(
      ApiClientError
    );
    expect(() => parsePagedResult({ items: [] }, '/products')).toThrowError(
      ApiClientError
    );
    expect(() =>
      parsePagedResult({ items: [], nextCursor: undefined }, '/products')
    ).toThrowError(ApiClientError);
    expect(() =>
      parsePagedResult({ items: [], nextCursor: 123 }, '/products')
    ).toThrowError(ApiClientError);
    expect(() =>
      parsePagedResult({ items: [{ id: '1' }], nextCursor: '' }, '/products')
    ).toThrowError(ApiClientError);
    expect(() =>
      parsePagedResult({ items: [{ id: '1' }], nextCursor: '   ' }, '/products')
    ).toThrowError(ApiClientError);
  });

  it('normalizeCursorParam omits blank caller inputs while preserving opaque cursor whitespace', () => {
    expect(normalizeCursorParam(undefined)).toBeUndefined();
    expect(normalizeCursorParam('')).toBeUndefined();
    expect(normalizeCursorParam('   ')).toBeUndefined();
    expect(normalizeCursorParam(' opaque-cursor-2 ')).toBe(' opaque-cursor-2 ');
  });

  it('parseArrayResult accepts JSON arrays and rejects non-arrays', () => {
    expect(
      parseArrayResult<{ code: string }>([{ code: 'TAB' }], '/uoms')
    ).toEqual([{ code: 'TAB' }]);
    expect(() =>
      parseArrayResult({ items: [] }, '/products/1/uoms')
    ).toThrowError(ApiClientError);
  });

  it('fetchAllPages drains all pages beyond 200 items and forwards opaque nextCursor verbatim without trimming', async () => {
    const firstPageItems = Array.from({ length: 200 }, (_, i) => ({
      index: i + 1,
    }));
    const secondPageItems = [{ index: 201 }];
    const calls: Array<{ cursor: string | undefined; limit: number }> = [];

    const all = await fetchAllPages(async (cursor, limit) => {
      calls.push({ cursor, limit });
      if (!cursor) {
        return { items: firstPageItems, nextCursor: ' cursor-after-200 ' };
      }
      return { items: secondPageItems, nextCursor: null };
    });

    expect(calls).toEqual([
      { cursor: undefined, limit: 200 },
      { cursor: ' cursor-after-200 ', limit: 200 },
    ]);
    expect(all).toHaveLength(201);
    expect(all[200]).toEqual({ index: 201 });
  });

  it('fetchAllPages rejects empty or whitespace-only nextCursor values with INVALID_RESPONSE instead of returning partial items', async () => {
    await expect(
      fetchAllPages(async () => ({
        items: [{ id: 1 }],
        nextCursor: '',
      }))
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'INVALID_RESPONSE',
    });

    await expect(
      fetchAllPages(async () => ({
        items: [{ id: 1 }],
        nextCursor: '   ',
      }))
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'INVALID_RESPONSE',
    });
  });

  it('fetchAllPages rejects non-advancing duplicate cursors', async () => {
    await expect(
      fetchAllPages(async () => ({
        items: [{ id: 1 }],
        nextCursor: 'stuck-cursor',
      }))
    ).rejects.toThrowError(ApiClientError);
  });

  it('enforces maxPages: throws INVALID_RESPONSE if nextCursor remains after page 2, and returns combined items if page 2 has nextCursor: null', async () => {
    await expect(
      fetchAllPages(
        async (cursor) => {
          if (!cursor) {
            return { items: [{ qty: 10 }], nextCursor: 'page-2' };
          }
          return { items: [{ qty: 20 }], nextCursor: 'page-3' };
        },
        { maxPages: 2 }
      )
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'INVALID_RESPONSE',
    });

    const combined = await fetchAllPages(
      async (cursor) => {
        if (!cursor) {
          return { items: [{ qty: 10 }], nextCursor: 'page-2' };
        }
        return { items: [{ qty: 20 }], nextCursor: null };
      },
      { maxPages: 2 }
    );

    expect(combined).toEqual([{ qty: 10 }, { qty: 20 }]);
  });
});
