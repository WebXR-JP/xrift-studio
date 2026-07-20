import {
  tauri,
  type Project,
  type VisualBinaryDocumentWrite,
  type VisualDocumentFile,
  type VisualProjectFiles,
  type VisualProjectWriteRequest,
} from "../tauri";
import type { AssetManifest } from "./asset-manifest";
import type { PrefabDocument } from "./prefab-document";
import type { VisualProjectDocument } from "./project-document";
import type { RegisteredSceneComponent, SceneDocument } from "./scene-document";
import type { StarterVisualProjectPlan } from "./starter-templates";
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
  const binaryDocuments = await materializeStarterAssetCopies(plan);
  return createVisualProjectOnDisk(
    projectsRoot,
    directoryName,
    {
      project: plan.project,
      scenes: { [plan.scene.sceneId]: plan.scene },
      assets: plan.assets,
      prefabs: plan.prefabs,
    },
    binaryDocuments,
  );
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

async function materializeStarterAssetCopies(
  plan: StarterVisualProjectPlan,
): Promise<VisualBinaryDocumentWrite[]> {
  return Promise.all(
    plan.bundledAssetCopies.map(async (copy) => {
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
      return {
        relativePath: copy.targetRelativePath,
        dataUrl: bytesToDataUrl(bytes, copy.mediaType),
      };
    }),
  );
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
