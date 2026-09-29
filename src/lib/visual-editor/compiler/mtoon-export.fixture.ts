import { normalizeModelImportSettings, normalizeTextureImportSettings, updateMaterialAsset, type MaterialTextureInfo, type ModelAsset, type TextureAsset } from "../asset-manifest";
import { createPrototypeProject } from "../prototype-project";
import { expandGltfAssets } from "../gltf-derived-assets";
import { BUILTIN_PRIMITIVE_CREATION_IDS } from "../creation-catalog";
import { createVrmAvatarFixtureBytes } from "./vrm-avatar.fixture";
import type { VisualCompilerDocuments } from "./types";

export const MTOON_EXPORT_TEXTURE_ROLES = ["baseColorMap", "opacityMap", "normalMap", "emissiveMap", "shadeMultiplyMap", "shadingShiftMap", "matcapMap", "rimMultiplyMap", "outlineWidthMultiplyMap", "uvAnimationMaskMap"] as const;

/** Real source bytes and imported VRM Materials for archive/Classic round trips. */
export async function createMToonExportFixtureDocuments(textureBytes: Readonly<Record<string, Uint8Array>>): Promise<{
  documents: VisualCompilerDocuments;
  binaryFiles: Map<string, Uint8Array>;
}> {
  const prototype = createPrototypeProject("world", "MToon and VRM export round trip");
  prototype.assets.folders = {
    "fixture-materials": { id: "fixture-materials", name: "Imported materials", parentId: null, order: 0 },
    "fixture-textures": { id: "fixture-textures", name: "Toon textures", parentId: null, order: 1 },
  };
  const binaryFiles = new Map<string, Uint8Array>();
  const infos: Record<string, MaterialTextureInfo> = {};
  for (const role of MTOON_EXPORT_TEXTURE_ROLES) {
    const bytes = textureBytes[role];
    if (!bytes?.length) throw new Error(`Missing export fixture texture: ${role}`);
    const texture: TextureAsset = {
      id: `export-${role}`, name: role, kind: "texture", status: "ready", folderId: "fixture-textures",
      source: { kind: "project", relativePath: `assets/toon/${role}.png` },
      importSettings: normalizeTextureImportSettings({ flipY: false }),
    };
    prototype.assets.assets[texture.id] = texture;
    binaryFiles.set(texture.source.kind === "project" ? texture.source.relativePath : "", bytes);
    infos[role] = { textureAssetId: texture.id, texCoord: 1, transform: { offset: [0.25, 0.125], rotation: 0.4, scale: [2, 0.75] } };
  }
  const models: ModelAsset[] = [];
  for (const version of ["0", "1"] as const) {
    const bytes = createVrmAvatarFixtureBytes(version, "sphere");
    const jsonLength = new DataView(bytes.buffer as ArrayBuffer).getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
    const model: ModelAsset = {
      id: `export-vrm-${version}`, name: `VRM ${version} avatar`, kind: "model", status: "ready",
      source: { kind: "project", relativePath: `assets/avatar-${version}.vrm` },
      importSettings: normalizeModelImportSettings({}),
      materialSlots: [{ slot: "default", name: "Native toon", sourceMaterialIndex: 0 }],
    };
    const sourceHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>)), value => value.toString(16).padStart(2, "0")).join("");
    const expanded = await expandGltfAssets({ json, modelBytes: bytes, sourceFormat: "glb", modelAssetId: model.id, modelSourceHash: sourceHash,
      materialSlots: model.materialSlots, materialFolderId: "fixture-materials", textureFolderId: "fixture-textures",
      hashBytes: async source => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", source as Uint8Array<ArrayBuffer>)), value => value.toString(16).padStart(2, "0")).join(""),
    });
    if (expanded.warnings.length || !expanded.materialAssets[0]?.properties.extensions.VRMC_materials_mtoon) throw new Error(`VRM ${version} fixture import failed: ${JSON.stringify(expanded.warnings)}`);
    const material = expanded.materialAssets[0]!;
    prototype.assets.assets[material.id] = material;
    prototype.assets = updateMaterialAsset(prototype.assets, material.id, {
      pbrMetallicRoughness: { baseColorTexture: infos.baseColorMap },
      opacityTexture: infos.opacityMap, opacityChannel: "a", normalTexture: { ...infos.normalMap!, scale: 0.2 },
      emissiveTexture: infos.emissiveMap,
      extensions: { VRMC_materials_mtoon: {
        shadeMultiplyTexture: infos.shadeMultiplyMap,
        shadingShiftTexture: { ...infos.shadingShiftMap!, scale: 0.1 },
        matcapFactor: [0.05, 0.02, 0.01], matcapTexture: infos.matcapMap,
        parametricRimColorFactor: [0.01, 0.02, 0.03], rimMultiplyTexture: infos.rimMultiplyMap,
        outlineWidthFactor: 0.04, outlineWidthMultiplyTexture: infos.outlineWidthMultiplyMap,
        outlineColorFactor: [1, 0, 0], outlineLightingMixFactor: 0,
        uvAnimationMaskTexture: infos.uvAnimationMaskMap, uvAnimationScrollXSpeedFactor: 0.03,
        uvAnimationScrollYSpeedFactor: -0.02, uvAnimationRotationSpeedFactor: 0.15,
      } },
    });
    model.materialSlots = expanded.materialSlots;
    prototype.assets.assets[model.id] = model;
    binaryFiles.set(model.source.kind === "project" ? model.source.relativePath : "", bytes);
    models.push(model);
  }
  let ordinal = 0;
  for (const entity of Object.values(prototype.scene.entities)) {
    const mesh = entity.components.find(component => component.type === "mesh");
    if (!mesh || mesh.type !== "mesh") { entity.components = []; continue; }
    const model = models[ordinal]!;
    entity.components = entity.components.filter(component => component.type === "transform" || component.type === "mesh");
    mesh.geometry = { kind: "asset", assetId: model.id };
    mesh.materialBindings = [{ slot: "default", materialAssetId: model.materialSlots[0]!.defaultMaterialAssetId! }];
    const transform = entity.components.find(component => component.type === "transform");
    if (transform?.type === "transform") { transform.position = [ordinal === 0 ? -0.6 : 0.6, 0, 0]; transform.rotation = [0, 0, 0]; transform.scale = [1, 1, 1]; }
    ordinal += 1;
  }
  const primitive = structuredClone(Object.values(prototype.scene.entities).find(entity => entity.components.some(component => component.type === "mesh"))!);
  primitive.id = "export-toon-primitive"; primitive.name = "Toon sphere"; primitive.parentId = null; primitive.children = [];
  for (const component of primitive.components) {
    component.id = `${primitive.id}-${component.type}`;
    if (component.type === "transform") component.position = [0, 0, 0];
    if (component.type === "mesh") component.geometry = { kind: "builtin-primitive", creationId: BUILTIN_PRIMITIVE_CREATION_IDS.sphere, primitive: "sphere" };
  }
  prototype.scene.entities[primitive.id] = primitive;
  prototype.scene.rootEntityIds.push(primitive.id);
  return { documents: { project: prototype.project, assets: prototype.assets, scenes: { [prototype.scene.sceneId]: prototype.scene }, prefabs: prototype.prefabs }, binaryFiles };
}
