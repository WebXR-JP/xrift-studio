import { expect, test } from "@playwright/test";

test("メッシュの追加・解除は親の自動生成を分け、全体置換は一つだけ残す", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const [d, a, p] = await Promise.all([
      load("/src/lib/visual-editor/scene-document.ts"), load("/src/lib/visual-editor/mesh-collision-actions.ts"),
      load("/src/lib/visual-editor/prototype-project.ts"),
    ]);
    const base = p.createPrototypeProject("world", "collision").scene;
    const entity = (id: string, parentId: string | null, children: string[], components: any[]) => ({ id, name: id, parentId, children, components, enabled: true });
    const mesh = (id: string) => d.createMeshComponent(`${id}-mesh`, "model", [], { sourceNodeIndex: 0 });
    const source = { ...base, rootEntityIds: ["parent", "other"], entities: {
      parent: entity("parent", null, ["a", "b"], [d.createRigidBodyComponent("body", { autoColliders: "trimesh" })]),
      a: entity("a", "parent", [], [mesh("a")]), b: entity("b", "parent", [], [mesh("b")]),
      other: entity("other", null, [], [mesh("other"), d.createBoxColliderComponent("box")]),
    } };
    const snapshot = JSON.stringify(source);
    const removed = a.setMeshCollision(source, "a", "remove");
    const added = a.setMeshCollision(removed, "a", "add");
    const exclusive = a.setMeshCollision(added, "b", "exclusive");
    const enabled = (scene: any, id: string) => scene.entities[id].components.filter((c: any) => c.type === "collider" && c.enabled).length;
    const ball = { ...source, entities: { ...source.entities, parent: { ...source.entities.parent, components: [d.createRigidBodyComponent("ball", { autoColliders: "ball" })] } } };
    let rejected = false; try { a.setMeshCollision(ball, "a", "remove"); } catch { rejected = true; }
    const modelRoot = entity("model", null, ["n1", "n2"], [mesh("model"), d.createMeshColliderComponent("root-collider")]);
    const node = (id: string, index: number) => ({ ...entity(id, "model", [], []), modelNode: { modelEntityId: "model", modelAssetId: "model", sourceNodeIndex: index, nodeType: "mesh", sourceMaterialIndices: [], restPosition: [0,0,0], restRotation: [0,0,0], restScale: [1,1,1] } });
    const shared = { ...base, rootEntityIds: ["model"], entities: { model: modelRoot, n1: node("n1", 0), n2: node("n2", 1) } };
    const withoutNode = a.setMeshCollision(shared, "n1", "remove");
    return { immutable: snapshot === JSON.stringify(source), untouched: removed.entities.other === source.entities.other,
      removed: [enabled(removed, "a"), enabled(removed, "b")], added: enabled(added, "a"),
      sources: a.collisionSources(exclusive).map((r: any) => r.entityId), rejected,
      shared: [enabled(withoutNode, "model"), enabled(withoutNode, "n1"), enabled(withoutNode, "n2")],
      descriptor: a.colliderModelNode(source.entities.a)?.sourceNodeIndex,
    };
  });
  expect(result).toEqual({ immutable: true, untouched: true, removed: [0, 1], added: 1, sources: ["b"], rejected: true, shared: [0, 0, 1], descriptor: 0 });
});

test("Mesh Rendererで当たり判定を追加・解除してUndoで戻せる", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("mesh-collision");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await page.getByRole("tree", { name: "シーンのEntity階層" }).getByText("床", { exact: true }).click();
  await page.getByRole("button", { name: "これだけを歩けるようにする", exact: true }).click();
  await expect(page.getByText("当たり判定の設定一覧（1）", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "これを外す", exact: true }).click();
  await expect(page.getByText("当たり判定の設定一覧（0）", { exact: true })).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(page.getByText("当たり判定の設定一覧（1）", { exact: true })).toBeVisible();
  await page.screenshot({ path: "C:/Users/hagar/.codex/mesh-collision-inspector.png" });
  expect(errors).toEqual([]);
});

test("Colliderの書き出しに関する既存の回帰検証", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const path = "/src/lib/visual-editor/compiler/fixture.ts";
    const fixture = await import(/* @vite-ignore */ path);
    fixture.runVisualCompilerFixtureAssertions();
  });
});

test("Decimationは見た目を保ち、当たり判定専用のGLBを保存・書き出しする", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const [three, { GLTFExporter }, { createAssetImportPlan }, { commitAssetImportPlanToDisk }, { bakeNodeColliderModel }, { tauri }, { createPrototypeProject }, d, { compileVisualProject }, { collectAssetReferences }] = await Promise.all([
      load("/node_modules/three/build/three.module.js"), load("/node_modules/three/examples/jsm/exporters/GLTFExporter.js"),
      load("/src/lib/visual-editor/asset-import.ts"), load("/src/lib/visual-editor/asset-import-persistence.ts"),
      load("/src/lib/visual-editor/model-collider-bake.ts"), load("/src/lib/tauri.ts"),
      load("/src/lib/visual-editor/prototype-project.ts"), load("/src/lib/visual-editor/scene-document.ts"),
      load("/src/lib/visual-editor/compiler/compile.ts"), load("/src/lib/visual-editor/asset-operations.ts"),
    ]);
    const bundle = createPrototypeProject("world", "baked-collider");
    const mesh = new three.Mesh(new three.SphereGeometry(1, 32, 24), new three.MeshStandardMaterial());
    const bytes = await new GLTFExporter().parseAsync(mesh, { binary: true });
    const plan = await createAssetImportPlan({ fileName: "sphere.glb", bytes, existingManifest: bundle.assets });
    if (!plan.canCommit || !plan.asset) throw new Error(JSON.stringify(plan.diagnostics));
    const files = new Map<string, string>();
    const oldRead = tauri.readProjectFileDataUrl, oldWrite = tauri.commitVisualAssetImport;
    tauri.readProjectFileDataUrl = async (_path: string, relativePath: string) => {
      if (!files.has(relativePath)) throw new Error(`Missing ${relativePath}`);
      return files.get(relativePath);
    };
    tauri.commitVisualAssetImport = async (_path: string, _id: string, writes: any[]) => { for (const f of writes) files.set(f.relativePath, f.dataUrl); };
    try {
      const manifest = await commitAssetImportPlanToDisk("fixture", bundle.assets, plan);
      const original = manifest.assets[plan.asset.id];
      const before = JSON.stringify(original);
      const baked = await bakeNodeColliderModel("fixture", manifest, { modelAssetId: original.id, sourceNodeIndex: 0, ratio: 0.25, nodeName: "Sphere", createAssetId: () => "collision-sphere" });
      if (!baked.ok) throw new Error(baked.message);
      const collider = { ...d.createMeshColliderComponent("collider"), collisionModelAssetId: baked.assetId };
      const entity = { id: "sphere", name: "Sphere", enabled: true, parentId: null, children: [], components: [d.createTransformComponent("transform"), d.createMeshComponent("mesh", original.id, [], { sourceNodeIndex: 0 }), d.createRigidBodyComponent("body"), collider] };
      const scene = { ...bundle.scene, entities: { sphere: entity }, rootEntityIds: [entity.id] };
      const compiled = compileVisualProject({ project: bundle.project, assets: baked.manifest, scenes: { [scene.sceneId]: scene }, prefabs: {} });
      const code = compiled.overlayFiles.find((f: any) => f.relativePath === "src/World.tsx")?.content ?? "";
      const references = collectAssetReferences({ assets: baked.manifest, scene, prefabs: {} }, baked.assetId);
      return { reduced: baked.triangles.after < baked.triangles.before, retained: JSON.stringify(baked.manifest.assets[original.id]) === before,
        saved: files.has(baked.manifest.assets[baked.assetId].source.relativePath),
        referenced: references.length > 0, bakedWrapper: /<MeshCollider[^>]*>\s*<CompiledModelNodeCollider[^>]*\/>\s*<\/MeshCollider>/.test(code),
        stageable: compiled.canStage, diagnostics: compiled.diagnostics.filter((d: any) => d.severity === "blocking"),
      };
    } finally { tauri.readProjectFileDataUrl = oldRead; tauri.commitVisualAssetImport = oldWrite; mesh.geometry.dispose(); mesh.material.dispose(); }
  });
  expect(result).toEqual({ reduced: true, retained: true, saved: true, referenced: true, bakedWrapper: true, stageable: true, diagnostics: [] });
});
