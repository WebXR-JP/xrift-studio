import {
  getGeometryAsset,
  getAudioAsset,
  getGeometryMaterialSlots,
  getMaterialAsset,
  getTextureAsset,
  getTextureSourceFormat,
  isEnvironmentTextureAsset,
  materialAlphaRenderProps,
  normalizeMaterialProperties,
  type AssetManifest,
  type MaterialAsset,
  type MaterialProperties,
  type MaterialSlotDefinition,
  type MaterialTextureInfo,
  type ModelAsset,
  type ParticleAsset,
  type PrimitiveGeometry,
  type SceneAsset,
} from "../asset-manifest";
import {
  isConvertibleTextureSourceFormat,
  isPublishedAsKtx2,
  planTextureConversion,
  textureOutputExtension,
} from "../texture-conversion";
import { getBuiltinPrimitiveCreation } from "../creation-catalog";
import {
  collectInteractivityRuntimeDiagnostics,
  collectXriftInteractionPrograms,
  getKhrInteractivityOnStartAnimationCues,
  planInteractivityAnimationCues,
  hasXriftInteractionRuntimeWork,
  hasXriftSelfStartingEntry,
  XRIFT_INTERACTION_SELF_ENTITY_ID,
} from "../interactivity-graph";
import {
  validateSerializedXriftComponents,
  validateXriftComponents,
  XRIFT_COMPONENT_SCHEMA_IDS,
} from "../component-registry";
import type { PrototypeVisualProject } from "../prototype-project";
import { normalizeParticleProperties } from "../particle-system";
import {
  validateClassicR3fMaterialShader,
  type ClassicR3fMaterialShader,
} from "../custom-shader-contract";
import {
  resolveSkyShaderMaterial,
  skyShaderDrivenUniforms,
  skyShaderTextureUniformNames,
} from "../sky-shader";
import {
  lightingDrivenUniforms,
  resolveSceneLighting,
} from "../lighting-contract";
import { resolveSceneWind, windDrivenUniforms } from "../wind-contract";
import {
  TERRAIN_GRASS_MAX_INSTANCES,
  getTerrainGrassType,
  resolveTerrainGrassAppearance,
  terrainGrassClump,
} from "../terrain-grass";
import {
  TERRAIN_GRASS_FRAGMENT_SHADER,
  TERRAIN_GRASS_VERTEX_SHADER,
  terrainGrassRuntimeSource,
} from "../terrain-grass-runtime";
import { detectTimeUniforms } from "../../../../packages/xrift-studio-runtime/src/shader-time";
import type { VisualProjectKind } from "../project-document";
import {
  type BoxColliderComponent,
  type AudioSourceComponent,
  type ColliderComponent,
  type LightComponent,
  type MeshColliderComponent,
  type MeshComponent,
  type ParticleEmitterComponent,
  type RegisteredSceneComponent,
  type RigidBodyComponent,
  type SceneDocument,
  type SceneEntity,
  type TextComponent,
  type TransformComponent,
  type Vec3,
  type XRiftComponent,
} from "../scene-document";
import type { TerrainGeometry } from "../terrain";
import {
  resolveSceneSettings,
  type ScenePostprocessingSettings,
  type SceneSettings,
} from "../scene-settings";
import {
  assetManifestCodec,
  isCompilationStale,
  prefabDocumentCodec,
  sceneDocumentCodec,
  stableSerializeJson,
  visualProjectDocumentCodec,
  type CompilationProvenance,
  type SourceDocumentHash,
} from "../serialization";
import { sha256Utf8 } from "./hash";
import { collectRequiredScriptAssetIds } from "../scripting/script-schedule";
import { createScriptAssetRuntimeDescriptorMap } from "../scripting/asset-runtime";
import {
  createInteractionTriggerOverlayFiles,
  createScriptAudioSourceOverlayFile,
  createScriptLightOverlayFile,
  createScriptParticleOverlayFile,
  createTextPanelOverlayFiles,
  planScriptEmission,
  renderScriptComponent,
  SCRIPT_AUDIO_SOURCE_OVERLAY_PATH,
  SCRIPT_LIGHT_OVERLAY_PATH,
  SCRIPT_PARTICLE_OVERLAY_PATH,
  TEXT_PANEL_RUNTIME_OVERLAY_PATH,
  TEXT_PANEL_RUNTIME_PACKAGE,
  type EmittedScriptModule,
} from "./script-emit";
import {
  isOpenBrushModelMetadata,
  OPEN_BRUSH_BRUSH_BASE_URL,
  OPEN_BRUSH_PUBLISH_PERMISSION,
  OPEN_BRUSH_RUNTIME_PACKAGE,
} from "../open-brush";
import { createOpenBrushRuntimeOverlayFile } from "./open-brush-emit";
import {
  createScenePostprocessingOverlayFile,
  SCENE_POSTPROCESSING_OVERLAY_PATH,
} from "./scene-postprocessing-emit";
import {
  publishPermissionsJson,
  resolvePublishPermissions,
  type ResolvedPublishPermissions,
} from "./publish-permissions";
import {
  getPrefabAssetDocumentReference,
  isPrefabAsset,
  resolvePrefabInstances,
} from "./prefab-resolver";
import {
  VISUAL_COMPILER_VERSION,
  type AssetCopyPlanEntry,
  type CompilerBundledAssetCopy,
  type CompilerDiagnostic,
  type CompilerOverlayFile,
  type VisualCompileResult,
  type VisualCompilerDocuments,
  type VisualCompilerOptions,
} from "./types";
import { compileXriftComponent } from "./xrift-component-registry";
import { compileRuntimeManifest } from "./runtime-manifest";
import {
  LOCAL_BASIS_TRANSCODER_FILES,
  PUBLISHED_BASIS_TRANSCODER_DIRECTORY,
} from "../basis-transcoder";

const XRIFT_STUDIO_RUNTIME_PACKAGE = "xrift-studio-runtime@0.1.0" as const;

type CompileContext = {
  projectKind: VisualProjectKind;
  scene: SceneDocument;
  assets: AssetManifest;
  diagnostics: CompilerDiagnostic[];
  diagnosticKeys: Set<string>;
  imports: Set<string>;
  extraImports: Set<string>;
  reactValueImports: Set<string>;
  reactTypeImports: Set<string>;
  fiberImports: Set<string>;
  dreiImports: Set<string>;
  rapierImports: Set<string>;
  threeValueImports: Set<string>;
  threeTypeImports: Set<string>;
  supportDeclarations: Map<string, string>;
  assetRuntimeUrls: ReadonlyMap<string, string>;
  referencedAssetIds: Set<string>;
  visitedEntityIds: Set<string>;
  activeEntityIds: Set<string>;
  usesDoubleSide: boolean;
  /** Emitted Script modules keyed by Script Asset id. */
  scriptModules: ReadonlyMap<string, EmittedScriptModule>;
  /** Running scheduling order, matching Play's Entity-then-Component walk. */
  scriptOrder: { next: number };
  usesScriptRuntime: boolean;
  /**
   * Entities an Interaction Trigger writes to.
   *
   * Collected before the walk because a disabled Entity is normally dropped
   * from the output; one a trigger can re-show has to be emitted, hidden, so
   * the published world can do what Play does.
   */
  interactionTriggerTargetEntityIds: ReadonlySet<string>;
};

type RenderedXriftWrapper = {
  jsx: string;
  componentId: string;
  importName: string;
  childrenRequired: boolean;
};

export function compileVisualProject(
  documents: VisualCompilerDocuments,
  options: VisualCompilerOptions = {},
): VisualCompileResult {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const outputMode = options.outputMode ?? "classic-jsx";
  const sourceDocuments = computeSourceDocumentHashes(documents);
  const provenance: CompilationProvenance = {
    sourceDocuments,
    compilerVersion: VISUAL_COMPILER_VERSION,
    targetKind: documents.project.projectKind,
    generatedAt,
  };
  const diagnostics: CompilerDiagnostic[] = [];
  validateCompilerDocuments(documents, diagnostics);
  const assetCopyPlan = createAssetCopyPlan(
    documents.assets,
    diagnostics,
    outputMode,
  );
  const entryScene = documents.scenes[documents.project.entrySceneId];
  const resolvedEntryScene = entryScene
    ? resolvePrefabInstances(
        entryScene,
        documents.assets,
        documents.prefabs ?? {},
      )
    : null;
  if (resolvedEntryScene) {
    diagnostics.push(...resolvedEntryScene.diagnostics);
    appendXriftComponentDiagnostics(
      resolvedEntryScene.scene,
      documents.project.projectKind,
      diagnostics,
      resolvedEntryScene.scene.sceneId,
    );
  }
  // Scripts are planned before code generation so the entry file can import
  // each emitted module statically. Published output never evaluates source
  // dynamically; see VISUAL_EDITOR_ARCHITECTURE.md 4.8.
  const scriptAssetIds = resolvedEntryScene
    ? collectRequiredScriptAssetIds(resolvedEntryScene.scene)
    : [];
  const scriptPlan = planScriptEmission(
    scriptAssetIds,
    documents.assets,
    (asset) => documents.scriptSources?.[asset.id] ?? null,
    diagnostics,
  );
  if (scriptAssetIds.length > 0 && outputMode === "classic-runtime") {
    // runtime.json is data; an unhandled component would otherwise be passed
    // straight through and produce a silently broken manifest.
    diagnostics.push({
      severity: "blocking",
      code: "script-unsupported-runtime-output",
      message:
        "Runtime JSON出力ではScriptを表現できません。Classic JSX出力を選んでください。",
    });
  }
  if (
    outputMode === "classic-runtime" &&
    resolvedEntryScene &&
    sceneUsesInteractionTriggerRuntime(resolvedEntryScene.scene, documents.assets)
  ) {
    // The runtime manifest carries the graph but no runtime reads it there, so
    // a trigger would be silently dropped instead of running.
    diagnostics.push({
      severity: "blocking",
      code: "interaction-trigger-unsupported-runtime-output",
      message:
        "Runtime JSON出力ではInteraction Triggerを実行できません。Classic JSX出力を選んでください。",
    });
  }

  let runtimeManifestFile: CompilerOverlayFile | undefined;
  let generated: string;
  if (outputMode === "classic-runtime") {
    // Keep the JSX pass as a diagnostic oracle while runtime adapters reach
    // feature parity. Runtime export emits a thin, target-neutral adapter.
    if (resolvedEntryScene) {
      generateComponentSource(
        documents.project.projectKind,
        resolvedEntryScene.scene,
        documents.assets,
        assetCopyPlan,
        diagnostics,
        scriptPlan.modules,
      );
    }
    const runtimeManifest = compileRuntimeManifest(
      documents,
      resolvedEntryScene?.scene ?? null,
      assetCopyPlan,
      VISUAL_COMPILER_VERSION,
      diagnostics,
    );
    generated = generateRuntimeAdapterSource(documents.project.projectKind);
    runtimeManifestFile = compilerFile(
      "public/xrift/runtime.json",
      stableSerializeJson(runtimeManifest),
      "metadata",
    );
  } else {
    generated = resolvedEntryScene
      ? generateComponentSource(
          documents.project.projectKind,
          resolvedEntryScene.scene,
          documents.assets,
          assetCopyPlan,
          diagnostics,
          scriptPlan.modules,
        )
      : emptySource(documents.project.projectKind);
  }
  const usesOpenBrushModels = projectUsesOpenBrushModels(documents.assets);
  // Every emitted feature that trips a platform security rule declares its own
  // requirement; nothing here knows what those rules are.
  const publishPermissions = resolvePublishPermissions([
    ...(usesOpenBrushModels ? [OPEN_BRUSH_PUBLISH_PERMISSION] : []),
  ]);
  const xriftJson = generateXriftJson(
    documents.project.projectKind,
    documents.project.metadata.title,
    documents.project.metadata.description,
    // Physics and camera are per-world, so they come from the entry Scene's
    // settings — the same ones Play uses — keeping the published world's
    // gravity and clipping identical to what the author tested.
    resolvedEntryScene
      ? resolveSceneSettings(resolvedEntryScene.scene.settings)
      : undefined,
    publishPermissions,
  );
  const sourcePath =
    documents.project.projectKind === "world" ? "src/World.tsx" : "src/Item.tsx";
  const overlayFiles: CompilerOverlayFile[] = [
    compilerFile(sourcePath, generated),
    compilerFile("xrift.json", xriftJson, "metadata"),
  ];
  if (runtimeManifestFile) overlayFiles.push(runtimeManifestFile);
  overlayFiles.push(...scriptPlan.overlayFiles);
  if (
    outputMode === "classic-jsx" &&
    resolvedEntryScene &&
    sceneUsesParticleRuntime(resolvedEntryScene.scene) &&
    !overlayFiles.some(
      (file) => file.relativePath === SCRIPT_PARTICLE_OVERLAY_PATH,
    )
  ) {
    overlayFiles.push(createScriptParticleOverlayFile());
  }
  if (
    outputMode === "classic-jsx" &&
    resolvedEntryScene &&
    sceneUsesAudioSourceRuntime(resolvedEntryScene.scene) &&
    !overlayFiles.some(
      (file) => file.relativePath === SCRIPT_AUDIO_SOURCE_OVERLAY_PATH,
    )
  ) {
    overlayFiles.push(createScriptAudioSourceOverlayFile());
  }
  if (
    outputMode === "classic-jsx" &&
    resolvedEntryScene &&
    sceneUsesLightRuntime(resolvedEntryScene.scene) &&
    !overlayFiles.some(
      (file) => file.relativePath === SCRIPT_LIGHT_OVERLAY_PATH,
    )
  ) {
    overlayFiles.push(createScriptLightOverlayFile());
  }
  if (
    outputMode === "classic-jsx" &&
    resolvedEntryScene &&
    sceneUsesTextPanelRuntime(resolvedEntryScene.scene) &&
    !overlayFiles.some(
      (file) => file.relativePath === TEXT_PANEL_RUNTIME_OVERLAY_PATH,
    )
  ) {
    overlayFiles.push(...createTextPanelOverlayFiles());
  }
  if (
    outputMode === "classic-jsx" &&
    resolvedEntryScene &&
    sceneUsesInteractionTriggerRuntime(resolvedEntryScene.scene, documents.assets)
  ) {
    for (const file of createInteractionTriggerOverlayFiles()) {
      if (
        !overlayFiles.some(
          (candidate) => candidate.relativePath === file.relativePath,
        )
      ) {
        overlayFiles.push(file);
      }
    }
    // The trigger runtime writes through the Audio Source and Light bridges,
    // so their modules ship with it even when the Scene has neither yet.
    if (
      !overlayFiles.some(
        (file) => file.relativePath === SCRIPT_AUDIO_SOURCE_OVERLAY_PATH,
      )
    ) {
      overlayFiles.push(createScriptAudioSourceOverlayFile());
    }
    if (
      !overlayFiles.some(
        (file) => file.relativePath === SCRIPT_LIGHT_OVERLAY_PATH,
      )
    ) {
      overlayFiles.push(createScriptLightOverlayFile());
    }
  }
  // Emitted for both output modes: the brush loader is self-contained, so a
  // published world never depends on which runtime shape it was built with.
  if (usesOpenBrushModels) {
    overlayFiles.push(createOpenBrushRuntimeOverlayFile());
  }
  // The compositor module ships whenever the Scene composites at all.
  if (
    resolvedEntryScene &&
    resolveSceneSettings(resolvedEntryScene.scene.settings).postprocessing
      .enabled &&
    !overlayFiles.some(
      (file) => file.relativePath === SCENE_POSTPROCESSING_OVERLAY_PATH,
    )
  ) {
    overlayFiles.push(createScenePostprocessingOverlayFile());
  }
  diagnoseUnsupportedAssets(documents.assets, diagnostics);
  diagnoseIgnoredTextureRecipes(documents.assets, assetCopyPlan, diagnostics);
  diagnoseInteractivityRuntimeSupport(documents.assets, diagnostics);
  const uniqueDiagnostics = deduplicateDiagnostics(diagnostics);
  const provenanceFile = compilerFile(
    ".xrift-studio/compiler-provenance.json",
    stableSerializeJson(provenance),
    "metadata",
  );
  const canStage = !uniqueDiagnostics.some(
    (diagnostic) => diagnostic.severity === "blocking",
  );
  const stagingDirectoryName = compilerStagingDirectoryName(
    documents.project.projectId,
    documents.project.projectKind,
  );
  const requiredPublicationFiles = [
    {
      purpose: "thumbnail" as const,
      sourceRelativePath: "public/thumbnail.png" as const,
      targetRelativePath: "public/thumbnail.png" as const,
    },
  ];
  const runtimePackageSpecs: string[] =
    outputMode === "classic-runtime" ? [XRIFT_STUDIO_RUNTIME_PACKAGE] : [];
  if (usesOpenBrushModels) runtimePackageSpecs.push(OPEN_BRUSH_RUNTIME_PACKAGE);
  if (
    outputMode === "classic-jsx" &&
    resolvedEntryScene &&
    sceneUsesTextPanelRuntime(resolvedEntryScene.scene)
  ) {
    // classic-runtime gets troika transitively through xrift-studio-runtime;
    // the emitted-source mode imports it directly and must ask for it.
    runtimePackageSpecs.push(TEXT_PANEL_RUNTIME_PACKAGE);
  }
  const bundledAssetCopyPlan =
    outputMode === "classic-jsx" &&
    generated.includes("function useCompiledKtx2(")
      ? createPublishedBasisAssetCopyPlan()
      : [];

  return {
    targetKind: documents.project.projectKind,
    canStage,
    diagnostics: uniqueDiagnostics,
    overlayFiles,
    assetCopyPlan,
    provenance,
    provenanceFile,
    ...(runtimeManifestFile ? { runtimeManifestFile } : {}),
    ...(publishPermissions ? { publishPermissions } : {}),
    stagingPlan: {
      owner: "xrift-studio-compiler",
      templateKind: documents.project.projectKind,
      stagingDirectoryName,
      overlayFiles: [...overlayFiles, provenanceFile],
      assetCopyPlan,
      bundledAssetCopyPlan,
      runtimePackageSpecs,
      requiredPublicationFiles,
    },
  };
}

function createPublishedBasisAssetCopyPlan(): CompilerBundledAssetCopy[] {
  return LOCAL_BASIS_TRANSCODER_FILES.map((sourceFileName) => ({
    source: "three-basis" as const,
    sourceFileName,
    targetRelativePath: `public/${PUBLISHED_BASIS_TRANSCODER_DIRECTORY}/${sourceFileName}`,
  }));
}

/**
 * OpenBrush brushes render through `three-icosa`, which ships Parcel-bundled
 * identifiers (`$hash$var$name`) that always trip the platform's
 * `no-obfuscation` security rule. The same fact decides both the staged runtime
 * package and the published permission, so it is derived once here instead of
 * being re-scanned at each use.
 */
function projectUsesOpenBrushModels(assets: AssetManifest): boolean {
  return Object.values(assets.assets).some(
    (asset) =>
      asset.kind === "model" &&
      isOpenBrushModelMetadata(asset.importMetadata?.openBrush),
  );
}

function sceneUsesParticleRuntime(scene: SceneDocument): boolean {
  return Object.values(scene.entities).some((entity) =>
    entity.components.some(
      (component) => component.enabled && component.type === "particle-emitter",
    ),
  );
}

function sceneUsesAudioSourceRuntime(scene: SceneDocument): boolean {
  return Object.values(scene.entities).some((entity) =>
    entity.components.some((component) => component.type === "audio-source"),
  );
}

/**
 * True when a Scene has a trigger the published world has to run.
 *
 * Checked against the graph, not just the Component: a trigger whose graph has
 * no interact entry point emits nothing, so shipping the runtime for it would
 * add a module the world never uses.
 */
function sceneUsesInteractionTriggerRuntime(
  scene: SceneDocument,
  assets: AssetManifest,
): boolean {
  return Object.values(scene.entities).some((entity) =>
    entity.components.some((component) => {
      if (component.type !== "interaction-trigger" || !component.enabled) {
        return false;
      }
      const asset = assets.assets[component.interactivityAssetId];
      return (
        asset?.kind === "interactivity" &&
        hasXriftInteractionRuntimeWork(asset.extension)
      );
    }),
  );
}

function sceneUsesLightRuntime(scene: SceneDocument): boolean {
  return Object.values(scene.entities).some((entity) =>
    entity.components.some((component) => component.type === "light"),
  );
}

function sceneUsesTextPanelRuntime(scene: SceneDocument): boolean {
  return Object.values(scene.entities).some((entity) =>
    entity.components.some((component) => component.type === "text"),
  );
}

/**
 * Convenience boundary for the editor's initial single-scene project shape.
 * The compiler itself still consumes the multi-scene document set so adding
 * scene switching later does not change the staging contract.
 */
export function compilePrototypeVisualProject(
  prototype: PrototypeVisualProject,
  options: VisualCompilerOptions = {},
): VisualCompileResult {
  return compileVisualProject(
    {
      project: prototype.project,
      scenes: { [prototype.scene.sceneId]: prototype.scene },
      assets: prototype.assets,
      prefabs: prototype.prefabs,
    },
    options,
  );
}

export function computeSourceDocumentHashes(
  documents: VisualCompilerDocuments,
): SourceDocumentHash[] {
  const sources: Array<[string, string]> = [
    ["xrift-studio.project.json", serializeCompilerProjectSource(documents.project)],
    [documents.project.assetManifestPath, assetManifestCodec.serialize(documents.assets)],
  ];
  for (const [sceneId, relativePath] of Object.entries(
    documents.project.scenePaths,
  ).sort((left, right) => left[1].localeCompare(right[1]))) {
    const scene = documents.scenes[sceneId];
    if (scene) sources.push([relativePath, sceneDocumentCodec.serialize(scene)]);
  }
  const occupiedPaths = new Set(sources.map(([path]) => path));
  for (const [prefabId, prefab] of Object.entries(documents.prefabs ?? {}).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const declaredPaths = Object.values(documents.assets.assets)
      .flatMap((asset) => {
        const reference = getPrefabAssetDocumentReference(asset);
        return reference?.prefabId === prefabId ? [reference.prefabPath] : [];
      })
      .sort();
    const declaredPath = declaredPaths.find((path) => !occupiedPaths.has(path));
    const relativePath =
      declaredPath ??
      `.xrift-studio/unmapped-prefabs/${sha256Utf8(prefabId).slice(0, 24)}.prefab.json`;
    occupiedPaths.add(relativePath);
    sources.push([relativePath, prefabDocumentCodec.serialize(prefab)]);
  }
  return sources
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([path, content]) => ({ path, sha256: sha256Utf8(content) }));
}

/**
 * Publication history and audit timestamps do not affect generated XRift
 * output. Keeping them out of provenance prevents a successful upload or a
 * save-only timestamp update from making an otherwise fresh compilation stale.
 */
function serializeCompilerProjectSource(
  project: VisualCompilerDocuments["project"],
): string {
  return stableSerializeJson({
    ...project,
    metadata: {
      ...project.metadata,
      createdAt: undefined,
      updatedAt: undefined,
    },
    lastPublication: undefined,
  });
}

export function isVisualCompilationStale(
  provenance: CompilationProvenance,
  documents: VisualCompilerDocuments,
): boolean {
  return isCompilationStale(provenance, {
    sourceDocuments: computeSourceDocumentHashes(documents),
    compilerVersion: VISUAL_COMPILER_VERSION,
    targetKind: documents.project.projectKind,
  });
}

function validateCompilerDocuments(
  documents: VisualCompilerDocuments,
  diagnostics: CompilerDiagnostic[],
): void {
  const projectJson = visualProjectDocumentCodec.serialize(documents.project);
  const projectResult = visualProjectDocumentCodec.parse(projectJson);
  if (!projectResult.ok) {
    projectResult.issues.forEach((issue) =>
      diagnostics.push({
        severity: "blocking",
        code: `project-${issue.code}`,
        message: issue.message,
        fieldPath: issue.path,
      }),
    );
  }
  if (!documents.scenes[documents.project.entrySceneId]) {
    diagnostics.push({
      severity: "blocking",
      code: "entry-scene-missing",
      message: "entrySceneId に対応する Scene document がありません",
      fieldPath: "entrySceneId",
    });
  }
  for (const sceneId of Object.keys(documents.project.scenePaths).sort()) {
    const scene = documents.scenes[sceneId];
    if (!scene) {
      diagnostics.push({
        severity: "blocking",
        code: "scene-document-missing",
        message: `Scene document がありません: ${sceneId}`,
        sceneId,
      });
    } else if (scene.sceneId !== sceneId) {
      diagnostics.push({
        severity: "blocking",
        code: "scene-id-mismatch",
        message: `Scene document ID が scenePaths と一致しません: ${sceneId}`,
        sceneId,
        fieldPath: "sceneId",
      });
    } else if (sceneId !== documents.project.entrySceneId) {
      diagnostics.push({
        severity: "warning",
        code: "non-entry-scene-not-compiled",
        message: "現在の compiler は entry scene のみを XRift source に変換します",
        sceneId,
      });
    }
    if (scene) {
      validateXriftComponents(scene, documents.project.projectKind).forEach(
        (componentIssue) => {
          const compileBlockingWarning = [
            "unknown-xrift-component-schema",
            "unsupported-xrift-component-schema-version",
            "xrift-component-project-kind",
          ].includes(componentIssue.code);
          diagnostics.push({
            severity:
              componentIssue.severity === "error" || compileBlockingWarning
                ? "blocking"
                : "warning",
            code: componentIssue.code,
            message: componentIssue.message,
            sceneId,
            entityId: componentIssue.entityId,
            componentId: componentIssue.componentId,
            fieldPath: componentIssue.path,
          });
        },
      );
    }
  }
  for (const [prefabId, prefab] of Object.entries(documents.prefabs ?? {}).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const prefabJson = prefabDocumentCodec.serialize(prefab);
    const prefabResult = prefabDocumentCodec.parse(prefabJson);
    if (!prefabResult.ok) {
      prefabResult.issues.forEach((issue) =>
        diagnostics.push({
          severity: "blocking",
          code: `prefab-${issue.code}`,
          message: `Prefab「${prefabId}」: ${issue.message}`,
          prefabId,
          fieldPath: `prefabs.${prefabId}${issue.path.slice(1)}`,
        }),
      );
    }
    if (prefab.prefabId !== prefabId) {
      diagnostics.push({
        severity: "blocking",
        code: "prefab-id-mismatch",
        message: `Prefab document IDがrecord keyと一致しません: ${prefabId}`,
        prefabId,
        fieldPath: `prefabs.${prefabId}.prefabId`,
      });
    }
    appendXriftComponentDiagnostics(
      prefab,
      documents.project.projectKind,
      diagnostics,
      undefined,
      prefabId,
    );
  }
  const assetJson = assetManifestCodec.serialize(documents.assets);
  const assetResult = assetManifestCodec.parse(assetJson);
  if (!assetResult.ok) {
    assetResult.issues.forEach((issue) =>
      diagnostics.push({
        severity: "blocking",
        code: `asset-${issue.code}`,
        message: issue.message,
        fieldPath: issue.path,
      }),
    );
  }
}

function appendXriftComponentDiagnostics(
  document: unknown,
  projectKind: VisualProjectKind,
  diagnostics: CompilerDiagnostic[],
  sceneId?: string,
  prefabId?: string,
): void {
  validateSerializedXriftComponents(document, projectKind).forEach(
    (componentIssue) => {
      const compileBlockingWarning = [
        "unknown-xrift-component-schema",
        "unsupported-xrift-component-schema-version",
        "xrift-component-project-kind",
      ].includes(componentIssue.code);
      diagnostics.push({
        severity:
          componentIssue.severity === "error" || compileBlockingWarning
            ? "blocking"
            : "warning",
        code: componentIssue.code,
        message: componentIssue.message,
        sceneId,
        prefabId,
        entityId: componentIssue.entityId,
        componentId: componentIssue.componentId,
        fieldPath: componentIssue.path,
      });
    },
  );
}

/**
 * Emits one Script Component mount.
 *
 * Order is a running counter over the same Entity-then-Component walk Play
 * uses, so relative update order matches between the editor and the world.
 */
function renderScript(
  entity: SceneEntity,
  component: Extract<RegisteredSceneComponent, { type: "script" }>,
  context: CompileContext,
): string | null {
  const order = context.scriptOrder.next;
  context.scriptOrder.next += 1;
  const module = context.scriptModules.get(component.scriptAssetId);
  if (!module) {
    addDiagnostic(
      context,
      componentDiagnostic(
        entity,
        component.id,
        "script-module-missing",
        "Script Assetを出力できなかったためScriptを配置しません",
        component.scriptAssetId,
      ),
    );
    return null;
  }
  for (const assetId of component.assetReferences) {
    context.referencedAssetIds.add(assetId);
  }
  context.usesScriptRuntime = true;
  context.extraImports.add(
    `import { XriftScriptHost, XriftScriptRoot } from "./xrift-studio/script-host";`,
  );
  context.imports.add("useXRift");
  context.reactTypeImports.add("PropsWithChildren");
  context.supportDeclarations.set(
    "script-runtime:published-root",
    `const XriftPublishedScriptRoot: FC<PropsWithChildren> = ({ children }) => {
  const { baseUrl } = useXRift();
  return <XriftScriptRoot assetBaseUrl={baseUrl}>{children}</XriftScriptRoot>;
};`,
  );
  const renderImport = module.renderImportName
    ? `, { Render as ${module.renderImportName} }`
    : "";
  context.extraImports.add(
    `import ${module.importName}${renderImport} from "${module.importSpecifier}";`,
  );
  const assetRuntimeDescriptors = Object.fromEntries(
    createScriptAssetRuntimeDescriptorMap(
      context.assets,
      component.assetReferences,
      (assetId) => context.assetRuntimeUrls.get(assetId),
    ),
  );
  return renderScriptComponent(
    component,
    module,
    entity.id,
    entity.name,
    order,
    assetRuntimeDescriptors,
  );
}

type ResolvedInteractionTrigger = {
  component: Extract<RegisteredSceneComponent, { type: "interaction-trigger" }>;
  extension: unknown;
  actionCount: number;
  /** How many `xrift/onInteract` entry points the graph has. */
  interactPrograms: number;
};

function collectInteractionTriggerTargetEntityIds(
  scene: SceneDocument,
  assets: AssetManifest,
): ReadonlySet<string> {
  const targets = new Set<string>();
  for (const entity of Object.values(scene.entities)) {
    for (const component of entity.components as RegisteredSceneComponent[]) {
      if (component.type !== "interaction-trigger" || !component.enabled) continue;
      const asset = assets.assets[component.interactivityAssetId];
      if (asset?.kind !== "interactivity") continue;
      for (const program of collectXriftInteractionPrograms(asset.extension)) {
        for (const action of program.actions) {
          // The owner is already in the Scene by definition, and it is not
          // known here anyway — the same graph can sit on several Entities.
          if (action.entityId === XRIFT_INTERACTION_SELF_ENTITY_ID) continue;
          targets.add(action.entityId);
        }
      }
    }
  }
  return targets;
}

/**
 * Resolves this Entity's triggers before its Components are rendered.
 *
 * The Interactable that starts a trigger is a different Component, and it may
 * be rendered first, so whether `onInteract` needs wiring has to be known
 * before the walk reaches either of them.
 */
function resolveInteractionTriggers(
  entity: SceneEntity,
  context: CompileContext,
): ResolvedInteractionTrigger[] {
  const resolved: ResolvedInteractionTrigger[] = [];
  for (const component of entity.components as RegisteredSceneComponent[]) {
    if (component.type !== "interaction-trigger" || !component.enabled) continue;
    const asset = context.assets.assets[component.interactivityAssetId];
    if (asset?.kind !== "interactivity") {
      addDiagnostic(
        context,
        componentDiagnostic(
          entity,
          component.id,
          "interaction-trigger-asset-missing",
          "Interaction Triggerが参照するInteractivity Assetがありません",
          component.interactivityAssetId,
        ),
      );
      continue;
    }
    const programs = collectXriftInteractionPrograms(asset.extension);
    const actionCount = programs.reduce(
      (total, program) => total + program.actions.length,
      0,
    );
    // A graph that starts itself needs the runtime even with no interact entry:
    // a timeline on `event/onStart` is the whole point of one. Only a graph
    // with neither kind of entry point is inert, and that is worth saying.
    if (programs.length === 0 && !hasXriftSelfStartingEntry(asset.extension)) {
      addDiagnostic(context, {
        severity: "warning",
        code: "interaction-trigger-without-event",
        message:
          "Interactivity Graphに開始のnodeがないため、公開先では何も起きません",
        sceneId: context.scene.sceneId,
        entityId: entity.id,
        componentId: component.id,
        assetId: asset.id,
      });
      continue;
    }
    resolved.push({
      component,
      extension: asset.extension,
      actionCount,
      interactPrograms: programs.length,
    });
  }
  if (
    // Only a graph someone is meant to press needs an Interactable. Warning
    // about one on a graph that starts itself would be noise on every timeline.
    resolved.some((candidate) => candidate.interactPrograms > 0) &&
    !entity.components.some(
      (candidate) =>
        candidate.type === "xrift-component" &&
        candidate.schemaId === XRIFT_COMPONENT_SCHEMA_IDS.interactable &&
        candidate.enabled,
    )
  ) {
    addDiagnostic(context, {
      severity: "warning",
      code: "interaction-trigger-without-interactable",
      message:
        "EntityにInteractableがないため、公開先でこのTriggerを押せません",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: resolved.find((candidate) => candidate.interactPrograms > 0)
        ?.component.id,
    });
  }
  return resolved;
}

function interactionGraphIdentifier(assetId: string): string {
  return `XriftInteractionGraph_${assetId.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

function renderInteractionTrigger(
  resolved: ResolvedInteractionTrigger,
  entity: SceneEntity,
  order: number,
  context: CompileContext,
): string {
  context.extraImports.add(
    'import { XriftInteractionTriggerRuntime, emitXriftInteraction } from "./xrift-studio/interaction-trigger-runtime";',
  );
  const identifier = interactionGraphIdentifier(
    resolved.component.interactivityAssetId,
  );
  // One declaration per graph Asset, so two Entities sharing a graph publish
  // one copy of its canonical JSON.
  context.supportDeclarations.set(
    `interaction-trigger:${resolved.component.interactivityAssetId}`,
    `const ${identifier} = ${JSON.stringify(resolved.extension)};`,
  );
  return `<XriftInteractionTriggerRuntime entityId=${JSON.stringify(
    entity.id,
  )} componentId=${JSON.stringify(
    resolved.component.id,
  )} order={${order}} graph={${identifier}} />`;
}

function generateComponentSource(
  projectKind: VisualProjectKind,
  scene: SceneDocument,
  assets: AssetManifest,
  assetCopyPlan: readonly AssetCopyPlanEntry[],
  diagnostics: CompilerDiagnostic[],
  scriptModules: ReadonlyMap<string, EmittedScriptModule> = new Map(),
): string {
  const context: CompileContext = {
    projectKind,
    scene,
    assets,
    diagnostics,
    diagnosticKeys: new Set(),
    imports: new Set(),
    extraImports: new Set(),
    reactValueImports: new Set(),
    reactTypeImports: new Set(["FC"]),
    fiberImports: new Set(),
    dreiImports: new Set(),
    rapierImports: new Set(),
    threeValueImports: new Set(),
    threeTypeImports: new Set(),
    supportDeclarations: new Map(),
    assetRuntimeUrls: new Map(
      assetCopyPlan
        .filter((entry) => entry.supportedByCompiler)
        .map((entry) => [entry.assetId, publicAssetPath(entry.targetRelativePath)]),
    ),
    referencedAssetIds: new Set(),
    visitedEntityIds: new Set(),
    activeEntityIds: new Set(),
    usesDoubleSide: false,
    scriptModules,
    scriptOrder: { next: 0 },
    usesScriptRuntime: false,
    interactionTriggerTargetEntityIds: collectInteractionTriggerTargetEntityIds(
      scene,
      assets,
    ),
  };
  const sceneSettings = resolveSceneSettings(scene.settings);
  const sceneEnvironment = renderSceneEnvironment(sceneSettings, context);
  const roots = scene.rootEntityIds.flatMap((entityId) => {
    const rendered = renderEntity(entityId, context, 0);
    return rendered ? [rendered] : [];
  });
  for (const entityId of Object.keys(scene.entities).sort()) {
    if (!context.visitedEntityIds.has(entityId)) {
      addDiagnostic(context, {
        severity: "warning",
        code: "orphan-entity-not-compiled",
        message: "rootEntityIds から到達できない Entity は変換されません",
        sceneId: scene.sceneId,
        entityId,
      });
    }
  }
  diagnoseReferencedUnsupportedAssets(context);

  const worldImports = [...context.imports].sort();
  const threeValueImports = new Set(context.threeValueImports);
  if (context.usesDoubleSide) threeValueImports.add("DoubleSide");
  // A value import already binds the name in type space too, so emitting the
  // same identifier again in the `import type` line is a TS2300 duplicate that
  // fails the published project's tsc run. Value imports win; only names that
  // are never needed as values stay type-only.
  const reactTypeImports = [...context.reactTypeImports]
    .filter((name) => !context.reactValueImports.has(name))
    .sort();
  const threeTypeImports = [...context.threeTypeImports]
    .filter((name) => !threeValueImports.has(name))
    .sort();
  const imports = [
    ...[...context.extraImports].sort(),
    ...(reactTypeImports.length > 0
      ? [`import type { ${reactTypeImports.join(", ")} } from "react";`]
      : []),
    ...(context.reactValueImports.size > 0
      ? [`import { ${[...context.reactValueImports].sort().join(", ")} } from "react";`]
      : []),
    ...(context.fiberImports.size > 0
      ? [`import { ${[...context.fiberImports].sort().join(", ")} } from "@react-three/fiber";`]
      : []),
    ...(worldImports.length > 0
      ? [`import { ${worldImports.join(", ")} } from "@xrift/world-components";`]
      : []),
    ...(context.dreiImports.size > 0
      ? [`import { ${[...context.dreiImports].sort().join(", ")} } from "@react-three/drei";`]
      : []),
    ...(context.rapierImports.size > 0
      ? [`import { ${[...context.rapierImports].sort().join(", ")} } from "@react-three/rapier";`]
      : []),
    ...(threeTypeImports.length > 0
      ? [`import type { ${threeTypeImports.join(", ")} } from "three";`]
      : []),
    ...(threeValueImports.size > 0
      ? [`import { ${[...threeValueImports].sort().join(", ")} } from "three";`]
      : []),
  ];
  const declarations = [...context.supportDeclarations.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, declaration]) => declaration)
    .join("\n\n");
  if (declarations) imports.push("", declarations);
  const renderedScene = [...sceneEnvironment, ...roots];
  const sceneBody = renderedScene.length > 0
    ? renderedScene
        .map((entry) => indent(entry, context.usesScriptRuntime ? 4 : 3))
        .join("\n")
    : context.usesScriptRuntime
      ? "        {null}"
      : "      {null}";
  const body = context.usesScriptRuntime
    ? `      <XriftPublishedScriptRoot>\n${sceneBody}\n      </XriftPublishedScriptRoot>`
    : sceneBody;
  const scriptScopeProperty = context.usesScriptRuntime
    ? " userData={{ xriftScriptScope: true }}"
    : "";
  if (projectKind === "world") {
    return `${imports.join("\n")}\n\nexport interface WorldProps {\n  position?: [number, number, number];\n  scale?: number;\n}\n\nexport const World: FC<WorldProps> = ({ position = [0, 0, 0], scale = 1 }) => (\n  <group position={position} scale={scale}${scriptScopeProperty}>\n${body}\n  </group>\n);\n`;
  }
  return `${imports.join("\n")}\n\nexport interface ItemProps {\n  position?: [number, number, number];\n  scale?: number;\n}\n\nexport const Item: FC<ItemProps> = ({ position = [0, 0, 0], scale = 1 }) => (\n  <group position={position} scale={scale}${scriptScopeProperty}>\n${body}\n  </group>\n);\n\nexport default Item;\n`;
}

const PROJECTED_SKYBOX_VERTEX_SHADER = `
varying vec3 vDirection;
uniform vec3 uCenter;
void main() {
  vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 worldCenter = (modelMatrix * vec4(uCenter, 1.0)).xyz;
  vDirection = worldPosition - worldCenter;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PROJECTED_SKYBOX_FRAGMENT_SHADER = `
uniform sampler2D uTexture;
uniform bool uHasTexture;
uniform vec3 uTopColor;
uniform vec3 uBottomColor;
uniform float uOffset;
uniform float uExponent;
uniform float uExposure;
uniform float uRotation;
varying vec3 vDirection;
void main() {
  vec3 direction = normalize(vDirection);
  vec3 color;
  if (uHasTexture) {
    vec2 uv = vec2(
      atan(direction.z, direction.x) * 0.15915494309189535 + 0.5,
      asin(clamp(direction.y, -1.0, 1.0)) * 0.3183098861837907 + 0.5
    );
    uv.x = fract(uv.x + uRotation * 0.15915494309189535);
    color = texture2D(uTexture, uv).rgb;
  } else {
    float t = clamp(direction.y * 0.5 + 0.5 + uOffset, 0.0, 1.0);
    t = pow(t, max(uExponent, 0.01));
    color = mix(uBottomColor, uTopColor, t);
  }
  gl_FragColor = vec4(color * uExposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * The sky mesh factory shared by the gradient/image sky and the Sky Shader, so
 * both slots place the sky with the same projection, tripod center and scale.
 */
function skyGeometryFactorySource(
  settings: SceneSettings,
  context: CompileContext,
): string {
  const skybox = settings.skybox;
  context.threeValueImports.add(
    skybox.projection === "box" ? "BoxGeometry" : "SphereGeometry",
  );
  return skybox.projection === "box"
    ? `const next = new BoxGeometry(1, 1, 1);
    next.translate(0, 0.5, 0);
    return next;`
    : skybox.projection === "dome"
      ? `const next = new SphereGeometry(0.5, 50, 50);
    const position = next.attributes.position;
    const radius = 0.5;
    const bottomLimit = 0.1;
    const curvatureRadiusSquared = 0.95 * 0.95;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index) / radius;
      let y = position.getY(index) / radius;
      const z = position.getZ(index) / radius;
      if (y < 0) {
        y *= 0.3;
        if (x * x + z * z < curvatureRadiusSquared) y = -bottomLimit;
      }
      position.setY(index, (y + bottomLimit) * radius);
    }
    position.needsUpdate = true;
    next.computeVertexNormals();
    next.computeBoundingBox();
    next.computeBoundingSphere();
    return next;`
      : "return new SphereGeometry(1, 32, 20);";
}

/** The `<mesh>` attributes that place the sky for the current projection. */
function skyMeshPlacementProps(
  settings: SceneSettings,
  refAttribute: string,
): string {
  const skybox = settings.skybox;
  if (skybox.projection === "infinite") {
    return `${refAttribute}
      scale={100}`;
  }
  const meshRotation = skybox.meshRotationDegrees
    .map((value) => formatNumber((value * Math.PI) / 180))
    .join(", ");
  return `position={[${skybox.meshPosition.map(formatNumber).join(", ")}]}
      rotation={[${meshRotation}]}
      scale={[${skybox.meshScale.map(formatNumber).join(", ")}]}`;
}

/**
 * Emits the Sky Shader slot: the scene's Custom Shader Material drawn on the
 * sky mesh instead of the gradient. Uniform values are literals, exactly as the
 * Mesh Renderer path emits them, and Scene Settings drives the framing uniforms
 * the shader declares.
 */
function registerSkyShaderSupport(
  settings: SceneSettings,
  shader: ClassicR3fMaterialShader,
  context: CompileContext,
): void {
  const skybox = settings.skybox;
  context.reactValueImports.add("useEffect");
  context.reactValueImports.add("useMemo");
  context.threeValueImports.add("BackSide");
  const geometryFactory = skyGeometryFactorySource(settings, context);
  const driven = new Map(
    skyShaderDrivenUniforms(shader, skybox).map((entry) => [entry.name, entry]),
  );
  const uniformEntries: string[] = [];
  for (const [name, uniform] of Object.entries(shader.uniforms)) {
    const override = driven.get(name);
    if (override) {
      if (override.kind === "number") {
        uniformEntries.push(
          `${JSON.stringify(name)}: { value: ${formatNumber(override.value)} }`,
        );
      } else {
        context.threeValueImports.add("Vector3");
        uniformEntries.push(
          `${JSON.stringify(name)}: { value: new Vector3(${override.value.map(formatNumber).join(", ")}) }`,
        );
      }
      continue;
    }
    if (uniform.kind === "number") {
      uniformEntries.push(
        `${JSON.stringify(name)}: { value: ${formatNumber(uniform.value)} }`,
      );
      continue;
    }
    if (uniform.kind === "color") {
      context.threeValueImports.add("Color");
      uniformEntries.push(
        `${JSON.stringify(name)}: { value: new Color(${JSON.stringify(uniform.value)}) }`,
      );
      continue;
    }
    if (uniform.kind === "vector") {
      const vectorType =
        uniform.value.length === 2
          ? "Vector2"
          : uniform.value.length === 3
            ? "Vector3"
            : "Vector4";
      context.threeValueImports.add(vectorType);
      uniformEntries.push(
        `${JSON.stringify(name)}: { value: new ${vectorType}(${uniform.value.map(formatNumber).join(", ")}) }`,
      );
      continue;
    }
    // Texture uniforms are resolved by the Mesh Renderer path, which the sky
    // mesh does not go through. Emitting null keeps the world compiling while
    // the diagnostic tells the author which uniform lost its Texture.
    uniformEntries.push(`${JSON.stringify(name)}: { value: null }`);
  }

  const timeUniforms = detectTimeUniforms(shader);
  const followsCamera = skybox.projection === "infinite";
  if (followsCamera || timeUniforms.length > 0) {
    context.reactValueImports.add("useRef");
    context.fiberImports.add("useFrame");
  }
  if (followsCamera) context.threeTypeImports.add("Mesh");
  if (timeUniforms.length > 0) context.threeTypeImports.add("ShaderMaterial");
  const variant =
    shader.variants.find((candidate) => !candidate.meshNameIncludes) ??
    shader.variants[0];
  const frameBody = [
    followsCamera
      ? `    if (meshRef.current) meshRef.current.position.copy(camera.position);`
      : "",
    ...timeUniforms.map((spec) => {
      if (spec.glslType === "vec4") {
        return `    {
      const uniform = materialRef.current?.uniforms[${JSON.stringify(spec.name)}];
      if (uniform) {
        const value = uniform.value;
        if (value && "set" in value) {
          value.set(elapsed / 20, elapsed, elapsed * 2, elapsed * 3);
        } else {
          uniform.value = [elapsed / 20, elapsed, elapsed * 2, elapsed * 3];
        }
      }
    }`;
      }
      return `    if (materialRef.current?.uniforms[${JSON.stringify(spec.name)}]) { materialRef.current.uniforms[${JSON.stringify(spec.name)}].value = elapsed; }`;
    }),
  ].filter(Boolean);
  // Only the values the callback actually reads are destructured, so the
  // generated World stays clean under a strict unused-locals setting.
  const frameArguments = [
    ...(followsCamera ? ["camera"] : []),
    ...(timeUniforms.length > 0 ? ["clock"] : []),
  ];
  const frameCode =
    frameBody.length > 0
      ? `  useFrame(({ ${frameArguments.join(", ")} }) => {
${timeUniforms.length > 0 ? "    const elapsed = clock.getElapsedTime();\n" : ""}${frameBody.join("\n")}
  });
`
      : "";

  context.supportDeclarations.set(
    "scene-environment:sky-shader",
    `const XRiftStudioSkyShader: FC = () => {
${followsCamera ? "  const meshRef = useRef<Mesh>(null);\n" : ""}${timeUniforms.length > 0 ? "  const materialRef = useRef<ShaderMaterial>(null);\n" : ""}  const geometry = useMemo(() => {
    ${geometryFactory}
  }, []);
  const uniforms = useMemo(() => ({
    ${uniformEntries.join(",\n    ")}
  }), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
${frameCode}  return (
    <mesh
      geometry={geometry}
      ${skyMeshPlacementProps(settings, followsCamera ? "ref={meshRef}" : "")}
      frustumCulled={false}
      renderOrder={-1}
    >
      <shaderMaterial
        ${timeUniforms.length > 0 ? "ref={materialRef}" : ""}
        side={BackSide}
        depthTest={false}
        depthWrite={false}
        vertexShader={${JSON.stringify(shader.vertexShader)}}
        fragmentShader={${JSON.stringify(shader.fragmentShader)}}
        uniforms={uniforms}
        defines={${JSON.stringify(variant.defines)}}
      />
    </mesh>
  );
};`,
  );
}

function registerProjectedSkyboxSupport(
  settings: SceneSettings,
  context: CompileContext,
): void {
  const skybox = settings.skybox;
  context.reactValueImports.add("useEffect");
  context.reactValueImports.add("useMemo");
  if (skybox.projection === "infinite") {
    context.reactValueImports.add("useRef");
    context.fiberImports.add("useFrame");
    context.threeTypeImports.add("Mesh");
  }
  if (skybox.iblEnabled) context.fiberImports.add("useThree");
  ["BackSide", "Color", "Vector3"].forEach((name) =>
    context.threeValueImports.add(name),
  );
  context.threeTypeImports.add("Texture");
  const geometryFactory =
    skybox.projection === "box"
      ? `const next = new BoxGeometry(1, 1, 1);
    next.translate(0, 0.5, 0);
    return next;`
      : skybox.projection === "dome"
        ? `const next = new SphereGeometry(0.5, 50, 50);
    const position = next.attributes.position;
    const radius = 0.5;
    const bottomLimit = 0.1;
    const curvatureRadiusSquared = 0.95 * 0.95;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index) / radius;
      let y = position.getY(index) / radius;
      const z = position.getZ(index) / radius;
      if (y < 0) {
        y *= 0.3;
        if (x * x + z * z < curvatureRadiusSquared) y = -bottomLimit;
      }
      position.setY(index, (y + bottomLimit) * radius);
    }
    position.needsUpdate = true;
    next.computeVertexNormals();
    next.computeBoundingBox();
    next.computeBoundingSphere();
    return next;`
        : "return new SphereGeometry(1, 32, 20);";
  context.threeValueImports.add(
    skybox.projection === "box" ? "BoxGeometry" : "SphereGeometry",
  );
  const meshRotation = skybox.meshRotationDegrees
    .map((value) => formatNumber((value * Math.PI) / 180))
    .join(", ");
  const center = (skybox.projection === "infinite" ? [0, 0, 0] : skybox.center)
    .map(formatNumber)
    .join(", ");
  const position = skybox.meshPosition.map(formatNumber).join(", ");
  const scale = skybox.meshScale.map(formatNumber).join(", ");
  context.supportDeclarations.set(
    "scene-environment:projected-skybox",
    `const XRiftStudioProjectedSkybox: FC<{ texture: Texture | null }> = ({ texture }) => {
${skybox.iblEnabled ? "  const scene = useThree((state) => state.scene);" : ""}
${skybox.projection === "infinite" ? "  const meshRef = useRef<Mesh>(null);" : ""}
  const geometry = useMemo(() => {
    ${geometryFactory}
  }, []);
  const uniforms = useMemo(() => ({
    uTexture: { value: texture },
    uHasTexture: { value: Boolean(texture) },
    uTopColor: { value: new Color(${JSON.stringify(skybox.topColor)}) },
    uBottomColor: { value: new Color(${JSON.stringify(skybox.bottomColor)}) },
    uOffset: { value: ${formatNumber(skybox.offset)} },
    uExponent: { value: ${formatNumber(skybox.exponent)} },
    uExposure: { value: ${formatNumber(skybox.exposure)} },
    uRotation: { value: ${formatNumber((skybox.rotationDegrees * Math.PI) / 180)} },
    uCenter: { value: new Vector3(${center}) },
  }), [texture]);
  useEffect(() => () => geometry.dispose(), [geometry]);
${skybox.projection === "infinite" ? `  useFrame(({ camera }) => {
    if (meshRef.current) meshRef.current.position.copy(camera.position);
  });
` : ""}
${skybox.iblEnabled ? `
  useEffect(() => {
    if (!texture) return;
    const previousEnvironment = scene.environment;
    const previousEnvironmentIntensity = scene.environmentIntensity;
    const previousEnvironmentRotation = scene.environmentRotation.clone();
    scene.environment = texture;
    scene.environmentIntensity = ${formatNumber(skybox.exposure)};
    scene.environmentRotation.set(0, ${formatNumber((skybox.rotationDegrees * Math.PI) / 180)}, 0);
    return () => {
      scene.environment = previousEnvironment;
      scene.environmentIntensity = previousEnvironmentIntensity;
      scene.environmentRotation.copy(previousEnvironmentRotation);
    };
  }, [scene, texture]);
` : ""}
  return (
    <mesh
      ${skybox.projection === "infinite" ? "ref={meshRef}" : ""}
      geometry={geometry}
      ${skybox.projection === "infinite" ? "scale={100}" : `position={[${position}]}
      rotation={[${meshRotation}]}
      scale={[${scale}]}`}
      frustumCulled={false}
      renderOrder={-1}
    >
      <shaderMaterial
        side={BackSide}
        depthTest={false}
        depthWrite={false}
        vertexShader={${JSON.stringify(PROJECTED_SKYBOX_VERTEX_SHADER)}}
        fragmentShader={${JSON.stringify(PROJECTED_SKYBOX_FRAGMENT_SHADER)}}
        uniforms={uniforms}
      />
    </mesh>
  );
};`,
  );
}

/**
 * Ships the compositor into the published world as an overlay module.
 *
 * The generated world used to carry its own copy of the whole pipeline as a
 * string template — a second implementation of tone mapping, SSAO, Bloom and
 * now colour grading, maintained by hand beside the editor's. Emitting the
 * real module is the same thing light, audio and particle runtimes already do,
 * and it is what keeps a published world graded the way the editor showed it.
 */
function registerScenePostprocessingSupport(context: CompileContext): void {
  context.extraImports.add(
    'import { ScenePostprocessing } from "./xrift-studio/scene-postprocessing";',
  );
}

/** Colour handling without the compositor, for scenes with post effects off. */
/**
 * The staging directory a project compiles into. It depends only on the
 * project's identity, so recovery paths can find a previous attempt's staging
 * without recompiling the project first.
 */
export function compilerStagingDirectoryName(
  projectId: string,
  projectKind: VisualProjectKind,
): string {
  return [
    "xrift-studio",
    projectKind,
    safeFileSegment(projectId).slice(0, 72),
    sha256Utf8(projectId).slice(0, 12),
  ].join("-");
}

function registerSceneToneMappingSupport(
  settings: ScenePostprocessingSettings,
  context: CompileContext,
): void {
  context.reactValueImports.add("useEffect");
  context.fiberImports.add("useThree");
  // Only the constant this scene actually uses: an unused import would fail a
  // generated World built under noUnusedLocals.
  const toneMapping =
    settings.hdr.toneMapping === "none"
      ? "NoToneMapping"
      : "ACESFilmicToneMapping";
  context.threeValueImports.add(toneMapping);
  context.threeValueImports.add("SRGBColorSpace");
  context.supportDeclarations.set(
    "scene-environment:tone-mapping",
    `const XRiftStudioToneMapping: FC = () => {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const previousToneMapping = gl.toneMapping;
    const previousExposure = gl.toneMappingExposure;
    const previousOutputColorSpace = gl.outputColorSpace;
    gl.outputColorSpace = SRGBColorSpace;
    gl.toneMapping = ${toneMapping};
    gl.toneMappingExposure = ${formatNumber(settings.exposure)};
    return () => {
      gl.toneMapping = previousToneMapping;
      gl.toneMappingExposure = previousExposure;
      gl.outputColorSpace = previousOutputColorSpace;
    };
  }, [gl]);
  return null;
};`,
  );
}

function registerVegetationWindSupport(
  settings: SceneSettings["vegetation"],
  context: CompileContext,
): void {
  const vegetationTargets = Object.values(context.scene.entities).flatMap(
    (entity) =>
      entity.components
        .filter((component) => component.type === "vegetation-wind")
        .map((component) => ({
          entityId: entity.id,
          enabled: component.enabled,
        })),
  );
  if (vegetationTargets.length === 0) return;
  context.reactValueImports.add("useLayoutEffect");
  context.reactValueImports.add("useState");
  context.fiberImports.add("useFrame");
  context.fiberImports.add("useThree");
  context.supportDeclarations.set(
    "scene-environment:vegetation",
    `const XRiftStudioWind: FC<{ settings: ${JSON.stringify(settings)}; targets: ReadonlyArray<{ entityId: string; enabled: boolean }> }> = ({ settings, targets: windTargets }) => {
  const { scene } = useThree();
  const [targets, setTargets] = useState<Array<{ object: any; position: any; rotation: any; phase: number; componentEnabled: boolean }>>([]);
  useLayoutEffect(() => {
    const targetSettings = new Map(windTargets.map((target) => [target.entityId, target]));
    const seen = new Set<any>();
    const found: Array<{ object: any; position: any; rotation: any; phase: number; componentEnabled: boolean }> = [];
    scene.traverse((root: any) => {
      const component = targetSettings.get(root.userData?.xriftEntityId);
      if (!component) return;
      root.traverse((object: any) => {
        if (!object.isMesh || seen.has(object)) return;
        seen.add(object);
        found.push({ object, position: object.position.clone(), rotation: object.rotation.clone(), phase: found.length * 0.73, componentEnabled: component.enabled });
      });
    });
    setTargets(found);
  }, [scene, windTargets]);
  useFrame(({ clock }) => {
    if (!settings.enabled || targets.length === 0) return;
    const elapsed = clock.getElapsedTime();
    for (const target of targets) {
      if (!target.componentEnabled) continue;
      const wave = Math.sin(elapsed * settings.windSpeed + target.phase) * 0.7 +
        Math.sin(elapsed * settings.windSpeed * 0.37 + target.phase * 1.7) * settings.gustStrength;
      target.object.position.copy(target.position);
      target.object.position.x += wave * settings.windStrength * 0.03;
      target.object.position.y += Math.cos(elapsed * settings.windSpeed * 0.63 + target.phase) * settings.windStrength * 0.01;
      target.object.rotation.copy(target.rotation);
      target.object.rotation.z += wave * settings.windStrength * 0.35;
      target.object.rotation.x += wave * settings.windStrength * 0.16;
    }
  });
  return null;
};`,
  );
}

function renderSceneEnvironment(
  settings: SceneSettings,
  context: CompileContext,
): string[] {
  const content: string[] = [];
  // Only when the Scene asks for it: a flat fill lifts every surface with no
  // direction, which is what made an unlit floor read as its own colour.
  if (settings.ambient.enabled) {
    content.push(
      `<ambientLight color={${JSON.stringify(settings.ambient.color)}} intensity={${formatNumber(settings.ambient.intensity)}} />`,
    );
  }

  if (settings.postprocessing.enabled) {
    registerScenePostprocessingSupport(context);
    content.push(
      `<ScenePostprocessing settings={${JSON.stringify(settings.postprocessing)}} />`,
    );
  } else {
    // The compositor is off, but its colour handling is not: dropping ACES and
    // the exposure would shift every material in the scene. Only the passes go
    // away, so a world that never asked for bloom or AO stops paying for an HDR
    // target and an SSAO buffer it never reads.
    registerSceneToneMappingSupport(settings.postprocessing, context);
    content.push("<XRiftStudioToneMapping />");
  }
  // Scene-wide graph writes. Emitted only where a graph can send them, so a
  // world with no behavior never carries the overlay or the extra frame work.
  if (sceneUsesInteractionTriggerRuntime(context.scene, context.assets)) {
    context.extraImports.add(
      'import { XriftSceneRuntime } from "./xrift-studio/scene-runtime";',
    );
    content.push("<XriftSceneRuntime />");
  }
  registerVegetationWindSupport(settings.vegetation, context);
  const hasVegetationWind = Object.values(context.scene.entities).some((entity) =>
    entity.components.some((component) => component.type === "vegetation-wind"),
  );
  if (hasVegetationWind) {
    const vegetationTargets = Object.values(context.scene.entities).flatMap(
      (entity) =>
        entity.components
          .filter((component) => component.type === "vegetation-wind")
          .map((component) => ({
            entityId: entity.id,
            enabled: component.enabled,
          })),
    );
    content.push(
      `<XRiftStudioWind settings={${JSON.stringify(settings.vegetation)} } targets={${JSON.stringify(vegetationTargets)} } />`,
    );
  }

  const skyShader = resolveSkyShaderMaterial(
    context.assets,
    settings.skybox.materialAssetId,
  );
  if (settings.skybox.materialAssetId && skyShader.status === "unavailable") {
    addDiagnostic(context, {
      severity: "warning",
      code: "sky-shader-unavailable",
      message: `${skyShader.reason}。空をグラデーションに戻しました`,
      sceneId: context.scene.sceneId,
      assetId: skyShader.assetId,
      fieldPath: "settings.skybox.materialAssetId",
    });
  }
  if (settings.skybox.enabled && skyShader.status === "ready") {
    context.referencedAssetIds.add(skyShader.asset.id);
    const textureUniforms = skyShaderTextureUniformNames(skyShader.shader);
    if (textureUniforms.length > 0) {
      addDiagnostic(context, {
        severity: "warning",
        code: "sky-shader-texture-unsupported",
        message: `Skybox Shader「${skyShader.asset.name}」のTexture uniform（${textureUniforms.join("、")}）は空スロットでは解決できません。手続き的なuniformだけを使ってください`,
        sceneId: context.scene.sceneId,
        assetId: skyShader.asset.id,
        fieldPath: "settings.skybox.materialAssetId",
      });
    }
    registerSkyShaderSupport(settings, skyShader.shader, context);
    content.push("<XRiftStudioSkyShader />");
  }
  // A Sky Shader replaces the visible background but not image-based lighting,
  // so the image path still runs when IBL is on.
  const skyboxBackgroundEnabled =
    settings.skybox.enabled && skyShader.status !== "ready";
  if (skyboxBackgroundEnabled || settings.skybox.iblEnabled) {
    const projectedSkybox =
      skyboxBackgroundEnabled && settings.skybox.projection !== "infinite";
    if (projectedSkybox) registerProjectedSkyboxSupport(settings, context);
    const imageAssetId = settings.skybox.imageAssetId;
    const imageAsset = imageAssetId ? context.assets.assets[imageAssetId] : undefined;
    const imageUrl = imageAssetId ? context.assetRuntimeUrls.get(imageAssetId) : undefined;
    if (
      imageAssetId &&
      (imageAsset?.kind === "texture" || imageAsset?.kind === "skybox") &&
      imageUrl
    ) {
      context.referencedAssetIds.add(imageAssetId);
      const imageAssetPath = registerAssetUrl(imageAsset, imageUrl, context);
      if (!projectedSkybox) context.reactValueImports.add("useEffect");
      if (projectedSkybox) context.reactValueImports.add("useMemo");
      context.fiberImports.add("useLoader");
      if (!projectedSkybox) context.fiberImports.add("useThree");
      context.threeValueImports.add("EquirectangularReflectionMapping");
      const textureSourceFormat =
        imageAsset.kind === "texture"
          ? getTextureSourceFormat(imageAsset)
          : undefined;
      const hdrSkybox =
        (imageAsset.kind === "skybox" && imageAsset.sourceFormat === "hdr") ||
        textureSourceFormat === "hdr";
      const exrSkybox =
        (imageAsset.kind === "skybox" && imageAsset.sourceFormat === "exr") ||
        textureSourceFormat === "exr";
      const resolvedFlipY =
        imageAsset.kind === "texture"
          ? imageAsset.importSettings.flipY !== settings.skybox.flipY
          : settings.skybox.flipY;
      const loaderName = hdrSkybox
        ? "HDRLoader"
        : exrSkybox
          ? "EXRLoader"
          : "TextureLoader";
      const imageBackgroundSnapshot = skyboxBackgroundEnabled
        ? `    const previousBackground = scene.background;
    const previousBackgroundIntensity = scene.backgroundIntensity;
    const previousBackgroundRotation = scene.backgroundRotation.clone();`
        : "";
      const imageIblSnapshot = settings.skybox.iblEnabled
        ? `    const previousEnvironment = scene.environment;
    const previousEnvironmentIntensity = scene.environmentIntensity;
    const previousEnvironmentRotation = scene.environmentRotation.clone();`
        : "";
      const imageBackgroundApply = skyboxBackgroundEnabled
        ? `    scene.background = texture;
    scene.backgroundIntensity = exposure;
    scene.backgroundRotation.set(0, rotation, 0);`
        : "";
      const imageIblApply = settings.skybox.iblEnabled
        ? `    scene.environment = texture;
    scene.environmentIntensity = exposure;
    scene.environmentRotation.set(0, rotation, 0);`
        : "";
      const imageBackgroundRestore = skyboxBackgroundEnabled
        ? `      scene.background = previousBackground;
      scene.backgroundIntensity = previousBackgroundIntensity;
      scene.backgroundRotation.copy(previousBackgroundRotation);`
        : "";
      const imageIblRestore = settings.skybox.iblEnabled
        ? `      scene.environment = previousEnvironment;
      scene.environmentIntensity = previousEnvironmentIntensity;
      scene.environmentRotation.copy(previousEnvironmentRotation);`
        : "";
      if (hdrSkybox) {
        context.extraImports.add(
          'import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";',
        );
      } else if (exrSkybox) {
        context.extraImports.add(
          'import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";',
        );
      } else {
        context.threeValueImports.add("SRGBColorSpace");
        context.threeValueImports.add("TextureLoader");
      }
      context.supportDeclarations.set(
        "scene-environment:image-skybox",
        projectedSkybox
          ? `const XRiftStudioImageSkybox: FC<{ assetPath: string; flipY: boolean }> = ({ assetPath, flipY }) => {
  const src = useCompiledAssetUrl(assetPath);
  const texture = useLoader(${loaderName}, src);
  const configuredTexture = useMemo(() => {
    ${hdrSkybox ? "" : exrSkybox ? "" : "texture.colorSpace = SRGBColorSpace;"}
    texture.flipY = flipY;
    texture.mapping = EquirectangularReflectionMapping;
    texture.needsUpdate = true;
    return texture;
  }, [flipY, texture]);
  return <XRiftStudioProjectedSkybox texture={configuredTexture} />;
};`
          : `const XRiftStudioImageSkybox: FC<{ assetPath: string; rotation: number; flipY: boolean; exposure: number }> = ({ assetPath, rotation, flipY, exposure }) => {
  const scene = useThree((state) => state.scene);
  const src = useCompiledAssetUrl(assetPath);
  const texture = useLoader(${loaderName}, src);
  useEffect(() => {
${imageBackgroundSnapshot}
${imageIblSnapshot}
    ${hdrSkybox ? "" : exrSkybox ? "" : "texture.colorSpace = SRGBColorSpace;"}
    texture.flipY = flipY;
    texture.mapping = EquirectangularReflectionMapping;
    texture.needsUpdate = true;
${imageBackgroundApply}
${imageIblApply}
    return () => {
${imageBackgroundRestore}
${imageIblRestore}
    };
  }, [exposure, flipY, rotation, scene, texture]);
  return null;
};`,
      );
      content.push(
        projectedSkybox
          ? `<XRiftStudioImageSkybox assetPath={${imageAssetPath}} flipY={${resolvedFlipY}} />`
          : `<XRiftStudioImageSkybox assetPath={${imageAssetPath}} rotation={${formatNumber((settings.skybox.rotationDegrees * Math.PI) / 180)}} flipY={${resolvedFlipY}} exposure={${formatNumber(settings.skybox.exposure)}} />`,
      );
    } else {
      if (imageAssetId) {
        addDiagnostic(context, {
          severity: "warning",
          code: "skybox-image-unavailable",
          message: skyboxBackgroundEnabled
            ? "Skybox画像を背景またはIBLに使用できないため、背景をグラデーションにフォールバックしました"
            : "Skybox画像を生成WorldのIBLに使用できません",
          sceneId: context.scene.sceneId,
          assetId: imageAssetId,
          fieldPath: "settings.skybox.imageAssetId",
        });
      }
      if (skyboxBackgroundEnabled) {
        registerProjectedSkyboxSupport(settings, context);
        content.push(`<XRiftStudioProjectedSkybox texture={null} />`);
      }
    }
  }

  if (settings.fog.enabled) {
    context.reactValueImports.add("useEffect");
    context.fiberImports.add("useThree");
    context.threeValueImports.add("Fog");
    context.supportDeclarations.set(
      "scene-environment:fog",
      `const XRiftStudioSceneFog: FC = () => {
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const previousFog = scene.fog;
    scene.fog = new Fog(${JSON.stringify(settings.fog.color)}, ${formatNumber(settings.fog.near)}, ${formatNumber(settings.fog.far)});
    return () => {
      scene.fog = previousFog;
    };
  }, [scene]);
  return null;
};`,
    );
    content.unshift("<XRiftStudioSceneFog />");
  }

  return content;
}

function renderEntity(
  entityId: string,
  context: CompileContext,
  depth: number,
  inheritedRigidBody?: RigidBodyComponent,
): string | null {
  const entity = context.scene.entities[entityId];
  if (!entity) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "entity-reference-missing",
      message: `Entity reference が見つかりません: ${entityId}`,
      sceneId: context.scene.sceneId,
      entityId,
    });
    return null;
  }
  if (context.activeEntityIds.has(entityId)) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "entity-cycle",
      message: "Entity hierarchy に循環があります",
      sceneId: context.scene.sceneId,
      entityId,
    });
    return null;
  }
  if (context.visitedEntityIds.has(entityId)) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "entity-multiple-parents",
      message: "同じ Entity が複数箇所から参照されています",
      sceneId: context.scene.sceneId,
      entityId,
    });
    return null;
  }
  context.visitedEntityIds.add(entityId);
  if (!entity.enabled && !context.interactionTriggerTargetEntityIds.has(entityId)) {
    return null;
  }
  context.activeEntityIds.add(entityId);

  const transforms = entity.components.filter(
    (component): component is TransformComponent => component.type === "transform",
  );
  const colliders = entity.components.filter(
    (component): component is ColliderComponent =>
      component.type === "collider" && component.enabled,
  );
  if (transforms.length > 1) {
    addDiagnostic(context, entityDiagnostic(entity, "multiple-transforms", "複数の Transform のうち先頭だけを使用します", "warning"));
  }
  const transform = transforms[0];
  const rigidBodies = entity.components.filter(
    (component): component is RigidBodyComponent =>
      component.type === "rigid-body" && component.enabled,
  );
  if (rigidBodies.length > 1) {
    addDiagnostic(
      context,
      entityDiagnostic(
        entity,
        "multiple-rigid-bodies",
        "複数のRigid Bodyのうち先頭だけを使用します",
        "warning",
      ),
    );
  }
  const ownRigidBody = rigidBodies[0];
  const rigidBodyOwner = ownRigidBody ?? inheritedRigidBody;
  const localContent: string[] = [];
  const wrappers: RenderedXriftWrapper[] = [];
  const interactionTriggers = resolveInteractionTriggers(entity, context);
  const interactionBindings: Record<string, string> =
    interactionTriggers.length > 0
      ? {
          onInteract: `() => emitXriftInteraction(${JSON.stringify(entity.id)})`,
        }
      : {};
  for (const component of entity.components as RegisteredSceneComponent[]) {
    if (
      (!component.enabled &&
        component.type !== "audio-source" &&
        component.type !== "light") ||
      component.type === "transform"
    ) {
      continue;
    }
    if (component.type === "collider" || component.type === "rigid-body") {
      // Collider components are combined into one RigidBody after all visual
      // content is rendered, avoiding nested or duplicate physics bodies.
      continue;
    }
    if (component.type === "mesh") {
      const rendered = renderMesh(entity, component, context);
      if (rendered) localContent.push(rendered);
    } else if (component.type === "animation") {
      // v1 removed the Animation Component and opening a project converts it
      // into a graph, so nothing here should still carry one. Skipped rather
      // than reported, because a document that reached the compiler with one
      // has already been told on open.
      continue;
    } else if (component.type === "vegetation-wind") {
      // Wind is emitted once at scene level so it can update every explicitly
      // targeted Entity after the complete scene hierarchy has mounted.
      continue;
    } else if (component.type === "light") {
      localContent.push(renderLight(component, context));
    } else if (component.type === "text") {
      localContent.push(renderText(entity, component, context));
    } else if (component.type === "audio-source") {
      const rendered = renderAudioSource(entity, component, context);
      if (rendered) localContent.push(rendered);
    } else if (component.type === "spawn-point") {
      const rendered = renderSpawnPoint(entity, component.id, component.target, transform, context);
      if (rendered) localContent.push(rendered);
    } else if (component.type === "particle-emitter") {
      const rendered = renderParticleEmitter(entity, component, context);
      if (rendered) localContent.push(rendered);
    } else if (component.type === "prefab-instance") {
      context.referencedAssetIds.add(component.prefabAssetId);
      addDiagnostic(
        context,
        componentDiagnostic(
          entity,
          component.id,
          "prefab-instance-unresolved",
          "Prefab instanceをcompiler展開できませんでした",
          component.prefabAssetId,
        ),
      );
    } else if (component.type === "script") {
      const rendered = renderScript(entity, component, context);
      if (rendered) localContent.push(rendered);
    } else if (component.type === "interaction-trigger") {
      const resolved = interactionTriggers.find(
        (candidate) => candidate.component.id === component.id,
      );
      if (resolved) {
        localContent.push(
          renderInteractionTrigger(
            resolved,
            entity,
            interactionTriggers.indexOf(resolved),
            context,
          ),
        );
      }
    } else if (component.type === "xrift-component") {
      renderRegisteredXriftComponent(
        entity,
        component,
        context,
        localContent,
        wrappers,
        interactionBindings,
      );
    } else {
      const unknownComponent = component as unknown as { id: string; type: string };
      addDiagnostic(context, componentDiagnostic(entity, unknownComponent.id, "component-unsupported", `未対応の component type: ${unknownComponent.type}`));
    }
  }
  if (rigidBodyOwner) {
    const ownedContent = renderOwnedColliderContent(
      entity,
      colliders,
      localContent.join("\n"),
      rigidBodyOwner.bodyType,
      rigidBodyOwner.autoColliders,
      context,
    );
    localContent.length = 0;
    if (ownedContent) localContent.push(ownedContent);
  }
  for (const childId of entity.children) {
    const child = context.scene.entities[childId];
    if (child && child.parentId !== entity.id) {
      addDiagnostic(context, {
        severity: "warning",
        code: "entity-parent-mismatch",
        message: "children と parentId が一致していません",
        sceneId: context.scene.sceneId,
        entityId: childId,
      });
    }
    const rendered = renderEntity(
      childId,
      context,
      depth + 1,
      rigidBodyOwner,
    );
    if (rendered) localContent.push(rendered);
  }

  let children = localContent.join("\n");
  for (const wrapper of wrappers) {
    if (wrapper.childrenRequired && !children.trim()) {
      addDiagnostic(context, {
        severity: "blocking",
        code: "xrift-wrapper-children-required",
        message: `${wrapper.importName}には描画対象のchildrenが必要です`,
        sceneId: context.scene.sceneId,
        entityId: entity.id,
        componentId: wrapper.componentId,
      });
    }
    children = wrapper.jsx.replace(
      "{children}",
      `\n${indent(children, 1)}\n`,
    );
  }
  children = ownRigidBody
    ? renderOwnedRigidBody(entity, ownRigidBody, children, context)
    : inheritedRigidBody
      ? children
      : renderColliderBody(entity, colliders, children, context);
  context.activeEntityIds.delete(entityId);
  const position = vectorProp(transform?.position ?? [0, 0, 0]);
  const rotation = vectorProp(transform?.rotation ?? [0, 0, 0]);
  const scale = vectorProp(transform?.scale ?? [1, 1, 1]);
  const name = JSON.stringify(entity.name);
  const userData = `{ xriftEntityId: ${JSON.stringify(entity.id)} }`;
  // Only a trigger target reaches here while disabled, and it starts hidden
  // exactly as the Editor viewport shows it.
  const visible = entity.enabled ? "" : " visible={false}";
  if (!children) {
    return `<group name=${name} position={${position}} rotation={${rotation}} scale={${scale}}${visible} userData={${userData}} />`;
  }
  return `<group name=${name} position={${position}} rotation={${rotation}} scale={${scale}}${visible} userData={${userData}}>\n${indent(children, 1)}\n</group>`;
}

function renderOwnedRigidBody(
  entity: SceneEntity,
  component: RigidBodyComponent,
  children: string,
  context: CompileContext,
): string {
  context.rapierImports.add("RigidBody");
  const props = [
    `type=${JSON.stringify(component.bodyType)}`,
    "colliders={false}",
    `sensor={${component.isTrigger}}`,
    `friction={${formatNumber(component.friction)}}`,
    `restitution={${formatNumber(component.restitution)}}`,
    `gravityScale={${formatNumber(component.gravityScale)}}`,
    `linearDamping={${formatNumber(component.linearDamping)}}`,
    `angularDamping={${formatNumber(component.angularDamping)}}`,
    `canSleep={${component.canSleep}}`,
    `ccd={${component.ccd}}`,
    `lockTranslations={${component.lockTranslations}}`,
    `lockRotations={${component.lockRotations}}`,
  ];
  if (!children.trim()) {
    addDiagnostic(context, {
      ...componentDiagnostic(
        entity,
        component.id,
        "rigid-body-shape-missing",
        "Rigid Bodyの範囲に描画MeshまたはColliderがありません",
      ),
      sceneId: context.scene.sceneId,
    });
  }
  return `<RigidBody ${props.join(" ")}>\n${indent(children, 1)}\n</RigidBody>`;
}

function renderOwnedColliderContent(
  entity: SceneEntity,
  colliders: readonly ColliderComponent[],
  children: string,
  bodyType: RigidBodyComponent["bodyType"],
  autoColliders: RigidBodyComponent["autoColliders"],
  context: CompileContext,
): string {
  const boxes = colliders.filter(
    (collider): collider is BoxColliderComponent =>
      collider.shape === "box" &&
      isColliderSurfaceValid(collider) &&
      isFiniteVector(collider.center) &&
      isPositiveVector(collider.halfExtents),
  );
  const meshCollider = colliders.find(
    (collider): collider is MeshColliderComponent =>
      collider.shape === "mesh" && isColliderSurfaceValid(collider),
  );
  for (const collider of colliders) {
    const accepted =
      boxes.some((candidate) => candidate.id === collider.id) ||
      meshCollider?.id === collider.id;
    if (!accepted) {
      addDiagnostic(context, {
        ...componentDiagnostic(
          entity,
          collider.id,
          "owned-collider-invalid-or-duplicate",
          "親Rigid Bodyへ含められないCollider設定です",
        ),
        sceneId: context.scene.sceneId,
      });
    }
  }

  let renderedChildren = children;
  if (meshCollider) {
    context.rapierImports.add("MeshCollider");
    const type =
      meshCollider.meshMode === "convex" || bodyType !== "fixed"
        ? "hull"
        : "trimesh";
    if (bodyType !== "fixed" && meshCollider.meshMode === "trimesh") {
      addDiagnostic(context, {
        severity: "warning",
        code: "dynamic-trimesh-collider-converted-to-hull",
        message:
          "Dynamic/KinematicのTrimesh ColliderはRapier互換のConvex Hullとして出力します",
        sceneId: context.scene.sceneId,
        entityId: entity.id,
        componentId: meshCollider.id,
      });
    }
    renderedChildren = `<MeshCollider type=${JSON.stringify(type)}>\n${indent(renderedChildren, 1)}\n</MeshCollider>`;
  }
  if (autoColliders !== "none" && renderedChildren) {
    context.rapierImports.add("MeshCollider");
    const autoColliderType =
      autoColliders === "trimesh" && bodyType !== "fixed"
        ? "hull"
        : autoColliders;
    if (autoColliderType !== autoColliders) {
      addDiagnostic(context, {
        severity: "warning",
        code: "dynamic-auto-trimesh-converted-to-hull",
        message:
          "Dynamic/Kinematicの自動TrimeshはRapier互換のConvex Hullとして出力します",
        sceneId: context.scene.sceneId,
        entityId: entity.id,
      });
    }
    renderedChildren = `<MeshCollider type=${JSON.stringify(autoColliderType)}>\n${indent(renderedChildren, 1)}\n</MeshCollider>`;
  }
  if (boxes.length > 0) context.rapierImports.add("CuboidCollider");
  return [
    renderedChildren,
    ...boxes.map(
      (collider) =>
        `<CuboidCollider args={${vectorProp(collider.halfExtents)}} position={${vectorProp(collider.center)}} sensor={${collider.isTrigger}} friction={${formatNumber(collider.friction)}} restitution={${formatNumber(collider.restitution)}} />`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

function renderColliderBody(
  entity: SceneEntity,
  colliders: readonly ColliderComponent[],
  children: string,
  context: CompileContext,
): string {
  if (colliders.length === 0) return children;

  const boxes: BoxColliderComponent[] = [];
  const meshes: MeshColliderComponent[] = [];
  for (const collider of colliders) {
    if (!isColliderSurfaceValid(collider)) {
      addDiagnostic(context, {
        ...componentDiagnostic(
          entity,
          collider.id,
          "collider-surface-invalid",
          "Colliderのfrictionは0以上、restitutionは0から1で指定してください",
        ),
        sceneId: context.scene.sceneId,
        fieldPath: "friction/restitution",
      });
      continue;
    }
    if (collider.shape === "box") {
      if (
        !isFiniteVector(collider.center) ||
        !isPositiveVector(collider.halfExtents)
      ) {
        addDiagnostic(context, {
          ...componentDiagnostic(
            entity,
            collider.id,
            "box-collider-bounds-invalid",
            "Box ColliderのCenterとHalf Extentsが不正です",
          ),
          sceneId: context.scene.sceneId,
          fieldPath: "center/halfExtents",
        });
        continue;
      }
      boxes.push(collider);
    } else {
      meshes.push(collider);
    }
  }

  const meshCollider = meshes[0];
  for (const duplicate of meshes.slice(1)) {
    addDiagnostic(context, {
      severity: "warning",
      code: "multiple-mesh-colliders-collapsed",
      message:
        "同じEntityのMesh Colliderは先頭の設定を一つのRigidBodyへ統合します",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: duplicate.id,
    });
  }
  if (
    meshCollider &&
    !entity.components.some((component) => component.type === "mesh" && component.enabled)
  ) {
    addDiagnostic(context, {
      severity: "warning",
      code: "mesh-collider-without-local-mesh",
      message: "Mesh ColliderのEntityに有効なMesh Rendererがありません",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: meshCollider.id,
    });
  }
  if (boxes.length === 0 && !meshCollider) return children;

  context.rapierImports.add("RigidBody");
  if (boxes.length > 0) context.rapierImports.add("CuboidCollider");
  const primaryCollider = meshCollider ?? boxes[0]!;
  const bodyType = primaryCollider.bodyType ?? "fixed";
  if (
    meshCollider &&
    bodyType !== "fixed" &&
    meshCollider.meshMode === "trimesh"
  ) {
    addDiagnostic(context, {
      severity: "warning",
      code: "dynamic-trimesh-collider-converted-to-hull",
      message:
        "Dynamic/KinematicのTrimesh ColliderはRapier互換のConvex Hullとして出力します",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: meshCollider.id,
    });
  }
  const rigidBodySettings = [
    `type=${JSON.stringify(bodyType)}`,
    `gravityScale={${formatNumber(primaryCollider.gravityScale ?? 1)}}`,
    `linearDamping={${formatNumber(primaryCollider.linearDamping ?? 0)}}`,
    `angularDamping={${formatNumber(primaryCollider.angularDamping ?? 0)}}`,
    `canSleep={${primaryCollider.canSleep ?? true}}`,
    `ccd={${primaryCollider.ccd ?? false}}`,
    `lockTranslations={${primaryCollider.lockTranslations ?? false}}`,
    `lockRotations={${primaryCollider.lockRotations ?? false}}`,
  ];
  const rigidBodyProps = meshCollider
    ? [
        ...rigidBodySettings,
        `colliders=${JSON.stringify(
          meshCollider.meshMode === "convex" || bodyType !== "fixed"
            ? "hull"
            : "trimesh",
        )}`,
        `sensor={${meshCollider.isTrigger}}`,
        `friction={${formatNumber(meshCollider.friction)}}`,
        `restitution={${formatNumber(meshCollider.restitution)}}`,
      ]
    : [...rigidBodySettings, "colliders={false}"];
  const content = [
    ...boxes.map(
      (collider) =>
        `<CuboidCollider args={${vectorProp(collider.halfExtents)}} position={${vectorProp(collider.center)}} sensor={${collider.isTrigger}} friction={${formatNumber(collider.friction)}} restitution={${formatNumber(collider.restitution)}} />`,
    ),
    ...(children ? [children] : []),
  ].join("\n");
  return `<RigidBody ${rigidBodyProps.join(" ")}>\n${indent(content, 1)}\n</RigidBody>`;
}

function isColliderSurfaceValid(collider: ColliderComponent): boolean {
  return (
    Number.isFinite(collider.friction) &&
    collider.friction >= 0 &&
    Number.isFinite(collider.restitution) &&
    collider.restitution >= 0 &&
    collider.restitution <= 1
  );
}

function isFiniteVector(value: Vec3): boolean {
  return value.every((entry) => Number.isFinite(entry));
}

function isPositiveVector(value: Vec3): boolean {
  return isFiniteVector(value) && value.every((entry) => entry > 0);
}

function renderMesh(
  entity: SceneEntity,
  mesh: MeshComponent,
  context: CompileContext,
): string | null {
  const geometry = resolveMeshGeometry(mesh, context);
  if (!geometry) return null;
  if (geometry.kind === "model") {
    return renderModelMesh(entity, mesh, geometry.asset, context);
  }
  const material = resolveMeshMaterial(mesh, context);
  const materialJsx = material
    ? renderMaterial(entity, mesh, material, context)
    : '<meshStandardMaterial color="#ff00ff" />';
  const terrainConstant =
    geometry.kind === "terrain"
      ? registerTerrainDataConstant(geometry.terrain, context)
      : null;
  const geometryJsxContent = terrainConstant
    ? renderTerrainGeometry(terrainConstant, context)
    : geometry.kind === "primitive"
      ? geometryJsx(geometry.primitive)
      : "";
  const grassJsx =
    geometry.kind === "terrain" && terrainConstant
      ? renderTerrainGrassLayers(entity, geometry.terrain, terrainConstant, context)
      : "";
  return renderMeshRenderOrder(
    renderMeshMaxDistance(
      `<mesh castShadow={${mesh.castShadow}} receiveShadow={${mesh.receiveShadow}}>\n  ${geometryJsxContent}\n  ${materialJsx}\n</mesh>${grassJsx}`,
      mesh.maxDistance,
      context,
    ),
    mesh.renderOrder,
    context,
  );
}

function renderMeshMaxDistance(
  content: string,
  maxDistance: number | undefined,
  context: CompileContext,
): string {
  if (maxDistance === undefined) return content;
  context.reactTypeImports.add("ReactNode");
  context.reactValueImports.add("useRef");
  context.fiberImports.add("useFrame");
  context.threeTypeImports.add("Group");
  context.threeValueImports.add("Vector3");
  context.supportDeclarations.set(
    "render:max-distance",
    `type XriftMeshMaxDistanceProps = { maxDistance: number; children: ReactNode };

const XriftMeshMaxDistance: FC<XriftMeshMaxDistanceProps> = ({ maxDistance, children }) => {
  const ref = useRef<Group>(null);
  const worldPosition = useRef(new Vector3());
  useFrame(({ camera }) => {
    const target = ref.current;
    if (!target) return;
    target.getWorldPosition(worldPosition.current);
    target.visible = camera.position.distanceTo(worldPosition.current) <= maxDistance;
  });
  return <group ref={ref}>{children}</group>;
};`,
  );
  return `<XriftMeshMaxDistance maxDistance={${formatNumber(maxDistance)}}>${content}</XriftMeshMaxDistance>`;
}

/**
 * Wraps a Mesh in the explicit draw order the author gave it.
 *
 * three reads `renderOrder` per object, so it has to reach the children rather
 * than sit on the wrapper alone — the editor traverses for the same reason, and
 * the two have to agree or a transparent surface sorts one way while authoring
 * and another once published.
 */
function renderMeshRenderOrder(
  content: string,
  renderOrder: number | undefined,
  context: CompileContext,
): string {
  if (renderOrder === undefined || renderOrder === 0) return content;
  context.reactTypeImports.add("ReactNode");
  context.reactValueImports.add("useEffect");
  context.reactValueImports.add("useRef");
  context.threeTypeImports.add("Group");
  context.supportDeclarations.set(
    "render:render-order",
    `type XriftMeshRenderOrderProps = { renderOrder: number; children: ReactNode };

const XriftMeshRenderOrder: FC<XriftMeshRenderOrderProps> = ({ renderOrder, children }) => {
  const ref = useRef<Group>(null);
  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    target.renderOrder = renderOrder;
    target.traverse((object) => {
      object.renderOrder = renderOrder;
    });
  }, [children, renderOrder]);
  return <group ref={ref}>{children}</group>;
};`,
  );
  return `<XriftMeshRenderOrder renderOrder={${formatNumber(renderOrder)}}>${content}</XriftMeshRenderOrder>`;
}

type ResolvedMeshGeometry =
  | { kind: "primitive"; primitive: PrimitiveGeometry }
  | { kind: "terrain"; terrain: TerrainGeometry }
  | { kind: "model"; asset: ModelAsset };

function resolveMeshGeometry(
  mesh: MeshComponent,
  context: CompileContext,
): ResolvedMeshGeometry | undefined {
  if (mesh.geometry?.kind === "terrain") {
    return { kind: "terrain", terrain: mesh.geometry.terrain };
  }
  if (mesh.geometry?.kind === "builtin-primitive") {
    return { kind: "primitive", primitive: mesh.geometry.primitive };
  }
  const geometryAssetId =
    mesh.geometry?.kind === "asset" ? mesh.geometry.assetId : mesh.geometryAssetId;
  const catalog = getBuiltinPrimitiveCreation(geometryAssetId);
  if (catalog) return { kind: "primitive", primitive: catalog.primitive };
  const asset = getGeometryAsset(context.assets, geometryAssetId);
  context.referencedAssetIds.add(geometryAssetId);
  if (!asset) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "geometry-asset-missing",
      message: "Mesh の geometry Asset が見つかりません",
      sceneId: context.scene.sceneId,
      componentId: mesh.id,
      assetId: geometryAssetId,
      fieldPath: "geometryAssetId",
    });
    return undefined;
  }
  return asset.kind === "model"
    ? { kind: "model", asset }
    : { kind: "primitive", primitive: asset.primitive };
}

/**
 * The terrain payload is shared between the surface mesh and the grass, and a
 * height field is sixteen thousand numbers: serializing it once per consumer
 * would double the world for every planted Terrain.
 */
function registerTerrainDataConstant(
  terrain: TerrainGeometry,
  context: CompileContext,
): string {
  const json = JSON.stringify(terrain);
  const name = generatedIdentifier(
    "XRIFT_TERRAIN_DATA",
    sha256Utf8(json).slice(0, 16),
  );
  registerTerrainDataTypes(context);
  context.supportDeclarations.set(
    `terrain-data:${name}`,
    `const ${name}: XriftTerrainGeometryData = ${json};`,
  );
  return name;
}

function registerTerrainDataTypes(context: CompileContext): void {
  context.supportDeclarations.set(
    "terrain:data-types",
    `type XriftTerrainGrassLayerData = {
  id: string;
  typeId: string;
  density: number;
  heightRange: readonly number[];
  slopeLimitDegrees: number;
  seed: number;
  mask?: readonly number[];
};

type XriftTerrainGeometryData = {
  width: number;
  depth: number;
  resolution: number;
  heights: readonly number[];
  holes?: readonly boolean[];
  grass?: readonly XriftTerrainGrassLayerData[];
};`,
  );
}

function renderTerrainGeometry(
  terrainConstant: string,
  context: CompileContext,
): string {
  context.reactValueImports.add("useEffect");
  context.reactValueImports.add("useMemo");
  context.threeValueImports.add("BufferGeometry");
  context.threeValueImports.add("Float32BufferAttribute");
  context.supportDeclarations.set(
    "terrain:geometry",
    `

function XriftTerrainGeometry({ terrain }: { terrain: XriftTerrainGeometryData }) {
  const geometry = useMemo(() => {
    const resolution = Math.max(2, Math.floor(terrain.resolution));
    const positions = new Float32Array(resolution * resolution * 3);
    const indices: number[] = [];
    const xStep = terrain.width / (resolution - 1);
    const zStep = terrain.depth / (resolution - 1);
    for (let z = 0; z < resolution; z += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const vertex = z * resolution + x;
        const offset = vertex * 3;
        positions[offset] = x * xStep - terrain.width / 2;
        positions[offset + 1] = terrain.heights[vertex] ?? 0;
        positions[offset + 2] = z * zStep - terrain.depth / 2;
      }
    }
    for (let z = 0; z < resolution - 1; z += 1) {
      for (let x = 0; x < resolution - 1; x += 1) {
        const cell = z * (resolution - 1) + x;
        if (terrain.holes?.[cell]) continue;
        const topLeft = z * resolution + x;
        const topRight = topLeft + 1;
        const bottomLeft = topLeft + resolution;
        const bottomRight = bottomLeft + 1;
        indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, [terrain]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" />;
}`,
  );
  return `<XriftTerrainGeometry terrain={${terrainConstant}} />`;
}

/**
 * Emits a Terrain's grass into the world.
 *
 * Only the rules travel — the blades are regenerated at runtime by the same
 * placement algorithm the editor uses, embedded as source so the world owes
 * nothing to Studio. The wind is resolved at compile time through the shared
 * wind contract, so published grass moves with the same air as everything
 * else in the scene.
 */
function renderTerrainGrassLayers(
  entity: SceneEntity,
  terrain: TerrainGeometry,
  terrainConstant: string,
  context: CompileContext,
): string {
  const layers = terrain.grass ?? [];
  if (layers.length === 0) return "";
  const entityWind = entity.components.find(
    (component): component is Extract<typeof component, { type: "vegetation-wind" }> =>
      component.type === "vegetation-wind",
  );
  // Grass shades from the same key light the ground does, resolved once at
  // compile time through the lighting contract.
  const grassLighting = resolveSceneLighting(
    context.scene,
    resolveSceneSettings(context.scene.settings).ambient,
  );
  const wind = resolveSceneWind(
    resolveSceneSettings(context.scene.settings).vegetation,
    entityWind,
  );

  const jsx: string[] = [];
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index];
    const type = getTerrainGrassType(layer.typeId);
    if (!type) {
      addDiagnostic(context, {
        severity: "warning",
        code: "terrain-grass-type-unknown",
        message: `草の種類「${layer.typeId}」が不明のため、この層は出力しません`,
        sceneId: context.scene.sceneId,
        entityId: entity.id,
      });
      continue;
    }
    // The layer's own colour and size win over the type's, resolved by the same
    // function the viewport uses, so a field an author tuned in Studio cannot
    // arrive in the published world wearing the catalog's colours instead.
    const appearance = resolveTerrainGrassAppearance(type, layer.appearance);
    const clump = terrainGrassClump(layer.typeId);
    jsx.push(
      `<XRiftStudioTerrainGrass terrain={${terrainConstant}} layerIndex={${index}} type={${JSON.stringify(
        {
          height: appearance.height,
          width: appearance.width,
          cards: type.cards,
          segments: type.segments,
          curve: type.curve,
          cullDistance: type.cullDistance,
          sway: type.sway,
          translucency: type.translucency,
          colorVariation: appearance.colorVariation,
          fill: appearance.fill,
          baseColor: appearance.baseColor,
          tipColor: appearance.tipColor,
          clumpSize: clump.size,
          clumpRadius: clump.radius,
        },
      )}} wind={{ direction: [${formatNumber(wind.direction[0])}, ${formatNumber(
        wind.direction[1],
      )}], speed: ${formatNumber(wind.speed)}, turbulence: ${formatNumber(
        wind.turbulence,
      )} }} lighting={${JSON.stringify(grassLighting)}} />`,
    );
  }
  if (jsx.length === 0) return "";

  context.reactValueImports.add("useEffect");
  context.reactValueImports.add("useMemo");
  context.reactValueImports.add("useRef");
  context.fiberImports.add("useFrame");
  [
    "BufferGeometry",
    "Float32BufferAttribute",
    "Matrix4",
    "Vector3",
    "Vector2",
    "Color",
    "ShaderMaterial",
    "DoubleSide",
  ].forEach((name) => context.threeValueImports.add(name));
  context.threeTypeImports.add("InstancedMesh");
  context.supportDeclarations.set(
    "terrain:grass",
    `${terrainGrassRuntimeSource({ typed: true })}

const XRIFT_TERRAIN_GRASS_VERTEX_SHADER = ${JSON.stringify(TERRAIN_GRASS_VERTEX_SHADER)};
const XRIFT_TERRAIN_GRASS_FRAGMENT_SHADER = ${JSON.stringify(TERRAIN_GRASS_FRAGMENT_SHADER)};

type XRiftStudioTerrainGrassTypeProps = {
  height: number;
  width: number;
  cards: number;
  segments: number;
  curve: number;
  cullDistance: number;
  sway: number;
  translucency: number;
  colorVariation: number;
  fill: number;
  baseColor: string;
  tipColor: string;
  clumpSize: number;
  clumpRadius: number;
};

const XRiftStudioTerrainGrass: FC<{
  terrain: XriftTerrainGeometryData;
  layerIndex: number;
  type: XRiftStudioTerrainGrassTypeProps;
  wind: { direction: [number, number]; speed: number; turbulence: number };
  lighting: {
    sunDirection: [number, number, number];
    sunColor: [number, number, number];
    sunIntensity: number;
    ambientColor: [number, number, number];
    ambientIntensity: number;
  };
}> = ({ terrain, layerIndex, type, wind, lighting }) => {
  const layer = terrain.grass?.[layerIndex];
  const meshRef = useRef<InstancedMesh>(null);
  const placement = useMemo(
    () =>
      layer
        ? xriftTerrainGrassPlace(
            terrain,
            layer,
            ${TERRAIN_GRASS_MAX_INSTANCES},
            type.clumpSize,
            type.clumpRadius,
          )
        : null,
    [layer, terrain, type.clumpSize, type.clumpRadius],
  );
  const geometry = useMemo(() => {
    const buffers = xriftTerrainGrassBladeBuffers(type.cards, type.segments);
    const next = new BufferGeometry();
    next.setAttribute(
      "position",
      new Float32BufferAttribute(new Float32Array(buffers.positions), 3),
    );
    // The card's own facing. A flat strip has no surface to derive a normal
    // from, and the shader needs the facing to turn the blade toward the eye.
    next.setAttribute(
      "normal",
      new Float32BufferAttribute(new Float32Array(buffers.normals), 3),
    );
    next.setAttribute(
      "uv",
      new Float32BufferAttribute(new Float32Array(buffers.uvs), 2),
    );
    next.setIndex(buffers.indices);
    return next;
  }, [type.cards, type.segments]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uBaseColor: { value: new Color(type.baseColor) },
          uTipColor: { value: new Color(type.tipColor) },
          uHeight: { value: type.height },
          uWidth: { value: type.width },
          uSway: { value: type.sway },
          uCurve: { value: type.curve },
          uCullDistance: { value: type.cullDistance },
          uTranslucency: { value: type.translucency },
          uColorVariation: { value: type.colorVariation },
          uFill: { value: type.fill },
          uWindDirection: { value: new Vector2(wind.direction[0], wind.direction[1]) },
          uWindSpeed: { value: wind.speed },
          uWindTurbulence: { value: wind.turbulence },
          uSunDirection: { value: new Vector3(...lighting.sunDirection) },
          uSunColor: { value: new Color(...lighting.sunColor) },
          uSunIntensity: { value: lighting.sunIntensity },
          uAmbientColor: { value: new Color(...lighting.ambientColor) },
          uAmbientIntensity: { value: lighting.ambientIntensity },
          uTime: { value: 0 },
        },
        vertexShader: XRIFT_TERRAIN_GRASS_VERTEX_SHADER,
        fragmentShader: XRIFT_TERRAIN_GRASS_FRAGMENT_SHADER,
        side: DoubleSide,
      }),
    // The inline prop objects change identity every render, so the deps are
    // the scalars themselves.
    [
      type.baseColor,
      type.tipColor,
      type.height,
      type.width,
      type.sway,
      type.curve,
      type.cullDistance,
      type.translucency,
      type.colorVariation,
      type.fill,
      wind.direction[0],
      wind.direction[1],
      wind.speed,
      wind.turbulence,
    ],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !placement) return;
    const matrix = new Matrix4();
    const scale = new Vector3();
    for (let index = 0; index < placement.placed; index += 1) {
      const s = placement.scales[index] ?? 1;
      matrix.makeRotationY(placement.rotations[index] ?? 0);
      matrix.scale(scale.set(s, s, s));
      matrix.setPosition(
        placement.positions[index * 3] ?? 0,
        placement.positions[index * 3 + 1] ?? 0,
        placement.positions[index * 3 + 2] ?? 0,
      );
      mesh.setMatrixAt(index, matrix);
    }
    mesh.count = placement.placed;
    mesh.instanceMatrix.needsUpdate = true;
  }, [placement]);
  useFrame((state) => {
    const uniform = material.uniforms.uTime;
    if (uniform) uniform.value = state.clock.getElapsedTime();
  });
  if (!placement || placement.placed === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, placement.placed]}
      frustumCulled={false}
    />
  );
};`,
  );
  return jsx.join("");
}

type ModelMaterialOverride = {
  slot: MaterialSlotDefinition;
  material: MaterialAsset;
  sourceNodeIndex?: number;
};

function renderModelMesh(
  entity: SceneEntity,
  mesh: MeshComponent,
  model: ModelAsset,
  context: CompileContext,
): string | null {
  context.referencedAssetIds.add(model.id);
  const runtimeUrl = context.assetRuntimeUrls.get(model.id);
  if (!runtimeUrl) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "model-source-unsupported",
      message: "Modelはproject-relativeなGLB / glTF / OBJ / VRM sourceである必要があります",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: mesh.id,
      assetId: model.id,
      fieldPath: "source.relativePath",
    });
    return null;
  }

  const overrides = resolveModelMaterialOverrides(entity, mesh, model, context);
  const urlConstant = registerAssetUrl(model, runtimeUrl, context);
  const componentName = generatedIdentifier("CompiledModel", mesh.id);
  context.dreiImports.add("Clone");
  const sourceExtension =
    model.source.kind === "project"
      ? fileExtension(model.source.relativePath)
      : model.importMetadata?.sourceFormat;
  const isObj = sourceExtension === "obj";
  const isOpenBrush = isOpenBrushModelMetadata(
    model.importMetadata?.openBrush,
  );
  const modelClips = model.importMetadata?.animations ?? [];
  /*
   * The mixer, for the graph to play through.
   *
   * v1 removed the Animation Component: a clip is started by an
   * `animation/start` node, and a Model whose motion is split across dozens of
   * clips is the reason it had to move. So nothing is emitted for a Scene with
   * no graph in it, and everything is emitted for one that has a graph and a
   * Model with clips — the Component is no longer part of the question.
   */
  const animationBridgeable = Boolean(
    !isObj &&
      modelClips.length > 0 &&
      sceneUsesInteractionTriggerRuntime(context.scene, context.assets),
  );
  const animationLoaded = animationBridgeable;
  /*
   * The clips this Entity's own graphs start with the world, emitted rather
   * than left to the graph runtime to push.
   *
   * The runtime is a sibling of this Model and starts as soon as it mounts;
   * this Model suspends on its glTF, so its animation bridge does not exist
   * yet when `event/onStart` fires, and nothing retries. Reading the graph at
   * compile time and starting the clips here makes the published world play
   * what the Editor plays, and leaves the bridge for what only it can do —
   * pausing, seeking and switching while the world runs.
   */
  const graphAnimationCues = animationBridgeable
    ? (entity.components as RegisteredSceneComponent[]).flatMap((component) => {
        if (component.type !== "interaction-trigger" || !component.enabled) {
          return [];
        }
        const asset = context.assets.assets[component.interactivityAssetId];
        return asset?.kind === "interactivity"
          ? getKhrInteractivityOnStartAnimationCues(asset.extension)
          : [];
      })
    : [];
  if (isObj) {
    context.fiberImports.add("useLoader");
    context.extraImports.add(
      'import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";',
    );
  } else if (isOpenBrush) {
    context.fiberImports.add("useLoader");
    context.extraImports.add(
      'import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";',
    );
    // Stock three-icosa cannot build a compilable brush material on its own;
    // the shared loader emitted as an overlay is what the viewport uses too.
    context.extraImports.add(
      'import { createOpenBrushMaterialExtension } from "./xrift-studio/open-brush-runtime";',
    );
  } else {
    context.dreiImports.add("useGLTF");
  }
  if (animationLoaded) {
    context.dreiImports.add("useAnimations");
    context.reactValueImports.add("useEffect");
    context.reactValueImports.add("useRef");
    context.threeTypeImports.add("Group");
  }
  if (animationBridgeable) {
    context.fiberImports.add("useFrame");
    context.extraImports.add(
      'import { XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY, createXriftAnimationRuntimeBridge } from "./xrift-studio/animation-runtime";',
    );
    context.extraImports.add(
      'import type { XriftAnimationRuntimeBridge } from "./xrift-studio/animation-runtime";',
    );
    context.extraImports.add(
      'import { createXriftAnimationMixerController } from "./xrift-studio/animation-mixer-runtime";',
    );
  }

  const materialComponents = overrides.map((override) => ({
    ...override,
    componentName: registerMaterialComponent(
      entity,
      mesh,
      override.material,
      context,
    ),
  }));
  const inject = renderModelMaterialInjection(
    materialComponents,
    getGeometryMaterialSlots(model).length === 1,
  );
  const sourceNodeIndex =
    mesh.geometry?.kind === "asset"
      ? mesh.geometry.sourceNodeIndex
      : undefined;
  const sourceNodeName =
    mesh.geometry?.kind === "asset"
      ? mesh.geometry.sourceNodeName
      : undefined;
  const needsParser =
    sourceNodeIndex !== undefined ||
    Boolean(mesh.modelPose?.nodes && Object.keys(mesh.modelPose.nodes).length) ||
    mesh.materialBindings.some(
      (binding) => binding.sourceNodeIndex !== undefined,
    );
  const modelScale =
    sourceNodeIndex === undefined &&
    sourceNodeName === undefined &&
    Number.isFinite(model.importSettings.scale)
      ? model.importSettings.scale
      : 1;
  const poseSource = renderCompiledModelPose(mesh, context);
  const vrm0Rotation =
    model.importMetadata?.sourceFormat === "vrm" &&
    model.importMetadata.vrmVersion === "0"
      ? ` rotation={[0, ${formatNumber(Math.PI)}, 0]}`
      : "";
  const loaderSource = isObj
    ? "const scene = useLoader(OBJLoader, modelUrl);"
    : isOpenBrush
      ? `const { scene, parser${animationLoaded ? ", animations" : ""} } = useLoader(GLTFLoader, modelUrl, (loader) => {
    loader.register(
      (parser) => createOpenBrushMaterialExtension(parser, ${JSON.stringify(OPEN_BRUSH_BRUSH_BASE_URL)}),
    );
  });`
      : !needsParser
        ? `const { scene${animationLoaded ? ", animations" : ""} } = useGLTF(modelUrl);`
        : `const { scene, parser${animationLoaded ? ", animations" : ""} } = useGLTF(modelUrl);`;
  const animationBindings = (animationBridgeable ? ["mixer", "clips"] : []).join(", ");
  const graphCuePlans = planInteractivityAnimationCues(graphAnimationCues);
  if (graphCuePlans.length > 0) {
    context.threeValueImports.add("LoopRepeat");
    context.threeValueImports.add("LoopOnce");
  }
  const graphCueSource =
    graphCuePlans.length > 0
      ? `
  useEffect(() => {
    const started = ${JSON.stringify(graphCuePlans)}.flatMap((cue) => {
      const clip = clips[cue.index];
      if (!clip) return [];
      const action = mixer.clipAction(clip);
      action.reset();
      action.clampWhenFinished = !cue.loop;
      action.setLoop(cue.loop ? LoopRepeat : LoopOnce, cue.loop ? Infinity : 1);
      action.timeScale = cue.speed;
      if (cue.startTime > 0) action.time = cue.startTime;
      if (cue.delaySeconds > 0) action.startAt(mixer.time + cue.delaySeconds);
      action.play();
      return [action];
    });
    return () => {
      started.forEach((action) => action.stop());
    };
  }, [clips, mixer]);`
      : "";
  // The same bridge Studio Play attaches, so a graph that starts, pauses or
  // re-times a clip behaves identically in the published world. Nothing plays
  // on its own: what starts a clip is an `animation/start` node.
  const animationBridgeSource = animationBridgeable
    ? `
  const animationBridge = useRef<XriftAnimationRuntimeBridge | null>(null);
  useEffect(() => {
    const root = animationRoot.current;
    if (!root) return;
    const bridge = createXriftAnimationRuntimeBridge({
      componentId: "",
      clipNames: clips.map((clip) => clip.name),
      clipIndex: 0,
      autoplay: false,
      speed: 1,
      loop: false,
    });
    const controller = createXriftAnimationMixerController({
      mixer,
      clips,
      clipIndex: 0,
      loop: false,
      speed: 1,
    });
    const disconnect = bridge.connect(controller);
    root.userData[XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY] = bridge;
    animationBridge.current = bridge;
    return () => {
      disconnect();
      controller.dispose();
      delete root.userData[XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY];
      animationBridge.current = null;
    };
  }, [clips, mixer]);
  useFrame(() => {
    animationBridge.current?.sample();
  });`
    : "";
  const animationSource = animationLoaded
    ? `  const animationRoot = useRef<Group>(null);
  const { ${animationBindings} } = useAnimations(animations, animationRoot);${graphCueSource}${animationBridgeSource}`
    : "";
  // Open Brush brushes read `uniform vec4 u_time` for their motion, and the
  // Materials come out of three-icosa already compiled, so no Material
  // component drives them. Walk the loaded strokes each frame instead, using
  // the same Unity-style `_Time` vector the brushes were authored against.
  if (isOpenBrush) {
    context.reactValueImports.add("useRef");
    context.fiberImports.add("useFrame");
    context.threeTypeImports.add("Group");
    context.threeTypeImports.add("Mesh");
    context.threeTypeImports.add("ShaderMaterial");
  }
  const brushTimeSource = isOpenBrush
    ? `  const brushTimeRoot = useRef<Group>(null);
  useFrame(({ clock }) => {
    const root = brushTimeRoot.current;
    if (!root) return;
    const elapsed = clock.getElapsedTime();
    root.traverse((object) => {
      const attached = (object as Mesh).material;
      if (!attached) return;
      for (const material of Array.isArray(attached) ? attached : [attached]) {
        const uniform = (material as ShaderMaterial).uniforms?.u_time;
        if (!uniform) continue;
        const value = uniform.value;
        if (value && typeof value === "object" && "set" in value) {
          value.set(elapsed / 20, elapsed, elapsed * 2, elapsed * 3);
        } else {
          uniform.value = [elapsed / 20, elapsed, elapsed * 2, elapsed * 3];
        }
      }
    });
  });
`
    : "";
  const clonedModel = `<group${animationLoaded ? " ref={animationRoot}" : ""} scale={${formatNumber(modelScale)}}${vrm0Rotation}>
      <Clone
        object={${poseSource.objectName}}
        castShadow={${mesh.castShadow}}
        receiveShadow={${mesh.receiveShadow}}${inject}
      />
    </group>`;
  const modelContent = isOpenBrush
    ? `<group ref={brushTimeRoot}>
      ${clonedModel}
    </group>`
    : clonedModel;
  const renderedModelContent = renderMeshRenderOrder(
    renderMeshMaxDistance(
      modelContent,
      mesh.maxDistance,
      context,
    ),
    mesh.renderOrder,
    context,
  );
  const source = `const ${componentName}: FC = () => {
  const modelUrl = useCompiledAssetUrl(${urlConstant});
  ${loaderSource}
${poseSource.declaration}
${brushTimeSource}${animationSource}
  return (
    ${renderedModelContent}
  );
};`;
  context.supportDeclarations.set(`model:${componentName}`, source);
  return `<${componentName} />`;
}

function renderCompiledModelPose(
  mesh: MeshComponent,
  context: CompileContext,
): { declaration: string; objectName: string } {
  const pose = mesh.modelPose;
  const sourceNodeIndex =
    mesh.geometry?.kind === "asset"
      ? mesh.geometry.sourceNodeIndex
      : undefined;
  const sourceNodeName =
    mesh.geometry?.kind === "asset"
      ? mesh.geometry.sourceNodeName
      : undefined;
  const needsSourceNodeTags =
    sourceNodeIndex !== undefined ||
    Boolean(pose?.nodes && Object.keys(pose.nodes).length) ||
    mesh.materialBindings.some(
      (binding) => binding.sourceNodeIndex !== undefined,
    );
  if (
    !needsSourceNodeTags &&
    sourceNodeName === undefined &&
    (!pose ||
      (Object.keys(pose.bones).length === 0 &&
        Object.keys(pose.morphTargets).length === 0))
  ) {
    return { declaration: "", objectName: "scene" };
  }
  context.reactValueImports.add("useMemo");
  context.extraImports.add(
    'import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";',
  );
  const boneRotations = JSON.stringify(pose?.bones ?? {});
  const morphTargets = JSON.stringify(pose?.morphTargets ?? {});
  const nodeTransforms = JSON.stringify(pose?.nodes ?? {});
  const collectSourceNodes = needsSourceNodeTags || sourceNodeName !== undefined;
  const tagSourceNodes = collectSourceNodes
    ? `    const originals: typeof scene.children = [];
    const copies: typeof scene.children = [];
    scene.traverse((object) => originals.push(object));
    cloned.traverse((object) => copies.push(object));
${needsSourceNodeTags ? `    originals.forEach((original, index) => {
      const nodeIndex = parser.associations.get(original)?.nodes;
      if (typeof nodeIndex === "number" && copies[index]) {
        copies[index].userData.xriftSourceNodeIndex = nodeIndex;
      }
    });
` : ""}`
    : "";
  const selectSourceNode = sourceNodeIndex !== undefined
    ? `    let selected = copies.find(
      (object) => object.userData.xriftSourceNodeIndex === ${sourceNodeIndex},
    );
    if (selected) {
      for (const child of [...selected.children]) {
        if (typeof child.userData.xriftSourceNodeIndex === "number") selected.remove(child);
      }
      selected.removeFromParent();
      selected.position.set(0, 0, 0);
      selected.quaternion.identity();
      selected.scale.set(1, 1, 1);
    } else {
      cloned.clear();
      selected = cloned;
    }
`
    : sourceNodeName
      ? `    let selected = copies.find(
      (object) => object.name === ${JSON.stringify(sourceNodeName)},
    );
    if (selected) {
      selected.removeFromParent();
      selected.position.set(0, 0, 0);
      selected.quaternion.identity();
      selected.scale.set(1, 1, 1);
    } else {
      cloned.clear();
      selected = cloned;
    }
`
      : "";
  return {
    objectName: "compiledScene",
    declaration: `  const compiledScene = useMemo(() => {
    const cloned = cloneSkeleton(scene);
${tagSourceNodes}${selectSourceNode}    const output = ${sourceNodeIndex === undefined && sourceNodeName === undefined ? "cloned" : "selected"};
    const boneRotations = ${boneRotations} as Record<string, [number, number, number]>;
    const morphTargetWeights = ${morphTargets} as Record<string, number>;
    const nodeTransforms = ${nodeTransforms} as Record<string, { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }>;
    output.traverse((object) => {
      const sourceNodeIndex = object.userData.xriftSourceNodeIndex;
      const nodeTransform = typeof sourceNodeIndex === "number"
        ? nodeTransforms[String(sourceNodeIndex)]
        : undefined;
      if (nodeTransform) {
        object.position.set(
          object.position.x + nodeTransform.position[0],
          object.position.y + nodeTransform.position[1],
          object.position.z + nodeTransform.position[2],
        );
        object.rotation.set(
          object.rotation.x + nodeTransform.rotation[0],
          object.rotation.y + nodeTransform.rotation[1],
          object.rotation.z + nodeTransform.rotation[2],
        );
        object.scale.set(
          object.scale.x * nodeTransform.scale[0],
          object.scale.y * nodeTransform.scale[1],
          object.scale.z * nodeTransform.scale[2],
        );
      }
      const boneObject = object as typeof object & { isBone?: boolean };
      const rotation = boneObject.isBone ? boneRotations[object.name] : undefined;
      if (rotation) {
        object.rotation.set(
          object.rotation.x + rotation[0],
          object.rotation.y + rotation[1],
          object.rotation.z + rotation[2],
        );
      }
      const meshObject = object as typeof object & {
        morphTargetDictionary?: Record<string, number>;
        morphTargetInfluences?: number[];
      };
      if (!meshObject.morphTargetDictionary || !meshObject.morphTargetInfluences) return;
      Object.entries(morphTargetWeights).forEach(([name, weight]) => {
        const index = meshObject.morphTargetDictionary?.[name];
        if (index !== undefined) meshObject.morphTargetInfluences![index] = weight;
      });
    });
    output.updateMatrixWorld(true);
    return output;
  }, [scene${needsSourceNodeTags ? ", parser" : ""}]);`,
  };
}

function resolveModelMaterialOverrides(
  entity: SceneEntity,
  mesh: MeshComponent,
  model: ModelAsset,
  context: CompileContext,
): ModelMaterialOverride[] {
  const slots = getGeometryMaterialSlots(model);
  const openBrushModel = isOpenBrushModelMetadata(
    model.importMetadata?.openBrush,
  );
  const slotById = new Map(slots.map((slot) => [slot.slot, slot]));
  const bindingBySlot = new Map<string, string>();
  for (const binding of mesh.materialBindings) {
    const bindingKey = `${binding.sourceNodeIndex ?? "global"}:${binding.slot}`;
    if (bindingBySlot.has(bindingKey)) {
      addDiagnostic(context, {
        severity: "blocking",
        code: "model-material-binding-duplicate",
        message: `Model material slot「${binding.slot}」のbindingが重複しています`,
        sceneId: context.scene.sceneId,
        entityId: entity.id,
        componentId: mesh.id,
        assetId: model.id,
        fieldPath: "materialBindings",
      });
      continue;
    }
    if (!slotById.has(binding.slot)) {
      addDiagnostic(context, {
        severity: "blocking",
        code: "model-material-slot-missing",
        message: `Modelにmaterial slot「${binding.slot}」がありません`,
        sceneId: context.scene.sceneId,
        entityId: entity.id,
        componentId: mesh.id,
        assetId: model.id,
        fieldPath: "materialBindings",
      });
      continue;
    }
    bindingBySlot.set(bindingKey, binding.materialAssetId);
  }

  const overrides: ModelMaterialOverride[] = [];
  const appendOverride = (
    slot: MaterialSlotDefinition,
    materialAssetId: string | undefined,
    sourceNodeIndex?: number,
  ) => {
    if (!materialAssetId) return;
    context.referencedAssetIds.add(materialAssetId);
    const material = getMaterialAsset(context.assets, materialAssetId);
    if (!material) {
      addDiagnostic(context, {
        severity: "blocking",
        code: "model-material-asset-missing",
        message: `Material Assetが見つかりません: ${materialAssetId}`,
        sceneId: context.scene.sceneId,
        entityId: entity.id,
        componentId: mesh.id,
        assetId: materialAssetId,
        fieldPath: `materialBindings.${slot.slot}`,
      });
      return;
    }
    if (openBrushModel && material.shader?.kind === "openbrush") {
      if (material.shader.sourceMaterialIndex !== slot.sourceMaterialIndex) {
        addDiagnostic(context, {
          severity: "blocking",
          code: "openbrush-material-preset-mismatch",
          message: `OpenBrush Material「${material.name}」は元のbrush slotへ割り当ててください`,
          sceneId: context.scene.sceneId,
          entityId: entity.id,
          componentId: mesh.id,
          assetId: material.id,
          fieldPath: `materialBindings.${slot.slot}`,
        });
      }
      // Identity presets are already reconstructed by the three-icosa loader.
      // Only ordinary XRift Materials become JSX material injections.
      return;
    }
    overrides.push({
      slot,
      material,
      ...(sourceNodeIndex === undefined ? {} : { sourceNodeIndex }),
    });
  };
  for (const slot of slots) {
    const materialAssetId = openBrushModel
      ? bindingBySlot.get(`global:${slot.slot}`)
      : bindingBySlot.get(`global:${slot.slot}`) ?? slot.defaultMaterialAssetId;
    appendOverride(slot, materialAssetId);
  }
  for (const binding of mesh.materialBindings) {
    if (binding.sourceNodeIndex === undefined) continue;
    const slot = slotById.get(binding.slot);
    if (!slot) continue;
    appendOverride(slot, binding.materialAssetId, binding.sourceNodeIndex);
  }

  const bySourceName = new Map<string, string>();
  for (const override of overrides) {
    const sourceKey = `${override.sourceNodeIndex ?? "global"}:${override.slot.name}`;
    const previous = bySourceName.get(sourceKey);
    if (previous && previous !== override.material.id) {
      addDiagnostic(context, {
        severity: "blocking",
        code: "model-material-name-ambiguous",
        message: `同名のglTF material「${override.slot.name}」へ異なるMaterialを割り当てられません`,
        sceneId: context.scene.sceneId,
        entityId: entity.id,
        componentId: mesh.id,
        assetId: model.id,
        fieldPath: "materialBindings",
      });
    } else {
      bySourceName.set(sourceKey, override.material.id);
    }
  }
  return overrides;
}

function renderModelMaterialInjection(
  overrides: ReadonlyArray<
    ModelMaterialOverride & { componentName: string }
  >,
  allowWildcard: boolean,
): string {
  if (overrides.length === 0) return "";
  const globalByName = new Map<
    string,
    ModelMaterialOverride & { componentName: string }
  >();
  const nodeByKey = new Map<
    string,
    ModelMaterialOverride & { componentName: string }
  >();
  overrides.forEach((override) => {
    if (override.sourceNodeIndex === undefined) {
      globalByName.set(override.slot.name, override);
    } else {
      nodeByKey.set(
        `${override.sourceNodeIndex}:${override.slot.name}`,
        override,
      );
    }
  });
  const wildcard =
    allowWildcard && nodeByKey.size === 0 && globalByName.size === 1
      ? [...globalByName.values()][0]
      : undefined;
  const nodeCases = [...nodeByKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([sourceKey, override]) =>
        `        case ${JSON.stringify(sourceKey)}:\n          return <${override.componentName} key={key} attach={attach} meshName={object.name} />;`,
    )
    .join("\n");
  const globalCases = [...globalByName.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([sourceName, override]) =>
        `        case ${JSON.stringify(sourceName)}:\n          return <${override.componentName} key={key} attach={attach} meshName={object.name} />;`,
    )
    .join("\n");
  const resolver = wildcard
    ? `      return <${wildcard.componentName} key={key} attach={attach} meshName={object.name} />;`
    : `${nodeCases ? `      if (typeof sourceNodeIndex === "number") {\n        switch (\`\${sourceNodeIndex}:\${materialName}\`) {\n${nodeCases}\n        }\n      }\n` : ""}      switch (materialName) {\n${globalCases}\n        default:\n          return null;\n      }`;
  const sourceNodeLookup = nodeCases
    ? `          let sourceNodeObject: typeof object | null = object;
          let sourceNodeIndex: number | undefined;
          while (sourceNodeObject) {
            const candidate = sourceNodeObject.userData?.xriftSourceNodeIndex;
            if (typeof candidate === "number") {
              sourceNodeIndex = candidate;
              break;
            }
            sourceNodeObject = sourceNodeObject.parent;
          }
`
    : "";
  const materialNameLookup = wildcard
    ? ""
    : `            const materialName =
              typeof material === "object" && material !== null && "name" in material
                ? String(material.name)
                : "";
`;
  return `
        inject={(object) => {
${sourceNodeLookup}
          if (!("material" in object)) return null;
          const renderOverride = (${wildcard ? "_material" : "material"}: unknown, attach: string, key: string) => {
${materialNameLookup}
${resolver}
          };
          const sourceMaterial = object.material;
          return Array.isArray(sourceMaterial)
            ? sourceMaterial.map((material, index) =>
                renderOverride(material, \`material-\${index}\`, \`material-\${index}\`),
              )
            : renderOverride(sourceMaterial, "material", "material");
        }}`;
}

function resolveMeshMaterial(
  mesh: MeshComponent,
  context: CompileContext,
): MaterialAsset | undefined {
  const geometryAssetId =
    mesh.geometry?.kind === "asset" ? mesh.geometry.assetId : mesh.geometryAssetId;
  const geometry =
    mesh.geometry?.kind === "terrain"
      ? undefined
      : getGeometryAsset(context.assets, geometryAssetId);
  const slots = geometry ? getGeometryMaterialSlots(geometry) : [];
  const primary =
    mesh.materialBindings.find((binding) => binding.slot === "default") ??
    mesh.materialBindings[0];
  const materialAssetId =
    primary?.materialAssetId ?? slots[0]?.defaultMaterialAssetId;
  if (mesh.materialBindings.length > 1) {
    addDiagnostic(context, {
      severity: "warning",
      code: "primitive-extra-material-slots",
      message: "Primitive Mesh では先頭の Material slot だけを使用します",
      sceneId: context.scene.sceneId,
      componentId: mesh.id,
      fieldPath: "materialBindings",
    });
  }
  if (!materialAssetId) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "material-binding-missing",
      message: "Mesh に Material が設定されていません",
      sceneId: context.scene.sceneId,
      componentId: mesh.id,
      fieldPath: "materialBindings",
    });
    return undefined;
  }
  context.referencedAssetIds.add(materialAssetId);
  const material = getMaterialAsset(context.assets, materialAssetId);
  if (!material) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "material-asset-missing",
      message: "Material Asset が見つかりません",
      sceneId: context.scene.sceneId,
      componentId: mesh.id,
      assetId: materialAssetId,
      fieldPath: "materialBindings",
    });
  }
  return material;
}

type MaterialShaderModel = "basic" | "standard" | "physical";

const SUPPORTED_COMPILED_MATERIAL_EXTENSIONS = new Set([
  "KHR_materials_anisotropy",
  "KHR_materials_clearcoat",
  "KHR_materials_dispersion",
  "KHR_materials_emissive_strength",
  "KHR_materials_ior",
  "KHR_materials_iridescence",
  "KHR_materials_sheen",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_unlit",
  "KHR_materials_volume",
]);

const PHYSICAL_MATERIAL_EXTENSION_KEYS = [
  "KHR_materials_anisotropy",
  "KHR_materials_clearcoat",
  "KHR_materials_dispersion",
  "KHR_materials_ior",
  "KHR_materials_iridescence",
  "KHR_materials_sheen",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_volume",
] as const;

function getMaterialShaderModel(
  properties: MaterialProperties,
): MaterialShaderModel {
  if (properties.extensions.KHR_materials_unlit !== undefined) return "basic";
  return PHYSICAL_MATERIAL_EXTENSION_KEYS.some(
    (key) => properties.extensions[key] !== undefined,
  )
    ? "physical"
    : "standard";
}

function materialElementName(model: MaterialShaderModel): string {
  switch (model) {
    case "basic":
      return "meshBasicMaterial";
    case "physical":
      return "meshPhysicalMaterial";
    default:
      return "meshStandardMaterial";
  }
}

function renderMaterial(
  entity: SceneEntity,
  mesh: MeshComponent,
  asset: MaterialAsset,
  context: CompileContext,
): string {
  const properties = normalizeMaterialProperties(
    asset.properties as unknown as Parameters<typeof normalizeMaterialProperties>[0],
  );
  if (asset.shader?.kind === "classic-r3f") {
    const shaderDiagnostics = validateClassicR3fMaterialShader(asset.shader);
    if (shaderDiagnostics.length > 0) {
      addDiagnostic(context, {
        severity: "blocking",
        code: "custom-shader-invalid",
        message: `Custom Shader「${asset.name}」を検証できません: ${shaderDiagnostics.join("、")}`,
        sceneId: context.scene.sceneId,
        entityId: entity.id,
        componentId: mesh.id,
        assetId: asset.id,
        fieldPath: `material.${asset.id}.shader`,
      });
      return renderMaterial(entity, mesh, { ...asset, shader: undefined }, context);
    }
    const componentName = registerMaterialComponent(
      entity,
      mesh,
      asset,
      context,
    );
    return `<${componentName} />`;
  }
  if (properties.doubleSided) context.usesDoubleSide = true;
  diagnoseMaterialExtensions(entity, mesh, asset, properties, context);
  const materialKind = getMaterialShaderModel(properties);
  if (hasMaterialTextures(properties, materialKind)) {
    const componentName = registerMaterialComponent(
      entity,
      mesh,
      asset,
      context,
    );
    return `<${componentName} />`;
  }
  return `<${materialElementName(materialKind)} ${renderMaterialProps(properties, materialKind, context).join(" ")} />`;
}

function registerMaterialComponent(
  entity: SceneEntity,
  mesh: MeshComponent,
  asset: MaterialAsset,
  context: CompileContext,
): string {
  const componentName = generatedIdentifier("CompiledMaterial", asset.id);
  const declarationKey = `material:${componentName}`;
  if (context.supportDeclarations.has(declarationKey)) return componentName;
  if (asset.shader?.kind === "classic-r3f") {
    return registerClassicR3fMaterialComponent(
      entity,
      mesh,
      asset,
      componentName,
      declarationKey,
      context,
    );
  }

  const properties = normalizeMaterialProperties(
    asset.properties as unknown as Parameters<typeof normalizeMaterialProperties>[0],
  );
  if (properties.doubleSided) context.usesDoubleSide = true;
  diagnoseMaterialExtensions(entity, mesh, asset, properties, context);
  const materialKind = getMaterialShaderModel(properties);
  context.supportDeclarations.set(
    "material:00-props-type",
    "type CompiledMaterialProps = { attach?: string; meshName?: string };",
  );

  const textureLines: string[] = [];
  const textureProps: string[] = [];
  const pbr = properties.pbrMetallicRoughness;
  addCompiledTexture(
    "baseColorMap",
    "map",
    pbr.baseColorTexture,
    "srgb",
    entity,
    mesh,
    asset,
    context,
    textureLines,
    textureProps,
  );
  if (materialKind !== "basic") {
    const metallicRoughnessMap = addCompiledTexture(
      "metallicRoughnessMap",
      "metalnessMap",
      pbr.metallicRoughnessTexture,
      "linear",
      entity,
      mesh,
      asset,
      context,
      textureLines,
      textureProps,
    );
    if (metallicRoughnessMap) {
      textureProps.push("roughnessMap={metallicRoughnessMap}");
    }
    const normalMap = addCompiledTexture(
      "normalMap",
      "normalMap",
      properties.normalTexture,
      "linear",
      entity,
      mesh,
      asset,
      context,
      textureLines,
      textureProps,
    );
    if (normalMap && properties.normalTexture) {
      textureProps.push(
        `normalScale={[${formatNumber(properties.normalTexture.scale)}, ${formatNumber(properties.normalTexture.scale)}]}`,
      );
    }
    const occlusionMap = addCompiledTexture(
      "occlusionMap",
      "aoMap",
      properties.occlusionTexture,
      "linear",
      entity,
      mesh,
      asset,
      context,
      textureLines,
      textureProps,
    );
    if (occlusionMap && properties.occlusionTexture) {
      textureProps.push(
        `aoMapIntensity={${formatNumber(properties.occlusionTexture.strength)}}`,
      );
    }
    addCompiledTexture(
      "emissiveMap",
      "emissiveMap",
      properties.emissiveTexture,
      "srgb",
      entity,
      mesh,
      asset,
      context,
      textureLines,
      textureProps,
    );
  }
  if (materialKind === "physical") {
    addCompiledMaterialExtensionTextures(
      properties,
      entity,
      mesh,
      asset,
      context,
      textureLines,
      textureProps,
    );
  }

  const materialProps = [
    "attach={attach}",
    ...renderMaterialProps(properties, materialKind, context),
    ...textureProps,
  ];
  const source = `const ${componentName}: FC<CompiledMaterialProps> = ({ attach = "material" }) => {
${textureLines.length > 0 ? `${textureLines.map((line) => `  ${line}`).join("\n")}\n` : ""}  return <${materialElementName(materialKind)} ${materialProps.join(" ")} />;
};`;
  context.supportDeclarations.set(declarationKey, source);
  return componentName;
}

function registerClassicR3fMaterialComponent(
  entity: SceneEntity,
  mesh: MeshComponent,
  asset: MaterialAsset,
  componentName: string,
  declarationKey: string,
  context: CompileContext,
): string {
  const shader = asset.shader;
  if (!shader || shader.kind !== "classic-r3f") return componentName;
  context.supportDeclarations.set(
    "material:00-props-type",
    "type CompiledMaterialProps = { attach?: string; meshName?: string };",
  );
  context.supportDeclarations.set(
    "material:00-classic-variant-type",
    `type CompiledClassicShaderVariant = {
  name: string;
  meshNameIncludes: string | null;
  defines: Record<string, string>;
  side: "front" | "back" | "double";
  transparent: boolean;
  depthWrite: boolean;
};`,
  );
  context.reactValueImports.add("useMemo");
  ["BackSide", "DoubleSide", "FrontSide"].forEach((name) =>
    context.threeValueImports.add(name),
  );

  const textureLines: string[] = [];
  const textureDependencies: string[] = [];
  const uniformEntries: string[] = [];
  // Wind is authored on the Scene, not on the Material, so a shader that opts
  // into the wind contract gets the scene's values rather than whatever was
  // saved in its own uniforms.
  const entityWind = entity.components.find(
    (component): component is Extract<typeof component, { type: "vegetation-wind" }> =>
      component.type === "vegetation-wind",
  );
  const wind = new Map(
    windDrivenUniforms(
      shader,
      resolveSceneWind(
        resolveSceneSettings(context.scene.settings).vegetation,
        entityWind,
      ),
    ).map((entry) => [entry.name, entry]),
  );
  // The scene's key light, supplied the same way the wind is, so a published
  // world shades its official Materials from the same light the editor did.
  const lighting = new Map(
    lightingDrivenUniforms(
      shader,
      resolveSceneLighting(
        context.scene,
        resolveSceneSettings(context.scene.settings).ambient,
      ),
    ).map((entry) => [entry.name, entry]),
  );
  for (const [uniformName, uniform] of Object.entries(shader.uniforms)) {
    const lightingOverride = lighting.get(uniformName);
    if (lightingOverride) {
      if (lightingOverride.kind === "number") {
        uniformEntries.push(
          `${JSON.stringify(uniformName)}: { value: ${formatNumber(lightingOverride.value)} }`,
        );
      } else {
        context.threeValueImports.add("Vector3");
        uniformEntries.push(
          `${JSON.stringify(uniformName)}: { value: new Vector3(${lightingOverride.value.map(formatNumber).join(", ")}) }`,
        );
      }
      continue;
    }
    const windOverride = wind.get(uniformName);
    if (windOverride) {
      if (windOverride.kind === "number") {
        uniformEntries.push(
          `${JSON.stringify(uniformName)}: { value: ${formatNumber(windOverride.value)} }`,
        );
      } else {
        context.threeValueImports.add("Vector2");
        uniformEntries.push(
          `${JSON.stringify(uniformName)}: { value: new Vector2(${windOverride.value.map(formatNumber).join(", ")}) }`,
        );
      }
      continue;
    }
    if (uniform.kind === "number") {
      uniformEntries.push(
        `${JSON.stringify(uniformName)}: { value: ${formatNumber(uniform.value)} }`,
      );
      continue;
    }
    if (uniform.kind === "color") {
      context.threeValueImports.add("Color");
      uniformEntries.push(
        `${JSON.stringify(uniformName)}: { value: new Color(${JSON.stringify(uniform.value)}) }`,
      );
      continue;
    }
    if (uniform.kind === "vector") {
      const vectorType =
        uniform.value.length === 2
          ? "Vector2"
          : uniform.value.length === 3
            ? "Vector3"
            : "Vector4";
      context.threeValueImports.add(vectorType);
      uniformEntries.push(
        `${JSON.stringify(uniformName)}: { value: new ${vectorType}(${uniform.value.map(formatNumber).join(", ")}) }`,
      );
      continue;
    }

    context.referencedAssetIds.add(uniform.textureAssetId);
    const texture = getTextureAsset(context.assets, uniform.textureAssetId);
    const runtimeUrl = texture
      ? context.assetRuntimeUrls.get(texture.id)
      : undefined;
    if (!texture || !runtimeUrl) {
      addDiagnostic(context, {
        severity: "blocking",
        code: "classic-shader-texture-unavailable",
        message: `Custom Shader uniform「${uniformName}」のTexture Assetを出力できません`,
        sceneId: context.scene.sceneId,
        entityId: entity.id,
        componentId: mesh.id,
        assetId: uniform.textureAssetId,
        fieldPath: `material.${asset.id}.shader.uniforms.${uniformName}`,
      });
      uniformEntries.push(`${JSON.stringify(uniformName)}: { value: null }`);
      continue;
    }
    const variableName = generatedIdentifier(
      "classicTexture",
      `${asset.id}:${uniformName}`,
    );
    const usesKtx2 = isPublishedAsKtx2(texture);
    registerCompiledTextureRuntime(context, usesKtx2);
    const urlConstant = registerAssetUrl(texture, runtimeUrl, context);
    const optionsConstant = generatedIdentifier(
      "CLASSIC_TEXTURE_OPTIONS",
      `${asset.id}:${uniformName}`,
    );
    const settings = texture.importSettings;
    const filter = uniform.filter ?? settings.sampler.magFilter;
    context.supportDeclarations.set(
      `texture-options:${optionsConstant}`,
      `const ${optionsConstant}: CompiledTextureOptions = ${JSON.stringify({
        channel: 0,
        colorSpace: uniform.colorSpace ?? "linear",
        flipY: settings.flipY,
        generateMipmaps:
          uniform.generateMipmaps ?? settings.generateMipmaps,
        magFilter: filter,
        minFilter: filter,
        wrapS: uniform.wrapS ?? settings.sampler.wrapS,
        wrapT: uniform.wrapT ?? settings.sampler.wrapT,
      })};`,
    );
    textureLines.push(
      `const ${variableName}Url = useCompiledAssetUrl(${urlConstant});`,
      `const ${variableName} = useCompiledTexture(${usesKtx2 ? "useCompiledKtx2" : "useTexture"}(${variableName}Url), ${optionsConstant});`,
    );
    textureDependencies.push(variableName);
    uniformEntries.push(
      `${JSON.stringify(uniformName)}: { value: ${variableName} }`,
    );
  }

  const variantsConstant = generatedIdentifier(
    "CLASSIC_MATERIAL_VARIANTS",
    asset.id,
  );
  context.supportDeclarations.set(
    `material-variants:${variantsConstant}`,
    `const ${variantsConstant}: readonly CompiledClassicShaderVariant[] = ${JSON.stringify(
      shader.variants.map((variant) => ({
        ...variant,
        meshNameIncludes: variant.meshNameIncludes ?? null,
      })),
    )} as const;`,
  );
  const timeUniforms = detectTimeUniforms(shader);
  const hasTimeUniforms = timeUniforms.length > 0;
  if (hasTimeUniforms) {
    context.reactValueImports.add("useRef");
    context.fiberImports.add("useFrame");
    context.threeTypeImports.add("ShaderMaterial");
  }
  const timeUniformCode = hasTimeUniforms
    ? `  const materialRef = useRef<ShaderMaterial>(null);
  useFrame((state) => {
    const material = materialRef.current;
    if (!material) return;
    const elapsed = state.clock.getElapsedTime();
${timeUniforms
  .map((spec) => {
    if (spec.glslType === "vec4") {
      return `    {
      const uniform = material.uniforms[${JSON.stringify(spec.name)}];
      if (uniform) {
        const value = uniform.value;
        if (value && "set" in value) {
          value.set(elapsed / 20, elapsed, elapsed * 2, elapsed * 3);
        } else {
          uniform.value = [elapsed / 20, elapsed, elapsed * 2, elapsed * 3];
        }
      }
    }`;
    }
    return `    if (material.uniforms[${JSON.stringify(spec.name)}]) { material.uniforms[${JSON.stringify(spec.name)}].value = elapsed; }`;
  })
  .join("\n")}
  });
`
    : "";
  const source = `const ${componentName}: FC<CompiledMaterialProps> = ({ attach = "material", meshName = "" }) => {
${textureLines.length > 0 ? `${textureLines.map((line) => `  ${line}`).join("\n")}\n` : ""}  const uniforms = useMemo(() => ({
    ${uniformEntries.join(",\n    ")}
  }), [${textureDependencies.join(", ")}]);
  const normalizedMeshName = meshName.toLocaleLowerCase();
  const variant =
    ${variantsConstant}.find(
      (candidate) =>
        candidate.meshNameIncludes &&
        normalizedMeshName.includes(candidate.meshNameIncludes.toLocaleLowerCase()),
    ) ??
    ${variantsConstant}.find((candidate) => !candidate.meshNameIncludes) ??
    ${variantsConstant}[0];
${timeUniformCode}  const side =
    variant.side === "back"
      ? BackSide
      : variant.side === "front"
        ? FrontSide
        : DoubleSide;
  return (
    <shaderMaterial
      ${hasTimeUniforms ? "ref={materialRef}" : ""}
      attach={attach}
      vertexShader={${JSON.stringify(shader.vertexShader)}}
      fragmentShader={${JSON.stringify(shader.fragmentShader)}}
      uniforms={uniforms}
      defines={variant.defines}
      side={side}
      transparent={variant.transparent}
      depthWrite={variant.depthWrite}
    />
  );
};`;
  context.supportDeclarations.set(declarationKey, source);
  return componentName;
}

function addCompiledMaterialExtensionTextures(
  properties: MaterialProperties,
  entity: SceneEntity,
  mesh: MeshComponent,
  asset: MaterialAsset,
  context: CompileContext,
  textureLines: string[],
  textureProps: string[],
): void {
  const extensions = properties.extensions;
  const add = (
    variableName: string,
    materialProp: string,
    textureInfo: MaterialTextureInfo | undefined,
    colorSpace: "srgb" | "linear",
  ) =>
    addCompiledTexture(
      variableName,
      materialProp,
      textureInfo,
      colorSpace,
      entity,
      mesh,
      asset,
      context,
      textureLines,
      textureProps,
    );

  const anisotropy = extensions.KHR_materials_anisotropy;
  add("anisotropyMap", "anisotropyMap", anisotropy?.anisotropyTexture, "linear");

  const clearcoat = extensions.KHR_materials_clearcoat;
  add("clearcoatMap", "clearcoatMap", clearcoat?.clearcoatTexture, "linear");
  add(
    "clearcoatRoughnessMap",
    "clearcoatRoughnessMap",
    clearcoat?.clearcoatRoughnessTexture,
    "linear",
  );
  const clearcoatNormalMap = add(
    "clearcoatNormalMap",
    "clearcoatNormalMap",
    clearcoat?.clearcoatNormalTexture,
    "linear",
  );
  if (clearcoatNormalMap && clearcoat?.clearcoatNormalTexture) {
    const scale = formatNumber(clearcoat.clearcoatNormalTexture.scale);
    textureProps.push(`clearcoatNormalScale={[${scale}, ${scale}]}`);
  }

  const iridescence = extensions.KHR_materials_iridescence;
  add(
    "iridescenceMap",
    "iridescenceMap",
    iridescence?.iridescenceTexture,
    "linear",
  );
  add(
    "iridescenceThicknessMap",
    "iridescenceThicknessMap",
    iridescence?.iridescenceThicknessTexture,
    "linear",
  );

  const sheen = extensions.KHR_materials_sheen;
  add("sheenColorMap", "sheenColorMap", sheen?.sheenColorTexture, "srgb");
  add(
    "sheenRoughnessMap",
    "sheenRoughnessMap",
    sheen?.sheenRoughnessTexture,
    "linear",
  );

  const specular = extensions.KHR_materials_specular;
  add(
    "specularIntensityMap",
    "specularIntensityMap",
    specular?.specularTexture,
    "linear",
  );
  add(
    "specularColorMap",
    "specularColorMap",
    specular?.specularColorTexture,
    "srgb",
  );

  const transmission = extensions.KHR_materials_transmission;
  add(
    "transmissionMap",
    "transmissionMap",
    transmission?.transmissionTexture,
    "linear",
  );

  const volume = extensions.KHR_materials_volume;
  add("thicknessMap", "thicknessMap", volume?.thicknessTexture, "linear");
}

function addCompiledTexture(
  variableName: string,
  materialProp: string,
  textureInfo: MaterialTextureInfo | undefined,
  colorSpace: "srgb" | "linear",
  entity: SceneEntity,
  mesh: MeshComponent,
  material: MaterialAsset,
  context: CompileContext,
  textureLines: string[],
  textureProps: string[],
): boolean {
  if (!textureInfo) return false;
  context.referencedAssetIds.add(textureInfo.textureAssetId);
  const texture = getTextureAsset(context.assets, textureInfo.textureAssetId);
  if (!texture) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "material-texture-missing",
      message: `Texture Assetが見つかりません: ${textureInfo.textureAssetId}`,
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: mesh.id,
      assetId: textureInfo.textureAssetId,
      fieldPath: `material.${material.id}.${materialProp}`,
    });
    return false;
  }
  const runtimeUrl = context.assetRuntimeUrls.get(texture.id);
  if (!runtimeUrl) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "material-texture-source-unsupported",
      message: `${texture.name}を公開できません。プロジェクト内に保存された対応形式の画像を選び直してください`,
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: mesh.id,
      assetId: texture.id,
      fieldPath: `material.${material.id}.${materialProp}`,
    });
    return false;
  }

  const usesKtx2 = isPublishedAsKtx2(texture);
  registerCompiledTextureRuntime(context, usesKtx2);
  const urlConstant = registerAssetUrl(texture, runtimeUrl, context);
  const optionsConstant = generatedIdentifier(
    "TEXTURE_OPTIONS",
    `${material.id}:${variableName}`,
  );
  const settings = texture.importSettings;
  context.supportDeclarations.set(
    `texture-options:${optionsConstant}`,
    `const ${optionsConstant}: CompiledTextureOptions = ${JSON.stringify({
      channel: textureInfo.texCoord,
      colorSpace,
      flipY: settings.flipY,
      generateMipmaps: settings.generateMipmaps,
      magFilter: settings.sampler.magFilter,
      minFilter: settings.sampler.minFilter,
      wrapS: settings.sampler.wrapS,
      wrapT: settings.sampler.wrapT,
      ...(textureInfo.transform
        ? { uvTransform: textureInfo.transform }
        : {}),
    })};`,
  );
  textureLines.push(
    `const ${variableName}Url = useCompiledAssetUrl(${urlConstant});`,
    `const ${variableName} = useCompiledTexture(${usesKtx2 ? "useCompiledKtx2" : "useTexture"}(${variableName}Url), ${optionsConstant});`,
  );
  textureProps.push(`${materialProp}={${variableName}}`);
  return true;
}

function registerCompiledTextureRuntime(
  context: CompileContext,
  usesKtx2 = false,
): void {
  if (usesKtx2) registerCompiledKtx2Runtime(context);
  else context.dreiImports.add("useTexture");
  const key = "texture-runtime:use-compiled-texture";
  if (context.supportDeclarations.has(key)) return;
  context.reactValueImports.add("useEffect");
  context.reactValueImports.add("useMemo");
  context.threeTypeImports.add("Texture");
  [
    "ClampToEdgeWrapping",
    "LinearFilter",
    "LinearMipmapLinearFilter",
    "LinearMipmapNearestFilter",
    "MirroredRepeatWrapping",
    "NearestFilter",
    "NearestMipmapLinearFilter",
    "NearestMipmapNearestFilter",
    "NoColorSpace",
    "RepeatWrapping",
    "SRGBColorSpace",
  ].forEach((name) => context.threeValueImports.add(name));
  context.supportDeclarations.set(
    key,
    `type CompiledTextureOptions = {
  channel: number;
  colorSpace: "srgb" | "linear";
  flipY: boolean;
  generateMipmaps: boolean;
  magFilter: "nearest" | "linear";
  minFilter:
    | "nearest"
    | "linear"
    | "nearest-mipmap-nearest"
    | "linear-mipmap-nearest"
    | "nearest-mipmap-linear"
    | "linear-mipmap-linear";
  wrapS: "repeat" | "clamp-to-edge" | "mirrored-repeat";
  wrapT: "repeat" | "clamp-to-edge" | "mirrored-repeat";
  uvTransform?: {
    offset: [number, number];
    rotation: number;
    scale: [number, number];
  };
};

const COMPILED_TEXTURE_WRAP = {
  "clamp-to-edge": ClampToEdgeWrapping,
  "mirrored-repeat": MirroredRepeatWrapping,
  repeat: RepeatWrapping,
} as const;

const COMPILED_TEXTURE_MAG_FILTER = {
  linear: LinearFilter,
  nearest: NearestFilter,
} as const;

const COMPILED_TEXTURE_MIN_FILTER = {
  linear: LinearFilter,
  "linear-mipmap-linear": LinearMipmapLinearFilter,
  "linear-mipmap-nearest": LinearMipmapNearestFilter,
  nearest: NearestFilter,
  "nearest-mipmap-linear": NearestMipmapLinearFilter,
  "nearest-mipmap-nearest": NearestMipmapNearestFilter,
} as const;

function useCompiledTexture(source: Texture, options: CompiledTextureOptions): Texture {
  const texture = useMemo(() => {
    const clone = source.clone();
    clone.channel = options.channel;
    clone.colorSpace = options.colorSpace === "srgb" ? SRGBColorSpace : NoColorSpace;
    clone.flipY = options.flipY;
    clone.generateMipmaps = options.generateMipmaps;
    clone.magFilter = COMPILED_TEXTURE_MAG_FILTER[options.magFilter];
    clone.minFilter = COMPILED_TEXTURE_MIN_FILTER[options.minFilter];
    clone.wrapS = COMPILED_TEXTURE_WRAP[options.wrapS];
    clone.wrapT = COMPILED_TEXTURE_WRAP[options.wrapT];
    if (options.uvTransform) {
      clone.offset.set(...options.uvTransform.offset);
      clone.rotation = options.uvTransform.rotation;
      clone.repeat.set(...options.uvTransform.scale);
    }
    clone.needsUpdate = true;
    return clone;
  }, [source, options]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}`,
  );
}

function registerCompiledKtx2Runtime(context: CompileContext): void {
  const key = "texture-runtime:use-compiled-ktx2";
  if (context.supportDeclarations.has(key)) return;
  context.dreiImports.add("useKTX2");
  context.imports.add("useXRift");
  context.threeTypeImports.add("Texture");
  context.supportDeclarations.set(
    key,
    `const COMPILED_KTX2_TRANSCODER_DIRECTORY = ${JSON.stringify(
      `${PUBLISHED_BASIS_TRANSCODER_DIRECTORY}/`,
    )} as const;

function useCompiledKtx2(assetUrl: string): Texture {
  const { baseUrl } = useXRift();
  return useKTX2(assetUrl, \`\${baseUrl}\${COMPILED_KTX2_TRANSCODER_DIRECTORY}\`);
}`,
  );
}

function renderMaterialProps(
  properties: MaterialProperties,
  materialKind: MaterialShaderModel,
  context: CompileContext,
): string[] {
  const pbr = properties.pbrMetallicRoughness;
  const color = colorToHex(pbr.baseColorFactor);
  const opacity = properties.alphaMode === "OPAQUE" ? 1 : pbr.baseColorFactor[3];
  // Resolved by the same function the editor viewport uses, so a published
  // Material blends, clips and sorts the way it did while being authored.
  const alpha = materialAlphaRenderProps(properties);
  const props = [
    `color=${JSON.stringify(color)}`,
    `opacity={${formatNumber(opacity)}}`,
    `transparent={${alpha.transparent}}`,
  ];
  if (materialKind !== "basic") {
    props.push(
      `metalness={${formatNumber(pbr.metallicFactor)}}`,
      `roughness={${formatNumber(pbr.roughnessFactor)}}`,
      `emissive=${JSON.stringify(colorToHex(properties.emissiveFactor))}`,
    );
    const emissiveStrength =
      properties.extensions.KHR_materials_emissive_strength;
    if (emissiveStrength) {
      props.push(
        `emissiveIntensity={${formatNumber(emissiveStrength.emissiveStrength)}}`,
      );
    }
  }
  if (materialKind === "physical") {
    appendPhysicalMaterialProps(properties, context, props);
  }
  if (alpha.alphaTest > 0) {
    props.push(`alphaTest={${formatNumber(alpha.alphaTest)}}`);
  }
  if (alpha.alphaToCoverage) props.push("alphaToCoverage");
  if (!alpha.depthWrite) props.push("depthWrite={false}");
  if (alpha.blending !== "NormalBlending") {
    context.threeValueImports.add(alpha.blending);
    props.push(`blending={${alpha.blending}}`);
  }
  if (properties.doubleSided) {
    props.push("side={DoubleSide}");
  }
  return props;
}

function appendPhysicalMaterialProps(
  properties: MaterialProperties,
  context: CompileContext,
  props: string[],
): void {
  const extensions = properties.extensions;
  const anisotropy = extensions.KHR_materials_anisotropy;
  if (anisotropy) {
    props.push(
      `anisotropy={${formatNumber(anisotropy.anisotropyStrength)}}`,
      `anisotropyRotation={${formatNumber(anisotropy.anisotropyRotation)}}`,
    );
  }

  const clearcoat = extensions.KHR_materials_clearcoat;
  if (clearcoat) {
    props.push(
      `clearcoat={${formatNumber(clearcoat.clearcoatFactor)}}`,
      `clearcoatRoughness={${formatNumber(clearcoat.clearcoatRoughnessFactor)}}`,
    );
  }

  const dispersion = extensions.KHR_materials_dispersion;
  if (dispersion) {
    props.push(`dispersion={${formatNumber(dispersion.dispersion)}}`);
  }

  const ior = extensions.KHR_materials_ior;
  if (ior) {
    // Match Three GLTFLoader's documented compatibility path for glTF's
    // special IOR value 0 instead of passing an undefined shader state.
    props.push(`ior={${formatNumber(ior.ior === 0 ? 1000 : ior.ior)}}`);
  }

  const iridescence = extensions.KHR_materials_iridescence;
  if (iridescence) {
    props.push(
      `iridescence={${formatNumber(iridescence.iridescenceFactor)}}`,
      `iridescenceIOR={${formatNumber(iridescence.iridescenceIor)}}`,
      `iridescenceThicknessRange={[${formatNumber(iridescence.iridescenceThicknessMinimum)}, ${formatNumber(iridescence.iridescenceThicknessMaximum)}]}`,
    );
  }

  const sheen = extensions.KHR_materials_sheen;
  if (sheen) {
    props.push(
      "sheen={1}",
      `sheenColor={${renderThreeColor(sheen.sheenColorFactor, context)}}`,
      `sheenRoughness={${formatNumber(sheen.sheenRoughnessFactor)}}`,
    );
  }

  const specular = extensions.KHR_materials_specular;
  if (specular) {
    props.push(
      `specularIntensity={${formatNumber(specular.specularFactor)}}`,
      `specularColor={${renderThreeColor(specular.specularColorFactor, context)}}`,
    );
  }

  const transmission = extensions.KHR_materials_transmission;
  if (transmission) {
    props.push(
      `transmission={${formatNumber(transmission.transmissionFactor)}}`,
    );
  }

  const volume = extensions.KHR_materials_volume;
  if (volume) {
    props.push(
      `thickness={${formatNumber(volume.thicknessFactor)}}`,
      `attenuationColor={${renderThreeColor(volume.attenuationColor, context)}}`,
    );
    if (volume.attenuationDistance !== undefined) {
      props.push(
        `attenuationDistance={${formatNumber(volume.attenuationDistance)}}`,
      );
    }
  }
}

function renderThreeColor(
  color: readonly [number, number, number],
  context: CompileContext,
): string {
  context.threeValueImports.add("Color");
  return `new Color(${color.map(formatNumber).join(", ")})`;
}

function diagnoseMaterialExtensions(
  entity: SceneEntity,
  mesh: MeshComponent,
  asset: MaterialAsset,
  properties: MaterialProperties,
  context: CompileContext,
): void {
  const rawExtensions = (
    asset.properties as unknown as {
      extensions?: Record<string, unknown>;
    }
  ).extensions;
  for (const extensionName of Object.keys(rawExtensions ?? {})) {
    if (SUPPORTED_COMPILED_MATERIAL_EXTENSIONS.has(extensionName)) continue;
    addDiagnostic(context, {
      severity: "blocking",
      code: "material-extension-unsupported",
      message: `Material extensionはstaging sourceに変換できません: ${extensionName}`,
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: mesh.id,
      assetId: asset.id,
      fieldPath: `properties.extensions.${extensionName}`,
    });
  }
  const extensionNames = Object.keys(properties.extensions);
  if (
    properties.extensions.KHR_materials_unlit !== undefined &&
    extensionNames.some((name) => name !== "KHR_materials_unlit")
  ) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "material-unlit-extension-conflict",
      message: "Unlit Materialにライティング用Material extensionは併用できません",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: mesh.id,
      assetId: asset.id,
      fieldPath: "properties.extensions.KHR_materials_unlit",
    });
  }
  if (
    properties.extensions.KHR_materials_volume !== undefined &&
    properties.extensions.KHR_materials_transmission === undefined
  ) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "material-volume-requires-transmission",
      message: "Volume MaterialにはTransmission extensionが必要です",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: mesh.id,
      assetId: asset.id,
      fieldPath: "properties.extensions.KHR_materials_volume",
    });
  }
  if (
    properties.extensions.KHR_materials_dispersion !== undefined &&
    properties.extensions.KHR_materials_volume === undefined
  ) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "material-dispersion-requires-volume",
      message: "Dispersion MaterialにはVolume extensionが必要です",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: mesh.id,
      assetId: asset.id,
      fieldPath: "properties.extensions.KHR_materials_dispersion",
    });
  }
  if (properties.extensions.KHR_materials_ior?.ior === 0) {
    addDiagnostic(context, {
      severity: "warning",
      code: "material-ior-zero-three-compatibility",
      message: "glTF互換のIOR 0はThree.js互換値1000として出力します",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: mesh.id,
      assetId: asset.id,
      fieldPath: "properties.extensions.KHR_materials_ior.ior",
    });
  }
}

function hasMaterialTextures(
  properties: MaterialProperties,
  materialKind: MaterialShaderModel,
): boolean {
  if (properties.pbrMetallicRoughness.baseColorTexture) return true;
  if (materialKind === "basic") return false;
  if (
    properties.pbrMetallicRoughness.metallicRoughnessTexture ||
    properties.normalTexture ||
    properties.occlusionTexture ||
    properties.emissiveTexture
  ) {
    return true;
  }
  if (materialKind !== "physical") return false;
  const extensions = properties.extensions;
  return Boolean(
    extensions.KHR_materials_anisotropy?.anisotropyTexture ||
      extensions.KHR_materials_clearcoat?.clearcoatTexture ||
      extensions.KHR_materials_clearcoat?.clearcoatRoughnessTexture ||
      extensions.KHR_materials_clearcoat?.clearcoatNormalTexture ||
      extensions.KHR_materials_iridescence?.iridescenceTexture ||
      extensions.KHR_materials_iridescence?.iridescenceThicknessTexture ||
      extensions.KHR_materials_sheen?.sheenColorTexture ||
      extensions.KHR_materials_sheen?.sheenRoughnessTexture ||
      extensions.KHR_materials_specular?.specularTexture ||
      extensions.KHR_materials_specular?.specularColorTexture ||
      extensions.KHR_materials_transmission?.transmissionTexture ||
      extensions.KHR_materials_volume?.thicknessTexture,
  );
}

function renderParticleEmitter(
  entity: SceneEntity,
  component: ParticleEmitterComponent,
  context: CompileContext,
): string | null {
  context.referencedAssetIds.add(component.particleAssetId);
  const candidate = context.assets.assets[component.particleAssetId];
  if (candidate?.kind !== "particle") {
    addDiagnostic(context, {
      severity: "blocking",
      code: "particle-asset-missing",
      message: "Particle Emitterが参照するParticle Assetが見つかりません",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: component.id,
      assetId: component.particleAssetId,
      fieldPath: "particleAssetId",
    });
    return null;
  }

  const properties = normalizeParticleProperties(candidate.properties);
  const material = resolveParticleMaterial(entity, component, candidate, context);
  const textureUrl = resolveParticleTextureUrl(
    entity,
    component,
    candidate,
    context,
  );
  registerCompiledParticleRuntime(context);

  if (properties.simulationSpace === "world") {
    addDiagnostic(context, {
      severity: "warning",
      code: "particle-world-space-local-fallback",
      message: "World Spaceパーティクルは生成後のEntity移動に追従するローカル互換表示で出力します",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: component.id,
      assetId: candidate.id,
      fieldPath: "properties.simulationSpace",
    });
  }
  if (properties.emission.bursts.length > 0) {
    addDiagnostic(context, {
      severity: "warning",
      code: "particle-burst-runtime-fallback",
      message: "Burstは連続Emissionと合わせた粒子数として出力します",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: component.id,
      assetId: candidate.id,
      fieldPath: "properties.emission.bursts",
    });
  }
  if (properties.renderer.mode === "stretched-billboard") {
    addDiagnostic(context, {
      severity: "warning",
      code: "particle-stretched-billboard-fallback",
      message: "Stretched BillboardはBillboard互換表示で出力します",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: component.id,
      assetId: candidate.id,
      fieldPath: "properties.renderer.mode",
    });
  }

  const configName = generatedIdentifier("PARTICLE_CONFIG", candidate.id);
  const componentName = generatedIdentifier(
    "CompiledParticle",
    `${candidate.id}:${component.id}`,
  );
  context.supportDeclarations.set(
    `particle-config:${configName}`,
    `const ${configName}: XriftParticleConfig = ${JSON.stringify(properties)};`,
  );

  let textureLine = "";
  let textureProp = "";
  if (textureUrl) {
    const textureAsset = getTextureAsset(
      context.assets,
      properties.renderer.textureAssetId ?? "",
    );
    if (textureAsset) {
      context.reactValueImports.add("useEffect");
      context.reactValueImports.add("useMemo");
      const usesKtx2 = isPublishedAsKtx2(textureAsset);
      if (usesKtx2) registerCompiledKtx2Runtime(context);
      else context.dreiImports.add("useTexture");
      const urlConstant = registerAssetUrl(textureAsset, textureUrl, context);
      const settings = textureAsset.importSettings;
      const colorSpace =
        settings.colorSpace === "linear" ? "NoColorSpace" : "SRGBColorSpace";
      const wrapS = {
        "clamp-to-edge": "ClampToEdgeWrapping",
        "mirrored-repeat": "MirroredRepeatWrapping",
        repeat: "RepeatWrapping",
      }[settings.sampler.wrapS];
      const wrapT = {
        "clamp-to-edge": "ClampToEdgeWrapping",
        "mirrored-repeat": "MirroredRepeatWrapping",
        repeat: "RepeatWrapping",
      }[settings.sampler.wrapT];
      const magFilter = {
        linear: "LinearFilter",
        nearest: "NearestFilter",
      }[settings.sampler.magFilter];
      const minFilter = {
        linear: "LinearFilter",
        "linear-mipmap-linear": "LinearMipmapLinearFilter",
        "linear-mipmap-nearest": "LinearMipmapNearestFilter",
        nearest: "NearestFilter",
        "nearest-mipmap-linear": "NearestMipmapLinearFilter",
        "nearest-mipmap-nearest": "NearestMipmapNearestFilter",
      }[settings.sampler.minFilter];
      [
        colorSpace,
        wrapS,
        wrapT,
        magFilter,
        minFilter,
      ].forEach((name) => context.threeValueImports.add(name));
      textureLine = `  const particleMapUrl = useCompiledAssetUrl(${urlConstant});
  const particleMapSource = ${usesKtx2 ? "useCompiledKtx2" : "useTexture"}(particleMapUrl);
  const particleMap = useMemo(() => {
    const value = particleMapSource.clone();
    value.colorSpace = ${colorSpace};
    value.flipY = ${settings.flipY};
    value.generateMipmaps = ${settings.generateMipmaps};
    value.wrapS = ${wrapS};
    value.wrapT = ${wrapT};
    value.magFilter = ${magFilter};
    value.minFilter = ${minFilter};
    value.needsUpdate = true;
    return value;
  }, [particleMapSource]);
  useEffect(() => () => particleMap.dispose(), [particleMap]);
`;
      textureProp = " map={particleMap}";
    }
  }

  const materialProperties = material
    ? normalizeMaterialProperties(
        material.properties as unknown as Parameters<
          typeof normalizeMaterialProperties
        >[0],
      )
    : undefined;
  const color = materialProperties
    ? colorToHex(materialProperties.pbrMetallicRoughness.baseColorFactor)
    : "#ffffff";
  const opacity = materialProperties
    ? materialProperties.pbrMetallicRoughness.baseColorFactor[3]
    : 1;
  const source = `const ${componentName}: FC = () => {
${textureLine}  return <XriftScriptParticleEmitter componentId=${JSON.stringify(component.id)} config={${configName}} color=${JSON.stringify(color)} opacity={${formatNumber(opacity)}}${textureProp} />;
};`;
  context.supportDeclarations.set(`particle:${componentName}`, source);
  return `<${componentName} />`;
}

function resolveParticleMaterial(
  entity: SceneEntity,
  component: ParticleEmitterComponent,
  particle: ParticleAsset,
  context: CompileContext,
): MaterialAsset | undefined {
  const materialAssetId = particle.properties.renderer.materialAssetId;
  if (!materialAssetId) return undefined;
  context.referencedAssetIds.add(materialAssetId);
  const material = getMaterialAsset(context.assets, materialAssetId);
  if (!material) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "particle-material-missing",
      message: "Particle Rendererが参照するMaterial Assetが見つかりません",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: component.id,
      assetId: materialAssetId,
      fieldPath: "properties.renderer.materialAssetId",
    });
  }
  return material;
}

function resolveParticleTextureUrl(
  entity: SceneEntity,
  component: ParticleEmitterComponent,
  particle: ParticleAsset,
  context: CompileContext,
): string | undefined {
  const textureAssetId = particle.properties.renderer.textureAssetId;
  if (!textureAssetId) return undefined;
  context.referencedAssetIds.add(textureAssetId);
  const texture = getTextureAsset(context.assets, textureAssetId);
  if (!texture) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "particle-texture-missing",
      message: "Particle Rendererが参照するTexture Assetが見つかりません",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: component.id,
      assetId: textureAssetId,
      fieldPath: "properties.renderer.textureAssetId",
    });
    return undefined;
  }
  const runtimeUrl = context.assetRuntimeUrls.get(textureAssetId);
  if (!runtimeUrl) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "particle-texture-source-unsupported",
      message: "Particleに使う画像を公開できません。プロジェクト内に保存された対応形式の画像を選び直してください",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: component.id,
      assetId: textureAssetId,
      fieldPath: "source.relativePath",
    });
  }
  return runtimeUrl;
}

function registerCompiledParticleRuntime(context: CompileContext): void {
  context.extraImports.add(
    "import { XriftScriptParticleEmitter, type XriftParticleConfig } from \"./xrift-studio/particle-runtime\";",
  );
}

function renderLight(
  light: LightComponent,
  context: CompileContext,
): string {
  context.extraImports.add(
    'import { XriftScriptLight } from "./xrift-studio/light-runtime";',
  );
  return `<XriftScriptLight componentId=${JSON.stringify(light.id)} lightType=${JSON.stringify(light.lightType)} enabled={${light.enabled}} color=${JSON.stringify(light.color)} intensity={${formatNumber(light.intensity)}} castShadow={${light.castShadow}} groundColor=${JSON.stringify(light.groundColor ?? "#334155")} distance={${formatNumber(light.distance ?? 0)}} decay={${formatNumber(light.decay ?? 2)}} angle={${formatNumber(light.angle ?? Math.PI / 3)}} penumbra={${formatNumber(light.penumbra ?? 0.5)}} width={${formatNumber(light.width ?? 1)}} height={${formatNumber(light.height ?? 1)}} />`;
}

/**
 * Emits the Text component as the shared runtime panel.
 *
 * Text and its background plate are one object at runtime because the plate is
 * measured from the typeset block. Emitting a bare `<Text>` plus a guessed
 * `<mesh>` would put the plate in a different place than the editor showed.
 */
function renderText(
  entity: SceneEntity,
  text: TextComponent,
  context: CompileContext,
): string {
  registerCompiledTextPanelRuntime(context);
  const configName = generatedIdentifier("TEXT_PANEL_CONFIG", `${entity.id}:${text.id}`);
  context.supportDeclarations.set(
    `text-panel-config:${configName}`,
    `const ${configName}: XriftTextPanelConfig = ${JSON.stringify(
      compiledTextPanelConfig(text),
    )};`,
  );
  const backgroundTexture = resolveTextBackgroundTexture(entity, text, context);
  if (!backgroundTexture) return `<XriftTextPanel config={${configName}} />`;

  const componentName = generatedIdentifier(
    "CompiledTextPanel",
    `${entity.id}:${text.id}`,
  );
  context.supportDeclarations.set(
    `text-panel:${componentName}`,
    `const ${componentName}: FC = () => {
${backgroundTexture.lines}  return <XriftTextPanel config={${configName}} map={textPanelMap} />;
};`,
  );
  return `<${componentName} />`;
}

/**
 * Drops the background when its Texture cannot be published.
 *
 * A missing plate image is reported and the caption still ships: losing the
 * words as well would turn a broken asset reference into an empty wall.
 */
function resolveTextBackgroundTexture(
  entity: SceneEntity,
  text: TextComponent,
  context: CompileContext,
): { lines: string } | null {
  const background = text.background;
  if (background?.mode !== "texture") return null;
  const textureAssetId = background.textureAssetId?.trim() ?? "";
  if (!textureAssetId) {
    addDiagnostic(context, {
      severity: "warning",
      code: "text-background-texture-unset",
      message: "Text backgroundが画像に設定されていますが、Texture Assetが未選択です",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: text.id,
      fieldPath: "background.textureAssetId",
    });
    return null;
  }
  context.referencedAssetIds.add(textureAssetId);
  const texture = getTextureAsset(context.assets, textureAssetId);
  const runtimeUrl = texture
    ? context.assetRuntimeUrls.get(texture.id)
    : undefined;
  if (!texture || !runtimeUrl) {
    addDiagnostic(context, {
      severity: "warning",
      code: "text-background-texture-missing",
      message: "Text backgroundのTexture Assetを出力できないため、文字だけを出力します",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: text.id,
      assetId: textureAssetId,
      fieldPath: "background.textureAssetId",
    });
    return null;
  }
  const usesKtx2 = isPublishedAsKtx2(texture);
  registerCompiledTextureRuntime(context, usesKtx2);
  const urlConstant = registerAssetUrl(texture, runtimeUrl, context);
  const optionsConstant = generatedIdentifier(
    "TEXTURE_OPTIONS",
    `text-panel:${text.id}`,
  );
  const settings = texture.importSettings;
  context.supportDeclarations.set(
    `texture-options:${optionsConstant}`,
    `const ${optionsConstant}: CompiledTextureOptions = ${JSON.stringify({
      channel: 0,
      colorSpace: settings.colorSpace === "linear" ? "linear" : "srgb",
      flipY: settings.flipY,
      generateMipmaps: settings.generateMipmaps,
      magFilter: settings.sampler.magFilter,
      minFilter: settings.sampler.minFilter,
      wrapS: settings.sampler.wrapS,
      wrapT: settings.sampler.wrapT,
    })};`,
  );
  return {
    lines: `  const textPanelMapUrl = useCompiledAssetUrl(${urlConstant});
  const textPanelMap = useCompiledTexture(${
    usesKtx2 ? "useCompiledKtx2" : "useTexture"
  }(textPanelMapUrl), ${optionsConstant});
`,
  };
}

function compiledTextPanelConfig(text: TextComponent): Record<string, unknown> {
  return {
    text: text.text,
    color: text.color,
    fontSize: text.fontSize,
    ...(text.maxWidth === undefined ? {} : { maxWidth: text.maxWidth }),
    anchorX: text.anchorX,
    anchorY: text.anchorY,
    outlineWidth: text.outlineWidth,
    outlineColor: text.outlineColor,
    ...(text.fontId === undefined ? {} : { fontId: text.fontId }),
    ...(text.fontWeight === undefined ? {} : { fontWeight: text.fontWeight }),
    ...(text.textAlign === undefined ? {} : { textAlign: text.textAlign }),
    ...(text.lineHeight === undefined ? {} : { lineHeight: text.lineHeight }),
    ...(text.letterSpacing === undefined
      ? {}
      : { letterSpacing: text.letterSpacing }),
    ...(text.background === undefined ? {} : { background: text.background }),
  };
}

function registerCompiledTextPanelRuntime(context: CompileContext): void {
  context.extraImports.add(
    'import { XriftTextPanel } from "./xrift-studio/text-panel-runtime";',
  );
  context.extraImports.add(
    'import type { XriftTextPanelConfig } from "./xrift-studio/text-panel-layout";',
  );
}

function renderAudioSource(
  entity: SceneEntity,
  audio: AudioSourceComponent,
  context: CompileContext,
): string | null {
  const audioAssetId = audio.audioAssetId?.trim() ?? "";
  registerCompiledAudioRuntime(context);
  if (!audio.enabled) {
    return `<XriftAudioSource componentId=${JSON.stringify(audio.id)} audioAssetId=${JSON.stringify(audioAssetId)} assetUrl={null} sourceStatus="missing" enabled={false} volume={${formatNumber(audio.volume)}} loop={${audio.loop}} autoplay={${audio.autoplay}} spatial={${audio.spatial}} refDistance={${formatNumber(audio.refDistance)}} rolloffFactor={${formatNumber(audio.rolloffFactor)}} maxDistance={${formatNumber(audio.maxDistance)}} />`;
  }
  if (!audioAssetId) {
    addDiagnostic(context, {
      severity: "warning",
      code: "audio-source-asset-missing",
      message: audio.sourceUrl?.trim()
        ? "直接URLのAudio Sourceは出力されません。MP3またはWAVをAudio Assetとして取り込んでください"
        : "Audio Assetが未設定のため、音声を出力しません",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: audio.id,
      fieldPath: "audioAssetId",
    });
    return null;
  }
  context.referencedAssetIds.add(audioAssetId);
  const asset = getAudioAsset(context.assets, audioAssetId);
  if (!asset) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "audio-source-asset-invalid",
      message: "Audio Sourceの参照先がAudio Assetではありません",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: audio.id,
      assetId: audioAssetId,
      fieldPath: "audioAssetId",
    });
    return null;
  }
  const runtimeUrl = context.assetRuntimeUrls.get(asset.id);
  if (!runtimeUrl) {
    addDiagnostic(context, {
      severity: "blocking",
      code: "audio-asset-source-unsupported",
      message: "Audio Assetはproject-relativeなMP3またはWAV sourceである必要があります",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: audio.id,
      assetId: asset.id,
      fieldPath: "audioAssetId",
    });
    return null;
  }
  const assetPath = registerAssetUrl(asset, runtimeUrl, context);

  context.supportDeclarations.set(
    "audio-source",
    `const XRiftStudioCompiledAudioSource: FC<{
  componentId: string;
  audioAssetId: string;
  assetPath: string;
  volume: number;
  loop: boolean;
  autoplay: boolean;
  spatial: boolean;
  refDistance: number;
  rolloffFactor: number;
  maxDistance: number;
}> = ({ componentId, audioAssetId, assetPath, ...props }) => {
  const assetUrl = useCompiledAssetUrl(assetPath);
  return <XriftAudioSource componentId={componentId} audioAssetId={audioAssetId} assetUrl={assetUrl} sourceStatus="available" enabled {...props} />;
};`,
  );

  return `<XRiftStudioCompiledAudioSource componentId=${JSON.stringify(audio.id)} audioAssetId=${JSON.stringify(audioAssetId)} assetPath={${assetPath}} volume={${formatNumber(audio.volume)}} loop={${audio.loop}} autoplay={${audio.autoplay}} spatial={${audio.spatial}} refDistance={${formatNumber(audio.refDistance)}} rolloffFactor={${formatNumber(audio.rolloffFactor)}} maxDistance={${formatNumber(audio.maxDistance)}} />`;
}

function registerCompiledAudioRuntime(context: CompileContext): void {
  context.extraImports.add(
    'import { XriftAudioSource } from "./xrift-studio/audio-source-runtime";',
  );
}

function renderSpawnPoint(
  entity: SceneEntity,
  componentId: string,
  target: "player" | "item-preview",
  transform: TransformComponent | undefined,
  context: CompileContext,
): string | null {
  if (context.projectKind !== "world" || target !== "player") {
    addDiagnostic(context, {
      severity: "warning",
      code: "editor-only-spawn-point",
      message: "Item preview 用の基準点は XRift source へ出力しません",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId,
    });
    return null;
  }
  context.imports.add("SpawnPoint");
  const yaw = ((transform?.rotation[1] ?? 0) * 180) / Math.PI;
  return `<SpawnPoint yaw={${formatNumber(yaw)}} />`;
}

function renderRegisteredXriftComponent(
  entity: SceneEntity,
  component: XRiftComponent,
  context: CompileContext,
  localContent: string[],
  wrappers: RenderedXriftWrapper[],
  bindingOverrides: Readonly<Record<string, string>> = {},
): void {
  component.assetReferences.forEach((assetId) => context.referencedAssetIds.add(assetId));
  const compiled = compileXriftComponent(
    component,
    context.projectKind,
    {
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: component.id,
    },
    bindingOverrides,
  );
  compiled.diagnostics.forEach((diagnostic) => addDiagnostic(context, diagnostic));
  if (compiled.importName) context.imports.add(compiled.importName);
  compiled.reactValueImports.forEach((name) => context.reactValueImports.add(name));
  compiled.reactTypeImports.forEach((name) => context.reactTypeImports.add(name));
  compiled.supportDeclarations.forEach((declaration) =>
    context.supportDeclarations.set(declaration.key, declaration.source),
  );
  if (compiled.mode === "leaf" && compiled.jsx) localContent.push(compiled.jsx);
  if (compiled.mode === "wrapper" && compiled.jsx) {
    wrappers.push({
      jsx: compiled.jsx,
      componentId: component.id,
      importName: compiled.importName ?? component.schemaId,
      childrenRequired:
        compiled.definition?.attachBehavior.childrenRequired ?? false,
    });
  }
}

function diagnoseReferencedUnsupportedAssets(context: CompileContext): void {
  for (const assetId of [...context.referencedAssetIds].sort()) {
    const asset = context.assets.assets[assetId];
    if (!asset) {
      addDiagnostic(context, {
        severity: "blocking",
        code: "referenced-asset-missing",
        message: "参照先 Asset が見つかりません",
        sceneId: context.scene.sceneId,
        assetId,
      });
    } else if (
      (asset.kind === "texture" || asset.kind === "skybox" || asset.kind === "model" || asset.kind === "audio") &&
      !context.assetRuntimeUrls.has(asset.id)
    ) {
      addDiagnostic(
        context,
        unsupportedAssetDiagnostic(
          asset,
          `${asset.kind}-asset-source-unsupported`,
          `${asset.name}のファイル形式または保存場所は公開に対応していません`,
          "blocking",
        ),
      );
    } else if (asset.kind === "template" && !isPrefabAsset(asset)) {
      addDiagnostic(context, unsupportedAssetDiagnostic(asset, "prefab-asset-unsupported", "Template/Prefab Asset の展開は未対応です", "blocking"));
    }
  }
}

/**
 * Repeats the Editor's Play-runtime warnings on the publish side.
 *
 * The canonical graph is published intact either way, so these are warnings,
 * not blockers. What they prevent is the split where the Editor marks a node
 * as unsupported and the publish result says nothing, leaving an author to
 * believe the graph gained behavior by being uploaded.
 */
function diagnoseInteractivityRuntimeSupport(
  assets: AssetManifest,
  diagnostics: CompilerDiagnostic[],
): void {
  for (const asset of Object.values(assets.assets).sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (asset.kind !== "interactivity") continue;
    for (const diagnostic of collectInteractivityRuntimeDiagnostics(asset.extension)) {
      diagnostics.push({
        severity: "warning",
        code: "interactivity-operation-not-executed",
        message: diagnostic.message,
        assetId: asset.id,
        fieldPath: diagnostic.path,
      });
    }
  }
}

function diagnoseUnsupportedAssets(
  assets: AssetManifest,
  diagnostics: CompilerDiagnostic[],
): void {
  const diagnosed = new Set(diagnostics.flatMap((diagnostic) => diagnostic.assetId ? [diagnostic.assetId] : []));
  for (const asset of Object.values(assets.assets).sort((left, right) => left.id.localeCompare(right.id))) {
    if (diagnosed.has(asset.id)) continue;
    if (
      (asset.kind === "template" && !isPrefabAsset(asset)) ||
      ((asset.kind === "texture" || asset.kind === "skybox" || asset.kind === "model" || asset.kind === "audio") &&
        !isAssetSupportedByCompiler(asset))
    ) {
      diagnostics.push(
        unsupportedAssetDiagnostic(
          asset,
          "unused-unsupported-asset",
          `${asset.kind} Asset は未使用のため出力に含まれません`,
          "warning",
        ),
      );
    }
  }
}

/**
 * 公開時に適用できないTexture Import設定を、警告として一度だけ知らせる。
 *
 * 最大解像度と圧縮は公開時に自動で適用されるので、通常は何も出ない。SVG、KTX2、
 * HDRIのようにCanvasで描き直せない原本だけは設定を反映できず、原本がそのまま
 * 配られる。黙って無視すると「設定したのに軽くならない」原因が追えなくなるため、
 * 公開は止めずに理由だけを残す。
 */
function diagnoseIgnoredTextureRecipes(
  assets: AssetManifest,
  assetCopyPlan: readonly AssetCopyPlanEntry[],
  diagnostics: CompilerDiagnostic[],
): void {
  const converted = new Set(
    assetCopyPlan
      .filter((entry) => entry.textureConversion)
      .map((entry) => entry.assetId),
  );
  for (const asset of Object.values(assets.assets).sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (asset.kind !== "texture") continue;
    if (converted.has(asset.id)) continue;
    if (!isAssetSupportedByCompiler(asset)) continue;
    if (
      asset.importSettings.compression.format === "source" &&
      asset.importSettings.resize.mode === "original" &&
      asset.importSettings.resize.powerOfTwo !== true
    ) {
      continue;
    }
    // 原本がすでに設定を満たしている場合も変換は起きない。それは正常なので、
    // 「そもそも適用できない形式」だけを残す。環境Texture（HDRI）へ解像度設定を
    // 反映できないことはTexture Inspectorが説明するので、ここでは繰り返さない。
    if (isEnvironmentTextureAsset(asset)) continue;
    if (isConvertibleTextureSourceFormat(getTextureSourceFormat(asset))) continue;
    diagnostics.push({
      severity: "warning",
      code: "texture-recipe-not-applicable",
      message: `${asset.name}は原本の形式が解像度変更・圧縮に対応していないため、原本のまま公開します`,
      assetId: asset.id,
      fieldPath: "importSettings",
    });
  }
}

function createAssetCopyPlan(
  assets: AssetManifest,
  diagnostics: CompilerDiagnostic[],
  outputMode: NonNullable<VisualCompilerOptions["outputMode"]>,
): AssetCopyPlanEntry[] {
  const plan: AssetCopyPlanEntry[] = [];
  const targets = new Set<string>();
  for (const asset of Object.values(assets.assets).sort((left, right) => left.id.localeCompare(right.id))) {
    // Prefab JSON is an authoring document hashed into provenance and expanded
    // into generated source. It must never be copied into public runtime assets.
    if (isPrefabAsset(asset)) continue;
    // Script sources are emitted as staging overlay modules and imported
    // statically, never copied into public runtime assets. See script-emit.ts.
    if (asset.kind === "script" || asset.kind === "shader") continue;
    if (asset.source.kind !== "project") continue;
    if (!isSafeRelativePath(asset.source.relativePath)) {
      diagnostics.push({
        severity: "blocking",
        code: "asset-copy-source-invalid",
        message: "Asset copy 元が project-relative path ではありません",
        assetId: asset.id,
        fieldPath: "source.relativePath",
      });
      continue;
    }
    if (!isAllowedStaticAssetSource(asset)) {
      diagnostics.push({
        severity: "blocking",
        code: "asset-copy-source-type-unsupported",
        message: "Asset kindと拡張子が安全なstatic asset allow-listに一致しません",
        assetId: asset.id,
        fieldPath: "source.relativePath",
      });
      continue;
    }
    // 未反映のImport設定は、原本を書き換えずに出力側で適用する。公開されるのは
    // 変換後の画像なので、コピー先のファイル名も変換後の拡張子で決める。
    const textureConversion =
      asset.kind === "texture" ? (planTextureConversion(asset) ?? undefined) : undefined;
    const sourceFileName =
      asset.source.relativePath.split("/").filter(Boolean).pop() ?? "asset.bin";
    const fileName = textureConversion
      ? `${stripFileExtension(sourceFileName)}.${textureOutputExtension(textureConversion.outputFormat)}`
      : sourceFileName;
    const targetRelativePath =
      outputMode === "classic-runtime"
        ? `public/xrift/assets/${safeFileSegment(asset.id)}-${safeFileSegment(fileName)}`
        : `public/xrift-studio-${safeFileSegment(asset.id)}-${safeFileSegment(fileName)}`;
    if (targets.has(targetRelativePath)) {
      diagnostics.push({
        severity: "blocking",
        code: "asset-copy-target-collision",
        message: "複数 Asset の copy target が衝突しています",
        assetId: asset.id,
        fieldPath: "source.relativePath",
      });
      continue;
    }
    targets.add(targetRelativePath);
    plan.push({
      assetId: asset.id,
      sourceRelativePath: asset.source.relativePath,
      targetRelativePath,
      purpose: assetPurpose(asset),
      supportedByCompiler: isAssetSupportedByCompiler(asset),
      ...(textureConversion ? { textureConversion } : {}),
    });
  }
  return plan;
}

function addDiagnostic(context: CompileContext, diagnostic: CompilerDiagnostic): void {
  const key = [diagnostic.severity, diagnostic.code, diagnostic.sceneId, diagnostic.entityId, diagnostic.componentId, diagnostic.assetId, diagnostic.fieldPath].join("|");
  if (context.diagnosticKeys.has(key)) return;
  context.diagnosticKeys.add(key);
  context.diagnostics.push(diagnostic);
}

function deduplicateDiagnostics(
  diagnostics: readonly CompilerDiagnostic[],
): CompilerDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = [
      diagnostic.severity,
      diagnostic.code,
      diagnostic.sceneId,
      diagnostic.prefabId,
      diagnostic.entityId,
      diagnostic.componentId,
      diagnostic.assetId,
      diagnostic.fieldPath,
      diagnostic.message,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function componentDiagnostic(
  entity: SceneEntity,
  componentId: string,
  code: string,
  message: string,
  assetId?: string,
): CompilerDiagnostic {
  return { severity: "blocking", code, message, entityId: entity.id, componentId, assetId };
}

function entityDiagnostic(
  entity: SceneEntity,
  code: string,
  message: string,
  severity: CompilerDiagnostic["severity"],
): CompilerDiagnostic {
  return { severity, code, message, entityId: entity.id };
}

function unsupportedAssetDiagnostic(
  asset: SceneAsset,
  code: string,
  message: string,
  severity: CompilerDiagnostic["severity"],
): CompilerDiagnostic {
  return { severity, code, message, assetId: asset.id };
}

function geometryJsx(geometry: PrimitiveGeometry): string {
  if (geometry === "box") return "<boxGeometry />";
  if (geometry === "sphere") return "<sphereGeometry />";
  if (geometry === "cylinder") return "<cylinderGeometry />";
  if (geometry === "cone") return "<coneGeometry />";
  return "<planeGeometry />";
}

function generateXriftJson(
  kind: VisualProjectKind,
  title: string,
  description: string,
  settings?: SceneSettings,
  permissions?: ResolvedPublishPermissions,
): string {
  // physics and camera are world-only in xrift.json; an item has neither, and
  // emitting them would produce a config the CLI does not recognise.
  const worldSettings =
    kind === "world" && settings
      ? {
          physics: {
            gravity: settings.physics.gravity,
            allowInfiniteJump: settings.physics.allowInfiniteJump,
          },
          camera: {
            near: settings.camera.near,
            far: settings.camera.far,
          },
        }
      : {};
  return stableSerializeJson({
    [kind]: {
      distDir: "./dist",
      title,
      description,
      thumbnailPath: "thumbnail.png",
      buildCommand: "npm run build",
      ignore: ["**/.DS_Store", "**/Thumbs.db", "**/*.js.map", "**/.gitkeep"],
      ...worldSettings,
      // `permissions` applies to both kinds, unlike physics and camera above.
      ...publishPermissionsJson(permissions),
    },
  });
}

function compilerFile(
  relativePath: string,
  content: string,
  kind: CompilerOverlayFile["kind"] = "source",
): CompilerOverlayFile {
  return { relativePath, content, kind, owner: "xrift-studio-compiler" };
}

function vectorProp(value: Vec3): string {
  return `[${value.map(formatNumber).join(", ")}]`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Object.is(value, -0)) return "0";
  return Number(value.toFixed(8)).toString();
}

function colorToHex(value: readonly number[]): string {
  return `#${value.slice(0, 3).map((entry) => Math.round(Math.max(0, Math.min(1, entry)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function indent(value: string, levels: number): string {
  const prefix = "  ".repeat(levels);
  return value.split("\n").map((line) => `${prefix}${line}`).join("\n");
}

function safeFileSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "untitled";
}

function generatedIdentifier(prefix: string, value: string): string {
  const stem = value
    .trim()
    .replace(/[^a-zA-Z0-9_$]+/g, "_")
    .replace(/^([^a-zA-Z_$])/, "_$1")
    .slice(0, 36);
  return `${prefix}_${stem || "asset"}_${sha256Utf8(value).slice(0, 8)}`;
}

function registerAssetUrl(
  asset: SceneAsset,
  runtimeUrl: string,
  context: CompileContext,
): string {
  const constantName = generatedIdentifier("ASSET_URL", asset.id);
  context.imports.add("useXRift");
  context.supportDeclarations.set(
    "asset-url:00-runtime",
    `const useCompiledAssetUrl = (assetPath: string): string => {
  const { baseUrl } = useXRift();
  return \`\${baseUrl}\${assetPath}\`;
};`,
  );
  context.supportDeclarations.set(
    `asset-url:${constantName}`,
    `const ${constantName} = ${JSON.stringify(runtimeUrl)} as const;`,
  );
  return constantName;
}

function publicAssetPath(targetRelativePath: string): string {
  const normalized = targetRelativePath.replace(/\\/g, "/");
  return normalized.startsWith("public/")
    ? normalized.slice("public/".length)
    : normalized.replace(/^\/+/, "");
}

function isSafeRelativePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  return (
    normalized.length > 0 &&
    !normalized.startsWith("/") &&
    !/^[a-zA-Z]:/.test(normalized) &&
    !normalized.includes("://") &&
    normalized.split("/").every((segment) => segment && segment !== "." && segment !== "..")
  );
}

function isAllowedStaticAssetSource(asset: SceneAsset): boolean {
  if (asset.source.kind !== "project") return false;
  const extension = fileExtension(asset.source.relativePath);
  if (asset.kind === "model") {
    return ["glb", "gltf", "obj", "vrm"].includes(extension);
  }
  if (asset.kind === "texture") {
    return isEnvironmentTextureAsset(asset)
      ? ["hdr", "exr", "png", "jpg", "jpeg", "webp", "avif", "gif", "bmp", "svg"].includes(extension)
      : ["png", "jpg", "jpeg", "webp", "avif", "gif", "bmp", "svg", "ktx2"].includes(extension);
  }
  if (asset.kind === "skybox") return ["hdr", "exr", "png", "jpg", "jpeg", "webp", "avif", "gif", "bmp", "svg"].includes(extension);
  if (asset.kind === "audio")
    return ["mp3", "wav", "ogg", "flac", "m4a", "webm"].includes(extension);
  return false;
}

function isAssetSupportedByCompiler(asset: SceneAsset): boolean {
  if (
    asset.status !== "ready" ||
    asset.source.kind !== "project" ||
    !isSafeRelativePath(asset.source.relativePath) ||
    !isAllowedStaticAssetSource(asset)
  ) {
    return false;
  }
  if (asset.kind === "model") return true;
  if (asset.kind === "audio") return true;
  if (asset.kind === "skybox") return ["hdr", "exr", "png", "jpg", "jpeg", "webp", "avif", "gif", "bmp", "svg"].includes(fileExtension(asset.source.relativePath));
  // Textureの最大解像度・圧縮設定は、原本を書き換えなくても公開時に適用できる。
  // 未反映であることは公開を止める理由にならない。適用できない形式（SVG / KTX2 /
  // HDRI）は原本のまま配られ、`diagnoseIgnoredTextureRecipes` が警告で知らせる。
  return asset.kind === "texture";
}

function stripFileExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index > 0 ? fileName.slice(0, index) : fileName;
}

function fileExtension(relativePath: string): string {
  const fileName = relativePath.split("/").pop() ?? "";
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index + 1).toLowerCase() : "";
}

function assetPurpose(asset: SceneAsset): AssetCopyPlanEntry["purpose"] {
  if (isEnvironmentTextureAsset(asset)) return "skybox";
  if (
    asset.kind === "texture" ||
    asset.kind === "skybox" ||
    asset.kind === "model" ||
    asset.kind === "audio" ||
    asset.kind === "particle"
  ) return asset.kind;
  if (asset.kind === "template") return "prefab";
  return "other";
}

function generateRuntimeAdapterSource(kind: VisualProjectKind): string {
  const component = kind === "world" ? "World" : "Item";
  const runtimeComponent = kind === "world" ? "XriftWorld" : "XriftItem";
  const defaultExport = kind === "item" ? `\nexport default ${component};\n` : "";
  return `import type { FC } from "react";
import { ${runtimeComponent} } from "xrift-studio-runtime/react-three-fiber";

export interface ${component}Props {
  position?: [number, number, number];
  scale?: number;
}

export const ${component}: FC<${component}Props> = ({ position = [0, 0, 0], scale = 1 }) => (
  <group position={position} scale={scale}>
    <${runtimeComponent} manifest="/xrift/runtime.json" />
  </group>
);${defaultExport}`;
}

function emptySource(kind: VisualProjectKind): string {
  const component = kind === "world" ? "World" : "Item";
  const defaultExport = kind === "item" ? `\nexport default ${component};\n` : "";
  return `import type { FC } from "react";\n\nexport const ${component}: FC = () => <group />;${defaultExport}`;
}
