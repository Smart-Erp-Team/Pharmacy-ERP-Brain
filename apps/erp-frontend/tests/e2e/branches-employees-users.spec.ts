import { expect, test } from '@playwright/test';
import { BRANCH_CAI_ID } from './helpers/authContext';
import {
  createEmployeeViaDialog,
  fillAddressFields,
} from './helpers/formFillers';
import {
  loginAsWorkspaceUser,
  trackUncaughtErrors,
  waitForMswReady,
} from './helpers/session';

test('manages branches, enrollment tokens, and branch-enrollment runtime modes', async ({
  page,
  context,
  browser,
}) => {
  const errors = trackUncaughtErrors(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loginAsWorkspaceUser(page, '/branches');

  await page.getByRole('button', { name: 'Add branch' }).click();
  const addDialog = page.getByRole('dialog', { name: 'Add branch' });
  await addDialog.getByLabel('Branch code').fill('GIZ-09');
  await addDialog.getByLabel('Branch name').fill('Dokki Flagship');
  await fillAddressFields(addDialog, {
    line1: '10 El Tahrir St',
    city: 'Giza',
    countryCode: 'EG',
  });
  await addDialog.getByRole('button', { name: 'Create branch' }).click();
  await expect(page.getByText('GIZ-09')).toBeVisible();
  await expect(page.getByText('Branch "Dokki Flagship" created')).toBeVisible();

  const cairoRow = page.getByRole('row', { name: /CAI-01/ });
  await cairoRow.getByRole('button', { name: 'Edit' }).click();
  const editDialog = page.getByRole('dialog', { name: /Edit / });
  await expect(editDialog.getByLabel('Branch code')).toBeDisabled();
  await expect(editDialog.getByLabel('Branch code')).toHaveValue('CAI-01');
  await editDialog.getByLabel('Branch name').fill('Cairo Central Branch');
  await editDialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    cairoRow.getByText('Cairo Central Branch', { exact: true })
  ).toBeVisible();

  await cairoRow.getByRole('button', { name: 'Enrollment token' }).click();
  const tokenDialog = page.getByRole('dialog');
  await expect(tokenDialog.getByText(/\dm \d{2}s remaining/)).toBeVisible();
  const tokenCode = tokenDialog.getByText(/^enr_live_/);
  const rawToken = (await tokenCode.textContent())?.trim() ?? '';
  expect(rawToken).toMatch(/^enr_live_cai-01_/);
  await tokenDialog.getByRole('button', { name: 'Copy' }).click();
  await expect(
    tokenDialog.getByRole('button', { name: 'Copied' })
  ).toBeVisible();
  await tokenDialog.getByRole('button', { name: 'Close dialog' }).click();

  await page.goto('/branch-enrollment');
  await expect(page.getByText('Wrong deployment')).toBeVisible();
  await expect(page.getByLabel('Enrollment token')).toBeDisabled();

  const anonContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  try {
    const anonPage = await anonContext.newPage();
    await anonPage.goto('/branch-enrollment');
    await waitForMswReady(anonPage);
    await expect(anonPage.getByText('Wrong deployment')).toBeHidden();
    await expect(anonPage.getByLabel('Enrollment token')).toBeEnabled();
    await anonPage.getByLabel('Enrollment token').fill(rawToken);
    await anonPage
      .getByRole('button', { name: 'Activate branch terminal' })
      .click();
    await expect(anonPage.getByText('Branch terminal enrolled')).toBeVisible();
    await expect(anonPage.getByText('cursor_sync_0001')).toBeVisible();
  } finally {
    await anonContext.close();
  }
  expect(errors).toEqual([]);
});

test('creates and edits employees and manages user lockouts, scopes, and sessions', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  await loginAsWorkspaceUser(page, '/employees');

  await page.getByRole('button', { name: 'Add employee' }).click();
  const empDialog = page.getByRole('dialog', { name: 'Add employee' });
  await createEmployeeViaDialog(empDialog, BRANCH_CAI_ID);
  await expect(page.getByRole('row', { name: /EMP-099/ })).toContainText(
    'Nadia Samir'
  );

  const emp1Row = page.getByRole('row', { name: /EMP-001/ });
  await emp1Row.getByRole('button', { name: 'Edit' }).click();
  const editEmpDialog = page.getByRole('dialog', { name: /Edit / });
  await editEmpDialog
    .getByLabel('Job title (optional)')
    .fill('Chief Pharmacist');
  await editEmpDialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(emp1Row.getByText('Chief Pharmacist')).toBeVisible();

  await page.getByRole('link', { name: 'User Accounts' }).click();
  const monaRow = page.getByRole('row', { name: /ph\.mona/ });
  await expect(monaRow.getByText('Temporarily locked')).toBeVisible();

  await page.getByRole('button', { name: 'Add user' }).click();
  const userDialog = page.getByRole('dialog', { name: 'Create user account' });
  const empSelect = userDialog.getByLabel('Employee');
  await expect(
    empSelect.locator('option', { hasText: 'EMP-003' })
  ).toBeAttached();
  for (const excluded of ['EMP-001', 'EMP-004']) {
    await expect(
      empSelect.locator('option', { hasText: excluded })
    ).toHaveCount(0);
  }

  await empSelect.selectOption('a1111111-1111-4111-8111-111111111103');
  await userDialog.getByLabel('Username').fill('ph.youssef');
  await userDialog.getByLabel('Password').fill('Str0ngPass!23');
  await userDialog.getByLabel('Role').selectOption('Pharmacist');
  const scopeSelect = userDialog.getByLabel('Branch scope');
  await expect(scopeSelect.locator('option')).toHaveCount(1);
  await expect(scopeSelect).toHaveValue('ASSIGNED');
  await userDialog.getByRole('button', { name: /CAI-01/ }).click();
  await userDialog.getByRole('button', { name: 'Create user' }).click();
  await expect(page.getByRole('row', { name: /ph\.youssef/ })).toBeVisible();

  await monaRow.getByRole('button', { name: 'Reset password' }).click();
  const resetDialog = page.getByRole('dialog', { name: /Reset password/ });
  await resetDialog.getByLabel('New password').fill('NewPass!2345');
  await resetDialog.getByLabel('Confirm password').fill('NewPass!2345');
  await resetDialog.getByRole('button', { name: 'Reset password' }).click();
  await expect(resetDialog).toBeHidden();

  await monaRow.getByRole('button', { name: 'Revoke sessions' }).click();
  const revokeDialog = page.getByRole('dialog', { name: /Revoke sessions/ });
  await revokeDialog.getByRole('button', { name: 'Revoke sessions' }).click();
  await expect(
    page.getByText('Active sessions revoked for ph.mona')
  ).toBeVisible();
  expect(errors).toEqual([]);
});
