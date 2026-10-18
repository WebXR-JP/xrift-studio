import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import type { BlenderModelSpec } from "../src/lib/visual-editor/chatgpt-modeling";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";

test.setTimeout(240_000);
test.beforeEach(async ({ page }) => {
  const metricsPath = process.env.XRIFT_E2E_FONT_METRICS_PATH;
  if (metricsPath) await page.route("https://public.xrift.net/fonts/msdf/NotoSansJP/metrics.json?v=3", route => route.fulfill({ contentType: "application/json", path: metricsPath }));
});
type QualityState = { reviews: { spec: BlenderModelSpec; images: { label: string; dataUrl: string }[] }[]; models: BlenderModelSpec[] };
declare global { interface Window { __XRIFT_QUALITY__?: QualityState } }

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false) {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}

async function ready(page: Page) {
  const fixture = async (name: string) => {
    const bytes = await readFile(`node_modules/.cache/chatgpt-blender-model/fixture-quality-${name}.glb`);
    const spec = JSON.parse(await readFile(`node_modules/.cache/chatgpt-blender-model/fixture-quality-${name}.json`, "utf8")) as BlenderModelSpec;
    return { dataUrl: `data:model/gltf-binary;base64,${bytes.toString("base64")}`, byteLength: bytes.byteLength, spec };
  };
  const [before, after] = await Promise.all([fixture("before"), fixture("after")]);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible({ timeout: 120_000 });
  expect((await call(page, "create_project", { name: "quality-isolated-two-native-model-versions", kind: "world", templateId: "blank" })).ok).toBe(true);
  const projectPath = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!.path);
  await page.evaluate(async ({ projectPath, before, after }) => {
    const path = "/e2e/chatgpt-modeling.fixture.ts";
    (await import(/* @vite-ignore */ path)).installBlenderOutput(projectPath, before.dataUrl, before.byteLength);
    const invoke = window.__TAURI_INTERNALS__!.invoke!;
    const revisedPath = `${projectPath}\\.cache\\xrift-studio-blender\\isolated-revised-output\\model.glb`;
    const fixture: QualityState = { reviews: [], models: [] };
    window.__XRIFT_QUALITY__ = fixture;
    window.__TAURI_INTERNALS__!.invoke = async (command, args, options) => {
      if (command === "create_blender_model") {
        const spec = args!.model as BlenderModelSpec;
        fixture.models.push(structuredClone(spec));
        if (spec.parts.find(part => part.id === "backrest")!.scale[1] > 0.5) return { path: revisedPath, fileName: "model.glb", byteLength: after.byteLength };
      }
      if (command === "read_local_model_import_source" && args?.sourcePath === revisedPath) return { fileName: "model.glb", byteLength: after.byteLength, mimeType: "model/gltf-binary", dataUrl: after.dataUrl };
      if (command === "chatgpt_review_model") {
        fixture.reviews.push({ spec: structuredClone(args!.spec as BlenderModelSpec), images: structuredClone(args!.images as QualityState["reviews"][number]["images"]) });
        return fixture.reviews.length === 1
          ? { approved: false, summary: "背もたれを指定の高さと青色へ直し、座面と脚を保持します", model: after.spec }
          : { approved: true, summary: "修正後の実描画で背もたれの高さと青色を確認しました", model: null };
      }
      return invoke(command, args, options);
    };
    window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null };
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "椅子の制作と見直し", description: "背もたれを高く青くし、座面と脚を保ちます", objects: [],
      production: { scope: "model", detail: "focused", focus: "椅子の背もたれ", criteria: ["高い青色の背もたれ", "座面と脚を保持"], maxPasses: 1 },
      operations: [{ kind: "blender-model", model: before.spec, position: [0, 0, 0] }], hasMore: false });
  }, { projectPath, before, after });
  return { projectPath, before, after };
}

test("実Blenderの二つの版で、描画確認・部分修正・再確認・原本保存までを通す", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.stack ?? error.message));
  const { projectPath, before, after } = await ready(page);
  const started = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "座面と脚を保ち、背もたれを高く青くした椅子を作って", options: { models: true, materials: false, audio: false, modelSource: "blender" } }, true);
  expect(started.ok).toBe(true);
  const id = started.result!.generationId;
  const job = async () => (await call(page, "get_chatgpt_generation", { generationId: id })).result as unknown as ChatgptGeneration;
  await expect.poll(async () => { const current = await job(); return current.status === "failed" ? current.error : current.status; }, { timeout: 90_000 }).toBe("completed");
  const state = await page.evaluate(() => window.__XRIFT_QUALITY__!);
  expect(state.models).toHaveLength(2); expect(state.reviews).toHaveLength(2);
  expect(state.models[1].parts.slice(1)).toEqual(state.models[0].parts.slice(1));
  expect(state.models[1].parts[0].scale).toEqual(after.spec.parts[0].scale);
  expect(state.models[1].parts[0].color).toEqual(after.spec.parts[0].color);
  for (const review of state.reviews) {
    expect(review.images.map(image => image.label)).toEqual(["正面", "斜め前", "斜め後ろ"]);
    for (const image of review.images) expect(image.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(new Set(review.images.map(image => image.dataUrl)).size).toBe(3);
  }
  expect(state.reviews[1].images[1].dataUrl).not.toBe(state.reviews[0].images[1].dataUrl);
  for (const [index, review] of state.reviews.entries()) {
    await writeFile(info.outputPath(`actual-review-${index + 1}.png`), Buffer.from(review.images[1].dataUrl.split(",")[1], "base64"));
  }
  const result = await page.evaluate(async projectPath => {
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    const files = await tauri.readVisualProject(projectPath);
    const assets = JSON.parse(files.assetManifestJson);
    const models = Object.values(assets.assets).filter((asset: any) => asset.kind === "model") as any[];
    const latest = models.find(asset => asset.authoring.revision === 2);
    const sourcePath = "/src/lib/visual-editor/chatgpt-model-source.ts";
    const source = await (await import(/* @vite-ignore */ sourcePath)).readBlenderModelSource(latest, projectPath);
    return { models, latest, source };
  }, projectPath);
  expect(result.models).toHaveLength(2);
  expect(result.source!.spec.parts).toEqual(state.models[1].parts);
  expect(result.latest.importMetadata.bounds.size[1]).toBeGreaterThan(result.models.find(model => model.authoring.revision === 1).importMetadata.bounds.size[1]);
  expect(result.source!.originalPrompt).toBe("座面と脚を保ち、背もたれを高く青くした椅子を作って");
  expect(result.source!.parentAssetId).toBe(result.models.find(model => model.authoring.revision === 1).id);
  const scene = (await call(page, "get_editor_context")).result!;
  expect(scene.projectId).toBeDefined();
  await page.screenshot({ path: info.outputPath("real-model-revised-and-reviewed.png") });
  expect(errors).toEqual([]);
  expect(before.dataUrl).not.toBe(after.dataUrl);
});
