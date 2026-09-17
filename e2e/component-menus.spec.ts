import { expect, test } from "@playwright/test";

test("Blank template contains only required assets and starter projects compile", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const path = "/src/lib/visual-editor/starter-templates.fixture.ts";
    const { runStarterTemplateFixtureAssertions } = await import(/* @vite-ignore */ path);
    runStarterTemplateFixtureAssertions();
  });
});

test("Creation uses categorized placement entries, not attach-only Components", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { React, createRoot, EditorCreateMenu } = await load("/e2e/component-menus.fixture.tsx");
    const { BUILTIN_PREFAB_RECIPES } = await load("/src/lib/visual-editor/builtin-prefab-catalog.ts");
    const host = document.createElement("div"); host.id = "component-menu-fixture";
    host.style.cssText = "position:fixed;inset:0;z-index:10;background:white;padding:16px";
    document.body.append(host);
    const record = (id: string) => { host.dataset.created = id; };
    createRoot(host).render(React.createElement(EditorCreateMenu, {
      open: true, readOnly: false, importBusy: false, projectKind: "world",
      builtinPrefabRecipes: BUILTIN_PREFAB_RECIPES, terrainOverlapCount: 0,
      onClose() {}, onCreateEmpty() {}, onCreatePrimitive: record, onCreateTerrain() {},
      onArrangeTerrains() {}, onPlaceBuiltinPrefab: record, onCreateXriftObject: record, onCreateComponentObject: record,
    }));
  });
  const menu = page.getByRole("menu", { name: "Entityを追加" });
  await menu.getByRole("button", { name: "Entityを作成", exact: true }).click();
  await menu.getByRole("button", { name: /^基本形状/ }).click();
  await expect(menu.getByRole("menuitem", { name: "Cube", exact: true })).toBeVisible();
  for (const name of ["Mesh Collider", "Transform", "Rigid Body", "光るキューブ"]) {
    await expect(menu.getByRole("menuitem", { name, exact: true })).toHaveCount(0);
  }
  await menu.getByRole("menuitem", { name: "Cube", exact: true }).click();
  await expect(page.locator("#component-menu-fixture")).toHaveAttribute("data-created", "builtin-primitive/box");
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


test("Hierarchy context menu is editing-only and preserves the clicked target", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { React, createRoot, HierarchyPanel } = await load("/e2e/component-menus.fixture.tsx");
    const { createPrototypeProject } = await load("/src/lib/visual-editor/prototype-project.ts");
    const { createEmptyEntity } = await load("/src/lib/visual-editor/editor-session.ts");
    const created = createEmptyEntity(createPrototypeProject("world", "menus").scene, null, "Target");
    const target = created.scene.entities[created.entityId];
    const scene = { ...created.scene, rootEntityIds: [target.id], entities: { [target.id]: target } };
    const host = document.createElement("div"); host.id = "hierarchy-menu-fixture";
    host.style.cssText = "position:fixed;inset:0;z-index:10;background:white;padding:16px;display:flex";
    document.body.append(host);
    createRoot(host).render(React.createElement(HierarchyPanel, {
      scene, selection: { kind: "entity", id: target.id }, selectedEntityIds: [target.id],
      readOnly: false, projectKind: "world", builtinPrefabRecipes: [], renameRequest: null,
      onSelectionChange() {}, onAssignMaterial() {}, onDropSceneAsset() {}, onDropBuiltinPrefab() {},
      onEntityEnabledChange() {}, onCreateXriftObject() {}, onCreateComponentObject() {}, onRename() {},
      onExportHierarchy(id: string) { host.dataset.export = id; },
      onCommand(command: string) { host.dataset.command = command; return true; },
    }));
  });
  const panel = page.getByRole("complementary", { name: "Hierarchy" });
  const menu = page.getByRole("menu", { name: "Hierarchyの編集", exact: true });
  await panel.getByRole("heading", { name: "Hierarchy" }).click({ button: "right" });
  await expect(menu.getByRole("menuitem")).toHaveCount(2);
  await expect(menu.getByRole("menuitem", { name: "貼り付け", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await panel.getByRole("treeitem").click({ button: "right" });
  await expect(menu).not.toContainText(/Create|Primitive|光る|Componentを追加/);
  await menu.getByRole("menuitem", { name: "複製", exact: true }).click();
  await expect(page.locator("#hierarchy-menu-fixture")).toHaveAttribute("data-command", "edit.duplicate");
  await panel.getByRole("treeitem").click({ button: "right" });
  await menu.getByRole("menuitem", { name: "選択範囲を書き出す", exact: true }).click();
  await expect(page.locator("#hierarchy-menu-fixture")).toHaveAttribute("data-export", /entity/);
});

test("Inspector adds to the selection; the header creates a new Entity", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("component-menu-flow");
  await page.getByRole("button", { name: "作成して開く" }).click();
  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });
  await tree.getByText("床", { exact: true }).click();
  const initialCount = await tree.getByRole("treeitem").count();
  await page.getByRole("button", { name: "Componentを追加", exact: true }).click();
  const search = page.getByPlaceholder("Componentを検索…");
  await search.fill("Rigid Body");
  await page.getByRole("button", { name: "Rigid Body", exact: true }).click();
  await expect(tree.getByRole("treeitem")).toHaveCount(initialCount);
  await page.getByRole("button", { name: "Componentを追加", exact: true }).click();
  await search.fill("Rigid Body");
  await expect(page.getByRole("button", { name: /Rigid Body.*追加済み/ })).toBeDisabled();
  await page.getByRole("button", { name: "Componentを追加", exact: true }).click();
  await page.getByRole("banner").getByRole("button", { name: "素材を追加", exact: true }).click();
  const menu = page.getByRole("menu", { name: "素材を追加", exact: true });
  await menu.getByRole("searchbox").fill("Cube");
  await menu.getByRole("menuitem", { name: "Cube", exact: true }).click();
  await expect(tree.getByRole("treeitem")).toHaveCount(initialCount + 1);
  await expect(tree.getByRole("treeitem", { selected: true })).toContainText("Cube");
  await tree.getByText("床", { exact: true }).click();
  await tree.getByText("Cube", { exact: true }).click({ modifiers: ["Control"] });
  await tree.getByText("Cube", { exact: true }).click({ button: "right" });
  const multi = page.getByRole("menu", { name: "Hierarchyの編集", exact: true });
  await expect(multi.getByRole("menuitem", { name: "名前を変更", exact: true })).toBeDisabled();
  await expect(multi).not.toContainText(/Create|Primitive/);
  await multi.getByRole("menuitem", { name: "削除", exact: true }).click();
  await expect(tree.getByRole("treeitem")).toHaveCount(initialCount - 1);
});
