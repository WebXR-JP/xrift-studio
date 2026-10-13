import { expect, test } from "@playwright/test";

const bootstrap = "**/src/release-e2e-bootstrap.tsx*";

test("アプリの読み込み中はブランドと状態を表示し、読み込み後は制作画面へ進む", async ({ page }, testInfo) => {
  let finish: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  await page.route(bootstrap, async (route) => {
    await pending;
    await route.continue();
  });
  await page.goto("/e2e.html?scenario=ready", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "XRift Studio", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("XRift Studioを読み込んでいます…");
  await page.screenshot({ path: testInfo.outputPath("startup-brand-desktop.png") });
  expect(await page.evaluate(() => Boolean(window.__XRIFT_RELEASE_E2E__ && window.__TAURI_INTERNALS__))).toBe(true);
  const resumedAt = Date.now();
  finish?.();
  await expect(page.getByRole("heading", { name: "プロジェクト", exact: true })).toBeVisible();
  await expect(page.getByText("XRift Studioを読み込んでいます…")).toHaveCount(0);
  const fixtureRequests = await page.evaluate(() => performance.getEntriesByType("resource")
    .map(entry => new URL(entry.name).pathname)
    .filter(path => /\.fixture\.|\/compiler\/fixture\.|\/visual-editor\/fixtures\./.test(path)));
  expect(fixtureRequests).toEqual([]);
  console.log(`Initial App imports: ${Date.now() - resumedAt}ms; fixture requests: ${fixtureRequests.length}`);
});

test("アプリの読み込み失敗を表示し、再表示で起動し直せる", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.route(bootstrap, (route) => route.abort("failed"));
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("alert")).toContainText("XRift Studioを起動できませんでした");
  await expect(page.getByRole("alert")).toContainText("保存済みの制作データは削除されていません");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("startup-failure-phone.png") });
  await page.unroute(bootstrap);
  await page.getByRole("button", { name: "XRift Studioを再表示", exact: true }).click();
  await expect(page.getByRole("heading", { name: "プロジェクト", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("狭い画面でも起動ブランドを表示し、動きを減らす設定を尊重する", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  let finish: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  await page.route(bootstrap, async route => { await pending; await route.continue(); });
  await page.goto("/e2e.html?scenario=ready", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "XRift Studio", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("XRift Studioを読み込んでいます…");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator(".xrift-startup-spinner").evaluate(element => getComputedStyle(element).animationName)).toBe("none");
  await page.screenshot({ path: testInfo.outputPath("startup-brand-phone.png") });
  finish?.();
  await expect(page.getByRole("heading", { name: "プロジェクト", exact: true })).toBeVisible();
});

test("entryの再実行でキャッシュ済みのアプリ画面を消さない", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const library = page.getByRole("heading", { name: "プロジェクト", exact: true });
  await expect(library).toBeVisible();
  await page.evaluate(() => window.__XRIFT_RELEASE_E2E__?.calls.push({ command: "entry-state-preserved" }));
  await page.evaluate(async (entry) => { await import(entry); }, "/src/release-e2e.tsx?entry-reload-test=1");
  await expect(library).toBeVisible();
  await page.evaluate(async (entry) => { await import(entry); }, "/src/release-e2e.tsx?entry-reload-test=2");
  await expect(library).toBeVisible();
  await expect(page.getByText("XRift Studioを読み込んでいます…")).toHaveCount(0);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__?.calls.some(call => call.command === "entry-state-preserved"))).toBe(true);
});

test("Sceneの表示と操作にはコードエディターの読み込みを待たない", async ({ page }) => {
  const codeEditorRequests: string[] = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (/monaco|\/ScriptEditorWorkspace\.|\/ShaderEditorDialog\./i.test(path)) codeEditorRequests.push(path);
  });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("heading", { name: "プロジェクト", exact: true })).toBeVisible();
  expect(codeEditorRequests).toEqual([]);
  const opened = await page.evaluate(async () => {
    const modulePath = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp } = await import(/* @vite-ignore */ modulePath);
    return callReleaseE2EMcp("create_project", { name: "startup-runtime-graph", kind: "world", templateId: "blank" });
  });
  expect(opened.ok, JSON.stringify(opened)).toBe(true);
  const hierarchy = page.getByRole("tree", { name: "シーンのEntity階層" });
  await expect(hierarchy).toBeVisible();
  await hierarchy.getByText("Box", { exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Inspector" }).getByRole("textbox", { name: "Entity名", exact: true })).toHaveValue("Box");
  expect(codeEditorRequests).toEqual([]);
});
