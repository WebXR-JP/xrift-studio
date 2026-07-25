import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  SCRIPT_ASSET_CONTRACT_VERSION,
  type AssetManifest,
} from "../asset-manifest";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  SCRIPT_CONTRACT_VERSION,
  type SceneDocument,
} from "../scene-document";
import { VISUAL_PROJECT_SCHEMA_VERSION } from "../project-document";
import { compileVisualProject } from "./compile";
import {
  SCRIPT_API_OVERLAY_PATH,
  SCRIPT_HOST_OVERLAY_PATH,
} from "./script-emit";

/** Filesystem-free assertions for Script emission into the staging project. */
export function runScriptEmitFixtureAssertions(): void {
  assertEmitsStaticImports();
  assertDeterministic();
  assertRemoteImportBlocks();
  assertRuntimeOutputBlocks();
  assertMissingSourceBlocks();
}

const SPINNER_SOURCE = `import { defineScript, prop } from "xrift:script";
import { Vector3 } from "three";

export default defineScript({
  name: "Spinner",
  props: { speed: prop.number({ default: 2 }) },
  start(ctx) {
    const axis = new Vector3(0, 1, 0);
    return { update(dt) { ctx.object3d.rotateOnAxis(axis, ctx.props.speed * dt); } };
  },
});
`;

function buildDocuments(source: string, options: { assetId?: string } = {}) {
  const assetId = options.assetId ?? "asset_script_spinner";
  const assets: AssetManifest = {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: {
      [assetId]: {
        id: assetId,
        name: "Spinner",
        kind: "script",
        status: "ready",
        contractVersion: SCRIPT_ASSET_CONTRACT_VERSION,
        language: "ts",
        source: { kind: "project", relativePath: "scripts/spinner.ts" },
      },
    },
  };
  const scene: SceneDocument = {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId: "scene_main",
    name: "Main",
    rootEntityIds: ["entity_a"],
    entities: {
      entity_a: {
        id: "entity_a",
        name: "Spinning Cube",
        parentId: null,
        children: [],
        enabled: true,
        components: [
          {
            id: "component_transform",
            type: "transform",
            enabled: true,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
          {
            id: "component_script",
            type: "script",
            enabled: true,
            scriptAssetId: assetId,
            contractVersion: SCRIPT_CONTRACT_VERSION,
            properties: { speed: 3, axis: [0, 1, 0] },
            assetReferences: [],
            entityReferences: [],
            runIn: "play",
          },
        ],
      },
    },
  };
  return {
    project: {
      schemaVersion: VISUAL_PROJECT_SCHEMA_VERSION,
      projectId: "project_fixture",
      projectKind: "world" as const,
      entrySceneId: "scene_main",
      scenePaths: { scene_main: "scenes/main.scene.json" },
      assetManifestPath: "assets/manifest.json",
      metadata: {
        name: "Fixture",
        title: "Fixture",
        description: "Fixture project",
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
      },
    },
    scenes: { scene_main: scene },
    assets,
    prefabs: {},
    scriptSources: { [assetId]: source },
  };
}

function assertEmitsStaticImports(): void {
  const result = compileVisualProject(buildDocuments(SPINNER_SOURCE), {
    generatedAt: "2026-07-25T00:00:00.000Z",
  });
  assert(
    result.diagnostics.every((entry) => entry.severity !== "blocking"),
    `Script emission produced a blocking diagnostic: ${result.diagnostics
      .filter((entry) => entry.severity === "blocking")
      .map((entry) => entry.code)
      .join(", ")}`,
  );
  const paths = result.overlayFiles.map((file) => file.relativePath);
  assert(
    paths.includes("src/scripts/Spinner.ts"),
    `Script module was not emitted: ${paths.join(", ")}`,
  );
  assert(
    paths.includes(SCRIPT_API_OVERLAY_PATH) &&
      paths.includes(SCRIPT_HOST_OVERLAY_PATH),
    "Script API and host were not emitted alongside the module",
  );

  const world = result.overlayFiles.find(
    (file) => file.relativePath === "src/World.tsx",
  );
  assert(Boolean(world), "World.tsx was not emitted");
  const source = world!.content;
  assert(
    source.includes(`import Spinner from "./scripts/Spinner";`),
    "the entry file does not statically import the Script module",
  );
  assert(
    source.includes(
      `import { XriftScriptHost } from "./xrift-studio/script-host";`,
    ),
    "the entry file does not import the Script host",
  );
  assert(
    source.includes("<XriftScriptHost") && source.includes("script={Spinner}"),
    "the Script host was not mounted on the Entity",
  );
  // The whole point of the exception carved out in ARCHITECTURE.md 4.8.
  assert(
    !/\beval\s*\(|\bnew\s+Function\s*\(|\bimport\s*\(/.test(source),
    "generated output must not contain eval, Function, or dynamic import",
  );

  const emitted = result.overlayFiles.find(
    (file) => file.relativePath === "src/scripts/Spinner.ts",
  );
  assert(
    emitted!.content.includes(`from "../xrift-studio/script-api"`),
    "xrift:script was not rewritten to the emitted API path",
  );
  assert(
    !emitted!.content.includes("xrift:script"),
    "the Studio-only specifier survived into the emitted module",
  );
}

function assertDeterministic(): void {
  const options = { generatedAt: "2026-07-25T00:00:00.000Z" };
  const first = compileVisualProject(buildDocuments(SPINNER_SOURCE), options);
  const second = compileVisualProject(buildDocuments(SPINNER_SOURCE), options);
  assertEqual(
    JSON.stringify(first.overlayFiles),
    JSON.stringify(second.overlayFiles),
    "two compiles of the same documents produced different overlay files",
  );
}

function assertRemoteImportBlocks(): void {
  const source = `import confetti from "https://esm.sh/canvas-confetti";\n${SPINNER_SOURCE}`;
  const result = compileVisualProject(buildDocuments(source), {
    generatedAt: "2026-07-25T00:00:00.000Z",
  });
  assert(
    result.diagnostics.some(
      (entry) =>
        entry.severity === "blocking" &&
        entry.code === "script-remote-import-unsupported",
    ),
    "a remote import did not block publication",
  );
  assert(!result.canStage, "a remote import must stop staging");
}

function assertRuntimeOutputBlocks(): void {
  const result = compileVisualProject(buildDocuments(SPINNER_SOURCE), {
    generatedAt: "2026-07-25T00:00:00.000Z",
    outputMode: "classic-runtime",
  });
  assert(
    result.diagnostics.some(
      (entry) =>
        entry.severity === "blocking" &&
        entry.code === "script-unsupported-runtime-output",
    ),
    "runtime JSON output accepted a Script instead of reporting it",
  );
}

function assertMissingSourceBlocks(): void {
  const documents = buildDocuments(SPINNER_SOURCE);
  const result = compileVisualProject(
    { ...documents, scriptSources: {} },
    { generatedAt: "2026-07-25T00:00:00.000Z" },
  );
  assert(
    result.diagnostics.some(
      (entry) =>
        entry.severity === "blocking" &&
        entry.code === "script-source-unreadable",
    ),
    "an unreadable Script source did not block publication",
  );
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Script emit fixture failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Script emit fixture failed: ${message}`);
  }
}
