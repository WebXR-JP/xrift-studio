import {
  LIGHTING_DRIVEN_UNIFORMS,
  lightingDrivenUniforms,
  resolveSceneLighting,
  usesLightingContract,
} from "./lighting-contract";
import { WATER_SHADER_CATALOG } from "./water-shader-catalog";
import {
  TERRAIN_GRASS_FRAGMENT_SHADER,
  TERRAIN_GRASS_VERTEX_SHADER,
} from "./terrain-grass-runtime";
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

  // Grass had its own baked-in sun too — `vec3(0.4, 0.8, 0.3)` in the vertex
  // shader — so a field stayed lit from the north-west no matter where the
  // Scene's light was, and stayed at one brightness beside ground that
  // responded. Both shaders must now read the contract.
  assert(
    TERRAIN_GRASS_VERTEX_SHADER.includes("uniform vec3 uSunDirection;"),
    "The grass vertex shader does not declare the Scene's key light",
  );
  assert(
    TERRAIN_GRASS_VERTEX_SHADER.includes("normalize(uSunDirection)"),
    "The grass vertex shader does not shade from the Scene's key light",
  );
  assert(
    !TERRAIN_GRASS_VERTEX_SHADER.includes("vec3(0.4, 0.8, 0.3)"),
    "The grass vertex shader still carries its own sun direction",
  );
  for (const declaration of [
    "uniform vec3 uSunColor;",
    "uniform float uSunIntensity;",
    "uniform vec3 uAmbientColor;",
    "uniform float uAmbientIntensity;",
  ]) {
    assert(
      TERRAIN_GRASS_FRAGMENT_SHADER.includes(declaration),
      `The grass fragment shader is missing ${declaration}`,
    );
  }
  assert(
    TERRAIN_GRASS_FRAGMENT_SHADER.includes("vShade * light"),
    "The grass fragment shader does not apply the Scene's light",
  );

  // With no light in the Scene, albedo contributes nothing: an unlit surface
  // is black. A flat ambient fill breaks that — it multiplies base colour with
  // no direction and no falloff, so an unlit floor showed its own colour and
  // every shadow the key light cast was filled back in.
  assert(
    DEFAULT_SCENE_SETTINGS.ambient.enabled === false,
    "A new Scene lifts every surface before any light is placed",
  );
  const unlit = resolveSceneLighting(
    sceneWithLights([]),
    DEFAULT_SCENE_SETTINGS.ambient,
  );
  assert(
    unlit.sunIntensity === 0 && unlit.ambientIntensity === 0,
    "A Scene with no lights still reports light reaching its surfaces",
  );

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
