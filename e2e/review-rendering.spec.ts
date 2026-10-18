import { expect, test, type Page } from "@playwright/test";
import type * as Fixture from "./review-rendering.fixture";

const fixturePath = "/e2e/review-rendering.fixture.tsx";
async function fixture<T>(page: Page, run: (module: typeof Fixture) => T | Promise<T>) {
  return page.evaluate(async ({ path, body }) => {
    const module = await import(/* @vite-ignore */ path);
    return new Function("module", `return (${body})(module)`)(module);
  }, { path: fixturePath, body: run.toString() }) as Promise<Awaited<T>>;
}

test.beforeEach(async ({ page }) => {
  await page.route("**/e2e.html?review-rendering", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
  await page.goto("/e2e.html?review-rendering");
  await fixture(page, module => module.mountReviewFixture());
});
test.afterEach(async ({ page }) => { await fixture(page, module => module.unmountReviewFixture()); });

test("review images preserve the actual shared Bloom and colour grading", async ({ page }, info) => {
  const result = await fixture(page, async module => {
    const frames = [];
    for (const mode of ["plain", "bloom", "grading"] as const) {
      const frame = await module.captureReview(mode);
      if (!frame.ok) throw new Error(frame.message);
      frames.push({ mode, dataUrl: frame.dataUrl, metrics: await module.frameMetrics(frame.dataUrl) });
    }
    return frames;
  });
  const [plain, bloom, grading] = result;
  expect(bloom!.metrics.lit).toBeGreaterThan(plain!.metrics.lit * 1.1);
  expect(grading!.metrics.chroma).toBeLessThan(plain!.metrics.chroma * 0.05);
  expect(bloom!.dataUrl).not.toBe(plain!.dataUrl);
  for (const frame of result) await info.attach(`actual-review-${frame.mode}`, { body: Buffer.from(frame.dataUrl.split(",")[1]!, "base64"), contentType: "image/png" });
});

test("a delayed current Texture cannot be sent as an early untextured review image", async ({ page }) => {
  await fixture(page, module => module.setReviewTexture(101));
  await expect.poll(() => fixture(page, module => module.pendingReviewReads())).toContain(101);
  const capture = fixture(page, module => module.captureReview());
  await page.waitForTimeout(200);
  expect(await fixture(page, module => module.capturedReviewCount())).toBe(0);
  await fixture(page, module => module.releaseReviewTexture(101));
  const frame = await capture;
  expect(frame.ok).toBe(true);
  if (!frame.ok) throw new Error(frame.message);
  const metrics = await page.evaluate(async ({ path, dataUrl }) => (await import(/* @vite-ignore */ path)).frameMetrics(dataUrl), { path: fixturePath, dataUrl: frame.dataUrl });
  expect(metrics.green).toBeGreaterThan(1000);
  expect(await fixture(page, module => module.capturedReviewCount())).toBe(1);
});

test("a failed current Texture fails the review capture without providing a substitute image", async ({ page }) => {
  await fixture(page, module => module.setReviewTexture(102));
  await expect.poll(() => fixture(page, module => module.pendingReviewReads())).toContain(102);
  const capture = fixture(page, module => module.captureReview());
  await fixture(page, module => module.releaseReviewTexture(102, true));
  const result = await capture;
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.message).toContain("画像を読み込めず");
  expect(await fixture(page, module => module.capturedReviewCount())).toBe(0);
});

test("an older Texture finishing late cannot satisfy the current source identity", async ({ page }) => {
  await fixture(page, module => module.setReviewTexture(201));
  await expect.poll(() => fixture(page, module => module.pendingReviewReads())).toContain(201);
  await fixture(page, module => module.setReviewTexture(202));
  await expect.poll(() => fixture(page, module => module.pendingReviewReads())).toContain(202);
  const capture = fixture(page, module => module.captureReview());
  await fixture(page, module => module.releaseReviewTexture(201));
  await page.waitForTimeout(200);
  expect(await fixture(page, module => module.capturedReviewCount())).toBe(0);
  await fixture(page, module => module.releaseReviewTexture(202));
  expect((await capture).ok).toBe(true);
  expect(await fixture(page, module => module.capturedReviewCount())).toBe(1);
});
