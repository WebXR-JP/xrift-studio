import { expect, test } from "@playwright/test";

test("Blank template contains only required assets and starter projects compile", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const path = "/src/lib/visual-editor/starter-templates.fixture.ts";
    const { runStarterTemplateFixtureAssertions } = await import(/* @vite-ignore */ path);
    runStarterTemplateFixtureAssertions();
  });
});

test("Entity creation menu creates a new host and omits attach-only components", async ({ page }, testInfo) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { React, createRoot, EditorCreateMenu } = await load("/e2e/component-menus.fixture.tsx");
    const { BUILTIN_PREFAB_RECIPES } = await load("/src/lib/visual-editor/builtin-prefab-catalog.ts");
    const host = document.createElement("div");
    host.id = "component-menu-fixture";
    host.style.cssText = "position:fixed;inset:0;z-index:10;background:white;padding:16px";
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
  await expect(menu.getByRole("searchbox")).toHaveCount(0);
  await expect(menu.getByRole("button").nth(0)).toContainText("Entity");
  await expect(menu.getByRole("button").nth(1)).toContainText("Primitive");
  await expect(menu.getByRole("button", { name: /^Cube/ })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: /^SpawnPoint/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("entity-creation-menu.png") });
  await page.evaluate(() => {
    const scriptPanel = document.createElement("div");
    scriptPanel.style.cssText = "position:fixed;inset:100px 0 0;z-index:75;background:#eee";
    document.body.append(scriptPanel);
  });
  for (const group of ["Entity", "Primitive", "World", "Light", "UI", "Audio", "Effect", "XRift"]) {
    const toggle = menu.getByRole("button", { name: new RegExp(`^${group} [0-9]+$`) });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  }
  await expect(menu.getByRole("button").nth(3)).toContainText("Cube");
  await expect(menu.getByRole("button").nth(4)).toContainText("Plane");
  for (const name of ["Mesh Collider", "Transform", "Interactable", "Rigid Body", "光るキューブ", "Skybox", "TagBoard", "EntryLogBoard", "Portal"]) {
    await expect(menu.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveCount(0);
  }
  await expect(menu.getByRole("button", { name: /^Mirror/ })).toHaveCount(1);
  await menu.getByRole("button", { name: /Audio Source.*作成/ }).click();
  await expect(page.locator("#component-menu-fixture")).toHaveAttribute("data-created", "core.audio-source");
  await menu.getByRole("button", { name: /^UI\b/ }).click();
  await expect(menu.getByRole("button", { name: /^Text.*作成/ })).toHaveCount(0);
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
  await expect(contextMenu.getByRole("searchbox")).toHaveCount(0);
  await expect(contextMenu.getByRole("button", { name: /^Mesh Collider/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(contextMenu).toHaveCount(0);
  await panel.getByRole("treeitem").click({ button: "right" });
  await contextMenu.locator("summary").filter({ hasText: /^選択したEntityにComponentを追加/ }).click();
  await contextMenu.locator("summary").filter({ hasText: /^physics/i }).click();
  await expect(contextMenu.getByRole("button", { name: /^Mesh Collider/ })).toBeDisabled();
  await expect(contextMenu.getByText("Mesh Rendererまたはモデルのメッシュが必要", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("hierarchy-component-menu.png") });
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
  await contextMenu.getByRole("button", { name: /^Primitive/ }).click();
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
  await menu.getByRole("button", { name: /^Primitive/ }).click();
  await menu.getByRole("button", { name: /^Cube.*作成/ }).click();
  await expect(tree.getByRole("treeitem")).toHaveCount(initialCount + 1);
  await expect(tree.getByRole("treeitem", { selected: true })).toContainText("Cube");
  await page.screenshot({ path: testInfo.outputPath("editor-component-flow.png") });
  await tree.getByText("床", { exact: true }).click();
  await tree.getByText("Cube", { exact: true }).click({ modifiers: ["Control"] });
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await tree.getByText("Cube", { exact: true }).click({ button: "right" });
  const multiMenu = page.getByRole("menu", { name: "Hierarchyのメニュー" });
  await expect(multiMenu.getByRole("button").first()).toHaveText("名前を変更");
  await expect(multiMenu.getByRole("button", { name: /^Primitive/ })).toHaveCount(0);
  await expect(multiMenu.getByRole("button", { name: /^World/ })).toHaveCount(0);
  await expect(multiMenu.locator("summary")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("hierarchy-multiple-selection.png") });
  await multiMenu.getByRole("button", { name: "削除", exact: true }).click();
  await expect(tree.getByRole("treeitem")).toHaveCount(initialCount - 1);
});
