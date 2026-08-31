import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, InterleavedBuffer, InterleavedBufferAttribute, Mesh, MeshBasicMaterial, Scene, DataTexture, CompressedTexture, RGBAFormat, RGBA_S3TC_DXT1_Format, UnsignedByteType, ShaderMaterial } from "three";
import { estimateSceneVram, estimateRuntimeTextureBytes } from "./scene-vram-estimate";
import type { Texture } from "three";

function assert(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

export function runSceneVramEstimateFixtureAssertions(): void {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setIndex(new Uint16BufferAttribute([0, 1, 2], 1));
  const texture = new DataTexture(new Uint8Array(4 * 4 * 4), 4, 4, RGBAFormat, UnsignedByteType);
  texture.generateMipmaps = true;
  assert(estimateRuntimeTextureBytes(texture) === 84, "RGBA mip chain must include 4x4, 2x2 and 1x1");
  const material = new MeshBasicMaterial({ map: texture });
  const scene = new Scene();
  scene.add(new Mesh(geometry, material), new Mesh(geometry, material));
  scene.background = texture;
  const result = estimateSceneVram(scene);
  assert(result.geometryVramBytes === 42 && result.textureVramBytes === 84, "Shared geometry, materials and background textures must not multiply VRAM");
  assert(result.uncompressedTextureCount === 1 && result.uncompressedTextureVramBytes === 84 && result.compressedTextureCount === 0, "Shared uncompressed textures must be counted once");

  const interleaved = new BufferGeometry();
  const buffer = new InterleavedBuffer(new Float32Array(18), 6);
  interleaved.setAttribute("position", new InterleavedBufferAttribute(buffer, 3, 0));
  interleaved.setAttribute("normal", new InterleavedBufferAttribute(buffer, 3, 3));
  const packed = new Scene();
  packed.add(new Mesh(interleaved, material));
  assert(estimateSceneVram(packed).geometryVramBytes === 72, "Interleaved GPU buffer counted more than once");

  const compressed = new CompressedTexture([{ data: new Uint8Array(8), width: 4, height: 4 }, { data: new Uint8Array(8), width: 2, height: 2 }], 4, 4, RGBA_S3TC_DXT1_Format);
  assert(estimateRuntimeTextureBytes(compressed) === 16, "Compressed mipmaps must use block sizes rather than RGBA pixels");
  const unloaded = new DataTexture();
  const uniforms: Record<string, unknown> = { first: { value: [texture, compressed, unloaded] } };
  uniforms.cycle = uniforms;
  const custom = new ShaderMaterial();
  custom.uniforms = uniforms as ShaderMaterial["uniforms"];
  scene.add(new Mesh(geometry, custom));
  const withUniforms = estimateSceneVram(scene);
  assert(withUniforms.textureVramBytes === 100 && withUniforms.unknownVramTextures === 1, "Uniform textures or unloaded texture accounting is incorrect");
  assert(withUniforms.compressedTextureVramBytes === 16 && withUniforms.compressedTextureCount === 1 && withUniforms.uncompressedTextureVramBytes === 84 && withUniforms.uncompressedTextureCount === 1, "Compression breakdown must exclude unestimated textures and add up to the total");
  const fallback: Texture = new CompressedTexture([{ data: new Uint8Array(64), width: 4, height: 4 }], 4, 4);
  fallback.format = RGBAFormat;
  custom.uniforms.fallback = { value: fallback };
  const withFallback = estimateSceneVram(scene);
  assert(withFallback.compressedTextureVramBytes === 16 && withFallback.uncompressedTextureVramBytes === 148 && withFallback.uncompressedTextureCount === 2, "RGBA fallback from KTX2 must not be reported as GPU compressed");
  fallback.dispose();
  scene.clear();
  scene.background = null;
  assert(estimateSceneVram(scene).geometryVramBytes === 0 && estimateSceneVram(scene).textureVramBytes === 0, "Removed resources remained in the estimate");
  geometry.dispose(); interleaved.dispose(); texture.dispose(); compressed.dispose(); unloaded.dispose(); material.dispose(); custom.dispose();
}
