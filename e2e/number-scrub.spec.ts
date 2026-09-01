import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * 数値は打ったそばから反映し、左右のドラッグで動かせる。
 *
 * 以前の Inspector は上下のスピナーで一つずつ数えるか、入力欄を離れるまで
 * 値が反映されないものが混ざっていた。ここでは「打った値が即座に document
 * へ入る」ことと「入力欄を横へ引くと値が動き、Escape で戻る」ことを、実際に
 * 動いている Editor で確かめる。
 */

async function openBlankWorld(page: Page, name: string): Promise<void> {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("heading", { name: "プロジェクト" })).toBeVisible();
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill(name);
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page.getByText("ビジュアル編集")).toBeVisible();
}

async function dragHorizontally(
  page: Page,
  field: Locator,
  deltaX: number,
  options: { escape?: boolean } = {},
): Promise<void> {
  const box = await field.boundingBox();
  if (!box) throw new Error("入力欄が画面にない");
  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX / 2, y, { steps: 5 });
  await page.mouse.move(startX + deltaX, y, { steps: 5 });
  if (options.escape) {
    await page.keyboard.press("Escape");
  }
  await page.mouse.up();
}

test("Transformの数値は横へ引いて動かし、Escapeで戻せる", async ({ page }) => {
  await openBlankWorld(page, "number-scrub-transform");

  const tree = page.getByRole("tree", { name: "SceneのEntity階層" });
  await tree.getByText("床", { exact: true }).click();

  const positionX = page.getByRole("spinbutton", { name: "Position X" });
  await expect(positionX).toHaveValue("0");

  // Position は 1px あたり 0.01。100px 引けば 1.0 動く。
  await dragHorizontally(page, positionX, 100);
  expect(Number(await positionX.inputValue())).toBeCloseTo(1, 2);

  await dragHorizontally(page, positionX, 100, { escape: true });
  expect(
    Number(await positionX.inputValue()),
    "Escapeで引き始める前の値へ戻す",
  ).toBeCloseTo(1, 2);

  // ドラッグ一回が Undo 一件。数値入力の中では Editor の shortcut を
  // 抑止しているので、入力欄から出てから Undo する。
  await tree.getByText("床", { exact: true }).click();
  await page.keyboard.press("Control+z");
  expect(Number(await positionX.inputValue())).toBeCloseTo(0, 2);
});

test("Transformの数値は打った時点で反映する", async ({ page }) => {
  await openBlankWorld(page, "number-scrub-typing");

  const tree = page.getByRole("tree", { name: "SceneのEntity階層" });
  await tree.getByText("床", { exact: true }).click();

  const positionY = page.getByRole("spinbutton", { name: "Position Y" });
  await positionY.click();
  await positionY.fill("2.5");
  // 打った値は入力欄の中に留まらず、この時点で Scene へ入っている。
  await expect(positionY).toBeFocused();

  // 別の Entity を挟んで戻る。確定前なら 0 に戻ってしまう。
  await tree.getByText("Environment", { exact: true }).click();
  await tree.getByText("床", { exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Position Y" })).toHaveValue(
    "2.5",
  );
});

test("シーン設定の数値も入力欄を離れずに反映する", async ({ page }) => {
  await openBlankWorld(page, "number-scrub-scene-settings");

  await page.getByRole("button", { name: "シーン設定を開く" }).click();
  const fov = page.getByRole("spinbutton", { name: "視野角" });
  await expect(fov).toBeVisible();
  const before = Number(await fov.inputValue());

  await fov.click();
  await fov.fill(String(before + 10));
  await expect(fov).toBeFocused();

  // 入力欄を離れずに Undo すれば、反映済みだったことが分かる。
  await page.keyboard.press("Escape");
  await page.getByRole("tree", { name: "SceneのEntity階層" }).click();
  await page.keyboard.press("Control+z");
  await expect(fov).toHaveValue(String(before));
});
