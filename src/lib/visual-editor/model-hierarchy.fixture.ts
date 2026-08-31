import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  type AssetManifest,
  type ModelAsset,
} from "./asset-manifest";
import { instantiateSceneAsset } from "./asset-placement";
import { addEditorComponent } from "./editor-session";
import {
  extractGltfModelNodeHierarchy,
  hasModelNodeHierarchy,
  reconcileModelNodeEnabledInEntities,
  updateModelNodeEntityEnabled,
  updateModelNodeEntityTransform,
} from "./model-hierarchy";
import { SCENE_DOCUMENT_SCHEMA_VERSION } from "./scene-document";

export function runModelHierarchyFixtureAssertions(): void {
  const nodes = extractGltfModelNodeHierarchy({
    scene: 0,
    scenes: [{ nodes: [0] }, { nodes: [2] }],
    meshes: [{ primitives: [{ material: 0, attributes: { POSITION: 0 } }] }],
    accessors: [{ min: [-1, 0, -2], max: [3, 4, 5] }],
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
  assert(
    JSON.stringify(nodes[1]?.bounds) ===
      JSON.stringify({ min: [-1, 0, -2], max: [3, 4, 5] }) &&
      nodes[0]?.bounds === undefined,
    "Node bounds must come from the POSITION accessor of the node's own mesh",
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
    meshes: [{ primitives: [{ material: 0, attributes: { POSITION: 0 } }] }],
    accessors: [{ min: [-0.5, 0, -0.5], max: [0.5, 2, 0.5] }],
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

  const hiddenAvatarScene = updateModelNodeEntityEnabled(
    posedAvatarScene,
    hipsNode.id,
    false,
  );
  const hiddenMesh = hiddenAvatarScene.entities[avatarRoot.id]?.components.find(
    (component) => component.type === "mesh",
  );
  assert(
    hiddenAvatarScene.entities[hipsNode.id]?.enabled === false &&
      hiddenMesh?.type === "mesh" &&
      hiddenMesh.modelPose?.nodes?.["1"]?.visible === false &&
      JSON.stringify(hiddenMesh.modelPose?.nodes?.["1"]?.rotation) ===
        JSON.stringify([0.1, 0.2, 0.3]),
    "Disabling a shared Model node must hide it in the pose and keep its offset",
  );
  const identityHiddenScene = updateModelNodeEntityTransform(
    hiddenAvatarScene,
    hipsNode.id,
    { rotation: [0, 0, 0] },
  );
  const identityHiddenMesh = identityHiddenScene.entities[
    avatarRoot.id
  ]?.components.find((component) => component.type === "mesh");
  assert(
    identityHiddenMesh?.type === "mesh" &&
      identityHiddenMesh.modelPose?.nodes?.["1"]?.visible === false,
    "Returning a hidden node to its rest Transform must keep it hidden",
  );
  const shownAvatarScene = updateModelNodeEntityEnabled(
    identityHiddenScene,
    hipsNode.id,
    true,
  );
  const shownMesh = shownAvatarScene.entities[avatarRoot.id]?.components.find(
    (component) => component.type === "mesh",
  );
  assert(
    shownAvatarScene.entities[hipsNode.id]?.enabled === true &&
      shownMesh?.type === "mesh" &&
      shownMesh.modelPose?.nodes?.["1"] === undefined,
    "Re-enabling a rest-posed node must remove its pose entry entirely",
  );

  // Documents written before node visibility existed saved enabled: false on
  // nodes that kept rendering. Opening realigns each flag with the pose.
  const legacyEntities = {
    ...avatarPlacement.scene.entities,
    [bodyNode.id]: {
      ...avatarPlacement.scene.entities[bodyNode.id],
      enabled: false,
    },
  };
  const reconciled = reconcileModelNodeEnabledInEntities(legacyEntities);
  assert(
    reconciled.reconciled === 1 &&
      reconciled.entities[bodyNode.id]?.enabled === true,
    "Opening must realign a stale disabled flag with the visible pose",
  );
  const agreed = reconcileModelNodeEnabledInEntities(reconciled.entities);
  assert(
    agreed.entities === reconciled.entities && agreed.reconciled === 0,
    "Reconciliation must return the same object when nothing changes",
  );

  // Per-node colliders: geometry nodes accept them, bare bones do not, and
  // the box variant fits itself to the node bounds recorded at import.
  const meshColliderAdd = addEditorComponent(
    avatarPlacement.scene,
    avatarManifest,
    bodyNode.id,
    "physics.mesh-collider",
    "world",
  );
  assert(
    meshColliderAdd.added,
    "Mesh Collider must attach to a shared Model geometry node",
  );
  const boneColliderAdd = addEditorComponent(
    avatarPlacement.scene,
    avatarManifest,
    hipsNode.id,
    "physics.mesh-collider",
    "world",
  );
  assert(
    !boneColliderAdd.added && boneColliderAdd.reason === "dependency-missing",
    "Mesh Collider must not attach to a Bone node that names no geometry",
  );
  const boxColliderAdd = addEditorComponent(
    avatarPlacement.scene,
    avatarManifest,
    bodyNode.id,
    "physics.box-collider",
    "world",
  );
  const fittedBox = boxColliderAdd.scene.entities[bodyNode.id]?.components.find(
    (component) => component.type === "collider" && component.shape === "box",
  );
  assert(
    boxColliderAdd.added &&
      fittedBox?.type === "collider" &&
      fittedBox.shape === "box" &&
      fittedBox.fitMode === "auto" &&
      Math.abs(fittedBox.center[1] - 1) < 1e-6 &&
      Math.abs(fittedBox.halfExtents[1] - 1) < 1e-6,
    "Box Collider must auto-fit to the node bounds metadata",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Model hierarchy fixture failed: ${message}`);
}
