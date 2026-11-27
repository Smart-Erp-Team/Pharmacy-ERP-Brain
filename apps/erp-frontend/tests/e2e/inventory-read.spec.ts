import { expect, test } from '@playwright/test';
import { BRANCH_ALX_ID, BRANCH_DT_ID } from './helpers/authContext.ts';
import {
  loginAsWorkspaceUser,
  loginWithUserContext,
} from './helpers/session.ts';

test('Admin on Cloud inspects MEDCARE FEFO batches, filters & creates DAMAGED location, and views inline ledger modal', async ({
  page,
}) => {
  const errors = await loginWithUserContext(page, {
    role: 'Admin',
    runtime_mode: 'Cloud',
    branch_scope: 'ALL',
  });

  await page.getByRole('link', { name: 'Inventory' }).click();
  await expect(
    page.getByRole('heading', { name: 'Inventory', level: 1 })
  ).toBeVisible();

  // 1. FEFO batch breakdown on default Stock Balances & Batches tab
  const augRow = page.getByRole('row', { name: /MED-AUG-1000/ });
  await expect(augRow.getByText('400')).toBeVisible();
  await expect(augRow.getByText('350')).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Toggle batch breakdown for Augmentin 1g Film-Coated Tablets',
    })
    .click();
  await expect(page.getByText('MEDCARE-LOT-EXP')).toBeVisible();
  await expect(
    page
      .getByRole('row', { name: /MEDCARE-LOT-EXP/ })
      .getByText('Expired', { exact: true })
  ).toBeVisible();
  await expect(page.getByText('MEDCARE-LOT-2602')).toBeVisible();
  await expect(page.getByText('MEDCARE-LOT-2601')).toBeVisible();

  const storageFilter = page.getByLabel('Storage location');
  await storageFilter.selectOption('11111111-9999-4111-8111-000000000003');
  await expect(page.getByRole('row', { name: /MED-AUG-1000/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /MED-PAN-500/ })).toBeHidden();
  await storageFilter.selectOption('');
  await expect(page.getByRole('row', { name: /MED-PAN-500/ })).toBeVisible();

  // 2. Stock Overview tab explicit Brain telemetry Unavailable alert
  await page.getByRole('tab', { name: 'Stock Overview' }).click();
  await expect(page.getByText('Brain Telemetry — Unavailable')).toBeVisible();

  // 3. Storage Locations tab: is_sellable filter + DAMAGED location create
  await page.getByRole('tab', { name: 'Storage Locations' }).click();
  for (const code of ['MAIN-SELLABLE', 'QUAR-01', 'DMG-01']) {
    await expect(
      page.getByRole('cell', { name: code, exact: true })
    ).toBeVisible();
  }
  const sellableFilter = page.getByLabel('Sellable filter');
  await sellableFilter.selectOption('SELLABLE');
  await expect(
    page.getByRole('cell', { name: 'MAIN-SELLABLE', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'QUAR-01', exact: true })
  ).toBeHidden();
  await sellableFilter.selectOption('NON_SELLABLE');
  await expect(
    page.getByRole('cell', { name: 'DMG-01', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'MAIN-SELLABLE', exact: true })
  ).toBeHidden();
  await sellableFilter.selectOption('ALL');

  await page.getByRole('button', { name: 'Add Location' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add storage location' });
  await dialog.getByLabel('Location code').fill('DMG-E2E-02');
  await dialog.getByLabel('Location name').fill('E2E Damaged Return Bay');
  await dialog.getByLabel('Location type').selectOption('DAMAGED');
  const sellableSwitch = dialog.getByRole('switch', {
    name: 'Sellable location',
  });
  await expect(sellableSwitch).toBeDisabled();
  await expect(sellableSwitch).toHaveAttribute('aria-checked', 'false');
  await dialog.getByRole('button', { name: 'Create location' }).click();
  await expect(
    page.getByRole('cell', { name: 'DMG-E2E-02', exact: true })
  ).toBeVisible();

  await page.getByRole('switch', { name: 'Toggle DMG-E2E-02 active' }).click();
  await expect(
    page.getByRole('cell', { name: 'DMG-E2E-02', exact: true })
  ).toBeHidden();

  // 4. Stock Adjustments & Opening Balance tab shows Cloud read-only notice
  await page
    .getByRole('tab', { name: 'Stock Adjustments & Opening Balance' })
    .click();
  await expect(page.getByText('BranchLocal runtime required')).toBeVisible();

  // 5. Inventory Ledger History: inspect TXN-2026-000001 in inline modal
  await page.getByRole('tab', { name: 'Inventory Ledger History' }).click();
  const ledgerRow = page.getByRole('row', { name: /TXN-2026-000001/ });
  await ledgerRow.getByRole('button', { name: 'View details' }).click();
  const detailModal = page.getByRole('dialog', { name: 'TXN-2026-000001' });
  await expect(detailModal.getByText('Immutable posted record')).toBeVisible();
  await expect(detailModal.getByText('MEDCARE-LOT-2601')).toBeVisible();
  await expect(
    detailModal.getByRole('button', { name: 'Reverse transaction' })
  ).toBeHidden();
  await detailModal.getByRole('button', { name: 'Close', exact: true }).click();

  expect(errors).toEqual([]);
});

test('Cashier on BranchLocal sees 3 tabs with read-only locations while write and ledger tabs remain hidden', async ({
  page,
}) => {
  const errors = await loginWithUserContext(page, {
    role: 'Cashier',
    runtime_mode: 'BranchLocal',
    branch_scope: 'ASSIGNED',
    branch_ids: [BRANCH_DT_ID],
  });

  await page.getByRole('link', { name: 'Inventory' }).click();
  await expect(
    page.getByRole('heading', { name: 'Inventory', level: 1 })
  ).toBeVisible();

  for (const visibleTab of [
    'Stock Overview',
    'Stock Balances & Batches',
    'Storage Locations',
  ]) {
    await expect(page.getByRole('tab', { name: visibleTab })).toBeVisible();
  }
  for (const hiddenTab of [
    'Stock Adjustments & Opening Balance',
    'Inventory Ledger History',
  ]) {
    await expect(page.getByRole('tab', { name: hiddenTab })).toBeHidden();
  }

  await page.getByRole('tab', { name: 'Storage Locations' }).click();
  await expect(page.getByText('Read-only access')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Location' })).toBeHidden();
  expect(errors).toEqual([]);
});

test('branch controls agree and every balance request uses a location from its own branch', async ({
  page,
}) => {
  await loginAsWorkspaceUser(page, '/inventory');
  const urls: URL[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.pathname.endsWith('/inventory/balances')) urls.push(url);
  });
  const top = page.getByLabel('Active branch', { exact: true });
  const local = page.getByLabel('Branch', { exact: true });
  const location = page.getByLabel('Storage location', { exact: true });
  await local.selectOption(BRANCH_ALX_ID);
  await expect(top).toHaveValue(BRANCH_ALX_ID);
  const alxLocation = '11111111-9999-4111-8111-000000000006';
  await location.selectOption(alxLocation);
  await expect
    .poll(() =>
      urls.some((u) => u.searchParams.get('location_id') === alxLocation)
    )
    .toBe(true);
  await top.selectOption(BRANCH_DT_ID);
  await expect(local).toHaveValue(BRANCH_DT_ID);
  await expect(location).toHaveValue('');
  const dtLocation = '11111111-9999-4111-8111-000000000003';
  await location.selectOption(dtLocation);
  await expect
    .poll(() =>
      urls.some((u) => u.searchParams.get('location_id') === dtLocation)
    )
    .toBe(true);
  await local.selectOption(BRANCH_ALX_ID);
  await expect(top).toHaveValue(BRANCH_ALX_ID);
  await expect(location).toHaveValue('');
  for (const url of urls) {
    const branch = url.searchParams.get('branch_id');
    expect([
      null,
      branch === BRANCH_ALX_ID ? alxLocation : dtLocation,
    ]).toContain(url.searchParams.get('location_id'));
  }
  const ledger = page.waitForRequest((req) =>
    new URL(req.url()).pathname.endsWith('/inventory/transactions')
  );
  await page.getByRole('tab', { name: 'Inventory Ledger History' }).click();
  expect(new URL((await ledger).url()).searchParams.get('branch_id')).toBe(
    BRANCH_ALX_ID
  );
});
