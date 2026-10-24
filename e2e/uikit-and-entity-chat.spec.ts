import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { prepareUikitExport } from "./prepare-uikit-export";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}

async function ready(page: Page) {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible({ timeout: 120_000 });
  expect((await call(page, "create_project", { name: "uikit-chat-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
}

async function mockChatgpt(page: Page, blenderAvailable: boolean) {
  await page.evaluate(available => {
    window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null };
    const internals = window.__TAURI_INTERNALS__!, original = internals.invoke!.bind(internals);
    internals.invoke = async (command, args, options) => {
      if (command === "get_blender_status") return { available, version: available ? "4.5.0" : undefined };
      if (command === "chatgpt_pi_run") {
        document.documentElement.dataset.entityChatRequest = JSON.stringify({ prompt: args?.prompt, context: args?.context });
        throw new Error("検証用に推論を停止しました");
      }
      return original(command, args, options);
    };
  }, blenderAvailable);
}

for (const source of ["auto", "store", "blender"] as const) test(`Entityの右クリックから下書きを保ち、制作方法${source}で作り替えを送れる`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await ready(page);
  await mockChatgpt(page, true);
  const created = await call(page, "create_primitive", { shape: "box" }, true);
  expect(created.ok).toBe(true);
  const entityId = created.result!.entityId as string;
  expect((await call(page, "rename_entity", { entityId, name: "作り替える箱" }, true)).ok).toBe(true);
  const before = (await call(page, "list_entities")).result!.entities;
  const row = page.getByRole("tree", { name: "シーンのEntity階層" }).getByText("作り替える箱", { exact: true });
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "チャットに送る", exact: true }).click();
  const composer = page.getByRole("textbox", { name: "ワールドへの依頼" });
  await expect(composer).toBeFocused();
  await expect(page.getByRole("button", { name: "作り替える箱の添付を外す", exact: true })).toBeVisible();
  await expect(composer).toHaveValue("");
  await composer.fill("既存の下書き");
  const method = page.getByRole("combobox", { name: "制作方法", exact: true });
  await method.selectOption("blender");
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "AIで作り替える…", exact: true }).click();
  await expect(composer).toHaveValue(/既存の下書き[\s\S]*希望する仕上がり：[\s\S]*外部素材[\s\S]*@react-three\/uikit[\s\S]*同じEntity/);
  await expect(method).toHaveValue("auto");
  await expect(composer).toBeFocused();
  expect(await composer.evaluate(element => { const textarea = element as HTMLTextAreaElement; return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd); })).toBe("用途が伝わる形と、統一感のある色・質感。");
  await expect.poll(() => composer.evaluate(element => element.scrollTop < element.scrollHeight - element.clientHeight)).toBe(true);
  await expect(page.getByRole("button", { name: "作り替える箱の添付を外す", exact: true })).toHaveCount(1);
  expect((await call(page, "list_entities")).result!.entities).toEqual(before);
  if (source === "auto") await page.screenshot({ path: testInfo.outputPath("ai-remake-composer.png") });
  await page.keyboard.insertText("丸い背もたれの椅子");
  await expect(composer).toHaveValue(/既存の下書き[\s\S]*希望する仕上がり：\n丸い背もたれの椅子[\s\S]*@react-three\/uikit/);
  await method.selectOption(source);
  await page.getByRole("button", { name: "依頼を送信", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.entityChatRequest)).toBeTruthy();
  const sent = JSON.parse((await page.evaluate(() => document.documentElement.dataset.entityChatRequest))!) as { prompt: string; context: string };
  expect(sent.prompt).toContain("丸い背もたれの椅子");
  expect(JSON.parse(sent.context)).toMatchObject({ options: { modelSource: source }, attachedEntityIds: [entityId] });
});

test("Mesh Rendererのない案内Textも、Blender未導入でAIに仕上げを頼める", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await ready(page);
  await mockChatgpt(page, false);
  const created = await call(page, "create_empty_entity", { name: "案内パネル" }, true);
  expect(created.ok).toBe(true);
  const entityId = created.result!.entityId as string;
  expect((await call(page, "add_component", { entityId, definitionId: "core.text.panel" }, true)).ok).toBe(true);
  const before = (await call(page, "list_entities")).result!.entities;
  await page.getByRole("tree", { name: "シーンのEntity階層" }).getByText("案内パネル", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "AIで作り替える…", exact: true }).click();
  const composer = page.getByRole("textbox", { name: "ワールドへの依頼" });
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue(/角丸と余白のある、読みやすい案内UI。/);
  await expect(page.getByRole("combobox", { name: "制作方法", exact: true })).toHaveValue("auto");
  expect((await call(page, "list_entities")).result!.entities).toEqual(before);
  await page.getByRole("button", { name: "依頼を送信", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.entityChatRequest)).toBeTruthy();
  const sent = JSON.parse((await page.evaluate(() => document.documentElement.dataset.entityChatRequest))!) as { prompt: string; context: string };
  expect(JSON.parse(sent.context)).toMatchObject({ options: { modelSource: "auto" }, attachedEntityIds: [entityId] });
});

test("実フォントを正式なMCP取り込みで登録し、再取り込みでもFont IDを返す", async ({ page }) => {
  await ready(page);
  const bytes = await readFile("node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff");
  await page.evaluate(source => {
    const internals = window.__TAURI_INTERNALS__!, original = internals.invoke!.bind(internals);
    internals.invoke = async (command, args, options) => command === "read_local_font_import_source" ? source : original(command, args, options);
  }, { fileName: "noto-sans-jp.woff", mimeType: "font/woff", byteLength: bytes.length, dataUrl: `data:font/woff;base64,${bytes.toString("base64")}` });
  const imported = await call(page, "import_font_asset", { sourcePath: "C:/isolated-font-fixture/noto-sans-jp.woff", name: "日本語のFont" }, true);
  expect(imported.ok, JSON.stringify(imported)).toBe(true);
  expect(imported.result!.fontAssetId).toBeTruthy();
  expect(imported.result!.textureAssetId).toBeUndefined();
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const duplicate = await call(page, "import_font_asset", { sourcePath: "C:/isolated-font-fixture/noto-sans-jp.woff" }, true);
  expect(duplicate.ok, JSON.stringify(duplicate)).toBe(true);
  expect(duplicate.result).toMatchObject({ fontAssetId: imported.result!.fontAssetId, duplicate: true });
  expect((await call(page, "list_assets", { kind: "font" })).result!.assets).toMatchObject([{ id: imported.result!.fontAssetId, kind: "font", name: "日本語のFont", status: "ready" }]);
  const entity = await call(page, "create_empty_entity", { name: "Custom Font UI" }, true);
  const entityId = entity.result!.entityId as string;
  const script = await call(page, "apply_script_template", { entityId, templateId: "uikit-panel" }, true);
  expect(script.ok, JSON.stringify(script)).toBe(true);
  expect((await call(page, "update_script_component", { entityId, componentId: script.result!.componentId,
    properties: { font: imported.result!.fontAssetId, title: "日本語の案内", width: 3.2,
      body: "Hierarchyで選択。Inspectorで位置・回転・大きさを調整。右の見本で変化を比較。小さい立方体を移動して拡大。Materialsで色と粗さを変更。同じ形でも光の反射が変わります。マット、なめらか、金属を見比べよう。Playで歩いて表示を確認。文字との距離は2〜3mを目安に。確認後は編集に戻って調整。見本は入口と人の大きさの比較。" }, assetReferences: [imported.result!.fontAssetId] }, true)).ok).toBe(true);
  expect((await call(page, "set_play_mode", { mode: "play" }, true)).ok).toBe(true);
  // This stays empty if the TTF input is recreated inside the suspending child.
  await expect.poll(() => page.evaluate(async () => {
    const path = "/e2e/uikit-render.fixture.tsx";
    return (await import(/* @vite-ignore */ path)).uikitGlyphCount();
  })).toBeGreaterThan(100);
  expect(await page.evaluate(async () => {
    const path = "/e2e/uikit-render.fixture.tsx";
    return (await import(/* @vite-ignore */ path)).uikitInvalidGlyphUvCount();
  })).toBe(0);
  expect((await call(page, "get_editor_context")).result!.scriptRuntime).toMatchObject({ compileErrors: [], failures: [] });
});

test("UIKit Panelを正式なScript経路からPlayで描画する", async ({ page }, testInfo) => {
  page.on("pageerror", error => console.log("UIKit browser error:", error.message));
  page.on("console", message => { if (message.type() === "error") console.log("UIKit console error:", message.text()); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page);
  const created = await call(page, "create_empty_entity", { name: "UIKit Panel" }, true);
  const entityId = created.result!.entityId as string;
  expect((await call(page, "update_transform", { entityId, position: [0, 1.6, -3] }, true)).ok).toBe(true);
  const applied = await call(page, "apply_script_template", { entityId, templateId: "uikit-panel" }, true);
  expect(applied.ok, JSON.stringify(applied)).toBe(true);
  const label = await call(page, "create_empty_entity", { name: "Rounded Text" }, true);
  const labelId = label.result!.entityId as string;
  expect((await call(page, "update_transform", { entityId: labelId, position: [-2, 1.6, -3] }, true)).ok).toBe(true);
  const text = await call(page, "add_component", { entityId: labelId, definitionId: "core.text.panel" }, true);
  expect(text.ok, JSON.stringify(text)).toBe(true);
  expect((await call(page, "update_component", { entityId: labelId, componentId: text.result!.componentId, patch: { text: "角丸の案内", fontSize: 0.12, maxWidth: 1.35, background: { opacity: 1, fit: "fixed", width: 1.6, height: 1.1, borderRadius: 0.16 } } }, true)).ok).toBe(true);
  const played = await call(page, "set_play_mode", { mode: "play" }, true);
  expect(played.ok, JSON.stringify(played)).toBe(true);
  expect((await call(page, "set_scene_view_camera", { position: [0, 1.6, 0], target: [0, 1.6, -3] }, true)).ok).toBe(true);
  await expect.poll(() => page.evaluate(async () => {
    const path = "/e2e/uikit-render.fixture.tsx";
    return (await import(/* @vite-ignore */ path)).uikitGlyphCount();
  })).toBeGreaterThan(10);
  await expect.poll(async () => {
    const context = (await call(page, "get_editor_context")).result!;
    return context.scriptRuntime;
  }).toMatchObject({ compileErrors: [], failures: [] });
  const capture = await call(page, "capture_scene_view", {}, true);
  expect(capture.ok, JSON.stringify(capture)).toBe(true);
  const path = testInfo.outputPath("uikit-play.png");
  await writeFile(path, Buffer.from((capture.result!.image as { data: string }).data, "base64"));
  await testInfo.attach("uikit-play", { path, contentType: "image/png" });
  const camera = await page.evaluate(async () => {
    const path = "/e2e/uikit-render.fixture.tsx";
    return (await import(/* @vite-ignore */ path)).uikitCamera();
  });
  expect((await call(page, "set_play_mode", { mode: "edit" }, true)).ok).toBe(true);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__?.unhandledCommands ?? [])).toEqual([]);
  // Vite deliberately ignores test artifacts; a unique path prevents an old
  // transformed World from a previous run being reused after regeneration.
  const exported = await prepareUikitExport(testInfo.outputPath(`published-${Date.now()}`));
  const moduleUrl = `/${relative(process.cwd(), exported).replaceAll("\\", "/")}`;
  await page.evaluate(async ({ moduleUrl, camera }) => {
    const path = "/e2e/uikit-render.fixture.tsx";
    await (await import(/* @vite-ignore */ path)).mountPublishedUikit(moduleUrl, camera);
  }, { moduleUrl, camera });
  await expect.poll(() => page.evaluate(async () => {
    const path = "/e2e/uikit-render.fixture.tsx";
    return (await import(/* @vite-ignore */ path)).uikitGlyphCount();
  })).toBeGreaterThan(10);
  await expect.poll(() => page.evaluate(async () => {
    const path = "/e2e/uikit-render.fixture.tsx";
    return (await import(/* @vite-ignore */ path)).publishedRoundedTextReady();
  })).toBe(true);
  const exportPath = testInfo.outputPath("uikit-published.png");
  await page.locator("#published-uikit-fixture canvas").screenshot({ path: exportPath });
  await testInfo.attach("uikit-published", { path: exportPath, contentType: "image/png" });
});
