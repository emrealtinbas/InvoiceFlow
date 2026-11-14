import { expect, test } from '@playwright/test';

import { registerAndLogin, uniqueValue } from './helpers';

test('mobile navigation is keyboard-accessible and sign-out removes private content', async ({
  page,
}, testInfo) => {
  const email = `${uniqueValue('mobile', testInfo)}@example.test`;
  await registerAndLogin(page, email);

  await page.getByRole('button', { name: 'Open navigation' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('link', { name: 'Customers' }).click();
  await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to InvoiceFlow' })).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toHaveCount(0);
});
