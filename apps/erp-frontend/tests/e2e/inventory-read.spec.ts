import { expect, test } from '@playwright/test';
import { BRANCH_CAI_ID } from './helpers/authContext';
import { loginWithUserContext } from './helpers/session';

test('Admin on Cloud inspects FEFO batches, unavailable telemetry, manages locations, and checks Cloud read-only ledger detail', async ({
  page,
}) => {
  const errors = await loginWithUserContext(page, {
    role: 'Admin',
    runtime: 'Cloud',
    branch_scope: 'ALL',
  });

  await page.getByRole('link', { name: 'Inventory' }).click();
  await expect(
    page.getByRole('heading', { name: 'Inventory', level: 1 })
  ).toBeVisible();

  // 1. FEFO batch breakdown on default tab
  await page
    .getByRole('button', {
      name: 'Toggle batch breakdown for Augmentin 1g Tablets',
    })
    .click();
  await expect(page.getByText('AUG-2026-A')).toBeVisible();
  await expect(page.getByText('AUG-2027-B')).toBeVisible();

  // 2. Stock Overview tab explicit Brain telemetry Unavailable alert
  await page.getByRole('tab', { name: 'Stock Overview' }).click();
  await expect(page.getByText('Brain Telemetry — Unavailable')).toBeVisible();

  // 3. Storage Locations tab: create & soft-toggle location
  await page.getByRole('tab', { name: 'Storage Locations' }).click();
  await expect(
    page.getByRole('cell', { name: 'MAIN-SELL', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add Location' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add storage location' });
  await dialog.getByLabel('Location code').fill('CAI-E2E-LOC');
  await dialog.getByLabel('Location name').fill('E2E Test Location');
  await dialog.getByRole('button', { name: 'Create location' }).click();
  await expect(
    page.getByRole('cell', { name: 'CAI-E2E-LOC', exact: true })
  ).toBeVisible();

  await page.getByRole('switch', { name: 'Toggle CAI-E2E-LOC active' }).click();
  await expect(
    page.getByRole('cell', { name: 'CAI-E2E-LOC', exact: true })
  ).toBeHidden();

  // 4. Stock Adjustments & Opening Balance tab shows Cloud read-only notice
  await page
    .getByRole('tab', { name: 'Stock Adjustments & Opening Balance' })
    .click();
  await expect(page.getByText('BranchLocal runtime required')).toBeVisible();

  // 5. Inventory Ledger History: inspect posted record details
  await page.getByRole('tab', { name: 'Inventory Ledger History' }).click();
  const ledgerRow = page.getByRole('row', { name: /TXN-2026-000002/ });
  await ledgerRow.getByRole('button', { name: 'View details' }).click();
  const detailModal = page.getByRole('dialog');
  await expect(detailModal.getByText('Immutable posted record')).toBeVisible();
  await detailModal.getByRole('button', { name: 'Close', exact: true }).click();

  expect(errors).toEqual([]);
});

test('Cashier on BranchLocal sees 3 tabs with read-only locations while write and ledger tabs remain hidden', async ({
  page,
}) => {
  const errors = await loginWithUserContext(page, {
    role: 'Cashier',
    runtime: 'BranchLocal',
    branch_scope: 'ASSIGNED',
    branch_ids: [BRANCH_CAI_ID],
    scopes: ['inventory:read', 'sales:read', 'sales:write'],
  });

  await page.getByRole('link', { name: 'Inventory' }).click();
  await expect(
    page.getByRole('heading', { name: 'Inventory', level: 1 })
  ).toBeVisible();

  // Verify visible tabs
  await expect(page.getByRole('tab', { name: 'Stock Overview' })).toBeVisible();
  await expect(
    page.getByRole('tab', { name: 'Stock Balances & Batches' })
  ).toBeVisible();
  await expect(
    page.getByRole('tab', { name: 'Storage Locations' })
  ).toBeVisible();

  // Verify write and ledger tabs hidden
  await expect(
    page.getByRole('tab', { name: 'Stock Adjustments & Opening Balance' })
  ).toBeHidden();
  await expect(
    page.getByRole('tab', { name: 'Inventory Ledger History' })
  ).toBeHidden();

  // Verify Storage Locations read-only state
  await page.getByRole('tab', { name: 'Storage Locations' }).click();
  await expect(page.getByText('Read-only access')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Location' })).toBeHidden();

  expect(errors).toEqual([]);
});
