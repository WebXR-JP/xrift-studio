import { _roots } from "@react-three/fiber";

/** Loaded only when a production-render test explicitly inspects the Canvas. */
export function uikitGlyphCount(): number {
  let count = 0;
  for (const root of _roots.values()) root.store.getState().scene.traverse(object => {
    if (object.constructor.name !== "InstancedGlyphMesh") return;
    count += (object as unknown as { count: number }).count;
  });
  return count;
}
