import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { ToastProvider } from "../src/components/Toast";
import { VisualEditorPrototype, type VisualEditorMcpProjectBridge } from "../src/components/visual-editor/VisualEditorPrototype";
import { createAssetImportPlan } from "../src/lib/visual-editor/asset-import";
import { instantiateSceneAsset } from "../src/lib/visual-editor/asset-placement";
import { expandModelEntityHierarchy } from "../src/lib/visual-editor/model-hierarchy";
import { createPrototypeProject, type PrototypeVisualProject } from "../src/lib/visual-editor/prototype-project";
import { updateMaterialAsset, type MaterialAsset, type ModelAsset } from "../src/lib/visual-editor/asset-manifest";
import { getTransform } from "../src/lib/visual-editor/scene-document";
import { sceneDocumentCodec, assetManifestCodec } from "../src/lib/visual-editor/serialization";
import { MATERIAL_THUMBNAIL_RENDERER_VERSION } from "../src/lib/visual-editor/material-thumbnail";
import { installReleaseE2EMock } from "../src/release-e2e/mock-tauri";
import { tauri } from "../src/lib/tauri";
import "../src/index.css";

const JOINT_COUNT = 128;
const BRANCH_JOINT_COUNT = 16;
let targetName = "Joint_064";
let bodyName = "SyntheticBody";
let fixtureVersion: "dense" | "0" | "1" = "dense";
const PROJECT_PATH = "C:/XRiftE2E/isolated-skinned-node-edit";
let root: Root | undefined;
let bridge: VisualEditorMcpProjectBridge | null = null;
let saved: PrototypeVisualProject;
let saveCount = 0;
let avatarRootId = "";
let targetEntityId = "";
let targetSourceIndex = -1;
let renderedMesh: THREE.SkinnedMesh | undefined;
let renderedScene: THREE.Scene | undefined;
let renderedCamera: THREE.Camera | undefined;
let renderer: THREE.WebGLRenderer | undefined;
let meshFrames = 0;
let changedModelInstances = 0;
let lastMeshUuid: string | undefined;
let activeControls: TransformControl | undefined;
let activeGizmoPointer: PointerEvent | undefined;

type TransformControl = THREE.Object3D & {
  isTransformControls?: boolean;
  object?: THREE.Object3D;
  axis?: string | null;
  dragging?: boolean;
  dispatchEvent(event: { type: string }): void;
};

const originalBeforeRender = THREE.Mesh.prototype.onBeforeRender;
THREE.Mesh.prototype.onBeforeRender = function (gl, scene, camera, geometry, material, group) {
  if ((this as THREE.SkinnedMesh).isSkinnedMesh && this.name === bodyName) {
    let ancestor: THREE.Object3D | null = this;
    while (ancestor && ancestor.userData.authoringEntityId !== avatarRootId) ancestor = ancestor.parent;
    if (avatarRootId && ancestor) {
      renderedMesh = this as THREE.SkinnedMesh;
      renderedScene = scene;
      renderedCamera = camera;
      renderer = gl;
      meshFrames++;
      if (lastMeshUuid && lastMeshUuid !== this.uuid) changedModelInstances++;
      lastMeshUuid = this.uuid;
    }
  }
  return originalBeforeRender.call(this, gl, scene, camera, geometry, material, group);
};

async function bytesDataUrl(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const array = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([array]));
  });
}

/** Real glTF Skin, 128 joints and roughly 20k vertices; no renderer substitute. */
async function createAvatarBytes(): Promise<ArrayBuffer> {
  const avatar = new THREE.Group();
  avatar.name = "SyntheticAvatar";
  const bones = Array.from({ length: JOINT_COUNT }, (_, index) => {
    const bone = new THREE.Bone();
    bone.name = `Joint_${String(index).padStart(3, "0")}`;
    bone.position.y = index % BRANCH_JOINT_COUNT === 0 ? 0 : 2 / (BRANCH_JOINT_COUNT - 1);
    return bone;
  });
  for (let index = 0; index < bones.length; index++) {
    if (index % BRANCH_JOINT_COUNT === 0) avatar.add(bones[index]!);
    else bones[index - 1]!.add(bones[index]!);
  }
  const skeleton = new THREE.Skeleton(bones);
  const material = new THREE.MeshStandardMaterial({ color: "#6699cc", roughness: .8 });
  material.name = "AvatarSurface";
  const geometries = [
    new THREE.CylinderGeometry(.24, .3, 2, 64, 128).translate(0, 1, 0),
    new THREE.SphereGeometry(.28, 48, 32).translate(0, 2.18, 0),
    new THREE.CylinderGeometry(.085, .11, 1, 32, 64).translate(-.48, 1.35, 0),
    new THREE.CylinderGeometry(.085, .11, 1, 32, 64).translate(.48, 1.35, 0),
  ];
  geometries.forEach((geometry, part) => {
    const positions = geometry.getAttribute("position");
    const indices = new Uint16Array(positions.count * 4);
    const weights = new Float32Array(positions.count * 4);
    for (let index = 0; index < positions.count; index++) {
      const branch = part === 0 ? 64 : part === 1 ? 112 : part === 2 ? 32 : 96;
      indices[index * 4] = branch + Math.min(BRANCH_JOINT_COUNT - 1,
        Math.max(0, Math.round(positions.getY(index) / 2 * (BRANCH_JOINT_COUNT - 1))));
      weights[index * 4] = 1;
    }
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    if (part === 0) {
      const smile = Float32Array.from(positions.array);
      for (let index = 0; index < positions.count; index++) smile[index * 3] += .04;
      geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(smile, 3)];
    }
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = part === 0 ? "SyntheticBody" : `SyntheticPart_${part}`;
    if (part === 0) { mesh.morphTargetDictionary = { Smile: 0 }; mesh.morphTargetInfluences = [0]; }
    avatar.add(mesh);
  });
  avatar.updateMatrixWorld(true);
  avatar.traverse(object => { if ((object as THREE.SkinnedMesh).isSkinnedMesh) (object as THREE.SkinnedMesh).bind(skeleton); });
  const bytes = await new GLTFExporter().parseAsync(avatar, { binary: true });
  geometries.forEach(geometry => geometry.dispose()); material.dispose(); skeleton.dispose();
  if (!(bytes instanceof ArrayBuffer)) throw new Error("The avatar exporter did not produce GLB bytes");
  return bytes;
}

export async function mountSkinnedNodeEditor(host: HTMLElement, version: "dense" | "0" | "1" = "dense", vrmBase64?: string, selectedBone: "hips" | "spine" = "hips") {
  root?.unmount(); bridge = null; saveCount = 0; avatarRootId = "";
  renderedMesh = undefined; renderedScene = undefined; renderer = undefined;
  changedModelInstances = 0; lastMeshUuid = undefined; meshFrames = 0;
  fixtureVersion = version;
  targetName = version === "dense" ? "Joint_064" : selectedBone;
  bodyName = version === "dense" ? "SyntheticBody" : "Body";
  installReleaseE2EMock();
  // Only the native transport is isolated; this exposes the actual live Editor
  // bundle before autosave, so intermediate Node edits are measured directly.
  tauri.isAvailable = () => true;
  tauri.onXriftMcpEditorRequest = async () => () => {};
  const bytes = version === "dense" ? await createAvatarBytes() : Uint8Array.from(atob(vrmBase64!), char => char.charCodeAt(0)).buffer;
  const plan = await createAssetImportPlan({ fileName: version === "dense" ? "synthetic-avatar.glb" : `avatar-${version}.vrm`, bytes, displayName: "Skinned Avatar" });
  if (!plan.canCommit || plan.asset?.kind !== "model") throw new Error(JSON.stringify(plan.diagnostics));
  const files = new Map<string, string>();
  for (const write of plan.writes) files.set(write.relativePath, write.payload.encoding === "data-url" ? write.payload.dataUrl : await bytesDataUrl(write.payload.bytes));
  tauri.readProjectFileDataUrl = async (_path, relativePath) => {
    const data = files.get(relativePath);
    if (!data) throw new Error(`Missing isolated avatar fixture bytes: ${relativePath}`);
    return data;
  };
  tauri.commitVisualAssetImport = async (_path, _transaction, writes) => { writes.forEach(write => files.set(write.relativePath, write.dataUrl)); };
  const bundle = createPrototypeProject("world", "Skinned Node Editing");
  bundle.assets.folders = { ...bundle.assets.folders, ...Object.fromEntries((plan.folders ?? []).map(folder => [folder.id, folder])) };
  const model = plan.asset as ModelAsset;
  bundle.assets.assets[model.id] = model;
  for (const asset of plan.derivedAssets ?? []) {
    bundle.assets.assets[asset.id] = asset;
    if (asset.kind === "material" && version === "dense") {
      bundle.assets = updateMaterialAsset(bundle.assets, asset.id, { shadingModel: "mtoon-1.0" });
    }
  }
  const placement = instantiateSceneAsset(bundle.scene, bundle.assets, bundle.prefabs, model.id);
  if (!placement.placed) throw new Error(placement.reason);
  avatarRootId = placement.entityId;
  bundle.assets = placement.assets;
  bundle.scene = expandModelEntityHierarchy(placement.scene, bundle.assets, model, avatarRootId);
  const target = Object.values(bundle.scene.entities).find(entity => entity.name === targetName && entity.modelNode?.nodeType === "bone");
  if (!target?.modelNode) throw new Error("The real imported Bone node was not expanded");
  targetEntityId = target.id; targetSourceIndex = target.modelNode.sourceNodeIndex;
  saved = structuredClone(bundle);
  root = createRoot(host);
  root.render(createElement(ToastProvider, null, createElement(VisualEditorPrototype, {
    projectKind: "world", projectName: "Skinned Node Editing", projectPath: PROJECT_PATH,
    initialBundle: bundle, onBack: () => {},
    onSave: async (value) => {
      const scene = sceneDocumentCodec.parse(sceneDocumentCodec.serialize(value.scene));
      const assets = assetManifestCodec.parse(assetManifestCodec.serialize(value.assets));
      if (!scene.ok || !assets.ok) throw new Error(JSON.stringify({
        message: "Skinned Node edits did not survive the real document codecs",
        scene: scene.ok ? undefined : scene,
        assets: assets.ok ? undefined : assets,
      }));
      saved = structuredClone({ ...value, scene: scene.document, assets: assets.document }); saveCount++;
    },
    onRegisterMcpProjectBridge: value => { bridge = value; },
  })));
}

export function readSkinnedNodeState() {
  const current = bridge?.currentBundle() ?? saved;
  const rootEntity = current.scene.entities[avatarRootId];
  const mesh = rootEntity?.components.find(component => component.type === "mesh");
  const savedRoot = saved.scene.entities[avatarRootId]?.components.find(component => component.type === "mesh");
  const sample = renderedMesh?.getVertexPosition(0, new THREE.Vector3());
  const bone = renderedMesh?.skeleton.bones.find(candidate => candidate.name === targetName);
  let proxy: THREE.Object3D | undefined;
  renderedScene?.traverse(object => { if (object.userData.authoringEntityId === targetEntityId && object.type === "Group") proxy = object; });
  return {
    ready: Boolean(renderedMesh && bridge), targetEntityId, targetSourceIndex, targetName, avatarRootId,
    jointCount: renderedMesh?.skeleton.bones.length, fixtureVersion,
    saveCount, frames: meshFrames, changedModelInstances,
    transform: getTransform(current.scene.entities[targetEntityId]),
    nodePose: mesh?.type === "mesh" ? mesh.modelPose?.nodes?.[String(targetSourceIndex)] : undefined,
    savedNodePose: savedRoot?.type === "mesh" ? savedRoot.modelPose?.nodes?.[String(targetSourceIndex)] : undefined,
    vertex: sample?.toArray(), meshUuid: renderedMesh?.uuid, skeletonUuid: renderedMesh?.skeleton.uuid,
    materialUuids: renderedMesh ? (Array.isArray(renderedMesh.material) ? renderedMesh.material : [renderedMesh.material]).map(material => material.uuid) : [],
    materialTypes: renderedMesh ? (Array.isArray(renderedMesh.material) ? renderedMesh.material : [renderedMesh.material]).map(material => material.type) : [],
    materialConstructors: renderedMesh ? (Array.isArray(renderedMesh.material) ? renderedMesh.material : [renderedMesh.material]).map(material => material.constructor.name) : [],
    boneWorld: bone?.getWorldPosition(new THREE.Vector3()).toArray(), proxyWorld: proxy?.getWorldPosition(new THREE.Vector3()).toArray(),
    vertexWorld: sample && renderedMesh ? renderedMesh.localToWorld(sample.clone()).toArray() : undefined,
    allNodePoses: mesh?.type === "mesh" ? mesh.modelPose?.nodes : undefined,
    bonePoses: mesh?.type === "mesh" ? mesh.modelPose?.bones : undefined,
    morphPoses: mesh?.type === "mesh" ? mesh.modelPose?.morphTargets : undefined,
    materials: Object.values(current.assets.assets).filter((asset): asset is MaterialAsset => asset.kind === "material").map(asset => asset.properties),
    pendingMaterialThumbnails: Object.values(current.assets.assets).filter(asset => asset.kind === "material" &&
      (asset.thumbnail?.status !== "generated" || asset.thumbnail.rendererVersion !== MATERIAL_THUMBNAIL_RENDERER_VERSION)).length,
  };
}

export function markSkinnedNodeBaseline() {
  changedModelInstances = 0;
  lastMeshUuid = renderedMesh?.uuid;
}

function findSkinnedNodeGizmo() {
  let controls: TransformControl | undefined;
  renderedScene?.traverse(object => {
    const candidate = object as TransformControl;
    if (candidate.isTransformControls && candidate.object?.userData.authoringEntityId === targetEntityId) controls = candidate;
  });
  if (!controls?.object) throw new Error("The selected Bone's actual TransformControls was not found");
  return controls;
}

export function startSkinnedNodeGizmo() {
  activeControls = findSkinnedNodeGizmo();
  activeControls.dispatchEvent({ type: "mouseDown" });
}

export function getSkinnedNodePointerStart() {
  if (!renderer || !renderedCamera) throw new Error("The actual avatar viewport has not rendered");
  const controls = findSkinnedNodeGizmo();
  const surface = renderer.domElement;
  controls.updateMatrixWorld(true);
  const gizmo = controls.children.find(child => child.type === "TransformControlsGizmo") as
    (THREE.Object3D & { picker: { translate: THREE.Group } }) | undefined;
  const picker = gizmo?.picker.translate.children.find(child => child.name === "X") as THREE.Mesh | undefined;
  if (!picker) throw new Error("The real translate X picker was not found");
  picker.geometry.computeBoundingBox();
  const ndc = picker.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(picker.matrixWorld).project(renderedCamera);
  const bounds = surface.getBoundingClientRect();
  surface.addEventListener("pointerdown", event => { activeGizmoPointer = event; }, { capture: true, once: true });
  return { x: bounds.left + (ndc.x + 1) * bounds.width / 2, y: bounds.top + (1 - ndc.y) * bounds.height / 2 };
}

export function adoptSkinnedNodePointerGizmo() {
  activeControls = findSkinnedNodeGizmo();
  if (!activeControls.dragging) throw new Error("The real touch Bone gizmo did not begin its drag");
}

export function cancelSkinnedNodeTouchGizmo(pointerType: "touch" | "pen") {
  if (!renderer || !activeGizmoPointer) throw new Error("The actual avatar pointer has not started");
  renderer.domElement.dispatchEvent(new PointerEvent("pointercancel", {
    bubbles: true, pointerType, pointerId: activeGizmoPointer.pointerId, button: 0,
  }));
  if (activeControls?.dragging) throw new Error("The real touch Bone gizmo kept dragging after pointercancel");
  activeControls = undefined;
}

export function moveSkinnedNodeGizmo(deltaX: number, space: "world" | "local" = "world") {
  if (!activeControls?.object) throw new Error("The actual Bone gizmo is not being dragged");
  const object = activeControls.object;
  const direction = new THREE.Vector3(1, 0, 0);
  if (space === "local") direction.applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()));
  const nextWorld = object.getWorldPosition(new THREE.Vector3()).addScaledVector(direction, deltaX);
  object.position.copy(object.parent ? object.parent.worldToLocal(nextWorld) : nextWorld);
  activeControls.object.updateMatrixWorld(true);
  activeControls.dispatchEvent({ type: "objectChange" });
  return direction.multiplyScalar(deltaX).toArray();
}

export function finishSkinnedNodeGizmo() {
  activeControls?.dispatchEvent({ type: "mouseUp" });
  activeControls = undefined;
}

export function captureSkinnedNodeViewport() {
  if (!renderer || !renderedScene || !renderedCamera) throw new Error("The actual avatar viewport has not rendered");
  renderer.render(renderedScene, renderedCamera);
  return renderer.domElement.toDataURL("image/png");
}
