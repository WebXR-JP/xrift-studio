import { expect, test, type Page } from "@playwright/test";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";
import type { MaterialAsset } from "../src/lib/visual-editor/asset-manifest";
import type { readMaterialBatchState } from "./material-batch.fixture";

async function state(page: Page): Promise<ReturnType<typeof readMaterialBatchState>> {
  return page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    return (await load("/e2e/material-batch.fixture.ts")).readMaterialBatchState();
  });
}

async function call(page: Page, tool: string, args: Record<string, unknown> = {}): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args }) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    return (await load("/e2e/material-batch.fixture.ts")).callMaterialBatchMcp(tool, args);
  }, { tool, args });
}

async function context(page: Page) {
  const response = await call(page, "get_editor_context");
  expect(response.ok).toBe(true);
  return response.result as { projectId: string; sceneId: string; revision: number; editorMode: "edit" | "play" };
}

test("実EditorのMCP bridgeがMToon種類・複数fieldを一回のrevision/保存/Undoにし、個々の値と複数選択を保つ", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e/material-batch.html");
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    (await load("/e2e/material-batch.fixture.ts")).mountMaterialBatchMcpEditor(document.getElementById("root")!);
  });
  await expect.poll(async () => (await state(page)).mcpBridgeReady).toBe(true);
  const savedStatus = page.locator("header").first().getByRole("status");
  await expect(savedStatus).toHaveText("保存済み");
  await page.getByPlaceholder("アセットを検索…").fill("Batch");
  const assets = page.getByRole("region", { name: "Assets" });
  await assets.getByRole("button", { name: /Batch Blue/ }).click();
  for (const name of ["Batch Red", "Batch Custom", "Batch Texture 1"]) await assets.getByTitle(new RegExp(`^${name}を選択`)).click({ modifiers: ["Control"] });
  await expect(page.getByTitle("Assets · 4件", { exact: true })).toBeVisible();
  const shading = page.getByRole("combobox", { name: "選択したマテリアルの種類", exact: true });
  const original = await state(page);
  const assetIds = ["batch-red", "batch-blue", "batch-custom", "batch-texture-1"];
  const selected = (snapshot: Awaited<ReturnType<typeof state>>, id: string) => snapshot.assets[id] as MaterialAsset;
  async function edit(operation: Record<string, unknown>) {
    const before = await state(page);
    const current = await context(page);
    const response = await call(page, "update_material_assets", {
      projectId: current.projectId, sceneId: current.sceneId, expectedRevision: current.revision, assetIds, ...operation,
    });
    expect(response.ok).toBe(true);
    expect(response.result?.revisionBefore).toBe(current.revision);
    expect(response.result?.revisionAfter).toBe(current.revision + 1);
    expect(response.result?.updatedMaterialAssetIds).toEqual(["batch-red", "batch-blue"]);
    expect(response.result?.skippedAssets).toEqual([{ assetId: "batch-custom", reason: "CUSTOM_SHADER" }, { assetId: "batch-texture-1", reason: "NOT_MATERIAL" }]);
    await expect.poll(async () => (await state(page)).saveCount).toBe(before.saveCount + 1);
    await expect(savedStatus).toHaveText("保存済み");
    expect((await context(page)).revision).toBe(current.revision + 1);
    const changed = await state(page);
    for (const id of assetIds) expect(changed.savedAssets[id]).toEqual(changed.assets[id]);
    for (const id of ["batch-custom", "batch-texture-1"]) expect(changed.assets[id]).toEqual(original.assets[id]);
    await expect(page.getByTitle("Assets · 4件", { exact: true })).toBeVisible();
    return changed;
  }
  await edit({ patch: { shadingModel: "mtoon-0.x" } });
  await expect(shading).toHaveValue("mtoon-0.x");
  for (const id of ["batch-red", "batch-blue"]) expect(selected(await state(page), id).properties.pbrMetallicRoughness).toEqual(selected(original, id).properties.pbrMetallicRoughness);
  const afterType = await state(page);
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(shading).toHaveValue("");
  await expect.poll(async () => (await state(page)).saveCount).toBe(afterType.saveCount + 1);
  for (const id of ["batch-red", "batch-blue"]) expect(selected(await state(page), id)).toEqual(selected(original, id));
  await expect(page.getByTitle("Assets · 4件", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(shading).toHaveValue("mtoon-0.x");
  await expect.poll(async () => (await state(page)).saveCount).toBe(afterType.saveCount + 2);
  const beforeFields = await state(page);
  const changed = await edit({ fieldUpdates: [
    { path: "extensions.VRMC_materials_mtoon.outlineWidthFactor", value: .006 },
    { path: "extensions.VRMC_materials_mtoon.shadeColorFactor.0", value: .55 },
    { path: "pbrMetallicRoughness.baseColorTexture.transform.offset.0", value: .75 },
    { path: "normalTexture.scale", value: -.5 },
  ] });
  for (const id of ["batch-red", "batch-blue"]) {
    const before = selected(beforeFields, id).properties; const after = selected(changed, id).properties;
    expect(after.pbrMetallicRoughness.baseColorFactor).toEqual(before.pbrMetallicRoughness.baseColorFactor);
    expect(after.extensions.VRMC_materials_mtoon?.outlineWidthFactor).toBe(.006);
    expect(after.extensions.VRMC_materials_mtoon?.shadeColorFactor).toEqual([.55, ...before.extensions.VRMC_materials_mtoon!.shadeColorFactor.slice(1)]);
    expect(after.pbrMetallicRoughness.baseColorTexture).toEqual({ ...before.pbrMetallicRoughness.baseColorTexture, transform: { ...before.pbrMetallicRoughness.baseColorTexture!.transform, offset: [.75, before.pbrMetallicRoughness.baseColorTexture!.transform!.offset[1]] } });
    expect(after.normalTexture).toEqual({ ...before.normalTexture, scale: -.5 });
    expect(after.emissiveTexture).toEqual(before.emissiveTexture);
    expect(after.opacityTexture).toEqual(before.opacityTexture);
  }
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect.poll(async () => (await state(page)).saveCount).toBe(changed.saveCount + 1);
  for (const id of ["batch-red", "batch-blue"]) expect(selected(await state(page), id)).toEqual(selected(beforeFields, id));
  await expect(page.getByTitle("Assets · 4件", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect.poll(async () => (await state(page)).saveCount).toBe(changed.saveCount + 2);
  const beforeRejected = await state(page); const beforeRejectedContext = await context(page);
  const rejected = await call(page, "update_material_assets", { projectId: beforeRejectedContext.projectId, sceneId: beforeRejectedContext.sceneId, expectedRevision: beforeRejectedContext.revision, assetIds, fieldUpdates: [{ path: "normalTexture.textureAssetId", value: "missing-map" }, { path: "roughness", value: .2 }] });
  expect(rejected.ok).toBe(false); expect(rejected.error?.code).toBe("INVALID_TEXTURE_REFERENCE");
  expect((await context(page)).revision).toBe(beforeRejectedContext.revision);
  expect((await state(page)).assets).toEqual(beforeRejected.assets);
  expect((await state(page)).saveCount).toBe(beforeRejected.saveCount);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const playing = await context(page); expect(playing.editorMode).toBe("play");
  const denied = await call(page, "update_material_assets", { projectId: playing.projectId, sceneId: playing.sceneId, expectedRevision: playing.revision, assetIds, patch: { shadingModel: "mtoon-1.0" } });
  expect(denied.ok).toBe(false); expect(denied.error?.code).toBe("EDITOR_READ_ONLY");
  const single = await call(page, "update_material_asset", { projectId: playing.projectId, sceneId: playing.sceneId, expectedRevision: playing.revision, materialAssetId: "batch-red", patch: { shadingModel: "mtoon-1.0" } });
  expect(single.ok).toBe(true);
  await expect.poll(async () => (await state(page)).saveCount).toBe(beforeRejected.saveCount + 1);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(savedStatus).toHaveText("保存済み");
  const final = await state(page);
  expect(selected(final, "batch-red").properties.extensions.VRMC_materials_mtoon?.extras?.xriftVrm0CompatShade).toBe(false);
  expect(selected(final, "batch-blue").properties.extensions.VRMC_materials_mtoon?.extras?.xriftVrm0CompatShade).toBe(true);
  await page.evaluate(async () => { const load = (path: string) => import(/* @vite-ignore */ path); (await load("/e2e/material-batch.fixture.ts")).reopenMaterialBatchEditor(); });
  await expect.poll(async () => (await state(page)).mcpBridgeReady).toBe(true);
  await expect(savedStatus).toHaveText("保存済み");
  for (const id of ["batch-red", "batch-blue"]) expect(selected(await state(page), id)).toEqual(selected(final, id));
  expect(errors).toEqual([]);
});
