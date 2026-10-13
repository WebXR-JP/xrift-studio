import { expect, test, type Page } from "@playwright/test";

async function mount(page: Page, readOnly: boolean) {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async locked => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const fixture = await load("/e2e/hierarchy-drag.fixture.tsx");
    fixture.mountHierarchyDragFixture(locked);
  }, readOnly);
  const host = page.locator("#hierarchy-drag-fixture");
  const tree = host.getByRole("tree", { name: "シーンのEntity階層" });
  const target = tree.locator('[data-hierarchy-entity-id="entity-world-object"]');
  const source = host.getByRole("region", { name: "Assets", exact: true })
    .locator("button:has([data-asset-drag-preview])");
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  return { host, tree, target, source };
}

test("AssetsからHierarchyの子と直下へ実ドラッグでき、案内で行が動かない", async ({ page }) => {
  const { host, tree, target, source } = await mount(page, false);
  await source.dragTo(target);
  await expect(host).toHaveAttribute("data-drops", JSON.stringify([
    { assetId: "drag-audio", parentEntityId: "entity-world-object" },
  ]));

  const rowBefore = (await target.boundingBox())!;
  const card = (await source.boundingBox())!;
  const treeBounds = (await tree.boundingBox())!;
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await page.mouse.move(card.x + card.width / 2 + 12, card.y + card.height / 2, { steps: 2 });
  await page.mouse.move(treeBounds.x + treeBounds.width / 2, treeBounds.y + treeBounds.height - 20, { steps: 6 });
  const rootDrop = host.getByText("シーンの直下へ配置", { exact: true });
  await expect(rootDrop).toBeVisible();
  expect((await target.boundingBox())!.y).toBeCloseTo(rowBefore.y, 1);
  const dropBounds = (await rootDrop.boundingBox())!;
  await page.mouse.move(dropBounds.x + dropBounds.width / 2, dropBounds.y + dropBounds.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(host).toHaveAttribute("data-drops", JSON.stringify([
    { assetId: "drag-audio", parentEntityId: "entity-world-object" },
    { assetId: "drag-audio", parentEntityId: null },
  ]));
  await expect(rootDrop).toBeHidden();
});

test("readOnlyのHierarchyはEntityのドラッグとAssetsからの配置を拒否する", async ({ page }) => {
  const { host, tree, target, source } = await mount(page, true);
  const entitySource = target.locator('[data-editor-drag-source="hierarchy-entity"]');
  expect(await entitySource.evaluate(element => (element as HTMLElement).draggable)).toBe(false);
  await source.dragTo(target);
  await expect(host).toHaveAttribute("data-drops", "[]");
  await expect(tree.getByRole("treeitem")).toHaveCount(4);
  await expect(host.getByText("シーンの直下へ配置", { exact: true })).toBeHidden();
  await expect(target).toHaveAttribute("aria-level", "1");
});
