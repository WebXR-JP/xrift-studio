import {
  SCRIPT_ASSET_CONTRACT_VERSION,
  normalizeTextureImportSettings,
  type AssetManifest,
  type TextureAsset,
} from "../asset-manifest";
import { instantiateSceneAsset } from "../asset-placement";
import { BUILTIN_PRIMITIVE_CREATION_IDS } from "../creation-catalog";
import {
  applySkyShaderCatalogInstall,
  applyWaterShaderCatalogInstall,
} from "../external-store";
import { addDefaultParticleAsset } from "../particle-system";
import {
  BUILTIN_ASSET_IDS,
  createPrototypeProject,
} from "../prototype-project";
import {
  addBuiltinPrimitiveEntity,
  addTerrainEntity,
  createTextComponent,
  createVegetationWindComponent,
  textComponentPresetInput,
  DEFAULT_TEXT_BACKGROUND,
  SCRIPT_CONTRACT_VERSION,
  type ScriptComponent,
} from "../scene-document";
import { resolveSceneSettings } from "../scene-settings";
import {
  DEFAULT_SCRIPT_TEMPLATE_ID,
  createScriptTemplateSource,
} from "../scripting/script-templates";
import { getSkyShaderCatalogEntry } from "../sky-shader-catalog";
import {
  createTerrainFromPreset,
  getTerrainPreset,
} from "../terrain-presets";
import { WATER_SHADER_CATALOG } from "../water-shader-catalog";
import { compileVisualProject } from "./compile";

/**
 * Compiles one World that exercises as many emit paths at once as documents
 * alone can reach: gradient sky replaced by an animated Sky Shader, HDR
 * postprocessing, a grass Terrain under scene wind, an animated Water plane,
 * a Particle emitter, and a built-in Script template with its host runtime.
 *
 * The point is not any single feature: the staging build of a published world
 * runs `tsc` over everything the compiler emitted, so errors that only appear
 * when features meet (duplicate import bindings, unused imports under
 * noUnusedLocals, a helper declared twice) never show up in one-feature
 * fixtures. The CLI fixture runner typechecks this world's staged sources with
 * the publish template's compiler options, which is what makes "the publish
 * build cannot fail on Studio-generated code" an enforced contract instead of
 * a hope.
 */
export function compileStagedTypecheckWorld(): ReturnType<
  typeof compileVisualProject
> {
  const prototype = createPrototypeProject("world", "staged-typecheck");

  const terrainPreset = getTerrainPreset("meadow-plain");
  if (!terrainPreset) throw new Error("meadow-plain preset is missing");
  const terrainPlaced = addTerrainEntity(
    prototype.scene,
    prototype.assets,
    BUILTIN_ASSET_IDS.material.green,
    createTerrainFromPreset(terrainPreset),
  );
  if (!terrainPlaced) throw new Error("staged fixture could not place a Terrain");
  const terrainEntity = terrainPlaced.scene.entities[terrainPlaced.entityId];
  if (!terrainEntity) throw new Error("staged fixture lost its Terrain Entity");
  const windComponent = createVegetationWindComponent("staged-typecheck-wind");
  if (!windComponent) throw new Error("staged fixture could not create wind");
  let scene = {
    ...terrainPlaced.scene,
    entities: {
      ...terrainPlaced.scene.entities,
      [terrainEntity.id]: {
        ...terrainEntity,
        components: [...terrainEntity.components, windComponent],
      },
    },
  };

  const water = applyWaterShaderCatalogInstall(
    prototype.assets,
    WATER_SHADER_CATALOG[0],
  );
  const sky = applySkyShaderCatalogInstall(
    water.manifest,
    (() => {
      const entry = getSkyShaderCatalogEntry("starfield-night");
      if (!entry) throw new Error("starfield-night preset is missing");
      return entry;
    })(),
  );
  const waterPlaced = addBuiltinPrimitiveEntity(
    scene,
    sky.manifest,
    BUILTIN_PRIMITIVE_CREATION_IDS.plane,
    water.primaryAssetId,
  );
  if (!waterPlaced) throw new Error("staged fixture could not place Water");
  scene = waterPlaced.scene;

  const particleTexture: TextureAsset = {
    id: "staged-typecheck-particle-texture",
    name: "Staged Particle Texture",
    kind: "texture",
    status: "ready",
    source: {
      kind: "project",
      relativePath: "assets/textures/staged-particle.png",
    },
    thumbnail: { status: "missing" },
    importSettings: normalizeTextureImportSettings({
      colorSpace: "srgb",
      flipY: true,
      generateMipmaps: false,
      sampler: {
        wrapS: "clamp-to-edge",
        wrapT: "clamp-to-edge",
        magFilter: "linear",
        minFilter: "linear",
      },
    }),
    importMetadata: {
      sourceFormat: "png",
      mimeType: "image/png",
      byteLength: 128,
      width: 32,
      height: 32,
    },
  };
  const particleBase: AssetManifest = {
    ...sky.manifest,
    assets: { ...sky.manifest.assets, [particleTexture.id]: particleTexture },
  };
  const particle = addDefaultParticleAsset(particleBase, {
    id: "staged-typecheck-particle",
    name: "Staged Particle",
    properties: {
      renderer: {
        materialAssetId: BUILTIN_ASSET_IDS.material.blue,
        textureAssetId: particleTexture.id,
      },
    },
  });
  if (!particle.added) throw new Error("staged fixture could not add Particles");
  const particlePlaced = instantiateSceneAsset(
    scene,
    particle.manifest,
    prototype.prefabs,
    particle.assetId,
    { position: [0, 1.5, 0] },
  );
  if (!particlePlaced.placed) {
    throw new Error("staged fixture could not place Particles");
  }
  scene = particlePlaced.scene;

  const scriptAssetId = "staged-typecheck-script";
  const scriptSource = createScriptTemplateSource(
    DEFAULT_SCRIPT_TEMPLATE_ID,
    "Staged Rotator",
  );
  if (!scriptSource) throw new Error("default Script template is missing");
  const assets: AssetManifest = {
    ...particle.manifest,
    assets: {
      ...particle.manifest.assets,
      [scriptAssetId]: {
        id: scriptAssetId,
        name: "Staged Rotator",
        kind: "script",
        status: "ready",
        contractVersion: SCRIPT_ASSET_CONTRACT_VERSION,
        language: "ts",
        source: { kind: "project", relativePath: "scripts/staged-rotator.ts" },
      },
    },
  };
  const scriptTarget = addBuiltinPrimitiveEntity(
    scene,
    assets,
    BUILTIN_PRIMITIVE_CREATION_IDS.box,
    BUILTIN_ASSET_IDS.material.blue,
  );
  if (!scriptTarget) throw new Error("staged fixture could not place a box");
  const scriptEntity = scriptTarget.scene.entities[scriptTarget.entityId];
  if (!scriptEntity) throw new Error("staged fixture lost its Script Entity");
  const scriptComponent: ScriptComponent = {
    id: "staged-typecheck-script-component",
    type: "script",
    enabled: true,
    scriptAssetId,
    contractVersion: SCRIPT_CONTRACT_VERSION,
    properties: {},
    assetReferences: [],
    entityReferences: [],
    runIn: "play",
  };
  scene = {
    ...scriptTarget.scene,
    entities: {
      ...scriptTarget.scene.entities,
      [scriptEntity.id]: {
        ...scriptEntity,
        components: [...scriptEntity.components, scriptComponent],
      },
    },
  };

  // A Text panel with an image plate: it is the only path that emits the
  // troika runtime overlays and a hoisted texture hook side by side, and both
  // have to compile inside the same generated component file.
  const textTarget = addBuiltinPrimitiveEntity(
    scene,
    assets,
    BUILTIN_PRIMITIVE_CREATION_IDS.plane,
    BUILTIN_ASSET_IDS.material.white,
  );
  if (!textTarget) throw new Error("staged fixture could not place a Text plane");
  const textEntity = textTarget.scene.entities[textTarget.entityId];
  if (!textEntity) throw new Error("staged fixture lost its Text Entity");
  const textComponent = createTextComponent("staged-typecheck-text", {
    ...textComponentPresetInput("panel"),
    background: {
      ...DEFAULT_TEXT_BACKGROUND,
      mode: "texture",
      textureAssetId: particleTexture.id,
    },
  });
  if (!textComponent) throw new Error("staged fixture could not create Text");
  scene = {
    ...textTarget.scene,
    entities: {
      ...textTarget.scene.entities,
      [textEntity.id]: {
        ...textEntity,
        components: [...textEntity.components, textComponent],
      },
    },
  };

  const settings = resolveSceneSettings(scene.settings);
  scene = {
    ...scene,
    settings: {
      ...settings,
      skybox: {
        ...settings.skybox,
        enabled: true,
        materialAssetId: sky.primaryAssetId,
      },
      postprocessing: { ...settings.postprocessing, enabled: true },
      vegetation: {
        ...settings.vegetation,
        enabled: true,
        windSpeed: 1.5,
        windDirectionDegrees: 30,
      },
    },
  };

  return compileVisualProject(
    {
      project: prototype.project,
      scenes: { [scene.sceneId]: scene },
      assets,
      prefabs: prototype.prefabs,
      scriptSources: { [scriptAssetId]: scriptSource },
    },
    { generatedAt: "2026-01-01T00:00:00.000Z" },
  );
}
