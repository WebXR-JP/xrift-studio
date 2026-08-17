import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  type AssetManifest,
} from "./asset-manifest";
import { compileVisualProject } from "./compiler/compile";
import { isClassicR3fMaterialShader } from "./custom-shader-contract";
import { applySkyShaderCatalogInstall } from "./external-store";
import { createPrototypeProject } from "./prototype-project";
import { resolveSceneSettings } from "./scene-settings";
import { sceneDocumentCodec } from "./serialization";
import {
  isSkyShaderMaterialAsset,
  resolveSkyShaderMaterial,
  skyShaderDrivenUniforms,
  skyShaderTextureUniformNames,
  SKY_SHADER_DRIVEN_UNIFORMS,
} from "./sky-shader";
import {
  SKY_SHADER_CATALOG,
  applySkyShaderParameters,
  defaultSkyShaderParameterValues,
  getSkyShaderCatalogEntry,
  type SkyShaderCatalogEntry,
} from "./sky-shader-catalog";

/**
 * Filesystem-free assertions for the Sky Shader slot: catalog integrity, the
 * store's parameter edits, the Scene Settings round trip, and the compiled
 * World output.
 */
export function runSkyShaderFixtureAssertions(): void {
  assertCatalogIntegrity();
  assertParameterEditing();
  assertSlotResolution();
  assertCatalogInstall();
  assertSceneSettingsRoundTrip();
  assertCompiledWorld();
}

function assertCatalogIntegrity(): void {
  assert(SKY_SHADER_CATALOG.length > 0, "Sky Shader catalog is empty");
  const ids = new Set<string>();
  for (const entry of SKY_SHADER_CATALOG) {
    assert(!ids.has(entry.id), `Duplicate Sky Shader entry id: ${entry.id}`);
    ids.add(entry.id);
    assert(
      isClassicR3fMaterialShader(entry.shader),
      `Sky Shader「${entry.id}」is not a valid Classic R3F shader`,
    );
    assert(
      entry.shader.variants.every((variant) => variant.side === "back" && !variant.depthWrite),
      `Sky Shader「${entry.id}」must be authored back-facing without depth writes`,
    );
    assert(
      skyShaderTextureUniformNames(entry.shader).length === 0,
      `Sky Shader「${entry.id}」must not depend on Texture uniforms`,
    );
    assert(
      Boolean(entry.shader.uniforms[SKY_SHADER_DRIVEN_UNIFORMS.center]) &&
        Boolean(entry.shader.uniforms[SKY_SHADER_DRIVEN_UNIFORMS.rotation]) &&
        Boolean(entry.shader.uniforms[SKY_SHADER_DRIVEN_UNIFORMS.exposure]),
      `Sky Shader「${entry.id}」must declare the Scene Settings driven uniforms`,
    );
    assert(
      entry.shader.vertexShader.includes(SKY_SHADER_DRIVEN_UNIFORMS.center),
      `Sky Shader「${entry.id}」vertex stage must read uCenter`,
    );
    for (const parameter of entry.parameters) {
      const uniform = entry.shader.uniforms[parameter.uniform];
      assert(
        uniform !== undefined,
        `Sky Shader「${entry.id}」parameter ${parameter.uniform} has no uniform`,
      );
      assert(
        uniform.kind === parameter.kind,
        `Sky Shader「${entry.id}」parameter ${parameter.uniform} kind does not match its uniform`,
      );
      if (parameter.kind === "number") {
        assert(
          parameter.min < parameter.max && parameter.step > 0,
          `Sky Shader「${entry.id}」parameter ${parameter.uniform} has an unusable range`,
        );
        assert(
          uniform.kind === "number" &&
            uniform.value >= parameter.min &&
            uniform.value <= parameter.max,
          `Sky Shader「${entry.id}」default ${parameter.uniform} is outside its own range`,
        );
      }
      const declaredInFragment = entry.shader.fragmentShader.includes(
        parameter.uniform,
      );
      assert(
        declaredInFragment,
        `Sky Shader「${entry.id}」fragment stage never reads ${parameter.uniform}`,
      );
    }
    const starCount = entry.shader.uniforms.uStarCount;
    if (starCount?.kind === "number" && starCount.value > 0) {
      assert(
        entry.parameters.some((parameter) => parameter.uniform === "uStarCount"),
        `Sky Shader「${entry.id}」draws stars but never exposes the star count`,
      );
    }
    // A ray-marched sky is the one preset a standalone headset may not afford,
    // so its step counts must stay reachable as variant defines.
    if (entry.shader.fragmentShader.includes("XRIFT_CLOUD_STEPS")) {
      assert(
        entry.shader.variants.every(
          (variant) =>
            Number(variant.defines.XRIFT_CLOUD_STEPS) > 0 &&
            Number(variant.defines.XRIFT_CLOUD_LIGHT_STEPS) > 0,
        ),
        `Sky Shader「${entry.id}」ray marches without exposing its step counts as defines`,
      );
    }
    // The distant ridge is the one element that turns a gradient into a place,
    // so a preset that has a horizon at all must let the author move it.
    if (entry.category !== "space") {
      assert(
        entry.parameters.some((parameter) => parameter.uniform === "uRidgeHeight"),
        `Sky Shader「${entry.id}」has a horizon but never exposes the distant ridge`,
      );
      assert(
        entry.shader.fragmentShader.includes("xriftSkyRidgeMask"),
        `Sky Shader「${entry.id}」declares a ridge control it never draws`,
      );
    }
  }
  assert(
    ["day", "dusk", "dawn", "night"].every((category) =>
      SKY_SHADER_CATALOG.some((entry) => entry.category === category),
    ),
    "The catalog must cover day, dusk, dawn and night",
  );
  assert(
    SKY_SHADER_CATALOG.some(
      (entry) =>
        entry.parameters.some((parameter) => parameter.uniform === "uMoonPhase") &&
        entry.shader.uniforms.uMoonStrength?.kind === "number" &&
        entry.shader.uniforms.uMoonStrength.value > 0,
    ),
    "The catalog must ship a sky with a visible, adjustable moon",
  );
  assert(
    getSkyShaderCatalogEntry("starfield-night")?.label === "Starfield Night",
    "getSkyShaderCatalogEntry did not resolve a known preset",
  );
  assert(
    getSkyShaderCatalogEntry("does-not-exist") === undefined,
    "getSkyShaderCatalogEntry resolved an unknown preset",
  );
}

/** The starry preset these assertions edit, resolved by id rather than order. */
function starryPreset(): SkyShaderCatalogEntry {
  const entry = getSkyShaderCatalogEntry("starfield-night");
  if (!entry) throw new Error("starfield-night preset is missing");
  return entry;
}

function assertParameterEditing(): void {
  const entry = starryPreset();
  const defaults = defaultSkyShaderParameterValues(entry);
  assert(
    typeof defaults.uStarCount === "number" &&
      typeof defaults.uStarColor === "string",
    "Sky Shader defaults did not read the preset uniform values",
  );
  const edited = applySkyShaderParameters(entry, {
    uStarCount: 4200,
    uStarColor: "#FFDDAA",
    uUnknownUniform: 5,
    uStarBrightness: "not-a-number" as unknown as number,
  });
  const count = edited.uniforms.uStarCount;
  const color = edited.uniforms.uStarColor;
  assert(
    count?.kind === "number" && count.value === 4200,
    "Sky Shader star count edit was not applied",
  );
  assert(
    color?.kind === "color" && color.value === "#ffddaa",
    "Sky Shader color edit was not normalized",
  );
  assert(
    edited.uniforms.uUnknownUniform === undefined,
    "Sky Shader accepted an unknown uniform from the store",
  );
  const brightness = edited.uniforms.uStarBrightness;
  const presetBrightness = entry.shader.uniforms.uStarBrightness;
  assert(
    brightness?.kind === "number" &&
      presetBrightness?.kind === "number" &&
      brightness.value === presetBrightness.value,
    "Sky Shader accepted a non-numeric value for a number uniform",
  );
  const clamped = applySkyShaderParameters(entry, { uStarCount: 9_999_999 });
  const clampedCount = clamped.uniforms.uStarCount;
  const range = entry.parameters.find(
    (parameter) => parameter.uniform === "uStarCount",
  );
  assert(
    clampedCount?.kind === "number" &&
      range?.kind === "number" &&
      clampedCount.value === range.max,
    "Sky Shader star count was not clamped to its declared range",
  );
  assert(
    entry.shader.uniforms.uStarCount?.kind === "number" &&
      entry.shader.uniforms.uStarCount.value !== 4200,
    "applySkyShaderParameters mutated the shared catalog entry",
  );
}

function assertSlotResolution(): void {
  const empty: AssetManifest = {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: {},
    folders: {},
  };
  assert(
    resolveSkyShaderMaterial(empty, undefined).status === "none",
    "An unset sky slot must resolve to none",
  );
  assert(
    resolveSkyShaderMaterial(empty, "missing").status === "unavailable",
    "A missing sky Material must resolve to unavailable",
  );

  const installed = applySkyShaderCatalogInstall(empty, starryPreset());
  const resolved = resolveSkyShaderMaterial(
    installed.manifest,
    installed.primaryAssetId,
  );
  assert(
    resolved.status === "ready",
    "An installed Sky Shader Material must resolve as ready",
  );
  if (resolved.status !== "ready") return;
  assert(
    isSkyShaderMaterialAsset(resolved.asset),
    "An installed Sky Shader Material must be assignable to the sky slot",
  );

  const settings = resolveSceneSettings({
    skybox: {
      projection: "dome",
      center: [0, 0.5, 0],
      rotationDegrees: 90,
      exposure: 1.5,
    },
  }).skybox;
  const driven = skyShaderDrivenUniforms(resolved.shader, settings);
  const center = driven.find((entry) => entry.name === "uCenter");
  const rotation = driven.find((entry) => entry.name === "uRotation");
  const exposure = driven.find((entry) => entry.name === "uExposure");
  assert(
    center?.kind === "vector3" && center.value.join(",") === "0,0.5,0",
    "The sky slot did not drive uCenter from Scene Settings",
  );
  assert(
    rotation?.kind === "number" &&
      Math.abs(rotation.value - Math.PI / 2) < 1e-9,
    "The sky slot did not convert the sky rotation to radians",
  );
  assert(
    exposure?.kind === "number" && exposure.value === 1.5,
    "The sky slot did not drive uExposure from Scene Settings",
  );

  const infiniteDriven = skyShaderDrivenUniforms(
    resolved.shader,
    resolveSceneSettings({ skybox: { center: [0, 0.5, 0] } }).skybox,
  );
  const infiniteCenter = infiniteDriven.find((entry) => entry.name === "uCenter");
  assert(
    infiniteCenter?.kind === "vector3" &&
      infiniteCenter.value.join(",") === "0,0,0",
    "The infinite projection must keep the sky centered on the camera",
  );

  const withoutDriven = skyShaderDrivenUniforms(
    {
      ...resolved.shader,
      uniforms: { uTime: { kind: "number", value: 0 } },
    },
    settings,
  );
  assert(
    withoutDriven.length === 0,
    "The sky slot must not push uniforms a shader never declared",
  );

  const pbrOnly: AssetManifest = {
    ...installed.manifest,
    assets: {
      ...installed.manifest.assets,
      [installed.primaryAssetId]: {
        ...resolved.asset,
        shader: undefined,
      },
    },
  };
  assert(
    resolveSkyShaderMaterial(pbrOnly, installed.primaryAssetId).status ===
      "unavailable",
    "A Material without a Custom Shader must not be usable as a sky",
  );
}

function assertCatalogInstall(): void {
  const empty: AssetManifest = {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: {},
    folders: {},
  };
  const entry = starryPreset();
  const first = applySkyShaderCatalogInstall(empty, entry, {
    uStarCount: 3000,
  });
  assert(!first.alreadyInstalled, "The first install must not report a reinstall");
  const material = first.manifest.assets[first.primaryAssetId];
  assert(
    material?.kind === "material" &&
      material.shader?.kind === "classic-r3f" &&
      material.shader.uniforms.uStarCount?.kind === "number" &&
      material.shader.uniforms.uStarCount.value === 3000,
    "The install did not carry the store's star count into the Material",
  );
  assert(
    material?.kind === "material" &&
      material.attribution?.providerId === "xrift-sky-shaders",
    "The installed Sky Shader Material is missing its attribution",
  );
  assert(
    Boolean(material?.folderId && first.manifest.folders?.[material.folderId]),
    "The installed Sky Shader Material is not filed under its store folder",
  );

  const second = applySkyShaderCatalogInstall(first.manifest, entry, {
    uStarCount: 500,
  });
  assert(
    second.alreadyInstalled &&
      second.primaryAssetId === first.primaryAssetId,
    "Reinstalling a preset must reuse the same Material Asset",
  );
  const reinstalled = second.manifest.assets[second.primaryAssetId];
  assert(
    reinstalled?.kind === "material" &&
      reinstalled.shader?.kind === "classic-r3f" &&
      reinstalled.shader.uniforms.uStarCount?.kind === "number" &&
      reinstalled.shader.uniforms.uStarCount.value === 500,
    "Reinstalling a preset must apply the new store values",
  );
  assert(
    reinstalled?.order === material?.order,
    "Reinstalling a preset must keep the Material in place",
  );
}

function assertSceneSettingsRoundTrip(): void {
  const resolved = resolveSceneSettings({
    skybox: { materialAssetId: "  " },
  });
  assert(
    resolved.skybox.materialAssetId === undefined,
    "A blank sky Material id must resolve to unset",
  );
  const prototype = createPrototypeProject("world", "sky-shader-fixture");
  const scene = {
    ...prototype.scene,
    settings: {
      ...resolveSceneSettings(prototype.scene.settings),
      skybox: {
        ...resolveSceneSettings(prototype.scene.settings).skybox,
        materialAssetId: "external-sky-shader-starfield-night-material",
      },
    },
  };
  const decoded = sceneDocumentCodec.parse(sceneDocumentCodec.serialize(scene));
  assert(
    decoded.ok,
    `Scene with a sky Material failed validation: ${
      decoded.ok
        ? ""
        : decoded.issues.map((issue) => issue.path).join(", ")
    }`,
  );
  assert(
    decoded.ok &&
      resolveSceneSettings(decoded.document.settings).skybox.materialAssetId ===
        "external-sky-shader-starfield-night-material",
    "The sky Material id did not survive the scene document round trip",
  );
}

function assertCompiledWorld(): void {
  const prototype = createPrototypeProject("world", "sky-shader-compile");
  const installed = applySkyShaderCatalogInstall(
    prototype.assets,
    starryPreset(),
    { uStarCount: 2400 },
  );
  const settings = resolveSceneSettings(prototype.scene.settings);
  const compiled = compileVisualProject(
    {
      project: prototype.project,
      scenes: {
        [prototype.scene.sceneId]: {
          ...prototype.scene,
          settings: {
            ...settings,
            skybox: {
              ...settings.skybox,
              enabled: true,
              materialAssetId: installed.primaryAssetId,
            },
          },
        },
      },
      assets: installed.manifest,
      prefabs: prototype.prefabs,
    },
    { generatedAt: "2026-01-01T00:00:00.000Z" },
  );
  const source =
    compiled.overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  assert(
    compiled.canStage,
    "A World with a Sky Shader must stay stageable",
  );
  assert(
    source.includes("XRiftStudioSkyShader"),
    "The Sky Shader was not emitted into the compiled World",
  );
  assert(
    source.includes('"uStarCount": { value: 2400 }'),
    "The Sky Shader uniform values were not emitted as literals",
  );
  assert(
    !source.includes("XRiftStudioProjectedSkybox"),
    "The gradient sky must not also draw when a Sky Shader owns the background",
  );
  assert(
    source.includes("xriftSkyStarLayer"),
    "The Sky Shader GLSL was not emitted into the compiled World",
  );
  assert(
    source.includes("clock.getElapsedTime()"),
    "The Sky Shader time uniform was not animated in the compiled World",
  );
  assert(
    !compiled.diagnostics.some(
      (diagnostic) => diagnostic.code === "sky-shader-unavailable",
    ),
    "A valid Sky Shader must not report an unavailable diagnostic",
  );

  const brokenSettings = resolveSceneSettings(prototype.scene.settings);
  const broken = compileVisualProject(
    {
      project: prototype.project,
      scenes: {
        [prototype.scene.sceneId]: {
          ...prototype.scene,
          settings: {
            ...brokenSettings,
            skybox: {
              ...brokenSettings.skybox,
              enabled: true,
              materialAssetId: "sky-material-that-does-not-exist",
            },
          },
        },
      },
      assets: prototype.assets,
      prefabs: prototype.prefabs,
    },
    { generatedAt: "2026-01-01T00:00:00.000Z" },
  );
  const brokenSource =
    broken.overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  assert(
    broken.canStage,
    "A missing Sky Shader must not block staging",
  );
  assert(
    broken.diagnostics.some(
      (diagnostic) => diagnostic.code === "sky-shader-unavailable",
    ),
    "A missing Sky Shader must report a diagnostic",
  );
  assert(
    brokenSource.includes("XRiftStudioProjectedSkybox"),
    "A missing Sky Shader must fall back to the gradient sky",
  );
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
