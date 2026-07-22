import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import {
  getMaterialAsset,
  type AssetManifest,
  type ModelAsset,
  type ModelNodeMetadata,
} from "./asset-manifest";
import {
  createMeshColliderComponent,
  createMeshComponent,
  createTransformComponent,
  getTransform,
  updateEntityTransform,
  type MaterialBinding,
  type MeshComponent,
  type SceneDocument,
  type SceneEntity,
  type TransformPatch,
  type Vec3,
} from "./scene-document";

type JsonRecord = Record<string, unknown>;

/** Extracts the selected glTF scene's nodes in stable source-index order. */
export function extractGltfModelNodeHierarchy(value: unknown): ModelNodeMetadata[] {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return [];
  const nodes = value.nodes;
  const meshes = Array.isArray(value.meshes) ? value.meshes : [];
  const skins = Array.isArray(value.skins) ? value.skins : [];
  const hierarchy = selectedSceneNodeHierarchy(value, nodes);
  const includedNodeIndices = hierarchy.includedNodeIndices;
  const jointNodeIndices = new Set(
    skins.flatMap((skin) =>
      isRecord(skin) ? validChildIndices(skin.joints, nodes.length) : [],
    ),
  );

  return nodes.flatMap((candidate, sourceNodeIndex) => {
    if (!includedNodeIndices.has(sourceNodeIndex)) return [];
    const node = isRecord(candidate) ? candidate : {};
    const meshIndex = integerIndex(node.mesh, meshes.length);
    const skinIndex = integerIndex(node.skin, skins.length);
    const mesh = meshIndex === undefined ? undefined : meshes[meshIndex];
    const sourceMaterialIndices = isRecord(mesh) && Array.isArray(mesh.primitives)
      ? [
          ...new Set(
            mesh.primitives.flatMap((primitive) => {
              if (!isRecord(primitive)) return [];
              const materialIndex = integerIndex(primitive.material);
              return materialIndex === undefined ? [] : [materialIndex];
            }),
          ),
        ]
      : [];
    const childSourceNodeIndices =
      hierarchy.childNodeIndicesByParent.get(sourceNodeIndex) ?? [];
    return [{
      sourceNodeIndex,
      name: modelNodeName(node.name, sourceNodeIndex),
      ...(hierarchy.parentByNodeIndex.has(sourceNodeIndex)
        ? {
            parentSourceNodeIndex:
              hierarchy.parentByNodeIndex.get(sourceNodeIndex),
          }
        : {}),
      childSourceNodeIndices,
      ...(meshIndex === undefined ? {} : { meshIndex }),
      ...(skinIndex === undefined ? {} : { skinIndex }),
      ...(jointNodeIndices.has(sourceNodeIndex) ? { isBone: true } : {}),
      sourceMaterialIndices,
      ...modelNodeTransform(node),
    }];
  });
}

export function getModelNodeHierarchy(asset: ModelAsset): readonly ModelNodeMetadata[] {
  // OpenBrush keeps normalized brush names for documents imported before the
  // generic Model hierarchy contract was introduced.
  const openBrushNodes = asset.importMetadata?.openBrush?.nodes;
  return openBrushNodes?.length
    ? openBrushNodes
    : asset.importMetadata?.nodes ?? [];
}

export function hasModelNodeHierarchy(asset: ModelAsset): boolean {
  return getModelNodeHierarchy(asset).length > 0;
}

/**
 * Replaces a whole-Model Mesh with one shared-source Entity per glTF node.
 * The source bytes stay in one Model Asset; child Meshes select sourceNodeIndex.
 */
export function expandModelEntityHierarchy(
  scene: SceneDocument,
  assets: AssetManifest,
  asset: ModelAsset,
  rootEntityId: string,
): SceneDocument {
  const root = scene.entities[rootEntityId];
  const nodes = getModelNodeHierarchy(asset);
  if (!root || nodes.length === 0) return scene;

  const keepsSharedModel = nodes.some(
    (node) => node.isBone || node.skinIndex !== undefined,
  ) || Boolean(asset.importMetadata?.animations.length);

  const kind = asset.importMetadata?.openBrush?.nodes?.length ? "openbrush" : "model";
  const generatedPrefix = `${rootEntityId}-${kind}-node-`;
  const nodeId = (sourceNodeIndex: number) =>
    `${generatedPrefix}${sourceNodeIndex}`;
  const nodeIndices = new Set(nodes.map((node) => node.sourceNodeIndex));
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
    components: keepsSharedModel
      ? root.components
      : root.components.filter(
          (component) =>
            component.type !== "mesh" && component.type !== "collider",
        ),
  };

  for (const node of nodes) {
    const entityId = nodeId(node.sourceNodeIndex);
    const parentId =
      node.parentSourceNodeIndex !== undefined &&
      nodeIndices.has(node.parentSourceNodeIndex)
        ? nodeId(node.parentSourceNodeIndex)
        : rootEntityId;
    const isGeneratedRoot = parentId === rootEntityId;
    const importScale = Number.isFinite(asset.importSettings.scale)
      ? asset.importSettings.scale
      : 1;
    const position = node.position.map((value) =>
      isGeneratedRoot ? value * importScale : value,
    ) as [number, number, number];
    const rotation = [...node.rotation] as [number, number, number];
    const scale = node.scale.map((value) =>
      isGeneratedRoot ? value * importScale : value,
    ) as [number, number, number];
    const components: SceneEntity["components"] = [
      createTransformComponent(
        `${entityId}-transform`,
        position,
        rotation,
        scale,
      ),
    ];
    if (!keepsSharedModel && node.meshIndex !== undefined) {
      components.push(
        createMeshComponent(
          `${entityId}-mesh`,
          asset.id,
          nodeMaterialBindings(asset, assets, node.sourceMaterialIndices),
          {
            castShadow: true,
            receiveShadow: true,
            sourceNodeIndex: node.sourceNodeIndex,
          },
        ),
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
      ...(keepsSharedModel
        ? {
            modelNode: {
              modelEntityId: rootEntityId,
              modelAssetId: asset.id,
              sourceNodeIndex: node.sourceNodeIndex,
              nodeType: node.isBone
                ? "bone" as const
                : node.skinIndex !== undefined
                  ? "skinned-mesh" as const
                  : node.meshIndex !== undefined
                    ? "mesh" as const
                    : "node" as const,
              sourceMaterialIndices: [...node.sourceMaterialIndices],
              restPosition: position,
              restRotation: rotation,
              restScale: scale,
              ...(isGeneratedRoot && importScale !== 1
                ? { rootImportScale: importScale }
                : {}),
            },
          }
        : {}),
    };
  }

  return { ...scene, entities };
}

/**
 * Updates an expanded Model node and mirrors its local offset to the shared
 * Mesh pose so Skin, Animation, and one source Model remain intact.
 */
export function updateModelNodeEntityTransform(
  scene: SceneDocument,
  entityId: string,
  patch: TransformPatch,
): SceneDocument {
  const nextScene = updateEntityTransform(scene, entityId, patch);
  if (nextScene === scene) return scene;
  const entity = nextScene.entities[entityId];
  const modelNode = entity?.modelNode;
  const transform = entity ? getTransform(entity) : undefined;
  if (!modelNode || !transform) return nextScene;
  const modelEntity = nextScene.entities[modelNode.modelEntityId];
  const mesh = modelEntity?.components.find(
    (component): component is MeshComponent => component.type === "mesh",
  );
  if (!modelEntity || !mesh) return nextScene;

  const rootScale = modelNode.rootImportScale ?? 1;
  const offset = {
    position: transform.position.map(
      (value, index) =>
        (value - modelNode.restPosition[index]) / rootScale,
    ) as Vec3,
    rotation: transform.rotation.map(
      (value, index) => value - modelNode.restRotation[index],
    ) as Vec3,
    scale: transform.scale.map((value, index) =>
      value / modelNode.restScale[index],
    ) as Vec3,
  };
  const nodes = { ...(mesh.modelPose?.nodes ?? {}) };
  const key = String(modelNode.sourceNodeIndex);
  if (isIdentityNodeOffset(offset.position, offset.rotation, offset.scale)) {
    delete nodes[key];
  } else {
    nodes[key] = offset;
  }
  const modelPose = {
    bones: { ...(mesh.modelPose?.bones ?? {}) },
    morphTargets: { ...(mesh.modelPose?.morphTargets ?? {}) },
    ...(Object.keys(nodes).length > 0 ? { nodes } : {}),
  };
  const components = modelEntity.components.map((component) =>
    component.id === mesh.id && component.type === "mesh"
      ? { ...component, modelPose }
      : component,
  );
  return {
    ...nextScene,
    entities: {
      ...nextScene.entities,
      [modelEntity.id]: { ...modelEntity, components },
    },
  };
}

function isIdentityNodeOffset(
  position: Vec3,
  rotation: Vec3,
  scale: Vec3,
): boolean {
  const epsilon = 1e-7;
  return (
    position.every((value) => Math.abs(value) < epsilon) &&
    rotation.every((value) => Math.abs(value) < epsilon) &&
    scale.every((value) => Math.abs(value - 1) < epsilon)
  );
}

type SelectedSceneNodeHierarchy = {
  includedNodeIndices: Set<number>;
  parentByNodeIndex: Map<number, number>;
  childNodeIndicesByParent: Map<number, number[]>;
};

function selectedSceneNodeHierarchy(
  document: JsonRecord,
  nodes: readonly unknown[],
): SelectedSceneNodeHierarchy {
  const scenes = Array.isArray(document.scenes) ? document.scenes : [];
  const sceneIndex = integerIndex(document.scene, scenes.length) ??
    (scenes.length > 0 ? 0 : undefined);
  const scene = sceneIndex === undefined ? undefined : scenes[sceneIndex];
  const roots = isRecord(scene)
    ? validChildIndices(scene.nodes, nodes.length)
    : parentlessNodeIndices(nodes);
  const includedNodeIndices = new Set<number>(roots);
  const parentByNodeIndex = new Map<number, number>();
  const childNodeIndicesByParent = new Map<number, number[]>();
  const pending = [...roots];
  while (pending.length > 0) {
    const parentIndex = pending.shift()!;
    const parent = nodes[parentIndex];
    if (!isRecord(parent)) continue;
    for (const childIndex of validChildIndices(parent.children, nodes.length)) {
      // A valid glTF is a tree. For malformed files, keep the first reachable
      // owner and discard duplicate/cyclic edges before they reach Scene IR.
      if (includedNodeIndices.has(childIndex)) continue;
      includedNodeIndices.add(childIndex);
      parentByNodeIndex.set(childIndex, parentIndex);
      const children = childNodeIndicesByParent.get(parentIndex) ?? [];
      children.push(childIndex);
      childNodeIndicesByParent.set(parentIndex, children);
      pending.push(childIndex);
    }
  }
  return {
    includedNodeIndices,
    parentByNodeIndex,
    childNodeIndicesByParent,
  };
}

function parentlessNodeIndices(nodes: readonly unknown[]): number[] {
  const children = new Set<number>();
  nodes.forEach((candidate) => {
    if (!isRecord(candidate)) return;
    validChildIndices(candidate.children, nodes.length).forEach((index) =>
      children.add(index),
    );
  });
  return nodes.flatMap((_, index) => children.has(index) ? [] : [index]);
}

function nodeMaterialBindings(
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
    return [{ slot: slot.slot, materialAssetId: slot.defaultMaterialAssetId }];
  });
}

function modelNodeTransform(node: JsonRecord): Pick<
  ModelNodeMetadata,
  "position" | "rotation" | "scale"
> {
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3(1, 1, 1);
  const matrix = finiteNumberArray(node.matrix, 16);
  if (matrix) {
    new Matrix4().fromArray(matrix).decompose(position, quaternion, scale);
  } else {
    const translation = finiteNumberArray(node.translation, 3);
    const sourceRotation = finiteNumberArray(node.rotation, 4);
    const sourceScale = finiteNumberArray(node.scale, 3);
    if (translation) position.fromArray(translation);
    if (sourceRotation) quaternion.fromArray(sourceRotation).normalize();
    if (sourceScale) scale.fromArray(sourceScale);
  }
  const euler = new Euler().setFromQuaternion(quaternion, "XYZ");
  return {
    position: [position.x, position.y, position.z],
    rotation: [euler.x, euler.y, euler.z],
    scale: [scale.x, scale.y, scale.z],
  };
}

function modelNodeName(value: unknown, index: number): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : `Node ${index + 1}`;
}

function validChildIndices(value: unknown, upperBound: number): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((entry) => {
    const index = integerIndex(entry, upperBound);
    return index === undefined ? [] : [index];
  }))];
}

function integerIndex(value: unknown, upperBound?: number): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return undefined;
  }
  return upperBound !== undefined && value >= upperBound ? undefined : value;
}

function finiteNumberArray(value: unknown, length: number): number[] | undefined {
  return Array.isArray(value) &&
    value.length === length &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    ? value
    : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
