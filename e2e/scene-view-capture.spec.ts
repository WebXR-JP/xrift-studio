import { expect, test, type Page } from "@playwright/test";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";

// Captures are compared pixel for pixel, so the drawing buffer follows CSS
// pixels and the quality is pinned instead of adapting to this machine's load.
test.use({ deviceScaleFactor: 1 });
test.setTimeout(240_000);

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}

type Capture = { showEditorHelpers: boolean; revision: number; image: { data: string; mimeType: string } };

async function capture(page: Page, args: Record<string, unknown> = {}): Promise<Capture> {
  const response = await call(page, "capture_scene_view", args, true);
  expect(response.ok, JSON.stringify(response.error)).toBe(true);
  return response.result as unknown as Capture;
}

/** Decodes two PNGs in the page and counts the pixels that differ. */
async function compare(page: Page, left: Capture, right: Capture) {
  return page.evaluate(async ([a, b]) => {
    const read = async (data: string) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    };
    const [first, second] = [await read(a!), await read(b!)];
    const sameSize = first.width === second.width && first.height === second.height;
    let different = 0;
    if (sameSize) {
      for (let index = 0; index < first.data.length; index += 4) {
        if (first.data[index] !== second.data[index] || first.data[index + 1] !== second.data[index + 1] || first.data[index + 2] !== second.data[index + 2]) different++;
      }
    }
    return { sameSize, width: first.width, height: first.height, different };
  }, [left.image.data, right.image.data]);
}

test("capture_scene_viewは編集用の表示を除いた画像を返し、Scene View・選択・保存した設定を変えない", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible({ timeout: 120_000 });
  expect((await call(page, "create_project", { name: "scene-view-capture-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const quality = page.getByLabel("シーン描画品質");
  if (!(await quality.isVisible())) await page.getByRole("button", { name: "表示と診断の設定" }).click();
  await quality.selectOption("high");

  // The blank world: a floor, a Box at the origin, a Light and a SpawnPoint.
  const canvas = page.locator("canvas").first();
  const selectedName = async () => ((await call(page, "get_editor_context")).result?.selectedEntity as { name: string } | null)?.name ?? null;
  const entities = (await call(page, "list_entities")).result!.entities as { id: string; name: string }[];
  const spawn = entities.find(entity => entity.name === "SpawnPoint")!;
  expect(spawn, JSON.stringify(entities)).toBeTruthy();
  const tree = page.getByRole("tree", { name: "シーンのEntity階層" });

  // The reference: a Scene that has no editing helper to draw. The grid is
  // off, the spawn marker's Entity is disabled and nothing is selected.
  // Clicking the empty sky clears the selection the way an author does.
  expect((await call(page, "update_scene_settings", { editor: { gizmo: { gridVisible: false } } }, true)).ok).toBe(true);
  expect((await call(page, "set_entity_enabled", { entityId: spawn.id, enabled: false }, true)).ok).toBe(true);
  expect((await call(page, "set_scene_view_camera", { position: [0, 2, 0], target: [0, 60, -1] }, true)).ok).toBe(true);
  await canvas.click();
  await expect.poll(selectedName).toBeNull();
  // From here the Box, the floor's grid and the spawn marker are in the frame,
  // and the Light's own marker is behind the camera.
  const view = { position: [3.2, 2.4, 6.2], target: [0, 0.4, 1.2] };
  expect((await call(page, "set_scene_view_camera", view, true)).ok).toBe(true);
  const reference = await capture(page);

  // The Scene as an author leaves it: grid on, marker shown, the Box selected
  // with its gizmo, outline and Collider frame.
  expect((await call(page, "update_scene_settings", { editor: { gizmo: { gridVisible: true } } }, true)).ok).toBe(true);
  expect((await call(page, "set_entity_enabled", { entityId: spawn.id, enabled: true }, true)).ok).toBe(true);
  await tree.getByText("Box", { exact: true }).click();
  await expect.poll(selectedName).toBe("Box");
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const saves = () => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.calls.filter(entry => entry.command === "save_visual_project").length);
  const savesBefore = await saves();
  const viewBefore = await canvas.screenshot();

  const before = await capture(page);
  const clean = await capture(page, { showEditorHelpers: false });
  const after = await capture(page);
  for (const [name, shot] of Object.entries({ reference, before, clean, after })) {
    await testInfo.attach(`${name}.png`, { body: Buffer.from(shot.image.data, "base64"), contentType: "image/png" });
  }

  // Omitting the option is the picture clients always received.
  expect(before.showEditorHelpers).toBe(true);
  expect(clean.showEditorHelpers).toBe(false);
  const helpers = await compare(page, before, clean);
  expect(helpers.sameSize, JSON.stringify(helpers)).toBe(true);
  expect(helpers.different).toBeGreaterThan(2000);
  // Without helpers the frame is exactly the Scene that has none to draw:
  // no grid, no gizmo, no selection or Collider outline, no spawn marker.
  expect(await compare(page, clean, reference)).toMatchObject({ sameSize: true, different: 0 });
  // Afterwards the Scene View draws its helpers again...
  expect(await compare(page, after, before)).toMatchObject({ sameSize: true, different: 0 });
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), viewBefore), { timeout: 15_000 }).toBe(0);
  // ...and neither the selection nor anything saved has moved.
  expect(after.revision).toBe(before.revision);
  const context = (await call(page, "get_editor_context")).result!;
  expect((context.selectedEntity as { name: string } | null)?.name).toBe("Box");
  expect((context.sceneSettings as { editor: { gizmo: { gridVisible: boolean } } }).editor.gizmo.gridVisible).toBe(true);
  expect(context.saveStatus).toBe("saved");
  expect(await saves()).toBe(savesBefore);

  // A value that is not a boolean is refused, and takes no picture.
  const invalid = await call(page, "capture_scene_view", { showEditorHelpers: "false" }, true);
  expect(invalid.ok).toBe(false);
  expect(invalid.error?.code).toBe("INVALID_ARGUMENT");
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__?.unhandledCommands ?? [])).toEqual([]);
  expect(errors).toEqual([]);
});
