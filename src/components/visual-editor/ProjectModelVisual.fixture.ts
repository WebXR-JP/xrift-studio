import {
  Box3,
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NoColorSpace,
  SRGBColorSpace,
  Texture,
  Vector3,
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
  PROJECT_MODEL_SOURCE_MATERIAL_INDEX_USER_DATA_KEY,
  applyAssignedMaterialPreview,
  applyAssignedMaterialPreviews,
  createAssignedMaterialPreviewMaterial,
  getModelSelectionBounds,
} from "./ProjectModelVisual";
import {
  configureMaterialPreviewTexture,
  refreshMaterialPreviewRender,
  resolveMaterialPreviewTextureDisplayStatus,
} from "./material-texture-preview";

export function runProjectModelMaterialPreviewFixtureAssertions(): void {
  assertModelSelectionBoundsStayLocal();

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

  assertModelMaterialAssignmentsStayInTheirGltfSlots(assets);
  assertAsyncTextureCompletionRequestsMaterialRender();
  assertTextureLoadStatusOnlyReportsSupportedReadyAssets(fixtureTextureAsset);

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

function assertTextureLoadStatusOnlyReportsSupportedReadyAssets(
  projectTexture: TextureAsset,
): void {
  assert(
    resolveMaterialPreviewTextureDisplayStatus(projectTexture, "loading") ===
      "loading",
    "A supported Texture did not expose its loading state",
  );
  assert(
    resolveMaterialPreviewTextureDisplayStatus(projectTexture, "ready") ===
      "ready",
    "A loaded Texture was not reported as ready",
  );
  assert(
    resolveMaterialPreviewTextureDisplayStatus(
      { ...projectTexture, status: "missing" },
      "ready",
    ) === "error",
    "A missing Texture source was incorrectly reported as ready",
  );
  assert(
    resolveMaterialPreviewTextureDisplayStatus(
      {
        ...projectTexture,
        source: { kind: "builtin", key: "fixture/unsupported-texture" },
      },
      "ready",
    ) === "error",
    "An unsupported Texture source was incorrectly reported as ready",
  );
}

function assertModelMaterialAssignmentsStayInTheirGltfSlots(
  assets: ReturnType<typeof updateMaterialAsset>,
): void {
  const orange = getMaterialAsset(assets, BUILTIN_ASSET_IDS.material.orange);
  const blue = getMaterialAsset(assets, BUILTIN_ASSET_IDS.material.blue);
  assert(orange && blue, "Material slot fixtures are missing");

  const firstSource = new MeshPhysicalMaterial({ color: "#ffffff" });
  firstSource.userData[PROJECT_MODEL_SOURCE_MATERIAL_INDEX_USER_DATA_KEY] = 0;
  const secondSource = new MeshPhysicalMaterial({ color: "#ffffff" });
  secondSource.userData[PROJECT_MODEL_SOURCE_MATERIAL_INDEX_USER_DATA_KEY] = 1;
  const first = new Mesh(new BoxGeometry(1, 1, 1), firstSource);
  const second = new Mesh(new BoxGeometry(1, 1, 1), secondSource);
  const root = new Group();
  root.add(first, second);

  const owned = applyAssignedMaterialPreviews(root, [
    { sourceMaterialIndex: 0, material: orange },
    { sourceMaterialIndex: 1, material: blue },
  ]);
  const firstPreview = first.material as MeshPhysicalMaterial;
  const secondPreview = second.material as MeshPhysicalMaterial;
  assert(
    firstPreview !== firstSource && secondPreview !== secondSource,
    "Model slot overrides reused cached glTF Materials",
  );
  assert(
    colorNear(
      firstPreview.color,
      orange.properties.pbrMetallicRoughness.baseColorFactor,
    ) &&
      colorNear(
        secondPreview.color,
        blue.properties.pbrMetallicRoughness.baseColorFactor,
      ),
    "Model Material overrides crossed their glTF source slots",
  );

  owned.forEach((material) => material.dispose());
  first.geometry.dispose();
  second.geometry.dispose();
  firstSource.dispose();
  secondSource.dispose();
}

function assertAsyncTextureCompletionRequestsMaterialRender(): void {
  const material = new MeshPhysicalMaterial();
  const texture = new Texture();
  const materialVersion = material.version;
  const textureVersion = texture.version;
  let renderRequests = 0;
  refreshMaterialPreviewRender(
    material,
    { baseColorMap: texture },
    () => {
      renderRequests += 1;
    },
  );
  assert(
    material.version > materialVersion &&
      texture.version > textureVersion &&
      renderRequests === 1,
    "Async Texture completion did not invalidate its Material and Scene View",
  );
  material.dispose();
  texture.dispose();
}

function assertModelSelectionBoundsStayLocal(): void {
  const model = new Group();
  const partMaterial = new MeshBasicMaterial();
  const part = new Mesh(new BoxGeometry(2, 4, 6), partMaterial);
  part.position.set(1, 2, 3);
  model.add(part);

  const detachedBounds = getModelSelectionBounds(model);
  const entity = new Group();
  entity.position.set(10, 1, -4);
  entity.rotation.set(0.2, 0.6, -0.1);
  entity.scale.set(2, 3, 0.5);
  entity.add(model);
  entity.updateWorldMatrix(true, true);

  const attachedBounds = getModelSelectionBounds(model);
  assert(
    tupleNear(attachedBounds.position, detachedBounds.position) &&
      tupleNear(attachedBounds.scale, detachedBounds.scale),
    "Entity Transform leaked into the model selection bounds",
  );

  const boundsMaterial = new MeshBasicMaterial();
  const boundsVisual = new Mesh(new BoxGeometry(1, 1, 1), boundsMaterial);
  boundsVisual.position.fromArray(attachedBounds.position);
  boundsVisual.scale.fromArray(attachedBounds.scale);
  entity.add(boundsVisual);
  entity.updateWorldMatrix(true, true);

  const modelCenter = new Box3()
    .setFromObject(model)
    .getCenter(new Vector3());
  const boundsCenter = boundsVisual.getWorldPosition(new Vector3());
  assert(
    modelCenter.distanceTo(boundsCenter) < 1e-6,
    "The rendered selection bounds no longer share the model's world center",
  );

  part.geometry.dispose();
  partMaterial.dispose();
  boundsVisual.geometry.dispose();
  boundsMaterial.dispose();
}

function tupleNear(
  left: [number, number, number],
  right: [number, number, number],
): boolean {
  return left.every((value, index) => near(value, right[index]));
}

function near(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-6;
}

function colorNear(
  color: { r: number; g: number; b: number },
  factor: readonly number[],
): boolean {
  return (
    near(color.r, factor[0]) &&
    near(color.g, factor[1]) &&
    near(color.b, factor[2])
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
