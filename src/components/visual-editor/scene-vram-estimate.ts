import type { BufferAttribute, BufferGeometry, InterleavedBufferAttribute, Material, Scene, Texture } from "three";
import { getByteLength } from "three/src/extras/TextureUtils.js";

export type SceneVramEstimate = {
  geometryVramBytes: number;
  textureVramBytes: number;
  unknownVramTextures: number;
};

/** Referenced scene resources, not total driver allocation or download sizes. */
export function estimateSceneVram(scene: Scene): SceneVramEstimate {
  const geometries = new Set<BufferGeometry>();
  const buffers = new Set<object>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const visited = new Set<object>();
  let geometryVramBytes = 0;

  const collectTextures = (value: unknown): void => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if ((value as Texture).isTexture) {
      const texture = value as Texture;
      if (!texture.isRenderTargetTexture) textures.add(texture);
      return;
    }
    // Only descend through uniform structs/arrays, never through scene graphs.
    if (Array.isArray(value)) value.forEach(collectTextures);
    else if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
      Object.values(value).forEach(collectTextures);
    }
  };
  const addAttribute = (attribute: BufferAttribute | InterleavedBufferAttribute | null | undefined) => {
    if (!attribute) return;
    const buffer = "isInterleavedBufferAttribute" in attribute ? attribute.data : attribute;
    if (buffers.has(buffer)) return;
    buffers.add(buffer);
    geometryVramBytes += buffer.array?.byteLength ?? 0;
  };

  scene.traverse((object) => {
    const renderable = object as typeof object & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
      instanceMatrix?: BufferAttribute;
      instanceColor?: BufferAttribute;
      skeleton?: { boneTexture?: Texture | null };
    };
    const geometry = renderable.geometry;
    if (geometry && !geometries.has(geometry)) {
      geometries.add(geometry);
      Object.values(geometry.attributes).forEach(addAttribute);
      addAttribute(geometry.index);
      Object.values(geometry.morphAttributes).forEach((attributes) => attributes?.forEach(addAttribute));
    }
    addAttribute(renderable.instanceMatrix);
    addAttribute(renderable.instanceColor);
    collectTextures(renderable.skeleton?.boneTexture);
    const list = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
    for (const material of list) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      Object.values(material).forEach(collectTextures);
    }
  });
  collectTextures(scene.background);
  collectTextures(scene.environment);
  let textureVramBytes = 0;
  let unknownVramTextures = 0;
  for (const texture of textures) {
    const bytes = estimateRuntimeTextureBytes(texture);
    if (bytes === null) unknownVramTextures++;
    else textureVramBytes += bytes;
  }
  return { geometryVramBytes, textureVramBytes, unknownVramTextures };
}

type TextureImage = {
  data?: unknown;
  width?: number;
  height?: number;
  videoWidth?: number;
  videoHeight?: number;
  depth?: number;
  image?: TextureImage;
  mipmaps?: TextureImage[];
};

export function estimateRuntimeTextureBytes(texture: Texture): number | null {
  const faces: TextureImage[] = Array.isArray(texture.image) ? texture.image : [texture.image];
  let total = 0;
  try {
    for (const face of faces) {
      if (!face) return null;
      const image = face.image ?? face;
      if (image.data === null) return null;
      const levels = face.mipmaps?.length ? face.mipmaps : texture.mipmaps;
      if (levels?.length) {
        for (const level of levels as TextureImage[]) {
          if (!level.width || !level.height) return null;
          total += getByteLength(level.width, level.height, texture.format, texture.type) * (level.depth ?? image.depth ?? 1);
        }
      } else {
        let width = image.videoWidth ?? image.width;
        let height = image.videoHeight ?? image.height;
        let depth = image.depth ?? 1;
        if (!width || !height) return null;
        const is3D = "isData3DTexture" in texture && texture.isData3DTexture;
        do {
          total += getByteLength(width, height, texture.format, texture.type) * depth;
          if (!texture.generateMipmaps || (width === 1 && height === 1 && (!is3D || depth === 1))) break;
          width = Math.max(1, Math.floor(width / 2));
          height = Math.max(1, Math.floor(height / 2));
          if (is3D) depth = Math.max(1, Math.floor(depth / 2));
        } while (true);
      }
    }
  } catch {
    return null; // Unsupported GPU format: do not pretend it costs zero.
  }
  return Number.isFinite(total) && total > 0 ? total : null;
}
