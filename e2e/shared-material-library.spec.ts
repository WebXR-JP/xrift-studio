import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
const root = "https://shared-material-library.kkkkkkasdad.chatgpt.site";
const pack = "https://shared-material-library-01.kkkkkkasdad.chatgpt.site";
const glb = readFileSync(new URL("../public/visual-editor/catalog-samples/catalog-vase.glb", import.meta.url));
const sha256 = createHash("sha256").update(glb).digest("hex");
const file = { filename: "test_vase.glb", format: "GLB", available: true, url: `${pack}/api/v1/download/test_vase.glb?v=${sha256.slice(0,16)}`, size: glb.length, sha256 };
const model = { id: "test_vase", name: "木製ランタン", category: "家具", type: "model", formats: ["GLB"], animations: [], files: [file], available: true, license: null, thumbnail: null };
const json = (body: unknown) => ({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
async function mockApi(page: Page, download = file) {
  await page.route(`${root}/api/v1/assets?*`, (route) => route.fulfill(json({ items: [model], total: 1, limit: 100, page: 1, pages: 1 })));
  await page.route(`${root}/api/v1/assets/test_vase`, (route) => route.fulfill(json(model)));
  await page.route(`${root}/api/v1/files/test_vase`, (route) => route.fulfill(json({ id: "test_vase", files: [download] })));
  await page.route(file.url, (route) => route.fulfill({ contentType: "model/gltf-binary", headers: { "access-control-allow-origin": "*" }, body: glb }));
}
test("ブラウザの一覧からGLBを取り込み、未指定のライセンスと元データを再読み込み後も保持する", async ({ page }) => {
  const imageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("An empty string")) imageErrors.push(message.text());
  });
  await mockApi(page);
  await page.goto("/editor.html");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドを作る/ }).click();
  await page.getByRole("textbox", { name: "プロジェクト名" }).fill("素材庫API検証");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await page.getByRole("region", { name: "Assets", exact: true }).getByRole("button", { name: "アセットストア", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "アセットストア" });
  await dialog.getByRole("button", { name: /素材庫.*モデル/ }).click();
  const list = dialog.getByRole("region", { name: "素材庫のアセット一覧" });
  const search = list.getByRole("textbox", { name: "素材庫を検索" });
  const card = list.getByRole("button", { name: "木製ランタン Model", exact: true });
  await expect(card).toBeVisible();
  await expect(card.getByText("プレビューなし")).toBeVisible();
  await expect(dialog.locator('img:not([src]), img[src=""]')).toHaveCount(0);
  await search.fill("存在しないモデル");
  await expect(card).toBeHidden();
  await expect(list).toContainText("条件に合うアセットがありません");
  await search.fill("");
  await expect(dialog.getByRole("button", { name: "プロジェクトに追加" })).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath("shared-library-desktop.png") });
  await dialog.getByRole("button", { name: "プロジェクトに追加" }).click();
  await expect(dialog.getByRole("status")).toContainText("木製ランタン");
  await dialog.getByRole("button", { name: "「アセットストア」を閉じる" }).click();
  await expect(page.getByRole("status", { name: "変更は自動保存されています" })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /ワールド ビジュアルエディター 素材庫API検証/ }).click();
  const saved = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const storage = await load("/src/lib/browser-project-storage.ts");
    const [project] = await storage.listBrowserProjects();
    const files = await storage.readBrowserVisualProject(project.path);
    const manifest = JSON.parse(files.assetManifestJson);
    const asset = Object.values(manifest.assets).find((item: any) => item.kind === "model" && item.name === "木製ランタン") as any;
    const bytes = await storage.readBrowserFile(project.path, asset.source.relativePath);
    return { asset, bytes: Array.from(bytes as Uint8Array) };
  });
  expect(saved.asset.sourceHash).toBe(sha256);
  expect(saved.asset.attribution).toMatchObject({ providerId: "shared-material-library", licenseName: "未指定" });
  expect(Buffer.from(saved.bytes)).toEqual(glb);
  expect(saved.asset.importMetadata).toBeTruthy();
  await expect(page.getByRole("button", { name: /Models 1/ })).toBeVisible();
  await page.getByRole("button", { name: /Models 1/ }).click();
  const assets = page.getByRole("region", { name: "Assets", exact: true });
  const assetCard = assets.locator('button[title^="木製ランタンを選択"]');
  await assetCard.click({ button: "right" });
  await page.getByRole("button", { name: "シーンへ配置", exact: true }).click();
  await expect(page.getByRole("treeitem", { name: /木製ランタン/ }).first()).toBeVisible();
  expect(imageErrors).toEqual([]);
});

test("ページ一覧をキャッシュし、未表示の素材も検索対象に含める", async ({ page }) => {
  const requests: number[] = [];
  await page.route(`${root}/api/v1/assets?*`, (route) => {
    const number = Number(new URL(route.request().url()).searchParams.get("page"));
    requests.push(number);
    const items = number === 1 ? Array.from({ length: 100 }, (_, index) => ({ ...model, id: `model_${index}` })) : [{ ...model, id: "last_model" }];
    return route.fulfill(json({ items, total: 101, page: number, pages: 2, limit: 100 }));
  });
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const store = await load("/src/lib/shared-material-library-store.ts");
    const assets = await store.listSharedLibraryAssets();
    await store.listSharedLibraryAssets();
    return { count: assets.length, last: assets.at(-1)?.externalId };
  });
  expect(result).toEqual({ count: 101, last: "last_model" });
  expect(requests).toEqual([1, 2]);
});

for (const failure of ["hash", "size", "url", "unavailable", "html"] as const) {
  test(`${failure}のファイルは保存しない`, async ({ page }) => {
    await mockApi(page, { ...file,
      ...(failure === "hash" ? { sha256: "0".repeat(64) } : {}),
      ...(failure === "size" ? { size: glb.length + 1 } : {}),
      ...(failure === "url" ? { url: "https://evil.example/test_vase.glb" } : {}),
      ...(failure === "unavailable" ? { available: false } : {}),
    });
    if (failure === "html") await page.route(file.url, (route) => route.fulfill({ body: "<!doctype html>", headers: { "access-control-allow-origin": "*" } }));
    await page.goto("/e2e.html?scenario=ready");
    const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
      const store = await load("/src/lib/shared-material-library-store.ts");
      let writes = 0;
      try {
        await store.installSharedLibraryAsset("isolated-test", { providerId: "shared-material-library", externalId: "test_vase", resolution: "test_vase.glb" }, async () => { writes++; });
        return { writes, error: "" };
      } catch (error) { return { writes, error: String(error) }; }
    });
    expect(result.writes).toBe(0);
    expect(result.error).toMatch(/ハッシュ|容量|配布先|配信|形式/);
  });
}

test("アニメーションGLBの選択とデスクトップのアトミック保存", async ({ page }) => {
  const animated = { ...file, filename: "test_vase_animated.glb", animated: true, url: `${pack}/api/v1/download/test_vase_animated.glb?v=${sha256.slice(0,16)}` };
  await mockApi(page);
  await page.route(`${root}/api/v1/files/test_vase`, (route) => route.fulfill(json({ id: "test_vase", files: [file, animated] })));
  await page.route(animated.url, (route) => route.fulfill({ body: glb, headers: { "access-control-allow-origin": "*" } }));
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const calls: any[] = [];
    (window as any).__TAURI_INTERNALS__ = { invoke: async (command: string, args: unknown) => { calls.push({ command, args }); } };
    try {
      const { tauri } = await load("/src/lib/tauri.ts");
      const options = await tauri.getExternalStoreAssetOptions("shared-material-library", "test_vase");
      const installed = await tauri.installExternalStoreAsset("/isolated-test", { providerId: "shared-material-library", externalId: "test_vase", resolution: "test_vase_animated.glb" });
      return { options, installed, calls: calls.filter((call) => call.command === "commit_visual_asset_import") };
    } finally { delete (window as any).__TAURI_INTERNALS__; }
  });
  expect(result.options.resolutions).toHaveLength(2);
  expect(result.options.resolutions[1].label).toContain("アニメーションあり");
  expect(result.installed.externalId).toBe("test_vase_animated");
  expect(result.calls).toHaveLength(1);
  expect(Buffer.from(result.calls[0].args.writes[0].dataUrl.split(",")[1], "base64")).toEqual(glb);
});

test("PNGマスクをLinearのTextureとして元の容量で保存する", async ({ page }) => {
  const png = readFileSync(new URL("../public/favicon.png", import.meta.url));
  const digest = createHash("sha256").update(png).digest("hex");
  const maskFile = { filename: "cloud.png", format: "PNG", available: true, url: `${pack}/api/v1/download/cloud.png`, size: png.length, sha256: digest };
  const mask = { ...model, id: "cloud", type: "mask", files: [maskFile] };
  await page.route(`${root}/api/v1/assets/cloud`, (route) => route.fulfill(json(mask)));
  await page.route(`${root}/api/v1/files/cloud`, (route) => route.fulfill(json({ id: "cloud", files: [maskFile] })));
  await page.route(maskFile.url, (route) => route.fulfill({ body: png, headers: { "access-control-allow-origin": "*" } }));
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const store = await load("/src/lib/shared-material-library-store.ts");
    const apply = await load("/src/lib/visual-editor/external-store.ts");
    const writes: any[] = [];
    const installed = await store.installSharedLibraryAsset("isolated-test", { providerId: "shared-material-library", externalId: "cloud", resolution: "cloud.png" }, async (_path: string, _id: string, entries: any[]) => { writes.push(...entries); });
    const applied = apply.applyExternalStoreInstall({ assets: {}, folders: {} } as any, installed);
    return { installed, applied, writes };
  });
  expect(result.applied.kind).toBe("texture");
  const asset = result.applied.manifest.assets[result.applied.primaryAssetId];
  expect(asset.kind).toBe("texture");
  expect(asset.importSettings.colorSpace).toBe("linear");
  expect(asset.importMetadata.byteLength).toBe(png.length);
  expect(asset.sourceHash).toBe(digest);
  expect(Object.keys(result.applied.manifest.assets)).toHaveLength(1);
  expect(Buffer.from(result.writes[0].dataUrl.split(",")[1], "base64")).toEqual(png);
});
