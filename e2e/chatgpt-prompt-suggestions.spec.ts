import { expect, test, type Page } from "@playwright/test";
import type { ChatgptSceneContext, VisualProjectFiles, XriftMcpEditorResponse } from "../src/lib/tauri";
import type { AssetManifest } from "../src/lib/visual-editor/asset-manifest";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { ChatgptResourceContext } from "../src/lib/visual-editor/chatgpt-resources";
import type { SceneDocument } from "../src/lib/visual-editor/scene-document";

declare global {
  interface Window {
    __XRIFT_PROMPT_SUGGESTION_REQUESTS__?: {
      model: string; prompt: string; generationId?: string;
      scene?: ChatgptSceneContext; resources?: ChatgptResourceContext;
    }[];
  }
}

const panel = (page: Page) => page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
const suggestions = (page: Page) => panel(page).getByRole("region", { name: "次の依頼の候補", exact: true });
const input = (page: Page) => panel(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true });

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
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: "prompt-suggestions-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  await page.evaluate(async () => {
    window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null };
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "依頼の確認", description: "現在のSceneを確認しました", objects: [] });
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    const original = tauri.chatgptPlan.bind(tauri) as typeof import("../src/lib/tauri").tauri.chatgptPlan;
    window.__XRIFT_PROMPT_SUGGESTION_REQUESTS__ = [];
    tauri.chatgptPlan = async (...args: Parameters<typeof original>) => {
      window.__XRIFT_PROMPT_SUGGESTION_REQUESTS__!.push({
        model: args[0], prompt: args[1], generationId: args[4],
        scene: args[5] ? structuredClone(args[5]) : undefined,
        resources: args[7] ? structuredClone(args[7]) : undefined,
      });
      return original(...args);
    };
  });
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await expect(panel(page).getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("fixture-model");
  await expect(suggestions(page)).toBeVisible();
  await expect(suggestions(page).getByRole("button")).toHaveCount(3);
}

async function titles(page: Page) {
  return suggestions(page).getByRole("button").evaluateAll(elements => elements.map(element => element.getAttribute("title") ?? ""));
}

async function requests(page: Page) {
  return page.evaluate(() => window.__XRIFT_PROMPT_SUGGESTION_REQUESTS__!);
}

async function completed(page: Page, count: number) {
  await expect.poll(async () => (await requests(page)).length).toBe(count);
  const id = (await requests(page)).at(-1)!.generationId!;
  await expect.poll(async () => ((await call(page, "get_chatgpt_generation", { generationId: id })).result as ChatgptGeneration).status).toBe("completed");
  return id;
}

async function saved(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/lib/tauri.ts";
    const project = window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!;
    const files = await (await import(/* @vite-ignore */ path)).tauri.readVisualProject(project.path) as VisualProjectFiles;
    return { scene: JSON.parse(files.sceneDocuments[0].content) as SceneDocument, assets: JSON.parse(files.assetManifestJson) as AssetManifest };
  });
}

async function drop(page: Page, id: string, mime: string) {
  const dataTransfer = await page.evaluateHandle(({ id, mime }) => { const data = new DataTransfer(); data.setData(mime, id); return data; }, { id, mime });
  await input(page).dispatchEvent("drop", { dataTransfer });
}

test.afterEach(async ({ page }) => {
  const state = await page.evaluate(() => {
    const fixture = window.__XRIFT_RELEASE_E2E__;
    return fixture ? { uploads: fixture.uploadAttempts, unhandled: fixture.unhandledCommands } : null;
  });
  if (state) { expect(state.uploads).toEqual([]); expect(state.unhandled).toEqual([]); }
});

test("候補を上下キーで選びTabでは入力だけ行い、編集した依頼をEnterでSceneの実コンテキストへ送る", async ({ page }) => {
  await ready(page);
  const before = await titles(page);
  expect(before.every(value => value.length > 0)).toBe(true);
  const buttons = suggestions(page).getByRole("button");
  await expect(buttons.first()).toHaveAttribute("aria-pressed", "true");
  await input(page).focus();
  await input(page).press("ArrowDown");
  await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
  await input(page).press("ArrowUp");
  await expect(buttons.first()).toHaveAttribute("aria-pressed", "true");
  await input(page).press("ArrowDown");
  await input(page).press("Tab");
  await expect(input(page)).toHaveValue(before[1]);
  await expect(input(page)).toBeFocused();
  await expect(suggestions(page)).toBeHidden();
  expect(await requests(page)).toEqual([]);
  const edited = `${before[1]}\n床の名前を「候補から編集した床」に変更してください。`;
  await input(page).fill(edited);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({
    title: "床の調整", description: "床の名前を保存しました", objects: [],
    edits: [{ entityId: "starter-floor", name: "候補から編集した床" }], hasMore: true, remainingWork: "次にベンチの配置を整えます",
  }); });
  await input(page).press("Enter");
  await completed(page, 1);
  expect((await requests(page))[0]).toMatchObject({ model: "fixture-model", prompt: edited, scene: { entities: expect.arrayContaining([expect.objectContaining({ id: "starter-floor", name: "Plane" })]) } });
  expect((await saved(page)).scene.entities["starter-floor"].name).toBe("候補から編集した床");
  await expect(input(page)).toHaveValue("");
  await expect(suggestions(page)).toBeVisible();
  await expect(suggestions(page).getByRole("button")).toHaveCount(3);
  await expect.poll(() => titles(page)).not.toEqual(before);
  expect(await requests(page)).toHaveLength(1);
});

test("IME中は候補を入れず送信せず、非空入力とShift+TabとEscape後のTabは通常のフォーカス移動を保つ", async ({ page }) => {
  await ready(page);
  await input(page).focus();
  await input(page).dispatchEvent("compositionstart");
  for (const key of ["Tab", "Enter"]) await input(page).dispatchEvent("keydown", { key, code: key, keyCode: key === "Tab" ? 9 : 13, isComposing: true });
  await input(page).dispatchEvent("keydown", { key: "Tab", code: "Tab", keyCode: 9, isComposing: false });
  await input(page).dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229, isComposing: false });
  await expect(input(page)).toHaveValue("");
  await expect(input(page)).toBeFocused();
  expect(await requests(page)).toEqual([]);
  await input(page).dispatchEvent("compositionend");
  await input(page).press("Shift+Tab");
  await expect(input(page)).not.toBeFocused();
  await expect(input(page)).toHaveValue("");
  await input(page).fill("入力済みの文章を保つ");
  await expect(suggestions(page)).toBeHidden();
  await input(page).press("Tab");
  await expect(panel(page).getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(input(page)).toBeFocused();
  await expect(input(page)).toHaveValue("入力済みの文章を保つ");
  await input(page).fill("");
  await expect(suggestions(page)).toBeVisible();
  await input(page).press("Escape");
  await expect(suggestions(page)).toBeHidden();
  await input(page).press("Tab");
  await expect(panel(page).getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toBeFocused();
  await expect(input(page)).toHaveValue("");
  expect(await requests(page)).toEqual([]);
});

test("EntityとMaterialに沿う候補はクリックで添付も復元し、チャットの切替と携帯幅でも入力を保つ", async ({ page }, info) => {
  await ready(page);
  const material = Object.values((await saved(page)).assets.assets).find(asset => asset.kind === "material")!;
  await drop(page, "starter-floor", "application/x-xrift-visual-editor-entity");
  await drop(page, material.id, "application/x-xrift-visual-editor-material");
  await expect.poll(async () => (await titles(page)).join("\n")).toContain(material.name);
  await expect.poll(async () => (await titles(page)).join("\n")).toContain("Plane");
  const attachmentPrompt = (await titles(page))[0];
  await suggestions(page).getByRole("button").first().click();
  await expect(input(page)).toHaveValue(attachmentPrompt);
  await expect(input(page)).toBeFocused();
  await input(page).press("Enter");
  await completed(page, 1);
  expect((await requests(page))[0].scene?.attachedEntityIds).toEqual(["starter-floor"]);
  expect((await requests(page))[0].resources?.projectAssets.find(asset => asset.id === material.id)?.attached).toBe(true);
  await expect(panel(page).getByLabel("添付したEntity", { exact: true })).toHaveCount(0);
  await expect(panel(page).getByLabel("添付したMaterial", { exact: true })).toHaveCount(0);
  await expect(suggestions(page)).toBeVisible();
  const nextPrompt = (await titles(page))[0];
  await suggestions(page).getByRole("button").first().click();
  await expect(input(page)).toHaveValue(nextPrompt);
  await expect(input(page)).toBeFocused();
  expect(await input(page).evaluate((element: HTMLTextAreaElement) => element.selectionStart === element.value.length && element.selectionEnd === element.value.length)).toBe(true);
  await expect(panel(page).getByLabel("添付したEntity", { exact: true })).toContainText("Plane");
  await expect(panel(page).getByLabel("添付したMaterial", { exact: true })).toContainText(material.name);
  const firstSession = await panel(page).getByRole("combobox", { name: "制作チャットの履歴", exact: true }).inputValue();
  await panel(page).getByRole("button", { name: "新しいチャット", exact: true }).click();
  await expect(input(page)).toHaveValue("");
  await expect(panel(page).getByLabel("添付したMaterial", { exact: true })).toHaveCount(0);
  await panel(page).getByRole("combobox", { name: "制作チャットの履歴", exact: true }).selectOption(firstSession);
  await expect(input(page)).toHaveValue(nextPrompt);
  await expect(panel(page).getByLabel("添付したMaterial", { exact: true })).toContainText(material.name);
  await input(page).fill("");
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
    await suggestions(page).scrollIntoViewIfNeeded();
    await expect(suggestions(page)).toBeInViewport();
    await expect(input(page)).toBeInViewport();
    const bounds = await panel(page).boundingBox();
    for (const button of await suggestions(page).getByRole("button").all()) {
      const item = await button.boundingBox();
      expect(item!.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(item!.x + item!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`prompt-suggestions-${width}.png`) });
  }
  expect(await requests(page)).toHaveLength(1);
});

test("質問待ちと失敗と制作中と停止後の送信待ちでは候補を出さない", async ({ page }) => {
  await ready(page);
  await input(page).fill("failure");
  await input(page).press("Enter");
  await expect(panel(page).getByRole("region", { name: "送信待ちの依頼", exact: true })).toContainText("検証用の生成エラー");
  await expect(suggestions(page)).toBeHidden();
  await panel(page).getByRole("button", { name: "新しいチャット", exact: true }).click();
  await expect(suggestions(page)).toBeVisible();
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({
    title: "仕上げの確認", description: "照明を選んでください", objects: [], questions: [{ question: "明るさは？", choices: ["柔らかい", "明るい", "暗い"] }],
  }); });
  expect((await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "照明の明るさを選びたい" }, true)).ok).toBe(true);
  await expect(panel(page).getByRole("form", { name: "制作の確認事項", exact: true })).toBeVisible();
  await expect(suggestions(page)).toBeHidden();
  await panel(page).getByRole("button", { name: "変更を破棄", exact: true }).click();
  await expect(suggestions(page)).toBeHidden();
  await panel(page).getByRole("button", { name: "新しいチャット", exact: true }).click();
  await expect(suggestions(page)).toBeVisible();
  await page.evaluate(() => {
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = true;
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "待機中の確認", description: "Sceneを確認しました", objects: [] });
  });
  try {
    await input(page).fill("処理中に止める依頼");
    await input(page).press("Enter");
    await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptPlanWaiting)).toBe(true);
    await expect(suggestions(page)).toBeHidden();
    await input(page).fill("前の処理の後で送る依頼");
    await input(page).press("Enter");
    await expect(panel(page).getByRole("region", { name: "送信待ちの依頼", exact: true })).toContainText("前の処理の後で送る依頼");
    await expect(suggestions(page)).toBeHidden();
    await panel(page).getByRole("button", { name: "制作を停止", exact: true }).click();
    await expect(panel(page).getByRole("region", { name: "送信待ちの依頼", exact: true })).toContainText("制作を停止");
    await expect(suggestions(page)).toBeHidden();
  } finally { await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = false; }).catch(() => undefined); }
});
