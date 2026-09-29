import { expect, test, type Locator, type Page } from "@playwright/test";

type PanelLayout = { left: number; top: number; width: number; height: number };

// Exercise the production AssetsPanel in a small dock. Only project callbacks
// are fixture boundaries; no saved project or filesystem operation is involved.
async function mountAssetsPanel(page: Page, layout: PanelLayout) {
  await page.goto("/e2e.html?scenario=ready");
  const materialId = await page.evaluate(async (bounds) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { React, createRoot, AssetsPanel } = await load("/e2e/component-menus.fixture.tsx");
    const { createPrototypeProject } = await load("/src/lib/visual-editor/prototype-project.ts");
    const bundle = createPrototypeProject("world", "assets-context-menu");
    const prototypeMaterial = Object.values(bundle.assets.assets).find((asset: any) => asset.kind === "material") as any;
    if (!prototypeMaterial) throw new Error("The prototype must contain a Material");
    const material = { ...prototypeMaterial, name: "Context Material" };
    const assets = { ...bundle.assets, assets: { [material.id]: material }, folders: {} };
    const host = document.createElement("div");
    host.id = "assets-context-menu-fixture";
    Object.assign(host.style, {
      position: "fixed", left: `${bounds.left}px`, top: `${bounds.top}px`,
      width: `${bounds.width}px`, height: `${bounds.height}px`, zIndex: "20", background: "white",
    });
    document.body.append(host);
    // Desktop Assets normally sends its status bar to the editor footer.
    const statusBarHost = document.createElement("div");
    statusBarHost.hidden = true;
    document.body.append(statusBarHost);
    createRoot(host).render(React.createElement(React.Fragment, null,
      React.createElement("style", null, "#assets-context-menu-fixture section[aria-labelledby='assets-heading'] { width: 100%; height: 100%; }"),
      React.createElement(AssetsPanel, {
        assets, projectKind: "world", editorMode: "edit", selectedAssetId: material.id,
        selectedAssetIds: [material.id], pendingImports: [], importError: null, statusMessage: null,
        statusBarHost, projectSaving: false, activeFolderId: null, renameRequest: null,
        canOpenAssetLocation: false,
        onSelectAsset() {}, onAssetSelectionChange() {}, onQueueFiles() {}, onRemovePending() {},
        onClearImportError() {}, onSaveBeforeImport() {}, onActiveFolderChange() {}, onRename() {},
        onRequestDeleteAsset() {}, onSetProjectThumbnail() {}, onRequestDeleteFolder() {},
        onMoveAsset() {}, onMoveFolder() {}, onPlaceBuiltinPrefab() {}, onPlaceSceneAsset() {},
        onOpenExternalStore() {}, onOpenInteractivity() {}, onOpenAssetLocation() {},
        onPhaseNotice(message: string) { host.dataset.notice = message; },
        onCommand(command: string, payload: unknown) {
          host.dataset.command = JSON.stringify({ command, payload });
          return true;
        },
      }),
    ));
    return material.id as string;
  }, layout);
  const panel = page.getByRole("region", { name: "Assets", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.locator("button:has([data-asset-drag-preview])")).toHaveCount(1);
  return { panel, materialId };
}

async function expectMenuAtPoint(menu: Locator, point: { x: number; y: number }) {
  await expect(menu).toHaveCSS("position", "fixed");
  expect(await menu.evaluate((element) => element.parentElement === document.body)).toBe(true);
  await expect.poll(async () => {
    const box = await menu.boundingBox();
    if (!box) return false;
    const horizontal = Math.min(Math.abs(box.x - point.x), Math.abs(box.x + box.width - point.x));
    const vertical = Math.min(Math.abs(box.y - point.y), Math.abs(box.y + box.height - point.y));
    return horizontal <= 1 && vertical <= 1;
  }).toBe(true);
}

async function expectMenuInsideWindow(page: Page, menu: Locator) {
  const viewport = page.viewportSize()!;
  await expect.poll(async () => {
    const box = await menu.boundingBox();
    return Boolean(box && box.x >= 0 && box.y >= 0 &&
      box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1);
  }).toBe(true);
}

for (const mode of ["grid", "list"] as const) {
  test(`Assets ${mode} right-click stays at the pointer beyond a short panel`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const { panel, materialId } = await mountAssetsPanel(page, { left: 120, top: 560, width: 760, height: 180 });
    if (mode === "list") await panel.getByRole("button", { name: "リスト表示", exact: true }).first().click();
    const card = panel.locator("button:has([data-asset-drag-preview])");
    const cardBox = await card.boundingBox();
    if (!cardBox) throw new Error("The Material card must be visible");
    const point = { x: Math.round(cardBox.x + cardBox.width / 2), y: Math.round(cardBox.y + cardBox.height / 2) };
    await page.mouse.click(point.x, point.y, { button: "right" });
    const menu = page.getByRole("menu", { name: "Assetsのメニュー", exact: true });
    await expectMenuAtPoint(menu, point);
    await expectMenuInsideWindow(page, menu);
    const panelBox = await panel.boundingBox();
    const menuBox = await menu.boundingBox();
    expect(menuBox!.height).toBeGreaterThan(panelBox!.height);
    expect(menuBox!.y).toBeLessThan(panelBox!.y);
    await menu.getByRole("button", { name: "名前を変更", exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(page.locator("#assets-context-menu-fixture")).toHaveAttribute("data-command", JSON.stringify({
      command: "selection.rename", payload: { assetId: materialId },
    }));
  });
}

test("Assets menu opens above and left at the lower-right window edge", async ({ page }) => {
  await page.setViewportSize({ width: 840, height: 320 });
  await mountAssetsPanel(page, { left: 240, top: 140, width: 592, height: 172 });
  const point = { x: 824, y: 304 };
  await page.mouse.click(point.x, point.y, { button: "right" });
  const menu = page.getByRole("menu", { name: "Assetsのメニュー", exact: true });
  await expectMenuAtPoint(menu, point);
  await expectMenuInsideWindow(page, menu);
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeLessThan(point.x);
  expect(box.y).toBeLessThan(point.y);
  for (const item of await menu.getByRole("button").all()) {
    await item.scrollIntoViewIfNeeded();
    await expect(item).toBeInViewport({ ratio: 1 });
  }
  await menu.getByRole("button", { name: "Entityからプレハブを作成", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator("#assets-context-menu-fixture")).toHaveAttribute("data-notice", "HierarchyのEntityをAssetsへドラッグしてください");
});

test("Assets creation menu follows the button for mouse and keyboard activation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { panel } = await mountAssetsPanel(page, { left: 120, top: 160, width: 760, height: 180 });
  const trigger = panel.getByRole("button", { name: "新規アセットまたはフォルダー", exact: true });
  const buttonBox = (await trigger.boundingBox())!;
  const menu = page.getByRole("menu", { name: "Assetsのメニュー", exact: true });
  for (const activation of ["mouse", "keyboard"] as const) {
    if (activation === "mouse") await trigger.click();
    else { await trigger.focus(); await page.keyboard.press("Enter"); }
    await expectMenuAtPoint(menu, { x: buttonBox.x, y: buttonBox.y + buttonBox.height });
    await expectMenuInsideWindow(page, menu);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  }
});

test("Touch Assets operations menu stays beside its button", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 900, height: 1000 } });
  try {
    const page = await context.newPage();
    const { panel } = await mountAssetsPanel(page, { left: 60, top: 520, width: 780, height: 300 });
    const trigger = panel.getByRole("button", { name: "Context Materialの操作", exact: true });
    await expect(trigger).toBeVisible();
    const buttonBox = (await trigger.boundingBox())!;
    await trigger.tap();
    const menu = page.getByRole("menu", { name: "Assetsのメニュー", exact: true });
    await expectMenuAtPoint(menu, { x: buttonBox.x, y: buttonBox.y + buttonBox.height });
    await expectMenuInsideWindow(page, menu);
    const last = menu.getByRole("button", { name: "Entityからプレハブを作成", exact: true });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport({ ratio: 1 });
  } finally {
    await context.close();
  }
});
