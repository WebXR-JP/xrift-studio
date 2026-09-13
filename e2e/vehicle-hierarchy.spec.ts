import { expect, test } from "@playwright/test";

test("Vehicleを追加すると編集可能な車体と座席がHierarchyに展開される", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("vehicle-hierarchy-test");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await page.getByRole("button", { name: "外部から追加", exact: true }).click();
  await page.getByRole("button", { name: /^ギミック/ }).click();
  await page.locator("[data-catalog-card]").filter({ hasText: /^カスタム車/ }).click();
  await page.getByRole("button", { name: "カスタム車をシーンへ追加" }).click();
  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });
  await expect(tree.getByRole("button", { name: /^車体、/ })).toBeVisible();
  await expect(tree.getByRole("button", { name: /^運転席、/ })).toBeVisible();
  await expect(tree.getByRole("button", { name: /^同乗席、/ })).toBeVisible();
  await expect(tree.getByRole("button", { name: /^左前タイヤ、/ })).toBeVisible();
  await expect(tree.getByRole("button", { name: /^排気煙、/ })).toBeVisible();
  await tree.getByRole("button", { name: /^運転席、/ }).click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector.getByRole("heading", { name: "Mesh Renderer", exact: true })).toBeVisible();
  await expect(inspector.getByText("Script", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("status", { name: "変更は自動保存されています" })).toBeVisible();
  expect(errors).toEqual([]);
});
