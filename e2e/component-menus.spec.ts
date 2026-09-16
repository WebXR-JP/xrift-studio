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
  await menu.getByRole("button", { name: "Entityを作成", exact: true }).click();
  await expect(menu.getByRole("menuitem", { name: /^Cube/ })).toHaveCount(0);
  await menu.getByRole("button", { name: /^基本形状/ }).click();
  await expect(menu.getByRole("menuitem", { name: /^Cube/ })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /^Plane/ })).toBeVisible();
  for (const name of ["Mesh Collider", "Transform", "Interactable", "Rigid Body", "光るキューブ"]) {
    await expect(menu.getByRole("menuitem", { name: new RegExp(`^${name}`) })).toHaveCount(0);
  }
  await menu.getByRole("button", { name: /^音声/ }).click();
  await menu.getByRole("menuitem", { name: /^Audio Source/ }).click();
  await expect(page.locator("#component-menu-fixture")).toHaveAttribute("data-created", "core.audio-source");
  await page.screenshot({ path: testInfo.outputPath("entity-creation-menu.png") });
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

test("Hierarchy offers editing only and keeps its menu within the viewport", async ({ page }, testInfo) => {
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
      onCommand(command: string) {
        host.dataset.added = command;
        return true;
      },
    }));
  });
  const panel = page.getByRole("complementary", { name: "Hierarchy" });
  await panel.getByRole("heading", { name: "Hierarchy" }).click({ button: "right" });
  const contextMenu = page.getByRole("menu", { name: "Hierarchyの編集", exact: true });
  await expect(contextMenu.getByRole("menuitem")).toHaveCount(2);
  await expect(contextMenu.getByRole("menuitem", { name: "貼り付け", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await panel.getByRole("treeitem").click({ button: "right" });
  for (const label of ["コピー", "貼り付け", "反転して貼り付け", "複製", "名前を変更", "フォーカス", "削除"]) {
    await expect(contextMenu.getByRole("menuitem", { name: label, exact: true })).toBeVisible();
  }
  await expect(contextMenu).not.toContainText(/Create|光るキューブ|Componentを追加/);
  const box = await contextMenu.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.screenshot({ path: testInfo.outputPath("hierarchy-edit-menu.png") });
  await contextMenu.getByRole("menuitem", { name: "複製", exact: true }).click();
  await expect(page.locator("#hierarchy-menu-fixture")).toHaveAttribute("data-added", "edit.duplicate");
  await expect(contextMenu).toHaveCount(0);
});

test("Inspector adds to the selection while Create adds a new Entity", async ({ page }, testInfo) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("component-menu-flow");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page.getByRole("toolbar", { name: "ビジュアルエディターのツール" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "編集履歴" })).toBeVisible();
  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });
  await tree.getByText("床", { exact: true }).click();
  const initialCount = await tree.getByRole("treeitem").count();
  await page.getByRole("button", { name: "Componentを追加", exact: true }).click();
  const search = page.getByPlaceholder("Componentを検索…");
  await search.fill("Rigid Body");
  await page.getByRole("button", { name: "Rigid Body", exact: true }).click();
  await expect(tree.getByRole("treeitem")).toHaveCount(initialCount);
  await expect(page.getByRole("button", { name: "Rigid Bodyを削除", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Componentを追加", exact: true }).click();
  await search.fill("Rigid Body");
  await expect(page.getByRole("button", { name: /Rigid Body.*追加済み/ })).toBeDisabled();
  await page.getByRole("button", { name: "Componentを追加", exact: true }).click();
  await page.getByRole("banner").getByRole("button", { name: "素材を追加", exact: true }).click();
  const menu = page.getByRole("menu", { name: "素材を追加", exact: true });
  await menu.getByRole("searchbox", { name: "追加する素材を検索" }).fill("Cube");
  await menu.getByRole("menuitem", { name: /^Cube/ }).click();
  await expect(tree.getByRole("treeitem")).toHaveCount(initialCount + 1);
  await expect(tree.getByRole("treeitem", { selected: true })).toContainText("Cube");
  await page.screenshot({ path: testInfo.outputPath("editor-component-flow.png") });
  await page.getByRole("button", { name: "リスト表示", exact: true }).click();
  await expect(page.getByText("document", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("asset-list-compact.png") });
  await page.getByRole("button", { name: "グリッド表示", exact: true }).click();
  await tree.getByText("床", { exact: true }).click();
  await tree.getByText("Cube", { exact: true }).click({ modifiers: ["Control"] });
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(2);
  await tree.getByText("Cube", { exact: true }).click({ button: "right" });
  const multiMenu = page.getByRole("menu", { name: "Hierarchyの編集" });
  await expect(multiMenu.getByRole("menuitem", { name: "名前を変更", exact: true })).toBeDisabled();
  await expect(multiMenu.getByRole("button", { name: /^Primitive/ })).toHaveCount(0);
  await expect(multiMenu.getByRole("button", { name: /^World/ })).toHaveCount(0);
  await expect(multiMenu.locator("summary")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("hierarchy-multiple-selection.png") });
  await multiMenu.getByRole("menuitem", { name: "削除", exact: true }).click();
  await expect(tree.getByRole("treeitem")).toHaveCount(initialCount - 1);
});
