import { expect, test } from "@playwright/test";

/**
 * The Scene View's lightweight quality has to actually reach the renderer.
 *
 * Its whole point is the frames it does not spend, so a switch that only
 * changed a label would be worse than none: the author would be told the view
 * is cheaper while the Scene keeps costing the same. That is not hypothetical —
 * the lightweight profile once asked for a device pixel ratio between 0.75 and
 * 1, which React Three Fiber clamps the display's own ratio into, so on an
 * ordinary 1x display it drew every pixel it drew before. This test runs at 1x
 * for exactly that reason: a HiDPI page would have hidden it.
 */
test.use({ deviceScaleFactor: 1 });

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

  await expect.poll(bufferScale, { timeout: 20_000 }).toBeCloseTo(1, 1);

  const quality = page.getByLabel("Scene View描画品質");
  if (!(await quality.isVisible())) {
    await page.getByRole("button", { name: "表示と診断の設定" }).click();
  }
  await quality.selectOption("low");

  await expect.poll(bufferScale, { timeout: 20_000 }).toBeCloseTo(0.75, 1);
  await expect(page.getByRole("tree", { name: "SceneのEntity階層" })).toBeVisible();

  // The rest of the ladder means what it says on this display too.
  await quality.selectOption("half");
  await expect.poll(bufferScale, { timeout: 20_000 }).toBeCloseTo(0.5, 1);

  await quality.selectOption("quarter");
  await expect.poll(bufferScale, { timeout: 20_000 }).toBeCloseTo(0.25, 1);

  await quality.selectOption("high");
  await expect.poll(bufferScale, { timeout: 20_000 }).toBeCloseTo(1, 1);
});
