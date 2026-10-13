import { expect, test, type Page } from "@playwright/test";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { Project, VisualProjectFiles, XriftMcpEditorResponse } from "../src/lib/tauri";
import type { SceneDocument } from "../src/lib/visual-editor/scene-document";

const historyKey = "xrift-studio:chatgpt-sessions:v1";
async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}
const panel = (page: Page) => page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
async function ready(page: Page) {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  const created = await call(page, "create_project", { name: "assistant-session-isolated", kind: "world", templateId: "blank" });
  expect(created.ok, JSON.stringify(created)).toBe(true);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null }; });
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await expect(panel(page).getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("fixture-model");
}
async function saved(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/lib/tauri.ts";
    const project = window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!;
    const files = await (await import(/* @vite-ignore */ path)).tauri.readVisualProject(project.path) as VisualProjectFiles;
    return { project, files, scene: JSON.parse(files.sceneDocuments[0].content) as SceneDocument };
  });
}
async function plan(page: Page, title: string, name: string, extra: Record<string, unknown> = {}) {
  await page.evaluate(({ title, name, extra }) => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({
    title, description: `${title}の手順を確認します`, objects: [{ name, shape: "sphere", position: [2, 1, 0], scale: [1, 1, 1] }], ...extra,
  }); }, { title, name, extra });
}
async function job(page: Page, generationId: string) {
  const response = await call(page, "get_chatgpt_generation", { generationId });
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result as ChatgptGeneration;
}
async function submit(page: Page, prompt: string, mode: "build" | "plan" = "build") {
  const count = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length);
  const planMode = panel(page).getByRole("button", { name: "Plan", exact: true });
  if (await planMode.getAttribute("aria-pressed") !== String(mode === "plan")) await planMode.click();
  await panel(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true }).fill(prompt);
  await panel(page).getByRole("button", { name: "依頼を送信", exact: true }).click();
  await expect.poll(async () => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(count + 1);
  const id = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.at(-1)!.generationId);
  await expect.poll(async () => (await job(page, id)).status).toBe(mode === "plan" ? "planned" : "completed");
  return id;
}
async function assertNoExternalActions(page: Page) {
  const state = await page.evaluate(() => ({ calls: window.__XRIFT_RELEASE_E2E__!.calls, uploads: window.__XRIFT_RELEASE_E2E__!.uploadAttempts, shell: window.__XRIFT_RELEASE_E2E__!.shellCommands }));
  expect(state.uploads).toEqual([]); expect(state.shell.every(command => /(?:whoami|--version)\s*$/.test(command))).toBe(true);
  expect(state.calls.some(call => call.command === "chatgpt_login")).toBe(false);
}

test("2つの制作チャットを切替え、選択中の全文をコピーし、履歴削除でもSceneを保つ", async ({ page }, info) => {
  await ready(page);
  await plan(page, "一つ目の制作", "最初のSphere");
  const firstId = await submit(page, "最初のチャットで球を置く");
  const firstSession = await panel(page).getByRole("combobox", { name: "制作チャットの履歴" }).inputValue();
  await panel(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true }).fill("一つ目の未送信メモ");
  await panel(page).getByRole("button", { name: "新しいチャット", exact: true }).click();
  await expect(panel(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true })).toHaveValue("");
  const secondSession = await panel(page).getByRole("combobox", { name: "制作チャットの履歴" }).inputValue();
  expect(secondSession).not.toBe(firstSession);
  const beforePlan = (await saved(page)).scene;
  await plan(page, "二つ目の相談", "PlanだけのSphere");
  const secondId = await submit(page, "二つ目のチャットで配置を相談", "plan");
  await expect(panel(page).getByRole("button", { name: "Planを反映", exact: true })).toBeEnabled();
  expect((await saved(page)).scene).toEqual(beforePlan);
  await panel(page).getByRole("combobox", { name: "制作チャットの履歴" }).selectOption(firstSession);
  await expect(panel(page).getByLabel("制作の会話と結果", { exact: true }).getByText("最初のチャットで球を置く", { exact: true })).toBeVisible();
  await expect(panel(page).getByLabel("制作の会話と結果", { exact: true }).getByText("二つ目のチャットで配置を相談", { exact: true })).toHaveCount(0);
  await expect(panel(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true })).toHaveValue("一つ目の未送信メモ");
  await page.evaluate(() => {
    // Clipboard is the isolated browser boundary; the real UI constructs the
    // complete transcript and invokes writeText without changing OS clipboard.
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { document.body.dataset.sessionTranscript = text; } } });
  });
  await panel(page).locator('summary[aria-label="チャットの操作"]').click();
  await panel(page).getByRole("button", { name: "作業履歴をすべてコピー", exact: true }).click();
  await expect(panel(page).getByText("このチャットの作業履歴をコピーしました", { exact: true })).toBeVisible();
  const transcript = await page.evaluate(() => document.body.dataset.sessionTranscript!);
  expect(transcript).toContain("最初のチャットで球を置く"); expect(transcript).toContain("最初のSphere");
  expect(transcript).toContain("保存済み 1 / 1"); expect(transcript).not.toContain("二つ目のチャット");
  await panel(page).getByRole("textbox", { name: "チャットの名前", exact: true }).fill("球の制作履歴");
  await panel(page).getByRole("button", { name: "名前を保存", exact: true }).click();
  await expect(panel(page).getByRole("combobox", { name: "制作チャットの履歴" })).toContainText("球の制作履歴");
  await panel(page).locator('summary[aria-label="チャットの操作"]').click();
  await panel(page).getByRole("combobox", { name: "制作チャットの履歴" }).selectOption(secondSession);
  await expect(panel(page).getByLabel("制作の会話と結果", { exact: true }).getByText("二つ目のチャットで配置を相談", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("two-chats-plan.png") });
  await panel(page).getByRole("button", { name: "Planを破棄", exact: true }).click();
  await expect.poll(async () => (await job(page, secondId)).status).toBe("cancelled");
  await panel(page).locator('summary[aria-label="チャットの操作"]').click();
  await panel(page).getByRole("button", { name: "このチャットの履歴を削除", exact: true }).click();
  await expect(panel(page).getByRole("combobox", { name: "制作チャットの履歴" }).locator("option")).toHaveCount(1);
  expect((await job(page, firstId)).status).toBe("completed");
  expect((await saved(page)).scene).toEqual(beforePlan);
  await assertNoExternalActions(page);
});

test("続けるは同じ会話の結果をnativeへ送り、保存済みEntityを繰り返さず追加する", async ({ page }, info) => {
  await ready(page);
  await plan(page, "途中までの制作", "保存済みSphere", { hasMore: true, remainingWork: "次に通路へBoxを追加します" });
  const firstId = await submit(page, "小さな広場を順に作る");
  const firstScene = (await saved(page)).scene;
  const first = Object.values(firstScene.entities).find(entity => entity.name === "保存済みSphere")!;
  expect(first).toBeTruthy();
  await plan(page, "続きの制作", "続きを示すSphere", { hasMore: false });
  const count = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length);
  await panel(page).getByRole("button", { name: "続ける", exact: true }).click();
  await expect.poll(async () => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(count + 1);
  const nextId = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.at(-1)!.generationId);
  await expect.poll(async () => (await job(page, nextId)).status).toBe("completed");
  const context = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts.at(-1)!);
  expect(context.conversation).toHaveLength(1);
  expect(context.conversation![0].prompt).toBe("小さな広場を順に作る");
  expect(context.conversation![0].result).toContain("保存済みSphere");
  expect(context.conversation![0].result).toContain("次に通路へBoxを追加します");
  const after = (await saved(page)).scene;
  expect(after.entities[first.id]).toEqual(first);
  expect(Object.values(after.entities).filter(entity => entity.name === "保存済みSphere")).toHaveLength(1);
  expect(Object.values(after.entities).filter(entity => entity.name === "続きを示すSphere")).toHaveLength(1);
  expect((await job(page, nextId)).sessionId).toBe((await job(page, firstId)).sessionId);
  await expect(panel(page).getByLabel("制作の会話と結果", { exact: true }).getByText("小さな広場を順に作る", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("continue-history.png") });
  await assertNoExternalActions(page);
});

async function preserveNativeFixtureAfterReload(page: Page, snapshot: { project: Project; files: VisualProjectFiles }) {
  // Browser localStorage is real. Only the native project disk/registry is
  // reseeded so a fresh App can open the same isolated world after reload.
  await page.addInitScript(({ project, files }) => {
    let latest = files;
    let internals: Record<string, unknown>;
    const wrap = (value: Record<string, unknown>) => {
      const instrument = (invoke: (command: string, args?: Record<string, unknown>, options?: unknown) => Promise<unknown>) => {
        return async (command: string, args?: Record<string, unknown>, options?: unknown) => {
          if (command === "read_visual_project" && args?.projectPath === project.path) return structuredClone(latest);
          const result = await invoke(command, args, options);
          if (command === "save_visual_project" && args?.projectPath === project.path) latest = structuredClone(args.request as VisualProjectFiles);
          return result;
        };
      };
      let wrapped = value.invoke ? instrument(value.invoke as Parameters<typeof instrument>[0]) : undefined;
      Object.defineProperty(value, "invoke", { configurable: true, get: () => wrapped, set: next => { wrapped = instrument(next); } });
      return value;
    };
    internals = wrap({});
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, get: () => internals, set: next => { internals = wrap(next); } });
    let state: Window["__XRIFT_RELEASE_E2E__"];
    Object.defineProperty(window, "__XRIFT_RELEASE_E2E__", { configurable: true, get: () => state, set: next => {
      state = next;
      state!.projects.push(structuredClone(project));
      state!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, error: null };
    } });
  }, snapshot);
}

test("端末の履歴を再読み込みしてPlanを表示し、前の応答を続きの会話に使う", async ({ page }) => {
  await ready(page);
  await plan(page, "再読み込み前の制作", "履歴に残るSphere");
  await submit(page, "再起動前のチャットで球を追加");
  await panel(page).getByRole("button", { name: "新しいチャット", exact: true }).click();
  await plan(page, "保存された相談Plan", "まだ反映しないSphere");
  await submit(page, "再起動後も相談Planを読みたい", "plan");
  const selectedId = await panel(page).getByRole("combobox", { name: "制作チャットの履歴" }).inputValue();
  await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).sessions.length, historyKey)).toBe(2);
  const snapshot = await saved(page);
  await preserveNativeFixtureAfterReload(page, snapshot);
  await page.reload();
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "open_project", { path: snapshot.project.path })).ok).toBe(true);
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await expect(panel(page).getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("fixture-model");
  await expect(panel(page).getByRole("combobox", { name: "制作チャットの履歴" }).locator("option")).toHaveCount(2);
  await panel(page).getByRole("combobox", { name: "制作チャットの履歴" }).selectOption(selectedId);
  await expect(panel(page).getByLabel("制作の会話と結果", { exact: true }).getByText("再起動後も相談Planを読みたい", { exact: true })).toBeVisible();
  await panel(page).getByText("Plan：保存された相談Plan", { exact: true }).click();
  await expect(panel(page).getByText("まだ反映しないSphere", { exact: true })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Planを反映", exact: true })).toHaveCount(0);
  expect((await saved(page)).scene).toEqual(snapshot.scene);
  await plan(page, "再起動後の続き", "再起動後のSphere");
  await panel(page).getByRole("button", { name: "続ける", exact: true }).click();
  await expect.poll(async () => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(1);
  const id = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests[0].generationId);
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts.at(-1)!.conversation?.[0].prompt)).toBe("再起動後も相談Planを読みたい");
  await assertNoExternalActions(page);
});

test("変更を戻すは実Sceneを保存し、その後の本人編集があれば上書きせず拒否する", async ({ page }) => {
  await ready(page);
  const before = await saved(page);
  await plan(page, "戻す操作の確認", "戻すSphere");
  const id = await submit(page, "戻せる変更を一つ追加");
  await panel(page).getByRole("button", { name: "変更を戻す", exact: true }).click();
  await expect.poll(async () => (await job(page, id)).revertedAt).toBeTruthy();
  await expect.poll(async () => (await saved(page)).scene).toEqual(before.scene);
  await expect(panel(page).getByRole("button", { name: "変更を戻す", exact: true })).toHaveCount(0);
  await plan(page, "本人編集の保護", "保護対象Sphere");
  const second = await submit(page, "もう一度変更を追加");
  const floor = Object.values(before.scene.entities).find(entity => entity.name === "Plane")!;
  const renamed = await call(page, "rename_entity", { entityId: floor.id, name: "本人が変更したPlane" }, true);
  expect(renamed.ok, JSON.stringify(renamed)).toBe(true);
  await expect.poll(async () => (await saved(page)).scene.entities[floor.id].name).toBe("本人が変更したPlane");
  const edited = (await saved(page)).scene;
  await panel(page).getByRole("button", { name: "変更を戻す", exact: true }).click();
  await expect(panel(page).getByRole("alert")).toContainText("編集");
  expect((await job(page, second)).revertedAt).toBeUndefined();
  expect((await saved(page)).scene).toEqual(edited);
  await assertNoExternalActions(page);
});

test("ChatGPTから同梱の空・Water・テクスチャ付き3Dセットを実描画して順次保存する", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await ready(page);
  const before = await saved(page), floor = Object.values(before.scene.entities).find(entity => entity.name === "Plane")!;
  const installed = await page.evaluate(async entityId => {
    const path = "/src/lib/visual-editor/chatgpt-builtin-catalog.ts";
    const { listChatgptBuiltinCandidates } = await import(/* @vite-ignore */ path);
    const candidates = listChatgptBuiltinCandidates("world", "空と水面と焚き火の3Dセットを追加");
    const sky = candidates.find((candidate: { providerId: string }) => candidate.providerId === "xrift-sky-shaders")!;
    const water = candidates.find((candidate: { providerId: string }) => candidate.providerId === "xrift-water-shaders")!;
    const campfire = candidates.find((candidate: { candidateId: string }) => candidate.candidateId === "builtin:xrift-scene-recipes:scene-recipe.campfire")!;
    if (!campfire || !sky || !water) throw new Error("Trusted catalog fixture unavailable");
    const files = new Map<string, string>(), writes: string[] = [];
    const invoke = window.__TAURI_INTERNALS__!.invoke!;
    window.__TAURI_INTERNALS__!.invoke = async (command, args, options) => {
      if (command === "commit_visual_asset_import") {
        for (const write of args!.writes as { relativePath: string; dataUrl: string }[]) {
          files.set(`${args!.projectPath}:${write.relativePath}`, write.dataUrl); writes.push(write.relativePath);
        }
      }
      if (command === "read_image_data_url") {
        const file = files.get(`${args!.projectPath}:${args!.rel}`);
        if (file) return file;
      }
      return invoke(command, args, options);
    };
    Object.defineProperty(window, "__CHATGPT_BUILTIN_WRITES__", { value: writes });
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "同梱素材の制作", description: "通常の素材で景色を作ります", objects: [], operations: [
      { kind: "skybox", candidateId: sky.candidateId, enabled: true, iblEnabled: false },
      { kind: "material", entityId, candidateId: water.candidateId },
      { kind: "catalog", candidateId: campfire.candidateId, name: "配置した焚き火", position: [2, 0, 2] },
    ] });
    return { sky: sky.name, water: water.name };
  }, floor.id);
  const id = await submit(page, "空と水面と焚き火の3Dセットを追加", "plan");
  expect((await saved(page)).scene).toEqual(before.scene);
  await panel(page).getByRole("button", { name: "Planを反映", exact: true }).click();
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  expect((await job(page, id)).progress.completed).toBe(3);
  const after = await saved(page);
  expect(after.scene.entities[floor.id].components.find(component => component.type === "transform")).toEqual(floor.components.find(component => component.type === "transform"));
  const root = Object.values(after.scene.entities).find(entity => entity.name === "配置した焚き火")!;
  expect(root.children.length).toBeGreaterThan(1);
  const assets = JSON.parse(after.files.assetManifestJson).assets as Record<string, { kind: string; shader?: { fragmentShader: string }; name: string }>;
  expect(assets[after.scene.settings!.skybox.materialAssetId!].shader?.fragmentShader.length).toBeGreaterThan(100);
  expect(Object.values(assets).some(asset => asset.kind === "model")).toBe(true);
  expect(Object.values(assets).some(asset => asset.kind === "texture")).toBe(true);
  expect(Object.values(assets).some(asset => asset.kind === "particle")).toBe(true);
  expect(Object.values(assets).some(asset => asset.name.includes(installed.water))).toBe(true);
  const writes = await page.evaluate(() => (window as unknown as { __CHATGPT_BUILTIN_WRITES__: string[] }).__CHATGPT_BUILTIN_WRITES__);
  expect(writes.some(path => path.endsWith(".glb"))).toBe(true);
  expect(writes.some(path => path.endsWith(".png"))).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" }).getByText("配置した焚き火", { exact: true })).toBeVisible();
  const rendered = () => page.evaluate(async id => {
    const path = "/e2e/chatgpt-builtin-render.fixture.ts";
    return (await import(/* @vite-ignore */ path)).readRenderedBuiltinEntity(id);
  }, root.id);
  await expect.poll(async () => (await rendered()).texturedMeshes).toBeGreaterThan(0);
  const rendering = await rendered();
  expect(rendering.contextLost).toBe(false); expect(rendering.drawCalls).toBeGreaterThan(0);
  await info.attach("builtin-real-render", { contentType: "application/json", body: JSON.stringify(rendering) });
  await page.screenshot({ path: info.outputPath("builtin-textured-set.png") });
  expect(errors).toEqual([]);
  await assertNoExternalActions(page);
});
