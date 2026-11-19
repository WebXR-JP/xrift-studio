import { _roots } from "@react-three/fiber";
import type { Material, Mesh } from "three";

/** Scene Viewが実際に描いているMeshのうち、ライトマップを貼ったものを数える。 */
export function lightmappedMeshCount(): number {
  let count = 0;
  for (const root of _roots.values()) root.store.getState().scene.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.some(material => Boolean((material as Material & { lightMap?: unknown }).lightMap))) count++;
  });
  return count;
}
