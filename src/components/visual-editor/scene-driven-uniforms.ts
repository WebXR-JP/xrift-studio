import { Vector2, Vector3, type ShaderMaterial } from "three";
import {
  lightingDrivenUniforms,
  windDrivenUniforms,
  type ClassicR3fMaterialShader,
  type ResolvedSceneLighting,
  type ResolvedWind,
} from "../../lib/visual-editor";

/**
 * Writes the values a Scene drives into a Custom Shader Material.
 *
 * Wind and the key light are authored on the Scene. The compiler writes them
 * into the descriptor a published world draws; the Scene View writes them into
 * the Material it draws, through these two functions, for a primitive, a
 * terrain and a Model alike. Only uniforms the shader declares are touched.
 */

/** The Scene's wind, for a shader that declares the wind uniforms. */
export function applyWindDrivenUniforms(
  material: ShaderMaterial,
  shader: ClassicR3fMaterialShader,
  wind: ResolvedWind,
): void {
  for (const entry of windDrivenUniforms(shader, wind)) {
    const uniform = material.uniforms[entry.name];
    if (!uniform) continue;
    if (entry.kind === "number") {
      uniform.value = entry.value;
      continue;
    }
    const current = uniform.value;
    if (current instanceof Vector2) {
      current.set(entry.value[0], entry.value[1]);
    } else {
      uniform.value = new Vector2(entry.value[0], entry.value[1]);
    }
  }
  material.needsUpdate = true;
}

/** The Scene's key light and ambient, for a shader that declares them. */
export function applyLightingDrivenUniforms(
  material: ShaderMaterial,
  shader: ClassicR3fMaterialShader,
  lighting: ResolvedSceneLighting,
): void {
  for (const entry of lightingDrivenUniforms(shader, lighting)) {
    const uniform = material.uniforms[entry.name];
    if (!uniform) continue;
    if (entry.kind === "number") {
      uniform.value = entry.value;
      continue;
    }
    const current = uniform.value;
    if (current instanceof Vector3) {
      current.set(entry.value[0], entry.value[1], entry.value[2]);
    } else {
      uniform.value = new Vector3(
        entry.value[0],
        entry.value[1],
        entry.value[2],
      );
    }
  }
  material.needsUpdate = true;
}
