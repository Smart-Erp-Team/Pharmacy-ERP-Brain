import { expect, type Locator, type Page } from '@playwright/test';

export interface AddressInputValues {
  line1: string;
  city: string;
  countryCode: string;
}

export interface BranchDialogInput extends AddressInputValues {
  code: string;
  name: string;
}

export interface EmployeeDialogOverrides {
  employeeNo?: string;
  fullName?: string;
  jobTitle?: string;
  hiredOn?: string;
}

export interface SellableUomDialogInput {
  code: string;
  factor: string;
  displayName: string;
  price: string;
}

export interface CreateAssignedUserDialogInput {
  employeeId: string;
  username: string;
  shortPassword: string;
  validPassword: string;
  branchPattern: RegExp;
}

export async function fillAddressFields(
  container: Locator,
  values: AddressInputValues
): Promise<void> {
  await container.getByLabel('Address line 1').fill(values.line1);
  await container.getByLabel('City').fill(values.city);
  await container.getByLabel('Country code').fill(values.countryCode);
}

export async function createBranchViaDialog(
  dialog: Locator,
  values: BranchDialogInput
): Promise<void> {
  await dialog.getByLabel('Branch code').fill(values.code);
  await dialog.getByLabel('Branch name').fill(values.name);
  await fillAddressFields(dialog, values);
  await dialog.getByRole('button', { name: 'Create branch' }).click();
}

export async function issueAndCopyBranchToken(
  branchRow: Locator,
  page: Page
): Promise<string> {
  await branchRow.getByRole('button', { name: 'Enrollment token' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByText(/\dm \d{2}s remaining/)).toBeVisible();
  const token = (await dlg.getByText(/^enr_live_/).textContent())?.trim() ?? '';
  await dlg.getByRole('button', { name: 'Copy' }).click();
  await expect(dlg.getByRole('button', { name: 'Copied' })).toBeVisible();
  await dlg.getByRole('button', { name: 'Done' }).click();
  return token;
}

export async function createEmployeeViaDialog(
  dialog: Locator,
  branchId: string,
  overrides: EmployeeDialogOverrides = {}
): Promise<void> {
  await dialog.getByLabel('Home branch').selectOption(branchId);
  await dialog
    .getByLabel('Employee number')
    .fill(overrides.employeeNo ?? 'EMP-099');
  await dialog
    .getByLabel('Full name')
    .fill(overrides.fullName ?? 'Nadia Samir');
  await dialog
    .getByLabel('Job title')
    .fill(overrides.jobTitle ?? 'Clinical Pharmacist');
  await dialog.getByLabel('Hire date').fill(overrides.hiredOn ?? '2026-01-15');
  await fillAddressFields(dialog, {
    line1: '99 Pyramids Rd',
    city: 'Giza',
    countryCode: 'EG',
  });
  await dialog.getByRole('button', { name: 'Create employee' }).click();
}

export async function createPharmacistUserViaDialog(
  dialog: Locator,
  input: CreateAssignedUserDialogInput
): Promise<void> {
  await dialog.getByLabel('Employee').selectOption(input.employeeId);
  await dialog.getByLabel('Username').fill(input.username);
  await dialog.getByLabel('Password').fill(input.shortPassword);
  await dialog.getByRole('button', { name: 'Create user' }).click();
  await expect(dialog.getByText(/at least 12 characters/i)).toBeVisible();
  await dialog.getByLabel('Password').fill(input.validPassword);
  await dialog.getByLabel('Role').selectOption('Pharmacist');
  await dialog.getByRole('button', { name: input.branchPattern }).click();
  await dialog.getByRole('button', { name: 'Create user' }).click();
}

export async function submitResetPasswordDialog(
  dialog: Locator,
  password: string
): Promise<void> {
  await dialog.getByLabel('New password').fill(password);
  await dialog.getByLabel('Confirm password').fill(password);
  await dialog.getByRole('button', { name: 'Reset password' }).click();
}

export async function submitSellableUomDialog(
  dialog: Locator,
  input: SellableUomDialogInput
): Promise<void> {
  await dialog.getByLabel('UOM code').fill(input.code);
  await dialog.getByLabel('Conversion factor').fill(input.factor);
  await dialog.getByLabel('Display name').fill(input.displayName);
  await dialog.getByRole('switch', { name: 'Sellable' }).click();
  await dialog.getByLabel('Sale unit price (EGP)').fill(input.price);
  await dialog.getByRole('button', { name: 'Add UOM' }).click();
}
