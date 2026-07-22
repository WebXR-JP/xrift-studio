import type { Object3D } from "three";

export type Object3DHierarchyRepairResult = {
  removedLinks: number;
};

function removeStaleChildLink(parent: Object3D, child: Object3D): boolean {
  const childIndex = parent.children.indexOf(child);
  if (childIndex < 0) return false;
  parent.children.splice(childIndex, 1);
  // Object3D.remove() always clears child.parent, even when this is only a
  // stale duplicate link and another Object3D is the legitimate owner.
  if (child.parent === parent && !parent.children.includes(child)) {
    child.parent = null;
  }
  return true;
}

/** Remove malformed duplicate/cyclic parent-child links from imported models. */
export function repairImportedObject3DHierarchy(
  root: Object3D,
): Object3DHierarchyRepairResult {
  let removedLinks = 0;
  root.removeFromParent();
  const visited = new Set<Object3D>([root]);
  const active = new Set<Object3D>([root]);
  const pending: Array<{
    object: Object3D;
    children: Object3D[];
    nextChildIndex: number;
  }> = [{ object: root, children: [...root.children], nextChildIndex: 0 }];

  // Object3D.traverse() and a recursive visitor both overflow the JS stack for
  // deeply nested imported glTF/VRM files. Keep the same active-path cycle
  // check, but walk the tree explicitly so a malformed source can be rejected
  // or repaired without taking the editor down first.
  while (pending.length > 0) {
    const frame = pending[pending.length - 1];
    if (frame.nextChildIndex >= frame.children.length) {
      active.delete(frame.object);
      pending.pop();
      continue;
    }

    const child = frame.children[frame.nextChildIndex++];
    const candidate = child as Object3D | undefined;
    if (
      !candidate ||
      candidate === frame.object ||
      active.has(candidate) ||
      visited.has(candidate) ||
      candidate.parent !== frame.object
    ) {
      if (removeStaleChildLink(frame.object, child)) removedLinks += 1;
      continue;
    }
    visited.add(candidate);
    active.add(candidate);
    pending.push({
      object: candidate,
      children: [...candidate.children],
      nextChildIndex: 0,
    });
  }

  return { removedLinks };
}
