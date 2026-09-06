import { expect, test } from "@playwright/test";

test("再インポートの縮小・Dracoと公開前の圧縮が同じ結果になる", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const [three, { GLTFExporter }, imports, persistence, optimization, publish, { tauri }, { runModelReimportImpactFixtureAssertions }] = await Promise.all([
      load("/node_modules/three/build/three.module.js"),
      load("/node_modules/three/examples/jsm/exporters/GLTFExporter.js"),
      load("/src/lib/visual-editor/asset-import.ts"),
      load("/src/lib/visual-editor/asset-import-persistence.ts"),
      load("/src/lib/visual-editor/model-optimization.ts"),
      load("/src/lib/visual-editor/asset-optimization.ts"),
      load("/src/lib/tauri.ts"),
      load("/src/lib/visual-editor/model-reimport-impact.fixture.ts"),
    ]);
    runModelReimportImpactFixtureAssertions();
    const { createPrototypeProject } = await load("/src/lib/visual-editor/prototype-project.ts");
    const { updateModelAsset } = await load("/src/lib/visual-editor/asset-manifest.ts");
    const bundle = createPrototypeProject("world", "reimport-settings");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#669944";
    ctx.fillRect(0, 0, 512, 512);
    const mesh = new three.Mesh(new three.BoxGeometry(), new three.MeshStandardMaterial({ map: new three.CanvasTexture(canvas) }));
    const source = await new GLTFExporter().parseAsync(mesh, { binary: true });
    const plan = await imports.createAssetImportPlan({ fileName: "textured.glb", bytes: source, existingManifest: bundle.assets });
    if (!plan.canCommit || !plan.asset) throw new Error(JSON.stringify(plan.diagnostics));
    const files = new Map<string, string>();
    const reads: string[] = [];
    const originalRead = tauri.readProjectFileDataUrl;
    const originalWrite = tauri.commitVisualAssetImport;
    tauri.readProjectFileDataUrl = async (_project: string, rel: string) => {
      reads.push(rel);
      const data = files.get(rel);
      if (!data) throw new Error(`Missing fixture file ${rel}`);
      return data;
    };
    tauri.commitVisualAssetImport = async (_project: string, _id: string, writes: { relativePath: string; dataUrl: string }[]) => {
      for (const write of writes) files.set(write.relativePath, write.dataUrl);
    };
    try {
      const initial = await persistence.commitAssetImportPlanToDisk("fixture", bundle.assets, plan);
      const id = plan.asset.id;
      const configured = updateModelAsset(initial, id, { importSettings: { textureMaxSize: 256, compressWithDraco: true, optimizeMeshes: false, generateColliders: false } });
      const reimported = await persistence.reimportModelAssetFromDisk("fixture", configured, id);
      if (!reimported.ok) throw new Error(reimported.message);
      const model = reimported.manifest.assets[id];
      const textures = Object.values(reimported.manifest.assets).filter((a: any) => a.kind === "texture" && a.importedFromModel?.modelAssetId === id) as any[];
      const inspector = await optimization.applyModelOptimization("fixture", initial, id, { optimizeMeshes: false, compressWithDraco: true });
      if (!inspector.ok) throw new Error(inspector.message);
      const published = await publish.applyAssetOptimizations("fixture", { ...bundle, assets: initial }, [{ id: "draco", assetId: id, operation: "draco-model", severity: "recommended", title: "Draco", detail: "", impact: "load" }], ["draco"]);
      if (published.skipped.length) throw new Error(JSON.stringify(published.skipped));
      reads.length = 0;
      const again = await persistence.reimportModelAssetFromDisk("fixture", reimported.manifest, id);
      if (!again.ok) throw new Error(again.message);
      const withoutDraco = await persistence.reimportModelAssetFromDisk("fixture", updateModelAsset(reimported.manifest, id, { importSettings: { compressWithDraco: false } }), id);
      if (!withoutDraco.ok) throw new Error(withoutDraco.message);
      const { React, createRoot, ModelAssetInspector } = await load("/e2e/model-import-settings.fixture.tsx");
      const host = document.createElement("div");
      host.id = "import-settings-test";
      host.style.cssText = "position:fixed;inset:0;z-index:99999;background:white;overflow:auto;padding:16px;width:400px";
      document.body.append(host);
      function Harness() {
        const [manifest, setManifest] = React.useState(reimported.manifest);
        return React.createElement(ModelAssetInspector, {
          asset: manifest.assets[id], assets: manifest, preview: null, readOnly: false,
          canReimport: true, canOptimize: true, reimportState: { phase: "idle" },
          onChange: (patch: unknown) => setManifest((current: unknown) => updateModelAsset(current, id, patch)),
          onOpenMaterial: () => {}, onReimport: () => {},
        });
      }
      createRoot(host).render(React.createElement(Harness));
      return {
        textureWidths: textures.map(t => t.importMetadata.width),
        draco: model.importMetadata.extensionsRequired.includes("KHR_draco_mesh_compression"),
        sameBytes: inspector.manifest.assets[id].sourceHash === published.bundle.assets.assets[id].sourceHash,
        savedRecipe: model.importSettings,
        restoredFromOriginal: reads[0] === initial.assets[id].source.relativePath,
        sourceRetained: files.has(initial.assets[id].source.relativePath),
        dracoRemoved: !withoutDraco.manifest.assets[id].importMetadata.extensionsRequired.includes("KHR_draco_mesh_compression"),
      };
    } finally {
      tauri.readProjectFileDataUrl = originalRead;
      tauri.commitVisualAssetImport = originalWrite;
      mesh.geometry.dispose(); mesh.material.map.dispose(); mesh.material.dispose();
    }
  });
  expect(result.textureWidths).toEqual([256]);
  expect(result.draco).toBe(true);
  expect(result.sameBytes).toBe(true);
  expect(result.savedRecipe).toMatchObject({ textureMaxSize: 256, compressWithDraco: true, generateColliders: false });
  expect(result.restoredFromOriginal).toBe(true);
  expect(result.sourceRetained).toBe(true);
  expect(result.dracoRemoved).toBe(true);
  const inspector = page.locator("#import-settings-test");
  const size = inspector.getByRole("combobox", { name: "Model Textureの最大解像度" });
  await expect(size).toHaveValue("256");
  await size.selectOption("512");
  await expect(size).toHaveValue("512");
  const draco = inspector.getByRole("checkbox", { name: /Draco圧縮をかける/ });
  await expect(draco).toBeChecked();
  await draco.uncheck();
  await expect(draco).not.toBeChecked();
});
