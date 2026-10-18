import { expect, test, type Page } from "@playwright/test";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { ChatgptProduction } from "../src/lib/visual-editor/chatgpt-production";
import type { ChatgptResourceContext } from "../src/lib/visual-editor/chatgpt-resources";
import type { ChatgptSceneContext, XriftMcpEditorResponse } from "../src/lib/tauri";
import type { SceneDocument, SceneEntity } from "../src/lib/visual-editor/scene-document";
import type { AssetManifest } from "../src/lib/visual-editor/asset-manifest";

type Evidence = { label: string; width: number; height: number; bytes: number };
type R3fFixture = {
  mode: "create" | "revise" | "invalid";
  calls: { generationId: string; prompt: string; scene?: ChatgptSceneContext; resources?: ChatgptResourceContext }[];
  reviews: { generationId: string; production: ChatgptProduction; images: Evidence[] }[];
  modelWorkers: number; modelReviews: number; blenderCalls: number;
  rejectFirst: boolean; holdReview: boolean; releaseReview: boolean;
};
declare global { interface Window { __XRIFT_R3F_AUTHORING_TEST__?: R3fFixture; __XRIFT_R3F_EXECUTED__?: boolean } }

test.setTimeout(240_000);
test.beforeEach(async ({ page }) => {
  const metricsPath = process.env.XRIFT_E2E_FONT_METRICS_PATH;
  if (metricsPath) await page.route("https://public.xrift.net/fonts/msdf/NotoSansJP/metrics.json?v=3", route => route.fulfill({ contentType: "application/json", path: metricsPath }));
});

// This fixture replaces the plan API response only. The real static TSX
// importer, Scene codecs, autosave, Three renderer and captures are exercised.
const source = `import { Box } from '@react-three/drei';
import * as THREE from 'three';
const ROOF_RISE = 1.2;
const buildings = [{id:'west-near',x:-4,z:0,color:'#ead5ae'},{id:'east-near',x:4,z:0,color:'#d9bd92'},{id:'west-far',x:-4,z:-6,color:'#d7d3bc'},{id:'east-far',x:4,z:-6,color:'#e3c8a6'}];
const windows = [{id:'front-left',x:-0.8,z:1.53},{id:'front-right',x:0.8,z:1.53},{id:'back-left',x:-0.8,z:-1.53},{id:'back-right',x:0.8,z:-1.53}];
function Roof(){
 const profile = new THREE.Shape(); profile.moveTo(-1.7,0); profile.lineTo(0,ROOF_RISE); profile.lineTo(1.7,0); profile.closePath();
 return <mesh name="roof" position={[0,2.4,-1.7]}><extrudeGeometry args={[profile,{depth:3.4,bevelEnabled:false}]}/><meshStandardMaterial color="#874d36" roughness={0.85}/></mesh>;
}
function House({name,x,z,color}){
 return <group name={name} position={[x,0,z]}>
  <Box name="front-wall" args={[3,2.4,0.18]} position={[0,1.2,1.4]}><meshStandardMaterial color={color} roughness={0.85}/></Box>
  <Box name="back-wall" args={[3,2.4,0.18]} position={[0,1.2,-1.4]}><meshStandardMaterial color={color} roughness={0.85}/></Box>
  <Box name="left-wall" args={[0.18,2.4,2.8]} position={[-1.4,1.2,0]}><meshStandardMaterial color={color} roughness={0.85}/></Box>
  <Box name="right-wall" args={[0.18,2.4,2.8]} position={[1.4,1.2,0]}><meshStandardMaterial color={color} roughness={0.85}/></Box>
  <Box name="door" args={[0.65,1.8,0.12]} position={[0,0.9,1.55]}><meshStandardMaterial color="#65412d" roughness={0.8}/></Box>
  {windows.map(opening => <group key={opening.id} name={opening.id} position={[opening.x,1.55,opening.z]}>
   <Box name="window-frame" args={[0.7,0.85,0.08]}><meshStandardMaterial color="#f4e8cc" roughness={0.7}/></Box>
   <Box name="window-pane" args={[0.54,0.69,0.1]}><meshStandardMaterial color="#305c72" roughness={0.2} metalness={0.35}/></Box>
  </group>)}
  <Roof/>
 </group>;
}
export default function World(){return <group name="village">
 <Box name="village-ground" args={[16,0.1,16]} position={[0,-0.06,-3]}><meshStandardMaterial color="#84966c" roughness={1}/></Box>
 <Box name="street" args={[3,0.08,16]} position={[0,0,-3]}><meshStandardMaterial color="#a89881" roughness={0.95}/></Box>
 {buildings.map(building => <House key={building.id} name={building.id} x={building.x} z={building.z} color={building.color}/>)}
</group>;}`;
const revisedSource = source.replace("const ROOF_RISE = 1.2;", "const ROOF_RISE = 1.55;");
const invalidSource = `globalThis.__XRIFT_R3F_EXECUTED__ = true;\n${revisedSource}`;
const initialPrompt = "4軒の切妻屋根の家を道の両側へ配置し、窓と扉のある小さな街並みを完成させてください";
const revisionPrompt = "家の屋根だけ少し高くしてください。手で調整した扉とMaterial、手動の子Entityは保ってください";
const approved = { approved: true, summary: "4軒の家、屋根、窓と扉、道のつながりを確認しました", remainingWork: "" };
const rejected = { approved: false, summary: "屋根の立ち上がりが指定より低いです", remainingWork: "4軒の屋根の立ち上がりだけを高くし、壁・窓・扉と道は保つ" };

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}
async function ready(page: Page, options: { scope?: ChatgptProduction["scope"]; rejectFirst?: boolean; holdReview?: boolean; maxPasses?: number } = {}) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible({ timeout: 120_000 });
  const created = await call(page, "create_project", { name: "r3f-authoring-isolated", kind: "world", templateId: "blank" });
  expect(created.ok, JSON.stringify(created)).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus, { timeout: 120_000 }).toBe("saved");
  const projectPath = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.name === "r3f-authoring-isolated")!.path);
  const production: ChatgptProduction = { scope: options.scope ?? "world", detail: "overview", focus: "窓と扉のある4軒の家と道を眺める", criteria: ["4軒の家に壁・切妻屋根・窓・扉がある", "家の両側の道が人の大きさに合う"], maxPasses: options.maxPasses ?? 2 };
  await page.evaluate(async ({ source, revisedSource, invalidSource, production, approved, rejected, rejectFirst, holdReview }) => {
    window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null };
    window.__XRIFT_R3F_AUTHORING_TEST__ = { mode: "create", calls: [], reviews: [], modelWorkers: 0, modelReviews: 0, blenderCalls: 0, rejectFirst, holdReview, releaseReview: false };
    window.__XRIFT_R3F_EXECUTED__ = false;
    const path = "/src/lib/tauri.ts";
    const { tauri }: typeof import("../src/lib/tauri") = await import(/* @vite-ignore */ path);
    const originalPlan = tauri.chatgptPlan.bind(tauri);
    tauri.chatgptPlan = async (...args) => {
      const state = window.__XRIFT_R3F_AUTHORING_TEST__!;
      state.calls.push({ generationId: args[4]!, prompt: args[1], scene: structuredClone(args[5]), resources: structuredClone(args[7]) });
      const prior = args[7]?.authoredScenes?.find(scene => scene.name === "道と4軒の家");
      if (state.mode === "revise" && !prior) throw new Error("A revision must receive the saved complete source and owning root");
      const correcting = state.rejectFirst && state.reviews.some(review => review.generationId === args[4]);
      const plan = { title: "家と道の制作", description: state.mode === "create" && !correcting ? "4軒の家と道をまとめて作ります" : "屋根だけ高くし、他の部品を保ちます", production,
        objects: [], edits: [], operations: [{ kind: "r3f-scene", name: "道と4軒の家", source: state.mode === "invalid" ? invalidSource : state.mode === "revise" || correcting ? revisedSource : source, entityId: prior?.entityId ?? null }], hasMore: false, remainingWork: null };
      window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify(plan);
      return originalPlan(...args);
    };
    tauri.chatgptModelSpecs = async () => { window.__XRIFT_R3F_AUTHORING_TEST__!.modelWorkers++; throw new Error("R3F authoring must not invoke a Blender modeling worker"); };
    tauri.createBlenderModel = async () => { window.__XRIFT_R3F_AUTHORING_TEST__!.blenderCalls++; throw new Error("Blender is unavailable in this fixture"); };
    tauri.chatgptReviewModel = async () => { window.__XRIFT_R3F_AUTHORING_TEST__!.modelReviews++; throw new Error("R3F authoring requires whole-Scene evidence"); };
    tauri.chatgptReviewScene = async (_model, generationId, _prompt, direction, _scene, _resources, images) => {
      const state = window.__XRIFT_R3F_AUTHORING_TEST__!, evidence: Evidence[] = [];
      for (const image of images) {
        if (!image.dataUrl.startsWith("data:image/png;base64,")) throw new Error("Review must receive actual PNG captures");
        const blob = await (await fetch(image.dataUrl)).blob(), bitmap = await createImageBitmap(blob);
        evidence.push({ label: image.label, width: bitmap.width, height: bitmap.height, bytes: blob.size }); bitmap.close();
      }
      state.reviews.push({ generationId, production: structuredClone(direction), images: evidence });
      while (state.holdReview && !state.releaseReview) await new Promise(resolve => setTimeout(resolve, 25));
      const verdict = structuredClone(state.rejectFirst && state.reviews.filter(review => review.generationId === generationId).length === 1 ? rejected : approved);
      return { ...verdict, criteria: direction.criteria.map(criterion => ({ criterion, passed: verdict.approved, reason: verdict.summary })) };
    };
  }, { source, revisedSource, invalidSource, production, approved, rejected, rejectFirst: options.rejectFirst ?? false, holdReview: options.holdReview ?? false });
  expect((await call(page, "get_modeling_tools")).result?.blender).toMatchObject({ available: false });
  return { projectPath, production };
}
async function fixture(page: Page) { return page.evaluate(() => window.__XRIFT_R3F_AUTHORING_TEST__!); }
async function saved(page: Page, projectPath: string): Promise<{ scene: SceneDocument; assets: AssetManifest }> {
  return page.evaluate(async projectPath => {
    const path = "/src/lib/tauri.ts";
    const files = await (await import(/* @vite-ignore */ path)).tauri.readVisualProject(projectPath);
    return { scene: JSON.parse(files.sceneDocuments[0].content), assets: JSON.parse(files.assetManifestJson) };
  }, projectPath);
}
function authoredAssets(manifest: AssetManifest) {
  return { ...manifest, assets: Object.fromEntries(Object.entries(manifest.assets).map(([id, asset]) => {
    const { thumbnail: _thumbnail, ...content } = asset;
    return [id, content];
  })) };
}
async function generation(page: Page, id: string) { return (await call(page, "get_chatgpt_generation", { generationId: id })).result as ChatgptGeneration; }
async function start(page: Page, prompt = initialPrompt) {
  const started = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt, options: { models: true, materials: false, audio: false, modelSource: "auto" } }, true);
  expect(started.ok, JSON.stringify(started)).toBe(true); return started.result!.generationId as string;
}
async function terminal(page: Page, id: string, status: "completed" | "failed" | "cancelled") {
  await expect.poll(async () => ["completed", "failed", "cancelled"].includes((await generation(page, id)).status), { timeout: 120_000 }).toBe(true);
  const job = await generation(page, id);
  expect(job.status, job.error).toBe(status);
  return job;
}
function root(scene: SceneDocument): SceneEntity {
  const roots = Object.values(scene.entities).filter(entity => entity.codeAuthoring);
  expect(roots).toHaveLength(1); return roots[0];
}
async function runtime(page: Page, entityId: string) {
  return page.evaluate(async entityId => { const path = "/e2e/chatgpt-modeling.fixture.ts"; return (await import(/* @vite-ignore */ path)).readModelRuntime(entityId); }, entityId);
}
function evidence(state: R3fFixture, count: number) {
  expect(state.modelWorkers).toBe(0); expect(state.modelReviews).toBe(0); expect(state.blenderCalls).toBe(0);
  expect(state.reviews).toHaveLength(count);
  for (const review of state.reviews) {
    expect(review.images).toHaveLength(2);
    for (const image of review.images) { expect(image.width).toBeGreaterThan(128); expect(image.height).toBeGreaterThan(128); expect(image.bytes).toBeGreaterThan(500); }
  }
}

test("Blenderなしで4軒と道を実描画し、保存・再読込後の局所修正でもIDと手動編集を保つ", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const { projectPath } = await ready(page), id = await start(page);
  await terminal(page, id, "completed");
  const first = await saved(page, projectPath), firstRoot = root(first.scene), authoring = firstRoot.codeAuthoring!;
  expect(authoring.source).toBe(source); expect(authoring.originalPrompt).toBe(initialPrompt); expect(authoring.revision).toBe(1);
  const roofs = Object.values(first.scene.entities).filter(entity => entity.name === "roof");
  expect(roofs).toHaveLength(4);
  expect(roofs.every(entity => entity.components.some(component => component.type === "mesh" && component.geometry?.kind === "extrude"))).toBe(true);
  expect(Object.values(first.scene.entities).filter(entity => entity.name === "window-pane")).toHaveLength(16);
  await expect.poll(async () => (await runtime(page, firstRoot.id))?.meshCount ?? 0).toBeGreaterThanOrEqual(58);
  expect((await runtime(page, roofs[0].id))!.vertexCount).toBeGreaterThan(8);
  const initialRoofHeight = (await runtime(page, roofs[0].id))!.size[1];
  evidence(await fixture(page), 1);
  expect((await fixture(page)).calls[0].resources?.blenderAvailable).not.toBe(true);
  expect((await call(page, "close_project")).ok).toBe(true);
  expect((await call(page, "open_project", { path: projectPath })).ok).toBe(true);
  await expect.poll(async () => (await runtime(page, firstRoot.id))?.meshCount ?? 0).toBeGreaterThanOrEqual(58);
  expect(root((await saved(page, projectPath)).scene).codeAuthoring).toEqual(authoring);
  const camera = await call(page, "set_scene_view_camera", { position: [18, 14, 22], target: [0, 1.5, -3] }, true);
  expect(camera.ok, JSON.stringify(camera)).toBe(true);
  await page.screenshot({ path: info.outputPath("r3f-village-editor.png") });
  const door = Object.values(first.scene.entities).find(entity => entity.name === "door")!;
  const mesh = door.components.find(component => component.type === "mesh")!;
  if (mesh.type !== "mesh") throw new Error("Door must contain a real Mesh Renderer");
  const materialId = mesh.materialBindings[0].materialAssetId;
  expect((await call(page, "update_transform", { entityId: door.id, position: [0, 1.05, 1.68] }, true)).ok).toBe(true);
  expect((await call(page, "update_material_asset", { materialAssetId: materialId, patch: { color: "#245f3d", roughness: 0.43 } }, true)).ok).toBe(true);
  const child = await call(page, "create_empty_entity", { name: "手動の案内位置", parentEntityId: firstRoot.id, position: [0, 0, 8] }, true);
  expect(child.ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const manual = await saved(page, projectPath);
  await page.evaluate(() => { window.__XRIFT_R3F_AUTHORING_TEST__!.mode = "revise"; });
  const revisedId = await start(page, revisionPrompt); await terminal(page, revisedId, "completed");
  const next = await saved(page, projectPath), nextRoot = root(next.scene);
  expect(nextRoot.id).toBe(firstRoot.id); expect(nextRoot.codeAuthoring!.source).toBe(revisedSource); expect(nextRoot.codeAuthoring!.revision).toBe(2);
  expect(Object.keys(next.scene.entities).sort()).toEqual(Object.keys(manual.scene.entities).sort());
  expect(Object.fromEntries(Object.entries(nextRoot.codeAuthoring!.nodes).map(([key, node]) => [key, node.entityId])))
    .toEqual(Object.fromEntries(Object.entries(authoring.nodes).map(([key, node]) => [key, node.entityId])));
  expect(next.scene.entities[door.id]).toEqual(manual.scene.entities[door.id]);
  expect(next.scene.entities[child.result!.entityId as string]).toEqual(manual.scene.entities[child.result!.entityId as string]);
  expect(authoredAssets(next.assets).assets[materialId]).toEqual(authoredAssets(manual.assets).assets[materialId]);
  const state = await fixture(page); evidence(state, 2);
  expect(state.calls).toHaveLength(2); expect(state.calls[1].resources!.authoredScenes).toContainEqual({ entityId: firstRoot.id, name: firstRoot.name, source });
  expect((await runtime(page, roofs[0].id))!.size[1]).toBeGreaterThan(initialRoofHeight + 0.3);
  expect(errors).toEqual([]);
});

for (const scope of ["model", "edit"] as const) test(`${scope}でも実画像reviewを省略せず、不承認を同じ2回の制作上限内で修正する`, async ({ page }) => {
  const { projectPath, production } = await ready(page, { scope, rejectFirst: true, maxPasses: 2 }), id = await start(page);
  const job = await terminal(page, id, "completed"), state = await fixture(page);
  evidence(state, 2); expect(state.calls).toHaveLength(2); expect(state.calls.every(call => call.generationId === id)).toBe(true);
  expect(state.calls[1].scene?.conversation?.some(turn => turn.result.includes(rejected.remainingWork))).toBe(true);
  expect(state.calls[1].scene?.conversation?.some(turn => turn.result.includes('"production"'))).toBe(true);
  expect(state.reviews.every(review => JSON.stringify(review.production) === JSON.stringify(production))).toBe(true);
  expect(job.productionVisualReview).toBe(true); expect(job.productionPass).toBe(2);
  const authored = root((await saved(page, projectPath)).scene).codeAuthoring!;
  expect(authored.source).toBe(revisedSource); expect(authored.revision).toBe(2);
});

test("不正な制作コードを実行せず、再計画上限で止めて最後に保存した街並みを残す", async ({ page }) => {
  const { projectPath } = await ready(page), id = await start(page); await terminal(page, id, "completed");
  const before = await saved(page, projectPath);
  await page.evaluate(() => { window.__XRIFT_R3F_AUTHORING_TEST__!.mode = "invalid"; });
  const failedId = await start(page, revisionPrompt), job = await terminal(page, failedId, "failed");
  const state = await fixture(page), invalidCalls = state.calls.filter(call => call.generationId === failedId);
  expect(invalidCalls.length).toBeGreaterThan(0); expect(invalidCalls.length).toBeLessThanOrEqual(3);
  expect(job.error).toBeTruthy(); expect(await page.evaluate(() => window.__XRIFT_R3F_EXECUTED__)).toBe(false);
  const after = await saved(page, projectPath);
  expect(after.scene).toEqual(before.scene); expect(authoredAssets(after.assets)).toEqual(authoredAssets(before.assets)); evidence(state, 1);
});

test("画像review待ちで停止した後の遅い不承認応答は、追加制作や上書きを始めない", async ({ page }) => {
  const { projectPath } = await ready(page, { rejectFirst: true, holdReview: true }), id = await start(page);
  await expect.poll(async () => (await fixture(page)).reviews.length, { timeout: 120_000 }).toBe(1);
  const before = await saved(page, projectPath);
  expect(root(before.scene).codeAuthoring!.source).toBe(source);
  expect((await call(page, "cancel_chatgpt_generation", { generationId: id })).ok).toBe(true);
  await page.evaluate(() => { window.__XRIFT_R3F_AUTHORING_TEST__!.releaseReview = true; });
  await terminal(page, id, "cancelled");
  expect((await fixture(page)).calls).toHaveLength(1); evidence(await fixture(page), 1);
  const after = await saved(page, projectPath);
  expect(after.scene).toEqual(before.scene); expect(authoredAssets(after.assets)).toEqual(authoredAssets(before.assets));
});
