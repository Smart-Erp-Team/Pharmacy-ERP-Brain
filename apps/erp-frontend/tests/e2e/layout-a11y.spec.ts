import { expect, test } from '@playwright/test';
import { holdNextRequest } from './helpers/mswBridge';
import { loginAsWorkspaceUser, trackUncaughtErrors } from './helpers/session';

test('keeps sidebar, topbar, main column, and product grid aligned at 1280px and 1180px', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  await loginAsWorkspaceUser(page, '/products');

  await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();

  const asideBox = await page.locator('aside').boundingBox();
  const headerBox = await page.locator('header').first().boundingBox();
  const mainBox = await page.getByRole('main').boundingBox();
  const listHeadingBox = await page
    .getByRole('heading', { name: 'Product list' })
    .boundingBox();
  const treeHeadingBox = await page
    .getByRole('heading', { name: 'Categories' })
    .boundingBox();

  if (
    !asideBox ||
    !headerBox ||
    !mainBox ||
    !listHeadingBox ||
    !treeHeadingBox
  ) {
    throw new Error('Expected shell layout bounding boxes to be measured');
  }

  expect(asideBox.width).toBeCloseTo(248, 0);
  expect(headerBox.height).toBeCloseTo(66, 0);
  expect(mainBox.x).toBeGreaterThanOrEqual(asideBox.x + asideBox.width);
  expect(mainBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  expect(treeHeadingBox.x).toBeGreaterThan(listHeadingBox.x + 200);
  expect(Math.abs(treeHeadingBox.y - listHeadingBox.y)).toBeLessThan(40);

  const fits1280 = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth
  );
  expect(fits1280).toBe(true);

  await page.setViewportSize({ width: 1180, height: 800 });

  const aside1180 = await page.locator('aside').boundingBox();
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

  const fits1180 = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth
  );
  expect(fits1180).toBe(true);
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
  await dialog.getByLabel('Branch code').fill('CAI-99');
  await dialog.getByLabel('Branch name').fill('Slow Network Branch');
  await dialog.getByLabel('Address line 1').fill('10 Nile Street');
  await dialog.getByLabel('City').fill('Cairo');
  await dialog.getByLabel('Country code').fill('EG');
  await dialog.getByRole('button', { name: 'Create branch' }).click();

  await postHold.waitUntilSeen();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();

  await postHold.release();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('CAI-99')).toBeVisible();
  await expect(
    page.getByText('Branch "Slow Network Branch" created')
  ).toBeVisible();
  expect(errors).toEqual([]);
});
