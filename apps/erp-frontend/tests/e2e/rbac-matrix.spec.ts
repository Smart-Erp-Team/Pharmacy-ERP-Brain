import { expect, test } from '@playwright/test';
import { BRANCH_ALX_ID, BRANCH_DT_ID } from './helpers/authContext.ts';
import {
  expectReadOnlyBranchesPage,
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

  test('3) Pharmacist+Cloud+ASSIGNED reads Branches, gets 403 on Employees/Users, and writes catalog', async ({
    page,
  }) => {
    const errors = await loginWithUserContext(page, {
      role: 'Pharmacist',
      runtime_mode: 'Cloud',
      branch_scope: 'ASSIGNED',
      branch_ids: [BRANCH_DT_ID],
    });
    for (const link of ['Employees', 'User Accounts']) {
      await expect(page.getByRole('link', { name: link })).toBeHidden();
    }
    for (const link of ['Branches', 'Branch Enrollment']) {
      await expect(page.getByRole('link', { name: link })).toBeVisible();
    }
    await expectReadOnlyBranchesPage(page, 'Read-only access');
    for (const path of ['/employees', '/users']) {
      await page.goto(path);
      await expect(page.getByTestId('role-gate-forbidden')).toBeVisible();
    }
    await openProductReorderTab(page);
    const branchSel = page.getByLabel('Branch', { exact: true });
    await expect(branchSel).toContainText('MED-DT');
    const saveBtn = page.getByRole('button', { name: 'Save reorder rule' });
    await expect(saveBtn).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('4) Cashier+BranchLocal reads Branches, hides Enrollment/Adjustments/Ledger, and renders read-only Reorder', async ({
    page,
  }) => {
    const errors = await loginWithUserContext(page, {
      role: 'Cashier',
      runtime_mode: 'BranchLocal',
      branch_scope: 'ASSIGNED',
      branch_ids: [BRANCH_DT_ID],
    });
    const btn = (name: string) => page.getByRole('button', { name });
    const enroll = page.getByRole('link', { name: 'Branch Enrollment' });
    await expect(enroll).toBeHidden();
    await expectReadOnlyBranchesPage(page, 'Read-only mode');
    await page.getByRole('link', { name: 'Products' }).click();
    const cloudNotice = 'Catalog changes require the Cloud deployment.';
    await expect(page.getByText(cloudNotice)).toBeVisible();
    for (const name of ['Add product', 'Add category']) {
      await expect(btn(name)).toBeHidden();
    }
    await openProductReorderTab(page);
    const reorderPt = page.getByLabel('Reorder point');
    await expect(reorderPt).toBeDisabled();
    await expect(reorderPt).toHaveValue('50');
    await expect(btn('Save reorder rule')).toBeHidden();
    await page.getByRole('link', { name: 'Inventory' }).click();
    const hiddenTabs = [
      'Stock Adjustments & Opening Balance',
      'Inventory Ledger History',
    ];
    for (const tab of hiddenTabs) {
      await expect(page.getByRole('tab', { name: tab })).toBeHidden();
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
