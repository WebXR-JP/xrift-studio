import { expect, test, type Page } from "@playwright/test";

const fixtureUrl = "/e2e/editor-file-io.fixture.tsx";
type Fixture = typeof import("./editor-file-io.fixture");
const errorsByPage = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  errorsByPage.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
});
test.afterEach(({ page }) => { expect(errorsByPage.get(page)).toEqual([]); });

async function mount(page: Page, deferDefault = false) {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async ({ url, defer }) => {
    const fixture = await import(url) as Fixture;
    fixture.mountEditorFileIoFixture(defer);
  }, { url: fixtureUrl, defer: deferDefault });
  await expect(page.locator("#editor-file-io-fixture").getByText("a.ts", { exact: true })).toBeVisible();
}

async function state(page: Page) {
  return page.evaluate(async url => (await import(url) as Fixture).state(), fixtureUrl);
}

async function settleRead(page: Page, rel: string, text: string, fail = false) {
  await page.evaluate(async ({ url, rel, text, fail }) => (await import(url) as Fixture).settleRead(rel, text, fail),
    { url: fixtureUrl, rel, text, fail });
}

async function selectFile(page: Page, rel: string) {
  await page.locator("#editor-file-io-fixture aside").getByText(rel, { exact: true }).click();
  await expect.poll(async () => (await state(page)).pendingReads).toContain(rel);
}

test("file switching ignores late reads and stale errors", async ({ page }) => {
  await mount(page);
  await expect.poll(async () => (await state(page)).contents).toContain("initial file");
  expect((await state(page)).reads.filter(rel => rel === "src/Item.tsx")).toHaveLength(1);
  await selectFile(page, "a.ts");
  await selectFile(page, "b.ts");
  await settleRead(page, "b.ts", "newer B");
  await settleRead(page, "a.ts", "late A");
  await expect.poll(async () => (await state(page)).contents).toContain("newer B");
  await selectFile(page, "a.ts");
  await selectFile(page, "b.ts");
  await settleRead(page, "b.ts", "latest B");
  await settleRead(page, "a.ts", "stale failure", true);
  await expect.poll(async () => (await state(page)).contents).toContain("latest B");
  await expect(page.getByText("ファイルを開けませんでした", { exact: true })).toHaveCount(0);
});

test("manual selection wins over delayed default-file discovery", async ({ page }) => {
  await mount(page, true);
  await selectFile(page, "b.ts");
  await settleRead(page, "b.ts", "chosen B");
  await settleRead(page, "src/Item.tsx", "default arrived late");
  await expect.poll(async () => (await state(page)).contents).toContain("chosen B");
  await expect(page.locator("#editor-file-io-fixture section").getByText("b.ts", { exact: true })).toBeVisible();
});

test("save clicks and shortcuts deduplicate and cannot dirty another file", async ({ page }, testInfo) => {
  await mount(page);
  await expect.poll(async () => (await state(page)).contents).toContain("initial file");
  await page.evaluate(async url => (await import(url) as Fixture).edit("edited A"), fixtureUrl);
  const save = page.getByRole("button", { name: "保存 (⌘/Ctrl+S)", exact: true });
  await expect(save).toBeEnabled();
  // Same task: React has not necessarily flushed the disabled state yet.
  await save.evaluate(button => {
    (button as HTMLButtonElement).click();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
  });
  await expect(page.getByRole("button", { name: "保存中…", exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("saving-state.png") });
  expect((await state(page)).writes).toEqual([{ rel: "src/Item.tsx", content: "edited A" }]);
  await selectFile(page, "b.ts");
  // The shortcut must also respect the loading state.
  await page.keyboard.press("Control+s");
  await settleRead(page, "b.ts", "saved B");
  await page.evaluate(async url => (await import(url) as Fixture).settleWrite(0), fixtureUrl);
  await expect(save).toBeDisabled();
  await expect.poll(async () => (await state(page)).contents).toContain("saved B");
  expect((await state(page)).writes).toHaveLength(1);

  await page.evaluate(async url => (await import(url) as Fixture).edit("edited B"), fixtureUrl);
  await save.click();
  await page.evaluate(async url => (await import(url) as Fixture).settleWrite(1, true), fixtureUrl);
  await expect(save).toBeEnabled();
  await expect.poll(async () => (await state(page)).contents).toContain("edited B");
  await save.click();
  await page.evaluate(async url => (await import(url) as Fixture).edit("new edit while saving"), fixtureUrl);
  await page.evaluate(async url => (await import(url) as Fixture).settleWrite(2), fixtureUrl);
  await expect(save).toBeEnabled();
  await save.click();
  expect((await state(page)).writes[3]).toEqual({ rel: "b.ts", content: "new edit while saving" });
  await page.evaluate(async url => (await import(url) as Fixture).settleWrite(3), fixtureUrl);
  await expect(save).toBeDisabled();
});
