import { expect, test, type Page } from "@playwright/test";
import type { ChatgptGenerationProgress, VisualProjectWriteRequest, XriftMcpEditorResponse } from "../src/lib/tauri";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { SceneDocument } from "../src/lib/visual-editor/scene-document";

type RecoveryFixture = {
  progress?: (value: ChatgptGenerationProgress) => void;
  cancelCalls: number;
  waitingRound: number;
  releaseResponse?: () => void;
  injectedNames: string[];
  savedNames: string[];
};
declare global {
  interface Window { __XRIFT_PLANNING_RECOVERY__?: RecoveryFixture }
}

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const modulePath = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ modulePath);
    const context = fresh ? (await invoke("get_editor_context")).result : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}
async function savedScene(page: Page): Promise<SceneDocument> {
  return page.evaluate(async () => {
    const modulePath = "/src/lib/tauri.ts";
    const project = window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!;
    const files = await (await import(/* @vite-ignore */ modulePath)).tauri.readVisualProject(project.path);
    return JSON.parse(files.sceneDocuments[0].content);
  });
}
async function ready(page: Page, name: string) {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  await page.evaluate(() => {
    const internals = window.__TAURI_INTERNALS__!;
    const invoke = internals.invoke!.bind(internals);
    // These isolated Worlds have no authoring session on disk. The current
    // Editor context reads that optional record during document revisions.
    internals.invoke = (command, args, options) => command === "read_world_authoring" ? Promise.resolve(null) : invoke(command, args, options);
  });
  const created = await call(page, "create_project", { name, kind: "world", templateId: "blank" });
  expect(created.ok, JSON.stringify(created)).toBe(true);
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
  await page.evaluate(() => {
    window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null };
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "現在の編集を保つPlan", description: "手動の調整を保ち球を一つ追加します",
      objects: [{ name: "再計画テストのSphere", shape: "sphere", position: [1, 1, 1], scale: [1, 1, 1] }] });
    window.__XRIFT_PLANNING_RECOVERY__ = { cancelCalls: 0, waitingRound: 0, injectedNames: [], savedNames: [] };
  });
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  return Object.values((await savedScene(page)).entities).find(entity => entity.name === "Plane")!.id;
}
async function generate(page: Page) {
  const response = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "今ある手動の編集を保って球を一つ追加してください", mode: "build",
    options: { models: false, materials: false, audio: false } }, true);
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result!.generationId as string;
}
async function job(page: Page, generationId: string): Promise<ChatgptGeneration> {
  const response = await call(page, "get_chatgpt_generation", { generationId });
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result as ChatgptGeneration;
}
async function noExternalActions(page: Page) {
  const state = await page.evaluate(() => ({ uploads: window.__XRIFT_RELEASE_E2E__!.uploadAttempts, unhandled: window.__XRIFT_RELEASE_E2E__!.unhandledCommands,
    authentication: window.__XRIFT_RELEASE_E2E__!.calls.filter(call => ["chatgpt_login", "chatgpt_logout", "reset_app_data"].includes(call.command)) }));
  expect(state).toEqual({ uploads: [], unhandled: [], authentication: [] });
}

test("nativeの通信進捗を制作チャットや作業記録へ表示せず、取消callbackは維持する", async ({ page }) => {
  await ready(page, "chatgpt-progress-isolated-fixture");
  await page.evaluate(async () => {
    const modulePath = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ modulePath);
    const fixture = window.__XRIFT_PLANNING_RECOVERY__!;
    const subscribe = tauri.onChatgptGenerationProgress.bind(tauri);
    tauri.onChatgptGenerationProgress = (handler: (value: ChatgptGenerationProgress) => void) => { fixture.progress = handler; return subscribe(handler); };
    const cancel = tauri.chatgptCancelGeneration.bind(tauri);
    tauri.chatgptCancelGeneration = async (generationId: string) => {
      fixture.cancelCalls++;
      // The first request predates the native lease. Its next progress event
      // must repeat cancellation while another generation's event is ignored.
      if (fixture.cancelCalls === 1) return { generationId, cancelled: false };
      return cancel(generationId);
    };
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = true;
  });
  const id = await generate(page);
  const messages = ["ChatGPTから受信しています（検証用4096文字）", "推論APIへ送信しています（検証用通信）", "モデルを確認しています（検証用通信）"];
  try {
    await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptPlanWaiting)).toBe(true);
    const before = (await job(page, id)).progress;
    await page.evaluate(({ id, messages }) => {
      const handler = window.__XRIFT_PLANNING_RECOVERY__!.progress!;
      for (const [index, message] of messages.entries()) handler({ generationId: id, stage: "receiving", message, receivedCharacters: 4096 + index, eventCount: index + 1 });
    }, { id, messages });
    expect((await job(page, id)).progress).toEqual(before);
    const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
    await expect(panel).toBeVisible();
    for (const message of messages) await expect(panel).not.toContainText(message);
    const sessionId = (await job(page, id)).sessionId!;
    const history = await call(page, "get_chatgpt_session", { sessionId });
    expect(history.ok, JSON.stringify(history)).toBe(true);
    for (const message of messages) expect(JSON.stringify(history.result)).not.toContain(message);

    expect((await call(page, "cancel_chatgpt_generation", { generationId: id })).ok).toBe(true);
    expect(await page.evaluate(() => window.__XRIFT_PLANNING_RECOVERY__!.cancelCalls)).toBe(1);
    expect((await job(page, id)).status).toBe("running");
    await page.evaluate(id => {
      window.__XRIFT_PLANNING_RECOVERY__!.progress!({ generationId: `${id}-different`, stage: "receiving", message: "別依頼の通信実況" });
    }, id);
    expect(await page.evaluate(() => window.__XRIFT_PLANNING_RECOVERY__!.cancelCalls)).toBe(1);
    await page.evaluate(id => {
      window.__XRIFT_PLANNING_RECOVERY__!.progress!({ generationId: id, stage: "receiving", message: "停止中の通信実況" });
    }, id);
    await expect.poll(async () => (await job(page, id)).status).toBe("cancelled");
    expect(await page.evaluate(() => window.__XRIFT_PLANNING_RECOVERY__!.cancelCalls)).toBe(2);
    expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptCancelledGenerations)).toContain(id);
    // An event delivered after listener cleanup must not cancel again or add
    // transport details to the completed public record.
    await page.evaluate(id => { window.__XRIFT_PLANNING_RECOVERY__!.progress!({ generationId: id, stage: "receiving", message: "終了後の通信実況" }); }, id);
    expect(await page.evaluate(() => window.__XRIFT_PLANNING_RECOVERY__!.cancelCalls)).toBe(2);
    const record = await call(page, "get_chatgpt_session", { sessionId });
    expect(JSON.stringify(record.result)).not.toMatch(/検証用通信|検証用4096文字|停止中の通信実況|終了後の通信実況|別依頼の通信実況/);
    expect((await job(page, id)).progress.completed).toBe(0);
    await noExternalActions(page);
  } finally { await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = false; }).catch(() => undefined); }
});

test("推論応答ごとの手動編集は最新Sceneで2回再計画し、3度目は変更を保って停止する", async ({ page }) => {
  const entityId = await ready(page, "chatgpt-replan-limit-isolated-fixture");
  await page.evaluate(async () => {
    const modulePath = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ modulePath);
    const plan = tauri.chatgptPlan.bind(tauri);
    tauri.chatgptPlan = async (...args: Parameters<typeof import("../src/lib/tauri").tauri.chatgptPlan>) => {
      const result = await plan(...args);
      const fixture = window.__XRIFT_PLANNING_RECOVERY__!;
      fixture.waitingRound++;
      await new Promise<void>(resolve => { fixture.releaseResponse = resolve; });
      return result;
    };
  });
  const id = await generate(page);
  try {
    for (let round = 1; round <= 3; round++) {
      await expect.poll(() => page.evaluate(() => window.__XRIFT_PLANNING_RECOVERY__!.waitingRound)).toBe(round);
      const renamed = await call(page, "rename_entity", { entityId, name: `推論${round}回目に手動編集した床` }, true);
      expect(renamed.ok, JSON.stringify(renamed)).toBe(true);
      await page.evaluate(() => { const fixture = window.__XRIFT_PLANNING_RECOVERY__!; fixture.releaseResponse?.(); fixture.releaseResponse = undefined; });
    }
    await expect.poll(async () => (await job(page, id)).status).toBe("failed");
    const stopped = await job(page, id);
    expect(stopped.error).toContain("手動編集が続いたため");
    expect(stopped.progress.completed).toBe(0);
    const contexts = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts);
    expect(contexts).toHaveLength(3);
    expect(contexts.map(context => context.entities.find(entity => entity.id === entityId)!.name)).toEqual(["Plane", "推論1回目に手動編集した床", "推論2回目に手動編集した床"]);
    expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.map(request => request.generationId))).toEqual([id, id, id]);
    await expect.poll(async () => (await savedScene(page)).entities[entityId].name).toBe("推論3回目に手動編集した床");
    expect(Object.values((await savedScene(page)).entities).some(entity => entity.name === "再計画テストのSphere")).toBe(false);
    const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
    await expect(panel.getByRole("textbox", { name: "ワールドへの依頼", exact: true })).toBeEnabled();
    await noExternalActions(page);
  } finally { await page.evaluate(() => { window.__XRIFT_PLANNING_RECOVERY__?.releaseResponse?.(); }).catch(() => undefined); }
});

test("3回とも保存成功直後にSceneが更新される場合は最新Planへ復帰する", async ({ page }) => {
  const entityId = await ready(page, "chatgpt-save-recovery-isolated-fixture");
  await page.evaluate(async entityId => {
    const modulePath = "/src/lib/tauri.ts", mcpPath = "/src/release-e2e/mock-tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ modulePath);
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ mcpPath);
    const save = tauri.saveVisualProject.bind(tauri);
    tauri.saveVisualProject = async (projectPath: string, request: VisualProjectWriteRequest) => {
      const result = await save(projectPath, request);
      const fixture = window.__XRIFT_PLANNING_RECOVERY__!;
      // Background thumbnail saves are outside the production planning
      // exchange. Mutate only after the first plan's real successful writes.
      if (window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length === 1 && fixture.injectedNames.length < 3) {
        const scene = JSON.parse(request.sceneDocuments[0].content) as SceneDocument;
        fixture.savedNames.push(scene.entities[entityId].name);
        const name = `保存${fixture.injectedNames.length + 1}回目直後の手動編集`;
        fixture.injectedNames.push(name);
        const context = (await invoke("get_editor_context")).result;
        const changed = await invoke("rename_entity", { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision, entityId, name });
        if (!changed.ok) throw new Error(JSON.stringify(changed));
      }
      return result;
    };
  }, entityId);
  // Keep the source dirty until the plan's first saveNow so all three native
  // writes pass through the real autosave coordinator and live Editor bridge.
  const renamed = await call(page, "rename_entity", { entityId, name: "保存前の手動編集" }, true);
  expect(renamed.ok, JSON.stringify(renamed)).toBe(true);
  const id = await generate(page);
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  const fixture = await page.evaluate(() => ({ injected: window.__XRIFT_PLANNING_RECOVERY__!.injectedNames, saved: window.__XRIFT_PLANNING_RECOVERY__!.savedNames }));
  expect(fixture.injected).toEqual(["保存1回目直後の手動編集", "保存2回目直後の手動編集", "保存3回目直後の手動編集"]);
  expect(fixture.saved).toEqual(["保存前の手動編集", "保存1回目直後の手動編集", "保存2回目直後の手動編集"]);
  const contexts = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts);
  expect(contexts).toHaveLength(2);
  expect(contexts[1].entities.find(entity => entity.id === entityId)!.name).toBe("保存3回目直後の手動編集");
  const completed = await job(page, id);
  expect(completed.error).toBeUndefined();
  expect(completed.progress).toMatchObject({ completed: 1, total: 1 });
  expect(completed.progress.recentEvents.some(event => event.message.includes("現在のSceneから未完了の作業を考え直しています"))).toBe(true);
  const after = await savedScene(page);
  expect(after.entities[entityId].name).toBe("保存3回目直後の手動編集");
  expect(Object.values(after.entities).filter(entity => entity.name === "再計画テストのSphere")).toHaveLength(1);
  await noExternalActions(page);
});
