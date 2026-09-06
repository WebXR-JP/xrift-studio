import { expect, test } from "@playwright/test";

test("モデルの選択表示はメッシュに沿い、次のクリックを妨げない", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  await page.evaluate(async () => {
    const path = "/e2e/model-selection.fixture.tsx";
    (await import(/* @vite-ignore */ path)).mountModelSelectionFixture();
  });
  await expect(page.getByRole("status")).toHaveText("電柱 1 を選択中");
  await expect(page.getByTestId("selection-fixture")).toHaveAttribute("data-ready", "true");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  // Orthographic camera: the middle pole is at screen centre.
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.getByRole("status")).toHaveText("電柱 2 を選択中");
  await page.screenshot({ path: testInfo.outputPath("mesh-selection.png") });
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.getByRole("status")).toHaveText("電柱 2 を選択中");
  await page.getByRole("button", { name: "選択を解除" }).click();
  await expect(page.getByRole("status")).toHaveText("未選択");
  expect(errors).toEqual([]);
});
