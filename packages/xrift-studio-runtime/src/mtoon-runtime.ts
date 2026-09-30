import { MToonMaterial } from "@pixiv/three-vrm";
import {
  AdditiveBlending, BackSide, BufferGeometry, Color, DoubleSide, FrontSide, InstancedMesh,
  Material, Matrix3, Mesh, MultiplyBlending, NormalBlending, SkinnedMesh,
  SubtractiveBlending, Vector2, type Object3D, type Texture,
} from "three";
import { MTOON_DEFAULTS, type MToonMaterialSettings } from "./mtoon-contract.js";

/** Structural contract shared by authoring and emitted Material components. */
export type MToonSurfaceProperties = {
  pbrMetallicRoughness: { baseColorFactor: [number, number, number, number] };
  emissiveFactor: [number, number, number];
  normalTexture?: { scale?: number };
  alphaMode: "OPAQUE" | "MASK" | "BLEND";
  alphaCutoff: number;
  doubleSided: boolean;
  blending?: "normal" | "additive" | "multiply" | "subtractive";
  depthWrite?: "auto" | "on" | "off";
  alphaToCoverage?: boolean;
  opacityChannel?: "r" | "g" | "b" | "a";
  extensions: {
    VRMC_materials_mtoon?: MToonMaterialSettings;
    KHR_materials_emissive_strength?: { emissiveStrength: number };
  };
};

export type MToonMaterialTextures = {
  baseColorMap?: Texture;
  normalMap?: Texture;
  emissiveMap?: Texture;
  opacityMap?: Texture;
  shadeMultiplyMap?: Texture;
  outlineWidthMultiplyMap?: Texture;
  shadingShiftMap?: Texture;
  matcapMap?: Texture;
  rimMultiplyMap?: Texture;
  uvAnimationMaskMap?: Texture;
};

type OpacityBinding = { texture: Texture; channel: "r" | "g" | "b" | "a" };
const opacityBindings = new WeakMap<MToonMaterial, OpacityBinding>();

/** three-vrm uses UV0; retain Studio's per-slot glTF texture coordinates. */
function bindTextureUvChannels(material: MToonMaterial, textures: MToonMaterialTextures): void {
  const entries: Array<[string, Texture | undefined]> = [
    ["map", textures.baseColorMap], ["normalMap", textures.normalMap],
    ["emissiveMap", textures.emissiveMap], ["shadeMultiplyTexture", textures.shadeMultiplyMap],
    ["outlineWidthMultiplyTexture", textures.outlineWidthMultiplyMap], ["xriftOpacity", textures.opacityMap],
    ["shadingShiftTexture", textures.shadingShiftMap], ["rimMultiplyTexture", textures.rimMultiplyMap],
    ["uvAnimationMaskTexture", textures.uvAnimationMaskMap],
  ];
  const alternate = entries.filter((entry): entry is [string, Texture] => !!entry[1] && entry[1].channel > 0);
  if (!alternate.length) return;
  const channels = [...new Set(alternate.map(([, texture]) => texture.channel))];
  const declarations = channels.map(channel => `varying vec2 xriftUv${channel};`).join("\n");
  material.vertexShader = `${declarations}\n${material.vertexShader}`.replace("void main() {",
    `void main() {\n${channels.map(channel => `xriftUv${channel} = uv${channel};`).join("\n")}`);
  material.fragmentShader = `${declarations}\nvec2 xriftAnimatedUv(vec2 value, float mask) {
    float c = cos(uvAnimationRotationPhase * mask);
    float s = sin(uvAnimationRotationPhase * mask);
    return mat2(c, -s, s, c) * (value - 0.5) + 0.5 + vec2(uvAnimationScrollXOffset, uvAnimationScrollYOffset) * mask;
  }\n${material.fragmentShader}`;
  // Move the helper below its uniforms so GLSL names are declared first.
  const helperStart = material.fragmentShader.indexOf("vec2 xriftAnimatedUv");
  const helperEnd = material.fragmentShader.indexOf("}\n", helperStart) + 2;
  const helper = material.fragmentShader.slice(helperStart, helperEnd);
  material.fragmentShader = material.fragmentShader.slice(0, helperStart) + material.fragmentShader.slice(helperEnd);
  material.fragmentShader = material.fragmentShader.replace("void main() {", `${helper}\nvoid main() {`);
  material.defines.MTOON_USE_UV = true;
  material.defines.MTOON_UVS_VERTEX_ONLY = false;
  // Match Three's own empty macro when it also enables this channel for a map.
  for (const channel of channels) material.defines[`USE_UV${channel}`] = "";
  for (const [name, texture] of alternate) {
    const channel = texture.channel;
    if (name === "outlineWidthMultiplyTexture") {
      material.vertexShader = material.vertexShader.replace(/(outlineWidthMultiplyTextureUvTransform\s*\*\s*vec3\(\s*)vUv(\s*,)/g, `$1xriftUv${channel}$2`);
    } else if (name === "uvAnimationMaskTexture") {
      material.fragmentShader = material.fragmentShader.replace(/(uvAnimationMaskTextureUvTransform\s*\*\s*vec3\(\s*)uv(\s*,)/g, `$1xriftUv${channel}$2`);
    } else {
      const transform = name === "xriftOpacity" ? "xriftOpacityUvTransform" : `${name}UvTransform`;
      material.fragmentShader = material.fragmentShader.replace(new RegExp(`(${transform}\\s*\\*\\s*vec3\\(\\s*)uv(\\s*,)`, "g"), `$1xriftAnimatedUv(xriftUv${channel}, uvAnimMask)$2`);
    }
  }
  const cacheKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${cacheKey()}:xrift-uv-${alternate.map(([name, texture]) => `${name}:${texture.channel}`).join(",")}`;
}

// MToon uses its own UV/shading chunks. Keep Studio's separate Opacity Map
// before alpha test, without replacing the upstream toon lighting shader.
function bindOpacityMap(material: MToonMaterial, binding: OpacityBinding): void {
  opacityBindings.set(material, binding);
  material.defines.MTOON_USE_UV = true;
  material.defines.MTOON_UVS_VERTEX_ONLY = false;
  const uniforms = material.uniforms as typeof material.uniforms & Record<string, { value: unknown }>;
  uniforms.xriftOpacityMap = { value: binding.texture };
  uniforms.xriftOpacityUvTransform = { value: new Matrix3() };
  if (!material.fragmentShader.includes("uniform sampler2D xriftOpacityMap;")) material.fragmentShader = material.fragmentShader.replace(
    "uniform float opacity;",
    "uniform float opacity;\nuniform sampler2D xriftOpacityMap;\nuniform mat3 xriftOpacityUvTransform;",
  ).replace(
    "#include <alphatest_fragment>",
    `diffuseColor.a *= texture2D(xriftOpacityMap, (xriftOpacityUvTransform * vec3(uv, 1.0)).xy).${binding.channel};\n#include <alphatest_fragment>`,
  );
  const update = material.update.bind(material);
  material.update = (delta: number) => {
    if (binding.texture.matrixAutoUpdate) binding.texture.updateMatrix();
    (uniforms.xriftOpacityUvTransform!.value as Matrix3).copy(binding.texture.matrix);
    update(delta);
  };
  const cacheKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${cacheKey()}:xrift-opacity-${binding.channel}`;
}

/** Uses three-vrm's shader with canonical linear glTF colors. */
export function createMToonMaterial(
  properties: MToonSurfaceProperties,
  textures: MToonMaterialTextures = {},
  doubleSided = properties.doubleSided,
): MToonMaterial {
  const settings = { ...MTOON_DEFAULTS, ...properties.extensions.VRMC_materials_mtoon };
  const [r, g, b, alpha] = properties.pbrMetallicRoughness.baseColorFactor;
  const transparent = properties.alphaMode === "BLEND" ||
    (properties.blending !== undefined && properties.blending !== "normal");
  const depthWrite = properties.depthWrite === "on" ? true : properties.depthWrite === "off" ? false :
    properties.alphaMode !== "BLEND" || settings.transparentWithZWrite;
  const material = new MToonMaterial({
    color: new Color(r, g, b),
    opacity: properties.alphaMode === "OPAQUE" ? 1 : alpha,
    transparent,
    depthWrite,
    alphaTest: properties.alphaMode === "MASK" ? properties.alphaCutoff : 0,
    alphaToCoverage: properties.alphaToCoverage ?? false,
    blending: { normal: NormalBlending, additive: AdditiveBlending, multiply: MultiplyBlending, subtractive: SubtractiveBlending }[properties.blending ?? "normal"],
    side: doubleSided ? DoubleSide : FrontSide,
    ...(textures.baseColorMap ? { map: textures.baseColorMap } : {}),
    ...(textures.normalMap ? { normalMap: textures.normalMap } : {}),
    normalScale: new Vector2(properties.normalTexture?.scale ?? 1, properties.normalTexture?.scale ?? 1),
    emissive: new Color(...properties.emissiveFactor),
    emissiveIntensity: properties.extensions.KHR_materials_emissive_strength?.emissiveStrength ?? 1,
    ...(textures.emissiveMap ? { emissiveMap: textures.emissiveMap } : {}),
    shadeColorFactor: new Color(...settings.shadeColorFactor),
    ...(textures.shadeMultiplyMap ? { shadeMultiplyTexture: textures.shadeMultiplyMap } : {}),
    shadingShiftFactor: settings.shadingShiftFactor,
    shadingToonyFactor: settings.shadingToonyFactor,
    giEqualizationFactor: settings.giEqualizationFactor,
    ...(textures.shadingShiftMap ? { shadingShiftTexture: textures.shadingShiftMap } : {}),
    shadingShiftTextureScale: settings.shadingShiftTexture?.scale ?? 1,
    matcapFactor: new Color(...settings.matcapFactor),
    ...(textures.matcapMap ? { matcapTexture: textures.matcapMap } : {}),
    parametricRimColorFactor: new Color(...settings.parametricRimColorFactor),
    ...(textures.rimMultiplyMap ? { rimMultiplyTexture: textures.rimMultiplyMap } : {}),
    rimLightingMixFactor: settings.rimLightingMixFactor,
    parametricRimFresnelPowerFactor: settings.parametricRimFresnelPowerFactor,
    parametricRimLiftFactor: settings.parametricRimLiftFactor,
    outlineWidthMode: settings.outlineWidthMode,
    outlineWidthFactor: settings.outlineWidthFactor,
    ...(textures.outlineWidthMultiplyMap ? { outlineWidthMultiplyTexture: textures.outlineWidthMultiplyMap } : {}),
    outlineColorFactor: new Color(...settings.outlineColorFactor),
    outlineLightingMixFactor: settings.outlineLightingMixFactor,
    ...(textures.uvAnimationMaskMap ? { uvAnimationMaskTexture: textures.uvAnimationMaskMap } : {}),
    uvAnimationScrollXSpeedFactor: settings.uvAnimationScrollXSpeedFactor,
    uvAnimationScrollYSpeedFactor: settings.uvAnimationScrollYSpeedFactor,
    uvAnimationRotationSpeedFactor: settings.uvAnimationRotationSpeedFactor,
    v0CompatShade: settings.extras?.xriftVrm0CompatShade ?? false,
    ignoreVertexColor: false,
  });
  if (textures.opacityMap) bindOpacityMap(material, { texture: textures.opacityMap, channel: properties.opacityChannel ?? "a" });
  bindTextureUvChannels(material, textures);
  // Material assets can be shared by painted models and unpainted primitives.
  // Enable the color attribute only for the geometry being drawn, so models
  // retain GLB COLOR_0 without requesting a missing attribute on other meshes.
  material.onBeforeRender = (_renderer: unknown, _scene: unknown, _camera: unknown, geometry: BufferGeometry) => {
    const vertexColors = geometry.hasAttribute("color");
    if (material.vertexColors !== vertexColors) {
      material.vertexColors = vertexColors;
      material.needsUpdate = true;
    }
    material.update(0);
  };
  material.update(0);
  material.userData.xriftMToonRenderOrder = transparent ? (settings.transparentWithZWrite ? 0 : 19) + settings.renderQueueOffsetNumber : 0;
  return material;
}

const OUTLINE_KEY = "xriftMToonOutline";
const outlinesByMesh = new WeakMap<Mesh, () => void>();
const sourceRenderOrders = new WeakMap<Mesh, number>();
const isMToon = (material: Material): material is MToonMaterial =>
  (material as MToonMaterial).isMToonMaterial === true;

/** Remove three-vrm's generated outline groups before applying authored slots. */
export function removeNativeMToonOutlines(root: Object3D): void {
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !Array.isArray(mesh.material)) return;
    const originals = mesh.material;
    const kept = originals.map((material, index) => ({ material, index })).filter(({ material }) =>
      !isMToon(material) || !(material as MToonMaterial).isOutline);
    if (kept.length === originals.length) return;
    const indices = new Map(kept.map(({ index }, current) => [index, current]));
    const source = mesh.geometry;
    // Share buffer attributes; only group metadata belongs to this mesh.
    const geometry = new BufferGeometry();
    geometry.index = source.index;
    geometry.attributes = { ...source.attributes };
    geometry.morphAttributes = { ...source.morphAttributes };
    geometry.morphTargetsRelative = source.morphTargetsRelative;
    geometry.drawRange = { ...source.drawRange };
    geometry.boundingBox = source.boundingBox?.clone() ?? null;
    geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
    geometry.groups = source.groups.flatMap(group => {
      const materialIndex = indices.get(group.materialIndex ?? 0);
      return materialIndex === undefined ? [] : [{ ...group, materialIndex }];
    });
    mesh.geometry = geometry;
    mesh.material = kept.length === 1 ? kept[0]!.material : kept.map(({ material }) => material);
  });
}

/**
 * Outline passes share the original geometry, skeleton and morph weights.
 * Material arrays keep their group indices; unrelated slots never get an
 * outline. Generated children are excluded from picking and later traversal.
 */
export function attachMToonOutlines(root: Object3D): { dispose(): void } {
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if ((object as Mesh).isMesh && !object.userData[OUTLINE_KEY]) meshes.push(object as Mesh);
  });
  const cleanups: Array<() => void> = [];
  for (const mesh of meshes) {
    outlinesByMesh.get(mesh)?.();
    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const orders = sourceMaterials.map(material => material.userData.xriftMToonRenderOrder).filter((value): value is number => typeof value === "number");
    if (orders.length) {
      if (!sourceRenderOrders.has(mesh)) sourceRenderOrders.set(mesh, mesh.renderOrder);
      mesh.renderOrder = Math.max(...orders);
    } else if (sourceRenderOrders.has(mesh)) {
      mesh.renderOrder = sourceRenderOrders.get(mesh)!;
      sourceRenderOrders.delete(mesh);
    }
    if (!sourceMaterials.some((material) => {
      const toon = material as MToonMaterial;
      return isMToon(material) && !toon.isOutline && toon.outlineWidthMode !== "none" && toon.outlineWidthFactor > 0;
    })) continue;
    const ownedMaterials = sourceMaterials.map((source) => {
      const toon = source as MToonMaterial;
      if (!isMToon(source) || toon.isOutline || toon.outlineWidthMode === "none" || toon.outlineWidthFactor <= 0) {
        const hidden = new Material();
        hidden.visible = false;
        return hidden;
      }
      const outline = toon.clone();
      outline.uniforms = toon.uniforms;
      outline.name = `${source.name} (Outline)`;
      outline.isOutline = true;
      outline.side = BackSide;
      // MToon's outline setter regenerates its defines. Retain the alternate
      // attributes used by Studio's per-slot texture coordinates.
      for (const [key, value] of Object.entries(toon.defines)) {
        if (/^USE_UV[1-3]$/.test(key)) outline.defines[key] = value;
      }
      // ShaderMaterial.copy clones uniforms, while MToon explicitly retains
      // its texture references. Retain our extra alpha sampler as well.
      const opacity = opacityBindings.get(toon);
      if (opacity) {
        // clone already copied the patched GLSL; install only the binding.
        bindOpacityMap(outline, opacity);
      }
      outline.onBeforeRender = () => outline.update(0);
      const cacheKey = outline.customProgramCacheKey.bind(outline);
      let shaderHash = 2166136261;
      for (const character of outline.vertexShader + outline.fragmentShader) shaderHash = Math.imul(shaderHash ^ character.charCodeAt(0), 16777619);
      outline.customProgramCacheKey = () => `${cacheKey()}:xrift-${shaderHash >>> 0}`;
      return outline;
    });
    const outlineMaterials = Array.isArray(mesh.material) ? ownedMaterials : ownedMaterials[0]!;
    let outlineMesh: Mesh;
    if ((mesh as SkinnedMesh).isSkinnedMesh) {
      const source = mesh as SkinnedMesh;
      const skinned = new SkinnedMesh(mesh.geometry, outlineMaterials);
      skinned.bindMode = source.bindMode;
      skinned.skeleton = source.skeleton;
      skinned.bindMatrix.copy(source.bindMatrix);
      skinned.bindMatrixInverse.copy(source.bindMatrixInverse);
      outlineMesh = skinned;
    } else if ((mesh as InstancedMesh).isInstancedMesh) {
      const source = mesh as InstancedMesh;
      const instanced = new InstancedMesh(mesh.geometry, outlineMaterials, source.count);
      instanced.instanceMatrix = source.instanceMatrix;
      instanced.morphTexture = source.morphTexture;
      instanced.count = source.count;
      outlineMesh = instanced;
    } else {
      outlineMesh = new Mesh(mesh.geometry, outlineMaterials);
    }
    outlineMesh.name = `${mesh.name} (MToon Outline)`;
    outlineMesh.userData[OUTLINE_KEY] = true;
    outlineMesh.morphTargetDictionary = mesh.morphTargetDictionary;
    outlineMesh.morphTargetInfluences = mesh.morphTargetInfluences;
    outlineMesh.frustumCulled = mesh.frustumCulled;
    outlineMesh.renderOrder = mesh.renderOrder;
    outlineMesh.layers.mask = mesh.layers.mask;
    outlineMesh.raycast = () => {};
    mesh.add(outlineMesh);
    const dispose = () => {
      mesh.remove(outlineMesh);
      ownedMaterials.forEach((material) => material.dispose());
      if (outlinesByMesh.get(mesh) === dispose) outlinesByMesh.delete(mesh);
    };
    outlinesByMesh.set(mesh, dispose);
    cleanups.push(() => { if (outlinesByMesh.get(mesh) === dispose) dispose(); });
  }
  return { dispose: () => cleanups.forEach((cleanup) => cleanup()) };
}

const materialFrames = new WeakMap<Material, { number: number; source?: object }>();

/** Advance each surface once; outline passes share the surface uniforms. */
export function updateMToonMaterials(root: Object3D, delta: number, frameNumber?: number, frameSource?: object): void {
  const updated = new Set<Material>();
  root.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || object.userData[OUTLINE_KEY]) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (isMToon(material) && !updated.has(material) && !(material as MToonMaterial).isOutline) {
        const previous = materialFrames.get(material);
        if (frameNumber !== undefined && previous?.number === frameNumber && previous.source === frameSource) continue;
        if (frameNumber !== undefined) materialFrames.set(material, { number: frameNumber, source: frameSource });
        (material as MToonMaterial).update(delta);
        updated.add(material);
      }
    }
  });
}
