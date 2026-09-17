import { expect, test, type Page } from "@playwright/test";

async function start(page: Page, kind: "world" | "item") {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: kind === "world" ? /ワールドをビジュアルで作る/ : /アイテムをビジュアルで作る/ }).click();
  if (kind === "world") await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill(`authoring-${kind}`);
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
}

test("Search finds a placement directly; no results and Escape preserve the scene", async ({ page }) => {
  await start(page, "world");
  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });
  const count = await tree.getByRole("treeitem").count();
  const trigger = page.getByRole("banner").getByRole("button", { name: "素材を追加", exact: true });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "素材を追加", exact: true });
  const search = menu.getByRole("searchbox");
  await expect(search).toBeFocused();
  await search.fill("not-a-real-creation-123");
  await expect(menu.getByRole("status")).toContainText("該当する項目はありません");
  await expect(tree.getByRole("treeitem")).toHaveCount(count);
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await search.fill("Ｃｕｂｅ");
  await menu.getByRole("menuitem", { name: "Cube", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(tree.getByRole("treeitem")).toHaveCount(count + 1);
});

test("Item keeps World-only creation discoverable with a reason, without creating it", async ({ page }) => {
  await start(page, "item");
  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });
  const count = await tree.getByRole("treeitem").count();
  await page.getByRole("banner").getByRole("button", { name: "素材を追加", exact: true }).click();
  const menu = page.getByRole("menu", { name: "素材を追加", exact: true });
  await menu.getByRole("searchbox").fill("SpawnPoint");
  const spawn = menu.getByRole("menuitem", { name: /SpawnPoint/ });
  await expect(spawn).toHaveAttribute("aria-disabled", "true");
  await expect(spawn).toContainText("ワールドでのみ使用できます");
  await spawn.focus();
  await page.keyboard.press("Enter");
  await expect(tree.getByRole("treeitem")).toHaveCount(count);
});

test("A real archive round trip imports only the selected subtree and preserves the destination", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { createPrototypeProject } = await load("/src/lib/visual-editor/prototype-project.ts");
    const transfer = await load("/src/lib/visual-editor/hierarchy-transfer.ts");
    const { createHierarchyArchive } = await load("/src/lib/visual-editor/hierarchy-transfer-io.ts");
    const { readBrowserProjectArchive } = await load("/src/lib/visual-editor/browser-project-transfer.ts");
    const source = createPrototypeProject("world", "source");
    const target = createPrototypeProject("item", "target");
    const before = JSON.stringify(target);
    const id = source.scene.rootEntityIds[0];
    const prepared = await transfer.prepareHierarchyTransferFiles(transfer.createHierarchyTransfer(source, [id]), async () => { throw new Error("unexpected source file"); });
    const asItem = transfer.withHierarchyProjectKind(prepared, "item");
    const archive = await createHierarchyArchive(asItem);
    const decoded = await readBrowserProjectArchive(new File([archive.blob], archive.fileName));
    const docs = decoded.documents;
    const input = { bundle: { project: docs.project, scene: docs.scenes[docs.project.entrySceneId], assets: docs.assets, prefabs: docs.prefabs }, warnings: [], files: decoded.files };
    const subset = transfer.createHierarchyTransfer(input.bundle, input.bundle.scene.rootEntityIds);
    const files = await transfer.prepareHierarchyTransferFiles(subset, async (path: string) => decoded.files.get(path));
    const plan = transfer.planHierarchyImport(target, files);
    return { name: archive.fileName, kind: docs.project.projectKind, unchanged: JSON.stringify(target) === before,
      sameProject: plan.bundle.project.projectId === target.project.projectId,
      originalRootsRemain: target.scene.rootEntityIds.every((root: string) => plan.bundle.scene.rootEntityIds.includes(root)),
      newIds: plan.rootEntityIds.every((root: string) => !source.scene.entities[root] && !target.scene.entities[root]) };
  });
  expect(result.name).toMatch(/\.xriftstudio$/);
  expect(result.kind).toBe("item");
  expect(result.unchanged && result.sameProject && result.originalRootsRemain && result.newIds).toBe(true);
});

