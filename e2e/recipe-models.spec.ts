import { expect, test } from "@playwright/test";

test("all 32 recipe GLBs load and render in Three.js", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const fixtureUrl = "/src/lib/visual-editor/scene-recipe-catalog.fixture.ts";
    (await import(/* @vite-ignore */ fixtureUrl)).runSceneRecipeCatalogFixtureAssertions();
    const url = "/e2e/recipe-models.fixture.tsx";
    return (await import(/* @vite-ignore */ url)).renderModels();
  });
  expect(result.rendered).toBe(32);
  expect(result.loaded).toBeGreaterThan(0);
  expect(result.disposed).toBe(result.loaded);
});

test("recipe cards wait for GLBs before capture and release the loaded geometry", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/e2e.html?scenario=ready");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/recipe-assets/campfire-base.glb*", async route => { await gate; await route.continue(); });
  const request = page.waitForRequest("**/recipe-assets/campfire-base.glb*");
  await page.evaluate(async () => {
    const url = "/e2e/recipe-models.fixture.tsx";
    (await import(/* @vite-ignore */ url)).mount(["campfire", "fountain", "well"]);
  });
  await request;
  await page.waitForTimeout(1300);
  await expect(page.getByRole("region", { name: "焚き火", exact: true }).locator("img")).toHaveCount(0);
  release();
  await expect(page.locator("section img")).toHaveCount(3, { timeout: 20000 });
  const counts = await page.evaluate(async () => {
    const url = "/e2e/recipe-models.fixture.tsx";
    return (await import(/* @vite-ignore */ url)).resourceCounts();
  });
  expect(counts.loaded).toBeGreaterThan(0);
  expect(counts.disposed).toBe(counts.loaded);
  await page.screenshot({ path: "test-results/recipe-models.png" });
  expect(errors).toEqual([]);
});

test("closing a preview before its GLB arrives disposes the late load", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/recipe-assets/fountain.glb*", async route => { await gate; await route.continue(); });
  const request = page.waitForRequest("**/recipe-assets/fountain.glb*");
  await page.evaluate(async () => {
    const url = "/e2e/recipe-models.fixture.tsx";
    (await import(/* @vite-ignore */ url)).mount(["fountain"], true);
  });
  await request;
  await page.evaluate(async () => {
    const url = "/e2e/recipe-models.fixture.tsx";
    (await import(/* @vite-ignore */ url)).unmount();
  });
  release();
  await expect.poll(() => page.evaluate(async () => {
    const url = "/e2e/recipe-models.fixture.tsx";
    const counts = (await import(/* @vite-ignore */ url)).resourceCounts();
    return counts.loaded > 0 && counts.loaded === counts.disposed;
  })).toBe(true);
});

test("failed model previews show a failure instead of caching an incomplete image", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.route("**/recipe-assets/fountain.glb*", route => route.abort());
  await page.evaluate(async () => {
    const url = "/e2e/recipe-models.fixture.tsx";
    (await import(/* @vite-ignore */ url)).mount(["fountain"]);
  });
  await expect(page.getByText("モデルを読み込めませんでした", { exact: true })).toBeVisible();
  await expect(page.locator("section img")).toHaveCount(0);
});
