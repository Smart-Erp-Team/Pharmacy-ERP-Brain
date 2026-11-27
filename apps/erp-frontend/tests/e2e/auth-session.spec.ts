import { expect, test } from '@playwright/test';
import { MEDCARE_ORG_CODE, mockAuthMe } from './helpers/authContext.ts';
import { mockApiError } from './helpers/mswBridge.ts';
import {
  loginAsWorkspaceUser,
  submitLoginForm,
  trackUncaughtErrors,
  waitForMswReady,
} from './helpers/session.ts';

test.describe('@smoke Auth, Service Worker & Session Lifecycle', () => {
  test('registers MSW worker, rejects invalid login, hydrates flat CurrentUser, and returns to requested route', async ({
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

    const loginResPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/v1/auth/login') &&
        res.request().method() === 'POST'
    );
    await submitLoginForm(page);
    const loginJson: unknown = await (await loginResPromise).json();
    expect(typeof loginJson === 'object' && loginJson !== null).toBe(true);
    if (typeof loginJson === 'object' && loginJson !== null) {
      const record = new Map(Object.entries(loginJson));
      expect(record.get('token_type')).toBe('Bearer');
      expect(typeof record.get('access_token')).toBe('string');
      expect(typeof record.get('refresh_token')).toBe('string');
    }

    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
    await expect(page).toHaveURL(/\/products$/);
    await expect(
      page.getByRole('complementary').getByText('admin@medcare.test')
    ).toBeVisible();
    await expect(
      page.getByRole('banner').getByText(MEDCARE_ORG_CODE, { exact: true })
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('persists tokens and MEDCARE org code in sessionStorage only across reload, isolates new tabs, and clears on logout', async ({
    page,
    context,
  }) => {
    const pageErrors = trackUncaughtErrors(page);
    await mockAuthMe(page);
    await loginAsWorkspaceUser(page);

    const storageAudit = await page.evaluate(() => ({
      hasAccessToken: Boolean(
        window.sessionStorage.getItem('erp_access_token')
      ),
      hasRefreshToken: Boolean(
        window.sessionStorage.getItem('erp_refresh_token')
      ),
      orgCode: window.sessionStorage.getItem('erp_organization_code'),
      localKeys: Object.keys(window.localStorage),
    }));
    expect(storageAudit.hasAccessToken).toBe(true);
    expect(storageAudit.hasRefreshToken).toBe(true);
    expect(storageAudit.orgCode).toBe(MEDCARE_ORG_CODE);
    expect(storageAudit.localKeys).toEqual([]);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
    await expect(
      page.getByRole('banner').getByText(MEDCARE_ORG_CODE, { exact: true })
    ).toBeVisible();

    const newTab = await context.newPage();
    await newTab.goto('/products');
    await expect(
      newTab.getByRole('heading', { name: 'Sign in' })
    ).toBeVisible();
    await newTab.close();

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    const afterLogout = await page.evaluate(() => ({
      access: window.sessionStorage.getItem('erp_access_token'),
      refresh: window.sessionStorage.getItem('erp_refresh_token'),
      org: window.sessionStorage.getItem('erp_organization_code'),
    }));
    expect(afterLogout).toEqual({ access: null, refresh: null, org: null });
    expect(pageErrors).toEqual([]);
  });

  test('attempts refresh on 401 and redirects to login with expiry notice when refresh fails', async ({
    page,
  }) => {
    const pageErrors = trackUncaughtErrors(page);
    await mockAuthMe(page);
    await loginAsWorkspaceUser(page);

    await mockApiError(page, {
      method: 'GET',
      path: '/api/v1/branches',
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Access token expired.',
      traceId: 'e2e-trace-401-branches',
    });
    await mockApiError(page, {
      method: 'POST',
      path: '/api/v1/auth/refresh',
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Refresh token is invalid or has already been consumed.',
      traceId: 'e2e-trace-401-refresh',
    });

    const refreshSeen = page.waitForResponse(
      (res) =>
        res.url().includes('/api/v1/auth/refresh') && res.status() === 401
    );
    await page.getByRole('link', { name: 'Branches' }).click();
    await refreshSeen;

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(
      page.getByText('Your session has expired. Please sign in again.')
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});
