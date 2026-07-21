import {
  Box3,
  BoxGeometry,
  Bone,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NoColorSpace,
  RawShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
  type Material,
} from "three";
import {
  BUILTIN_ASSET_IDS,
  applyCustomShaderSourceOverrides,
  bindCustomShaderGeometryAttributes,
  createPrototypeProject,
  getMaterialAsset,
  getTextureAsset,
  normalizeTextureImportSettings,
  updateMaterialAsset,
  type MaterialAsset,
  type TextureAsset,
} from "../../lib/visual-editor";
import {
  PROJECT_MODEL_SOURCE_MATERIAL_INDEX_USER_DATA_KEY,
  PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY,
  applyAssignedMaterialPreview,
  applyAssignedMaterialPreviews,
  applyStaticModelPose,
  createAssignedMaterialPreviewMaterial,
  getModelSelectionBounds,
  inspectProjectModelMaterialRuntime,
  selectSourceModelNode,
} from "./ProjectModelVisual";
import {
  configureMaterialPreviewTexture,
  refreshMaterialPreviewRender,
  resolveMaterialPreviewTextureDisplayStatus,
} from "./material-texture-preview";
import {
  installOpenBrushPbrFallback,
  normalizeOpenBrushGlslSource,
  readOpenBrushPbrFallback,
} from "../../lib/visual-editor/open-brush-preview-loader";

export async function runProjectModelMaterialPreviewFixtureAssertions(): Promise<void> {
  assert(
    normalizeOpenBrushGlslSource("#version 300 es\r\nvoid main() {}") ===
      "void main() {}",
    "the OpenBrush adapter should let Three.js own the GLSL version directive",
  );
  assertModelSelectionBoundsStayLocal();
  assertStaticModelPoseUsesRestOffsets();
  assertSourceNodeSelectionDoesNotDuplicateTheWholeModel();
  assertCustomShaderRuntimeCanBeInspected();
  await assertOpenBrushPbrFallbackKeepsTheModelUsable();

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
  ) as MeshPhysicalMaterial;
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
  assertOpenBrushMaterialKeepsCustomShader(assigned);
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

async function assertOpenBrushPbrFallbackKeepsTheModelUsable(): Promise<void> {
  const unsupportedMaterial = new MeshPhysicalMaterial({ color: "#b45309" });
  const unsupportedMesh = new Mesh(new BoxGeometry(), unsupportedMaterial);
  const unsupportedExtension = {
    replaceMaterial: async (
      _mesh: { material: Material | Material[] },
      _brushName: string,
    ) => undefined,
  };
  installOpenBrushPbrFallback(unsupportedExtension);
  await unsupportedExtension.replaceMaterial(
    unsupportedMesh,
    "FutureOpenBrushPreset",
  );
  const unsupportedFallback = readOpenBrushPbrFallback(unsupportedMaterial);
  assert(
    unsupportedMesh.material === unsupportedMaterial &&
      unsupportedFallback?.reason === "unsupported-preset",
    "An unknown OpenBrush preset did not keep its original glTF PBR Material",
  );

  const failedMaterial = new MeshPhysicalMaterial({ color: "#be123c" });
  const failedMesh = new Mesh(new BoxGeometry(), failedMaterial);
  const failedExtension = {
    replaceMaterial: async (
      _mesh: { material: Material | Material[] },
      _brushName: string,
    ) => {
      throw new Error("fixture shader resource missing");
    },
  };
  installOpenBrushPbrFallback(failedExtension);
  await failedExtension.replaceMaterial(failedMesh, "BrokenBrush");
  const failedInfo = inspectProjectModelMaterialRuntime(failedMaterial);
  assert(
    failedMesh.material === failedMaterial &&
      failedInfo.shaderKind === "standard" &&
      failedInfo.pbrFallback?.reason === "shader-load-error" &&
      failedInfo.pbrFallback.message.includes("resource missing"),
    "A failed OpenBrush shader did not fall back to its inspectable glTF PBR Material",
  );

  unsupportedMesh.geometry.dispose();
  unsupportedMaterial.dispose();
  failedMesh.geometry.dispose();
  failedMaterial.dispose();
}

function assertCustomShaderRuntimeCanBeInspected(): void {
  const brushTexture = new Texture();
  brushTexture.name = "DoubleTaperedMarker_MainTex";
  const material = new RawShaderMaterial({
    name: "material_DoubleTaperedMarker",
    vertexShader:
      "in vec3 a_position;\nin vec4 a_color;\nin vec3 customPosition;\nuniform float u_time;\nvoid main() {\n  gl_Position = vec4(a_position, 1.0);\n}",
    fragmentShader:
      "uniform sampler2D u_MainTex;\nvoid main() {\n  gl_FragColor = vec4(1.0);\n}",
    uniforms: {
      u_MainTex: { value: brushTexture },
      u_time: { value: 0 },
    },
  });
  const geometry = new BoxGeometry();
  const bindings = bindCustomShaderGeometryAttributes(geometry, material, {
    customPosition: { sourceAttribute: "position" },
  });
  const info = inspectProjectModelMaterialRuntime(material);
  assert(
    info.shaderKind === "raw" &&
      info.materialType === "RawShaderMaterial" &&
      info.uniformNames.join(",") === "u_MainTex,u_time" &&
      info.textureNames[0] === "DoubleTaperedMarker_MainTex" &&
      info.vertexShader?.includes("gl_Position") &&
      info.fragmentShader?.includes("gl_FragColor") &&
      bindings.some(
        (binding) =>
          binding.shaderName === "a_position" &&
          binding.sourceAttribute === "position",
      ) &&
      bindings.some(
        (binding) =>
          binding.shaderName === "customPosition" &&
          binding.sourceAttribute === "position",
      ) &&
      bindings.some(
        (binding) =>
          binding.shaderName === "a_color" && binding.status === "default",
      ) &&
      info.uniformBindings.some(
        (uniform) =>
          uniform.name === "u_MainTex" && uniform.status === "texture",
      ),
    "Custom shader runtime details were not exposed to the Material Inspector",
  );
  applyCustomShaderSourceOverrides(material, {
    fragmentShader: "void main() { gl_FragColor = vec4(0.5); }",
  });
  assert(
    material.fragmentShader.includes("vec4(0.5)"),
    "A Material-owned shader source copy was not applied",
  );
  geometry.dispose();
  material.dispose();
  brushTexture.dispose();
}

function assertOpenBrushMaterialKeepsCustomShader(
  fallback: MaterialAsset,
): void {
  const source = new MeshBasicMaterial({ color: "#ff0000" });
  source.userData[PROJECT_MODEL_SOURCE_MATERIAL_INDEX_USER_DATA_KEY] = 0;
  const brushPreset = new MeshBasicMaterial({ color: "#00ffff" });
  brushPreset.userData[PROJECT_MODEL_SOURCE_MATERIAL_INDEX_USER_DATA_KEY] = 1;
  const openBrushMaterial: MaterialAsset = {
    ...fallback,
    id: "fixture-openbrush-light",
    name: "brush_Light",
    shader: {
      kind: "openbrush",
      renderer: "three-icosa",
      rendererVersion: "three-icosa@fixture",
      brushName: "Light",
      brushGuid: "fixture-guid",
      brushBaseUrl: "https://example.invalid/brushes/",
      sourceMaterialIndex: 1,
    },
  };
  const preview = createAssignedMaterialPreviewMaterial(
    source,
    openBrushMaterial,
    {},
    new Map([[1, brushPreset]]),
  );
  assert(
    preview !== source &&
      preview.name === "material_Light" &&
      (preview as MeshBasicMaterial).color.equals(brushPreset.color),
    "OpenBrush Material was flattened into a Standard Material preview",
  );
  preview.dispose();
  source.dispose();
  brushPreset.dispose();
}

function assertSourceNodeSelectionDoesNotDuplicateTheWholeModel(): void {
  const root = new Group();
  const first = new Group();
  first.userData[PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY] = 0;
  const second = new Group();
  second.userData[PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY] = 1;
  second.position.set(4, 5, 6);
  const nestedSourceNode = new Group();
  nestedSourceNode.userData[PROJECT_MODEL_SOURCE_NODE_INDEX_USER_DATA_KEY] = 2;
  const ownMesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  second.add(ownMesh, nestedSourceNode);
  root.add(first, second);

  const selected = selectSourceModelNode(root, 1);
  assert(selected === second, "The requested glTF node was not selected");
  assert(selected.parent === null, "The selected glTF node remained attached to the whole Model");
  assert(
    selected.position.lengthSq() === 0 && selected.scale.equals(new Vector3(1, 1, 1)),
    "The source Transform was applied twice after node expansion",
  );
  assert(
    selected.children.length === 1 && selected.children[0] === ownMesh,
    "A nested source node was duplicated inside the selected node",
  );

  ownMesh.geometry.dispose();
  (ownMesh.material as MeshBasicMaterial).dispose();
}

function assertStaticModelPoseUsesRestOffsets(): void {
  const root = new Group();
  const head = new Bone();
  head.name = "Head";
  head.rotation.set(0.1, 0.2, 0.3);
  const face = new Mesh(new BoxGeometry(), new MeshBasicMaterial()) as Mesh & {
    morphTargetDictionary: Record<string, number>;
    morphTargetInfluences: number[];
  };
  face.morphTargetDictionary = { Smile: 0 };
  face.morphTargetInfluences = [0];
  root.add(head, face);

  applyStaticModelPose(root, {
    bones: { Head: [0.2, -0.1, 0.4] },
    morphTargets: { Smile: 0.75 },
  });

  assert(
    Math.abs(head.rotation.x - 0.3) < 1e-6 &&
      Math.abs(head.rotation.y - 0.1) < 1e-6 &&
      Math.abs(head.rotation.z - 0.7) < 1e-6,
    "Static bone pose did not apply as a rest-pose offset",
  );
  assert(
    face.morphTargetInfluences[0] === 0.75,
    "Static shape-key pose was not applied",
  );
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
