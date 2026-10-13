import { _roots } from "@react-three/fiber";
import type { Material, Mesh, Object3D, Texture } from "three";

/** Reads the running Editor Canvas; does not create a substitute renderer. */
export function readRenderedBuiltinEntity(entityId: string) {
  for (const root of _roots.values()) {
    const state = root.store.getState();
    let target: Object3D | undefined;
    state.scene.traverse(object => {
      if (object.userData.renderedEntityId === entityId) target = object;
    });
    if (!target) continue;
    let meshes = 0, texturedMeshes = 0, vertices = 0;
    target.traverse(object => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const count = mesh.geometry.getAttribute("position")?.count ?? 0;
      if (!count) return;
      meshes++; vertices += count;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (materials.some(material => {
        const image = (material as Material & { map?: Texture }).map?.image as { width?: number; height?: number } | undefined;
        return (image?.width ?? 0) > 0 && (image?.height ?? 0) > 0;
      })) texturedMeshes++;
    });
    return { meshes, texturedMeshes, vertices, drawCalls: state.gl.info.render.calls, contextLost: state.gl.getContext().isContextLost() };
  }
  return { meshes: 0, texturedMeshes: 0, vertices: 0, drawCalls: 0, contextLost: false };
}
