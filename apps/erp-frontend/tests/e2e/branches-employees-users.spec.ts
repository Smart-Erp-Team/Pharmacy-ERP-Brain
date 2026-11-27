import { expect, test } from '@playwright/test';
import { BRANCH_DT_ID } from './helpers/authContext.ts';
import {
  createBranchViaDialog,
  createEmployeeViaDialog,
  createPharmacistUserViaDialog,
  issueAndCopyBranchToken,
  submitResetPasswordDialog,
} from './helpers/formFillers.ts';
import {
  loginAsWorkspaceUser,
  loginWithUserContext,
  trackUncaughtErrors,
} from './helpers/session.ts';

const EMP_003_ID = '11111111-3333-4111-8111-000000000003';

test('manages MEDCARE branches, enrollment tokens, and Cloud vs BranchLocal enrollment modes', async ({
  page,
  context,
  browser,
}) => {
  const errors = trackUncaughtErrors(page);
  const dlg = (name: string | RegExp) => page.getByRole('dialog', { name });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loginAsWorkspaceUser(page, '/branches');

  await expect(page.getByRole('row', { name: /MED-ALX/ })).toBeVisible();
  await page.getByRole('button', { name: 'Add branch' }).click();
  await createBranchViaDialog(dlg('Add branch'), {
    code: 'MED-HEL',
    name: 'MedCare - Heliopolis',
    line1: '10 El Merghani St',
    city: 'Cairo',
    countryCode: 'EG',
  });
  await expect(page.getByRole('cell', { name: 'MED-HEL' })).toBeVisible();

  const dtRow = page.getByRole('row', { name: /MED-DT/ });
  await dtRow.getByRole('button', { name: 'Edit' }).click();
  const editDlg = dlg(/Edit /);
  await expect(editDlg.getByLabel('Branch code')).toBeDisabled();
  await expect(editDlg.getByLabel('Branch code')).toHaveValue('MED-DT');
  await editDlg.getByLabel('Branch name').fill('MedCare - Downtown Main');
  await editDlg.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    dtRow.getByText('MedCare - Downtown Main', { exact: true })
  ).toBeVisible();

  const rawToken = await issueAndCopyBranchToken(dtRow, page);
  expect(rawToken).toMatch(/^enr_live_med-dt_/);

  await page.getByRole('link', { name: 'Branch Enrollment' }).click();
  await page.getByLabel('Enrollment token').fill(rawToken);
  await page.getByRole('button', { name: 'Activate branch terminal' }).click();
  await expect(page.getByText('Branch terminal enrolled')).toBeVisible();
  await expect(page.getByText(/^rc_live_branch_device_/)).toBeVisible();

  const localCtx = await browser.newContext();
  try {
    const local = await localCtx.newPage();
    await loginWithUserContext(local, {
      role: 'Cashier',
      runtime_mode: 'BranchLocal',
    });
    await local.goto('/branch-enrollment');
    await expect(local.getByText('Wrong deployment')).toBeVisible();
    await expect(local.getByLabel('Enrollment token')).toBeDisabled();
  } finally {
    await localCtx.close();
  }
  expect(errors).toEqual([]);
});

test('enforces required job_title, 12-char passwords, branch_ids editing, and self-edit protection', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  const row = (re: RegExp) => page.getByRole('row', { name: re });
  const dlg = (name: string | RegExp) => page.getByRole('dialog', { name });
  await loginAsWorkspaceUser(page, '/employees');

  for (const code of ['EMP-001', 'EMP-002', 'EMP-003']) {
    await expect(row(new RegExp(code))).toBeVisible();
  }
  await page.getByRole('button', { name: 'Add employee' }).click();
  const empDlg = dlg('Add employee');
  await empDlg.getByRole('button', { name: 'Create employee' }).click();
  await expect(empDlg.getByText('Job title is required')).toBeVisible();
  await createEmployeeViaDialog(empDlg, BRANCH_DT_ID);
  await expect(row(/EMP-099/)).toContainText('Nadia Samir');

  const emp1 = row(/EMP-001/);
  await emp1.getByRole('button', { name: 'Edit' }).click();
  await dlg(/Edit /).getByLabel('Job title').fill('Chief Pharmacy Director');
  await dlg(/Edit /).getByRole('button', { name: 'Save changes' }).click();
  await expect(emp1.getByText('Chief Pharmacy Director')).toBeVisible();

  await page.getByRole('link', { name: 'User Accounts' }).click();
  const adminRow = row(/admin@medcare\.test/);
  await expect(adminRow.getByRole('switch', { name: /Toggle/ })).toBeDisabled();
  await adminRow.getByRole('button', { name: 'Edit' }).click();
  const selfDlg = dlg('Edit admin@medcare.test');
  await expect(selfDlg.getByText('Self-account protection')).toBeVisible();
  await expect(selfDlg.getByLabel('Role')).toBeDisabled();
  await selfDlg.getByRole('button', { name: 'Cancel' }).click();

  const monaRow = row(/ph\.mona@medcare\.test/);
  await expect(monaRow.getByText('Temporarily locked')).toBeVisible();
  await monaRow.getByRole('button', { name: 'Edit' }).click();
  await dlg(/Edit ph\.mona/)
    .getByRole('button', { name: /MED-ALX/ })
    .click();
  await dlg(/Edit ph\.mona/)
    .getByRole('button', { name: 'Save changes' })
    .click();
  await expect(monaRow.getByText('MED-DT, MED-ALX')).toBeVisible();

  await page.getByRole('button', { name: 'Add user' }).click();
  const userDlg = dlg('Create user account');
  const empSel = userDlg.getByLabel('Employee');
  await expect(empSel.locator('option', { hasText: 'EMP-003' })).toBeAttached();
  await expect(empSel.locator('option', { hasText: 'EMP-001' })).toHaveCount(0);
  await createPharmacistUserViaDialog(userDlg, {
    employeeId: EMP_003_ID,
    username: 'ph.karim@medcare.test',
    shortPassword: 'short',
    validPassword: 'MedCarePass!12',
    branchPattern: /MED-DT/,
  });
  await expect(row(/ph\.karim@medcare\.test/)).toBeVisible();

  await monaRow.getByRole('button', { name: 'Reset password' }).click();
  await submitResetPasswordDialog(dlg(/Reset password/), 'NewMedCare!12');
  await expect(dlg(/Reset password/)).toBeHidden();

  await monaRow.getByRole('button', { name: 'Revoke sessions' }).click();
  await dlg(/Revoke/)
    .getByRole('button', { name: 'Revoke sessions' })
    .click();
  await expect(
    page.getByText('Active sessions revoked for ph.mona@medcare.test')
  ).toBeVisible();
  expect(errors).toEqual([]);
});
