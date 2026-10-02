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
  expect(first.projectId).toBe('project-mcp-browser-create-test');
  await page.locator('#edit').click();
  await expect.poll(async () => (await receipts()).some(item => item.projectId === first.projectId && item.revision > first.revision && item.status === 'verified' && item.hasScenePng), { timeout: 120_000 }).toBe(true);
  const edited = (await receipts()).find(item => item.projectId === first.projectId && item.revision > first.revision && item.status === 'verified')!;
  expect(edited.operationId).not.toBe(first.operationId);
  expect(edited.saved).toBe(true);
  expect(edited.rendered).toBe(true);
  const entityCount=()=>page.evaluate(()=>(window as unknown as {studioTestEvidence:{contexts:Array<{entityCount?:number}>}}).studioTestEvidence.contexts.at(-1)?.entityCount);
  const count=await entityCount();
  await page.locator('#duplicate').click();
  await expect.poll(async()=>(await receipts()).filter(item=>item.operationId===edited.operationId&&item.status==='verified').length,{timeout:120_000}).toBeGreaterThan(1);
  expect(await entityCount()).toBe(count);
  await page.locator('#stale').click();
  await expect.poll(async()=>(await receipts()).some(item=>item.operationId==='stale-edit-test'&&item.status==='failed'),{timeout:30_000}).toBe(true);
  expect(await entityCount()).toBe(count);

});

test('manual editor context remains browser-local and never uploads documents', async ({ page }) => {
  await page.goto('/delivery-test.html?build=1&auto-new');
  await expect(page.locator('#connection')).toHaveText('接続済み');
  const evidence = () => page.evaluate(() => (window as unknown as {
    studioTestEvidence: { contexts: Array<Record<string, unknown>>; uploads: Array<Record<string, unknown>>; toolCalls: Array<Record<string, unknown>> };
  }).studioTestEvidence);
  const editor = page.frameLocator('iframe');
  await expect.poll(async () => (await evidence()).contexts.some(item => typeof item.projectId === 'string'), {timeout:120_000}).toBe(true);
  await expect.poll(async () => page.locator('#receipts').evaluate(element =>
    (JSON.parse(element.textContent || '[]') as Array<Record<string,unknown>>).some(item=>item.applied===true&&item.saved===true)), {timeout:120_000}).toBe(true);
  await editor.getByLabel(/^ChatGPT /).click();
  const share=editor.getByRole('button',{name:'会話に編集対象を渡す'});
  await expect(share).toBeEnabled({timeout:120_000});await share.click();
  await expect(editor.getByRole('status')).toContainText('現在の編集対象を会話に伝えました',{timeout:30_000});
  const completed=await evidence();
  expect(completed.uploads).toHaveLength(0);expect(completed.toolCalls).toHaveLength(0);
  for(const context of completed.contexts){expect(context).not.toHaveProperty('bundle');expect(context).not.toHaveProperty('snapshotId');}
});
