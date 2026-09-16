import { expect, test, type Page } from "@playwright/test";

async function openVisualProject(page: Page, kind: "world" | "item", name: string) {
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: kind === "world" ? /ワールドをビジュアルで作る/ : /アイテムをビジュアルで作る/ }).click();
  if (kind === "world") await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill(name);
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
}

async function openCreateMenu(page: Page) {
  const fileMenu = page.locator(".editor-header-actions > summary");
  if (await fileMenu.isVisible()) await fileMenu.click();
  await page.getByRole("banner").getByRole("button", { name: "素材を追加", exact: true }).click();
  const menu = page.getByRole("menu", { name: "素材を追加", exact: true });
  await menu.getByRole("button", { name: "Entityを作成", exact: true }).click();
  return menu;
}

for (const width of [1280, 1600]) {
  test(`Header actions align and the utility/status dock does not cover the workspace (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openVisualProject(page, "world", `ui-dock-${width}`);
    const header = page.getByRole("banner");
    const buttons = ["元に戻す", "やり直す", "素材を追加"].map(name => header.getByRole("button", { name, exact: true }));
    const bounds = await Promise.all(buttons.map(button => button.boundingBox()));
    for (const box of bounds) {
      expect(box).not.toBeNull();
      expect(box!.height).toBe(32);
      expect(box!.y).toBe(bounds[0]!.y);
    }
    expect(bounds[0]!.width).toBe(32);
    expect(bounds[1]!.width).toBe(32);
    const hierarchy = page.getByRole("complementary", { name: "Hierarchy" });
    await expect(hierarchy.getByRole("button", { name: /^(操作|追加)$/ })).toHaveCount(0);

    const dock = page.getByRole("contentinfo", { name: "エディターのステータスバー" });
    await expect(dock.getByRole("navigation", { name: "エディターのヘルプと設定" })).toBeVisible();
    await expect(dock.getByRole("status")).toBeVisible();
    const workspace = await page.locator(".editor-workspace").boundingBox();
    const footer = await dock.boundingBox();
    expect(workspace).not.toBeNull();
    expect(footer).not.toBeNull();
    expect(workspace!.y + workspace!.height).toBeLessThanOrEqual(footer!.y + 1);
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(900);

    const ai = dock.getByRole("button", { name: "AI接続", exact: true });
    await ai.click();
    const panel = dock.getByRole("dialog", { name: "AI接続", exact: true });
    await expect(panel).toBeVisible();
    const panelBox = await panel.boundingBox();
    expect(panelBox!.y).toBeGreaterThanOrEqual(0);
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(footer!.y);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(ai).toBeFocused();
  });
}

test("Creation remains discoverable without a Hierarchy header action", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openVisualProject(page, "world", "create-from-header");
  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });
  const before = await tree.getByRole("treeitem").count();
  const menu = await openCreateMenu(page);
  await menu.getByRole("button", { name: /^Entity [0-9]+$/ }).click();
  await menu.getByRole("button", { name: /空のEntity/ }).click();
  await expect(menu).toHaveCount(0);
  await expect(tree.getByRole("treeitem")).toHaveCount(before + 1);
  await expect(tree.getByRole("treeitem", { selected: true })).toContainText("Empty Entity");
  await page.getByRole("banner").getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(tree.getByRole("treeitem")).toHaveCount(before);
  await page.getByRole("banner").getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(tree.getByRole("treeitem")).toHaveCount(before + 1);
});

test("Scale starts independent, including negative scale; linking remains opt-in", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openVisualProject(page, "world", "independent-scale");
  await page.getByRole("tree", { name: "シーンのEntity階層" }).getByText("床", { exact: true }).click();
  const fields = ["X", "Y", "Z"].map(axis => page.getByRole("spinbutton", { name: `大きさ ${axis}`, exact: true }));
  const before = await Promise.all(fields.map(field => field.inputValue()));
  const link = page.getByRole("button", { name: "Scale比率を固定", exact: true });
  await expect(link).toHaveAttribute("aria-pressed", "false");
  await fields[0].fill("-2");
  await fields[0].blur();
  await expect(fields[0]).toHaveValue("-2");
  await expect(fields[1]).toHaveValue(before[1]);
  await expect(fields[2]).toHaveValue(before[2]);
  await link.click();
  await expect(page.getByRole("button", { name: "Scale比率の固定を解除", exact: true })).toHaveAttribute("aria-pressed", "true");
  await fields[0].fill("-4");
  await fields[0].blur();
  await expect(fields[1]).toHaveValue(String(Number(before[1]) * 2));
  await expect(fields[2]).toHaveValue(String(Number(before[2]) * 2));
});

for (const kind of ["world", "item"] as const) {
  test(`${kind}: project display default and user choice survive ordinary edits`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openVisualProject(page, kind, `display-${kind}`);
    const mode = page.getByRole("combobox", { name: "シーン表示モード", exact: true });
    await expect(mode).toHaveValue(kind === "item" ? "unlit" : "scene");
    await mode.selectOption("wireframe");
    const menu = await openCreateMenu(page);
    await menu.getByRole("button", { name: /^Entity [0-9]+$/ }).click();
    await menu.getByRole("button", { name: /空のEntity/ }).click();
    await expect(mode).toHaveValue("wireframe");
    await page.getByRole("banner").getByRole("button", { name: "元に戻す", exact: true }).click();
    await expect(mode).toHaveValue("wireframe");
  });
}


test.describe("Touch entry points", () => {
  test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } });

  test("Selected rows retain editing without the old Hierarchy header action", async ({ page }) => {
    await openVisualProject(page, "world", "touch-row-actions");
    const tree = page.getByRole("tree", { name: "シーンのEntity階層" });
    const before = await tree.getByRole("treeitem").count();
    await tree.getByText("床", { exact: true }).tap();
    await tree.getByRole("button", { name: "床のメニュー", exact: true }).tap();
    const menu = page.getByRole("menu", { name: "選択したEntityの操作", exact: true });
    await expect(menu).toBeVisible();
    await menu.getByRole("button", { name: "複製", exact: true }).tap();
    await expect(tree.getByRole("treeitem")).toHaveCount(before + 1);
    const create = await openCreateMenu(page);
    await create.getByRole("button", { name: /^Entity [0-9]+$/ }).tap();
    await create.getByRole("button", { name: /空のEntity/ }).tap();
    await expect(create).toHaveCount(0);
    await expect(page.locator(".editor-header-actions")).not.toHaveAttribute("open", "");
    await expect(tree.getByRole("treeitem")).toHaveCount(before + 2);
  });
});
