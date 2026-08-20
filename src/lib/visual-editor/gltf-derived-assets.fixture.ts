import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  type AssetManifest,
} from "./asset-manifest";
import { safeIdSegment } from "./document-id";
import { expandGltfAssets, type GltfJson } from "./gltf-derived-assets";
import { assetManifestCodec } from "./serialization";

/**
 * Derived Asset ids are built from the Model's Asset id, which ends in the
 * source hash that makes it unique. A private copy of this sanitizer used to
 * strip everything after the last dot, so two Models whose file names carried a
 * dot — `chair.v2.glb` and `chair.v3.glb` — both collapsed to `model-chair` and
 * their derived Textures collided on one id.
 */
function assertModelAssetIdSegmentsStayUnique(): void {
  const first = safeIdSegment("model-chair.v2-9f13c0a8b2d1");
  const second = safeIdSegment("model-chair.v3-4b7e51d9c063");
  assert(
    first === "model-chair.v2-9f13c0a8b2d1",
    `Model Asset id segment was shortened: ${first}`,
  );
  assert(
    first !== second,
    "Two Models differing only after a dot produced the same id segment",
  );
}

/** Filesystem-free assertions for embedded glTF Material/Texture expansion. */
export async function runGltfDerivedAssetFixtureAssertions(): Promise<void> {
  assertModelAssetIdSegmentsStayUnique();
  const image = pngFixture();
  const json: GltfJson = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: image.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: image.byteLength }],
    images: [{ name: "Avocado Base Color", mimeType: "image/png", bufferView: 0 }],
    samplers: [{ wrapS: 33071, wrapT: 33648, magFilter: 9728, minFilter: 9984 }],
    textures: [{ name: "Avocado Albedo", source: 0, sampler: 0 }],
    materials: [
      {
        name: "Avocado Skin",
        pbrMetallicRoughness: {
          baseColorFactor: [0.2, 0.6, 0.1, 0.75],
          metallicFactor: 0.15,
          roughnessFactor: 0.8,
          baseColorTexture: {
            index: 0,
            texCoord: 1,
            extensions: {
              KHR_texture_transform: {
                offset: [0.25, 0.5],
                scale: [0.5, 0.5],
              },
            },
          },
        },
        alphaMode: "BLEND",
        doubleSided: true,
      },
    ],
  };
  const expanded = await expandGltfAssets({
    json,
    modelBytes: glbBinaryFixture(image),
    sourceFormat: "glb",
    modelAssetId: "model-avocado-sourcehash",
    modelSourceHash: "a".repeat(64),
    materialSlots: [
      { slot: "material-0", name: "Avocado Skin", sourceMaterialIndex: 0 },
    ],
    materialFolderId: "folder-avocado-materials",
    textureFolderId: "folder-avocado-textures",
    hashBytes: fixtureHash,
  });

  assert(expanded.warnings.length === 0, "Valid embedded image emitted a warning");
  assert(expanded.textureAssets.length === 1, "Embedded image was not expanded");
  assert(expanded.materialAssets.length === 1, "glTF Material was not expanded");
  assert(expanded.writes.length === 1, "Extracted image write was not deduplicated");
  const texture = expanded.textureAssets[0];
  const material = expanded.materialAssets[0];
  assert(texture.folderId === "folder-avocado-textures", "Texture folder was lost");
  assert(texture.importSettings.sampler.wrapS === "clamp-to-edge", "wrapS was lost");
  assert(texture.importSettings.sampler.wrapT === "mirrored-repeat", "wrapT was lost");
  assert(texture.importSettings.sampler.magFilter === "nearest", "magFilter was lost");
  assert(
    material.properties.pbrMetallicRoughness.baseColorTexture?.textureAssetId ===
      texture.id,
    "Material does not reference its expanded Texture",
  );
  assert(material.properties.alphaMode === "BLEND", "Alpha mode was lost");
  assert(material.properties.doubleSided, "doubleSided was lost");
  assert(
    expanded.materialSlots[0].defaultMaterialAssetId === material.id,
    "Model slot was not bound to its expanded Material",
  );

  const protectedMaterial = {
    ...material,
    properties: {
      ...material.properties,
      pbrMetallicRoughness: {
        ...material.properties.pbrMetallicRoughness,
        roughnessFactor: 0.23,
      },
    },
    importedFromModel: {
      ...material.importedFromModel!,
      isUserOverridden: true,
    },
  };
  const manifest: AssetManifest = {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    folders: {
      "folder-avocado-materials": {
        id: "folder-avocado-materials",
        name: "Materials",
        parentId: null,
        order: 0,
      },
      "folder-avocado-textures": {
        id: "folder-avocado-textures",
        name: "Textures",
        parentId: null,
        order: 1,
      },
    },
    assets: {
      [protectedMaterial.id]: protectedMaterial,
      [texture.id]: texture,
    },
  };
  assert(
    assetManifestCodec.parse(assetManifestCodec.serialize(manifest)).ok,
    "Expanded Asset provenance did not survive Manifest serialization",
  );
  const reimported = await expandGltfAssets({
    json: {
      ...json,
      materials: [
        {
          ...json.materials![0],
          pbrMetallicRoughness: { roughnessFactor: 1 },
        },
      ],
    },
    modelBytes: glbBinaryFixture(image),
    sourceFormat: "glb",
    modelAssetId: "model-avocado-sourcehash",
    modelSourceHash: "b".repeat(64),
    materialSlots: expanded.materialSlots,
    manifest,
    materialFolderId: "folder-avocado-materials",
    textureFolderId: "folder-avocado-textures",
    hashBytes: fixtureHash,
  });
  assert(
    reimported.materialAssets[0].id === material.id,
    "Reimport changed the derived Material ID",
  );
  assert(
    reimported.materialAssets[0].properties.pbrMetallicRoughness
      .roughnessFactor === 0.23,
    "Reimport overwrote a user-edited Material",
  );

  const openBrushJson: GltfJson = {
    asset: { version: "2.0" },
    images: [
      {
        uri: "https://www.tiltbrush.com/shaders/brushes/OilPaint-fixture/OilPaint-fixture-v10.0-MainTex.png",
      },
      {
        uri: "https://www.tiltbrush.com/shaders/brushes/OilPaint-fixture/OilPaint-fixture-v10.0-BumpMap.png",
      },
    ],
    textures: [{ source: 0 }, { source: 1 }],
    materials: [
      {
        name: "brush_OilPaint",
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          roughnessFactor: 0.6,
        },
        normalTexture: { index: 1 },
        extensions: {
          GOOGLE_tilt_brush_material: { guid: "fixture-brush-guid" },
        },
      },
    ],
  };
  const openBrushExpanded = await expandGltfAssets({
    json: openBrushJson,
    modelBytes: new Uint8Array(),
    sourceFormat: "glb",
    modelAssetId: "model-openbrush-fixture",
    modelSourceHash: "c".repeat(64),
    materialSlots: [
      { slot: "material-0", name: "brush_OilPaint", sourceMaterialIndex: 0 },
    ],
    materialFolderId: "folder-openbrush-materials",
    textureFolderId: "folder-openbrush-textures",
    hashBytes: fixtureHash,
    openBrush: {
      renderer: "three-icosa",
      rendererVersion: "three-icosa@fixture",
      extensionNames: ["GOOGLE_tilt_brush_material"],
      brushNames: ["OilPaint"],
    },
  });
  const openBrushMaterial = openBrushExpanded.materialAssets[0];
  assert(
    openBrushExpanded.textureAssets.length === 2 &&
      openBrushExpanded.textureAssets.every(
        (asset) => asset.source.kind === "builtin",
      ),
    "OpenBrush brush maps were not exposed as Texture Assets",
  );
  assert(
    openBrushMaterial.properties.pbrMetallicRoughness.baseColorTexture
      ?.textureAssetId === openBrushExpanded.textureAssets[0].id &&
      openBrushMaterial.properties.normalTexture?.textureAssetId ===
        openBrushExpanded.textureAssets[1].id,
    "OpenBrush Material did not retain standard Texture Asset slots",
  );
  const openBrushShader =
    openBrushMaterial.shader?.kind === "openbrush"
      ? openBrushMaterial.shader
      : undefined;
  assert(
    openBrushShader?.textureBindings?.u_MainTex?.textureAssetId ===
      openBrushExpanded.textureAssets[0].id &&
      openBrushShader.textureBindings?.u_BumpMap?.textureAssetId ===
        openBrushExpanded.textureAssets[1].id,
    "OpenBrush sampler uniforms were not connected to Texture Assets",
  );

  const allExtensionsJson: GltfJson = {
    asset: { version: "2.0" },
    materials: [
      {
        name: "All Extensions",
        pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] },
        extensions: {
          KHR_materials_anisotropy: {
            anisotropyStrength: 0.4,
            anisotropyRotation: 0.25,
          },
          KHR_materials_clearcoat: {
            clearcoatFactor: 0.8,
            clearcoatRoughnessFactor: 0.2,
          },
          KHR_materials_transmission: { transmissionFactor: 0.65 },
          KHR_materials_volume: {
            thicknessFactor: 0.4,
            attenuationDistance: 4,
            attenuationColor: [0.8, 0.9, 1],
          },
          KHR_materials_dispersion: { dispersion: 0.15 },
          KHR_materials_emissive_strength: { emissiveStrength: 2.5 },
          KHR_materials_ior: { ior: 1.45 },
          KHR_materials_iridescence: {
            iridescenceFactor: 0.7,
            iridescenceIor: 1.35,
          },
          KHR_materials_sheen: {
            sheenColorFactor: [0.3, 0.2, 0.1],
            sheenRoughnessFactor: 0.45,
          },
          KHR_materials_specular: {
            specularFactor: 0.85,
            specularColorFactor: [1.2, 0.9, 0.7],
          },
        },
      },
    ],
  };
  const allExtensionsExpanded = await expandGltfAssets({
    json: allExtensionsJson,
    modelBytes: new Uint8Array(),
    sourceFormat: "glb",
    modelAssetId: "model-all-extensions",
    modelSourceHash: "d".repeat(64),
    materialSlots: [
      { slot: "material-0", name: "All Extensions", sourceMaterialIndex: 0 },
    ],
    materialFolderId: "folder-all-extensions-materials",
    textureFolderId: "folder-all-extensions-textures",
    hashBytes: fixtureHash,
  });
  const allExtensionsMaterial = allExtensionsExpanded.materialAssets[0];
  const importedExtensions = allExtensionsMaterial.properties.extensions;
  assert(
    importedExtensions.KHR_materials_anisotropy?.anisotropyStrength === 0.4 &&
      importedExtensions.KHR_materials_clearcoat?.clearcoatFactor === 0.8 &&
      importedExtensions.KHR_materials_transmission?.transmissionFactor ===
        0.65 &&
      importedExtensions.KHR_materials_volume?.thicknessFactor === 0.4 &&
      importedExtensions.KHR_materials_volume?.attenuationDistance === 4 &&
      importedExtensions.KHR_materials_dispersion?.dispersion === 0.15 &&
      importedExtensions.KHR_materials_emissive_strength?.emissiveStrength ===
        2.5 &&
      importedExtensions.KHR_materials_ior?.ior === 1.45 &&
      importedExtensions.KHR_materials_iridescence?.iridescenceFactor === 0.7 &&
      importedExtensions.KHR_materials_sheen?.sheenRoughnessFactor === 0.45 &&
      importedExtensions.KHR_materials_specular?.specularFactor === 0.85,
    "glTF import dropped one or more KHR material extensions (B2)",
  );
  assert(
    importedExtensions.KHR_materials_specular?.specularColorFactor?.[0] === 1.2,
    "glTF import clamped specularColorFactor HDR value",
  );
  assert(
    allExtensionsExpanded.warnings.length === 0,
    "Valid all-extension material emitted a warning",
  );

  const missingDependencyJson: GltfJson = {
    asset: { version: "2.0" },
    materials: [
      {
        name: "Volume without Transmission",
        pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] },
        extensions: {
          KHR_materials_volume: { thicknessFactor: 0.4 },
        },
      },
    ],
  };
  const missingDependencyExpanded = await expandGltfAssets({
    json: missingDependencyJson,
    modelBytes: new Uint8Array(),
    sourceFormat: "glb",
    modelAssetId: "model-missing-dependency",
    modelSourceHash: "e".repeat(64),
    materialSlots: [
      {
        slot: "material-0",
        name: "Volume without Transmission",
        sourceMaterialIndex: 0,
      },
    ],
    materialFolderId: "folder-missing-dependency-materials",
    textureFolderId: "folder-missing-dependency-textures",
    hashBytes: fixtureHash,
  });
  assert(
    missingDependencyExpanded.materialAssets[0].properties.extensions
      .KHR_materials_volume === undefined,
    "Volume without Transmission was not dropped on glTF import",
  );
  assert(
    missingDependencyExpanded.warnings.some(
      (warning) =>
        warning.code === "gltf-material-extension-dependency-unmet",
    ),
    "Volume without Transmission did not emit a dependency warning",
  );
}

function pngFixture(): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 1, false);
  view.setUint32(20, 1, false);
  return bytes;
}

function glbBinaryFixture(binary: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(20 + binary.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, binary.byteLength, true);
  view.setUint32(16, 0x004e4942, true);
  bytes.set(binary, 20);
  return bytes;
}

async function fixtureHash(bytes: Uint8Array): Promise<string> {
  const total = bytes.reduce((sum, byte) => (sum + byte) % 256, 0);
  return total.toString(16).padStart(64, "0");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
