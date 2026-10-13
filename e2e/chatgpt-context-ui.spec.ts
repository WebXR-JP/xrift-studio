import { expect, test, type Page } from "@playwright/test";
import type { VisualProjectFiles, XriftMcpEditorResponse } from "../src/lib/tauri";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";

type EditorContext = { projectId: string; sceneId: string; revision: number; saveStatus: string };
const options = { models: false, materials: false, audio: false };
declare global {
  interface Window {
    __XRIFT_CHATGPT_BRIDGE_GATE__?: { waiting: boolean; release: (() => void) | null };
  }
}

async function call(page: Page, tool: string, args: Record<string, unknown> = {}): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    return (await import(/* @vite-ignore */ path)).callReleaseE2EMcp(tool, args);
  }, { tool, args });
}

async function openFixture(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  const created = await call(page, "create_project", { name: "chatgpt-context-isolated-fixture", kind: "world", templateId: "blank" });
  expect(created.ok, JSON.stringify(created)).toBe(true);
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
  await expect.poll(async () => ((await call(page, "get_editor_context")).result as EditorContext).saveStatus).toBe("saved");
  // Only the in-memory browser transport supplies an account and model. This
  // page does not invoke login, logout, native storage, or a real model request.
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = {
    signedIn: true, accountId: "context-fixture-account", email: "fixture@example.invalid",
    planUsageEnabled: true, connecting: false, restoring: false, error: null,
  }; });
}

async function generateFresh(page: Page, prompt: string, mode: "build" | "plan" = "build", target: "current" | "new" = "current") {
  return page.evaluate(async ({ prompt, mode, target, options }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: call } = await import(/* @vite-ignore */ path);
    const context = await call("get_editor_context");
    if (!context.ok) throw new Error(JSON.stringify(context));
    const source = context.result as EditorContext;
    const response = await call("generate_chatgpt_world", {
      projectId: source.projectId, sceneId: source.sceneId, expectedRevision: source.revision,
      model: "fixture-model", prompt, options, mode, target,
    });
    return { source, response };
  }, { prompt, mode, target, options });
}

async function generation(page: Page, generationId: string): Promise<ChatgptGeneration> {
  const response = await call(page, "get_chatgpt_generation", { generationId });
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result as ChatgptGeneration;
}

async function saved(page: Page) {
  return page.evaluate(async () => {
    const path = window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!.path;
    const modulePath = "/src/lib/tauri.ts";
    const files = await (await import(/* @vite-ignore */ modulePath)).tauri.readVisualProject(path) as VisualProjectFiles;
    return { path, files };
  });
}

test("Scene最大化中もfooterとMCPからチャットを開き、入力と制作停止に到達できる", async ({ page }) => {
  await openFixture(page);
  const before = await saved(page);
  const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  const footer = page.getByRole("contentinfo", { name: "エディターのステータスバー", exact: true });

  for (const entry of ["footer", "MCP"] as const) {
    await page.getByRole("button", { name: "このビューだけを広げる", exact: true }).click();
    await expect(page.getByRole("button", { name: "パネルを戻す", exact: true })).toHaveAttribute("aria-pressed", "true");
    if (entry === "footer") await footer.getByRole("button", { name: "ChatGPTを開く", exact: true }).click();
    else expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);

    await expect(panel).toBeVisible();
    await expect(page.getByRole("button", { name: "このビューだけを広げる", exact: true })).toHaveAttribute("aria-pressed", "false");
    const input = panel.getByRole("textbox", { name: "ワールドへの依頼", exact: true });
    await expect(input).toBeEnabled();
    await input.fill(`${entry}から入力できます`);
    await expect(input).toHaveValue(`${entry}から入力できます`);
    await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = true; });
    try {
      const { response } = await generateFresh(page, `${entry}から停止する依頼`);
      expect(response.ok, JSON.stringify(response)).toBe(true);
      const { generationId } = response.result as { generationId: string };
      await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptPlanWaiting)).toBe(true);
      const stop = panel.getByRole("button", { name: "制作を停止", exact: true });
      await expect(stop).toBeVisible();
      await expect(stop).toBeEnabled();
      await stop.click();
      await expect.poll(async () => (await generation(page, generationId)).status).toBe("cancelled");
      expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptCancelledGenerations)).toContain(generationId);
      await expect(input).toBeEnabled();
    } finally {
      await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = false; }).catch(() => undefined);
    }
    await page.getByRole("button", { name: "ChatGPTを閉じる", exact: true }).click();
    await expect(panel).toBeHidden();
  }
  expect((await saved(page)).files.sceneDocuments).toEqual(before.files.sceneDocuments);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.uploadAttempts)).toEqual([]);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.unhandledCommands)).toEqual([]);
});

test("新Worldのbridge登録待ちに別作品を開いても、その作品へPlanを適用しない", async ({ page }) => {
  await openFixture(page);
  const source = await saved(page);
  const created = await call(page, "create_project", { name: "chatgpt-context-other-fixture", kind: "world", templateId: "blank" });
  expect(created.ok, JSON.stringify(created)).toBe(true);
  const other = await page.evaluate(async () => {
    const path = window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.name === "chatgpt-context-other-fixture")!.path;
    const modulePath = "/src/lib/tauri.ts";
    const files = await (await import(/* @vite-ignore */ modulePath)).tauri.readVisualProject(path) as VisualProjectFiles;
    return { path, files };
  });
  expect((await call(page, "open_project", { path: source.path })).ok).toBe(true);
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();

  await page.evaluate(async () => {
    const modulePath = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ modulePath);
    const subscribe = tauri.onXriftMcpEditorRequest.bind(tauri);
    const gate = { waiting: false, release: null as (() => void) | null };
    window.__XRIFT_CHATGPT_BRIDGE_GATE__ = gate;
    let armed = true;
    // The next Editor's native listener is installed normally, but its bridge
    // registration waits. Later Editors keep normal subscription behavior.
    tauri.onXriftMcpEditorRequest = async (handler: Parameters<typeof subscribe>[0]) => {
      const dispose = await subscribe(handler);
      if (armed) {
        armed = false; gate.waiting = true;
        await new Promise<void>(resolve => { gate.release = resolve; });
        gate.waiting = false;
      }
      return dispose;
    };
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({
      title: "新World限定Plan", description: "待機中の対象以外には追加しない",
      objects: [{ name: "誤適用を防ぐSphere", shape: "sphere", position: [1, 1, 1], scale: [1, 1, 1] }],
    });
  });
  try {
    const { source: context, response } = await generateFresh(page, "新しい検証用Worldだけへの依頼", "build", "new");
    expect(response.ok, JSON.stringify(response)).toBe(true);
    const { generationId } = response.result as { generationId: string };
    await expect.poll(() => page.evaluate(() => window.__XRIFT_CHATGPT_BRIDGE_GATE__!.waiting)).toBe(true);
    const waiting = await generation(page, generationId);
    expect(waiting.status).toBe("running");
    expect(waiting.projectId).toBeTruthy();
    expect(waiting.projectId).not.toBe(context.projectId);
    expect(waiting.path).not.toBe(source.path);
    expect(waiting.path).not.toBe(other.path);

    // The generation is background work, so the ordinary MCP open operation
    // can switch projects while the new World's bridge is still pending.
    const opened = await call(page, "open_project", { path: other.path });
    expect(opened.ok, JSON.stringify(opened)).toBe(true);
    await expect.poll(async () => (await generation(page, generationId)).status).toBe("failed");
    const stopped = await generation(page, generationId);
    expect(stopped.error).toMatch(/作品|Scene|プロジェクト/);
    expect(stopped.progress.completed).toBe(0);
    expect((await call(page, "get_editor_context")).result).toMatchObject({ projectId: JSON.parse(other.files.projectJson).projectId });
    const documents = await page.evaluate(async paths => {
      const modulePath = "/src/lib/tauri.ts";
      const { tauri } = await import(/* @vite-ignore */ modulePath);
      return Promise.all(paths.map(async path => ({ path, files: await tauri.readVisualProject(path) as VisualProjectFiles })));
    }, [source.path, other.path, waiting.path!]);
    expect(documents[0].files.sceneDocuments).toEqual(source.files.sceneDocuments);
    expect(documents[1].files.sceneDocuments).toEqual(other.files.sceneDocuments);
    for (const document of documents) {
      const names = document.files.sceneDocuments.flatMap(file => Object.values(JSON.parse(file.content).entities as Record<string, { name: string }>).map(entity => entity.name));
      expect(names).not.toContain("誤適用を防ぐSphere");
    }
    expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.uploadAttempts)).toEqual([]);
    expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.unhandledCommands)).toEqual([]);
  } finally {
    await page.evaluate(() => { window.__XRIFT_CHATGPT_BRIDGE_GATE__?.release?.(); }).catch(() => undefined);
  }
});

test("同じprojectの別Sceneでは旧Planを自動表示せず、明示open後も表示と反映を拒否する", async ({ page }) => {
  await openFixture(page);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({
    title: "Scene A専用Plan", description: "Scene Aにだけ追加する検証用Plan",
    objects: [{ name: "Scene Aの球", shape: "sphere", position: [1, 1, 1], scale: [1, 1, 1] }],
  }); });
  const { source, response } = await generateFresh(page, "Scene Aだけの依頼", "plan");
  expect(response.ok, JSON.stringify(response)).toBe(true);
  const { generationId } = response.result as { generationId: string };
  await expect.poll(async () => (await generation(page, generationId)).status).toBe("planned");
  const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  await expect(panel.getByRole("button", { name: "Planを反映", exact: true })).toBeVisible();
  await expect(panel).toContainText("Scene A専用Plan");
  const before = await saved(page);
  await page.getByRole("button", { name: "プロジェクト一覧へ戻る", exact: true }).click();

  // Replace the Scene ID only in this test's in-memory saved documents. Keep
  // the project ID to exercise the distinction the UI previously missed.
  const changed = await page.evaluate(async ({ path, files }) => {
    const modulePath = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ modulePath);
    const project = JSON.parse(files.projectJson);
    const scene = JSON.parse(files.sceneDocuments[0].content);
    const sceneId = `scene-${crypto.randomUUID()}`;
    scene.sceneId = sceneId;
    project.scenePaths = { [sceneId]: files.sceneDocuments[0].relativePath };
    project.entrySceneId = sceneId;
    const documents = { ...files, projectJson: JSON.stringify(project), sceneDocuments: [{ ...files.sceneDocuments[0], content: JSON.stringify(scene) }] };
    await tauri.saveVisualProject(path, documents);
    return { sceneId, sceneDocuments: documents.sceneDocuments };
  }, before);
  expect((await call(page, "open_project", { path: before.path })).ok).toBe(true);
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
  expect((await call(page, "get_editor_context")).result).toMatchObject({ projectId: source.projectId, sceneId: changed.sceneId });
  await expect(page.getByRole("tab", { name: "ChatGPTを表示", exact: true })).toHaveCount(0);
  await expect(panel).toHaveCount(0);

  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await expect(panel).toBeVisible();
  await expect(panel).not.toContainText("Scene A専用Plan");
  await expect(panel).not.toContainText("Scene Aだけの依頼");
  await expect(panel.getByRole("button", { name: "Planを反映", exact: true })).toHaveCount(0);
  await expect(panel.getByRole("textbox", { name: "ワールドへの依頼", exact: true })).toBeEnabled();
  const rejected = await page.evaluate(async generationId => {
    const modulePath = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: call } = await import(/* @vite-ignore */ modulePath);
    const context = (await call("get_editor_context")).result as EditorContext;
    return call("apply_chatgpt_plan", { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision, generationId });
  }, generationId);
  expect(rejected.ok, JSON.stringify(rejected)).toBe(false);
  expect(rejected.error?.code).toBe("STALE_REVISION");
  expect((await generation(page, generationId)).status).toBe("planned");
  expect((await saved(page)).files.sceneDocuments).toEqual(changed.sceneDocuments);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.uploadAttempts)).toEqual([]);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.unhandledCommands)).toEqual([]);
});
