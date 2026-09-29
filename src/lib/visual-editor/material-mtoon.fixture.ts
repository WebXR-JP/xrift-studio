import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  createDefaultMaterialAsset,
  createTextureAsset,
  getMaterialShadingModel,
  normalizeMaterialProperties,
  updateMaterialAsset,
  type AssetManifest,
  type MaterialAsset,
  type MaterialProperties,
} from "./asset-manifest";
import { readBrowserProjectArchive } from "./browser-project-transfer";
import { createDefaultCustomShader } from "./custom-shader-contract";
import { expandGltfAssets } from "./gltf-derived-assets";
import { createHierarchyTransfer, planHierarchyImport, prepareHierarchyTransferFiles } from "./hierarchy-transfer";
import { createMToonVrmHierarchyFixture } from "./hierarchy-transfer.fixture";
import { createHierarchyArchive, validateHierarchyBundle } from "./hierarchy-transfer-io";
import { aggregateMaterialSelection, applyMaterialBatchFieldValue, applyMaterialBatchPatch, applyMaterialFieldValue } from "./material-batch";
import { MATERIAL_EXTENSION_DESCRIPTORS } from "./material-extension-registry";
import { assetManifestCodec, stableSerializeJson, validateAssetManifest } from "./serialization";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function materialOf(manifest: AssetManifest): MaterialAsset {
  const material = manifest.assets["mtoon-material"];
  assert(material?.kind === "material", "MToon fixture Material disappeared");
  return material;
}

function materialAt(manifest: AssetManifest, id: string): MaterialAsset {
  const material = manifest.assets[id];
  assert(material?.kind === "material", `Material ${id} disappeared`);
  return material;
}

function equal(actual: unknown, expected: unknown, message: string): void {
  assert(stableSerializeJson(actual) === stableSerializeJson(expected), message);
}

function commonProperties(properties: MaterialProperties): MaterialProperties {
  const copy = structuredClone(properties);
  delete copy.extensions.VRMC_materials_mtoon;
  delete copy.extensions.KHR_materials_unlit;
  return copy;
}

/** Authored toon settings, fallback materials and texture UVs survive saving. */
export async function runMaterialMToonFixtureAssertions(): Promise<void> {
  const defaults = normalizeMaterialProperties({ extensions: { VRMC_materials_mtoon: {} } });
  assert(defaults.extensions.VRMC_materials_mtoon?.specVersion === "1.0", "MToon version was not initialized");
  const standard = createDefaultMaterialAsset({
    id: "mtoon-material",
    name: "MToon fixture",
    properties: {
      color: "#e69955",
      roughness: 0.4,
      extensions: { KHR_materials_clearcoat: { clearcoatFactor: 0.7 } },
    },
  });
  const texture = createTextureAsset({ id: "mtoon-mask", name: "MToon mask", source: { kind: "document" }, importSettings: {} });
  assert(standard && texture, "MToon fixture Assets could not be created");
  const manifest: AssetManifest = {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: { [standard.id]: standard, [texture.id]: texture },
  };
  const authored = updateMaterialAsset(manifest, standard.id, {
    extensions: {
      VRMC_materials_mtoon: {
        shadeColorFactor: [0.2, 0.1, 0.05],
        shadingShiftFactor: 1.2,
        outlineWidthMode: "screenCoordinates",
        outlineWidthFactor: 0.005,
        outlineColorFactor: [0.1, 0.2, 0.3],
        transparentWithZWrite: true,
        shadeMultiplyTexture: {
          textureAssetId: texture.id,
          texCoord: 1,
          transform: { offset: [0.2, 0.4], scale: [2, 3], rotation: 0.5 },
        },
        outlineWidthMultiplyTexture: texture.id,
        renderQueueOffsetNumber: -3,
        shadingShiftTexture: { textureAssetId: texture.id, scale: -0.25, texCoord: 1 },
        matcapFactor: [0.2, 0.3, 0.4],
        matcapTexture: texture.id,
        parametricRimColorFactor: [0.4, 0.3, 0.2],
        rimMultiplyTexture: texture.id,
        rimLightingMixFactor: 0.2,
        parametricRimFresnelPowerFactor: 3,
        parametricRimLiftFactor: -0.4,
        uvAnimationMaskTexture: texture.id,
        uvAnimationScrollXSpeedFactor: -0.2,
        uvAnimationScrollYSpeedFactor: 0.4,
        uvAnimationRotationSpeedFactor: 1.5,
        extras: { xriftVrm0CompatShade: true },
      },
    },
  });
  const recolored = updateMaterialAsset(authored, standard.id, {
    extensions: { VRMC_materials_mtoon: { outlineColorFactor: [0.3, 0.4, 0.5] } },
  });
  const serialized = assetManifestCodec.serialize(recolored);
  const parsed = assetManifestCodec.parse(serialized);
  assert(parsed.ok, `MToon Material failed save validation: ${JSON.stringify(parsed.issues)}`);
  const saved = materialOf(parsed.document).properties;
  const mtoon = saved.extensions.VRMC_materials_mtoon;
  assert(mtoon?.outlineColorFactor[0] === 0.3 && mtoon.shadingShiftFactor === 1.2 && mtoon.outlineWidthFactor === 0.005,
    "Editing the outline color lost independent MToon settings");
  assert(mtoon.shadeMultiplyTexture?.texCoord === 1 && mtoon.shadeMultiplyTexture.transform?.offset[1] === 0.4 &&
    mtoon.shadeMultiplyTexture.transform.scale[0] === 2 && mtoon.outlineWidthMultiplyTexture?.textureAssetId === texture.id,
    "MToon texture references or UV transforms were lost while saving");
  assert(mtoon.renderQueueOffsetNumber === -3 && mtoon.shadingShiftTexture?.scale === -0.25 && mtoon.shadingShiftTexture.texCoord === 1 &&
    mtoon.matcapTexture?.textureAssetId === texture.id && mtoon.matcapFactor?.[1] === 0.3 && mtoon.rimMultiplyTexture?.textureAssetId === texture.id &&
    mtoon.parametricRimColorFactor?.[2] === 0.2 && mtoon.rimLightingMixFactor === 0.2 && mtoon.parametricRimFresnelPowerFactor === 3 &&
    mtoon.parametricRimLiftFactor === -0.4 && mtoon.uvAnimationMaskTexture?.textureAssetId === texture.id &&
    mtoon.uvAnimationScrollXSpeedFactor === -0.2 && mtoon.uvAnimationScrollYSpeedFactor === 0.4 && mtoon.uvAnimationRotationSpeedFactor === 1.5 &&
    mtoon.extras?.xriftVrm0CompatShade === true, "Editing an outline lost imported MToon feature settings");
  assert(saved.extensions.KHR_materials_clearcoat?.clearcoatFactor === 0.7 && saved.pbrMetallicRoughness.roughnessFactor === 0.4,
    "Enabling MToon changed the stored standard Material");
  const disabled = updateMaterialAsset(parsed.document, standard.id, { extensions: { VRMC_materials_mtoon: null } });
  assert(JSON.stringify(materialOf(disabled).properties) === JSON.stringify(standard.properties),
    "Switching back to the standard Material did not restore its existing settings");

  const invalid = JSON.parse(serialized) as { assets: Record<string, { properties: { extensions: { VRMC_materials_mtoon: Record<string, unknown> } } }> };
  const invalidMToon = invalid.assets[standard.id].properties.extensions.VRMC_materials_mtoon;
  invalidMToon.specVersion = "0.0";
  invalidMToon.outlineWidthMode = "pixels";
  invalidMToon.transparentWithZWrite = "yes";
  invalidMToon.renderQueueOffsetNumber = 1.5;
  invalidMToon.extras = { xriftVrm0CompatShade: "yes" };
  const issues = validateAssetManifest(invalid);
  assert(["specVersion", "outlineWidthMode", "transparentWithZWrite", "renderQueueOffsetNumber", "xriftVrm0CompatShade"].every((key) => issues.some((issue) => issue.path.endsWith(`.${key}`))),
    "Invalid MToon version, outline mode or depth flag passed document validation");
  delete invalidMToon.specVersion;
  assert(validateAssetManifest(invalid).some((issue) => issue.path.endsWith(".specVersion") && issue.code === "required"),
    "Saved MToon without its required specVersion passed validation");

  const imported = await expandGltfAssets({
    json: {
      asset: { version: "2.0" },
      materials: [
        {
          name: "MToon with Unlit fallback",
          extensions: {
            KHR_materials_unlit: {},
            VRMC_materials_mtoon: { specVersion: "1.0", shadingShiftFactor: -1.3, outlineWidthMode: "worldCoordinates", outlineWidthFactor: 0.01 },
          },
        },
        { name: "Unsupported MToon version", extensions: { VRMC_materials_mtoon: { specVersion: "0.0" } } },
        { name: "MToon rim field", extensions: { VRMC_materials_mtoon: { specVersion: "1.0", parametricRimColorFactor: [0.1, 0.2, 0.3], customUnsupportedField: 4 } } },
      ],
    },
    modelBytes: new Uint8Array(),
    sourceFormat: "glb",
    modelAssetId: "mtoon-source",
    modelSourceHash: "a".repeat(64),
    materialSlots: [{ slot: "material-0", name: "MToon", sourceMaterialIndex: 0 }],
    materialFolderId: "mtoon-materials",
    textureFolderId: "mtoon-textures",
    hashBytes: async () => "b".repeat(64),
  });
  const importedMaterial = imported.materialAssets[0];
  assert(importedMaterial.properties.extensions.VRMC_materials_mtoon?.shadingShiftFactor === -1.3 &&
    importedMaterial.properties.extensions.KHR_materials_unlit !== undefined && !imported.warnings.some((warning) => warning.fieldPath.startsWith("materials[0]")),
    "glTF import lost MToon or its permitted Unlit fallback");
  assert(imported.materialAssets[1].properties.extensions.VRMC_materials_mtoon === undefined &&
    imported.warnings.some((warning) => warning.code === "gltf-material-extension-version-unsupported") &&
    imported.materialAssets[2].properties.extensions.VRMC_materials_mtoon?.parametricRimColorFactor?.[2] === 0.3 &&
    imported.warnings.some((warning) => warning.code === "gltf-material-extension-property-unsupported" && warning.fieldPath.endsWith(".customUnsupportedField")),
    "glTF import silently accepted unsupported MToon versions or dropped unsupported features");
  const importedManifest: AssetManifest = {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    folders: { "mtoon-materials": { id: "mtoon-materials", name: "MToon Materials", parentId: null, order: 0 } },
    assets: { [importedMaterial.id]: importedMaterial },
  };
  assert(assetManifestCodec.parse(assetManifestCodec.serialize(importedManifest)).ok,
    "MToon and Unlit coexistence did not survive a document round-trip");
  await assertMaterialShadingConversions();
  await assertInactiveMToonPackageRoundTrip();
  await assertMaterialBatchFields();
}

/** One operation derives each Material's shade from its own unchanged PBR data. */
async function assertMaterialShadingConversions(): Promise<void> {
  const { bundle } = await createMToonVrmHierarchyFixture("1");
  const original = materialAt(bundle.assets, "material");
  original.importedFromModel!.isUserOverridden = false;
  original.thumbnail = { status: "generated", derivedPath: "assets/.derived/fixture.png", sourceHash: "a".repeat(64), rendererVersion: "fixture" };
  let manifest = bundle.assets;
  assert(updateMaterialAsset(manifest, original.id, { shadingModel: "mtoon-1.0" }) === manifest,
    "Selecting the same MToon kind changed the imported Material, provenance or thumbnail");
  const modernWithoutExtras = createDefaultMaterialAsset({ id: "modern-default", name: "Modern default", properties: { extensions: { VRMC_materials_mtoon: {} } } })!;
  manifest = { ...manifest, assets: { ...manifest.assets, [modernWithoutExtras.id]: modernWithoutExtras } };
  assert(updateMaterialAsset(manifest, modernWithoutExtras.id, { shadingModel: "mtoon-1.0" }) === manifest,
    "Selecting modern MToon inserted unnecessary compatibility metadata");
  const pbrMaterials = [[0.9, 0.2, 0.1, 0.45], [0.1, 0.5, 0.8, 0.85]].map((factor, index) => createDefaultMaterialAsset({
    id: `pbr-${index}`, name: `PBR ${index}`, properties: {
      ...commonProperties(original.properties),
      pbrMetallicRoughness: { ...original.properties.pbrMetallicRoughness,
        baseColorFactor: factor as [number, number, number, number],
        baseColorTexture: { textureAssetId: index ? "map-9" : "map-0", texCoord: index,
          transform: { offset: [index / 4, -0.2], scale: [-2, 3], rotation: 0.7 } },
        metallicRoughnessTexture: { textureAssetId: "map-4", texCoord: 1, transform: { offset: [0.2, 0.3] } },
      },
      occlusionTexture: { textureAssetId: "map-5", texCoord: 1, strength: 0.35, transform: { scale: [2, 4] } },
      extensions: { KHR_materials_clearcoat: { clearcoatFactor: 0.7 } },
    },
  })!);
  for (const material of pbrMaterials) manifest = { ...manifest, assets: { ...manifest.assets, [material.id]: material } };
  const before = stableSerializeJson(manifest);
  const legacy = pbrMaterials.reduce((current, material) => updateMaterialAsset(current, material.id, { shadingModel: "mtoon-0.x" }), manifest);
  equal(stableSerializeJson(manifest), before, "Bulk conversion mutated its source manifest");
  for (const source of pbrMaterials) {
    const converted = materialAt(legacy, source.id);
    const toon = converted.properties.extensions.VRMC_materials_mtoon!;
    equal(commonProperties(converted.properties), source.properties, "Bulk conversion changed a Material's Diffuse, alpha, common maps or UV settings");
    equal(toon.shadeColorFactor, source.properties.pbrMetallicRoughness.baseColorFactor.slice(0, 3).map(value => value * 0.8), "Bulk conversion reused another Material's shade color");
    equal(toon.shadeMultiplyTexture, source.properties.pbrMetallicRoughness.baseColorTexture, "Initial MToon shade lost its individual Base Color map or transform");
    assert(toon.shadeMultiplyTexture !== converted.properties.pbrMetallicRoughness.baseColorTexture,
      "Shade and Base Color texture settings share a mutable object");
    assert(getMaterialShadingModel(converted) === "mtoon-0.x" && toon.specVersion === "1.0" &&
      toon.outlineWidthMode === "worldCoordinates" && toon.outlineWidthFactor === 0.003, "New MToon legacy selection or outline preset was not initialized");
  }
  const modern = pbrMaterials.reduce((current, material) => updateMaterialAsset(current, material.id, { shadingModel: "mtoon-1.0" }), legacy);
  for (const source of pbrMaterials) {
    const previous = materialAt(legacy, source.id).properties.extensions.VRMC_materials_mtoon!;
    const next = materialAt(modern, source.id);
    equal(next.properties.extensions.VRMC_materials_mtoon, { ...previous, extras: { xriftVrm0CompatShade: false } }, "MToon 0.x to 1.0 changed settings beyond the compatibility flag");
    assert(getMaterialShadingModel(next) === "mtoon-1.0" && updateMaterialAsset(modern, source.id, { shadingModel: "mtoon-1.0" }) === modern,
      "Modern selection did not settle into a no-op");
  }
  const legacyImported = updateMaterialAsset(manifest, original.id, { shadingModel: "mtoon-0.x" });
  const changed = materialAt(legacyImported, original.id);
  assert(changed.importedFromModel?.isUserOverridden && changed.thumbnail?.status === "stale", "A real shading change failed to invalidate import provenance or generated thumbnail");
  equal(changed.properties.extensions.VRMC_materials_mtoon,
    { ...original.properties.extensions.VRMC_materials_mtoon, extras: { xriftVrm0CompatShade: true } }, "Imported MToon compatibility toggle lost one of its ten maps or authored settings");
  const standard = updateMaterialAsset(legacyImported, original.id, { shadingModel: "standard" });
  const inactive = materialAt(standard, original.id);
  assert(getMaterialShadingModel(inactive) === "standard" && !inactive.properties.extensions.VRMC_materials_mtoon && !inactive.properties.extensions.KHR_materials_unlit,
    "Explicit Standard selection retained a toon shader or Unlit fallback instead of lit PBR");
  equal(inactive.properties, commonProperties(original.properties), "Returning to Standard changed common values or maps");
  equal(inactive.savedMToonSettings, changed.properties.extensions.VRMC_materials_mtoon, "Returning to Standard lost inactive toon authoring settings");
  const saved = assetManifestCodec.parse(assetManifestCodec.serialize(standard));
  assert(saved.ok, `Inactive MToon failed save validation: ${JSON.stringify(saved.issues)}`);
  equal(materialAt(saved.document, original.id).savedMToonSettings, inactive.savedMToonSettings, "Inactive toon settings changed during codec round trip");
  const editedPbr = updateMaterialAsset(saved.document, original.id, { color: "#24aabb", roughness: 0.2 });
  const restored = materialAt(updateMaterialAsset(editedPbr, original.id, { shadingModel: "mtoon-1.0" }), original.id);
  equal(restored.properties.extensions.VRMC_materials_mtoon,
    { ...inactive.savedMToonSettings, extras: { xriftVrm0CompatShade: false } }, "Reselecting MToon did not restore all authored maps and settings");
  equal(commonProperties(restored.properties), materialAt(editedPbr, original.id).properties, "Restoring MToon overwrote later PBR edits");
  assert(restored.savedMToonSettings === undefined, "Restored active MToon kept a stale inactive snapshot");
  assert(updateMaterialAsset(standard, original.id, { shadingModel: "standard" }) === standard, "Repeated Standard selection dirtied the Material");
  assert(!("shadingModel" in restored) && !("shadingModel" in restored.properties), "The shading operation leaked into persisted Material data");
  const stillUnlit = materialAt(updateMaterialAsset(manifest, original.id, { roughness: 0.2 }), original.id);
  assert(stillUnlit.properties.extensions.KHR_materials_unlit, "An ordinary edit discarded a VRM's Unlit fallback without a shading operation");
  const classic: MaterialAsset = { ...original, id: "classic", shader: createDefaultCustomShader() };
  const brush: MaterialAsset = { ...original, id: "brush", shader: { kind: "openbrush", renderer: "three-icosa", rendererVersion: "fixture", brushName: "Ink", brushBaseUrl: "/brushes", sourceMaterialIndex: 0 } };
  const guarded = { ...manifest, assets: { ...manifest.assets, classic, brush } };
  for (const asset of [classic, brush]) assert(getMaterialShadingModel(asset) === undefined && updateMaterialAsset(guarded, asset.id, { shadingModel: "standard" }) === guarded,
    "Builtin bulk conversion changed a custom/OpenBrush renderer");
  assert(getMaterialShadingModel(undefined) === undefined && updateMaterialAsset(guarded, "missing", { shadingModel: "standard" }) === guarded, "Missing Material conversion did not preserve the manifest");
  const invalidCases: Array<[unknown, string]> = [[null, "savedMToonSettings"],
    [{ ...inactive.savedMToonSettings, specVersion: "0.0" }, ".specVersion"],
    [{ ...inactive.savedMToonSettings, outlineWidthFactor: -1 }, ".outlineWidthFactor"],
    [{ ...inactive.savedMToonSettings, shadeMultiplyTexture: { textureAssetId: "missing", texCoord: 0 } }, ".textureAssetId"],
    [{ ...inactive.savedMToonSettings, extras: { xriftVrm0CompatShade: "yes" } }, ".xriftVrm0CompatShade"]];
  for (const [settings, suffix] of invalidCases) {
    const invalid = JSON.parse(assetManifestCodec.serialize(standard));
    invalid.assets[original.id].savedMToonSettings = settings;
    assert(validateAssetManifest(invalid).some(issue => issue.path.includes(".savedMToonSettings") && issue.path.endsWith(suffix)) && !assetManifestCodec.parse(JSON.stringify(invalid)).ok,
      `Invalid inactive toon ${suffix} passed value/reference validation`);
  }
}

/** Inactive maps are real dependencies and must be remapped inside .xriftstudio. */
async function assertInactiveMToonPackageRoundTrip(): Promise<void> {
  const mapSlots = ["shadeMultiplyTexture", "outlineWidthMultiplyTexture", "shadingShiftTexture", "matcapTexture", "rimMultiplyTexture", "uvAnimationMaskTexture"] as const;
  for (const version of ["0", "1"] as const) {
    const { bundle: source, files } = await createMToonVrmHierarchyFixture(version);
    const original = materialAt(source.assets, "material");
    source.assets = updateMaterialAsset(source.assets, original.id, { shadingModel: "standard" });
    const read = async (path: string): Promise<Uint8Array> => { const data = files.get(path); assert(data, `Package payload ${path} missing`); return data; };
    const prepared = await prepareHierarchyTransferFiles(createHierarchyTransfer(source, ["child"], "local"), read);
    assert(prepared.files.size === 11 && mapSlots.every(key => prepared.bundle.assets.assets[original.properties.extensions.VRMC_materials_mtoon![key]!.textureAssetId]),
      "Inactive MToon maps were excluded from Entity package dependencies");
    const archive = await createHierarchyArchive(prepared);
    const packageBytes = new Uint8Array(await archive.blob.arrayBuffer());
    assert(archive.fileName.endsWith(".xriftstudio") && packageBytes[0] === 0x50 && packageBytes[1] === 0x4b, "Inactive MToon was not written to real package bytes");
    const reopened = await readBrowserProjectArchive(new File([packageBytes], archive.fileName));
    const documents = reopened.documents;
    const restoredBundle = { project: documents.project, assets: documents.assets, prefabs: documents.prefabs, scene: documents.scenes[documents.project.entrySceneId] };
    const transfer = await prepareHierarchyTransferFiles(createHierarchyTransfer(restoredBundle, restoredBundle.scene.rootEntityIds, "local"), async path => {
      const data = reopened.files.get(path); assert(data, `Reopened package payload ${path} missing`); return data;
    });
    const plan = planHierarchyImport(source, transfer, { placement: "local" });
    validateHierarchyBundle(plan.bundle);
    assert(plan.assetIdMap.material !== "material" && plan.assetIdMap.model !== "model", "Inactive package import reused colliding source IDs");
    const imported = materialAt(plan.bundle.assets, plan.assetIdMap.material);
    const expected = structuredClone(original.properties.extensions.VRMC_materials_mtoon!);
    for (const key of mapSlots) expected[key]!.textureAssetId = plan.assetIdMap[expected[key]!.textureAssetId];
    equal(imported.savedMToonSettings, expected, "Inactive MToon factors, compatibility or six private map transforms changed during package import");
    const activated = materialAt(updateMaterialAsset(plan.bundle.assets, imported.id, { shadingModel: version === "0" ? "mtoon-0.x" : "mtoon-1.0" }), imported.id);
    equal(activated.properties.extensions.VRMC_materials_mtoon, expected, "Packaged inactive MToon could not restore its complete settings");
    equal(commonProperties(activated.properties), imported.properties, "Packaged inactive MToon restoration changed common maps or colors");
    assert(activated.savedMToonSettings === undefined && activated.importedFromModel?.modelAssetId === plan.assetIdMap.model, "Packaged MToon activation kept stale settings or broke VRM provenance");
    const avatar = plan.bundle.assets.assets[plan.assetIdMap.model];
    assert(avatar.kind === "model" && avatar.source.kind === "project", "Packaged VRM source disappeared");
    equal(plan.files.get(avatar.source.relativePath), files.get(`assets/avatar-${version}.vrm`), "Inactive shader conversion changed original VRM skin/morph source bytes");
    assert(materialAt(source.assets, original.id).savedMToonSettings?.extras?.xriftVrm0CompatShade === (version === "0"), "Package import mutated source legacy compatibility settings");
  }
}

function propertyAt(properties: MaterialProperties, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, properties);
}

/** Shared controls must send field operations without borrowing a primary's values. */
async function assertMaterialBatchFields(): Promise<void> {
  const { bundle } = await createMToonVrmHierarchyFixture("0");
  const first = materialAt(bundle.assets, "material");
  first.properties = normalizeMaterialProperties({ ...first.properties,
    pbrMetallicRoughness: { ...first.properties.pbrMetallicRoughness, metallicRoughnessTexture: first.properties.normalTexture },
    occlusionTexture: { ...first.properties.normalTexture!, strength: 0.45 },
    extensions: { ...first.properties.extensions, KHR_materials_clearcoat: { clearcoatFactor: 0.7 } },
  });
  const second: MaterialAsset = { ...structuredClone(first), id: "material-second", name: "Second Material" };
  second.properties.pbrMetallicRoughness.baseColorFactor = [0.8, 0.3, 0.1, 0.9];
  second.properties.emissiveFactor = [0.7, 0.8, 0.9];
  const secondToon = second.properties.extensions.VRMC_materials_mtoon!;
  secondToon.shadeColorFactor = [0.8, 0.7, 0.6];
  secondToon.outlineColorFactor = [0.7, 0.8, 0.9];
  secondToon.matcapFactor = [0.9, 0.7, 0.5];
  secondToon.parametricRimColorFactor = [0.8, 0.6, 0.4];
  second.properties.normalTexture!.scale = 0.9;
  secondToon.shadingShiftTexture!.scale = 0.8;
  delete second.properties.extensions.KHR_materials_clearcoat;
  delete secondToon.uvAnimationMaskTexture;
  const texturePaths = ["pbrMetallicRoughness.baseColorTexture", "pbrMetallicRoughness.metallicRoughnessTexture", "normalTexture", "occlusionTexture", "emissiveTexture", "opacityTexture",
    ...["shadeMultiplyTexture", "outlineWidthMultiplyTexture", "shadingShiftTexture", "matcapTexture", "rimMultiplyTexture", "uvAnimationMaskTexture"].map(slot => `extensions.VRMC_materials_mtoon.${slot}`)];
  for (const path of texturePaths) {
    const texture = propertyAt(second.properties, path) as Record<string, unknown> | undefined;
    if (texture) { texture.textureAssetId = "map-8"; texture.texCoord = 0; texture.transform = { offset: [0.8, 0.6], scale: [-3, 4], rotation: 0.9 }; }
  }
  second.properties = normalizeMaterialProperties(second.properties);
  const custom: MaterialAsset = { ...structuredClone(first), id: "material-custom", shader: createDefaultCustomShader() };
  let manifest: AssetManifest = { ...bundle.assets, assets: { ...bundle.assets.assets, [second.id]: second, [custom.id]: custom } };
  const input = manifest;
  const ids = ["model", "map-0", first.id, second.id, custom.id];
  const snapshot = stableSerializeJson(manifest);
  const selection = aggregateMaterialSelection(ids.map(id => manifest.assets[id]));
  assert(selection.materials.length === 3 && selection.eligibleMaterials.length === 2 && selection.primaryMaterial === first && selection.canEditProperties && selection.shadingModel === "mtoon-0.x",
    "A mixed Asset selection did not aggregate only matching builtin Materials");
  for (const path of ["pbrMetallicRoughness.baseColorFactor", "pbrMetallicRoughness.baseColorFactor.0", "extensions", "extensions.KHR_materials_clearcoat.enabled", "extensions.KHR_materials_clearcoat.clearcoatFactor",
    "normalTexture.scale", "normalTexture.transform.offset.0", "extensions.VRMC_materials_mtoon.shadingShiftTexture.scale", "extensions.VRMC_materials_mtoon.uvAnimationMaskTexture.textureAssetId"]) {
    assert(selection.mixedPropertyPaths.has(path), `Mixed Material field ${path} was not detected`);
  }
  assert(!selection.mixedPropertyPaths.has("alphaMode") && !selection.mixedPropertyPaths.has("extensions.VRMC_materials_mtoon.specVersion") && !selection.mixedPropertyPaths.has("extensions.VRMC_materials_mtoon.enabled"),
    "Equal scalar fields or present MToon extensions appeared mixed");
  const unlit = createDefaultMaterialAsset({ id: "empty-unlit", name: "Empty Unlit", properties: { extensions: { KHR_materials_unlit: {} } } })!;
  assert(aggregateMaterialSelection([unlit, structuredClone(unlit)]).mixedPropertyPaths.size === 0,
    "Equal empty extensions were compared by object identity");
  const maskPath = "extensions.VRMC_materials_mtoon.uvAnimationMaskTexture";
  assert(applyMaterialFieldValue(second, `${maskPath}.transform.offset.0`, 0.6) === undefined, "Editing UV on an unbound map fabricated a texture binding");
  manifest = applyMaterialBatchFieldValue(manifest, ids, `${maskPath}.transform.offset.0`, 0.6);
  assert(materialAt(manifest, second.id).properties.extensions.VRMC_materials_mtoon?.uvAnimationMaskTexture === undefined,
    "A bulk UV edit assigned a primary Material's map to an unbound target");

  for (const descriptor of MATERIAL_EXTENSION_DESCRIPTORS.VRMC_materials_mtoon.fields) {
    const value = descriptor.kind === "unit" ? 0.42 : descriptor.kind === "nonNegative" ? 0.012 : descriptor.kind === "finite" ? -0.42
      : descriptor.kind === "boolean" ? false : descriptor.kind === "integer" ? -2 : descriptor.kind === "enum" ? (descriptor.name === "specVersion" ? "1.0" : "worldCoordinates") : undefined;
    if (value === undefined) continue;
    const path = `extensions.VRMC_materials_mtoon.${descriptor.name}`;
    manifest = applyMaterialBatchFieldValue(manifest, ids, path, value);
    for (const id of [first.id, second.id]) equal(propertyAt(materialAt(manifest, id).properties, path), value, `Bulk MToon scalar ${descriptor.name} was not applied`);
  }
  const colorPaths = ["pbrMetallicRoughness.baseColorFactor", "emissiveFactor", "extensions.VRMC_materials_mtoon.shadeColorFactor", "extensions.VRMC_materials_mtoon.outlineColorFactor",
    "extensions.VRMC_materials_mtoon.matcapFactor", "extensions.VRMC_materials_mtoon.parametricRimColorFactor"];
  for (const path of colorPaths) {
    const before = [first.id, second.id].map(id => propertyAt(materialAt(manifest, id).properties, path) as number[]);
    manifest = applyMaterialBatchFieldValue(manifest, ids, `${path}.1`, 0.37);
    for (const [index, id] of [first.id, second.id].entries()) {
      const expected = [...before[index]]; expected[1] = 0.37;
      equal(propertyAt(materialAt(manifest, id).properties, path), expected, `Bulk RGB component ${path} replaced untouched components with primary values`);
    }
    const updatedSelection = aggregateMaterialSelection([materialAt(manifest, first.id), materialAt(manifest, second.id)]);
    assert(!updatedSelection.mixedPropertyPaths.has(`${path}.1`) && updatedSelection.mixedPropertyPaths.has(path), "Aggregate did not distinguish common and mixed color components after editing");
  }
  const alphaBefore = [first.id, second.id].map(id => materialAt(manifest, id).properties.pbrMetallicRoughness.baseColorFactor[3]);
  manifest = applyMaterialBatchFieldValue(manifest, ids, "color", "#3377aa");
  for (const [index, id] of [first.id, second.id].entries()) assert(materialAt(manifest, id).properties.pbrMetallicRoughness.baseColorFactor[3] === alphaBefore[index], "Bulk Base Color picker overwrote individual alpha");
  for (const path of texturePaths) {
    const before = [first.id, second.id].map(id => structuredClone(propertyAt(materialAt(manifest, id).properties, path)) as { texCoord: number; transform?: { offset: number[]; scale: number[]; rotation: number } } | undefined);
    manifest = applyMaterialBatchFieldValue(manifest, ids, `${path}.textureAssetId`, "map-9");
    for (const [index, id] of [first.id, second.id].entries()) {
      const value = propertyAt(materialAt(manifest, id).properties, path) as { textureAssetId: string; texCoord: number; transform?: unknown };
      assert(value.textureAssetId === "map-9" && value.texCoord === (before[index]?.texCoord ?? 0), "Bulk map selection lost a target's UV channel");
      equal(value.transform, before[index]?.transform, "Bulk map selection reused primary UV transform");
    }
    manifest = applyMaterialBatchFieldValue(manifest, ids, `${path}.transform.offset.0`, 0.31);
    manifest = applyMaterialBatchFieldValue(manifest, ids, `${path}.transform.scale.1`, -1.4);
    manifest = applyMaterialBatchFieldValue(manifest, ids, `${path}.transform.rotation`, -0.25);
    manifest = applyMaterialBatchFieldValue(manifest, ids, `${path}.texCoord`, 1);
    for (const [index, id] of [first.id, second.id].entries()) {
      const value = propertyAt(materialAt(manifest, id).properties, path) as { texCoord: number; transform: { offset: number[]; scale: number[]; rotation: number } };
      equal(value.transform, { offset: [0.31, before[index]?.transform?.offset?.[1] ?? 0], scale: [before[index]?.transform?.scale?.[0] ?? 1, -1.4], rotation: -0.25 }, `Bulk UV edit ${path} replaced another coordinate or map`);
      assert(value.texCoord === 1, "Bulk UV channel edit did not apply to every assigned map");
    }
  }
  for (const path of ["normalTexture.scale", "extensions.VRMC_materials_mtoon.shadingShiftTexture.scale"]) {
    manifest = applyMaterialBatchFieldValue(manifest, ids, path, -0.27);
    for (const id of [first.id, second.id]) assert(propertyAt(materialAt(manifest, id).properties, path) === -0.27, "Signed texture scale was clamped during bulk editing");
  }
  manifest = applyMaterialBatchFieldValue(manifest, ids, "occlusionTexture.strength", 0.35);
  for (const id of [first.id, second.id]) assert(materialAt(manifest, id).properties.occlusionTexture?.strength === 0.35, "Bulk occlusion strength edit was not applied");
  const preserved = materialAt(manifest, first.id).properties.extensions.KHR_materials_clearcoat;
  manifest = applyMaterialBatchFieldValue(manifest, ids, "extensions.KHR_materials_clearcoat.enabled", true);
  equal(materialAt(manifest, first.id).properties.extensions.KHR_materials_clearcoat, preserved, "Enabling a mixed optional extension reset existing values");
  assert(materialAt(manifest, second.id).properties.extensions.KHR_materials_clearcoat, "Enabling a mixed optional extension left a target disabled");
  assert(!aggregateMaterialSelection([materialAt(manifest, first.id), materialAt(manifest, second.id)]).mixedPropertyPaths.has("extensions.KHR_materials_clearcoat.enabled"), "Equal extension presence was marked mixed because parameter values differ");
  manifest = applyMaterialBatchFieldValue(manifest, ids, "extensions.KHR_materials_dispersion.enabled", true);
  assert(assetManifestCodec.parse(assetManifestCodec.serialize(manifest)).ok, "Bulk extension enable omitted required Transmission/Volume or corrupted maps");
  manifest = applyMaterialBatchFieldValue(manifest, ids, "extensions.KHR_materials_transmission.enabled", false);
  for (const id of [first.id, second.id]) {
    const extensions = materialAt(manifest, id).properties.extensions;
    assert(!extensions.KHR_materials_transmission && !extensions.KHR_materials_volume && !extensions.KHR_materials_dispersion, "Bulk extension disable retained orphan dependent extensions");
  }
  const noOp = applyMaterialBatchPatch(manifest, [...ids, first.id, "missing"], { roughness: first.properties.roughness });
  assert(noOp === manifest && applyMaterialBatchFieldValue(manifest, ids, "shader.vertexShader", "bad") === manifest && applyMaterialBatchFieldValue(manifest, ids, "normalTexture.transform.offset.3", 1) === manifest,
    "A duplicate/no-op or unsupported field edit changed the manifest");
  equal(manifest.assets[custom.id], custom, "Bulk settings changed a custom renderer");
  assert(manifest.assets.model === bundle.assets.assets.model && manifest.assets["map-0"] === bundle.assets.assets["map-0"], "Bulk settings changed other selected Asset kinds");
  equal(stableSerializeJson(input), snapshot, "Bulk settings mutated its input Assets");
  const mixedKinds = updateMaterialAsset(manifest, second.id, { shadingModel: "mtoon-1.0" });
  assert(!aggregateMaterialSelection([materialAt(mixedKinds, first.id), materialAt(mixedKinds, second.id)]).canEditProperties && applyMaterialBatchPatch(mixedKinds, ids, { color: "#ffffff" }) === mixedKinds && applyMaterialBatchFieldValue(mixedKinds, ids, "alphaCutoff", 0.6) === mixedKinds,
    "Settings were applied across different builtin shading kinds");
  const unified = applyMaterialBatchPatch(mixedKinds, ids, { shadingModel: "mtoon-1.0" });
  assert(aggregateMaterialSelection([materialAt(unified, first.id), materialAt(unified, second.id)]).canEditProperties && unified.assets[custom.id] === custom,
    "Type-only operation did not unify matching builtin targets while skipping custom renderers");
  const cleared = applyMaterialBatchFieldValue(unified, ids, `${maskPath}.textureAssetId`, null);
  for (const id of [first.id, second.id]) assert(materialAt(cleared, id).properties.extensions.VRMC_materials_mtoon?.uvAnimationMaskTexture === undefined, "Bulk map removal did not clear selected slots");
}
