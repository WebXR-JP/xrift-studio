import { expect, test, type Page } from "@playwright/test";

type CredentialFixture = {
  pending: Credential | null;
  saved: Credential | null;
  reads: Array<{ mediation: string; userAction: boolean }>;
  stores: number;
  rejectStore: boolean;
  rejectRead: boolean;
  holdRead: boolean;
  finishRead: (() => void) | null;
};

const browserErrors = new Map<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
});
test.afterEach(({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
  browserErrors.delete(page);
});

async function mountDialog(page: Page) {
  await page.evaluate(async () => {
    const path = "/e2e/browser-api-key.fixture.tsx";
    const { React, createRoot, WebUploadDialog, createPrototypeProject, createBrowserProject } = await import(/* @vite-ignore */ path);
    const bundle = createPrototypeProject("world", "APIキー保存の検証（送信はテスト用）");
    bundle.project.metadata.description = "送信とブラウザの資格情報を置き換えた保存操作のテストです。";
    const projectPath = await createBrowserProject();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    root.render(React.createElement(WebUploadDialog, {
      bundle, projectPath, thumbnailRefreshKey: 0, thumbnailCaptureBusy: false,
      thumbnailCaptureError: null, onCaptureThumbnail() {}, onExport() {},
      onUploaded: async () => {}, onClose: () => root.unmount(),
    }));
  });
  return page.getByRole("dialog", { name: "XRiftへ公開", exact: true });
}

async function openCompletedUpload(page: Page) {
  // No API key, upload, or password-manager change reaches an external service.
  await page.route("**/src/lib/visual-editor/web-upload.ts*", (route) => {
    if (new URL(route.request().url()).searchParams.has("credential-original")) return route.continue();
    return route.fulfill({
      contentType: "application/javascript",
      body: `export * from "/src/lib/visual-editor/web-upload.ts?credential-original";
      export async function loadRuntimeShell() { return []; }
      export async function uploadVisualProjectFromWeb() { return { worldId: "fixture-world", versionNumber: 1 }; }`,
    });
  });
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(() => {
    const fixture: CredentialFixture = {
      pending: null, saved: null, reads: [], stores: 0, rejectStore: false, rejectRead: false,
      holdRead: false, finishRead: null,
    };
    Object.assign(window, { credentialFixture: fixture });
    class PasswordCredential {
      type = "password";
      constructor(options: object) { Object.assign(this, options); }
    }
    Object.defineProperty(window, "PasswordCredential", { configurable: true, value: PasswordCredential });
    Object.defineProperty(navigator, "credentials", { configurable: true, value: {
      store: async (credential: Credential) => {
        fixture.stores++;
        if (fixture.rejectStore) throw new Error("save rejected");
        fixture.pending = credential; // Acceptance occurs later, outside store().
      },
      get: async ({ mediation }: { mediation: string }) => {
        fixture.reads.push({ mediation, userAction: navigator.userActivation.isActive });
        if (fixture.rejectRead) throw new Error("read rejected");
        if (fixture.holdRead) await new Promise<void>((resolve) => { fixture.finishRead = resolve; });
        return mediation === "required" ? fixture.saved : null;
      },
    } });
  });
  const dialog = await mountDialog(page);
  await dialog.getByLabel("XRift APIキー", { exact: true }).fill("fixture-key");
  await dialog.getByRole("button", { name: "ワールドをアップロード", exact: true }).click();
  await expect(dialog).toContainText("XRiftへのファイル送信が完了しました");
  return dialog;
}

async function changeFixture(page: Page, update: Partial<CredentialFixture>) {
  await page.evaluate((values) => {
    Object.assign((window as typeof window & { credentialFixture: CredentialFixture }).credentialFixture, values);
  }, update);
}

async function acceptSave(page: Page) {
  await page.evaluate(() => {
    const fixture = (window as typeof window & { credentialFixture: CredentialFixture }).credentialFixture;
    fixture.saved = fixture.pending;
  });
}

test("保存の承諾を待ち、確認の取り消し後も読み戻しと次回の公開に進める", async ({ page }) => {
  const dialog = await openCompletedUpload(page);
  await dialog.getByRole("button", { name: "APIキーをブラウザに保存", exact: true }).click();
  const verify = dialog.getByRole("button", { name: "保存済みキーを確認", exact: true });
  await expect(verify).toBeEnabled();
  await expect(dialog).toContainText("ブラウザの保存確認で「保存」を選んでください。");
  expect(await page.evaluate(() => (window as typeof window & { credentialFixture: CredentialFixture }).credentialFixture.reads.map(r => r.mediation)))
    .toEqual(["silent"]);

  await changeFixture(page, { holdRead: true });
  await verify.click(); // The user has not accepted the browser's prompt yet.
  await expect(dialog.getByRole("button", { name: "保存済みキーを確認中…", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "保存をもう一度依頼", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "閉じる", exact: true })).toBeDisabled();
  await page.evaluate(() => {
    const fixture = (window as typeof window & { credentialFixture: CredentialFixture }).credentialFixture;
    fixture.holdRead = false;
    fixture.finishRead!();
    fixture.finishRead = null;
  });
  await expect(dialog).toContainText("ブラウザで保存を完了してから、もう一度確認してください。");
  await expect(verify).toBeEnabled();
  await acceptSave(page);
  await verify.click();
  await expect(dialog).toContainText("保存済みキーを確認しました。");
  await expect(verify).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "保存をもう一度依頼", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as typeof window & { credentialFixture: CredentialFixture }).credentialFixture.stores)).toBe(1);
  expect(await page.evaluate(() => (window as typeof window & { credentialFixture: CredentialFixture }).credentialFixture.reads.filter(r => r.mediation === "required").every(r => r.userAction))).toBe(true);

  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  const reopened = await mountDialog(page);
  await reopened.getByRole("button", { name: "保存済みキーを選ぶ", exact: true }).click();
  await expect(reopened.getByLabel("XRift APIキー", { exact: true })).toHaveValue("fixture-key");
});

test("狭い画面でも別のキーや読み取り失敗から保存をやり直せる", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openCompletedUpload(page);
  await dialog.getByRole("button", { name: "APIキーをブラウザに保存", exact: true }).click();
  const verify = dialog.getByRole("button", { name: "保存済みキーを確認", exact: true });
  await changeFixture(page, { saved: { id: "xrift-studio:world-publishing-api-key", type: "password", password: "old-key" } as Credential });
  await verify.click();
  await expect(dialog).toContainText("今回使ったAPIキーと異なるキーが選ばれました。");
  await changeFixture(page, { rejectRead: true });
  await verify.click();
  await expect(dialog).toContainText("保存済みキーを読み込めませんでした。");
  await changeFixture(page, { rejectRead: false });
  await dialog.getByRole("button", { name: "保存をもう一度依頼", exact: true }).click();
  await expect(dialog).toContainText("ブラウザの保存確認で「保存」を選んでください。");
  await page.screenshot({ path: testInfo.outputPath("save-requested-mobile.png") });
  for (const button of [verify, dialog.getByRole("button", { name: "保存をもう一度依頼", exact: true }), dialog.getByRole("button", { name: "閉じる", exact: true })]) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  }
  await acceptSave(page);
  await verify.click();
  await expect(dialog).toContainText("保存済みキーを確認しました。");
});

test("保存依頼が失敗しても同じキーで再試行できる", async ({ page }, testInfo) => {
  const dialog = await openCompletedUpload(page);
  await changeFixture(page, { rejectStore: true });
  const save = dialog.getByRole("button", { name: "APIキーをブラウザに保存", exact: true });
  await save.click();
  await expect(dialog).toContainText("ブラウザに保存できませんでした。");
  await expect(save).toBeEnabled();
  await changeFixture(page, { rejectStore: false });
  await save.click();
  await expect(dialog).toContainText("ブラウザの保存確認で「保存」を選んでください。");
  await page.screenshot({ path: testInfo.outputPath("save-requested-desktop.png") });
  await acceptSave(page);
  await dialog.getByRole("button", { name: "保存済みキーを確認", exact: true }).click();
  await expect(dialog).toContainText("保存済みキーを確認しました。");
});
