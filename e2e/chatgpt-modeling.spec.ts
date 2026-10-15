import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { BlenderModelSpec } from "../src/lib/visual-editor/chatgpt-modeling";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";

// Real GLB/Material rendering and a cold Editor compile share this budget.
test.setTimeout(240_000);

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: call } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await call("get_editor_context")).result : {};
    return call(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}

async function ready(page: Page) {
  let bytes: Buffer, model: BlenderModelSpec;
  try {
    bytes = await readFile("node_modules/.cache/chatgpt-blender-model/fixture.glb");
    model = JSON.parse(await readFile("node_modules/.cache/chatgpt-blender-model/fixture.json", "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") { test.skip(true, "Run the installed Blender native smoke first to provide its actual output"); }
    throw error;
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible({ timeout: 120_000 });
  expect((await call(page, "create_project", { name: "blender-isolated-real-output", kind: "world", templateId: "blank" })).ok).toBe(true);
  const projectPath = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!.path);
  await page.evaluate(async ({ projectPath, dataUrl, byteLength }) => {
    const modulePath = "/e2e/chatgpt-modeling.fixture.ts";
    (await import(/* @vite-ignore */ modulePath)).installBlenderOutput(projectPath, dataUrl, byteLength);
    window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null };
  }, { projectPath, dataUrl: `data:model/gltf-binary;base64,${bytes.toString("base64")}`, byteLength: bytes.byteLength });
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  return { projectPath, model };
}

async function readDocuments(page: Page, projectPath: string) {
  return page.evaluate(async projectPath => {
    const path = "/src/lib/tauri.ts";
    const files = await (await import(/* @vite-ignore */ path)).tauri.readVisualProject(projectPath);
    return { scene: JSON.parse(files.sceneDocuments[0].content), assets: JSON.parse(files.assetManifestJson) };
  }, projectPath);
}
async function runtime(page: Page, entityId: string) {
  return page.evaluate(async entityId => {
    const path = "/e2e/chatgpt-modeling.fixture.ts";
    return (await import(/* @vite-ignore */ path)).readModelRuntime(entityId);
  }, entityId) as Promise<ReturnType<typeof import("./chatgpt-modeling.fixture").readModelRuntime>>;
}

test("ChatGPTのBlenderモデルを実GLBからAssetsへ取り込み、Scene・Play・再表示で同じ形状を描画する", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const { projectPath, model } = await ready(page);
  await page.evaluate(model => {
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "Blenderでモデルを作成", description: "実GLBをAssetsへ取り込みます", objects: [], operations: [{ kind: "blender-model", model, position: [0, 0, 0], rotation: null, scale: null }] });
  }, model);
  const started = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "Blenderでこのモデルを作成して配置", options: { models: true, materials: false, audio: false, modelSource: "blender" } }, true);
  expect(started.ok, JSON.stringify(started)).toBe(true);
  const id = started.result!.generationId;
  const job = async () => (await call(page, "get_chatgpt_generation", { generationId: id })).result as ChatgptGeneration;
  try { await expect.poll(async () => (await job()).status, { timeout: 60_000 }).toBe("completed"); }
  catch (error) { await info.attach("blender-generation-state", { body: JSON.stringify(await job()), contentType: "application/json" }); throw error; }
  const documents = await readDocuments(page, projectPath);
  const entity = Object.values(documents.scene.entities).find((item: any) => item.name === model.name && !item.parentId) as any;
  expect(entity).toBeDefined();
  const asset = Object.values(documents.assets.assets).find((item: any) => item.kind === "model" && item.name === model.name) as any;
  expect(asset).toMatchObject({ kind: "model", status: "ready" });
  expect(asset.source.relativePath).toMatch(/\.glb$/);
  expect(asset.materialSlots.length).toBeGreaterThan(0);
  await expect.poll(async () => (await runtime(page, entity.id))?.meshCount ?? 0).toBeGreaterThan(0);
  const edit = await runtime(page, entity.id);
  expect(edit!.vertexCount).toBeGreaterThan(3);
  expect(edit!.materials.some(material => material.name.includes(model.parts[0].name))).toBe(true);
  expect((await call(page, "set_play_mode", { mode: "play" }, true)).ok).toBe(true);
  await expect.poll(async () => (await runtime(page, entity.id))?.vertexCount).toBe(edit!.vertexCount);
  expect((await runtime(page, entity.id))!.materials).toEqual(edit!.materials);
  expect((await call(page, "set_play_mode", { mode: "edit" }, true)).ok).toBe(true);
  await page.screenshot({ path: info.outputPath("real-blender-glb-editor.png") });
  expect((await call(page, "close_project")).ok).toBe(true);
  expect((await call(page, "open_project", { path: projectPath })).ok).toBe(true);
  await expect.poll(async () => (await runtime(page, entity.id))?.vertexCount).toBe(edit!.vertexCount);
  expect((await runtime(page, entity.id))!.materials).toEqual(edit!.materials);
  const { thumbnail: _beforeThumbnail, ...authored } = asset;
  const { thumbnail: _afterThumbnail, ...reopened } = (await readDocuments(page, projectPath)).assets.assets[asset.id];
  expect(reopened).toEqual(authored);
  expect(errors).toEqual([]);
});

test("MCPでBlenderの利用状況を確認して実GLBをAssetsへ取り込み、手動のEntityを保つ", async ({ page }) => {
  const { projectPath, model } = await ready(page);
  expect((await call(page, "get_modeling_tools")).result?.blender).toMatchObject({ available: true });
  const created = await call(page, "create_primitive", { shape: "box", name: "人が作ったEntity", position: [2, 1, -3] }, true);
  expect(created.ok, JSON.stringify(created)).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const before = await readDocuments(page, projectPath);
  const generated = await call(page, "create_blender_model", { model }, true);
  expect(generated.ok, JSON.stringify(generated)).toBe(true);
  const after = await readDocuments(page, projectPath);
  expect(after.scene.entities).toEqual(before.scene.entities);
  expect(after.assets.assets[generated.result!.modelAssetId as string]).toMatchObject({ kind: "model", name: model.name, status: "ready" });
});


test("配置したPrimitiveをBlenderモデルに置き換え、Entityと手動の子・Componentを保持して戻せる", async ({ page }, info) => {
  const { projectPath, model } = await ready(page);
  const parent = await call(page, "create_empty_entity", { name: "配置Group" }, true);
  const target = await call(page, "create_primitive", { shape: "box", position: [2, 1, -3] }, true);
  expect(target.ok).toBe(true);
  const entityId = target.result!.entityId as string;
  expect((await call(page, "rename_entity", { entityId, name: "置き換える椅子" }, true)).ok).toBe(true);
  expect((await call(page, "reparent_entity", { entityId, parentEntityId: parent.result!.entityId }, true)).ok).toBe(true);
  expect((await call(page, "update_transform", { entityId, rotation: [0, 0.5, 0], scale: [2, 3, 4] }, true)).ok).toBe(true);
  const child = await call(page, "create_empty_entity", { name: "手動の子", parentEntityId: entityId }, true);
  expect((await call(page, "add_component", { entityId, definitionId: "xrift.mirror" }, true)).ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const before = await readDocuments(page, projectPath);
  const original = before.scene.entities[entityId];
  expect(original.parentId).toBe(parent.result!.entityId);
  expect(original.children).toContain(child.result!.entityId);
  const mesh = original.components.find((c: any) => c.type === "mesh");
  await page.evaluate(({ model, entityId, componentId }) => {
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "下案を詳細化", description: "配置を保って置き換え", objects: [], operations: [{ kind: "blender-model", model, entityId, componentId, position: null, rotation: null, scale: null }] });
  }, { model, entityId, componentId: mesh.id });
  const start = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "このPrimitiveをBlenderモデルに置き換えて", attachedEntityIds: [entityId], options: { models: true, materials: false, audio: false, modelSource: "blender" } }, true);
  expect(start.ok).toBe(true);
  const generationId = start.result!.generationId;
  await expect.poll(async () => ((await call(page, "get_chatgpt_generation", { generationId })).result as ChatgptGeneration).status, { timeout: 60_000 }).toBe("completed");
  const after = await readDocuments(page, projectPath);
  const replaced = after.scene.entities[entityId];
  expect(replaced.name).toBe(original.name);
  expect(replaced.parentId).toBe(original.parentId);
  expect(replaced.children).toEqual(original.children);
  expect(after.scene.entities[child.result!.entityId as string]).toEqual(before.scene.entities[child.result!.entityId as string]);
  expect(replaced.components.filter((c: any) => c.type !== "mesh" && c.type !== "collider")).toEqual(original.components.filter((c: any) => c.type !== "mesh" && c.type !== "collider"));
  const collider = replaced.components.find((c: any) => c.type === "collider");
  const originalCollider = original.components.find((c: any) => c.type === "collider");
  expect(collider).toMatchObject({ id: originalCollider.id, shape: "box", fitMode: "auto", enabled: originalCollider.enabled });
  expect(collider.halfExtents).not.toEqual(originalCollider.halfExtents);
  const replacementMesh = replaced.components.find((c: any) => c.type === "mesh");
  expect(replacementMesh.id).toBe(mesh.id);
  expect(after.assets.assets[replacementMesh.geometryAssetId]).toMatchObject({ kind: "model", status: "ready" });
  await expect.poll(async () => (await runtime(page, entityId))?.vertexCount ?? 0).toBeGreaterThan(3);
  await page.screenshot({ path: info.outputPath("primitive-replaced.png") });
  expect((await call(page, "revert_chatgpt_generation", { generationId }, true)).ok).toBe(true);
  expect((await readDocuments(page, projectPath)).scene.entities[entityId]).toEqual(original);
});
