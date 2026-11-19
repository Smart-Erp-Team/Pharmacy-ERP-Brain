import { expect, test } from '@playwright/test';
import { BRANCH_CAI_ID } from './helpers/authContext';
import { loginWithUserContext } from './helpers/session';

const PANADOL_PRODUCT_ID = 'e5f6a7b8-3333-4ddd-8b2c-34567890abc1';
const CAIRO_SELL_LOCATION_ID = '2f31c9d4-7070-4a10-8b2d-ce0f1a2b3c14';

test('Pharmacist on BranchLocal posts Panadol adjustment, handles draft lifecycle, and reverses posted transaction', async ({
  page,
}) => {
  const errors = await loginWithUserContext(page, {
    role: 'Pharmacist',
    runtime: 'BranchLocal',
    branch_scope: 'ASSIGNED',
    branch_ids: [BRANCH_CAI_ID],
    scopes: ['inventory:read', 'inventory:write', 'sales:read'],
  });

  await page.getByRole('link', { name: 'Inventory' }).click();
  await expect(
    page.getByRole('heading', { name: 'Inventory', level: 1 })
  ).toBeVisible();

  // 1. Post ADJUSTMENT_IN for Panadol (auto-locks batch to NON-LOT)
  await page
    .getByRole('tab', { name: 'Stock Adjustments & Opening Balance' })
    .click();
  await page.getByLabel('Transaction type').selectOption('ADJUSTMENT_IN');
  await page.getByLabel('Reason code').fill('E2E_PANADOL_IN');

  const line1 = page.getByRole('group', { name: 'Adjustment line 1' });
  await line1.getByLabel('Product').selectOption(PANADOL_PRODUCT_ID);
  await expect(line1.getByLabel('Batch')).toBeDisabled();
  await expect(
    line1.getByText('Locked to NON-LOT (lot tracking not required).')
  ).toBeVisible();

  await line1.getByLabel('Location').selectOption(CAIRO_SELL_LOCATION_ID);
  await line1.getByLabel('Quantity').fill('15');
  await line1.getByLabel('Unit cost (base)').fill('0.85');
  await page.getByRole('button', { name: 'Submit adjustment' }).click();

  // 2. Draft adjustments lifecycle: post or cancel existing draft TXN-2026-000003
  const draftRow = page.getByRole('row', { name: /TXN-2026-000003/ });
  await draftRow.getByRole('button', { name: 'Post adjustment' }).click();
  await expect(page.getByText('No draft adjustments')).toBeVisible();

  // 3. Reverse posted transaction TXN-2026-000002
  await page.getByRole('tab', { name: 'Inventory Ledger History' }).click();
  const postedRow = page.getByRole('row', { name: /TXN-2026-000002/ });
  await postedRow.getByRole('button', { name: 'View details' }).click();

  const detailModal = page.getByRole('dialog');
  await expect(detailModal.getByText('Immutable posted record')).toBeVisible();
  await detailModal
    .getByRole('button', { name: 'Reverse transaction' })
    .click();

  // Transitions cleanly to Stock Adjustments tab prefilled with REVERSAL
  await expect(
    page.getByRole('tab', { name: 'Stock Adjustments & Opening Balance' })
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Transaction type')).toHaveValue('REVERSAL');
  await page.getByLabel('Reason code').fill('E2E_REVERSAL_CONFIRM');
  await page.getByRole('button', { name: 'Submit adjustment' }).click();

  // Confirm reversal appears in ledger history
  await page.getByRole('tab', { name: 'Inventory Ledger History' }).click();
  await expect(page.getByRole('row', { name: /REVERSAL/ })).toBeVisible();

  // Confirm balance updated cleanly in Stock Balances & Batches
  await page.getByRole('tab', { name: 'Stock Balances & Batches' }).click();
  await expect(page.getByRole('cell', { name: '5,490' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '1,015' }).first()).toBeVisible();

  expect(errors).toEqual([]);
});
