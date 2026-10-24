import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const invoke = Reflect.get(window, "__XRIFT_RELEASE_E2E_CALL__");
    const context = fresh ? (await invoke("get_editor_context")).result : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}
const source = `import { defineScript, prop } from 'xrift:script';
import { Container, Text } from '@react-three/uikit';
export default defineScript({ name: 'Panel lifecycle fixture', props: { title: prop.string({ default: 'EDIT PREVIEW' }) },
  start(ctx) { ctx.log('PLAY_START'); let first = true; return { update() { if (first) { first = false; ctx.log('PLAY_UPDATE'); } } }; }
});
export function Render({ ctx }) { return <Container sizeX={1.8} sizeY={1.1} pixelSize={0.005} padding={24} borderRadius={20} backgroundColor='#152536' flexDirection='column' gap={12}>
  <Text fontSize={26} color='#ffffff'>{ctx.props.title}</Text><Text fontSize={16} color='#88e0d0'>Visible without pressing Play</Text>
</Container>; }`;

test("distributed UIKit renders in Edit, preserves provider identity and starts gameplay only in Play", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: "production-uikit-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  const entity = await call(page, "create_empty_entity", { name: "案内パネル" }, true);
  const entityId = entity.result!.entityId as string;
  expect((await call(page, "update_transform", { entityId, position: [0, 1.6, -3] }, true)).ok).toBe(true);
  const applied = await call(page, "apply_script_template", { entityId, templateId: "uikit-panel" }, true);
  expect(applied.ok, JSON.stringify(applied)).toBe(true);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "__XRIFT_RELEASE_E2E_GLYPHS__")())).toBeGreaterThan(10);
  expect((await call(page, "update_script_asset", { scriptAssetId: applied.result!.scriptAssetId, source }, true)).ok).toBe(true);
  expect((await call(page, "update_script_component", { entityId, componentId: applied.result!.componentId, runIn: "play" }, true)).ok).toBe(true);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "__XRIFT_RELEASE_E2E_GLYPHS__")())).toBe(0);
  expect((await call(page, "update_script_component", { entityId, componentId: applied.result!.componentId, runIn: "play-and-edit", properties: { title: "EDIT PREVIEW" } }, true)).ok).toBe(true);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "__XRIFT_RELEASE_E2E_GLYPHS__")())).toBeGreaterThan(10);
  const editing = (await call(page, "get_editor_context")).result!;
  expect(editing.editorMode).toBe("edit");
  expect(JSON.stringify(editing.scriptRuntime)).not.toContain("PLAY_START");
  expect((await call(page, "set_scene_view_camera", { position: [0, 1.6, 1], target: [0, 1.6, -3] }, true)).ok).toBe(true);
  const capture = await call(page, "capture_scene_view", {}, true);
  expect(capture.ok, JSON.stringify(capture)).toBe(true);
  const path = testInfo.outputPath("uikit-edit-production.png");
  await writeFile(path, Buffer.from((capture.result!.image as { data: string }).data, "base64"));
  await testInfo.attach("uikit-edit-production", { path, contentType: "image/png" });
  expect((await call(page, "set_play_mode", { mode: "play" }, true)).ok).toBe(true);
  await expect.poll(async () => JSON.stringify((await call(page, "get_editor_context")).result!.scriptRuntime)).toContain("PLAY_UPDATE");
  expect((await call(page, "set_play_mode", { mode: "edit" }, true)).ok).toBe(true);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "__XRIFT_RELEASE_E2E_GLYPHS__")())).toBeGreaterThan(10);
  expect(JSON.stringify((await call(page, "get_editor_context")).result!.scriptRuntime)).not.toContain("PLAY_START");
  expect(errors).toEqual([]);
  await expect(page.getByRole("heading", { name: "ビジュアルエディターを表示できませんでした", exact: true })).toHaveCount(0);
});
