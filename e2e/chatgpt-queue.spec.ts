import { expect, test, type Page } from "@playwright/test";
import type { ChatgptSceneContext, XriftMcpEditorResponse } from "../src/lib/tauri";

declare global {
  interface Window { __XRIFT_CHATGPT_QUEUE_OBSERVATIONS__?: { model: string; prompt: string; generationId?: string; context?: ChatgptSceneContext }[] }
}
async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: call } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await call("get_editor_context")).result : {};
    return call(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}
async function ready(page: Page, failureOnce = false) {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: "chatgpt-queue-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  await page.evaluate(async failureOnce => {
    window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null };
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "送信待ちの検証", description: "Sceneを読み取りました", objects: [] });
    window.__XRIFT_CHATGPT_QUEUE_OBSERVATIONS__ = [];
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    const original = tauri.chatgptPlan.bind(tauri) as typeof import("../src/lib/tauri").tauri.chatgptPlan;
    let failed = false;
    tauri.chatgptPlan = async (...args: Parameters<typeof original>) => {
      window.__XRIFT_CHATGPT_QUEUE_OBSERVATIONS__!.push({ model: args[0], prompt: args[1], generationId: args[4], context: args[5] ? structuredClone(args[5]) : undefined });
      if (failureOnce && !failed) { failed = true; throw new Error("isolated queue API failure"); }
      return original(...args);
    };
  }, failureOnce);
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  await expect(panel.getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("fixture-model");
  return { panel, prompt: panel.getByRole("textbox", { name: "ワールドへの依頼", exact: true }), queue: panel.getByRole("region", { name: "送信待ちの依頼", exact: true }) };
}
async function sent(page: Page) { return page.evaluate(() => window.__XRIFT_CHATGPT_QUEUE_OBSERVATIONS__!.map(request => request.prompt)); }
async function enter(prompt: ReturnType<Page["getByRole"]>, value: string) {
  await prompt.fill(value); await prompt.press("Enter"); await expect(prompt).toHaveValue("");
}
async function release(page: Page) { await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = false; }); }
async function requestConfirmation(page: Page, prompt: string) {
  // Only MCP retains mode=plan; ordinary chat requests always build.
  const response = await call(page, "generate_chatgpt_world", {
    model: "fixture-model", prompt, mode: "plan", options: { models: true, materials: true, audio: true },
  }, true);
  expect(response.ok, JSON.stringify(response)).toBe(true);
  await expect(page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true }).getByRole("button", { name: "変更を反映", exact: true })).toBeVisible();
}

test("Enterで入力をすぐ空にし、処理中の次の依頼をFIFOで一度ずつ送る", async ({ page }, info) => {
  const { panel, prompt, queue } = await ready(page);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = true; });
  try {
    await enter(prompt, "最初の依頼");
    await expect.poll(() => sent(page)).toEqual(["最初の依頼"]);
    await enter(prompt, "次の依頼");
    await enter(prompt, "三つ目の依頼");
    await expect(queue).toContainText("次の依頼");
    await expect(queue).toContainText("三つ目の依頼");
    await prompt.fill("まだ送らない下書き");
    for (const width of [1600, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await call(page, "open_chatgpt_panel");
      const submit = panel.getByRole("button", { name: "依頼を送信", exact: true });
      const source = panel.getByRole("checkbox", { name: "Blenderを使う", exact: true });
      await expect(submit).toBeVisible(); await expect(source).toBeVisible(); await expect(prompt).toHaveValue("まだ送らない下書き");
      const bounds = await panel.boundingBox(), button = await submit.boundingBox();
      expect(button!.x + button!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
      await page.screenshot({ path: info.outputPath(`queue-model-source-${width}.png`) });
    }
    await panel.getByRole("button", { name: "制作チャットを閉じる", exact: true }).click();
    await expect(panel).toBeHidden();
    await release(page);
    await expect.poll(() => sent(page)).toEqual(["最初の依頼", "次の依頼", "三つ目の依頼"]);
    expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
    await expect(queue).toBeHidden();
    await expect(prompt).toHaveValue("まだ送らない下書き");
  } finally { await release(page).catch(() => undefined); }
});

test("制作停止は後の依頼も保留し、取り消しと再開を明示してから次へ進む", async ({ page }) => {
  const { panel, prompt, queue } = await ready(page);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = true; });
  try {
    await enter(prompt, "停止する依頼");
    await expect.poll(() => sent(page)).toEqual(["停止する依頼"]);
    await enter(prompt, "停止後に確認して送る依頼");
    await prompt.fill("入力中の下書きは残す");
    await panel.getByRole("button", { name: "制作を停止", exact: true }).click();
    await expect(queue).toContainText("制作を停止");
    await expect(queue.getByRole("button", { name: "再試行", exact: true })).toBeVisible();
    expect(await sent(page)).toEqual(["停止する依頼"]);
    await queue.getByRole("listitem").filter({ hasText: "停止する依頼" }).getByRole("button", { name: "送信待ちの依頼を取り消す", exact: true }).click();
    await release(page);
    await queue.getByRole("button", { name: "再開", exact: true }).click();
    await expect.poll(() => sent(page)).toEqual(["停止する依頼", "停止後に確認して送る依頼"]);
    await expect(queue).toBeHidden();
    await expect(prompt).toHaveValue("入力中の下書きは残す");
  } finally { await release(page).catch(() => undefined); }
});

test("MCPの変更確認待ちの依頼は保留し、実際の送信時に最新の手動配置を読む", async ({ page }) => {
  const { panel, prompt, queue } = await ready(page);
  await requestConfirmation(page, "Planだけを確認する依頼");
  await enter(prompt, "最新配置から進める依頼");
  await expect(queue).toContainText("変更内容の反映または破棄");
  const created = await call(page, "create_primitive", { shape: "box", position: [7, 1, 2] }, true);
  expect(created.ok, JSON.stringify(created)).toBe(true);
  const entityId = created.result!.entityId as string;
  expect((await call(page, "rename_entity", { entityId, name: "人間が追加したCube" }, true)).ok).toBe(true);
  await panel.getByRole("button", { name: "変更を反映", exact: true }).click();
  await expect.poll(() => sent(page)).toEqual(["Planだけを確認する依頼", "最新配置から進める依頼"]);
  const latest = await page.evaluate(() => window.__XRIFT_CHATGPT_QUEUE_OBSERVATIONS__!.at(-1)!.context);
  expect(latest!.entities).toEqual(expect.arrayContaining([expect.objectContaining({ id: entityId, name: "人間が追加したCube", position: [7, 1, 2] })]));
  await expect(queue).toBeHidden();
});

test("API失敗は依頼を残して保留し、再試行しても入力中の下書きを消さない", async ({ page }) => {
  const { prompt, queue } = await ready(page, true);
  await enter(prompt, "失敗後に再試行する依頼");
  await expect(queue).toContainText("isolated queue API failure");
  await enter(prompt, "後で送る依頼");
  expect(await sent(page)).toEqual(["失敗後に再試行する依頼"]);
  await prompt.fill("入力中の別の下書き");
  await queue.getByRole("button", { name: "再試行", exact: true }).click();
  await expect.poll(() => sent(page)).toEqual(["失敗後に再試行する依頼", "失敗後に再試行する依頼", "後で送る依頼"]);
  await expect(queue).toBeHidden();
  await expect(prompt).toHaveValue("入力中の別の下書き");
});

test("Sceneを離れた送信待ちは別Worldへ送らず、戻ると再開できる", async ({ page }) => {
  const { panel, prompt, queue } = await ready(page);
  await requestConfirmation(page, "確認を待つPlan");
  await enter(prompt, "元のSceneだけへの依頼");
  const sourcePath = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.name === "chatgpt-queue-isolated-fixture")!.path);
  expect((await call(page, "create_project", { name: "chatgpt-queue-other-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await expect(queue).toBeHidden();
  expect(await sent(page)).toEqual(["確認を待つPlan"]);
  expect((await call(page, "open_project", { path: sourcePath })).ok).toBe(true);
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await expect(queue).toContainText("元のSceneだけへの依頼");
  await queue.getByRole("button", { name: "再開", exact: true }).click();
  await panel.getByRole("button", { name: "変更を反映", exact: true }).click();
  await expect.poll(() => sent(page)).toEqual(["確認を待つPlan", "元のSceneだけへの依頼"]);
});

test("予約したモデルが別アカウントで使えない場合は、設定の更新まで送らない", async ({ page }) => {
  const { panel, prompt, queue } = await ready(page);
  await requestConfirmation(page, "最初に確認するPlan");
  await enter(prompt, "予約したモデルで送る依頼");
  await page.evaluate(async () => {
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    tauri.chatgptModels = async () => [{ slug: "replacement-fixture-model", displayName: "別アカウントのモデル", supportedReasoningEfforts: ["medium"] }];
    window.__XRIFT_RELEASE_E2E__!.chatgpt.accountId = "replacement-fixture-account";
  });
  await expect(panel.getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("replacement-fixture-model");
  await panel.getByRole("button", { name: "変更を破棄", exact: true }).click();
  await queue.getByRole("button", { name: "再開", exact: true }).click();
  await expect(queue).toContainText("この依頼で選んだモデルを現在のアカウントで利用できません。");
  expect(await sent(page)).toEqual(["最初に確認するPlan"]);
  await queue.getByRole("button", { name: "送信設定を更新", exact: true }).click();
  await expect.poll(() => sent(page)).toEqual(["最初に確認するPlan", "予約したモデルで送る依頼"]);
  expect(await page.evaluate(() => window.__XRIFT_CHATGPT_QUEUE_OBSERVATIONS__!.at(-1)!.model)).toBe("replacement-fixture-model");
  await expect(queue).toBeHidden();
});

test("未接続の依頼を複数予約しても、接続ボタンと入力欄へ届く", async ({ page }) => {
  const { panel, prompt, queue } = await ready(page);
  await page.evaluate(() => { Object.assign(window.__XRIFT_RELEASE_E2E__!.chatgpt, { signedIn: false, planUsageEnabled: false, email: null, accountId: null }); });
  const connect = panel.getByRole("button", { name: "ChatGPTに接続", exact: true });
  await expect(connect).toBeEnabled();
  for (let index = 1; index <= 4; index++) await enter(prompt, `接続を待ってから送る依頼${index}`);
  await expect(queue.getByRole("listitem")).toHaveCount(4);
  expect(await sent(page)).toEqual([]);
  for (const width of [1600, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await call(page, "open_chatgpt_panel");
    await expect(connect).toBeVisible(); await expect(prompt).toBeVisible();
    const bounds = await panel.locator('[aria-label="制作の会話と結果"]').boundingBox(), button = await connect.boundingBox();
    expect(button!.y).toBeGreaterThanOrEqual(bounds!.y);
    expect(button!.y + button!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height + 1);
  }
});
