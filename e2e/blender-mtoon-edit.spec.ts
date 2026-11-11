import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

test("Blenderで形状を編集した実モデルをMToonとModel IDを保って再取り込みする", async ({ page }) => {
  const directory = process.env.XRIFT_BLENDER_EDIT_SMOKE;
  test.skip(!directory, "Run prepare-blender-edit-smoke.py and set XRIFT_BLENDER_EDIT_SMOKE");
  const data = (name: string) => readFileSync(path.join(directory!, name)).toString("base64");
  const inputs = { original: data("original.glb"), edited: data("edited.glb"), blend: data("edited.blend") };
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  const result = await page.evaluate(async (input) => {
    const load = (url: string) => import(/* @vite-ignore */ url);
    const { tauri } = await load("/src/lib/tauri.ts");
    const { createAssetImportPlan } = await load("/src/lib/visual-editor/asset-import.ts");
    const { attachBlenderSource } = await load("/src/lib/visual-editor/blender-source.ts");
    const { commitAssetImportPlanToDisk, reimportModelAssetFromDisk } = await load("/src/lib/visual-editor/asset-import-persistence.ts");
    const { createStarterVisualProject } = await load("/src/lib/visual-editor/starter-templates.ts");
    const bytes = (base64: string) => Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const disk = new Map<string, string>();
    tauri.commitVisualAssetImport = async (_root: string, _id: string, writes: {relativePath: string; dataUrl: string}[]) => {
      for (const write of writes) disk.set(write.relativePath, write.dataUrl);
    };
    tauri.readProjectFileDataUrl = async (_root: string, relative: string) => disk.get(relative);
    // Transport only is substituted; both GLBs come from the real Blender run.
    tauri.convertBlenderSource = async () => ({path: "edited.glb"});
    tauri.readLocalModelImportSource = async () => ({fileName: "edited.glb", dataUrl: "data:model/gltf-binary;base64," + input.edited, byteLength: bytes(input.edited).length});
    const bundle = createStarterVisualProject("world", "blank", "blender-edit-isolated");
    const plan = await createAssetImportPlan({fileName: "citizen.glb", bytes: bytes(input.original), existingManifest: bundle.assets});
    await attachBlenderSource(plan, bytes(input.blend), "citizen.blend");
    const before = await commitAssetImportPlanToDisk("isolated", bundle.assets, plan);
    const id = plan.asset.id;
    const toon = (manifest: typeof before) => Object.values(manifest.assets).filter((a: any) => a.kind === "material" && a.properties.extensions.VRMC_materials_mtoon).map((a: any) => JSON.stringify(a.properties.extensions.VRMC_materials_mtoon)).sort();
    const reimport = await reimportModelAssetFromDisk("isolated", before, id);
    if (!reimport.ok) throw new Error(reimport.message);
    return {beforeToon: toon(before), afterToon: toon(reimport.manifest), sameId: reimport.manifest.assets[id].id === id,
      sameSource: reimport.manifest.assets[id].blenderSource.relativePath === before.assets[id].blenderSource.relativePath,
      geometryUpdated: reimport.manifest.assets[id].sourceHash !== before.assets[id].sourceHash};
  }, inputs);
  expect(result.beforeToon.length).toBeGreaterThan(0);
  expect(result.afterToon).toEqual(result.beforeToon);
  expect(result).toMatchObject({sameId: true, sameSource: true, geometryUpdated: true});
});
