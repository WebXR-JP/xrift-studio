import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

type State = ReturnType<typeof import("./skinned-node-edit.fixture").readSkinnedNodeState>;

test.beforeAll(() => { execFileSync(process.execPath, ["e2e/skinned-node-edit.prepare.cjs"], { stdio: "pipe" }); });

test.beforeEach(async ({ page }) => {
  const metricsPath = process.env.XRIFT_E2E_FONT_METRICS_PATH;
  if (metricsPath) {
    await page.route("https://public.xrift.net/fonts/msdf/NotoSansJP/metrics.json?v=3", route =>
      route.fulfill({ contentType: "application/json", path: metricsPath }));
  }
});

async function read(page: Page): Promise<State> {
  return page.evaluate(async () => {
    const url = "/e2e/skinned-node-edit.fixture.tsx";
    return (await import(/* @vite-ignore */ url)).readSkinnedNodeState() as State;
  });
}

async function openAvatar(page: Page, version: "dense" | "0" | "1" = "dense", parentPose = false) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e/skinned-node-edit.html");
  const base64 = version === "dense" ? undefined : readFileSync(`.guide-review/skinned-node-fixtures/avatar-${version}${parentPose ? "-posed" : ""}.vrm`).toString("base64");
  await page.evaluate(async ({ version, base64, parentPose }) => {
    const url = "/e2e/skinned-node-edit.fixture.tsx";
    await (await import(/* @vite-ignore */ url)).mountSkinnedNodeEditor(document.getElementById("root")!, version, base64, parentPose ? "spine" : "hips");
  }, { version, base64, parentPose });
  await expect.poll(async () => (await read(page)).ready, { timeout: 30_000 }).toBe(true);
  const state = await read(page);
  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });
  await page.getByPlaceholder("名前・種類・状態で検索").fill(state.targetName);
  await tree.getByText(state.targetName, { exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "位置 X", exact: true })).toBeVisible();
  await expect.poll(async () => (await read(page)).pendingMaterialThumbnails, { timeout: 30_000 }).toBe(0);
  if (parentPose) {
    await page.getByPlaceholder("名前・種類・状態で検索").fill("Skinned Avatar");
    await tree.getByText("Skinned Avatar", { exact: true }).click();
    await page.getByRole("spinbutton", { name: "Bone回転 Z", exact: true }).fill("90");
    await expect.poll(async () => Object.values((await read(page)).bonePoses ?? {}).some(rotation => Math.abs(rotation[2] - Math.PI / 2) < 1e-6)).toBe(true);
    await page.getByPlaceholder("名前・種類・状態で検索").fill(state.targetName);
    await tree.getByText(state.targetName, { exact: true }).click();
    await expect(page.getByRole("spinbutton", { name: "位置 X", exact: true })).toBeVisible();
  }
  await expect(page.locator("header").first().getByRole("status")).toHaveText("保存済み");
  await page.evaluate(async () => {
    const url = "/e2e/skinned-node-edit.fixture.tsx";
    (await import(/* @vite-ignore */ url)).markSkinnedNodeBaseline();
  });
  return errors;
}

function expectSameRenderInstance(before: State, during: State) {
  expect(during.meshUuid).toBe(before.meshUuid);
  expect(during.skeletonUuid).toBe(before.skeletonUuid);
  expect(during.materialUuids).toEqual(before.materialUuids);
  expect(during.materials).toEqual(before.materials);
  expect(during.changedModelInstances).toBe(0);
}

async function attachRenderEvidence(before: State, during: State, committed: State) {
  const evidencePath = test.info().outputPath("skinned-render-evidence.json");
  writeFileSync(evidencePath, JSON.stringify({
    jointCount: before.jointCount,
    meshUuid: [before.meshUuid, during.meshUuid, committed.meshUuid],
    skeletonUuid: [before.skeletonUuid, during.skeletonUuid, committed.skeletonUuid],
    materialUuids: [before.materialUuids, during.materialUuids, committed.materialUuids],
    changedModelInstances: committed.changedModelInstances,
    frames: [before.frames, during.frames, committed.frames],
    saveCount: [before.saveCount, during.saveCount, committed.saveCount],
    vertexWorld: [before.vertexWorld, during.vertexWorld, committed.vertexWorld],
    boneWorld: [before.boneWorld, during.boneWorld, committed.boneWorld],
    proxyWorld: [before.proxyWorld, during.proxyWorld, committed.proxyWorld],
    savedNodePose: committed.savedNodePose,
    savedBonePose: committed.bonePoses,
  }, null, 2));
  await test.info().attach("skinned-render-evidence.json", {
    contentType: "application/json",
    path: evidencePath,
  });
}

test("128ボーンのNode数値ドラッグは途中でスキンを変形し、一度のUndo・保存で確定する", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await openAvatar(page);
  const before = await read(page);
  expect(before.jointCount).toBe(128);
  expect(before.materialConstructors).toContain("MToonMaterial");
  const input = page.getByRole("spinbutton", { name: "位置 X", exact: true });
  const box = (await input.boundingBox())!;
  const start = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(start, y);
  await page.mouse.down();
  await page.mouse.move(start + 40, y, { steps: 5 });
  await expect.poll(async () => (await read(page)).vertex?.[0]).toBeCloseTo(before.vertex![0]! + .2, 3);
  const first = await read(page);
  expectSameRenderInstance(before, first);
  expect(first.frames).toBeGreaterThan(before.frames);
  // A long, paused gesture must stay one save, even after the autosave delay.
  await page.waitForTimeout(1800);
  expect((await read(page)).saveCount).toBe(before.saveCount);
  expect(first.saveCount).toBe(before.saveCount);
  await page.mouse.move(start + 80, y, { steps: 5 });
  await expect.poll(async () => (await read(page)).vertex?.[0]).toBeCloseTo(before.vertex![0]! + .4, 3);
  expectSameRenderInstance(before, await read(page));
  await page.screenshot({ path: test.info().outputPath("skinned-node-live-scrub.png") });
  await page.mouse.up();
  await expect.poll(async () => (await read(page)).saveCount).toBe(before.saveCount + 1);
  expect((await read(page)).savedNodePose?.position[0]).toBeCloseTo(.4, 3);
  await attachRenderEvidence(before, first, await read(page));
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(input).toHaveValue("0");
  await expect.poll(async () => (await read(page)).vertex).toEqual(before.vertex);
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(input).toHaveValue("0.4");
  await expect.poll(async () => (await read(page)).vertex?.[0]).toBeCloseTo(before.vertex![0]! + .4, 3);
  const current = await read(page);
  await page.mouse.move(start, y); await page.mouse.down();
  await page.mouse.move(start + 40, y, { steps: 4 });
  await expect.poll(async () => (await read(page)).vertex?.[0]).toBeCloseTo(before.vertex![0]! + .6, 3);
  await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(input).toHaveValue("0.4");
  await expect.poll(async () => (await read(page)).vertex).toEqual(current.vertex);
  expectSameRenderInstance(before, await read(page));
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect.poll(async () => (await read(page)).vertex).toEqual(before.vertex);
  await expect(page.locator("header").first().getByRole("status")).toHaveText("保存済み");
  for (const pointerType of ["touch", "pen"] as const) {
    const cancelBefore = await read(page);
    const start = await page.evaluate(async () => {
      const url = "/e2e/skinned-node-edit.fixture.tsx";
      return (await import(/* @vite-ignore */ url)).getSkinnedNodePointerStart();
    });
    const cdp = await page.context().newCDPSession(page);
    if (pointerType === "touch") {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 71 }] });
    } else {
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...start, button: "left", buttons: 1, clickCount: 1, pointerType: "pen" });
    }
    await page.evaluate(async () => {
      const url = "/e2e/skinned-node-edit.fixture.tsx";
      const fixture = await import(/* @vite-ignore */ url);
      fixture.adoptSkinnedNodePointerGizmo();
      fixture.moveSkinnedNodeGizmo(.2);
    });
    await expect.poll(async () => (await read(page)).vertex?.[0]).toBeCloseTo(before.vertex![0]! + .2, 3);
    await page.evaluate(async pointerType => {
      const url = "/e2e/skinned-node-edit.fixture.tsx";
      (await import(/* @vite-ignore */ url)).cancelSkinnedNodeTouchGizmo(pointerType);
    }, pointerType);
    if (pointerType === "touch") {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    } else {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...start, button: "left", buttons: 0, clickCount: 1, pointerType: "pen" });
    }
    await cdp.detach();
    await expect.poll(async () => (await read(page)).vertex).toEqual(cancelBefore.vertex);
    await page.waitForTimeout(1000);
    const cancelled = await read(page);
    expect(cancelled.nodePose).toEqual(cancelBefore.nodePose);
    expect(cancelled.savedNodePose).toEqual(cancelBefore.savedNodePose);
    expect(cancelled.saveCount).toBe(cancelBefore.saveCount);
    expectSameRenderInstance(before, cancelled);
  }
  expect(errors).toEqual([]);
});

test("128ボーンのSceneギズモも確定前にスキンを変形する", async ({ page }) => {
  const errors = await openAvatar(page);
  const before = await read(page);
  await page.evaluate(async () => {
    const url = "/e2e/skinned-node-edit.fixture.tsx";
    const fixture = await import(/* @vite-ignore */ url);
    fixture.startSkinnedNodeGizmo(); fixture.moveSkinnedNodeGizmo(.2);
  });
  await expect.poll(async () => (await read(page)).vertex?.[0]).toBeCloseTo(before.vertex![0]! + .2, 3);
  const during = await read(page);
  expectSameRenderInstance(before, during);
  expect(during.nodePose).toEqual(before.nodePose);
  expect(during.saveCount).toBe(before.saveCount);
  await page.evaluate(async () => {
    const url = "/e2e/skinned-node-edit.fixture.tsx";
    const fixture = await import(/* @vite-ignore */ url);
    fixture.moveSkinnedNodeGizmo(.2); fixture.finishSkinnedNodeGizmo();
  });
  await expect.poll(async () => (await read(page)).saveCount).toBe(before.saveCount + 1);
  expect((await read(page)).savedNodePose?.position[0]).toBeCloseTo(.4, 3);
  expectSameRenderInstance(before, await read(page));
  await attachRenderEvidence(before, during, await read(page));
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect.poll(async () => (await read(page)).vertex).toEqual(before.vertex);
  expect(errors).toEqual([]);
});

test("Bone回転・Morph・ポーズリセットで既存Nodeの位置設定を保つ", async ({ page }) => {
  const errors = await openAvatar(page);
  const input = page.getByRole("spinbutton", { name: "位置 X", exact: true });
  await input.fill("0.25"); await input.press("Tab");
  const before = await read(page);
  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });
  await page.getByPlaceholder("名前・種類・状態で検索").fill("Skinned Avatar");
  await tree.getByText("Skinned Avatar", { exact: true }).click();
  await page.getByRole("spinbutton", { name: "Bone回転 Z", exact: true }).fill("10");
  await expect.poll(async () => (await read(page)).nodePose).toEqual(before.nodePose);
  const smile = page.locator("label").filter({ hasText: "Smile" }).getByRole("slider");
  await smile.focus(); await smile.press("ArrowRight");
  expect((await read(page)).nodePose).toEqual(before.nodePose);
  await page.getByRole("button", { name: "ポーズをリセット", exact: true }).click();
  await expect.poll(async () => (await read(page)).nodePose).toEqual(before.nodePose);
  expect((await read(page)).bonePoses).toEqual({});
  expect((await read(page)).morphPoses).toEqual({});
  expect(errors).toEqual([]);
});

for (const parentPose of [false, true]) {
for (const version of ["0", "1"] as const) {
  for (const space of ["world", "local"] as const) {
    test(`実VRM ${version}の${space}ギズモ移動とスキンの方向が一致する${parentPose ? "（親Bone回転90度）" : ""}`, async ({ page }) => {
      const errors = await openAvatar(page, version, parentPose);
      if (space === "local") await page.getByRole("button", { name: "World座標。クリックで切り替え", exact: true }).click();
      const before = await read(page);
      for (let axis = 0; axis < 3; axis++) {
        expect(before.boneWorld![axis]!).toBeCloseTo(before.proxyWorld![axis]!, 4);
      }
      const expected: number[] = await page.evaluate(async space => {
        const url = "/e2e/skinned-node-edit.fixture.tsx";
        const fixture = await import(/* @vite-ignore */ url);
        fixture.startSkinnedNodeGizmo();
        return fixture.moveSkinnedNodeGizmo(.2, space);
      }, space);
      await expect.poll(async () => (await read(page)).boneWorld).not.toEqual(before.boneWorld);
      let during = await read(page);
      for (let axis = 0; axis < 3; axis++) {
        expect(during.boneWorld![axis]! - before.boneWorld![axis]!).toBeCloseTo(expected[axis]!, 3);
        expect(during.vertexWorld![axis]! - before.vertexWorld![axis]!).toBeCloseTo(expected[axis]!, 3);
        expect(during.proxyWorld![axis]! - before.proxyWorld![axis]!).toBeCloseTo(expected[axis]!, 3);
      }
      expectSameRenderInstance(before, during);
      expect(during.nodePose).toEqual(before.nodePose);
      await page.evaluate(async space => {
        const url = "/e2e/skinned-node-edit.fixture.tsx";
        (await import(/* @vite-ignore */ url)).moveSkinnedNodeGizmo(.2, space);
      }, space);
      for (let axis = 0; axis < 3; axis++) {
        await expect.poll(async () => (await read(page)).vertexWorld?.[axis])
          .toBeCloseTo(before.vertexWorld![axis]! + expected[axis]! * 2, 3);
      }
      during = await read(page);
      for (let axis = 0; axis < 3; axis++) {
        expect(during.boneWorld![axis]! - before.boneWorld![axis]!).toBeCloseTo(expected[axis]! * 2, 3);
        expect(during.proxyWorld![axis]! - before.proxyWorld![axis]!).toBeCloseTo(expected[axis]! * 2, 3);
      }
      expectSameRenderInstance(before, during);
      expect(during.nodePose).toEqual(before.nodePose);
      if (parentPose) await page.screenshot({ path: test.info().outputPath(`vrm-${version}-${space}-parent-bone-live.png`) });
      await page.evaluate(async () => {
        const url = "/e2e/skinned-node-edit.fixture.tsx";
        (await import(/* @vite-ignore */ url)).finishSkinnedNodeGizmo();
      });
      await expect.poll(async () => (await read(page)).saveCount).toBe(before.saveCount + 1);
      const committed = await read(page);
      expect(committed.vertexWorld).toEqual(during.vertexWorld);
      expect(committed.bonePoses ?? {}).toEqual(before.bonePoses ?? {});
      for (const rotation of committed.nodePose?.rotation ?? []) expect(rotation).toBeCloseTo(0, 8);
      expectSameRenderInstance(before, committed);
      await attachRenderEvidence(before, during, committed);
      await page.getByRole("button", { name: "元に戻す", exact: true }).click();
      await expect.poll(async () => (await read(page)).vertexWorld).toEqual(before.vertexWorld);
      expect(errors).toEqual([]);
    });
  }
}
}
