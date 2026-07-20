import {
  BoxGeometry,
  DoubleSide,
  Mesh,
  MeshPhysicalMaterial,
  NoColorSpace,
  SRGBColorSpace,
  Texture,
} from "three";
import {
  BUILTIN_ASSET_IDS,
  createPrototypeProject,
  getMaterialAsset,
  getTextureAsset,
  normalizeTextureImportSettings,
  updateMaterialAsset,
  type TextureAsset,
} from "../../lib/visual-editor";
import {
  applyAssignedMaterialPreview,
  createAssignedMaterialPreviewMaterial,
} from "./ProjectModelVisual";
import { configureMaterialPreviewTexture } from "./material-texture-preview";

export function runProjectModelMaterialPreviewFixtureAssertions(): void {
  const project = createPrototypeProject("world", "model-material-preview");
  const fixtureTextureAsset: TextureAsset = {
    id: "fixture-texture-project",
    name: "Fixture Texture",
    kind: "texture",
    status: "ready",
    source: { kind: "project", relativePath: "assets/fixture-texture.png" },
    thumbnail: { status: "missing" },
    importSettings: normalizeTextureImportSettings(),
  };
  const textureInfo = {
    textureAssetId: fixtureTextureAsset.id,
    texCoord: 0,
  };
  const assets = updateMaterialAsset(
    {
      ...project.assets,
      assets: {
        ...project.assets.assets,
        [fixtureTextureAsset.id]: fixtureTextureAsset,
      },
    },
    BUILTIN_ASSET_IDS.material.orange,
    {
      pbrMetallicRoughness: {
        baseColorFactor: [0.2, 0.4, 0.8, 0.35],
        metallicFactor: 0.65,
        roughnessFactor: 0.25,
        baseColorTexture: textureInfo,
        metallicRoughnessTexture: textureInfo,
      },
      normalTexture: { ...textureInfo, scale: 0.6 },
      occlusionTexture: { ...textureInfo, strength: 0.7 },
      emissiveFactor: [0.1, 0.2, 0.3],
      emissiveTexture: textureInfo,
      alphaMode: "BLEND",
      doubleSided: true,
      extensions: {
        KHR_materials_emissive_strength: { emissiveStrength: 3 },
      },
    },
  );
  const assigned = getMaterialAsset(
    assets,
    BUILTIN_ASSET_IDS.material.orange,
  );
  assert(assigned, "Assigned Material fixture is missing");

  const texture = new Texture();
  const source = new MeshPhysicalMaterial({
    color: "#ff0000",
    metalness: 0.05,
    roughness: 0.95,
    map: texture,
    clearcoat: 1,
    transmission: 0.9,
  });
  const originalColor = source.color.clone();
  const root = new Mesh(new BoxGeometry(1, 1, 1), source);
  const owned = applyAssignedMaterialPreview(root, assigned);
  const preview = root.material as MeshPhysicalMaterial;

  assert(preview !== source, "Preview reused and mutated the cached glTF Material");
  assert(
    source.color.equals(originalColor) &&
      source.metalness === 0.05 &&
      source.roughness === 0.95 &&
      source.clearcoat === 1 &&
      source.transmission === 0.9,
    "Source glTF Material changed while applying the preview override",
  );
  assert(
    near(preview.color.r, 0.2) &&
      near(preview.color.g, 0.4) &&
      near(preview.color.b, 0.8) &&
      preview.metalness === 0.65 &&
      preview.roughness === 0.25,
    "Assigned base color or metallic-roughness values were not previewed",
  );
  assert(
    near(preview.emissive.r, 0.1) &&
      near(preview.emissive.g, 0.2) &&
      near(preview.emissive.b, 0.3) &&
      preview.emissiveIntensity === 3,
    "Assigned emissive values were not previewed",
  );
  assert(
    preview.opacity === 0.35 &&
      preview.transparent &&
      !preview.depthWrite &&
      preview.side === DoubleSide,
    "Assigned alpha or double-sided settings were not previewed",
  );
  assert(
    preview.map === null && source.map === texture,
    "Failed assigned texture load leaked the source glTF texture",
  );
  assert(
    preview.clearcoat === 0 && preview.transmission === 0,
    "Source-only physical effects leaked into the assigned Material preview",
  );
  assert(owned.length === 1 && owned[0] === preview, "Owned Material tracking failed");

  const textureAsset = getTextureAsset(
    assets,
    textureInfo.textureAssetId,
  );
  assert(textureAsset, "Texture Asset fixture is missing");
  const baseColorMap = new Texture();
  const metallicRoughnessMap = new Texture();
  const normalMap = new Texture();
  const occlusionMap = new Texture();
  const emissiveMap = new Texture();
  configureMaterialPreviewTexture(
    baseColorMap,
    textureAsset,
    textureInfo,
    "srgb",
    "baseColorMap",
  );
  configureMaterialPreviewTexture(
    metallicRoughnessMap,
    textureAsset,
    textureInfo,
    "linear",
    "metallicRoughnessMap",
  );
  const texturedPreview = createAssignedMaterialPreviewMaterial(
    source,
    assigned,
    {
      baseColorMap,
      metallicRoughnessMap,
      normalMap,
      occlusionMap,
      emissiveMap,
    },
  );
  assert(
    texturedPreview.map === baseColorMap &&
      texturedPreview.metalnessMap === metallicRoughnessMap &&
      texturedPreview.roughnessMap === metallicRoughnessMap &&
      texturedPreview.normalMap === normalMap &&
      texturedPreview.aoMap === occlusionMap &&
      texturedPreview.emissiveMap === emissiveMap,
    "Core Material preview textures were not applied to their Three slots",
  );
  assert(
    texturedPreview.normalScale.x === 0.6 &&
      texturedPreview.normalScale.y === 0.6 &&
      texturedPreview.aoMapIntensity === 0.7,
    "Normal scale or occlusion intensity was not applied",
  );
  assert(
    baseColorMap.colorSpace === SRGBColorSpace &&
      metallicRoughnessMap.colorSpace === NoColorSpace,
    "Core Material preview texture color spaces are incorrect",
  );

  owned.forEach((material) => material.dispose());
  texturedPreview.dispose();
  [
    baseColorMap,
    metallicRoughnessMap,
    normalMap,
    occlusionMap,
    emissiveMap,
  ].forEach((map) => map.dispose());
  root.geometry.dispose();
  source.dispose();
  texture.dispose();
}

function near(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-6;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
