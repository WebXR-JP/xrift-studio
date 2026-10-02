import { expect, test } from '@playwright/test';

test('the real Studio applies conversation edits and reports a saved Scene View', async ({ page }) => {
  // Playwright creates an isolated browser context; never use an owner's projects.
  await page.goto('/delivery-test.html?build=1');
  await expect(page.locator('#connection')).toHaveText('接続済み');
  await page.locator('#create').click();
  const receipts = () => page.locator('#receipts').evaluate(element => JSON.parse(element.textContent || '[]') as Array<{
    operationId: string; projectId: string; revision: number; status: string;
    saved: boolean; rendered: boolean; hasScenePng: boolean;
  }>);
  await expect.poll(async () => (await receipts()).some(item => item.status === 'verified' && item.saved && item.rendered && item.hasScenePng), { timeout: 120_000 }).toBe(true);
  const first = (await receipts()).find(item => item.status === 'verified')!;
  await page.locator('#edit').click();
  await expect.poll(async () => (await receipts()).some(item => item.projectId === first.projectId && item.revision > first.revision && item.status === 'verified' && item.hasScenePng), { timeout: 120_000 }).toBe(true);
  const edited = (await receipts()).find(item => item.projectId === first.projectId && item.revision > first.revision && item.status === 'verified')!;
  expect(edited.operationId).not.toBe(first.operationId);
  expect(edited.saved).toBe(true);
  expect(edited.rendered).toBe(true);
});
