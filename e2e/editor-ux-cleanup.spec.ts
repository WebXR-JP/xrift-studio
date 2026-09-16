import { expect, test, type Page } from "@playwright/test";

async function openItem(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /アイテムをビジュアルで作る/ }).click();
  await page.getByLabel("プロジェクト名").fill("ux-cleanup");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
}

test("Search finds full-width names, creates once, and closes without leaving selection ambiguous", async ({ page }) => {
  await openItem(page);
  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });
  const before = await tree.getByRole("treeitem").count();
  await page.getByRole("banner").getByRole("button", { name: "素材を追加", exact: true }).click();
  const menu = page.getByRole("menu", { name: "素材を追加", exact: true });
  const search = menu.getByRole("searchbox", { name: "追加する素材を検索" });
  await expect(search).toBeFocused();
  await search.fill("no-such-entry-112233");
  await expect(menu.getByRole("status")).toContainText("一致する項目がありません");
  await search.fill("ｃｕｂｅ");
  await menu.getByRole("menuitem", { name: /^Cube/ }).click();
  await expect(menu).toHaveCount(0);
  await expect(tree.getByRole("treeitem")).toHaveCount(before + 1);
  await expect(page.getByRole("complementary", { name: "Inspector" })).toContainText("Entity · Cube");
});

test("Item Inspector keeps world-only components discoverable with a reason", async ({ page }) => {
  await openItem(page);
  await page.getByRole("tree", { name: "シーンのEntity階層" }).getByRole("treeitem").first().click();
  await page.getByRole("button", { name: "Componentを追加", exact: true }).click();
  await page.getByPlaceholder("Componentを検索…").fill("SpawnPoint");
  const option = page.getByRole("button", { name: /SpawnPoint.*ワールドでのみ使用できます/ });
  await expect(option).toBeDisabled();
  await expect(option).toHaveAttribute("title", "ワールドでのみ使用できます");
});

test("Document inspection can return to collider view without changing scene data", async ({ page }) => {
  await openItem(page);
  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });
  const before = await tree.getByRole("treeitem").count();
  await page.getByRole("button", { name: "制作データの確認", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "制作データの確認", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Colliderを表示して確認" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "シーン表示モード", exact: true })).toHaveValue("colliders");
  await expect(tree.getByRole("treeitem")).toHaveCount(before);
});

test("Hierarchy exposes file reuse separately from ordinary mirrored paste", async ({ page }) => {
  await openItem(page);
  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });
  await tree.getByRole("treeitem").first().click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Hierarchyの編集" });
  await expect(menu.getByRole("menuitem", { name: "反転して貼り付け", exact: true })).toBeVisible();
  await menu.getByRole("menuitem", { name: "再利用・書き出し", exact: true }).click();
  await expect(menu.getByRole("menuitem", { name: ".xriftstudioで書き出す", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "素材ごと貼り付け", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("Hierarchy and authoring fixtures run in the actual browser module environment", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const transfer = await load("/src/lib/visual-editor/hierarchy-transfer.fixture.ts");
    await transfer.runHierarchyTransferFixtureAssertions();
    const ux = await load("/src/lib/visual-editor/editor-ux-cleanup.fixture.ts");
    ux.runEditorUxCleanupFixtureAssertions();
    const catalog = await load("/src/lib/visual-editor/editor-component-catalog.fixture.ts");
    catalog.runEditorComponentCatalogFixtureAssertions();
  });
});
