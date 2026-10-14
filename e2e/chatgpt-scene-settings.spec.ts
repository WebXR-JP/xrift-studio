import { expect, test, type Page } from "@playwright/test";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false) {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: call } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await call("get_editor_context")).result : {};
    return call(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh }) as Promise<XriftMcpEditorResponse>;
}
async function ready(page: Page) {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: "chatgpt-settings-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null }; });
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
}
async function setPlan(page: Page, operations: unknown[]) {
  await page.evaluate(operations => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "Sceneの設定", description: "既存の配置を保って設定します", objects: [], operations }); }, operations);
}
async function generate(page: Page, mode = "build") {
  const response = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "SkyboxとBGMとColliderを調整して", mode }, true);
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result!.generationId as string;
}
async function job(page: Page, generationId: string) {
  const response = await call(page, "get_chatgpt_generation", { generationId });
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result as ChatgptGeneration;
}
async function savedScene(page: Page) {
  return page.evaluate(async () => {
    const modulePath = "/src/lib/tauri.ts";
    const project = window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!;
    const files = await (await import(/* @vite-ignore */ modulePath)).tauri.readVisualProject(project.path);
    return JSON.parse(files.sceneDocuments[0].content);
  });
}

test("Skybox・Audio Source・Colliderを順次保存し配置を保持、再表示しても設定が残る", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  const created = await call(page, "create_primitive", { shape: "box", position: [2, 1, -3] }, true);
  expect(created.ok, JSON.stringify(created)).toBe(true);
  const entityId = created.result!.entityId as string;
  expect((await call(page, "update_transform", { entityId, rotation: [0, 0.6, 0], scale: [2, 1, 3] }, true)).ok).toBe(true);
  const audio = await call(page, "add_component", { entityId, definitionId: "core.audio-source" }, true);
  expect(audio.ok, JSON.stringify(audio)).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const before = await savedScene(page);
  await setPlan(page, [
    { kind: "skybox", enabled: true, iblEnabled: false, rotationDegrees: 35, exposure: 0.7 },
    { kind: "audio", entityId, componentId: audio.result!.componentId, volume: 0.2, loop: true, spatial: false, autoplay: true },
    { kind: "mesh-collision", entityId, action: "add" },
  ]);
  const id = await generate(page);
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  expect((await job(page, id)).progress.completed).toBe(3);
  const after = await savedScene(page);
  expect(after.settings.skybox).toMatchObject({ enabled: true, iblEnabled: false, rotationDegrees: 35, exposure: 0.7 });
  expect(after.entities[entityId].components.find((c: { type: string }) => c.type === "audio-source")).toMatchObject({ volume: 0.2, loop: true, spatial: false, autoplay: true });
  expect(after.entities[entityId].components.some((c: { type: string }) => c.type === "collider")).toBe(true);
  expect(after.entities[entityId].components.find((c: { type: string }) => c.type === "transform")).toEqual(before.entities[entityId].components.find((c: { type: string }) => c.type === "transform"));
  expect(after.entities[entityId].name).toBe(before.entities[entityId].name);
  await page.screenshot({ path: info.outputPath("settings-saved.png") });
  const projectPath = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!.path);
  expect((await call(page, "close_project")).ok).toBe(true);
  expect((await call(page, "open_project", { path: projectPath })).ok).toBe(true);
  expect((await savedScene(page)).settings.skybox).toEqual(after.settings.skybox);
  expect(errors).toEqual([]);
});

test("Plan待ちに手動変更したSkyboxを上書きしない", async ({ page }) => {
  await ready(page);
  await setPlan(page, [{ kind: "skybox", exposure: 0.5 }]);
  const id = await generate(page, "plan");
  await expect.poll(async () => (await job(page, id)).status).toBe("planned");
  expect((await call(page, "update_scene_settings", { skybox: { exposure: 1.8 } }, true)).ok).toBe(true);
  expect((await call(page, "apply_chatgpt_plan", { generationId: id }, true)).ok).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(2);
  await expect.poll(async () => (await job(page, id)).status).toBe("planned");
  expect((await job(page, id)).error).toBeUndefined();
  await expect.poll(async () => (await savedScene(page)).settings.skybox.exposure).toBe(1.8);
});

test("ChatGPTのBGM参照を実WAVで再生し、Play・Stop・Entity操作後も保存とAudioを保つ", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await ready(page);
  const projectPath = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!.path);
  expect((await call(page, "close_project")).ok).toBe(true);
  const fixture = await page.evaluate(async path => {
    const modulePath = "/e2e/chatgpt-bgm.fixture.ts";
    return (await import(/* @vite-ignore */ modulePath)).installBgmFixture(path);
  }, projectPath);
  expect(fixture.byteLength).toBe(8044);
  expect(fixture.relativePath.endsWith(".wav")).toBe(true);
  expect((await call(page, "open_project", { path: projectPath })).ok).toBe(true);
  await setPlan(page, [{ kind: "audio", entityId: fixture.entityId, componentId: fixture.componentId, candidateId: `project:${fixture.assetId}`, volume: 0.18, loop: true, spatial: false, autoplay: true }]);
  const id = await generate(page, "plan");
  await expect.poll(async () => (await job(page, id)).status).toBe("planned");
  const proposed = (await job(page, id)).plan!.objects[0].detail;
  expect(proposed).toContain("音量 18%"); expect(proposed).toContain("ループ 有効"); expect(proposed).toContain("空間音声 無効");
  const chat = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  await expect(chat.getByText(/音量 18%/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("bgm-plan-detail.png") });
  await chat.getByRole("button", { name: "Planを反映", exact: true }).click();
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  const expected = { audioAssetId: fixture.assetId, enabled: true, volume: 0.18, loop: true, spatial: false, autoplay: true };
  const audio = (scene: any) => scene.entities[fixture.entityId]?.components.find((component: any) => component.id === fixture.componentId);
  expect(audio(await savedScene(page))).toMatchObject(expected);
  const runtime = () => page.evaluate(async componentId => {
    const modulePath = "/e2e/chatgpt-bgm.fixture.ts";
    return (await import(/* @vite-ignore */ modulePath)).readBgmRuntime(componentId);
  }, fixture.componentId);
  const rounds = [];
  for (let round = 0; round < 2; round++) {
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
    await expect.poll(async () => (await runtime())?.threePlaying).toBe(true);
    // Three Audio smooths gain changes with setTargetAtTime. Observe its
    // settled native gain at the original precision, after playback begins.
    await expect.poll(async () => (await runtime())?.gain).toBeCloseTo(0.18, 5);
    const state = await runtime();
    expect(state).toMatchObject({ audioAssetId: fixture.assetId, spatial: false, playing: true, volume: 0.18, loop: true, contextState: "running" });
    expect(state!.duration).toBeCloseTo(0.25, 4);
    expect(state!.gain).toBeCloseTo(0.18, 5);
    expect(state!.decodedFrames).toBeGreaterThan(0);
    rounds.push(state);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect.poll(runtime).toBeNull();
    const renamed = await call(page, "rename_entity", { entityId: fixture.entityId, name: `BGMを保って操作${round}` }, true);
    expect(renamed.ok, JSON.stringify(renamed)).toBe(true);
    const moved = await call(page, "update_transform", { entityId: fixture.entityId, position: [round + 1, 0, -2] }, true);
    expect(moved.ok, JSON.stringify(moved)).toBe(true);
    await expect.poll(async () => audio(await savedScene(page))?.audioAssetId).toBe(fixture.assetId);
  }
  await info.attach("real-bgm-play-rounds", { body: JSON.stringify(rounds), contentType: "application/json" });
  expect((await call(page, "delete_entity", { entityId: fixture.entityId }, true)).ok).toBe(true);
  await expect.poll(async () => (await savedScene(page)).entities[fixture.entityId]).toBeUndefined();
  await page.getByRole("group", { name: "編集履歴", exact: true }).getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect.poll(async () => audio(await savedScene(page))?.audioAssetId).toBe(fixture.assetId);
  expect(audio(await savedScene(page))).toMatchObject(expected);
  expect((await call(page, "close_project")).ok).toBe(true);
  expect((await call(page, "open_project", { path: projectPath })).ok).toBe(true);
  expect(audio(await savedScene(page))).toMatchObject(expected);
  expect(errors).toEqual([]);
});
