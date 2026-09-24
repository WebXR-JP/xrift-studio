import { expect, test, type Page } from "@playwright/test";

async function openVisualWorld(page: Page): Promise<void> {
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("assets-layout");
  await page.getByRole("button", { name: "作成して開く" }).click();
}

test("Assetsのグリッドは名前をアイコンの下に表示し横にはみ出さない", async ({ page }) => {
  await openVisualWorld(page);
  const assets = page.getByRole("region", { name: "Assets" });
  await expect(assets.getByRole("button", { name: "グリッド表示", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
  await expect(assets).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(assets.getByRole("complementary", { name: "Assetsのフォルダー" })).toHaveCSS("background-color", "rgb(255, 255, 255)");
  for (let index = 0; index < 10; index++) {
    await assets.getByRole("button", { name: "新規アセットまたはフォルダー" }).click();
    await page.getByRole("button", { name: "新規マテリアル", exact: true }).click();
  }
  await assets.getByRole("button", { name: /新規マテリアル 2/ }).first().click({ button: "right" });
  await page.getByRole("menu", { name: "Assetsのメニュー" }).getByRole("button", { name: "名前を変更" }).click();
  await assets.locator("input:focus").fill("xdrift_extremely_long_material_asset_name_for_layout");
  await assets.locator("input:focus").press("Enter");
  await assets.getByRole("button", { name: "新規アセットまたはフォルダー" }).click();
  await page.getByRole("button", { name: "新規フォルダー", exact: true }).click();
  await assets.locator('button[title="Assets/を表示"]').click();

  for (const width of [900, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    for (const mode of ["grid", "list"] as const) {
      await assets.getByRole("button", { name: mode === "grid" ? /グリッド表示/ : /リスト表示/ }).first().click();
      await expect(assets.locator('button[aria-label$="を削除"]')).toHaveCount(0);
      await page.mouse.move(0, 0);
      const problems = await assets.evaluate((panel, expectedMode) => {
        const preview = panel.querySelector<HTMLElement>("[data-asset-drag-preview]");
        const card = preview?.parentElement?.parentElement;
        const container = card?.parentElement;
        if (!preview || !card || !container) return ["Asset card not found"];
        const issues: string[] = [];
        if (container.scrollWidth > container.clientWidth + 1) issues.push("Assets content overflows horizontally");
        for (const item of container.children) {
          const itemBox = item.getBoundingClientRect();
          const containerBox = container.getBoundingClientRect();
          if (itemBox.right > containerBox.right + 1) issues.push("Card leaves Assets content");
        }
        const name = card.querySelector<HTMLElement>(".line-clamp-2") ?? card.querySelector<HTMLElement>(".truncate.text-slate-800");
        if (!name || name.getBoundingClientRect().width < 40) issues.push("Asset name has too little width");
        if (expectedMode === "grid") {
          if (preview.getBoundingClientRect().width > 40) issues.push("Preview is too wide");
          if (!name?.classList.contains("line-clamp-2")) issues.push("Asset name is limited to one line");
          if (name && preview.getBoundingClientRect().bottom > name.getBoundingClientRect().top + 1) issues.push("Name is not below the icon");
          const longName = [...container.querySelectorAll<HTMLElement>(".line-clamp-2")].find((element) => element.textContent?.startsWith("xdrift_extremely_long_material"));
          if (!longName || longName.getBoundingClientRect().height < 25) issues.push("Long asset name does not wrap to two lines");
          const unselected = container.querySelector<HTMLElement>('[aria-pressed="false"]')?.parentElement;
          if (unselected && !unselected.classList.contains("bg-transparent")) issues.push("Unselected tile has a card background");
          const folder = container.querySelector<HTMLElement>('[data-editor-drag-source="asset-folder"]');
          const folderName = folder?.querySelector<HTMLElement>(".line-clamp-2");
          const folderIcon = folder?.querySelector<SVGElement>("svg");
          if (!folder || !folderName || !folderIcon || folderIcon.getBoundingClientRect().bottom > folderName.getBoundingClientRect().top + 1) issues.push("Folder name is not below the icon");
          if (folder && getComputedStyle(folder.parentElement!).backgroundColor !== "rgba(0, 0, 0, 0)") issues.push("Folder tile has a card background");
        }
        return issues;
      }, mode);
      expect(problems, `${width}px ${mode}`).toEqual([]);
    }
  }
});

test("タッチ操作では削除アイコンの代わりに操作メニューを開ける", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 900, height: 900 } });
  try {
    const page = await context.newPage();
    await openVisualWorld(page);
    await page.getByRole("button", { name: "Assets", exact: true }).click();
    const assets = page.getByRole("region", { name: "Assets" });
    await assets.locator('button[aria-pressed]').filter({ hasText: "Neutral Ground" }).first().click();
    await expect(assets.locator('button[aria-label$="を削除"]')).toHaveCount(0);
    await expect(assets.getByRole("button", { name: "Neutral Groundの操作" })).toBeVisible();
    await assets.getByRole("button", { name: "Neutral Groundの操作" }).click();
    await expect(page.getByRole("menu", { name: "Assetsのメニュー" }).getByRole("button", { name: "削除", exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});
