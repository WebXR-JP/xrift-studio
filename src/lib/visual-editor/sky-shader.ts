import type { AssetManifest, MaterialAsset } from "./asset-manifest";
import {
  isClassicR3fMaterialShader,
  validateClassicR3fMaterialShader,
  type ClassicR3fMaterialShader,
} from "./custom-shader-contract";
import type { SceneSkyboxSettings } from "./scene-settings";

/**
 * The Sky Shader slot.
 *
 * A Skybox draws an image. A Sky Shader draws the sky procedurally: the same
 * Classic R3F Custom Shader contract used by Mesh Materials, assigned to the
 * scene-wide sky mesh instead of an Entity. That keeps one authoring surface —
 * the Material Inspector edits the GLSL and the uniform values, so "how many
 * stars" is an ordinary uniform rather than a second settings schema.
 *
 * Scene Settings still owns the framing values every sky shares, so the slot
 * drives three optional uniforms from `SceneSkyboxSettings` when the shader
 * declares them. A shader that omits them simply keeps its own authored value.
 */
export const SKY_SHADER_DRIVEN_UNIFORMS = {
  /** vec3, object-space capture center. Mirrors the built-in sky's uCenter. */
  center: "uCenter",
  /** float, horizontal sky rotation in radians. */
  rotation: "uRotation",
  /** float, background brightness multiplier. */
  exposure: "uExposure",
} as const;

export type SkyShaderResolution =
  | { status: "none" }
  | { status: "ready"; asset: MaterialAsset; shader: ClassicR3fMaterialShader }
  | { status: "unavailable"; assetId: string; reason: string };

/**
 * Resolves the Material Asset assigned to the sky slot. Callers render the
 * gradient sky whenever this is not `ready`, so an unavailable shader degrades
 * to a visible sky rather than an empty background.
 */
export function resolveSkyShaderMaterial(
  assets: AssetManifest,
  materialAssetId: string | undefined,
): SkyShaderResolution {
  if (!materialAssetId) return { status: "none" };
  const asset = assets.assets[materialAssetId];
  if (!asset) {
    return {
      status: "unavailable",
      assetId: materialAssetId,
      reason: "Skybox Shaderに指定したMaterial Assetが見つかりません",
    };
  }
  if (asset.kind !== "material") {
    return {
      status: "unavailable",
      assetId: materialAssetId,
      reason: `「${asset.name}」はMaterial AssetではないためSkybox Shaderに使えません`,
    };
  }
  const shader = asset.shader;
  if (!shader || shader.kind !== "classic-r3f") {
    return {
      status: "unavailable",
      assetId: materialAssetId,
      reason: `「${asset.name}」にCustom ShaderがないためSkybox Shaderに使えません`,
    };
  }
  const diagnostics = validateClassicR3fMaterialShader(shader);
  if (diagnostics.length > 0) {
    return {
      status: "unavailable",
      assetId: materialAssetId,
      reason: `「${asset.name}」のCustom Shaderを検証できません: ${diagnostics.join("、")}`,
    };
  }
  return { status: "ready", asset, shader };
}

export type SkyShaderDrivenUniform =
  | { name: string; kind: "number"; value: number }
  | { name: string; kind: "vector3"; value: [number, number, number] };

/**
 * The Scene Settings values the sky slot pushes into the shader. Only uniforms
 * the shader actually declares are returned, so the editor and the compiler
 * never invent a uniform the GLSL cannot read.
 */
export function skyShaderDrivenUniforms(
  shader: ClassicR3fMaterialShader,
  skybox: SceneSkyboxSettings,
): SkyShaderDrivenUniform[] {
  const driven: SkyShaderDrivenUniform[] = [];
  const center =
    skybox.projection === "infinite" ? ([0, 0, 0] as const) : skybox.center;
  if (shader.uniforms[SKY_SHADER_DRIVEN_UNIFORMS.center]) {
    driven.push({
      name: SKY_SHADER_DRIVEN_UNIFORMS.center,
      kind: "vector3",
      value: [center[0], center[1], center[2]],
    });
  }
  if (shader.uniforms[SKY_SHADER_DRIVEN_UNIFORMS.rotation]) {
    driven.push({
      name: SKY_SHADER_DRIVEN_UNIFORMS.rotation,
      kind: "number",
      value: (skybox.rotationDegrees * Math.PI) / 180,
    });
  }
  if (shader.uniforms[SKY_SHADER_DRIVEN_UNIFORMS.exposure]) {
    driven.push({
      name: SKY_SHADER_DRIVEN_UNIFORMS.exposure,
      kind: "number",
      value: skybox.exposure,
    });
  }
  return driven;
}

/**
 * Texture uniforms are the one Custom Shader feature the sky slot does not
 * carry: the sky mesh is compiled outside the Mesh Renderer path that resolves
 * Texture Assets to runtime URLs. Callers report these names instead of
 * silently binding null samplers.
 */
export function skyShaderTextureUniformNames(
  shader: ClassicR3fMaterialShader,
): string[] {
  return Object.entries(shader.uniforms)
    .filter(([, uniform]) => uniform.kind === "texture")
    .map(([name]) => name);
}

/** True when a Material Asset can be assigned to the sky slot. */
export function isSkyShaderMaterialAsset(asset: unknown): boolean {
  const material = asset as MaterialAsset | undefined;
  return (
    material?.kind === "material" &&
    isClassicR3fMaterialShader(material.shader) &&
    !material.shader.sourceModelAssetId
  );
}
