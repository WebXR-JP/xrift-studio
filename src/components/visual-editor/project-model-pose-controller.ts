import type { Euler, Object3D, Vector3 } from "three";
import type {
  ModelNodeTransformOffset,
  ModelPoseState,
  Vec3,
} from "../../lib/visual-editor/scene-document";

type PoseObject = Object3D & { isBone?: boolean; morphTargetInfluences?: number[] };

type RestPose = {
  object: PoseObject;
  position: Vector3;
  rotation: Euler;
  scale: Vector3;
  visible: boolean;
  morphTargetInfluences?: readonly number[];
};

export type ProjectModelPoseController = {
  apply(pose: ModelPoseState | undefined): void;
  previewNode(sourceIndex: number, offset: ModelNodeTransformOffset): void;
  clearPreview(): void;
  getBoneRotation(sourceIndex: number): Vec3 | undefined;
};

/** Applies pose edits to one model instance without replacing its resources. */
export function createProjectModelPoseController(
  root: Object3D,
  applyPose: (root: Object3D, pose: ModelPoseState | undefined) => void,
  readSourceIndex?: (object: Object3D) => number | undefined,
): ProjectModelPoseController {
  const rest: RestPose[] = [];
  const boneNamesBySourceIndex = new Map<number, string>();
  // Capture only the imported instance. Later outlines and editor helpers
  // retain their own transforms instead of becoming part of the rest pose.
  root.traverse((object: PoseObject) => {
    const sourceIndex = readSourceIndex?.(object);
    if (object.isBone && object.name && sourceIndex !== undefined && Number.isInteger(sourceIndex) && sourceIndex >= 0) {
      boneNamesBySourceIndex.set(sourceIndex, object.name);
    }
    rest.push({
      object,
      position: object.position.clone(),
      rotation: object.rotation.clone(),
      scale: object.scale.clone(),
      visible: object.visible,
      morphTargetInfluences: object.morphTargetInfluences?.slice(),
    });
  });

  let committedPose: ModelPoseState | undefined;
  const nodePreviews = new Map<string, ModelNodeTransformOffset>();

  const renderPose = (pose: ModelPoseState | undefined): void => {
    for (const snapshot of rest) {
      const object = snapshot.object;
      object.position.copy(snapshot.position);
      object.rotation.copy(snapshot.rotation);
      object.scale.copy(snapshot.scale);
      object.visible = snapshot.visible;
      if (snapshot.morphTargetInfluences && object.morphTargetInfluences) {
        const weights = object.morphTargetInfluences;
        weights.length = snapshot.morphTargetInfluences.length;
        for (let index = 0; index < weights.length; index += 1) {
          weights[index] = snapshot.morphTargetInfluences[index];
        }
      }
    }
    applyPose(root, pose);
  };

  return {
    apply(pose) {
      committedPose = pose;
      nodePreviews.clear();
      renderPose(committedPose);
    },
    previewNode(sourceIndex, offset) {
      if (!Number.isInteger(sourceIndex) || sourceIndex < 0) return;
      nodePreviews.set(String(sourceIndex), offset);
      const nodes = { ...committedPose?.nodes };
      for (const [index, preview] of nodePreviews) {
        const { visible, ...transform } = preview;
        nodes[index] = {
          ...nodes[index],
          ...transform,
          ...(visible === undefined ? {} : { visible }),
        };
      }
      renderPose({
        bones: committedPose?.bones ?? {},
        morphTargets: committedPose?.morphTargets ?? {},
        nodes,
      });
    },
    clearPreview() {
      nodePreviews.clear();
      renderPose(committedPose);
    },
    getBoneRotation(sourceIndex) {
      const name = boneNamesBySourceIndex.get(sourceIndex);
      const rotation = name ? committedPose?.bones[name] : undefined;
      return rotation?.length === 3 && rotation.every(Number.isFinite)
        ? [...rotation]
        : undefined;
    },
  };
}
