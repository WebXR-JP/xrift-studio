import { expect, test, type Page } from "@playwright/test";
import type { VisualProjectFiles, XriftMcpEditorResponse } from "../src/lib/tauri";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";

type EditorContext = { projectId: string; sceneId: string; revision: number; saveStatus: string };
const options = { models: false, materials: false, audio: false };

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

async function generateFresh(page: Page, prompt: string, mode: "build" | "plan" = "build") {
  return page.evaluate(async ({ prompt, mode, options }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: call } = await import(/* @vite-ignore */ path);
    const context = await call("get_editor_context");
    if (!context.ok) throw new Error(JSON.stringify(context));
    const source = context.result as EditorContext;
    const response = await call("generate_chatgpt_world", {
      projectId: source.projectId, sceneId: source.sceneId, expectedRevision: source.revision,
      model: "fixture-model", prompt, options, mode, target: "current",
    });
    return { source, response };
  }, { prompt, mode, options });
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
