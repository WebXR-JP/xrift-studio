import {
  getGeometryAsset,
  getGeometryMaterialSlots,
  getMaterialAsset,
  getTextureAsset,
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
import { getBuiltinPrimitiveCreation } from "../creation-catalog";
import {
  validateSerializedXriftComponents,
  validateXriftComponents,
} from "../component-registry";
import type { PrototypeVisualProject } from "../prototype-project";
import { normalizeParticleProperties } from "../particle-system";
import type { VisualProjectKind } from "../project-document";
import {
  type BoxColliderComponent,
  type ColliderComponent,
  type LightComponent,
  type MeshColliderComponent,
  type MeshComponent,
  type ParticleEmitterComponent,
  type RegisteredSceneComponent,
  type SceneDocument,
  type SceneEntity,
  type TransformComponent,
  type Vec3,
  type XRiftComponent,
} from "../scene-document";
import {
  resolveSceneSettings,
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
import {
  getPrefabAssetDocumentReference,
  isPrefabAsset,
  resolvePrefabInstances,
} from "./prefab-resolver";
import {
  VISUAL_COMPILER_VERSION,
  type AssetCopyPlanEntry,
  type CompilerDiagnostic,
  type CompilerOverlayFile,
  type VisualCompileResult,
  type VisualCompilerDocuments,
  type VisualCompilerOptions,
} from "./types";
import { compileXriftComponent } from "./xrift-component-registry";

type CompileContext = {
  projectKind: VisualProjectKind;
  scene: SceneDocument;
  assets: AssetManifest;
  diagnostics: CompilerDiagnostic[];
  diagnosticKeys: Set<string>;
  imports: Set<string>;
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
  const sourceDocuments = computeSourceDocumentHashes(documents);
  const provenance: CompilationProvenance = {
    sourceDocuments,
    compilerVersion: VISUAL_COMPILER_VERSION,
    targetKind: documents.project.projectKind,
    generatedAt,
  };
  const diagnostics: CompilerDiagnostic[] = [];
  validateCompilerDocuments(documents, diagnostics);
  const assetCopyPlan = createAssetCopyPlan(documents.assets, diagnostics);
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
  const generated = resolvedEntryScene
    ? generateComponentSource(
        documents.project.projectKind,
        resolvedEntryScene.scene,
        documents.assets,
        assetCopyPlan,
        diagnostics,
      )
    : emptySource(documents.project.projectKind);
  const xriftJson = generateXriftJson(
    documents.project.projectKind,
    documents.project.metadata.title,
    documents.project.metadata.description,
  );
  const sourcePath =
    documents.project.projectKind === "world" ? "src/World.tsx" : "src/Item.tsx";
  const overlayFiles: CompilerOverlayFile[] = [
    compilerFile(sourcePath, generated),
    compilerFile("xrift.json", xriftJson, "metadata"),
  ];
  diagnoseUnsupportedAssets(documents.assets, diagnostics);
  const uniqueDiagnostics = deduplicateDiagnostics(diagnostics);
  const provenanceFile = compilerFile(
    ".xrift-studio/compiler-provenance.json",
    stableSerializeJson(provenance),
    "metadata",
  );
  const canStage = !uniqueDiagnostics.some(
    (diagnostic) => diagnostic.severity === "blocking",
  );
  const projectIdentity = safeFileSegment(documents.project.projectId).slice(0, 72);
  const stagingDirectoryName = [
    "xrift-studio",
    documents.project.projectKind,
    projectIdentity,
    sha256Utf8(documents.project.projectId).slice(0, 12),
  ].join("-");
  const requiredPublicationFiles = [
    {
      purpose: "thumbnail" as const,
      sourceRelativePath: "public/thumbnail.png" as const,
      targetRelativePath: "public/thumbnail.png" as const,
    },
  ];

  return {
    targetKind: documents.project.projectKind,
    canStage,
    diagnostics: uniqueDiagnostics,
    overlayFiles,
    assetCopyPlan,
    provenance,
    provenanceFile,
    stagingPlan: {
      owner: "xrift-studio-compiler",
      templateKind: documents.project.projectKind,
      stagingDirectoryName,
      overlayFiles: [...overlayFiles, provenanceFile],
      assetCopyPlan,
      requiredPublicationFiles,
    },
  };
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

function generateComponentSource(
  projectKind: VisualProjectKind,
  scene: SceneDocument,
  assets: AssetManifest,
  assetCopyPlan: readonly AssetCopyPlanEntry[],
  diagnostics: CompilerDiagnostic[],
): string {
  const context: CompileContext = {
    projectKind,
    scene,
    assets,
    diagnostics,
    diagnosticKeys: new Set(),
    imports: new Set(),
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
  const imports = [
    `import type { ${[...context.reactTypeImports].sort().join(", ")} } from "react";`,
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
    ...(context.threeTypeImports.size > 0
      ? [`import type { ${[...context.threeTypeImports].sort().join(", ")} } from "three";`]
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
  const body = renderedScene.length > 0
    ? renderedScene.map((entry) => indent(entry, 3)).join("\n")
    : "      {null}";
  if (projectKind === "world") {
    return `${imports.join("\n")}\n\nexport interface WorldProps {\n  position?: [number, number, number];\n  scale?: number;\n}\n\nexport const World: FC<WorldProps> = ({ position = [0, 0, 0], scale = 1 }) => (\n  <group position={position} scale={scale}>\n${body}\n  </group>\n);\n`;
  }
  return `${imports.join("\n")}\n\nexport interface ItemProps {\n  position?: [number, number, number];\n  scale?: number;\n}\n\nexport const Item: FC<ItemProps> = ({ position = [0, 0, 0], scale = 1 }) => (\n  <group position={position} scale={scale}>\n${body}\n  </group>\n);\n\nexport default Item;\n`;
}

function renderSceneEnvironment(
  settings: SceneSettings,
  context: CompileContext,
): string[] {
  const content: string[] = [
    `<ambientLight color={${JSON.stringify(settings.ambient.color)}} intensity={${formatNumber(settings.ambient.intensity)}} />`,
  ];

  if (settings.skybox.enabled) {
    const imageAssetId = settings.skybox.imageAssetId;
    const imageAsset = imageAssetId ? context.assets.assets[imageAssetId] : undefined;
    const imageUrl = imageAssetId ? context.assetRuntimeUrls.get(imageAssetId) : undefined;
    if (imageAssetId && imageAsset?.kind === "texture" && imageUrl) {
      context.referencedAssetIds.add(imageAssetId);
      context.reactValueImports.add("useEffect");
      ["useLoader", "useThree"].forEach((name) => context.fiberImports.add(name));
      ["EquirectangularReflectionMapping", "SRGBColorSpace", "TextureLoader"].forEach(
        (name) => context.threeValueImports.add(name),
      );
      context.supportDeclarations.set(
        "scene-environment:image-skybox",
        `const XRiftStudioImageSkybox: FC<{ src: string; rotation: number; exposure: number }> = ({ src, rotation, exposure }) => {
  const scene = useThree((state) => state.scene);
  const texture = useLoader(TextureLoader, src);
  useEffect(() => {
    const previousBackground = scene.background;
    const previousEnvironment = scene.environment;
    const previousBackgroundIntensity = scene.backgroundIntensity;
    const previousEnvironmentIntensity = scene.environmentIntensity;
    const previousBackgroundRotation = scene.backgroundRotation.clone();
    const previousEnvironmentRotation = scene.environmentRotation.clone();
    texture.colorSpace = SRGBColorSpace;
    texture.mapping = EquirectangularReflectionMapping;
    texture.needsUpdate = true;
    scene.background = texture;
    scene.environment = texture;
    scene.backgroundIntensity = exposure;
    scene.environmentIntensity = exposure;
    scene.backgroundRotation.set(0, rotation, 0);
    scene.environmentRotation.set(0, rotation, 0);
    return () => {
      scene.background = previousBackground;
      scene.environment = previousEnvironment;
      scene.backgroundIntensity = previousBackgroundIntensity;
      scene.environmentIntensity = previousEnvironmentIntensity;
      scene.backgroundRotation.copy(previousBackgroundRotation);
      scene.environmentRotation.copy(previousEnvironmentRotation);
    };
  }, [exposure, rotation, scene, texture]);
  return null;
};`,
      );
      content.push(
        `<XRiftStudioImageSkybox src={${JSON.stringify(imageUrl)}} rotation={${formatNumber((settings.skybox.rotationDegrees * Math.PI) / 180)}} exposure={${formatNumber(settings.skybox.exposure)}} />`,
      );
    } else {
      if (imageAssetId) {
        addDiagnostic(context, {
          severity: "warning",
          code: "skybox-image-unavailable",
          message: "Skybox画像を生成Worldに含められないため、グラデーションにフォールバックしました",
          sceneId: context.scene.sceneId,
          assetId: imageAssetId,
          fieldPath: "settings.skybox.imageAssetId",
        });
      }
      context.imports.add("Skybox");
      content.push(
        `<Skybox topColor={${sceneColorNumber(settings.skybox.topColor)}} bottomColor={${sceneColorNumber(settings.skybox.bottomColor)}} offset={${formatNumber(settings.skybox.offset)}} exponent={${formatNumber(settings.skybox.exponent)}} />`,
      );
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

function sceneColorNumber(value: string): number {
  return Number.parseInt(value.slice(1), 16);
}

function renderEntity(
  entityId: string,
  context: CompileContext,
  depth: number,
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
  if (!entity.enabled) return null;
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
  const localContent: string[] = [];
  const wrappers: RenderedXriftWrapper[] = [];
  for (const component of entity.components as RegisteredSceneComponent[]) {
    if (!component.enabled || component.type === "transform") continue;
    if (component.type === "collider") {
      // Collider components are combined into one RigidBody after all visual
      // content is rendered, avoiding nested or duplicate physics bodies.
      continue;
    }
    if (component.type === "mesh") {
      const rendered = renderMesh(entity, component, context);
      if (rendered) localContent.push(rendered);
    } else if (component.type === "light") {
      localContent.push(renderLight(component));
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
    } else if (component.type === "xrift-component") {
      renderRegisteredXriftComponent(entity, component, context, localContent, wrappers);
    } else {
      const unknownComponent = component as unknown as { id: string; type: string };
      addDiagnostic(context, componentDiagnostic(entity, unknownComponent.id, "component-unsupported", `未対応の component type: ${unknownComponent.type}`));
    }
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
    const rendered = renderEntity(childId, context, depth + 1);
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
  children = renderColliderBody(entity, colliders, children, context);
  context.activeEntityIds.delete(entityId);
  const position = vectorProp(transform?.position ?? [0, 0, 0]);
  const rotation = vectorProp(transform?.rotation ?? [0, 0, 0]);
  const scale = vectorProp(transform?.scale ?? [1, 1, 1]);
  const name = JSON.stringify(entity.name);
  if (!children) {
    return `<group name=${name} position={${position}} rotation={${rotation}} scale={${scale}} />`;
  }
  return `<group name=${name} position={${position}} rotation={${rotation}} scale={${scale}}>\n${indent(children, 1)}\n</group>`;
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
  const rigidBodyProps = meshCollider
    ? [
        'type="fixed"',
        `colliders=${JSON.stringify(
          meshCollider.meshMode === "convex" ? "hull" : "trimesh",
        )}`,
        `sensor={${meshCollider.isTrigger}}`,
        `friction={${formatNumber(meshCollider.friction)}}`,
        `restitution={${formatNumber(meshCollider.restitution)}}`,
      ]
    : ['type="fixed"', "colliders={false}"];
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
  return `<mesh castShadow={${mesh.castShadow}} receiveShadow={${mesh.receiveShadow}}>\n  ${geometryJsx(geometry.primitive)}\n  ${materialJsx}\n</mesh>`;
}

type ResolvedMeshGeometry =
  | { kind: "primitive"; primitive: PrimitiveGeometry }
  | { kind: "model"; asset: ModelAsset };

function resolveMeshGeometry(
  mesh: MeshComponent,
  context: CompileContext,
): ResolvedMeshGeometry | undefined {
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

type ModelMaterialOverride = {
  slot: MaterialSlotDefinition;
  material: MaterialAsset;
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
      message: "Modelはproject-relativeなGLB/GLTF sourceである必要があります",
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
  context.dreiImports.add("useGLTF");

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
  const modelScale = Number.isFinite(model.importSettings.scale)
    ? model.importSettings.scale
    : 1;
  const source = `const ${componentName}: FC = () => {
  const modelUrl = useCompiledAssetUrl(${urlConstant});
  const { scene } = useGLTF(modelUrl);
  return (
    <group scale={${formatNumber(modelScale)}}>
      <Clone
        object={scene}
        castShadow={${mesh.castShadow}}
        receiveShadow={${mesh.receiveShadow}}${inject}
      />
    </group>
  );
};`;
  context.supportDeclarations.set(`model:${componentName}`, source);
  return `<${componentName} />`;
}

function resolveModelMaterialOverrides(
  entity: SceneEntity,
  mesh: MeshComponent,
  model: ModelAsset,
  context: CompileContext,
): ModelMaterialOverride[] {
  const slots = getGeometryMaterialSlots(model);
  const slotById = new Map(slots.map((slot) => [slot.slot, slot]));
  const bindingBySlot = new Map<string, string>();
  for (const binding of mesh.materialBindings) {
    if (bindingBySlot.has(binding.slot)) {
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
    bindingBySlot.set(binding.slot, binding.materialAssetId);
  }

  const overrides: ModelMaterialOverride[] = [];
  for (const slot of slots) {
    const materialAssetId =
      bindingBySlot.get(slot.slot) ?? slot.defaultMaterialAssetId;
    if (!materialAssetId) continue;
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
      continue;
    }
    overrides.push({ slot, material });
  }

  const bySourceName = new Map<string, string>();
  for (const override of overrides) {
    const previous = bySourceName.get(override.slot.name);
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
      bySourceName.set(override.slot.name, override.material.id);
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
  const uniqueByName = new Map<
    string,
    ModelMaterialOverride & { componentName: string }
  >();
  overrides.forEach((override) => uniqueByName.set(override.slot.name, override));
  const wildcard =
    allowWildcard && uniqueByName.size === 1
      ? [...uniqueByName.values()][0]
      : undefined;
  const cases = [...uniqueByName.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([sourceName, override]) =>
        `      case ${JSON.stringify(sourceName)}:\n        return <${override.componentName} key={key} attach={attach} />;`,
    )
    .join("\n");
  const resolver = wildcard
    ? `    return <${wildcard.componentName} key={key} attach={attach} />;`
    : `    switch (materialName) {\n${cases}\n      default:\n        return null;\n    }`;
  const materialParameter = wildcard ? "_material" : "material";
  const materialName = wildcard
    ? ""
    : `    const materialName =
      typeof material === "object" && material !== null && "name" in material
        ? String(material.name)
        : "";
`;
  return `
        inject={(object) => {
          if (!("material" in object)) return null;
          const renderOverride = (${materialParameter}: unknown, attach: string, key: string) => {
${materialName}
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
  const geometry = getGeometryAsset(context.assets, geometryAssetId);
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

  const properties = normalizeMaterialProperties(
    asset.properties as unknown as Parameters<typeof normalizeMaterialProperties>[0],
  );
  if (properties.doubleSided) context.usesDoubleSide = true;
  diagnoseMaterialExtensions(entity, mesh, asset, properties, context);
  const materialKind = getMaterialShaderModel(properties);
  context.supportDeclarations.set(
    "material:00-props-type",
    "type CompiledMaterialProps = { attach?: string };",
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
      message: "Textureはproject-relativeなPNG/JPEG/WebP sourceかつ未変換recipeである必要があります",
      sceneId: context.scene.sceneId,
      entityId: entity.id,
      componentId: mesh.id,
      assetId: texture.id,
      fieldPath: `material.${material.id}.${materialProp}`,
    });
    return false;
  }

  registerCompiledTextureRuntime(context);
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
    `const ${variableName} = useCompiledTexture(useTexture(${variableName}Url), ${optionsConstant});`,
  );
  textureProps.push(`${materialProp}={${variableName}}`);
  return true;
}

function registerCompiledTextureRuntime(context: CompileContext): void {
  const key = "texture-runtime:use-compiled-texture";
  if (context.supportDeclarations.has(key)) return;
  context.reactValueImports.add("useEffect");
  context.reactValueImports.add("useMemo");
  context.dreiImports.add("useTexture");
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

function renderMaterialProps(
  properties: MaterialProperties,
  materialKind: MaterialShaderModel,
  context: CompileContext,
): string[] {
  const pbr = properties.pbrMetallicRoughness;
  const color = colorToHex(pbr.baseColorFactor);
  const opacity = properties.alphaMode === "OPAQUE" ? 1 : pbr.baseColorFactor[3];
  const props = [
    `color=${JSON.stringify(color)}`,
    `opacity={${formatNumber(opacity)}}`,
    `transparent={${properties.alphaMode === "BLEND"}}`,
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
  if (properties.alphaMode === "MASK") {
    props.push(`alphaTest={${formatNumber(properties.alphaCutoff)}}`);
  }
  if (properties.alphaMode === "BLEND") props.push("depthWrite={false}");
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
    `const ${configName}: CompiledParticleConfig = ${JSON.stringify(properties)};`,
  );

  let textureLine = "";
  let textureProp = "";
  if (textureUrl) {
    context.dreiImports.add("useTexture");
    const textureAsset = getTextureAsset(
      context.assets,
      properties.renderer.textureAssetId ?? "",
    );
    if (textureAsset) {
      const urlConstant = registerAssetUrl(textureAsset, textureUrl, context);
      textureLine = `  const particleMapUrl = useCompiledAssetUrl(${urlConstant});\n  const particleMap = useTexture(particleMapUrl);\n`;
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
${textureLine}  return <CompiledParticleEmitter config={${configName}} color=${JSON.stringify(color)} opacity={${formatNumber(opacity)}}${textureProp} />;
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
      message: "Particle Textureは変換不要なproject-relative画像である必要があります",
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
  const key = "particle-runtime:compiled-particle-emitter";
  if (context.supportDeclarations.has(key)) return;
  context.fiberImports.add("useFrame");
  context.reactValueImports.add("useEffect");
  context.reactValueImports.add("useMemo");
  context.reactValueImports.add("useRef");
  [
    "AdditiveBlending",
    "BufferAttribute",
    "BufferGeometry",
    "Color",
    "DynamicDrawUsage",
    "NormalBlending",
    "PointsMaterial",
    "Vector3",
  ].forEach((name) => context.threeValueImports.add(name));
  context.threeTypeImports.add("Points");
  context.threeTypeImports.add("Texture");
  context.supportDeclarations.set(
    key,
    `type CompiledParticleRange = { min: number; max: number };
type CompiledParticleConfig = {
  maxParticles: number;
  duration: number;
  looping: boolean;
  prewarm: boolean;
  simulationSpace: "local" | "world";
  startDelay: CompiledParticleRange;
  startLifetime: CompiledParticleRange;
  startSpeed: CompiledParticleRange;
  startSize: CompiledParticleRange;
  startRotation: CompiledParticleRange;
  gravity: [number, number, number];
  emission: { rateOverTime: number; bursts: Array<{ time: number; count: number; cycles: number; interval: number }> };
  shape:
    | { type: "point" }
    | { type: "sphere"; radius: number }
    | { type: "cone"; radius: number; angle: number }
    | { type: "box"; size: [number, number, number] };
  colorOverLifetime: { start: [number, number, number, number]; end: [number, number, number, number] };
  sizeOverLifetime: CompiledParticleRange;
  velocityOverLifetime: { linear: [number, number, number]; orbital: [number, number, number] };
  renderer: {
    mode: "billboard" | "stretched-billboard";
    blending: "normal" | "additive";
    sortMode: "none" | "distance" | "youngest" | "oldest";
    materialAssetId?: string;
    textureAssetId?: string;
    castShadow: boolean;
    receiveShadow: boolean;
  };
};
type CompiledParticleSeed = { a: number; b: number; c: number; speed: number };

const compiledParticleHash = (value: number) => {
  const result = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return result - Math.floor(result);
};
const compiledParticleMix = (start: number, end: number, amount: number) =>
  start + (end - start) * amount;
const compiledParticleSeed = (index: number): CompiledParticleSeed => ({
  a: compiledParticleHash(index * 4 + 1),
  b: compiledParticleHash(index * 4 + 2),
  c: compiledParticleHash(index * 4 + 3),
  speed: compiledParticleHash(index * 4 + 4),
});
const compiledParticleInitial = (
  shape: CompiledParticleConfig["shape"],
  seed: CompiledParticleSeed,
  start: Vector3,
  direction: Vector3,
) => {
  start.set(0, 0, 0);
  if (shape.type === "sphere") {
    const theta = seed.a * Math.PI * 2;
    const phi = Math.acos(seed.b * 2 - 1);
    const radius = shape.radius * Math.cbrt(seed.c);
    direction.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    start.copy(direction).multiplyScalar(radius);
    return;
  }
  if (shape.type === "box") {
    start.set((seed.a - 0.5) * shape.size[0], (seed.b - 0.5) * shape.size[1], (seed.c - 0.5) * shape.size[2]);
    direction.set(0, 1, 0);
    return;
  }
  if (shape.type === "cone") {
    const theta = seed.a * Math.PI * 2;
    const radial = Math.sqrt(seed.b) * shape.radius;
    start.set(Math.cos(theta) * radial, 0, Math.sin(theta) * radial);
    const slope = Math.tan((shape.angle * Math.PI) / 180);
    direction.set(Math.cos(theta) * slope, 1, Math.sin(theta) * slope).normalize();
    return;
  }
  direction.set(0, 1, 0);
};

const CompiledParticleEmitter: FC<{
  config: CompiledParticleConfig;
  color: string;
  opacity: number;
  map?: Texture;
}> = ({ config, color, opacity, map }) => {
  const continuousCount = Math.ceil(
    config.emission.rateOverTime * Math.max(config.startLifetime.min, config.startLifetime.max),
  );
  const burstCount = config.emission.bursts.reduce(
    (total, burst) => total + burst.count * Math.max(1, burst.cycles),
    0,
  );
  const count = Math.max(1, Math.min(10000, config.maxParticles, continuousCount + burstCount));
  const pointsRef = useRef<Points>(null);
  const elapsedRef = useRef(0);
  const geometry = useMemo(() => {
    const value = new BufferGeometry();
    const positions = new BufferAttribute(new Float32Array(count * 3), 3);
    const colors = new BufferAttribute(new Float32Array(count * 3), 3);
    positions.setUsage(DynamicDrawUsage);
    colors.setUsage(DynamicDrawUsage);
    value.setAttribute("position", positions);
    value.setAttribute("color", colors);
    return value;
  }, [count]);
  const material = useMemo(
    () =>
      new PointsMaterial({
        color,
        map,
        size: Math.max(
          0.001,
          ((config.startSize.min + config.startSize.max) / 2) *
            ((config.sizeOverLifetime.min + config.sizeOverLifetime.max) / 2),
        ),
        sizeAttenuation: true,
        transparent: true,
        opacity: Math.max(0, Math.min(1, opacity * Math.max(config.colorOverLifetime.start[3], config.colorOverLifetime.end[3]))),
        vertexColors: true,
        alphaTest: map ? 0.01 : 0,
        depthWrite: config.renderer.blending !== "additive",
        blending: config.renderer.blending === "additive" ? AdditiveBlending : NormalBlending,
      }),
    [color, config, map, opacity],
  );
  const seeds = useMemo(
    () => Array.from({ length: count }, (_, index) => compiledParticleSeed(index)),
    [count],
  );
  const velocity = useMemo(() => new Vector3(), []);
  const start = useMemo(() => new Vector3(), []);
  const currentColor = useMemo(() => new Color(), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame((_state, delta) => {
    elapsedRef.current += Math.min(delta, 0.1);
    const elapsed = elapsedRef.current;
    const position = geometry.getAttribute("position") as BufferAttribute;
    const colors = geometry.getAttribute("color") as BufferAttribute;
    const lifetime = Math.max(0.01, (config.startLifetime.min + config.startLifetime.max) / 2);
    const rate = Math.max(0.01, config.emission.rateOverTime);
    for (let index = 0; index < count; index += 1) {
      const seed = seeds[index];
      const bornAt = index / rate + config.startDelay.min;
      const rawAge = elapsed - bornAt;
      if (rawAge < 0 && !config.prewarm) {
        position.setXYZ(index, 0, -10000, 0);
        continue;
      }
      const age = config.looping ? ((rawAge % lifetime) + lifetime) % lifetime : rawAge;
      if (!config.looping && (age < 0 || age > lifetime)) {
        position.setXYZ(index, 0, -10000, 0);
        continue;
      }
      const normalizedAge = Math.max(0, Math.min(1, age / lifetime));
      const speed = compiledParticleMix(config.startSpeed.min, config.startSpeed.max, seed.speed);
      compiledParticleInitial(config.shape, seed, start, velocity);
      velocity.multiplyScalar(speed);
      const x = start.x + (velocity.x + config.velocityOverLifetime.linear[0]) * age + config.gravity[0] * age * age * 0.5;
      const y = start.y + (velocity.y + config.velocityOverLifetime.linear[1]) * age + config.gravity[1] * age * age * 0.5;
      const z = start.z + (velocity.z + config.velocityOverLifetime.linear[2]) * age + config.gravity[2] * age * age * 0.5;
      const orbit = config.velocityOverLifetime.orbital[1] * age;
      const cosine = Math.cos(orbit);
      const sine = Math.sin(orbit);
      position.setXYZ(index, x * cosine - z * sine, y, x * sine + z * cosine);
      const startColor = config.colorOverLifetime.start;
      const endColor = config.colorOverLifetime.end;
      currentColor.setRGB(
        compiledParticleMix(startColor[0], endColor[0], normalizedAge),
        compiledParticleMix(startColor[1], endColor[1], normalizedAge),
        compiledParticleMix(startColor[2], endColor[2], normalizedAge),
      );
      colors.setXYZ(index, currentColor.r, currentColor.g, currentColor.b);
    }
    position.needsUpdate = true;
    colors.needsUpdate = true;
    if (pointsRef.current) {
      pointsRef.current.visible = config.looping || elapsed <= config.duration;
    }
  });
  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      material={material}
      castShadow={config.renderer.castShadow}
      receiveShadow={config.renderer.receiveShadow}
    />
  );
};`,
  );
}

function renderLight(light: LightComponent): string {
  const tag =
    light.lightType === "ambient"
      ? "ambientLight"
      : light.lightType === "directional"
        ? "directionalLight"
        : "pointLight";
  const shadow = light.lightType === "ambient" ? "" : ` castShadow={${light.castShadow}}`;
  return `<${tag} color=${JSON.stringify(light.color)} intensity={${formatNumber(light.intensity)}}${shadow} />`;
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
): void {
  component.assetReferences.forEach((assetId) => context.referencedAssetIds.add(assetId));
  const compiled = compileXriftComponent(component, context.projectKind, {
    sceneId: context.scene.sceneId,
    entityId: entity.id,
    componentId: component.id,
  });
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
      (asset.kind === "texture" || asset.kind === "model") &&
      !context.assetRuntimeUrls.has(asset.id)
    ) {
      addDiagnostic(
        context,
        unsupportedAssetDiagnostic(
          asset,
          `${asset.kind}-asset-source-unsupported`,
          `${asset.kind} Assetのsourceまたは変換recipeはcompiler未対応です`,
          "blocking",
        ),
      );
    } else if (asset.kind === "template" && !isPrefabAsset(asset)) {
      addDiagnostic(context, unsupportedAssetDiagnostic(asset, "prefab-asset-unsupported", "Template/Prefab Asset の展開は未対応です", "blocking"));
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
      ((asset.kind === "texture" || asset.kind === "model") &&
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

function createAssetCopyPlan(
  assets: AssetManifest,
  diagnostics: CompilerDiagnostic[],
): AssetCopyPlanEntry[] {
  const plan: AssetCopyPlanEntry[] = [];
  const targets = new Set<string>();
  for (const asset of Object.values(assets.assets).sort((left, right) => left.id.localeCompare(right.id))) {
    // Prefab JSON is an authoring document hashed into provenance and expanded
    // into generated source. It must never be copied into public runtime assets.
    if (isPrefabAsset(asset)) continue;
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
    const fileName = asset.source.relativePath.split("/").filter(Boolean).pop() ?? "asset.bin";
    // XRift SDK 0.1.1 passes Node's platform-native relative paths to the
    // upload API. Nested dist files therefore become backslash object keys on
    // Windows and cannot be fetched with browser URL paths. Keep generated
    // assets at the public root until the SDK normalizes remote paths.
    const targetRelativePath = `public/xrift-studio-${safeFileSegment(asset.id)}-${safeFileSegment(fileName)}`;
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
): string {
  return stableSerializeJson({
    [kind]: {
      distDir: "./dist",
      title,
      description,
      thumbnailPath: "thumbnail.png",
      buildCommand: "npm run build",
      ignore: ["**/.DS_Store", "**/Thumbs.db", "**/*.js.map", "**/.gitkeep"],
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
  if (asset.kind === "model") return extension === "glb" || extension === "gltf";
  if (asset.kind === "texture") {
    return ["png", "jpg", "jpeg", "webp", "ktx2"].includes(extension);
  }
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
  if (asset.kind !== "texture") return false;
  const extension = fileExtension(asset.source.relativePath);
  return (
    extension !== "ktx2" &&
    asset.importSettings.compression.format === "source" &&
    asset.importSettings.resize.mode === "original"
  );
}

function fileExtension(relativePath: string): string {
  const fileName = relativePath.split("/").pop() ?? "";
  const index = fileName.lastIndexOf(".");
  return index >= 0 ? fileName.slice(index + 1).toLowerCase() : "";
}

function assetPurpose(asset: SceneAsset): AssetCopyPlanEntry["purpose"] {
  if (asset.kind === "texture" || asset.kind === "model" || asset.kind === "particle") return asset.kind;
  if (asset.kind === "template") return "prefab";
  return "other";
}

function emptySource(kind: VisualProjectKind): string {
  const component = kind === "world" ? "World" : "Item";
  const defaultExport = kind === "item" ? `\nexport default ${component};\n` : "";
  return `import type { FC } from "react";\n\nexport const ${component}: FC = () => <group />;${defaultExport}`;
}
