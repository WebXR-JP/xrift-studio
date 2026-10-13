import { expect, test, type Page } from "@playwright/test";
import type { VisualProjectFiles, XriftMcpEditorResponse } from "../src/lib/tauri";

async function call(page: Page, tool: string, args: Record<string, unknown> = {}): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    return (await import(/* @vite-ignore */ path)).callReleaseE2EMcp(tool, args);
  }, { tool, args });
}
async function prepare(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  const fixture = await page.evaluate(async () => {
    const path = "/e2e/model-assignment.fixture.ts";
    return (await import(/* @vite-ignore */ path)).prepareModelAssignmentFixture();
  });
  const opened = await call(page, "open_project", { path: fixture.project.path });
  expect(opened.ok, JSON.stringify(opened)).toBe(true);
  await expect(page.getByRole("tree", { name: "シーンのEntity階層" })).toBeVisible();
  await page.getByRole("tree", { name: "シーンのEntity階層" }).getByText("モデルを付けるEntity", { exact: true }).click();
  return fixture;
}
async function readScene(page: Page, projectPath: string) {
  return page.evaluate(async projectPath => {
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    const files = await tauri.readVisualProject(projectPath) as VisualProjectFiles;
    return JSON.parse(files.sceneDocuments[0].content);
  }, projectPath);
}
async function awaitSaved(page: Page) {
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
}
async function play(page: Page, mode: "play" | "edit") {
  return page.evaluate(async mode => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: call } = await import(/* @vite-ignore */ path);
    const context = (await call("get_editor_context")).result;
    return call("set_play_mode", { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision, mode });
  }, mode);
}

test("InspectorでEmptyへModelを設定・差替しても名前とTransformを保ち、Colliderと保存・Playへ反映する", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const fixture = await prepare(page);
  const choice = page.getByRole("combobox", { name: "Entityの3Dモデル", exact: true });
  await expect(choice).toBeVisible();
  await choice.selectOption(fixture.modelIds[0]);
  await expect(page.getByText("3Dモデルを設定しました", { exact: false })).toBeVisible();
  await choice.selectOption(fixture.modelIds[1]);
  await awaitSaved(page);
  const scene = await readScene(page, fixture.project.path);
  const entity = scene.entities[fixture.entityId];
  expect(entity.name).toBe("モデルを付けるEntity");
  expect(entity.components.find((component: { type: string }) => component.type === "transform")).toEqual(fixture.originalTransform);
  expect(entity.children).toContain(fixture.childId);
  expect(entity.components.find((component: { type: string }) => component.type === "mesh").geometry.assetId).toBe(fixture.modelIds[1]);
  const collider = entity.components.find((component: { type: string }) => component.type === "collider");
  expect(collider.id).toBe("fixture-auto-collider"); expect(collider.halfExtents).toEqual([2, 1, 0.5]); expect(collider.friction).toBe(0.65);
  expect((await play(page, "play")).ok).toBe(true);
  await expect(page.locator('section[aria-labelledby="scene-view-heading"] canvas').first()).toBeVisible();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect((await play(page, "edit")).ok).toBe(true);
  await awaitSaved(page);
  expect(errors).toEqual([]);
});

test("Inspectorからストアを開くと選択Entityへのモデル設定を案内し、実GLBを追加して同じEntityに保存する", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const fixture = await prepare(page);
  await page.getByRole("button", { name: "素材ストア", exact: true }).click();
  await page.getByRole("navigation", { name: "素材と機能", exact: true }).getByRole("button", { name: /^Poly Haven/ }).click();
  await page.getByRole("button", { name: /Store Model/ }).first().click();
  await expect(page.getByRole("checkbox", { name: /追加後に「モデルを付けるEntity」へモデルを設定/ })).toBeChecked();
  await page.getByRole("button", { name: "追加して「モデルを付けるEntity」へモデルを設定", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /Store Model.*モデルを設定/ })).toBeVisible();
  await page.getByRole("button", { name: "「アセットストア」を閉じる" }).click();
  await awaitSaved(page);
  const scene = await readScene(page, fixture.project.path);
  const entity = scene.entities[fixture.entityId];
  expect(entity.name).toBe("モデルを付けるEntity");
  expect(entity.components.find((component: { type: string }) => component.type === "transform")).toEqual(fixture.originalTransform);
  expect(entity.components.find((component: { type: string }) => component.type === "mesh").geometry.assetId).toMatch(/poly-haven/);
  expect(entity.children).toContain(fixture.childId);
  expect(errors).toEqual([]);
});

test("MCPの実GLB解析中のScene編集を保ち、二重の素材取り込みを拒否して保存する", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const fixture = await prepare(page);
  await page.evaluate(async () => {
    const path = "/e2e/model-assignment.fixture.ts";
    const fixture = await import(/* @vite-ignore */ path);
    fixture.pauseModelStoreAnalysis();
    const mcpPath = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: call } = await import(/* @vite-ignore */ mcpPath);
    const context = (await call("get_editor_context")).result;
    fixture.recordModelStoreMcpInstall(call("install_external_asset", { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision, providerId: "poly-haven", externalId: "model-assignment-fixture", resolution: "1k" }));
  });
  const audit = () => page.evaluate(async () => {
    const path = "/e2e/model-assignment.fixture.ts";
    return (await import(/* @vite-ignore */ path)).modelStoreAuditState();
  });
  await expect.poll(async () => (await audit()).analysisEntered).toBe(true);
  const name = page.getByRole("textbox", { name: "Entity名", exact: true });
  await name.fill("解析中の手動変更"); await name.press("Enter");
  await expect(name).toHaveValue("解析中の手動変更");
  const duplicate = await page.evaluate(async () => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: call } = await import(/* @vite-ignore */ path);
    const context = (await call("get_editor_context")).result;
    return call("install_external_asset", { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision, providerId: "poly-haven", externalId: "model-assignment-fixture", resolution: "1k" });
  });
  expect(duplicate.ok).toBe(false);
  expect(duplicate.error?.code).toMatch(/BUSY/);
  expect((await audit()).storeInstallCount).toBe(1);
  await page.evaluate(async () => {
    const path = "/e2e/model-assignment.fixture.ts";
    (await import(/* @vite-ignore */ path)).resumeModelStoreAnalysis();
  });
  await expect.poll(async () => (await audit()).mcpInstallResult?.ok).toBe(true);
  await awaitSaved(page);
  const scene = await readScene(page, fixture.project.path);
  expect(scene.entities[fixture.entityId].name).toBe("解析中の手動変更");
  expect(scene.entities[fixture.entityId].components.find((component: { type: string }) => component.type === "transform")).toEqual(fixture.originalTransform);
  const result = (await audit()).mcpInstallResult!;
  const assets = await page.evaluate(async path => {
    const modulePath = "/src/lib/tauri.ts";
    return JSON.parse((await (await import(/* @vite-ignore */ modulePath)).tauri.readVisualProject(path)).assetManifestJson);
  }, fixture.project.path);
  expect(assets.assets[result.result!.primaryAssetId as string].kind).toBe("model");
  expect(assets.assets[result.result!.primaryAssetId as string].importMetadata.meshCount).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
