import {
  normalizeMaterialProperties,
  normalizeProjectRelativePath,
  type AssetManifest,
  type AddAssetResult,
  type MaterialProperties,
  type PrefabAsset,
} from "./asset-manifest";
import {
  cloneEntityHierarchy,
  type DocumentIdGenerator,
  type PrefabInstanceComponent,
  type RegisteredSceneComponent,
  type SceneDocument,
  type SceneEntity,
} from "./scene-document";

export const PREFAB_DOCUMENT_SCHEMA_VERSION = "0.1.0" as const;

export type PrefabSourceReference = {
  sceneId: string;
  rootEntityIds: string[];
};

export type PrefabImportMetadata = {
  sourceFormat: "unity-yaml";
  sourceName: string;
  sourcePath: string;
  sourceHash: string;
  /** Unity class IDs retained as an audit trail even when Studio has no peer. */
  componentClassCounts: Record<string, number>;
  unsupportedComponentClassIds: string[];
  /** Scripts are intentionally data-only; Studio never translates C# to JS. */
  csharpConversion: "not-attempted";
};

export type PrefabDocument = {
  schemaVersion: typeof PREFAB_DOCUMENT_SCHEMA_VERSION;
  prefabId: string;
  name: string;
  source: PrefabSourceReference;
  importMetadata?: PrefabImportMetadata;
  rootEntityIds: string[];
  entities: Record<string, SceneEntity>;
};

export type AssetReferenceCollection = {
  geometryAssetIds: string[];
  materialAssetIds: string[];
  textureAssetIds: string[];
  particleAssetIds: string[];
  prefabAssetIds: string[];
  xriftAssetIds: string[];
};

export type CreatePrefabDocumentInput = {
  prefabId: string;
  name: string;
  sourceRootEntityIds: string[];
  generateId?: DocumentIdGenerator;
};

export type CreatePrefabDocumentResult = {
  document: PrefabDocument;
  references: AssetReferenceCollection;
};

export function createPrefabDocument(
  scene: SceneDocument,
  assets: AssetManifest,
  input: CreatePrefabDocumentInput,
): CreatePrefabDocumentResult | null {
  const prefabId = input.prefabId.trim();
  const name = input.name.trim();
  if (!prefabId || !name || input.sourceRootEntityIds.length === 0) return null;

  const generateId: DocumentIdGenerator =
    input.generateId ??
    ((kind, sourceId) => `${prefabId}/${kind}/${sourceId}`);
  const clone = cloneEntityHierarchy(
    scene,
    input.sourceRootEntityIds,
    generateId,
  );
  if (!clone || clone.rootEntityIds.length === 0) return null;

  return {
    document: {
      schemaVersion: PREFAB_DOCUMENT_SCHEMA_VERSION,
      prefabId,
      name,
      source: {
        sceneId: scene.sceneId,
        rootEntityIds: [...input.sourceRootEntityIds],
      },
      rootEntityIds: [...clone.rootEntityIds],
      entities: clone.entities,
    },
    references: collectSceneAssetReferences(
      scene,
      assets,
      input.sourceRootEntityIds,
    ),
  };
}

export function createPrefabAsset(
  id: string,
  name: string,
  prefabPath: string,
): PrefabAsset | null {
  const normalizedId = id.trim();
  const normalizedName = name.trim();
  const normalizedPath = normalizeProjectRelativePath(prefabPath);
  if (!normalizedId || !normalizedName || !normalizedPath) return null;
  return {
    id: normalizedId,
    name: normalizedName,
    kind: "template",
    status: "ready",
    source: { kind: "project", relativePath: normalizedPath },
    thumbnail: { status: "missing" },
    templateType: "prefab",
    templatePath: normalizedPath,
    prefabPath: normalizedPath,
  };
}

export function addPrefabAsset(
  manifest: AssetManifest,
  input: { id: string; name: string; prefabPath: string },
): AddAssetResult {
  const asset = createPrefabAsset(input.id, input.name, input.prefabPath);
  if (!asset) {
    return {
      manifest,
      assetId: input.id,
      added: false,
      reason: "invalid-input",
    };
  }
  if (manifest.assets[asset.id]) {
    return {
      manifest,
      assetId: asset.id,
      added: false,
      reason: "duplicate-id",
    };
  }
  return {
    manifest: {
      ...manifest,
      assets: { ...manifest.assets, [asset.id]: asset },
    },
    assetId: asset.id,
    added: true,
  };
}

export function createPrefabInstanceComponent(
  id: string,
  prefabAssetId: string,
  sourceEntityId: string,
): PrefabInstanceComponent | null {
  const normalizedId = id.trim();
  const normalizedPrefabAssetId = prefabAssetId.trim();
  const normalizedSourceEntityId = sourceEntityId.trim();
  if (!normalizedId || !normalizedPrefabAssetId || !normalizedSourceEntityId) {
    return null;
  }
  return {
    id: normalizedId,
    type: "prefab-instance",
    enabled: true,
    prefabAssetId: normalizedPrefabAssetId,
    sourceEntityId: normalizedSourceEntityId,
  };
}

export function collectSceneAssetReferences(
  scene: SceneDocument,
  assets: AssetManifest,
  rootEntityIds: string[] = scene.rootEntityIds,
): AssetReferenceCollection {
  const geometry = new Set<string>();
  const materials = new Set<string>();
  const textures = new Set<string>();
  const particles = new Set<string>();
  const prefabs = new Set<string>();
  const xrift = new Set<string>();
  const visited = new Set<string>();

  const visit = (entityId: string) => {
    if (visited.has(entityId)) return;
    const entity = scene.entities[entityId];
    if (!entity) return;
    visited.add(entityId);

    for (const sceneComponent of entity.components) {
      const component = sceneComponent as RegisteredSceneComponent;
      if (component.type === "mesh") {
        if (component.geometry?.kind === "asset") {
          geometry.add(component.geometry.assetId);
        } else if (!component.geometry) {
          geometry.add(component.geometryAssetId);
        }
        component.materialBindings.forEach((binding) =>
          materials.add(binding.materialAssetId),
        );
      } else if (component.type === "particle-emitter") {
        particles.add(component.particleAssetId);
      } else if (component.type === "prefab-instance") {
        prefabs.add(component.prefabAssetId);
      } else if (component.type === "xrift-component") {
        component.assetReferences.forEach((assetId) => xrift.add(assetId));
      }
    }
    entity.children.forEach(visit);
  };
  rootEntityIds.forEach(visit);

  materials.forEach((materialAssetId) => {
    const asset = assets.assets[materialAssetId];
    if (asset?.kind !== "material") return;
    collectMaterialTextureReferences(
      normalizeMaterialProperties(
        asset.properties as unknown as Parameters<
          typeof normalizeMaterialProperties
        >[0],
      ),
      textures,
    );
  });

  return {
    geometryAssetIds: [...geometry].sort(),
    materialAssetIds: [...materials].sort(),
    textureAssetIds: [...textures].sort(),
    particleAssetIds: [...particles].sort(),
    prefabAssetIds: [...prefabs].sort(),
    xriftAssetIds: [...xrift].sort(),
  };
}

function collectMaterialTextureReferences(
  properties: MaterialProperties,
  output: Set<string>,
): void {
  const pbr = properties.pbrMetallicRoughness;
  [
    pbr.baseColorTexture,
    pbr.metallicRoughnessTexture,
    properties.normalTexture,
    properties.occlusionTexture,
    properties.emissiveTexture,
    properties.extensions.KHR_materials_iridescence?.iridescenceTexture,
    properties.extensions.KHR_materials_iridescence
      ?.iridescenceThicknessTexture,
  ].forEach((info) => {
    if (info) output.add(info.textureAssetId);
  });
}
