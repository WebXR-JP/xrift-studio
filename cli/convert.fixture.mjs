import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { convertVisualProject, ConvertError } from "./convert.mjs";
import { createPrototypeProject } from "../src/lib/visual-editor/prototype-project.ts";
import {
  assetManifestCodec,
  sceneDocumentCodec,
  visualProjectDocumentCodec,
} from "../src/lib/visual-editor/serialization.ts";
import { XriftThreeLoader } from "../packages/xrift-studio-runtime/src/three/index.ts";
import { runStarterTemplateFixtureAssertions } from "../src/lib/visual-editor/starter-templates.fixture.ts";
import { createStarterWorldProject } from "../src/lib/visual-editor/starter-templates.ts";
import { prepareStarterVisualProject } from "../src/lib/visual-editor/persistence.ts";
import { runVisualCompilerFixtureAssertions } from "../src/lib/visual-editor/compiler/fixture.ts";
import { compileStagedTypecheckWorld } from "../src/lib/visual-editor/compiler/staged-world.fixture.ts";
import { runClassicExportFixtureAssertions } from "../src/lib/visual-editor/classic-export.fixture.ts";
import { runComponentCodeImportFixtureAssertions } from "../src/lib/visual-editor/component-code-import.fixture.ts";
import { runXriftMcpEditorToolFixtures } from "../src/lib/visual-editor/mcp-editor-tools.fixture.ts";
import { runPlaySessionFixtureAssertions } from "../src/lib/visual-editor/play-session.fixture.ts";
import { runScriptSpecifierFixtureAssertions } from "../src/lib/visual-editor/scripting/specifiers.fixture.ts";
import { runScriptTemplateFixtureAssertions } from "../src/lib/visual-editor/scripting/script-templates.fixture.ts";
import { runScriptPropsFixtureAssertions } from "../src/lib/visual-editor/scripting/script-props.fixture.ts";
import { runParticleRuntimeFixtureAssertions } from "../src/lib/visual-editor/scripting/particle-runtime.fixture.ts";
import { runScriptLifecycleFixtureAssertions } from "../src/lib/visual-editor/scripting/lifecycle.fixture.ts";
import { runScriptAudioFixtureAssertions } from "../src/lib/visual-editor/scripting/audio-runtime.fixture.ts";
import { runAudioSourceRuntimeFixtureAssertions } from "../packages/xrift-studio-runtime/src/script/audio-source.fixture.ts";
import { runRuntimeSchemaFixtureAssertions } from "../packages/xrift-studio-runtime/src/schema.fixture.ts";
import { runShaderTimeFixtureAssertions } from "../packages/xrift-studio-runtime/src/shader-time.fixture.ts";
import { runScriptAudioSourceHostFixtureAssertions } from "../packages/xrift-studio-runtime/src/script/audio-source-host.fixture.ts";
import { runLightRuntimeFixtureAssertions } from "../packages/xrift-studio-runtime/src/script/light.fixture.ts";
import { runScriptMaterialTextureFixtureAssertions } from "../packages/xrift-studio-runtime/src/script/material-texture.fixture.ts";
import { runScriptTrustFixtureAssertions } from "../src/lib/visual-editor/scripting/script-trust.fixture.ts";
import { runScriptRuntimeReportFixtureAssertions } from "../src/lib/visual-editor/scripting/runtime-report.fixture.ts";
import { runScriptEmitFixtureAssertions } from "../src/lib/visual-editor/compiler/script-emit.fixture.ts";
import { runBasisTranscoderFixtureAssertions } from "../src/lib/visual-editor/basis-transcoder.fixture.ts";
import { runTerrainFixtureAssertions } from "../src/lib/visual-editor/terrain.fixture.ts";
import {
  runTerrainGrassFixtureAssertions,
  runTerrainGrassPublishFixtureAssertions,
  runTerrainPresetFixtureAssertions,
} from "../src/lib/visual-editor/terrain-grass.fixture.ts";
import { runTerrainSurfaceFixtureAssertions } from "../src/lib/visual-editor/terrain-surface.fixture.ts";
import { runAssetOperationLockFixtureAssertions } from "../src/components/visual-editor/asset-operation-lock.fixture.ts";
import { runAutosaveCoordinatorFixtureAssertions } from "../src/components/visual-editor/autosave-coordinator.fixture.ts";
import { runCustomMaterialPreviewFixtureAssertions } from "../src/components/visual-editor/CustomMaterialPreview.fixture.ts";
import { runEditorDragDataFixture } from "../src/components/visual-editor/editor-drag-data.fixture.ts";
import { runEditorLayoutFixtureAssertions } from "../src/components/visual-editor/editor-layout.fixture.ts";
import { runEditorLibraryDragFixture } from "../src/components/visual-editor/editor-library-drag.fixture.ts";
import { runMaterialDragFixtureAssertions } from "../src/components/visual-editor/material-drag.fixture.ts";
import { runProjectModelMaterialPreviewFixtureAssertions } from "../src/components/visual-editor/ProjectModelVisual.fixture.ts";
import { runScriptExecutionScopeFixtureAssertions } from "../src/components/visual-editor/script-execution-scope.fixture.ts";
import { runAudioImportFixtureAssertions } from "../src/lib/visual-editor/audio-import.fixture.ts";
import { runBuiltinPrefabCatalogFixtureAssertions } from "../src/lib/visual-editor/builtin-prefab-catalog.fixture.ts";
import { runClassicProjectImportFixtureAssertions } from "../src/lib/visual-editor/classic-project-import.fixture.ts";
import { runMaterialExtensionFixtureAssertions } from "../src/lib/visual-editor/compiler/material-extensions.fixture.ts";
import { runXriftComponentRegistryFixtureAssertions } from "../src/lib/visual-editor/compiler/xrift-component-registry.fixture.ts";
import { runDocumentAssetCreationFixtureAssertions } from "../src/lib/visual-editor/document-asset-creation.fixture.ts";
import { runEditorSessionHierarchyFixtureAssertions } from "../src/lib/visual-editor/editor-session.fixture.ts";
import { runGltfDerivedAssetFixtureAssertions } from "../src/lib/visual-editor/gltf-derived-assets.fixture.ts";
import { runModelCompanionBatchFixtureAssertions } from "../src/lib/visual-editor/model-companion-batch.fixture.ts";
import { runModelHierarchyFixtureAssertions } from "../src/lib/visual-editor/model-hierarchy.fixture.ts";
import { runModelImportContractFixtureAssertions } from "../src/lib/visual-editor/model-import-contract.fixture.ts";
import { runModelReimportImpactFixtureAssertions } from "../src/lib/visual-editor/model-reimport-impact.fixture.ts";
import { runOpenBrushFixtureAssertions } from "../src/lib/visual-editor/open-brush.fixture.ts";
import { runVisualPublishFixtureAssertions } from "../src/lib/visual-editor/publish.fixture.ts";
import { runSupportReportFixtureAssertions } from "../src/lib/support-report.fixture.ts";
import { runGlowMaterialCatalogFixtureAssertions } from "../src/lib/visual-editor/glow-material-catalog.fixture.ts";
import { runPrefabSourceDetachFixtureAssertions } from "../src/lib/visual-editor/prefab-source-detach.fixture.ts";
import { runLightingContractFixtureAssertions } from "../src/lib/visual-editor/lighting-contract.fixture.ts";
import { runMaterialAlphaFixtureAssertions } from "../src/lib/visual-editor/material-alpha.fixture.ts";
import { runInteractivityRecipeFixtureAssertions } from "../src/lib/visual-editor/interactivity-recipes.fixture.ts";
import { runVisualUploadFixtureAssertions } from "../src/lib/visual-editor/upload.fixture.ts";
import { runRuntimeSpawnFixtureAssertions } from "../src/lib/visual-editor/runtime-spawn.fixture.ts";
import { runSkyboxImportFixtureAssertions } from "../src/lib/visual-editor/skybox-import.fixture.ts";
import { runSkyShaderFixtureAssertions } from "../src/lib/visual-editor/sky-shader.fixture.ts";
import { runSceneSettingsCompatFixtureAssertions } from "../src/lib/visual-editor/scene-settings-compat.fixture.ts";
import { runGizmoSnapFixtureAssertions } from "../src/lib/visual-editor/gizmo-snap.fixture.ts";
import { runWindContractFixtureAssertions } from "../src/lib/visual-editor/wind-contract.fixture.ts";
import { runWaterShaderFixtureAssertions } from "../src/lib/visual-editor/water-shader.fixture.ts";
import { runUnityPackageImportFixture } from "../src/lib/visual-editor/unity-package-import.fixture.ts";

// Asset import runs in the Tauri webview, so it uses the browser file APIs.  Node
// already provides Blob, fetch and URL.createObjectURL, but not these two, and
// without them the import fixtures fail on the environment instead of the
// contract they assert.  These shims only exist for the fixture process.
//
// Three.js reports FileLoader download progress with a DOM ProgressEvent fired
// from a stream callback rather than the awaited promise, so a missing global
// escapes as an uncaught exception that no fixture suite can attribute.
if (typeof globalThis.ProgressEvent === "undefined") {
  globalThis.ProgressEvent = class ProgressEvent extends Event {
    constructor(type, init = {}) {
      super(type, init);
      this.lengthComputable = init.lengthComputable ?? false;
      this.loaded = init.loaded ?? 0;
      this.total = init.total ?? 0;
    }
  };
}

// GLTFExporter reads results through `onloadend`, while the Studio import code
// listens with `addEventListener`, so both delivery styles have to work.
if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader extends EventTarget {
    constructor() {
      super();
      this.result = null;
      this.error = null;
      this.onload = null;
      this.onloadend = null;
      this.onerror = null;
    }

    readAsArrayBuffer(blob) {
      this.#read(blob, (source) => source.arrayBuffer());
    }

    readAsText(blob) {
      this.#read(blob, (source) => source.text());
    }

    readAsDataURL(blob) {
      this.#read(blob, async (source) => {
        const base64 = Buffer.from(await source.arrayBuffer()).toString("base64");
        return `data:${source.type || "application/octet-stream"};base64,${base64}`;
      });
    }

    #read(blob, decode) {
      Promise.resolve()
        .then(() => decode(blob))
        .then((result) => {
          this.result = result;
          this.#emit("load");
        })
        .catch((cause) => {
          this.error = cause instanceof Error ? cause : new Error(String(cause));
          this.#emit("error");
        })
        .finally(() => this.#emit("loadend"));
    }

    #emit(type) {
      const event = new Event(type);
      this[`on${type}`]?.call(this, event);
      this.dispatchEvent(event);
    }
  };
}

const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "xrift-studio-convert-"));
const previousXriftBin = process.env.XRIFT_STUDIO_XRIFT_BIN;
try {
  const visualRoot = path.join(fixtureRoot, "visual-world");
  const classicRoot = path.join(fixtureRoot, "classic-world");
  const prototype = createPrototypeProject("world", "Runtime Fixture");
  await mkdir(path.join(visualRoot, "scenes"), { recursive: true });
  await mkdir(path.join(visualRoot, "assets"), { recursive: true });
  await mkdir(path.join(visualRoot, "public"), { recursive: true });
  await writeFile(
    path.join(visualRoot, "xrift-studio.project.json"),
    visualProjectDocumentCodec.serialize(prototype.project),
  );
  await writeFile(
    path.join(visualRoot, "scenes", "main.scene.json"),
    sceneDocumentCodec.serialize(prototype.scene),
  );
  await writeFile(
    path.join(visualRoot, "assets", "assets.json"),
    assetManifestCodec.serialize(prototype.assets),
  );
  await writeFile(path.join(visualRoot, "public", "thumbnail.png"), "thumbnail");

  process.env.XRIFT_STUDIO_XRIFT_BIN = await createFakeXrift(fixtureRoot);
  const dryRun = await convertVisualProject({
    source: visualRoot,
    out: classicRoot,
    dryRun: true,
    update: false,
    cliVersion: "fixture",
  });
  assert(dryRun.status === "ready", `dry-run must report a writable export, got ${dryRun.status}: ${JSON.stringify(dryRun.diagnostics ?? dryRun).slice(0, 400)}`);
  assert(
    dryRun.plannedFiles.includes("public/xrift/runtime.json"),
    "dry-run must include Runtime JSON",
  );

  const converted = await convertVisualProject({
    source: visualRoot,
    out: classicRoot,
    dryRun: false,
    update: false,
    cliVersion: "fixture",
  });
  assert(converted.status === "succeeded", "convert must succeed");
  const runtime = JSON.parse(
    await readFile(path.join(classicRoot, "public", "xrift", "runtime.json"), "utf8"),
  );
  assert(runtime.format === "xrift-studio.runtime", "runtime format is incorrect");
  const loaded = await new XriftThreeLoader().parse(runtime);
  assert(loaded.entities.size === 4, "Three loader did not create all fixture entities");
  const worldSource = await readFile(path.join(classicRoot, "src", "World.tsx"), "utf8");
  assert(
    worldSource.includes("xrift-studio-runtime/react-three-fiber") &&
      worldSource.includes('/xrift/runtime.json') &&
      worldSource.includes("export interface WorldProps") &&
      worldSource.includes("<group position={position} scale={scale}>"),
    "Classic adapter is not using xrift-studio-runtime",
  );
  const packageJson = JSON.parse(
    await readFile(path.join(classicRoot, "package.json"), "utf8"),
  );
  assert(
    packageJson.dependencies?.["xrift-studio-runtime"] === "0.1.0",
    "Classic package is missing the runtime dependency",
  );

  const updated = await convertVisualProject({
    source: visualRoot,
    out: classicRoot,
    dryRun: false,
    update: true,
    cliVersion: "fixture",
  });
  assert(updated.status === "succeeded", "owned export update must succeed");

  await writeFile(path.join(classicRoot, "src", "World.tsx"), "// user edit\n");
  let modifiedRejected = false;
  try {
    await convertVisualProject({
      source: visualRoot,
      out: classicRoot,
      dryRun: true,
      update: true,
      cliVersion: "fixture",
    });
  } catch (error) {
    modifiedRejected =
      error instanceof ConvertError && error.code === "update-file-modified";
  }
  assert(modifiedRejected, "--update must reject a modified Classic export");
  await runFixtureSuites([
    ["visual compiler", runVisualCompilerFixtureAssertions],
    ["terrain", runTerrainFixtureAssertions],
    ["terrain grass", runTerrainGrassFixtureAssertions],
    ["terrain presets", runTerrainPresetFixtureAssertions],
    ["terrain grass publish", runTerrainGrassPublishFixtureAssertions],
    ["terrain surface", runTerrainSurfaceFixtureAssertions],
    ["runtime schema", runRuntimeSchemaFixtureAssertions],
    ["shader time", runShaderTimeFixtureAssertions],
    ["mcp editor tools", runXriftMcpEditorToolFixtures],
    ["play session", runPlaySessionFixtureAssertions],
    ["script specifiers", runScriptSpecifierFixtureAssertions],
    ["script templates", runScriptTemplateFixtureAssertions],
    ["script props", runScriptPropsFixtureAssertions],
    ["particle runtime", runParticleRuntimeFixtureAssertions],
    ["script lifecycle", runScriptLifecycleFixtureAssertions],
    ["script audio", runScriptAudioFixtureAssertions],
    ["audio source runtime", runAudioSourceRuntimeFixtureAssertions],
    ["script audio source host", runScriptAudioSourceHostFixtureAssertions],
    ["light runtime", runLightRuntimeFixtureAssertions],
    ["script material texture", runScriptMaterialTextureFixtureAssertions],
    ["script trust", runScriptTrustFixtureAssertions],
    ["script runtime report", runScriptRuntimeReportFixtureAssertions],
    ["script emit", runScriptEmitFixtureAssertions],
    ["basis transcoder", runBasisTranscoderFixtureAssertions],
    ["starter templates", runStarterTemplateFixtureAssertions],
    ["prepared official starter", verifyPreparedOfficialStarter],
    ["component code import", runComponentCodeImportFixtureAssertions],
    ["classic export", runClassicExportFixtureAssertions],
    ["xrift component registry", runXriftComponentRegistryFixtureAssertions],
    ["material extensions", runMaterialExtensionFixtureAssertions],
    ["builtin prefab catalog", runBuiltinPrefabCatalogFixtureAssertions],
    ["document asset creation", runDocumentAssetCreationFixtureAssertions],
    ["editor session hierarchy", runEditorSessionHierarchyFixtureAssertions],
    ["editor layout", runEditorLayoutFixtureAssertions],
    ["script execution scope", runScriptExecutionScopeFixtureAssertions],
    ["model hierarchy", runModelHierarchyFixtureAssertions],
    ["model reimport impact", runModelReimportImpactFixtureAssertions],
    ["open brush", runOpenBrushFixtureAssertions],
    ["runtime spawn", runRuntimeSpawnFixtureAssertions],
    ["visual publish", runVisualPublishFixtureAssertions],
    ["support report", runSupportReportFixtureAssertions],
    ["glow material catalog", runGlowMaterialCatalogFixtureAssertions],
    ["prefab source detach", runPrefabSourceDetachFixtureAssertions],
    ["lighting contract", runLightingContractFixtureAssertions],
    ["material alpha", runMaterialAlphaFixtureAssertions],
    ["interactivity recipes", runInteractivityRecipeFixtureAssertions],
    ["visual upload branch", runVisualUploadFixtureAssertions],
    ["classic project import", runClassicProjectImportFixtureAssertions],
    ["asset operation lock", runAssetOperationLockFixtureAssertions],
    ["audio import", runAudioImportFixtureAssertions],
    ["autosave coordinator", runAutosaveCoordinatorFixtureAssertions],
    ["gltf derived assets", runGltfDerivedAssetFixtureAssertions],
    ["model companion batch", runModelCompanionBatchFixtureAssertions],
    ["model import contract", runModelImportContractFixtureAssertions],
    ["skybox import", runSkyboxImportFixtureAssertions],
    ["sky shader", runSkyShaderFixtureAssertions],
    ["scene settings compat", runSceneSettingsCompatFixtureAssertions],
    ["gizmo snap", runGizmoSnapFixtureAssertions],
    ["wind contract", runWindContractFixtureAssertions],
    ["water shader", runWaterShaderFixtureAssertions],
    ["unity package import", runUnityPackageImportFixture],
    ["editor drag data", runEditorDragDataFixture],
    ["editor library drag", runEditorLibraryDragFixture],
    ["material drag", runMaterialDragFixtureAssertions],
    ["custom material preview", runCustomMaterialPreviewFixtureAssertions],
    ["project model material preview", runProjectModelMaterialPreviewFixtureAssertions],
    ["staged world typecheck", runStagedWorldTypecheck],
  ]);
  process.stdout.write("convert/runtime fixture passed\n");
} finally {
  if (previousXriftBin === undefined) {
    delete process.env.XRIFT_STUDIO_XRIFT_BIN;
  } else {
    process.env.XRIFT_STUDIO_XRIFT_BIN = previousXriftBin;
  }
  await rm(fixtureRoot, { recursive: true, force: true });
}

/**
 * Publishing runs the template's `tsc` over everything the compiler emitted,
 * so Studio's own gate has to be that same check. This compiles one world that
 * combines as many emit paths as documents can reach (sky shader, HDR post,
 * grass terrain, water, particles, a built-in script) and typechecks the
 * staged sources with the @xrift/cli world template's compiler options.
 * Emit mistakes that only appear when features meet — duplicate import
 * bindings, unused imports under noUnusedLocals — fail here instead of in the
 * author's publish dialog.
 */
async function runStagedWorldTypecheck() {
  const compiled = compileStagedTypecheckWorld();
  const blocking = compiled.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "blocking",
  );
  assert(
    compiled.canStage && blocking.length === 0,
    `staged typecheck world must be stageable: ${JSON.stringify(blocking).slice(0, 400)}`,
  );
  // Inside node_modules on purpose: the staged sources import three, react and
  // @xrift/world-components, and tsc resolves them by walking up to this
  // repository's node_modules — the same versions the compiler was built
  // against.
  const stagedRoot = path.resolve(
    "node_modules",
    ".cache",
    "xrift-studio",
    "staged-typecheck",
  );
  await rm(stagedRoot, { recursive: true, force: true });
  const written = [];
  for (const file of compiled.overlayFiles) {
    if (!/\.(ts|tsx)$/.test(file.relativePath)) continue;
    const target = path.join(stagedRoot, file.relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content);
    written.push(file.relativePath);
  }
  assert(
    written.includes("src/World.tsx") &&
      written.includes("src/xrift-studio/script-host.tsx") &&
      written.some((file) => file.startsWith("src/scripts/")),
    `staged typecheck world is missing expected sources: ${written.join(", ")}`,
  );
  // The template consumes the world through src/index.tsx, so the staged
  // sources are imported the same way here.
  await writeFile(
    path.join(stagedRoot, "src", "index.tsx"),
    'export { World } from "./World";\nexport type { WorldProps } from "./World";\n',
  );
  // Mirrors the @xrift/cli world template's tsconfig (verified against a real
  // publish staging). "types" deliberately leaves out @types/node: the staged
  // build has no Node globals, so the gate must not either.
  await writeFile(
    path.join(stagedRoot, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          useDefineForClassFields: true,
          lib: ["ES2020", "DOM", "DOM.Iterable"],
          module: "ESNext",
          skipLibCheck: true,
          moduleResolution: "bundler",
          allowImportingTsExtensions: true,
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: "react-jsx",
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
          esModuleInterop: true,
          types: ["react", "react-dom", "vite/client"],
          // The template writes this as baseUrl "." + "src/*"; the relative
          // form means the same thing and also parses under TypeScript 7,
          // which removed baseUrl.
          paths: { "~/*": ["./src/*"] },
        },
        include: ["src"],
      },
      null,
      2,
    ),
  );
  const tsc = path.resolve("node_modules", "typescript", "bin", "tsc");
  const result = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [tsc, "-p", stagedRoot, "--pretty", "false"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => resolve({ code: -1, output: String(error) }));
    child.on("close", (code) => resolve({ code, output }));
  });
  assert(
    result.code === 0,
    `staged world sources do not typecheck under the publish template's tsconfig (${stagedRoot}):\n${result.output.slice(0, 4000)}`,
  );
}

async function verifyPreparedOfficialStarter() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://starter.fixture");
    if (!url.pathname.startsWith("/visual-editor/starter-assets/")) {
      return new Response(null, { status: 404 });
    }
    const relativePath = url.pathname.replace(/^\//, "");
    const bytes = await readFile(path.resolve("public", relativePath));
    return new Response(bytes, { status: 200 });
  };
  try {
    const prepared = await prepareStarterVisualProject(
      createStarterWorldProject("xrift-official", "official-starter-fixture"),
    );
    const assets = Object.values(prepared.plan.assets.assets);
    const models = assets.filter((asset) => asset.kind === "model");
    const textures = assets.filter((asset) => asset.kind === "texture");
    assert(models.length === 2, "prepared official starter must retain both Model Assets");
    assert(
      textures.length >= 2,
      "prepared official starter must contain the panorama and Duck embedded Texture",
    );
    assert(
      prepared.binaryDocuments.some((document) =>
        document.relativePath.endsWith("xrift-official/duck.glb"),
      ) &&
        prepared.binaryDocuments.some((document) =>
          document.relativePath.endsWith("xrift-official/bunny.glb"),
        ) &&
        prepared.binaryDocuments.some((document) =>
          document.relativePath.endsWith("xrift-official/tokyo-station.png"),
        ),
      "prepared official starter must persist every referenced official binary",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function createFakeXrift(root) {
  const scriptPath = path.join(root, "fake-xrift.mjs");
  await writeFile(
    scriptPath,
    `import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const [command, kind, name] = process.argv.slice(2);
if (command !== "create" || !["world", "item"].includes(kind) || !name) process.exit(2);
const root = path.join(process.cwd(), name);
await mkdir(path.join(root, "src"), { recursive: true });
await mkdir(path.join(root, "public"), { recursive: true });
await writeFile(path.join(root, "package.json"), JSON.stringify({ name, private: true, type: "module", scripts: { build: "vite build" }, dependencies: { react: "^19.0.0", three: "^0.185.0" } }, null, 2) + "\\n");
await writeFile(path.join(root, "xrift.json"), "{}\\n");
await writeFile(path.join(root, "src", kind === "world" ? "World.tsx" : "Item.tsx"), "export {};\\n");
await writeFile(path.join(root, "README.md"), "# Fixture\\n");
`,
  );
  if (process.platform === "win32") {
    const wrapper = path.join(root, "fake-xrift.cmd");
    await writeFile(wrapper, `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`);
    return wrapper;
  }
  const wrapper = path.join(root, "fake-xrift");
  await writeFile(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${scriptPath}" "$@"\n`);
  await chmod(wrapper, 0o755);
  return wrapper;
}

/**
 * Runs every fixture suite in order and names the one that fails.  A bare stack
 * from inside a bundled dependency does not say which suite reached it, so the
 * failing suite name is attached before the error leaves this runner.
 */
async function runFixtureSuites(suites) {
  for (const [name, suite] of suites) {
    try {
      await suite();
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      cause.message = `fixture suite "${name}" failed: ${cause.message}`;
      throw cause;
    }
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
