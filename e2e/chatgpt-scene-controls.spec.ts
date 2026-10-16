import { expect, test, type Page } from "@playwright/test";
import type { VisualProjectFiles, XriftMcpEditorResponse } from "../src/lib/tauri";
import type { AssetManifest } from "../src/lib/visual-editor/asset-manifest";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { SceneDocument } from "../src/lib/visual-editor/scene-document";

test.setTimeout(240_000);
const chat = (page: Page) => page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
const controls = (page: Page) => chat(page).getByRole("group", { name: "現在のScene設定を調整", exact: true });
const sky = (page: Page) => chat(page).getByLabel("Skyboxの設定", { exact: true });
const fog = (page: Page) => chat(page).getByLabel("Fogの設定", { exact: true });

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}

async function ready(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: "chat-scene-controls-isolated", kind: "world", templateId: "blank" })).ok).toBe(true);
  const projectPath = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!.path);
  await page.evaluate(projectPath => {
    window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null };
    const internals = window.__TAURI_INTERNALS__!, invoke = internals.invoke!.bind(internals);
    // This isolated native project has no optional authoring journal on disk.
    // Rust read_world_authoring returns None/null for that ordinary condition.
    internals.invoke = (command, args, options) => command === "read_world_authoring" && args?.projectPath === projectPath
      ? Promise.resolve(null) : invoke(command, args, options);
  }, projectPath);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await expect(chat(page).getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("fixture-model");
  return projectPath;
}

async function saved(page: Page, projectPath: string) {
  return page.evaluate(async projectPath => {
    const path = "/src/lib/tauri.ts";
    const files = await (await import(/* @vite-ignore */ path)).tauri.readVisualProject(projectPath) as VisualProjectFiles;
    return { scene: JSON.parse(files.sceneDocuments[0].content) as SceneDocument, assets: JSON.parse(files.assetManifestJson) as AssetManifest };
  }, projectPath);
}

async function setPlan(page: Page, patch: Record<string, unknown>) {
  await page.evaluate(patch => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({
    title: "空と遠景を調整", description: "現在の配置を保って空とFogを保存します", objects: [],
    operations: [{ kind: "scene-settings", settingsJson: JSON.stringify(patch) }],
  }); }, patch);
}

async function generate(page: Page) {
  const response = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "今のSkyboxとFogを調整してください" }, true);
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result!.generationId as string;
}

async function job(page: Page, generationId: string) {
  return (await call(page, "get_chatgpt_generation", { generationId })).result as ChatgptGeneration;
}

async function runtime(page: Page) {
  return page.evaluate(async () => {
    const path = "/e2e/chatgpt-modeling.fixture.ts";
    return (await import(/* @vite-ignore */ path)).readSceneEnvironmentRuntime();
  }) as Promise<ReturnType<typeof import("./chatgpt-modeling.fixture").readSceneEnvironmentRuntime>>;
}

test.afterEach(async ({ page }) => {
  const actions = await page.evaluate(() => ({ uploads: window.__XRIFT_RELEASE_E2E__?.uploadAttempts, unhandled: window.__XRIFT_RELEASE_E2E__?.unhandledCommands }));
  expect(actions.uploads ?? []).toEqual([]); expect(actions.unhandled ?? []).toEqual([]);
});

test("チャットのSkyboxとFogを現在値から直接調整し、Undo・実描画・保存・再読込へ反映する", async ({ page }, info) => {
  const projectPath = await ready(page), before = await saved(page, projectPath);
  await setPlan(page, { skybox: { enabled: true, topColor: "#345678", bottomColor: "#e0d0c0", exposure: 0.8 }, fog: { enabled: true, color: "#ddeeff", near: 20, far: 160 } });
  const id = await generate(page);
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  expect((await job(page, id)).plan?.objects[0].sceneSettingsSections).toEqual(["skybox", "fog"]);
  await expect(controls(page)).toHaveCount(1);
  const originalSettings = await chat(page).getByLabel("設定項目", { exact: true }).allTextContents();
  await expect(sky(page).getByRole("checkbox", { name: "IBLを有効にする", exact: true })).toBeDisabled();
  await sky(page).getByRole("checkbox", { name: "Skyboxを表示", exact: true }).uncheck();
  await expect.poll(async () => (await runtime(page))?.skies.length).toBe(0);
  await sky(page).getByRole("checkbox", { name: "Skyboxを表示", exact: true }).check();
  await sky(page).getByLabel("上空の色の色", { exact: true }).fill("#123456");
  const bottom = sky(page).getByRole("textbox", { name: "地平線の色のHEX", exact: true });
  await bottom.fill("#abcdef"); await bottom.press("Enter");
  await sky(page).getByRole("spinbutton", { name: "Skyboxの明るさ", exact: true }).fill("1.4");
  await fog(page).getByRole("checkbox", { name: "Fogを有効にする", exact: true }).uncheck();
  await expect.poll(async () => (await runtime(page))?.fog).toBeNull();
  await fog(page).getByRole("checkbox", { name: "Fogを有効にする", exact: true }).check();
  await fog(page).getByLabel("Fogの色の色", { exact: true }).fill("#c3d4e5");
  await fog(page).getByRole("spinbutton", { name: "Fogの開始距離", exact: true }).fill("28");
  await fog(page).getByRole("spinbutton", { name: "Fogの終了距離", exact: true }).fill("140");
  await fog(page).getByRole("spinbutton", { name: "Fogの終了距離", exact: true }).press("Tab");
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const changed = await saved(page, projectPath);
  expect(changed.scene.settings?.skybox).toMatchObject({ enabled: true, iblEnabled: false, topColor: "#123456", bottomColor: "#abcdef", exposure: 1.4 });
  expect(changed.scene.settings?.fog).toMatchObject({ enabled: true, color: "#c3d4e5", near: 28, far: 140 });
  expect(changed.scene.entities).toEqual(before.scene.entities);
  expect(await chat(page).getByLabel("設定項目", { exact: true }).allTextContents()).toEqual(originalSettings);
  await expect.poll(async () => (await runtime(page))?.fog).toEqual({ color: "#c3d4e5", near: 28, far: 140 });
  await expect.poll(async () => (await runtime(page))?.skies).toEqual(expect.arrayContaining([expect.objectContaining({ topColor: "#123456", bottomColor: "#abcdef", exposure: 1.4 })]));
  expect((await runtime(page))?.contextLost).toBe(false);
  const history = page.getByRole("group", { name: "編集履歴", exact: true });
  await history.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(fog(page).getByRole("spinbutton", { name: "Fogの終了距離", exact: true })).toHaveValue("160");
  await history.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(fog(page).getByRole("spinbutton", { name: "Fogの終了距離", exact: true })).toHaveValue("140");
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  expect((await call(page, "close_project")).ok).toBe(true);
  expect((await call(page, "open_project", { path: projectPath })).ok).toBe(true);
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await expect(sky(page).getByRole("textbox", { name: "上空の色のHEX", exact: true })).toHaveValue("#123456");
  await expect(fog(page).getByRole("spinbutton", { name: "Fogの終了距離", exact: true })).toHaveValue("140");
  expect((await saved(page, projectPath)).scene.settings).toEqual(changed.scene.settings);
  await expect.poll(async () => (await runtime(page))?.fog).toEqual({ color: "#c3d4e5", near: 28, far: 140 });
  await page.setViewportSize({ width: 375, height: 1000 });
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await sky(page).scrollIntoViewIfNeeded();
  await expect(sky(page)).toBeInViewport();
  expect(await controls(page).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("phone-skybox-controls.png") });
  await fog(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("phone-fog-controls.png") });
});

test("空の画像とShaderを保ってIBLと明るさを調整し、Fogの距離関係とPlay中の制限を守る", async ({ page }) => {
  const projectPath = await ready(page);
  expect((await call(page, "close_project")).ok).toBe(true);
  const fixture = await page.evaluate(async projectPath => {
    const tauriPath = "/src/lib/tauri.ts", persistencePath = "/src/lib/visual-editor/persistence.ts", assetsPath = "/src/lib/visual-editor/asset-manifest.ts";
    const settingsPath = "/src/lib/visual-editor/scene-settings.ts", catalogPath = "/src/lib/visual-editor/sky-shader-catalog.ts";
    const { tauri } = await import(/* @vite-ignore */ tauriPath);
    const { parseVisualProjectFiles, serializeVisualProjectDocuments } = await import(/* @vite-ignore */ persistencePath);
    const { createDefaultMaterialAsset, createTextureAsset } = await import(/* @vite-ignore */ assetsPath);
    const { resolveSceneSettings } = await import(/* @vite-ignore */ settingsPath);
    const { SKY_SHADER_CATALOG } = await import(/* @vite-ignore */ catalogPath);
    const documents = parseVisualProjectFiles(await tauri.readVisualProject(projectPath));
    const imageId = "chat-scene-sky-image", shaderId = "chat-scene-sky-shader", relativePath = "assets/chat-scene-sky.png";
    const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 32;
    const context = canvas.getContext("2d")!; context.fillStyle = "#88aacc"; context.fillRect(0, 0, 64, 32);
    const dataUrl = canvas.toDataURL("image/png"), internals = window.__TAURI_INTERNALS__!, invoke = internals.invoke!.bind(internals);
    internals.invoke = (command, args, options) => command === "read_image_data_url" && args?.projectPath === projectPath && args?.rel === relativePath ? Promise.resolve(dataUrl) : invoke(command, args, options);
    documents.assets.assets[imageId] = { ...createTextureAsset({ id: imageId, name: "保持する空画像", source: { kind: "project", relativePath }, importSettings: {} }), usage: "environment", projection: "equirectangular" };
    const entry = SKY_SHADER_CATALOG.find((candidate: { shader: { uniforms: Record<string, unknown> } }) => candidate.shader.uniforms.uExposure)!;
    documents.assets.assets[shaderId] = { ...createDefaultMaterialAsset({ id: shaderId, name: "保持するSkybox Shader" }), shader: structuredClone(entry.shader) };
    const scene = documents.scenes[documents.project.entrySceneId], settings = resolveSceneSettings(scene.settings);
    scene.settings = { ...settings, skybox: { ...settings.skybox, imageAssetId: imageId, materialAssetId: shaderId, iblEnabled: false } };
    await tauri.saveVisualProject(projectPath, serializeVisualProjectDocuments(documents));
    return { imageId, shaderId };
  }, projectPath);
  expect((await call(page, "open_project", { path: projectPath })).ok).toBe(true);
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await setPlan(page, { skybox: { enabled: true, exposure: 0.8 }, fog: { enabled: true, near: 20, far: 120 } });
  const id = await generate(page);
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  const before = await saved(page, projectPath);
  await expect(sky(page).getByLabel("上空の色の色", { exact: true })).toHaveCount(0);
  await sky(page).getByRole("checkbox", { name: "IBLを有効にする", exact: true }).check();
  await expect.poll(async () => (await runtime(page))?.environment).toBe(true);
  await sky(page).getByRole("spinbutton", { name: "Skyboxの明るさ", exact: true }).fill("1.2");
  await sky(page).getByRole("spinbutton", { name: "Skyboxの明るさ", exact: true }).press("Tab");
  await expect.poll(async () => (await runtime(page))?.environmentIntensity).toBe(1.2);
  await expect.poll(async () => (await runtime(page))?.skies.some(value => value.exposure === 1.2)).toBe(true);
  await sky(page).getByRole("checkbox", { name: "Skyboxを表示", exact: true }).uncheck();
  await expect.poll(async () => (await runtime(page))?.skies.length).toBe(0);
  expect((await runtime(page))?.environment).toBe(true);
  await sky(page).getByRole("checkbox", { name: "Skyboxを表示", exact: true }).check();
  await fog(page).getByRole("spinbutton", { name: "Fogの開始距離", exact: true }).fill("1000");
  await fog(page).getByRole("spinbutton", { name: "Fogの終了距離", exact: true }).fill("1");
  await expect.poll(async () => (await saved(page, projectPath)).scene.settings?.fog?.near).toBeCloseTo(119.999, 3);
  const clamped = (await saved(page, projectPath)).scene.settings!.fog!;
  expect(clamped.far).toBeGreaterThan(clamped.near);
  await fog(page).getByRole("spinbutton", { name: "Fogの開始距離", exact: true }).fill("30");
  await fog(page).getByRole("spinbutton", { name: "Fogの終了距離", exact: true }).fill("80");
  await fog(page).getByRole("spinbutton", { name: "Fogの終了距離", exact: true }).press("Tab");
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const after = await saved(page, projectPath);
  expect(after.scene.settings?.skybox).toMatchObject({ imageAssetId: fixture.imageId, materialAssetId: fixture.shaderId, enabled: true, iblEnabled: true, exposure: 1.2 });
  expect(after.assets.assets[fixture.shaderId].kind).toBe("material");
  expect((after.assets.assets[fixture.shaderId] as { shader?: unknown }).shader).toEqual((before.assets.assets[fixture.shaderId] as { shader?: unknown }).shader);
  const { thumbnail: _oldThumbnail, ...oldImage } = before.assets.assets[fixture.imageId];
  const { thumbnail: _newThumbnail, ...newImage } = after.assets.assets[fixture.imageId];
  expect(newImage).toEqual(oldImage);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await expect(sky(page).getByRole("checkbox", { name: "Skyboxを表示", exact: true })).toBeDisabled();
  await expect(fog(page).getByRole("spinbutton", { name: "Fogの開始距離", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await expect(fog(page).getByRole("spinbutton", { name: "Fogの開始距離", exact: true })).toBeEnabled();
  expect((await call(page, "update_scene_settings", { skybox: { imageAssetId: null } }, true)).ok).toBe(true);
  await expect(sky(page).getByRole("checkbox", { name: "IBLを有効にする", exact: true })).toBeDisabled();
  await expect(sky(page).getByRole("checkbox", { name: "IBLを有効にする", exact: true })).not.toBeChecked();
  await expect.poll(async () => (await runtime(page))?.environment).toBe(false);
});

test("考えている間は進行状況を一度だけ表示し、空の記録を出さず保存後の具体的なイベントを保持する", async ({ page }) => {
  await ready(page);
  await setPlan(page, { fog: { enabled: true, color: "#dce8ed", near: 35, far: 110 } });
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = true; });
  try {
    const id = await generate(page);
    await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptPlanWaiting)).toBe(true);
    await expect(chat(page).getByText("現在のSceneと制作に使う素材を確認しています", { exact: true })).toHaveCount(1);
    await expect(chat(page).getByRole("region", { name: "作業の記録", exact: true })).toHaveCount(0);
    expect((await job(page, id)).status).toBe("running");
    await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = false; });
    await expect.poll(async () => (await job(page, id)).status).toBe("completed");
    const completed = await job(page, id), savedEvents = completed.progress.recentEvents.filter(event => event.saved);
    expect(savedEvents).toHaveLength(1);
    expect(savedEvents[0].message).toContain("Fogの開始距離");
    const log = chat(page).getByRole("region", { name: "作業の記録", exact: true });
    await expect(log).toBeVisible();
    await expect(log.getByText(savedEvents[0].message, { exact: true })).toHaveCount(1);
    await expect(chat(page).getByText(completed.progress.message, { exact: true })).toHaveCount(1);
    expect(completed.progress.recentEvents.some(event => event.phase === "completed")).toBe(true);
    await expect(sky(page)).toHaveCount(0);
    await expect(fog(page)).toBeVisible();
  } finally { await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = false; }).catch(() => undefined); }
});
