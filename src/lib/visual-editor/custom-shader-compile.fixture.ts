import { xriftShaderSourceKey } from "../../../packages/xrift-studio-runtime/src/shader-compile-errors";
import { createDefaultMaterialAsset, type MaterialAsset } from "./asset-manifest";
import { compileVisualProject } from "./compiler/compile";
import { BUILTIN_PRIMITIVE_CREATION_IDS } from "./creation-catalog";
import {
  MCP_CUSTOM_SHADER_COMPILE_WAIT_MS,
  MCP_SCENE_VIEW_WAIT_MS,
  checkCustomShaderForMcp,
  collectCustomShaderCompileLines,
  collectCustomShaderLinkMessages,
  createCustomShaderCompileStore,
  customShaderSourceKey,
  describeCustomShaderCompileForMcp,
  findCustomShaderMaterialsBySource,
  firstCustomShaderCompileMessage,
  listCustomShaderCompileErrors,
  resolveCustomShaderCompile,
  type CustomShaderCompileIssue,
  type CustomShaderCompileSnapshot,
} from "./custom-shader-compile";
import {
  createDefaultCustomShader,
  type ClassicR3fMaterialShader,
} from "./custom-shader-contract";
import {
  executeXriftMcpEditorTool,
  type XriftMcpEditorContext,
} from "./mcp-editor-tools";
import { createPrototypeProject } from "./prototype-project";
import { addBuiltinPrimitiveEntity } from "./scene-document";

const BROKEN_FRAGMENT = `uniform vec3 uColor;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(uColor * missingValue, 1.0);
}`;

const FIXED_FRAGMENT = `uniform vec3 uColor;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
}`;

function material(id: string, shader: ClassicR3fMaterialShader): MaterialAsset {
  const asset = createDefaultMaterialAsset({ id, name: `Material ${id}` });
  if (!asset) throw new Error("custom shader compile fixture: Material could not be created");
  return { ...asset, shader };
}

function brokenShader(): ClassicR3fMaterialShader {
  return { ...createDefaultCustomShader(), fragmentShader: BROKEN_FRAGMENT };
}

function failure(shader: ClassicR3fMaterialShader): CustomShaderCompileSnapshot {
  return {
    sourceKey: customShaderSourceKey(shader),
    status: "error",
    issues: [
      {
        origin: "check",
        variants: ["default"],
        programLog: "Fragment shader is not compiled.",
        vertexLog: "",
        fragmentLog: "ERROR: 0:61: 'missingValue' : undeclared identifier",
        lines: [
          {
            stage: "fragment",
            severity: "error",
            reportedLine: 61,
            line: 4,
            message: "'missingValue' : undeclared identifier",
            source: "gl_FragColor = vec4(uColor * missingValue, 1.0);",
          },
        ],
      },
    ],
  };
}

function success(shader: ClassicR3fMaterialShader): CustomShaderCompileSnapshot {
  return { sourceKey: customShaderSourceKey(shader), status: "ok", issues: [] };
}

/** Assertions for how a Custom Shader's compile result is stored, cleared and returned. */
export async function runCustomShaderCompileFixtureAssertions(): Promise<void> {
  assertSourceKey();
  assertResolve();
  assertReaders();
  await assertStore();
  await assertStoreOrdering();
  await assertMcpCheck();
  assertMcpTools();
  assertPublishedWorldNamesTheMaterial();
}

function assertSourceKey(): void {
  const shader = createDefaultCustomShader();
  const key = customShaderSourceKey(shader);
  assert(
    customShaderSourceKey({
      ...shader,
      uniforms: { ...shader.uniforms, uIntensity: { kind: "number", value: 4 } },
      animatedTimeUniform: undefined,
    }) === key,
    "a uniform value does not change what compiles, so it must keep the result",
  );
  assert(
    customShaderSourceKey({ ...shader, fragmentShader: `${shader.fragmentShader}\n` }) !== key,
    "edited GLSL must not keep the result of the old GLSL",
  );
  assert(
    customShaderSourceKey({
      ...shader,
      variants: [{ ...shader.variants[0]!, defines: { QUALITY: "2" } }],
    }) !== key,
    "a variant define changes the program, so it must not keep the result",
  );
  assert(
    typeof customShaderSourceKey({ kind: "classic-r3f" } as ClassicR3fMaterialShader) === "string",
    "a shader that is still being typed in must not throw",
  );
}

function assertResolve(): void {
  const shader = brokenShader();
  const failed = resolveCustomShaderCompile(failure(shader), shader);
  assert(
    failed.status === "error" && failed.issues.length === 1,
    "a result for the current GLSL is returned as it is",
  );
  const edited = resolveCustomShaderCompile(failure(shader), {
    ...shader,
    fragmentShader: FIXED_FRAGMENT,
  });
  assert(
    edited.status === "unknown" && edited.issues.length === 0 && edited.reason === "not-checked",
    "a result for GLSL that has since changed must read as unknown, not as an error",
  );
  assert(
    resolveCustomShaderCompile(undefined, shader).status === "unknown",
    "no result reads as unknown",
  );
  const lost = resolveCustomShaderCompile(
    { sourceKey: customShaderSourceKey(shader), status: "unavailable", issues: [], reason: "context-lost" },
    shader,
  );
  assert(
    lost.status === "unknown" && lost.reason === "context-lost",
    "a compile that could not run reads as unknown, with the reason",
  );
  assert(
    resolveCustomShaderCompile(success(shader), shader).status === "ok" &&
      resolveCustomShaderCompile(
        { sourceKey: customShaderSourceKey(shader), status: "pending", issues: [] },
        shader,
      ).status === "pending",
    "ok and pending are passed through",
  );

  const described = describeCustomShaderCompileForMcp(failed);
  assert(
    described.status === "error" &&
      described.renderer === "scene-view" &&
      Array.isArray(described.issues) &&
      described.issues.length === 1 &&
      String(described.nextStep).includes("update_custom_shader"),
    "an MCP client must get the issues and be told how to fix them",
  );
  assert(
    JSON.stringify(described).includes("ERROR: 0:61: 'missingValue' : undeclared identifier"),
    "the compiler's own log must reach the MCP client unchanged",
  );
  for (const state of [
    resolveCustomShaderCompile(success(shader), shader),
    resolveCustomShaderCompile(undefined, shader),
    lost,
    resolveCustomShaderCompile(
      { sourceKey: customShaderSourceKey(shader), status: "pending", issues: [] },
      shader,
    ),
  ]) {
    const result = describeCustomShaderCompileForMcp(state);
    assert(
      typeof result.nextStep === "string" && result.nextStep.length > 0 && Array.isArray(result.issues),
      `every compile status must say what to do next (${state.status})`,
    );
    JSON.parse(JSON.stringify(result));
  }
  assert(
    String(describeCustomShaderCompileForMcp(resolveCustomShaderCompile(undefined, shader)).nextStep).includes(
      "get_custom_shader",
    ),
    "an unknown result must name the tool that reads the outcome",
  );
}

function assertReaders(): void {
  const shader = brokenShader();
  const first = material("shader-a", shader);
  const second = material("shader-b", { ...shader, uniforms: {} });
  const other = material("shader-c", createDefaultCustomShader());
  const plain = createDefaultMaterialAsset({ id: "plain", name: "Plain" })!;
  const assets = {
    ...createPrototypeProject("world", "custom-shader-compile").assets,
  };
  assets.assets = {
    ...assets.assets,
    [first.id]: first,
    [second.id]: second,
    [other.id]: other,
    [plain.id]: plain,
  };

  const matched = findCustomShaderMaterialsBySource(assets, [
    { vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader },
  ]).map((asset) => asset.id);
  assert(
    matched.length === 2 && matched.includes("shader-a") && matched.includes("shader-b"),
    "every Material with the failed GLSL is found, because they share one program",
  );
  assert(
    findCustomShaderMaterialsBySource(assets, []).length === 0 &&
      findCustomShaderMaterialsBySource(assets, [
        { vertexShader: shader.vertexShader, fragmentShader: "void main() {}" },
      ]).length === 0,
    "a Material is only matched when both stages are the same",
  );

  const snapshots = {
    [first.id]: failure(shader),
    [other.id]: success(other.shader as ClassicR3fMaterialShader),
    // A result for GLSL this Material no longer has.
    [second.id]: failure({ ...shader, fragmentShader: `${BROKEN_FRAGMENT}\n// old` }),
    [plain.id]: failure(shader),
    "deleted-material": failure(shader),
  };
  const errors = listCustomShaderCompileErrors(assets, snapshots);
  assert(
    errors.length === 1 &&
      errors[0]?.materialAssetId === "shader-a" &&
      errors[0].materialName === "Material shader-a" &&
      errors[0].issueCount === 1 &&
      errors[0].message === "fragment:4: 'missingValue' : undeclared identifier",
    "only Materials whose current shader is known to fail are listed",
  );
  assert(
    listCustomShaderCompileErrors(assets, undefined).length === 0,
    "without a Scene View there is nothing to list",
  );

  const issue = failure(shader).issues[0]!;
  const repeated: CustomShaderCompileIssue[] = [
    issue,
    { ...issue, origin: "scene", instanced: true },
    {
      ...issue,
      variants: ["night"],
      lines: [
        { stage: "vertex", severity: "error", reportedLine: 70, line: 2, message: "'x' : syntax error" },
        { stage: "vertex", severity: "warning", reportedLine: 71, line: 3, message: "unused" },
      ],
    },
  ];
  const lines = collectCustomShaderCompileLines(repeated);
  assert(
    lines.length === 2 && lines[0]?.stage === "fragment" && lines[1]?.stage === "vertex",
    "the same message from several programs is shown once, and warnings are not errors",
  );
  assert(
    collectCustomShaderCompileLines(repeated, { stage: "vertex" }).length === 1,
    "a stage filter keeps that stage only",
  );
  const named = collectCustomShaderCompileLines(repeated, { nameVariants: true });
  assert(
    named.length === 2 && named[0]?.variants?.[0] === "default" && named[1]?.variants?.[0] === "night",
    "with several variants each message says which variants it belongs to",
  );

  const link: CustomShaderCompileIssue = {
    origin: "check",
    variants: ["default"],
    programLog: "FRAGMENT varying vMissing does not match any VERTEX varying\nsecond line",
    vertexLog: "",
    fragmentLog: "",
    lines: [],
  };
  assert(
    collectCustomShaderLinkMessages([issue, link, link]).length === 1 &&
      collectCustomShaderLinkMessages([issue]).length === 0,
    "a failure without a line is reported by its program log, once",
  );
  assert(
    firstCustomShaderCompileMessage([link]) ===
      "FRAGMENT varying vMissing does not match any VERTEX varying" &&
      firstCustomShaderCompileMessage([link, issue]) ===
        "fragment:4: 'missingValue' : undeclared identifier" &&
      firstCustomShaderCompileMessage([]) === "",
    "the summary prefers a message with a line, then the first line of a log",
  );
}

async function assertStore(): Promise<void> {
  const store = createCustomShaderCompileStore();
  const shader = brokenShader();
  const asset = material("shader-a", shader);
  // Read through functions: the counts change between the checks below.
  const seen = { notified: 0, calls: 0 };
  const notifications = () => seen.notified;
  const compiles = () => seen.calls;
  const unsubscribe = store.subscribe(() => {
    seen.notified += 1;
  });

  const empty = store.getSnapshots();
  assert(
    Object.keys(empty).length === 0 && store.getSnapshots() === empty && !store.hasChecker(),
    "an empty store returns the same object until something changes",
  );
  const noSceneView = await store.check(asset);
  assert(
    noSceneView.status === "unavailable" &&
      noSceneView.reason === "no-scene-view" &&
      store.get(asset.id) === undefined,
    "without a Scene View a check answers at once, and records nothing",
  );
  store.request(asset);

  let outcome: CustomShaderCompileSnapshot = failure(shader);
  const release = store.setChecker(async () => {
    seen.calls += 1;
    return outcome;
  });
  assert(store.hasChecker() && notifications() === 1, "a Scene View arriving is announced to readers");

  const [first, second] = await Promise.all([store.check(asset), store.check(asset)]);
  assert(
    compiles() === 1 && first === second && first.status === "error",
    "two readers asking for the same GLSL share one compile",
  );
  assert(
    store.get(asset.id) === first && store.getSnapshots()[asset.id] === first && notifications() === 2,
    "the result is stored for the Material and readers are told",
  );
  const stored = store.getSnapshots();
  assert(store.getSnapshots() === stored, "an unchanged store keeps returning the same object");

  store.request(asset);
  await settle();
  assert(compiles() === 2, "a failure is compiled again when a reader asks for it");

  const fixed = { ...asset, shader: { ...shader, fragmentShader: FIXED_FRAGMENT } };
  assert(
    resolveCustomShaderCompile(store.get(asset.id), fixed.shader).status === "unknown",
    "once the GLSL changes the stored failure no longer applies, before any new compile",
  );
  outcome = success(fixed.shader);
  const checked = await store.check(fixed);
  assert(
    checked.status === "ok" &&
      resolveCustomShaderCompile(store.get(asset.id), fixed.shader).status === "ok" &&
      compiles() === 3,
    "the fixed GLSL is compiled and its result replaces the failure",
  );
  store.request(fixed);
  await settle();
  assert(compiles() === 3, "GLSL that compiled is not compiled again for the same source");

  const invalid = material("shader-invalid", { ...shader, fragmentShader: "no entry point" });
  const refused = await store.check(invalid);
  assert(
    refused.status === "unavailable" && refused.reason === "invalid-shader" && compiles() === 3,
    "a shader that fails validation is never handed to the renderer",
  );
  const plain = createDefaultMaterialAsset({ id: "plain", name: "Plain" })!;
  assert(
    (await store.check(plain)).reason === "invalid-shader" && compiles() === 3,
    "a Material without a Custom Shader is not compiled",
  );

  release();
  assert(
    !store.hasChecker() && Object.keys(store.getSnapshots()).length === 0,
    "results describe one renderer, so they go when its Scene View goes",
  );
  assert(
    (await store.check(asset)).reason === "no-scene-view",
    "after the Scene View has gone a check answers at once again",
  );

  const rejecting = createCustomShaderCompileStore();
  rejecting.setChecker(() => Promise.reject(new Error("renderer failed")));
  const failedCheck = await rejecting.check(asset);
  assert(
    failedCheck.status === "unavailable" && rejecting.get(asset.id) === undefined,
    "a compile that throws is unavailable, never a false success",
  );
  unsubscribe();
}

async function assertStoreOrdering(): Promise<void> {
  const store = createCustomShaderCompileStore();
  const broken = brokenShader();
  const asset = material("shader-a", broken);
  const fixed = { ...asset, shader: { ...broken, fragmentShader: FIXED_FRAGMENT } };
  const pending = new Map<string, (snapshot: CustomShaderCompileSnapshot) => void>();
  store.setChecker(
    (candidate) =>
      new Promise((resolve) => {
        pending.set(customShaderSourceKey(candidate.shader as ClassicR3fMaterialShader), resolve);
      }),
  );

  // The driver is slower than the reader is willing to wait.
  const waited = await store.check(asset, { waitMs: 5 });
  assert(
    waited.status === "pending" && store.get(asset.id) === undefined,
    "a reader that stops waiting gets pending, and nothing false is stored",
  );
  const slow = store.check(asset);
  // The author fixes the GLSL while the old compile is still running.
  const quick = store.check(fixed);
  pending.get(customShaderSourceKey(fixed.shader))!(success(fixed.shader));
  await quick;
  assert(store.get(asset.id)?.status === "ok", "the newer GLSL's result is stored");
  pending.get(customShaderSourceKey(broken))!(failure(broken));
  const late = await slow;
  assert(
    late.status === "error" && store.get(asset.id)?.status === "ok",
    "a compile of replaced GLSL finishing late must not overwrite the newer result",
  );

  // Undo: the Material has the broken GLSL again while its compile is running.
  const again = store.check(asset);
  const joined = store.check(asset, { waitMs: 1_000 });
  pending.get(customShaderSourceKey(broken))!(failure(broken));
  assert(
    (await again).status === "error" &&
      (await joined).status === "error" &&
      store.get(asset.id)?.status === "error",
    "the result of the GLSL the Material has now is the one that is stored",
  );

  // A new Scene View takes over; the old one's compile must not reach the store.
  const orphan = store.check(fixed);
  const orphanResolve = pending.get(customShaderSourceKey(fixed.shader))!;
  const replaced = createFakeChecker(success(fixed.shader));
  store.setChecker(replaced.checker);
  assert(Object.keys(store.getSnapshots()).length === 0, "a new Scene View starts without results");
  orphanResolve(failure(fixed.shader));
  await orphan;
  assert(store.get(asset.id) === undefined, "the previous renderer's result is dropped");
  assert(
    (await store.check(fixed)).status === "ok" && replaced.calls() === 1,
    "the same GLSL is compiled afresh by the new Scene View",
  );
}

function createFakeChecker(snapshot: CustomShaderCompileSnapshot) {
  let calls = 0;
  return {
    checker: async () => {
      calls += 1;
      return snapshot;
    },
    calls: () => calls,
  };
}

async function assertMcpCheck(): Promise<void> {
  const shader = brokenShader();
  const asset = material("shader-a", shader);
  const plain = createDefaultMaterialAsset({ id: "plain", name: "Plain" })!;
  const assets = { ...createPrototypeProject("world", "custom-shader-mcp").assets };
  assets.assets = { ...assets.assets, [asset.id]: asset, [plain.id]: plain };
  const store = createCustomShaderCompileStore();

  assert(
    (await checkCustomShaderForMcp(assets, "missing", { store })) === null &&
      (await checkCustomShaderForMcp(assets, plain.id, { store })) === null &&
      (await checkCustomShaderForMcp(assets, 12, { store })) === null,
    "only a Material with a Custom Shader is compiled for a tool",
  );
  const waitedFrom = Date.now();
  const withoutSceneView = await checkCustomShaderForMcp(assets, asset.id, {
    store,
    sceneViewWaitMs: 30,
  });
  assert(
    withoutSceneView?.compile.status === "unknown" &&
      withoutSceneView.compile.reason === "no-scene-view" &&
      String(withoutSceneView.compile.nextStep).includes("get_custom_shader"),
    "without a Scene View the tool says so and how to read the outcome later",
  );
  assert(
    Date.now() - waitedFrom < 2_000 && MCP_SCENE_VIEW_WAIT_MS <= 5_000,
    "the wait for a Scene View is bounded",
  );

  // The client wrote the shader while the Editor was still mounting its Scene View.
  const mounting = createCustomShaderCompileStore();
  const early = checkCustomShaderForMcp(assets, asset.id, { store: mounting, sceneViewWaitMs: 2_000 });
  setTimeout(() => mounting.setChecker(async () => failure(shader)), 10);
  assert(
    (await early)?.compile.status === "error",
    "a Scene View that appears during the wait compiles the shader",
  );
  assert(
    (await mounting.whenCheckerReady(1)) === true &&
      (await createCustomShaderCompileStore().whenCheckerReady(1)) === false,
    "waiting for a Scene View answers at once when there is one, and gives up when there is none",
  );

  let resolveSlow: ((snapshot: CustomShaderCompileSnapshot) => void) | undefined;
  store.setChecker(
    () =>
      new Promise((resolve) => {
        resolveSlow = resolve;
      }),
  );
  const startedAt = Date.now();
  const slow = await checkCustomShaderForMcp(assets, asset.id, { store, waitMs: 20 });
  assert(
    slow?.compile.status === "pending" && Date.now() - startedAt < 2_000,
    "a tool never waits longer than its limit for the driver",
  );
  resolveSlow?.(failure(shader));
  await settle();
  const afterwards = await checkCustomShaderForMcp(assets, asset.id, { store, waitMs: 20 });
  assert(
    afterwards?.compile.status === "pending" && store.get(asset.id)?.status === "error",
    "the compile carries on after the tool answered, and its result is stored",
  );
  assert(
    MCP_CUSTOM_SHADER_COMPILE_WAIT_MS >= 1_000 && MCP_CUSTOM_SHADER_COMPILE_WAIT_MS <= 10_000,
    "the default wait covers a normal compile and stays far below the MCP request timeout",
  );

  const answering = createCustomShaderCompileStore();
  answering.setChecker(async () => failure(shader));
  const failed = await checkCustomShaderForMcp(assets, asset.id, { store: answering });
  assert(
    failed?.materialAssetId === asset.id &&
      failed.snapshot.status === "error" &&
      failed.compile.status === "error" &&
      (failed.compile.issues as CustomShaderCompileIssue[])[0]?.lines[0]?.line === 4,
    "a failed compile reaches the tool with the author's line",
  );
}

function assertMcpTools(): void {
  const bundle = createPrototypeProject("world", "custom-shader-mcp-tools");
  let context: XriftMcpEditorContext = {
    bundle,
    sceneSelection: null,
    assetSelection: null,
    editorMode: "edit",
    importBusy: false,
    revision: 1,
    saveStatus: "saved",
  };
  const write = (tool: "create_custom_shader" | "update_custom_shader", args: Record<string, unknown>) => {
    const outcome = executeXriftMcpEditorTool(context, {
      id: `fixture-${tool}`,
      tool,
      arguments: {
        projectId: context.bundle.project.projectId,
        sceneId: context.bundle.scene.sceneId,
        expectedRevision: context.revision,
        ...args,
      },
    });
    if (outcome.changed) {
      context = { ...context, bundle: outcome.bundle, revision: context.revision + 1 };
    }
    return outcome;
  };
  const read = (tool: "get_custom_shader" | "get_editor_context", args: Record<string, unknown> = {}) =>
    executeXriftMcpEditorTool(context, { id: `fixture-${tool}`, tool, arguments: args }).result;

  const created = write("create_custom_shader", {
    name: "Broken",
    shader: { fragmentShader: BROKEN_FRAGMENT },
  });
  const materialAssetId = String(created.result.materialAssetId);
  assert(
    created.changed && (created.result.compile as { status?: string }).status === "unknown",
    "create_custom_shader saves GLSL that validation accepts, and reports it as not compiled yet",
  );
  assert(
    (read("get_custom_shader", { materialAssetId }).compile as { status?: string }).status === "unknown" &&
      (read("get_editor_context").customShaderErrors as unknown[]).length === 0,
    "with no Scene View result nothing is claimed either way",
  );

  // The Editor compiles the shader and puts the outcome into the context.
  const shader = context.bundle.assets.assets[materialAssetId];
  if (shader?.kind !== "material" || shader.shader?.kind !== "classic-r3f") {
    throw new Error("custom shader compile fixture: created Material has no Custom Shader");
  }
  context = { ...context, customShaderCompile: { [materialAssetId]: failure(shader.shader) } };
  const failed = read("get_custom_shader", { materialAssetId }).compile as {
    status: string;
    issues: CustomShaderCompileIssue[];
    nextStep: string;
  };
  assert(
    failed.status === "error" &&
      failed.issues[0]?.fragmentLog === "ERROR: 0:61: 'missingValue' : undeclared identifier" &&
      failed.issues[0].lines[0]?.line === 4 &&
      failed.issues[0].lines[0].reportedLine === 61,
    "get_custom_shader returns the compiler's log with both line numbers",
  );
  const listed = read("get_editor_context").customShaderErrors as Array<Record<string, unknown>>;
  assert(
    listed.length === 1 &&
      listed[0]?.materialAssetId === materialAssetId &&
      listed[0].materialName === "Broken" &&
      listed[0].message === "fragment:4: 'missingValue' : undeclared identifier",
    "get_editor_context lists the Material that does not compile",
  );
  const unchanged = write("update_custom_shader", {
    materialAssetId,
    patch: { fragmentShader: BROKEN_FRAGMENT },
  });
  assert(
    !unchanged.changed && (unchanged.result.compile as { status?: string }).status === "error",
    "re-sending the same GLSL reports the failure that is already known",
  );
  const tuned = write("update_custom_shader", {
    materialAssetId,
    patch: { uniforms: { uColor: { kind: "color", value: "#00ff00" } } },
  });
  assert(
    tuned.changed && (tuned.result.compile as { status?: string }).status === "error",
    "changing a uniform value does not hide a GLSL error",
  );

  const fixed = write("update_custom_shader", {
    materialAssetId,
    patch: { fragmentShader: FIXED_FRAGMENT },
  });
  assert(
    fixed.changed && (fixed.result.compile as { status?: string }).status === "unknown",
    "after the GLSL is replaced the old failure is not reported for the new GLSL",
  );
  assert(
    (read("get_custom_shader", { materialAssetId }).compile as { status?: string }).status === "unknown" &&
      (read("get_editor_context").customShaderErrors as unknown[]).length === 0,
    "the failure clears everywhere once the Material's GLSL changes",
  );

  const fixedShader = context.bundle.assets.assets[materialAssetId];
  if (fixedShader?.kind !== "material" || fixedShader.shader?.kind !== "classic-r3f") {
    throw new Error("custom shader compile fixture: updated Material lost its Custom Shader");
  }
  context = { ...context, customShaderCompile: { [materialAssetId]: success(fixedShader.shader) } };
  const compiled = read("get_custom_shader", { materialAssetId }).compile as {
    status: string;
    issues: unknown[];
  };
  assert(
    compiled.status === "ok" && compiled.issues.length === 0,
    "a shader the Scene View compiled is reported as ok",
  );
}

/**
 * A published world has no Inspector, so a Custom Shader that does not compile
 * there is named in the console by the same reader the editor uses.
 */
function assertPublishedWorldNamesTheMaterial(): void {
  const prototype = createPrototypeProject("world", "custom-shader-published");
  const withoutShader = compileVisualProject({
    project: prototype.project,
    scenes: { [prototype.scene.sceneId]: prototype.scene },
    assets: prototype.assets,
    prefabs: prototype.prefabs,
  });
  const entryOf = (result: ReturnType<typeof compileVisualProject>) =>
    result.overlayFiles.find((file) => file.relativePath === "src/World.tsx")?.content ?? "";
  const pathsOf = (result: ReturnType<typeof compileVisualProject>) =>
    result.overlayFiles.map((file) => file.relativePath);
  assert(
    !entryOf(withoutShader).includes("XriftCustomShaderErrorLog") &&
      !pathsOf(withoutShader).some((path) => path.includes("shader-compile")),
    "a world without a Custom Shader must not carry the reader",
  );

  const shader = brokenShader();
  const asset = { ...material("published-shader", shader), name: "Glow 板" };
  const unused = material("published-unused", createDefaultCustomShader());
  const assets = {
    ...prototype.assets,
    assets: { ...prototype.assets.assets, [asset.id]: asset, [unused.id]: unused },
  };
  const placed = addBuiltinPrimitiveEntity(
    prototype.scene,
    assets,
    BUILTIN_PRIMITIVE_CREATION_IDS.plane,
    asset.id,
  );
  if (!placed) throw new Error("custom shader compile fixture: could not place a plane");
  const documents = {
    project: prototype.project,
    scenes: { [placed.scene.sceneId]: placed.scene },
    assets,
    prefabs: prototype.prefabs,
  };
  const compiled = compileVisualProject(documents);
  const entry = entryOf(compiled);
  const key = xriftShaderSourceKey(shader.vertexShader, shader.fragmentShader);
  assert(
    entry.includes('import { XriftCustomShaderErrorLog } from "./xrift-studio/shader-compile-watch";') &&
      entry.includes("<XriftCustomShaderErrorLog materials={CUSTOM_SHADER_MATERIAL_NAMES} />"),
    "a world with a Custom Shader must mount the reader",
  );
  assert(
    entry.includes(`const CUSTOM_SHADER_MATERIAL_NAMES = ${JSON.stringify([{ name: "Glow 板", key }])};`),
    "the reader is given the name of each Material the world draws, by the key of its GLSL, and no others",
  );
  // The GLSL travels in the Material's descriptor, and the shared builder
  // hands it to three.js as it is.
  assert(
    entry.includes(`"vertexShader":${JSON.stringify(shader.vertexShader)}`) &&
      entry.includes(`"fragmentShader":${JSON.stringify(shader.fragmentShader)}`),
    "the world must compile the author's GLSL unchanged, which is what the key is computed from",
  );
  const watch = compiled.overlayFiles.find(
    (file) => file.relativePath === "src/xrift-studio/shader-compile-watch.tsx",
  );
  const errors = compiled.overlayFiles.find(
    (file) => file.relativePath === "src/xrift-studio/shader-compile-errors.ts",
  );
  assert(
    watch !== undefined &&
      watch.content.includes('from "./shader-compile-errors"') &&
      !watch.content.includes("shader-compile-errors.js") &&
      watch.content.includes("console.error("),
    "the reader ships as source the world can import, and reports to the console",
  );
  assert(
    errors !== undefined && errors.content.includes("export function xriftShaderSourceKey("),
    "the key the world computes comes from the same source the compiler used",
  );

  const runtimeOnly = compileVisualProject(documents, { outputMode: "classic-runtime" });
  assert(
    !pathsOf(runtimeOnly).some((path) => path.includes("shader-compile")),
    "the runtime package output names its Materials itself and carries no second reader",
  );
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`custom shader compile fixture: ${message}`);
}
