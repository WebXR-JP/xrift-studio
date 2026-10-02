import { expect, test } from '@playwright/test';

test('the real Studio applies conversation edits and reports a saved Scene View', async ({ page }) => {
  // Playwright creates an isolated browser context; never use an owner's projects.
  await page.goto('/delivery-test.html?build=1');
  await expect(page.locator('#connection')).toHaveText('接続済み');
  await page.locator('#create').click();
  const receipts = () => page.locator('#receipts').evaluate(element => JSON.parse(element.textContent || '[]') as Array<{
    operationId: string; projectId: string; snapshotId: string; revision: number; status: string;
    saved: boolean; rendered: boolean; hasScenePng: boolean;
  }>);
  await expect.poll(async () => (await receipts()).some(item => item.status === 'verified' && item.saved && item.rendered && item.hasScenePng), { timeout: 120_000 }).toBe(true);
  const first = (await receipts()).find(item => item.status === 'verified')!;
  expect(first.snapshotId).toMatch(/^snapshot-/);
  await page.locator('#edit').click();
  await expect.poll(async () => (await receipts()).some(item => item.projectId === first.projectId && item.revision > first.revision && item.status === 'verified' && item.hasScenePng), { timeout: 120_000 }).toBe(true);
  const edited = (await receipts()).find(item => item.projectId === first.projectId && item.revision > first.revision && item.status === 'verified')!;
  expect(edited.operationId).not.toBe(first.operationId);
  expect(edited.saved).toBe(true);
  expect(edited.rendered).toBe(true);
});

test('manual editor context uploads only after the explicit UI action and publishes short references', async ({ page }) => {
  await page.goto('/delivery-test.html?auto-new');
  await expect(page.locator('#connection')).toHaveText('接続済み');
  const evidence = () => page.evaluate(() => (window as unknown as {
    studioTestEvidence: { contexts: Array<Record<string, unknown>>; uploads: Array<Record<string, unknown>> };
  }).studioTestEvidence);
  await expect.poll(async () => (await evidence()).contexts.some(item => item.projectId && item.snapshotRequired === true), { timeout: 120_000 }).toBe(true);
  expect((await evidence()).uploads).toHaveLength(0);
  const editor = page.frameLocator('iframe');
  await editor.getByLabel(/^ChatGPT /).click();
  const share = editor.getByRole('button', { name: '会話に編集対象を渡す' });
  await expect(share).toBeEnabled({ timeout: 120_000 });
  await share.click();
  await expect.poll(async () => (await evidence()).contexts.some(item => typeof item.snapshotId === 'string'), { timeout: 30_000 }).toBe(true);
  const completed = await evidence();
  expect(completed.uploads).toHaveLength(1);
  expect(completed.uploads[0].bundle).toBeTruthy();
  expect(completed.uploads[0].previousSnapshotId).toBeUndefined();
  for (const context of completed.contexts) expect(context).not.toHaveProperty('bundle');
  const current = completed.contexts.at(-1)!;
  expect(current.snapshotId).toMatch(/^snapshot-/);
  expect(current.canEditProject).toBe(true);
  expect(current.snapshotRequired).toBe(false);
});
