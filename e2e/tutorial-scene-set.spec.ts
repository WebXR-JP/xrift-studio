import { expect, test } from "@playwright/test";

/**
 * The tutorial sets are the one place in the shelf where what lands is not just
 * geometry: a bundled sound has to be imported into the project, an Interactable
 * has to be attached, and an Interactivity Asset has to be created and pointed
 * at the set's own parts. Every one of those steps runs through the desktop
 * shell, so a fixture cannot see any of it — this walks the same path the
 * author does and checks that the placed Entity really carries all three.
 */
test("しかけ付きの3Dセットは、音とグラフごとSceneへ入る", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/e2e.html?scenario=ready");
  await expect(
    page.getByRole("heading", { name: "プロジェクト" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("tutorial-scene-set");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page.getByText("ビジュアル編集")).toBeVisible();

  const assets = page.getByRole("region", { name: "Assets" });
  await assets.getByRole("button", { name: "外部から追加" }).click();
  await page.getByRole("button", { name: /3Dセット/ }).click();

  const shelf = page.getByRole("region", { name: "3Dセット一覧" });
  await shelf.getByLabel("3Dセットを検索").fill("音の出るボタン");
  await shelf.getByRole("button", { name: /音の出るボタン/ }).click();

  const detail = page.getByRole("complementary", {
    name: "選択した3Dセットの詳細",
  });
  // The lesson is the reason this set exists, and it has to be readable before
  // placing rather than only after.
  await expect(detail.getByText("このセットで分かること")).toBeVisible();
  await detail.getByRole("button", { name: /音の出るボタンをSceneへ追加/ }).click();

  await expect(detail.getByText(/Sceneへ配置し/)).toBeVisible();
  // The shelf stays open for a set with steps: the steps are on this panel.
  await expect(
    detail.getByText("上の手順を見ながら、この画面を閉じてPlayを開始してください。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "外部リソースを閉じる" }).click();

  const tree = page.getByRole("tree", { name: "SceneのEntity階層" });
  await expect(tree.getByText("音の出るボタン", { exact: true })).toBeVisible();
  await tree.getByText("ボタン", { exact: true }).click();

  for (const component of ["Interactable", "Audio Source", "Interaction Trigger"]) {
    await expect(
      page.getByText(component, { exact: true }).first(),
      `${component}が配置されたEntityに載っている`,
    ).toBeVisible();
  }

  // The sound is a real imported Audio Asset, not an empty slot on the source,
  // and the graph is wired to the part it was authored against — the Inspector
  // reads back every action the set promised, including the one that only runs
  // after the timed change before it has finished.
  await expect(
    page.getByText("ボタン / Audio Source の再生を 再生 にする", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("の発光色を 指定した色 にする", { exact: false }),
  ).toHaveCount(2);
  await expect(assets.getByText("ボタンの音").first()).toBeVisible();

  // Every other tutorial set lands too. Placement is all-or-nothing — a set
  // whose sound, Interactable or graph could not be built returns nothing and
  // leaves no Entity — so the root appearing in the Hierarchy is what says the
  // whole set was assembled, including the ones that write to a Particle
  // Emitter, the Scene, the player, a Text, and a hidden Entity.
  for (const name of [
    "灯りのスイッチ",
    "紙吹雪のボタン",
    "自動で閉まる扉",
    "隠し扉のスイッチ",
    "テレポート台",
    "色を変えるライトパネル",
    "昼と夜のパネル",
    "文字が変わる看板",
    "環境音のスピーカー",
    "画質のスイッチ",
  ]) {
    await assets.getByRole("button", { name: "外部から追加" }).click();
    await page.getByRole("button", { name: /3Dセット/ }).click();
    await shelf.getByLabel("3Dセットを検索").fill(name);
    await shelf.getByRole("button", { name: new RegExp(name) }).click();
    await detail.getByRole("button", { name: new RegExp(`${name}をSceneへ追加`) }).click();
    await expect(detail.getByText(/Sceneへ配置し/)).toBeVisible();
    await page.getByRole("button", { name: "外部リソースを閉じる" }).click();
    await expect(tree.getByText(name, { exact: true })).toBeVisible();
  }

  // The looping set brings its own sound, so the library ends up with the
  // bundled files themselves rather than four Audio Sources pointing at none.
  await expect(assets.getByText("環境音のループ").first()).toBeVisible();
});
