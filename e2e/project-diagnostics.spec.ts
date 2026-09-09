import { expect, test } from "@playwright/test";

test("diagnostics use real documents and leave MCP revision and bundle unchanged", async ({ page }) => {
  await page.goto("/e2e.html");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { createPrototypeProject } = await load("/src/lib/visual-editor/prototype-project.ts") as typeof import("../src/lib/visual-editor/prototype-project");
    const { executeXriftMcpEditorTool } = await load("/src/lib/visual-editor/mcp-editor-tools.ts");
    const { getTransform } = await load("/src/lib/visual-editor/scene-document.ts") as typeof import("../src/lib/visual-editor/scene-document");
    const bundle = createPrototypeProject("world", "diagnostics");
    const entity = Object.values(bundle.scene.entities)[0];
    getTransform(entity)!.scale[0] = 0;
    const context = { bundle, revision: 4, sceneSelection: null, assetSelection: null,
      editorMode: "edit" as const, importBusy: false, saveStatus: "saved" as const };
    const before = JSON.stringify(context);
    const health = executeXriftMcpEditorTool(context, { tool: "get_project_health", arguments: {} });
    const performance = executeXriftMcpEditorTool(context, { tool: "analyze_performance", arguments: {} });
    return { health: health.result, performance: performance.result,
      unchanged: before === JSON.stringify(context) && !health.changed && !performance.changed && health.bundle === bundle && performance.bundle === bundle,
      expectedAssets: Object.keys(bundle.assets.assets).length, entityId: entity.id };
  });
  expect(result.unchanged).toBe(true);
  const health = result.health.health as { summary: { assets: number }; issues: { entityId?: string; id: string }[] };
  expect(health.summary.assets).toBe(result.expectedAssets);
  expect(health.issues.some((issue) => issue.id === `entity-scale:${result.entityId}`)).toBe(true);
});

test("performance boundaries distinguish warning from exceeded and count actual components and assets", async ({ page }) => {
  await page.goto("/e2e.html");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { createPrototypeProject } = await load("/src/lib/visual-editor/prototype-project.ts") as typeof import("../src/lib/visual-editor/prototype-project");
    const { analyzeProjectPerformance, DEFAULT_PERFORMANCE_BUDGET } = await load("/src/lib/visual-editor/value-up/performance-budget.ts") as typeof import("../src/lib/visual-editor/value-up/performance-budget");
    const bundle = createPrototypeProject("world", "budget");
    const { createTextureAsset } = await load("/src/lib/visual-editor/asset-manifest.ts") as typeof import("../src/lib/visual-editor/asset-manifest");
    const texture = createTextureAsset({ id: "diagnostic-texture", name: "Diagnostic", source: { kind: "document" }, importSettings: {} })!;
    bundle.assets.assets = { [texture.id]: texture };
    const { createRigidBodyComponent } = await load("/src/lib/visual-editor/scene-document.ts") as typeof import("../src/lib/visual-editor/scene-document");
    const base = Object.values(bundle.scene.entities)[0];
    bundle.scene.entities = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i), {
      ...base, id: String(i), components: [
        { id: "light", type: "light" as const, enabled: true, lightType: "point" as const, color: "#ffffff", intensity: 1, castShadow: false },
        createRigidBodyComponent("body"),
      ],
    }]));
    const budget = { ...DEFAULT_PERFORMANCE_BUDGET, maxEntities: 10, maxLights: 100 };
    const warning = analyzeProjectPerformance(bundle, budget);
    const exact = analyzeProjectPerformance(bundle, { ...budget, maxEntities: 9 });
    const exceeded = analyzeProjectPerformance(bundle, { ...budget, maxEntities: 8 });
    let invalidRejected = false;
    try { analyzeProjectPerformance(bundle, { ...budget, maxEntities: 0 }); } catch { invalidRejected = true; }
    return { warning, exact, exceeded, invalidRejected };
  });
  expect(result.warning.tier).toBe("warning");
  expect(result.exact.tier).toBe("warning");
  expect(result.exceeded.tier).toBe("over-budget");
  expect(result.warning.metrics.lights).toBe(9);
  expect(result.warning.metrics.physicsBodies).toBe(9);
  expect(result.warning.metrics.textureAssets).toBe(1);
  expect(result.invalidRejected).toBe(true);
});

test("health reuses schema validation and reports empty scenes", async ({ page }) => {
  await page.goto("/e2e.html");
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { createPrototypeProject } = await load("/src/lib/visual-editor/prototype-project.ts") as typeof import("../src/lib/visual-editor/prototype-project");
    const { inspectProjectHealth } = await load("/src/lib/visual-editor/value-up/project-health.ts") as typeof import("../src/lib/visual-editor/value-up/project-health");
    const bundle = createPrototypeProject("world", "health");
    const ready = inspectProjectHealth(bundle);
    bundle.project.projectId = "";
    const broken = inspectProjectHealth(bundle);
    bundle.project.projectId = "repaired";
    bundle.scene.entities = {};
    bundle.scene.rootEntityIds = [];
    return { ready, broken, empty: inspectProjectHealth(bundle) };
  });
  expect(result.ready.status).toBe("ready");
  expect(result.broken.status).toBe("error");
  expect(result.broken.issues.some((issue) => issue.area === "project" && issue.severity === "blocking")).toBe(true);
  expect(result.empty.status).toBe("warning");
});
