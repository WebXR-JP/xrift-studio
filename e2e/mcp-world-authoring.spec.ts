import { expect, test, type Page } from "@playwright/test";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";
import type { WorldAuthoringState } from "../src/lib/visual-editor/world-authoring";

declare global { interface Window { __XRIFT_MCP_AUTHORING_TEST__?: { state: WorldAuthoringState | null; images: Record<string, string>; holdSave: boolean; pendingSaves: number; modelCalls: number; blenderCalls: number } } }
test.setTimeout(240_000);
test.beforeEach(async ({ page }) => {
  const path = process.env.XRIFT_E2E_FONT_METRICS_PATH;
  if (path) await page.route("https://public.xrift.net/fonts/msdf/NotoSansJP/metrics.json?v=3", route => route.fulfill({ contentType: "application/json", path }));
});
async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}
async function ready(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible({ timeout: 120_000 });
  expect((await call(page, "create_project", { name: "mcp-authoring-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  // Only native persistence is replaced. Production MCP admission, Scene
  // operations, autosave, actual GPU captures and completion policy all run.
  await page.evaluate(() => {
    const fixture = window.__XRIFT_MCP_AUTHORING_TEST__ = { state: null as WorldAuthoringState | null, images: {} as Record<string, string>, holdSave: false, pendingSaves: 0, modelCalls: 0, blenderCalls: 0 };
    const internals = window.__TAURI_INTERNALS__!, invoke = internals.invoke!.bind(internals);
    internals.invoke = async (command, args, options) => {
      if (command === "read_world_authoring") return structuredClone(fixture.state);
      if (command === "chatgpt_plan") fixture.modelCalls++;
      if (command === "create_blender_model") { fixture.blenderCalls++; throw new Error("isolated Blender worker failure"); }
      if (command === "save_world_authoring") {
        if ((fixture.state?.sequence ?? 0) !== args?.expectedSequence) throw new Error("stale authoring journal");
        fixture.state = structuredClone(args?.state as WorldAuthoringState); return undefined;
      }
      if (command === "save_debug_image") {
        const path = `C:\\XRiftE2E\\captures\\authoring-${Object.keys(fixture.images).length}.png`;
        fixture.images[path] = String(args?.dataUrl); return path;
      }
      if (command === "read_world_authoring_images") return Object.values(fixture.state?.captures ?? {}).filter(capture => capture.fingerprint === args?.fingerprint).map(capture => ({
        view: capture.view, captureId: capture.id, mimeType: "image/png", data: fixture.images[capture.path]?.split(",")[1],
      }));
      if (command === "save_visual_project" && fixture.holdSave) {
        fixture.pendingSaves++;
        try { while (fixture.holdSave) await new Promise(resolve => requestAnimationFrame(resolve)); }
        finally { fixture.pendingSaves--; }
      }
      return invoke(command, args, options);
    };
  });
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
}
async function begin(page: Page, budget: Record<string, number> = {}) {
  const response = await call(page, "begin_world_authoring", { blueprint: "既存の配置を保って名前と位置を整える", criteria: ["配置と名前を両画像で確認"], budget }, true);
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result!;
}
async function capturesAndReview(page: Page) {
  expect((await call(page, "set_scene_view_camera", { position: [0, 1.6, 5], target: [0, 1.6, 0] }, true)).ok).toBe(true);
  const spawn = await call(page, "capture_scene_view", { authoringView: "spawn" }, true);
  expect(spawn.ok, JSON.stringify(spawn)).toBe(true);
  expect((spawn.result!.image as { data: string }).data.length).toBeGreaterThan(1000);
  expect((await call(page, "set_scene_view_camera", { preset: "iso" }, true)).ok).toBe(true);
  const iso = await call(page, "capture_scene_view", { authoringView: "iso" }, true);
  expect(iso.ok, JSON.stringify(iso)).toBe(true);
  const status = await call(page, "get_world_authoring", {}, true);
  const state = status.result!.state as WorldAuthoringState;
  const result = await call(page, "review_world_authoring", { criterion: state.criteria[0], passed: true, reason: "実描画2枚と最新Entityの名前・位置を照合した回帰検証です", captureIds: [state.captures.spawn!.id, state.captures.iso!.id] }, true);
  expect(result.ok, JSON.stringify(result)).toBe(true);
}
test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__?.unhandledCommands ?? [])).toEqual([]);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__?.uploadAttempts ?? [])).toEqual([]);
});

test("MCPの有限制作は上限後の書き込みを止め、実画像と保存を確認して最後の許容結果を完了できる", async ({ page }) => {
  await ready(page);
  const created = await call(page, "create_empty_entity", { name: "手動の対象" }, true);
  expect(created.ok).toBe(true);
  const entityId = created.result!.entityId;
  await begin(page, { maxWrites: 2 });
  const secondOwner = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "同じSceneを別の制作で変更" }, true);
  expect(secondOwner.ok).toBe(false);
  expect(secondOwner.error?.code).toBe("AUTHORING_RUN_OWNED");
  for (const name of ["制作中の対象", "確認した対象"]) expect((await call(page, "rename_entity", { entityId, name }, true)).ok).toBe(true);
  const blocked = await call(page, "update_transform", { entityId, position: [5, 0, 0] }, true);
  expect(blocked.ok).toBe(false);
  expect(blocked.error?.code).toBe("AUTHORING_WRITE_STOPPED");
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const modelBlocked = await call(page, "create_blender_model", { model: { name: "上限後の模型", parts: [{ name: "body", shape: "box", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: [0.5, 0.5, 0.5, 1], metallic: 0, roughness: 0.8 }] } }, true);
  expect(modelBlocked.ok).toBe(false);
  expect(modelBlocked.error?.code, JSON.stringify(modelBlocked)).toBe("AUTHORING_WRITE_STOPPED");
  expect(await page.evaluate(() => window.__XRIFT_MCP_AUTHORING_TEST__!.blenderCalls)).toBe(0);
  const status = await call(page, "get_world_authoring", {}, true);
  expect(status.result).toMatchObject({ terminalReason: "write-limit", writeAdmission: false, completed: false });
  expect((status.result!.state as WorldAuthoringState).run!.writes).toBe(2);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  await capturesAndReview(page);
  const completed = await call(page, "complete_world_authoring", {}, true);
  expect(completed.ok, JSON.stringify(completed)).toBe(true);
  expect(completed.result).toMatchObject({ completionAccepted: true, completed: true, canComplete: true });
  expect((await call(page, "rename_entity", { entityId, name: "完了後の手動調整" }, true)).ok).toBe(true);
  const changed = await call(page, "get_world_authoring", {}, true);
  expect(changed.result!.completed).toBe(false);
});

test("MCPは保存待ちを完了扱いせず、停止後は古い画像・確認結果を再利用できない", async ({ page }) => {
  await ready(page);
  await begin(page);
  await page.evaluate(() => { window.__XRIFT_MCP_AUTHORING_TEST__!.holdSave = true; });
  const created = await call(page, "create_empty_entity", { name: "保存を確認する対象" }, true);
  expect(created.ok).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__XRIFT_MCP_AUTHORING_TEST__!.pendingSaves)).toBeGreaterThan(0);
  const waiting = await call(page, "get_world_authoring", {}, true);
  expect(waiting.result!.canComplete).toBe(false);
  expect((waiting.result!.reasons as string[]).some(reason => reason.includes("保存"))).toBe(true);
  await page.evaluate(() => { window.__XRIFT_MCP_AUTHORING_TEST__!.holdSave = false; });
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  await capturesAndReview(page);
  const stopped = await call(page, "cancel_world_authoring", {}, true);
  expect(stopped.ok, JSON.stringify(stopped)).toBe(true);
  expect(stopped.result).toMatchObject({ terminalReason: "cancelled", canComplete: false, completed: false });
  expect((stopped.result!.state as WorldAuthoringState).captures).toEqual({});
  const completed = await call(page, "complete_world_authoring", {}, true);
  expect(completed.result).toMatchObject({ completionAccepted: false, completed: false });
  const blocked = await call(page, "rename_entity", { entityId: created.result!.entityId, name: "停止後の変更" }, true);
  expect(blocked.ok).toBe(false);
  expect(blocked.error?.code).toBe("AUTHORING_WRITE_STOPPED");
});

test("MCPの制作中はUIから別のChatGPT制作を開始せず、project側のBlender失敗も同じ累積予算へ記録する", async ({ page }) => {
  await ready(page);
  await begin(page);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null }; });
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  await expect(panel.getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("fixture-model");
  await panel.getByRole("textbox", { name: "ワールドへの依頼", exact: true }).fill("MCPの制作と同じSceneを別の制作で変更");
  await panel.getByRole("textbox", { name: "ワールドへの依頼", exact: true }).press("Enter");
  await expect(panel).toContainText("MCPでワールドを制作中");
  expect(await page.evaluate(() => window.__XRIFT_MCP_AUTHORING_TEST__!.modelCalls)).toBe(0);
  const model = { name: "失敗を確認する模型", parts: [{ name: "body", shape: "box", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: [0.5, 0.5, 0.5, 1], metallic: 0, roughness: 0.8 }] };
  let failed: XriftMcpEditorResponse | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    failed = await call(page, "create_blender_model", { model }, true);
    if (failed.error?.code !== "STALE_REVISION") break;
    // Loading the native adapter can overlap a pending derived-thumbnail
    // update. A rejected admission has no effect; reacquire its Scene lease.
    const stale = await call(page, "get_world_authoring", {}, true);
    expect((stale.result!.state as WorldAuthoringState).run!.writes).toBe(0);
    expect(await page.evaluate(() => window.__XRIFT_MCP_AUTHORING_TEST__!.blenderCalls)).toBe(0);
  }
  expect(failed?.error?.code, JSON.stringify(failed)).not.toBe("STALE_REVISION");
  expect(failed).toBeDefined();
  expect(failed!.ok).toBe(false);
  const status = await call(page, "get_world_authoring", {}, true);
  const run = (status.result!.state as WorldAuthoringState).run!;
  expect(run.writes, JSON.stringify(failed)).toBe(1);
  expect(run.consecutiveFailures).toBe(1);
  expect(run.pendingWrite).toBeUndefined();
  expect(run.journal.at(-1)?.kind).toBe("write-failed");
  expect(await page.evaluate(() => window.__XRIFT_MCP_AUTHORING_TEST__!.blenderCalls)).toBe(1);
});

test("MCPは同じ配置の往復を進展と数えず、保存済みの結果を残して止まる", async ({ page }) => {
  await ready(page);
  const created = await call(page, "create_empty_entity", { name: "往復を確認する対象" }, true);
  expect(created.ok).toBe(true); const entityId = created.result!.entityId;
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  await begin(page);
  for (const x of [1, 0, 1, 0]) {
    const moved = await call(page, "update_transform", { entityId, position: [x, 0, 0] }, true);
    expect(moved.ok, JSON.stringify(moved)).toBe(true);
  }
  const status = await call(page, "get_world_authoring", {}, true), run = (status.result!.state as WorldAuthoringState).run!;
  expect(run.writes).toBe(4); expect(run.noProgress).toBe(3);
  expect(run.progress!.observations.at(-1)?.kind).toBe("cycle");
  expect(status.result).toMatchObject({ terminalReason: "no-progress", writeAdmission: false, completed: false });
  expect((await call(page, "update_transform", { entityId, position: [2, 0, 0] }, true)).error?.code).toBe("AUTHORING_WRITE_STOPPED");
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
});

test("MCPは必要な制作ガイドを読み、R3F原本の更新と手動編集を一つのSceneに保存する", async ({ page }) => {
  await ready(page);
  const overview = await call(page, "get_world_authoring_guide");
  expect(overview.ok, JSON.stringify(overview)).toBe(true);
  expect(overview.result).toMatchObject({ version: 1, topic: "overview" });
  expect(overview.result!.routes).toHaveProperty("r3f.summary");
  expect(overview.result!.routes).not.toHaveProperty("r3f.instructions");
  const route = await call(page, "get_world_authoring_guide", { topic: "r3f" });
  expect(route.ok).toBe(true); expect(route.result!.route).toHaveProperty("instructions");
  await begin(page, { maxWrites: 8 });
  const source = (height: number) => `export default function Park(){return <group name="Park"><mesh name="Shelter" key="shelter" position={[5,1,0]}><boxGeometry args={[3,${height},3]}/><meshStandardMaterial color="#987450"/></mesh><mesh name="Lawn" key="lawn" position={[0,-0.15,0]}><boxGeometry args={[24,0.2,24]}/><meshStandardMaterial color="#70a056"/></mesh><mesh name="Path" key="path" position={[0,0.01,0]}><boxGeometry args={[2,0.02,24]}/><meshStandardMaterial color="#d6b98c"/></mesh></group>}`;
  const created = await call(page, "apply_r3f_scene", { name: "公園", source: source(2), entityId: null }, true);
  expect(created.ok, JSON.stringify(created)).toBe(true);
  const entityId = created.result!.entityId;
  expect(created.result).toMatchObject({ changed: true, sourceRevision: 1 });
  const original = await call(page, "get_entity_components", { entityId });
  expect(original.result!.r3fAuthoring).toMatchObject({ source: source(2), revision: 1 });
  const listed = await call(page, "list_entities");
  const entities = listed.result!.entities as { id: string; name: string; parentId: string | null }[];
  const shelter = entities.find(entity => entity.name === "Shelter")!.id;
  expect((await call(page, "rename_entity", { entityId: shelter, name: "作者が付けた休憩所" }, true)).ok).toBe(true);
  const revised = await call(page, "apply_r3f_scene", { name: "公園", source: source(3), entityId }, true);
  expect(revised.ok, JSON.stringify(revised)).toBe(true);
  expect(revised.result).toMatchObject({ changed: true, entityId, sourceRevision: 2 });
  const part = await call(page, "get_entity_components", { entityId: shelter });
  expect(part.result!.entityName).toBe("作者が付けた休憩所");
  expect((part.result!.components as { type: string; scale?: number[] }[]).find(component => component.type === "transform")!.scale).toEqual([3, 3, 3]);
  const unchanged = await call(page, "apply_r3f_scene", { name: "公園", source: source(3), entityId }, true);
  expect(unchanged.ok, JSON.stringify(unchanged)).toBe(true);
  expect(unchanged.result).toMatchObject({ changed: false, entityId, sourceRevision: 2 });
  expect(unchanged.result!.revisionAfter).toBe(unchanged.result!.revisionBefore);
  const beforeFailure = await call(page, "list_entities");
  const failed = await call(page, "apply_r3f_scene", { name: "公園", source: "export default function Park(){return <Canvas/>}", entityId }, true);
  expect(failed.ok).toBe(false); expect(failed.error?.code, JSON.stringify(failed)).toBe("R3F_SOURCE_INVALID");
  expect((await call(page, "list_entities")).result!.entities).toEqual(beforeFailure.result!.entities);
  expect((await call(page, "get_entity_components", { entityId })).result!.r3fAuthoring).toMatchObject({ source: source(3), revision: 2 });
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  await capturesAndReview(page);
  const status = await call(page, "get_world_authoring", {}, true);
  expect((status.result!.state as WorldAuthoringState).run).toMatchObject({ writes: 5, consecutiveFailures: 1 });
  expect((status.result!.state as WorldAuthoringState).run!.pendingWrite).toBeUndefined();
  expect((await call(page, "cancel_world_authoring", {}, true)).ok).toBe(true);
  const stopped = await call(page, "apply_r3f_scene", { name: "公園", source: source(4), entityId }, true);
  expect(stopped.error?.code).toBe("AUTHORING_WRITE_STOPPED");
});
