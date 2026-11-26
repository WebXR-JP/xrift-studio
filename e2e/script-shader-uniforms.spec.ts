import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";
import type { UniformProbe, UniformSurface } from "./script-shader-uniforms.fixture";

const PROJECT_NAME = "script-shader-uniforms-isolated-fixture";
const FIXTURE = "/e2e/script-shader-uniforms.fixture.tsx";

/**
 * Every channel of the drawn pixel is one uniform, so a probe of the GPU
 * result says which value the shader received:
 * red = uColor.r * uGain, green = uWalker.y, blue = fract(uTime / 10).
 */
const SHADER = {
  sourceModulePath: "studio://script-shader-uniforms-e2e",
  vertexShader: [
    "void main() {",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
    "}",
  ].join("\n"),
  fragmentShader: [
    "uniform vec3 uColor;",
    "uniform float uGain;",
    "uniform vec3 uWalker;",
    "uniform float uTime;",
    "",
    "void main() {",
    "  gl_FragColor = vec4(uColor.r * uGain, uWalker.y, fract(uTime * 0.1), 1.0);",
    "}",
  ].join("\n"),
  uniforms: {
    uColor: { kind: "color", value: "#ffffff" },
    uGain: { kind: "number", value: 1 },
    uWalker: { kind: "vector", value: [0, 0, 0] },
    uTime: { kind: "number", value: 0 },
  },
  variants: [{ name: "default", defines: {}, side: "double", transparent: false, depthWrite: true }],
  animatedTimeUniform: "uTime",
};

/**
 * One Script, three roles. The steps are named notifications, received through
 * `ctx.graph.on`, so the Editor's Play and the generated World are driven by
 * the same source in the same order.
 */
const SCRIPT_SOURCE = `import { defineScript, prop } from "xrift:script";

export default defineScript({
  name: "Uniform Probe",
  props: {
    role: prop.enum({ options: ["base", "top", "clock"], default: "base" }),
  },
  start(ctx) {
    const role = ctx.props.role;
    const store = ctx.object3d.userData as { uniformTest?: Record<string, unknown> };
    const report: Record<string, unknown> = {};
    store.uniformTest = { ...store.uniformTest, [role]: report };
    const walker = [0, 0, 0];
    let active = true;
    let hold = false;
    ctx.graph.on("uniform-test.top-off", () => {
      if (role !== "top") return;
      active = false;
      report.reset = ctx.materials.resetUniform("uGain");
    });
    ctx.graph.on("uniform-test.hold", () => {
      hold = true;
    });
    ctx.graph.on("uniform-test.release", () => {
      if (role !== "clock") return;
      hold = false;
      report.release = ctx.materials.resetUniform("uTime");
    });
    ctx.graph.on("uniform-test.wrong", () => {
      if (role !== "base") return;
      try {
        ctx.materials.setUniform("uWalker", [1, 2]);
      } catch (error) {
        report.error = error instanceof Error ? error.message : String(error);
      }
    });
    ctx.graph.on("uniform-test.throw", () => {
      if (role === "clock") ctx.materials.setUniform("uGain", [1, 2]);
    });
    ctx.graph.on("uniform-test.reset", () => {
      if (role !== "base") return;
      active = false;
      ctx.materials.reset();
    });
    return {
      update() {
        if (!active) return;
        if (role === "base") {
          walker[1] = 0.5;
          report.counts = {
            uColor: ctx.materials.setUniform("uColor", "#ff0000"),
            uGain: ctx.materials.setUniform("uGain", 0.25),
            uWalker: ctx.materials.setUniform("uWalker", walker),
            uMissing: ctx.materials.setUniform("uMissing", 1),
          };
        } else if (role === "top") {
          report.count = ctx.materials.setUniform("uGain", 0.5);
        } else {
          report.counts = {
            uColor: ctx.materials.setUniform("uColor", 0x808080),
            uGain: ctx.materials.setUniform("uGain", 0.75),
          };
          if (hold) report.time = ctx.materials.setUniform("uTime", 2.5);
        }
      },
    };
  },
});
`;

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}

async function write(page: Page, tool: string, args: Record<string, unknown>) {
  const response = await call(page, tool, args, true);
  expect(response.ok, `${tool}: ${JSON.stringify(response)}`).toBe(true);
  return response.result!;
}

function probe(page: Page, surface: UniformSurface, entityId: string): Promise<UniformProbe | null> {
  return page.evaluate(async ({ fixture, surface, entityId }) =>
    (await import(/* @vite-ignore */ fixture)).probeEntity(surface, entityId), { fixture: FIXTURE, surface, entityId });
}

function send(page: Page, surface: UniformSurface, name: string): Promise<void> {
  return page.evaluate(async ({ fixture, surface, name }) =>
    (await import(/* @vite-ignore */ fixture)).sendSceneEvent(surface, name), { fixture: FIXTURE, surface, name });
}

/** One drawn Material of the Entity, as numbers a matcher can compare. */
async function drawn(page: Page, surface: UniformSurface, entityId: string) {
  const result = await probe(page, surface, entityId);
  const material = result?.materials[0];
  return {
    report: result?.report as Record<string, Record<string, unknown>> | null,
    uuid: material?.uuid,
    version: material?.version,
    uniforms: material?.uniforms as Record<string, number | number[]> | undefined,
    // Half a level of rounding either way is not a difference in the value.
    red: material ? Math.round(material.pixel[0] / 2) : -1,
    green: material ? Math.round(material.pixel[1] / 2) : -1,
    blue: material ? Math.round(material.pixel[2] / 2) : -1,
  };
}

/**
 * The same steps and the same expectations for both surfaces. Returns what a
 * surface reported where the wording has to match between them.
 */
async function exerciseUniforms(page: Page, surface: UniformSurface, boxId: string, terrainId: string, testInfo: TestInfo) {
  // Two Script Components on one Entity: the later one wins uGain, the earlier
  // one still supplies uColor and uWalker.
  await expect.poll(async () => (await drawn(page, surface, boxId)).uniforms).toMatchObject({
    uColor: [1, 0, 0],
    uGain: 0.5,
    uWalker: [0, 0.5, 0],
  });
  const composed = await drawn(page, surface, boxId);
  expect(composed.report).toMatchObject({
    base: { counts: { uColor: 1, uGain: 1, uWalker: 1, uMissing: 0 } },
    top: { count: 1 },
  });
  expect([composed.red, composed.green]).toEqual([64, 64]);

  await send(page, surface, "uniform-test.top-off");
  await expect.poll(async () => (await drawn(page, surface, boxId)).uniforms?.uGain).toBe(0.25);
  const revealed = await drawn(page, surface, boxId);
  expect(revealed.report).toMatchObject({ top: { reset: 1 } });
  expect([revealed.red, revealed.green]).toEqual([32, 64]);
  // Many frames of per-frame writes later it is still the same Material, and
  // nothing asked for its shader program to be built again.
  expect([revealed.uuid, revealed.version]).toEqual([composed.uuid, composed.version]);

  // A value of the wrong shape is refused where it is called, and what is
  // drawn stays as it was.
  await send(page, surface, "uniform-test.wrong");
  await expect.poll(async () => (await drawn(page, surface, boxId)).report?.base?.error).toBeTruthy();
  const refused = await drawn(page, surface, boxId);
  expect(refused.uniforms).toMatchObject({ uWalker: [0, 0.5, 0] });
  expect(refused.green).toBe(64);

  // The clock keeps running on a Material a Script has overridden.
  await expect.poll(async () => (await drawn(page, surface, terrainId)).uniforms?.uGain).toBe(0.75);
  const ticking = await drawn(page, surface, terrainId);
  expect(ticking.uniforms?.uColor).toEqual([0.2159, 0.2159, 0.2159]);
  expect(ticking.red).toBe(Math.round((0.2159 * 0.75 * 255) / 2));
  await expect.poll(async () => (await drawn(page, surface, terrainId)).uniforms?.uTime).toBeGreaterThan(ticking.uniforms!.uTime as number);

  // The Script's value replaces the clock for as long as the override is on.
  await send(page, surface, "uniform-test.hold");
  await expect.poll(async () => (await drawn(page, surface, terrainId)).uniforms?.uTime).toBe(2.5);
  await page.waitForTimeout(300);
  const held = await drawn(page, surface, terrainId);
  expect(held.uniforms?.uTime).toBe(2.5);
  expect(held.blue).toBe(32);
  expect(held.report).toMatchObject({ clock: { time: 1 } });

  // Taking it off returns the uniform to the running clock.
  await send(page, surface, "uniform-test.release");
  await expect.poll(async () => (await drawn(page, surface, terrainId)).uniforms?.uTime).not.toBe(2.5);
  const resumed = await drawn(page, surface, terrainId);
  expect(resumed.report).toMatchObject({ clock: { release: 1 } });
  expect(resumed.uniforms?.uGain).toBe(0.75);
  expect(resumed.uuid).toBe(ticking.uuid);
  await expect.poll(async () => (await drawn(page, surface, terrainId)).uniforms?.uTime).toBeGreaterThan(resumed.uniforms!.uTime as number);
  await page.locator(surface === "editor" ? "canvas" : "#published-shader-uniforms canvas").first()
    .screenshot({ path: testInfo.outputPath(`uniforms-${surface}.png`) });

  // A Script that stops takes its overrides with it.
  await send(page, surface, "uniform-test.throw");
  await expect.poll(async () => (await drawn(page, surface, terrainId)).uniforms).toMatchObject({ uColor: [1, 1, 1], uGain: 1 });
  const stopped = await drawn(page, surface, terrainId);
  expect(stopped.red).toBe(128);
  expect(stopped.uuid).not.toBe(ticking.uuid);

  await send(page, surface, "uniform-test.reset");
  await expect.poll(async () => (await drawn(page, surface, boxId)).uniforms).toMatchObject({
    uColor: [1, 1, 1],
    uGain: 1,
    uWalker: [0, 0, 0],
  });
  const restored = await drawn(page, surface, boxId);
  expect([restored.red, restored.green]).toEqual([128, 0]);
  expect(restored.uuid).not.toBe(composed.uuid);
  return { error: refused.report!.base!.error as string };
}

test("Scriptが変えたuniformは、エディターのPlayと公開用に生成したWorldで同じ値で描画される", async ({ page }, testInfo) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    // A value of the wrong shape that reached the renderer would show here.
    if (/GL_INVALID|INVALID_(OPERATION|VALUE|ENUM)|uniform\d|THREE\.WebGLProgram/.test(message.text())) {
      problems.push(message.text());
    }
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible({ timeout: 120_000 });
  expect((await call(page, "create_project", { name: PROJECT_NAME, kind: "world", templateId: "blank" })).ok).toBe(true);

  const material = await write(page, "create_custom_shader", { name: "Uniform Probe", shader: SHADER });
  const materialAssetId = material.materialAssetId as string;
  // Beside the starter Box, which sits at the origin.
  const boxId = (await write(page, "create_primitive", { shape: "box", materialAssetId, position: [-1.6, 0.5, 0] })).entityId as string;
  const terrainId = (await write(page, "create_terrain", { name: "Uniform Ground", materialAssetId, width: 2, depth: 2, resolution: 9, position: [1.8, 0.02, 0] })).entityId as string;
  const scriptAssetId = (await write(page, "create_script_asset", { name: "Uniform Probe", source: SCRIPT_SOURCE })).scriptAssetId as string;
  for (const [entityId, role] of [[boxId, "base"], [boxId, "top"], [terrainId, "clock"]] as const) {
    const component = await write(page, "add_component", { entityId, definitionId: "scripting.script", scriptAssetId });
    await write(page, "update_script_component", { entityId, componentId: component.componentId, properties: { role } });
  }
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const revision = (await call(page, "get_editor_context")).result!.revision;

  await write(page, "set_play_mode", { mode: "play" });
  const editor = await exerciseUniforms(page, "editor", boxId, terrainId, testInfo);
  // The refused call that was not caught reaches the Script Console, with the
  // uniform it was about, and the Script is stopped rather than left drawing.
  const runtime = (await call(page, "get_editor_context")).result!.scriptRuntime as {
    compileErrors: unknown[];
    failures: Array<{ phase: string; message: string; stopped: boolean; entityId: string }>;
  };
  expect(runtime.compileErrors).toEqual([]);
  expect(runtime.failures).toEqual([
    expect.objectContaining({
      entityId: terrainId,
      phase: "event",
      stopped: true,
      message: expect.stringMatching(/^ctx\.materials\.setUniform\("uGain"\): .*数値1個.*数値2個/),
    }),
  ]);
  const capture = await call(page, "capture_scene_view", {}, true);
  expect(capture.ok, JSON.stringify(capture)).toBe(true);
  const capturePath = testInfo.outputPath("uniforms-editor-capture.png");
  await writeFile(capturePath, Buffer.from((capture.result!.image as { data: string }).data, "base64"));
  await testInfo.attach("uniforms-editor-capture", { path: capturePath, contentType: "image/png" });

  // Stop puts the shared Material back on the Mesh, and nothing a Script
  // set was written to the Material or the Scene.
  await write(page, "set_play_mode", { mode: "edit" });
  await expect.poll(async () => (await drawn(page, "editor", boxId)).uniforms).toMatchObject({ uColor: [1, 1, 1], uGain: 1, uWalker: [0, 0, 0] });
  expect((await call(page, "get_custom_shader", { materialAssetId })).result!.shader).toMatchObject({ uniforms: SHADER.uniforms });
  expect((await call(page, "get_editor_context")).result!.revision).toBe(revision);
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__?.unhandledCommands ?? [])).toEqual([]);

  // The same saved project, through the compiler the publish flow calls.
  const compiled = await page.evaluate(async ({ fixture, name }) =>
    (await import(/* @vite-ignore */ fixture)).compileSavedProject(name), { fixture: FIXTURE, name: PROJECT_NAME });
  expect(compiled.canStage, JSON.stringify(compiled.diagnostics)).toBe(true);
  // Vite ignores test artifacts, so a path of its own keeps an earlier run's
  // transformed World from being served again.
  const directory = testInfo.outputPath(`published-${Date.now()}`);
  for (const file of compiled.overlayFiles as Array<{ relativePath: string; content: string }>) {
    const target = join(directory, file.relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }
  const baseUrl = `/${relative(process.cwd(), directory).replaceAll("\\", "/")}`;
  await page.evaluate(async ({ fixture, baseUrl }) =>
    (await import(/* @vite-ignore */ fixture)).mountPublishedWorld(baseUrl), { fixture: FIXTURE, baseUrl });
  const published = await exerciseUniforms(page, "published", boxId, terrainId, testInfo);
  expect(published.error).toBe(editor.error);
  expect(published.error).toMatch(/^ctx\.materials\.setUniform\("uWalker"\): .*数値3個.*数値2個/);
  await page.evaluate(async (fixture) => (await import(/* @vite-ignore */ fixture)).unmountPublishedWorld(), FIXTURE);
  expect(problems).toEqual([]);
});
