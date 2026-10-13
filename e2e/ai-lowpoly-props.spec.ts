import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const root = "https://apps.n-jelly.com/ai-lowpoly-props";
const version = "a".repeat(64);
// A real repository GLB exercises the production model importer and renderer.
const glb = readFileSync(new URL("../public/visual-editor/catalog-samples/catalog-vase.glb", import.meta.url));
const sha256 = createHash("sha256").update(glb).digest("hex");
const file = { format: "glb", url: `${root}/assets/test_vase.${sha256.slice(0, 12)}.glb`, size: glb.length, sha256 };
const model = {
  id: "test_vase", name_ja: "木製ランタン", name_en: "Wooden Lantern", tags: ["wood", "outdoor"],
  triangles: 1262, dimensions_m: [1, 2, 3], previews: [], downloads: [file],
  keywords_ja: ["らんたん", "木製", "灯り"], keywords_en: ["wooden lantern"],
  asset_license: { id: "CC0-1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
};
const json = (body: unknown) => ({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });

async function mockApi(page: Page, detail: unknown = model) {
  await page.route(`${root}/api/v1/assets?*`, (route) => route.fulfill(json({
    items: [model], total: 1, limit: 100, offset: 0, next_offset: null,
    catalog_version: version, catalog_asset_count: 1,
  })));
  await page.route(`${root}/api/v1/files/test_vase`, (route) => route.fulfill(json({ id: "test_vase", catalog_version: version, files: [file] })));
  await page.route(`${root}/api/v1/info/test_vase`, (route) => route.fulfill(json(detail)));
  await page.route(file.url, (route) => route.fulfill({
    contentType: "model/gltf-binary", headers: { "access-control-allow-origin": "*" }, body: glb,
  }));
}

test("ブラウザの一覧からGLBを取り込み、CC0と元データを再読み込み後も保持する", async ({ page }) => {
  const imageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("An empty string")) imageErrors.push(message.text());
  });
  await mockApi(page);
  await page.goto("/editor.html");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドを作る/ }).click();
  await page.getByRole("textbox", { name: "プロジェクト名" }).fill("ローポリAPI検証");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await page.getByRole("region", { name: "Assets", exact: true }).getByRole("button", { name: "アセットストア", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "アセットストア" });
  await dialog.getByRole("button", { name: /AI LOWPOLY PROPS.*ローポリ/ }).click();
  const list = dialog.getByRole("region", { name: "AI LOWPOLY PROPSのアセット一覧" });
  const search = list.getByRole("textbox", { name: "AI LOWPOLY PROPSを検索" });
  const card = list.getByRole("button", { name: "木製ランタン Model", exact: true });
  await expect(card).toBeVisible();
  await expect(card.getByText("プレビューなし")).toBeVisible();
  await expect(dialog.locator('img:not([src]), img[src=""]')).toHaveCount(0);
  await search.fill("木製,ﾗﾝﾀﾝ");
  await expect(card).toBeVisible();
  await search.fill("ＷＯＯＤＥＮ lantern");
  await expect(card).toBeVisible();
  await search.fill("存在しないモデル");
  await expect(card).toBeHidden();
  await expect(list).toContainText("条件に合うアセットがありません");
  await search.fill("");
  await expect(dialog.getByRole("button", { name: "プロジェクトに追加" })).toBeEnabled();
  await page.screenshot({ path: "/tmp/ai-lowpoly-props-desktop.png" });
  await dialog.getByRole("button", { name: "プロジェクトに追加" }).click();
  await expect(dialog.getByRole("status")).toContainText("木製ランタン");
  await dialog.getByRole("button", { name: "「アセットストア」を閉じる" }).click();
  await expect(page.getByRole("status", { name: "変更は自動保存されています" })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /ワールド ビジュアルエディター ローポリAPI検証/ }).click();
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
  expect(saved.asset.attribution).toMatchObject({ providerId: "ai-lowpoly-props", licenseName: "CC0-1.0" });
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

test("ページ取得中の409から先頭へ戻り、未表示モデルも検索する", async ({ page }) => {
  const requests: string[] = [];
  let changed = false;
  await page.route(`${root}/api/v1/assets?*`, (route) => {
    const url = new URL(route.request().url());
    requests.push(url.search);
    const offset = Number(url.searchParams.get("offset"));
    if (offset && !changed) {
      changed = true;
      return route.fulfill({ ...json({ error: { code: "catalog_changed" } }), status: 409 });
    }
    const currentVersion = (changed ? "b" : "a").repeat(64);
    const items = offset ? [{ ...model, id: "last_model", name_ja: "最後のモデル" }]
      : Array.from({ length: 100 }, (_, index) => ({ ...model, id: `model_${index}` }));
    return route.fulfill(json({ items, total: 101, limit: 100, offset, next_offset: offset ? null : 100, catalog_version: currentVersion, catalog_asset_count: 101 }));
  });
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const store = await load("/src/lib/ai-lowpoly-props-store.ts");
    const assets = await store.listAiLowpolyPropsAssets();
    return { count: assets.length, matches: assets.filter((asset: any) => store.matchesAiLowpolyPropsQuery(asset, "最後")) };
  });
  expect(result.count).toBe(101);
  expect(result.matches.map((asset: any) => asset.externalId)).toEqual(["last_model"]);
  expect(requests.map((query) => new URLSearchParams(query).get("offset"))).toEqual(["0", "100", "0", "100"]);
  expect(new URLSearchParams(requests[3]).get("catalog_version")).toBe("b".repeat(64));
});

for (const failure of ["hash", "url", "license", "size"] as const) {
  test(`${failure}が不正なGLBを保存しない`, async ({ page }) => {
    const downloads = [{ ...file,
      ...(failure === "hash" ? { sha256: "0".repeat(64) } : {}),
      ...(failure === "url" ? { url: "https://example.com/other.glb" } : {}),
      ...(failure === "size" ? { size: glb.length + 1 } : {}),
    }];
    await mockApi(page, { ...model, downloads, ...(failure === "license" ? { asset_license: { id: "other" } } : {}) });
    await page.goto("/e2e.html?scenario=ready");
    const result = await page.evaluate(async () => {
      const load = (path: string) => import(/* @vite-ignore */ path);
      const store = await load("/src/lib/ai-lowpoly-props-store.ts");
      let writes = 0;
      try {
        await store.installAiLowpolyPropsAsset("isolated-test", { providerId: "ai-lowpoly-props", externalId: "test_vase", resolution: "src" }, async () => { writes++; });
        return { writes, error: "" };
      } catch (error) { return { writes, error: String(error) }; }
    });
    expect(result.writes).toBe(0);
    expect(result.error).toMatch(/ハッシュ|配布先|CC0|容量/);
  });
}

test("デスクトップの取り込みは既存のアトミックIPCへ元のGLBを渡す", async ({ page }) => {
  await mockApi(page);
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const calls: any[] = [];
    (window as any).__TAURI_INTERNALS__ = { invoke: async (command: string, args: unknown) => { calls.push({ command, args }); } };
    try {
      const load = (path: string) => import(/* @vite-ignore */ path);
      const { tauri } = await load("/src/lib/tauri.ts");
      const installed = await tauri.installExternalStoreAsset("/isolated-test", { providerId: "ai-lowpoly-props", externalId: "test_vase", resolution: "src" });
      return { installed, calls: calls.filter((call) => call.command === "commit_visual_asset_import") };
    } finally { delete (window as any).__TAURI_INTERNALS__; }
  });
  expect(result.calls).toHaveLength(1);
  expect(result.calls[0].command).toBe("commit_visual_asset_import");
  expect(result.calls[0].args.transactionId).toMatch(/^asset-import-ai-lowpoly-props-/);
  expect(result.calls[0].args.writes[0].relativePath).toContain(sha256);
  expect(Buffer.from(result.calls[0].args.writes[0].dataUrl.split(",")[1], "base64")).toEqual(glb);
});
