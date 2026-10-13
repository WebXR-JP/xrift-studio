import { expect, test } from "@playwright/test";

const bootstrap = "**/src/release-e2e-bootstrap.tsx*";

test("アプリの読み込み中は状態を表示し、読み込み後は制作画面へ進む", async ({ page }) => {
  let finish: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  await page.route(bootstrap, async (route) => {
    await pending;
    await route.continue();
  });
  await page.goto("/e2e.html?scenario=ready", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("status")).toHaveText("XRift Studioを読み込んでいます…");
  expect(await page.evaluate(() => Boolean(window.__XRIFT_RELEASE_E2E__ && window.__TAURI_INTERNALS__))).toBe(true);
  finish?.();
  await expect(page.getByRole("heading", { name: "プロジェクト", exact: true })).toBeVisible();
  await expect(page.getByText("XRift Studioを読み込んでいます…")).toHaveCount(0);
});

test("アプリの読み込み失敗を表示し、再表示で起動し直せる", async ({ page }) => {
  await page.route(bootstrap, (route) => route.abort("failed"));
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("alert")).toContainText("XRift Studioを起動できませんでした");
  await expect(page.getByRole("alert")).toContainText("保存済みの制作データは削除されていません");
  await page.unroute(bootstrap);
  await page.getByRole("button", { name: "XRift Studioを再表示", exact: true }).click();
  await expect(page.getByRole("heading", { name: "プロジェクト", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
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
