import { expect, test, type Page, type Locator } from "@playwright/test";
import type { MaterialAsset, MaterialProperties } from "../src/lib/visual-editor/asset-manifest";
import type { readMaterialBatchState } from "./material-batch.fixture";

type BatchState = ReturnType<typeof readMaterialBatchState>;

async function state(page: Page): Promise<BatchState> {
  return page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    return (await load("/e2e/material-batch.fixture.ts")).readMaterialBatchState();
  });
}

test("PBRの複数選択も共通の全設定を使い、ClearcoatとRoughnessだけを変えてToonの控え・色・Textureを保持する", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e/material-batch.html");
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    (await load("/e2e/material-batch.fixture.ts")).mountMaterialBatchEditor(document.getElementById("root")!);
  });
  const savedStatus = page.locator("header").first().getByRole("status");
  await expect(savedStatus).toHaveText("保存済み");
  await page.getByPlaceholder("アセットを検索…").fill("Batch");
  const assets = page.getByRole("region", { name: "Assets" });
  await assets.getByRole("button", { name: /Batch Blue/ }).click();
  await assets.getByRole("button", { name: /Batch Red/ }).click({ modifiers: ["Control"] });
  const shading = page.getByRole("combobox", { name: "選択したマテリアルの種類", exact: true });
  await shading.selectOption("standard");
  await expect(shading).toHaveValue("standard");
  await expect(savedStatus).toHaveText("保存済み");
  const before = await state(page);
  const roughness = page.getByRole("spinbutton", { name: "Roughnessの数値", exact: true });
  await expect(roughness).toHaveValue("");
  await roughness.fill("0.72");
  await roughness.press("Tab");
  await expect.poll(async () => (await state(page)).saveCount).toBe(before.saveCount + 1);
  let changed = await state(page);
  for (const id of ["batch-red", "batch-blue"] as const) {
    expect(material(changed, id).properties.pbrMetallicRoughness.roughnessFactor).toBe(0.72);
    expect(uneditedProperties(material(changed, id).properties, ["pbrMetallicRoughness.roughnessFactor", "roughness"])).toEqual(uneditedProperties(material(before, id).properties, ["pbrMetallicRoughness.roughnessFactor", "roughness"]));
    expect(material(changed, id).savedMToonSettings).toEqual(material(before, id).savedMToonSettings);
  }
  await page.getByRole("checkbox", { name: "Clearcoatを有効にする", exact: true }).check();
  const factor = page.getByRole("spinbutton", { name: "Factorの数値", exact: true });
  await expect(factor).toBeEnabled();
  await expect(savedStatus).toHaveText("保存済み");
  const enabled = await state(page);
  await factor.fill("0.35");
  await factor.press("Tab");
  await expect.poll(async () => (await state(page)).saveCount).toBe(enabled.saveCount + 1);
  changed = await state(page);
  for (const id of ["batch-red", "batch-blue"] as const) {
    expect(material(changed, id).properties.extensions.KHR_materials_clearcoat?.clearcoatFactor).toBe(0.35);
    expect(uneditedProperties(material(changed, id).properties, ["extensions.KHR_materials_clearcoat"])).toEqual(uneditedProperties(material(enabled, id).properties, ["extensions.KHR_materials_clearcoat"]));
    expect(material(changed, id).savedMToonSettings).toEqual(material(before, id).savedMToonSettings);
  }
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(savedStatus).toHaveText("保存済み");
  const undone = await state(page);
  for (const id of ["batch-red", "batch-blue"] as const) expect(material(undone, id)).toEqual(material(enabled, id));
  await page.screenshot({ path: test.info().outputPath("material-batch-all-pbr.png") });
  expect(errors).toEqual([]);
});

function material(snapshot: BatchState, id: "batch-red" | "batch-blue"): MaterialAsset {
  return snapshot.assets[id] as MaterialAsset;
}

function commonProperties(properties: MaterialProperties) {
  const { VRMC_materials_mtoon: _toon, ...extensions } = properties.extensions;
  return { ...properties, extensions };
}

function uneditedProperties(properties: MaterialProperties, editedPaths: readonly string[]) {
  const result = structuredClone(properties);
  for (const path of editedPaths) {
    const keys = path.split(".");
    let parent: unknown = result;
    for (const key of keys.slice(0, -1)) {
      if (parent === null || typeof parent !== "object") break;
      parent = (parent as Record<string, unknown>)[key];
    }
    if (parent !== null && typeof parent === "object") delete (parent as Record<string, unknown>)[keys.at(-1)!];
  }
  return result;
}

test("Assetsの材質を一括で切り替え、個々の色・各Texture・UV・Alphaを保存し一度でUndoできる", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e/material-batch.html");
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const fixture = await load("/e2e/material-batch.fixture.ts");
    fixture.mountMaterialBatchEditor(document.getElementById("root")!);
  });
  const savedStatus = page.locator("header").first().getByRole("status");
  await expect(savedStatus).toHaveText("保存済み");
  const original = await state(page);
  const assets = page.getByRole("region", { name: "Assets" });
  await page.getByPlaceholder("アセットを検索…").fill("Batch");
  await assets.getByRole("button", { name: /Batch Blue/ }).click();
  for (const name of ["Batch Red", "Batch Custom", "Batch Model", "Batch Texture 1", "Batch Texture 2"]) {
    await assets.getByTitle(new RegExp(`^${name}を選択`)).click({ modifiers: ["Control"] });
  }
  const shading = page.getByRole("combobox", { name: "選択したマテリアルの種類", exact: true });
  await expect(shading).toHaveValue("");
  await expect(page.getByText("マテリアル以外の3件は変更しません。", { exact: true })).toBeVisible();
  await expect(page.getByText("カスタムシェーダーのマテリアル1件は種類を変更できません。", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "複数のテクスチャ", exact: true })).toBeVisible();

  async function switchAndSave(type: string) {
    const before = (await state(page)).saveCount;
    await shading.selectOption(type);
    await expect(shading).toHaveValue(type);
    await expect(savedStatus).toHaveText("保存済み");
    const changed = await state(page);
    expect(changed.saveCount).toBe(before + 1);
    for (const id of ["batch-red", "batch-blue"] as const) {
      expect(commonProperties(material(changed, id).properties)).toEqual(commonProperties(material(original, id).properties));
      expect(changed.savedAssets[id]).toEqual(changed.assets[id]);
    }
    for (const id of ["batch-custom", "batch-model", ...Array.from({ length: 10 }, (_, index) => `batch-texture-${index + 1}`)]) {
      expect(changed.assets[id]).toEqual(original.assets[id]);
    }
    return changed;
  }

  const legacy = await switchAndSave("mtoon-0.x");
  for (const id of ["batch-red", "batch-blue"] as const) {
    expect(material(legacy, id).properties.extensions.VRMC_materials_mtoon?.extras?.xriftVrm0CompatShade).toBe(true);
  }
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(shading).toHaveValue("");
  await expect(savedStatus).toHaveText("保存済み");
  const undone = await state(page);
  for (const id of ["batch-red", "batch-blue"] as const) expect(material(undone, id)).toEqual(material(original, id));
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(shading).toHaveValue("mtoon-0.x");
  await expect(savedStatus).toHaveText("保存済み");
  const modern = await switchAndSave("mtoon-1.0");
  const modernSettings = material(modern, "batch-blue").properties.extensions.VRMC_materials_mtoon;
  expect(modernSettings?.extras?.xriftVrm0CompatShade).toBe(false);
  const standard = await switchAndSave("standard");
  for (const id of ["batch-red", "batch-blue"] as const) {
    expect(material(standard, id).properties.extensions.VRMC_materials_mtoon).toBeUndefined();
    expect(material(standard, id).savedMToonSettings).toBeDefined();
  }
  expect(material(standard, "batch-blue").savedMToonSettings).toEqual(modernSettings);
  const restored = await switchAndSave("mtoon-0.x");
  expect(material(restored, "batch-blue").properties.extensions.VRMC_materials_mtoon).toEqual({
    ...modernSettings, extras: { ...modernSettings?.extras, xriftVrm0CompatShade: true },
  });
  const redColor = material(restored, "batch-red").properties.pbrMetallicRoughness.baseColorFactor;
  const blueColor = material(restored, "batch-blue").properties.pbrMetallicRoughness.baseColorFactor;
  expect(redColor).not.toEqual(blueColor);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect(shading).toBeDisabled();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(shading).toBeEnabled();
  await expect(savedStatus).toHaveText("保存済み");
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    (await load("/e2e/material-batch.fixture.ts")).reopenMaterialBatchEditor();
  });
  await expect(savedStatus).toHaveText("保存済み");
  const reloaded = await state(page);
  for (const id of ["batch-red", "batch-blue"] as const) expect(material(reloaded, id)).toEqual(material(restored, id));
  await page.getByPlaceholder("アセットを検索…").fill("Batch");
  await assets.getByRole("button", { name: /Batch Red/ }).click();
  await assets.getByRole("button", { name: /Batch Blue/ }).click({ modifiers: ["Control"] });
  await expect(shading).toHaveValue("mtoon-0.x");
  await page.screenshot({ path: test.info().outputPath("material-batch-inspector.png") });
  expect(errors).toEqual([]);
});

for (const version of ["0.x", "1.0"] as const) {
test(`同じMToon ${version}の全設定を一括表示し、数値・RGB成分・Alpha・Texture参照・UVだけを個別データへ適用する`, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e/material-batch.html");
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    (await load("/e2e/material-batch.fixture.ts")).mountMaterialBatchEditor(document.getElementById("root")!);
  });
  const savedStatus = page.locator("header").first().getByRole("status");
  await expect(savedStatus).toHaveText("保存済み");
  await page.getByPlaceholder("アセットを検索…").fill("Batch");
  const assets = page.getByRole("region", { name: "Assets" });
  await assets.getByRole("button", { name: /Batch Blue/ }).click();
  for (const name of ["Batch Red", "Batch Custom", "Batch Model", "Batch Texture 1", "Batch Texture 2"]) {
    await assets.getByTitle(new RegExp(`^${name}を選択`)).click({ modifiers: ["Control"] });
  }
  const shading = page.getByRole("combobox", { name: "選択したマテリアルの種類", exact: true });
  await expect(shading).toHaveValue("");
  await expect(page.getByRole("spinbutton", { name: "Outline Width", exact: true })).toHaveCount(0);
  await shading.selectOption(`mtoon-${version}`);
  await expect(shading).toHaveValue(`mtoon-${version}`);
  await expect(savedStatus).toHaveText("保存済み");
  const baseline = await state(page);
  const width = page.getByRole("spinbutton", { name: "Outline Width", exact: true });
  await expect(width).toBeVisible();
  await expect(width).toHaveValue("");
  await expect(width).toHaveAttribute("placeholder", "一部異なる");
  await expect(page.getByRole("combobox", { name: "Base Color Mapのテクスチャ", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Normal Mapのテクスチャ", exact: true })).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Emissive Mapのテクスチャ", exact: true })).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Opacity Mapのテクスチャ", exact: true })).toHaveCount(1);

  async function editAndSave(control: Locator, value: string, editedPaths: readonly string[], select = false, check = false) {
    const before = await state(page);
    await expect(control).toBeVisible();
    if (check) await control.check();
    else if (select) await control.selectOption(value);
    else { await control.fill(value); await control.press("Tab"); }
    await expect.poll(async () => (await state(page)).saveCount).toBe(before.saveCount + 1);
    await expect(savedStatus).toHaveText("保存済み");
    const changed = await state(page);
    for (const id of ["batch-red", "batch-blue"] as const) {
      expect(uneditedProperties(material(changed, id).properties, editedPaths)).toEqual(uneditedProperties(material(before, id).properties, editedPaths));
    }
    for (const id of ["batch-custom", "batch-model", "batch-texture-1", "batch-texture-2"]) expect(changed.assets[id]).toEqual(baseline.assets[id]);
    return changed;
  }

  let changed = await editAndSave(width, "0.006", ["extensions.VRMC_materials_mtoon.outlineWidthFactor"]);
  for (const id of ["batch-red", "batch-blue"] as const) expect(material(changed, id).properties.extensions.VRMC_materials_mtoon?.outlineWidthFactor).toBe(0.006);
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(width).toHaveValue("");
  await expect(savedStatus).toHaveText("保存済み");
  const undone = await state(page);
  for (const id of ["batch-red", "batch-blue"] as const) expect(material(undone, id)).toEqual(material(baseline, id));
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(width).toHaveValue("0.006");
  await expect(savedStatus).toHaveText("保存済み");
  changed = await editAndSave(page.getByRole("spinbutton", { name: "Shade Color R", exact: true }), "0.55", ["extensions.VRMC_materials_mtoon.shadeColorFactor.0"]);
  for (const id of ["batch-red", "batch-blue"] as const) expect(material(changed, id).properties.extensions.VRMC_materials_mtoon?.shadeColorFactor[0]).toBe(0.55);
  changed = await editAndSave(page.getByRole("spinbutton", { name: "Alphaの数値", exact: true }), "0.62", ["pbrMetallicRoughness.baseColorFactor.3", "opacity"]);
  for (const id of ["batch-red", "batch-blue"] as const) expect(material(changed, id).properties.pbrMetallicRoughness.baseColorFactor[3]).toBe(0.62);
  changed = await editAndSave(page.getByRole("spinbutton", { name: "Normal Scale", exact: true }), "0.75", ["normalTexture.scale"]);
  for (const id of ["batch-red", "batch-blue"] as const) expect(material(changed, id).properties.normalTexture?.scale).toBe(0.75);
  changed = await editAndSave(page.getByRole("spinbutton", { name: "Matcap Color R", exact: true }), "0.45", ["extensions.VRMC_materials_mtoon.matcapFactor.0"]);
  for (const id of ["batch-red", "batch-blue"] as const) expect(material(changed, id).properties.extensions.VRMC_materials_mtoon?.matcapFactor?.[0]).toBe(0.45);
  changed = await editAndSave(page.getByRole("spinbutton", { name: "Rim Color B", exact: true }), "0.7", ["extensions.VRMC_materials_mtoon.parametricRimColorFactor.2"]);
  for (const id of ["batch-red", "batch-blue"] as const) expect(material(changed, id).properties.extensions.VRMC_materials_mtoon?.parametricRimColorFactor?.[2]).toBe(0.7);
  changed = await editAndSave(page.getByRole("spinbutton", { name: "UV Scroll X Speed", exact: true }), "-0.3", ["extensions.VRMC_materials_mtoon.uvAnimationScrollXSpeedFactor"]);
  for (const id of ["batch-red", "batch-blue"] as const) expect(material(changed, id).properties.extensions.VRMC_materials_mtoon?.uvAnimationScrollXSpeedFactor).toBe(-0.3);
  changed = await editAndSave(page.getByRole("spinbutton", { name: "Shading Shift Map Scale", exact: true }), "0.9", ["extensions.VRMC_materials_mtoon.shadingShiftTexture.scale"]);
  expect(material(changed, "batch-red").properties.extensions.VRMC_materials_mtoon?.shadingShiftTexture).toBeUndefined();
  expect(material(changed, "batch-blue").properties.extensions.VRMC_materials_mtoon?.shadingShiftTexture?.scale).toBe(0.9);
  changed = await editAndSave(page.getByRole("spinbutton", { name: "Render Queue Offset", exact: true }), "2", ["extensions.VRMC_materials_mtoon.renderQueueOffsetNumber"]);
  for (const id of ["batch-red", "batch-blue"] as const) expect(material(changed, id).properties.extensions.VRMC_materials_mtoon?.renderQueueOffsetNumber).toBe(2);
  await editAndSave(page.getByRole("combobox", { name: "Alpha Mode", exact: true }), "BLEND", ["alphaMode"], true);
  await editAndSave(page.getByRole("combobox", { name: /^Depth Write/ }), "auto", ["depthWrite"], true);
  const zWrite = page.getByRole("checkbox", { name: /^Transparent With ZWrite/ });
  await expect(zWrite).toBeEnabled();
  changed = await editAndSave(zWrite, "", ["extensions.VRMC_materials_mtoon.transparentWithZWrite"], false, true);
  for (const id of ["batch-red", "batch-blue"] as const) expect(material(changed, id).properties.extensions.VRMC_materials_mtoon?.transparentWithZWrite).toBe(true);

  const baseMap = page.getByRole("combobox", { name: "Base Color Mapのテクスチャ", exact: true });
  changed = await editAndSave(page.getByRole("group", { name: "Base Color Map", exact: true }).getByRole("spinbutton", { name: "Base Color Map ずらす量 X", exact: true }), "0.75", ["pbrMetallicRoughness.baseColorTexture.transform.offset.0"]);
  for (const id of ["batch-red", "batch-blue"] as const) expect(material(changed, id).properties.pbrMetallicRoughness.baseColorTexture?.transform?.offset[0]).toBe(0.75);
  changed = await editAndSave(baseMap, "batch-texture-10", ["pbrMetallicRoughness.baseColorTexture.textureAssetId", "baseColorTextureId"], true);
  for (const id of ["batch-red", "batch-blue"] as const) expect(material(changed, id).properties.pbrMetallicRoughness.baseColorTexture?.textureAssetId).toBe("batch-texture-10");
  const finalState = changed;
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(width).toBeDisabled();
  await expect(baseMap).toBeDisabled();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(width).toBeEnabled();
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    (await load("/e2e/material-batch.fixture.ts")).reopenMaterialBatchEditor();
  });
  await expect(savedStatus).toHaveText("保存済み");
  const reloaded = await state(page);
  for (const id of ["batch-red", "batch-blue"] as const) expect(material(reloaded, id)).toEqual(material(finalState, id));
  await page.getByPlaceholder("アセットを検索…").fill("Batch");
  await assets.getByRole("button", { name: /Batch Red/ }).click();
  await assets.getByRole("button", { name: /Batch Blue/ }).click({ modifiers: ["Control"] });
  await expect(width).toHaveValue("0.006");
  await width.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath(`material-batch-all-mtoon-${version}.png`) });
  expect(errors).toEqual([]);
});
}
