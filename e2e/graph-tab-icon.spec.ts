import { expect, test } from "@playwright/test";

test("ノードグラフの作成入口、素材、編集タブで同じアイコンを使う", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("graph-tab-icon");
  await page.getByRole("button", { name: "作成して開く" }).click();

  const assets = page.getByRole("region", { name: "Assets" });
  await assets.getByRole("button", { name: "新規アセットまたはフォルダー" }).click();
  const createGraph = page.getByRole("button", { name: "新規ノードグラフ", exact: true });
  await expect(createGraph.locator("svg.lucide-workflow")).toBeVisible();
  await createGraph.click();

  await expect(assets.locator("[data-asset-drag-preview] svg.lucide-workflow")).toBeVisible();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector.getByText("KHR ノードグラフ")).toBeVisible();
  await expect(inspector.locator("svg.lucide-workflow")).toBeVisible();
  await expect(inspector.getByText("画像データなし")).toHaveCount(0);
  await expect(inspector.getByText(/サムネイルがないため/)).toHaveCount(0);
  const graphTab = page.getByRole("tab", { name: /ノードエディターを表示/ });
  await expect(graphTab).toBeVisible();
  await expect(graphTab.locator("svg.lucide-workflow")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Scene Viewを表示" }).locator("svg.lucide-globe")).toBeVisible();
});
