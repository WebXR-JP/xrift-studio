import type { Object3D } from "three";

export type Object3DHierarchyRepairResult = {
  removedLinks: number;
};

/** Remove malformed duplicate/cyclic parent-child links from imported models. */
export function repairImportedObject3DHierarchy(
  root: Object3D,
): Object3DHierarchyRepairResult {
  let removedLinks = 0;
  root.removeFromParent();
  const visited = new Set<Object3D>([root]);
  const active = new Set<Object3D>();

  const visit = (object: Object3D) => {
    active.add(object);
    for (const child of [...object.children]) {
      const candidate = child as Object3D | undefined;
      if (
        !candidate ||
        candidate === object ||
        active.has(candidate) ||
        visited.has(candidate) ||
        candidate.parent !== object
      ) {
        object.remove(child);
        removedLinks += 1;
        continue;
      }
      visited.add(candidate);
      visit(candidate);
    }
    active.delete(object);
  };

  visit(root);
  return { removedLinks };
}
