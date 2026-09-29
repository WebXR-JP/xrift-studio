import { expect, test } from "@playwright/test";

test("実際のMToon 0.x・1.0素材プレビューで明るい面とShade Colorを見分ける", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 1100, height: 500 });
  await page.goto("/e2e/mtoon-thumbnail.html");
  await page.evaluate(async () => {
    const url = "/e2e/mtoon-thumbnail.fixture.tsx";
    (await import(/* @vite-ignore */ url)).mountThumbnailPreviews();
  });
  await expect(page.locator("section img")).toHaveCount(4);
  const result = await page.evaluate(async () => {
    const url = "/e2e/mtoon-thumbnail.fixture.tsx";
    return (await import(/* @vite-ignore */ url)).readThumbnailShadeContrast() as ReturnType<typeof import("./mtoon-thumbnail.fixture").readThumbnailShadeContrast>;
  });
  await test.info().attach("mtoon-thumbnail-contrast", { body: Buffer.from(JSON.stringify(result, null, 2)), contentType: "application/json" });
  await page.screenshot({ path: test.info().outputPath("mtoon-thumbnail-directional-cards.png") });
  for (const preview of result) {
    expect(preview.red?.geometry).toEqual(preview.blue?.geometry);
    expect(preview.red?.baseColor).toEqual([.65, .65, .65]);
    expect(preview.blue?.baseColor).toEqual(preview.red?.baseColor);
    expect(preview.red?.shadeColor).toEqual([.65, .025, .025]);
    expect(preview.blue?.shadeColor).toEqual([.025, .025, .65]);
    expect(preview.red?.lights.some(light => light.type === "DirectionalLight")).toBe(true);
    expect(preview.coloredShadeRatio).toBeGreaterThan(.1);
    expect(preview.stableLitRatio).toBeGreaterThan(.2);
    expect(preview.meanDifference).toBeGreaterThan(12);
  }
  expect(errors).toEqual([]);
});

test("単体のMToon素材プレビューも同じDirectional Lightで影を描画する", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 560, height: 480 });
  await page.goto("/e2e/mtoon-thumbnail.html");
  await page.evaluate(async () => {
    const url = "/e2e/mtoon-thumbnail.fixture.tsx";
    (await import(/* @vite-ignore */ url)).mountThumbnailPreviews(true);
  });
  await expect(page.locator("section img")).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath("mtoon-thumbnail-directional-single.png") });
  expect(errors).toEqual([]);
});

test("旧照明の保存済みMToonサムネイルを再生成し、素材設定を保つ", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/e2e/mtoon-thumbnail.html");
  await page.evaluate(async () => {
    const url = "/e2e/mtoon-thumbnail.fixture.tsx";
    await (await import(/* @vite-ignore */ url)).mountCachedThumbnailPreviews();
  });
  await expect(page.locator("section img")).toHaveCount(2);
  const result = await page.evaluate(async () => {
    const url = "/e2e/mtoon-thumbnail.fixture.tsx";
    return (await import(/* @vite-ignore */ url)).readCachedThumbnailResults() as ReturnType<typeof import("./mtoon-thumbnail.fixture").readCachedThumbnailResults>;
  });
  expect(result.writes).toBe(2);
  expect(result.failures).toEqual([]);
  for (const [, value] of result.results) {
    expect(value.thumbnail).toMatchObject({ status: "generated", rendererVersion: "xrift-studio-material-thumbnail@2" });
    expect(value.propertiesUnchanged).toBe(true);
    expect(value.needsRefresh).toBe(false);
  }
  expect(errors).toEqual([]);
});
