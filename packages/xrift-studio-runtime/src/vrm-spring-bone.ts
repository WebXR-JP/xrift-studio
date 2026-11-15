import { Object3D, type Matrix4, type Vector3 } from "three";
import * as threeVrm from "@pixiv/three-vrm";

/*
 * VRM spring bones (hair, skirts, ears) on the copies of an avatar that are drawn.
 *
 * three-vrm wires its spring bones to the objects it loaded, but Edit, Play and
 * a published world never draw those objects: every Entity draws a clone. The
 * loaded setup is recorded once, and each drawn clone gets joints bound to its
 * own bones, so Play and a published world run the same simulation on what is
 * on screen.
 */

/*
 * NodeNext cannot follow three-vrm's extensionless type re-exports, so the
 * runtime classes are typed here by the members this module uses.
 */
type VRMSpringBoneColliderShape = object;
type VRMSpringBoneCollider = Object3D & {
  readonly shape: VRMSpringBoneColliderShape;
  readonly colliderMatrix: Matrix4;
};
type VRMSpringBoneColliderGroup = { colliders: VRMSpringBoneCollider[]; name?: string };
type VRMSpringBoneJointSettings = {
  hitRadius: number;
  stiffness: number;
  gravityPower: number;
  gravityDir: Vector3;
  dragForce: number;
};
type VRMSpringBoneJoint = {
  readonly bone: Object3D;
  readonly child: Object3D | null;
  center: Object3D | null;
  readonly settings: VRMSpringBoneJointSettings;
  readonly colliderGroups: VRMSpringBoneColliderGroup[];
};
type VRMSpringBoneManager = {
  readonly joints: Set<VRMSpringBoneJoint>;
  readonly colliders: VRMSpringBoneCollider[];
  addJoint(joint: VRMSpringBoneJoint): void;
  setInitState(): void;
  reset(): void;
  update(delta: number): void;
};
const { VRMSpringBoneCollider, VRMSpringBoneJoint, VRMSpringBoneManager } = threeVrm as unknown as {
  VRMSpringBoneCollider: new (shape: VRMSpringBoneColliderShape) => VRMSpringBoneCollider;
  VRMSpringBoneJoint: new (
    bone: Object3D,
    child: Object3D | null,
    settings?: Partial<VRMSpringBoneJointSettings>,
    colliderGroups?: VRMSpringBoneColliderGroup[],
  ) => VRMSpringBoneJoint;
  VRMSpringBoneManager: new () => VRMSpringBoneManager;
};

/** userData survives Object3D.clone(), so the id finds the same object in any copy. */
const TARGET_KEY = "xriftVrmSpringBoneTarget";
/** A hidden tab resumes with a long frame. Cap it like the animation mixers do. */
const MAX_STEP_SECONDS = 0.1;

type JointSetup = {
  bone: number;
  child: number | null;
  center: number | null;
  settings: VRMSpringBoneJointSettings;
  colliderGroups: number[];
};

type SpringBoneSetup = {
  joints: JointSetup[];
  colliderGroups: Array<{ name?: string; colliders: number[] }>;
};

const setups = new WeakMap<Object3D, SpringBoneSetup>();

/**
 * Object3D.clone() builds a collider without its shape, and the collider's
 * updateWorldMatrix() then reads `shape.offset` and throws. Box3.setFromObject()
 * and getWorldPosition() reach it, so one cloned avatar took the editor down.
 * The copy keeps the shape, which no simulation mutates.
 */
class CloneableVRMSpringBoneCollider extends VRMSpringBoneCollider {
  override copy(source: Object3D, recursive?: boolean): this {
    super.copy(source, recursive);
    if (source instanceof VRMSpringBoneCollider) {
      (this as { shape: VRMSpringBoneColliderShape }).shape = source.shape;
    }
    return this;
  }
}

export type VrmSpringBoneRuntime = {
  /** The joints bound to the drawn clone. */
  readonly manager: VRMSpringBoneManager;
  /**
   * Advances the simulation by `delta` seconds. The first call after binding
   * or reset() places the tails at rest instead, from current world matrices.
   */
  update(delta: number): void;
  /** Returns every joint to the pose it was bound in. */
  reset(): void;
  /** Returns the bones to that pose and hands them back to their own transforms. */
  dispose(): void;
};

/**
 * Records a loaded VRM's spring bones so drawn clones can be bound to them.
 *
 * Call right after loading, before anything clones the scene. Nothing updates
 * the loaded objects, so three-vrm's joints on them are released: its center
 * cache would otherwise be copied into every clone, and a bone it owns stops
 * following its own position, rotation and scale.
 */
export function prepareVrmSpringBones(
  scene: Object3D,
  manager: VRMSpringBoneManager | null | undefined,
): void {
  scene.traverse((object) => {
    if (object instanceof VRMSpringBoneCollider && !(object instanceof CloneableVRMSpringBoneCollider)) {
      Object.setPrototypeOf(object, CloneableVRMSpringBoneCollider.prototype);
    }
  });
  if (!manager || setups.has(scene)) return;
  const targetIds = new Map<Object3D, number>();
  const target = (object: Object3D): number => {
    let id = targetIds.get(object);
    if (id === undefined) {
      id = targetIds.size;
      targetIds.set(object, id);
      object.userData[TARGET_KEY] = id;
    }
    return id;
  };
  const groupIds = new Map<VRMSpringBoneColliderGroup, number>();
  const colliderGroups: SpringBoneSetup["colliderGroups"] = [];
  const joints = Array.from(manager.joints, (joint): JointSetup => ({
    bone: target(joint.bone),
    child: joint.child ? target(joint.child) : null,
    center: joint.center ? target(joint.center) : null,
    settings: { ...joint.settings, gravityDir: joint.settings.gravityDir.clone() },
    colliderGroups: joint.colliderGroups.map((group) => {
      let id = groupIds.get(group);
      if (id === undefined) {
        id = colliderGroups.length;
        groupIds.set(group, id);
        colliderGroups.push({ name: group.name, colliders: group.colliders.map(target) });
      }
      return id;
    }),
  }));
  for (const joint of manager.joints) {
    joint.center = null;
    joint.bone.matrixAutoUpdate = Object3D.DEFAULT_MATRIX_AUTO_UPDATE;
  }
  setups.set(scene, { joints, colliderGroups });
}

/**
 * Binds the spring bones recorded for `source` to their copies under `root`.
 * Returns null when `root` holds none of them: a model without spring bones,
 * or one expanded node that does not contain the moving bones.
 */
export function bindVrmSpringBones(
  source: Object3D,
  root: Object3D,
): VrmSpringBoneRuntime | null {
  const setup = setups.get(source);
  if (!setup || setup.joints.length === 0) return null;
  const targets = new Map<number, Object3D>();
  root.traverse((object) => {
    const id: unknown = object.userData[TARGET_KEY];
    if (typeof id === "number" && !targets.has(id)) targets.set(id, object);
  });
  const colliderGroups = setup.colliderGroups.map((group): VRMSpringBoneColliderGroup => ({
    name: group.name,
    colliders: group.colliders.flatMap((id) => {
      const collider = targets.get(id);
      return collider instanceof VRMSpringBoneCollider ? [collider] : [];
    }),
  }));
  const manager = new VRMSpringBoneManager();
  const centers = new Set<Object3D>();
  for (const joint of setup.joints) {
    const bone = targets.get(joint.bone);
    const child = joint.child === null ? null : targets.get(joint.child);
    if (!bone || child === undefined) continue;
    const bound = new VRMSpringBoneJoint(
      bone,
      child,
      joint.settings,
      joint.colliderGroups.flatMap((index) => colliderGroups[index] ?? []),
    );
    const center = joint.center === null ? undefined : targets.get(joint.center);
    if (center) {
      // A copy of a bound clone carries a JSON copy of three-vrm's inverse
      // cache, which its center setter would mistake for a live one.
      if (!centers.has(center)) {
        centers.add(center);
        delete center.userData.inverseCacheProxy;
      }
      bound.center = center;
    }
    manager.addJoint(bound);
  }
  if (manager.joints.size === 0) return null;
  manager.setInitState();
  let settled = false;
  return {
    manager,
    update(delta) {
      if (!settled) {
        root.updateWorldMatrix(true, true);
        manager.reset();
        settled = true;
        return;
      }
      manager.update(Math.min(Math.max(delta, 0), MAX_STEP_SECONDS));
    },
    reset() {
      manager.reset();
      settled = false;
    },
    dispose() {
      manager.reset();
      for (const joint of manager.joints) {
        joint.center = null;
        joint.bone.matrixAutoUpdate = Object3D.DEFAULT_MATRIX_AUTO_UPDATE;
      }
    },
  };
}
