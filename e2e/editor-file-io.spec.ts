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

async function mount(page: Page, deferDefault = false, kind: "world" | "item" = "world") {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async ({ url, defer, kind }) => {
    const fixture = await import(url) as Fixture;
    fixture.mountEditorFileIoFixture(defer, kind);
  }, { url: fixtureUrl, defer: deferDefault, kind });
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

async function holdAutosave(page: Page) {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
}

async function settleWrite(page: Page, index: number, fail = false) {
  await page.evaluate(async ({ url, index, fail }) => (await import(url) as Fixture).settleWrite(index, fail), { url: fixtureUrl, index, fail });
}

for (const action of ["Play", "チェック", "XRiftへ公開"]) {
  test(`${action}は最新コードの保存が完了してから開始する`, async ({ page }) => {
    await mount(page, false, "item");
    await expect.poll(async () => (await state(page)).contents).toContain("initial file");
    await holdAutosave(page);
    const draft = `latest code before ${action}`;
    await page.evaluate(async ({ url, draft }) => (await import(url) as Fixture).edit(draft), { url: fixtureUrl, draft });
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect.poll(async () => (await state(page)).writes).toEqual([{ rel: "src/Item.tsx", content: draft }]);
    expect((await state(page)).operations).toEqual([]);
    const devCommands = () => page.evaluate(() => (Reflect.get(window, "__XRIFT_RELEASE_E2E__")?.shellCommands ?? []).filter((command: string) => command.includes("run dev")));
    expect(await devCommands()).toEqual([]);
    await settleWrite(page, 0);
    if (action === "Play") {
      await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
      expect(await devCommands()).toHaveLength(1);
    } else {
      await expect.poll(async () => (await state(page)).operations).toMatchObject([{ kind: action === "チェック" ? "check" : "upload", source: draft }]);
    }
  });
}

test("保存に失敗したコードは公開せず、再試行で同じ下書きを公開する", async ({ page }) => {
  await mount(page, false, "item");
  await expect.poll(async () => (await state(page)).contents).toContain("initial file");
  await holdAutosave(page);
  await page.evaluate(async url => (await import(url) as Fixture).edit("draft after failure"), fixtureUrl);
  const publish = page.getByRole("button", { name: "XRiftへ公開", exact: true });
  await publish.click();
  await expect.poll(async () => (await state(page)).writes).toHaveLength(1);
  await settleWrite(page, 0, true);
  await expect(publish).toBeEnabled();
  expect((await state(page)).operations).toEqual([]);
  expect((await state(page)).contents).toContain("draft after failure");
  await publish.click();
  await expect.poll(async () => (await state(page)).writes).toHaveLength(2);
  await settleWrite(page, 1);
  await expect.poll(async () => (await state(page)).operations).toMatchObject([{ kind: "upload", source: "draft after failure" }]);
});

test("ワールド設定の保存中に追加した編集を先に公開せず、最新設定で一度だけ公開する", async ({ page }) => {
  await mount(page);
  await page.locator("#editor-file-io-fixture aside").getByRole("button", { name: "xrift.json", exact: true }).click();
  const title = page.getByPlaceholder("ワールドのタイトル");
  await expect(title).toHaveValue("Fixture world");
  await title.fill("first publication metadata");
  const publish = page.getByRole("button", { name: "XRiftへ公開", exact: true });
  await publish.click();
  await expect.poll(async () => (await state(page)).writes).toHaveLength(1);
  await title.fill("latest publication metadata");
  await settleWrite(page, 0);
  await expect(publish).toBeEnabled();
  expect((await state(page)).operations).toEqual([]);
  await expect(title).toHaveValue("latest publication metadata");
  await publish.click();
  await expect.poll(async () => (await state(page)).writes).toHaveLength(2);
  await settleWrite(page, 1);
  await expect.poll(async () => (await state(page)).operations).toHaveLength(1);
  const operation = (await state(page)).operations[0];
  expect(operation.kind).toBe("upload");
  expect(JSON.parse(operation.metadata).world.title).toBe("latest publication metadata");
});

test("ワールド設定はファイル切替前に保存し、保存失敗や保存中の追加編集を保つ", async ({ page }) => {
  await mount(page);
  const host = page.locator("#editor-file-io-fixture");
  await host.locator("aside").getByRole("button", { name: "xrift.json", exact: true }).click();
  const title = page.getByPlaceholder("ワールドのタイトル");
  const ids = page.getByRole("textbox", { name: "Item ID（world.items）" });
  await expect(title).toHaveValue("Fixture world");
  await title.fill("saved before switching");
  await ids.fill("12345678-1234-1234-1234-123456789ABC\n22345678-1234-1234-1234-123456789abc");
  expect(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(true);
  await host.locator("aside").getByRole("button", { name: "b.ts", exact: true }).click();
  await expect.poll(async () => (await state(page)).writes).toHaveLength(1);
  expect((await state(page)).pendingReads).not.toContain("b.ts");
  await expect(title).toHaveValue("saved before switching");
  await settleWrite(page, 0);
  await expect.poll(async () => (await state(page)).pendingReads).toContain("b.ts");
  await settleRead(page, "b.ts", "B source");
  await host.locator("aside").getByRole("button", { name: "xrift.json", exact: true }).click();
  await expect(title).toHaveValue("saved before switching");
  await expect(ids).toHaveValue("12345678-1234-1234-1234-123456789abc\n22345678-1234-1234-1234-123456789abc");
  const saved = JSON.parse((await state(page)).files["xrift.json"]);
  expect(saved.customRoot).toBe(true);
  expect(saved.world.custom).toEqual({ preserved: true });
  await title.fill("retry this metadata");
  const raw = page.getByRole("button", { name: "JSON", exact: true });
  await raw.click();
  await expect.poll(async () => (await state(page)).writes).toHaveLength(2);
  await settleWrite(page, 1, true);
  await expect(page.getByText("保存に失敗しました", { exact: true })).toBeVisible();
  await expect(title).toHaveValue("retry this metadata");
  await raw.click();
  await expect.poll(async () => (await state(page)).writes).toHaveLength(3);
  await title.fill("newer metadata while saving");
  await settleWrite(page, 2);
  await expect(title).toHaveValue("newer metadata while saving");
  await expect(raw).toBeVisible();
  await raw.click();
  await expect.poll(async () => (await state(page)).writes).toHaveLength(4);
  await settleWrite(page, 3);
  await expect(title).toHaveCount(0);
  await expect.poll(async () => (await state(page)).contents).toContain((await state(page)).files["xrift.json"]);
  expect(JSON.parse((await state(page)).files["xrift.json"]).world.title).toBe("newer metadata while saving");
});

test("ワールド設定を保存してからプロジェクト一覧へ戻る", async ({ page }) => {
  await mount(page);
  await page.locator("#editor-file-io-fixture aside").getByRole("button", { name: "xrift.json", exact: true }).click();
  const title = page.getByPlaceholder("ワールドのタイトル");
  await expect(title).toHaveValue("Fixture world");
  await title.fill("metadata before leaving");
  await page.getByRole("button", { name: "プロジェクト一覧", exact: true }).click();
  await expect.poll(async () => (await state(page)).writes).toHaveLength(1);
  expect((await state(page)).backCalls).toBe(0);
  await settleWrite(page, 0);
  await expect(page.getByText("Fixture library", { exact: true })).toBeVisible();
  expect((await state(page)).backCalls).toBe(1);
  expect(JSON.parse((await state(page)).files["xrift.json"]).world.title).toBe("metadata before leaving");
});

test("編集中のファイルを保存してから改名し、保存中の削除で旧名を再生成しない", async ({ page }) => {
  await mount(page);
  await selectFile(page, "a.ts");
  await settleRead(page, "a.ts", "original A");
  await expect.poll(async () => (await state(page)).contents).toContain("original A");
  await holdAutosave(page);
  await page.evaluate(async url => (await import(url) as Fixture).edit("draft before rename"), fixtureUrl);
  const aside = page.locator("#editor-file-io-fixture aside");
  await aside.getByRole("button", { name: "a.ts", exact: true }).locator("..").getByTitle("名前を変更", { exact: true }).click();
  const name = aside.getByRole("textbox");
  await name.fill("renamed.ts");
  await name.press("Enter");
  await expect.poll(async () => (await state(page)).writes).toHaveLength(1);
  expect((await state(page)).pathChanges).toEqual([]);
  await settleWrite(page, 0);
  await expect(aside.getByRole("button", { name: "renamed.ts", exact: true })).toBeVisible();
  expect((await state(page)).files["renamed.ts"]).toBe("draft before rename");
  expect((await state(page)).files["a.ts"]).toBeUndefined();
  await page.clock.runFor(601);
  expect((await state(page)).writes).toHaveLength(1);
  await page.evaluate(async url => (await import(url) as Fixture).edit("draft before delete"), fixtureUrl);
  await page.clock.runFor(601);
  await expect.poll(async () => (await state(page)).writes).toHaveLength(2);
  await aside.getByRole("button", { name: "renamed.ts", exact: true }).locator("..").getByTitle("削除", { exact: true }).click();
  const remove = page.getByRole("button", { name: "削除する", exact: true });
  await remove.click();
  expect((await state(page)).pathChanges).toEqual([{ kind: "rename", rel: "a.ts", newRel: "renamed.ts" }]);
  await settleWrite(page, 1);
  await remove.click();
  await expect(aside.getByRole("button", { name: "renamed.ts", exact: true })).toHaveCount(0);
  await page.clock.runFor(601);
  expect((await state(page)).files["a.ts"]).toBeUndefined();
  expect((await state(page)).files["renamed.ts"]).toBeUndefined();
  expect((await state(page)).writes).toHaveLength(2);
});

test("改名前の保存失敗でコードを保持し、再試行で最新コードを新名へ移す", async ({ page }) => {
  await mount(page);
  await selectFile(page, "a.ts");
  await settleRead(page, "a.ts", "original A");
  await expect.poll(async () => (await state(page)).contents).toContain("original A");
  await holdAutosave(page);
  await page.evaluate(async url => (await import(url) as Fixture).edit("keep this rename draft"), fixtureUrl);
  const aside = page.locator("#editor-file-io-fixture aside");
  await aside.getByRole("button", { name: "a.ts", exact: true }).locator("..").getByTitle("名前を変更", { exact: true }).click();
  const name = aside.getByRole("textbox");
  await name.fill("retry.ts");
  await name.press("Enter");
  await expect.poll(async () => (await state(page)).writes).toHaveLength(1);
  await settleWrite(page, 0, true);
  await expect(page.getByRole("button", { name: "自動保存を再試行", exact: true })).toBeVisible();
  expect((await state(page)).pathChanges).toEqual([]);
  expect((await state(page)).contents).toContain("keep this rename draft");
  await name.press("Enter");
  await expect.poll(async () => (await state(page)).writes).toHaveLength(2);
  await settleWrite(page, 1);
  await expect(aside.getByRole("button", { name: "retry.ts", exact: true })).toBeVisible();
  expect((await state(page)).files["retry.ts"]).toBe("keep this rename draft");
  expect((await state(page)).files["a.ts"]).toBeUndefined();
});

test("ファイル切替の保存中に追加したコードを保持し、最新コードの保存後に切り替える", async ({ page }) => {
  await mount(page);
  await expect.poll(async () => (await state(page)).contents).toContain("initial file");
  await holdAutosave(page);
  await page.evaluate(async url => (await import(url) as Fixture).edit("first draft before switching"), fixtureUrl);
  const otherFile = page.locator("#editor-file-io-fixture aside").getByRole("button", { name: "b.ts", exact: true });
  await otherFile.click();
  await expect.poll(async () => (await state(page)).writes).toHaveLength(1);
  await page.evaluate(async url => (await import(url) as Fixture).edit("latest draft while saving"), fixtureUrl);
  await settleWrite(page, 0);
  await expect.poll(async () => (await state(page)).contents).toContain("latest draft while saving");
  expect((await state(page)).pendingReads).not.toContain("b.ts");
  await expect(page.getByRole("button", { name: "保存待ち", exact: true })).toBeEnabled();
  await otherFile.click();
  await expect.poll(async () => (await state(page)).writes).toHaveLength(2);
  await settleWrite(page, 1);
  await expect.poll(async () => (await state(page)).pendingReads).toContain("b.ts");
  expect((await state(page)).files["src/Item.tsx"]).toBe("latest draft while saving");
  await settleRead(page, "b.ts", "other file");
  await expect.poll(async () => (await state(page)).contents).toContain("other file");
});

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

test("autosave and shortcuts deduplicate, preserve failed edits and save before switching files", async ({ page }, testInfo) => {
  await mount(page);
  await expect.poll(async () => (await state(page)).contents).toContain("initial file");
  // Hold only the autosave delay; application state still updates through React.
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
  await page.evaluate(async url => (await import(url) as Fixture).edit("edited A"), fixtureUrl);
  const save = page.getByRole("button", { name: "保存待ち", exact: true });
  await expect(save).toBeEnabled();
  // Same task: React has not necessarily flushed the disabled state yet.
  await save.evaluate(button => {
    (button as HTMLButtonElement).click();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true }));
  });
  await expect(page.getByRole("button", { name: "自動保存中…", exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("saving-state.png") });
  expect((await state(page)).writes).toEqual([{ rel: "src/Item.tsx", content: "edited A" }]);
  await page.locator("#editor-file-io-fixture aside").getByRole("button", { name: "b.ts", exact: true }).click();
  expect((await state(page)).pendingReads).not.toContain("b.ts");
  await page.evaluate(async url => (await import(url) as Fixture).settleWrite(0), fixtureUrl);
  await expect(page.getByRole("button", { name: "保存済み", exact: true })).toBeDisabled();
  await selectFile(page, "b.ts");
  // The shortcut must also respect the loading state.
  await page.keyboard.press("Control+s");
  await settleRead(page, "b.ts", "saved B");
  await expect(page.getByRole("button", { name: "保存済み", exact: true })).toBeDisabled();
  await expect.poll(async () => (await state(page)).contents).toContain("saved B");
  expect((await state(page)).writes).toHaveLength(1);

  await page.evaluate(async url => (await import(url) as Fixture).edit("edited B"), fixtureUrl);
  await expect(save).toBeEnabled();
  await page.clock.runFor(601);
  await expect(page.getByRole("button", { name: "自動保存中…", exact: true })).toBeDisabled();
  await page.evaluate(async url => (await import(url) as Fixture).settleWrite(1, true), fixtureUrl);
  const retry = page.getByRole("button", { name: "自動保存を再試行", exact: true });
  await expect(retry).toBeEnabled();
  await expect.poll(async () => (await state(page)).contents).toContain("edited B");
  await retry.click();
  await page.evaluate(async url => (await import(url) as Fixture).edit("new edit while saving"), fixtureUrl);
  await page.evaluate(async url => (await import(url) as Fixture).settleWrite(2), fixtureUrl);
  await expect(save).toBeEnabled();
  await page.clock.runFor(601);
  expect((await state(page)).writes[3]).toEqual({ rel: "b.ts", content: "new edit while saving" });
  await page.evaluate(async url => (await import(url) as Fixture).settleWrite(3), fixtureUrl);
  await expect(page.getByRole("button", { name: "保存済み", exact: true })).toBeDisabled();
});
