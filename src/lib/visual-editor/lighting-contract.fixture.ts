import {
  LIGHTING_DRIVEN_UNIFORMS,
  lightingDrivenUniforms,
  resolveSceneLighting,
  usesLightingContract,
} from "./lighting-contract";
import { WATER_SHADER_CATALOG } from "./water-shader-catalog";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  createTransformComponent,
} from "./scene-document";
import type { SceneDocument, SceneEntity } from "./scene-document";
import { DEFAULT_SCENE_SETTINGS } from "./scene-settings";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sceneWithLights(entities: SceneEntity[]): SceneDocument {
  return {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId: "fixture-scene",
    name: "fixture",
    rootEntityIds: entities.map((entity) => entity.id),
    entities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
  } as SceneDocument;
}

function lightEntity(
  id: string,
  intensity: number,
  color: string,
  rotation: [number, number, number],
  options: { enabled?: boolean; lightType?: "directional" | "point" } = {},
): SceneEntity {
  return {
    id,
    name: id,
    parentId: null,
    children: [],
    enabled: true,
    components: [
      createTransformComponent(`${id}-transform`, [0, 5, 0], rotation),
      {
        id: `${id}-light`,
        type: "light" as const,
        enabled: options.enabled ?? true,
        lightType: options.lightType ?? "directional",
        color,
        intensity,
        castShadow: false,
      },
    ],
  } as SceneEntity;
}

/** Deterministic assertions for the scene lighting contract. */
export function runLightingContractFixtureAssertions(): void {
  const ambient = DEFAULT_SCENE_SETTINGS.ambient;

  // A scene with no directional light lights nothing directly. A shader that
  // divides by the direction must still get a usable vector rather than a NaN.
  const dark = resolveSceneLighting(sceneWithLights([]), ambient);
  assert(dark.sunIntensity === 0, "An empty scene reported direct light");
  const darkLength = Math.hypot(...dark.sunDirection);
  assert(
    Math.abs(darkLength - 1) < 0.001,
    `An empty scene produced a non-unit sun direction: ${darkLength}`,
  );

  // The brightest enabled directional light is the key light. Picking anything
  // else would mean a fill light decides how the sea glints.
  const scene = sceneWithLights([
    lightEntity("fill", 0.4, "#334155", [0, 0, 0]),
    lightEntity("key", 2.6, "#ffddaa", [0, 0, 0]),
    lightEntity("brighter-but-off", 9, "#ff0000", [0, 0, 0], { enabled: false }),
    lightEntity("brighter-but-point", 9, "#00ff00", [0, 0, 0], {
      lightType: "point",
    }),
  ]);
  const lighting = resolveSceneLighting(scene, ambient);
  assert(
    lighting.sunIntensity === 2.6,
    `Expected the brightest enabled directional light, got ${lighting.sunIntensity}`,
  );
  assert(
    lighting.sunColor[0] > lighting.sunColor[2],
    "The key light colour did not come from the key light",
  );

  // An unrotated light points down -Z, so the direction toward it is +Z.
  assert(
    Math.abs(lighting.sunDirection[2] - 1) < 0.001,
    `An unrotated key light should be reached along +Z, got ${lighting.sunDirection.join(", ")}`,
  );

  // Rotating the light moves the direction with it; a shader that reads this
  // follows the scene rather than a sun of its own.
  const rotated = resolveSceneLighting(
    sceneWithLights([lightEntity("key", 1, "#ffffff", [0, Math.PI / 2, 0])]),
    ambient,
  );
  assert(
    Math.abs(rotated.sunDirection[0] - 1) < 0.001,
    `A light yawed 90 degrees should be reached along +X, got ${rotated.sunDirection.join(", ")}`,
  );

  // The water presets must actually opt in, or the contract changes nothing
  // for the Material it was built for.
  for (const entry of WATER_SHADER_CATALOG) {
    const shader = entry.shader;
    assert(
      usesLightingContract(shader),
      `Water preset ${entry.id} does not read the scene's light`,
    );
    const driven = lightingDrivenUniforms(shader, lighting);
    const names = new Set(driven.map((uniform) => uniform.name));
    for (const required of [
      LIGHTING_DRIVEN_UNIFORMS.sunDirection,
      LIGHTING_DRIVEN_UNIFORMS.sunColor,
      LIGHTING_DRIVEN_UNIFORMS.sunIntensity,
    ]) {
      assert(
        names.has(required),
        `Water preset ${entry.id} does not receive ${required}`,
      );
    }
    // The private sun is gone: a preset that still declared one would keep
    // shading from it no matter what the scene did.
    assert(
      shader.uniforms.uSunAzimuth === undefined &&
        shader.uniforms.uSunElevation === undefined,
      `Water preset ${entry.id} still carries its own sun angles`,
    );
  }

  // A shader that declares none of the uniforms receives nothing, so the
  // compiler never writes a uniform the GLSL cannot read.
  const bare = { uniforms: {} } as Parameters<typeof lightingDrivenUniforms>[0];
  assert(
    lightingDrivenUniforms(bare, lighting).length === 0,
    "A shader without the contract was handed lighting uniforms",
  );
  assert(
    !usesLightingContract(bare),
    "A shader without the contract was reported as using it",
  );
}
