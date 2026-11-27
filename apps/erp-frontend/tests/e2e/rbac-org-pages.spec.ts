import { expect, test } from '@playwright/test';
import { BRANCH_ALX_ID, BRANCH_DT_ID } from './helpers/authContext.ts';
import {
  expectReadOnlyBranchesPage,
  loginWithUserContext,
} from './helpers/session.ts';

test.describe('Stage 1 Org Pages Scope & BranchLocal Read-Only Guards', () => {
  test('Admin+Cloud+ASSIGNED restricts Branches writes and scopes User Accounts to assigned branches', async ({
    page,
  }) => {
    const errors = await loginWithUserContext(page, {
      role: 'Admin',
      runtime_mode: 'Cloud',
      branch_scope: 'ASSIGNED',
      branch_ids: [BRANCH_DT_ID, BRANCH_ALX_ID],
    });

    await page.getByRole('link', { name: 'Branches' }).click();
    await expect(page.getByText('Assigned branch scope')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add branch' })).toBeHidden();
    await expect(
      page.getByRole('switch', { name: /Toggle status/ })
    ).toHaveCount(0);
    const dtRow = page.getByRole('row', { name: /MED-DT/ });
    await expect(dtRow.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(
      dtRow.getByRole('button', { name: 'Enrollment token' })
    ).toBeVisible();

    await page.getByRole('link', { name: 'User Accounts' }).click();
    await expect(
      page.getByText('Assigned branch administration')
    ).toBeVisible();
    const branchFilter = page.getByLabel('Branch filter');
    await expect(branchFilter).toHaveValue(BRANCH_DT_ID);
    await expect(
      branchFilter.locator('option', { hasText: 'All branches' })
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Add user' }).click();
    const userDlg = page.getByRole('dialog', { name: 'Create user account' });
    await expect(
      userDlg.getByLabel('Role').locator('option', { hasText: 'Admin' })
    ).toHaveCount(0);
    const scopeSel = userDlg.getByLabel('Branch scope');
    await expect(scopeSel).toHaveValue('ASSIGNED');
    await expect(scopeSel).toBeDisabled();
    await expect(scopeSel.locator('option', { hasText: 'ALL' })).toHaveCount(0);
    await userDlg.getByRole('button', { name: 'Cancel' }).click();

    expect(errors).toEqual([]);
  });

  test('Admin+BranchLocal opens Branches, Employees, and User Accounts in read-only mode', async ({
    page,
  }) => {
    const errors = await loginWithUserContext(page, {
      role: 'Admin',
      runtime_mode: 'BranchLocal',
      branch_scope: 'ALL',
    });

    await expectReadOnlyBranchesPage(page, 'Read-only mode');

    await page.getByRole('link', { name: 'Employees' }).click();
    await expect(
      page.getByText('Employee changes require the Cloud deployment.')
    ).toBeVisible();
    await expect(page.getByRole('row', { name: /EMP-001/ })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add employee' })
    ).toBeHidden();
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);

    await page.getByRole('link', { name: 'User Accounts' }).click();
    await expect(
      page.getByText('User account changes require the Cloud deployment.')
    ).toBeVisible();
    await expect(
      page.getByRole('row', { name: /admin@medcare\.test/ })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add user' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);

    expect(errors).toEqual([]);
  });
});
