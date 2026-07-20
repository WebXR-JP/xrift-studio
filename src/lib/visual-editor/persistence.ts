import {
  tauri,
  type Project,
  type VisualBinaryDocumentWrite,
  type VisualDocumentFile,
  type VisualProjectFiles,
  type VisualProjectWriteRequest,
} from "../tauri";
import type { AssetManifest, AssetFolder, ModelAsset, SceneAsset } from "./asset-manifest";
import { expandGltfAssets, type GltfJson } from "./gltf-derived-assets";
import type { PrefabDocument } from "./prefab-document";
import type { VisualProjectDocument } from "./project-document";
import type { RegisteredSceneComponent, SceneDocument } from "./scene-document";
import {
  STARTER_ASSET_FOLDER_IDS,
  type StarterAssetCopyPlanEntry,
  type StarterVisualProjectPlan,
} from "./starter-templates";
import {
  assetManifestCodec,
  prefabDocumentCodec,
  sceneDocumentCodec,
  visualProjectDocumentCodec,
  type DocumentValidationIssue,
  type VisualDocumentCodec,
} from "./serialization";

export type VisualProjectDocuments = {
  project: VisualProjectDocument;
  scenes: Record<string, SceneDocument>;
  assets: AssetManifest;
  prefabs: Record<string, PrefabDocument>;
};

export type PreparedStarterVisualProject = {
  plan: StarterVisualProjectPlan;
  binaryDocuments: VisualBinaryDocumentWrite[];
};

export async function createVisualProjectOnDisk(
  projectsRoot: string,
  directoryName: string,
  documents: VisualProjectDocuments,
  binaryDocuments: VisualBinaryDocumentWrite[] = [],
): Promise<Project> {
  return tauri.createVisualProject(
    projectsRoot,
    directoryName,
    {
      ...serializeVisualProjectDocuments(documents),
      ...(binaryDocuments.length > 0 ? { binaryDocuments } : {}),
    },
  );
}

export async function createStarterVisualProjectOnDisk(
  projectsRoot: string,
  directoryName: string,
  plan: StarterVisualProjectPlan,
): Promise<Project> {
  const prepared = await prepareStarterVisualProject(plan);
  return createPreparedStarterVisualProjectOnDisk(
    projectsRoot,
    directoryName,
    prepared,
  );
}

export async function createPreparedStarterVisualProjectOnDisk(
  projectsRoot: string,
  directoryName: string,
  prepared: PreparedStarterVisualProject,
): Promise<Project> {
  return createVisualProjectOnDisk(
    projectsRoot,
    directoryName,
    {
      project: prepared.plan.project,
      scenes: { [prepared.plan.scene.sceneId]: prepared.plan.scene },
      assets: prepared.plan.assets,
      prefabs: prepared.plan.prefabs,
    },
    prepared.binaryDocuments,
  );
}

/**
 * Loads bundled starter sources and runs the same embedded glTF expansion as
 * a normal Model import. The returned plan is used both by the editor session
 * and by the first atomic project save, so the two paths cannot drift.
 */
export async function prepareStarterVisualProject(
  plan: StarterVisualProjectPlan,
): Promise<PreparedStarterVisualProject> {
  const loadedCopies = await loadStarterAssetCopies(plan.bundledAssetCopies);
  const assets: Record<string, SceneAsset> = { ...plan.assets.assets };
  const folders: Record<string, AssetFolder> = { ...(plan.assets.folders ?? {}) };
  const derivedDocuments: VisualBinaryDocumentWrite[] = [];

  for (const loaded of loadedCopies) {
    const model = Object.values(assets).find(
      (candidate): candidate is ModelAsset =>
        candidate.kind === "model" &&
        candidate.source.kind === "project" &&
        candidate.source.relativePath === loaded.copy.targetRelativePath,
    );
    if (!model || model.kind !== "model") continue;

    const modelFolders = ensureStarterModelFolders(folders, model);
    const scopedManifest: AssetManifest = {
      ...plan.assets,
      folders,
      assets: Object.fromEntries(
        Object.entries(assets).filter(
          ([, candidate]) =>
            (candidate.kind === "material" || candidate.kind === "texture") &&
            candidate.importedFromModel?.modelAssetId === model.id,
        ),
      ),
    };
    const expanded = await expandGltfAssets({
      json: parseStarterGlbJson(loaded.bytes),
      modelBytes: loaded.bytes,
      sourceFormat: "glb",
      modelAssetId: model.id,
      modelSourceHash: model.sourceHash ?? loaded.copy.expectedSha256,
      materialSlots: model.materialSlots,
      manifest: scopedManifest,
      materialFolderId: modelFolders.materialFolderId,
      textureFolderId: modelFolders.textureFolderId,
      hashBytes: sha256StarterBytes,
    });

    assets[model.id] = {
      ...model,
      folderId: modelFolders.modelFolderId,
      materialSlots: expanded.materialSlots,
    };
    const starterTexturePaths = new Map(
      expanded.writes.map((write) => [
        write.relativePath,
        starterDerivedAssetPath(loaded.copy.assetId, write.relativePath),
      ]),
    );
    const starterTextureAssets = expanded.textureAssets.map((asset) => {
      if (asset.source.kind !== "project") return asset;
      const relativePath = starterTexturePaths.get(asset.source.relativePath);
      return relativePath
        ? { ...asset, source: { ...asset.source, relativePath } }
        : asset;
    });
    for (const derivedAsset of [
      ...expanded.materialAssets,
      ...starterTextureAssets,
    ]) {
      assets[derivedAsset.id] = derivedAsset;
    }
    for (const write of expanded.writes) {
      derivedDocuments.push({
        relativePath: starterTexturePaths.get(write.relativePath) ?? write.relativePath,
        dataUrl: bytesToDataUrl(write.bytes, write.mediaType),
      });
    }
  }

  return {
    plan: {
      ...plan,
      assets: { ...plan.assets, folders, assets },
    },
    binaryDocuments: [
      ...loadedCopies.map(({ copy, bytes }) => ({
        relativePath: copy.targetRelativePath,
        dataUrl: bytesToDataUrl(bytes, copy.mediaType),
      })),
      ...derivedDocuments,
    ],
  };
}

export async function saveVisualProjectToDisk(
  projectPath: string,
  documents: VisualProjectDocuments,
): Promise<void> {
  await tauri.saveVisualProject(
    projectPath,
    serializeVisualProjectDocuments(documents),
  );
}

export async function readVisualProjectFromDisk(
  projectPath: string,
): Promise<VisualProjectDocuments> {
  return parseVisualProjectFiles(await tauri.readVisualProject(projectPath));
}

export function serializeVisualProjectDocuments(
  documents: VisualProjectDocuments,
): VisualProjectWriteRequest {
  const projectJson = serializeChecked(
    visualProjectDocumentCodec,
    documents.project,
    "project manifest",
  );
  const declaredSceneIds = Object.keys(documents.project.scenePaths).sort();
  const providedSceneIds = Object.keys(documents.scenes).sort();
  if (!sameStrings(declaredSceneIds, providedSceneIds)) {
    throw new Error("Scene documents must exactly match project.scenePaths");
  }

  const sceneDocuments = declaredSceneIds.map((sceneId) => {
    const scene = documents.scenes[sceneId];
    if (scene.sceneId !== sceneId) {
      throw new Error(`Scene id does not match scenePaths: ${sceneId}`);
    }
    return {
      relativePath: documents.project.scenePaths[sceneId],
      content: serializeChecked(sceneDocumentCodec, scene, `scene ${sceneId}`),
    };
  });

  const prefabDocuments = serializePrefabDocuments(
    documents.prefabs,
    documents.assets,
    documents.scenes,
    new Set([
      "xrift-studio.project.json",
      documents.project.assetManifestPath,
      ...Object.values(documents.project.scenePaths),
    ]),
  );

  return {
    projectJson,
    sceneDocuments,
    prefabDocuments,
    assetManifestJson: serializeChecked(
      assetManifestCodec,
      documents.assets,
      "asset manifest",
    ),
  };
}

export function parseVisualProjectFiles(
  files: VisualProjectFiles,
): VisualProjectDocuments {
  const project = parseChecked(
    visualProjectDocumentCodec,
    files.projectJson,
    "project manifest",
  );
  const assets = parseChecked(
    assetManifestCodec,
    files.assetManifestJson,
    "asset manifest",
  );
  const prefabPaths = collectPrefabAssetPaths(
    assets,
    new Set([
      "xrift-studio.project.json",
      project.assetManifestPath,
      ...Object.values(project.scenePaths),
    ]),
  );
  const expectedPathToSceneId = new Map(
    Object.entries(project.scenePaths).map(([sceneId, relativePath]) => [
      relativePath,
      sceneId,
    ]),
  );
  const scenes: Record<string, SceneDocument> = {};
  for (const file of files.sceneDocuments) {
    const expectedSceneId = expectedPathToSceneId.get(file.relativePath);
    if (!expectedSceneId || scenes[expectedSceneId]) {
      throw new Error(`Unexpected or duplicate scene document: ${file.relativePath}`);
    }
    const scene = parseChecked(
      sceneDocumentCodec,
      file.content,
      `scene ${expectedSceneId}`,
    );
    if (scene.sceneId !== expectedSceneId) {
      throw new Error(`Scene id does not match project manifest: ${expectedSceneId}`);
    }
    scenes[expectedSceneId] = scene;
  }

  const expectedSceneIds = Object.keys(project.scenePaths).sort();
  if (!sameStrings(expectedSceneIds, Object.keys(scenes).sort())) {
    throw new Error("One or more scene documents are missing");
  }

  const prefabs: Record<string, PrefabDocument> = {};
  const receivedPrefabPaths = new Set<string>();
  for (const file of files.prefabDocuments ?? []) {
    if (!prefabPaths.has(file.relativePath) || receivedPrefabPaths.has(file.relativePath)) {
      throw new Error(`Unexpected or duplicate prefab document: ${file.relativePath}`);
    }
    receivedPrefabPaths.add(file.relativePath);
    const prefab = parseChecked(
      prefabDocumentCodec,
      file.content,
      `prefab ${file.relativePath}`,
    );
    if (prefabs[prefab.prefabId]) {
      throw new Error(`Duplicate prefab id: ${prefab.prefabId}`);
    }
    const expectedPrefabId = prefabPaths.get(file.relativePath)?.prefabId;
    if (prefab.prefabId !== expectedPrefabId) {
      throw new Error(`Prefab id does not match its filename: ${file.relativePath}`);
    }
    validatePrefabSource(prefab, scenes);
    prefabs[prefab.prefabId] = prefab;
  }
  if (!sameStrings([...prefabPaths.keys()].sort(), [...receivedPrefabPaths].sort())) {
    throw new Error("One or more prefab documents are missing");
  }
  validatePrefabReferences(prefabs, assets, prefabPaths);
  return { project, scenes, assets, prefabs };
}

function serializePrefabDocuments(
  prefabs: Record<string, PrefabDocument>,
  assets: AssetManifest,
  scenes: Record<string, SceneDocument>,
  occupiedDocumentPaths: Set<string>,
): VisualDocumentFile[] {
  const prefabPaths = collectPrefabAssetPaths(assets, occupiedDocumentPaths);
  const documentsByPath = new Map<string, VisualDocumentFile>();
  const prefabIds = Object.keys(prefabs).sort();

  for (const prefabId of prefabIds) {
    const prefab = prefabs[prefabId];
    if (prefab.prefabId !== prefabId) {
      throw new Error(`Prefab id does not match record key: ${prefabId}`);
    }
    validatePrefabSource(prefab, scenes);
    const matchingPaths = [...prefabPaths.entries()]
      .filter(([, asset]) => asset.prefabId === prefabId)
      .map(([path]) => path);
    if (matchingPaths.length !== 1) {
      throw new Error(
        `Prefab ${prefabId} must be referenced by exactly one Prefab asset`,
      );
    }
    const relativePath = matchingPaths[0];
    documentsByPath.set(relativePath, {
      relativePath,
      content: serializeChecked(prefabDocumentCodec, prefab, `prefab ${prefabId}`),
    });
  }

  if (documentsByPath.size !== prefabPaths.size) {
    throw new Error("Every Prefab asset must reference one prefab document");
  }
  validatePrefabReferences(prefabs, assets, prefabPaths);
  return [...documentsByPath.values()].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

type PrefabAssetPathEntry = {
  assetId: string;
  prefabId: string;
};

function collectPrefabAssetPaths(
  assets: AssetManifest,
  occupiedDocumentPaths: Set<string> = new Set(),
): Map<string, PrefabAssetPathEntry> {
  const paths = new Map<string, PrefabAssetPathEntry>();
  for (const [assetId, asset] of Object.entries(assets.assets)) {
    if (asset.kind !== "template" || asset.templateType !== "prefab") continue;
    const prefabPath = "prefabPath" in asset ? asset.prefabPath : undefined;
    if (
      typeof prefabPath !== "string" ||
      !/^prefabs\/(?:[^/]+\/)*[^/]+\.prefab\.json$/.test(prefabPath) ||
      prefabPath.includes("..") ||
      prefabPath.includes("\\") ||
      asset.templatePath !== prefabPath ||
      asset.source.kind !== "project" ||
      asset.source.relativePath !== prefabPath
    ) {
      throw new Error(`Prefab asset has an invalid prefabPath: ${assetId}`);
    }
    if (occupiedDocumentPaths.has(prefabPath) || paths.has(prefabPath)) {
      throw new Error(`Prefab document path collision: ${prefabPath}`);
    }
    const prefabId = prefabPath
      .slice(prefabPath.lastIndexOf("/") + 1)
      .replace(/\.prefab\.json$/, "");
    paths.set(prefabPath, { assetId, prefabId });
  }
  return paths;
}

function validatePrefabSource(
  prefab: PrefabDocument,
  scenes: Record<string, SceneDocument>,
): void {
  const sourceScene = scenes[prefab.source.sceneId];
  if (!sourceScene) {
    throw new Error(`Prefab source scene is missing: ${prefab.prefabId}`);
  }
  for (const sourceRootId of prefab.source.rootEntityIds) {
    if (!sourceScene.entities[sourceRootId]) {
      throw new Error(
        `Prefab source entity is missing: ${prefab.prefabId}/${sourceRootId}`,
      );
    }
  }
}

function validatePrefabReferences(
  prefabs: Record<string, PrefabDocument>,
  assets: AssetManifest,
  prefabPaths: Map<string, PrefabAssetPathEntry>,
): void {
  const prefabByAssetId = new Map(
    [...prefabPaths.values()].map((entry) => [entry.assetId, prefabs[entry.prefabId]]),
  );
  const dependencies = new Map<string, string[]>();
  for (const prefab of Object.values(prefabs)) {
    for (const entity of Object.values(prefab.entities)) {
      for (const rawComponent of entity.components) {
        const component = rawComponent as RegisteredSceneComponent;
        if (component.type === "mesh") {
          if (component.geometry?.kind === "asset") {
            requireAsset(assets, component.geometry.assetId, ["model", "primitive"]);
          }
          for (const binding of component.materialBindings) {
            requireAsset(assets, binding.materialAssetId, ["material"]);
          }
        } else if (component.type === "particle-emitter") {
          requireAsset(assets, component.particleAssetId, ["particle"]);
        } else if (component.type === "audio-source" && component.audioAssetId) {
          requireAsset(assets, component.audioAssetId, ["audio"]);
        } else if (component.type === "prefab-instance") {
          requireAsset(assets, component.prefabAssetId, ["template"]);
          const target = prefabByAssetId.get(component.prefabAssetId);
          if (!target || !target.entities[component.sourceEntityId]) {
            throw new Error(
              `Prefab instance source is missing: ${component.prefabAssetId}/${component.sourceEntityId}`,
            );
          }
          dependencies.set(prefab.prefabId, [
            ...(dependencies.get(prefab.prefabId) ?? []),
            target.prefabId,
          ]);
        } else if (component.type === "xrift-component") {
          for (const assetId of component.assetReferences) {
            requireAsset(assets, assetId);
          }
          for (const entityId of component.entityReferences) {
            if (!prefab.entities[entityId]) {
              throw new Error(`XRift Prefab entity reference is missing: ${entityId}`);
            }
          }
        }
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (prefabId: string): void => {
    if (visited.has(prefabId)) return;
    if (visiting.has(prefabId)) {
      throw new Error(`Prefab dependency cycle detected: ${prefabId}`);
    }
    visiting.add(prefabId);
    for (const dependency of dependencies.get(prefabId) ?? []) visit(dependency);
    visiting.delete(prefabId);
    visited.add(prefabId);
  };
  Object.keys(prefabs).forEach(visit);
}

function requireAsset(
  manifest: AssetManifest,
  assetId: string,
  expectedKinds: string[] = [],
): void {
  const asset = manifest.assets[assetId];
  if (!asset) throw new Error(`Prefab references a missing asset: ${assetId}`);
  if (expectedKinds.length > 0 && !expectedKinds.includes(asset.kind)) {
    throw new Error(`Prefab asset reference has the wrong kind: ${assetId}`);
  }
}

function serializeChecked<Document>(
  codec: VisualDocumentCodec<Document>,
  document: Document,
  label: string,
): string {
  const json = codec.serialize(document);
  const parsed = codec.parse(json);
  if (!parsed.ok) throw validationError(label, parsed.issues);
  return json;
}

function parseChecked<Document>(
  codec: VisualDocumentCodec<Document>,
  json: string,
  label: string,
): Document {
  const parsed = codec.parse(json);
  if (!parsed.ok) throw validationError(label, parsed.issues);
  return parsed.document;
}

function validationError(
  label: string,
  issues: DocumentValidationIssue[],
): Error {
  const details = issues
    .slice(0, 5)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("; ");
  return new Error(`Invalid ${label}${details ? `: ${details}` : ""}`);
}

function sameStrings(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

type LoadedStarterAssetCopy = {
  copy: StarterAssetCopyPlanEntry;
  bytes: Uint8Array;
};

async function loadStarterAssetCopies(
  copies: readonly StarterAssetCopyPlanEntry[],
): Promise<LoadedStarterAssetCopy[]> {
  return Promise.all(
    copies.map(async (copy) => {
      if (
        !copy.targetRelativePath.startsWith("assets/starter/") ||
        copy.targetRelativePath.includes("..") ||
        copy.targetRelativePath.includes(":") ||
        copy.targetRelativePath.includes("\\")
      ) {
        throw new Error("Starter asset destination must be under assets/starter");
      }
      const response = await fetch(copy.bundledPublicPath, {
        cache: "force-cache",
      });
      if (!response.ok) {
        throw new Error(`Starter asset could not be loaded: ${copy.assetId}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== copy.expectedByteLength) {
        throw new Error(`Starter asset size does not match: ${copy.assetId}`);
      }
      const sourceHash = await sha256StarterBytes(bytes);
      if (sourceHash !== copy.expectedSha256) {
        throw new Error(`Starter asset hash does not match: ${copy.assetId}`);
      }
      return { copy, bytes };
    }),
  );
}

function ensureStarterModelFolders(
  folders: Record<string, AssetFolder>,
  model: ModelAsset,
): {
  modelFolderId: string;
  materialFolderId: string;
  textureFolderId: string;
} {
  const modelFolderId = `starter-model-${model.id}`;
  const materialFolderId = `${modelFolderId}-materials`;
  const textureFolderId = `${modelFolderId}-textures`;
  ensureStarterFolder(
    folders,
    modelFolderId,
    model.name,
    STARTER_ASSET_FOLDER_IDS.models,
    nextStarterFolderOrder(folders, STARTER_ASSET_FOLDER_IDS.models),
  );
  ensureStarterFolder(
    folders,
    materialFolderId,
    "Materials",
    modelFolderId,
    nextStarterFolderOrder(folders, modelFolderId),
  );
  ensureStarterFolder(
    folders,
    textureFolderId,
    "Textures",
    modelFolderId,
    nextStarterFolderOrder(folders, modelFolderId),
  );
  return { modelFolderId, materialFolderId, textureFolderId };
}

function ensureStarterFolder(
  folders: Record<string, AssetFolder>,
  id: string,
  name: string,
  parentId: string,
  order: number,
): void {
  const current = folders[id];
  if (current) {
    if (current.name !== name || current.parentId !== parentId) {
      throw new Error(`Starter asset folder ID collision: ${id}`);
    }
    return;
  }
  folders[id] = { id, name, parentId, order };
}

function nextStarterFolderOrder(
  folders: Record<string, AssetFolder>,
  parentId: string,
): number {
  return (
    Math.max(
      -1,
      ...Object.values(folders)
        .filter((folder) => folder.parentId === parentId)
        .map((folder) => folder.order),
    ) + 1
  );
}

function parseStarterGlbJson(bytes: Uint8Array): GltfJson {
  if (bytes.byteLength < 20) throw new Error("Starter GLB header is incomplete");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) {
    throw new Error("Starter GLB magic is invalid");
  }
  if (view.getUint32(4, true) !== 2) {
    throw new Error("Only glTF 2.0 starter GLB is supported");
  }
  const declaredLength = view.getUint32(8, true);
  const jsonLength = view.getUint32(12, true);
  if (
    declaredLength > bytes.byteLength ||
    declaredLength < 20 ||
    view.getUint32(16, true) !== 0x4e4f534a ||
    20 + jsonLength > declaredLength
  ) {
    throw new Error("Starter GLB JSON chunk is invalid");
  }
  const parsed = JSON.parse(
    new TextDecoder()
      .decode(bytes.subarray(20, 20 + jsonLength))
      .replace(/[\u0000\u0020]+$/g, ""),
  ) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Starter GLB JSON root is invalid");
  }
  return parsed as GltfJson;
}

function starterDerivedAssetPath(
  starterAssetId: string,
  relativePath: string,
): string {
  const importedPrefix = "assets/imported/";
  const suffix = relativePath.startsWith(importedPrefix)
    ? relativePath.slice(importedPrefix.length)
    : relativePath.replace(/^assets\//, "");
  return `assets/starter/${starterAssetId}/${suffix}`;
}

async function sha256StarterBytes(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto SHA-256 is unavailable");
  }
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", owned.buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToDataUrl(bytes: Uint8Array, mediaType: string): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mediaType};base64,${btoa(binary)}`;
}
