import process from 'node:process';
import { expect, type Page } from '@playwright/test';
import {
  currentUserFixture,
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
      currentUserFixture.organization_code,
    username:
      overrides.username ??
      process.env.E2E_USERNAME ??
      currentUserFixture.username,
    password:
      overrides.password ??
      process.env.E2E_PASSWORD ??
      'mock-dev-session-secret',
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
  startPath = '/login'
): Promise<void> {
  await page.goto(startPath);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await waitForMswReady(page);
  await submitLoginForm(page);
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
}

export async function openPanadolReorderTab(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Products' }).click();
  await page.getByRole('button', { name: 'Panadol 500mg Tablets' }).click();
  await page.getByRole('tab', { name: 'Branch Reorder Settings' }).click();
}

export async function loginWithUserContext(
  page: Page,
  overrides: UserContextOverrides
): Promise<string[]> {
  const errors = trackUncaughtErrors(page);
  await mockAuthMe(page, overrides);
  await loginAsWorkspaceUser(page);
  return errors;
}
