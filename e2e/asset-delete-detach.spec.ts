import { expect, test, type Page } from "@playwright/test";

type ProbedObject = {
  isScene?: boolean;
  userData?: Record<string, unknown>;
  traverse: (visit: (object: ProbedObject) => void) => void;
};

/**
 * Three announces every Scene it creates to `__THREE_DEVTOOLS__`, which is how
 * a page script can tell that the Scene View has something to pick. Clicking
 * to find out does not work: repeated clicks at one point become double and
 * triple clicks, which are not what this is testing.
 */
async function installSceneProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const scope = window as unknown as Record<string, unknown>;
    const devtools = new EventTarget();
    const scenes: unknown[] = [];
    scope.__THREE_DEVTOOLS__ = devtools;
    scope.__XRIFT_E2E_SCENES__ = scenes;
    devtools.addEventListener("observe", (event) => {
      const detail = (event as CustomEvent).detail as { isScene?: boolean };
      if (detail?.isScene) scenes.push(detail);
    });
  });
}

async function waitForPickableEntity(
  page: Page,
  entityId: string,
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((wanted) => {
          const scenes =
            ((window as unknown as Record<string, unknown>)
              .__XRIFT_E2E_SCENES__ as ProbedObject[] | undefined) ?? [];
          for (const scene of scenes) {
            let found = false;
            scene.traverse((object) => {
              if (object.userData?.authoringEntityId === wanted) found = true;
            });
            if (found) return true;
          }
          return false;
        }, entityId),
      { timeout: 30_000 },
    )
    .toBe(true);
}

/**
 * A blocked Asset delete has to be solvable from the dialog that blocks it.
 *
 * The dialog used to list the references and stop, which left the author to
 * find every owner in the Hierarchy before the delete became possible. This
 * runs the whole loop in the real editor: the delete is refused, the reference
 * is unlinked from the row that names it, and the Asset then deletes.
 */
test("参照されているAssetを、削除ダイアログから参照を外して削除できる", async ({
  page,
}) => {
  await page.goto("/e2e.html?scenario=ready");
  await expect(
    page.getByRole("heading", { name: "プロジェクト" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page
    .getByRole("button", { name: /ワールドをビジュアルで作る/ })
    .click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("asset-delete-detach");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page.getByText("ビジュアル編集")).toBeVisible();

  // The blank starter's floor Material is used by the Scene and by the Ground
  // Platform Prefab, so the delete is refused with one row per owner.
  await page.getByPlaceholder("アセットを検索…").fill("Neutral Ground");
  await page
    .getByRole("button", { name: "Neutral Groundを削除" })
    .first()
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Assetを削除" })).toBeVisible();
  await expect(dialog.getByText("2件の参照があります")).toBeVisible();
  const references = dialog.getByRole("list", { name: "Assetの参照元" });
  await expect(references.getByRole("listitem")).toHaveCount(2);
  await expect(references.getByText("参照を空にする").first()).toBeVisible();

  // Unlinking one row clears that owner and leaves the rest, in place.
  await dialog
    .getByRole("button", { name: "床の参照を外す", exact: true })
    .click();
  await expect(dialog.getByText("1件の参照があります")).toBeVisible();
  await expect(references.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText("「床」の参照を外しました")).toBeVisible();

  // The footer finishes the job: unlink what is left, then delete.
  await dialog.getByRole("button", { name: "参照を外して削除" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByText("参照1件を外して「Neutral Ground」を削除しました"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Neutral Groundを削除" }),
  ).toHaveCount(0);
});

/**
 * Right-clicking an object in the Scene View acts on that object. Finding the
 * same row again in the Hierarchy is what made deleting something you can see
 * a search task.
 */
test("Scene Viewの右クリックから、指しているEntityを削除できる", async ({
  page,
}) => {
  await installSceneProbe(page);
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page
    .getByRole("button", { name: /ワールドをビジュアルで作る/ })
    .click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("viewport-context-delete");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page.getByText("ビジュアル編集")).toBeVisible();

  const tree = page.getByRole("tree", { name: "SceneのEntity階層" });
  await expect(tree.getByText("床", { exact: true })).toBeVisible();

  await waitForPickableEntity(page, "starter-floor");

  const canvas = page.locator("canvas").first();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Scene View was not laid out");
  const selected = page.getByRole("treeitem", { selected: true });

  // Nothing is selected before the right-click, so what the menu acts on can
  // only come from the pointer.
  await page.mouse.click(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height * 0.08,
  );
  await expect(selected).toHaveCount(0);

  await page.mouse.click(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height * 0.6,
    { button: "right" },
  );

  // "床" is also the name of the plane in Create Mesh, so the row that proves
  // the menu is acting on the pointed Entity is the delete button itself.
  const menu = page.getByRole("menu");
  const deleteEntity = menu.getByRole("button", { name: "削除", exact: true });
  await expect(deleteEntity).toHaveAttribute("title", /床/);
  await expect(selected).toContainText("床");
  await deleteEntity.click();
  await expect(page.getByText("「床」を削除しました")).toBeVisible();
  await expect(tree.getByText("床", { exact: true })).toHaveCount(0);
});
