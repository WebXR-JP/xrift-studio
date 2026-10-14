import { expect, test, type Page } from "@playwright/test";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";

async function call(page: Page, tool: string, args: Record<string, unknown> = {}): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    return (await import(/* @vite-ignore */ path)).callReleaseE2EMcp(tool, args);
  }, { tool, args });
}
async function ready(page: Page) {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: "chatgpt-keyboard-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null }; });
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  await expect(panel.getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("fixture-model");
  return { panel, prompt: panel.getByRole("textbox", { name: "ワールドへの依頼", exact: true }) };
}
async function requestCount(page: Page) {
  return page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length);
}

test("Shift+Enterは改行、IME確定Enterは送信せず、通常Enterで一度だけ送信する", async ({ page }) => {
  const { panel, prompt } = await ready(page);
  await prompt.fill("最初の行");
  await prompt.press("Shift+Enter");
  await prompt.pressSequentially("次の行");
  await expect(prompt).toHaveValue("最初の行\n次の行");
  expect(await requestCount(page)).toBe(0);
  await prompt.dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, isComposing: true });
  expect(await requestCount(page)).toBe(0);
  await prompt.dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229, isComposing: false });
  expect(await requestCount(page)).toBe(0);
  await prompt.press("Enter");
  await expect.poll(() => requestCount(page)).toBe(1);
  await expect(panel.getByRole("status").filter({ hasText: "依頼を反映して保存しました" })).toBeVisible();
  await expect(prompt).toHaveValue("");
  expect(await requestCount(page)).toBe(1);
});

test("空の依頼は送信せず、接続前と処理中のEnterは送信待ちに入る", async ({ page }) => {
  const { panel, prompt } = await ready(page);
  await prompt.fill("  ");
  await prompt.press("Enter");
  expect(await requestCount(page)).toBe(0);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt.planUsageEnabled = false; });
  await expect(panel.getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("");
  await prompt.fill("接続前の依頼");
  await prompt.press("Enter");
  await expect(prompt).toHaveValue("");
  await expect(panel.getByRole("region", { name: "送信待ちの依頼", exact: true })).toContainText("接続前の依頼");
  expect(await requestCount(page)).toBe(0);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt.planUsageEnabled = true; window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = true; });
  await expect(panel.getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("fixture-model");
  try {
    await expect.poll(() => requestCount(page)).toBe(1);
    await expect(prompt).toBeEnabled();
    await prompt.fill("処理中の次の依頼");
    await prompt.press("Enter");
    await expect(prompt).toHaveValue("");
    await expect(panel.getByRole("region", { name: "送信待ちの依頼", exact: true })).toContainText("処理中の次の依頼");
    expect(await requestCount(page)).toBe(1);
    const generationId = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests[0].generationId);
    expect((await call(page, "cancel_chatgpt_generation", { generationId })).ok).toBe(true);
    await expect(prompt).toBeEnabled();
    expect(await requestCount(page)).toBe(1);
  } finally { await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = false; }).catch(() => undefined); }
});
