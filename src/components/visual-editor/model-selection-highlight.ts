import { InstancedMesh, Mesh, MeshBasicMaterial, type Material, type Object3D } from "three";
import { EDITOR_HELPER_USER_DATA } from "../../lib/visual-editor/gizmo-focus";

/** Draw the selected surfaces, including disconnected parts, without a box. */
export function attachModelSelectionHighlight(root: Object3D): () => void {
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh && !object.userData.editorHelper) meshes.push(object);
  });
  const materials = new Map<Material, MeshBasicMaterial>();
  const highlightMaterial = (source: Material) => {
    let material = materials.get(source);
    if (material) return material;
    const textured = source as MeshBasicMaterial;
    material = new MeshBasicMaterial({
      color: "#a78bfa",
      transparent: true,
      opacity: 0.38,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: source.side,
      // Preserve cutouts such as leaves and fences instead of filling quads.
      map: textured.map ?? null,
      alphaMap: textured.alphaMap ?? null,
      alphaTest: source.alphaTest,
      toneMapped: false,
    });
    material.visible = source.visible;
    materials.set(source, material);
    return material;
  };
  const overlays = meshes.map((source) => {
    // Retain SkinnedMesh / InstancedMesh data and share geometry. Parenting to
    // the source follows its transform and visibility without a per-frame walk.
    const overlay = source.clone(false);
    overlay.name = "Editor model selection";
    overlay.position.set(0, 0, 0);
    overlay.quaternion.identity();
    overlay.scale.set(1, 1, 1);
    overlay.matrix.identity();
    overlay.matrixAutoUpdate = true;
    overlay.morphTargetInfluences = source.morphTargetInfluences;
    overlay.material = Array.isArray(source.material)
      ? source.material.map(highlightMaterial)
      : highlightMaterial(source.material);
    overlay.userData = { ...EDITOR_HELPER_USER_DATA };
    overlay.raycast = () => {};
    overlay.castShadow = false;
    overlay.receiveShadow = false;
    overlay.renderOrder = source.renderOrder + 1;
    source.add(overlay);
    return overlay;
  });
  return () => {
    overlays.forEach((overlay) => {
      overlay.removeFromParent();
      if (overlay instanceof InstancedMesh) overlay.dispose();
    });
    materials.forEach((material) => material.dispose());
  };
}
