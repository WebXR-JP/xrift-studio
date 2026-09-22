import { expect, test, type Page } from "@playwright/test";
import type { SceneDocument } from "../src/lib/visual-editor/scene-document";
import type { AssetManifest } from "../src/lib/visual-editor/asset-manifest";

async function readStoredWorld(page: Page): Promise<{ scene: SceneDocument; assets: AssetManifest }> {
  return page.evaluate(async () => {
    const releaseWindow = window as typeof window & {
      __XRIFT_RELEASE_E2E__?: { projects: Array<{ name: string; path: string }> };
    };
    const project = releaseWindow.__XRIFT_RELEASE_E2E__?.projects.find((entry) => entry.name === "jev-world-wiring");
    if (!project) throw new Error("The isolated visual project was not created");
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    const files = await tauri.readVisualProject(project.path);
    return { scene: JSON.parse(files.sceneDocuments[0].content), assets: JSON.parse(files.assetManifestJson) };
  });
}

test("actual editor wiring: world creation rail preserves draft, creates Terrain/Spawn and Undo restores the source (mocked native API)", async ({ page }) => {
  const errors: string[] = [];
  // Existing world-components imports prefetch this external UI font even when
  // the Scene contains no text. It is unavailable in restricted CI and is not
  // a world/model asset. Record that exact prefetch failure separately; every
  // other uncaught error remains a test failure.
  const externalFontErrors: string[] = [];
  await page.route("https://public.xrift.net/fonts/msdf/NotoSansJP/metrics.json?v=3", (route) => route.abort("failed"));
  page.on("pageerror", (error) => {
    if (error.message === "Failed to fetch" && error.stack?.includes("loadFont")) externalFontErrors.push(error.message);
    else errors.push(error.message);
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("heading", { name: "プロジェクト", exact: true })).toBeVisible();
  await page.addStyleTag({ url: "/node_modules/@fontsource/noto-sans-jp/japanese-400.css" });
  await page.addStyleTag({ content: "body { font-family: 'Noto Sans JP', sans-serif; }" });

  await page.evaluate(async () => {
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    // Only native service boundaries are replaced. App, VisualEditorPrototype,
    // history, the generator, Scene View and project persistence use their real
    // UI/document code on the existing in-memory release E2E project backend.
    tauri.isAvailable = () => true;
    tauri.getJevStatus = async () => ({ configured: true, model: "jev-latest", baseUrl: "https://api.typesafe.ai" });
    tauri.getSystemDictationStatus = async () => ({
      platform: "windows", canStart: true, shortcut: "Windows + H", instructions: "音声入力はこのテストでは起動しません。",
    });
    tauri.startSystemDictation = async () => { throw new Error("This wiring test must not activate dictation"); };
    document.body.dataset.jevSmokeCalls = "0";
    tauri.jevSystemOne = async (request: Record<string, unknown>) => {
      document.body.dataset.jevSmokeCalls = String(Number(document.body.dataset.jevSmokeCalls) + 1);
      document.body.dataset.jevSmokeRequest = JSON.stringify(request);
      const choices = {
        support: "supported", theme: "meadow", size: "small", time: "day",
        terrain: "flat", layout: "clearing", environment: "keep", sky: "clear",
        finish: "keep", tree: "none", rocks: "none", bamboo: "none", bench: "none",
        campfire: "none", lantern: "none", fountain: "none",
      };
      return new Promise((resolve) => window.addEventListener("jev-editor-smoke-response", () => resolve({
        answers: Object.fromEntries(Object.entries(choices).map(([id, choice]) => [id, {
          type: "choice", choice, confidence: 1, probabilities: { [choice]: 1 },
        }])),
      }), { once: true }));
    };
    const marker = document.createElement("aside");
    marker.textContent = "UI integration test: mocked native API; real Scene construction";
    marker.style.cssText = "position:fixed;right:8px;top:4px;z-index:1000;font:11px sans-serif;background:white;color:#475569;padding:4px;pointer-events:none";
    document.body.append(marker);
  });

  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("jev-world-wiring");
  await page.getByRole("button", { name: "作成して開く" }).click();
  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });
  await expect(tree).toBeVisible();
  const source = await readStoredWorld(page);
  const sourceIds = Object.keys(source.scene.entities).sort();
  const sourceAssetIds = Object.keys(source.assets.assets).sort();
  const open = page.getByRole("button", { name: "ワールド作成", exact: true });
  await expect(open).toBeVisible();
  await open.click();
  const panel = page.getByRole("dialog", { name: "ワールド作成", exact: true });
  const prompt = panel.getByLabel("作りたいワールド", { exact: true });
  await expect(prompt).toBeEditable();
  const goal = "木を置かず、歩ける小さな草原を作って";
  await prompt.fill(goal);
  await panel.getByRole("button", { name: "パネルを閉じる", exact: true }).click();
  await expect(panel).toBeHidden();
  await open.click();
  await expect(prompt).toHaveValue(goal);
  await panel.getByRole("button", { name: "ワールドを作る", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-jev-smoke-calls", "1");
  await expect(panel.getByRole("button", { name: "構成を決めています", exact: true })).toBeDisabled();
  expect(JSON.parse(await page.locator("body").getAttribute("data-jev-smoke-request") ?? "{}").state).toMatchObject({ request: goal });
  await page.evaluate(() => window.dispatchEvent(new Event("jev-editor-smoke-response")));
  await expect(panel).toContainText("ワールドを作成しました。");
  await expect(tree.getByRole("treeitem", { selected: true })).toContainText("Jev · 草原");
  await expect.poll(async () => Object.values((await readStoredWorld(page)).scene.entities).some((entity) => entity.name === "歩ける地面")).toBe(true);
  const built = await readStoredWorld(page);
  const ground = Object.values(built.scene.entities).find((entity) => entity.name === "歩ける地面");
  const spawn = Object.values(built.scene.entities).find((entity) => entity.name === "開始位置");
  expect(ground?.components).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "mesh", geometry: expect.objectContaining({ kind: "terrain" }) }),
    expect.objectContaining({ type: "collider", enabled: true }),
  ]));
  expect(spawn?.components).toEqual(expect.arrayContaining([expect.objectContaining({ schemaId: "xrift.spawn-point", enabled: true })]));
  const undo = panel.getByRole("button", { name: "元に戻す", exact: true });
  await expect(undo).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath("generated-world-editor.png"), fullPage: true });
  await undo.click();
  await expect(tree.getByText("Jev · 草原", { exact: true })).toHaveCount(0);
  await expect(undo).toBeDisabled();
  await expect.poll(async () => Object.keys((await readStoredWorld(page)).scene.entities).sort()).toEqual(sourceIds);
  expect(Object.keys((await readStoredWorld(page)).assets.assets).sort()).toEqual(sourceAssetIds);
  await expect(page.locator("body")).toHaveAttribute("data-jev-smoke-calls", "1");
  expect(externalFontErrors.length).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
