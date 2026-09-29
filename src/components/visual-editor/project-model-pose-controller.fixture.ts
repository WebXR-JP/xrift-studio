import {
  Bone,
  BoxGeometry,
  Group,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Texture,
} from "three";
import type {
  ModelNodeTransformOffset,
  ModelPoseState,
} from "../../lib/visual-editor/scene-document";
import {
  PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY,
  applyStaticModelPose,
} from "./ProjectModelVisual";
import { createProjectModelPoseController } from "./project-model-pose-controller";
import { bindModelNodePose, getModelNodePoseController, notifyModelNodePose, subscribeModelNodePose } from "./project-model-node-pose-bridge";

export function runProjectModelPoseControllerFixtureAssertions(): void {
  assertPoseSubscriptionsSurviveEntityUpdates();
  const root = new Group();
  root.position.set(0.5, 1, 2);
  const node = new Group();
  node.position.set(1, 2, 3);
  node.rotation.set(0.1, 0.2, 0.3, "ZYX");
  node.scale.set(2, 3, 4);
  node.userData[PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY] = 1;
  const bone = new Bone();
  bone.name = "Joint";
  bone.rotation.set(0.2, 0.3, 0.4);
  bone.userData[PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY] = 2;
  const hidden = new Group();
  hidden.visible = false;
  hidden.userData[PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY] = 3;
  const renamedBone = new Bone();
  renamedBone.name = "Joint_1";
  renamedBone.userData[PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY] = 4;
  const map = new Texture();
  const material = new MeshStandardMaterial({ map });
  const geometry = new BoxGeometry();
  const mesh = new SkinnedMesh(geometry, material);
  mesh.morphTargetDictionary = { Smile: 0, Blink: 1 };
  mesh.morphTargetInfluences = [0.25, 0.5];
  root.add(node, hidden, renamedBone);
  node.add(bone, mesh);
  const skeleton = new Skeleton([bone]);
  mesh.bind(skeleton);
  const morphWeights = mesh.morphTargetInfluences;
  const boneInverses = skeleton.boneInverses;
  let disposedResources = 0;
  for (const resource of [material, geometry, map]) {
    resource.addEventListener("dispose", () => { disposedResources += 1; });
  }
  const controller = createProjectModelPoseController(root, applyStaticModelPose, object => object.userData[PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY]);
  assert(controller.getBoneRotation(2) === undefined, "an unapplied controller must not invent a bone pose");
  const helper = new Group();
  helper.position.set(7, 8, 9);
  root.add(helper);

  const pose: ModelPoseState = {
    bones: { Joint: [0.1, 0.2, 0.3], Joint_1: [0.4, 0.5, 0.6] },
    morphTargets: { Smile: 0.8 },
    nodes: {
      "1": offset([2, 3, 4], [0.4, 0.5, 0.6], [0.5, 2, 3], false),
      "2": offset([0, 0.5, 0], [0.2, 0, 0], [1, 1, 1]),
      "3": offset([0, 0, 0], [0, 0, 0], [1, 1, 1], true),
    },
  };
  const storedPose = JSON.stringify(pose);
  controller.apply(pose);
  controller.apply(pose);
  assertValues(controller.getBoneRotation(2)!, [0.1, 0.2, 0.3], "source indices must resolve the actual runtime Bone name");
  assertValues(controller.getBoneRotation(4)!, [0.4, 0.5, 0.6], "duplicate source names renamed by the loader must retain their own Bone pose");
  assert(controller.getBoneRotation(1) === undefined && controller.getBoneRotation(99) === undefined, "non-Bone and unknown source nodes must not return a Bone rotation");
  controller.getBoneRotation(2)![0] = 99;
  assertValues(controller.getBoneRotation(2)!, [0.1, 0.2, 0.3], "display consumers must not be able to mutate the committed Bone pose");
  assertValues(node.position.toArray(), [3, 5, 7], "repeated positions must not accumulate");
  assertValues([node.rotation.x, node.rotation.y, node.rotation.z], [0.5, 0.7, 0.9], "repeated rotations must not accumulate");
  assert(node.rotation.order === "ZYX", "the imported Euler order must be retained");
  assertValues(node.scale.toArray(), [1, 6, 12], "repeated scale must start at the imported scale");
  assertValues([bone.rotation.x, bone.rotation.y, bone.rotation.z], [0.5, 0.5, 0.7], "bone and node offsets must each apply once");
  assert(!node.visible && !hidden.visible, "pose visibility must respect imported hidden nodes");
  assertValues(morphWeights, [0.8, 0.5], "unmodified morphs must keep their imported weights");

  controller.previewNode(1, offset([4, 0, 0], [0, 0, 0], [1, 1, 1]));
  controller.previewNode(1, offset([5, 0, 0], [0, 0, 0], [1, 1, 1]));
  controller.previewNode(2, offset([0, 2, 0], [0.4, 0, 0], [1, 1, 1]));
  assertValues(node.position.toArray(), [6, 2, 3], "latest preview must replace the previous node offset");
  assert(!node.visible, "a transform-only preview must preserve committed node visibility");
  assertValues(bone.position.toArray(), [0, 2, 0], "multiple node previews must remain active together");
  assertValues([bone.rotation.x, bone.rotation.y, bone.rotation.z], [0.7, 0.5, 0.7], "preview must retain the committed bone offsets");
  assertValues(controller.getBoneRotation(2)!, [0.1, 0.2, 0.3], "the Bone display delta must exclude live node preview offsets");
  assertValues(morphWeights, [0.8, 0.5], "preview must retain the committed morph pose");
  controller.clearPreview();
  assertValues(node.position.toArray(), [3, 5, 7], "clearing preview must restore the committed node pose");
  assertValues(bone.position.toArray(), [0, 0.5, 0], "clearing preview must restore all committed node offsets");
  assert(!node.visible, "clearing preview must restore committed visibility");
  assert(JSON.stringify(pose) === storedPose, "preview must not mutate the saved pose");

  controller.previewNode(1, offset([99, 0, 0], [0, 0, 0], [1, 1, 1]));
  const replacementPose: ModelPoseState = {
    bones: { Joint: [0.3, 0, 0] },
    morphTargets: { Blink: 0.9 },
  };
  controller.apply(replacementPose);
  assertValues(controller.getBoneRotation(2)!, [0.3, 0, 0], "display Bone rotation must follow the latest committed pose");
  assert(controller.getBoneRotation(4) === undefined, "removing a Bone pose must clear its display delta");
  assertValues(node.position.toArray(), [1, 2, 3], "removing a saved node offset must restore its rest position");
  assertValues(node.scale.toArray(), [2, 3, 4], "removing a saved node offset must restore its rest scale");
  assert(node.visible, "removing saved visibility must restore imported visibility");
  assertValues(morphWeights, [0.25, 0.9], "removing a saved morph must restore its imported weight");
  controller.clearPreview();
  assertValues(node.position.toArray(), [1, 2, 3], "a committed update must clear stale previews");
  controller.previewNode(1, offset([2, 0, 0], [0, 0, 0], [1, 1, 1]));
  assertValues([bone.rotation.x, bone.rotation.y, bone.rotation.z], [0.5, 0.3, 0.4], "preview must use the latest committed bone pose");
  assertValues(morphWeights, [0.25, 0.9], "preview must use the latest committed morph pose");

  helper.position.set(10, 11, 12);
  controller.apply(undefined);
  assert(controller.getBoneRotation(2) === undefined, "removing the model pose must clear the display Bone rotation");
  assertValues(node.position.toArray(), [1, 2, 3], "removing the pose must restore every imported transform");
  assertValues([bone.rotation.x, bone.rotation.y, bone.rotation.z], [0.2, 0.3, 0.4], "removing the pose must restore the imported bone rotation");
  assertValues(morphWeights, [0.25, 0.5], "removing the pose must restore all imported morph weights");
  assertValues(helper.position.toArray(), [10, 11, 12], "later editor helpers must not be reset from the rest capture");
  assertValues([node.matrixWorld.elements[12], node.matrixWorld.elements[13], node.matrixWorld.elements[14]], [1.5, 3, 5], "removing a pose must refresh its world matrix");
  assert(mesh.geometry === geometry && mesh.material === material && material.map === map, "pose edits must keep geometry, material and texture identity");
  assert(mesh.skeleton === skeleton && skeleton.boneInverses === boneInverses && mesh.morphTargetInfluences === morphWeights, "pose edits must retain the skin and morph resources");
  assert(disposedResources === 0, "pose updates must not dispose or reconstruct resources");

  geometry.dispose();
  material.dispose();
  map.dispose();
  skeleton.dispose();
}

function assertPoseSubscriptionsSurviveEntityUpdates(): void {
  const owner = new Group();
  owner.userData = { authoringEntityId: "avatar" };
  const source = new Group();
  owner.add(source);
  const controller = createProjectModelPoseController(source, applyStaticModelPose);
  let observed = undefined as typeof controller | undefined;
  let calls = 0;
  const unsubscribe = subscribeModelNodePose(owner, value => { observed = value; calls += 1; });
  const unbind = bindModelNodePose(source, controller);
  assert(observed === controller, "nodes mounted before model loading must receive the loaded controller");
  owner.userData = { authoringEntityId: "avatar", renderedEntityId: "avatar" };
  notifyModelNodePose(source, controller);
  assert(getModelNodePoseController(owner) === controller && calls === 3, "Entity userData replacement must retain controller and node subscriptions");
  unsubscribe();
  notifyModelNodePose(source, controller);
  assert(calls === 3, "unmounted nodes must stop receiving pose updates");
  const subscribeAgain = subscribeModelNodePose(owner, value => { observed = value; });
  unbind();
  assert(observed === undefined && getModelNodePoseController(owner) === undefined, "disposing a model must reset attached node pose displays");
  const replacement = createProjectModelPoseController(source, applyStaticModelPose);
  const unbindReplacement = bindModelNodePose(source, replacement);
  unbind();
  assert(getModelNodePoseController(owner) === replacement, "old instance cleanup must not detach its replacement");
  subscribeAgain();
  unbindReplacement();
}

function offset(
  position: ModelNodeTransformOffset["position"],
  rotation: ModelNodeTransformOffset["rotation"],
  scale: ModelNodeTransformOffset["scale"],
  visible?: boolean,
): ModelNodeTransformOffset {
  return { position, rotation, scale, ...(visible === undefined ? {} : { visible }) };
}

function assertValues(actual: readonly number[], expected: readonly number[], message: string): void {
  assert(actual.length === expected.length && actual.every((value, index) => Math.abs(value - expected[index]) < 1e-8), message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
