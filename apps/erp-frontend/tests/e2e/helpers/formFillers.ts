import type { Locator } from '@playwright/test';

export interface AddressInputValues {
  line1: string;
  city: string;
  countryCode: string;
}

export async function fillAddressFields(
  container: Locator,
  values: AddressInputValues
): Promise<void> {
  await container.getByLabel('Address line 1').fill(values.line1);
  await container.getByLabel('City').fill(values.city);
  await container.getByLabel('Country code').fill(values.countryCode);
}

export async function createEmployeeViaDialog(
  dialog: Locator,
  branchId: string
): Promise<void> {
  await dialog.getByLabel('Home branch').selectOption(branchId);
  await dialog.getByLabel('Employee number').fill('EMP-099');
  await dialog.getByLabel('Full name').fill('Nadia Samir');
  await dialog.getByLabel('Hire date').fill('2026-01-15');
  await fillAddressFields(dialog, {
    line1: '99 Pyramids Rd',
    city: 'Giza',
    countryCode: 'EG',
  });
  await dialog.getByRole('button', { name: 'Create employee' }).click();
}
