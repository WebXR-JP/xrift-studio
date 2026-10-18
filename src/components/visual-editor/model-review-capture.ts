import { Box3, Mesh, Object3D, PerspectiveCamera, Quaternion, Vector3, type Camera, type Scene, type WebGLRenderer } from "three";
import { renderXriftSceneFrame } from "../../../packages/xrift-studio-runtime/src/scene/postprocessing";
import { sceneReviewReadiness } from "./scene-review-readiness";

export type ModelReviewView = { entityId: string; sourceHash: string; direction: [number, number, number] };
export type WorldReviewView = { kind: "overview" } | { kind: "spawn"; position: [number, number, number]; yaw: number };

export function worldReviewReady(scene: Scene): boolean {
  let pending = false;
  scene.traverse(object => { if (object.userData.xriftModelLoadState && object.userData.xriftModelLoadState !== "ready") pending = true; });
  return !pending && sceneReviewReadiness(scene).ready;
}

export function renderReviewFrame(gl: WebGLRenderer, scene: Scene, camera: Camera): void {
  const centered: { object: Object3D; position: Vector3 }[] = [];
  scene.traverseVisible(object => {
    if (!object.userData.xriftReviewCameraCentered) return;
    centered.push({ object, position: object.position.clone() });
    const position = camera.getWorldPosition(new Vector3());
    object.position.copy(object.parent ? object.parent.worldToLocal(position) : position);
    object.updateMatrixWorld(true);
  });
  try {
    if (!renderXriftSceneFrame(gl, scene, camera)) throw new Error("シーンの描画処理を準備しています。準備が終わってから再試行してください");
  } finally {
    for (const { object, position } of centered) { object.position.copy(position); object.updateMatrixWorld(true); }
  }
}

function readFrame(gl: WebGLRenderer): string {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 768 / Math.max(gl.domElement.width, gl.domElement.height));
  canvas.width = Math.max(1, Math.round(gl.domElement.width * scale));
  canvas.height = Math.max(1, Math.round(gl.domElement.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("制作した内容の確認画像を取得できませんでした");
  context.drawImage(gl.domElement, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export function captureWorldReviewView(gl: WebGLRenderer, scene: Scene, view: WorldReviewView): string {
  scene.updateMatrixWorld(true);
  const bounds = new Box3();
  scene.traverseVisible(object => {
    if (!(object instanceof Mesh) || object.userData.editorHelper || object.userData.xriftColliderExclude) return;
    let owner: Object3D | null = object;
    while (owner && !owner.userData.authoringEntityId) owner = owner.parent;
    if (owner) bounds.expandByObject(object, true);
  });
  const center = bounds.isEmpty() ? new Vector3() : bounds.getCenter(new Vector3());
  const radius = bounds.isEmpty() ? 10 : Math.max(bounds.getSize(new Vector3()).length() / 2, 1);
  const aspect = gl.domElement.width / Math.max(gl.domElement.height, 1);
  const camera = new PerspectiveCamera(view.kind === "spawn" ? 70 : 40, aspect, 0.01, Math.max(1000, radius * 30));
  if (view.kind === "spawn") {
    camera.position.set(...view.position).add(new Vector3(0, 1.6, 0));
    camera.lookAt(camera.position.clone().add(new Vector3(-Math.sin(view.yaw), 0, -Math.cos(view.yaw))));
  } else {
    const halfFov = Math.min(camera.fov * Math.PI / 360, Math.atan(Math.tan(camera.fov * Math.PI / 360) * aspect));
    camera.position.copy(center).addScaledVector(new Vector3(1, 0.8, 1).normalize(), radius / Math.sin(halfFov) * 1.15);
    camera.lookAt(center);
  }
  camera.updateMatrixWorld(true);
  const hidden: Object3D[] = [];
  scene.traverse(object => {
    if (object.visible && (object.userData.editorHelper || object.type === "GridHelper" || object.type.startsWith("TransformControls"))) { hidden.push(object); object.visible = false; }
  });
  try { renderReviewFrame(gl, scene, camera); return readFrame(gl); }
  finally { for (const object of hidden) object.visible = true; }
}

/** A load placeholder is never evidence that the generated model was seen. */
export function modelReviewTarget(scene: Scene, view: ModelReviewView): Object3D | null {
  let target: Object3D | null = null;
  scene.traverse(object => {
    if (!target && object.userData.authoringEntityId === view.entityId && object.userData.renderedEntityId === view.entityId) target = object;
  });
  if (!target) return null;
  let ready = false, pending = false;
  (target as Object3D).traverse(object => {
    if (object.userData.xriftModelLoadState && object.userData.xriftModelLoadState !== "ready") pending = true;
    if (object.userData.xriftModelSourceHash === view.sourceHash && object.userData.xriftModelLoadState === "ready") ready = true;
  });
  return ready && !pending && sceneReviewReadiness(scene).ready ? target : null;
}

/** Uses the mounted Model, its real Materials and the Scene's lights. No second
 * model renderer or camera/Scene document mutation is involved. */
export function captureModelReviewView(gl: WebGLRenderer, scene: Scene, target: Object3D, view: ModelReviewView): string {
  scene.updateMatrixWorld(true);
  const bounds = new Box3();
  target.traverseVisible(object => {
    if (!(object instanceof Mesh) || object.userData.editorHelper || object.userData.xriftColliderExclude) return;
    let source: Object3D | null = object;
    while (source && source !== target && source.userData.xriftModelSourceHash !== view.sourceHash) source = source.parent;
    if (source?.userData.xriftModelSourceHash === view.sourceHash) bounds.expandByObject(object, true);
  });
  if (bounds.isEmpty()) throw new Error("制作したモデルの描画を確認できませんでした");
  const center = bounds.getCenter(new Vector3());
  const radius = Math.max(bounds.getSize(new Vector3()).length() / 2, 0.01);
  const aspect = gl.domElement.width / Math.max(gl.domElement.height, 1);
  const camera = new PerspectiveCamera(40, aspect, Math.max(radius / 1000, 0.001), radius * 30 + 100);
  const halfFov = Math.min(camera.fov * Math.PI / 360, Math.atan(Math.tan(camera.fov * Math.PI / 360) * aspect));
  const direction = new Vector3(...view.direction).applyQuaternion(target.getWorldQuaternion(new Quaternion())).normalize();
  camera.position.copy(center).addScaledVector(direction, radius / Math.sin(halfFov) * 1.15);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const hidden: Object3D[] = [];
  scene.traverse(object => {
    let inside: Object3D | null = object;
    while (inside && inside !== target) inside = inside.parent;
    let owner: Object3D | null = object;
    while (owner && !owner.userData.authoringEntityId) owner = owner.parent;
    const surroundingMesh = object instanceof Mesh && Boolean(owner) && inside !== target;
    if (object.visible && (surroundingMesh || object.userData.editorHelper || object.type === "GridHelper" || object.type.startsWith("TransformControls"))) {
      hidden.push(object); object.visible = false;
    }
  });
  try {
    renderReviewFrame(gl, scene, camera);
    return readFrame(gl);
  } finally {
    for (const object of hidden) object.visible = true;
  }
}
