import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  SCRIPT_ASSET_CONTRACT_VERSION,
  normalizeTextureImportSettings,
  type AssetManifest,
} from "../asset-manifest";
import {
  createPrefabAsset,
  PREFAB_DOCUMENT_SCHEMA_VERSION,
  type PrefabDocument,
} from "../prefab-document";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  SCRIPT_CONTRACT_VERSION,
  type SceneDocument,
  type ScriptComponent,
} from "../scene-document";
import { VISUAL_PROJECT_SCHEMA_VERSION } from "../project-document";
import { extractScriptContract } from "../scripting/script-contract";
import {
  advanceScriptAssetRuntimeDescriptorVersions,
  createScriptAssetResolutionKey,
  createScriptAssetRuntimeDescriptor,
  createScriptAssetRuntimeInputKey,
} from "../scripting/asset-runtime";
import { compileVisualProject } from "./compile";
import { resolvePrefabInstances } from "./prefab-resolver";
import {
  SCRIPT_API_OVERLAY_PATH,
  SCRIPT_HOST_OVERLAY_PATH,
  SCRIPT_LIFECYCLE_OVERLAY_PATH,
  SCRIPT_PARTICLE_OVERLAY_PATH,
} from "./script-emit";

/** Filesystem-free assertions for Script emission into the staging project. */
export function runScriptEmitFixtureAssertions(): void {
  assertEmitsStaticImports();
  assertAssetRuntimeDescriptors();
  assertVectorPropertiesAreExtracted();
  assertRenderDetectionIgnoresComments();
  assertDeterministic();
  assertRemoteImportBlocks();
  assertDynamicImportBlocks();
  assertUseFrameBlocks();
  assertPrefabScriptReferencesAreRemapped();
  assertRuntimeOutputBlocks();
  assertMissingSourceBlocks();
}

function assertPrefabScriptReferencesAreRemapped(): void {
  const documents = buildDocuments(SPINNER_SOURCE);
  const prefabId = "prefab_script_fixture";
  const prefabAssetId = "asset_prefab_script_fixture";
  const sourceRootId = "prefab_source_root";
  const sourceTargetId = "prefab_source_target";
  const prefabAsset = createPrefabAsset(
    prefabAssetId,
    "Script Prefab",
    `prefabs/${prefabId}.prefab.json`,
  );
  assert(Boolean(prefabAsset), "Script Prefab Asset could not be created");
  const scriptComponent: ScriptComponent = {
    id: "prefab_script_component",
    type: "script",
    enabled: true,
    scriptAssetId: "asset_script_spinner",
    contractVersion: SCRIPT_CONTRACT_VERSION,
    properties: {
      target: sourceTargetId,
      nested: { target: sourceTargetId },
    },
    assetReferences: [],
    entityReferences: [sourceTargetId],
    runIn: "play",
  };
  const prefab: PrefabDocument = {
    schemaVersion: PREFAB_DOCUMENT_SCHEMA_VERSION,
    prefabId,
    name: "Script Prefab",
    source: { sceneId: "scene_main", rootEntityIds: ["entity_a"] },
    rootEntityIds: [sourceRootId],
    entities: {
      [sourceRootId]: {
        id: sourceRootId,
        name: "Prefab Script Root",
        parentId: null,
        children: [sourceTargetId],
        enabled: true,
        components: [scriptComponent],
      },
      [sourceTargetId]: {
        id: sourceTargetId,
        name: "Prefab Target",
        parentId: sourceRootId,
        children: [],
        enabled: true,
        components: [],
      },
    },
  };
  const scene: SceneDocument = {
    ...documents.scenes.scene_main,
    rootEntityIds: ["prefab_host"],
    entities: {
      prefab_host: {
        id: "prefab_host",
        name: "Prefab Host",
        parentId: null,
        children: [],
        enabled: true,
        components: [
          {
            id: "prefab_instance_component",
            type: "prefab-instance",
            enabled: true,
            prefabAssetId,
            sourceEntityId: sourceRootId,
          },
        ],
      },
    },
  };
  const resolved = resolvePrefabInstances(
    scene,
    {
      ...documents.assets,
      assets: {
        ...documents.assets.assets,
        [prefabAssetId]: prefabAsset!,
      },
    },
    { [prefabId]: prefab },
  ).scene;
  const expandedScript = Object.values(resolved.entities)
    .flatMap((entity) => entity.components)
    .find(
      (component): component is ScriptComponent =>
        component.type === "script",
    );
  assert(Boolean(expandedScript), "Prefab Script was not expanded");
  const generatedTargetId = expandedScript!.entityReferences[0];
  assert(
    Boolean(generatedTargetId) &&
      generatedTargetId !== sourceTargetId &&
      expandedScript!.properties.target === generatedTargetId &&
      (
        expandedScript!.properties.nested as {
          target?: unknown;
        }
      ).target === generatedTargetId,
    "Prefab Script Entity references and property values did not share the generated ID",
  );
}

const SPINNER_SOURCE = `import { defineScript, prop } from "xrift:script";
import { Vector3 } from "three";

export const Render = () => null;

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
  const textureAssetId = "asset_texture_grid";
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
      [textureAssetId]: {
        id: textureAssetId,
        name: "Grid",
        kind: "texture",
        status: "ready",
        source: {
          kind: "project",
          relativePath: "assets/textures/grid.png",
        },
        thumbnail: { status: "missing" },
        importSettings: normalizeTextureImportSettings({
          colorSpace: "linear",
          flipY: true,
          generateMipmaps: false,
          sampler: {
            wrapS: "mirrored-repeat",
            wrapT: "clamp-to-edge",
            magFilter: "nearest",
            minFilter: "nearest",
          },
        }),
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
            assetReferences: [textureAssetId],
            entityReferences: ["entity_a"],
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

function assertVectorPropertiesAreExtracted(): void {
  const contract = extractScriptContract(`
import { defineScript, prop } from "xrift:script";

export default defineScript({
  name: "Vector properties",
  props: {
    offset: prop.vec2({ default: [2, 4] }),
    axis: prop.vec3({ default: [0, 1, 0] }),
  },
  start() {},
});
`);
  assert(
    contract.issues.length === 0 &&
      contract.props.some(
        (property) =>
          property.name === "offset" &&
          property.kind === "vec2" &&
          JSON.stringify(property.defaultValue) === "[2,4]",
      ) &&
      contract.props.some(
        (property) =>
          property.name === "axis" &&
          property.kind === "vec3" &&
          JSON.stringify(property.defaultValue) === "[0,1,0]",
      ),
    "vec2/vec3 property declarations were not extracted",
  );
}

function assertRenderDetectionIgnoresComments(): void {
  const sourceWithComment = SPINNER_SOURCE.replace(
    "export const Render = () => null;",
    [
      "// export const Render = () => null;",
      'const renderPattern = /export const Render = "not an export"/;',
    ].join("\n"),
  );
  const result = compileVisualProject(buildDocuments(sourceWithComment), {
    generatedAt: "2026-07-25T00:00:00.000Z",
  });
  const world = result.overlayFiles.find(
    (file) => file.relativePath === "src/World.tsx",
  )?.content;
  assert(Boolean(world), "World.tsx was not emitted for Render comment fixture");
  assert(
    !world!.includes("{ Render as"),
    "a commented or regex Render declaration produced a named import",
  );

  const sourceWithAsyncRender = SPINNER_SOURCE.replace(
    "export const Render = () => null;",
    "export async function Render() { return null; }",
  );
  const asyncResult = compileVisualProject(buildDocuments(sourceWithAsyncRender), {
    generatedAt: "2026-07-25T00:00:00.000Z",
  });
  const asyncWorld = asyncResult.overlayFiles.find(
    (file) => file.relativePath === "src/World.tsx",
  )?.content;
  assert(
    Boolean(asyncWorld?.includes("{ Render as")),
    "an async named Render export was not statically imported",
  );
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
      paths.includes(SCRIPT_HOST_OVERLAY_PATH) &&
      paths.includes(SCRIPT_LIFECYCLE_OVERLAY_PATH) &&
      paths.includes(SCRIPT_PARTICLE_OVERLAY_PATH),
    "Script API, lifecycle, Particle runtime, and host were not emitted alongside the module",
  );
  const host = result.overlayFiles.find(
    (file) => file.relativePath === SCRIPT_HOST_OVERLAY_PATH,
  );
  const api = result.overlayFiles.find(
    (file) => file.relativePath === SCRIPT_API_OVERLAY_PATH,
  );
  const lifecycle = result.overlayFiles.find(
    (file) => file.relativePath === SCRIPT_LIFECYCLE_OVERLAY_PATH,
  );
  assert(
    Boolean(
      host?.content.includes('from "./script-api"') &&
        host.content.includes('from "./script-lifecycle"') &&
        host.content.includes('from "./particle-runtime"'),
    ),
    "Script host sibling imports were not rewritten to emitted runtime files",
  );
  assert(
    Boolean(
      host?.content.includes("<Render ctx={renderContext} />") &&
        host.content.includes("loadAudio(assetId, options = {})") &&
        api?.content.includes("export type ScriptRenderProps") &&
        api.content.includes("loadAudio("),
    ),
    "published Script runtime is missing Render context or lifecycle-owned Audio",
  );
  assert(
    Boolean(lifecycle?.content.includes('from "./script-api"')),
    "Script lifecycle API import was not rewritten to the emitted runtime file",
  );

  const world = result.overlayFiles.find(
    (file) => file.relativePath === "src/World.tsx",
  );
  assert(Boolean(world), "World.tsx was not emitted");
  const source = world!.content;
  assert(
    source.includes(
      `import Spinner, { Render as SpinnerRender } from "./scripts/Spinner";`,
    ),
    "the entry file does not statically import the Script module and Render export",
  );
  assert(
    source.includes(
      `import { XriftScriptHost, XriftScriptRoot } from "./xrift-studio/script-host";`,
    ),
    "the entry file does not import the Script host and root",
  );
  assert(
    source.includes("<XriftPublishedScriptRoot>") &&
      source.includes("<XriftScriptHost") &&
      source.includes("script={Spinner}") &&
      source.includes("render={SpinnerRender}"),
    "the Script root, host, or Render export was not mounted",
  );
  assert(
    source.includes("assetBaseUrl={baseUrl}") &&
      source.includes("userData={{ xriftScriptScope: true }}"),
    "published Script Assets or Entity lookup are not scoped to the World/Item base",
  );
  assert(
    source.includes('assetReferences={["asset_texture_grid"]}') &&
      source.includes('entityReferences={["entity_a"]}') &&
      source.includes('"asset_texture_grid"') &&
      source.includes("grid.png") &&
      source.includes("resolveAsset={(assetId)") &&
      source.includes("resolveAssetUrl={(assetId)"),
    "declared Asset and Entity references were not emitted with a runtime URL",
  );
  assert(
    source.includes(
      '"textureDefaults":{"colorSpace":"linear","wrapS":"mirrored-repeat","wrapT":"clamp-to-edge","magFilter":"nearest","minFilter":"nearest","flipY":true,"generateMipmaps":false}',
    ) &&
      !source.includes('"resize":{"mode":"max-size"') &&
      !source.includes('"compression":{"format":"webp"'),
    "published Script Asset descriptor did not preserve runtime Texture defaults or leaked import-only settings",
  );
  assert(
    source.includes('userData={{ xriftEntityId: "entity_a" }}'),
    "the generated Entity cannot be resolved by Script find()",
  );
  // The whole point of the exception carved out in ARCHITECTURE.md 4.8.
  assert(
    result.overlayFiles.every(
      (file) =>
        !/\beval\s*\(|\bnew\s+Function\s*\(|\bimport\s*\(/.test(file.content),
    ),
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

function assertAssetRuntimeDescriptors(): void {
  const documents = buildDocuments(SPINNER_SOURCE);
  const textureAssetId = "asset_texture_grid";
  const descriptor = createScriptAssetRuntimeDescriptor(
    documents.assets,
    textureAssetId,
    "data:image/png;base64,fixture",
  );
  assert(
    descriptor?.url === "data:image/png;base64,fixture" &&
      descriptor.textureDefaults?.colorSpace === "linear" &&
      descriptor.textureDefaults.wrapS === "mirrored-repeat" &&
      descriptor.textureDefaults.wrapT === "clamp-to-edge" &&
      descriptor.textureDefaults.magFilter === "nearest" &&
      descriptor.textureDefaults.minFilter === "nearest" &&
      descriptor.textureDefaults.flipY === true &&
      descriptor.textureDefaults.generateMipmaps === false &&
      !("resize" in descriptor.textureDefaults) &&
      !("compression" in descriptor.textureDefaults),
    "Texture Asset import settings were not reduced to portable Script runtime defaults",
  );

  const firstKey = createScriptAssetRuntimeInputKey(documents.assets, [
    textureAssetId,
  ]);
  const texture = documents.assets.assets[textureAssetId];
  if (!texture || texture.kind !== "texture") {
    throw new Error("Script emit fixture failed: Texture fixture is missing");
  }
  const runtimeChanged: AssetManifest = {
    ...documents.assets,
    assets: {
      ...documents.assets.assets,
      [textureAssetId]: {
        ...texture,
        importSettings: {
          ...texture.importSettings,
          flipY: false,
        },
      },
    },
  };
  const importOnlyChanged: AssetManifest = {
    ...documents.assets,
    assets: {
      ...documents.assets.assets,
      [textureAssetId]: {
        ...texture,
        importSettings: {
          ...texture.importSettings,
          resize: { mode: "max-size", maxSize: 512 },
          compression: { format: "ktx2", quality: 25 },
        },
      },
    },
  };
  assert(
    firstKey !==
      createScriptAssetRuntimeInputKey(runtimeChanged, [textureAssetId]) &&
      firstKey !==
        createScriptAssetRuntimeInputKey(importOnlyChanged, [textureAssetId]),
    "Script runtime input key did not schedule URL re-resolution after Texture import settings changed",
  );

  const audioDescriptor = { url: "data:audio/mpeg;base64,fixture" };
  const previousDescriptors = new Map([
    [textureAssetId, descriptor!],
    ["asset_audio", audioDescriptor],
  ]);
  const previousVersions = new Map([
    [textureAssetId, 4],
    ["asset_audio", 7],
  ]);
  const changedTextureDescriptor = createScriptAssetRuntimeDescriptor(
    runtimeChanged,
    textureAssetId,
    descriptor!.url,
  );
  assert(
    Boolean(changedTextureDescriptor),
    "Changed Texture descriptor could not be created",
  );
  const nextVersions = advanceScriptAssetRuntimeDescriptorVersions(
    previousDescriptors,
    previousVersions,
    new Map([
      [textureAssetId, changedTextureDescriptor!],
      ["asset_audio", audioDescriptor],
    ]),
  );
  assert(
    nextVersions.get(textureAssetId) === 5 &&
      nextVersions.get("asset_audio") === 7 &&
      createScriptAssetResolutionKey(["asset_audio"], previousVersions) ===
        createScriptAssetResolutionKey(["asset_audio"], nextVersions) &&
      createScriptAssetResolutionKey([textureAssetId], previousVersions) !==
        createScriptAssetResolutionKey([textureAssetId], nextVersions),
    "a Texture descriptor change did not restart only hosts that reference that Asset",
  );
  const importOnlyDescriptor = createScriptAssetRuntimeDescriptor(
    importOnlyChanged,
    textureAssetId,
    descriptor!.url,
  );
  const importOnlyVersions = advanceScriptAssetRuntimeDescriptorVersions(
    previousDescriptors,
    previousVersions,
    new Map([
      [textureAssetId, importOnlyDescriptor!],
      ["asset_audio", audioDescriptor],
    ]),
  );
  assert(
    importOnlyVersions.get(textureAssetId) === 4,
    "import-only Texture settings restarted a host when the resolved URL was unchanged",
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

function assertDynamicImportBlocks(): void {
  const source = [
    "const moduleUrl = `https://example.com/${name}`;",
    "const dependency = import(moduleUrl);",
    SPINNER_SOURCE,
  ].join("\n");
  const result = compileVisualProject(buildDocuments(source), {
    generatedAt: "2026-07-25T00:00:00.000Z",
  });
  assert(
    result.diagnostics.some(
      (entry) =>
        entry.severity === "blocking" &&
        entry.code === "script-dynamic-import-unsupported",
    ),
    "a computed dynamic import did not block publication",
  );
  assert(!result.canStage, "a dynamic import must stop staging");
}

function assertUseFrameBlocks(): void {
  const unsafeImports = [
    'import { useFrame as frame } from "@react-three/fiber";',
    'import { addAfterEffect } from "@react-three/fiber";',
    'import * as Fiber from "@react-three/fiber";',
    'import Fiber from "@react-three/fiber";',
    'import FiberDefault, * as Fiber from "@react-three/fiber";',
  ];
  for (const unsafeImport of unsafeImports) {
    const result = compileVisualProject(
      buildDocuments(`${unsafeImport}\n${SPINNER_SOURCE}`),
      { generatedAt: "2026-07-25T00:00:00.000Z" },
    );
    assert(
      result.diagnostics.some(
        (entry) =>
          entry.severity === "blocking" &&
          entry.code === "script-use-frame-unsupported",
      ),
      `${unsafeImport} was not blocked before publishing an unisolated frame callback`,
    );
  }
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
