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
  createMeshColliderComponent,
  createMeshComponent,
  getMesh,
  getTransform,
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
    if (!prepared.plan?.canCommit || !prepared.plan.asset) continue;
    plans.push(prepared.plan);
    assetIdBySourcePath[dependency.sourcePath] = prepared.plan.asset.id;
    workingManifest = await commitAssetImportPlan(
      workingManifest,
      prepared.plan,
      async () => undefined,
    );
  }

  return {
    plans,
    manifest: workingManifest,
    assetIdBySourcePath,
    diagnostics,
  };
}

export function augmentClassicProjectVisualImportPlan(
  plan: ComponentCodeImportPlan,
  source: ClassicProjectVisualImportSource,
): ComponentCodeImportPlan {
  const assetDependencies = mergeClassicImportDependencies(
    plan.assetDependencies,
    source.inspection.resources,
  );
  const discoveredCount = assetDependencies.length - plan.assetDependencies.length;
  const diagnostics =
    discoveredCount > 0 || source.inspection.customShaderModulePaths.length > 0
      ? [
          ...plan.diagnostics,
          ...(discoveredCount > 0
            ? [{
                severity: "info" as const,
                code: "classic-project-assets-discovered",
                message: `Component内部で参照される関連Asset ${discoveredCount}件をインポート計画へ追加しました。`,
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
    diagnostics,
    assetDependencies,
    summary: {
      ...plan.summary,
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
    },
  };
}

export function applyClassicProjectVisualImportEnhancements(input: {
  source: ClassicProjectVisualImportSource;
  componentPlan: ComponentCodeImportPlan;
  result: ApplyComponentCodeImportResult;
  assetIdBySourcePath: Readonly<Record<string, string>>;
}): ApplyComponentCodeImportResult {
  let scene = input.result.scene;
  const diagnostics = [...input.result.diagnostics];
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

  return {
    ...input.result,
    scene,
    entityIds: input.result.entityIds.filter((entityId) =>
      Boolean(scene.entities[entityId]),
    ),
    diagnostics,
  };
}

export function inspectClassicProjectVisualSource(
  modules: readonly ComponentCodeImportSourceModule[],
): ClassicProjectVisualInspection {
  const resources = new Map<string, ClassicProjectVisualResource>();
  const customShaderModulePaths: string[] = [];
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
  };
}

function mergeClassicImportDependencies(
  dependencies: readonly ComponentCodeImportAssetDependency[],
  resources: readonly ClassicProjectVisualResource[],
): ComponentCodeImportAssetDependency[] {
  const merged = new Map(
    dependencies.map((dependency) => [
      dependency.sourcePath,
      {
        ...dependency,
        requiredByPlanNodeIds: [...dependency.requiredByPlanNodeIds],
        sourceModulePaths: [...dependency.sourceModulePaths],
      },
    ]),
  );
  for (const resource of resources) {
    const current = merged.get(resource.sourcePath);
    if (current) {
      if (!current.sourceModulePaths.includes(resource.sourceModulePath)) {
        current.sourceModulePaths.push(resource.sourceModulePath);
      }
      continue;
    }
    merged.set(resource.sourcePath, {
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
  if (!candidate || /^(?:data:|https?:|blob:)/i.test(candidate)) return undefined;
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
  return result.startsWith("public/") ? result : undefined;
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
          severity: "blocking",
          code: "classic-asset-format-unsupported",
          fileName: dependency.fileName,
          message: `${dependency.sourcePath}はStudioで変換できないAsset形式です。`,
        },
      ],
    };
  }

  let dataUrl: string;
  try {
    dataUrl = await tauri.readProjectFileDataUrl(
      source.path,
      dependency.sourcePath,
    );
  } catch (error) {
    return {
      diagnostics: [
        {
          severity: "blocking",
          code: "classic-asset-read-failed",
          fileName: dependency.fileName,
          message: `${dependency.sourcePath}をClassicプロジェクトから読み取れませんでした: ${errorMessage(error)}`,
        },
      ],
    };
  }

  try {
    const decoded = decodeDataUrl(dataUrl);
    const draco = /\.drc$/i.test(dependency.sourcePath);
    const companionFiles =
      !draco && dependency.kind === "model"
        ? await readClassicModelCompanions(
            source.path,
            dependency.sourcePath,
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
    return { plan, diagnostics: plan.diagnostics };
  } catch (error) {
    return {
      diagnostics: [
        {
          severity: "blocking",
          code: "classic-asset-convert-failed",
          fileName: dependency.fileName,
          message: `${dependency.sourcePath}をVisual Assetへ変換できませんでした: ${errorMessage(error)}`,
        },
      ],
    };
  }
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
