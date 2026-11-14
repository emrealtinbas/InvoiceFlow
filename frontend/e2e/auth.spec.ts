import { expect, test } from '@playwright/test';

import { gotoInApp, login, register, uniqueValue } from './helpers';

test('registration, verified login, logout, and memory-only reload', async ({
  page,
  context,
}, testInfo) => {
  const email = `${uniqueValue('auth', testInfo)}@example.test`;

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Sign in to InvoiceFlow' })).toBeVisible();
  await expect(page).toHaveURL(/\/login\?returnTo=/);

  await register(page, email);
  await login(page, email);

  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  expect(await context.cookies()).toEqual([]);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in to InvoiceFlow' })).toBeVisible();

  await login(page, email);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByText(/You have signed out/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in to InvoiceFlow' })).toBeVisible();
});

test('one account cannot open another account customer', async ({ page }, testInfo) => {
  const ownerEmail = `${uniqueValue('owner', testInfo)}@example.test`;
  const otherEmail = `${uniqueValue('other', testInfo)}@example.test`;

  await register(page, ownerEmail);
  await login(page, ownerEmail);
  await gotoInApp(page, '/customers/new');
  await page.getByLabel('Customer name').fill('Ownership Boundary Customer');
  await page.getByRole('button', { name: 'Create customer' }).click();
  await expect(page.getByRole('heading', { name: 'Ownership Boundary Customer' })).toBeVisible();
  const protectedPath = new URL(page.url()).pathname;

  await page.getByRole('button', { name: 'Sign out' }).click();
  await register(page, otherEmail);
  await login(page, otherEmail);
  await gotoInApp(page, protectedPath);
  await expect(page.getByRole('heading', { name: 'Customer not found' })).toBeVisible();
});
