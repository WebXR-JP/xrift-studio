import { expect, test } from "@playwright/test";

test("all water presets render through Three.js and retain the compiler contract", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { runWaterShaderFixtureAssertions } = await load("/src/lib/visual-editor/water-shader.fixture.ts");
    runWaterShaderFixtureAssertions();
    const { WATER_SHADER_CATALOG, applyWaterShaderParameters } = await load("/src/lib/visual-editor/water-shader-catalog.ts");
    const { requestWaterThumbnail, retainWaterThumbnailRenderer } = await load("/src/components/visual-editor/water-preview-renderer.ts");
    const release = retainWaterThumbnailRenderer();
    let rendered = 0;
    try {
      for (const entry of WATER_SHADER_CATALOG) {
        for (const quality of [0, 1, 2]) {
          const shader = applyWaterShaderParameters(entry, { uDetailQuality: quality, uWaveDisplacement: quality === 2 ? 0.3 : 0 });
          const image = await requestWaterThumbnail(shader, { direction: [1, 0], speed: 1, turbulence: 0.25 });
          if (!image.startsWith("data:image/") || image.length < 1000) throw new Error(entry.id);
          rendered++;
        }
      }
    } finally { release(); }
    return rendered;
  });
  expect(result).toBe(63);
});

test("water store supports filtering, live preview, install failure and retry", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const path = "/e2e/water-shaders.fixture.tsx";
    (await import(/* @vite-ignore */ path)).mountWaterStore();
  });
  const search = page.getByRole("textbox", { name: "Water Shaderを検索" });
  await search.fill("Rainy Harbor");
  await expect(page.getByRole("heading", { name: "Rainy Harbor", exact: true })).toBeVisible();
  await expect(page.locator("aside canvas")).toBeVisible();
  await expect(page.getByRole("img", { name: "水面シェーダーの実描画プレビュー" })).toBeVisible();
  await search.fill("no-such-water");
  await expect(page.getByText("条件に合うWater Shaderがありません")).toBeVisible();
  await search.fill("Ocean Waves");
  const add = page.getByRole("button", { name: "Ocean WavesをMaterialへ追加", exact: true });
  await add.click();
  await expect(search).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Water Shaderのカテゴリ" })).toBeDisabled();
  const settle = async (fail: boolean) => page.evaluate(async fail => {
    const path = "/e2e/water-shaders.fixture.tsx";
    (await import(/* @vite-ignore */ path)).finishInstall(fail);
  }, fail);
  await settle(true);
  await expect(page.getByRole("alert")).toContainText("Test install failed");
  await add.click();
  await settle(false);
  await expect(page.getByText("「Ocean Waves」をMaterialとして追加しました。", { exact: false })).toBeVisible();
  await expect(search).toBeEnabled();
  await page.screenshot({ path: "test-results/water-shaders.png" });
  expect(errors).toEqual([]);
});
