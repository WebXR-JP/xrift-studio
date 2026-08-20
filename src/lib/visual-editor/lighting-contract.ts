import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { ClassicR3fMaterialShader } from "./custom-shader-contract";
import { getTransform, type SceneDocument, type SceneEntity } from "./scene-document";
import type { SceneAmbientSettings } from "./scene-settings";

/**
 * The lighting contract.
 *
 * A scene has one key light. Shader materials that shade themselves — water
 * glints, foliage translucency — read it through these uniforms instead of each
 * carrying a private sun. Water glinting from the south-west while the scene's
 * sun sits in the north-east is the failure this prevents, and it was the state
 * of things before: the water presets shipped their own `uSunAzimuth`,
 * `uSunElevation` and `uSunColor`, so changing a scene's light did nothing to
 * the sea.
 *
 * What the scene supplies is *where the light comes from, what colour it is,
 * and how much of it there is*. How a given surface answers — a water preset's
 * reflectivity, a grass preset's translucency — stays with the material,
 * because those are authoring choices about that surface, not properties of the
 * light.
 *
 * This mirrors the wind contract deliberately. Two scene-wide facts, supplied
 * the same way, read the same way.
 */
export const LIGHTING_DRIVEN_UNIFORMS = {
  /** vec3, unit vector pointing from the surface toward the key light. */
  sunDirection: "uSunDirection",
  /** vec3, linear key light colour. */
  sunColor: "uSunColor",
  /** float, key light intensity. Zero means no direct light at all. */
  sunIntensity: "uSunIntensity",
  /** vec3, ambient colour the scene fills shadows with. */
  ambientColor: "uAmbientColor",
  /** float, ambient intensity. */
  ambientIntensity: "uAmbientIntensity",
} as const;

export type ResolvedSceneLighting = {
  sunDirection: [number, number, number];
  sunColor: [number, number, number];
  sunIntensity: number;
  ambientColor: [number, number, number];
  ambientIntensity: number;
};

export type LightingDrivenUniform =
  | { name: string; kind: "number"; value: number }
  | { name: string; kind: "vector3"; value: [number, number, number] };

/**
 * A scene with no key light: ambient only.
 *
 * The direction still points somewhere sensible so a shader that divides by it
 * does not produce a NaN, but the intensity is zero, so nothing lights from it.
 */
export const UNLIT_SCENE_LIGHTING: ResolvedSceneLighting = {
  sunDirection: [0, 1, 0],
  sunColor: [1, 1, 1],
  sunIntensity: 0,
  ambientColor: [1, 1, 1],
  ambientIntensity: 0,
};

function hexToUnitRgb(hex: string): [number, number, number] {
  const value = hex.trim().replace("#", "");
  if (value.length !== 6) return [1, 1, 1];
  const channels = [0, 2, 4].map((offset) => {
    const parsed = parseInt(value.slice(offset, offset + 2), 16);
    return Number.isFinite(parsed) ? parsed / 255 : 1;
  });
  return channels as [number, number, number];
}

/** A directional or spot light aims along its Entity's local -Z, as the runtime targets it. */
function entityLightDirection(
  scene: SceneDocument,
  entity: SceneEntity,
): [number, number, number] {
  const chain: SceneEntity[] = [];
  const visited = new Set<string>();
  let current: SceneEntity | undefined = entity;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    current = current.parentId ? scene.entities[current.parentId] : undefined;
  }

  const worldMatrix = new Matrix4();
  const localMatrix = new Matrix4();
  const quaternion = new Quaternion();
  for (const ancestor of chain.reverse()) {
    const transform = getTransform(ancestor);
    const rotation = transform?.rotation ?? [0, 0, 0];
    quaternion.setFromEuler(new Euler(rotation[0], rotation[1], rotation[2]));
    localMatrix.makeRotationFromQuaternion(quaternion);
    worldMatrix.multiply(localMatrix);
  }

  // Toward the light, not the way its rays travel: a shader's `dot(normal, sun)`
  // wants the vector that points at the source.
  const toward = new Vector3(0, 0, 1).applyMatrix4(worldMatrix).normalize();
  if (!Number.isFinite(toward.x) || toward.lengthSq() === 0) return [0, 1, 0];
  return [toward.x, toward.y, toward.z];
}

/**
 * Resolves the light a shader should use.
 *
 * The key light is the brightest enabled directional light in the scene. That
 * is a choice, not a law: a scene can hold many lights and a shader gets one
 * direction, so it takes the one that dominates the look. Point and spot lights
 * are deliberately not candidates — they light a place, not a whole surface,
 * and a sea lit from a lamp post would look worse than a sea lit from nothing.
 */
export function resolveSceneLighting(
  scene: SceneDocument,
  ambient: SceneAmbientSettings,
): ResolvedSceneLighting {
  let keyEntity: SceneEntity | undefined;
  let keyIntensity = 0;
  let keyColor = "#ffffff";

  for (const entity of Object.values(scene.entities)) {
    if (!entity.enabled) continue;
    for (const component of entity.components) {
      if (component.type !== "light" || !component.enabled) continue;
      if (component.lightType !== "directional") continue;
      if (component.intensity <= keyIntensity) continue;
      keyEntity = entity;
      keyIntensity = component.intensity;
      keyColor = component.color;
    }
  }

  return {
    sunDirection: keyEntity
      ? entityLightDirection(scene, keyEntity)
      : UNLIT_SCENE_LIGHTING.sunDirection,
    sunColor: hexToUnitRgb(keyColor),
    sunIntensity: keyIntensity,
    ambientColor: hexToUnitRgb(ambient.color),
    ambientIntensity: ambient.enabled ? Math.max(ambient.intensity, 0) : 0,
  };
}

/**
 * The lighting uniforms to push into a shader. Only uniforms the shader
 * actually declares are returned, so the editor and the compiler never invent a
 * uniform the GLSL cannot read — the same rule wind and the sky slot follow.
 */
export function lightingDrivenUniforms(
  shader: ClassicR3fMaterialShader,
  lighting: ResolvedSceneLighting,
): LightingDrivenUniform[] {
  const driven: LightingDrivenUniform[] = [];
  const vectors: ReadonlyArray<[string, [number, number, number]]> = [
    [LIGHTING_DRIVEN_UNIFORMS.sunDirection, lighting.sunDirection],
    [LIGHTING_DRIVEN_UNIFORMS.sunColor, lighting.sunColor],
    [LIGHTING_DRIVEN_UNIFORMS.ambientColor, lighting.ambientColor],
  ];
  for (const [name, value] of vectors) {
    if (shader.uniforms[name]) {
      driven.push({ name, kind: "vector3", value: [...value] });
    }
  }
  const numbers: ReadonlyArray<[string, number]> = [
    [LIGHTING_DRIVEN_UNIFORMS.sunIntensity, lighting.sunIntensity],
    [LIGHTING_DRIVEN_UNIFORMS.ambientIntensity, lighting.ambientIntensity],
  ];
  for (const [name, value] of numbers) {
    if (shader.uniforms[name]) {
      driven.push({ name, kind: "number", value });
    }
  }
  return driven;
}

/** True when a shader opts into the lighting contract at all. */
export function usesLightingContract(
  shader: ClassicR3fMaterialShader,
): boolean {
  return Object.values(LIGHTING_DRIVEN_UNIFORMS).some(
    (name) => shader.uniforms[name] !== undefined,
  );
}

/** GLSL the lighting-driven presets declare, kept in one place so they agree. */
export const LIGHTING_CONTRACT_GLSL_UNIFORMS = `uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uAmbientColor;
uniform float uAmbientIntensity;`;
