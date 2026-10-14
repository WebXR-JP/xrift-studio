import { expect, test, type Page } from "@playwright/test";
import type { ChatgptAssetOptions, XriftMcpEditorResponse } from "../src/lib/tauri";

declare global {
  interface Window { __XRIFT_CHATGPT_MODEL_SOURCE_FIXTURE__?: { available: boolean; gate: boolean; requests: ChatgptAssetOptions[] } }
}
async function call(page: Page, tool: string, args: Record<string, unknown> = {}): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    return (await import(/* @vite-ignore */ path)).callReleaseE2EMcp(tool, args);
  }, { tool, args });
}
async function ready(page: Page, available: boolean, gate = false) {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: "chatgpt-model-source-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  await page.evaluate(async ({ available, gate }) => {
    const fixture = { available, gate, requests: [] as ChatgptAssetOptions[] };
    window.__XRIFT_CHATGPT_MODEL_SOURCE_FIXTURE__ = fixture;
    window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null };
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "制作方法の検証", description: "選んだ制作方法を確認", objects: [] });
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    tauri.getBlenderStatus = async () => {
      while (fixture.gate) await new Promise(resolve => setTimeout(resolve, 25));
      return { available: fixture.available, version: fixture.available ? "fixture-version" : null };
    };
    const original = tauri.chatgptPlan.bind(tauri) as typeof import("../src/lib/tauri").tauri.chatgptPlan;
    tauri.chatgptPlan = (...args: Parameters<typeof original>) => { fixture.requests.push(structuredClone(args[2])); return original(...args); };
  }, { available, gate });
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  await expect(panel.getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("fixture-model");
  return { panel, source: panel.getByRole("combobox", { name: "モデルの制作方法", exact: true }), prompt: panel.getByRole("textbox", { name: "ワールドへの依頼", exact: true }) };
}

test("Blender未導入では理由を示し、素材ストアを選んだ依頼の設定を送る", async ({ page }) => {
  const { panel, source, prompt } = await ready(page, false);
  await expect(source).toHaveValue("auto");
  await expect(source.locator('option[value="blender"]')).toHaveJSProperty("disabled", true);
  await expect(panel).toContainText("Blenderは未導入です。");
  await source.selectOption("store");
  await prompt.fill("素材ストアでモデルを探す依頼");
  await prompt.press("Enter");
  await expect(prompt).toHaveValue("");
  await expect.poll(() => page.evaluate(() => window.__XRIFT_CHATGPT_MODEL_SOURCE_FIXTURE__!.requests)).toEqual([{ models: true, materials: true, audio: true, modelSource: "store" }]);
});

test("Blender確認中は選択を保留し、利用可能になった後の制作方法を依頼ごとに保持する", async ({ page }) => {
  const { panel, source, prompt } = await ready(page, true, true);
  await expect(source.locator('option[value="blender"]')).toHaveJSProperty("disabled", true);
  await expect(panel).toContainText("Blenderを確認しています。");
  await page.evaluate(() => { window.__XRIFT_CHATGPT_MODEL_SOURCE_FIXTURE__!.gate = false; window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = true; });
  await expect(source.locator('option[value="blender"]')).toHaveJSProperty("disabled", false);
  await source.selectOption("blender");
  await prompt.fill("Blenderでモデルを制作する依頼");
  await prompt.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__XRIFT_CHATGPT_MODEL_SOURCE_FIXTURE__!.requests.length)).toBe(1);
  await expect(source).toBeEnabled();
  await source.selectOption("store");
  await prompt.fill("次は素材ストアを使う依頼");
  await prompt.press("Enter");
  await source.selectOption("auto");
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = false; });
  await expect.poll(() => page.evaluate(() => window.__XRIFT_CHATGPT_MODEL_SOURCE_FIXTURE__!.requests.map(request => request.modelSource))).toEqual(["blender", "store"]);
});
