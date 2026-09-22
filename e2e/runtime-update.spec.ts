import { expect, test, type Page } from "@playwright/test";

async function runtimeCalls(page: Page, command: string): Promise<number> {
  return page.evaluate((name) => {
    const state = (window as typeof window & {
      __XRIFT_RELEASE_E2E__?: { calls: Array<{ command: string }> };
    }).__XRIFT_RELEASE_E2E__;
    return state?.calls.filter((call) => call.command === name).length ?? 0;
  }, command);
}

const projectHeading = (page: Page) => page.getByRole("heading", { name: "プロジェクト", exact: true });
const updateDialog = (page: Page) => page.getByRole("dialog", { name: "@xrift/cli アップデート", exact: true });

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  const state = await page.evaluate(() => (
    window as typeof window & {
      __XRIFT_RELEASE_E2E__?: { uploadAttempts: string[]; unhandledCommands: string[] };
    }
  ).__XRIFT_RELEASE_E2E__);
  expect(state?.uploadAttempts ?? []).toEqual([]);
  expect(state?.unhandledCommands ?? []).toEqual([]);
});

test("必要なCLIの更新に失敗しても現在版を残し、同じ画面から再試行できる", async ({ page }) => {
  await page.goto("/e2e.html?scenario=runtime-update-error");
  await page.getByRole("button", { name: "制作ツールを更新", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("CLIのダウンロードに失敗しました");
  await expect(page.getByText("現在 v0.24.3 → 推奨 v0.24.4", { exact: true })).toBeVisible();
  await expect(projectHeading(page)).toHaveCount(0);
  await page.getByRole("button", { name: "更新を再試行", exact: true }).click();
  await expect(projectHeading(page)).toBeVisible();
  expect(await runtimeCalls(page, "setup_runtime")).toBe(2);
});

test("準備が完了していない応答ではプロジェクト一覧へ進まない", async ({ page }) => {
  await page.goto("/e2e.html?scenario=runtime-update-incomplete");
  await page.getByRole("button", { name: "制作ツールを更新", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("必要なツールの準備が完了していません");
  await expect(projectHeading(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "更新を再試行", exact: true })).toBeEnabled();
});

test("推奨版より新しいCLIが利用可能なら更新を求めず制作へ進む", async ({ page }) => {
  await page.goto("/e2e.html?scenario=runtime-newer");
  await expect(projectHeading(page)).toBeVisible();
  await expect.poll(() => runtimeCalls(page, "check_xrift_latest")).toBeGreaterThan(0);
  await expect(updateDialog(page)).toHaveCount(0);
  expect(await runtimeCalls(page, "setup_runtime")).toBe(0);
  expect(await runtimeCalls(page, "update_xrift")).toBe(0);
});

test("Node.jsだけ準備する場合は導入済みの新しいCLIを更新対象として表示しない", async ({ page }) => {
  await page.goto("/e2e.html?scenario=runtime-node-update");
  await expect(page.getByRole("heading", { name: "制作ツールの更新が必要です" })).toBeVisible();
  const cliItem = page.getByRole("listitem").filter({ hasText: "@xrift/cli" });
  await expect(cliItem).toContainText("v0.25.0");
  await expect(cliItem).toContainText("導入済み");
  await expect(cliItem).not.toContainText("推奨");
  await expect(cliItem).not.toContainText("更新が必要");
  await page.getByRole("button", { name: "制作ツールを更新", exact: true }).click();
  await expect(projectHeading(page)).toBeVisible();
  expect(await runtimeCalls(page, "update_xrift")).toBe(0);
});

test("任意の更新は処理中に閉じず、確認した実際のCLIバージョンを通知する", async ({ page }) => {
  await page.goto("/e2e.html?scenario=cli-update");
  const dialog = updateDialog(page);
  await expect(dialog).toContainText("0.24.5");
  await dialog.getByRole("button", { name: "アップデート", exact: true }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(dialog.getByRole("button", { name: "アップデート中…", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "後で", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(page.getByText("@xrift/cli をアップデートしました", { exact: true })).toBeVisible();
  await expect(page.getByText("v0.24.6", { exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(await runtimeCalls(page, "update_xrift")).toBe(1);
  expect(await runtimeCalls(page, "runtime_status")).toBeGreaterThan(1);
});

test("任意の更新に失敗してもダイアログから再試行できる", async ({ page }) => {
  await page.goto("/e2e.html?scenario=cli-update-error");
  const dialog = updateDialog(page);
  await dialog.getByRole("button", { name: "アップデート", exact: true }).click();
  await expect(page.getByText("アップデートに失敗しました", { exact: true })).toBeVisible();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "アップデート", exact: true }).click();
  await expect(page.getByText("@xrift/cli をアップデートしました", { exact: true })).toBeVisible();
  expect(await runtimeCalls(page, "update_xrift")).toBe(2);
});

test("更新コマンドが成功してもCLIが古いままなら成功を通知しない", async ({ page }) => {
  await page.goto("/e2e.html?scenario=cli-update-incomplete");
  const dialog = updateDialog(page);
  await dialog.getByRole("button", { name: "アップデート", exact: true }).click();
  await expect(page.getByText("アップデートに失敗しました", { exact: true })).toBeVisible();
  await expect(page.getByText("CLIはv0.24.4です。v0.24.5への更新をもう一度お試しください。", { exact: false })).toBeVisible();
  await expect(page.getByText("@xrift/cli をアップデートしました", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "アップデート", exact: true })).toBeEnabled();
});
