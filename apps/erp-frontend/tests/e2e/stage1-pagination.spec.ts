import { expect, test } from '@playwright/test';
import { BRANCH_DT_ID } from './helpers/authContext.ts';
import { mockApiResponse } from './helpers/mswBridge.ts';
import { loginAsWorkspaceUser } from './helpers/session.ts';

for (const [link, endpoint, id] of [
  ['Products', 'products', 'product_id'],
  ['Branches', 'branches', 'branch_id'],
  ['User Accounts', 'users', 'user_id'],
  ['Inventory', 'inventory/transactions', 'inventory_txn_id'],
]) {
  test(
    link + ' uses numbered pages when the cursor is null',
    async ({ page }) => {
      await loginAsWorkspaceUser(page);
      const path = '/api/v1/' + endpoint;
      const first = await page.evaluate(
        async (url) => {
          const data: unknown = await (await fetch(url)).json();
          if (
            !data ||
            typeof data !== 'object' ||
            !('items' in data) ||
            !Array.isArray(data.items)
          )
            throw new Error('Expected paged fixtures');
          const item: unknown = data.items[0];
          if (!item || typeof item !== 'object')
            throw new Error('Missing fixture row');
          return Object.fromEntries(Object.entries(item));
        },
        path + '?branch_id=' + BRANCH_DT_ID
      );
      const rows = Array.from({ length: 26 }, (_, i) => ({
        ...first,
        [id]: '11111111-2222-4111-8111-' + String(i + 100).padStart(12, '0'),
      }));
      const mockPage = (n: number) =>
        mockApiResponse(page, {
          method: 'GET',
          path,
          status: 200,
          body: {
            items: n === 1 ? rows.slice(0, 25) : rows.slice(25),
            page: n,
            page_size: 25,
            total_count: 26,
            next_cursor: null,
          },
        });
      await mockPage(1);
      await page.getByRole('link', { name: link, exact: true }).click();
      if (link === 'Inventory')
        await page
          .getByRole('tab', { name: 'Inventory Ledger History' })
          .click();
      const next = page.getByRole('button', { name: 'Next page' });
      await expect(next).toBeEnabled();
      await mockPage(2);
      const request = page.waitForRequest((req) => {
        const url = new URL(req.url());
        return url.pathname === path && url.searchParams.get('page') === '2';
      });
      await next.click();
      await request;
      await expect(next).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Previous page' })
      ).toBeEnabled();
    }
  );
}
