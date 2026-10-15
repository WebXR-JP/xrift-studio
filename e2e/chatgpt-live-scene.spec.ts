import { expect, test, type Page } from "@playwright/test";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { SceneDocument } from "../src/lib/visual-editor/scene-document";

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: call } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await call("get_editor_context")).result : {};
    return call(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}
async function ready(page: Page, name = "chatgpt-live-isolated-fixture") {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name, kind: "world", templateId: "blank" })).ok).toBe(true);
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null }; });
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const scene = await savedScene(page);
  return Object.values(scene.entities).find(entity => entity.name === "Plane")!.id;
}
async function setPlan(page: Page, entityId: string, gate = false) {
  await page.evaluate(({ entityId, gate }) => {
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = gate;
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "現在の配置を引き継ぐ", description: "床だけを移動し、球を一つ追加します", edits: [{ entityId, position: [4, 0, -2] }],
      objects: [{ name: "追加するSphere", shape: "sphere", position: [1, 1, 1], scale: [1, 1, 1] }] });
  }, { entityId, gate });
}
async function generate(page: Page, mode: "build" | "plan" = "build") {
  const response = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "手動で調整した配置を保って床を移動し、球を一つ追加", mode,
    options: { models: false, materials: false, audio: false } }, true);
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result!.generationId as string;
}
async function job(page: Page, generationId: string): Promise<ChatgptGeneration> {
  const response = await call(page, "get_chatgpt_generation", { generationId });
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result as ChatgptGeneration;
}
async function savedScene(page: Page): Promise<SceneDocument> {
  return page.evaluate(async () => {
    const path = "/src/lib/tauri.ts";
    const project = window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!;
    const files = await (await import(/* @vite-ignore */ path)).tauri.readVisualProject(project.path);
    return JSON.parse(files.sceneDocuments[0].content);
  });
}
async function releasePlan(page: Page) {
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = false; });
}
async function requestCount(page: Page) {
  return page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length);
}

test("Plan応答中の手動編集を最新のSceneとして再取得し、制作を続ける", async ({ page }) => {
  const entityId = await ready(page);
  await setPlan(page, entityId, true);
  const id = await generate(page);
  try {
    await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptPlanWaiting)).toBe(true);
    expect((await call(page, "rename_entity", { entityId, name: "手動で調整した床" }, true)).ok).toBe(true);
    expect((await call(page, "update_transform", { entityId, position: [8, 0, 1], scale: [2, 3, 4] }, true)).ok).toBe(true);
    await releasePlan(page);
    await expect.poll(async () => (await job(page, id)).status).toBe("completed");
    expect(await requestCount(page)).toBe(2);
    const latest = await page.evaluate(entityId => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts.at(-1)!.entities.find(entity => entity.id === entityId), entityId);
    expect(latest).toMatchObject({ name: "手動で調整した床", position: [8, 0, 1], scale: [2, 3, 4] });
    const after = await savedScene(page);
    expect(after.entities[entityId].name).toBe("手動で調整した床");
    expect(after.entities[entityId].components.find(component => component.type === "transform")).toMatchObject({ position: [4, 0, -2], scale: [2, 3, 4] });
    expect(Object.values(after.entities).filter(entity => entity.name === "追加するSphere")).toHaveLength(1);
    expect((await job(page, id)).error).toBeUndefined();
  } finally { await releasePlan(page).catch(() => undefined); }
});

test("推論中の手動追加も最新のSceneとして再取得し、追加したEntityを保つ", async ({ page }) => {
  const entityId = await ready(page);
  await setPlan(page, entityId, true);
  const id = await generate(page);
  try {
    await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptPlanWaiting)).toBe(true);
    const created = await call(page, "create_primitive", { shape: "box", position: [-8, 2, 6] }, true);
    expect(created.ok, JSON.stringify(created)).toBe(true);
    const unrelatedId = created.result!.entityId as string;
    expect((await call(page, "rename_entity", { entityId: unrelatedId, name: "人間が追加したCube" }, true)).ok).toBe(true);
    await releasePlan(page);
    await expect.poll(async () => (await job(page, id)).status).toBe("completed");
    expect(await requestCount(page)).toBe(2);
    const latest = await page.evaluate(unrelatedId => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts.at(-1)!.entities.find(entity => entity.id === unrelatedId), unrelatedId);
    expect(latest).toMatchObject({ name: "人間が追加したCube", position: [-8, 2, 6] });
    const after = await savedScene(page);
    expect(after.entities[unrelatedId].name).toBe("人間が追加したCube");
    expect(after.entities[unrelatedId].components.find(component => component.type === "transform")).toMatchObject({ position: [-8, 2, 6] });
    expect(Object.values(after.entities).filter(entity => entity.name === "追加するSphere")).toHaveLength(1);
  } finally { await releasePlan(page).catch(() => undefined); }
});

test("推論中の手動削除を最新のSceneへ反映し、削除したEntityを復元しない", async ({ page }) => {
  const entityId = await ready(page);
  const deletedId = Object.values((await savedScene(page)).entities).find(entity => entity.name === "Box")!.id;
  await setPlan(page, entityId, true);
  const id = await generate(page);
  try {
    await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptPlanWaiting)).toBe(true);
    expect((await call(page, "delete_entity", { entityId: deletedId }, true)).ok).toBe(true);
    await releasePlan(page);
    await expect.poll(async () => (await job(page, id)).status).toBe("completed");
    expect(await requestCount(page)).toBe(2);
    const latest = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts.at(-1)!);
    expect(latest.entities.some(entity => entity.id === deletedId)).toBe(false);
    expect((await savedScene(page)).entities[deletedId]).toBeUndefined();
  } finally { await releasePlan(page).catch(() => undefined); }
});

test("確認したPlanの後に手動編集した場合は最新Planを再確認してから反映する", async ({ page }) => {
  const entityId = await ready(page);
  await setPlan(page, entityId);
  const id = await generate(page, "plan");
  await expect.poll(async () => (await job(page, id)).status).toBe("planned");
  expect((await call(page, "update_transform", { entityId, position: [8, 0, 1], scale: [2, 3, 4] }, true)).ok).toBe(true);
  expect((await call(page, "apply_chatgpt_plan", { generationId: id }, true)).ok).toBe(true);
  await expect.poll(() => requestCount(page)).toBe(2);
  await expect.poll(async () => (await job(page, id)).status).toBe("planned");
  expect((await job(page, id)).error).toBeUndefined();
  await expect.poll(async () => (await savedScene(page)).entities[entityId].components.find(component => component.type === "transform")).toMatchObject({ position: [8, 0, 1], scale: [2, 3, 4] });
  expect(Object.values((await savedScene(page)).entities).some(entity => entity.name === "追加するSphere")).toBe(false);
  const latest = await page.evaluate(entityId => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts.at(-1)!.entities.find(entity => entity.id === entityId), entityId);
  expect(latest).toMatchObject({ position: [8, 0, 1], scale: [2, 3, 4] });
  expect((await call(page, "apply_chatgpt_plan", { generationId: id }, true)).ok).toBe(true);
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  expect(await requestCount(page)).toBe(2);
  expect((await savedScene(page)).entities[entityId].components.find(component => component.type === "transform")).toMatchObject({ position: [4, 0, -2], scale: [2, 3, 4] });
});

test("途中の保存結果を最新Sceneと会話へ引き継ぎ、重複させず残りを制作する", async ({ page }) => {
  await ready(page, "chatgpt-world-live-isolated-fixture");
  const boxId = Object.values((await savedScene(page)).entities).find(entity => entity.name === "Box")!.id;
  await page.evaluate(boxId => {
    const objects = [
      { name: "広場", shape: "plane", position: [0, 0, 0], scale: [12, 1, 12] },
      { name: "ベンチ", shape: "box", position: [2, 0.5, 0], scale: [2, 1, 0.7] },
    ];
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "広場とベンチ", description: "広場とベンチを追加しBoxのColliderを設定", objects,
      operations: [{ kind: "mesh-collision", entityId: boxId, action: "add" }] });
    window.__XRIFT_RELEASE_E2E__!.chatgptSaveGate = 1;
  }, boxId);
  const id = await generate(page);
  try {
    await expect(page.getByRole("tree", { name: "シーンのEntity階層" }).getByText("広場", { exact: true })).toBeVisible();
    expect((await call(page, "rename_entity", { entityId: boxId, name: "手動で調整したBox" }, true)).ok).toBe(true);
    expect((await call(page, "update_transform", { entityId: boxId, position: [9, 2, 0] }, true)).ok).toBe(true);
    // The fixture model's second response supplies only the work left after
    // the actual first save. The live App constructs the continuation context.
    await page.evaluate(boxId => {
      window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "残りのベンチとCollider", description: "保存した広場を保って残りを制作", objects: [
        { name: "ベンチ", shape: "box", position: [2, 0.5, 0], scale: [2, 1, 0.7] },
      ], operations: [{ kind: "mesh-collision", entityId: boxId, action: "add" }] });
      window.__XRIFT_RELEASE_E2E__!.chatgptSaveGate = null;
    }, boxId);
    await expect.poll(async () => (await job(page, id)).status).toBe("completed");
    expect(await requestCount(page)).toBe(2);
    const latest = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts.at(-1)!);
    expect(latest.entities.some(entity => entity.name === "広場")).toBe(true);
    expect(latest.conversation!.at(-1)!.result).toContain("広場");
    expect(latest.conversation!.at(-1)!.result).toContain("保存済み");
    expect((await job(page, id)).progress).toMatchObject({ completed: 3, total: 3 });
    const after = await savedScene(page);
    expect(Object.values(after.entities).filter(entity => entity.name === "広場")).toHaveLength(1);
    expect(Object.values(after.entities).filter(entity => entity.name === "ベンチ")).toHaveLength(1);
    expect(after.entities[boxId].name).toBe("手動で調整したBox");
    expect(after.entities[boxId].components.find(component => component.type === "transform")).toMatchObject({ position: [9, 2, 0] });
    const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
    await expect(panel.getByText("Plan：残りのベンチとCollider", { exact: true })).toHaveCount(0);
    await panel.getByRole("button", { name: "ベンチをInspectorで表示", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Entity名", exact: true })).toHaveValue("ベンチ");
  } finally { await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptSaveGate = null; }).catch(() => undefined); }
});
