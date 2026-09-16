import { expect, test, type Page } from "@playwright/test";

async function mountMenu(page: Page, options: { clipboardAvailable?: boolean; entityId?: string | null; disabledReason?: string; selectionCount?: number; atEdge?: boolean } = {}) {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async (settings) => {
    const path = "/e2e/scene-context-menu.fixture.tsx";
    const { React, createRoot, SceneContextMenu } = await import(/* @vite-ignore */ path);
    const host = document.createElement("div");
    host.id = "scene-context-menu-fixture";
    document.body.append(host);
    const root = createRoot(host);
    root.render(React.createElement(SceneContextMenu, {
      x: settings.atEdge ? window.innerWidth - 2 : 200,
      y: settings.atEdge ? window.innerHeight - 2 : 100,
      entityId: settings.entityId === undefined ? "tree" : settings.entityId,
      entityName: "Tree", selectionCount: settings.selectionCount ?? 1,
      clipboardAvailable: settings.clipboardAvailable ?? true,
      disabledReason: settings.disabledReason,
      shortcutLabel: (command: string) => command === "edit.paste" ? "Ctrl+V" : "",
      onCommand(command: string, payload: unknown) {
        host.dataset.command = JSON.stringify({ command, payload });
        return true;
      },
      onClose(restoreFocus: boolean) {
        host.dataset.closed = String(restoreFocus);
        root.render(null);
      },
    }));
  }, options);
  return page.getByRole("menu", { name: "シーンの編集", exact: true });
}

test("Scene menu contains editing actions, not creation presets", async ({ page }) => {
  const menu = await mountMenu(page);
  for (const label of ["コピー", "貼り付け", "反転して貼り付け", "複製", "名前を変更", "フォーカス", "削除"]) {
    await expect(menu.getByRole("menuitem", { name: label, exact: true })).toBeVisible();
  }
  await expect(menu).not.toContainText(/Create|メッシュ|Cube|光るキューブ|光るパネル/);
  await expect(menu.getByRole("menu", { name: "反転する軸" })).toHaveCount(0);
});

test("Empty canvas exposes only paste and explains an empty clipboard", async ({ page }) => {
  const menu = await mountMenu(page, { entityId: null, clipboardAvailable: false });
  await expect(menu.getByRole("menuitem")).toHaveCount(2);
  const paste = menu.getByRole("menuitem", { name: "貼り付け", exact: true });
  await expect(paste).toBeDisabled();
  await expect(paste).toHaveAttribute("title", "先にEntityをコピーしてください");
  await expect(menu.getByRole("menuitem", { name: "反転して貼り付け", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.locator("#scene-context-menu-fixture")).toHaveAttribute("data-closed", "true");
});

for (const axis of ["x", "y", "z"] as const) {
  test(`Mirror paste dispatches ${axis.toUpperCase()} through the normal paste command`, async ({ page }) => {
    const menu = await mountMenu(page);
    await menu.getByRole("menuitem", { name: "反転して貼り付け", exact: true }).click();
    await menu.getByRole("menuitem", { name: `${axis.toUpperCase()}軸に反転して貼り付け`, exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(page.locator("#scene-context-menu-fixture")).toHaveAttribute("data-command", JSON.stringify({
      command: "edit.paste", payload: { mirrorAxis: axis, entityId: "tree", source: "scene" },
    }));
  });
}

test("Ordinary paste stays a single action without a mirror mode", async ({ page }) => {
  const menu = await mountMenu(page);
  await menu.getByRole("menuitem", { name: "貼り付け", exact: true }).click();
  await expect(page.locator("#scene-context-menu-fixture")).toHaveAttribute("data-command", JSON.stringify({
    command: "edit.paste", payload: { entityId: "tree", source: "scene" },
  }));
});

test("Menu and axis picker stay inside the window and own their keyboard events", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 480 });
  const menu = await mountMenu(page, { atEdge: true });
  const trigger = menu.getByRole("menuitem", { name: "反転して貼り付け", exact: true });
  await trigger.focus();
  await page.keyboard.press("ArrowRight");
  await expect(menu.getByRole("menuitem", { name: "X軸に反転して貼り付け", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(menu.getByRole("menuitem", { name: "Z軸に反転して貼り付け", exact: true })).toBeFocused();
  await expect.poll(async () => {
    const box = await menu.boundingBox();
    return Boolean(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 640 && box.y + box.height <= 480);
  }).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("Import lock prevents mutation and a multi-selection cannot be renamed as one object", async ({ page }) => {
  const reason = "素材の取り込みが終わるまでお待ちください";
  const menu = await mountMenu(page, { disabledReason: reason, selectionCount: 2 });
  for (const label of ["貼り付け", "反転して貼り付け", "複製", "名前を変更", "削除"]) {
    await expect(menu.getByRole("menuitem", { name: label, exact: true })).toBeDisabled();
  }
  await expect(menu.getByRole("menuitem", { name: "コピー", exact: true })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "フォーカス", exact: true })).toBeEnabled();
  await page.mouse.click(4, 4);
  await expect(menu).toHaveCount(0);
  await expect(page.locator("#scene-context-menu-fixture")).toHaveAttribute("data-closed", "false");
});

test("Real editor: copy, mirror paste, Undo and Redo keep the source and selected copy consistent", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("mirror-paste");
  await page.getByRole("button", { name: "作成して開く" }).click();
  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });
  await tree.getByText("床", { exact: true }).click();
  const scales = ["X", "Y", "Z"].map((axis) => page.getByRole("spinbutton", { name: `大きさ ${axis}`, exact: true }));
  const original = await Promise.all(scales.map((field) => field.inputValue()));
  const initialCount = await tree.getByRole("treeitem").count();
  await tree.getByText("床", { exact: true }).click({ button: "right" });
  await page.getByRole("menu", { name: "Hierarchyの編集", exact: true }).getByRole("menuitem", { name: "コピー", exact: true }).click();
  const viewport = page.getByLabel("編集可能な3Dシーン", { exact: true });
  await expect(viewport.locator("canvas").first()).toBeVisible();
  // A blank upper corner keeps the Scene menu independent of ray-hit geometry.
  await viewport.click({ button: "right", position: { x: 8, y: 8 } });
  const menu = page.getByRole("menu", { name: "シーンの編集", exact: true });
  await expect(menu).not.toContainText(/Create|光る/);
  await menu.getByRole("menuitem", { name: "反転して貼り付け", exact: true }).click();
  await menu.getByRole("menuitem", { name: "X軸に反転して貼り付け", exact: true }).click();
  await expect(tree.getByRole("treeitem")).toHaveCount(initialCount + 1);
  await expect(scales[0]).toHaveValue(String(-Number(original[0])));
  await expect(scales[1]).toHaveValue(original[1]);
  await expect(scales[2]).toHaveValue(original[2]);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(tree.getByRole("treeitem")).toHaveCount(initialCount);
  await expect(scales[0]).toHaveValue(original[0]);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(tree.getByRole("treeitem")).toHaveCount(initialCount + 1);
  await expect(scales[0]).toHaveValue(String(-Number(original[0])));
  await tree.getByText("床", { exact: true }).first().click();
  await expect(scales[0]).toHaveValue(original[0]);
});
