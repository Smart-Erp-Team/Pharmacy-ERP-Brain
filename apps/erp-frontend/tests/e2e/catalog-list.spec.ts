import { expect, test } from '@playwright/test';
import {
  loginAsWorkspaceUser,
  trackUncaughtErrors,
} from './helpers/session.ts';

const CAT_PEN_ID = '11111111-5555-4111-8111-000000000002';
const CAT_ANA_ID = '11111111-5555-4111-8111-000000000003';
const CAT_ARCH_ID = '11111111-5555-4111-8111-000000000005';
const AUGMENTIN = 'Augmentin 1g Film-Coated Tablets';
const DISCONTINUED = 'Discontinued Cough Syrup';

test('filters MEDCARE products via category tree toggle and Include inactive auto-clear', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  const btn = (name: string) => page.getByRole('button', { name });
  await loginAsWorkspaceUser(page, '/products');

  const tree = page.getByRole('list', { name: 'Product categories' });
  const categorySelect = page.getByLabel('Category');
  const penBtn = tree.getByRole('button', { name: /^Penicillins CAT-ANT-PEN/ });

  await tree.getByRole('button', { name: /^Analgesics CAT-ANA/ }).click();
  await expect(categorySelect).toHaveValue(CAT_ANA_ID);
  await expect(btn('Panadol Extra 500mg')).toBeVisible();
  await expect(btn(AUGMENTIN)).toBeHidden();
  await expect(btn('Vitamin D3 5000 IU')).toBeHidden();

  await penBtn.click();
  await expect(categorySelect).toHaveValue(CAT_PEN_ID);
  await expect(btn(AUGMENTIN)).toBeVisible();

  await penBtn.click();
  await expect(categorySelect).toHaveValue('');
  await expect(btn('Vitamin D3 5000 IU')).toBeVisible();

  await expect(btn(DISCONTINUED)).toBeHidden();
  const inactiveSwitch = page.getByRole('switch', { name: 'Include inactive' });
  await inactiveSwitch.click();
  await expect(btn(DISCONTINUED)).toBeVisible();

  await tree
    .getByRole('button', { name: /^Archived Catalog CAT-ARCH/ })
    .click();
  await expect(categorySelect).toHaveValue(CAT_ARCH_ID);

  await inactiveSwitch.click();
  await expect(categorySelect).toHaveValue('');
  await expect(btn(DISCONTINUED)).toBeHidden();
  expect(errors).toEqual([]);
});

test('prevents category cycles on Edit Antibiotics and reports duplicate CAT-ANA conflict', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  await loginAsWorkspaceUser(page, '/products');

  await page.getByRole('button', { name: 'Edit Antibiotics' }).click();
  const editCat = page.getByRole('dialog', { name: 'Edit Antibiotics' });
  await expect(editCat.getByLabel('Category code')).toBeDisabled();
  await expect(editCat.getByLabel('Category code')).toHaveValue('CAT-ANT');
  const parentOptions = editCat.getByLabel('Parent category').locator('option');
  await expect(parentOptions.filter({ hasText: 'Antibiotics' })).toHaveCount(0);
  await expect(parentOptions.filter({ hasText: 'Penicillins' })).toHaveCount(0);
  await editCat.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Add category' }).click();
  const addCat = page.getByRole('dialog', { name: 'Add category' });
  await addCat.getByLabel('Category code').fill('CAT-ANA');
  await addCat.getByLabel('Category name').fill('Duplicate Analgesics');
  await addCat.getByRole('button', { name: 'Create category' }).click();
  await expect(addCat.getByText(/already exists/i)).toBeVisible();
  await addCat.getByRole('button', { name: 'Cancel' }).click();
  expect(errors).toEqual([]);
});

test('creates product with native numeric tax/price, handles SKU conflict, and locks Augmentin lot tracking', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  await loginAsWorkspaceUser(page, '/products');

  await page.getByRole('button', { name: 'Add product' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add product' });

  await dialog.getByLabel('Base UOM code').fill('TAB');
  await dialog.getByLabel('Display name').fill('Tablet');
  const priceInput = dialog.getByLabel('Sale unit price');
  await priceInput.fill('10.00');
  const sellableSwitch = dialog.getByRole('switch', { name: 'Sellable' });
  await sellableSwitch.click();
  await expect(priceInput).toBeDisabled();
  await expect(priceInput).toHaveValue('');
  await sellableSwitch.click();
  await priceInput.fill('8.75');

  await dialog.getByLabel('Category').selectOption(CAT_ANA_ID);
  await dialog.getByLabel('SKU').fill('MED-PAN-500');
  await dialog.getByLabel('Product name').fill('Duplicate Panadol');
  await dialog.getByLabel('Tax rate (%)').fill('14');
  await dialog.getByRole('button', { name: 'Create product' }).click();
  await expect(dialog.getByText(/already exists/i)).toBeVisible();

  await dialog.getByLabel('SKU').fill('MED-IBU-400');
  await dialog.getByLabel('Product name').fill('Ibuprofen 400mg Tablets');
  const createRes = page.waitForResponse(
    (res) =>
      res.url().includes('/api/v1/products') &&
      res.request().method() === 'POST' &&
      res.status() === 201
  );
  await dialog.getByRole('button', { name: 'Create product' }).click();
  const reqBody: unknown = (await createRes).request().postDataJSON();
  if (typeof reqBody !== 'object' || reqBody === null) {
    throw new Error('Expected JSON product creation payload');
  }
  expect(new Map(Object.entries(reqBody)).get('tax_rate')).toBe(0.14);

  const ibuRow = page.getByRole('row', { name: /Ibuprofen 400mg Tablets/ });
  await expect(ibuRow).toBeVisible();
  await expect(ibuRow.getByText('14%')).toBeVisible();

  await page
    .getByRole('row', { name: /MED-AUG-1000/ })
    .getByRole('button', { name: 'Edit' })
    .click();
  const editDlg = page.getByRole('dialog', { name: /Edit Augmentin/ });
  await expect(editDlg.getByLabel('SKU')).toBeEnabled();
  await expect(editDlg.getByLabel('Base UOM')).toBeEnabled();
  const saveBtn = editDlg.getByRole('button', { name: 'Save changes' });
  await expect(saveBtn).toBeDisabled();
  await editDlg.getByRole('switch', { name: 'Lot tracking required' }).click();
  await saveBtn.click();
  await expect(
    editDlg.getByText(
      'Cannot change lot tracking while stock or posted ledger history exists.'
    )
  ).toBeVisible();
  expect(errors).toEqual([]);
});
