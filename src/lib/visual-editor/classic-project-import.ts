import { tauri, type ProjectKind } from "../tauri";
import {
  inspectClassicExportTarget,
  type ClassicExportTarget,
} from "./classic-export";
import type { ComponentCodeImportSourceModule } from "./component-code-import";
import {
  commitAssetImportPlan,
  createAssetImportPlan,
  type AssetImportDiagnostic,
  type AssetImportPlan,
} from "./asset-import";
import {
  addDefaultMaterialAsset,
  getModelAsset,
  updateMaterialAsset,
  type AssetManifest,
} from "./asset-manifest";
import type { ClassicR3fShaderUniform } from "./custom-shader-contract";
import type {
  ApplyComponentCodeImportResult,
  ComponentCodeImportAssetDependency,
  ComponentCodeImportPlan,
} from "./component-code-import";
import { convertDracoGeometryToGlb } from "./draco-import";
import { createDocumentId } from "./document-id";
import {
  createEmptyEntity,
  deleteEntityHierarchy,
} from "./editor-session";
import {
  createAudioSourceComponent,
  createMeshComponent,
  getMesh,
  updateEntityTransform,
} from "./scene-document";
import { resolveSceneSettings } from "./scene-settings";
import type { ThreeModelCompanionFile } from "./three-model-converter";

export type ClassicProjectVisualResource = {
  sourcePath: string;
  fileName: string;
  kind: "model" | "texture" | "audio" | "unsupported";
  sourceModulePath: string;
};

export type ClassicProjectVisualInspection = {
  resources: ClassicProjectVisualResource[];
  skybox?: {
    sourcePath: string;
    sourceModulePath: string;
    componentName: string;
  };
  audioSources: Array<{
    sourcePath: string;
    sourceModulePath: string;
    componentName: string;
    volume: number;
    loop: boolean;
    autoplay: boolean;
    spatial: boolean;
  }>;
  customShaderModulePaths: string[];
  customMaterials: ClassicProjectCustomMaterialInspection[];
};

export type ClassicProjectCustomShaderUniform =
  | {
      kind: "texture";
      sourcePath: string;
      filter: "nearest" | "linear";
      colorSpace?: "srgb" | "linear";
      generateMipmaps?: boolean;
      wrapS?: "repeat" | "clamp-to-edge";
      wrapT?: "repeat" | "clamp-to-edge";
    }
  | { kind: "number"; value: number }
  | { kind: "color"; value: string };

export type ClassicProjectCustomMaterialInspection = {
  name: string;
  sourceModulePath: string;
  componentName: string;
  modelSourcePath: string;
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, ClassicProjectCustomShaderUniform>;
  variants: Array<{
    name: string;
    meshNameIncludes?: string;
    defines: Record<string, string>;
    side: "front" | "back" | "double";
    transparent: boolean;
    depthWrite: boolean;
  }>;
  animatedTimeUniform?: string;
  centerModel: boolean;
  mirrorX: boolean;
  componentPosition: [number, number, number];
  componentScale: number;
  colliderSourceNodeNames: string[];
};

export type ClassicProjectVisualImportSource = ClassicExportTarget & {
  source: string;
  modules: ComponentCodeImportSourceModule[];
  inspection: ClassicProjectVisualInspection;
  repositoryUrl?: string;
};

export type ClassicProjectVisualAssetImportPreparation = {
  plans: AssetImportPlan[];
  manifest: AssetManifest;
  assetIdBySourcePath: Record<string, string>;
  diagnostics: AssetImportDiagnostic[];
  unavailableSourcePaths: string[];
  preview: ClassicProjectVisualImportPreview;
};

export type ClassicProjectVisualImportPreviewAsset = {
  sourcePath: string;
  fileName: string;
  kind: "model" | "texture" | "audio";
  byteLength: number;
  width?: number;
  height?: number;
  estimatedTextureMemoryBytes?: number;
};

export type ClassicProjectVisualImportModelSize = {
  sourcePath: string;
  fileName: string;
  componentName?: string;
  sourceSize: [number, number, number];
  modelImportScale: number;
  placementScale: [number, number, number];
  effectiveSize: [number, number, number];
  centerModel: boolean;
  mirrorX: boolean;
  colliderSourceNodeCount: number;
};

export type ClassicProjectVisualImportPreview = {
  availableAssetCount: number;
  unavailableSourcePaths: string[];
  totalSourceBytes: number;
  estimatedTextureMemoryBytes: number;
  assets: ClassicProjectVisualImportPreviewAsset[];
  models: ClassicProjectVisualImportModelSize[];
  diagnostics: AssetImportDiagnostic[];
};

const MAX_SOURCE_MODULES = 256;
const MAX_SOURCE_MODULE_BYTES = 1024 * 1024;
const MAX_SOURCE_GRAPH_BYTES = 4 * 1024 * 1024;
const SOURCE_MODULE_PATTERN = /\.(?:[cm]?[jt]sx?)$/i;
const MAX_COMPANION_FILES = 512;
const MAX_COMPANION_BYTES = 128 * 1024 * 1024;
const MODEL_COMPANION_PATTERN =
  /\.(?:bin|mtl|png|jpe?g|webp|avif|gif|bmp|svg|tga|tif|tiff|dds|ktx2?|hdr|exr|dat|ldr|mpd)$/i;

/**
 * Reads the validated XRift entry and a bounded set of source modules. Imported
 * source is later parsed by the non-evaluating JSX converter; no dependency
 * installation or project code execution happens at this boundary.
 */
export async function loadClassicProjectVisualImportSource(
  projectPath: string,
  expectedKind: ProjectKind,
): Promise<ClassicProjectVisualImportSource> {
  const target = await inspectClassicExportTarget(projectPath, expectedKind);
  const modules = await readClassicSourceModules(target.path);
  const source =
    modules.find((module) => module.path === target.entryFile)?.source ??
    (await tauri.readTextFile(target.path, target.entryFile));
  if (!modules.some((module) => module.path === target.entryFile)) {
    modules.unshift({ path: target.entryFile, source });
  }
  return {
    ...target,
    source,
    modules,
    inspection: inspectClassicProjectVisualSource(modules),
  };
}

export async function pickClassicProjectVisualImportSource(
  expectedKind: ProjectKind,
): Promise<ClassicProjectVisualImportSource | null> {
  if (!tauri.isAvailable()) {
    throw new Error(
      "Classicプロジェクトのフォルダー読み込みはデスクトップ版で利用できます。",
    );
  }
  const selected = await tauri.selectDirectory(
    `XRift Classic ${expectedKind === "world" ? "World" : "Item"}プロジェクトを選択`,
  );
  const projectPath = Array.isArray(selected) ? selected[0] : selected;
  if (typeof projectPath !== "string" || !projectPath.trim()) return null;
  return loadClassicProjectVisualImportSource(projectPath, expectedKind);
}

export async function loadClassicProjectVisualImportSourceFromRepository(
  repositoryUrl: string,
  expectedKind: ProjectKind,
): Promise<ClassicProjectVisualImportSource> {
  if (!tauri.isAvailable()) {
    throw new Error(
      "Repository URLからの読み込みはデスクトップ版で利用できます。",
    );
  }
  const normalizedUrl = repositoryUrl.trim();
  if (!normalizedUrl) {
    throw new Error("HTTPSまたはgit SSHのRepository URLを入力してください。");
  }
  const projectPath = await tauri.cloneClassicProjectRepository(normalizedUrl);
  const source = await loadClassicProjectVisualImportSource(
    projectPath,
    expectedKind,
  );
  return { ...source, repositoryUrl: normalizedUrl };
}

/**
 * Reads only asset dependencies discovered by the static TSX analysis and
 * prepares normal Studio import transactions. No target project files are
 * written until the caller commits every returned plan atomically.
 */
export async function prepareClassicProjectVisualAssetImports(input: {
  source: ClassicProjectVisualImportSource;
  componentPlan: ComponentCodeImportPlan;
  existingManifest: AssetManifest;
}): Promise<ClassicProjectVisualAssetImportPreparation> {
  const plans: AssetImportPlan[] = [];
  const assetIdBySourcePath: Record<string, string> = {};
  const diagnostics: AssetImportDiagnostic[] = [];
  const unavailableSourcePaths: string[] = [];
  let workingManifest = input.existingManifest;

  const dependencies = mergeClassicImportDependencies(
    input.componentPlan.assetDependencies,
    input.source.inspection.resources,
  );
  for (const dependency of dependencies) {
    const prepared = await prepareClassicDependency(
      input.source,
      dependency,
      workingManifest,
    );
    diagnostics.push(...prepared.diagnostics);
    if (!prepared.plan?.canCommit || !prepared.plan.asset) {
      unavailableSourcePaths.push(dependency.sourcePath);
      continue;
    }
    plans.push(prepared.plan);
    assetIdBySourcePath[dependency.sourcePath] = prepared.plan.asset.id;
    for (const candidate of input.componentPlan.assetDependencies) {
      if (
        normalizeClassicDependencySourcePath(candidate) === dependency.sourcePath
      ) {
        assetIdBySourcePath[candidate.sourcePath] = prepared.plan.asset.id;
      }
    }
    workingManifest = await commitAssetImportPlan(
      workingManifest,
      prepared.plan,
      async () => undefined,
    );
  }

  const preview = createClassicProjectVisualImportPreview({
    source: input.source,
    componentPlan: input.componentPlan,
    manifest: workingManifest,
    plans,
    assetIdBySourcePath,
    unavailableSourcePaths,
    diagnostics,
  });
  diagnostics.push(...preview.diagnostics.slice(diagnostics.length));

  return {
    plans,
    manifest: workingManifest,
    assetIdBySourcePath,
    diagnostics,
    unavailableSourcePaths,
    preview: {
      ...preview,
      diagnostics,
    },
  };
}

export function createClassicProjectVisualImportPreview(input: {
  source: ClassicProjectVisualImportSource;
  componentPlan: ComponentCodeImportPlan;
  manifest: AssetManifest;
  plans: readonly AssetImportPlan[];
  assetIdBySourcePath: Readonly<Record<string, string>>;
  unavailableSourcePaths: readonly string[];
  diagnostics: readonly AssetImportDiagnostic[];
}): ClassicProjectVisualImportPreview {
  const dependencies = mergeClassicImportDependencies(
    input.componentPlan.assetDependencies,
    input.source.inspection.resources,
  );
  const availableAssets: ClassicProjectVisualImportPreviewAsset[] = [];
  const seenAssetIds = new Set<string>();
  let estimatedTextureMemoryBytes = 0;

  for (const dependency of dependencies) {
    const assetId = input.assetIdBySourcePath[dependency.sourcePath];
    const asset = assetId ? input.manifest.assets[assetId] : undefined;
    if (
      !assetId ||
      !asset ||
      seenAssetIds.has(assetId) ||
      (asset.kind !== "model" &&
        asset.kind !== "texture" &&
        asset.kind !== "audio")
    ) {
      continue;
    }
    seenAssetIds.add(assetId);
    const byteLength =
      asset.kind === "model"
        ? asset.importMetadata?.byteLength ?? 0
        : asset.importMetadata?.byteLength ?? 0;
    if (asset.kind === "texture") {
      const width = asset.importMetadata?.width;
      const height = asset.importMetadata?.height;
      const mipFactor = asset.importSettings.generateMipmaps ? 4 / 3 : 1;
      const textureBytes =
        width && height ? Math.round(width * height * 4 * mipFactor) : 0;
      estimatedTextureMemoryBytes += textureBytes;
      availableAssets.push({
        sourcePath: dependency.sourcePath,
        fileName: dependency.fileName,
        kind: "texture",
        byteLength,
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        ...(textureBytes > 0
          ? { estimatedTextureMemoryBytes: textureBytes }
          : {}),
      });
      continue;
    }
    availableAssets.push({
      sourcePath: dependency.sourcePath,
      fileName: dependency.fileName,
      kind: asset.kind,
      byteLength,
    });
  }

  // Embedded Model textures are not separate source dependencies, but they do
  // occupy runtime texture memory after the Model transaction is committed.
  for (const plan of input.plans) {
    for (const asset of plan.derivedAssets ?? []) {
      if (asset.kind !== "texture" || seenAssetIds.has(asset.id)) continue;
      seenAssetIds.add(asset.id);
      const width = asset.importMetadata?.width;
      const height = asset.importMetadata?.height;
      const mipFactor = asset.importSettings.generateMipmaps ? 4 / 3 : 1;
      estimatedTextureMemoryBytes +=
        width && height ? Math.round(width * height * 4 * mipFactor) : 0;
    }
  }

  const models = buildClassicModelSizePreviews(input);
  const diagnostics = [...input.diagnostics];
  const totalSourceBytes = availableAssets.reduce(
    (total, asset) => total + asset.byteLength,
    0,
  );
  const largestTexture = availableAssets
    .filter(
      (
        asset,
      ): asset is ClassicProjectVisualImportPreviewAsset & {
        width: number;
        height: number;
      } => Boolean(asset.width && asset.height),
    )
    .sort(
      (left, right) =>
        right.width * right.height - left.width * left.height,
    )[0];
  if (totalSourceBytes > 20 * 1024 * 1024) {
    diagnostics.push({
      severity: "warning",
      code: "classic-import-load-size-high",
      fileName: input.source.packageName,
      message:
        "取り込むAsset原本が20 MBを超えます。モバイルの初回ロードを確認し、必要ならTexture圧縮、音声圧縮、Model最適化を行ってください。",
    });
  }
  if (
    largestTexture &&
    Math.max(largestTexture.width, largestTexture.height) > 4096
  ) {
    diagnostics.push({
      severity: "warning",
      code: "classic-import-texture-dimensions-high",
      fileName: largestTexture.fileName,
      message: `${largestTexture.width}×${largestTexture.height}pxです。モバイルGPU向けには最大4096px以下への縮小を検討してください。`,
    });
  }
  if (estimatedTextureMemoryBytes > 256 * 1024 * 1024) {
    diagnostics.push({
      severity: "warning",
      code: "classic-import-texture-memory-high",
      fileName: input.source.packageName,
      message:
        "Textureの展開後メモリ概算が256 MBを超えます。Import後のVRAM診断で圧縮・縮小候補を確認してください。",
    });
  }
  for (const material of input.source.inspection.customMaterials) {
    if (
      Number.isFinite(material.componentScale) &&
      Math.abs(material.componentScale) > 1e-6
    ) {
      continue;
    }
    diagnostics.push({
      severity: "warning",
      code: "classic-component-scale-invalid",
      fileName: material.sourceModulePath,
      message: `${material.componentName}.scaleが0または不正です。EntityとColliderが消失しないよう1へ正規化して取り込みます。`,
    });
  }
  for (const model of models) {
    const maximumExtent = Math.max(...model.effectiveSize);
    const extentLimit = input.source.kind === "item" ? 10 : 5_000;
    const minimumExtent = input.source.kind === "item" ? 0.001 : 0.01;
    if (maximumExtent > extentLimit) {
      diagnostics.push({
        severity: "warning",
        code: "classic-import-model-size-high",
        fileName: model.fileName,
        message: `配置後の最大寸法が${formatClassicDimension(maximumExtent)}です。Classic側のscale、Model import scale、単位系を確認してください。`,
      });
    } else if (maximumExtent > 0 && maximumExtent < minimumExtent) {
      diagnostics.push({
        severity: "warning",
        code: "classic-import-model-size-low",
        fileName: model.fileName,
        message: `配置後の最大寸法が${formatClassicDimension(maximumExtent)}です。Classic側のscaleとModelの単位系を確認してください。`,
      });
    }
  }

  return {
    availableAssetCount: availableAssets.length,
    unavailableSourcePaths: [...input.unavailableSourcePaths],
    totalSourceBytes,
    estimatedTextureMemoryBytes,
    assets: availableAssets.sort((left, right) =>
      left.sourcePath.localeCompare(right.sourcePath),
    ),
    models,
    diagnostics,
  };
}

function buildClassicModelSizePreviews(input: {
  source: ClassicProjectVisualImportSource;
  componentPlan: ComponentCodeImportPlan;
  manifest: AssetManifest;
  assetIdBySourcePath: Readonly<Record<string, string>>;
}): ClassicProjectVisualImportModelSize[] {
  const result: ClassicProjectVisualImportModelSize[] = [];
  const modelDependencies = mergeClassicImportDependencies(
    input.componentPlan.assetDependencies,
    input.source.inspection.resources,
  ).filter((dependency) => dependency.kind === "model");
  const nodeById = new Map(
    input.componentPlan.nodes.map((node) => [node.planNodeId, node]),
  );
  for (const dependency of modelDependencies) {
    const assetId = input.assetIdBySourcePath[dependency.sourcePath];
    const modelAsset = assetId
      ? getModelAsset(input.manifest, assetId)
      : undefined;
    if (!modelAsset?.importMetadata) continue;
    const materialInspection =
      input.source.inspection.customMaterials.find(
        (material) =>
          normalizeClassicDependencySourcePath({
            sourcePath: material.modelSourcePath,
            sourceModulePaths: [material.sourceModulePath],
          }) === dependency.sourcePath,
      );
    const matchingNodes = input.componentPlan.nodes.filter(
      (node) =>
        node.kind === "model" &&
        node.model &&
        normalizeClassicDependencySourcePath({
          sourcePath: node.model.sourcePath,
          sourceModulePaths: node.sourcePath ? [node.sourcePath] : [],
        }) === dependency.sourcePath,
    );
    const placementNode =
      (materialInspection
        ? matchingNodes.find(
            (node) =>
              /\bgroup\b/.test(
                node.model?.sourceObjectExpression ?? "",
              ) &&
              !/colliderGroup/.test(
                node.model?.sourceObjectExpression ?? "",
              ),
          )
        : undefined) ??
      matchingNodes.find(
        (node) =>
          !/colliderGroup/.test(
            node.model?.sourceObjectExpression ?? "",
          ),
      );
    const placementScale = placementNode
      ? calculateClassicPlanPlacementScale(
          placementNode.planNodeId,
          nodeById,
          input.source.inspection.customMaterials,
        )
      : ([1, 1, 1] as [number, number, number]);
    const modelImportScale = Number.isFinite(modelAsset.importSettings.scale)
      ? Math.abs(modelAsset.importSettings.scale)
      : 1;
    const sourceSize = modelAsset.importMetadata.bounds.size;
    result.push({
      sourcePath: dependency.sourcePath,
      fileName: dependency.fileName,
      ...(materialInspection
        ? { componentName: materialInspection.componentName }
        : {}),
      sourceSize: [sourceSize[0], sourceSize[1], sourceSize[2]],
      modelImportScale,
      placementScale,
      effectiveSize: [
        sourceSize[0] * modelImportScale * placementScale[0],
        sourceSize[1] * modelImportScale * placementScale[1],
        sourceSize[2] * modelImportScale * placementScale[2],
      ],
      centerModel: materialInspection?.centerModel ?? false,
      mirrorX: materialInspection?.mirrorX ?? false,
      colliderSourceNodeCount:
        materialInspection?.colliderSourceNodeNames.length ?? 0,
    });
  }
  return result;
}

function calculateClassicPlanPlacementScale(
  planNodeId: string,
  nodeById: ReadonlyMap<
    string,
    ComponentCodeImportPlan["nodes"][number]
  >,
  materials: readonly ClassicProjectCustomMaterialInspection[],
): [number, number, number] {
  const result: [number, number, number] = [1, 1, 1];
  const visited = new Set<string>();
  let node = nodeById.get(planNodeId);
  while (node && !visited.has(node.planNodeId)) {
    visited.add(node.planNodeId);
    const material = node.localComponent
      ? materials.find(
          (candidate) => candidate.componentName === node?.sourceTag,
        )
      : undefined;
    const scale: [number, number, number] = material
      ? [
          normalizedClassicComponentScale(material.componentScale),
          normalizedClassicComponentScale(material.componentScale),
          normalizedClassicComponentScale(material.componentScale),
        ]
      : node.transform.scale;
    result[0] *= Math.abs(scale[0]);
    result[1] *= Math.abs(scale[1]);
    result[2] *= Math.abs(scale[2]);
    node = node.parentPlanNodeId
      ? nodeById.get(node.parentPlanNodeId)
      : undefined;
  }
  return result;
}

function normalizedClassicComponentScale(scale: number): number {
  return Number.isFinite(scale) && Math.abs(scale) > 1e-6 ? scale : 1;
}

function formatClassicDimension(value: number): string {
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)} km`;
  if (value >= 1) return `${value.toFixed(2)} m`;
  return `${Math.round(value * 100)} cm`;
}

export function augmentClassicProjectVisualImportPlan(
  plan: ComponentCodeImportPlan,
  source: ClassicProjectVisualImportSource,
): ComponentCodeImportPlan {
  const dynamicColliderLines = new Set(
    plan.diagnostics
      .filter(
        (diagnostic) =>
          diagnostic.code === "dynamic-prop-skipped" &&
          /^CuboidCollider\.position\b/.test(diagnostic.message) &&
          diagnostic.line !== undefined,
      )
      .flatMap((diagnostic) =>
        diagnostic.line === undefined ? [] : [diagnostic.line],
      ),
  );
  const skippedDynamicColliderNodeIds = new Set(
    plan.nodes
      .filter(
        (node) =>
          node.collider !== undefined &&
          node.sourceLine !== undefined &&
          dynamicColliderLines.has(node.sourceLine),
      )
      .map((node) => node.planNodeId),
  );
  const nodes = plan.nodes.filter(
    (node) => !skippedDynamicColliderNodeIds.has(node.planNodeId),
  );
  const assetDependencies = mergeClassicImportDependencies(
    plan.assetDependencies,
    source.inspection.resources,
  );
  const namedColliderCount = source.inspection.customMaterials.reduce(
    (count, material) => count + material.colliderSourceNodeNames.length,
    0,
  );
  const diagnostics =
    assetDependencies.length > 0 ||
    source.inspection.customShaderModulePaths.length > 0 ||
    skippedDynamicColliderNodeIds.size > 0
      ? [
          ...plan.diagnostics.map((diagnostic) =>
            enhanceClassicProjectVisualDiagnostic(
              diagnostic,
              source,
              dynamicColliderLines,
            ),
          ),
          ...(assetDependencies.length > 0
            ? [{
                severity: "info" as const,
                code: "classic-project-assets-discovered",
                message: `Component内部で参照される関連Assetを正規化し、${assetDependencies.length}件のインポート計画へ統合しました。`,
              }]
            : []),
          ...(source.inspection.customShaderModulePaths.length > 0
            ? [{
                severity: "info" as const,
                code: "classic-project-custom-shader-discovered",
                message: `カスタムShaderを${source.inspection.customShaderModulePaths.length} moduleで検出しました。Materialとして再構築します。`,
              }]
            : []),
        ]
      : plan.diagnostics;
  return {
    ...plan,
    nodes,
    diagnostics,
    assetDependencies,
    summary: {
      ...plan.summary,
      entityCount:
        plan.summary.entityCount - skippedDynamicColliderNodeIds.size,
      modelAssetCount: assetDependencies.filter(
        (dependency) => dependency.kind === "model",
      ).length,
      textureAssetCount: assetDependencies.filter(
        (dependency) => dependency.kind === "texture",
      ).length,
      audioAssetCount: assetDependencies.filter(
        (dependency) => dependency.kind === "audio",
      ).length,
      unsupportedAssetCount: assetDependencies.filter(
        (dependency) => dependency.kind === "unsupported",
      ).length,
      colliderCount:
        plan.summary.colliderCount -
        skippedDynamicColliderNodeIds.size +
        namedColliderCount,
    },
  };
}

function enhanceClassicProjectVisualDiagnostic(
  diagnostic: ComponentCodeImportPlan["diagnostics"][number],
  source: ClassicProjectVisualImportSource,
  dynamicColliderLines: ReadonlySet<number>,
): ComponentCodeImportPlan["diagnostics"][number] {
  if (
    diagnostic.code === "dynamic-prop-skipped" &&
    /^CuboidCollider\.position\b/.test(diagnostic.message) &&
    diagnostic.line !== undefined &&
    dynamicColliderLines.has(diagnostic.line)
  ) {
    return {
      ...diagnostic,
      code: "classic-dynamic-collider-skipped",
      message:
        "CuboidCollider.positionは動的計算のため、誤った原点Colliderを作らずスキップします。",
    };
  }
  if (diagnostic.code !== "dynamic-prop-skipped") return diagnostic;
  const usageMaterial = source.inspection.customMaterials.find((material) =>
    diagnostic.message.startsWith(`${material.componentName}.scale`),
  );
  if (usageMaterial) {
    return {
      ...diagnostic,
      severity: "info",
      code: "classic-component-scale-recovered",
      message: `${usageMaterial.componentName}.scaleの定数参照を${usageMaterial.componentScale}としてComponent境界へ復元します。`,
    };
  }
  const boundaryMaterial = source.inspection.customMaterials.find(
    (material) => {
      if (!/^group\.(?:position|scale)\b/.test(diagnostic.message)) {
        return false;
      }
      if (material.sourceModulePath === diagnostic.sourcePath) return true;
      if (diagnostic.sourcePath || diagnostic.line === undefined) return false;
      const module = source.modules.find(
        (candidate) => candidate.path === material.sourceModulePath,
      );
      if (!module) return false;
      const groupOffset = module.source.search(
        /<group\b[^>]*\bposition\s*=\s*\{\s*position\s*\}[^>]*\bscale\s*=\s*\{\s*scale\s*\}/,
      );
      if (groupOffset < 0) return false;
      const groupLine =
        module.source.slice(0, groupOffset).split(/\r?\n/).length;
      return groupLine === diagnostic.line;
    },
  );
  if (!boundaryMaterial) return diagnostic;
  const position = boundaryMaterial.componentPosition.join(", ");
  return {
    ...diagnostic,
    severity: "info",
    code: "classic-component-transform-recovered",
    message: diagnostic.message.startsWith("group.position")
      ? `group.positionは${boundaryMaterial.componentName}のComponent境界へ[${position}]として復元します。`
      : `group.scaleは${boundaryMaterial.componentName}のComponent境界へ${boundaryMaterial.componentScale}として復元します。`,
  };
}

export function applyClassicProjectVisualImportEnhancements(input: {
  source: ClassicProjectVisualImportSource;
  componentPlan: ComponentCodeImportPlan;
  result: ApplyComponentCodeImportResult;
  assetIdBySourcePath: Readonly<Record<string, string>>;
}): ApplyComponentCodeImportResult {
  let scene = input.result.scene;
  let assets = input.result.assets;
  const diagnostics = [...input.result.diagnostics];
  const enhancementEntityIds: string[] = [];
  const entityIdByPlanNodeId = new Map(
    input.componentPlan.nodes.map((node, index) => [
      node.planNodeId,
      input.result.entityIds[index],
    ]),
  );

  const skybox = input.source.inspection.skybox;
  const skyboxAssetId = skybox
    ? input.assetIdBySourcePath[skybox.sourcePath]
    : undefined;
  if (
    skybox &&
    skyboxAssetId &&
    input.result.assets.assets[skyboxAssetId]?.kind === "texture"
  ) {
    const settings = resolveSceneSettings(scene.settings);
    scene = {
      ...scene,
      settings: {
        ...settings,
        skybox: {
          ...settings.skybox,
          enabled: true,
          iblEnabled: false,
          projection: "infinite",
          imageAssetId: skyboxAssetId,
          flipY: false,
          exposure: 1,
        },
      },
    };
    for (const node of input.componentPlan.nodes) {
      if (
        node.sourcePath !== skybox.sourceModulePath ||
        (node.kind !== "primitive" && node.kind !== "model")
      ) {
        continue;
      }
      const entityId = entityIdByPlanNodeId.get(node.planNodeId);
      if (entityId && scene.entities[entityId]) {
        scene = deleteEntityHierarchy(scene, [entityId]);
      }
    }
    diagnostics.push({
      severity: "info",
      code: "classic-skybox-materialized",
      message: `${skybox.sourcePath}をScene Skyboxへ設定しました。`,
      sourcePath: skybox.sourceModulePath,
    });
  }

  for (const audio of input.source.inspection.audioSources) {
    const audioAssetId = input.assetIdBySourcePath[audio.sourcePath];
    if (
      !audioAssetId ||
      input.result.assets.assets[audioAssetId]?.kind !== "audio"
    ) {
      continue;
    }
    const boundary = input.componentPlan.nodes.find(
      (node) =>
        node.localComponent &&
        node.sourceTag === audio.componentName,
    );
    const entityId = boundary
      ? entityIdByPlanNodeId.get(boundary.planNodeId)
      : undefined;
    const entity = entityId ? scene.entities[entityId] : undefined;
    const component = createAudioSourceComponent(
      `component-audio-${audioAssetId.slice(-16)}`,
      audioAssetId,
    );
    if (!entity || !component) continue;
    scene = {
      ...scene,
      entities: {
        ...scene.entities,
        [entity.id]: {
          ...entity,
          components: [
            ...entity.components.filter(
              (candidate) => candidate.type !== "audio-source",
            ),
            {
              ...component,
              volume: audio.volume,
              loop: audio.loop,
              autoplay: audio.autoplay,
              spatial: audio.spatial,
            },
          ],
        },
      },
    };
    diagnostics.push({
      severity: "info",
      code: "classic-audio-materialized",
      message: `${audio.sourcePath}をAudio Sourceへ接続しました。`,
      sourcePath: audio.sourceModulePath,
    });
  }

  for (const materialInspection of input.source.inspection.customMaterials) {
    const modelAssetId =
      input.assetIdBySourcePath[materialInspection.modelSourcePath];
    const modelAsset = modelAssetId
      ? getModelAsset(assets, modelAssetId)
      : undefined;
    if (!modelAssetId || !modelAsset) continue;

    const uniforms: Record<string, ClassicR3fShaderUniform> = {};
    let missingTexture = false;
    for (const [name, uniform] of Object.entries(
      materialInspection.uniforms,
    )) {
      if (uniform.kind !== "texture") {
        uniforms[name] = uniform;
        continue;
      }
      const textureAssetId = input.assetIdBySourcePath[uniform.sourcePath];
      if (
        !textureAssetId ||
        assets.assets[textureAssetId]?.kind !== "texture"
      ) {
        missingTexture = true;
        diagnostics.push({
          severity: "warning",
          code: "classic-shader-texture-missing",
          message: `${name}に必要な${uniform.sourcePath}をCustom Materialへ接続できませんでした。`,
          sourcePath: materialInspection.sourceModulePath,
        });
        continue;
      }
      uniforms[name] = {
        kind: "texture",
        textureAssetId,
        filter: uniform.filter,
        ...(uniform.colorSpace ? { colorSpace: uniform.colorSpace } : {}),
        ...(uniform.generateMipmaps !== undefined
          ? { generateMipmaps: uniform.generateMipmaps }
          : {}),
        ...(uniform.wrapS ? { wrapS: uniform.wrapS } : {}),
        ...(uniform.wrapT ? { wrapT: uniform.wrapT } : {}),
      };
    }
    if (missingTexture) continue;

    const materialAssetId = createDocumentId("material-classic");
    const addedMaterial = addDefaultMaterialAsset(assets, {
      id: materialAssetId,
      name: materialInspection.name,
      source: { kind: "document" },
      properties: {
        color: "#ffffff",
        metalness: 0,
        roughness: 1,
        doubleSided: true,
      },
    });
    if (!addedMaterial.added) continue;
    assets = updateMaterialAsset(addedMaterial.manifest, materialAssetId, {
      shader: {
        kind: "classic-r3f",
        sourceModulePath: materialInspection.sourceModulePath,
        vertexShader: materialInspection.vertexShader,
        fragmentShader: materialInspection.fragmentShader,
        uniforms,
        variants: materialInspection.variants,
        ...(materialInspection.animatedTimeUniform
          ? {
              animatedTimeUniform:
                materialInspection.animatedTimeUniform,
            }
          : {}),
        sourceModelAssetId: modelAssetId,
      },
    });

    const modelNodes = input.componentPlan.nodes.filter(
      (node) =>
        node.kind === "model" &&
        node.model?.sourcePath === materialInspection.modelSourcePath &&
        node.sourcePath === materialInspection.sourceModulePath,
    );
    const mainModelNode =
      modelNodes.find(
        (node) =>
          /\bgroup\b/.test(node.model?.sourceObjectExpression ?? "") &&
          !/colliderGroup/.test(
            node.model?.sourceObjectExpression ?? "",
          ),
      ) ?? modelNodes.find(
        (node) =>
          !/colliderGroup/.test(
            node.model?.sourceObjectExpression ?? "",
          ),
      );
    const mainModelEntityId = mainModelNode
      ? entityIdByPlanNodeId.get(mainModelNode.planNodeId)
      : undefined;
    if (mainModelEntityId && scene.entities[mainModelEntityId]) {
      scene = bindMaterialToEntityMesh(
        scene,
        mainModelEntityId,
        materialAssetId,
        modelAsset,
      );
      if (materialInspection.centerModel && modelAsset.importMetadata) {
        const center = modelAsset.importMetadata.bounds.center;
        const scale = modelAsset.importSettings.scale;
        scene = updateEntityTransform(scene, mainModelEntityId, {
          position: [
            -center[0] * scale,
            -center[1] * scale,
            -center[2] * scale,
          ],
        });
      }
    }

    const componentBoundary = input.componentPlan.nodes.find(
      (node) =>
        node.localComponent &&
        node.sourceTag === materialInspection.componentName,
    );
    const componentEntityId = componentBoundary
      ? entityIdByPlanNodeId.get(componentBoundary.planNodeId)
      : undefined;
    if (componentEntityId && scene.entities[componentEntityId]) {
      const componentScale = normalizedClassicComponentScale(
        materialInspection.componentScale,
      );
      scene = updateEntityTransform(scene, componentEntityId, {
        position: materialInspection.componentPosition,
        // Townscaper and similar OBJ pipelines mirror the geometry before
        // centering. A negative component X scale preserves that authored
        // handedness without mutating the imported source Asset.
        scale: [
          materialInspection.mirrorX ? -componentScale : componentScale,
          componentScale,
          componentScale,
        ],
      });
    }

    const colliderModelNode = modelNodes.find((node) =>
      /colliderGroup/.test(node.model?.sourceObjectExpression ?? ""),
    );
    const colliderModelEntityId = colliderModelNode
      ? entityIdByPlanNodeId.get(colliderModelNode.planNodeId)
      : undefined;
    const colliderParentId = colliderModelEntityId
      ? scene.entities[colliderModelEntityId]?.parentId
      : undefined;
    if (
      colliderModelEntityId &&
      colliderParentId &&
      materialInspection.colliderSourceNodeNames.length > 0
    ) {
      scene = deleteEntityHierarchy(scene, [colliderModelEntityId]);
      const hiddenMaterialId = createDocumentId("material-collider");
      const hiddenMaterial = addDefaultMaterialAsset(assets, {
        id: hiddenMaterialId,
        name: `${materialInspection.componentName} Collider`,
        source: { kind: "document" },
        properties: {
          color: "#000000",
          opacity: 0,
          alphaMode: "BLEND",
          metalness: 0,
          roughness: 1,
          doubleSided: true,
        },
      });
      if (hiddenMaterial.added) assets = hiddenMaterial.manifest;
      for (const sourceNodeName of materialInspection.colliderSourceNodeNames) {
        const created = createEmptyEntity(
          scene,
          colliderParentId,
          `${sourceNodeName} Collider`,
        );
        if (!created) continue;
        scene = created.scene;
        enhancementEntityIds.push(created.entityId);
        const entity = scene.entities[created.entityId];
        const materialBindings = modelAsset.materialSlots.length
          ? modelAsset.materialSlots.map((slot) => ({
              slot: slot.slot,
              materialAssetId: hiddenMaterialId,
            }))
          : [{ slot: "default", materialAssetId: hiddenMaterialId }];
        const mesh = createMeshComponent(
          createDocumentId("component-collider-mesh"),
          modelAssetId,
          materialBindings,
          {
            sourceNodeName,
            castShadow: false,
            receiveShadow: false,
          },
        );
        scene = {
          ...scene,
          entities: {
            ...scene.entities,
            [entity.id]: {
              ...entity,
              components: [...entity.components, mesh],
            },
          },
        };
        const scale = modelAsset.importSettings.scale;
        const center =
          materialInspection.centerModel && modelAsset.importMetadata
            ? modelAsset.importMetadata.bounds.center
            : undefined;
        scene = updateEntityTransform(scene, created.entityId, {
          ...(center
            ? {
                position: [
                  -center[0] * scale,
                  -center[1] * scale,
                  -center[2] * scale,
                ] as [number, number, number],
              }
            : {}),
          // A named OBJ node bypasses ProjectModelVisual's root Model scale.
          // Keep its render mesh and generated physics collider in the same
          // unit system as the full Model and its centered offset.
          scale: [scale, scale, scale],
        });
      }
    }

    diagnostics.push({
      severity: "info",
      code: "classic-custom-material-materialized",
      message: `${materialInspection.componentName}のShaderMaterialをMaterial Assetとして復元し、Modelへ適用しました。`,
      sourcePath: materialInspection.sourceModulePath,
    });
  }

  return {
    ...input.result,
    scene,
    assets,
    entityIds: [
      ...input.result.entityIds.filter((entityId) =>
        Boolean(scene.entities[entityId]),
      ),
      ...enhancementEntityIds,
    ],
    diagnostics,
  };
}

function bindMaterialToEntityMesh(
  scene: ApplyComponentCodeImportResult["scene"],
  entityId: string,
  materialAssetId: string,
  modelAsset: NonNullable<ReturnType<typeof getModelAsset>>,
): ApplyComponentCodeImportResult["scene"] {
  const entity = scene.entities[entityId];
  const mesh = entity ? getMesh(entity) : undefined;
  if (!entity || !mesh) return scene;
  const materialBindings = modelAsset.materialSlots.length
    ? modelAsset.materialSlots.map((slot) => ({
        slot: slot.slot,
        materialAssetId,
      }))
    : mesh.materialBindings.length
      ? mesh.materialBindings.map((binding) => ({
          ...binding,
          materialAssetId,
        }))
      : [{ slot: "default", materialAssetId }];
  return {
    ...scene,
    entities: {
      ...scene.entities,
      [entityId]: {
        ...entity,
        components: entity.components.map((component) =>
          component.id === mesh.id && component.type === "mesh"
            ? { ...component, materialBindings }
            : component,
        ),
      },
    },
  };
}

export function inspectClassicProjectVisualSource(
  modules: readonly ComponentCodeImportSourceModule[],
): ClassicProjectVisualInspection {
  const resources = new Map<string, ClassicProjectVisualResource>();
  const customShaderModulePaths: string[] = [];
  const customMaterials: ClassicProjectCustomMaterialInspection[] = [];
  let skybox: ClassicProjectVisualInspection["skybox"];
  const audioSources: ClassicProjectVisualInspection["audioSources"] = [];

  for (const module of modules) {
    const moduleResources = scanClassicModuleResources(module);
    for (const resource of moduleResources) {
      if (!resources.has(resource.sourcePath)) {
        resources.set(resource.sourcePath, resource);
      }
    }
    if (/\b(?:THREE\.)?ShaderMaterial\s*\(/.test(module.source)) {
      customShaderModulePaths.push(module.path);
      const material = inspectClassicCustomMaterial(module, modules);
      if (material) customMaterials.push(material);
    }
    const image = moduleResources.find(
      (resource) => resource.kind === "texture",
    );
    if (
      !skybox &&
      image &&
      /sphereGeometry/.test(module.source) &&
      /\bBackSide\b/.test(module.source)
    ) {
      skybox = {
        sourcePath: image.sourcePath,
        sourceModulePath: module.path,
        componentName: exportedComponentName(module.source) ?? "SkyDome",
      };
    }
    const audio = moduleResources.find(
      (resource) => resource.kind === "audio",
    );
    if (audio && /\bnew\s+Audio\s*\(/.test(module.source)) {
      audioSources.push({
        sourcePath: audio.sourcePath,
        sourceModulePath: module.path,
        componentName: exportedComponentName(module.source) ?? "AmbientAudio",
        volume: numericDefault(module.source, "volume") ?? 1,
        loop: !/\.loop\s*=\s*false\b/.test(module.source),
        autoplay: /\.play\s*\(/.test(module.source),
        spatial: false,
      });
    }
  }
  return {
    resources: [...resources.values()].sort((left, right) =>
      left.sourcePath.localeCompare(right.sourcePath),
    ),
    ...(skybox ? { skybox } : {}),
    audioSources,
    customShaderModulePaths,
    customMaterials,
  };
}

function inspectClassicCustomMaterial(
  module: ComponentCodeImportSourceModule,
  modules: readonly ComponentCodeImportSourceModule[],
): ClassicProjectCustomMaterialInspection | undefined {
  const vertexShader = templateLiteralConst(module.source, "vertexShader");
  const fragmentShader = templateLiteralConst(module.source, "fragmentShader");
  const moduleResources = scanClassicModuleResources(module);
  const modelSourcePath = moduleResources.find(
    (resource) => resource.kind === "model",
  )?.sourcePath;
  if (!vertexShader || !fragmentShader || !modelSourcePath) return undefined;

  const textureVariables = classicTextureVariableSources(module);
  const colorConstants = new Map<string, string>();
  for (const match of module.source.matchAll(
    /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+(?:THREE\.)?Color\s*\(\s*0x([0-9a-f]{6})\s*\)/gi,
  )) {
    colorConstants.set(match[1], `#${match[2].toLowerCase()}`);
  }

  const declaredUniforms = new Set<string>();
  for (const shaderSource of [vertexShader, fragmentShader]) {
    for (const match of shaderSource.matchAll(
      /\buniform\s+(?:lowp\s+|mediump\s+|highp\s+)?[A-Za-z_]\w*\s+([A-Za-z_]\w*)\s*;/g,
    )) {
      declaredUniforms.add(match[1]);
    }
  }
  const uniforms: Record<string, ClassicProjectCustomShaderUniform> = {};
  for (const match of module.source.matchAll(
    /\b([A-Za-z_]\w*)\s*:\s*\{\s*value\s*:\s*([^}\r\n,]+)\s*\}/g,
  )) {
    const name = match[1];
    const expression = match[2].trim();
    if (!declaredUniforms.has(name) || uniforms[name]) continue;
    const texture = textureVariables.get(expression);
    if (texture) {
      uniforms[name] = texture;
      continue;
    }
    const color = colorConstants.get(expression);
    if (color) {
      uniforms[name] = { kind: "color", value: color };
      continue;
    }
    const number = Number(expression);
    if (Number.isFinite(number)) {
      uniforms[name] = { kind: "number", value: number };
    }
  }

  const variants: ClassicProjectCustomMaterialInspection["variants"] = [];
  for (const match of module.source.matchAll(
    /\bconst\s+([A-Za-z_$][\w$]*Material)\s*=\s*makeMaterial\s*\(\s*\{([^}]*)\}\s*(?:,\s*\{([^}]*)\})?\s*\)/g,
  )) {
    const variableName = match[1];
    if (/^reflection/i.test(variableName)) continue;
    const baseName = variableName.replace(/Material$/, "");
    const loweredName = baseName.toLowerCase();
    const options = match[3] ?? "";
    const sideMatch =
      /\bside\s*:\s*(?:THREE\.)?(FrontSide|BackSide|DoubleSide)\b/.exec(
        options,
      );
    variants.push({
      name: baseName || "default",
      ...(loweredName.includes("water")
        ? { meshNameIncludes: "Water" }
        : loweredName.includes("fence")
          ? { meshNameIncludes: "Fencing" }
          : loweredName.includes("window")
            ? { meshNameIncludes: "Windows" }
            : {}),
      defines: parseClassicShaderDefines(match[2]),
      side:
        sideMatch?.[1] === "BackSide"
          ? "back"
          : sideMatch?.[1] === "FrontSide"
            ? "front"
            : "double",
      transparent: /\btransparent\s*:\s*true\b/.test(options),
      depthWrite: !/\bdepthWrite\s*:\s*false\b/.test(options),
    });
  }
  // Options often contain spreads or conditional object literals. The
  // balanced call is intentionally reduced to the literal define map and
  // renderer flags; no expression is evaluated.
  for (const match of module.source.matchAll(
    /\bconst\s+([A-Za-z_$][\w$]*Material)\s*=\s*makeMaterial\s*\(\s*\{([^}]*)\}/g,
  )) {
    const variableName = match[1];
    if (
      /^reflection/i.test(variableName) ||
      variants.some(
        (variant) =>
          variant.name === variableName.replace(/Material$/, ""),
      )
    ) {
      continue;
    }
    const callStart = module.source.indexOf("(", match.index);
    const callEnd = scanBalancedClassic(module.source, callStart, "(", ")");
    const options =
      callStart >= 0 && callEnd > callStart
        ? module.source.slice(callStart, callEnd)
        : "";
    const baseName = variableName.replace(/Material$/, "");
    const loweredName = baseName.toLowerCase();
    variants.push({
      name: baseName || "default",
      ...(loweredName.includes("water")
        ? { meshNameIncludes: "Water" }
        : loweredName.includes("fence")
          ? { meshNameIncludes: "Fencing" }
          : loweredName.includes("window")
            ? { meshNameIncludes: "Windows" }
            : {}),
      defines: parseClassicShaderDefines(match[2]),
      side: /\bside\s*:\s*(?:THREE\.)?BackSide\b/.test(options)
        ? "back"
        : /\bside\s*:\s*(?:THREE\.)?FrontSide\b/.test(options)
          ? "front"
          : "double",
      transparent: /\btransparent\s*:\s*true\b/.test(options),
      depthWrite: !/\bdepthWrite\s*:\s*false\b/.test(options),
    });
  }
  if (variants.length === 0) {
    variants.push({
      name: "default",
      defines: {},
      side: "double",
      transparent: false,
      depthWrite: true,
    });
  } else {
    variants.sort(
      (left, right) =>
        Number(Boolean(right.meshNameIncludes)) -
        Number(Boolean(left.meshNameIncludes)),
    );
  }

  const componentName =
    exportedComponentName(module.source) ??
    module.path.split("/").slice(-2, -1)[0] ??
    "ClassicShaderModel";
  const defaultPosition =
    tupleDefault(module.source, "position") ?? ([0, 0, 0] as const);
  const defaultScale = numericDefault(module.source, "scale") ?? 1;
  const usage = classicComponentUsage(
    componentName,
    modules,
    defaultPosition,
    defaultScale,
  );
  const colliderNames = classicStringArray(
    /colliderGroup[\s\S]*?\bfor\s*\(\s*const\s+\w+\s+of\s+\[([^\]]+)\]/.exec(
      module.source,
    )?.[1],
  );

  return {
    name: `${componentName} Material`,
    sourceModulePath: module.path,
    componentName,
    modelSourcePath,
    vertexShader,
    fragmentShader,
    uniforms,
    variants,
    ...(declaredUniforms.has("uTime") && /\buseFrame\s*\(/.test(module.source)
      ? { animatedTimeUniform: "uTime" }
      : {}),
    centerModel: /\.position\.sub\s*\(\s*center\s*\)/.test(module.source),
    mirrorX:
      /\bmirrorGeometryX\s*\(/.test(module.source) ||
      /\.setX\s*\([^,]+,\s*-\s*[^)]+\.getX\s*\(/.test(module.source),
    componentPosition: usage.position,
    componentScale: usage.scale,
    colliderSourceNodeNames: colliderNames,
  };
}

function classicTextureVariableSources(
  module: ComponentCodeImportSourceModule,
): Map<string, Extract<ClassicProjectCustomShaderUniform, { kind: "texture" }>> {
  const result = new Map<
    string,
    Extract<ClassicProjectCustomShaderUniform, { kind: "texture" }>
  >();
  const pattern =
    /\bconst\s*\[([^\]]+)\]\s*=\s*useLoader\s*\(\s*(?:THREE\.)?TextureLoader\s*,\s*\[([\s\S]*?)\]\s*\)/g;
  for (const match of module.source.matchAll(pattern)) {
    const variables = match[1]
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const paths = [...match[2].matchAll(
      /["'`]([^"'`\r\n]*?\.(?:png|jpe?g|webp|avif|gif|bmp|svg|ktx2?|hdr|exr))["'`]/gi,
    )]
      .map((candidate) =>
        resolveClassicResourcePath(candidate[1], module.path),
      )
      .filter((value): value is string => Boolean(value));
    variables.forEach((variable, index) => {
      const sourcePath = paths[index];
      if (!sourcePath) return;
      const nearest = new RegExp(
        `configureMagicTexture\\s*\\(\\s*${escapeClassicRegExp(variable)}\\s*,\\s*true\\s*\\)`,
      ).test(module.source);
      const magicConfigured = new RegExp(
        `configureMagicTexture\\s*\\(\\s*${escapeClassicRegExp(variable)}\\s*,`,
      ).test(module.source);
      result.set(variable, {
        kind: "texture",
        sourcePath,
        filter: nearest ? "nearest" : "linear",
        ...(magicConfigured
          ? {
              colorSpace: "linear" as const,
              generateMipmaps: false,
              wrapS: "repeat" as const,
              wrapT: "repeat" as const,
            }
          : {}),
      });
    });
  }
  return result;
}

function classicComponentUsage(
  componentName: string,
  modules: readonly ComponentCodeImportSourceModule[],
  defaultPosition: readonly [number, number, number],
  defaultScale: number,
): {
  position: [number, number, number];
  scale: number;
} {
  const escapedName = escapeClassicRegExp(componentName);
  for (const module of modules) {
    if (module.source.includes(`export const ${componentName}`)) continue;
    const match = new RegExp(`<${escapedName}\\b([^>]*)>`).exec(module.source);
    if (!match) continue;
    const positionExpression =
      /\bposition\s*=\s*\{\s*(\[[^\]]+\])\s*\}/.exec(match[1])?.[1];
    const scaleExpression =
      /\bscale\s*=\s*\{\s*([^}]+)\s*\}/.exec(match[1])?.[1] ??
      /\bscale\s*=\s*["']([^"']+)["']/.exec(match[1])?.[1];
    return {
      position:
        tupleLiteral(positionExpression) ?? [
          defaultPosition[0],
          defaultPosition[1],
          defaultPosition[2],
        ],
      scale:
        resolveClassicNumberExpression(scaleExpression, module.source) ??
        defaultScale,
    };
  }
  return {
    position: [defaultPosition[0], defaultPosition[1], defaultPosition[2]],
    scale: defaultScale,
  };
}

function resolveClassicNumberExpression(
  expression: string | undefined,
  source: string,
): number | undefined {
  if (!expression) return undefined;
  const direct = Number(expression.trim());
  if (Number.isFinite(direct)) return direct;
  const identifier = expression.trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(identifier)) return undefined;
  const match = new RegExp(
    `\\bconst\\s+${escapeClassicRegExp(identifier)}\\s*=\\s*(-?(?:\\d+(?:\\.\\d+)?|\\.\\d+))\\b`,
  ).exec(source);
  const value = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(value) ? value : undefined;
}

function tupleDefault(
  source: string,
  property: string,
): [number, number, number] | undefined {
  const match = new RegExp(
    `${escapeClassicRegExp(property)}\\s*=\\s*(\\[[^\\]]+\\])`,
  ).exec(source);
  return tupleLiteral(match?.[1]);
}

function tupleLiteral(value: string | undefined): [number, number, number] | undefined {
  if (!value) return undefined;
  const entries = value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((entry) => Number(entry.trim()));
  return entries.length === 3 && entries.every(Number.isFinite)
    ? [entries[0], entries[1], entries[2]]
    : undefined;
}

function templateLiteralConst(
  source: string,
  name: string,
): string | undefined {
  const match = new RegExp(
    `\\bconst\\s+${escapeClassicRegExp(name)}\\s*=\\s*(?:\\/\\*[\\s\\S]*?\\*\\/\\s*)?\`([\\s\\S]*?)\``,
  ).exec(source);
  return match?.[1];
}

function parseClassicShaderDefines(source: string): Record<string, string> {
  return Object.fromEntries(
    [...source.matchAll(
      /\b([A-Za-z_]\w*)\s*:\s*["']([^"']*)["']/g,
    )].map((match) => [match[1], match[2]]),
  );
}

function classicStringArray(source: string | undefined): string[] {
  if (!source) return [];
  return [...source.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

function escapeClassicRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scanBalancedClassic(
  source: string,
  start: number,
  open: string,
  close: string,
): number {
  if (start < 0 || source[start] !== open) return -1;
  let depth = 0;
  let quote = "";
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") {
        index += 1;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    if (character === close) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function mergeClassicImportDependencies(
  dependencies: readonly ComponentCodeImportAssetDependency[],
  resources: readonly ClassicProjectVisualResource[],
): ComponentCodeImportAssetDependency[] {
  const merged = new Map<string, ComponentCodeImportAssetDependency>();
  const add = (dependency: ComponentCodeImportAssetDependency) => {
    const sourcePath = normalizeClassicDependencySourcePath(dependency);
    const current = merged.get(sourcePath);
    if (!current) {
      merged.set(sourcePath, {
        ...dependency,
        sourcePath,
        fileName: sourcePath.split("/").pop() ?? dependency.fileName,
        requiredByPlanNodeIds: [...dependency.requiredByPlanNodeIds],
        sourceModulePaths: [...dependency.sourceModulePaths],
      });
      return;
    }
    for (const planNodeId of dependency.requiredByPlanNodeIds) {
      if (!current.requiredByPlanNodeIds.includes(planNodeId)) {
        current.requiredByPlanNodeIds.push(planNodeId);
      }
    }
    for (const sourceModulePath of dependency.sourceModulePaths) {
      if (!current.sourceModulePaths.includes(sourceModulePath)) {
        current.sourceModulePaths.push(sourceModulePath);
      }
    }
    if (current.kind === "unsupported" && dependency.kind !== "unsupported") {
      current.kind = dependency.kind;
    }
  };
  dependencies.forEach(add);
  for (const resource of resources) {
    add({
      sourcePath: resource.sourcePath,
      fileName: resource.fileName,
      kind: resource.kind,
      requiredByPlanNodeIds: [],
      sourceModulePaths: [resource.sourceModulePath],
    });
  }
  return [...merged.values()].sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath),
  );
}

function normalizeClassicDependencySourcePath(
  dependency: Pick<
    ComponentCodeImportAssetDependency,
    "sourcePath" | "sourceModulePaths"
  >,
): string {
  return (
    resolveClassicResourcePath(
      dependency.sourcePath,
      dependency.sourceModulePaths[0] ?? "src/World.tsx",
    ) ??
    dependency.sourcePath.trim().replace(/\\/g, "/").replace(/^\/+/, "")
  );
}

function scanClassicModuleResources(
  module: ComponentCodeImportSourceModule,
): ClassicProjectVisualResource[] {
  const resources = new Map<string, ClassicProjectVisualResource>();
  const pattern =
    /["'`]([^"'`\r\n]*?\.(?:glb|gltf|obj|vrm|png|jpe?g|webp|avif|gif|bmp|svg|ktx2|hdr|exr|drc|mp3|wav)(?:[?#][^"'`\r\n]*)?)["'`]/gi;
  for (const match of module.source.matchAll(pattern)) {
    const sourcePath = resolveClassicResourcePath(match[1], module.path);
    if (!sourcePath) continue;
    const fileName = sourcePath.split("/").pop() ?? sourcePath;
    resources.set(sourcePath, {
      sourcePath,
      fileName,
      kind: classicResourceKind(sourcePath),
      sourceModulePath: module.path,
    });
  }
  return [...resources.values()];
}

function resolveClassicResourcePath(
  value: string,
  sourceModulePath: string,
): string | undefined {
  let candidate = value.trim().replace(/[?#].*$/, "").replace(/\\/g, "/");
  candidate = candidate.replace(
    /^\/?\$\{[^}]*baseUrl[^}]*\}/i,
    "",
  );
  if (
    !candidate ||
    candidate.includes("${") ||
    /^(?:data:|https?:|blob:)/i.test(candidate) ||
    /^[a-z]:/i.test(candidate)
  ) {
    return undefined;
  }
  if (candidate.startsWith("/")) candidate = `public/${candidate.replace(/^\/+/, "")}`;
  else if (!candidate.startsWith("public/") && !candidate.startsWith(".")) {
    candidate = `public/${candidate}`;
  } else if (candidate.startsWith(".")) {
    const parent = sourceModulePath.replace(/\\/g, "/").split("/").slice(0, -1);
    candidate = [...parent, ...candidate.split("/")].join("/");
  }
  const normalized: string[] = [];
  for (const segment of candidate.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") normalized.pop();
    else normalized.push(segment);
  }
  const result = normalized.join("/");
  return result || undefined;
}

function classicResourceKind(
  sourcePath: string,
): ClassicProjectVisualResource["kind"] {
  if (/\.(?:glb|gltf|obj|vrm|drc)$/i.test(sourcePath)) return "model";
  if (/\.(?:png|jpe?g|webp|avif|gif|bmp|svg|ktx2|hdr|exr)$/i.test(sourcePath)) {
    return "texture";
  }
  if (/\.(?:mp3|wav)$/i.test(sourcePath)) return "audio";
  return "unsupported";
}

function exportedComponentName(source: string): string | undefined {
  return (
    /export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/.exec(source)?.[1] ??
    /export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(source)?.[1]
  );
}

function numericDefault(source: string, property: string): number | undefined {
  const match = new RegExp(
    `${property}\\s*=\\s*(-?(?:\\d+(?:\\.\\d+)?|\\.\\d+))`,
  ).exec(source);
  const value = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(value) ? value : undefined;
}

async function prepareClassicDependency(
  source: ClassicProjectVisualImportSource,
  dependency: ComponentCodeImportAssetDependency,
  existingManifest: AssetManifest,
): Promise<{ plan?: AssetImportPlan; diagnostics: AssetImportDiagnostic[] }> {
  if (dependency.kind === "unsupported" && !/\.drc$/i.test(dependency.sourcePath)) {
    return {
      diagnostics: [
        {
          severity: "warning",
          code: "classic-asset-format-unsupported",
          fileName: dependency.fileName,
          message: `${dependency.sourcePath}はStudioで変換できないため、このAssetだけをスキップして残りの変換を続けます。`,
        },
      ],
    };
  }

  let dataUrl: string;
  let resolvedSourcePath = dependency.sourcePath;
  const diagnostics: AssetImportDiagnostic[] = [];
  try {
    dataUrl = await tauri.readProjectFileDataUrl(
      source.path,
      dependency.sourcePath,
    );
  } catch (error) {
    const fallbackSourcePath = await findClassicAssetByFileName(
      source.path,
      dependency.fileName,
    );
    if (fallbackSourcePath && fallbackSourcePath !== dependency.sourcePath) {
      try {
        resolvedSourcePath = fallbackSourcePath;
        dataUrl = await tauri.readProjectFileDataUrl(
          source.path,
          fallbackSourcePath,
        );
        diagnostics.push({
          severity: "warning",
          code: "classic-asset-path-recovered",
          fileName: dependency.fileName,
          message: `${dependency.sourcePath}が見つからなかったため、取得済みRepository内の${fallbackSourcePath}を使用します。`,
        });
      } catch (fallbackError) {
        return {
          diagnostics: [
            {
              severity: "warning",
              code: "classic-asset-read-failed",
              fileName: dependency.fileName,
              message: `${dependency.sourcePath}と代替候補${fallbackSourcePath}を読み取れないため、このAssetだけをスキップして残りの変換を続けます: ${errorMessage(fallbackError)}`,
            },
          ],
        };
      }
    } else {
      return {
        diagnostics: [
          {
            severity: "warning",
            code: "classic-asset-read-failed",
            fileName: dependency.fileName,
            message: `${dependency.sourcePath}を読み取れないため、このAssetだけをスキップして残りの変換を続けます: ${errorMessage(error)}`,
          },
        ],
      };
    }
  }

  try {
    const decoded = decodeDataUrl(dataUrl);
    const draco = /\.drc$/i.test(resolvedSourcePath);
    const companionFiles =
      !draco && dependency.kind === "model"
        ? await readClassicModelCompanions(
            source.path,
            resolvedSourcePath,
          )
        : undefined;
    const bytes = draco
      ? await convertDracoGeometryToGlb(decoded.bytes)
      : decoded.bytes;
    const fileName = draco
      ? dependency.fileName.replace(/\.drc$/i, ".glb")
      : dependency.fileName;
    const plan = await createAssetImportPlan({
      fileName,
      bytes,
      mimeType: draco ? "model/gltf-binary" : decoded.mimeType,
      displayName: dependency.fileName.replace(/\.[^.]+$/, ""),
      existingManifest,
      preferredKind:
        dependency.kind === "model" || dependency.kind === "texture"
          ? dependency.kind
          : undefined,
      companionFiles,
    });
    return {
      plan,
      diagnostics: [
        ...diagnostics,
        ...plan.diagnostics.map((diagnostic) =>
          diagnostic.severity === "blocking"
            ? {
                ...diagnostic,
                severity: "warning" as const,
                message: `${diagnostic.message} このAssetだけをスキップして残りの変換を続けます。`,
              }
            : diagnostic,
        ),
      ],
    };
  } catch (error) {
    return {
      diagnostics: [
        ...diagnostics,
        {
          severity: "warning",
          code: "classic-asset-convert-failed",
          fileName: dependency.fileName,
          message: `${resolvedSourcePath}をVisual Assetへ変換できないため、このAssetだけをスキップして残りの変換を続けます: ${errorMessage(error)}`,
        },
      ],
    };
  }
}

async function findClassicAssetByFileName(
  projectPath: string,
  fileName: string,
): Promise<string | undefined> {
  const expected = fileName.toLowerCase();
  const matches: string[] = [];
  const pending = ["public"];
  let scanned = 0;
  try {
    while (pending.length > 0 && scanned < MAX_COMPANION_FILES) {
      const directory = pending.shift();
      if (!directory) continue;
      for (const entry of await tauri.listFiles(projectPath, directory)) {
        scanned += 1;
        if (scanned > MAX_COMPANION_FILES) break;
        if (entry.isDir) {
          pending.push(entry.rel);
          continue;
        }
        const relativePath = entry.rel.replace(/\\/g, "/");
        if (relativePath.split("/").pop()?.toLowerCase() === expected) {
          matches.push(relativePath);
          if (matches.length > 1) return undefined;
        }
      }
    }
  } catch {
    return undefined;
  }
  return matches[0];
}

async function readClassicModelCompanions(
  projectPath: string,
  modelSourcePath: string,
): Promise<ThreeModelCompanionFile[]> {
  const normalizedSource = modelSourcePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalizedSource.split("/").filter(Boolean);
  const sourceDirectory = segments.slice(0, -1).join("/");
  const scanRoot = segments[0] === "public" ? "public" : sourceDirectory;
  if (!scanRoot) return [];

  const candidates: Array<{ rel: string; size: number }> = [];
  const pending = [scanRoot];
  let totalBytes = 0;
  while (pending.length > 0) {
    const directory = pending.shift();
    if (!directory) continue;
    for (const entry of await tauri.listFiles(projectPath, directory)) {
      if (entry.isDir) {
        pending.push(entry.rel);
        continue;
      }
      const rel = entry.rel.replace(/\\/g, "/");
      if (rel === normalizedSource || !MODEL_COMPANION_PATTERN.test(rel)) continue;
      const size = entry.size ?? 0;
      totalBytes += size;
      if (
        candidates.length >= MAX_COMPANION_FILES ||
        totalBytes > MAX_COMPANION_BYTES
      ) {
        throw new Error(
          `モデル依存ファイルが上限（${MAX_COMPANION_FILES}件 / ${MAX_COMPANION_BYTES / 1024 / 1024} MB）を超えています`,
        );
      }
      candidates.push({ rel, size });
    }
  }

  return Promise.all(
    candidates.map(async ({ rel }) => {
      const decoded = decodeDataUrl(
        await tauri.readProjectFileDataUrl(projectPath, rel),
      );
      return {
        relativePath: rel,
        bytes: decoded.bytes,
        mimeType: decoded.mimeType,
      };
    }),
  );
}

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string } {
  const separator = dataUrl.indexOf(",");
  if (separator < 0) throw new Error("data URLが壊れています。 ");
  const header = dataUrl.slice(0, separator);
  const mimeType = header.match(/^data:([^;,]+)/i)?.[1] ?? "application/octet-stream";
  const payload = dataUrl.slice(separator + 1);
  const decoded = header.includes(";base64")
    ? atob(payload)
    : decodeURIComponent(payload);
  return {
    mimeType,
    bytes: Uint8Array.from(decoded, (character) => character.charCodeAt(0)),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readClassicSourceModules(
  projectPath: string,
): Promise<ComponentCodeImportSourceModule[]> {
  const sourceEntries: Array<{ path: string; size: number }> = [];
  const pending = ["src"];
  while (pending.length > 0) {
    const directory = pending.shift();
    if (!directory) continue;
    const entries = await tauri.listFiles(projectPath, directory);
    for (const entry of entries) {
      if (entry.isDir) {
        pending.push(entry.rel);
        continue;
      }
      if (!SOURCE_MODULE_PATTERN.test(entry.rel)) continue;
      const size = entry.size ?? 0;
      if (size > MAX_SOURCE_MODULE_BYTES) {
        throw new Error(
          `${entry.rel}が大きすぎます。1 moduleあたり1 MB以下にしてください。`,
        );
      }
      sourceEntries.push({ path: entry.rel.replace(/\\/g, "/"), size });
      if (sourceEntries.length > MAX_SOURCE_MODULES) {
        throw new Error(
          `src内のsource moduleが${MAX_SOURCE_MODULES}件を超えています。変換対象を分けてください。`,
        );
      }
    }
  }
  const totalBytes = sourceEntries.reduce((total, entry) => total + entry.size, 0);
  if (totalBytes > MAX_SOURCE_GRAPH_BYTES) {
    throw new Error("srcのsource module合計が4 MBを超えています。変換対象を分けてください。");
  }
  return Promise.all(
    sourceEntries.map(async (entry) => ({
      path: entry.path,
      source: await tauri.readTextFile(projectPath, entry.path),
    })),
  );
}
