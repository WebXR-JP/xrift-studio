import { expect, test } from "@playwright/test";

test("Entity creation menu creates a new host and omits attach-only components", async ({ page }, testInfo) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { React, createRoot, EditorCreateMenu } = await load("/e2e/component-menus.fixture.tsx");
    const { BUILTIN_PREFAB_RECIPES } = await load("/src/lib/visual-editor/builtin-prefab-catalog.ts");
    const host = document.createElement("div");
    host.id = "component-menu-fixture";
    host.style.cssText = "position:fixed;inset:0;z-index:9999;background:white;padding:16px";
    document.body.append(host);
    const record = (id: string) => { host.dataset.created = id; };
    createRoot(host).render(React.createElement(EditorCreateMenu, {
      open: true, readOnly: false, importBusy: false, projectKind: "world",
      builtinPrefabRecipes: BUILTIN_PREFAB_RECIPES, terrainOverlapCount: 0,
      onClose() {}, onCreateEmpty() {}, onCreatePrimitive() {}, onCreateTerrain() {},
      onArrangeTerrains() {}, onPlaceBuiltinPrefab: record,
      onCreateXriftObject: record, onCreateComponentObject: record,
    }));
  });
  const menu = page.getByRole("menu", { name: "Entityを追加" });
  const search = menu.getByRole("searchbox");
  await expect(menu.getByRole("button").nth(0)).toContainText("空のEntity");
  await expect(menu.getByRole("button").nth(1)).toContainText("Cube");
  await expect(menu.getByRole("button").nth(2)).toContainText("Plane");
  await expect(menu.getByRole("button", { name: /^SpawnPoint/ })).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("entity-creation-menu.png") });
  for (const name of ["Mesh Collider", "Transform", "Interactable", "Rigid Body", "光るキューブ"]) {
    await search.fill(name);
    await expect(menu.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveCount(0);
  }
  await search.fill("Audio Source");
  await menu.getByRole("button", { name: /Audio Source.*作成/ }).click();
  await expect(page.locator("#component-menu-fixture")).toHaveAttribute("data-created", "core.audio-source");
  await search.fill("SpawnPoint");
  await expect(menu.getByRole("button", { name: /SpawnPoint.*作成/ })).toHaveCount(1);
  await menu.getByRole("button", { name: /SpawnPoint.*作成/ }).click();
  await expect(page.locator("#component-menu-fixture")).toHaveAttribute("data-created", "xrift-prefab.spawn-point");
});

test("component menus share duplicate and mesh dependency rules", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const editor = await load("/src/lib/visual-editor/editor-session.ts");
    const { createPrototypeProject } = await load("/src/lib/visual-editor/prototype-project.ts");
    const { getXriftEntityCreationMenuGroups } = await load("/src/lib/visual-editor/component-registry.ts");
    const bundle = createPrototypeProject("world", "menu-fixture");
    const created = editor.createEmptyEntity(bundle.scene);
    const entity = created.scene.entities[created.entityId];
    const before = editor.getEditorComponentDisabledReason(entity, "physics.mesh-collider");
    const failed = editor.addEditorComponent(created.scene, bundle.assets, entity.id, "physics.mesh-collider", "world");
    const mesh = editor.addEditorComponent(created.scene, bundle.assets, entity.id, "core.mesh", "world");
    const after = editor.getEditorComponentDisabledReason(mesh.scene.entities[entity.id], "physics.mesh-collider");
    const collider = editor.addEditorComponent(mesh.scene, bundle.assets, entity.id, "physics.mesh-collider", "world");
    const body = editor.addEditorComponent(collider.scene, bundle.assets, entity.id, "physics.rigid-body", "world");
    return {
      before, failed: failed.added, mesh: mesh.added, after: after ?? null, collider: collider.added,
      duplicate: editor.getEditorComponentDisabledReason(body.scene.entities[entity.id], "physics.rigid-body"),
      addIds: editor.getEditorComponentMenuDefinitions("world").map((entry: { id: string }) => entry.id),
      createIds: editor.getEditorEntityCreationDefinitions("world").map((entry: { id: string }) => entry.id),
      itemXriftIds: getXriftEntityCreationMenuGroups("item").flatMap((group: any) => group.components.map((entry: any) => entry.schemaId)),
    };
  });
  expect(result.before).toContain("Mesh Renderer");
  expect(result.failed).toBe(false);
  expect(result.mesh).toBe(true);
  expect(result.after).toBeNull();
  expect(result.collider).toBe(true);
  expect(result.duplicate).toBe("追加済み");
  expect(result.addIds).not.toContain("core.transform");
  expect(result.addIds).not.toContain("core.spawn");
  expect(result.addIds).toContain("physics.mesh-collider");
  expect(result.createIds).not.toContain("physics.mesh-collider");
  expect(result.createIds).not.toContain("physics.rigid-body");
  expect(result.createIds).not.toContain("physics.box-collider");
  expect(result.itemXriftIds).not.toContain("xrift.spawn-point");
});

test("Hierarchy distinguishes root creation from adding to a target Entity", async ({ page }, testInfo) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { React, createRoot, HierarchyPanel } = await load("/e2e/component-menus.fixture.tsx");
    const { createPrototypeProject } = await load("/src/lib/visual-editor/prototype-project.ts");
    const { createEmptyEntity } = await load("/src/lib/visual-editor/editor-session.ts");
    const created = createEmptyEntity(createPrototypeProject("world", "menus").scene, null, "Target");
    const target = created.scene.entities[created.entityId];
    const scene = { ...created.scene, rootEntityIds: [target.id], entities: { [target.id]: target } };
    const host = document.createElement("div");
    host.id = "hierarchy-menu-fixture";
    host.style.cssText = "position:fixed;inset:0;z-index:10;background:white;padding:16px;display:flex";
    document.body.append(host);
    createRoot(host).render(React.createElement(HierarchyPanel, {
      scene, selection: { kind: "entity", id: target.id }, selectedEntityIds: [target.id],
      readOnly: false, projectKind: "world", builtinPrefabRecipes: [], renameRequest: null,
      onSelectionChange() {}, onAssignMaterial() {}, onDropSceneAsset() {}, onDropBuiltinPrefab() {},
      onEntityEnabledChange() {}, onCreateXriftObject() {}, onCreateComponentObject() {}, onRename() {},
      onCommand(_command: string, payload: { componentDefinitionId?: string }) {
        host.dataset.added = payload.componentDefinitionId;
        return true;
      },
    }));
  });
  const panel = page.getByRole("complementary", { name: "Hierarchy" });
  await panel.getByRole("heading", { name: "Hierarchy" }).click({ button: "right" });
  const contextMenu = page.getByRole("menu", { name: "Hierarchyのメニュー" });
  const search = contextMenu.getByPlaceholder("Component・Entityを検索…");
  await search.fill("Mesh Collider");
  await expect(contextMenu.getByRole("button", { name: /^Mesh Collider/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await panel.getByRole("treeitem").click({ button: "right" });
  await search.fill("Mesh Collider");
  await expect(contextMenu.getByRole("button", { name: /^Mesh Collider/ })).toBeDisabled();
  await expect(contextMenu.getByText("Mesh Rendererまたはモデルのメッシュが必要", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("hierarchy-component-menu.png") });
  await search.fill("Rigid Body");
  await contextMenu.getByRole("button", { name: /^Rigid Body/ }).click();
  await expect(page.locator("#hierarchy-menu-fixture")).toHaveAttribute("data-added", "physics.rigid-body");
  const panelBox = await panel.boundingBox();
  if (!panelBox) throw new Error("Hierarchy has no bounds");
  await page.mouse.click(panelBox.x + 10, panelBox.y + panelBox.height - 10, { button: "right" });
  await expect(contextMenu).toBeVisible();
  const menuBox = await contextMenu.boundingBox();
  if (!menuBox) throw new Error("Context menu has no bounds");
  expect(menuBox.y).toBeGreaterThanOrEqual(0);
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.evaluate(() => {
    const overlay = document.createElement("div");
    overlay.id = "neighboring-panel";
    overlay.style.cssText = "position:fixed;inset:200px 0 0;z-index:75;background:#eee";
    document.body.append(overlay);
  });
  await expect(contextMenu.getByRole("button", { name: /^Plane/ })).toBeVisible();
  await contextMenu.getByRole("button", { name: /^Plane/ }).click();
  await expect(contextMenu).toHaveCount(0);
});

test("Inspector adds to the selection while Create adds a new Entity", async ({ page }, testInfo) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("component-menu-flow");
  await page.getByRole("button", { name: "作成して開く" }).click();
  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });
  await tree.getByText("床", { exact: true }).click();
  const initialCount = await tree.getByRole("treeitem").count();
  await page.getByRole("button", { name: "Add Component", exact: true }).click();
  const search = page.getByPlaceholder("Componentを検索…");
  await search.fill("Rigid Body");
  await page.getByRole("button", { name: "Rigid Body", exact: true }).click();
  await expect(tree.getByRole("treeitem")).toHaveCount(initialCount);
  await expect(page.getByRole("button", { name: "Rigid Bodyを削除", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add Component", exact: true }).click();
  await search.fill("Rigid Body");
  await expect(page.getByRole("button", { name: /Rigid Body.*追加済み/ })).toBeDisabled();
  await page.getByRole("button", { name: "Add Component", exact: true }).click();
  await page.getByRole("button", { name: "追加", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Entityを追加" });
  await menu.getByRole("button", { name: /^Cube.*作成/ }).click();
  await expect(tree.getByRole("treeitem")).toHaveCount(initialCount + 1);
  await expect(tree.getByRole("treeitem", { selected: true })).toContainText("Cube");
  await page.screenshot({ path: testInfo.outputPath("editor-component-flow.png") });
});
