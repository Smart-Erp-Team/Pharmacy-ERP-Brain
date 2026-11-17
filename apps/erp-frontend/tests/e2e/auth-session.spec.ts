import { expect, test } from '@playwright/test';
import { mockAuthMe } from './helpers/authContext.ts';
import { mockApiResponse } from './helpers/mswBridge.ts';
import {
  loginAsWorkspaceUser,
  submitLoginForm,
  trackUncaughtErrors,
  waitForMswReady,
} from './helpers/session.ts';

test.describe('@smoke Auth, Service Worker & Session Lifecycle', () => {
  test('registers MSW worker, rejects invalid login, and returns to requested route', async ({
    page,
  }) => {
    const pageErrors = trackUncaughtErrors(page);
    await mockAuthMe(page);

    await page.goto('/products');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await waitForMswReady(page);

    await submitLoginForm(page, { password: 'invalid' });
    await expect(
      page.getByText('Invalid organization code or credentials.')
    ).toBeVisible();

    await submitLoginForm(page);
    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
    await expect(page).toHaveURL(/\/products$/);
    expect(pageErrors).toEqual([]);
  });

  test('persists tokens in sessionStorage only across reload, isolates new tabs, and clears on logout', async ({
    page,
    context,
  }) => {
    const pageErrors = trackUncaughtErrors(page);
    await mockAuthMe(page);
    await loginAsWorkspaceUser(page);

    const storageAudit = await page.evaluate(() => ({
      hasSessionToken: Boolean(
        window.sessionStorage.getItem('erp_access_token')
      ),
      localKeys: Object.keys(window.localStorage),
    }));
    expect(storageAudit.hasSessionToken).toBe(true);
    expect(storageAudit.localKeys).toEqual([]);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();

    const newTab = await context.newPage();
    await newTab.goto('/products');
    await expect(
      newTab.getByRole('heading', { name: 'Sign in' })
    ).toBeVisible();
    await newTab.close();

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    const afterLogoutToken = await page.evaluate(() =>
      window.sessionStorage.getItem('erp_access_token')
    );
    expect(afterLogoutToken).toBeNull();
    expect(pageErrors).toEqual([]);
  });

  test('redirects to login with expiry notice when 401 refresh fails', async ({
    page,
  }) => {
    const pageErrors = trackUncaughtErrors(page);
    await mockAuthMe(page);
    await loginAsWorkspaceUser(page);

    await mockApiResponse(page, {
      method: 'GET',
      path: '/api/v1/branches',
      status: 401,
      body: { error: { code: 'UNAUTHORIZED', message: 'Token expired.' } },
    });
    await mockApiResponse(page, {
      method: 'POST',
      path: '/api/v1/auth/refresh',
      status: 401,
      body: { error: { code: 'UNAUTHORIZED', message: 'Refresh revoked.' } },
    });

    await page.getByRole('link', { name: 'Branches' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(
      page.getByText('Your session has expired. Please sign in again.')
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
