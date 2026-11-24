import { describe, expect, it } from 'vitest';
import { ApiClientError } from './client';
import {
  fetchAllPages,
  parseArrayResult,
  parsePagedResult,
} from './pagination';

describe('pagination helpers', () => {
  it('parsePagedResult accepts valid { items, nextCursor } envelopes', () => {
    const page = parsePagedResult<{ id: string }>(
      { items: [{ id: '1' }], nextCursor: 'opaque-cursor-2' },
      '/inventory/balances'
    );
    expect(page).toEqual({
      items: [{ id: '1' }],
      nextCursor: 'opaque-cursor-2',
    });

    const terminalPage = parsePagedResult<{ id: string }>(
      { items: [], nextCursor: null },
      '/inventory/balances'
    );
    expect(terminalPage).toEqual({ items: [], nextCursor: null });
  });

  it('parsePagedResult rejects bare JSON arrays and malformed envelopes with INVALID_RESPONSE', () => {
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
    expect(() =>
      parsePagedResult({ items: [], nextCursor: 123 }, '/products')
    ).toThrowError(ApiClientError);
  });

  it('parseArrayResult accepts JSON arrays and rejects non-arrays', () => {
    expect(
      parseArrayResult<{ code: string }>([{ code: 'TAB' }], '/uoms')
    ).toEqual([{ code: 'TAB' }]);
    expect(() =>
      parseArrayResult({ items: [] }, '/products/1/uoms')
    ).toThrowError(ApiClientError);
  });

  it('fetchAllPages drains all pages beyond 200 items using nextCursor', async () => {
    const firstPageItems = Array.from({ length: 200 }, (_, i) => ({
      index: i + 1,
    }));
    const secondPageItems = [{ index: 201 }];
    const calls: Array<{ cursor: string | undefined; limit: number }> = [];

    const all = await fetchAllPages(async (cursor, limit) => {
      calls.push({ cursor, limit });
      if (!cursor) {
        return { items: firstPageItems, nextCursor: 'cursor-after-200' };
      }
      return { items: secondPageItems, nextCursor: null };
    });

    expect(calls).toEqual([
      { cursor: undefined, limit: 200 },
      { cursor: 'cursor-after-200', limit: 200 },
    ]);
    expect(all).toHaveLength(201);
    expect(all[200]).toEqual({ index: 201 });
  });

  it('fetchAllPages rejects non-advancing duplicate cursors', async () => {
    await expect(
      fetchAllPages(async () => ({
        items: [{ id: 1 }],
        nextCursor: 'stuck-cursor',
      }))
    ).rejects.toThrowError(ApiClientError);
  });
});
