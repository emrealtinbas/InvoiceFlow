import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { apiToken, bearer, gotoInApp, registerAndLogin, uniqueValue } from './helpers';

async function createCustomer(page: Page, name: string): Promise<string> {
  await gotoInApp(page, '/customers/new');
  await page.getByLabel('Customer name').fill(name);
  await page
    .getByLabel('E-mail address')
    .fill(`${name.toLowerCase().replaceAll(' ', '.')}@example.test`);
  await page.getByRole('button', { name: 'Create customer' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  return new URL(page.url()).pathname.split('/').at(-1) ?? '';
}

async function createDraft(page: Page, customerName: string, description: string): Promise<string> {
  await gotoInApp(page, '/invoices/new');
  await page.getByLabel('Customer', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('Description').fill(description);
  await page.getByLabel('Quantity').fill('3');
  await page.getByLabel('Unit price (TRY)').fill('199.99');
  await page.getByLabel('Tax rate (%)').fill('20');

  await page.getByRole('button', { name: 'Add line' }).click();
  await page.getByLabel('Description').nth(1).fill('Fractional review');
  await page.getByLabel('Quantity').nth(1).fill('1.5');
  await page.getByLabel('Unit price (TRY)').nth(1).fill('10');
  await page.getByLabel('Tax rate (%)').nth(1).fill('10');
  await expect(page.getByText('₺736.46')).toBeVisible();

  await page.getByRole('button', { name: 'Save Draft' }).click();
  await expect(page.getByRole('heading', { name: /INV-\d{4}-\d{6}/ })).toBeVisible();
  await expect(page.getByText(customerName, { exact: true })).toBeVisible();
  await expect(page.getByText(/736[,.]46/)).toBeVisible();
  return new URL(page.url()).pathname.split('/').at(-1) ?? '';
}

test('customer create, search, detail, edit, and delete', async ({ page }, testInfo) => {
  const email = `${uniqueValue('customer-flow', testInfo)}@example.test`;
  const name = uniqueValue('E2E Customer', testInfo);
  const updatedName = `${name} Updated`;
  await registerAndLogin(page, email);

  await createCustomer(page, name);
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Customer name').fill(updatedName);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: updatedName })).toBeVisible();

  await page.getByRole('link', { name: 'Customers', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search customers' }).fill(updatedName);
  await expect(page.getByRole('link', { name: updatedName, exact: true })).toBeVisible();
  await page.getByRole('link', { name: updatedName, exact: true }).click();

  await page.getByRole('button', { name: `Delete ${updatedName}` }).click();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.getByRole('button', { name: 'Delete customer' }).click();
  await expect(page.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible();
  await expect(page.getByText(updatedName, { exact: true })).toHaveCount(0);
});

test('invoice financial parity, stale update recovery, lifecycle, and dashboard', async ({
  page,
  request,
}, testInfo: TestInfo) => {
  const email = `${uniqueValue('invoice-flow', testInfo)}@example.test`;
  const customerName = uniqueValue('Invoice Customer', testInfo);
  await registerAndLogin(page, email);
  await createCustomer(page, customerName);
  const invoiceId = await createDraft(page, customerName, 'Midpoint service');

  await expect(page.getByText(/614[,.]97/)).toBeVisible();
  await expect(page.getByText(/121[,.]49/)).toBeVisible();
  await expect(page.getByText(/736[,.]46/)).toBeVisible();

  await page.getByRole('link', { name: 'Edit Draft' }).click();
  const token = await apiToken(request, email);
  const currentResponse = await request.get(`/api/invoices/${invoiceId}`, {
    headers: bearer(token),
  });
  expect(currentResponse.ok()).toBeTruthy();
  const current = (await currentResponse.json()) as {
    customerId: string;
    issueDate: string;
    dueDate: string;
    concurrencyToken: string;
    items: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      taxRate: number;
    }>;
  };
  const concurrentUpdate = await request.put(`/api/invoices/${invoiceId}`, {
    headers: bearer(token),
    data: {
      customerId: current.customerId,
      issueDate: current.issueDate,
      dueDate: current.dueDate,
      concurrencyToken: current.concurrencyToken,
      items: current.items.map(({ description, quantity, unitPrice, taxRate }) => ({
        description,
        quantity,
        unitPrice,
        taxRate,
      })),
    },
  });
  expect(concurrentUpdate.ok()).toBeTruthy();

  await page.getByLabel('Description').first().fill('Changed after concurrent update');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: /concurrency|changed after you opened/i }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reload latest invoice' }).click();
  await page.getByRole('button', { name: 'Discard and reload' }).click();
  const restoredDescriptions = page.getByLabel('Description');
  await expect(restoredDescriptions).toHaveCount(2);
  const restoredValues = () =>
    restoredDescriptions.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );
  await expect
    .poll(restoredValues)
    .toEqual(expect.arrayContaining(['Midpoint service', 'Fractional review']));
  expect(await restoredValues()).not.toContain('Changed after concurrent update');

  await page.getByRole('link', { name: 'Back to invoices' }).click();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.getByRole('button', { name: 'Mark as Sent' }).click();
  await expect(page.getByLabel('Invoice status: Sent')).toBeVisible();
  await page.getByRole('button', { name: 'Mark Paid' }).click();
  await page.getByRole('button', { name: 'Mark as Paid' }).click();
  await expect(page.getByLabel('Invoice status: Paid')).toBeVisible();

  await gotoInApp(page, '/dashboard');
  await expect(page.getByText('₺736,46').first()).toBeVisible();
  await expect(page.getByRole('img', { name: /Paid: 1 of 1 invoices/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /INV-\d{4}-\d{6}/ }).first()).toBeVisible();
});

test('cancelled terminal state and Draft deletion', async ({ page }, testInfo) => {
  const email = `${uniqueValue('terminal-flow', testInfo)}@example.test`;
  const customerName = uniqueValue('Terminal Customer', testInfo);
  await registerAndLogin(page, email);
  await createCustomer(page, customerName);

  await createDraft(page, customerName, 'Cancel scenario');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel invoice' }).click();
  await expect(page.getByLabel('Invoice status: Cancelled')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toHaveCount(0);

  await createDraft(page, customerName, 'Delete scenario');
  const deletedInvoiceNumber = await page.getByRole('heading', { level: 1 }).innerText();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.getByRole('button', { name: 'Delete invoice' }).click();
  await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();
  await expect(page.getByRole('link', { name: deletedInvoiceNumber })).toHaveCount(0);
});
