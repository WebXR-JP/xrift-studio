import { expect, test } from "@playwright/test";

test("Blender source is saved atomically, opens from Assets, and reimports without losing identity", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const first = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { tauri } = await load("/src/lib/tauri.ts");
    const { createDesktopAssetImportPlan } = await load("/src/lib/visual-editor/blender-source.ts");
    const { commitAssetImportPlanToDisk, reimportModelAssetFromDisk } = await load("/src/lib/visual-editor/asset-import-persistence.ts");
    const { createVrmAvatarFixtureBytes } = await load("/src/lib/visual-editor/compiler/vrm-avatar.fixture.ts");
    const { createStarterVisualProject } = await load("/src/lib/visual-editor/starter-templates.ts");
    const { mountBlenderSourceInspector } = await load("/src/release-e2e/blender-source.fixture.tsx");
    const { assetManifestCodec } = await load("/src/lib/visual-editor/serialization.ts");
    const bundle = createStarterVisualProject("world", "blank", "blend-isolated");
    const disk = new Map<string, string>();
    const bytes = createVrmAvatarFixtureBytes("1", "sphere");
    const editedBytes = createVrmAvatarFixtureBytes("1", "triangle");
    const state = { opened: "", conversions: 0, fail: false, updated: false, failedPreserves: false, savedBlend: false, sameId: false, reloaded: false };
    tauri.convertBlenderSource = async () => { state.conversions++; if (state.fail) throw new Error("fixture conversion failure"); return { path: "isolated.glb" }; };
    tauri.readLocalModelImportSource = async () => {
      const current = state.conversions > 1 ? editedBytes : bytes;
      return { fileName: "part.glb", dataUrl: `data:model/gltf-binary;base64,${btoa(String.fromCharCode(...current))}`, byteLength: current.byteLength };
    };
    tauri.commitVisualAssetImport = async (_: string, _id: string, writes: { relativePath: string; dataUrl: string }[]) => {
      for (const write of writes) disk.set(write.relativePath, write.dataUrl);
    };
    tauri.readProjectFileDataUrl = async (_: string, path: string) => {
      const value = disk.get(path); if (!value) throw new Error("missing fixture source"); return value;
    };
    tauri.openBlenderSource = async (_: string, path: string) => { if (!disk.has(path)) throw new Error("missing source"); state.opened = path; };
    const input = { fileName: "椅子.blend", bytes: new TextEncoder().encode("BLENDER-v500"), existingManifest: bundle.assets };
    const plan = await createDesktopAssetImportPlan("isolated", input);
    let assets = await commitAssetImportPlanToDisk("isolated", bundle.assets, plan);
    const asset = assets.assets[plan.asset.id];
    asset.importSettings.scale = 2;
    state.savedBlend = disk.has(asset.blenderSource.relativePath) && disk.has(asset.source.relativePath);
    const parsed = assetManifestCodec.parse(assetManifestCodec.serialize(assets));
    state.reloaded = parsed.ok && parsed.document.assets[asset.id].blenderSource.relativePath === asset.blenderSource.relativePath;
    const reimport = async () => {
      const next = await reimportModelAssetFromDisk("isolated", assets, asset.id);
      state.sameId = next.ok && next.manifest.assets[asset.id].importSettings.scale === 2
        && next.manifest.assets[asset.id].sourceHash !== asset.sourceHash
        && next.manifest.assets[asset.id].blenderSource.relativePath === asset.blenderSource.relativePath;
      if (next.ok) assets = next.manifest;
      state.updated = true;
      state.fail = true;
      const failed = await reimportModelAssetFromDisk("isolated", assets, asset.id);
      state.failedPreserves = !failed.ok && failed.manifest === assets;
    };
    mountBlenderSourceInspector(asset, assets, "isolated", () => void reimport());
    (window as unknown as { blendTest: typeof state }).blendTest = state;
    return { savedBlend: state.savedBlend, reloaded: state.reloaded, name: asset.name };
  });
  expect(first).toMatchObject({ savedBlend: true, reloaded: true });
  await page.getByRole("button", { name: "Blenderで編集", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Blenderで保存した後" })).toBeVisible();
  await page.getByRole("button", { name: "Blenderから再取り込み", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { blendTest: { failedPreserves: boolean } }).blendTest.failedPreserves)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { blendTest: unknown }).blendTest)).toMatchObject({ sameId: true, updated: true, conversions: 3 });
  await page.screenshot({ path: test.info().outputPath("blender-source-inspector.png") });
});
