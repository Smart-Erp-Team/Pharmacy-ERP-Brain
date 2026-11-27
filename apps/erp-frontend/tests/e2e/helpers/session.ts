import process from 'node:process';
import { expect, type Page } from '@playwright/test';
import {
  currentUserFixture,
  MEDCARE_ORG_CODE,
  mockAuthMe,
  type UserContextOverrides,
} from './authContext.ts';

export interface LoginCredentials {
  organizationCode: string;
  username: string;
  password: string;
}

export function getMockCredentials(
  overrides: Partial<LoginCredentials> = {}
): LoginCredentials {
  return {
    organizationCode:
      overrides.organizationCode ??
      process.env.E2E_ORG_CODE ??
      MEDCARE_ORG_CODE,
    username:
      overrides.username ??
      process.env.E2E_USERNAME ??
      currentUserFixture.username,
    password:
      overrides.password ?? process.env.E2E_PASSWORD ?? 'MedCareAdmin!2026',
  };
}

export function trackUncaughtErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => {
    errors.push(err.message);
  });
  return errors;
}

export async function waitForMswReady(page: Page): Promise<void> {
  if (process.env.VITE_ENABLE_MSW === 'false') {
    return;
  }
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return Boolean(reg?.active);
  });
}

export async function submitLoginForm(
  page: Page,
  overrides: Partial<LoginCredentials> = {}
): Promise<void> {
  const creds = getMockCredentials(overrides);
  await page.getByLabel('Organization code').fill(creds.organizationCode);
  await page.getByLabel('Username').fill(creds.username);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

export async function loginAsWorkspaceUser(
  page: Page,
  startPath = '/login',
  overrides: Partial<LoginCredentials> = {}
): Promise<void> {
  await page.goto(startPath);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await waitForMswReady(page);
  await submitLoginForm(page, overrides);
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
}

export async function openProductReorderTab(
  page: Page,
  productName = 'Augmentin 1g Film-Coated Tablets'
): Promise<void> {
  await page.getByRole('link', { name: 'Products' }).click();
  await page.getByRole('button', { name: productName }).click();
  await page.getByRole('tab', { name: 'Branch Reorder Settings' }).click();
}

export async function expectReadOnlyBranchesPage(
  page: Page,
  noticeTitle: string
): Promise<void> {
  await page.getByRole('link', { name: 'Branches' }).click();
  await expect(page.getByText(noticeTitle)).toBeVisible();
  await expect(page.getByRole('row', { name: /MED-DT/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add branch' })).toBeHidden();
  await expect(page.getByRole('switch', { name: /Toggle status/ })).toHaveCount(
    0
  );
  await expect(
    page.getByRole('columnheader', { name: 'Actions' })
  ).toBeHidden();
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Enrollment token' })
  ).toHaveCount(0);
}

export async function loginWithUserContext(
  page: Page,
  overrides: UserContextOverrides,
  startPath = '/login'
): Promise<string[]> {
  const errors = trackUncaughtErrors(page);
  await mockAuthMe(page, overrides);
  await loginAsWorkspaceUser(
    page,
    startPath,
    overrides.username ? { username: overrides.username } : {}
  );
  return errors;
}
