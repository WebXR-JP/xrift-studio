import { expect, test, type Page } from "@playwright/test";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { ChatgptProduction } from "../src/lib/visual-editor/chatgpt-production";
import type { ChatgptSceneContext, XriftMcpEditorResponse } from "../src/lib/tauri";

type ImageEvidence = { label: string; mimeType: string; width: number; height: number; byteLength: number };
type WorldProductionFixture = {
  calls: { generationId: string; prompt: string; scene?: ChatgptSceneContext }[];
  reviews: { generationId: string; production: ChatgptProduction; scene: ChatgptSceneContext; images: ImageEvidence[] }[];
  modelReviews: number;
  holdReview: boolean;
  releaseReview: boolean;
  captureStopRequested?: boolean;
};
declare global { interface Window { __XRIFT_WORLD_PRODUCTION_TEST__?: WorldProductionFixture } }

test.setTimeout(240_000);
test.beforeEach(async ({ page }) => {
  const metricsPath = process.env.XRIFT_E2E_FONT_METRICS_PATH;
  if (metricsPath) await page.route("https://public.xrift.net/fonts/msdf/NotoSansJP/metrics.json?v=3", route => route.fulfill({ contentType: "application/json", path: metricsPath }));
});
const production: ChatgptProduction = { scope: "world", detail: "overview", focus: "暖かいLightが照らす小さな広場を歩く", criteria: ["広場の床と通れる幅の道がつながっている", "道の近くに暖かいLightがある"], maxPasses: 3 };
const prompt = "小さな広場を作って。広場の床につながる歩道と、道の近くに暖かいPoint Lightを置いて、全体を仕上げてください";
const firstPlan = { title: "広場の床と歩道", description: "床と歩道のつながりを先に作ります", production,
  objects: [{ name: "広場の道", shape: "plane", position: [0, 0.02, 3], scale: [2, 1, 8] }],
  edits: [{ entityId: "starter-floor", name: "広場の床", scale: [10, 1, 10] }], operations: [], hasMore: true, remainingWork: "道の近くに暖かいLightを配置する" };
const finalPlan = { title: "歩道のLight", description: "指定された暖かいLightを配置します", production,
  objects: [], edits: [], operations: [{ kind: "component-add", definitionId: "core.light.point", name: "歩道のLight", position: [0, 3, 3], propertiesJson: JSON.stringify({ color: "#ffba80", intensity: 2, distance: 20 }) }], hasMore: false, remainingWork: null };
const approved = { approved: true, summary: "床と歩道のつながり、Lightの配置を確認しました", remainingWork: "" };
const rejected = { approved: false, summary: "道の末端が広場から離れています", remainingWork: "広場の道を広場の中央までつなぎ、通れる幅を保つ" };

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}

async function ready(page: Page, options: { maxPasses?: number; rejectFirst?: boolean; holdReview?: boolean } = {}) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible({ timeout: 120_000 });
  const created = await call(page, "create_project", { name: "world-production-isolated", kind: "world", templateId: "blank" });
  expect(created.ok, JSON.stringify(created)).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus, { timeout: 120_000 }).toBe("saved");
  const direction = { ...production, maxPasses: options.maxPasses ?? 3 };
  await page.evaluate(async ({ first, last, direction, rejection, approval, rejectFirst, holdReview }) => {
    const fixture = window.__XRIFT_RELEASE_E2E__!;
    fixture.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null };
    window.__XRIFT_WORLD_PRODUCTION_TEST__ = { calls: [], reviews: [], modelReviews: 0, holdReview: Boolean(holdReview), releaseReview: false };
    const path = "/src/lib/tauri.ts";
    const { tauri }: typeof import("../src/lib/tauri") = await import(/* @vite-ignore */ path);
    const originalPlan = tauri.chatgptPlan.bind(tauri);
    tauri.chatgptPlan = async (...args) => {
      const state = window.__XRIFT_WORLD_PRODUCTION_TEST__!;
      state.calls.push({ generationId: args[4]!, prompt: args[1], scene: structuredClone(args[5]) });
      const pass = state.calls.length;
      // A later proposed direction cannot silently replace the original focus,
      // completion conditions, or finite request-wide budget.
      const changedDirection = { ...direction, focus: "追加の装飾を増やす", criteria: ["元の依頼にない装飾"], maxPasses: 6 };
      let plan: Record<string, unknown> = pass === 1 ? { ...first, production: direction } : { ...last, production: changedDirection };
      if (pass >= 3) {
        const road = args[5]?.entities.find(entity => entity.name === "広場の道");
        if (!road) throw new Error("Saved road must be present in the continuation Scene");
        plan = { title: "道の接続を修正", description: "見直しで確認した道の接続を修正します", production: changedDirection,
          objects: [], operations: [], edits: [{ entityId: road.id, position: [0, 0.02, 1], scale: [2, 1, 10] }], hasMore: false };
      }
      fixture.chatgptPlanFixture = JSON.stringify(plan);
      return originalPlan(...args);
    };
    tauri.chatgptReviewModel = async () => { window.__XRIFT_WORLD_PRODUCTION_TEST__!.modelReviews++; throw new Error("Broad production must use whole-Scene review"); };
    tauri.chatgptReviewScene = async (_model, generationId, _prompt, reviewProduction, scene, _resources, images) => {
      const state = window.__XRIFT_WORLD_PRODUCTION_TEST__!;
      const evidence = [];
      for (const image of images) {
        if (!image.dataUrl.startsWith("data:image/png;base64,")) throw new Error("Whole-Scene review requires an actual PNG capture");
        const blob = await (await fetch(image.dataUrl)).blob();
        const bitmap = await createImageBitmap(blob);
        evidence.push({ label: image.label, mimeType: blob.type, width: bitmap.width, height: bitmap.height, byteLength: blob.size });
        bitmap.close();
      }
      state.reviews.push({ generationId, production: structuredClone(reviewProduction), scene: structuredClone(scene), images: evidence });
      while (state.holdReview && !state.releaseReview) await new Promise(resolve => setTimeout(resolve, 25));
      const verdict = structuredClone(rejectFirst && state.reviews.length === 1 ? rejection : approval);
      return { ...verdict, criteria: reviewProduction.criteria.map(criterion => ({ criterion, passed: verdict.approved, reason: verdict.summary })) };
    };
  }, { first: firstPlan, last: finalPlan, direction, rejection: rejected, approval: approved, rejectFirst: options.rejectFirst ?? false, holdReview: options.holdReview ?? false });
  return direction;
}
async function fixture(page: Page) { return page.evaluate(() => window.__XRIFT_WORLD_PRODUCTION_TEST__!); }
async function generation(page: Page, generationId: string) { return (await call(page, "get_chatgpt_generation", { generationId })).result as ChatgptGeneration; }
async function start(page: Page) {
  const started = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt, options: { models: false, materials: false, audio: false } }, true);
  expect(started.ok, JSON.stringify(started)).toBe(true);
  return started.result!.generationId as string;
}
async function savedScene(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/lib/tauri.ts", tauri = (await import(/* @vite-ignore */ path)).tauri;
    const project = window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.name === "world-production-isolated")!;
    return JSON.parse((await tauri.readVisualProject(project.path)).sceneDocuments[0].content);
  });
}
async function terminal(page: Page, id: string, expected: "completed" | "failed" | "cancelled") {
  await expect.poll(async () => {
    const job = await generation(page, id);
    return job.status === "failed" && expected !== "failed" ? `failed: ${job.error}` : job.status;
  }, { timeout: 90_000 }).toBe(expected);
  return generation(page, id);
}

test("全体承認でも完成条件が欠けた結果は拒否し、検証した入力を参照として保持する", async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const path = "/src/lib/tauri.ts", { tauri } = await import(/* @vite-ignore */ path), original = tauri.chatgptReviewScene;
    tauri.chatgptReviewScene = async (...args: Parameters<typeof original>) => {
      const reviewed = await original(...args);
      return { ...reviewed, criteria: reviewed.criteria.slice(0, -1) };
    };
  });
  const id = await start(page), job = await terminal(page, id, "failed");
  expect(job.error).toContain("完成条件"); expect(job.harness?.inspection).toBeUndefined();
  expect(job.contextRefs!.length).toBeGreaterThanOrEqual(3);
  const archived = await page.evaluate(async ref => {
    const path = "/src/lib/tauri.ts", { tauri } = await import(/* @vite-ignore */ path);
    const project = window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.name === "world-production-isolated")!;
    return JSON.parse((await tauri.readChatgptHarnessContext(project.path, ref.fingerprint))!);
  }, job.contextRefs![job.contextRefs!.length - 1]);
  expect(archived.contractVersion).toBe(11);
  expect(archived.production.criteria).toEqual(job.production!.criteria);
  expect(archived.fingerprint).toBe(job.contextRefs![job.contextRefs!.length - 1].fingerprint);
});

test("保存した制作入力の外部改変は推論開始前に検出する", async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const path = "/src/lib/tauri.ts", { tauri } = await import(/* @vite-ignore */ path), original = tauri.writeChatgptHarnessContext;
    tauri.writeChatgptHarnessContext = async (projectPath: string, fingerprint: string, content: string) => {
      await original(projectPath, fingerprint, content);
      await tauri.writeTextFile(projectPath, `.cache/xrift-studio-harness/contexts/${fingerprint}.json`, `${content} `);
    };
  });
  const id = await start(page), job = await terminal(page, id, "failed");
  expect(job.error).toMatch(/制作入力|保存/);
  expect((await fixture(page)).calls).toHaveLength(0);
  expect(job.contextRefs).toBeUndefined(); expect(job.progress.completed).toBe(0);
});

test("全体制作を同じ依頼で2回に分けて保存し、実SceneのPNG2方向を見直して完了する", async ({ page }, info) => {
  const direction = await ready(page), id = await start(page);
  const job = await terminal(page, id, "completed"), state = await fixture(page);
  expect(state.calls).toHaveLength(2); expect(state.calls.every(call => call.generationId === id && call.prompt === prompt)).toBe(true);
  expect(state.calls[1].scene!.entities.some(entity => entity.name === "広場の道")).toBe(true);
  expect(state.calls[1].scene!.conversation!.at(-1)!.result).toContain(direction.focus);
  for (const criterion of direction.criteria) expect(state.calls[1].scene!.conversation!.at(-1)!.result).toContain(criterion);
  expect(state.reviews).toHaveLength(1); expect(state.modelReviews).toBe(0);
  expect(state.reviews[0].generationId).toBe(id); expect(state.reviews[0].production).toEqual(direction);
  expect(state.reviews[0].images).toHaveLength(2);
  for (const image of state.reviews[0].images) { expect(image.mimeType).toBe("image/png"); expect(image.width).toBeGreaterThan(128); expect(image.height).toBeGreaterThan(128); expect(image.byteLength).toBeGreaterThan(500); }
  expect(state.reviews[0].scene.entities.some(entity => entity.name === "歩道のLight")).toBe(true);
  expect(job.production).toEqual(direction); expect(job.productionPass).toBe(2); expect(job.progress.completed).toBe(3);
  const scene = await savedScene(page), road = Object.values(scene.entities).find((entity: any) => entity.name === "広場の道") as any;
  expect(road).toBeDefined();
  expect(Object.values(scene.entities).some((entity: any) => entity.name === "歩道のLight" && entity.components.some((component: any) => component.type === "light"))).toBe(true);
  const rendered = await page.evaluate(async id => { const path = "/e2e/chatgpt-modeling.fixture.ts"; return (await import(/* @vite-ignore */ path)).readModelRuntime(id); }, road.id);
  expect(rendered?.vertexCount).toBeGreaterThan(3);
  await page.screenshot({ path: info.outputPath("finished-world-production.png") });
});

test("全体の見直しで残った作業を同じ完成条件の3回目へ渡し、保存後に再確認する", async ({ page }) => {
  const direction = await ready(page, { rejectFirst: true }), id = await start(page);
  const job = await terminal(page, id, "completed"), state = await fixture(page);
  expect(state.calls).toHaveLength(3); expect(state.reviews).toHaveLength(2); expect(state.modelReviews).toBe(0);
  expect(state.calls[2].scene!.conversation!.some(turn => turn.result.includes(rejected.remainingWork))).toBe(true);
  expect(state.calls.every(call => call.generationId === id)).toBe(true);
  expect(state.reviews.every(review => review.production.focus === direction.focus && JSON.stringify(review.production.criteria) === JSON.stringify(direction.criteria))).toBe(true);
  expect(job.productionPass).toBe(3); expect(job.production).toEqual(direction);
  const road = Object.values((await savedScene(page)).entities).find((entity: any) => entity.name === "広場の道") as any;
  expect(road.components.find((component: any) => component.type === "transform").position).toEqual([0, 0.02, 1]);
});

test("完成条件が満たされず制作上限へ達した場合は失敗として止まり、保存済みのSceneを残す", async ({ page }) => {
  await ready(page, { maxPasses: 3, rejectFirst: true });
  await page.evaluate(async rejection => {
    const path = "/src/lib/tauri.ts";
    const { tauri }: typeof import("../src/lib/tauri") = await import(/* @vite-ignore */ path);
    const original = tauri.chatgptReviewScene;
    tauri.chatgptReviewScene = async (...args: Parameters<typeof original>) => {
      await original(...args);
      return { ...rejection, criteria: args[3].criteria.map(criterion => ({ criterion, passed: false, reason: rejection.summary })) };
    };
  }, rejected);
  const id = await start(page);
  const job = await terminal(page, id, "failed"), state = await fixture(page);
  expect(job.error).toContain("上限3回"); expect(job.error).toContain(rejected.remainingWork);
  expect(state.calls).toHaveLength(3); expect(state.reviews).toHaveLength(2); expect(state.modelReviews).toBe(0);
  const scene = await savedScene(page);
  expect(Object.values(scene.entities).some((entity: any) => entity.name === "広場の道")).toBe(true);
  expect(Object.values(scene.entities).some((entity: any) => entity.name === "歩道のLight")).toBe(true);
  expect(job.progress.completed).toBe(4);
});

test("全体制作に1回を提案されても最初に修正余地を確保し、保存と実画像の確認まで続ける", async ({ page }) => {
  await ready(page, { maxPasses: 1, rejectFirst: true });
  const id = await start(page), job = await terminal(page, id, "completed"), state = await fixture(page);
  expect(state.calls).toHaveLength(3); expect(state.reviews).toHaveLength(2);
  expect(job.production!.maxPasses).toBe(3); expect(job.productionPass).toBe(3);
  expect(state.calls[0].scene!.starterEntityIds).toEqual(["starter-floor", "starter-box"]);
  expect(state.calls[1].scene!.starterEntityIds, "edited starter floor is now authored content").toEqual(["starter-box"]);
  expect(state.calls[1].scene!.conversation!.some(turn => turn.result.includes("上限: 3回"))).toBe(true);
  expect(state.reviews.every(review => review.production.maxPasses === 3)).toBe(true);
});

test("全体reviewの応答待ちで停止した後の遅い不承認応答は、新しい制作も上書きも始めない", async ({ page }) => {
  await ready(page, { rejectFirst: true, holdReview: true }); const id = await start(page);
  await expect.poll(async () => (await fixture(page)).reviews.length, { timeout: 90_000 }).toBe(1);
  const before = await savedScene(page);
  expect((await call(page, "cancel_chatgpt_generation", { generationId: id })).ok).toBe(true);
  await page.evaluate(() => { window.__XRIFT_WORLD_PRODUCTION_TEST__!.releaseReview = true; });
  await terminal(page, id, "cancelled");
  expect((await fixture(page)).calls).toHaveLength(2); expect((await fixture(page)).reviews).toHaveLength(1);
  expect(await savedScene(page)).toEqual(before);
});

test("実Sceneの確認画像を取得している間に停止してもreviewや次の制作を始めない", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      if (!document.body.textContent?.includes("ワールド全体とスポーン位置からの見え方を確認しています")) return;
      const state = window.__XRIFT_WORLD_PRODUCTION_TEST__!, generationId = state.calls[0]?.generationId;
      if (!generationId || state.captureStopRequested) return;
      state.captureStopRequested = true;
      observer.disconnect();
      // Observe the real public progress before its first capture frame. The
      // cancellation still travels through the ordinary App MCP handler.
      const path = "/src/release-e2e/mock-tauri.ts";
      void import(/* @vite-ignore */ path).then(({ callReleaseE2EMcp }) => callReleaseE2EMcp("cancel_chatgpt_generation", { generationId }));
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  const id = await start(page);
  const job = await terminal(page, id, "cancelled"), state = await fixture(page);
  expect(state.captureStopRequested).toBe(true);
  expect(state.calls).toHaveLength(2); expect(state.reviews).toHaveLength(0); expect(state.modelReviews).toBe(0);
  expect(job.progress.completed).toBe(3);
  expect(Object.values((await savedScene(page)).entities).some((entity: any) => entity.name === "歩道のLight")).toBe(true);
});
