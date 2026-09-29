import { ASSET_MANIFEST_SCHEMA_VERSION, updateMaterialAsset, type AssetManifest } from "./asset-manifest";
import { ASSET_IMPORT_ACCEPT } from "./asset-format-registry";
import { expandGltfAssets, type GltfJson } from "./gltf-derived-assets";
import { assetManifestCodec } from "./serialization";

/** Legacy avatar materials become editable without modifying their source. */
export async function runVrmMaterialConversionFixtureAssertions(): Promise<void> {
  assert(ASSET_IMPORT_ACCEPT.includes(".vrm"), "VRM is missing from the shared import picker");
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 1, false);
  new DataView(png.buffer).setUint32(20, 1, false);
  const source: GltfJson = {
    asset: { version: "2.0" },
    extensionsUsed: ["VRM"],
    buffers: [{ byteLength: png.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: png.byteLength }],
    images: [{ name: "Avatar texture", bufferView: 0, mimeType: "image/png" }],
    textures: [{ source: 0 }, { source: 0, sampler: 0 }],
    samplers: [{ wrapS: 33071, wrapT: 33071 }],
    materials: [
      { name: "Legacy Body" },
      { name: "Legacy Transparent Front" },
      { name: "Legacy Unlit" },
      { name: "PBR", pbrMetallicRoughness: { baseColorFactor: [0.2, 0.3, 0.4, 1], roughnessFactor: 0.25 } },
      { name: "Legacy Transparent Back" },
    ],
    extensions: { VRM: { materialProperties: [
      {
        shader: "VRM/MToon", renderQueue: 2000,
        vectorProperties: {
          _Color: [0.5, 0.25, 1, 0.7], _ShadeColor: [0.25, 0.5, 0.75, 1],
          _EmissionColor: [2, 0.5, 0, 1], _RimColor: [0.5, 0.25, 0.75, 1],
          _OutlineColor: [0.25, 0.5, 0.75, 1], _MainTex: [0.1, 0.2, 2, 0.5],
        },
        floatProperties: {
          _CullMode: 0, _BumpScale: -0.5, _ShadeShift: 0.2, _ShadeToony: 0.8,
          _IndirectLightIntensity: 0.3, _RimLightingMix: 0.2, _RimFresnelPower: 3, _RimLift: -0.1,
          _OutlineWidthMode: 1, _OutlineWidth: 0.5, _OutlineColorMode: 1, _OutlineLightingMix: 0.4,
          _UvAnimScrollX: -0.2, _UvAnimScrollY: 0.3, _UvAnimRotation: 1.5,
        },
        textureProperties: {
          _MainTex: 1, _ShadeTexture: 0, _BumpMap: 1, _EmissionMap: 0,
          _SphereAdd: 1, _RimTexture: 0, _OutlineWidthTexture: 0, _UvAnimMaskTexture: 1,
        },
      },
      { shader: "VRM/MToon", renderQueue: 3010, keywordMap: { _ALPHABLEND_ON: true }, floatProperties: { _ZWrite: 0 } },
      { shader: "VRM/UnlitTransparentZWrite", renderQueue: 2505, vectorProperties: { _Color: [0.5, 1, 1, 1] }, textureProperties: { _MainTex: 1 } },
      { shader: "VRM_USE_GLTFSHADER" },
      { shader: "VRM/MToon", renderQueue: 3000, keywordMap: { _ALPHABLEND_ON: true }, floatProperties: { _ZWrite: 0 } },
    ] } },
  };
  const sourceBefore = JSON.stringify(source);
  const sourceBytes = glbBinary(png);
  const bytesBefore = sourceBytes.slice();
  const input = {
    json: source, modelBytes: sourceBytes, sourceFormat: "glb" as const,
    modelAssetId: "legacy-avatar", modelSourceHash: "a".repeat(64),
    materialSlots: source.materials!.map((material, index) => ({ slot: `material-${index}`, name: String(material.name), sourceMaterialIndex: index })),
    materialFolderId: "avatar-materials", textureFolderId: "avatar-textures",
    hashBytes: async () => "b".repeat(64),
  };
  const expanded = await expandGltfAssets(input);
  assert(JSON.stringify(source) === sourceBefore && sourceBytes.every((byte, index) => byte === bytesBefore[index]),
    "VRM conversion mutated original JSON or .vrm bytes");
  assert(expanded.warnings.length === 0, `Valid legacy avatar emitted import warnings: ${JSON.stringify(expanded.warnings)}`);
  assert(expanded.textureAssets.length === 2 && expanded.writes.length === 1, "Legacy texture slots or image deduplication were lost");
  const [body, transparent, unlit, pbr, back] = expanded.materialAssets;
  const mtoon = body.properties.extensions.VRMC_materials_mtoon;
  assert(mtoon?.specVersion === "1.0" && mtoon.extras?.xriftVrm0CompatShade, "Legacy MToon or its shading compatibility was not imported");
  near(body.properties.pbrMetallicRoughness.baseColorFactor[0], 0.217637640824031, "Legacy base color was not converted to linear");
  near(body.properties.pbrMetallicRoughness.baseColorFactor[3], 0.7, "Legacy alpha was gamma converted");
  near(mtoon.shadeColorFactor[1], 0.217637640824031, "Legacy RGBA shadow color did not become editable RGB");
  near(mtoon.shadingToonyFactor, 0.92, "Legacy shade softness changed");
  near(mtoon.shadingShiftFactor, -0.28, "Legacy shade boundary changed");
  near(mtoon.giEqualizationFactor, 0.7, "Legacy indirect-light factor changed");
  near(mtoon.outlineWidthFactor, 0.005, "Legacy outline width was not converted to metres");
  near(mtoon.outlineColorFactor[2], 0.5310492251033824, "Legacy outline RGBA color changed");
  assert(mtoon.outlineWidthMode === "worldCoordinates" && mtoon.outlineLightingMixFactor === 0.4 && body.properties.doubleSided,
    "Legacy outline lighting or culling changed");
  const shadeMap = mtoon.shadeMultiplyTexture;
  assert(shadeMap && body.properties.pbrMetallicRoughness.baseColorTexture?.textureAssetId !== shadeMap.textureAssetId &&
    mtoon.outlineWidthMultiplyTexture?.textureAssetId === shadeMap.textureAssetId && mtoon.rimMultiplyTexture?.textureAssetId === shadeMap.textureAssetId,
    "Legacy base, shade, rim and outline maps did not retain their separate Texture references");
  near(shadeMap.transform?.offset[1], 0.3, "Legacy UV offset was not flipped with the UV scale");
  assert(shadeMap.transform?.scale[0] === 2 && body.properties.normalTexture?.scale === -0.5,
    "Legacy UV scale or normal-map scale changed");
  assert(mtoon.matcapTexture && !mtoon.matcapTexture.transform && mtoon.uvAnimationMaskTexture &&
    mtoon.uvAnimationScrollXSpeedFactor === -0.2 && mtoon.uvAnimationScrollYSpeedFactor === -0.3 && mtoon.uvAnimationRotationSpeedFactor === 1.5 &&
    mtoon.rimLightingMixFactor === 0.2 && mtoon.parametricRimFresnelPowerFactor === 3 && mtoon.parametricRimLiftFactor === -0.1,
    "Legacy MatCap, rim or UV animation settings were lost");
  near(body.properties.extensions.KHR_materials_emissive_strength?.emissiveStrength, 4.59479341998814, "Legacy HDR emission was clipped");
  near(body.properties.emissiveFactor[0], 1, "Legacy HDR emission factor did not use the canonical range");
  near(body.properties.emissiveFactor[1] * body.properties.extensions.KHR_materials_emissive_strength!.emissiveStrength,
    0.217637640824031, "Legacy HDR emission intensity changed");
  assert(transparent.properties.alphaMode === "BLEND" && transparent.properties.extensions.VRMC_materials_mtoon?.renderQueueOffsetNumber === 0 &&
    back.properties.extensions.VRMC_materials_mtoon?.renderQueueOffsetNumber === -1,
    "Legacy transparency ordering changed");
  assert(unlit.properties.alphaMode === "BLEND" && unlit.properties.extensions.VRMC_materials_mtoon?.transparentWithZWrite &&
    unlit.properties.extensions.VRMC_materials_mtoon.extras?.xriftVrm0CompatShade &&
    unlit.properties.extensions.VRMC_materials_mtoon.shadeColorFactor[0] === unlit.properties.pbrMetallicRoughness.baseColorFactor[0],
    "Legacy Unlit conversion changed depth writing or introduced shaded color");
  assert(!pbr.properties.extensions.VRMC_materials_mtoon && pbr.properties.pbrMetallicRoughness.roughnessFactor === 0.25,
    "An avatar's existing glTF shader was replaced by MToon");
  assert(expanded.materialSlots.every((slot) => slot.defaultMaterialAssetId), "Imported avatar materials were not assigned to the original slots");

  const folders = {
    "avatar-materials": { id: "avatar-materials", name: "Avatar Materials", parentId: null, order: 0 },
    "avatar-textures": { id: "avatar-textures", name: "Avatar Textures", parentId: null, order: 1 },
  };
  const manifest: AssetManifest = { schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION, folders,
    assets: Object.fromEntries([...expanded.materialAssets, ...expanded.textureAssets].map((asset) => [asset.id, asset])) };
  const edited = updateMaterialAsset(manifest, body.id, { extensions: { VRMC_materials_mtoon: { outlineColorFactor: [0.1, 0.2, 0.3] } } });
  const saved = assetManifestCodec.parse(assetManifestCodec.serialize(edited));
  assert(saved.ok, `Legacy avatar Material could not be saved: ${JSON.stringify(saved.issues)}`);
  const reimported = await expandGltfAssets({ ...input, manifest: saved.document, modelSourceHash: "c".repeat(64) });
  const retained = reimported.materialAssets[0];
  assert(retained.properties.extensions.VRMC_materials_mtoon?.outlineColorFactor[0] === 0.1 &&
    retained.properties.extensions.VRMC_materials_mtoon.extras?.xriftVrm0CompatShade &&
    retained.properties.extensions.VRMC_materials_mtoon.matcapTexture?.textureAssetId === mtoon.matcapTexture?.textureAssetId &&
    retained.importedFromModel?.sourceHash === "c".repeat(64),
    "Avatar reimport replaced an edited outline or lost imported maps and compatibility");

  const unsupported = await expandGltfAssets({ ...input, json: { materials: [{ name: "Fallback" }],
    extensions: { VRM: { materialProperties: [{ shader: "Custom/Unsupported" }] } } } });
  assert(!unsupported.materialAssets[0].properties.extensions.VRMC_materials_mtoon &&
    unsupported.warnings.some((warning) => warning.code === "vrm0-material-shader-unsupported"),
    "Unknown legacy shaders did not retain a visible fallback and import warning");
}

function glbBinary(binary: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(20 + binary.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, binary.byteLength, true); view.setUint32(16, 0x004e4942, true); bytes.set(binary, 20);
  return bytes;
}
function near(actual: number | undefined, expected: number, message: string): void {
  assert(typeof actual === "number" && Math.abs(actual - expected) < 1e-10, message);
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
