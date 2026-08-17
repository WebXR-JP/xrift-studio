import type { ClassicR3fMaterialShader } from "./custom-shader-contract";
import { createPrototypeProject } from "./prototype-project";
import { DEFAULT_SCENE_SETTINGS, resolveSceneSettings } from "./scene-settings";
import { sceneDocumentCodec } from "./serialization";
import {
  STILL_WIND,
  WIND_DRIVEN_UNIFORMS,
  resolveSceneWind,
  usesWindContract,
  windDrivenUniforms,
} from "./wind-contract";

/** Filesystem-free assertions for the shared wind contract. */
export function runWindContractFixtureAssertions(): void {
  assertDirection();
  assertEntityOverride();
  assertStillness();
  assertUniformPush();
  assertSceneSettingsRoundTrip();
}

function windShader(
  uniformNames: readonly string[],
): ClassicR3fMaterialShader {
  const uniforms: ClassicR3fMaterialShader["uniforms"] = {
    uTime: { kind: "number", value: 0 },
  };
  for (const name of uniformNames) {
    uniforms[name] =
      name === WIND_DRIVEN_UNIFORMS.direction
        ? { kind: "vector", value: [1, 0] }
        : { kind: "number", value: 0 };
  }
  return {
    kind: "classic-r3f",
    sourceModulePath: "studio://fixture/wind",
    vertexShader: "void main() { gl_Position = vec4(position, 1.0); }",
    fragmentShader: "void main() { gl_FragColor = vec4(1.0); }",
    uniforms,
    variants: [
      {
        name: "default",
        defines: {},
        side: "front",
        transparent: false,
        depthWrite: true,
      },
    ],
  };
}

function assertDirection(): void {
  const east = resolveSceneWind({
    ...DEFAULT_SCENE_SETTINGS.vegetation,
    windDirectionDegrees: 0,
  });
  assert(
    Math.abs(east.direction[0] - 1) < 1e-9 &&
      Math.abs(east.direction[1]) < 1e-9,
    "0 degrees must resolve to a +X unit vector",
  );
  const quarter = resolveSceneWind({
    ...DEFAULT_SCENE_SETTINGS.vegetation,
    windDirectionDegrees: 90,
  });
  assert(
    Math.abs(quarter.direction[0]) < 1e-9 &&
      Math.abs(quarter.direction[1] - 1) < 1e-9,
    "90 degrees must resolve to a +Z unit vector",
  );
  const wrapped = resolveSceneWind({
    ...DEFAULT_SCENE_SETTINGS.vegetation,
    windDirectionDegrees: 450,
  });
  assert(
    Math.abs(wrapped.direction[0] - quarter.direction[0]) < 1e-9 &&
      Math.abs(wrapped.direction[1] - quarter.direction[1]) < 1e-9,
    "Wind direction must wrap past a full turn",
  );
  const negative = resolveSceneWind({
    ...DEFAULT_SCENE_SETTINGS.vegetation,
    windDirectionDegrees: -270,
  });
  assert(
    Math.abs(negative.direction[0] - quarter.direction[0]) < 1e-9 &&
      Math.abs(negative.direction[1] - quarter.direction[1]) < 1e-9,
    "A negative wind direction must resolve the same as its positive turn",
  );
  const length = Math.hypot(wrapped.direction[0], wrapped.direction[1]);
  assert(
    Math.abs(length - 1) < 1e-9,
    "Wind direction must always be a unit vector",
  );
}

function assertEntityOverride(): void {
  const vegetation = {
    ...DEFAULT_SCENE_SETTINGS.vegetation,
    windSpeed: 0.8,
    gustStrength: 0.35,
    windDirectionDegrees: 30,
  };
  const overridden = resolveSceneWind(vegetation, {
    enabled: true,
    windSpeed: 2.5,
    gustStrength: 0.9,
  });
  assert(
    overridden.speed === 2.5 && overridden.turbulence === 0.9,
    "An Entity Wind component must override the scene rate and gustiness",
  );
  const globalDirection = resolveSceneWind(vegetation).direction;
  assert(
    overridden.direction[0] === globalDirection[0] &&
      overridden.direction[1] === globalDirection[1],
    "Direction stays global; an Entity must not steer the wind on its own",
  );
  const clamped = resolveSceneWind(vegetation, {
    enabled: true,
    windSpeed: -4,
    gustStrength: 12,
  });
  assert(
    clamped.speed === 0 && clamped.turbulence === 1,
    "Wind rate must clamp at zero and gustiness at one",
  );
}

function assertStillness(): void {
  const disabledScene = resolveSceneWind({
    ...DEFAULT_SCENE_SETTINGS.vegetation,
    enabled: false,
  });
  assert(
    disabledScene.speed === 0 && disabledScene.turbulence === 0,
    "A disabled scene wind must resolve to still air",
  );
  const disabledEntity = resolveSceneWind(DEFAULT_SCENE_SETTINGS.vegetation, {
    enabled: false,
    windSpeed: 9,
    gustStrength: 1,
  });
  assert(
    disabledEntity.speed === 0 && disabledEntity.turbulence === 0,
    "A disabled Wind component must hold its Entity still",
  );
  assert(
    STILL_WIND.speed === 0 && STILL_WIND.turbulence === 0,
    "STILL_WIND must not carry motion",
  );
}

function assertUniformPush(): void {
  const wind = resolveSceneWind({
    ...DEFAULT_SCENE_SETTINGS.vegetation,
    windSpeed: 1.5,
    gustStrength: 0.4,
    windDirectionDegrees: 0,
  });

  const full = windShader(Object.values(WIND_DRIVEN_UNIFORMS));
  assert(usesWindContract(full), "A shader declaring wind uniforms must opt in");
  const pushed = windDrivenUniforms(full, wind);
  assert(pushed.length === 3, "All three declared wind uniforms must be pushed");
  const direction = pushed.find(
    (entry) => entry.name === WIND_DRIVEN_UNIFORMS.direction,
  );
  const speed = pushed.find((entry) => entry.name === WIND_DRIVEN_UNIFORMS.speed);
  assert(
    direction?.kind === "vector2" && Math.abs(direction.value[0] - 1) < 1e-9,
    "Wind direction must be pushed as a vec2",
  );
  assert(
    speed?.kind === "number" && speed.value === 1.5,
    "Wind rate must be pushed unchanged",
  );

  const partial = windShader([WIND_DRIVEN_UNIFORMS.speed]);
  const partialPushed = windDrivenUniforms(partial, wind);
  assert(
    partialPushed.length === 1 &&
      partialPushed[0].name === WIND_DRIVEN_UNIFORMS.speed,
    "Only uniforms a shader declares may be pushed",
  );

  const none = windShader([]);
  assert(
    !usesWindContract(none) && windDrivenUniforms(none, wind).length === 0,
    "A shader without wind uniforms must be left alone",
  );
}

function assertSceneSettingsRoundTrip(): void {
  // Older scenes predate the direction, and a project that cannot reopen is
  // the failure mode this whole check exists for.
  const legacy = resolveSceneSettings({
    vegetation: {
      enabled: true,
      windStrength: 0.1,
      windSpeed: 1.2,
      gustStrength: 0.2,
    },
  });
  assert(
    legacy.vegetation.windDirectionDegrees ===
      DEFAULT_SCENE_SETTINGS.vegetation.windDirectionDegrees,
    "A scene saved before the wind direction must resolve to the default",
  );

  const prototype = createPrototypeProject("world", "wind-contract-fixture");
  const settings = resolveSceneSettings(prototype.scene.settings);
  const scene = {
    ...prototype.scene,
    settings: {
      ...settings,
      vegetation: { ...settings.vegetation, windDirectionDegrees: 210 },
    },
  };
  const decoded = sceneDocumentCodec.parse(sceneDocumentCodec.serialize(scene));
  assert(
    decoded.ok,
    `Scene with a wind direction failed validation: ${
      decoded.ok ? "" : decoded.issues.map((issue) => issue.path).join(", ")
    }`,
  );
  assert(
    decoded.ok &&
      resolveSceneSettings(decoded.document.settings).vegetation
        .windDirectionDegrees === 210,
    "The wind direction did not survive the scene document round trip",
  );
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
