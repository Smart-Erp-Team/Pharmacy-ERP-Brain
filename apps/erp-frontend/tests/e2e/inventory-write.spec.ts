import { expect, test } from '@playwright/test';
import { BRANCH_DT_ID } from './helpers/authContext.ts';
import { loginWithUserContext } from './helpers/session.ts';

const AUGMENTIN_PRODUCT_ID = '6dbdb1a7-c723-da4c-8e0e-b067c18bc710';
const VITAMIN_D3_PRODUCT_ID = '11111111-6666-4111-8111-000000000003';
const MAIN_SELLABLE_LOCATION_ID = '694cb9a9-c19d-3c46-be41-a7fc76fcdc9f';
const DOWNTOWN_OPENING_TXN_ID = '11111111-bbbb-4111-8111-000000000001';

test('Pharmacist on BranchLocal posts atomic immediate adjustment and reverses TXN-2026-000001 via inline modal', async ({
  page,
}) => {
  const errors = await loginWithUserContext(page, {
    role: 'Pharmacist',
    runtime_mode: 'BranchLocal',
    branch_scope: 'ASSIGNED',
    branch_ids: [BRANCH_DT_ID],
  });

  await page.getByRole('link', { name: 'Inventory' }).click();
  await expect(
    page.getByRole('heading', { name: 'Inventory', level: 1 })
  ).toBeVisible();

  await page
    .getByRole('tab', { name: 'Stock Adjustments & Opening Balance' })
    .click();

  // Verify ADJUSTMENT_OUT hides Unit cost input, then switch back to ADJUSTMENT_IN
  await page.getByLabel('Transaction type').selectOption('ADJUSTMENT_OUT');
  const line1 = page.getByRole('group', { name: 'Adjustment line 1' });
  await expect(line1.getByLabel('Unit cost')).toBeHidden();
  await page.getByLabel('Transaction type').selectOption('ADJUSTMENT_IN');
  await expect(line1.getByLabel('Unit cost')).toBeVisible();
  await page.getByLabel('Reason code').fill('E2E_ATOMIC_IN');

  // Line 1: lot-tracked Augmentin (MED-AUG-1000 / MEDCARE-LOT-2601)
  await line1.getByLabel('Product').selectOption(AUGMENTIN_PRODUCT_ID);
  await line1.getByLabel('Location').selectOption(MAIN_SELLABLE_LOCATION_ID);
  await line1.getByLabel('Batch number').fill('MEDCARE-LOT-2601');
  await line1.getByLabel('Quantity').fill('20');
  await line1.getByLabel('Unit cost').fill('7.2');

  // Line 2: non-lot Vitamin D3 (auto-locks batch/expiry fields)
  await page.getByRole('button', { name: 'Add line' }).click();
  const line2 = page.getByRole('group', { name: 'Adjustment line 2' });
  await line2.getByLabel('Product').selectOption(VITAMIN_D3_PRODUCT_ID);
  await expect(line2.getByLabel('Batch number')).toBeDisabled();
  await expect(
    line2.getByText('Non-lot product (automatic NON-LOT batch)')
  ).toBeVisible();
  await line2.getByLabel('Location').selectOption(MAIN_SELLABLE_LOCATION_ID);
  await line2.getByLabel('Quantity').fill('15');
  await line2.getByLabel('Unit cost').fill('65');

  await page.getByRole('button', { name: 'Submit adjustment' }).click();
  await expect(
    page.getByText('Adjustment TXN-2026-000004 posted (ADJUSTMENT_IN)')
  ).toBeVisible();

  // Inspect posted ledger history & open inline LedgerTxnDetailModal for TXN-2026-000001
  await page.getByRole('tab', { name: 'Inventory Ledger History' }).click();
  await expect(
    page.getByRole('row', { name: /TXN-2026-000004/ })
  ).toBeVisible();

  const openingRow = page.getByRole('row', { name: /TXN-2026-000001/ });
  await openingRow.getByRole('button', { name: 'View details' }).click();
  const detailModal = page.getByRole('dialog', { name: 'TXN-2026-000001' });
  await expect(detailModal.getByText('Immutable posted record')).toBeVisible();
  await expect(detailModal.getByText('MEDCARE-LOT-2601')).toBeVisible();
  await detailModal
    .getByRole('button', { name: 'Reverse transaction' })
    .click();

  // Transitions to Stock Adjustments tab prefilled with REVERSAL & hidden lines
  await expect(
    page.getByRole('tab', { name: 'Stock Adjustments & Opening Balance' })
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Transaction type')).toHaveValue('REVERSAL');
  await expect(page.getByLabel('Original transaction to reverse')).toHaveValue(
    DOWNTOWN_OPENING_TXN_ID
  );
  await expect(
    page.getByRole('group', { name: 'Adjustment line 1' })
  ).toBeHidden();

  await page.getByLabel('Reason code').fill('E2E_REVERSE_OPENING');
  await page.getByRole('button', { name: 'Submit adjustment' }).click();
  await expect(
    page.getByText('Adjustment TXN-2026-000005 posted (REVERSAL)')
  ).toBeVisible();

  // Confirm REVERSAL row in ledger history and updated balances (400+20-280=140, 60+15-60=15)
  await page.getByRole('tab', { name: 'Inventory Ledger History' }).click();
  await expect(
    page.getByRole('row', { name: /TXN-2026-000005.*REVERSAL/ })
  ).toBeVisible();

  await page.getByRole('tab', { name: 'Stock Balances & Batches' }).click();
  const augRow = page.getByRole('row', { name: /MED-AUG-1000/ });
  await expect(augRow.getByRole('cell', { name: '140' })).toBeVisible();
  const vitRow = page.getByRole('row', { name: /MED-VIT-D3/ });
  await expect(vitRow.getByRole('cell', { name: '15' }).first()).toBeVisible();

  expect(errors).toEqual([]);
});
