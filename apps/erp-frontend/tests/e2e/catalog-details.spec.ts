import { expect, test, type Page } from '@playwright/test';
import { BRANCH_ALX_ID, BRANCH_DT_ID } from './helpers/authContext.ts';
import { submitSellableUomDialog } from './helpers/formFillers.ts';
import {
  loginAsWorkspaceUser,
  loginWithUserContext,
  openProductReorderTab,
  trackUncaughtErrors,
} from './helpers/session.ts';

const AUGMENTIN = 'Augmentin 1g Film-Coated Tablets';
const saveRuleBtn = (p: Page) =>
  p.getByRole('button', { name: 'Save reorder rule' });

test('shows MEDCARE product details with numeric price/tax, persists edit, and returns to list on reload', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  const btn = (name: string) => page.getByRole('button', { name });
  const hdg = (name: string) => page.getByRole('heading', { name });
  await loginAsWorkspaceUser(page, '/products');

  await btn('Panadol Extra 500mg').click();
  await expect(hdg('Panadol Extra 500mg')).toBeVisible();
  for (const text of ['EGP 2.50', '5%', '(0.05)']) {
    await expect(page.getByText(text)).toBeVisible();
  }

  await btn('Edit product').click();
  const editDialog = page.getByRole('dialog', { name: /Edit Panadol/ });
  await editDialog.getByLabel('SKU').fill('MED-PAN-500-ADV');
  await editDialog.getByLabel('Product name').fill('Panadol Advance 500mg');
  await editDialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(hdg('Panadol Advance 500mg')).toBeVisible();
  await expect(page.getByText('MED-PAN-500-ADV').first()).toBeVisible();

  await btn('Back to products').click();
  await expect(btn('Panadol Advance 500mg')).toBeVisible();
  await btn('Panadol Advance 500mg').click();
  await expect(hdg('Panadol Advance 500mg')).toBeVisible();

  await page.reload();
  await expect(hdg('Product list')).toBeVisible();
  await expect(btn('Panadol Extra 500mg')).toBeVisible();
  expect(errors).toEqual([]);
});

test('enforces base UOM lock, Sellable price clearing, numeric UOM creation, and duplicate UOM conflict', async ({
  page,
}) => {
  const errors = trackUncaughtErrors(page);
  const btn = (name: string) => page.getByRole('button', { name });
  await loginAsWorkspaceUser(page, '/products');
  await btn(AUGMENTIN).click();
  await page.getByRole('tab', { name: 'UOMs & Pricing' }).click();

  const baseRow = page.getByRole('row', { name: /TAB/ });
  await expect(baseRow.getByText('EGP 10.50')).toBeVisible();
  await expect(baseRow.getByRole('switch', { name: /Toggle/ })).toBeDisabled();

  const stripRow = page.getByRole('row', { name: /STRIP/ });
  await stripRow.getByRole('switch', { name: /Toggle status/ }).click();
  await expect(stripRow.getByText('Inactive')).toBeVisible();

  await btn('Add UOM').click();
  const uomDlg = page.getByRole('dialog', { name: 'Add UOM' });
  await uomDlg.getByLabel('UOM code').fill('PACK28');
  await uomDlg.getByLabel('Conversion factor').fill('28');
  await uomDlg.getByLabel('Display name').fill('Hospital Pack of 28');
  const sellSwitch = uomDlg.getByRole('switch', { name: 'Sellable' });
  const priceInput = uomDlg.getByLabel('Sale unit price (EGP)');
  await expect(priceInput).toBeDisabled();
  await sellSwitch.click();
  await priceInput.fill('99.00');
  await sellSwitch.click();
  await expect(priceInput).toBeDisabled();
  await expect(priceInput).toHaveValue('');
  await sellSwitch.click();
  await priceInput.fill('260.5');
  await uomDlg.getByRole('button', { name: 'Add UOM' }).click();
  const packRow = page.getByRole('row', { name: /PACK28/ });
  await expect(packRow).toContainText('EGP 260.50');
  await packRow.getByRole('button', { name: 'Edit' }).click();
  const editUomDlg = page.getByRole('dialog', { name: 'Edit PACK28' });
  await editUomDlg.getByLabel('Conversion factor').fill('30');
  await editUomDlg.getByRole('button', { name: 'Save changes' }).click();
  const historyError =
    /cannot change conversion factor while stock or posted ledger history exists/i;
  await expect(editUomDlg.getByText(historyError)).toBeVisible();
  await editUomDlg.getByRole('button', { name: 'Cancel' }).click();
  await expect(
    packRow.getByRole('cell', { name: '28', exact: true })
  ).toBeVisible();

  await btn('Add UOM').click();
  const dupDlg = page.getByRole('dialog', { name: 'Add UOM' });
  await submitSellableUomDialog(dupDlg, {
    code: 'BOX',
    factor: '14',
    displayName: 'Dup Box',
    price: '138',
  });
  await expect(dupDlg.getByText(/already exists/i)).toBeVisible();
  expect(errors).toEqual([]);
});

test('manages native numeric Branch Reorder Settings, Unavailable AI forecast, and Cashier read-only tab', async ({
  page,
  browser,
}) => {
  const errors = await loginWithUserContext(page, { branch_scope: 'ALL' });
  await openProductReorderTab(page, AUGMENTIN);

  const branchSel = page.getByLabel('Branch', { exact: true });
  await expect(branchSel).toHaveValue(BRANCH_DT_ID);
  await expect(page.getByLabel('Reorder point')).toHaveValue('50');
  await expect(page.getByLabel('Reorder quantity')).toHaveValue('200');
  await expect(page.getByLabel('Maximum stock quantity')).toHaveValue('500');

  await branchSel.selectOption(BRANCH_ALX_ID);
  await expect(page.getByText(/No reorder rule configured yet/)).toBeVisible();
  await page.getByLabel('Reorder point').fill('80');
  await page.getByLabel('Reorder quantity').fill('160');
  await page.getByLabel('Maximum stock quantity').fill('40');
  await saveRuleBtn(page).click();
  await expect(page.getByText(/greater than or equal to/i)).toBeVisible();

  await page.getByLabel('Maximum stock quantity').fill('400');
  await saveRuleBtn(page).click();
  await expect(page.getByText(/Reorder rule saved for/)).toBeVisible();

  await page.getByRole('tab', { name: 'AI Demand Forecast' }).click();
  await expect(page.getByText('Model: Unavailable')).toBeVisible();
  await expect(page.getByText('Predicted demand (Unavailable)')).toBeVisible();

  const cashierCtx = await browser.newContext();
  try {
    const cashier = await cashierCtx.newPage();
    await loginWithUserContext(cashier, { role: 'Cashier' });
    await openProductReorderTab(cashier, AUGMENTIN);
    await expect(cashier.getByText(/Read-only access/)).toBeVisible();
    await expect(cashier.getByLabel('Reorder point')).toBeDisabled();
    await expect(saveRuleBtn(cashier)).toBeHidden();
  } finally {
    await cashierCtx.close();
  }
  expect(errors).toEqual([]);
});
