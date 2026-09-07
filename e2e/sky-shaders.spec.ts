import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test("33 sky presets render at all qualities and survive install and serialization", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async capture => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    (await load("/src/lib/visual-editor/sky-shader.fixture.ts")).runSkyShaderFixtureAssertions();
    return (await load("/e2e/sky-shaders.fixture.tsx")).renderSkyCatalog(capture) as Promise<{ count: number; revision: string; images: { id: string; data: string; shaderHash: string }[] }>;
  }, process.env.SKY_UPDATE_THUMBNAILS === "1");
  expect(result.count).toBe(99);
  if (process.env.SKY_UPDATE_THUMBNAILS === "1") {
    const assets = path.resolve("public/visual-editor/sky-shaders/v3");
    const images = result.images.map(({ id, data, shaderHash }) => {
      expect(data).toMatch(/^data:image\/webp;base64,/);
      const bytes = Buffer.from(data.split(",")[1], "base64");
      fs.writeFileSync(path.join(assets, `${id}.webp`), bytes);
      return { id, bytes: bytes.length, shaderHash };
    });
    fs.writeFileSync(path.join(assets, "manifest.json"), JSON.stringify({ revision: result.revision, renderer: "Three.js / createClassicR3fMaterial", width: 640, height: 400, quality: "balanced", time: 6.5, images }, null, 2) + "\n");
  }
});

test("sky store filters, pauses, preserves quality and retries installation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const url = "/e2e/sky-shaders.fixture.tsx";
    (await import(/* @vite-ignore */ url)).mountSkyStore();
  });
  const search = page.getByRole("textbox", { name: "Skybox Shaderを検索" });
  await search.fill("alpine-cumulus");
  const preview = page.locator("[data-sky-shader-preview]");
  await expect(preview.locator("canvas")).toBeVisible();
  await expect(page.locator("[data-sky-shader-thumbnail] img")).toBeVisible();
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await expect(preview).toHaveAttribute("data-sky-shader-animated", "false");
  await preview.focus(); await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "視点を戻す", exact: true }).click();
  await page.getByRole("button", { name: "軽量", exact: true }).click();
  await search.fill("no-such-sky");
  await expect(page.getByText("条件に合うSkybox Shaderがありません")).toBeVisible();
  await search.fill("alpine-cumulus");
  const add = page.getByRole("button", { name: /を空へ設定$/ });
  await add.click();
  await expect(search).toBeDisabled();
  const settle = (fail: boolean) => page.evaluate(async fail => {
    const url = "/e2e/sky-shaders.fixture.tsx";
    const fixture = await import(/* @vite-ignore */ url);
    fixture.finishInstall(fail);
    return fixture.installedDefines;
  }, fail);
  const defines = await settle(true);
  expect(defines.XRIFT_SKY_CLOUD_STEPS).toBe("10");
  await expect(page.getByRole("alert")).toContainText("Test install failed");
  await add.click(); await settle(false);
  await expect(page.getByText(/Sceneの空に設定済みです/)).toBeVisible();
  await preview.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/sky-shaders.png" });
  expect(errors).toEqual([]);
});

test("MCP exposes sky quality variants and applies them without changing uniforms", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { createPrototypeProject } = await load("/src/lib/visual-editor/prototype-project.ts");
    const { executeXriftMcpEditorTool: execute } = await load("/src/lib/visual-editor/mcp-editor-tools.ts");
    const context = { bundle: createPrototypeProject("world", "sky-quality"), sceneSelection: null, assetSelection: null, editorMode: "edit", importBusy: false, revision: 0, saveStatus: "saved", now: () => "2026-09-07T00:00:00.000Z" };
    const call = (tool: string, args: Record<string, unknown> = {}) => execute(context, { id: tool, tool, arguments: { projectId: context.bundle.project.projectId, sceneId: context.bundle.scene.sceneId, expectedRevision: context.revision, ...args } });
    const listing = call("list_material_presets").result;
    const preset = listing.sky.find((entry: { id: string }) => entry.id === "alpine-cumulus");
    const created = call("create_material_from_preset", { kind: "sky", presetId: preset.id });
    context.bundle = created.bundle; context.revision++;
    const materialAssetId = created.result.materialAssetId;
    const before = JSON.stringify(context.bundle.assets.assets[materialAssetId].shader.uniforms);
    const option = preset.qualityOptions.find((entry: { id: string }) => entry.id === "low");
    const changed = call("update_custom_shader", { materialAssetId, patch: { variants: option.variants } });
    const shader = changed.bundle.assets.assets[materialAssetId].shader;
    return { sky: listing.sky.length, water: listing.water.length, preserved: JSON.stringify(shader.uniforms) === before, steps: shader.variants[0].defines.XRIFT_SKY_CLOUD_STEPS };
  });
  expect(result).toEqual({ sky: 33, water: 21, preserved: true, steps: "10" });
});
