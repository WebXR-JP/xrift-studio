import { expect, test, type Page } from "@playwright/test";
import type { VisualProjectFiles, XriftMcpEditorResponse } from "../src/lib/tauri";

type EditorContext = { projectId: string; sceneId: string; revision: number; saveStatus: string };
type ReadinessFixture = {
  failSaves: boolean;
  holdThumbnail: boolean;
  holdGraphDebounce: boolean;
  thumbnailWaiting: boolean;
  saves: number;
  thumbnails: number;
  result: XriftMcpEditorResponse | null;
  releaseThumbnail: (() => void) | null;
};
declare global {
  interface Window { __XRIFT_READINESS_FIXTURE__?: ReadinessFixture }
}

async function call(page: Page, tool: string, args: Record<string, unknown> = {}) {
  return page.evaluate(async ({ tool, args }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    return (await import(/* @vite-ignore */ path)).callReleaseE2EMcp(tool, args) as Promise<XriftMcpEditorResponse>;
  }, { tool, args });
}
async function openFixture(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  const created = await call(page, "create_project", { name: "publish-readiness-isolated-fixture", kind: "world", templateId: "blank" });
  expect(created.ok, JSON.stringify(created)).toBe(true);
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
  await expect.poll(async () => ((await call(page, "get_editor_context")).result as EditorContext).saveStatus).toBe("saved");
  // Only native fixture transport is delayed. App, its Editor bridge, draft
  // flushing, autosave coordinator and MCP request handlers remain real.
  await page.evaluate(() => {
    const fixture: ReadinessFixture = { failSaves: false, holdThumbnail: false, holdGraphDebounce: false, thumbnailWaiting: false, saves: 0, thumbnails: 0, result: null, releaseThumbnail: null };
    window.__XRIFT_READINESS_FIXTURE__ = fixture;
    const internals = window.__TAURI_INTERNALS__!;
    const invoke = internals.invoke!.bind(internals);
    internals.invoke = async (command, args, options) => {
      if (command === "save_visual_project") {
        fixture.saves++;
        if (fixture.failSaves) throw new Error("Isolated readiness fixture save failure");
      }
      if (command === "read_thumbnail") {
        fixture.thumbnails++;
        // Hold one readiness read. Returning to Library starts independent
        // thumbnail reads which must not replace this request's release hook.
        if (fixture.holdThumbnail && !fixture.thumbnailWaiting) {
          fixture.thumbnailWaiting = true;
          await new Promise<void>(resolve => { fixture.releaseThumbnail = resolve; });
          fixture.thumbnailWaiting = false;
        }
      }
      return invoke(command, args, options);
    };
    // Hold only Graph's 400ms debounce to prove saveNow flushes the pending
    // draft; the actual save, readiness inspection and request timers run.
    const setTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 400 && fixture.holdGraphDebounce && typeof handler === "function") {
        const wait = () => {
          if (fixture.holdGraphDebounce) setTimeout(wait, 25);
          else handler(...args);
        };
        return setTimeout(wait, timeout);
      }
      return setTimeout(handler, timeout, ...args);
    }) as typeof window.setTimeout;
  });
}
async function saved(page: Page) {
  return page.evaluate(async () => {
    const path = window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!.path;
    const modulePath = "/src/lib/tauri.ts";
    const files = await (await import(/* @vite-ignore */ modulePath)).tauri.readVisualProject(path) as VisualProjectFiles;
    return { path, files };
  });
}
async function startHeldReadiness(page: Page) {
  await page.evaluate(async () => {
    const fixture = window.__XRIFT_READINESS_FIXTURE__!;
    fixture.holdThumbnail = true; fixture.result = null;
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp } = await import(/* @vite-ignore */ path);
    void callReleaseE2EMcp("get_publish_readiness").then((response: XriftMcpEditorResponse) => { fixture.result = response; });
  });
  await expect.poll(() => page.evaluate(() => window.__XRIFT_READINESS_FIXTURE__!.thumbnailWaiting)).toBe(true);
}
async function releaseReadiness(page: Page) {
  await page.evaluate(() => {
    const fixture = window.__XRIFT_READINESS_FIXTURE__!;
    fixture.holdThumbnail = false; fixture.releaseThumbnail?.();
  });
  await expect.poll(() => page.evaluate(() => window.__XRIFT_READINESS_FIXTURE__!.result)).not.toBeNull();
  return page.evaluate(() => window.__XRIFT_READINESS_FIXTURE__!.result!);
}
async function renameSelectedPlane(page: Page, name: string) {
  await page.getByRole("tree", { name: "シーンのEntity階層" }).getByText("Plane", { exact: true }).click();
  const input = page.getByRole("textbox", { name: "Entity名", exact: true });
  await input.fill(name);
  await input.press("Enter");
}
async function noExternalWrites(page: Page) {
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.uploadAttempts)).toEqual([]);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.calls.filter(call => ["chatgpt_login", "chatgpt_logout", "reset_app_data"].includes(call.command)))).toEqual([]);
}

test("保存に失敗した公開前確認は既存pathへフォールバックせず、保存の再試行で復帰する", async ({ page }) => {
  await openFixture(page);
  const before = await saved(page);
  await page.evaluate(() => { const fixture = window.__XRIFT_READINESS_FIXTURE__!; fixture.failSaves = true; fixture.thumbnails = 0; });
  await renameSelectedPlane(page, "未保存の編集を確認");
  const response = await call(page, "get_publish_readiness");
  expect(response.ok, JSON.stringify(response)).toBe(false);
  expect(response.error?.code).toBe("EDITOR_ERROR");
  expect(await page.evaluate(() => window.__XRIFT_READINESS_FIXTURE__!.thumbnails)).toBe(0);
  expect((await saved(page)).files.sceneDocuments).toEqual(before.files.sceneDocuments);
  await page.evaluate(() => { window.__XRIFT_READINESS_FIXTURE__!.failSaves = false; });
  const retried = await call(page, "get_publish_readiness");
  expect(retried.ok, JSON.stringify(retried)).toBe(true);
  expect(retried.result).toMatchObject({ path: before.path });
  expect((await saved(page)).files.sceneDocuments.some(file => file.content.includes("未保存の編集を確認"))).toBe(true);
  await noExternalWrites(page);
});

test("公開前確認はGraphの未保存draftをflushした後の保存内容を検査する", async ({ page }) => {
  await openFixture(page);
  const assets = page.getByRole("region", { name: "Assets" });
  await assets.getByRole("button", { name: "新規アセットまたはフォルダー" }).click();
  await page.getByRole("button", { name: "新規Node Graph", exact: true }).click();
  const editor = page.getByRole("region", { name: "ノードエディター", exact: true });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "JSON", exact: true }).click();
  await expect.poll(async () => ((await call(page, "get_editor_context")).result as EditorContext).saveStatus).toBe("saved");
  const before = await saved(page);
  const graphFrom = (files: VisualProjectFiles) => Object.values((JSON.parse(files.assetManifestJson) as { assets: Record<string, { kind: string; extension?: { graphs: { name?: string }[] } }> }).assets).find(asset => asset.kind === "interactivity");
  await page.evaluate(() => { window.__XRIFT_READINESS_FIXTURE__!.holdGraphDebounce = true; });
  await editor.getByRole("textbox", { name: "KHR_interactivity JSON", exact: true }).fill(JSON.stringify({ graphs: [{
    name: "公開確認でflushするdraft", declarations: [{ op: "audit/readiness_probe", extension: "AUDIT_readiness_probe" }], nodes: [{ declaration: 0 }],
  }] }));
  await editor.getByRole("button", { name: "JSONを検証して読み込む", exact: true }).click();
  expect(graphFrom((await saved(page)).files)).toEqual(graphFrom(before.files));
  const response = await call(page, "get_publish_readiness");
  expect(response.ok, JSON.stringify(response)).toBe(true);
  // The warning exists only in the new draft, so an inspection using the
  // snapshot from before saveNow would incorrectly omit it.
  expect(response.result).toMatchObject({ warningDiagnostics: expect.arrayContaining([expect.objectContaining({
    code: "interactivity-operation-not-executed", message: expect.stringContaining("audit/readiness_probe"),
  })]) });
  const after = await saved(page);
  expect(after.path).toBe(before.path);
  expect(graphFrom(after.files)?.extension?.graphs[0].name).toBe("公開確認でflushするdraft");
  await page.evaluate(() => { window.__XRIFT_READINESS_FIXTURE__!.holdGraphDebounce = false; });
  await noExternalWrites(page);
});

test("公開前確認の読み取り中にSceneを編集すると古い保存内容の成功を返さない", async ({ page }) => {
  await openFixture(page);
  const before = await saved(page);
  await startHeldReadiness(page);
  await renameSelectedPlane(page, "確認中の最新編集");
  const response = await releaseReadiness(page);
  expect(response.ok, JSON.stringify(response)).toBe(false);
  expect(response.error?.code).toBe("STALE_REVISION");
  const retry = await call(page, "get_publish_readiness");
  expect(retry.ok, JSON.stringify(retry)).toBe(true);
  expect(retry.result).toMatchObject({ path: before.path });
  expect((await saved(page)).files.sceneDocuments.some(file => file.content.includes("確認中の最新編集"))).toBe(true);
  await noExternalWrites(page);
});

test("公開前確認の読み取り中に作品を閉じると対象を失った確認結果を返さない", async ({ page }) => {
  await openFixture(page);
  const before = await saved(page);
  await startHeldReadiness(page);
  const closed = await call(page, "close_project");
  expect(closed.ok, JSON.stringify(closed)).toBe(true);
  const response = await releaseReadiness(page);
  expect(response.ok, JSON.stringify(response)).toBe(false);
  expect(response.error?.code).toBe("STALE_REVISION");
  expect((await saved(page)).files.sceneDocuments).toEqual(before.files.sceneDocuments);
  expect((await call(page, "open_project", { path: before.path })).ok).toBe(true);
  const retry = await call(page, "get_publish_readiness");
  expect(retry.ok, JSON.stringify(retry)).toBe(true);
  expect(retry.result).toMatchObject({ path: before.path });
  await noExternalWrites(page);
});
