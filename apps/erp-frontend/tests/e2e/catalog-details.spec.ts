import { expect, test } from '@playwright/test';
import {
  BRANCH_ALX_ID,
  BRANCH_CAI_ID,
  mockAuthMe,
} from './helpers/authContext';
import { loginAsWorkspaceUser, trackUncaughtErrors } from './helpers/session';

test('shows product details, persists edit back to table, and returns to list on reload', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  const btn = (name: string) => page.getByRole('button', { name });
  const hdg = (name: string) => page.getByRole('heading', { name });
  await loginAsWorkspaceUser(page, '/products');

  await btn('Panadol 500mg Tablets').click();
  await expect(hdg('Panadol 500mg Tablets')).toBeVisible();
  await expect(page.getByText('14%')).toBeVisible();
  await expect(page.getByText('(0.1400)')).toBeVisible();

  await btn('Edit product').click();
  const editDialog = page.getByRole('dialog', { name: /Edit Panadol/ });
  await editDialog.getByLabel('Product name').fill('Panadol Extra 500mg');
  await editDialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(hdg('Panadol Extra 500mg')).toBeVisible();

  await btn('Back to products').click();
  await expect(btn('Panadol Extra 500mg')).toBeVisible();
  await btn('Panadol Extra 500mg').click();
  await expect(hdg('Panadol Extra 500mg')).toBeVisible();

  await page.reload();
  await expect(hdg('Product list')).toBeVisible();
  await expect(btn('Panadol 500mg Tablets')).toBeVisible();
  expect(errors).toEqual([]);
});

test('enforces base UOM lock, Sellable price clearing, and duplicate UOM conflict', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  await loginAsWorkspaceUser(page, '/products');

  await page
    .getByRole('button', { name: 'Centrum Adults Multivitamin' })
    .click();
  await page.getByRole('tab', { name: 'UOMs & Pricing' }).click();

  const baseRow = page.getByRole('row', { name: /Tablet \(base\)/ });
  await expect(baseRow.getByText('Unavailable')).toBeVisible();
  await expect(
    baseRow.getByRole('switch', { name: 'Toggle status for tablet' })
  ).toBeDisabled();
  await expect(
    page.getByRole('row', { name: /Legacy Bottle of 30/ }).getByText('Inactive')
  ).toBeVisible();

  await page.getByRole('button', { name: 'Add UOM' }).click();
  const uomDialog = page.getByRole('dialog', { name: 'Add UOM' });
  await uomDialog.getByLabel('UOM code').fill('pack20');
  await uomDialog.getByLabel('Conversion factor').fill('20');
  await uomDialog.getByLabel('Display name').fill('Pack of 20');
  const sellableSwitch = uomDialog.getByRole('switch', { name: 'Sellable' });
  const priceInput = uomDialog.getByLabel('Sale unit price (EGP)');
  await expect(priceInput).toBeDisabled();
  await sellableSwitch.click();
  await expect(priceInput).toBeEnabled();
  await priceInput.fill('99.00');
  await sellableSwitch.click();
  await expect(priceInput).toBeDisabled();
  await expect(priceInput).toHaveValue('');
  await sellableSwitch.click();
  await priceInput.fill('150');
  await uomDialog.getByRole('button', { name: 'Add UOM' }).click();
  await expect(page.getByRole('row', { name: /pack20/ })).toContainText(
    'EGP 150.00'
  );

  await page.getByRole('button', { name: 'Back to products' }).click();
  await page.getByRole('button', { name: 'Panadol 500mg Tablets' }).click();
  await page.getByRole('tab', { name: 'UOMs & Pricing' }).click();
  await page.getByRole('button', { name: 'Add UOM' }).click();
  const dupDialog = page.getByRole('dialog', { name: 'Add UOM' });
  await dupDialog.getByLabel('UOM code').fill('box');
  await dupDialog.getByLabel('Conversion factor').fill('10');
  await dupDialog.getByLabel('Display name').fill('Dup Box');
  await dupDialog.getByRole('switch', { name: 'Sellable' }).click();
  await dupDialog.getByLabel('Sale unit price (EGP)').fill('20');
  await dupDialog.getByRole('button', { name: 'Add UOM' }).click();
  await expect(dupDialog.getByText(/already exists/i)).toBeVisible();
  await dupDialog.getByRole('button', { name: 'Cancel' }).click();
  expect(errors).toEqual([]);
});

test('manages Branch Reorder Settings validation/persistence and Unavailable AI forecast', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  await mockAuthMe(page, { branch_scope: 'ALL' });
  await loginAsWorkspaceUser(page, '/products');

  await page.getByRole('button', { name: 'Panadol 500mg Tablets' }).click();
  await page.getByRole('tab', { name: 'Branch Reorder Settings' }).click();

  const branchSelect = page.getByLabel('Branch', { exact: true });
  await expect(branchSelect).toHaveValue(BRANCH_CAI_ID);
  await expect(page.getByLabel('Reorder point')).toHaveValue('200.0000');
  await expect(page.getByLabel('Reorder quantity')).toHaveValue('500.0000');
  await expect(page.getByLabel('Maximum stock quantity')).toHaveValue(
    '1200.0000'
  );

  await branchSelect.selectOption(BRANCH_ALX_ID);
  await expect(
    page.getByText('No reorder rule configured yet for this branch')
  ).toBeVisible();

  await page.getByLabel('Reorder point').fill('300');
  await page.getByLabel('Reorder quantity').fill('600');
  await page.getByLabel('Maximum stock quantity').fill('200');
  await page.getByRole('button', { name: 'Save reorder rule' }).click();
  await expect(
    page.getByText(/greater than or equal to reorder point/i)
  ).toBeVisible();

  await page.getByLabel('Maximum stock quantity').fill('900');
  await page.getByRole('button', { name: 'Save reorder rule' }).click();
  await expect(
    page.getByText('Reorder rule saved for Panadol 500mg Tablets')
  ).toBeVisible();

  await page.getByRole('tab', { name: 'AI Demand Forecast' }).click();
  for (const label of [
    'Model: Unavailable',
    'Seasonal indicator: Unavailable',
    'Actual history (Unavailable)',
    'Predicted demand (Unavailable)',
  ]) {
    await expect(page.getByText(label)).toBeVisible();
  }

  await page.getByRole('tab', { name: 'Branch Reorder Settings' }).click();
  await branchSelect.selectOption(BRANCH_ALX_ID);
  await expect(page.getByLabel('Reorder point')).toHaveValue('300.0000');
  expect(errors).toEqual([]);
});
