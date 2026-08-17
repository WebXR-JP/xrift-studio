import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  type AssetManifest,
} from "./asset-manifest";
import { compileVisualProject } from "./compiler/compile";
import { isClassicR3fMaterialShader } from "./custom-shader-contract";
import { applyWaterShaderCatalogInstall } from "./external-store";
import { createPrototypeProject } from "./prototype-project";
import { BUILTIN_PRIMITIVE_CREATION_IDS } from "./creation-catalog";
import { addBuiltinPrimitiveEntity } from "./scene-document";
import { resolveSceneSettings } from "./scene-settings";
import {
  WATER_SHADER_CATALOG,
  applyWaterShaderParameters,
  defaultWaterShaderParameterValues,
  getWaterShaderCatalogEntry,
} from "./water-shader-catalog";
import {
  WIND_DRIVEN_UNIFORMS,
  resolveSceneWind,
  usesWindContract,
} from "./wind-contract";

/**
 * Filesystem-free assertions for the Water catalog: preset integrity, the
 * wind contract wiring, the store's parameter edits and the compiled World.
 */
export function runWaterShaderFixtureAssertions(): void {
  assertCatalogIntegrity();
  assertParameterEditing();
  assertCatalogInstall();
  assertCompiledWorld();
}

function emptyManifest(): AssetManifest {
  return {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: {},
    folders: {},
  };
}

function assertCatalogIntegrity(): void {
  assert(WATER_SHADER_CATALOG.length > 0, "Water catalog is empty");
  const ids = new Set<string>();
  for (const entry of WATER_SHADER_CATALOG) {
    assert(!ids.has(entry.id), `Duplicate Water entry id: ${entry.id}`);
    ids.add(entry.id);
    assert(
      isClassicR3fMaterialShader(entry.shader),
      `Water「${entry.id}」is not a valid Classic R3F shader`,
    );
    // Every preset must ride the shared wind, or a scene ends up with water
    // and foliage moving to different air.
    assert(
      usesWindContract(entry.shader),
      `Water「${entry.id}」does not take part in the wind contract`,
    );
    for (const uniform of Object.values(WIND_DRIVEN_UNIFORMS)) {
      assert(
        entry.shader.fragmentShader.includes(uniform),
        `Water「${entry.id}」declares ${uniform} but never reads it`,
      );
    }
    assert(
      entry.shader.variants.every((variant) => variant.transparent),
      `Water「${entry.id}」must be transparent`,
    );
    assert(
      entry.shader.fragmentShader.includes("xriftWaterGerstner"),
      `Water「${entry.id}」does not use the Gerstner waves`,
    );
    assert(
      entry.shader.animatedTimeUniform === "uTime",
      `Water「${entry.id}」must animate through the shared time uniform`,
    );
    for (const parameter of entry.parameters) {
      const uniform = entry.shader.uniforms[parameter.uniform];
      assert(
        uniform !== undefined && uniform.kind === parameter.kind,
        `Water「${entry.id}」parameter ${parameter.uniform} does not match a uniform`,
      );
      assert(
        entry.shader.fragmentShader.includes(parameter.uniform),
        `Water「${entry.id}」fragment stage never reads ${parameter.uniform}`,
      );
      if (parameter.kind === "number") {
        assert(
          parameter.min < parameter.max && parameter.step > 0,
          `Water「${entry.id}」parameter ${parameter.uniform} has an unusable range`,
        );
        assert(
          uniform.kind === "number" &&
            uniform.value >= parameter.min &&
            uniform.value <= parameter.max,
          `Water「${entry.id}」default ${parameter.uniform} is outside its own range`,
        );
      }
    }
    // Gerstner swell alone leaves a large plane smooth between the crests, so
    // every preset must also carry the tiled ripple detail and let the author
    // set its density.
    for (const uniform of ["uDetailScale", "uDetailStrength"]) {
      assert(
        entry.parameters.some((parameter) => parameter.uniform === uniform),
        `Water「${entry.id}」does not expose ${uniform}`,
      );
    }
    assert(
      entry.shader.fragmentShader.includes("xriftWaterDetailNormal"),
      `Water「${entry.id}」declares tiling detail it never draws`,
    );
    const detailStrength = entry.shader.uniforms.uDetailStrength;
    assert(
      detailStrength?.kind === "number" && detailStrength.value > 0,
      `Water「${entry.id}」ships with its ripple detail switched off`,
    );
    // The tiling is in world units. Reading UVs here would stretch the ripples
    // across a scaled plane instead of repeating them.
    assert(
      entry.shader.fragmentShader.includes("vWorldPosition.xz, uDetailScale"),
      `Water「${entry.id}」does not tile its detail in world space`,
    );
    // The layer count is an actual count, so its range must be whole numbers.
    const layers = entry.parameters.find(
      (parameter) => parameter.uniform === "uWaveLayers",
    );
    assert(
      layers?.kind === "number" && layers.step === 1 && layers.max === 4,
      `Water「${entry.id}」must expose the wave layer count as whole layers`,
    );
  }
  assert(
    getWaterShaderCatalogEntry("calm-lake")?.label === "Calm Lake" &&
      getWaterShaderCatalogEntry("nope") === undefined,
    "getWaterShaderCatalogEntry did not resolve presets correctly",
  );
}

function assertParameterEditing(): void {
  const entry = getWaterShaderCatalogEntry("ocean-waves");
  if (!entry) throw new Error("ocean-waves preset is missing");
  const defaults = defaultWaterShaderParameterValues(entry);
  assert(
    typeof defaults.uWaveLayers === "number" &&
      typeof defaults.uDeepColor === "string",
    "Water defaults did not read the preset uniform values",
  );
  const edited = applyWaterShaderParameters(entry, {
    uWaveLayers: 9,
    uDeepColor: "#0A1B2C",
    uNotAUniform: 1,
  });
  const layers = edited.uniforms.uWaveLayers;
  const deep = edited.uniforms.uDeepColor;
  assert(
    layers?.kind === "number" && layers.value === 4,
    "Wave layers must clamp to the four the shader actually draws",
  );
  assert(
    deep?.kind === "color" && deep.value === "#0a1b2c",
    "Water colour edits must be normalized",
  );
  assert(
    edited.uniforms.uNotAUniform === undefined,
    "Water accepted an unknown uniform from the store",
  );
  assert(
    entry.shader.uniforms.uWaveLayers?.kind === "number" &&
      entry.shader.uniforms.uWaveLayers.value !== 4,
    "applyWaterShaderParameters mutated the shared catalog entry",
  );
}

function assertCatalogInstall(): void {
  const entry = WATER_SHADER_CATALOG[0];
  const first = applyWaterShaderCatalogInstall(emptyManifest(), entry, {
    uWaveHeight: 0.5,
  });
  assert(!first.alreadyInstalled, "The first install must not report a reinstall");
  const material = first.manifest.assets[first.primaryAssetId];
  assert(
    material?.kind === "material" &&
      material.shader?.kind === "classic-r3f" &&
      material.shader.uniforms.uWaveHeight?.kind === "number" &&
      material.shader.uniforms.uWaveHeight.value === 0.5,
    "The install did not carry the store's wave height into the Material",
  );
  // MIT requires the notice to travel with the work, and the shader is emitted
  // into every published world, so the credit lives on the Asset itself.
  assert(
    material?.kind === "material" &&
      Boolean(
        material.attribution?.authors.some((author) =>
          author.includes("MochiesCode"),
        ),
      ),
    "The installed Water Material must credit the Gerstner source",
  );
  const second = applyWaterShaderCatalogInstall(first.manifest, entry);
  assert(
    second.alreadyInstalled && second.primaryAssetId === first.primaryAssetId,
    "Reinstalling a Water preset must reuse the same Material Asset",
  );
}

function assertCompiledWorld(): void {
  const prototype = createPrototypeProject("world", "water-compile");
  const installed = applyWaterShaderCatalogInstall(
    prototype.assets,
    WATER_SHADER_CATALOG[0],
  );
  // The plane is created already carrying the Water Material, which is how an
  // author places water: assign it to a mesh like any other Material.
  const placed = addBuiltinPrimitiveEntity(
    prototype.scene,
    installed.manifest,
    BUILTIN_PRIMITIVE_CREATION_IDS.plane,
    installed.primaryAssetId,
  );
  assert(placed !== null, "Water fixture could not place a plane");
  if (!placed) return;
  const settings = resolveSceneSettings(placed.scene.settings);
  const scene = {
    ...placed.scene,
    settings: {
      ...settings,
      vegetation: {
        ...settings.vegetation,
        enabled: true,
        windSpeed: 1.75,
        windDirectionDegrees: 0,
      },
    },
  };
  const compiled = compileVisualProject(
    {
      project: prototype.project,
      scenes: { [scene.sceneId]: scene },
      assets: installed.manifest,
      prefabs: prototype.prefabs,
    },
    { generatedAt: "2026-01-01T00:00:00.000Z" },
  );
  const source =
    compiled.overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  assert(compiled.canStage, "A World with Water must stay stageable");
  assert(
    source.includes("xriftWaterGerstner"),
    "The Water GLSL was not emitted into the compiled World",
  );
  // The scene's wind must win over whatever the Material happened to store.
  assert(
    source.includes('"uWindSpeed": { value: 1.75 }'),
    "The scene wind speed was not pushed into the compiled Water Material",
  );
  assert(
    source.includes('"uWindDirection": { value: new Vector2(1, 0) }'),
    "The scene wind direction was not pushed into the compiled Water Material",
  );

  const stillScene = {
    ...scene,
    settings: {
      ...scene.settings,
      vegetation: { ...scene.settings.vegetation, enabled: false },
    },
  };
  const still = compileVisualProject(
    {
      project: prototype.project,
      scenes: { [stillScene.sceneId]: stillScene },
      assets: installed.manifest,
      prefabs: prototype.prefabs,
    },
    { generatedAt: "2026-01-01T00:00:00.000Z" },
  );
  const stillSource =
    still.overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  assert(
    stillSource.includes('"uWindSpeed": { value: 0 }'),
    "Disabling the scene wind must freeze the water rather than leave it drifting",
  );

  const wind = resolveSceneWind(scene.settings.vegetation);
  assert(
    wind.speed === 1.75 && Math.abs(wind.direction[0] - 1) < 1e-9,
    "The fixture's own wind expectation drifted from the contract",
  );
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
