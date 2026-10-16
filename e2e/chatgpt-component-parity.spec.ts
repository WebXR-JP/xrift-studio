import { expect, test, type Page } from "@playwright/test";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";
import type { SceneDocument } from "../src/lib/visual-editor/scene-document";

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}
async function scene(page: Page): Promise<SceneDocument> {
  return page.evaluate(async () => {
    const path = "/src/lib/tauri.ts";
    const project = window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!;
    return JSON.parse((await (await import(/* @vite-ignore */ path)).tauri.readVisualProject(project.path)).sceneDocuments[0].content);
  });
}
async function generate(page: Page, operations: unknown[]) {
  await page.evaluate(operations => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "Componentの編集", description: "照明と物理、案内を調整", objects: [], operations }); }, operations);
  const response = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "指定したComponentを追加、設定、取り外して", mode: "build" }, true);
  expect(response.ok, JSON.stringify(response)).toBe(true);
  const generationId = response.result!.generationId as string;
  await expect.poll(async () => { const job = (await call(page, "get_chatgpt_generation", { generationId })).result as ChatgptGeneration; return job.status === "failed" ? `failed: ${job.error}` : job.status; }).toBe("completed");
  return generationId;
}

test("ChatGPTの基本Component編集はMCPと同じ設定を保存し、取り外しを戻せる", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: "component-parity-isolated", kind: "world", templateId: "blank" })).ok).toBe(true);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null }; });
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  await generate(page, [
    { kind: "component-add", definitionId: "core.light.spot", name: "編集対象のLight", propertiesJson: JSON.stringify({ color: "#ffaa88", intensity: 3, penumbra: 0.5 }) },
    { kind: "component-add", entityId: "starter-floor", definitionId: "physics.rigid-body", propertiesJson: JSON.stringify({ bodyType: "fixed", friction: 0.8 }) },
    { kind: "component-add", definitionId: "core.text", name: "編集対象のText", propertiesJson: JSON.stringify({ text: "会場入口", fontSize: 0.4 }) },
  ]);
  const before = await scene(page);
  const lightEntity = Object.values(before.entities).find(entity => entity.name === "編集対象のLight")!;
  const light = lightEntity.components.find(component => component.type === "light")!;
  const textEntity = Object.values(before.entities).find(entity => entity.name === "編集対象のText")!;
  const text = textEntity.components.find(component => component.type === "text")!;
  const body = before.entities["starter-floor"].components.find(component => component.type === "rigid-body")!;
  expect(light).toMatchObject({ color: "#ffaa88", intensity: 3, penumbra: 0.5 });
  expect(body).toMatchObject({ bodyType: "fixed", friction: 0.8 });
  expect(text).toMatchObject({ text: "会場入口", fontSize: 0.4 });
  const generationId = await generate(page, [
    { kind: "component-update", entityId: lightEntity.id, componentId: light.id, propertiesJson: JSON.stringify({ intensity: 5, distance: 12 }) },
    { kind: "component-remove", entityId: textEntity.id, componentId: text.id },
    { kind: "component-remove", entityId: "starter-floor", componentId: body.id },
  ]);
  const after = await scene(page);
  expect(after.entities[lightEntity.id].components.find(component => component.id === light.id)).toMatchObject({ intensity: 5, distance: 12, penumbra: 0.5 });
  expect(after.entities[textEntity.id].components.some(component => component.id === text.id)).toBe(false);
  expect(after.entities["starter-floor"].components.some(component => component.id === body.id)).toBe(false);
  expect((await call(page, "revert_chatgpt_generation", { generationId }, true)).ok).toBe(true);
  const restored = await scene(page);
  for (const id of [lightEntity.id, textEntity.id, "starter-floor"]) expect(restored.entities[id]).toEqual(before.entities[id]);
  expect((await call(page, "update_component", { entityId: lightEntity.id, componentId: light.id, patch: { intensity: 5, distance: 12 } }, true)).ok).toBe(true);
  await expect.poll(async () => (await scene(page)).entities[lightEntity.id]).toEqual(after.entities[lightEntity.id]);
});

test("共通Component定義は送信量内に収まり、無効な設定とTransformの取り外しを拒否する", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const starterPath = "/src/lib/visual-editor/starter-templates.ts", resourcePath = "/src/lib/visual-editor/chatgpt-scene-resources.ts", parsePath = "/src/lib/visual-editor/chatgpt-resources.ts", catalogPath = "/src/lib/visual-editor/chatgpt-builtin-catalog.ts";
    const bundle = (await import(/* @vite-ignore */ starterPath)).createStarterVisualProject("world", "blank");
    const candidates = (await import(/* @vite-ignore */ catalogPath)).listChatgptBuiltinCandidates("world", "Skyboxを選びたい");
    const resources = (await import(/* @vite-ignore */ resourcePath)).collectChatgptSceneResources(bundle, Object.keys(bundle.scene.entities), candidates);
    const { parseChatgptOperations } = await import(/* @vite-ignore */ parsePath);
    const transform = resources.components.find((component: any) => component.type === "transform");
    const cases = [
      { kind: "component-add", definitionId: "core.light.point", propertiesJson: '{"callback":"code"}' },
      { kind: "component-remove", entityId: transform.entityId, componentId: transform.componentId },
      { kind: "component-update", entityId: transform.entityId, componentId: transform.componentId, propertiesJson: '{"position":[1,2,3]}' },
    ];
    const light = resources.componentDefinitions.find((definition: any) => definition.id === "core.light.point");
    const fields = resources.componentDefinitions.find((definition: any) => definition.id === (light.fieldsFrom ?? light.id)).fields;
    return { bytes: new TextEncoder().encode(JSON.stringify(resources)).byteLength,
      lightFields: fields.map((field: any) => field.name),
      skies: resources.builtinCandidates.filter((candidate: any) => candidate.actions.includes("skybox")).length,
      shelves: new Set(resources.builtinCandidates.map((candidate: any) => candidate.providerId)).size,
      expectedShelves: new Set(candidates.map((candidate: any) => candidate.providerId)).size,
      rejected: cases.map(operation => { try { parseChatgptOperations([operation], resources, [], Object.keys(bundle.scene.entities)); return false; } catch { return true; } }) };
  });
  expect(result.bytes).toBeLessThanOrEqual(31 * 1024);
  expect(result.lightFields).toEqual(expect.arrayContaining(["intensity", "castShadow", "shadowCameraFar"]));
  expect(result.skies).toBeGreaterThanOrEqual(12);
  expect(result.shelves).toBe(result.expectedShelves);
  expect(result.rejected).toEqual([true, true, true]);
});
