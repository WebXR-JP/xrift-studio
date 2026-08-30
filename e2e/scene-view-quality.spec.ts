import { expect, test } from "@playwright/test";

/**
 * The Scene View's lightweight quality has to actually reach the renderer.
 *
 * Its whole point is the frames it does not spend, so a switch that only
 * changed a label would be worse than none: the author would be told the view
 * is cheaper while the Scene keeps costing the same. A HiDPI page makes the
 * resolution part of that measurable — the drawing buffer drops to the CSS
 * size once the lightweight profile is on.
 */
test.use({ deviceScaleFactor: 2 });

test("Scene Viewを軽量にすると描画解像度が下がる", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page
    .getByRole("button", { name: /ワールドをビジュアルで作る/ })
    .click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("scene-view-quality");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page.getByText("ビジュアル編集")).toBeVisible();

  const canvas = page.locator("canvas").first();
  const bufferScale = async () =>
    canvas.evaluate((element) => {
      const node = element as HTMLCanvasElement;
      const width = node.getBoundingClientRect().width;
      return width > 0 ? node.width / width : 0;
    });

  await expect.poll(bufferScale, { timeout: 20_000 }).toBeCloseTo(1.5, 1);

  const quality = page.getByLabel("Scene View描画品質");
  if (!(await quality.isVisible())) {
    await page.getByRole("button", { name: "表示と診断の設定" }).click();
  }
  await quality.selectOption("low");

  await expect.poll(bufferScale, { timeout: 20_000 }).toBeCloseTo(1, 1);
  await expect(page.getByRole("tree", { name: "SceneのEntity階層" })).toBeVisible();

  await quality.selectOption("high");
  await expect.poll(bufferScale, { timeout: 20_000 }).toBeCloseTo(1.5, 1);
});
