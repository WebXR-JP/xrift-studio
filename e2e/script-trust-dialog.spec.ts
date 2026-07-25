import { expect, test } from "@playwright/test";

test("Script承認Dialogはソースを固定表示し安全側を初期選択する", async ({
  page,
}) => {
  await page.goto("/e2e.html?scenario=ready");

  await page.evaluate(async (fixtureUrl) => {
    const fixture = (await import(fixtureUrl)) as typeof import(
      "./script-trust-dialog.fixture"
    );
    fixture.mountScriptTrustDialogFixture();
  }, "/e2e/script-trust-dialog.fixture.tsx");

  const dialog = page.getByRole("alertdialog", {
    name: "Scriptの実行を確認",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("MCP Spinner");
  await expect(dialog).toContainText("MCP (Codex)");
  await expect(
    page.getByLabel("MCP Spinnerの読み取り専用ソース"),
  ).toContainText("defineScript");
  await expect(
    page.getByRole("button", { name: "キャンセル", exact: true }),
  ).toBeFocused();

  await page.getByRole("button", { name: "許可してPlay" }).click();
  const result = await page.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          __scriptTrustFixtureResult?: unknown;
        }
      ).__scriptTrustFixtureResult,
  );
  expect(result).toEqual({
    decision: "allow-and-play",
    snapshotKey: `script-trust-v1:${JSON.stringify([
      ["script-1", "a".repeat(64)],
    ])}`,
  });
});
