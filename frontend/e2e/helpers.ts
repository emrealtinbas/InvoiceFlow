import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

export const E2E_PASSWORD = 'InvoiceFlow!E2e1234';

export function uniqueValue(prefix: string, testInfo: TestInfo): string {
  const run = `${Date.now()}-${testInfo.workerIndex}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${run}`;
}

export async function register(page: Page, email: string): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('E-mail address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel('Confirm password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to InvoiceFlow' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Account created');
}

/**
 * Navigates without a full document load. Authenticated sessions live only in memory, so
 * `page.goto` on a protected route intentionally signs the user out.
 */
export async function gotoInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
}

export async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mail address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  const viewport = page.viewportSize();
  if (viewport !== null && viewport.width < 768) {
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
  } else {
    await expect(page.getByText(email, { exact: true }).first()).toBeVisible();
  }
}

export async function registerAndLogin(page: Page, email: string): Promise<void> {
  await register(page, email);
  await login(page, email);
}

export async function apiToken(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.post('/api/auth/login', {
    data: { email, password: E2E_PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { accessToken: string };
  return body.accessToken;
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
