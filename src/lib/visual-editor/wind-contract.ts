import type { SceneVegetationSettings } from "./scene-settings";
import type { ClassicR3fMaterialShader } from "./custom-shader-contract";
import type { VegetationWindComponent } from "./scene-document";

/**
 * The wind contract.
 *
 * A scene has one wind. The Wind component moves whole meshes; shader
 * materials that respond to wind — water waves, foliage sway — read the same
 * wind through these uniforms instead of each carrying its own speed. Water
 * drifting north while the grass leans east is the failure this prevents.
 *
 * What the wind supplies is *which way and how fast*. How strongly a given
 * surface answers stays with the material (a water preset's wave height, a
 * grass preset's bend), because those are authoring choices about that
 * surface, not properties of the air.
 *
 * `uTime` is deliberately absent: it already arrives through the shared
 * time-uniform detection every Custom Shader uses. A second clock here would
 * be a second timeline to keep in sync, and later work to drive time from a
 * server clock would have to find them both.
 */
export const WIND_DRIVEN_UNIFORMS = {
  /** vec2, horizontal unit vector the wind blows toward. */
  direction: "uWindDirection",
  /** float, wind rate. Zero means the air is still. */
  speed: "uWindSpeed",
  /** float, 0..1 gustiness. */
  turbulence: "uWindTurbulence",
} as const;

export type ResolvedWind = {
  direction: [number, number];
  speed: number;
  turbulence: number;
};

export type WindDrivenUniform =
  | { name: string; kind: "number"; value: number }
  | { name: string; kind: "vector2"; value: [number, number] };

/** Wind with no motion at all. Materials read this as "hold still". */
export const STILL_WIND: ResolvedWind = {
  direction: [1, 0],
  speed: 0,
  turbulence: 0,
};

function unitDirection(degrees: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  return [Math.cos(radians), Math.sin(radians)];
}

/**
 * Resolves the wind a surface should use.
 *
 * A Wind component on the Entity overrides the rate and gustiness for that
 * surface; direction stays global, because two directions in one scene is the
 * incoherence this contract exists to avoid. With the global wind disabled, or
 * the Entity's own component disabled, the result is dead still — a material
 * never invents motion the scene did not ask for.
 */
export function resolveSceneWind(
  vegetation: SceneVegetationSettings,
  entityWind?: Pick<
    VegetationWindComponent,
    "enabled" | "windSpeed" | "gustStrength"
  >,
): ResolvedWind {
  const direction = unitDirection(vegetation.windDirectionDegrees);
  if (!vegetation.enabled || entityWind?.enabled === false) {
    return { ...STILL_WIND, direction };
  }
  const speed = Math.max(entityWind?.windSpeed ?? vegetation.windSpeed, 0);
  const turbulence = Math.min(
    Math.max(entityWind?.gustStrength ?? vegetation.gustStrength, 0),
    1,
  );
  return { direction, speed, turbulence };
}

/**
 * The wind uniforms to push into a shader. Only uniforms the shader actually
 * declares are returned, so the editor and the compiler never invent a uniform
 * the GLSL cannot read — the same rule the sky slot follows.
 */
export function windDrivenUniforms(
  shader: ClassicR3fMaterialShader,
  wind: ResolvedWind,
): WindDrivenUniform[] {
  const driven: WindDrivenUniform[] = [];
  if (shader.uniforms[WIND_DRIVEN_UNIFORMS.direction]) {
    driven.push({
      name: WIND_DRIVEN_UNIFORMS.direction,
      kind: "vector2",
      value: [wind.direction[0], wind.direction[1]],
    });
  }
  if (shader.uniforms[WIND_DRIVEN_UNIFORMS.speed]) {
    driven.push({
      name: WIND_DRIVEN_UNIFORMS.speed,
      kind: "number",
      value: wind.speed,
    });
  }
  if (shader.uniforms[WIND_DRIVEN_UNIFORMS.turbulence]) {
    driven.push({
      name: WIND_DRIVEN_UNIFORMS.turbulence,
      kind: "number",
      value: wind.turbulence,
    });
  }
  return driven;
}

/** True when a shader opts into the wind contract at all. */
export function usesWindContract(shader: ClassicR3fMaterialShader): boolean {
  return Object.values(WIND_DRIVEN_UNIFORMS).some(
    (name) => shader.uniforms[name] !== undefined,
  );
}

/** GLSL the wind-driven presets declare, kept in one place so they agree. */
export const WIND_CONTRACT_GLSL_UNIFORMS = `uniform vec2 uWindDirection;
uniform float uWindSpeed;
uniform float uWindTurbulence;`;
