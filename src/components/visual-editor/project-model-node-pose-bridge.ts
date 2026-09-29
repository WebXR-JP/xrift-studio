import type { Object3D } from "three";
import type { ProjectModelPoseController } from "./project-model-pose-controller";

type PoseListener = (controller: ProjectModelPoseController | undefined) => void;
type OwnerPose = { controller?: ProjectModelPoseController; listeners: Set<PoseListener> };
// R3F replaces an Entity group's userData when its document changes. Keep
// subscriptions with the stable Object3D rather than that replaceable bag.
const ownerPoses = new WeakMap<Object3D, OwnerPose>();

function ownerPose(owner: Object3D): OwnerPose {
  let pose = ownerPoses.get(owner);
  if (!pose) {
    pose = { listeners: new Set() };
    ownerPoses.set(owner, pose);
  }
  return pose;
}

export function getModelNodePoseController(owner: Object3D): ProjectModelPoseController | undefined {
  return ownerPoses.get(owner)?.controller;
}

function modelOwner(object: Object3D): Object3D | undefined {
  let ancestor = object.parent;
  while (ancestor) {
    if (typeof ancestor.userData.authoringEntityId === "string") return ancestor;
    ancestor = ancestor.parent;
  }
  return undefined;
}

export function subscribeModelNodePose(owner: Object3D, listener: PoseListener): () => void {
  const pose = ownerPose(owner);
  const { listeners } = pose;
  listeners.add(listener);
  listener(getModelNodePoseController(owner));
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && !pose.controller) ownerPoses.delete(owner);
  };
}

/** Notify only the expanded node groups, without replacing Scene entities. */
export function notifyModelNodePose(object: Object3D, controller: ProjectModelPoseController): void {
  const owner = modelOwner(object);
  if (!owner || getModelNodePoseController(owner) !== controller) return;
  const listeners = ownerPoses.get(owner)?.listeners;
  listeners?.forEach(listener => listener(controller));
}

export function bindModelNodePose(object: Object3D, controller: ProjectModelPoseController): () => void {
  const owner = modelOwner(object);
  // Shared-source node authoring addresses the first Model Mesh on its owner.
  if (owner && !getModelNodePoseController(owner)) {
    ownerPose(owner).controller = controller;
    notifyModelNodePose(object, controller);
  }
  return () => {
    if (owner && getModelNodePoseController(owner) === controller) {
      const pose = ownerPose(owner);
      delete pose.controller;
      pose.listeners.forEach(listener => listener(undefined));
      if (pose.listeners.size === 0) ownerPoses.delete(owner);
    }
  };
}
