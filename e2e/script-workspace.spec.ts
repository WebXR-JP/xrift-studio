import { expect, test, type Page } from "@playwright/test";
type Fixture = {
  mount(): void;
  settleRead(path: string, value: string, fail?: boolean): void;
  settleWrite(fail?: boolean): void;
  edit(value: string): void;
  undo(): boolean;
  state(): { editor: { source: string }; writes: string[]; models: string[] };
};
const url = "/e2e/script-workspace.fixture.tsx";
async function mount(page: Page) {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async (url) => (await import(url) as Fixture).mount(), url);
}
async function read(page: Page, path: string, value: string, fail = false) {
  await page.evaluate(async ({ url, path, value, fail }) => (await import(url) as Fixture).settleRead(path, value, fail), { url, path, value, fail });
}
async function state(page: Page) { return page.evaluate(async (url) => (await import(url) as Fixture).state(), url); }
async function edit(page: Page, value: string) { await page.evaluate(async ({ url, value }) => (await import(url) as Fixture).edit(value), { url, value }); }

test("Scriptタブの往復でコードとUndoを保持し、非表示中は保存キーを受け取らない", async ({ page }, testInfo) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await mount(page);
  await page.getByRole("button", { name: "Open Door" }).click();
  await read(page, "scripts/door.ts", "// original");
  await expect(page.locator(".monaco-editor textarea")).toBeVisible();
  await edit(page, "// draft");
  await page.getByRole("button", { name: "Scene View", exact: true }).click();
  await page.keyboard.press("Control+s");
  expect((await state(page)).writes).toEqual([]);
  await page.getByRole("button", { name: "Script", exact: true }).click();
  expect((await state(page)).models).toContain("// draft");
  expect(await page.evaluate(async (url) => (await import(url) as Fixture).undo(), url)).toBe(true);
  await expect.poll(async () => (await state(page)).models).toContain("// original");
  await page.getByLabel("Scriptを検索").fill("light");
  await expect(page.getByRole("navigation", { name: "Scriptファイル" }).getByRole("button")).toHaveCount(1);
  await page.getByLabel("Scriptを検索").fill("missing");
  await expect(page.getByText("一致するScriptはありません。検索語を変えてください。")).toBeVisible();
  await page.getByLabel("Scriptを検索").fill("");
  await page.setViewportSize({ width: 850, height: 650 });
  await page.screenshot({ path: testInfo.outputPath("script-workspace.png") });
  expect(errors).toEqual([]);
});

test("Scriptの遅い読み込みとエラーが選択中のファイルを上書きしない", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "Open Door" }).click();
  await page.getByRole("button", { name: "Open Light" }).click();
  await read(page, "scripts/light.ts", "// light");
  await read(page, "scripts/door.ts", "late error", true);
  await expect.poll(async () => (await state(page)).editor.source).toBe("// light");
  await expect(page.getByText("late error")).toHaveCount(0);
  await page.getByRole("button", { name: "Script editorを閉じる" }).click();
  await expect(page.getByRole("region", { name: "Script workspace" })).toHaveCount(0);
});

test("Script保存の重複を防ぎ、失敗後に同じ下書きを再保存できる", async ({ page }) => {
  await mount(page);
  await page.getByRole("button", { name: "Open Door" }).click();
  await read(page, "scripts/door.ts", "// original");
  await expect(page.locator(".monaco-editor textarea")).toBeVisible();
  await edit(page, "// saved draft");
  const save = page.getByRole("button", { name: "保存 (⌘/Ctrl+S)" });
  await save.evaluate((button) => {
    (button as HTMLButtonElement).click();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
  });
  expect((await state(page)).writes).toEqual(["// saved draft"]);
  await expect(page.getByRole("button", { name: "Script editorを閉じる" })).toBeDisabled();
  await expect(page.getByRole("navigation", { name: "Scriptファイル" }).getByRole("button").last()).toBeDisabled();
  await page.evaluate(async (url) => (await import(url) as Fixture).settleWrite(true), url);
  await expect(page.getByText("Save failed; retry")).toBeVisible();
  await save.click();
  await page.evaluate(async (url) => (await import(url) as Fixture).settleWrite(), url);
  await expect(save).toBeDisabled();
  expect((await state(page)).editor.source).toBe("// saved draft");
});
