import { expect, test, type Page } from "@playwright/test";
import type { ChatgptConnection, ChatgptModel, XriftMcpEditorResponse } from "../src/lib/tauri";

type ConnectionFixture = {
  loginCalls: number;
  loginFailure: string | null;
  requests: Record<string, unknown>[];
  models: ChatgptModel[];
};
declare global {
  interface Window { __XRIFT_CHATGPT_CONNECTION_FIXTURE__?: ConnectionFixture }
}

async function call(page: Page, tool: string, args: Record<string, unknown> = {}) {
  return page.evaluate(async ({ tool, args }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    return (await import(/* @vite-ignore */ path)).callReleaseE2EMcp(tool, args) as Promise<XriftMcpEditorResponse>;
  }, { tool, args });
}

async function openFixture(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  const created = await call(page, "create_project", { name: "chatgpt-connection-isolated-fixture", kind: "world", templateId: "blank" });
  expect(created.ok, JSON.stringify(created)).toBe(true);
  // App, Editor, its actual chat panel and tauri wrapper remain real. Only the
  // native authentication/catalog response and outbound payload are isolated.
  await page.evaluate(() => {
    const fixture: ConnectionFixture = {
      loginCalls: 0, loginFailure: null, requests: [],
      models: [
        { slug: "fixture-a", displayName: "検証モデルA", supportedReasoningEfforts: ["low", "medium", "high"], defaultReasoningEffort: "medium" },
        { slug: "fixture-b", displayName: "検証モデルB", supportedReasoningEfforts: ["low", "high"], defaultReasoningEffort: "low" },
        { slug: "fixture-c", displayName: "検証モデルC", supportedReasoningEfforts: ["medium"], defaultReasoningEffort: "medium" },
        { slug: "fixture-d", displayName: "検証モデルD" },
      ],
    };
    window.__XRIFT_CHATGPT_CONNECTION_FIXTURE__ = fixture;
    const internals = window.__TAURI_INTERNALS__!;
    const invoke = internals.invoke!.bind(internals);
    internals.invoke = async (command, args, options) => {
      if (command === "chatgpt_login") {
        fixture.loginCalls++;
        if (fixture.loginFailure) throw new Error(fixture.loginFailure);
      }
      if (command === "chatgpt_models") return structuredClone(fixture.models);
      if (command === "chatgpt_plan") fixture.requests.push(structuredClone(args ?? {}));
      return invoke(command, args, options);
    };
  });
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  await expect(panel).toBeVisible();
  return panel;
}

async function setConnection(page: Page, state: Partial<ChatgptConnection>) {
  await page.evaluate(state => {
    Object.assign(window.__XRIFT_RELEASE_E2E__!.chatgpt, state);
  }, state);
}

async function signIn(page: Page) {
  await setConnection(page, { signedIn: true, accountId: "fixture-account", email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null });
  await expect(page.getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("fixture-a");
}

async function expectCentralConnection(page: Page) {
  const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  const card = panel.locator('[aria-label="ChatGPTの接続"]');
  const connect = card.getByRole("button");
  await expect(connect).toBeVisible();
  await expect(connect).toHaveText("ChatGPTに接続");
  await page.evaluate(() => document.fonts.ready);
  await expect(panel.locator("header").getByRole("button", { name: "ChatGPTに接続", exact: true })).toHaveCount(0);
  const bounds = await panel.locator('[aria-label="制作の会話と結果"]').boundingBox();
  const button = await connect.boundingBox();
  const cardBounds = await card.boundingBox();
  expect(bounds).not.toBeNull(); expect(button).not.toBeNull(); expect(cardBounds).not.toBeNull();
  expect(Math.abs(button!.x + button!.width / 2 - bounds!.x - bounds!.width / 2)).toBeLessThanOrEqual(12);
  expect(Math.abs(cardBounds!.y + cardBounds!.height / 2 - bounds!.y - bounds!.height / 2)).toBeLessThanOrEqual(12);
  return connect;
}

for (const width of [1440, 375]) {
  test(`${width}pxの未接続チャット中央から接続し、待機中は重複せず接続後も依頼を保つ`, async ({ page }, testInfo) => {
    const panel = await openFixture(page, width);
    const prompt = panel.getByRole("textbox", { name: "ワールドへの依頼", exact: true });
    await expect(prompt).toBeEnabled();
    await prompt.fill("接続したら床の色を調整してください");
    await expect(panel.getByRole("button", { name: "依頼を送信", exact: true })).toBeDisabled();
    const connect = await expectCentralConnection(page);
    await page.screenshot({ path: testInfo.outputPath(`disconnected-${width}.png`) });
    await connect.click();
    await expect(connect).toBeDisabled();
    await expect(panel.getByRole("status").filter({ hasText: "ブラウザ" })).toBeVisible();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.__XRIFT_CHATGPT_CONNECTION_FIXTURE__!.loginCalls)).toBe(1);
    await signIn(page);
    await expect(connect).toHaveCount(0);
    await expect(panel.getByLabel("ChatGPTアカウント", { exact: true })).toBeVisible();
    await expect(prompt).toHaveValue("接続したら床の色を調整してください");
    await expect(panel.getByRole("button", { name: "依頼を送信", exact: true })).toBeEnabled();
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`connected-${width}.png`) });
  });
}

test("接続失敗は中央で再試行でき、復元中は重複接続と依頼送信を止める", async ({ page }) => {
  const panel = await openFixture(page);
  await page.evaluate(() => { window.__XRIFT_CHATGPT_CONNECTION_FIXTURE__!.loginFailure = "検証用の接続エラー"; });
  const connect = await expectCentralConnection(page);
  await connect.click();
  await expect(panel.getByRole("alert")).toContainText("検証用の接続エラー");
  await expect(connect).toBeEnabled();
  await expectCentralConnection(page);
  await page.evaluate(() => { window.__XRIFT_CHATGPT_CONNECTION_FIXTURE__!.loginFailure = null; });
  await connect.click();
  expect(await page.evaluate(() => window.__XRIFT_CHATGPT_CONNECTION_FIXTURE__!.loginCalls)).toBe(2);
  await setConnection(page, { connecting: false, restoring: true });
  await expect(panel.getByRole("status").filter({ hasText: "保存した接続" })).toBeVisible();
  await expect(connect).toBeDisabled();
  await expect(panel.getByRole("button", { name: "依頼を送信", exact: true })).toBeDisabled();
  await signIn(page);
  await expect(connect).toHaveCount(0);
  await expect(panel.getByRole("alert")).toHaveCount(0);
});

test("選択した思考量がPlanと通常の依頼から実IPCへ渡る", async ({ page }) => {
  const panel = await openFixture(page);
  await signIn(page);
  const thinking = panel.getByRole("combobox", { name: "思考量", exact: true });
  await expect(thinking).toHaveValue("low");
  await thinking.selectOption("high");
  const prompt = panel.getByRole("textbox", { name: "ワールドへの依頼", exact: true });
  const plan = panel.getByRole("button", { name: "Plan", exact: true });
  await plan.click();
  await prompt.fill("Planで床を追加する相談");
  await panel.getByRole("button", { name: "依頼を送信", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Planを反映", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.__XRIFT_CHATGPT_CONNECTION_FIXTURE__!.requests.at(-1))).toMatchObject({ model: "fixture-a", reasoningEffort: "high", prompt: "Planで床を追加する相談" });
  await panel.getByRole("button", { name: "Planを破棄", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Planを反映", exact: true })).toHaveCount(0);
  await plan.click();
  await prompt.fill("通常の依頼で床を追加");
  await panel.getByRole("button", { name: "依頼を送信", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__XRIFT_CHATGPT_CONNECTION_FIXTURE__!.requests.length)).toBe(2);
  expect(await page.evaluate(() => window.__XRIFT_CHATGPT_CONNECTION_FIXTURE__!.requests.at(-1))).toMatchObject({ model: "fixture-a", reasoningEffort: "high", prompt: "通常の依頼で床を追加" });
  await expect(panel.getByRole("progressbar", { name: "依頼の反映と保存", exact: true })).toHaveAttribute("value", "3");
});

test("モデル切替で対応する思考量を保ち、非対応なら既定へ戻してIPCから省く", async ({ page }) => {
  const panel = await openFixture(page);
  await signIn(page);
  const model = panel.getByRole("combobox", { name: "ワールド制作のモデル", exact: true });
  const thinking = panel.getByRole("combobox", { name: "思考量", exact: true });
  await thinking.selectOption("high");
  await model.selectOption("fixture-b");
  await expect(thinking).toHaveValue("high");
  await model.selectOption("fixture-c");
  await expect(thinking).toHaveValue("medium");
  await expect(thinking.locator("option")).toHaveCount(2);
  await model.selectOption("fixture-d");
  await expect(thinking).toHaveValue("");
  await expect(thinking).toBeDisabled();
  await expect(thinking.locator("option")).toHaveCount(1);
  await panel.getByRole("button", { name: "Plan", exact: true }).click();
  await panel.getByRole("textbox", { name: "ワールドへの依頼", exact: true }).fill("既定の思考量でPlanを相談");
  await panel.getByRole("button", { name: "依頼を送信", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Planを反映", exact: true })).toBeEnabled();
  const request = await page.evaluate(() => window.__XRIFT_CHATGPT_CONNECTION_FIXTURE__!.requests.at(-1)!);
  expect(request.model).toBe("fixture-d");
  expect(request.reasoningEffort).toBeUndefined();

  // Choosing the model default explicitly is different from capability
  // fallback. A later model switch must not silently opt into "low".
  await panel.getByRole("button", { name: "Planを破棄", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Planを反映", exact: true })).toHaveCount(0);
  await model.selectOption("fixture-a");
  await expect(thinking).toHaveValue("low");
  await thinking.selectOption("");
  await model.selectOption("fixture-b");
  await expect(thinking).toHaveValue("");
  await panel.getByRole("textbox", { name: "ワールドへの依頼", exact: true }).fill("明示したモデル既定のまま相談");
  await panel.getByRole("button", { name: "依頼を送信", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Planを反映", exact: true })).toBeEnabled();
  const explicitDefault = await page.evaluate(() => window.__XRIFT_CHATGPT_CONNECTION_FIXTURE__!.requests.at(-1)!);
  expect(explicitDefault.model).toBe("fixture-b");
  expect(explicitDefault.reasoningEffort).toBeUndefined();
});
