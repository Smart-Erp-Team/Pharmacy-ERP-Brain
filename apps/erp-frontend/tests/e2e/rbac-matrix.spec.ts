import { expect, test } from '@playwright/test';
import { BRANCH_ALX_ID, BRANCH_DT_ID } from './helpers/authContext.ts';
import {
  loginWithUserContext,
  openProductReorderTab,
} from './helpers/session.ts';

test.describe('Stage 1 Closed 5-Scope Role & Runtime Matrix', () => {
  test('1) Admin+Cloud+ALL sees full nav (incl. Cloud Branch Enrollment) and write UI', async ({
    page,
  }) => {
    const errors = await loginWithUserContext(page, {
      role: 'Admin',
      runtime_mode: 'Cloud',
      branch_scope: 'ALL',
    });
    const nav = page.getByRole('navigation');
    for (const label of [
      'Overview',
      'Products',
      'Inventory',
      'Branch Enrollment',
      'Branches',
      'Employees',
      'User Accounts',
    ]) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
    const branchSel = page.getByLabel('Active branch');
    await expect(branchSel).toHaveValue('');
    for (const code of ['MED-DT', 'MED-ALX']) {
      await expect(
        branchSel.locator('option', { hasText: code })
      ).toBeAttached();
    }
    await page.getByRole('link', { name: 'Products' }).click();
    await expect(
      page.getByRole('button', { name: 'Add product' })
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('2) Admin+Cloud+ASSIGNED locks branch options to MED-DT and MED-ALX', async ({
    page,
  }) => {
    const errors = await loginWithUserContext(page, {
      role: 'Admin',
      runtime_mode: 'Cloud',
      branch_scope: 'ASSIGNED',
      branch_ids: [BRANCH_DT_ID, BRANCH_ALX_ID],
    });
    const topSel = page.getByLabel('Active branch');
    await expect(
      topSel.locator('option', { hasText: 'All branches' })
    ).toHaveCount(0);
    await expect(topSel.locator('option')).toHaveCount(2);
    await openProductReorderTab(page);
    await expect(
      page.getByLabel('Branch', { exact: true }).locator('option')
    ).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('3) Pharmacist+Cloud+ASSIGNED gets 403 on Admin routes and writes catalog', async ({
    page,
  }) => {
    const errors = await loginWithUserContext(page, {
      role: 'Pharmacist',
      runtime_mode: 'Cloud',
      branch_scope: 'ASSIGNED',
      branch_ids: [BRANCH_DT_ID],
    });
    for (const link of ['Branches', 'Employees', 'User Accounts']) {
      await expect(page.getByRole('link', { name: link })).toBeHidden();
    }
    await expect(
      page.getByRole('link', { name: 'Branch Enrollment' })
    ).toBeVisible();
    await page.goto('/branches');
    await expect(page.getByTestId('role-gate-forbidden')).toBeVisible();
    await openProductReorderTab(page);
    await expect(page.getByLabel('Branch', { exact: true })).toContainText(
      'MED-DT'
    );
    await expect(
      page.getByRole('button', { name: 'Save reorder rule' })
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('4) Cashier+BranchLocal hides Enrollment & Adjustments/Ledger and renders read-only Reorder tab', async ({
    page,
  }) => {
    const errors = await loginWithUserContext(page, {
      role: 'Cashier',
      runtime_mode: 'BranchLocal',
      branch_scope: 'ASSIGNED',
      branch_ids: [BRANCH_DT_ID],
    });
    await expect(
      page.getByRole('link', { name: 'Branch Enrollment' })
    ).toBeHidden();
    await page.getByRole('link', { name: 'Products' }).click();
    await expect(
      page.getByText('Catalog changes require the Cloud deployment.')
    ).toBeVisible();
    for (const btn of ['Add product', 'Add category']) {
      await expect(page.getByRole('button', { name: btn })).toBeHidden();
    }
    await openProductReorderTab(page);
    await expect(page.getByLabel('Reorder point')).toBeDisabled();
    await expect(page.getByLabel('Reorder point')).toHaveValue('50');
    await expect(
      page.getByRole('button', { name: 'Save reorder rule' })
    ).toBeHidden();
    await page.getByRole('link', { name: 'Inventory' }).click();
    for (const hidden of [
      'Stock Adjustments & Opening Balance',
      'Inventory Ledger History',
    ]) {
      await expect(page.getByRole('tab', { name: hidden })).toBeHidden();
    }
    expect(errors).toEqual([]);
  });

  test('5) Missing inventory:read scope blocks Products and Inventory', async ({
    page,
  }) => {
    const errors = await loginWithUserContext(page, {
      role: 'Cashier',
      runtime_mode: 'BranchLocal',
      branch_scope: 'ASSIGNED',
      branch_ids: [BRANCH_DT_ID],
      scopes: ['sales:read', 'sales:write'],
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
