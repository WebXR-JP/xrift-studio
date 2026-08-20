import { getMaterialAsset } from "./asset-manifest";
import { BUILTIN_ASSET_IDS } from "./builtin-asset-ids";
import {
  createGlowMaterialAsset,
  GLOW_FIXTURE_SHAPES,
  getGlowMaterialPreset,
  DEFAULT_GLOW_MATERIAL_PRESET,
  GLOW_MATERIAL_PRESETS,
  glowEmissiveStrength,
  glowMaterialAssetId,
  tintRelativeLuminance,
} from "./glow-material-catalog";
import { BUILTIN_PRIMITIVE_CREATION_IDS, getBuiltinPrimitiveCreation } from "./creation-catalog";
import { createPrototypeProject } from "./prototype-project";
import { DEFAULT_SCENE_SETTINGS } from "./scene-settings";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Deterministic assertions for the emissive Material shelf. */
export function runGlowMaterialCatalogFixtureAssertions(): void {
  const threshold = DEFAULT_SCENE_SETTINGS.postprocessing.bloom.threshold;

  // The point of the whole shelf: every preset has to actually bloom. Bloom
  // compares luminance, and a saturated tint carries far less of it than white
  // at the same strength, so a single hand-picked number cannot serve them all.
  for (const preset of GLOW_MATERIAL_PRESETS) {
    const strength = glowEmissiveStrength(preset.tint);
    const emittedLuminance = tintRelativeLuminance(preset.tint) * strength;
    assert(
      emittedLuminance > threshold,
      `${preset.id} emits ${emittedLuminance.toFixed(2)}, at or below the bloom threshold ${threshold}`,
    );
  }

  // A saturated tint must be driven harder than white, which is the reason the
  // strength is derived rather than shared.
  const white = glowEmissiveStrength("#ffffff");
  const cyan = glowEmissiveStrength("#67e8f9");
  assert(
    cyan > white,
    `A saturated tint needs more strength than white, got cyan=${cyan} white=${white}`,
  );

  // The Create menu and the store's default preset must land on one Material,
  // not two that look the same.
  assert(
    glowMaterialAssetId(DEFAULT_GLOW_MATERIAL_PRESET.id) ===
      BUILTIN_ASSET_IDS.material.glow,
    "The default glow preset does not resolve to the builtin Material id",
  );
  assert(
    GLOW_MATERIAL_PRESETS.filter(
      (preset) =>
        glowMaterialAssetId(preset.id) === BUILTIN_ASSET_IDS.material.glow,
    ).length === 1,
    "More than one glow preset claims the builtin Material id",
  );

  // A project ships with the builtin glow Material, and the glow cube creation
  // points at it. Placing it must not fall back to an ordinary Material.
  const project = createPrototypeProject("world", "glow-fixture");
  const builtin = getMaterialAsset(project.assets, BUILTIN_ASSET_IDS.material.glow);
  assert(
    builtin !== undefined,
    "A new project does not ship with the builtin glow Material",
  );
  const emissiveStrength =
    builtin.properties.extensions.KHR_materials_emissive_strength
      ?.emissiveStrength ?? 0;
  assert(
    tintRelativeLuminance(DEFAULT_GLOW_MATERIAL_PRESET.tint) * emissiveStrength >
      threshold,
    "The builtin glow Material is not bright enough to bloom",
  );

  const creation = getBuiltinPrimitiveCreation(
    BUILTIN_PRIMITIVE_CREATION_IDS.glowCube,
  );
  assert(creation !== undefined, "The glow cube creation is missing");
  assert(
    creation.primitive === "box",
    "The glow cube creation stopped being a cube",
  );

  // Every shape on the shelf must resolve to a real creation placed with the
  // glow Material, and its preview must draw the geometry that creation places.
  // A card showing a cube for a fixture that lands as a tube would be a lie
  // about what the author is choosing.
  const materialIds = new Set(
    Object.values(project.assets.assets)
      .filter((asset) => asset.kind === "material")
      .map((asset) => asset.id),
  );
  const previewGeometry: Record<string, string> = {
    box: "box",
    plane: "plane",
    cylinder: "cylinder",
    sphere: "sphere",
  };
  for (const shape of GLOW_FIXTURE_SHAPES) {
    const definition = getBuiltinPrimitiveCreation(shape.creationId);
    assert(
      definition !== undefined,
      `Glow shape ${shape.id} points at a creation that does not exist`,
    );
    assert(
      definition.preferredMaterialAssetId === BUILTIN_ASSET_IDS.material.glow,
      `Glow shape ${shape.id} is not placed with the glow Material`,
    );
    assert(
      materialIds.has(definition.preferredMaterialAssetId),
      `${definition.creationId} names a Material the project does not have`,
    );
    assert(
      previewGeometry[shape.preview] === definition.primitive,
      `Glow shape ${shape.id} previews ${shape.preview} but places ${definition.primitive}`,
    );
    assert(
      getGlowMaterialPreset(shape.defaultTintId) !== undefined,
      `Glow shape ${shape.id} defaults to a tint that does not exist`,
    );
    assert(
      definition.addCollider === false,
      `Glow shape ${shape.id} would place a collider, so players could walk into a light`,
    );
  }

  // A non-default preset gets its own Material rather than overwriting the
  // builtin one.
  const cyanPreset = GLOW_MATERIAL_PRESETS.find(
    (preset) => preset.id === "signal-cyan",
  );
  assert(cyanPreset !== undefined, "The cyan glow preset is missing");
  const cyanMaterial = createGlowMaterialAsset(cyanPreset);
  assert(
    cyanMaterial.id !== BUILTIN_ASSET_IDS.material.glow,
    "A non-default glow preset reused the builtin Material id",
  );
  assert(
    (cyanMaterial.properties.extensions.KHR_materials_emissive_strength
      ?.emissiveStrength ?? 0) === glowEmissiveStrength(cyanPreset.tint),
    "The cyan glow Material was built with a different strength than the catalog derives",
  );
}
