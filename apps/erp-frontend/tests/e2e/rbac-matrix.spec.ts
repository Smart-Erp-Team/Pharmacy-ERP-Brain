import { expect, test } from '@playwright/test';
import { BRANCH_ALX_ID, BRANCH_CAI_ID } from './helpers/authContext.ts';
import {
  loginWithUserContext,
  openPanadolReorderTab,
} from './helpers/session.ts';

test.describe('Role, Runtime & Scope Matrix', () => {
  test('1) Admin+Cloud+ALL sees full nav and write UI', async ({ page }) => {
    const errors = await loginWithUserContext(page, {
      role: 'Admin',
      runtime: 'Cloud',
      branch_scope: 'ALL',
    });
    const nav = page.getByRole('navigation');
    for (const label of [
      'Overview',
      'Products',
      'Inventory',
      'Branches',
      'Employees',
      'User Accounts',
    ]) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
    await expect(
      nav.getByRole('link', { name: 'Branch Enrollment' })
    ).toBeHidden();
    const branchSel = page.getByLabel('Active branch');
    await expect(branchSel).toHaveValue('');
    await expect(
      branchSel.locator('option', { hasText: 'CAI-01' })
    ).toBeAttached();
    await page.getByRole('link', { name: 'Products' }).click();
    await expect(
      page.getByRole('button', { name: 'Add product' })
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('2) Admin+Cloud+ASSIGNED locks branch options', async ({ page }) => {
    const errors = await loginWithUserContext(page, {
      role: 'Admin',
      runtime: 'Cloud',
      branch_scope: 'ASSIGNED',
      branch_ids: [BRANCH_CAI_ID, BRANCH_ALX_ID],
    });
    const topSel = page.getByLabel('Active branch');
    await expect(
      topSel.locator('option', { hasText: 'All branches' })
    ).toHaveCount(0);
    await expect(topSel.locator('option')).toHaveCount(2);
    await openPanadolReorderTab(page);
    await expect(
      page.getByLabel('Branch', { exact: true }).locator('option')
    ).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('3) Pharmacist+Cloud+ASSIGNED gets 403 on Branches', async ({
    page,
  }) => {
    const errors = await loginWithUserContext(page, {
      role: 'Pharmacist',
      runtime: 'Cloud',
      branch_scope: 'ASSIGNED',
      branch_ids: [BRANCH_CAI_ID],
      scopes: ['inventory:read', 'inventory:write'],
    });
    for (const link of ['Branches', 'User Accounts']) {
      await expect(page.getByRole('link', { name: link })).toBeHidden();
    }
    await page.goto('/branches');
    await expect(page.getByTestId('role-gate-forbidden')).toBeVisible();
    await page.goto('/products');
    await expect(
      page.getByRole('button', { name: 'Add product' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Panadol 500mg Tablets' }).click();
    await page.getByRole('tab', { name: 'Branch Reorder Settings' }).click();
    await expect(page.getByLabel('Branch', { exact: true })).toContainText(
      'Branch d4e5f6a7'
    );
    expect(errors).toEqual([]);
  });

  test('4) Cashier+BranchLocal sees enrollment & read-only', async ({
    page,
  }) => {
    const errors = await loginWithUserContext(page, {
      role: 'Cashier',
      runtime: 'BranchLocal',
      branch_scope: 'ASSIGNED',
      branch_ids: [BRANCH_CAI_ID],
      scopes: ['inventory:read'],
    });
    await expect(
      page.getByRole('link', { name: 'Branch Enrollment' })
    ).toBeVisible();
    await page.getByRole('link', { name: 'Products' }).click();
    await expect(
      page.getByText('Catalog changes require the Cloud deployment.')
    ).toHaveCount(1);
    for (const btn of ['Add product', 'Add category']) {
      await expect(page.getByRole('button', { name: btn })).toBeHidden();
    }
    await page.getByRole('button', { name: 'Panadol 500mg Tablets' }).click();
    await expect(
      page.getByRole('tab', { name: 'Branch Reorder Settings' })
    ).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('5) Missing inventory:read blocks Products/Inventory', async ({
    page,
  }) => {
    const errors = await loginWithUserContext(page, {
      role: 'Cashier',
      runtime: 'BranchLocal',
      branch_scope: 'ASSIGNED',
      branch_ids: [BRANCH_CAI_ID],
      scopes: ['sales:read'],
    });
    for (const link of ['Products', 'Inventory']) {
      await expect(page.getByRole('link', { name: link })).toBeHidden();
      await page.goto(`/${link.toLowerCase()}`);
      await expect(page.getByTestId('role-gate-forbidden')).toBeVisible();
      await expect(
        page.getByText('Required permissions: inventory:read')
      ).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});
