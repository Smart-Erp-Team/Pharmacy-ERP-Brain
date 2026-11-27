import { expect, test, type Page } from '@playwright/test';
import { BRANCH_ALX_ID, MEDCARE_ORG_CODE } from './helpers/authContext.ts';
import { createBranchViaDialog } from './helpers/formFillers.ts';
import { holdNextRequest } from './helpers/mswBridge.ts';
import {
  loginAsWorkspaceUser,
  trackUncaughtErrors,
} from './helpers/session.ts';

async function fitsViewport(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth
  );
}

test('renders flat username in Sidebar, MEDCARE + Cloud + MED-DT/MED-ALX in Topbar, and aligns grid at 1280px & 1180px', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  await loginAsWorkspaceUser(page, '/products');
  await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();

  const sidebar = page.getByRole('complementary');
  const topbar = page.getByRole('banner');
  await expect(sidebar.getByText('admin@medcare.test')).toBeVisible();
  await expect(sidebar.getByText('Admin', { exact: true })).toBeVisible();
  await expect(
    topbar.getByText(MEDCARE_ORG_CODE, { exact: true })
  ).toBeVisible();
  await expect(topbar.getByText('Cloud', { exact: true })).toBeVisible();

  const branchSelect = topbar.getByLabel('Active branch');
  for (const label of [
    'MED-DT — MedCare - Downtown Flagship',
    'MED-ALX — MedCare - Alexandria Corniche',
  ]) {
    await expect(
      branchSelect.locator('option', { hasText: label })
    ).toBeAttached();
  }
  await branchSelect.selectOption(BRANCH_ALX_ID);
  await expect(branchSelect).toHaveValue(BRANCH_ALX_ID);

  const asideBox = await sidebar.boundingBox();
  const headerBox = await topbar.boundingBox();
  const mainBox = await page.getByRole('main').boundingBox();
  const listBox = await page
    .getByRole('heading', { name: 'Product list' })
    .boundingBox();
  const treeBox = await page
    .getByRole('heading', { name: 'Categories' })
    .boundingBox();
  if (!asideBox || !headerBox || !mainBox || !listBox || !treeBox) {
    throw new Error('Expected shell layout bounding boxes to be measured');
  }

  expect(asideBox.width).toBeCloseTo(248, 0);
  expect(headerBox.height).toBeCloseTo(66, 0);
  expect(mainBox.x).toBeGreaterThanOrEqual(asideBox.x + asideBox.width);
  expect(mainBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  expect(treeBox.x).toBeGreaterThan(listBox.x + 200);
  expect(Math.abs(treeBox.y - listBox.y)).toBeLessThan(40);
  expect(await fitsViewport(page)).toBe(true);

  await page.setViewportSize({ width: 1180, height: 800 });
  const aside1180 = await sidebar.boundingBox();
  const main1180 = await page.getByRole('main').boundingBox();
  const list1180 = await page
    .getByRole('heading', { name: 'Product list' })
    .boundingBox();
  const tree1180 = await page
    .getByRole('heading', { name: 'Categories' })
    .boundingBox();
  if (!aside1180 || !main1180 || !list1180 || !tree1180) {
    throw new Error('Expected 1180px layout bounding boxes to be measured');
  }
  expect(main1180.x).toBeGreaterThanOrEqual(aside1180.x + aside1180.width);
  expect(tree1180.x).toBeGreaterThan(list1180.x + 150);
  expect(await fitsViewport(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('traps Tab and Shift+Tab inside Modal and returns focus on Escape', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  await loginAsWorkspaceUser(page, '/products');

  const trigger = page.getByRole('button', { name: 'Add category' });
  await trigger.focus();
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Add category' });
  await expect(dialog).toBeVisible();
  const closeBtn = dialog.getByRole('button', { name: 'Close dialog' });
  const submitBtn = dialog.getByRole('button', { name: 'Create category' });

  await expect(closeBtn).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(submitBtn).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeBtn).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});

test('locks Escape while branch save is pending and shows ToastHost notice afterward', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  await loginAsWorkspaceUser(page, '/branches');
  const postHold = await holdNextRequest(page, 'POST', '/api/v1/branches');
  await page.getByRole('button', { name: 'Add branch' }).click();

  const dialog = page.getByRole('dialog', { name: 'Add branch' });
  await createBranchViaDialog(dialog, {
    code: 'MED-NEW',
    name: 'MedCare - Heliopolis',
    line1: '10 Nile Street',
    city: 'Cairo',
    countryCode: 'EG',
  });

  await postHold.waitUntilSeen();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  await postHold.release();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name: 'MED-NEW' })).toBeVisible();
  await expect(
    page.getByText('Branch "MedCare - Heliopolis" created')
  ).toBeVisible();
  expect(errors).toEqual([]);
});
