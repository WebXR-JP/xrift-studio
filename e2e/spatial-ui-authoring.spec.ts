import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}

test("空間UIガイドの実例を通常のEditorで取り込み、照明を有効にして描画する", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible({ timeout: 120_000 });
  expect((await call(page, "create_project", { name: "spatial-ui-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const guide = await call(page, "get_world_authoring_guide", { topic: "spatial-ui" });
  expect(guide.ok).toBe(true);
  const source = (guide.result!.design as { exampleSource: string }).exampleSource;
  const imported = await call(page, "apply_r3f_scene", { name: "Learning Stations", source }, true);
  expect(imported.ok, JSON.stringify(imported)).toBe(true);
  const settings = await call(page, "update_scene_settings", {
    skybox: { enabled: true, topColor: "#739ab5", bottomColor: "#e6eef1" },
    ambient: { enabled: true, intensity: 0.4, color: "#ddeeff" },
    editor: { gizmo: { gridVisible: false } },
  }, true);
  expect(settings.ok, JSON.stringify(settings)).toBe(true);
  expect((await call(page, "set_scene_view_camera", { position: [0, 2.1, 3.8], target: [0, 1.55, -3] }, true)).ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const entities = await call(page, "list_entities");
  expect(entities.ok).toBe(true);
  const capture = await call(page, "capture_scene_view", {}, true);
  expect(capture.ok, JSON.stringify(capture)).toBe(true);
  const image = capture.result!.image as { data: string; mimeType: string };
  expect(image.data.length).toBeGreaterThan(1000);
  const path = testInfo.outputPath("spatial-ui-editor.png");
  await writeFile(path, Buffer.from(image.data, "base64"));
  await testInfo.attach("spatial-ui-editor", { path, contentType: "image/png" });
  expect((await call(page, "set_scene_view_camera", { position: [0, 1.55, -0.6], target: [0, 1.55, -3] }, true)).ok).toBe(true);
  const reading = await call(page, "capture_scene_view", {}, true);
  expect(reading.ok, JSON.stringify(reading)).toBe(true);
  const readingPath = testInfo.outputPath("spatial-ui-reading.png");
  await writeFile(readingPath, Buffer.from((reading.result!.image as { data: string }).data, "base64"));
  await testInfo.attach("spatial-ui-reading", { path: readingPath, contentType: "image/png" });
  expect((await call(page, "set_play_mode", { mode: "play" }, true)).ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.editorMode).toBe("play");
  expect((await call(page, "set_play_mode", { mode: "edit" }, true)).ok).toBe(true);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__?.unhandledCommands ?? [])).toEqual([]);
});
