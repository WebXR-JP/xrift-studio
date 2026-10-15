import { expect, test, type Page } from "@playwright/test";
import type { VisualProjectFiles, XriftMcpEditorResponse } from "../src/lib/tauri";
import type { AssetManifest, MaterialAsset } from "../src/lib/visual-editor/asset-manifest";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { SceneDocument } from "../src/lib/visual-editor/scene-document";

declare global {
  interface Window {
    __XRIFT_MATERIAL_SAVE_RACE__?: { waiting: boolean; released: boolean; release?: () => void; writes: number[] };
  }
}

test.setTimeout(240_000);
const chat = (page: Page) => page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
const controls = (page: Page, assetId: string) => chat(page).locator(`fieldset[data-material-asset-id="${assetId}"]`);

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}

async function ready(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: "chat-material-controls-isolated", kind: "world", templateId: "blank" })).ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const path = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!.path);
  expect((await call(page, "close_project")).ok).toBe(true);
  // Author only this page's in-memory native project. The real Editor,
  // Material update path, document codecs and renderer remain unchanged.
  const fixture = await page.evaluate(async projectPath => {
    const tauriPath = "/src/lib/tauri.ts", persistencePath = "/src/lib/visual-editor/persistence.ts";
    const assetsPath = "/src/lib/visual-editor/asset-manifest.ts", shaderPath = "/src/lib/visual-editor/custom-shader-contract.ts";
    const { tauri } = await import(/* @vite-ignore */ tauriPath);
    const { parseVisualProjectFiles, serializeVisualProjectDocuments } = await import(/* @vite-ignore */ persistencePath);
    const { createDefaultMaterialAsset, createTextureAsset, updateMaterialAsset } = await import(/* @vite-ignore */ assetsPath);
    const { createDefaultCustomShader } = await import(/* @vite-ignore */ shaderPath);
    const documents = parseVisualProjectFiles(await tauri.readVisualProject(projectPath));
    const scene = documents.scenes[documents.project.entrySceneId];
    const mesh = scene.entities["starter-floor"].components.find((component: { type: string }) => component.type === "mesh");
    const targetId = mesh.materialBindings[0].materialAssetId as string;
    const otherId = (Object.values(documents.assets.assets) as { id: string; kind: string }[]).find(asset => asset.kind === "material" && asset.id !== targetId)!.id;
    const canvas = document.createElement("canvas"); canvas.width = 2; canvas.height = 2;
    const context = canvas.getContext("2d")!; context.fillStyle = "white"; context.fillRect(0, 0, 2, 2);
    const dataUrl = canvas.toDataURL("image/png"), relativePath = "assets/chat-material-controls.png", textureId = "chat-controls-texture";
    const invoke = window.__TAURI_INTERNALS__!.invoke!.bind(window.__TAURI_INTERNALS__);
    window.__TAURI_INTERNALS__!.invoke = (command, args, options) => command === "read_image_data_url" && args?.projectPath === projectPath && args?.rel === relativePath
      ? Promise.resolve(dataUrl) : invoke(command, args, options);
    documents.assets.assets[textureId] = createTextureAsset({ id: textureId, name: "保持するTexture", source: { kind: "project", relativePath }, importSettings: {} });
    documents.assets = updateMaterialAsset(documents.assets, targetId, {
      pbrMetallicRoughness: { baseColorFactor: [0.4, 0.5, 0.6, 0.45], roughnessFactor: 0.8, metallicFactor: 0.1,
        baseColorTexture: { textureAssetId: textureId, texCoord: 0, transform: { offset: [0.2, 0.3], scale: [2, 3], rotation: 0.4 } } },
      alphaMode: "BLEND", alphaCutoff: 0.3, doubleSided: true,
      normalTexture: { textureAssetId: textureId, texCoord: 0, scale: 0.4 }, emissiveFactor: [0.1, 0.05, 0],
    });
    documents.assets.assets[targetId].name = "同じ名前のMaterial";
    documents.assets.assets[otherId].name = "同じ名前のMaterial";
    const shaderId = "chat-controls-custom-shader";
    documents.assets.assets[shaderId] = { ...createDefaultMaterialAsset({ id: shaderId, name: "同じ名前のMaterial", properties: { roughness: 0.7 } }), shader: createDefaultCustomShader() };
    await tauri.saveVisualProject(projectPath, serializeVisualProjectDocuments(documents));
    window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null };
    return { targetId, otherId, shaderId, textureId };
  }, path);
  expect((await call(page, "open_project", { path })).ok).toBe(true);
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await expect(chat(page).getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("fixture-model");
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  return { path, ...fixture };
}

async function saved(page: Page, projectPath: string) {
  return page.evaluate(async projectPath => {
    const path = "/src/lib/tauri.ts";
    const files = await (await import(/* @vite-ignore */ path)).tauri.readVisualProject(projectPath) as VisualProjectFiles;
    return { assets: JSON.parse(files.assetManifestJson) as AssetManifest, scene: JSON.parse(files.sceneDocuments[0].content) as SceneDocument };
  }, projectPath);
}

function material(assets: AssetManifest, id: string): MaterialAsset {
  const asset = assets.assets[id];
  if (asset?.kind !== "material") throw new Error(`Missing Material ${id}`);
  return asset;
}

function authored(asset: MaterialAsset) {
  const { thumbnail: _thumbnail, ...content } = asset;
  return content;
}

async function setPlan(page: Page, ids: string[]) {
  await page.evaluate(ids => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({
    title: "Materialの設定変更", description: "対象のMaterialだけを変更します", objects: [],
    operations: ids.map((id, index) => ({ kind: "material-update", candidateId: `project:${id}`, propertiesJson: JSON.stringify({ roughness: index ? 0.37 : 0.6 }) })),
  }); }, ids);
}

async function generate(page: Page, mode: "build" | "plan" = "build") {
  const response = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "対象Materialの質感を調整してください", mode }, true);
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result!.generationId as string;
}

async function job(page: Page, generationId: string) {
  return (await call(page, "get_chatgpt_generation", { generationId })).result as ChatgptGeneration;
}

async function runtime(page: Page) {
  return page.evaluate(async () => {
    const path = "/e2e/chatgpt-modeling.fixture.ts";
    return (await import(/* @vite-ignore */ path)).readModelRuntime("starter-floor");
  }) as Promise<ReturnType<typeof import("./chatgpt-modeling.fixture").readModelRuntime>>;
}

test("チャット結果のMaterialをIDで編集し、同名素材・Alpha・Texture・Shaderと過去の記録を保ち実描画と再読込へ反映する", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const fixture = await ready(page), before = await saved(page, fixture.path);
  await setPlan(page, [fixture.targetId, fixture.shaderId]);
  const id = await generate(page);
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  expect((await job(page, id)).plan?.objects.map(object => object.materialAssetId)).toEqual([fixture.targetId, fixture.shaderId]);
  const target = controls(page, fixture.targetId), shader = controls(page, fixture.shaderId);
  await expect(target).toHaveAccessibleName("現在のMaterialを調整");
  await expect(shader).toBeVisible();
  await expect(controls(page, fixture.otherId)).toHaveCount(0);
  const recordedSettings = await chat(page).getByLabel("設定項目", { exact: true }).allTextContents();
  const recordedLog = await chat(page).getByRole("region", { name: "作業の記録", exact: true }).innerText();
  await target.getByLabel("Base Colorの色", { exact: true }).fill("#224466");
  const hex = target.getByRole("textbox", { name: "Base ColorのHEX", exact: true });
  await expect(hex).toHaveValue("#224466");
  await hex.fill("#47a");
  await hex.press("Enter");
  await expect(hex).toHaveValue("#4477aa");
  await hex.fill("invalid");
  await hex.press("Tab");
  await expect(hex).toHaveValue("#4477aa");
  await target.getByRole("spinbutton", { name: "Roughnessの数値", exact: true }).fill("0.23");
  await target.getByRole("spinbutton", { name: "Metallicの数値", exact: true }).fill("0.71");
  await shader.getByRole("spinbutton", { name: "Roughnessの数値", exact: true }).fill("0.19");
  await shader.getByRole("spinbutton", { name: "Roughnessの数値", exact: true }).press("Tab");
  await expect.poll(async () => material((await saved(page, fixture.path)).assets, fixture.shaderId).properties.pbrMetallicRoughness.roughnessFactor).toBe(0.19);
  const after = await saved(page, fixture.path), changed = material(after.assets, fixture.targetId), original = material(before.assets, fixture.targetId);
  expect(changed.properties.pbrMetallicRoughness).toMatchObject({ baseColorFactor: [0x44 / 255, 0x77 / 255, 0xaa / 255, 0.45], roughnessFactor: 0.23, metallicFactor: 0.71 });
  expect(changed.properties.pbrMetallicRoughness.baseColorTexture).toEqual(original.properties.pbrMetallicRoughness.baseColorTexture);
  for (const key of ["alphaMode", "alphaCutoff", "normalTexture", "doubleSided", "emissiveFactor"] as const) expect(changed.properties[key]).toEqual(original.properties[key]);
  expect(material(after.assets, fixture.shaderId).shader).toEqual(material(before.assets, fixture.shaderId).shader);
  expect(authored(material(after.assets, fixture.otherId))).toEqual(authored(material(before.assets, fixture.otherId)));
  expect(after.scene).toEqual(before.scene);
  expect(await chat(page).getByLabel("設定項目", { exact: true }).allTextContents()).toEqual(recordedSettings);
  expect(await chat(page).getByRole("region", { name: "作業の記録", exact: true }).innerText()).toBe(recordedLog);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { document.body.dataset.materialOutputCopy = text; } } });
  });
  await chat(page).getByRole("button", { name: "出力をコピー", exact: true }).click();
  const copied = await page.evaluate(() => document.body.dataset.materialOutputCopy!);
  for (const current of ["現在のMaterialを調整", "Base Color #4477aa", "Roughness 0.23", "Metallic 0.71"]) expect(copied).toContain(current);
  await expect.poll(async () => (await runtime(page))?.materials.some(value => Math.abs(value.metallic - 0.71) < 1e-6 && Math.abs(value.roughness - 0.23) < 1e-6)).toBe(true);
  expect((await runtime(page))!.meshCount).toBeGreaterThan(0);
  const history = page.getByRole("group", { name: "編集履歴", exact: true });
  await history.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(shader.getByRole("spinbutton", { name: "Roughnessの数値", exact: true })).toHaveValue("0.37");
  await expect(target.getByRole("spinbutton", { name: "Roughnessの数値", exact: true })).toHaveValue("0.23");
  await history.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(shader.getByRole("spinbutton", { name: "Roughnessの数値", exact: true })).toHaveValue("0.19");
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  expect((await call(page, "close_project")).ok).toBe(true);
  expect((await call(page, "open_project", { path: fixture.path })).ok).toBe(true);
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  expect(authored(material((await saved(page, fixture.path)).assets, fixture.targetId))).toEqual(authored(changed));
  await expect.poll(async () => (await runtime(page))?.materials.some(value => Math.abs(value.metallic - 0.71) < 1e-6 && Math.abs(value.roughness - 0.23) < 1e-6)).toBe(true);
  await expect(target.getByRole("textbox", { name: "Base ColorのHEX", exact: true })).toHaveValue("#4477aa");
  await page.setViewportSize({ width: 375, height: 1000 });
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeInViewport();
  expect(await target.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("phone-chat-material-controls.png") });
  expect(errors).toEqual([]);
});

test("Materialの直接調整はPlayでは無効、確認待ち・制作中・取り消し後は表示せずSceneを保つ", async ({ page }) => {
  const fixture = await ready(page);
  await setPlan(page, [fixture.targetId]);
  const id = await generate(page, "plan");
  await expect.poll(async () => (await job(page, id)).status).toBe("planned");
  await expect(chat(page).getByRole("group", { name: "現在のMaterialを調整", exact: true })).toHaveCount(0);
  const planned = await saved(page, fixture.path);
  await chat(page).getByRole("button", { name: "変更を反映", exact: true }).click();
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  await expect(controls(page, fixture.targetId)).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  const input = controls(page, fixture.targetId).getByRole("textbox", { name: "Base ColorのHEX", exact: true });
  await expect(input).toBeDisabled();
  await expect(controls(page, fixture.targetId).getByRole("spinbutton", { name: "Roughnessの数値", exact: true })).toBeDisabled();
  await expect(controls(page, fixture.targetId).getByRole("slider", { name: "Metallicのスライダー", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await expect(input).toBeEnabled();
  await chat(page).getByRole("button", { name: "この依頼の変更を戻す", exact: true }).click();
  await expect.poll(async () => Boolean((await job(page, id)).revertedAt)).toBe(true);
  await expect(chat(page).getByRole("group", { name: "現在のMaterialを調整", exact: true })).toHaveCount(0);
  expect(authored(material((await saved(page, fixture.path)).assets, fixture.targetId))).toEqual(authored(material(planned.assets, fixture.targetId)));
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = true; });
  let runningId: string | undefined;
  try {
    runningId = await generate(page);
    await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptPlanWaiting)).toBe(true);
    await expect(chat(page).getByRole("group", { name: "現在のMaterialを調整", exact: true })).toHaveCount(0);
    expect((await call(page, "cancel_chatgpt_generation", { generationId: runningId })).ok).toBe(true);
    await expect.poll(async () => (await job(page, runningId!)).status).toBe("cancelled");
    await expect(chat(page).getByRole("group", { name: "現在のMaterialを調整", exact: true })).toHaveCount(0);
    expect((await saved(page, fixture.path)).scene).toEqual(planned.scene);
  } finally {
    if (runningId) await call(page, "cancel_chatgpt_generation", { generationId: runningId }).catch(() => undefined);
    await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = false; }).catch(() => undefined);
  }
});

test("Undoの保存中にRedoへ戻っても最後のMaterialを再保存し、保存済み表示と再読込を一致させる", async ({ page }) => {
  const fixture = await ready(page);
  await setPlan(page, [fixture.targetId]);
  const id = await generate(page);
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  const roughness = controls(page, fixture.targetId).getByRole("spinbutton", { name: "Roughnessの数値", exact: true });
  await roughness.fill("0.21");
  await roughness.press("Tab");
  await expect.poll(async () => material((await saved(page, fixture.path)).assets, fixture.targetId).properties.pbrMetallicRoughness.roughnessFactor).toBe(0.21);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  await page.evaluate(({ projectPath, materialId }) => {
    const gate = { waiting: false, released: false, writes: [] as number[], release: undefined as (() => void) | undefined };
    window.__XRIFT_MATERIAL_SAVE_RACE__ = gate;
    const internals = window.__TAURI_INTERNALS__!, invoke = internals.invoke!.bind(internals);
    // Hold only the Undo snapshot on this test's native disk. Redo must be
    // queued after it rather than trusting the last already-saved reference.
    internals.invoke = async (command, args, options) => {
      if (command !== "save_visual_project" || args?.projectPath !== projectPath) return invoke(command, args, options);
      const manifest = JSON.parse((args.request as { assetManifestJson: string }).assetManifestJson) as AssetManifest;
      const asset = manifest.assets[materialId] as MaterialAsset;
      const value = asset.properties.pbrMetallicRoughness.roughnessFactor;
      if (value === 0.6 && !gate.released) {
        gate.waiting = true;
        await new Promise<void>(resolve => { gate.release = resolve; });
        gate.waiting = false;
      }
      const result = await invoke(command, args, options);
      gate.writes.push(value);
      return result;
    };
  }, { projectPath: fixture.path, materialId: fixture.targetId });
  const history = page.getByRole("group", { name: "編集履歴", exact: true });
  try {
    await history.getByRole("button", { name: "元に戻す", exact: true }).click();
    await expect(roughness).toHaveValue("0.6");
    await expect.poll(() => page.evaluate(() => window.__XRIFT_MATERIAL_SAVE_RACE__!.waiting)).toBe(true);
    expect(material((await saved(page, fixture.path)).assets, fixture.targetId).properties.pbrMetallicRoughness.roughnessFactor).toBe(0.21);
    await history.getByRole("button", { name: "やり直す", exact: true }).click();
    await expect(roughness).toHaveValue("0.21");
    expect((await call(page, "get_editor_context")).result?.saveStatus).not.toBe("saved");
    await page.evaluate(() => { const gate = window.__XRIFT_MATERIAL_SAVE_RACE__!; gate.released = true; gate.release?.(); });
    await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
    const writes = await page.evaluate(() => window.__XRIFT_MATERIAL_SAVE_RACE__!.writes);
    expect(writes).toContain(0.6);
    expect(writes.at(-1)).toBe(0.21);
    expect(material((await saved(page, fixture.path)).assets, fixture.targetId).properties.pbrMetallicRoughness.roughnessFactor).toBe(0.21);
    expect((await call(page, "close_project")).ok).toBe(true);
    expect((await call(page, "open_project", { path: fixture.path })).ok).toBe(true);
    expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
    await expect(roughness).toHaveValue("0.21");
  } finally {
    await page.evaluate(() => { const gate = window.__XRIFT_MATERIAL_SAVE_RACE__; if (gate) { gate.released = true; gate.release?.(); } }).catch(() => undefined);
  }
});
