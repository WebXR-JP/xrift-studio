import { expect, test } from "@playwright/test";

test("Interaction Triggerからノードグラフを開く入口が分かる", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("graph-inspector-entry");
  await page.getByRole("button", { name: "作成して開く" }).click();

  const assets = page.getByRole("region", { name: "Assets" });
  await assets.getByRole("button", { name: "新規アセットまたはフォルダー" }).click();
  await page.getByRole("button", { name: "新規ノードグラフ", exact: true }).click();
  await expect(assets.getByRole("img", { name: "KHR ノードグラフ" }).locator("svg.lucide-workflow")).toBeVisible();

  await page.getByRole("tab", { name: "Scene Viewを表示" }).click();
  await page.getByRole("tree", { name: "シーンのEntity階層" }).getByText("床", { exact: true }).click();
  await page.getByRole("button", { name: "Componentを追加", exact: true }).click();
  await page.getByPlaceholder("Componentを検索…").fill("Interaction Trigger");
  const addTrigger = page.getByRole("button", { name: "Interaction Trigger", exact: true });
  await expect(addTrigger.locator("svg.lucide-workflow")).toBeVisible();
  await addTrigger.click();

  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const openGraph = inspector.getByRole("button", { name: "グラフを開く", exact: true });
  await expect(openGraph.locator("svg.lucide-workflow")).toBeVisible();
  await expect(openGraph).toHaveAttribute("title", "選択したノードグラフをノードエディターで開く");
  await openGraph.click();
  await expect(page.getByRole("tab", { name: /ノードエディターを表示/, selected: true })).toBeVisible();
});
