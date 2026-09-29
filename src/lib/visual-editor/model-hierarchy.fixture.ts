import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  type AssetManifest,
  type ModelAsset,
} from "./asset-manifest";
import { instantiateSceneAsset } from "./asset-placement";
import { addEditorComponent } from "./editor-session";
import {
  extractGltfModelNodeHierarchy,
  getModelNodeBoneRotationDelta,
  getModelNodeTransformOffset,
  hasModelNodeHierarchy,
  reconcileModelNodeCoordinatesInEntities,
  reconcileModelNodeEnabledInEntities,
  updateModelNodeEntityEnabled,
  updateModelNodeEntityTransform,
} from "./model-hierarchy";
import { SCENE_DOCUMENT_SCHEMA_VERSION, getTransform, updateEntityTransform, type ModelNodeTransformOffset, type SceneDocument, type Vec3 } from "./scene-document";
import { Euler, Matrix3, Matrix4, Quaternion, Vector3 } from "three";
import { hierarchyWorldMatrix } from "./hierarchy-transform";
import { createPrototypeProject } from "./prototype-project";
import { parseVisualProjectFiles, serializeVisualProjectDocuments } from "./persistence";
import { createPrefabAsset, createPrefabDocument } from "./prefab-document";
import { sceneDocumentCodec } from "./serialization";

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
  assertVrm0NodeCoordinates(avatar);
}

function assertVrm0NodeCoordinates(avatar: ModelAsset): void {
  const sourcePosition: Vec3 = [1, 2, 3];
  const sourceRotation: Vec3 = [3 * Math.PI, 0.25, -2 * Math.PI];
  const sourceScale: Vec3 = [2, 3, 4];
  const nodes = avatar.importMetadata!.nodes!.map(node => node.sourceNodeIndex === 0
    ? { ...node, position: sourcePosition, rotation: sourceRotation, scale: sourceScale }
    : { ...node, position: [0.2, 0.3, 0.4] as Vec3 });
  const rootTransform = { position: [5, 6, 7] as Vec3, rotation: [0.2, 0.3, -0.1] as Vec3, scale: [1.5, 0.75, 2] as Vec3 };
  let legacyScene: SceneDocument | undefined;
  let legacyRootId = "";
  let legacyNodeId = "";
  let vrm0Manifest: AssetManifest | undefined;
  for (const version of ["0", "1"] as const) {
    const model: ModelAsset = { ...avatar, source: { kind: "project", relativePath: "assets/coordinate-avatar.vrm" }, importMetadata: { ...avatar.importMetadata!, vrmVersion: version, nodes } };
    const manifest: AssetManifest = { schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION, assets: { [model.id]: model } };
    const placed = instantiateSceneAsset({ schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION, sceneId: "coordinate-scene", name: "Coordinate fixture", rootEntityIds: [], entities: {} }, manifest, {}, model.id);
    assert(placed.placed, "VRM coordinate fixture must place a shared avatar");
    const scene = updateEntityTransform(placed.scene, placed.entityId, rootTransform);
    const root = scene.entities[placed.entityId];
    const node = scene.entities[root.children[0]];
    const child = scene.entities[node.children[0]];
    const metadata = node.modelNode;
    assert(metadata, "VRM root node must retain its source metadata");
    assert(metadata.rootVrm0Rotation === (version === "0" ? true : undefined) && child.modelNode?.rootVrm0Rotation === undefined, "Only VRM 0.x proxy roots should include its scene orientation");
    const nativeParent = matrix(rootTransform).multiply(new Matrix4().makeRotationY(version === "0" ? Math.PI : 0)).scale(new Vector3().setScalar(model.importSettings.scale));
    const expectedRoot = nativeParent.clone().multiply(matrix({ position: sourcePosition, rotation: sourceRotation, scale: sourceScale }));
    assertNear(hierarchyWorldMatrix(scene, node.id), expectedRoot.elements, "Imported root Euler turns, orientation and import scale must match the native VRM matrix");
    assertNear(hierarchyWorldMatrix(scene, child.id), expectedRoot.clone().multiply(matrix(nodes[1])).elements, "Nested bone axes must inherit the VRM scene correction once");
    const transform = getTransform(node)!;
    const displayedEdit = {
      position: transform.position.map((value, index) => value + [0.02, 0.03, -0.04][index]) as Vec3,
      rotation: transform.rotation.map((value, index) => value + [0.1, 0.2, 0.3][index]) as Vec3,
      scale: transform.scale.map((value, index) => value * [0.8, 1.2, 1.5][index]) as Vec3,
    };
    const offset = getModelNodeTransformOffset(metadata, displayedEdit);
    assertNear(offset.position, version === "0" ? [-2, 3, 4] : [2, 3, -4], "Displayed root position must map back to source coordinates through its import scale");
    assertNear(offset.rotation, version === "0" ? [-0.1, 0.2, 0.3] : [0.1, 0.2, 0.3], "Displayed root rotation must map back without canonicalizing stored Euler turns");
    assertNear(offset.scale, [0.8, 1.2, 1.5], "Coordinate conversion must preserve each scale ratio");
    const boneRotation: Vec3 = [0.2, -0.3, 0.4];
    const boneDisplayDelta = getModelNodeBoneRotationDelta(metadata, boneRotation);
    assertNear(boneDisplayDelta, version === "0" ? [-0.2, -0.3, 0.4] : boneRotation, "Existing Bone rotation must use the displayed root's Euler basis");
    assertNear(getModelNodeBoneRotationDelta(child.modelNode!, boneRotation), boneRotation, "Nested Bone rotation must not receive the root correction again");
    const displayedBoneEdit = { ...displayedEdit, rotation: displayedEdit.rotation.map((value, index) => value + boneDisplayDelta[index]) as Vec3 };
    const displayedBoneRest = { ...metadata, restRotation: metadata.restRotation.map((value, index) => value + boneDisplayDelta[index]) as Vec3 };
    const boneAdjustedOffset = getModelNodeTransformOffset(displayedBoneRest, displayedBoneEdit);
    assertNear(boneAdjustedOffset.rotation, offset.rotation, "Subtracting the displayed Bone delta must not record it again in the node pose");
    const sourceBoneEdit = withOffset(nodes[0], offset);
    sourceBoneEdit.rotation = sourceBoneEdit.rotation.map((value, index) => value + boneRotation[index]) as Vec3;
    assertNear(matrix(displayedBoneEdit).elements, new Matrix4().makeRotationY(version === "0" ? Math.PI : 0).scale(new Vector3().setScalar(model.importSettings.scale)).multiply(matrix(sourceBoneEdit)).elements, "Displayed Bone pose plus node edit must match the native source orientation");
    const edited = updateModelNodeEntityTransform(scene, node.id, displayedEdit);
    const editedMesh = edited.entities[root.id].components.find(component => component.type === "mesh");
    assert(editedMesh?.type === "mesh" && editedMesh.modelPose?.nodes?.["0"], "Node edits must persist one source offset");
    assertNear(editedMesh.modelPose.nodes["0"].position, offset.position, "Commit and live preview must use the same source coordinate function");
    assertNear(hierarchyWorldMatrix(edited, node.id), nativeParent.clone().multiply(matrix(withOffset(nodes[0], offset))).elements, "Edited proxy and source-pose matrices must remain equal");
    for (const axis of [0, 1, 2]) {
      const worldDelta = new Vector3().setComponent(axis, 0.03);
      const localDelta = worldDelta.clone().applyMatrix3(new Matrix3().setFromMatrix4(matrix(rootTransform).invert()));
      const globalEdit = { ...transform, position: new Vector3(...transform.position).add(localDelta).toArray() as Vec3 };
      const globalOffset = getModelNodeTransformOffset(metadata, globalEdit);
      const sourceWorld = nativeParent.clone().multiply(matrix(withOffset(nodes[0], globalOffset)));
      assertNear(new Vector3().setFromMatrixPosition(sourceWorld).toArray(), new Vector3().setFromMatrixPosition(expectedRoot).add(worldDelta).toArray(), "World gizmo direction must agree on each axis under a rotated nonuniform parent");
    }
    if (version === "0") vrm0Manifest = manifest;
    else { legacyScene = edited; legacyRootId = root.id; legacyNodeId = node.id; }
  }
  assert(legacyScene && vrm0Manifest, "Legacy coordinate fixture must retain both versions");
  const owner = legacyScene.entities[legacyRootId];
  const mesh = owner.components.find(component => component.type === "mesh");
  assert(mesh?.type === "mesh" && mesh.modelPose, "Legacy fixture must store a source pose");
  const storedPose = { ...mesh.modelPose, bones: { Hips: [0.2, -0.3, 0.4] as Vec3 }, morphTargets: { Smile: 0.65 }, nodes: { ...mesh.modelPose.nodes, "0": { ...mesh.modelPose.nodes!["0"], visible: false } } };
  legacyScene = { ...legacyScene, entities: { ...legacyScene.entities, [owner.id]: { ...owner, components: owner.components.map(component => component.id === mesh.id ? { ...mesh, modelPose: storedPose } : component) } } };
  const savedOwner = legacyScene.entities[owner.id];
  const savedPoseJson = JSON.stringify(storedPose);
  const reconciled = reconcileModelNodeCoordinatesInEntities(legacyScene.entities, vrm0Manifest);
  assert(reconciled.reconciled === 1 && reconciled.entities[owner.id] === savedOwner, "Migration must change proxy roots while retaining the rendered model and pose reference");
  const corrected = reconciled.entities[legacyNodeId];
  assert(corrected.modelNode?.rootVrm0Rotation, "Migration must record the corrected VRM root basis");
  const correctedOffset = getModelNodeTransformOffset(corrected.modelNode, getTransform(corrected)!);
  assertNear(correctedOffset.position, storedPose.nodes["0"].position, "Migration must retain saved source position offsets");
  assertNear(correctedOffset.rotation, storedPose.nodes["0"].rotation, "Migration must retain saved source rotation offsets");
  assertNear(correctedOffset.scale, storedPose.nodes["0"].scale, "Migration must retain saved source scale offsets");
  const again = reconcileModelNodeCoordinatesInEntities(reconciled.entities, vrm0Manifest);
  assert(again.reconciled === 0 && again.entities === reconciled.entities, "Coordinate migration must be idempotent");
  const decoded = sceneDocumentCodec.parse(sceneDocumentCodec.serialize({ ...legacyScene, entities: reconciled.entities }));
  assert(decoded.ok && decoded.document.entities[legacyNodeId].modelNode?.rootVrm0Rotation, "Corrected root metadata must survive scene codecs");

  const prototype = createPrototypeProject("world", "vrm-coordinate-migration");
  const scene = { ...legacyScene, sceneId: prototype.scene.sceneId };
  const prefab = createPrefabDocument(scene, vrm0Manifest, { prefabId: "coordinate-prefab", name: "Coordinate prefab", sourceRootEntityIds: [owner.id] });
  assert(prefab, "Migration fixture must preserve a prefab snapshot");
  const prefabAsset = createPrefabAsset("coordinate-prefab-asset", "Coordinate prefab", "prefabs/coordinate-prefab.prefab.json");
  assert(prefabAsset, "Migration fixture must create a prefab asset");
  const files = serializeVisualProjectDocuments({ project: prototype.project, assets: { ...prototype.assets, assets: { ...prototype.assets.assets, ...vrm0Manifest.assets, [prefabAsset.id]: prefabAsset } }, scenes: { [scene.sceneId]: scene }, prefabs: { [prefab.document.prefabId]: prefab.document } });
  const opened = parseVisualProjectFiles(files);
  assert(opened.scenes[scene.sceneId].entities[legacyNodeId].modelNode?.rootVrm0Rotation, "Opening a saved Scene must reconcile its old VRM coordinate basis");
  assert(Object.values(opened.prefabs[prefab.document.prefabId].entities).some(entity => entity.modelNode?.rootVrm0Rotation), "Opening a saved Prefab must reconcile its old VRM coordinate basis");
  const openedMesh = opened.scenes[scene.sceneId].entities[owner.id].components.find(component => component.type === "mesh");
  assert(openedMesh?.type === "mesh" && JSON.stringify(openedMesh.modelPose) === savedPoseJson, "Opening must preserve source pose, bone rotations, morphs and visibility exactly");
  const correctedFiles = serializeVisualProjectDocuments(opened);
  const reopened = parseVisualProjectFiles(correctedFiles);
  assert(JSON.stringify(serializeVisualProjectDocuments(reopened)) === JSON.stringify(correctedFiles), "Saving and reopening corrected documents must not rotate proxies a second time");
}

function matrix(transform: { position: Vec3; rotation: Vec3; scale: Vec3 }): Matrix4 {
  return new Matrix4().compose(new Vector3(...transform.position), new Quaternion().setFromEuler(new Euler(...transform.rotation, "XYZ")), new Vector3(...transform.scale));
}

function withOffset(transform: { position: Vec3; rotation: Vec3; scale: Vec3 }, offset: ModelNodeTransformOffset): { position: Vec3; rotation: Vec3; scale: Vec3 } {
  return {
    position: transform.position.map((value, index) => value + offset.position[index]) as Vec3,
    rotation: transform.rotation.map((value, index) => value + offset.rotation[index]) as Vec3,
    scale: transform.scale.map((value, index) => value * offset.scale[index]) as Vec3,
  };
}

function assertNear(actual: readonly number[], expected: readonly number[], message: string): void {
  assert(actual.length === expected.length && actual.every((value, index) => Math.abs(value - expected[index]) < 1e-7), message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Model hierarchy fixture failed: ${message}`);
}
