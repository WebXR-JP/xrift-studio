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
  if (mode === "plan") {
    // The chat always builds. MCP can still request a confirmation without
    // applying it, so history and approval tests use that explicit boundary.
    const sessionId = await panel(page).getByRole("combobox", { name: "制作チャットの履歴", exact: true }).inputValue();
    const response = await call(page, "generate_chatgpt_world", {
      model: await panel(page).getByRole("combobox", { name: "ワールド制作のモデル", exact: true }).inputValue(),
      prompt, mode, options: { models: true, materials: true, audio: true }, ...(sessionId ? { sessionId } : {}),
    }, true);
    expect(response.ok, JSON.stringify(response)).toBe(true);
  } else {
    await panel(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true }).fill(prompt);
    await panel(page).getByRole("button", { name: "依頼を送信", exact: true }).click();
  }
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

test("複数Entityのドロップを添付表示し、配下を優先した依頼で子Entityを編集する", async ({ page }, info) => {
  await ready(page);
  const root = await call(page, "create_empty_entity", { name: "添付するGroup" }, true);
  const child = await call(page, "create_empty_entity", { name: "Groupの子", parentEntityId: root.result!.entityId }, true);
  const grandchild = await call(page, "create_empty_entity", { name: "Groupの孫", parentEntityId: child.result!.entityId }, true);
  const second = await call(page, "create_empty_entity", { name: "もう一つの対象" }, true);
  for (const result of [root, child, grandchild, second]) expect(result.ok, JSON.stringify(result)).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const before = (await saved(page)).scene;
  const hierarchy = page.getByRole("tree", { name: "シーンのEntity階層" });
  const firstRow = hierarchy.locator('button[data-editor-drag-source="hierarchy-entity"]').filter({ hasText: "添付するGroup" });
  const secondRow = hierarchy.locator('button[data-editor-drag-source="hierarchy-entity"]').filter({ hasText: "もう一つの対象" });
  await firstRow.click();
  await secondRow.click({ modifiers: ["Control"] });
  const input = panel(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true });
  await firstRow.dragTo(input);
  const attachments = panel(page).getByLabel("添付したEntity", { exact: true });
  await expect(attachments.getByText("添付するGroup", { exact: true })).toBeVisible();
  await expect(attachments.getByText("もう一つの対象", { exact: true })).toBeVisible();
  await expect(attachments.getByText("配下を含む4件を優先して参照します", { exact: true })).toBeVisible();
  await expect(input).toHaveValue("");
  await firstRow.dragTo(input);
  await expect(attachments.locator("li")).toHaveCount(2);
  await attachments.getByRole("button", { name: "もう一つの対象の添付を外す", exact: true }).click();
  await expect(attachments.locator("li")).toHaveCount(1);
  // The user's text/plain compatibility payload must attach, never land as JSON.
  const dataTransfer = await page.evaluateHandle(id => { const transfer = new DataTransfer(); transfer.setData("text/plain", JSON.stringify({ type: "xrift-studio/editor-drag", version: 1, data: { "application/x-xrift-visual-editor-entity": id } })); return transfer; }, second.result!.entityId);
  await input.dispatchEvent("drop", { dataTransfer });
  await expect(attachments.locator("li")).toHaveCount(2);
  await expect(input).toHaveValue("");
  expect((await saved(page)).scene).toEqual(before);
  await page.screenshot({ path: info.outputPath("entity-attachments.png") });
  await page.evaluate(childId => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "添付配下を調整", description: "既存の子Entityを編集します", objects: [], edits: [{ entityId: childId, name: "添付配下を編集" }] }); }, child.result!.entityId);
  const id = await submit(page, "添付したGroupの子の名前を変えて");
  const context = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts.at(-1)!);
  expect(context.attachedEntityIds).toEqual([root.result!.entityId, second.result!.entityId]);
  expect(context.entities.slice(0, 4).map(entity => entity.id)).toEqual([root.result!.entityId, second.result!.entityId, child.result!.entityId, grandchild.result!.entityId]);
  expect(context.entities.find(entity => entity.id === child.result!.entityId)?.parentId).toBe(root.result!.entityId);
  const after = (await saved(page)).scene;
  expect(Object.keys(after.entities)).toEqual(Object.keys(before.entities));
  expect(after.entities[child.result!.entityId as string].name).toBe("添付配下を編集");
  expect(after.entities[root.result!.entityId as string]).toEqual(before.entities[root.result!.entityId as string]);
  expect((await job(page, id)).attachedEntities?.map(entity => entity.name)).toEqual(["添付するGroup", "もう一つの対象"]);
  await expect(panel(page).getByText("添付：添付するGroup、もう一つの対象（配下を優先）", { exact: true })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "続ける", exact: true })).toHaveCount(0);
  await expect(panel(page).getByRole("button", { name: "この依頼の変更を戻す", exact: true })).toBeVisible();
  await assertNoExternalActions(page);
});

test("大きいSceneでも添付した階層と選択対象を先に参照し、重複と送信量超過を防ぐ", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const starterPath = "/src/lib/visual-editor/starter-templates.ts", contextPath = "/src/lib/visual-editor/chatgpt-scene-resources.ts";
    const bundle = (await import(/* @vite-ignore */ starterPath)).createStarterVisualProject("world", "blank");
    const template = Object.values(bundle.scene.entities)[0] as any;
    bundle.scene.entities = Object.fromEntries(Array.from({ length: 150 }, (_, index) => [`item-${index}`, { ...structuredClone(template), id: `item-${index}`, name: `Entity ${index}`, parentId: index >= 141 ? `item-${index - 1}` : null }]));
    const { collectChatgptSceneContext } = await import(/* @vite-ignore */ contextPath);
    const context = collectChatgptSceneContext(bundle, "item-0", [], ["item-140", "item-145", "item-140"]);
    return { context, bytes: new TextEncoder().encode(JSON.stringify(context)).byteLength };
  });
  expect(result.context.entities.slice(0, 2).map((entity: any) => entity.id)).toEqual(["item-140", "item-145"]);
  // The selected Entity and attached parents are editing context, so they may
  // precede descendants. Every relevant Entity must precede unrelated ones.
  expect(result.context.entities.slice(0, 11).map((entity: any) => entity.id)).toEqual(expect.arrayContaining(["item-0", ...Array.from({ length: 10 }, (_, index) => `item-${140 + index}`)]));
  expect(result.context.entities[11].id).toBe("item-1");
  expect(result.context.selectedEntityId).toBe("item-0");
  expect(result.context.attachedEntityIds).toEqual(["item-140", "item-145"]);
  expect(new Set(result.context.entities.map((entity: any) => entity.id)).size).toBe(result.context.entities.length);
  expect(result.context.entities.length).toBeLessThanOrEqual(100);
  expect(result.bytes).toBeLessThanOrEqual(14 * 1024);
});

test("送信待ちの依頼ごとに添付を保ち、後の選択や添付変更で入れ替わらない", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = true;
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "添付の確認", description: "対象の状態を確認しました", objects: [] });
  });
  const input = panel(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true });
  const drop = async (id: string) => {
    const dataTransfer = await page.evaluateHandle(id => { const data = new DataTransfer(); data.setData("application/x-xrift-visual-editor-entity", id); return data; }, id);
    await input.dispatchEvent("drop", { dataTransfer });
  };
  try {
    await drop("starter-sun");
    await input.fill("照明を確認して");
    await panel(page).getByRole("button", { name: "依頼を送信", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptPlanWaiting)).toBe(true);
    await drop("starter-floor");
    await input.fill("床を確認して");
    await panel(page).getByRole("button", { name: "依頼を送信", exact: true }).click();
    await expect(panel(page).getByRole("region", { name: "送信待ちの依頼", exact: true }).getByText("添付：Plane", { exact: true })).toBeVisible();
    await page.getByRole("tree", { name: "シーンのEntity階層" }).locator('button[data-editor-drag-source="hierarchy-entity"]').filter({ hasText: "Box" }).click();
    await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = false; });
    await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(2);
    const id = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.at(-1)!.generationId);
    await expect.poll(async () => (await job(page, id)).status).toBe("completed");
    const contexts = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts);
    expect(contexts.map(context => context.attachedEntityIds)).toEqual([["starter-sun"], ["starter-floor"]]);
    expect((await job(page, id)).attachedEntities).toEqual([{ id: "starter-floor", name: "Plane" }]);
  } finally { await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = false; }); }
});

test("添付の下書きはチャットごとに保持し、通常の貼り付けを妨げない", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  await panel(page).getByRole("button", { name: "新しいチャット", exact: true }).click();
  const sessions = panel(page).getByRole("combobox", { name: "制作チャットの履歴" });
  const first = await sessions.inputValue();
  const input = panel(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true });
  await input.evaluate(element => { const data = new DataTransfer(); data.setData("text/plain", JSON.stringify({ type: "xrift-studio/editor-drag", version: 1, data: { "application/x-xrift-visual-editor-entity": "starter-sun" } })); element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data })); });
  await expect(panel(page).getByLabel("添付したEntity", { exact: true }).getByText("Light", { exact: true })).toBeVisible();
  await expect(input).toHaveValue("");
  await input.fill("照明の下書き");
  await panel(page).getByRole("button", { name: "新しいチャット", exact: true }).click();
  await expect(panel(page).getByLabel("添付したEntity", { exact: true })).toHaveCount(0);
  await expect(input).toHaveValue("");
  await sessions.selectOption(first);
  await expect(panel(page).getByLabel("添付したEntity", { exact: true }).getByText("Light", { exact: true })).toBeVisible();
  await expect(input).toHaveValue("照明の下書き");
  expect(await input.evaluate(element => { const data = new DataTransfer(); data.setData("text/plain", "通常の文章"); return element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data })); })).toBe(true);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(0);
});

test("出力の全体コピーは案内・操作名・変更項目を含み、文字選択もできる", async ({ page }, info) => {
  await ready(page);
  await plan(page, "コピーするPlan", "コピーするSphere", { description: "コピーするPlanの手順を確認します。次の依頼ではベンチを追加できます", hasMore: false });
  await submit(page, "出力をまとめてコピーするための依頼");
  const output = panel(page).getByRole("region", { name: "コピーできる制作出力", exact: true });
  await expect(output.getByRole("button", { name: "続ける", exact: true })).toHaveCount(0);
  await expect(output.getByRole("button", { name: "この依頼の変更を戻す", exact: true })).toBeVisible();
  const before = await output.locator("details").evaluateAll(elements => elements.map(element => (element as HTMLDetailsElement).open));
  expect(before.every(open => !open)).toBe(true);
  await panel(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true }).fill("まだ送信していない文章");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { document.body.dataset.outputCopy = text; } } });
  });
  await panel(page).getByRole("button", { name: "出力をコピー", exact: true }).click();
  await expect(panel(page).getByText("出力をコピーしました", { exact: true })).toBeVisible();
  const copied = await page.evaluate(() => document.body.dataset.outputCopy!);
  for (const text of ["出力をまとめてコピーするための依頼", "コピーするPlan", "コピーするPlanの手順を確認します", "次の依頼ではベンチを追加できます", "コピーするSphere", "作業の記録", "変更を戻す", "保存済み 1 / 1"]) expect(copied).toContain(text);
  expect(copied).not.toContain("まだ送信していない文章");
  expect(await output.locator("details").evaluateAll(elements => elements.map(element => (element as HTMLDetailsElement).open))).toEqual(before);
  // Touch selection is disabled on the editor shell; the output and its
  // button labels must explicitly opt back into native text selection.
  await page.evaluate(() => document.querySelector(".visual-editor-shell")?.setAttribute("data-touch", "true"));
  expect(await output.evaluate(element => getComputedStyle(element).userSelect)).toBe("text");
  expect(await output.getByRole("button", { name: "この依頼の変更を戻す", exact: true }).evaluate(element => getComputedStyle(element).userSelect)).toBe("text");
  const selectedEntitiesBefore = await page.getByRole("tree", { name: "シーンのEntity階層" }).locator('[aria-selected="true"]').count();
  await output.focus();
  await page.keyboard.press("Control+a");
  const selected = await page.evaluate(() => window.getSelection()?.toString());
  expect(selected).toContain("変更を戻す");
  expect(selected).not.toContain("まだ送信していない文章");
  expect(await page.getByRole("tree", { name: "シーンのEntity階層" }).locator('[aria-selected="true"]').count()).toBe(selectedEntitiesBefore);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(1);
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("clipboard unavailable"); } } });
  });
  await panel(page).getByRole("button", { name: "出力をコピー", exact: true }).click();
  await expect(panel(page).getByText("コピーできませんでした。出力の文字を選択してコピーしてください。", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("copyable-output.png") });
  await assertNoExternalActions(page);
});

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
  await expect(panel(page).getByRole("button", { name: "変更を反映", exact: true })).toBeEnabled();
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
  await panel(page).getByRole("button", { name: "変更を破棄", exact: true }).click();
  await expect.poll(async () => (await job(page, secondId)).status).toBe("cancelled");
  await panel(page).locator('summary[aria-label="チャットの操作"]').click();
  await panel(page).getByRole("button", { name: "このチャットの履歴を削除", exact: true }).click();
  await expect(panel(page).getByRole("combobox", { name: "制作チャットの履歴" }).locator("option")).toHaveCount(1);
  expect((await job(page, firstId)).status).toBe("completed");
  expect((await saved(page)).scene).toEqual(beforePlan);
  await assertNoExternalActions(page);
});

test("次の依頼は同じ会話の結果をnativeへ送り、保存済みEntityを繰り返さず追加する", async ({ page }, info) => {
  await ready(page);
  // A completed first request may suggest a separate enhancement. hasMore is
  // reserved for unfinished work that the harness continues automatically.
  await plan(page, "最初の制作", "保存済みSphere", { description: "球を追加しました。次の依頼では通路へBoxを追加できます", hasMore: false });
  const firstId = await submit(page, "広場に球を一つ追加する");
  const firstScene = (await saved(page)).scene;
  const first = Object.values(firstScene.entities).find(entity => entity.name === "保存済みSphere")!;
  expect(first).toBeTruthy();
  await plan(page, "続きの制作", "続きを示すSphere", { hasMore: false });
  const count = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length);
  await panel(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true }).fill("続きとして、もう一つ球を追加してください");
  await panel(page).getByRole("button", { name: "依頼を送信", exact: true }).click();
  await expect.poll(async () => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(count + 1);
  const nextId = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.at(-1)!.generationId);
  await expect.poll(async () => (await job(page, nextId)).status).toBe("completed");
  const context = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts.at(-1)!);
  expect(context.conversation).toHaveLength(1);
  expect(context.conversation![0].prompt).toBe("広場に球を一つ追加する");
  expect(context.conversation![0].result).toContain("保存済みSphere");
  expect(context.conversation![0].result).toContain("次の依頼では通路へBoxを追加できます");
  const after = (await saved(page)).scene;
  expect(after.entities[first.id]).toEqual(first);
  expect(Object.values(after.entities).filter(entity => entity.name === "保存済みSphere")).toHaveLength(1);
  expect(Object.values(after.entities).filter(entity => entity.name === "続きを示すSphere")).toHaveLength(1);
  expect((await job(page, nextId)).sessionId).toBe((await job(page, firstId)).sessionId);
  await expect(panel(page).getByLabel("制作の会話と結果", { exact: true }).getByText("広場に球を一つ追加する", { exact: true })).toBeVisible();
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
  const legacySessionId = await panel(page).getByRole("combobox", { name: "制作チャットの履歴" }).inputValue();
  await panel(page).getByRole("button", { name: "新しいチャット", exact: true }).click();
  await plan(page, "保存された相談Plan", "まだ反映しないSphere");
  await submit(page, "再起動後も相談Planを読みたい", "plan");
  const selectedId = await panel(page).getByRole("combobox", { name: "制作チャットの履歴" }).inputValue();
  await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).sessions.length, historyKey)).toBe(2);
  const snapshot = await saved(page);
  await preserveNativeFixtureAfterReload(page, snapshot);
  await page.evaluate(({ key, sessionId }) => {
    const history = JSON.parse(localStorage.getItem(key)!);
    const turn = history.sessions.find((session: { id: string }) => session.id === sessionId).turns[0];
    turn.progress.message = "Scene設定を調整して保存しました";
    turn.plan.objects = [{ name: "Scene設定を調整", shape: "調整", detail: 'fog: {"enabled":true,"color":"#dce8ed","near":35,"far":110}' }];
    turn.progress.recentEvents = [
      { sequence: 1, phase: "placing", message: "Scene設定を調整" },
      { sequence: 2, phase: "placing", message: "Scene設定を調整して保存しました", saved: true },
      { sequence: 3, phase: "placing", message: "2/2：Scene設定を調整しています" },
      { sequence: 4, phase: "placing", message: "Scene設定を調整して保存しました", saved: true },
      { sequence: 5, phase: "saving", message: "保存しました：Fogの開始距離：10 → 30", saved: true },
    ];
    localStorage.setItem(key, JSON.stringify(history));
  }, { key: historyKey, sessionId: legacySessionId });
  await page.reload();
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "open_project", { path: snapshot.project.path })).ok).toBe(true);
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await expect(panel(page).getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("fixture-model");
  await expect(panel(page).getByRole("combobox", { name: "制作チャットの履歴" }).locator("option")).toHaveCount(2);
  await panel(page).getByRole("combobox", { name: "制作チャットの履歴" }).selectOption(legacySessionId);
  const oldLog = panel(page).getByRole("region", { name: "作業の記録", exact: true });
  await expect(oldLog.getByRole("listitem")).toHaveCount(2);
  await expect(oldLog).toContainText("保存2件");
  await expect(oldLog).toContainText("変更項目の詳細記録なし");
  await expect(oldLog).toContainText("保存しました：Fogの開始距離：10 → 30");
  const oldSettings = panel(page).getByLabel("設定項目", { exact: true });
  await expect(oldSettings).toContainText("Fogの開始距離");
  await expect(oldSettings).toContainText("#dce8ed");
  await expect(oldSettings).not.toContainText("変更前：");
  await expect(panel(page)).not.toContainText('fog: {');
  await expect(panel(page).getByLabel("制作の会話と結果", { exact: true })).not.toContainText("Scene設定を調整");
  await panel(page).getByRole("combobox", { name: "制作チャットの履歴" }).selectOption(selectedId);
  await expect(panel(page).getByLabel("制作の会話と結果", { exact: true }).getByText("再起動後も相談Planを読みたい", { exact: true })).toBeVisible();
  await expect(panel(page).getByText("Plan：保存された相談Plan", { exact: true })).toHaveCount(0);
  await expect(panel(page).getByText("まだ反映しないSphere", { exact: true })).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "変更を反映", exact: true })).toHaveCount(0);
  expect((await saved(page)).scene).toEqual(snapshot.scene);
  await plan(page, "再起動後の続き", "再起動後のSphere");
  await panel(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true }).fill("未完了の作業を進めてください");
  await panel(page).getByRole("button", { name: "依頼を送信", exact: true }).click();
  await panel(page).getByRole("button", { name: "再開", exact: true }).click();
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
  await panel(page).getByRole("button", { name: "この依頼の変更を戻す", exact: true }).click();
  await expect.poll(async () => (await job(page, id)).revertedAt).toBeTruthy();
  await expect.poll(async () => (await saved(page)).scene).toEqual(before.scene);
  await expect(panel(page).getByRole("button", { name: "この依頼の変更を戻す", exact: true })).toHaveCount(0);
  await plan(page, "本人編集の保護", "保護対象Sphere");
  const second = await submit(page, "もう一度変更を追加");
  const floor = Object.values(before.scene.entities).find(entity => entity.name === "Plane")!;
  const renamed = await call(page, "rename_entity", { entityId: floor.id, name: "本人が変更したPlane" }, true);
  expect(renamed.ok, JSON.stringify(renamed)).toBe(true);
  await expect.poll(async () => (await saved(page)).scene.entities[floor.id].name).toBe("本人が変更したPlane");
  const edited = (await saved(page)).scene;
  await panel(page).getByRole("button", { name: "この依頼の変更を戻す", exact: true }).click();
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
  await panel(page).getByRole("button", { name: "変更を反映", exact: true }).click();
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
