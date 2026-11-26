import { createElement, useMemo, type ComponentType, type ReactElement, type ReactNode } from "react";
import type { InstancedMesh, Object3D } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

// Drei's Clone re-parents Bone primitives out of its cloned source tree.
// Keep the original child lists so a later React render does not unmount them.
//
// Drei's Clone also rebuilds every node from its `type`, and three.js gives an
// InstancedMesh the type "Mesh". A model that uses EXT_mesh_gpu_instancing
// would be drawn as one copy per node, so such a model is built here too, with
// each InstancedMesh keeping its count and per-instance data.
const cloneKeys = [
  "near", "far", "color", "distance", "decay", "penumbra", "angle",
  "intensity", "skeleton", "visible", "castShadow", "receiveShadow",
  "morphTargetDictionary", "morphTargetInfluences", "name", "geometry",
  "material", "position", "rotation", "scale", "up", "userData",
  "bindMode", "bindMatrix", "bindMatrixInverse",
] as const;

type StableCloneProps = {
  object: Object3D;
  castShadow?: boolean;
  receiveShadow?: boolean;
  inject?: (object: Object3D) => ReactNode;
};

type StableNodeProps = StableCloneProps & {
  childrenByObject: WeakMap<Object3D, Object3D[]>;
};

function StableModelNode({ object, childrenByObject, inject, castShadow, receiveShadow }: StableNodeProps): ReactElement {
  const source = object as unknown as Record<string, unknown>;
  const props: Record<string, unknown> = {};
  for (const key of cloneKeys) props[key] = source[key];
  if (source.isMesh) {
    if (castShadow) props.castShadow = true;
    if (receiveShadow) props.receiveShadow = true;
  }
  const instanced = source.isInstancedMesh ? (object as InstancedMesh) : null;
  if (instanced) {
    props.args = [instanced.geometry, instanced.material, instanced.count];
    props.instanceMatrix = instanced.instanceMatrix;
    if (instanced.instanceColor) props.instanceColor = instanced.instanceColor;
  }
  const children = (childrenByObject.get(object) ?? []).map((child) =>
    (child as Object3D & { isBone?: boolean }).isBone
      ? createElement("primitive" as "div", { key: child.uuid, object: child } as never)
      : createElement(StableModelNode, { key: child.uuid, object: child, childrenByObject, inject, castShadow, receiveShadow }),
  );
  const type = instanced ? "instancedMesh" : object.type[0]!.toLowerCase() + object.type.slice(1);
  return createElement(type as "div", props, ...children, inject?.(object));
}

export function StableModelClone({ object, inject, castShadow, receiveShadow, fallback: Fallback }: StableCloneProps & { fallback: ComponentType<StableCloneProps> }) {
  const data = useMemo(() => {
    let skinned = false;
    let instanced = false;
    object.traverse((node) => {
      if ((node as Object3D & { isSkinnedMesh?: boolean }).isSkinnedMesh) skinned = true;
      if ((node as Object3D & { isInstancedMesh?: boolean }).isInstancedMesh) instanced = true;
    });
    if (!skinned && !instanced) return null;
    // Bones are attached as they are, so a skinned model needs a copy of its
    // own. An instanced model is only read: every node is built anew below.
    const root = skinned ? clone(object) : object;
    const childrenByObject = new WeakMap<Object3D, Object3D[]>();
    root.traverse((node) => childrenByObject.set(node, [...node.children]));
    return { root, childrenByObject };
  }, [object]);
  if (!data) return <Fallback object={object} inject={inject} castShadow={castShadow} receiveShadow={receiveShadow} />;
  return <StableModelNode object={data.root} childrenByObject={data.childrenByObject} inject={inject} castShadow={castShadow} receiveShadow={receiveShadow} />;
}
