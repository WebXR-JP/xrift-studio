import { expect, test, type Page } from "@playwright/test";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

test.use({ deviceScaleFactor: 1 });
test.setTimeout(240_000);

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}

type Capture = { image: { data: string; mimeType: string } };

async function capture(page: Page, position: number[], target: number[]): Promise<Buffer> {
  const moved = await call(page, "set_scene_view_camera", { position, target }, true);
  expect(moved.ok, JSON.stringify(moved.error)).toBe(true);
  const response = await call(page, "capture_scene_view", { showEditorHelpers: false }, true);
  expect(response.ok, JSON.stringify(response.error)).toBe(true);
  return Buffer.from((response.result as unknown as Capture).image.data, "base64");
}

/** Leaf-green pixels and mean brightness of the first picture, and the pixels that differ between the two. */
async function compare(page: Page, first: Buffer, second: Buffer): Promise<{ green: number; changed: number; pixels: number; luma: number }> {
  return page.evaluate(async ([a, b]) => {
    const read = async (data: string) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const x = await read(a!), y = await read(b!);
    let green = 0, changed = 0, luma = 0;
    for (let i = 0; i < x.length; i += 4) {
      if (x[i + 1]! > 40 && x[i + 1]! > x[i]! * 1.08 && x[i + 1]! > x[i + 2]! * 1.25) green++;
      if (Math.abs(x[i]! - y[i]!) + Math.abs(x[i + 1]! - y[i + 1]!) + Math.abs(x[i + 2]! - y[i + 2]!) > 24) changed++;
      luma += x[i]! * 0.2126 + x[i + 1]! * 0.7152 + x[i + 2]! * 0.0722;
    }
    return { green, changed, pixels: x.length / 4, luma: luma / (x.length / 4) };
  }, [first.toString("base64"), second.toString("base64")]);
}

test("木のセットを置くと、葉と樹皮のマテリアルと画像が取り込まれて、シーンの風と光で描かれる", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible({ timeout: 120_000 });
  expect((await call(page, "create_project", { name: "foliage-trees-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  // The mocked desktop shell keeps no binary files. Keep what an import writes,
  // so the editor reads back the Models and pictures it has just imported.
  await page.evaluate(async () => {
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    const files = new Map<string, string>();
    const commit = tauri.commitVisualAssetImport, readFile = tauri.readProjectFileDataUrl, readImage = tauri.readImageDataUrl;
    tauri.commitVisualAssetImport = async (projectPath: string, id: string, writes: { relativePath: string; dataUrl: string }[], ...rest: unknown[]) => {
      for (const write of writes) files.set(write.relativePath, write.dataUrl);
      return commit(projectPath, id, writes, ...rest);
    };
    tauri.readProjectFileDataUrl = async (projectPath: string, relativePath: string) =>
      files.get(relativePath) ?? readFile(projectPath, relativePath);
    tauri.readImageDataUrl = async (projectPath: string, relativePath: string) =>
      files.get(relativePath) ?? readImage(projectPath, relativePath);
  });

  const place = async (recipeId: string, position: number[]) => {
    const response = await call(page, "apply_scene_recipe", { recipeId, position }, true);
    expect(response.ok, `${recipeId}: ${JSON.stringify(response.error)}`).toBe(true);
    await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus, { timeout: 60_000 }).toBe("saved");
    return response.result!;
  };
  // The standard trees, and their lighter versions in the same arrangement
  // 30 m to the side, so each pair is seen from the same angle in the same light.
  await place("scene-recipe.foliage-broadleaf", [0, 0, 0]);
  await place("scene-recipe.foliage-garden-tree", [11, 0, 2]);
  await place("scene-recipe.foliage-shrub", [5, 0, 6]);
  await place("scene-recipe.foliage-broadleaf-light", [30, 0, 0]);
  await place("scene-recipe.foliage-garden-tree-light", [41, 0, 2]);
  await place("scene-recipe.foliage-shrub-light", [35, 0, 6]);

  // One Material and two pictures, however many trees.
  const assets = (await call(page, "list_assets", {}, true)).result as unknown as { assets: { id: string; kind: string; name: string }[] };
  const ids = assets.assets.map(asset => asset.id);
  expect(ids).toContain("foliage-shader-broadleaf-material");
  expect(ids).toContain("texture-foliage-leaves-c0c2242b0eb5");
  expect(ids).toContain("texture-foliage-bark-e0ea47af859c");
  expect(ids.filter(id => id.startsWith("foliage-shader-"))).toHaveLength(1);

  // The driver accepts both variants of the shader.
  const shader = await call(page, "get_custom_shader", { materialAssetId: "foliage-shader-broadleaf-material" }, true);
  expect(shader.ok, JSON.stringify(shader.error)).toBe(true);
  const compile = (shader.result as unknown as { compile?: { status: string } }).compile;
  await info.attach("compile", { body: JSON.stringify(compile, null, 2), contentType: "application/json" });
  expect(compile?.status).toBe("ok");

  const views: Array<[string, number[], number[]]> = [
    ["foliage-wide", [4, 5.5, 30], [2, 4.2, 0]],
    ["foliage-close", [3.5, 4.5, 9], [0.5, 5.5, 0]],
    ["foliage-garden", [11, 2.2, 11], [11, 2.6, 2]],
    ["foliage-shrubs", [5, 1.6, 11], [5, 0.9, 6]],
    ["foliage-light-wide", [34, 5.5, 30], [32, 4.2, 0]],
    ["foliage-light-close", [33.5, 4.5, 9], [30.5, 5.5, 0]],
    ["foliage-light-garden", [41, 2.2, 11], [41, 2.6, 2]],
    ["foliage-light-shrubs", [35, 1.6, 11], [35, 0.9, 6]],
  ];
  for (const [name, position, target] of views) {
    fs.writeFileSync(info.outputPath(`${name}.png`), await capture(page, position, target));
  }

  // The Scene's wind moves the leaves between two moments, and still air
  // stops them: the tree has no clock and no wind of its own.
  const closeUp: [number[], number[]] = [[3.5, 4.5, 9], [0.5, 5.5, 0]];
  const before = await capture(page, ...closeUp);
  await page.waitForTimeout(700);
  const blown = await compare(page, before, await capture(page, ...closeUp));
  expect(blown.green, JSON.stringify(blown)).toBeGreaterThan(blown.pixels * 0.1);
  expect(blown.changed, JSON.stringify(blown)).toBeGreaterThan(2000);
  expect((await call(page, "update_scene_settings", { vegetation: { windSpeed: 0 } }, true)).ok).toBe(true);
  const calm = await capture(page, ...closeUp);
  await page.waitForTimeout(700);
  const still = await compare(page, calm, await capture(page, ...closeUp));
  expect(still.changed, JSON.stringify(still)).toBeLessThan(50);

  // The Scene's key light lights them: with the light switched off only the
  // sky's fill is left. The air is still, so nothing else differs.
  const lit = await compare(page, calm, calm);
  expect((await call(page, "set_entity_enabled", { entityId: "starter-sun", enabled: false }, true)).ok).toBe(true);
  const unlit = await capture(page, ...closeUp);
  fs.writeFileSync(info.outputPath("foliage-unlit.png"), unlit);
  const dark = await compare(page, unlit, unlit);
  fs.writeFileSync(info.outputPath("wind-and-light.json"), JSON.stringify({ blown, still, lit, dark }, null, 2));
  expect(dark.green, JSON.stringify({ lit, dark })).toBeLessThan(lit.green * 0.2);
  expect(dark.luma, JSON.stringify({ lit, dark })).toBeLessThan(lit.luma * 0.75);
  expect(errors).toEqual([]);
});

test("アセットストアで木を選ぶと、いっしょに追加される素材が分かり、シーンへ追加できる", async ({ page }, info) => {
  test.setTimeout(180_000);
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("heading", { name: "プロジェクト" })).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("foliage-store");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page.getByRole("banner").getByText("ビジュアルエディター")).toBeVisible();

  const assets = page.getByRole("region", { name: "Assets" });
  const shelf = page.getByRole("region", { name: "3Dセット一覧" });
  const detail = page.getByRole("complementary", { name: "選択した3Dセットの詳細" });
  const hierarchy = page.getByRole("tree", { name: "シーンのEntity階層" });
  await assets.getByRole("button", { name: "アセットストア" }).click();
  await page.getByRole("button", { name: /^3Dセット/ }).click();
  // Three trees, each with its lighter version.
  await shelf.getByLabel("3Dセットを検索").fill("風にそよぐ");
  await expect(shelf.getByTestId("scene-recipe-card")).toHaveCount(6);
  await expect(shelf.getByRole("button", { name: /軽量版/ })).toHaveCount(3);

  // A tree brings more than its Model, and the detail says so before it is placed.
  await shelf.getByRole("button", { name: "広葉樹（風にそよぐ）", exact: true }).click();
  await expect(detail.getByText("マテリアル「広葉樹の葉と樹皮」と画像 2 枚もAssetsに追加します")).toBeVisible();
  await detail.getByRole("button", { name: "広葉樹（風にそよぐ）をシーンへ追加" }).click();
  // A set without steps to follow closes the store once it is placed.
  await expect(hierarchy.getByText("広葉樹（風にそよぐ）", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("region", { name: "3Dセット一覧" })).toBeHidden();
  await expect(assets.getByText("広葉樹の葉と樹皮").first()).toBeVisible();

  // The Material's values carry their own names in the Inspector, and the
  // ones the Scene writes are marked.
  await assets.getByText("広葉樹の葉と樹皮").first().click();
  const values = page.getByText("シェーダーの調整値").locator("xpath=ancestor::div[2]");
  for (const label of ["葉の色み", "苔の量", "枝の揺れ", "葉のそよぎ"]) {
    await expect(values.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(values.getByText("光の強さ").first()).toContainText("自動");
  await expect(values.getByText("風速").first()).toContainText("自動");
  await page.screenshot({ path: info.outputPath("foliage-inspector.png") });
});

test("ストアのカードは、木を葉と樹皮のシェーダーで描く", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 2440, height: 460 });
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const url = "/e2e/recipe-models.fixture.tsx";
    (await import(/* @vite-ignore */ url)).mount([
      "foliage-broadleaf", "foliage-broadleaf-light",
      "foliage-garden-tree", "foliage-garden-tree-light",
      "foliage-shrub", "foliage-shrub-light",
    ]);
  });
  // A card shows a captured frame once its model and its pictures have loaded.
  await expect(page.locator("section img")).toHaveCount(6, { timeout: 60_000 });
  await page.screenshot({ path: info.outputPath("foliage-cards.png") });
  expect(errors).toEqual([]);
});

/** What `renderPublishedFoliage` reports for one way of publishing. */
type PublishedTree = {
  mode: "jsx" | "runtime";
  glError: number;
  drawn: number;
  changed: number;
  mean: number[];
  image: string;
  frames: unknown;
  meshes: Array<{
    name: string;
    defines: string[];
    attributes: string[];
    uniforms: Record<string, number | number[]>;
    sampler: Record<string, Record<string, unknown>>;
  }>;
};

test("公開した木は、生成したWorldとRuntime JSONの読み込みの両方で、同じ風と光を受けて描かれる", async ({ page }, info) => {
  execFileSync(process.execPath, ["e2e/foliage-published.prepare.cjs"], { stdio: "pipe" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/e2e/foliage-trees.html");
  const reports: PublishedTree[] = [];
  for (const mode of ["jsx", "runtime"] as const) {
    try {
      reports.push(await page.evaluate(async mode => {
        const url = "/e2e/foliage-trees.fixture.tsx";
        const fixture = await import(/* @vite-ignore */ url);
        return fixture.renderPublishedFoliage(mode);
      }, mode));
    } catch (error) { throw new Error(`${mode}: ${String(error)}
Browser errors: ${JSON.stringify(errors)}`); }
  }
  for (const report of reports) {
    fs.writeFileSync(info.outputPath(`foliage-published-${report.mode}.png`), Buffer.from(report.image.split(",")[1]!, "base64"));
  }
  const summary = JSON.stringify(reports.map(({ frames: _frames, image: _image, ...report }) => report), null, 2);
  fs.writeFileSync(info.outputPath("published-foliage.json"), summary);
  await info.attach("published-foliage", { body: summary, contentType: "application/json" });
  for (const report of reports) {
    expect(report.glError, report.mode).toBe(0);
    const [bark, leaves] = report.meshes;
    // The two meshes of one Model wear the two variants of one Material.
    expect([bark!.name, leaves!.name], report.mode).toEqual(["bark", "leaves"]);
    expect(bark!.defines, report.mode).toEqual([]);
    expect(leaves!.defines, report.mode).toEqual(["FOLIAGE_LEAVES"]);
    // What the shader reads from the Model arrived on the geometry.
    expect(bark!.attributes, report.mode).toEqual(expect.arrayContaining(["_acore", "_acrown", "normal", "position", "uv"]));
    expect(leaves!.attributes, report.mode).toEqual(expect.arrayContaining(["_acrown", "_aleaf", "normal", "position", "uv"]));
    // Something green was drawn, and it moved between the two moments.
    expect(report.drawn, report.mode).toBeGreaterThan(4000);
    expect(report.mean[1], `${report.mode} ${report.mean}`).toBeGreaterThan(report.mean[0]!);
    expect(report.mean[1], `${report.mode} ${report.mean}`).toBeGreaterThan(report.mean[2]!);
    expect(report.changed, report.mode).toBeGreaterThan(200);
    for (const mesh of report.meshes) {
      // Blown and lit by the Scene: its wind and its key light, where the
      // Material's own defaults are a west wind and a stronger sun.
      expect(mesh.uniforms.uWindSpeed, report.mode).toBe(1.3);
      expect((mesh.uniforms.uWindDirection as number[])[0], report.mode).toBeCloseTo(Math.cos((120 * Math.PI) / 180), 3);
      expect(mesh.uniforms.uSunIntensity, report.mode).toBe(2.4);
      expect(mesh.uniforms.uAmbientIntensity, report.mode).toBe(0);
      // Both pictures are read through mip levels with anisotropic filtering.
      for (const sampler of Object.values(mesh.sampler)) {
        expect(sampler, report.mode).toMatchObject({ mipmaps: true, anisotropy: 4, colorSpace: "srgb" });
      }
    }
  }
  // The two ways of publishing draw the same tree.
  const [generated, loaded] = reports;
  expect(loaded!.meshes.map(mesh => mesh.uniforms)).toEqual(generated!.meshes.map(mesh => mesh.uniforms));
  expect(loaded!.meshes.map(mesh => mesh.sampler)).toEqual(generated!.meshes.map(mesh => mesh.sampler));
  expect(Math.abs(loaded!.drawn - generated!.drawn)).toBeLessThan(generated!.drawn * 0.01);
  for (const channel of [0, 1, 2]) {
    expect(Math.abs(loaded!.mean[channel]! - generated!.mean[channel]!), `channel ${channel}`).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});
