import {
  addTextureAsset,
  getMaterialAsset,
  updateMaterialAsset,
  type AssetManifest,
  type MaterialTextureInfo,
} from "../asset-manifest";
import {
  assetManifestCodec,
  stableSerializeJson,
} from "../serialization";
import {
  BUILTIN_ASSET_IDS,
  createPrototypeProject,
} from "../prototype-project";
import { compilePrototypeVisualProject } from "./compile";

/** Focused, dependency-free assertions for typed glTF material extensions. */
export function runMaterialExtensionFixtureAssertions(): void {
  const project = createPrototypeProject("world", "material-extension-fixture");
  const textureId = "fixture-material-extension-texture";
  const textureResult = addTextureAsset(project.assets, {
    id: textureId,
    name: "Material extension fixture texture",
    source: {
      kind: "project",
      relativePath: "assets/textures/material-extension-fixture.png",
    },
    importSettings: {},
  });
  assert(textureResult.added, "Fixture texture could not be created");

  const texture: MaterialTextureInfo = {
    textureAssetId: textureId,
    texCoord: 0,
    transform: {
      offset: [0.125, 0.25],
      rotation: 0.375,
      scale: [1.5, 0.75],
    },
  };
  const physicalAssets = updateMaterialAsset(
    textureResult.manifest,
    BUILTIN_ASSET_IDS.material.blue,
    {
      emissiveFactor: [0.2, 0.1, 0.05],
      extensions: {
        KHR_materials_anisotropy: {
          anisotropyStrength: 0.4,
          anisotropyRotation: 0.25,
          anisotropyTexture: texture,
        },
        KHR_materials_clearcoat: {
          clearcoatFactor: 0.8,
          clearcoatRoughnessFactor: 0.2,
          clearcoatTexture: texture,
          clearcoatRoughnessTexture: texture,
          clearcoatNormalTexture: { ...texture, scale: 0.75 },
        },
        KHR_materials_dispersion: { dispersion: 0.15 },
        KHR_materials_emissive_strength: { emissiveStrength: 2.5 },
        KHR_materials_ior: { ior: 1.45 },
        KHR_materials_iridescence: {
          iridescenceFactor: 0.7,
          iridescenceIor: 1.35,
          // Descending ranges are explicitly valid in KHR_materials_iridescence.
          iridescenceThicknessMinimum: 480,
          iridescenceThicknessMaximum: 120,
          iridescenceTexture: texture,
          iridescenceThicknessTexture: texture,
        },
        KHR_materials_sheen: {
          sheenColorFactor: [0.3, 0.2, 0.1],
          sheenRoughnessFactor: 0.45,
          sheenColorTexture: texture,
          sheenRoughnessTexture: texture,
        },
        KHR_materials_specular: {
          specularFactor: 0.85,
          specularColorFactor: [1.2, 0.9, 0.7],
          specularTexture: texture,
          specularColorTexture: texture,
        },
        KHR_materials_transmission: {
          transmissionFactor: 0.65,
          transmissionTexture: texture,
        },
        KHR_materials_volume: {
          thicknessFactor: 0.4,
          thicknessTexture: texture,
          attenuationDistance: 4,
          attenuationColor: [0.8, 0.9, 1],
        },
      },
    },
  );
  const physicalResult = compilePrototypeVisualProject(
    { ...project, assets: physicalAssets },
    { generatedAt: "2026-07-20T00:00:00.000Z" },
  );
  assert(physicalResult.canStage, "Physical extension fixture must be stageable");
  const physicalSource = sourceOf(physicalResult.overlayFiles);
  [
    "<meshPhysicalMaterial",
    "anisotropy={0.4}",
    "anisotropyRotation={0.25}",
    "clearcoat={0.8}",
    "clearcoatRoughness={0.2}",
    "dispersion={0.15}",
    "emissiveIntensity={2.5}",
    "ior={1.45}",
    "iridescence={0.7}",
    "iridescenceIOR={1.35}",
    "iridescenceThicknessRange={[480, 120]}",
    "sheen={1}",
    "sheenRoughness={0.45}",
    "specularIntensity={0.85}",
    "transmission={0.65}",
    "thickness={0.4}",
    "attenuationDistance={4}",
    "anisotropyMap={anisotropyMap}",
    "clearcoatMap={clearcoatMap}",
    "clearcoatRoughnessMap={clearcoatRoughnessMap}",
    "clearcoatNormalMap={clearcoatNormalMap}",
    "clearcoatNormalScale={[0.75, 0.75]}",
    "iridescenceMap={iridescenceMap}",
    "iridescenceThicknessMap={iridescenceThicknessMap}",
    "sheenColorMap={sheenColorMap}",
    "sheenRoughnessMap={sheenRoughnessMap}",
    "specularIntensityMap={specularIntensityMap}",
    "specularColorMap={specularColorMap}",
    "transmissionMap={transmissionMap}",
    "thicknessMap={thicknessMap}",
    '"offset":[0.125,0.25]',
    '"rotation":0.375',
    '"scale":[1.5,0.75]',
  ].forEach((fragment) =>
    assert(
      physicalSource.includes(fragment),
      `Compiled physical material is missing: ${fragment}`,
    ),
  );

  const roundTrip = assetManifestCodec.parse(
    assetManifestCodec.serialize(physicalAssets),
  );
  assert(roundTrip.ok, "Physical extension manifest did not round-trip");
  const roundTripMaterial = getMaterialAsset(
    roundTrip.document,
    BUILTIN_ASSET_IDS.material.blue,
  );
  assert(
    roundTripMaterial?.properties.extensions.KHR_materials_anisotropy
      ?.anisotropyTexture?.transform?.rotation === 0.375 &&
      roundTripMaterial.properties.extensions.KHR_materials_clearcoat
        ?.clearcoatNormalTexture?.scale === 0.75 &&
      roundTripMaterial.properties.extensions.KHR_materials_iridescence
        ?.iridescenceThicknessMinimum === 480 &&
      roundTripMaterial.properties.extensions.KHR_materials_iridescence
        ?.iridescenceThicknessMaximum === 120 &&
      roundTripMaterial.properties.extensions.KHR_materials_specular
        ?.specularColorFactor[0] === 1.2 &&
      roundTripMaterial.properties.extensions.KHR_materials_volume
        ?.attenuationDistance === 4,
    "Typed extension values or TextureInfo were lost during serialization",
  );

  const unlitAssets = updateMaterialAsset(
    project.assets,
    BUILTIN_ASSET_IDS.material.blue,
    { extensions: { KHR_materials_unlit: {} } },
  );
  const unlitResult = compilePrototypeVisualProject(
    { ...project, assets: unlitAssets },
    { generatedAt: "2026-07-20T00:00:00.000Z" },
  );
  assert(unlitResult.canStage, "Unlit fixture must be stageable");
  assert(
    sourceOf(unlitResult.overlayFiles).includes("<meshBasicMaterial"),
    "Unlit material did not compile to meshBasicMaterial",
  );

  const preserved = updateMaterialAsset(
    updateMaterialAsset(project.assets, BUILTIN_ASSET_IDS.material.blue, {
      extensions: {
        KHR_materials_clearcoat: {
          clearcoatFactor: 1,
          clearcoatRoughnessFactor: 0.1,
        },
      },
    }),
    BUILTIN_ASSET_IDS.material.blue,
    { extensions: { KHR_materials_ior: { ior: 1.6 } } },
  );
  const preservedMaterial = getMaterialAsset(
    preserved,
    BUILTIN_ASSET_IDS.material.blue,
  );
  assert(
    preservedMaterial?.properties.extensions.KHR_materials_clearcoat !==
      undefined &&
      preservedMaterial.properties.extensions.KHR_materials_ior?.ior === 1.6,
    "Patching one extension discarded another extension",
  );
  const removed = updateMaterialAsset(
    preserved,
    BUILTIN_ASSET_IDS.material.blue,
    { extensions: { KHR_materials_clearcoat: null } },
  );
  const removedMaterial = getMaterialAsset(
    removed,
    BUILTIN_ASSET_IDS.material.blue,
  );
  assert(
    removedMaterial !== undefined &&
      removedMaterial.properties.extensions.KHR_materials_clearcoat === undefined &&
      removedMaterial.properties.extensions.KHR_materials_ior?.ior === 1.6,
    "Removing one extension discarded a sibling extension",
  );

  assertInvalidExtension(
    physicalAssets,
    "KHR_materials_unknown_fixture",
    "unsupported-extension",
  );
  const invalidDependency = updateMaterialAsset(
    project.assets,
    BUILTIN_ASSET_IDS.material.blue,
    {
      extensions: {
        KHR_materials_volume: {
          thicknessFactor: 1,
          attenuationColor: [1, 1, 1],
        },
      },
    },
  );
  const dependencyParse = assetManifestCodec.parse(
    stableSerializeJson(invalidDependency),
  );
  assert(
    !dependencyParse.ok &&
      dependencyParse.issues.some(
        (candidate) => candidate.code === "extension-dependency",
      ),
    "Volume without transmission was not rejected",
  );

  const invalidDispersionDependency = updateMaterialAsset(
    project.assets,
    BUILTIN_ASSET_IDS.material.blue,
    { extensions: { KHR_materials_dispersion: { dispersion: 0.2 } } },
  );
  const dispersionDependencyParse = assetManifestCodec.parse(
    stableSerializeJson(invalidDispersionDependency),
  );
  assert(
    !dispersionDependencyParse.ok &&
      dispersionDependencyParse.issues.some(
        (candidate) => candidate.code === "extension-dependency",
      ),
    "Dispersion without volume was not rejected",
  );

  const unlitConflict = updateMaterialAsset(
    updateMaterialAsset(project.assets, BUILTIN_ASSET_IDS.material.blue, {
      extensions: { KHR_materials_unlit: {} },
    }),
    BUILTIN_ASSET_IDS.material.blue,
    { extensions: { KHR_materials_clearcoat: { clearcoatFactor: 1 } } },
  );
  const unlitConflictParse = assetManifestCodec.parse(
    stableSerializeJson(unlitConflict),
  );
  assert(
    !unlitConflictParse.ok &&
      unlitConflictParse.issues.some(
        (candidate) => candidate.code === "extension-conflict",
      ),
    "Unlit and physical extension conflict was not rejected",
  );
}

function assertInvalidExtension(
  manifest: AssetManifest,
  extensionName: string,
  expectedCode: string,
): void {
  const raw = JSON.parse(assetManifestCodec.serialize(manifest)) as {
    assets: Record<
      string,
      { properties?: { extensions?: Record<string, unknown> } }
    >;
  };
  const material = raw.assets[BUILTIN_ASSET_IDS.material.blue];
  if (!material.properties?.extensions) {
    throw new Error("Fixture material extensions are missing");
  }
  material.properties.extensions[extensionName] = {};
  const parsed = assetManifestCodec.parse(stableSerializeJson(raw));
  assert(
    !parsed.ok && parsed.issues.some((candidate) => candidate.code === expectedCode),
    `Invalid material extension did not report ${expectedCode}`,
  );
}

function sourceOf(
  files: readonly { relativePath: string; content: string }[],
): string {
  return (
    files.find((file) => file.relativePath === "src/World.tsx")?.content ?? ""
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
