import { expect, test, type Page } from "@playwright/test";

const itemId = "11111111-1111-4111-8111-111111111111";
const token = "xrift_sk_browser-item-fixture";
const apiRoot = "https://api.xrift.net/api/public/v1";
const uploadRoot = "https://xrift-item-upload.fixture.invalid";
const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, PUT, OPTIONS", "access-control-allow-headers": "Authorization, Content-Type" };
const browserErrors = new Map<Page, string[]>();
// Compilation, integrity checking and 7 MB of shell files can take longer
// when other rendering audits run concurrently. Normal UI assertions keep 30s.
const uploadOutcome = { timeout: 90_000 };

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  browserErrors.set(page, errors);
});
test.afterEach(({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
  browserErrors.delete(page);
});

async function publicationApi(page: Page, rejectStatus?: 401 | 403, rejectStage: "create" | "urls" | "complete" = "create", kind: "item" | "world" = "item") {
  const calls: string[] = [];
  const metadata: Array<Record<string, unknown>> = [];
  const files = new Map<string, Buffer>();
  const contentBase = `${apiRoot}/${kind === "item" ? "items" : "worlds"}`;
  let version = 0;
  await page.route("https://api.xrift.net/**", async route => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ headers: cors, body: "" });
    calls.push(`${request.method()} ${new URL(request.url()).pathname}`);
    expect(request.headers().authorization).toBe(`Bearer ${token}`);
    const path = request.url();
    const shouldReject = rejectStage === "create" ? path === contentBase
      : path.endsWith(rejectStage === "urls" ? "/upload-urls" : "/complete");
    if (rejectStatus && shouldReject) return route.fulfill({ status: rejectStatus, headers: cors, contentType: "application/json", body: JSON.stringify({ error: "fixture permission denied" }) });
    let result: object;
    if (path === contentBase) result = { id: itemId };
    else if (path === `${contentBase}/${itemId}/upload-urls`) {
      const body = request.postDataJSON() as { files: Array<{ path: string }>; name: string };
      metadata.push(body);
      version++;
      result = { versionId: `version-${version}`, versionNumber: version, contentHash: "fixture-server-hash", uploadUrls: body.files.map(file => ({ uploadUrl: `${uploadRoot}/${encodeURIComponent(file.path)}` })) };
    } else if (path === `${contentBase}/${itemId}/complete`) result = { [`${kind}Id`]: itemId, status: "pending" };
    else throw new Error(`Unexpected XRift request: ${request.url()}`);
    return route.fulfill({ headers: cors, contentType: "application/json", body: JSON.stringify(result) });
  });
  await page.route(`${uploadRoot}/**`, async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ headers: cors, body: "" });
    expect(route.request().headers().authorization).toBeUndefined();
    files.set(decodeURIComponent(new URL(route.request().url()).pathname.slice(1)), route.request().postDataBuffer()!);
    return route.fulfill({ headers: cors, body: "" });
  });
  return { calls, metadata, files };
}

async function createItem(page: Page) {
  await page.goto("/editor.html");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /アイテムを作る/ }).click();
  await page.getByRole("textbox", { name: "プロジェクト名" }).fill("ブラウザ公開Item E2E");
  await page.getByRole("button", { name: "作成して開く", exact: true }).click();
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
}

async function openUpload(page: Page) {
  await page.getByRole("button", { name: "XRiftへ公開", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "XRiftへ公開", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("write:items");
  return dialog;
}

async function openSeededItem(page: Page, mode: "shader" | "script") {
  await page.goto("/e2e.html?scenario=ready");
  const name = await page.evaluate(async mode => {
    const fixtureUrl = "/e2e/browser-item-publish.fixture.ts";
    return (await import(/* @vite-ignore */ fixtureUrl)).seedBrowserItem(mode);
  }, mode);
  await page.goto("/editor.html");
  await page.getByRole("button", { name: new RegExp(`アイテム ビジュアルエディター ${name}`) }).click();
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
}

test("ブラウザでItemを新規送信し、再読み込み後も同じItemを更新する", async ({ page }, testInfo) => {
  const fixture = await publicationApi(page);
  await createItem(page);
  const dialog = await openUpload(page);
  await expect(dialog).toContainText("新しいアイテムとして送信");
  await dialog.getByRole("button", { name: "シーンから撮影", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "公開用サムネイル" })).toBeVisible();
  await dialog.getByLabel("XRift APIキー", { exact: true }).fill(token);
  await dialog.getByRole("button", { name: "アイテムをアップロード", exact: true }).click();
  await expect(dialog).toContainText("XRiftへのファイル送信が完了しました", uploadOutcome);
  await expect(dialog).toContainText(`アイテムID: ${itemId}`);
  await expect(dialog).toContainText("バージョン: 1");
  await page.screenshot({ path: testInfo.outputPath("item-publication-complete.png") });
  expect(fixture.metadata[0]).toMatchObject({ name: "ブラウザ公開Item E2E", thumbnailPath: "thumbnail.png", permissions: { allowedCodeRules: expect.arrayContaining(["no-network-without-permission"]) } });
  expect(fixture.files.get("thumbnail.png")!.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(fixture.metadata[0]).not.toHaveProperty("physics");
  expect(fixture.metadata[0]).not.toHaveProperty("camera");
  const manifest = JSON.parse(fixture.files.get("xrift-runtime.json")!.toString()) as { projectKind: string };
  expect(manifest.projectKind).toBe("item");
  expect(fixture.files.get("remoteEntry.js")!.toString()).toContain("./Item");

  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /アイテム ビジュアルエディター ブラウザ公開Item E2E/ }).click();
  const reopened = await openUpload(page);
  await expect(reopened).toContainText(`更新先: ${itemId}`);
  await reopened.getByLabel("XRift APIキー", { exact: true }).fill(token);
  await reopened.getByRole("button", { name: "このアイテムを更新", exact: true }).click();
  await expect(reopened).toContainText("バージョン: 2", uploadOutcome);
  expect(fixture.calls.filter(call => call === "POST /api/public/v1/items")).toHaveLength(1);
  expect(fixture.calls.filter(call => call.endsWith("/complete"))).toHaveLength(2);
  expect(fixture.calls.some(call => call.includes("/worlds"))).toBe(false);
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(token);
  const stored = await page.evaluate(async () => {
    const url = "/src/lib/browser-project-storage.ts";
    const storage = await import(/* @vite-ignore */ url);
    const path = await storage.restoreBrowserProject();
    const pending = await storage.readBrowserUploadAttempt(path);
    const files: Map<string, Uint8Array> = await storage.getBrowserProjectFiles(path);
    return { pending, json: [...files].filter(([name]) => name.endsWith(".json")).map(([, bytes]) => new TextDecoder().decode(bytes)).join("\n") };
  });
  expect(stored.pending).toBeNull();
  expect(stored.json).not.toContain(token);
});

for (const status of [401, 403] as const) {
  test(`Item公開の${status}エラーは権限を案内し、再試行と制作データを残す`, async ({ page }) => {
    const fixture = await publicationApi(page, status);
    await createItem(page);
    const dialog = await openUpload(page);
    await dialog.getByLabel("XRift APIキー", { exact: true }).fill(token);
    await dialog.getByRole("button", { name: "アイテムをアップロード", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("write:items", uploadOutcome);
    await expect(dialog.getByRole("button", { name: "アイテムをアップロード", exact: true })).toBeEnabled();
    expect(fixture.calls).toEqual(["POST /api/public/v1/items"]);
    expect(fixture.files.size).toBe(0);
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
  });
}

test("ブラウザから送信した実際のItemシェルは元のGLSLと位置・色を保って描画する", async ({ page }) => {
  const fixture = await publicationApi(page);
  await openSeededItem(page, "shader");
  const dialog = await openUpload(page);
  await dialog.getByLabel("XRift APIキー", { exact: true }).fill(token);
  await dialog.getByRole("button", { name: "アイテムをアップロード", exact: true }).click();
  await expect(dialog).toContainText("XRiftへのファイル送信が完了しました", uploadOutcome);
  expect(fixture.metadata[0]).toMatchObject({ name: "Item shader公開検証", description: "XRift Studioで制作するビジュアルプロジェクト" });
  await page.route("**/__item-publication-fixture/**", async route => {
    const path = new URL(route.request().url()).pathname.split("/__item-publication-fixture/")[1]!;
    const data = fixture.files.get(path);
    if (!data) throw new Error(`The uploaded Item is missing ${path}`);
    return route.fulfill({ body: data, contentType: path.endsWith(".js") ? "application/javascript" : "application/json" });
  });
  await page.goto("/e2e.html?scenario=ready");
  const report = await page.evaluate(async () => {
    const fixtureUrl = "/e2e/browser-item-publish.fixture.ts";
    const m = await import(/* @vite-ignore */ fixtureUrl);
    return m.renderPublishedItem(`${location.origin}/__item-publication-fixture/`);
  });
  expect(report.shader).toContain("vec4(0.9, 0.12, 0.03, 1.0)");
  expect(report.position).toEqual([0, 0.75, 0]);
  expect(report.actual).toEqual(report.expected);
  expect(report.actual.filter((value: number, index: number) => index % 4 === 0 && value > 200).length).toBeGreaterThan(1000);
});

test("スクリプトを含むItemは送信前にデスクトップ版を案内し制作データを保つ", async ({ page }) => {
  const fixture = await publicationApi(page);
  await openSeededItem(page, "script");
  const dialog = await openUpload(page);
  await dialog.getByLabel("XRift APIキー", { exact: true }).fill(token);
  await dialog.getByRole("button", { name: "アイテムをアップロード", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("スクリプトを含む作品はブラウザ版から公開できません。デスクトップ版から公開してください。", uploadOutcome);
  expect(fixture.calls).toEqual([]);
  expect(fixture.files.size).toBe(0);
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
});

for (const stage of ["urls", "complete"] as const) {
  test(`新規Item作成後の${stage}拒否では再読込後も送信保留とIDを残し重複作成を防ぐ`, async ({ page }, testInfo) => {
    const fixture = await publicationApi(page, 403, stage);
    await createItem(page);
    const dialog = await openUpload(page);
    await dialog.getByLabel("XRift APIキー", { exact: true }).fill(token);
    await dialog.getByRole("button", { name: "アイテムをアップロード", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("結果が分かるまで再送しないでください。", uploadOutcome);
    await expect(dialog.getByRole("alert")).toContainText(itemId);
    await expect(dialog.getByRole("button", { name: "アイテムをアップロード", exact: true })).toHaveCount(0);
    expect(fixture.calls.filter(call => call === "POST /api/public/v1/items")).toHaveLength(1);
    expect(fixture.files.size > 0).toBe(stage === "complete");
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: /アイテム ビジュアルエディター ブラウザ公開Item E2E/ }).click();
    await page.getByRole("button", { name: "XRiftへ公開", exact: true }).click();
    const reopened = page.getByRole("dialog", { name: "XRiftへ公開", exact: true });
    await expect(reopened.getByRole("alert")).toContainText("前回の送信結果が未確認です。");
    await expect(reopened.getByRole("alert")).toContainText(itemId);
    await expect(reopened).toContainText("送信結果を確認するまで、新しい送信は保留します。");
    await expect(reopened.getByRole("button", { name: "アイテムをアップロード", exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("item-publication-held.png") });
    expect(fixture.calls.filter(call => call === "POST /api/public/v1/items")).toHaveLength(1);
    // This isolated test fixture has no remote publication; the user must make this check on XRift.
    await reopened.getByRole("button", { name: "未公開を確認して送信保留を解除", exact: true }).click();
    await expect(reopened.getByRole("button", { name: "アイテムをアップロード", exact: true })).toBeEnabled();
    expect(fixture.calls.filter(call => call === "POST /api/public/v1/items")).toHaveLength(1);
  });
}

test("World公開も実SDKで新規送信しワールド専用設定と送信保留の解除を保つ", async ({ page }) => {
  const fixture = await publicationApi(page, undefined, "create", "world");
  await page.goto("/editor.html");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドを作る/ }).click();
  await page.getByRole("textbox", { name: "プロジェクト名" }).fill("ブラウザ公開World E2E");
  await page.getByRole("button", { name: "作成して開く", exact: true }).click();
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
  await page.getByRole("button", { name: "XRiftへ公開", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "XRiftへ公開", exact: true });
  await expect(dialog).toContainText("write:worlds");
  await dialog.getByLabel("XRift APIキー", { exact: true }).fill(token);
  await dialog.getByRole("button", { name: "ワールドをアップロード", exact: true }).click();
  await expect(dialog).toContainText("XRiftへのファイル送信が完了しました", uploadOutcome);
  await expect(dialog).toContainText(`ワールドID: ${itemId}`);
  expect(fixture.metadata[0]).toMatchObject({ name: "ブラウザ公開World E2E", physics: { gravity: expect.any(Number) }, camera: { near: expect.any(Number) },
    permissions: { allowedCodeRules: expect.arrayContaining(["no-network-without-permission"]) } });
  expect(fixture.calls.filter(call => call === "POST /api/public/v1/worlds")).toHaveLength(1);
  expect(fixture.calls.some(call => call.includes("/items"))).toBe(false);
  const pending = await page.evaluate(async () => {
    const url = "/src/lib/browser-project-storage.ts";
    const storage = await import(/* @vite-ignore */ url);
    return storage.readBrowserUploadAttempt(await storage.restoreBrowserProject());
  });
  expect(pending).toBeNull();
});

test("送信記録の読み取り失敗では既存の保留を消さず外部送信を始めない", async ({ page }) => {
  const fixture = await publicationApi(page);
  await createItem(page);
  await page.evaluate(async () => {
    const url = "/src/lib/browser-project-storage.ts";
    const storage = await import(/* @vite-ignore */ url);
    await storage.writeBrowserUploadAttempt(await storage.restoreBrowserProject(), {
      kind: "item", startedAt: new Date().toISOString(), targetId: "previous-pending-item",
    });
  });
  // Only the failure is injected; IndexedDB and every other storage operation remain real.
  await page.route("**/src/lib/browser-project-storage.ts*", async route => {
    if (new URL(route.request().url()).searchParams.has("publication-original")) return route.continue();
    return route.fulfill({ contentType: "application/javascript", body: `
      export * from "/src/lib/browser-project-storage.ts?publication-original";
      export async function readBrowserUploadAttempt() { throw new Error("fixture storage read failed"); }
    ` });
  });
  await page.reload();
  await page.getByRole("button", { name: /アイテム ビジュアルエディター ブラウザ公開Item E2E/ }).click();
  const dialog = await openUpload(page);
  await expect(dialog.getByRole("alert")).toContainText("前回の送信記録を読み込めませんでした。");
  await dialog.getByLabel("XRift APIキー", { exact: true }).fill(token);
  await dialog.getByRole("button", { name: "アイテムをアップロード", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("fixture storage read failed");
  const pending = await page.evaluate(async () => {
    const url = "/src/lib/browser-project-storage.ts?publication-original";
    const storage = await import(/* @vite-ignore */ url);
    return storage.readBrowserUploadAttempt(await storage.restoreBrowserProject());
  });
  expect(pending.targetId).toBe("previous-pending-item");
  expect(fixture.calls).toEqual([]);
});
