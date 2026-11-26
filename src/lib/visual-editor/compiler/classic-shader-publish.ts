import type {
  ClassicR3fMaterialShader,
  ClassicR3fShaderUniform,
} from "../custom-shader-contract";
import { lightingDrivenUniforms, resolveSceneLighting } from "../lighting-contract";
import type { SceneDocument, SceneEntity } from "../scene-document";
import { resolveSceneSettings } from "../scene-settings";
import { resolveSceneWind, windDrivenUniforms } from "../wind-contract";

/**
 * The Custom Shader descriptor a published world draws.
 *
 * The generated world and the Runtime JSON manifest both take it from here, so
 * a uniform the Scene drives holds the same value whichever way a world is
 * published.
 */

/** A value the Scene supplies in place of the one saved in the Material. */
export type PublishedDrivenUniform =
  | { kind: "number"; value: number }
  | { kind: string; value: readonly number[] };

/**
 * A number as the published world receives it: the viewport's value, with the
 * two values JSON cannot carry (a non-finite number, negative zero) as zero.
 */
function publishedUniformNumber(value: number): number {
  return Number.isFinite(value) && !Object.is(value, -0) ? value : 0;
}

/**
 * The descriptor the published world draws: the authored shader with the
 * uniforms the Scene drives replaced by the Scene's values.
 *
 * Authoring references (the preview Model, the Shader Assets the GLSL was
 * read from) are left out: the world draws from the GLSL itself.
 */
export function publishedClassicShader(
  shader: ClassicR3fMaterialShader,
  driven: ReadonlyMap<string, PublishedDrivenUniform>,
): ClassicR3fMaterialShader {
  const uniforms: Record<string, ClassicR3fShaderUniform> = {};
  for (const [name, uniform] of Object.entries(shader.uniforms)) {
    const override = driven.get(name);
    uniforms[name] = !override
      ? uniform
      : typeof override.value === "number"
        ? { kind: "number", value: publishedUniformNumber(override.value) }
        : { kind: "vector", value: override.value.map(publishedUniformNumber) };
  }
  return {
    kind: "classic-r3f",
    sourceModulePath: shader.sourceModulePath,
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    uniforms,
    variants: shader.variants,
    ...(shader.animatedTimeUniform
      ? { animatedTimeUniform: shader.animatedTimeUniform }
      : {}),
  };
}

/**
 * The descriptor of a Material worn by a mesh of `scene`.
 *
 * Wind and the key light are authored on the Scene, not on the Material, so a
 * shader that declares their uniforms is published with the Scene's values
 * rather than whatever was saved in its own. `entity` is the Entity that wears
 * the Material: its Wind component, when it has one, sets the rate and the
 * gustiness in place of the Scene's. A uniform both contracts name follows
 * the light.
 */
export function publishedSceneClassicShader(
  shader: ClassicR3fMaterialShader,
  scene: SceneDocument,
  entity?: SceneEntity,
): ClassicR3fMaterialShader {
  const entityWind = entity?.components.find(
    (component): component is Extract<typeof component, { type: "vegetation-wind" }> =>
      component.type === "vegetation-wind",
  );
  const settings = resolveSceneSettings(scene.settings);
  return publishedClassicShader(
    shader,
    new Map<string, PublishedDrivenUniform>([
      ...windDrivenUniforms(
        shader,
        resolveSceneWind(settings.vegetation, entityWind),
      ).map((entry) => [entry.name, entry] as const),
      ...lightingDrivenUniforms(
        shader,
        resolveSceneLighting(scene, settings.ambient),
      ).map((entry) => [entry.name, entry] as const),
    ]),
  );
}
