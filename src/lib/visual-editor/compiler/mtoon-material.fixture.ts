import {
  normalizeMaterialProperties,
  normalizeModelImportSettings,
  normalizeTextureImportSettings,
  updateMaterialAsset,
  type AssetManifest,
  type MaterialAsset,
  type ModelAsset,
  type TextureAsset,
} from "../asset-manifest";
import { createPrototypeProject, BUILTIN_ASSET_IDS } from "../prototype-project";
import { BUILTIN_PRIMITIVE_CREATION_IDS } from "../creation-catalog";
import { compileVisualProject } from "./compile";
import { COMPILER_MTOON_PACKAGE_SPEC } from "./runtime-packages";
import { isAllowedCompilerRuntimePackage } from "../../xrift-cli";
import mtoonMaterialSource from "../../../../packages/xrift-studio-runtime/src/mtoon-material.tsx?raw";
import mtoonContractSource from "../../../../packages/xrift-studio-runtime/src/mtoon-contract.ts?raw";
import mtoonRuntimeSource from "../../../../packages/xrift-studio-runtime/src/mtoon-runtime.ts?raw";
import { XriftThreeLoader, disposeXriftLoadResult } from "../../../../packages/xrift-studio-runtime/src/three/index";
import type { XriftRuntimeManifest } from "../../../../packages/xrift-studio-runtime/src/schema";
import { Clock, DoubleSide, Mesh, Texture } from "three";
import { attachMToonOutlines, createMToonMaterial, updateMToonMaterials } from "../../../../packages/xrift-studio-runtime/src/mtoon-runtime";
import { MToonMaterial } from "@pixiv/three-vrm";
import { assetManifestCodec } from "../serialization";
import { expandGltfAssets } from "../gltf-derived-assets";
import { createVrmAvatarFixtureBytes } from "./vrm-avatar.fixture";

/** Authored toon settings must survive output on primitives and glTF slots. */
export function runMToonMaterialCompilerFixtureAssertions(mode: "primitive" | "model" | "vrm" = "primitive") {
  const usesModel = mode !== "primitive";
  const prototype = createPrototypeProject("world", `mtoon-compiler-${mode}`);
  const texture: TextureAsset = {
    id: "fixture-mtoon-texture", name: "Toon texture", kind: "texture", status: "ready",
    source: { kind: "project", relativePath: "assets/toon.png" },
    importSettings: normalizeTextureImportSettings({ flipY: false }),
  };
  const textureInfo = {
    textureAssetId: texture.id,
    texCoord: 0,
    transform: { offset: [0.25, 0.125] as [number, number], rotation: 0.4, scale: [2, 0.75] as [number, number] },
  };
  const material: MaterialAsset = {
    id: "fixture-mtoon-material", name: "Colored outline", kind: "material", status: "ready",
    source: { kind: "document" },
    properties: normalizeMaterialProperties({
      pbrMetallicRoughness: { baseColorFactor: [0.13, 0.52, 0.77, 0.65], baseColorTexture: textureInfo },
      opacityTexture: textureInfo, opacityChannel: "b", normalTexture: { ...textureInfo, scale: 0.4 },
      emissiveFactor: [0.025, 0.015, 0.005], emissiveTexture: textureInfo,
      alphaMode: "BLEND",
      extensions: {
        KHR_materials_unlit: {},
        VRMC_materials_mtoon: {
          shadeColorFactor: [0.025, 0.075, 0.17], shadingShiftFactor: -0.2,
          shadingToonyFactor: 0.8, giEqualizationFactor: 0.6,
          outlineWidthMode: "screenCoordinates", outlineWidthFactor: 0.007,
          outlineColorFactor: [0.7, 0.02, 0.05], outlineLightingMixFactor: 0.25,
          transparentWithZWrite: true,
          shadeMultiplyTexture: textureInfo, outlineWidthMultiplyTexture: textureInfo,
          shadingShiftTexture: { ...textureInfo, scale: 0.7 },
          matcapTexture: textureInfo, matcapFactor: [0.35, 0.7, 0.85],
          rimMultiplyTexture: textureInfo, parametricRimColorFactor: [0.45, 0.15, 0.65],
          rimLightingMixFactor: 0.25, parametricRimFresnelPowerFactor: 4,
          parametricRimLiftFactor: 0.1, uvAnimationMaskTexture: textureInfo,
          uvAnimationScrollXSpeedFactor: 0.03, uvAnimationScrollYSpeedFactor: -0.02,
          uvAnimationRotationSpeedFactor: 0.15,
          extras: { xriftVrm0CompatShade: usesModel },
        },
      },
    }),
  };
  const model: ModelAsset = {
    id: "fixture-mtoon-model", name: "Two slots", kind: "model", status: "ready",
    source: { kind: "project", relativePath: mode === "vrm" ? "assets/toon.vrm" : "assets/toon.glb" },
    importSettings: normalizeModelImportSettings({}),
    materialSlots: [
      { slot: "default", name: "Surface", sourceMaterialIndex: 0 },
      { slot: "accent", name: "Accent", sourceMaterialIndex: 1 },
    ],
  };
  for (const entity of Object.values(prototype.scene.entities)) {
    for (const component of entity.components) {
      if (component.type !== "mesh") continue;
      component.geometry = usesModel
        ? { kind: "asset", assetId: model.id }
        : { kind: "builtin-primitive", creationId: BUILTIN_PRIMITIVE_CREATION_IDS.sphere, primitive: "sphere" };
      component.materialBindings = [
        { slot: "default", materialAssetId: material.id },
        ...(usesModel ? [
          { slot: "accent", materialAssetId: BUILTIN_ASSET_IDS.material.green },
          { slot: "default", materialAssetId: material.id, sourceNodeIndex: 3 },
        ] : []),
      ];
    }
  }
  prototype.assets.assets[material.id] = material;
  prototype.assets.assets[texture.id] = texture;
  if (usesModel) prototype.assets.assets[model.id] = model;
  const result = compileVisualProject({
    project: prototype.project, assets: prototype.assets,
    scenes: { [prototype.scene.sceneId]: prototype.scene }, prefabs: prototype.prefabs,
  });
  assert(result.canStage, `MToon ${mode} must compile: ${JSON.stringify(result.diagnostics)}`);
  const source = result.overlayFiles.find((file) => file.relativePath === "src/World.tsx")?.content ?? "";
  assert(source.includes("<XriftMToonMaterial"), "MToon assignments lost their shared shader runtime");
  for (const [key, value] of Object.entries(material.properties.extensions.VRMC_materials_mtoon!)) {
    assert(source.includes(`${JSON.stringify(key)}:${JSON.stringify(value)}`), `MToon lost authored ${key}`);
  }
  for (const key of ["baseColorMap", "opacityMap", "normalMap", "emissiveMap", "shadeMultiplyMap", "shadingShiftMap", "matcapMap", "rimMultiplyMap", "outlineWidthMultiplyMap", "uvAnimationMaskMap"]) {
    assert(source.includes(`const ${key} = useCompiledTexture`), `MToon texture ${key} is not resolved in output`);
  }
  assert(source.includes('"rotation":0.4') && source.includes('"scale":[2,0.75]'), "MToon textures lost their UV transforms");
  const runtime = result.overlayFiles.find((file) => file.relativePath === "src/xrift-studio/mtoon-material.tsx");
  const emittedSource = (source: string) => source
    .replace(/"\.\/mtoon-contract(?:\.js)?"/g, '"./mtoon-contract"')
    .replace(/"\.\/mtoon-runtime(?:\.js)?"/g, '"./mtoon-runtime"')
    .replace(/"@pixiv\/three-vrm"/g, '"./three-vrm-readable"');
  assert(runtime?.content === emittedSource(mtoonMaterialSource), "Output must ship the editor's exact MToon material implementation");
  assert(result.overlayFiles.find((file) => file.relativePath === "src/xrift-studio/mtoon-runtime.ts")?.content === emittedSource(mtoonRuntimeSource), "Output must ship the editor's MToon shading and outline implementation");
  assert(result.overlayFiles.find((file) => file.relativePath === "src/xrift-studio/mtoon-contract.ts")?.content === mtoonContractSource, "Output must ship the editor's MToon defaults");
  assert(result.stagingPlan.runtimePackageSpecs.includes(COMPILER_MTOON_PACKAGE_SPEC), "MToon output forgot its shader dependency");
  assert(isAllowedCompilerRuntimePackage(COMPILER_MTOON_PACKAGE_SPEC), "Publication would reject MToon's shader dependency");
  assert(result.stagingPlan.assetCopyPlan.some((entry) => entry.assetId === texture.id), "Publication dropped MToon texture assets");
  if (usesModel) {
    assert(source.includes('case "index:0"') && source.includes('case "3:index:0"'), "Model assignments lost their source material or node targeting");
    assert(source.includes("attach={attach}") && source.includes("material-${index}"), "Model assignments must retain separate material slots");
  }
  if (mode === "vrm") {
    assert(source.includes("new VRMLoaderPlugin(parser)") && source.includes("VRMUtils.rotateVRM0(vrm)"), "VRM output must load native materials and preserve VRM 0.x orientation");
    assert(source.includes("removeNativeMToonOutlines(scene)") && source.includes("attachMToonOutlines(root)"), "VRM output must rebuild outline passes on the final cloned model");
  }
  return result;
}

/** The manifest adapter must instantiate the same shader and outline passes. */
export async function runMToonThreeRuntimeFixtureAssertions(): Promise<void> {
  await assertMToonCompatibilitySelection();
  const prototype = createPrototypeProject("world", "mtoon-three-runtime");
  const materialId = BUILTIN_ASSET_IDS.material.blue;
  prototype.assets = updateMaterialAsset(prototype.assets, materialId, {
    pbrMetallicRoughness: { baseColorFactor: [0.1, 0.3, 0.65, 1] },
    extensions: { VRMC_materials_mtoon: {
      shadeColorFactor: [0.02, 0.06, 0.15], shadingShiftFactor: -0.25,
      outlineWidthMode: "worldCoordinates", outlineWidthFactor: 0.025,
      outlineColorFactor: [0.8, 0.025, 0.07], outlineLightingMixFactor: 0,
      extras: { xriftVrm0CompatShade: true },
    } },
  });
  const model: ModelAsset = {
    id: "mtoon-runtime-model", name: "Runtime two-slot model", kind: "model", status: "ready",
    source: { kind: "project", relativePath: "assets/mtoon-runtime.gltf" },
    importSettings: normalizeModelImportSettings({}),
    materialSlots: [
      { slot: "default", name: "Toon surface", sourceMaterialIndex: 0 },
      { slot: "accent", name: "Plain surface", sourceMaterialIndex: 1 },
    ],
  };
  prototype.assets.assets[model.id] = model;
  let ordinal = 0;
  for (const entity of Object.values(prototype.scene.entities)) {
    for (const component of entity.components) {
      if (component.type !== "mesh") continue;
      component.geometry = ordinal === 0
        ? { kind: "asset", assetId: model.id }
        : { kind: "builtin-primitive", creationId: ordinal === 1 ? BUILTIN_PRIMITIVE_CREATION_IDS.plane : BUILTIN_PRIMITIVE_CREATION_IDS.sphere, primitive: ordinal === 1 ? "plane" : "sphere" };
      component.materialBindings = [{ slot: "default", materialAssetId: materialId }];
      ordinal += 1;
    }
  }
  const compiled = compileVisualProject({
    project: prototype.project, assets: prototype.assets,
    scenes: { [prototype.scene.sceneId]: prototype.scene }, prefabs: prototype.prefabs,
  }, { outputMode: "classic-runtime" });
  assert(compiled.canStage && compiled.runtimeManifestFile, "MToon manifest output must compile");
  const manifest: XriftRuntimeManifest = JSON.parse(compiled.runtimeManifestFile.content);
  const modelAsset = manifest.assets[model.id];
  assert(modelAsset.kind === "model", "Runtime model asset was lost");
  const floats = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const bytes = new Uint8Array(floats.buffer);
  const source = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    buffers: [{ byteLength: bytes.byteLength, uri: `data:application/octet-stream;base64,${btoa(String.fromCharCode(...bytes))}` }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, 0, 0], max: [0.5, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
    ],
    materials: [{ name: "Toon surface" }, { name: "Plain surface" }],
    meshes: [{ primitives: [0, 1].map(material => ({ attributes: { POSITION: 0, NORMAL: 1 }, material })) }],
  };
  modelAsset.url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(source))}`;
  const loaded = await new XriftThreeLoader({ assetBaseUrl: "https://fixture.invalid/" }).parse(manifest);
  let uniformOnlyDisposals = 0;
  let sharedDisposals = 0;
  const uniformOnlyTexture = new Texture();
  const sharedTexture = new Texture();
  uniformOnlyTexture.addEventListener("dispose", () => { uniformOnlyDisposals += 1; });
  sharedTexture.addEventListener("dispose", () => { sharedDisposals += 1; });
  try {
    const surfaces: Mesh[] = [];
    loaded.root.traverse(object => {
      if (object instanceof Mesh && !object.userData.xriftMToonOutline) surfaces.push(object);
    });
    const toons = surfaces.filter(mesh => (mesh.material as MToonMaterial).isMToonMaterial);
    assert(toons.length === ordinal, "Runtime did not retain each authored MToon assignment");
    assert(surfaces.some(mesh => !(mesh.material as MToonMaterial).isMToonMaterial), "Runtime overwrote an unrelated model material slot");
    assert(toons.some(mesh => mesh.geometry.type === "PlaneGeometry" && (mesh.material as MToonMaterial).side === DoubleSide), "Runtime plane lost the Editor's double-sided surface");
    // MToon texture accessors live on its prototype, so Object.values(material)
    // cannot discover these uniform-backed textures. Outline passes share them.
    (toons[0]!.material as MToonMaterial).shadeMultiplyTexture = uniformOnlyTexture;
    (toons[0]!.material as MToonMaterial).emissiveMap = sharedTexture;
    loaded.textures.set("fixture-shared-texture", sharedTexture);
    for (const mesh of toons) {
      const material = mesh.material as MToonMaterial;
      assert(material instanceof MToonMaterial && material.v0CompatShade && hasV0CompatibilityShaderDefine(material), "Runtime manifest did not instantiate the selected 0.x compatibility shader");
      assert(material.color.r === 0.1 && material.shadingShiftFactor === -0.25, "Runtime changed authored linear color or shading");
      const outline = mesh.children.find(child => child.userData.xriftMToonOutline) as Mesh | undefined;
      assert(outline?.geometry === mesh.geometry, "Runtime outline must reuse the surface's actual geometry");
      const outlineMaterial = outline.material as MToonMaterial;
      assert(outlineMaterial.isOutline && outlineMaterial.outlineColorFactor.r === 0.8 && outlineMaterial.outlineWidthFactor === 0.025, "Runtime lost the authored outline color or width");
      assert(outlineMaterial.v0CompatShade && hasV0CompatibilityShaderDefine(outlineMaterial), "Runtime outline clone lost 0.x compatibility shading");
    }
    const sharedSurface = toons[0]!;
    const sharedMaterial = sharedSurface.material as MToonMaterial;
    sharedMaterial.uvAnimationScrollXSpeedFactor = 0.2;
    const secondInstance = new Mesh(sharedSurface.geometry, sharedMaterial);
    const clock = new Clock();
    clock.start();
    const renderer = { info: { render: { frame: 1 } } };
    const elapsedBefore = clock.getElapsedTime();
    updateMToonMaterials(sharedSurface, 0.5, renderer.info.render.frame, renderer);
    await new Promise(resolve => setTimeout(resolve, 5));
    const elapsedAfter = clock.getElapsedTime();
    updateMToonMaterials(secondInstance, 0.5, renderer.info.render.frame, renderer);
    assert(elapsedAfter > elapsedBefore && Math.abs(sharedMaterial.uvAnimationScrollXOffset - 0.1) < 1e-8,
      "Shared native materials advanced twice when Clock readers ran in the same render frame");
    renderer.info.render.frame += 1;
    updateMToonMaterials(secondInstance, 0.5, renderer.info.render.frame, renderer);
    updateMToonMaterials(sharedSurface, 0.5, renderer.info.render.frame, renderer);
    assert(Math.abs(sharedMaterial.uvAnimationScrollXOffset - 0.2) < 1e-8,
      "A new render frame did not advance a shared native material exactly once");
  } finally {
    disposeXriftLoadResult(loaded);
  }
  assert(uniformOnlyDisposals === 1 && sharedDisposals === 1, "Runtime must dispose uniform-only MToon textures and deduplicate shared texture disposal");
}

/** The Inspector's compatibility choice changes the real shader, not its JSON spec version. */
async function assertMToonCompatibilitySelection(): Promise<void> {
  const textureInfo = { textureAssetId: "compat-map", texCoord: 1, transform: {
    offset: [0.2, -0.1] as [number, number], rotation: 0.4, scale: [2, 0.75] as [number, number],
  } };
  const authored: MaterialAsset = {
    id: "compat-material", name: "Authored MToon", kind: "material", status: "ready", source: { kind: "document" },
    properties: normalizeMaterialProperties({
      pbrMetallicRoughness: { baseColorFactor: [0.3, 0.5, 0.7, 0.8], baseColorTexture: textureInfo },
      normalTexture: { ...textureInfo, scale: -0.4 }, emissiveTexture: textureInfo, opacityTexture: textureInfo,
      alphaMode: "BLEND", doubleSided: true,
      extensions: { KHR_materials_unlit: {}, VRMC_materials_mtoon: {
        shadeColorFactor: [0.04, 0.07, 0.12], shadeMultiplyTexture: textureInfo,
        shadingShiftFactor: -0.2, shadingToonyFactor: 0.8, giEqualizationFactor: 0.7,
        shadingShiftTexture: { ...textureInfo, scale: -0.35 }, matcapTexture: textureInfo, matcapFactor: [0.4, 0.2, 0.1],
        rimMultiplyTexture: textureInfo, parametricRimColorFactor: [0.1, 0.2, 0.3], rimLightingMixFactor: 0.2,
        parametricRimFresnelPowerFactor: 3, parametricRimLiftFactor: -0.25,
        outlineWidthMode: "worldCoordinates", outlineWidthFactor: 0.01, outlineWidthMultiplyTexture: textureInfo,
        outlineColorFactor: [0.15, 0.25, 0.35], outlineLightingMixFactor: 0.3,
        uvAnimationMaskTexture: textureInfo, uvAnimationScrollXSpeedFactor: -0.2, uvAnimationScrollYSpeedFactor: 0.4,
        uvAnimationRotationSpeedFactor: 1.5, transparentWithZWrite: true, renderQueueOffsetNumber: -2,
        extras: { xriftVrm0CompatShade: false },
      } },
    }),
  };
  const texture: TextureAsset = { id: textureInfo.textureAssetId, name: "Compatibility map", kind: "texture", status: "ready",
    source: { kind: "document" }, importSettings: normalizeTextureImportSettings({}) };
  let manifest: AssetManifest = { schemaVersion: "0.1.0", assets: { [authored.id]: authored, [texture.id]: texture } };
  const retainedSettings = JSON.stringify(authored.properties, (key, value) => key === "extras" ? undefined : value);
  const selections: Array<{ properties: MaterialAsset["properties"]; compatibility: boolean; label: string }> = [];
  for (const compatibility of [true, false, true]) {
    manifest = updateMaterialAsset(manifest, authored.id, { extensions: { VRMC_materials_mtoon: { extras: { xriftVrm0CompatShade: compatibility } } } });
    const saved = assetManifestCodec.parse(assetManifestCodec.serialize(manifest));
    assert(saved.ok, `MToon ${compatibility ? "0.x" : "1.0"} selection could not be saved`);
    manifest = saved.document;
    const material = manifest.assets[authored.id];
    assert(material.kind === "material", "MToon compatibility selection lost its Material");
    const settings = material.properties.extensions.VRMC_materials_mtoon;
    assert(settings?.specVersion === "1.0" && settings.extras?.xriftVrm0CompatShade === compatibility,
      "MToon compatibility toggle changed its canonical extension version or lost the selected mode");
    assert(JSON.stringify(material.properties, (key, value) => key === "extras" ? undefined : value) === retainedSettings,
      "MToon 1.0/0.x toggle or saved codec changed colors, maps, UVs, outline, rim or animation settings");
    selections.push({ properties: material.properties, compatibility, label: compatibility ? "new 0.x" : "authored 1.0" });
  }
  const vrmBytes = createVrmAvatarFixtureBytes("0");
  const jsonLength = new DataView(vrmBytes.buffer).getUint32(12, true);
  const legacy = await expandGltfAssets({
    json: JSON.parse(new TextDecoder().decode(vrmBytes.subarray(20, 20 + jsonLength))),
    modelBytes: vrmBytes, sourceFormat: "glb", modelAssetId: "compat-vrm0", modelSourceHash: "a".repeat(64),
    materialSlots: [{ slot: "default", name: "Native toon", sourceMaterialIndex: 0 }],
    materialFolderId: "compat-materials", textureFolderId: "compat-textures", hashBytes: async () => "b".repeat(64),
  });
  const legacyMaterial = legacy.materialAssets[0];
  assert(legacyMaterial?.properties.extensions.VRMC_materials_mtoon?.extras?.xriftVrm0CompatShade &&
    legacyMaterial.properties.extensions.VRMC_materials_mtoon.specVersion === "1.0", "VRM 0.x import did not select canonical MToon with legacy shading");
  selections.push({ properties: legacyMaterial.properties, compatibility: true, label: "imported VRM 0.x" });
  const legacyModel: ModelAsset = { id: "compat-vrm0", name: "VRM 0.x source", kind: "model", status: "ready",
    source: { kind: "project", relativePath: "assets/compat-vrm0.vrm" }, sourceHash: "a".repeat(64),
    importSettings: normalizeModelImportSettings({}), materialSlots: legacy.materialSlots,
    importMetadata: { sourceFormat: "vrm", sourceFileName: "compat-vrm0.vrm", vrmVersion: "0", byteLength: vrmBytes.byteLength,
      nodeCount: 16, meshCount: 1, primitiveCount: 1,
      bounds: { min: [-0.3, 0, 0], max: [0.3, 0.6, 0], center: [0, 0.3, 0], size: [0.6, 0.6, 0], boundingSphereRadius: Math.hypot(0.3, 0.3) },
      animations: [], bones: [{ key: "hips", name: "hips", humanoidName: "hips" }], morphTargets: [{ key: "Smile", name: "Smile" }],
      extensionsUsed: ["VRM"], extensionsRequired: [] } };
  let legacyManifest: AssetManifest = { schemaVersion: "0.1.0",
    folders: { "compat-materials": { id: "compat-materials", name: "Imported materials", parentId: null, order: 0 } },
    assets: { [legacyMaterial.id]: legacyMaterial, [legacyModel.id]: legacyModel } };
  const legacySettings = JSON.stringify(legacyMaterial.properties, (key, value) => key === "extras" ? undefined : value);
  for (const compatibility of [false, true]) {
    legacyManifest = updateMaterialAsset(legacyManifest, legacyMaterial.id, { extensions: { VRMC_materials_mtoon: { extras: { xriftVrm0CompatShade: compatibility } } } });
    const saved = assetManifestCodec.parse(assetManifestCodec.serialize(legacyManifest));
    assert(saved.ok, `Toggled VRM 0.x-derived Material could not be saved: ${JSON.stringify(saved.issues)}`);
    legacyManifest = saved.document;
    const material = legacyManifest.assets[legacyMaterial.id];
    assert(material.kind === "material" && material.properties.extensions.VRMC_materials_mtoon?.specVersion === "1.0" &&
      material.properties.extensions.VRMC_materials_mtoon.extras?.xriftVrm0CompatShade === compatibility,
      "VRM 0.x-derived compatibility toggle changed its canonical version or selected mode");
    assert(JSON.stringify(material.properties, (key, value) => key === "extras" ? undefined : value) === legacySettings,
      "VRM 0.x-derived compatibility toggle changed imported colors, outline or converted shading settings");
    assert(material.importedFromModel?.modelAssetId === legacyModel.id && material.importedFromModel.sourceHash === legacyModel.sourceHash &&
      material.importedFromModel.sourceMaterialIndex === 0 && material.importedFromModel.isUserOverridden,
      "VRM 0.x-derived toggle lost source provenance or reimport edit protection");
    selections.push({ properties: material.properties, compatibility, label: `toggled VRM 0.x to ${compatibility ? "0.x" : "1.0"}` });
  }
  const previewTexture = new Texture();
  previewTexture.channel = 1;
  for (const { properties, compatibility, label } of selections) {
    const surface = createMToonMaterial(properties, { baseColorMap: previewTexture, shadeMultiplyMap: previewTexture, outlineWidthMultiplyMap: previewTexture });
    const mesh = new Mesh(undefined, surface);
    const outlines = attachMToonOutlines(mesh);
    try {
      assert(surface instanceof MToonMaterial && surface.isMToonMaterial && surface.v0CompatShade === compatibility && hasV0CompatibilityShaderDefine(surface) === compatibility,
        `${label} did not instantiate three-vrm's selected compatibility shader define`);
      assert(surface.fragmentShader.includes("#ifdef V0_COMPAT_SHADE"), `${label} did not use the real compatibility shading branch`);
      const outline = mesh.children.find(child => child.userData.xriftMToonOutline) as Mesh | undefined;
      const outlineMaterial = outline?.material as MToonMaterial | undefined;
      assert(outlineMaterial instanceof MToonMaterial && outlineMaterial.isOutline && outlineMaterial.v0CompatShade === compatibility && hasV0CompatibilityShaderDefine(outlineMaterial) === compatibility,
        `${label} outline clone changed the selected compatibility shader`);
      assert(surface.map === previewTexture && outlineMaterial.map === previewTexture && outlineMaterial.uniforms === surface.uniforms,
        `${label} outline replaced or detached the authored texture uniforms`);
    } finally {
      outlines.dispose();
      surface.dispose();
      mesh.geometry.dispose();
    }
  }
  previewTexture.dispose();
}

function hasV0CompatibilityShaderDefine(material: MToonMaterial): boolean {
  // three-vrm generates this define in its real compile hook, not material.defines.
  const shader = { uniforms: material.uniforms, vertexShader: material.vertexShader, fragmentShader: material.fragmentShader } as unknown as Parameters<MToonMaterial["onBeforeCompile"]>[0];
  material.onBeforeCompile(shader, {} as Parameters<MToonMaterial["onBeforeCompile"]>[1]);
  return /^#define V0_COMPAT_SHADE\s/m.test(shader.fragmentShader);
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
