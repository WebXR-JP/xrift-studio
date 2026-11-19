import { expect, test, type Page } from "@playwright/test";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}

function lightmappedMeshCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const path = "/e2e/light-bake.fixture.ts";
    return (await import(/* @vite-ignore */ path)).lightmappedMeshCount();
  });
}

async function lightmap(page: Page): Promise<{ state: string; assetId?: string }> {
  return (await call(page, "get_light_bake")).result!.lightmap as { state: string; assetId?: string };
}

test("ベイクした陰影をLightmap Assetへ保存し、編集とPlayで同じものを表示する", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible({ timeout: 120_000 });
  expect((await call(page, "create_project", { name: "light-bake-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  expect((await call(page, "update_light_bake_settings", { resolution: 256, quality: "draft" }, true)).ok).toBe(true);
  const targets = await call(page, "set_light_bake_targets", { selectStatic: true, enabled: true }, true);
  expect(targets.ok, JSON.stringify(targets)).toBe(true);
  expect(await lightmap(page)).toEqual({ state: "none" });
  expect(await lightmappedMeshCount(page)).toBe(0);

  // 作者と同じ入口を通す。左下のボタンでパネルを開き、「ベイク」を押す。
  const dock = page.getByRole("contentinfo", { name: "エディターのステータスバー" });
  await dock.getByRole("button", { name: "ライトベイクを開く", exact: true }).click();
  await expect(dock.getByRole("button", { name: "ライトベイクを閉じる", exact: true })).toHaveAttribute("aria-pressed", "true");
  const status = page.getByRole("region", { name: "ライトベイクの状態", exact: true });
  await expect(status.getByText("まだベイクしていません", { exact: true })).toBeVisible();
  await status.getByRole("button", { name: "ベイク", exact: true }).click();
  await expect(status.getByText("ベイク済み", { exact: true })).toBeVisible({ timeout: 120_000 });

  // 結果はAssetsに1件でき、Scene Viewはそのファイルを読み戻して貼る。
  const baked = await lightmap(page);
  expect(baked.state).toBe("current");
  expect((await call(page, "list_assets", { kind: "lightmap" })).result!.assets).toMatchObject([{ id: baked.assetId, kind: "lightmap", status: "ready" }]);
  await expect.poll(() => lightmappedMeshCount(page)).toBeGreaterThanOrEqual(2);
  await expect(status.getByRole("alert")).toHaveCount(0);

  // 配置を変えると、焼き直しが要ることを示す。焼き直しても、Assetは増えない。
  const box = ((await call(page, "list_entities")).result!.entities as { id: string; name: string }[]).find(entity => entity.name === "Box");
  expect(box).toBeDefined();
  expect((await call(page, "update_transform", { entityId: box!.id, position: [1.25, 0.5, -0.75] }, true)).ok).toBe(true);
  await expect(status.getByText("Sceneが変わりました", { exact: true })).toBeVisible();
  expect((await lightmap(page)).state).toBe("stale");
  await status.getByRole("button", { name: "焼き直す", exact: true }).click();
  await expect(status.getByText("ベイク済み", { exact: true })).toBeVisible({ timeout: 120_000 });
  expect((await call(page, "list_assets", { kind: "lightmap" })).result!.assets).toHaveLength(1);
  expect(await lightmap(page)).toMatchObject({ state: "current", assetId: baked.assetId });
  await expect.poll(() => lightmappedMeshCount(page)).toBeGreaterThanOrEqual(2);

  // Playでも、同じライトマップを貼ったまま描く。
  expect((await call(page, "set_play_mode", { mode: "play" }, true)).ok).toBe(true);
  await expect.poll(() => lightmappedMeshCount(page)).toBeGreaterThanOrEqual(2);
  expect((await call(page, "set_play_mode", { mode: "edit" }, true)).ok).toBe(true);

  // 外すと、Scene Viewは元のMaterialへ戻る。Assetは残る。
  expect((await call(page, "update_light_bake_settings", { removeLightmap: true }, true)).ok).toBe(true);
  await expect.poll(() => lightmappedMeshCount(page)).toBe(0);
  expect(await lightmap(page)).toEqual({ state: "none" });
  expect((await call(page, "list_assets", { kind: "lightmap" })).result!.assets).toHaveLength(1);
});
