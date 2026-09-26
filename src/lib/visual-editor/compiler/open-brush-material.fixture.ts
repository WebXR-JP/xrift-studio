import { Mesh, MeshStandardMaterial, RawShaderMaterial, SphereGeometry, Texture, Vector4, type Material } from "three";
import { attachOpenBrushPresetMaterial, createOpenBrushMaterialInstance, findOpenBrushSourceMaterial } from "../../../../packages/xrift-studio-runtime/src/open-brush/preset-material";
import { applyOpenBrushMaterialProperties } from "../../../../packages/xrift-studio-runtime/src/open-brush/material-properties";
import { readOpenBrushPbrFallback } from "../../../../packages/xrift-studio-runtime/src/open-brush/material-extension";
import { normalizeMaterialProperties, normalizeModelImportSettings, normalizeTextureImportSettings, type MaterialAsset, type ModelAsset, type TextureAsset } from "../asset-manifest";
import { createPrototypeProject } from "../prototype-project";
import { BUILTIN_PRIMITIVE_CREATION_IDS } from "../creation-catalog";
import { OPEN_BRUSH_BRUSH_BASE_URL, OPEN_BRUSH_RUNTIME_PACKAGE } from "../open-brush";
import { compileVisualProject } from "./compile";

/** No OpenBrush GLB may accidentally supply this catalog material's runtime. */
export function runOpenBrushMaterialCompilerFixtureAssertions(mode: "primitive" | "model" = "primitive") {
  const prototype = createPrototypeProject("world", "fixture-brush-primitive");
  const texture: TextureAsset = {
    id: "fixture-brush-texture", name: "Brush replacement", kind: "texture",
    source: { kind: "project", relativePath: "assets/brush.png" }, status: "ready",
    importSettings: normalizeTextureImportSettings({ flipY: false }),
  };
  const material: MaterialAsset = {
    id: "fixture-brush-material", name: "Green Fire", kind: "material",
    source: { kind: "document" }, status: "ready",
    properties: normalizeMaterialProperties({
      pbrMetallicRoughness: { baseColorFactor: [0.2, 0.8, 0.3, 1], roughnessFactor: 0.7 },
    }),
    shader: {
      kind: "openbrush", renderer: "three-icosa", rendererVersion: OPEN_BRUSH_RUNTIME_PACKAGE,
      brushName: "Fire", brushBaseUrl: OPEN_BRUSH_BRUSH_BASE_URL, sourceMaterialIndex: 0,
      sourceOverrides: { fragmentShader: "in vec4 v_color;\nvoid main() { gl_FragColor = v_color; }" },
      attributeBindings: { a_color: { defaultValue: [1, 0.5, 1, 1] } },
      textureBindings: { u_MainTex: { textureAssetId: texture.id } },
    },
  };
  const model: ModelAsset = {
    id: "fixture-brush-model", name: "Source PBR model", kind: "model", status: "ready",
    source: { kind: "project", relativePath: "assets/model.glb" },
    importSettings: normalizeModelImportSettings({}),
    materialSlots: [{ slot: "default", name: "Source PBR", sourceMaterialIndex: 0 }],
  };
  for (const entity of Object.values(prototype.scene.entities)) {
    for (const component of entity.components) {
      if (component.type !== "mesh") continue;
      component.geometry = mode === "model"
        ? { kind: "asset", assetId: model.id }
        : { kind: "builtin-primitive", creationId: BUILTIN_PRIMITIVE_CREATION_IDS.sphere, primitive: "sphere" };
      component.materialBindings = [{ slot: "default", materialAssetId: material.id }];
    }
  }
  prototype.assets.assets[material.id] = material;
  prototype.assets.assets[texture.id] = texture;
  if (mode === "model") prototype.assets.assets[model.id] = model;
  const result = compileVisualProject({
    project: prototype.project,
    scenes: { [prototype.scene.sceneId]: prototype.scene },
    assets: prototype.assets,
    prefabs: prototype.prefabs,
  });
  assert(result.canStage, `Standalone OpenBrush material must compile: ${JSON.stringify(result.diagnostics)}`);
  const source = result.overlayFiles.find((file) => file.relativePath === "src/World.tsx")?.content ?? "";
  assert(source.includes("<XriftOpenBrushPresetMaterial"), "A catalog brush assigned to a sphere must retain its shader rather than become PBR");
  if (mode === "primitive") assert(source.includes("<sphereGeometry args={[0.5, 32, 20]} />"),
    "Publishing must retain the editor sphere's radius and tessellation, which determine its size and shader interpolation");
  else assert(source.includes("sourceMaterial={findOpenBrushSourceMaterial(sourceMaterialIndices, 0, material as Material)}"),
    "Model assignments must select a source material from that model, even in the wildcard resolver");
  assert(source.includes("<XriftOpenBrushModelMaterial") && source.includes("fallback={<CompiledMaterial"), "Primitive and model assignments need separate source semantics and a PBR fallback");
  for (const token of ["brushName", "Fire", "sourceOverrides", "attributeBindings", "u_MainTex", "baseColorFactor"]) {
    assert(source.includes(token), `Standalone brush lost its authored ${token}`);
  }
  for (const name of ["open-brush-runtime.ts", "open-brush-preset-material.tsx", "open-brush-preset-loader.ts", "open-brush-material-properties.ts", "custom-shader-attributes.ts"]) {
    assert(result.overlayFiles.some((file) => file.relativePath === `src/xrift-studio/${name}`), `Standalone brush must ship ${name}`);
  }
  assert(result.stagingPlan.runtimePackageSpecs.includes(OPEN_BRUSH_RUNTIME_PACKAGE), "Standalone brush needs three-icosa without a GLB");
  assert(result.publishPermissions?.requirements.some((entry) => entry.feature === "OpenBrush"), "Standalone brush needs its resource permissions without a GLB");
  assert(result.stagingPlan.assetCopyPlan.some((entry) => entry.assetId === texture.id), "Brush texture overrides must be copied into publication");

  const preset = new RawShaderMaterial({
    vertexShader: "in vec3 a_position;\nin vec4 a_color;\nin vec2 a_texcoord0;\nvoid main() {}",
    fragmentShader: "in vec4 v_color;\nvoid main() { gl_FragColor = v_color; }",
    uniforms: { u_MainTex: { value: null }, u_Shininess: { value: 0 }, u_Cutoff: { value: 0 } },
  });
  const instance = preset.clone();
  const replacement = new Texture();
  applyOpenBrushMaterialProperties(instance, material.properties, { u_MainTex: replacement });
  assert(instance.uniforms.xriftBaseColorFactor.value instanceof Vector4 && instance.uniforms.xriftBaseColorFactor.value.y === 0.8, "Brush tint must preserve the authored numeric channels");
  assert(instance.fragmentShader.includes("(v_color * xriftBaseColorFactor)"), "Tint must modulate the brush pattern rather than replace its shader");
  assert(instance.uniforms.u_MainTex.value === replacement, "Brush sampler must use its assigned texture");
  assert(preset.uniforms.u_MainTex.value === null && !preset.uniforms.xriftBaseColorFactor, "Per-mesh brush assignments must not mutate the cached preset");
  const original = new MeshStandardMaterial();
  original.color.setRGB(0.15, 0.45, 0.6);
  original.opacity = 0.35;
  original.transparent = true;
  const sourceAssociations = new Map<unknown, { materials?: number }>([[original, { materials: 0 }], [preset, { materials: 1 }]]);
  assert(findOpenBrushSourceMaterial(sourceAssociations, 1, original) === preset, "A shader referencing a real model material must retain that source preset");
  assert(findOpenBrushSourceMaterial(sourceAssociations, 13, original) === original, "A catalog index outside the model must retain its PBR source rather than fetch another shader");
  const preserved = createOpenBrushMaterialInstance(original, { brushName: "Fire", brushBaseUrl: OPEN_BRUSH_BRUSH_BASE_URL, properties: material.properties });
  assert(preserved instanceof MeshStandardMaterial && preserved !== original && preserved.color.equals(original.color) && preserved.opacity === 0.35 && preserved.transparent, "Assigning a catalog brush to a model must preserve its source PBR color and transparency as in the editor");
  preserved.dispose();
  const mesh = new Mesh<SphereGeometry, Material>(new SphereGeometry(1, 8, 4), original);
  const sourceGeometry = mesh.geometry;
  let sourceGeometryDisposed = false;
  sourceGeometry.addEventListener("dispose", () => { sourceGeometryDisposed = true; });
  const detach = attachOpenBrushPresetMaterial(mesh, instance, "material", { a_color: { defaultValue: [1, 0.5, 1, 1] } });
  const primitiveGeometry = mesh.geometry;
  let primitiveGeometryDisposed = false;
  primitiveGeometry.addEventListener("dispose", () => { primitiveGeometryDisposed = true; });
  assert(primitiveGeometry !== sourceGeometry && !sourceGeometry.hasAttribute("a_color"), "Brush geometry bindings must leave the cached source geometry unchanged");
  assert(mesh.material === instance && mesh.geometry.getAttribute("a_position") === mesh.geometry.getAttribute("position"), "Primitive brush must bind its vertex position");
  assert(mesh.geometry.getAttribute("a_texcoord0") === mesh.geometry.getAttribute("uv"), "Primitive brush must use the sphere UVs for its pattern");
  assert(mesh.geometry.getAttribute("a_color").getY(0) === 0.5, "Primitive brush must preserve custom attribute defaults");
  detach();
  assert(mesh.material === original, "Removing a brush override must restore its source material");
  assert(mesh.geometry === sourceGeometry && primitiveGeometryDisposed && !sourceGeometryDisposed, "Removing a brush must dispose only its owned geometry and restore the cached source");
  const other = new MeshStandardMaterial();
  const multi = new Mesh<SphereGeometry, Material[]>(mesh.geometry, [original, other]);
  const detachSlot = attachOpenBrushPresetMaterial(multi, instance, "material-1");
  assert(multi.material[0] === original && multi.material[1] === instance, "A model brush override must target only its material slot");
  detachSlot();
  assert(multi.material[1] === other, "Removing a model brush override must restore its own slot");
  for (const reverse of [false, true]) {
    const sourceSlots = [original, other];
    const firstMesh = new Mesh<SphereGeometry, Material[]>(mesh.geometry, sourceSlots);
    const secondMesh = new Mesh<SphereGeometry, Material[]>(mesh.geometry, sourceSlots);
    const secondInstance = instance.clone();
    const detachFirst = attachOpenBrushPresetMaterial(firstMesh, instance, "material-0", { a_color: { defaultValue: [1, 0.25, 1, 1] } });
    const firstOwnedGeometry = firstMesh.geometry;
    const detachSecond = attachOpenBrushPresetMaterial(firstMesh, secondInstance, "material-1", { a_color: { defaultValue: [1, 0.75, 1, 1] } });
    assert(firstMesh.geometry === firstOwnedGeometry && firstMesh.geometry !== sourceGeometry && secondMesh.geometry === sourceGeometry && !sourceGeometry.hasAttribute("a_color"),
      "Shader slots must reuse their mesh's geometry without mutating another model instance");
    assert(firstMesh.material !== sourceSlots && secondMesh.material === sourceSlots && sourceSlots[0] === original && sourceSlots[1] === other,
      "Overrides on one model must not mutate a sibling's shared glTF material array");
    if (reverse) {
      detachSecond();
      assert(firstMesh.material[0] === instance && firstMesh.material[1] === other, "Detaching a later slot must retain the first assignment");
      assert(firstMesh.geometry.getAttribute("a_color").getY(0) === 0.25, "Detaching a later slot must restore the remaining shader's attribute defaults");
      detachFirst();
    } else {
      detachFirst();
      assert(firstMesh.material[0] === original && firstMesh.material[1] === secondInstance, "Detaching an earlier slot must retain the later assignment");
      assert(firstMesh.geometry.getAttribute("a_color").getY(0) === 0.75, "Detaching an earlier slot must retain the remaining shader's attribute defaults");
      detachSecond();
    }
    assert(firstMesh.material === sourceSlots && secondMesh.material === sourceSlots && sourceSlots[0] === original && sourceSlots[1] === other,
      "Both material-slot cleanup orders must restore the original array without changing the cached source");
    assert(firstMesh.geometry === sourceGeometry && secondMesh.geometry === sourceGeometry && !sourceGeometryDisposed && !sourceGeometry.hasAttribute("a_color"),
      "Both cleanup orders must restore the source geometry without disposing or changing it");
    secondInstance.dispose();
  }
  instance.vertexShader += "\nin vec3 unavailable_attribute;";
  original.color.set("#326698");
  const detachFallback = attachOpenBrushPresetMaterial(mesh, instance, "material", undefined, true, "Fire");
  assert(mesh.material !== original && mesh.material !== instance && (mesh.material as MeshStandardMaterial).color.equals(original.color), "Model attribute mismatch must retain the source PBR color exactly like the viewport");
  assert(readOpenBrushPbrFallback(mesh.material)?.reason === "attribute-mismatch", "Model fallback must retain its diagnostic");
  let fallbackDisposed = false;
  mesh.material.addEventListener("dispose", () => { fallbackDisposed = true; });
  detachFallback();
  assert(fallbackDisposed && mesh.material === original, "Detaching an attribute fallback must dispose only its owned clone and restore the source");
  instance.vertexShader = "// invalid custom override";
  const detachInvalid = attachOpenBrushPresetMaterial(mesh, instance, "material", undefined, true, "Fire");
  assert(readOpenBrushPbrFallback(mesh.material)?.reason === "shader-load-error" && mesh.material.opacity === original.opacity,
    "An invalid model shader must preserve its source PBR, not stop the Canvas");
  detachInvalid();
  const detachPbr = attachOpenBrushPresetMaterial(mesh, original, "material");
  assert(mesh.geometry === sourceGeometry, "PBR model assignments do not need a geometry copy");
  detachPbr();
  mesh.geometry.dispose(); original.dispose(); other.dispose(); instance.dispose(); preset.dispose(); replacement.dispose();
  return result;
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
