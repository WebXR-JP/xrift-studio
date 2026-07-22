import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  type AssetManifest,
  type ModelAsset,
} from "./asset-manifest";
import { instantiateSceneAsset } from "./asset-placement";
import {
  extractGltfModelNodeHierarchy,
  hasModelNodeHierarchy,
  updateModelNodeEntityTransform,
} from "./model-hierarchy";
import { SCENE_DOCUMENT_SCHEMA_VERSION } from "./scene-document";

export function runModelHierarchyFixtureAssertions(): void {
  const nodes = extractGltfModelNodeHierarchy({
    scene: 0,
    scenes: [{ nodes: [0] }, { nodes: [2] }],
    meshes: [{ primitives: [{ material: 0 }] }],
    nodes: [
      { name: "Ward", children: [1] },
      { name: "nishitoda_5chome", mesh: 0, translation: [1, 2, 3] },
      { name: "Unused scene node", mesh: 0 },
    ],
  });
  assert(nodes.length === 2, "Nodes outside the selected glTF scene were retained");
  assert(
    nodes[1]?.name === "nishitoda_5chome" &&
      nodes[1]?.parentSourceNodeIndex === 0,
    "Selected glTF node hierarchy was not extracted",
  );
  const repairedNodes = extractGltfModelNodeHierarchy({
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { children: [1, 2] },
      { children: [2] },
      { children: [0] },
    ],
  });
  assert(
    repairedNodes[0]?.childSourceNodeIndices.join(",") === "1,2" &&
      repairedNodes[1]?.childSourceNodeIndices.length === 0 &&
      repairedNodes[2]?.childSourceNodeIndices.length === 0 &&
      repairedNodes[2]?.parentSourceNodeIndex === 0,
    "Malformed duplicate or cyclic glTF links reached Model metadata",
  );
  const skinnedNodes = extractGltfModelNodeHierarchy({
    scene: 0,
    scenes: [{ nodes: [0] }],
    skins: [{ joints: [1] }],
    meshes: [{ primitives: [{ material: 0 }] }],
    nodes: [
      { name: "Body", mesh: 0, skin: 0, children: [1] },
      { name: "Hips" },
    ],
  });
  assert(
    skinnedNodes.length === 2 &&
      skinnedNodes[0]?.skinIndex === 0 &&
      skinnedNodes[1]?.isBone === true,
    "Skin and Bone nodes must remain available for Hierarchy authoring",
  );

  const model: ModelAsset = {
    id: "model-hierarchy-fixture",
    name: "Town",
    kind: "model",
    status: "ready",
    source: { kind: "project", relativePath: "assets/town.glb" },
    importSettings: {
      scale: 0.01,
      generateColliders: false,
      optimizeMeshes: false,
      importAnimations: true,
    },
    materialSlots: [],
    importMetadata: {
      sourceFormat: "glb",
      byteLength: 1,
      nodeCount: 3,
      meshCount: 1,
      primitiveCount: 1,
      bounds: {
        min: [0, 0, 0],
        max: [1, 1, 1],
        center: [0.5, 0.5, 0.5],
        size: [1, 1, 1],
        boundingSphereRadius: 1,
      },
      animations: [],
      extensionsUsed: [],
      extensionsRequired: [],
      nodes,
    },
  };
  assert(hasModelNodeHierarchy(model), "Model node hierarchy is missing");
  const manifest: AssetManifest = {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: { [model.id]: model },
  };
  const placement = instantiateSceneAsset(
    {
      schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
      sceneId: "scene-model-hierarchy-fixture",
      name: "Model hierarchy fixture",
      rootEntityIds: [],
      entities: {},
    },
    manifest,
    {},
    model.id,
  );
  assert(placement.placed, "Model hierarchy fixture could not be placed");
  if (!placement.placed) return;
  const placedRoot = placement.scene.entities[placement.entityId];
  const sourceRoot = placement.scene.entities[placedRoot.children[0]];
  const sourceChild = placement.scene.entities[sourceRoot?.children[0]];
  assert(sourceRoot?.name === "Ward", "Model root node was not expanded");
  assert(sourceChild?.name === "nishitoda_5chome", "Model child node was not expanded");
  assert(
    sourceChild?.parentId === sourceRoot.id,
    "Model node parent-child relationship was not retained",
  );
  const sourceRootTransform = sourceRoot.components.find(
    (component) => component.type === "transform",
  );
  const sourceChildTransform = sourceChild.components.find(
    (component) => component.type === "transform",
  );
  assert(
    JSON.stringify(sourceRootTransform?.scale) ===
      JSON.stringify([0.01, 0.01, 0.01]) &&
      JSON.stringify(sourceChildTransform?.position) ===
        JSON.stringify([1, 2, 3]),
    "Model import scale must wrap root geometry and child translations once",
  );
  assert(
    sourceChild.components.some(
      (component) =>
        component.type === "mesh" &&
        component.geometry?.kind === "asset" &&
        component.geometry.sourceNodeIndex === 1,
    ),
    "Expanded Model Mesh did not retain its source node index",
  );

  const avatar: ModelAsset = {
    ...model,
    id: "avatar-hierarchy-fixture",
    name: "Avatar",
    importMetadata: {
      ...model.importMetadata!,
      sourceFormat: "vrm",
      nodeCount: 2,
      nodes: skinnedNodes,
      bones: [{ key: "Hips", name: "Hips", humanoidName: "hips" }],
      vrmVersion: "1",
    },
  };
  const avatarManifest: AssetManifest = {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: { [avatar.id]: avatar },
  };
  const avatarPlacement = instantiateSceneAsset(
    {
      schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
      sceneId: "scene-avatar-hierarchy-fixture",
      name: "Avatar hierarchy fixture",
      rootEntityIds: [],
      entities: {},
    },
    avatarManifest,
    {},
    avatar.id,
  );
  assert(avatarPlacement.placed, "Avatar hierarchy fixture could not be placed");
  if (!avatarPlacement.placed) return;
  const avatarRoot = avatarPlacement.scene.entities[avatarPlacement.entityId];
  const bodyNode = avatarPlacement.scene.entities[avatarRoot.children[0]];
  const hipsNode = avatarPlacement.scene.entities[bodyNode.children[0]];
  assert(
    avatarRoot.components.some((component) => component.type === "mesh") &&
      bodyNode.modelNode?.nodeType === "skinned-mesh" &&
      hipsNode.modelNode?.nodeType === "bone" &&
      !bodyNode.components.some((component) => component.type === "mesh"),
    "Avatar must keep one shared Skin renderer while exposing Mesh and Bone nodes",
  );
  const posedAvatarScene = updateModelNodeEntityTransform(
    avatarPlacement.scene,
    hipsNode.id,
    { rotation: [0.1, 0.2, 0.3] },
  );
  const avatarMesh = posedAvatarScene.entities[avatarRoot.id]?.components.find(
    (component) => component.type === "mesh",
  );
  assert(
    avatarMesh?.type === "mesh" &&
      JSON.stringify(avatarMesh.modelPose?.nodes?.["1"]?.rotation) ===
        JSON.stringify([0.1, 0.2, 0.3]),
    "Bone Entity Transform must update the shared Model pose",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Model hierarchy fixture failed: ${message}`);
}
