import {
  getMaterialAsset,
  type AssetManifest,
  type ModelAsset,
} from "./asset-manifest";
import {
  createMeshColliderComponent,
  createMeshComponent,
  createTransformComponent,
  type MaterialBinding,
  type SceneDocument,
  type SceneEntity,
} from "./scene-document";

export function hasOpenBrushNodeHierarchy(asset: ModelAsset): boolean {
  return Boolean(asset.importMetadata?.openBrush?.nodes?.length);
}

/**
 * Replaces a whole-Model Mesh on `rootEntityId` with one shared-source Mesh
 * Entity per OpenBrush glTF node. No Model bytes are duplicated.
 */
export function expandOpenBrushModelEntityHierarchy(
  scene: SceneDocument,
  assets: AssetManifest,
  asset: ModelAsset,
  rootEntityId: string,
): SceneDocument {
  const root = scene.entities[rootEntityId];
  const nodes = asset.importMetadata?.openBrush?.nodes ?? [];
  if (!root || nodes.length === 0) return scene;

  const nodeId = (sourceNodeIndex: number) =>
    `${rootEntityId}-openbrush-node-${sourceNodeIndex}`;
  const nodeIndices = new Set(nodes.map((node) => node.sourceNodeIndex));
  const generatedPrefix = `${rootEntityId}-openbrush-node-`;
  const entities = Object.fromEntries(
    Object.entries(scene.entities).filter(
      ([entityId]) => !entityId.startsWith(generatedPrefix),
    ),
  );
  const generatedRootIds = nodes
    .filter(
      (node) =>
        node.parentSourceNodeIndex === undefined ||
        !nodeIndices.has(node.parentSourceNodeIndex),
    )
    .map((node) => nodeId(node.sourceNodeIndex));

  entities[rootEntityId] = {
    ...root,
    children: [
      ...root.children.filter((childId) => !childId.startsWith(generatedPrefix)),
      ...generatedRootIds,
    ],
    components: root.components.filter(
      (component) => component.type !== "mesh" && component.type !== "collider",
    ),
  };

  for (const node of nodes) {
    const entityId = nodeId(node.sourceNodeIndex);
    const parentId =
      node.parentSourceNodeIndex !== undefined &&
      nodeIndices.has(node.parentSourceNodeIndex)
        ? nodeId(node.parentSourceNodeIndex)
        : rootEntityId;
    const materialBindings = openBrushNodeMaterialBindings(
      asset,
      assets,
      node.sourceMaterialIndices,
    );
    const components: SceneEntity["components"] = [
      createTransformComponent(
        `${entityId}-transform`,
        [...node.position],
        [...node.rotation],
        [...node.scale],
      ),
    ];
    if (node.meshIndex !== undefined) {
      components.push(
        createMeshComponent(`${entityId}-mesh`, asset.id, materialBindings, {
          castShadow: true,
          receiveShadow: true,
          sourceNodeIndex: node.sourceNodeIndex,
        }),
      );
      if (asset.importSettings.generateColliders) {
        components.push(
          createMeshColliderComponent(`${entityId}-collider`, {
            meshMode: "trimesh",
          }),
        );
      }
    }
    entities[entityId] = {
      id: entityId,
      name: node.name,
      parentId,
      children: node.childSourceNodeIndices
        .filter((childIndex) => nodeIndices.has(childIndex))
        .map(nodeId),
      enabled: true,
      components,
    };
  }

  return { ...scene, entities };
}

function openBrushNodeMaterialBindings(
  asset: ModelAsset,
  assets: AssetManifest,
  sourceMaterialIndices: readonly number[],
): MaterialBinding[] {
  const sourceIndices = new Set(sourceMaterialIndices);
  return asset.materialSlots.flatMap((slot) => {
    if (
      slot.sourceMaterialIndex === undefined ||
      !sourceIndices.has(slot.sourceMaterialIndex) ||
      !slot.defaultMaterialAssetId ||
      !getMaterialAsset(assets, slot.defaultMaterialAssetId)
    ) {
      return [];
    }
    return [
      {
        slot: slot.slot,
        materialAssetId: slot.defaultMaterialAssetId,
      },
    ];
  });
}
