import { expect, test, type Page } from "@playwright/test";
import type { VisualProjectFiles, XriftMcpEditorResponse } from "../src/lib/tauri";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { SceneDocument } from "../src/lib/visual-editor/scene-document";

const primitiveOptions = { models: false, materials: false, audio: false };
type EditorContext = { projectId: string; sceneId: string; revision: number; saveStatus: string };

async function expectMcpWithoutPlan(page: Page) {
  const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  const controls = panel.getByRole("group", { name: "接続の操作", exact: true });
  await expect(panel.getByRole("button", { name: "Plan", exact: true })).toHaveCount(0);
  await expect(controls.getByRole("button", { name: "MCP接続", exact: true })).toBeInViewport();
}

async function call(page: Page, tool: string, args: Record<string, unknown> = {}): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args }) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    return (await load("/src/release-e2e/mock-tauri.ts")).callReleaseE2EMcp(tool, args);
  }, { tool, args });
}
async function connectFixture(page: Page) {
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = {
    signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, error: null,
  }; });
}
async function openWorld(page: Page) {
  await openProject(page, "world");
}
async function openProject(page: Page, kind: "world" | "item") {
  await page.goto("/e2e.html?scenario=ready");
  try {
    await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  } catch (error) {
    console.error("Library startup diagnostic", await page.evaluate(() => ({
      status: document.querySelector('[role="status"]')?.textContent,
      commands: window.__XRIFT_RELEASE_E2E__?.calls.slice(-20),
      unhandled: window.__XRIFT_RELEASE_E2E__?.unhandledCommands,
    })));
    throw error;
  }
  expect((await call(page, "create_project", { name: `chatgpt-tabs-${kind}-fixture`, kind, templateId: kind === "world" ? "blank" : "basic-item" })).ok).toBe(true);
  if ((page.viewportSize()?.width ?? 1280) < 640) {
    await page.getByRole("button", { name: "Hierarchy", exact: true }).click();
  }
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
  await expect.poll(async () => ((await call(page, "get_editor_context")).result as EditorContext).saveStatus).toBe("saved");
}

/** Read context and start in one browser round trip so test-driver latency cannot stale it. */
async function generateFresh(page: Page, prompt: string, settings: { target?: "current" | "new"; mode?: "build" | "plan" } = { target: "new" }) {
  return page.evaluate(async ({ prompt, options, settings }) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { callReleaseE2EMcp: call } = await load("/src/release-e2e/mock-tauri.ts");
    const context = await call("get_editor_context");
    if (!context.ok) throw new Error(JSON.stringify(context));
    const source = context.result as EditorContext;
    const response = await call("generate_chatgpt_world", {
      projectId: source.projectId, sceneId: source.sceneId, expectedRevision: source.revision,
      model: "fixture-model", prompt, options, ...settings,
    });
    return { source, response };
  }, { prompt, options: primitiveOptions, settings });
}

async function generation(page: Page, generationId: string): Promise<ChatgptGeneration> {
  const response = await call(page, "get_chatgpt_generation", { generationId });
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result as ChatgptGeneration;
}

async function savedEntityNames(page: Page, projectPath: string): Promise<string[]> {
  return page.evaluate(async projectPath => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const files = await (await load("/src/lib/tauri.ts")).tauri.readVisualProject(projectPath);
    return files.sceneDocuments.flatMap((file: { content: string }) => {
      const scene = JSON.parse(file.content) as { entities: Record<string, { name: string }> };
      return Object.values(scene.entities).map(entity => entity.name);
    });
  }, projectPath);
}

async function savedWorld(page: Page) {
  return page.evaluate(async () => {
    const path = window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!.path;
    const modulePath = "/src/lib/tauri.ts";
    const files = await (await import(/* @vite-ignore */ modulePath)).tauri.readVisualProject(path) as VisualProjectFiles;
    return { path, files, scene: JSON.parse(files.sceneDocuments[0].content) as SceneDocument };
  });
}

async function mutateFresh(page: Page, tool: string, args: Record<string, unknown>) {
  return page.evaluate(async ({ tool, args }) => {
    const modulePath = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: call } = await import(/* @vite-ignore */ modulePath);
    const context = (await call("get_editor_context")).result as EditorContext;
    return call(tool, { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision, ...args });
  }, { tool, args }) as Promise<XriftMcpEditorResponse>;
}

async function editFixture(page: Page, entityId: string) {
  await page.evaluate(entityId => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({
    title: "現在のSceneの相談", description: "既存の床を調整し、球を追加します", edits: [{ entityId, name: "調整したPlane", position: [3, 0, -2] }],
    objects: [{ name: "追加したSphere", shape: "sphere", position: [1, 1, 1], scale: [1, 1, 1] }],
  }); }, entityId);
}

async function settleBackgroundThumbnails(page: Page) {
  await expect.poll(async () => {
    const { files } = await savedWorld(page);
    const assets = JSON.parse(files.assetManifestJson).assets as Record<string, { kind: string; thumbnail?: { status: string } }>;
    return Object.values(assets).filter(asset => asset.kind === "material").every(asset => asset.thumbnail?.status === "generated");
  }).toBe(true);
  await expect.poll(async () => ((await call(page, "get_editor_context")).result as EditorContext).saveStatus).toBe("saved");
}

test("現在のワールドへ追加と調整を保存し、EntityのIDと既存Componentを保つ", async ({ page }) => {
  await openWorld(page);
  await connectFixture(page);
  const before = await savedWorld(page);
  const plane = Object.values(before.scene.entities).find(entity => entity.name === "Plane")!;
  await page.getByRole("tree", { name: "シーンのEntity階層" }).getByText("Plane", { exact: true }).click();
  await editFixture(page, plane.id);
  // Omit target to exercise the public MCP default: the current Scene.
  const { source, response } = await generateFresh(page, "既存の床を調整して球を追加", {});
  expect(response.ok, JSON.stringify(response)).toBe(true);
  const { generationId } = response.result as { generationId: string };
  await expect.poll(async () => (await generation(page, generationId)).status).toBe("completed");
  expect((await call(page, "get_editor_context")).result).toMatchObject({ projectId: source.projectId, sceneId: source.sceneId });
  const after = await savedWorld(page);
  expect(after.path).toBe(before.path);
  const edited = after.scene.entities[plane.id];
  expect(edited.name).toBe("調整したPlane");
  expect(edited.components.map(component => component.id)).toEqual(plane.components.map(component => component.id));
  expect(edited.components.filter(component => component.type !== "transform")).toEqual(plane.components.filter(component => component.type !== "transform"));
  expect(edited.components.find(component => component.type === "transform")).toMatchObject({ position: [3, 0, -2] });
  expect(Object.values(after.scene.entities).map(entity => entity.name)).toContain("追加したSphere");
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.filter(project => project.format === "visual").length)).toBe(1);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts.at(-1))).toMatchObject({ selectedEntityId: plane.id, entities: expect.arrayContaining([expect.objectContaining({ id: plane.id, name: "Plane" })]) });
});

test("Plan切替なしの通常送信で同じワールドへ変更を反映する", async ({ page }) => {
  await openWorld(page);
  await connectFixture(page);
  await settleBackgroundThumbnails(page);
  const before = await savedWorld(page);
  const plane = Object.values(before.scene.entities).find(entity => entity.name === "Plane")!;
  await editFixture(page, plane.id);
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  await expect(panel.getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("fixture-model");
  await expect(panel.getByRole("checkbox", { name: "コード・Blenderで制作", exact: true })).toHaveCount(1);
  await panel.getByRole("textbox", { name: "ワールドへの依頼", exact: true }).fill("床を調整して球を追加");
  await expectMcpWithoutPlan(page);
  await panel.getByRole("button", { name: "依頼を送信", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(1);
  const requested = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.at(-1)!);
  expect(requested.options).toEqual({ models: true, materials: true, audio: true, modelSource: "auto" });
  expect((await generation(page, requested.generationId)).mode).toBe("build");
  await expect.poll(async () => (await generation(page, requested.generationId)).status).toBe("completed");
  const after = await savedWorld(page);
  expect(after.path).toBe(before.path);
  expect(after.scene.entities[plane.id].name).toBe("調整したPlane");
  expect(Object.values(after.scene.entities).map(entity => entity.name)).toContain("追加したSphere");
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(1);
});

test("Plan作成後の手動編集を上書きせず、追加も始めない", async ({ page }) => {
  await openWorld(page);
  await connectFixture(page);
  const before = await savedWorld(page);
  const plane = Object.values(before.scene.entities).find(entity => entity.name === "Plane")!;
  await editFixture(page, plane.id);
  const { response } = await generateFresh(page, "手動編集との衝突を確認", { mode: "plan" });
  const { generationId } = response.result as { generationId: string };
  await expect.poll(async () => (await generation(page, generationId)).status).toBe("planned");
  expect((await mutateFresh(page, "rename_entity", { entityId: plane.id, name: "本人が変更したPlane" })).ok).toBe(true);
  expect((await mutateFresh(page, "apply_chatgpt_plan", { generationId })).ok).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(2);
  await expect.poll(async () => (await generation(page, generationId)).status).toBe("planned");
  expect((await generation(page, generationId)).error).toBeUndefined();
  await expect.poll(async () => (await savedWorld(page)).scene.entities[plane.id].name).toBe("本人が変更したPlane");
  expect(Object.values((await savedWorld(page)).scene.entities).map(entity => entity.name)).not.toContain("追加したSphere");
});

test("同じワールドでもSceneが変わったら古いPlanを反映しない", async ({ page }) => {
  await openWorld(page);
  await connectFixture(page);
  const { source, response } = await generateFresh(page, "Sceneの保護を確認", { mode: "plan" });
  const { generationId } = response.result as { generationId: string };
  await expect.poll(async () => (await generation(page, generationId)).status).toBe("planned");
  const before = await savedWorld(page);
  await page.getByRole("button", { name: "プロジェクト一覧へ戻る", exact: true }).click();
  const changedScene = await page.evaluate(async ({ path, files }) => {
    const modulePath = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ modulePath);
    const project = JSON.parse(files.projectJson);
    const nextSceneId = `scene-${crypto.randomUUID()}`;
    const scene = JSON.parse(files.sceneDocuments[0].content);
    scene.sceneId = nextSceneId;
    project.scenePaths = { [nextSceneId]: files.sceneDocuments[0].relativePath };
    project.entrySceneId = nextSceneId;
    await tauri.saveVisualProject(path, { ...files, projectJson: JSON.stringify(project), sceneDocuments: [{ ...files.sceneDocuments[0], content: JSON.stringify(scene) }] });
    return nextSceneId;
  }, { path: before.path, files: before.files });
  expect((await call(page, "open_project", { path: before.path })).ok).toBe(true);
  expect((await call(page, "get_editor_context")).result).toMatchObject({ projectId: source.projectId, sceneId: changedScene });
  const rejected = await mutateFresh(page, "apply_chatgpt_plan", { generationId });
  expect(rejected.ok).toBe(false);
  expect(rejected.error?.code).toBe("STALE_REVISION");
  expect((await savedWorld(page)).scene.entities).toEqual(before.scene.entities);
});

test("推論中の停止をnativeへ渡し、現在のSceneと保存済みデータを保つ", async ({ page }) => {
  await openWorld(page);
  await connectFixture(page);
  await settleBackgroundThumbnails(page);
  const before = await savedWorld(page);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = true; });
  try {
    const { response } = await generateFresh(page, "停止する依頼", {});
    const { generationId } = response.result as { generationId: string };
    await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptPlanWaiting)).toBe(true);
    await page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true }).getByRole("button", { name: "制作を停止", exact: true }).click();
    await expect.poll(async () => (await generation(page, generationId)).status).toBe("cancelled");
    expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptCancelledGenerations)).toContain(generationId);
    expect((await savedWorld(page)).files).toEqual(before.files);
    expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.uploadAttempts)).toEqual([]);
  } finally { await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = false; }).catch(() => undefined); }
});

test("ChatGPTは必要時だけタブで開き、チャット枠からMCP設定を開閉しても入力と認証を保持する", async ({ page }, info) => {
  await openWorld(page);
  const chatgptTab = page.getByRole("tab", { name: "ChatGPTを表示", exact: true });
  const mcpTab = page.getByRole("tab", { name: "MCP接続を表示", exact: true });
  const utility = page.getByRole("contentinfo", { name: "エディターのステータスバー", exact: true });
  const openChatgpt = utility.getByRole("button", { name: "ChatGPTを開く", exact: true });
  const openSettings = utility.getByRole("button", { name: "シーン設定を開く", exact: true });
  await expect(chatgptTab).toHaveCount(0);
  await expect(mcpTab).toHaveCount(0);
  await expect(openChatgpt).toBeVisible();
  await expect(openSettings).toBeVisible();
  await openChatgpt.click();
  await expect(chatgptTab).toHaveAttribute("aria-selected", "true");
  await expect(mcpTab).toHaveCount(0);
  const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  const openMcp = panel.getByRole("button", { name: "MCP接続", exact: true });
  await expect(openMcp).toBeInViewport();
  await expectMcpWithoutPlan(page);
  const mcpPanel = page.getByRole("dialog", { name: "MCP接続", exact: true });
  const prompt = panel.getByRole("textbox", { name: "ワールドへの依頼" });
  await prompt.fill("秋の公園");
  const start = await call(page, "connect_chatgpt");
  expect(start.result).toMatchObject({ connecting: true, signedIn: false });
  await expect(panel.getByRole("status")).toContainText("ブラウザで許可すると");
  await expect(mcpPanel).toBeHidden();
  await openMcp.click();
  await expect(mcpPanel).toBeVisible();
  await expect.poll(() => mcpPanel.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => mcpPanel.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Tab");
  await expect.poll(() => mcpPanel.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
  await expect(mcpTab).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "ChatGPTを表示", exact: true, includeHidden: true })).toHaveAttribute("aria-selected", "true");
  await mcpPanel.getByRole("button", { name: "MCP接続を閉じる", exact: true }).click();
  await expect(mcpTab).toHaveCount(0);
  await expect(chatgptTab).toHaveAttribute("aria-selected", "true");
  await expect(mcpPanel).toBeHidden();
  await expect(openMcp).toBeFocused();
  await expect(panel).toBeVisible();
  await expect(prompt).toHaveValue("秋の公園");
  await openMcp.click();
  await expect(mcpPanel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(mcpPanel).toBeHidden();
  await expect(openMcp).toBeFocused();
  await expect(chatgptTab).toHaveAttribute("aria-selected", "true");
  await expect(prompt).toHaveValue("秋の公園");
  expect((await call(page, "get_chatgpt_connection")).result).toMatchObject({ connecting: true, signedIn: false });
  await panel.getByRole("button", { name: "制作チャットを閉じる", exact: true }).click();
  await expect(chatgptTab).toHaveCount(0);
  await expect(page.locator('section[aria-labelledby="scene-view-heading"] canvas').first()).toBeVisible();
  await expect(panel).toBeHidden();
  expect((await call(page, "get_chatgpt_connection")).result).toMatchObject({ connecting: true, signedIn: false });
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = {
    signedIn: false, email: null, planUsageEnabled: false, connecting: false, error: "本人確認の検証用エラー",
  }; });
  await openChatgpt.click();
  await expect(mcpTab).toHaveCount(0);
  await expect(prompt).toHaveValue("秋の公園");
  await expect(panel.getByRole("alert")).toHaveText("本人確認の検証用エラー");
  expect((await call(page, "get_chatgpt_connection")).result).toMatchObject({ connecting: false, error: "本人確認の検証用エラー" });
  await expect(openMcp).toBeVisible();
  await openMcp.click();
  await expect(mcpPanel).toBeVisible();
  await page.keyboard.press("Escape");
  await connectFixture(page);
  await expect(panel.getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("fixture-model");
  await expect(openMcp).toBeInViewport();
  await openMcp.click();
  await expect(mcpPanel).toBeVisible();
  await mcpPanel.getByRole("button", { name: "MCP接続を閉じる", exact: true }).click();
  await expect(prompt).toHaveValue("秋の公園");
  await page.screenshot({ path: info.outputPath("chatgpt-mcp-entry.png") });
  expect((await call(page, "list_chatgpt_models")).result).toMatchObject({ models: [{ slug: "fixture-model" }] });
  expect((await call(page, "disconnect_chatgpt")).result).toMatchObject({ signedIn: false });
  await expect(panel.getByRole("button", { name: "ChatGPTに接続", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "依頼を送信", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.unhandledCommands)).toEqual([]);
});

test("Inspector内の閉じる操作は各画面幅で見つかり、再表示で未送信の依頼を保持する", async ({ page }, testInfo) => {
  await openWorld(page);
  await connectFixture(page);
  const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  const open = page.getByRole("contentinfo", { name: "エディターのステータスバー", exact: true }).getByRole("button", { name: "ChatGPTを開く", exact: true });
  for (const width of [1600, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await open.click();
    const close = panel.getByRole("button", { name: "制作チャットを閉じる", exact: true });
    const prompt = panel.getByRole("textbox", { name: "ワールドへの依頼", exact: true });
    await expect(close).toBeVisible();
    await expect(close).toContainText("閉じる");
    await expect(prompt).toBeEnabled();
    await prompt.fill(`画面幅${width}の未送信の相談`);
    const panelBounds = await panel.boundingBox(), closeBounds = await close.boundingBox();
    expect(closeBounds!.x).toBeGreaterThanOrEqual(panelBounds!.x);
    expect(closeBounds!.x + closeBounds!.width).toBeLessThanOrEqual(panelBounds!.x + panelBounds!.width);
    await page.screenshot({ path: testInfo.outputPath(`inspector-chatgpt-${width}.png`) });
    await close.click();
    await expect(panel).toBeHidden();
    await expect(page.getByRole("tab", { name: "ChatGPTを表示", exact: true })).toHaveCount(0);
    await open.click();
    await expect(prompt).toHaveValue(`画面幅${width}の未送信の相談`);
    await close.click();
  }
  expect((await call(page, "get_chatgpt_connection")).result).toMatchObject({ signedIn: true });
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.unhandledCommands)).toEqual([]);
});

test("MCP生成は古いrevisionを拒否し、開始から失敗・別作品の保存完了まで結果を取得できる", async ({ page }) => {
  await openWorld(page);
  await connectFixture(page);
  const source = (await call(page, "get_editor_context")).result as { projectId: string; sceneId: string; revision: number };
  const args = { projectId: source.projectId, sceneId: source.sceneId, expectedRevision: source.revision, model: "fixture-model", prompt: "failure", options: primitiveOptions };
  expect((await call(page, "generate_chatgpt_world", { ...args, expectedRevision: source.revision + 1 })).error?.code).toBe("STALE_REVISION");
  const { response: failedResponse } = await generateFresh(page, "failure");
  expect(failedResponse.ok, JSON.stringify(failedResponse)).toBe(true);
  const failed = failedResponse.result as { generationId: string; status: string };
  expect(failed.status).toBe("running");
  await expect.poll(async () => (await call(page, "get_chatgpt_generation", { generationId: failed.generationId })).result).toMatchObject({ status: "failed", error: "検証用の生成エラー" });
  expect((await call(page, "get_editor_context")).result).toMatchObject({ projectId: source.projectId });
  const { response: startResponse } = await generateFresh(page, "広場");
  expect(startResponse.ok, JSON.stringify({ source, startResponse })).toBe(true);
  const started = startResponse.result as { generationId: string; status: string };
  expect(started.status).toBe("running");
  await expect.poll(async () => (await call(page, "get_chatgpt_generation", { generationId: started.generationId })).result).toMatchObject({ status: "completed", name: expect.stringMatching(/^chatgpt-world-/) });
  expect((await call(page, "get_editor_context")).result).not.toMatchObject({ projectId: source.projectId });
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.filter(v => v.format === "visual").length)).toBe(2);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.uploadAttempts)).toEqual([]);
});

test("MCPの逐次生成はプランと保存済みの進捗を返し、SceneとInspectorで途中のEntityを確認できる", async ({ page }) => {
  await openWorld(page);
  await connectFixture(page);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptSaveGate = 2; });
  try {
    const { source, response } = await generateFresh(page, "順番に広場、ベンチ、木を作ってください");
    expect(response.ok, JSON.stringify(response)).toBe(true);
    const { generationId } = response.result as { generationId: string };
    await expect.poll(async () => (await generation(page, generationId)).progress).toMatchObject({ completed: 1, total: 3, phase: "placing" });
    const running = await generation(page, generationId);
    expect(running.status).toBe("running");
    expect(running.options).toEqual(primitiveOptions);
    expect(running.sourceProjectId).toBe(source.projectId);
    expect(running.projectId).toBeTruthy();
    expect(running.projectId).not.toBe(source.projectId);
    expect(running.progress.projectId).toBe(running.projectId);
    expect(running.plan).toMatchObject({ title: "検証用の広場", objects: [
      { name: "広場", shape: "plane" }, { name: "ベンチ", shape: "box" }, { name: "木", shape: "cone" },
    ] });
    const placed = running.progress.recentEvents.filter(event => event.entityId);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ name: "広場", phase: "placing" });
    expect((await call(page, "get_editor_context")).result).toMatchObject({ projectId: running.projectId });
    const publishDuringGeneration = await call(page, "publish_project", { projectId: running.projectId });
    expect(publishDuringGeneration.ok).toBe(false);
    expect(publishDuringGeneration.error?.code).toBe("EDITOR_BUSY");
    const saved = await savedEntityNames(page, running.path!);
    expect(saved).toContain("広場");
    expect(saved).not.toContain("ベンチ");
    expect(saved).not.toContain("木");

    const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
    await expect(panel).toBeVisible();
    await expect(page.getByRole("tab", { name: "ChatGPTを表示", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "MCP接続を表示", exact: true })).toHaveCount(0);
    await expect(panel.getByRole("list", { name: "依頼の作業結果", exact: true })).toBeVisible();
    await expect(panel.getByRole("checkbox", { name: "コード・Blenderで制作", exact: true })).toHaveCount(1);
    await expect(panel.getByText("Plan：検証用の広場", { exact: true })).toHaveCount(0);
    await panel.getByRole("button", { name: "制作チャットを閉じる", exact: true }).click();
    await expect(panel).toBeHidden();
    await expect(page.getByRole("tab", { name: "ChatGPTを表示", exact: true })).toHaveCount(0);
    expect((await generation(page, generationId)).status).toBe("running");
    await page.getByRole("contentinfo", { name: "エディターのステータスバー", exact: true })
      .getByRole("button", { name: "ChatGPTを開く", exact: true }).click();
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("順番に広場、ベンチ、木を作ってください");
    const canvas = page.locator('section[aria-labelledby="scene-view-heading"] canvas').first();
    await expect(canvas).toBeVisible();
    expect((await canvas.boundingBox())!.width).toBeGreaterThan(200);
    await panel.getByRole("button", { name: "広場をInspectorで表示", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Entity名", exact: true })).toHaveValue("広場");
    await expect(panel).toBeVisible();

    await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptSaveGate = null; });
    await expect.poll(async () => (await generation(page, generationId)).status).toBe("completed");
    const done = await generation(page, generationId);
    expect(done.progress).toMatchObject({ phase: "completed", completed: 3, total: 3 });
    expect(done.progress.recentEvents.filter(event => event.entityId).map(event => event.name)).toEqual(["広場", "ベンチ", "木"]);
    expect(done.nextActions).toContain("get_editor_context");
    expect(await savedEntityNames(page, done.path!)).toEqual(expect.arrayContaining(["広場", "ベンチ", "木"]));
    const snapshots = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptSavedSteps);
    const counts = snapshots.map(snapshot => snapshot.entityNames.filter(name => ["広場", "ベンチ", "木"].includes(name)).length);
    expect(counts).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.unhandledCommands)).toEqual([]);
    expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.uploadAttempts)).toEqual([]);
  } finally {
    await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptSaveGate = null; }).catch(() => undefined);
  }
});

test("逐次生成の途中で保存が失敗しても、前の作品と配置済みの保存結果を残す", async ({ page }) => {
  await openWorld(page);
  await connectFixture(page);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptSaveFailAt = 2; });
  const { source, response } = await generateFresh(page, "保存の失敗を確認する広場");
  expect(response.ok, JSON.stringify(response)).toBe(true);
  const { generationId } = response.result as { generationId: string };
  await expect.poll(async () => (await generation(page, generationId)).status).toBe("failed");
  const failed = await generation(page, generationId);
  expect(failed.error).toMatch(/保存/);
  expect(failed.progress).toMatchObject({ phase: "failed", completed: 1, total: 3 });
  expect(failed.projectId).not.toBe(source.projectId);
  expect((await call(page, "get_editor_context")).result).toMatchObject({ projectId: failed.projectId });
  const saved = await savedEntityNames(page, failed.path!);
  expect(saved).toContain("広場");
  expect(saved).not.toContain("ベンチ");
  expect(saved).not.toContain("木");
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toContainText("広場");
  await expect(page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true }).getByRole("alert")).toContainText("保存");
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.filter(project => project.format === "visual").length)).toBe(2);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.uploadAttempts)).toEqual([]);
});

test("ItemプロジェクトからのChatGPT生成は推論開始前に拒否する", async ({ page }) => {
  await openProject(page, "item");
  await connectFixture(page);
  const { source, response } = await generateFresh(page, "広場");
  expect(response.ok).toBe(false);
  expect(response.error?.code).toBe("PROJECT_NOT_EDITABLE");
  expect((await call(page, "get_editor_context")).result).toMatchObject({ projectId: source.projectId });
  expect((await call(page, "open_chatgpt_panel")).error?.code).toBe("PROJECT_NOT_EDITABLE");
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.calls.filter(call => call.command === "chatgpt_plan"))).toEqual([]);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.filter(project => project.format === "visual").length)).toBe(1);
});

test.describe("Phone workspace", () => {
test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 }, contextOptions: { screen: { width: 375, height: 812 } } });
test("375pxでもChatGPTタブとMCP設定の別々の入口を使え、開閉後も依頼を保持する", async ({ page }, info) => {
  await openWorld(page);
  // The phone shows Inspector instead of the Scene toolbar while chatting.
  // Check the retained tab state, then return to Scene before closing it.
  const chatgptTab = page.getByRole("tab", { name: "ChatGPTを表示", exact: true, includeHidden: true });
  const mcpTab = page.getByRole("tab", { name: "MCP接続を表示", exact: true });
  const utility = page.getByRole("contentinfo", { name: "エディターのステータスバー", exact: true });
  const openChatgpt = utility.getByRole("button", { name: "ChatGPTを開く", exact: true });
  const sceneSettings = utility.getByRole("button", { name: "シーン設定を開く", exact: true });
  await expect(chatgptTab).toHaveCount(0);
  await expect(mcpTab).toHaveCount(0);
  await expect(openChatgpt).toBeInViewport();
  await expect(sceneSettings).toBeInViewport();
  await openChatgpt.click();
  await expect(chatgptTab).toHaveAttribute("aria-selected", "true");
  await expect(mcpTab).toHaveCount(0);
  const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  const prompt = panel.getByRole("textbox", { name: "ワールドへの依頼", exact: true });
  await expect(panel).toBeVisible();
  await expect(prompt).toBeVisible();
  await prompt.fill("小さな公園を順番に作ってください");
  await expect(prompt).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const chatMcp = panel.getByRole("button", { name: "MCP接続", exact: true });
  await expect(chatMcp).toBeInViewport();
  await expectMcpWithoutPlan(page);
  await chatMcp.click();
  const mcpPanel = page.getByRole("dialog", { name: "MCP接続", exact: true });
  await expect(mcpPanel).toBeVisible();
  await expect(mcpPanel).toBeInViewport();
  await expect(mcpTab).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "ChatGPTを表示", exact: true, includeHidden: true })).toHaveAttribute("aria-selected", "true");
  await mcpPanel.getByRole("button", { name: "MCP接続を閉じる", exact: true }).click();
  await expect(mcpPanel).toBeHidden();
  await expect(chatgptTab).toHaveAttribute("aria-selected", "true");
  await expect(prompt).toHaveValue("小さな公園を順番に作ってください");
  await expect(chatMcp).toBeFocused();
  await page.screenshot({ path: info.outputPath("phone-chatgpt-mcp-entry.png") });
  await page.getByRole("button", { name: "シーン", exact: true }).click();
  await expect(chatgptTab).toBeVisible();
  await page.getByRole("button", { name: "ChatGPTを閉じる", exact: true }).click();
  await expect(chatgptTab).toHaveCount(0);
  await expect(panel).toBeHidden();
  await expect(page.locator('section[aria-labelledby="scene-view-heading"] canvas').first()).toBeVisible();
  await openChatgpt.click();
  await expect(prompt).toHaveValue("小さな公園を順番に作ってください");

  await page.getByRole("button", { name: "Hierarchy", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
  await page.getByRole("button", { name: "シーン", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(page.locator('section[aria-labelledby="scene-view-heading"] canvas').first()).toBeVisible();
  await chatgptTab.click();
  await expect(panel).toBeVisible();
  await expect(prompt).toHaveValue("小さな公園を順番に作ってください");
  await sceneSettings.click();
  await expect(panel).toBeHidden();
  await expect(page.getByLabel("視野角", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "XRift Studio", exact: true })).toHaveCount(0);
  await utility.getByRole("button", { name: "シーン設定を閉じる", exact: true }).click();
  await page.getByRole("button", { name: "シーン", exact: true }).click();
  await chatgptTab.click();
  await expect(prompt).toHaveValue("小さな公園を順番に作ってください");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.unhandledCommands)).toEqual([]);
});
});

test("生成先を作成している間の元作品の編集を保存し、生成先の保存には混ぜない", async ({ page }) => {
  await openWorld(page);
  await connectFixture(page);
  const sourcePath = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!.path);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptCreateGate = true; });
  try {
    const { source, response } = await generateFresh(page, "広場を順番に作ってください");
    expect(response.ok, JSON.stringify(response)).toBe(true);
    const { generationId } = response.result as { generationId: string };
    await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptCreateWaiting)).toBe(true);
    expect((await call(page, "get_editor_context")).result).toMatchObject({ projectId: source.projectId });
    const entities = (await call(page, "list_entities")).result as { entities: Array<{ id: string; name: string }> };
    const plane = entities.entities.find(entity => entity.name === "Plane")!;
    expect(plane).toBeTruthy();
    const rename = await page.evaluate(async entityId => {
      const load = (path: string) => import(/* @vite-ignore */ path);
      const { callReleaseE2EMcp: call } = await load("/src/release-e2e/mock-tauri.ts");
      const context = (await call("get_editor_context")).result as EditorContext;
      return call("rename_entity", { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision, entityId, name: "生成開始後に編集した床" });
    }, plane.id);
    expect(rename.ok, JSON.stringify(rename)).toBe(true);
    await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptCreateGate = false; });
    await expect.poll(async () => (await generation(page, generationId)).status).toBe("completed");
    const done = await generation(page, generationId);
    expect(await savedEntityNames(page, sourcePath)).toContain("生成開始後に編集した床");
    expect(await savedEntityNames(page, done.path!)).not.toContain("生成開始後に編集した床");
    const saves = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptSavedSteps);
    expect(saves.length).toBeGreaterThanOrEqual(3);
    expect(saves.every(save => save.projectPath === done.path && save.projectId === done.projectId)).toBe(true);
    expect((await call(page, "get_editor_context")).result).toMatchObject({ projectId: done.projectId });
  } finally {
    await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptCreateGate = false; }).catch(() => undefined);
  }
});

test("生成先の作成中に元作品を開き直したら停止し、新しいEditorの未保存編集を保つ", async ({ page }) => {
  await openWorld(page);
  await connectFixture(page);
  const sourcePath = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!.path);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptCreateGate = true; });
  try {
    const { source, response } = await generateFresh(page, "開き直しの保護を確認する広場");
    expect(response.ok, JSON.stringify(response)).toBe(true);
    const { generationId } = response.result as { generationId: string };
    await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptCreateWaiting)).toBe(true);
    await page.getByRole("button", { name: "プロジェクト一覧へ戻る", exact: true }).click();
    await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
    const reopened = await call(page, "open_project", { path: sourcePath });
    expect(reopened.ok, JSON.stringify(reopened)).toBe(true);
    expect((await call(page, "get_editor_context")).result).toMatchObject({ projectId: source.projectId });
    const entities = (await call(page, "list_entities")).result as { entities: Array<{ id: string; name: string }> };
    const plane = entities.entities.find(entity => entity.name === "Plane")!;
    expect(plane).toBeTruthy();
    // Release creation in the same browser turn as the new draft, before its
    // 800 ms autosave. The old bridge must not treat this new Editor as saved.
    const renamed = await page.evaluate(async entityId => {
      const load = (path: string) => import(/* @vite-ignore */ path);
      const { callReleaseE2EMcp: call } = await load("/src/release-e2e/mock-tauri.ts");
      const context = (await call("get_editor_context")).result as EditorContext;
      const result = await call("rename_entity", {
        projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision,
        entityId, name: "開き直したEditorの未保存の床",
      });
      window.__XRIFT_RELEASE_E2E__!.chatgptCreateGate = false;
      return result;
    }, plane.id);
    expect(renamed.ok, JSON.stringify(renamed)).toBe(true);
    await expect.poll(async () => (await generation(page, generationId)).status).toBe("cancelled");
    expect((await generation(page, generationId)).error).toBeUndefined();
    expect((await generation(page, generationId)).progress.completed).toBe(0);
    expect((await call(page, "get_editor_context")).result).toMatchObject({ projectId: source.projectId });
    await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toContainText("開き直したEditorの未保存の床");
    await expect.poll(() => savedEntityNames(page, sourcePath)).toContain("開き直したEditorの未保存の床");
    expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.calls.filter(call => call.command === "chatgpt_login"))).toEqual([]);
    expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.uploadAttempts)).toEqual([]);
  } finally {
    await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptCreateGate = false; }).catch(() => undefined);
  }
});
