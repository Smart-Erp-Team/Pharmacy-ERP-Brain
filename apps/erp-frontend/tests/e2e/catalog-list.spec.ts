import { expect, test } from '@playwright/test';
import { loginAsWorkspaceUser, trackUncaughtErrors } from './helpers/session';

test('filters products via category tree toggle and Include inactive auto-clear', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  await loginAsWorkspaceUser(page, '/products');

  const tree = page.getByRole('list', { name: 'Product categories' });
  const categorySelect = page.getByLabel('Category');
  const analgesicsBtn = tree.getByRole('button', {
    name: /^Analgesics CAT-ANA/,
  });

  await analgesicsBtn.click();
  await expect(categorySelect).toHaveValue(
    'c9d8e7f6-4444-4d55-8e66-cbccddeeffbb'
  );
  await expect(
    page.getByRole('button', { name: 'Panadol 500mg Tablets' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Augmentin 1g Tablets' })
  ).toBeHidden();

  await analgesicsBtn.click();
  await expect(categorySelect).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Augmentin 1g Tablets' })
  ).toBeVisible();

  await expect(
    page.getByRole('button', { name: 'Legacy Aspirin 75mg Tablets' })
  ).toBeHidden();
  const inactiveSwitch = page.getByRole('switch', {
    name: 'Include inactive',
  });
  await inactiveSwitch.click();
  await expect(
    page.getByRole('button', { name: 'Legacy Aspirin 75mg Tablets' })
  ).toBeVisible();

  await tree.getByRole('button', { name: /^Discontinued Seasonal/ }).click();
  await expect(categorySelect).toHaveValue(
    'c9d8e7f6-4444-4d55-8e66-cbccddeeffbf'
  );

  await inactiveSwitch.click();
  await expect(categorySelect).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Legacy Aspirin 75mg Tablets' })
  ).toBeHidden();
  expect(errors).toEqual([]);
});

test('prevents category cycles on Edit Analgesics and reports duplicate CAT-ANA conflict', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  await loginAsWorkspaceUser(page, '/products');

  await page.getByRole('button', { name: 'Edit Analgesics' }).click();
  const editCatDialog = page.getByRole('dialog', { name: 'Edit Analgesics' });
  const parentOptions = editCatDialog
    .getByLabel('Parent category')
    .locator('option');
  await expect(parentOptions.filter({ hasText: 'Analgesics' })).toHaveCount(0);
  await expect(
    parentOptions.filter({ hasText: 'Pediatric Analgesics' })
  ).toHaveCount(0);
  await editCatDialog.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Add category' }).click();
  const addCatDialog = page.getByRole('dialog', { name: 'Add category' });
  await addCatDialog.getByLabel('Category code').fill('CAT-ANA');
  await addCatDialog.getByLabel('Category name').fill('Duplicate Analgesics');
  await addCatDialog.getByRole('button', { name: 'Create category' }).click();
  await expect(addCatDialog.getByText(/already exists/i)).toBeVisible();
  await addCatDialog.getByRole('button', { name: 'Cancel' }).click();
  expect(errors).toEqual([]);
});

test('creates product with 14% tax and Sellable price rule, handles conflicts, and locks Augmentin lot tracking', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  await loginAsWorkspaceUser(page, '/products');

  await page.getByRole('button', { name: 'Add product' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add product' });

  await dialog.getByLabel('Base UOM code').fill('tablet');
  await dialog.getByLabel('Display name').fill('Tablet (base)');
  const priceInput = dialog.getByLabel('Sale unit price');
  await priceInput.fill('10.00');
  const sellableSwitch = dialog.getByRole('switch', { name: 'Sellable' });
  await sellableSwitch.click();
  await expect(priceInput).toBeDisabled();
  await expect(priceInput).toHaveValue('');
  await sellableSwitch.click();
  await expect(priceInput).toBeEnabled();
  await priceInput.fill('5.50');

  await dialog
    .getByLabel('Category')
    .selectOption('c9d8e7f6-4444-4d55-8e66-cbccddeeffbb');
  await dialog.getByLabel('SKU').fill('ANA-PCM-500-TAB');
  await dialog.getByLabel('Product name').fill('Duplicate Panadol');
  await dialog.getByLabel('Tax rate (%)').fill('14');
  await dialog.getByRole('button', { name: 'Create product' }).click();
  await expect(dialog.getByText(/already exists/i)).toBeVisible();

  await dialog.getByLabel('SKU').fill('ANA-IBU-400-TAB');
  await dialog.getByLabel('Product name').fill('Ibuprofen 400mg Tablets');
  await dialog.getByRole('button', { name: 'Create product' }).click();

  const ibuRow = page.getByRole('row', { name: /Ibuprofen 400mg Tablets/ });
  await expect(ibuRow).toBeVisible();
  await expect(ibuRow.getByText('14%')).toBeVisible();

  const augRow = page.getByRole('row', { name: /Augmentin 1g Tablets/ });
  await augRow.getByRole('button', { name: 'Edit' }).click();
  const editDialog = page.getByRole('dialog', {
    name: /Edit Augmentin 1g Tablets/,
  });
  await expect(editDialog.getByLabel('SKU')).toBeDisabled();
  await expect(editDialog.getByLabel('Base UOM')).toBeDisabled();
  const saveBtn = editDialog.getByRole('button', { name: 'Save changes' });
  await expect(saveBtn).toBeDisabled();

  await editDialog
    .getByRole('switch', { name: 'Lot tracking required' })
    .click();
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
  await expect(
    editDialog.getByText(
      'Cannot change lot tracking while stock or posted ledger history exists.'
    )
  ).toBeVisible();
  await editDialog.getByRole('button', { name: 'Cancel' }).click();
  expect(errors).toEqual([]);
});
