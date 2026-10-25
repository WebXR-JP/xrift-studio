import { expect, test } from "@playwright/test";
import { useOfficialFontMetrics } from "./official-font-metrics.fixture";
import fs from "node:fs";
import path from "node:path";

test.beforeEach(async ({ page }) => {
  await useOfficialFontMetrics(page);
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const url = "/e2e/particle-presets.fixture.tsx";
    (await import(/* @vite-ignore */ url)).mountParticleStore();
  });
});

test("particle drafts preview, survive selection and failure, and install the edited values", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await expect(page.locator("[data-catalog-card]")).toHaveCount(25);
  const search = page.getByRole("textbox", { name: "パーティクルを検索" });
  await search.fill("fireworks");
  await page.locator("[data-catalog-card]").click();
  const detail = page.getByRole("complementary", { name: "選択したパーティクルの詳細" });
  await expect(detail.locator("canvas")).toBeVisible();
  await detail.getByText("追加前に設定を調整", { exact: true }).click();
  const capacity = detail.getByRole("spinbutton", { name: "最大数", exact: true });
  await capacity.fill("320"); await capacity.blur();
  const burst = detail.getByRole("spinbutton", { name: "放出数 1", exact: true });
  await burst.fill("180"); await burst.blur();
  await detail.getByRole("button", { name: "最後に透明", exact: true }).click();
  await search.fill("bubbles"); await page.locator("[data-catalog-card]").click();
  await search.fill("fireworks"); await page.locator("[data-catalog-card]").click();
  await detail.getByText("追加前に設定を調整", { exact: true }).click();
  await expect(capacity).toHaveValue("320");
  await expect(burst).toHaveValue("180");
  await page.getByRole("checkbox", { name: /追加後にシーンへ配置/ }).uncheck();
  const add = detail.getByRole("button", { name: "花火を追加", exact: true });
  await add.click();
  await expect(search).toBeDisabled(); await expect(capacity).toBeDisabled();
  await page.evaluate(async () => {
    const url = "/e2e/particle-presets.fixture.tsx";
    await (await import(/* @vite-ignore */ url)).finishInstall(true);
  });
  await expect(page.getByRole("alert")).toContainText("Test install failed");
  await expect(burst).toHaveValue("180");
  await add.click();
  const saved = await page.evaluate(async () => {
    const url = "/e2e/particle-presets.fixture.tsx";
    const fixture = await import(/* @vite-ignore */ url);
    await fixture.finishInstall(false);
    return { installed: fixture.installed, placed: fixture.placed, assets: fixture.installedAssets, files: fixture.writtenFiles };
  });
  expect(saved.placed).toBe(false);
  expect(saved.installed.properties.maxParticles).toBe(320);
  expect(saved.installed.properties.emission).toEqual({ rateOverTime: 0, bursts: [{ time: 0, count: 180, cycles: 1, interval: 0 }] });
  expect(saved.installed.properties.looping).toBe(false);
  const texture = saved.assets.assets[saved.installed.properties.renderer.textureAssetId];
  expect(texture.source.kind).toBe("project");
  expect(texture.importMetadata.sourceFormat).toBe("png");
  expect(saved.files[texture.source.relativePath]).toMatch(/^data:image\/png;base64,/);
  await expect(detail.getByText(/Assetsに追加しました/)).toBeVisible();
  await detail.getByRole("button", { name: "テンプレートの設定に戻す" }).click();
  await expect(capacity).toHaveValue("260"); await expect(burst).toHaveValue("240");
  await detail.getByRole("button", { name: "見本を再生し直す" }).click();
  await detail.locator("canvas").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/particle-presets.png" });
  expect(errors).toEqual([]);
});

test("expanded catalog has independent valid presets in each category", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const url = "/src/lib/visual-editor/particle-system.ts";
    const { PARTICLE_AUTHORING_PRESETS: presets, normalizeParticleProperties, patchParticleProperties } = await import(/* @vite-ignore */ url);
    return presets.map((preset: { id: string; category: string; properties: object }) => {
      const config = normalizeParticleProperties(preset.properties);
      const edited = patchParticleProperties(config, { emission: { rateOverTime: 7 } });
      return { id: preset.id, category: preset.category, capacity: config.maxParticles, lifetime: config.startLifetime.min, preservedBursts: JSON.stringify(edited.emission.bursts) === JSON.stringify(config.emission.bursts), finite: !JSON.stringify(config).includes("null") };
    });
  });
  expect(new Set(result.map((entry: { id: string }) => entry.id)).size).toBe(25);
  for (const entry of result) {
    expect(entry.capacity).toBeGreaterThan(0); expect(entry.capacity).toBeLessThanOrEqual(10000);
    expect(entry.lifetime).toBeGreaterThan(0); expect(entry.preservedBursts).toBe(true); expect(entry.finite).toBe(true);
  }
  await page.getByRole("combobox", { name: "パーティクルのカテゴリ" }).selectOption("water");
  await expect(page.locator("[data-catalog-card]")).toHaveCount(5);
  await page.getByRole("textbox", { name: "パーティクルを検索" }).fill("存在しない粒子");
  await expect(page.getByText("条件に合うパーティクルがありません")).toBeVisible();
});

test("every preset saves its PNG dependency, survives reload, and publishes the same source file", async ({ page }) => {
  const summaries = await page.evaluate(async () => {
    const load = (url: string) => import(/* @vite-ignore */ url);
    const { PARTICLE_AUTHORING_PRESETS } = await load("/src/lib/visual-editor/particle-system.ts");
    const { prepareTexturedParticle } = await load("/e2e/particle-textures.fixture.tsx");
    const result = [];
    for (const preset of PARTICLE_AUTHORING_PRESETS) {
      const value = await prepareTexturedParticle(preset.id);
      const image = await createImageBitmap(await (await fetch(value.definition.url)).blob());
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0); image.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      result.push({ id: preset.id, textureId: value.texture.id, referenced: value.particle.properties.renderer.textureAssetId,
        hash: value.texture.sourceHash, expectedHash: value.definition.sha256,
        reusedId: value.reusedId, width: canvas.width, cornerAlpha: pixels[3],
        visible: pixels.some((alpha, index) => index % 4 === 3 && alpha > 100),
        copySource: value.output.assetCopyPlan.find((entry: { assetId: string }) => entry.assetId === value.texture.id)?.sourceRelativePath,
        source: value.texture.source.relativePath,
      });
    }
    return result;
  });
  expect(summaries).toHaveLength(25);
  for (const entry of summaries) {
    expect(entry.referenced).toBe(entry.textureId); expect(entry.reusedId).toBe(entry.textureId);
    expect(entry.hash).toBe(entry.expectedHash); expect(entry.width).toBe(256);
    expect(entry.cornerAlpha).toBe(0); expect(entry.visible).toBe(true);
    expect(entry.copySource).toBe(entry.source);
  }
  await page.evaluate(async () => {
    const url = "/src/lib/visual-editor/particle-textures.manifest.json";
    const { default: textures } = await import(/* @vite-ignore */ url);
    const sheet = document.createElement("div"); sheet.id = "particle-texture-sheet";
    sheet.style.cssText = "position:fixed;inset:0;z-index:99999;background:#182030;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:20px;color:white";
    document.body.append(sheet);
    await Promise.all(textures.map(async (texture: { id: string; name: string }) => {
      const cell = document.createElement("div"); cell.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #4b5563";
      const image = new Image(); image.width = 128; image.height = 128;
      image.src = `/visual-editor/particle-textures/v1/${texture.id}.png`;
      cell.append(image, document.createTextNode(texture.name)); sheet.append(cell);
      await image.decode();
    }));
  });
  await page.locator("#particle-texture-sheet").screenshot({ path: "test-results/particle-texture-sheet.png" });
});

test("texture write failure leaves the manifest unchanged and allows retry", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const load = (url: string) => import(/* @vite-ignore */ url);
    const { createPrototypeProject } = await load("/src/lib/visual-editor/prototype-project.ts");
    const { getParticleAuthoringPreset } = await load("/src/lib/visual-editor/particle-system.ts");
    const { prepareParticlePresetTexture } = await load("/src/lib/visual-editor/particle-preset-textures.ts");
    const assets = createPrototypeProject("world", "particle-failed-write").assets;
    const before = JSON.stringify(assets);
    let error = "";
    try { await prepareParticlePresetTexture(assets, getParticleAuthoringPreset("smoke"), {
      textureId: "failed-texture", writeFile: async () => { throw new Error("Disk full"); },
    }); } catch (reason) { error = (reason as Error).message; }
    const unchanged = JSON.stringify(assets) === before;
    let writes = 0;
    const retried = await prepareParticlePresetTexture(assets, getParticleAuthoringPreset("smoke"), {
      textureId: "retry-texture", writeFile: async () => { writes++; },
    });
    return { error, unchanged, writes, id: retried.preset.properties.renderer.textureAssetId };
  });
  expect(result).toEqual({ error: "Disk full", unchanged: true, writes: 1, id: "retry-texture" });
});

test("editor and actual generated publication code render the same textured Particle", async ({ page }) => {
  const value = await page.evaluate(async () => {
    const url = "/e2e/particle-textures.fixture.tsx";
    return (await import(/* @vite-ignore */ url)).prepareTexturedParticle("sakura", true);
  });
  const root = path.resolve("node_modules/.cache/xrift-studio/particle-render-parity");
  const world = value.output.overlayFiles.find((file: { relativePath: string }) => file.relativePath === "src/World.tsx")!.content;
  const componentName = /^const (CompiledParticle_\w+):/m.exec(world)?.[1];
  const config = /^const PARTICLE_CONFIG_.*;$/m.exec(world)?.[0];
  const urls = world.match(/^const ASSET_URL_.*;$/gm);
  const component = /^const CompiledParticle_[\s\S]*?^};/m.exec(world)?.[0];
  expect(componentName).toBeTruthy(); expect(config).toBeTruthy(); expect(urls).toBeTruthy(); expect(component).toBeTruthy();
  for (const file of value.output.overlayFiles) {
    if (!/\.(ts|tsx|js)$/.test(file.relativePath)) continue;
    const target = path.resolve(root, file.relativePath);
    expect(target.startsWith(root + path.sep)).toBe(true);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const source = file.relativePath === "src/World.tsx" ? `
import { useEffect, useMemo, type FC } from "react";
import { useTexture } from "@react-three/drei";
import { SRGBColorSpace, ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter } from "three";
import { XriftScriptParticleEmitter, type XriftParticleConfig } from "./xrift-studio/particle-runtime";
const useCompiledAssetUrl = (url: string) => url;
${urls!.join("\n")}
${config}
${component}
export { ${componentName} as PublishedParticle };
` : file.content;
    fs.writeFileSync(target, source);
  }
  const copied = value.output.assetCopyPlan.find((entry: { assetId: string }) => entry.assetId === value.texture.id)!;
  const bytes = Buffer.from(value.files[copied.sourceRelativePath].split(",")[1], "base64");
  await page.route(`**/${copied.targetRelativePath.replace(/^public\//, "")}`, route => route.fulfill({ contentType: "image/png", body: bytes }));
  const result = await page.evaluate(async value => {
    const load = (url: string) => import(/* @vite-ignore */ url);
    const fixture = await load("/e2e/particle-textures.fixture.tsx");
    const published = await load("/node_modules/.cache/xrift-studio/particle-render-parity/src/World.tsx");
    return fixture.compareParticlePixels(published.PublishedParticle, value.particle, value.texture, value.files);
  }, value);
  expect(result.same).toBe(true); expect(result.visible).toBeGreaterThan(100);
});
