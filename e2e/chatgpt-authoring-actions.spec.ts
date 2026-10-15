import { expect, test, type Page } from "@playwright/test";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}
async function ready(page: Page) {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: "authoring-actions-isolated", kind: "world", templateId: "blank" })).ok).toBe(true);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null }; });
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
}
async function scene(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/lib/tauri.ts";
    const project = window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!;
    return JSON.parse((await (await import(/* @vite-ignore */ path)).tauri.readVisualProject(project.path)).sceneDocuments[0].content);
  });
}
async function setPlan(page: Page, operations: unknown[]) { await page.evaluate(operations => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "公式Componentと削除", description: "指定した対象を編集します", objects: [], operations }); }, operations); }
async function generate(page: Page, mode = "build", attachedEntityIds?: string[]) {
  const response = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "公式Componentを設定し、指定した不要なEntityを削除して", mode, ...(attachedEntityIds ? { attachedEntityIds } : {}) }, true);
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result!.generationId as string;
}
async function job(page: Page, id: string) { return (await call(page, "get_chatgpt_generation", { generationId: id })).result as ChatgptGeneration; }
const panel = (page: Page) => page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });

test("公式定義を送信量内で保持し、未対応の設定はSceneへ反映しない", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const starterPath = "/src/lib/visual-editor/starter-templates.ts", resourcePath = "/src/lib/visual-editor/chatgpt-scene-resources.ts", generationPath = "/src/lib/visual-editor/chatgpt-generation.ts", registryPath = "/src/lib/visual-editor/component-registry.ts";
    const bundle = (await import(/* @vite-ignore */ starterPath)).createStarterVisualProject("world", "blank");
    const registry = await import(/* @vite-ignore */ registryPath);
    const resources = (await import(/* @vite-ignore */ resourcePath)).collectChatgptSceneResources(bundle, Object.keys(bundle.scene.entities), []);
    const before = JSON.stringify(bundle);
    let error = "";
    try { await (await import(/* @vite-ignore */ generationPath)).applyChatgptOperation(bundle, { kind: "component-add", definitionId: "xrift.mirror", propertiesJson: '{"onClick":"unsupported callback"}' }, new Map(), resources); }
    catch (failure) { error = String(failure); }
    return { count: resources.componentDefinitions.filter((definition: any) => definition.id.startsWith("xrift.")).length, expected: registry.listXriftComponentDefinitions("world").length, bytes: new TextEncoder().encode(JSON.stringify(resources)).byteLength, tagFields: resources.componentDefinitions.find((def: any) => def.id === "xrift.tag-board").fields, unchanged: before === JSON.stringify(bundle), error };
  });
  expect(result.count).toBe(result.expected);
  expect(result.bytes).toBeLessThanOrEqual(31 * 1024);
  expect(result.tagFields.find((field: any) => field.name === "tags")).toHaveProperty("defaultValue");
  expect(result.error).toContain("onClick");
  expect(result.unchanged).toBe(true);
});

test("公式MirrorとScreenShareDisplayを追加・設定・保存し、設定変更を戻せる", async ({ page }, info) => {
  await ready(page);
  await setPlan(page, [
    { kind: "component-add", definitionId: "xrift.mirror", name: "AIが追加したMirror", position: [0, 1, 0], propertiesJson: JSON.stringify({ size: [3, 2], reflectionInterval: 3 }) },
    { kind: "component-add", definitionId: "xrift.screen-share-display", name: "AIが追加したScreen", position: [2, 1, 0], propertiesJson: JSON.stringify({ id: "fixture-screen", width: 5 }) },
  ]);
  const first = await generate(page);
  await expect.poll(async () => (await job(page, first)).status).toBe("completed");
  const added = await scene(page);
  const mirror = Object.values(added.entities).find((entity: any) => entity.name === "AIが追加したMirror") as any;
  const screen = Object.values(added.entities).find((entity: any) => entity.name === "AIが追加したScreen") as any;
  const mirrorComponent = mirror.components.find((component: any) => component.type === "xrift-component");
  const screenComponent = screen.components.find((component: any) => component.type === "xrift-component");
  expect(mirrorComponent).toMatchObject({ schemaId: "xrift.mirror", properties: { size: [3, 2], reflectionInterval: 3 } });
  expect(screenComponent).toMatchObject({ schemaId: "xrift.screen-share-display", properties: { id: "fixture-screen", width: 5 } });
  await setPlan(page, [{ kind: "component-update", entityId: mirror.id, componentId: mirrorComponent.id, propertiesJson: JSON.stringify({ size: [4, 3] }) }]);
  const second = await generate(page);
  await expect.poll(async () => (await job(page, second)).status).toBe("completed");
  expect((await scene(page)).entities[mirror.id].components.find((component: any) => component.id === mirrorComponent.id).properties).toMatchObject({ size: [4, 3], reflectionInterval: 3 });
  expect((await call(page, "revert_chatgpt_generation", { generationId: second }, true)).ok).toBe(true);
  expect((await scene(page)).entities[mirror.id]).toEqual(added.entities[mirror.id]);
  await page.screenshot({ path: info.outputPath("official-components.png") });
});

test("削除Planは配下の手動変更を保って再確認し、削除後も配下を復元できる", async ({ page }) => {
  await ready(page);
  const root = await call(page, "create_empty_entity", { name: "削除対象Group" }, true);
  const child = await call(page, "create_empty_entity", { name: "子Entity", parentEntityId: root.result!.entityId }, true);
  const grandchild = await call(page, "create_empty_entity", { name: "孫Entity", parentEntityId: child.result!.entityId }, true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const before = await scene(page);
  await setPlan(page, [{ kind: "entity-delete", entityId: root.result!.entityId }]);
  const id = await generate(page, "plan");
  await expect.poll(async () => (await job(page, id)).status).toBe("planned");
  expect((await job(page, id)).plan!.objects[0]).toMatchObject({ shape: "削除", detail: expect.stringContaining("合計3件") });
  expect(await scene(page)).toEqual(before);
  expect((await call(page, "rename_entity", { entityId: grandchild.result!.entityId, name: "本人が編集した孫" }, true)).ok).toBe(true);
  await expect.poll(async () => (await scene(page)).entities[grandchild.result!.entityId as string].name).toBe("本人が編集した孫");
  expect((await call(page, "apply_chatgpt_plan", { generationId: id }, true)).ok).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(2);
  await expect.poll(async () => (await job(page, id)).status).toBe("planned");
  expect((await scene(page)).entities[grandchild.result!.entityId as string].name).toBe("本人が編集した孫");
  expect((await call(page, "apply_chatgpt_plan", { generationId: id }, true)).ok).toBe(true);
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  const deleted = await scene(page);
  for (const entity of [root, child, grandchild]) expect(deleted.entities[entity.result!.entityId as string]).toBeUndefined();
  expect(deleted.entities["starter-floor"]).toEqual(before.entities["starter-floor"]);
  expect((await call(page, "revert_chatgpt_generation", { generationId: id }, true)).ok).toBe(true);
  const restored = await scene(page);
  expect(restored.entities[root.result!.entityId as string]).toEqual(before.entities[root.result!.entityId as string]);
  expect(restored.entities[grandchild.result!.entityId as string].name).toBe("本人が編集した孫");
});

for (const mode of ["build", "plan"]) {
  test(`3ページの選択肢と自由入力に回答して同じ依頼・添付で進める（${mode}）`, async ({ page }, info) => {
    await ready(page);
    const before = await scene(page);
    await page.evaluate(async () => {
      const path = "/src/lib/tauri.ts";
      const { tauri } = await import(/* @vite-ignore */ path);
      const plan = tauri.chatgptPlan.bind(tauri); let rounds = 0;
      tauri.chatgptPlan = async (...args: Parameters<typeof import("../src/lib/tauri").tauri.chatgptPlan>) => {
        window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify(++rounds === 1 ? {
          title: "制作前の確認", description: "希望を選んでください", objects: [], questions: [
            { question: "床の雰囲気は？", choices: ["木", "石", "芝生"] },
            { question: "光の雰囲気は？", choices: ["朝", "昼", "夜"] },
            { question: "主な用途は？", choices: ["交流", "展示", "発表"] },
          ],
        } : { title: "回答を反映", description: "確認した希望を基に編集", objects: [], edits: [{ entityId: "starter-floor", name: "回答した床" }] });
        return plan(...args);
      };
    });
    const id = await generate(page, mode, ["starter-floor"]);
    await expect.poll(async () => (await job(page, id)).status).toBe("planned");
    expect(await scene(page)).toEqual(before);
    expect((await call(page, "apply_chatgpt_plan", { generationId: id }, true)).ok).toBe(false);
    expect((await call(page, "answer_chatgpt_questions", { generationId: id, answers: [{ questionIndex: 0, answer: "木" }] }, true)).ok).toBe(false);
    const form = panel(page).getByRole("form", { name: "制作の確認事項", exact: true });
    await expect(form.getByText("確認 1 / 3", { exact: true })).toBeVisible();
    await expect(form.getByText("確認 1 / 3", { exact: true })).toBeInViewport();
    await expect(form.getByRole("button", { name: "次へ", exact: true })).toBeDisabled();
    await expect(form.getByRole("radio", { name: "1. 木", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(form.getByRole("radio", { name: "2. 石", exact: true })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(form.getByRole("radio", { name: "2. 石", exact: true })).toBeChecked();
    await page.keyboard.press("Shift+Tab");
    await expect(form.getByRole("radio", { name: "1. 木", exact: true })).toBeFocused();
    await page.keyboard.press("Space");
    await form.getByRole("button", { name: "次へ", exact: true }).click();
    await expect(form.getByRole("radio").first()).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(form.getByRole("radio", { name: "その他（自由入力）", exact: true })).toBeFocused();
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await expect(form.getByRole("textbox", { name: "その他の回答", exact: true })).toBeFocused();
    await form.getByRole("textbox", { name: "その他の回答", exact: true }).fill("夕暮れの柔らかい光");
    await form.getByRole("textbox", { name: "その他の回答", exact: true }).press("Control+a");
    expect(await form.getByRole("textbox", { name: "その他の回答", exact: true }).evaluate((element: HTMLTextAreaElement) => element.selectionStart === 0 && element.selectionEnd === element.value.length)).toBe(true);
    await form.getByRole("button", { name: "次へ", exact: true }).click();
    const connectionControls = panel(page).getByRole("group", { name: "接続の操作", exact: true });
    await expect(panel(page).getByRole("button", { name: "Plan", exact: true })).toHaveCount(0);
    const openMcp = connectionControls.getByRole("button", { name: "MCP接続", exact: true });
    await expect(openMcp).toBeInViewport();
    await openMcp.click();
    const mcp = page.getByRole("dialog", { name: "MCP接続", exact: true });
    await expect(mcp).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(openMcp).toBeFocused();
    await expect(form.getByText("確認 3 / 3", { exact: true })).toBeVisible();
    await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { document.body.dataset.questionsCopy = text; } } }); });
    await panel(page).getByRole("button", { name: "出力をコピー", exact: true }).click();
    const copied = await page.evaluate(() => document.body.dataset.questionsCopy ?? "");
    for (const text of ["床の雰囲気は？", "光の雰囲気は？", "主な用途は？", "3. 発表", "その他（自由入力）"]) expect(copied).toContain(text);
    await form.getByRole("radio", { name: "2. 展示", exact: true }).check();
    await form.getByRole("button", { name: "前へ", exact: true }).click();
    await expect(form.getByRole("textbox", { name: "その他の回答", exact: true })).toHaveValue("夕暮れの柔らかい光");
    await form.getByRole("button", { name: "次へ", exact: true }).click();
    await page.screenshot({ path: info.outputPath(`clarification-${mode}.png`) });
    expect(await scene(page)).toEqual(before);
    await form.getByRole("button", { name: "回答して進める", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(2);
    if (mode === "plan") {
      await expect.poll(async () => (await job(page, id)).status).toBe("planned");
      expect(await scene(page)).toEqual(before);
      await panel(page).getByRole("button", { name: "変更を反映", exact: true }).click();
    }
    await expect.poll(async () => (await job(page, id)).status).toBe("completed");
    expect((await scene(page)).entities["starter-floor"].name).toBe("回答した床");
    const contexts = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts);
    expect(contexts[1].attachedEntityIds).toEqual(["starter-floor"]);
    expect(JSON.stringify(contexts[1].conversation)).toContain("夕暮れの柔らかい光");
    expect((await job(page, id)).clarifications?.map(item => item.answer)).toEqual(["木", "夕暮れの柔らかい光", "展示"]);
    expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.map(request => request.generationId))).toEqual([id, id]);
  });
}
