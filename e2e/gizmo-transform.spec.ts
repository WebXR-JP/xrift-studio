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
  await expect(page.getByRole("banner").getByText("ビジュアルエディター")).toBeVisible();

  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });

  // The starter Scene parents its content under Environment. Moving that
  // parent is what makes a doubly applied transform visible at all.
  await tree.getByText("Environment", { exact: true }).click();
  const environmentX = page.getByRole("spinbutton", { name: "位置 X" });
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

test("複数選択の回転と拡縮はドラッグ中に全Entityへ反映される", async ({ page }) => {
  await installSceneProbe(page);
  await page.goto("/e2e.html?scenario=ready");
  await page.getByRole("button", { name: /新規プロジェクト/ }).click();
  await page.getByRole("button", { name: /ワールドをビジュアルで作る/ }).click();
  await page.getByRole("radio", { name: /空のワールド|Blank/ }).click();
  await page.getByLabel("プロジェクト名").fill("gizmo-multi-transform");
  await page.getByRole("button", { name: "作成して開く" }).click();
  await expect(page.getByRole("banner").getByText("ビジュアルエディター")).toBeVisible();

  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });
  await tree.getByText("床", { exact: true }).click();
  await tree.getByText("Spawn Point", { exact: true }).click({ modifiers: ["Control"] });
  await expect(tree.getByRole("treeitem", { selected: true })).toHaveCount(2);

  const transform = async (mode: "rotate" | "scale") => page.evaluate((mode) => {
    const scene = window.__THREE_SCENES__?.find((candidate) => {
      let found = false;
      candidate.traverse((object) => { if (object.isTransformControls) found = true; });
      return found;
    });
    if (!scene) throw new Error("Scene was not observed");
    let controls: MinimalObject3D | null = null;
    const entities = new Map<string, MinimalObject3D>();
    scene.traverse((object) => {
      if (object.isTransformControls) controls = object;
      const id = (object as MinimalObject3D & { userData?: { authoringEntityId?: string } }).userData?.authoringEntityId;
      if (id === "starter-floor" || id === "starter-spawn") entities.set(id, object);
    });
    if (!controls || entities.size !== 2) throw new Error("Selected Entity groups were not found");
    const control = controls as unknown as {
      object: {
        rotation: { y: number };
        scale: { x: number; y: number; z: number };
      };
      dispatchEvent: (event: { type: string }) => void;
    };
    const pose = (id: string) => {
      const object = entities.get(id)! as MinimalObject3D & {
        rotation: { x: number; y: number; z: number };
        scale: { x: number; y: number; z: number };
      };
      object.updateWorldMatrix(true, false);
      const rounded = (values: number[]) => values.map((value) => Number(value.toFixed(4)));
      return {
        position: rounded(object.matrixWorld.elements.slice(12, 15)),
        rotation: rounded([object.rotation.x, object.rotation.y, object.rotation.z]),
        scale: rounded([object.scale.x, object.scale.y, object.scale.z]),
      };
    };
    const before = [pose("starter-floor"), pose("starter-spawn")];
    control.dispatchEvent({ type: "mouseDown" });
    if (mode === "rotate") control.object.rotation.y += Math.PI / 2;
    else {
      control.object.scale.x *= 2;
      control.object.scale.y *= 2;
      control.object.scale.z *= 2;
    }
    control.dispatchEvent({ type: "objectChange" });
    const during = [pose("starter-floor"), pose("starter-spawn")];
    control.dispatchEvent({ type: "mouseUp" });
    return { before, during };
  }, mode);
  const readCommittedPoses = () => page.evaluate(() => {
    const entities = new Map<string, MinimalObject3D>();
    for (const scene of window.__THREE_SCENES__ ?? []) {
      scene.traverse((object) => {
        const id = (object as MinimalObject3D & { userData?: { authoringEntityId?: string } }).userData?.authoringEntityId;
        if (id === "starter-floor" || id === "starter-spawn") entities.set(id, object);
      });
    }
    return ["starter-floor", "starter-spawn"].map((id) => {
      const object = entities.get(id) as MinimalObject3D & {
        rotation: { x: number; y: number; z: number };
        scale: { x: number; y: number; z: number };
      };
      object.updateWorldMatrix(true, false);
      const rounded = (values: number[]) => values.map((value) => Number(value.toFixed(4)));
      return {
        position: rounded(object.matrixWorld.elements.slice(12, 15)),
        rotation: rounded([object.rotation.x, object.rotation.y, object.rotation.z]),
        scale: rounded([object.scale.x, object.scale.y, object.scale.z]),
      };
    });
  });

  await page.getByRole("button", { name: "回転", exact: true }).click();
  const rotated = await transform("rotate");
  for (let index = 0; index < 2; index++) {
    expect(rotated.during[index].position).not.toEqual(rotated.before[index].position);
    expect(rotated.during[index].rotation).not.toEqual(rotated.before[index].rotation);
  }
  await expect.poll(readCommittedPoses).toEqual(rotated.during);

  await page.getByRole("button", { name: "拡縮", exact: true }).click();
  const scaled = await transform("scale");
  for (let index = 0; index < 2; index++) {
    expect(scaled.during[index].position).not.toEqual(scaled.before[index].position);
    expect(scaled.during[index].scale).not.toEqual(scaled.before[index].scale);
  }
  await expect.poll(readCommittedPoses).toEqual(scaled.during);
});
