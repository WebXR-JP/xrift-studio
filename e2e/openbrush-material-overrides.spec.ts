import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { renderBrushOverrides, renderBrushAntialiasing } from './openbrush-material-overrides.fixture';

test.use({ permissions: ['local-network-access'] });

test.beforeAll(() => execFileSync(process.execPath, ['e2e/openbrush-material-overrides.prepare.cjs'], { stdio: 'pipe' }));

test('切り抜きブラシの輪郭をMSAAで滑らかにし、公開側と一致する', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('https://icosa-foundation.github.io/three-icosa-template/brushes/**', route => {
    const relative = new URL(route.request().url()).pathname.split('/brushes/')[1]!;
    return route.fulfill({ path: path.resolve('public/visual-editor/openbrush/brushes', relative) });
  });
  await page.route('**/e2e.html?brush-aa', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.goto('/e2e.html?brush-aa');
  const result = await page.evaluate(async () => {
    const url = '/e2e/openbrush-material-overrides.fixture.tsx';
    return (await import(/* @vite-ignore */url)).renderBrushAntialiasing();
  }) as Awaited<ReturnType<typeof renderBrushAntialiasing>>;
  const { beforeImage, afterImage, ...metrics } = result;
  console.log('Open Brush cutout coverage:', metrics);
  for (const [name, url] of Object.entries({ before: beforeImage, after: afterImage })) await testInfo.attach(name, { body: Buffer.from(url.split(',')[1]!, 'base64'), contentType: 'image/png' });
  expect(errors).toEqual([]);
  for (const frame of result.compositor) {
    expect(frame.after.samples).toBe(4);
    expect(frame.after.partial).toBeGreaterThan(frame.before.partial);
    expect(Math.abs(frame.after.coverage / frame.before.coverage - 1)).toBeLessThan(.03);
  }
  expect(result.changed).toBe(0);
  expect(result.after.partial).toBeGreaterThan(result.before.partial);
  expect(result.after.interior).toBeGreaterThan(1000);
  expect(Math.abs(result.after.coverage / result.before.coverage - 1)).toBeLessThan(.03);
});

test('同じブラシの個別スロットをMToonとPBRへ置換し、公開コードにも反映する', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('https://icosa-foundation.github.io/three-icosa-template/brushes/**', route => {
    const relative = new URL(route.request().url()).pathname.split('/brushes/')[1]!;
    return route.fulfill({ path: path.resolve('public/visual-editor/openbrush/brushes', relative) });
  });
  await page.route('**/e2e.html?brush-overrides', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.goto('/e2e.html?brush-overrides');
  const result = await page.evaluate(async () => {
    const url = '/e2e/openbrush-material-overrides.fixture.tsx';
    const fixture = await import(/* @vite-ignore */url);
    await fixture.runOpenBrushFixtureAssertions();
    return fixture.renderBrushOverrides();
  }) as Awaited<ReturnType<typeof renderBrushOverrides>>;
  expect(errors).toEqual([]);
  expect(result.editorIndices).toEqual([0, 1, 0]);
  expect(result.publishedIndices).toEqual([0, 1, 0]);
  expect(result.toon[0][1]).toBeGreaterThan(200);
  expect(result.toon[0][0]).toBeLessThan(10);
  expect(result.standard[0][0]).toBeGreaterThan(200);
  expect(result.standard[0][1]).toBeLessThan(10);
  for (const index of [1, 2]) {
    expect(result.toon[index]).toEqual(result.before[index]);
    expect(result.standard[index]).toEqual(result.before[index]);
  }
  expect(result.editorNormals.lit).toBeGreaterThan(100);
  expect(result.publishedNormals.lit).toBeGreaterThan(100);
  expect(result.editorNormals.changed).toBe(0);
  expect(result.publishedNormals.changed).toBe(0);
  expect(result.output).toEqual(result.toon);
  expect(result.types.filter((type: string) => type === 'MToonMaterial')).toHaveLength(1);
});
