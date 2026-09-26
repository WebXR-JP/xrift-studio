import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { MeshStandardMaterial, type BufferGeometry, type Material, type Mesh, type Object3D, type RawShaderMaterial, type Texture } from "three";
import {
  applyCustomShaderSourceOverrides,
  bindCustomShaderGeometryAttributes,
  hasCustomShaderEntrypoints,
  type CustomShaderAttributeOverrides,
  type CustomShaderSourceOverrides,
} from "../custom-shader-attributes.js";
import { markOpenBrushPbrFallback, normalizeOpenBrushGlslSource } from "./material-extension.js";
import { applyOpenBrushMaterialProperties, type OpenBrushMaterialProperties } from "./material-properties.js";
import { loadOpenBrushPresetMaterial } from "./preset-loader.js";

export type OpenBrushPresetSettings = {
  brushName: string;
  brushBaseUrl: string;
  properties: OpenBrushMaterialProperties;
  sourceOverrides?: CustomShaderSourceOverrides;
  attributeBindings?: CustomShaderAttributeOverrides;
};

/** Model assignments look up a material in the loaded model, not the catalog. */
export function findOpenBrushSourceMaterial(
  associations: ReadonlyMap<unknown, { materials?: number }>,
  sourceMaterialIndex: number,
  source: Material,
): Material {
  for (const [candidate, reference] of associations) {
    if (reference.materials === sourceMaterialIndex && candidate && typeof candidate === "object" && "isMaterial" in candidate) {
      return candidate as Material;
    }
  }
  return source;
}

export function createOpenBrushMaterialInstance(
  source: Material,
  settings: OpenBrushPresetSettings,
  textures: Readonly<Record<string, Texture>> = {},
): Material {
  const result = source.clone();
  const overrides = settings.sourceOverrides;
  applyCustomShaderSourceOverrides(result, overrides ? {
    vertexShader: overrides.vertexShader === undefined ? undefined : normalizeOpenBrushGlslSource(overrides.vertexShader),
    fragmentShader: overrides.fragmentShader === undefined ? undefined : normalizeOpenBrushGlslSource(overrides.fragmentShader),
  } : undefined);
  applyOpenBrushMaterialProperties(result, settings.properties, textures);
  result.name = `material_${settings.brushName}`;
  return result;
}

type MaterialSlotAssignment = { index: number; material: Material };
type OwnedMaterialSlots = {
  source: Material[];
  materials: Material[];
  assignments: Set<MaterialSlotAssignment>;
};
const OWNED_MATERIAL_SLOTS = new WeakMap<Object3D, OwnedMaterialSlots>();
type GeometryBinding = { material: Material; overrides?: CustomShaderAttributeOverrides };
type OwnedShaderGeometry = {
  source: BufferGeometry;
  geometry: BufferGeometry;
  bindings: Set<GeometryBinding>;
};
const OWNED_SHADER_GEOMETRIES = new WeakMap<Mesh, OwnedShaderGeometry>();

function bindOwnedShaderGeometry(mesh: Mesh, material: Material, overrides?: CustomShaderAttributeOverrides) {
  let owned = OWNED_SHADER_GEOMETRIES.get(mesh);
  if (!owned || mesh.geometry !== owned.geometry) {
    owned = { source: mesh.geometry, geometry: mesh.geometry.clone(), bindings: new Set() };
    OWNED_SHADER_GEOMETRIES.set(mesh, owned);
    mesh.geometry = owned.geometry;
  }
  const state = owned;
  const binding = { material, overrides };
  state.bindings.add(binding);
  const bindings = bindCustomShaderGeometryAttributes(state.geometry, material, overrides);
  return {
    bindings,
    release: () => {
      if (!state.bindings.delete(binding)) return;
      const old = state.geometry;
      if (state.bindings.size === 0) {
        if (mesh.geometry === old) mesh.geometry = state.source;
        if (OWNED_SHADER_GEOMETRIES.get(mesh) === state) OWNED_SHADER_GEOMETRIES.delete(mesh);
      } else {
        state.geometry = state.source.clone();
        for (const remaining of state.bindings) {
          bindCustomShaderGeometryAttributes(state.geometry, remaining.material, remaining.overrides);
        }
        if (mesh.geometry === old) mesh.geometry = state.geometry;
      }
      old.dispose();
    },
  };
}

/** Keep R3F's material attachment and its geometry attributes in one lifetime. */
export function attachOpenBrushPresetMaterial(
  parent: Object3D,
  material: Material,
  attach: string,
  attributeBindings?: CustomShaderAttributeOverrides,
  fallbackOnAttributeMismatch = false,
  brushName = material.name,
): () => void {
  const mesh = parent as Mesh;
  const invalidShader = "isShaderMaterial" in material && !hasCustomShaderEntrypoints(material);
  const geometryBinding = mesh.geometry && "isShaderMaterial" in material && !invalidShader
    ? bindOwnedShaderGeometry(mesh, material, attributeBindings) : undefined;
  const missing = (geometryBinding?.bindings ?? []).filter((binding) => binding.status === "missing");
  const resolveMaterial = (source: Material | Material[]): Material => {
    if (!fallbackOnAttributeMismatch || (!invalidShader && missing.length === 0)) return material;
    // Model previews preserve the original PBR appearance when a custom
    // attribute cannot be supplied. Primitive previews use their own binding
    // behavior, so this branch is enabled only for model assignments.
    const fallback = !Array.isArray(source) && (source as MeshStandardMaterial).isMeshStandardMaterial
      ? source.clone()
      : new MeshStandardMaterial({ name: Array.isArray(source) ? "" : source.name });
    markOpenBrushPbrFallback(fallback, {
      renderer: "gltf-pbr",
      reason: invalidShader ? "shader-load-error" : "attribute-mismatch",
      brushName,
      message: invalidShader ? "Vertex or fragment shader has no void main() entrypoint" : `Missing geometry attributes: ${missing.map((binding) => binding.shaderName).join(", ")}`,
    });
    return fallback;
  };
  if (attach === "material") {
    const previous = mesh.material;
    const assigned = resolveMaterial(previous);
    mesh.material = assigned;
    return () => {
      mesh.material = previous;
      if (assigned !== material) assigned.dispose();
      geometryBinding?.release();
    };
  }
  const slot = /^material-(\d+)$/.exec(attach);
  if (!slot || !Array.isArray(mesh.material)) {
    geometryBinding?.release();
    throw new Error(`Unsupported OpenBrush material attachment: ${attach}`);
  }
  const index = Number(slot[1]);
  const previous = mesh.material[index];
  if (!previous) {
    geometryBinding?.release();
    throw new Error(`Missing OpenBrush material slot: ${attach}`);
  }
  let owned = OWNED_MATERIAL_SLOTS.get(parent);
  if (!owned || owned.materials !== mesh.material) {
    // Clone shares the original glTF material array across instances. Own an
    // array per rendered mesh so an override never rewrites a sibling or cache.
    owned = { source: mesh.material, materials: [...mesh.material], assignments: new Set() };
    OWNED_MATERIAL_SLOTS.set(parent, owned);
    mesh.material = owned.materials;
  }
  const slots = owned;
  const assigned = resolveMaterial(previous);
  const assignment = { index, material: assigned };
  slots.assignments.add(assignment);
  slots.materials[index] = assigned;
  return () => {
    if (!slots.assignments.delete(assignment)) return;
    // Sibling material slots may unmount in either order. Restore this slot
    // without resurrecting a disposed assignment from another cleanup.
    let restored = slots.source[index];
    for (const entry of slots.assignments) {
      if (entry.index === index) restored = entry.material;
    }
    if (restored) slots.materials[index] = restored;
    if (slots.assignments.size === 0) {
      if (mesh.material === slots.materials) mesh.material = slots.source;
      if (OWNED_MATERIAL_SLOTS.get(parent) === slots) OWNED_MATERIAL_SLOTS.delete(parent);
    }
    if (assigned !== material) assigned.dispose();
    geometryBinding?.release();
  };
}

const EMPTY_TEXTURES: Readonly<Record<string, Texture>> = {};

type OpenBrushMaterialProps = {
  settings: OpenBrushPresetSettings;
  textures?: Readonly<Record<string, Texture>>;
  attach?: string;
};

/** Only primitives fetch catalog presets; models keep their source material. */
export function XriftOpenBrushPresetMaterial({
  settings,
  textures = EMPTY_TEXTURES,
  attach = "material",
  fallback,
}: OpenBrushMaterialProps & { fallback: ReactNode }) {
  const [loaded, setLoaded] = useState<{ key: string; material: RawShaderMaterial }>();
  const key = JSON.stringify([settings.brushName, settings.brushBaseUrl]);
  useEffect(() => {
    let active = true;
    void loadOpenBrushPresetMaterial(settings.brushName, settings.brushBaseUrl).then(
      (material) => { if (active) setLoaded({ key, material }); },
      () => { if (active) setLoaded(undefined); },
    );
    return () => { active = false; };
  }, [key, settings.brushName, settings.brushBaseUrl]);
  if (loaded?.key !== key) return fallback;
  return <OpenBrushMaterialInstance settings={settings} textures={textures} attach={attach} source={loaded.material} fallback={fallback} />;
}

export function XriftOpenBrushModelMaterial({
  sourceMaterial,
  ...props
}: OpenBrushMaterialProps & { sourceMaterial: Material }) {
  return <OpenBrushMaterialInstance {...props} source={sourceMaterial} modelAssignment />;
}

function OpenBrushMaterialInstance({
  source,
  settings,
  textures = EMPTY_TEXTURES,
  attach = "material",
  modelAssignment = false,
  fallback,
}: OpenBrushMaterialProps & {
  source: Material;
  modelAssignment?: boolean;
  fallback?: ReactNode;
}) {
  const material = useMemo(() => createOpenBrushMaterialInstance(source, settings, textures), [source, settings, textures]);
  useEffect(() => () => material.dispose(), [material]);
  const attachMaterial = useCallback(
    (parent: Object3D, value: Material) => attachOpenBrushPresetMaterial(parent, value, attach, settings.attributeBindings, modelAssignment, settings.brushName),
    [attach, settings.attributeBindings, settings.brushName, modelAssignment],
  );
  if (!modelAssignment && !hasCustomShaderEntrypoints(material)) return fallback;
  return <primitive object={material} attach={attachMaterial} />;
}
