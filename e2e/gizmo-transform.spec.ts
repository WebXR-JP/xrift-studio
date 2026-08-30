import { expect, test, type Page } from "@playwright/test";

/**
 * The transform gizmo has to draw on the object it moves.
 *
 * Three positions its handles and its drag plane in the controls' own parent
 * space, so mounting the controls inside the selected Entity's ancestors
 * applies their transform a second time: the gizmo drifts away from the
 * object, and because the drag plane drifts with it, a drag moves the object
 * by the wrong amount. The Scene View therefore portals the controls to the
 * Scene root, and this test holds that by measuring the running editor.
 */

type MinimalObject3D = {
  isScene?: boolean;
  isTransformControls?: boolean;
  type: string;
  parent: MinimalObject3D | null;
  children: MinimalObject3D[];
  object?: MinimalObject3D;
  gizmo?: Record<string, MinimalObject3D>;
  matrixWorld: { elements: number[] };
  updateWorldMatrix: (updateParents: boolean, updateChildren: boolean) => void;
  updateMatrixWorld: (force?: boolean) => void;
  traverse: (visit: (object: MinimalObject3D) => void) => void;
};

declare global {
  interface Window {
    __THREE_SCENES__?: MinimalObject3D[];
  }
}

type GizmoReport = {
  found: boolean;
  mountedAtSceneRoot?: boolean;
  /** World position of the Entity the gizmo is attached to. */
  object?: number[];
  /** World position of a translate handle, which is what the author sees. */
  handle?: number[];
  /** World position of the plane a drag is measured against. */
  plane?: number[];
};

/**
 * Three announces every Scene it creates to `__THREE_DEVTOOLS__`, which is the
 * only handle a page script has on React Three Fiber's scene graph.
 */
async function installSceneProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const devtools = new EventTarget();
    (window as unknown as Record<string, unknown>).__THREE_DEVTOOLS__ =
      devtools;
    window.__THREE_SCENES__ = [];
    devtools.addEventListener("observe", (event) => {
      const detail = (event as CustomEvent).detail as MinimalObject3D;
      if (detail?.isScene) window.__THREE_SCENES__?.push(detail);
    });
  });
}

async function readGizmo(page: Page): Promise<GizmoReport> {
  return page.evaluate(() => {
    const worldPosition = (object: MinimalObject3D): number[] => {
      object.updateWorldMatrix(true, false);
      const elements = object.matrixWorld.elements;
      return [
        Number(elements[12].toFixed(4)),
        Number(elements[13].toFixed(4)),
        Number(elements[14].toFixed(4)),
      ];
    };

    for (const scene of window.__THREE_SCENES__ ?? []) {
      let controls: MinimalObject3D | null = null;
      scene.traverse((object) => {
        if (!controls && object.isTransformControls) controls = object;
      });
      const attached = controls as MinimalObject3D | null;
      if (!attached?.object) continue;
      scene.updateMatrixWorld(true);

      const gizmo = attached.children.find(
        (child) => child.type === "TransformControlsGizmo",
      );
      const plane = attached.children.find(
        (child) => child.type === "TransformControlsPlane",
      );
      const handle = gizmo?.gizmo?.translate?.children?.[0];
      return {
        found: true,
        mountedAtSceneRoot: attached.parent === scene,
        object: worldPosition(attached.object),
        ...(handle ? { handle: worldPosition(handle) } : {}),
        ...(plane ? { plane: worldPosition(plane) } : {}),
      };
    }
    return { found: false };
  });
}

test("親を動かした子Entityでもギズモが対象の上に描かれる", async ({ page }) => {
  await installSceneProbe(page);

  await page.goto("/e2e.html?scenario=ready");
  await expect(
    page.getByRole("heading", { name: "プロジェクト" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page
    .getByRole("button", { name: /ワールドをビジュアルで作る/ })
    .click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("gizmo-transform");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page.getByText("ビジュアル編集")).toBeVisible();

  const tree = page.getByRole("tree", { name: "SceneのEntity階層" });

  // The starter Scene parents its content under Environment. Moving that
  // parent is what makes a doubly applied transform visible at all.
  await tree.getByText("Environment", { exact: true }).click();
  const environmentX = page.getByRole("spinbutton", { name: "Position X" });
  await environmentX.fill("6");
  await environmentX.press("Enter");

  await tree.getByText("床", { exact: true }).click();
  await expect
    .poll(async () => (await readGizmo(page)).found, { timeout: 15_000 })
    .toBe(true);

  const report = await readGizmo(page);
  expect(
    report.mountedAtSceneRoot,
    "ギズモはScene直下に置く。Entityの親の下だと変換が二重に掛かる",
  ).toBe(true);
  expect(report.object?.[0]).toBeCloseTo(6, 3);
  expect(report.handle, "ハンドルは対象の上に描かれる").toEqual(report.object);
  expect(report.plane, "ドラッグ平面も対象の上に置かれる").toEqual(
    report.object,
  );
});
