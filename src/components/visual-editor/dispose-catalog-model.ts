import type * as THREE from "three";

/** Release resources owned by a one-off catalog GLTFLoader, never shared scene assets. */
export function disposeCatalogModel(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const images = new Set<unknown>();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) {
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        materials.add(material);
      }
    }
  });

  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value && typeof value === "object" && "isTexture" in value && value.isTexture) {
        textures.add(value as THREE.Texture);
      }
    }
  }
  for (const texture of textures) {
    for (const image of Array.isArray(texture.image) ? texture.image : [texture.image]) {
      images.add(image);
    }
    texture.dispose();
  }
  // GLTFLoader uses ImageBitmap where available. Texture.dispose() alone does
  // not release that CPU-side bitmap. De-duplicate images as well as textures.
  for (const image of images) {
    if (image && typeof image === "object" && "close" in image && typeof image.close === "function") {
      image.close();
    }
  }
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
