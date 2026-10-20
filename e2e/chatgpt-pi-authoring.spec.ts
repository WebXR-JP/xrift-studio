import { expect, test, type Page } from "@playwright/test";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";
async function call(page: Page, tool: string, args: Record<string, unknown> = {}): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    return (await import(/* @vite-ignore */ path)).callReleaseE2EMcp(tool, args);
  }, { tool, args });
}
async function scopedCall(page: Page, tool: string, args: Record<string, unknown> = {}) {
  return page.evaluate(async ({ tool, args }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: call } = await import(/* @vite-ignore */ path);
    const context = (await call("get_editor_context")).result!;
    return call(tool, { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision, ...args });
  }, { tool, args });
}
async function ready(page: Page) {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: "pi-isolated-world", kind: "world", templateId: "blank" })).ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null }; });
}
async function generate(page: Page, mode = "build", target = "current") {
  const response = await scopedCall(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "屋根のある家を作ってください", mode, target, options: { models: true, materials: true, audio: false } });
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result!.generationId as string;
}
async function job(page: Page, generationId: string) { return (await call(page, "get_chatgpt_generation", { generationId })).result! as unknown as ChatgptGeneration; }

test("Pi transport edits actual Scene through formal R3F tools, saves it and records a revert checkpoint", async ({ page }) => {
  await ready(page);
  const id = await generate(page);
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  const result = await job(page, id);
  expect(result.progress.completed).toBe(1);
  expect(result.revertAvailable).toBe(true);
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" }).getByText("Piの家", { exact: true }).first()).toBeVisible();
  expect((await call(page, "get_project_health")).result?.health).toMatchObject({ status: "ready" });
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const reverted = await scopedCall(page, "revert_chatgpt_generation", { generationId: id });
  expect(reverted.ok, JSON.stringify(reverted)).toBe(true);
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" }).getByText("Piの家", { exact: true })).toHaveCount(0);
});

test("Plan waits for apply and then executes Pi against the approved Scene", async ({ page }) => {
  await ready(page);
  const before = (await call(page, "get_editor_context")).result!.revision;
  const id = await generate(page, "plan");
  await expect.poll(async () => (await job(page, id)).status).toBe("planned");
  expect((await call(page, "get_editor_context")).result!.revision).toBe(before);
  expect((await scopedCall(page, "apply_chatgpt_plan", { generationId: id })).ok).toBe(true);
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
});

test("manual edits invalidate an approved plan without replacing the user's work", async ({ page }) => {
  await ready(page);
  const id = await generate(page, "plan");
  await expect.poll(async () => (await job(page, id)).status).toBe("planned");
  const manual = await scopedCall(page, "create_empty_entity", { name: "手動で追加" });
  expect(manual.ok).toBe(true);
  const applied = await scopedCall(page, "apply_chatgpt_plan", { generationId: id });
  expect(applied.ok).toBe(false);
  expect(applied.error?.message).toMatch(/Scene.*変わり|revision/);
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" }).getByText("手動で追加", { exact: true })).toBeVisible();
});

test("stop cancels pending Pi work and keeps the original Scene", async ({ page }) => {
  await ready(page);
  const before = (await call(page, "list_entities")).result!.entities;
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.piGate = true; });
  const id = await generate(page);
  await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.piWaiting)).toBe(true);
  expect((await call(page, "cancel_chatgpt_generation", { generationId: id })).ok).toBe(true);
  await expect.poll(async () => (await job(page, id)).status).toBe("cancelled");
  expect((await call(page, "list_entities")).result!.entities).toEqual(before);
});

test("native failure stays visible and never reports completed", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.piError = "接続を確認してください"; });
  const id = await generate(page);
  await expect.poll(async () => (await job(page, id)).status).toBe("failed");
  expect((await job(page, id)).error).toContain("接続を確認してください");
});

test("new-world authoring saves the source and edits a separate project", async ({ page }) => {
  await ready(page);
  const before = (await call(page, "get_editor_context")).result!;
  const id = await generate(page, "build", "new");
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  const after = (await call(page, "get_editor_context")).result!;
  expect(after.projectId).not.toBe(before.projectId);
  expect((await job(page, id)).sourceProjectId).toBe(before.projectId);
});

test("Pi history tree branches a conversation without reverting the actual Scene", async ({ page }) => {
  await ready(page);
  const id = await generate(page);
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  const before = (await call(page, "list_entities")).result!.entities;
  await page.getByText("会話の流れ", { exact: true }).click();
  await page.getByRole("button", { name: "ここから別の案を始める" }).click();
  await expect.poll(async () => ((await call(page, "list_chatgpt_sessions")).result!.sessions as unknown[]).length).toBe(2);
  const sessions = (await call(page, "list_chatgpt_sessions")).result!;
  const branch = (sessions.sessions as { id: string; piBranch?: unknown }[]).find(item => item.id === sessions.activeSessionId)!;
  expect(branch.piBranch).toBeTruthy();
  expect((await call(page, "list_entities")).result!.entities).toEqual(before);
});

test("Pi extension settings reject unpinned sources and persist a registered version", async ({ page }) => {
  await ready(page);
  await call(page, "open_chatgpt_panel");
  await page.getByText("追加機能の設定", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "制作・配置・確認を自動分担する" })).toHaveCount(0);
  const input = page.getByRole("textbox", { name: "制作に使う追加機能" });
  await input.fill("npm:example@latest");
  await page.getByRole("button", { name: "追加機能の設定を保存" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "npm:package@1.2.3" })).toBeVisible();
  await input.fill("npm:example@1.2.3");
  await page.getByRole("button", { name: "追加機能の設定を保存" }).click();
  await expect(page.getByText("登録済み：1件", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("xrift-studio:pi-settings:v1")!).extensions)).toEqual(["npm:example@1.2.3"]);
});

test("internal calls without native scope cannot read or edit the open Scene", async ({ page }) => {
  await ready(page);
  const responses = await page.evaluate(async () => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: call } = await import(/* @vite-ignore */ path);
    return Promise.all([call("get_editor_context", {}, "missing-scope"), call("create_empty_entity", { name: "拒否するEntity" }, "missing-scope"), call("get_modeling_tools", {}, "missing-scope")]);
  });
  for (const response of responses) expect(response).toMatchObject({ ok: false, error: { code: "SCOPE_CHANGED" } });
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" }).getByText("拒否するEntity", { exact: true })).toHaveCount(0);
});
