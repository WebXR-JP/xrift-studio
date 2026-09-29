import {
  getMaterialShadingModel,
  normalizeMaterialProperties,
  updateMaterialAsset,
  type AssetManifest,
  type MaterialAsset,
  type MaterialAssetPatch,
  type MaterialExtensionsPatch,
  type MaterialProperties,
  type MaterialShadingModel,
  type SceneAsset,
} from "./asset-manifest";
import { MATERIAL_EXTENSION_DESCRIPTORS, MATERIAL_EXTENSION_NAMES, type MaterialExtensionName } from "./material-extension-registry";

export type MaterialSelectionAggregate = {
  materials: MaterialAsset[];
  eligibleMaterials: MaterialAsset[];
  primaryMaterial?: MaterialAsset;
  /** Display values only. Submit changed fields instead of copying this object. */
  properties?: MaterialProperties;
  shadingModel?: MaterialShadingModel;
  canEditProperties: boolean;
  /** Canonical property paths, including ancestors and vector components (.0). */
  mixedPropertyPaths: ReadonlySet<string>;
};

/** Other Asset kinds and custom renderers stay outside builtin Material edits. */
export function aggregateMaterialSelection(selectedAssets: readonly SceneAsset[]): MaterialSelectionAggregate {
  const materials = selectedAssets.filter((asset): asset is MaterialAsset => asset.kind === "material");
  const eligibleMaterials = materials.filter(asset => getMaterialShadingModel(asset) !== undefined);
  const primaryMaterial = eligibleMaterials[0];
  const primaryKind = getMaterialShadingModel(primaryMaterial);
  const shadingModel = primaryKind && eligibleMaterials.every(asset => getMaterialShadingModel(asset) === primaryKind)
    ? primaryKind : undefined;
  const normalized = eligibleMaterials.map(asset => normalizeMaterialProperties(asset.properties));
  const mixedPropertyPaths = new Set<string>();
  collectMixedPaths(normalized, "", mixedPropertyPaths);
  for (const name of MATERIAL_EXTENSION_NAMES) {
    if (normalized.some(properties => (properties.extensions[name] !== undefined) !== (normalized[0]?.extensions[name] !== undefined))) {
      mixedPropertyPaths.add(`extensions.${name}.enabled`);
    }
  }
  return { materials, eligibleMaterials, primaryMaterial, properties: normalized[0], shadingModel,
    canEditProperties: shadingModel !== undefined, mixedPropertyPaths };
}

function collectMixedPaths(values: readonly unknown[], path: string, mixed: Set<string>): boolean {
  if (values.length < 2) return false;
  const keys = new Set(values.flatMap(value => Array.isArray(value) || isRecord(value) ? Object.keys(value) : []));
  let differs = values.some(value => !Object.is(value, values[0]));
  if (values.some(value => Array.isArray(value) || isRecord(value))) {
    differs = false;
    for (const key of keys) {
      const children = values.map(value => Array.isArray(value) || isRecord(value) ? value[key as keyof typeof value] : undefined);
      if (collectMixedPaths(children, path ? `${path}.${key}` : key, mixed)) differs = true;
    }
    // Presence and container type matter even when an optional object is empty.
    const shape = (value: unknown) => Array.isArray(value) ? "array" : isRecord(value) ? "object" : typeof value;
    if (values.some(value => shape(value) !== shape(values[0]))) differs = true;
  }
  if (differs && path) mixed.add(path);
  return differs;
}

function selectedMaterials(manifest: AssetManifest, ids: readonly string[]): MaterialSelectionAggregate {
  const assets = [...new Set(ids)].map(id => manifest.assets[id]).filter((asset): asset is SceneAsset => asset !== undefined);
  return aggregateMaterialSelection(assets);
}

/** One caller transaction; every Material merges the patch against its own data. */
export function applyMaterialBatchPatch(manifest: AssetManifest, ids: readonly string[], patch: MaterialAssetPatch): AssetManifest {
  const selection = selectedMaterials(manifest, ids);
  const editsProperties = Object.keys(patch).some(key => key !== "shadingModel");
  if ((patch.shadingModel === undefined || editsProperties) && !selection.canEditProperties) return manifest;
  return selection.eligibleMaterials.reduce((next, asset) => updateMaterialAsset(next, asset.id, patch), manifest);
}

/** Preserve each target's untouched vector components and texture coordinates. */
export function applyMaterialBatchFieldValue(manifest: AssetManifest, ids: readonly string[], path: string, value: unknown): AssetManifest {
  const selection = selectedMaterials(manifest, ids);
  if (!selection.canEditProperties) return manifest;
  return selection.eligibleMaterials.reduce((next, asset) => {
    const patch = applyMaterialFieldValue(asset, path, value);
    return patch ? updateMaterialAsset(next, asset.id, patch) : next;
  }, manifest);
}

type Field = { path: string[]; tail: string[]; kind: "scalar" | "vector" | "texture"; default?: unknown; textureExtra?: "scale" | "strength" };

const SCALAR_PATHS = new Set([
  "vertexColors", "opacityChannel", "alphaMode", "alphaCutoff", "doubleSided", "blending", "depthWrite", "alphaToCoverage",
  "color", "opacity", "metalness", "roughness", "pbrMetallicRoughness.metallicFactor", "pbrMetallicRoughness.roughnessFactor",
]);
const VECTOR_DEFAULTS: Record<string, readonly number[]> = {
  "pbrMetallicRoughness.baseColorFactor": [1, 1, 1, 1], emissiveFactor: [0, 0, 0],
};
const TEXTURE_PATHS: Record<string, "scale" | "strength" | undefined> = {
  "pbrMetallicRoughness.baseColorTexture": undefined, "pbrMetallicRoughness.metallicRoughnessTexture": undefined,
  normalTexture: "scale", occlusionTexture: "strength", emissiveTexture: undefined, opacityTexture: undefined,
};

function fieldAt(path: string): Field | undefined {
  if (SCALAR_PATHS.has(path)) return { path: path.split("."), tail: [], kind: "scalar" };
  for (const [field, defaults] of Object.entries(VECTOR_DEFAULTS)) {
    if (path === field || path.startsWith(`${field}.`)) return { path: field.split("."), tail: path === field ? [] : path.slice(field.length + 1).split("."), kind: "vector", default: defaults };
  }
  for (const [field, textureExtra] of Object.entries(TEXTURE_PATHS)) {
    if (path === field || path.startsWith(`${field}.`)) return { path: field.split("."), tail: path === field ? [] : path.slice(field.length + 1).split("."), kind: "texture", textureExtra };
  }
  const [extensions, name, field, ...tail] = path.split(".");
  if (extensions !== "extensions" || !Object.prototype.hasOwnProperty.call(MATERIAL_EXTENSION_DESCRIPTORS, name)) return undefined;
  const descriptor = MATERIAL_EXTENSION_DESCRIPTORS[name as MaterialExtensionName].fields.find(candidate => candidate.name === field);
  if (!descriptor || descriptor.kind === "booleanRecord") return undefined;
  if (descriptor.kind === "texture" || descriptor.kind === "normalTexture") return { path: [extensions, name, field], tail, kind: "texture", textureExtra: descriptor.kind === "normalTexture" ? "scale" : undefined };
  if (descriptor.kind === "unitColor3" || descriptor.kind === "nonNegativeColor3") return { path: [extensions, name, field], tail, kind: "vector", default: descriptor.default };
  return tail.length ? undefined : { path: [extensions, name, field], tail, kind: "scalar" };
}

/** Only supported Material paths can produce a patch; shader and metadata are excluded. */
export function applyMaterialFieldValue(asset: MaterialAsset, path: string, value: unknown): MaterialAssetPatch | undefined {
  if (getMaterialShadingModel(asset) === undefined || value === undefined) return undefined;
  const properties = normalizeMaterialProperties(asset.properties);
  const toggle = /^extensions\.([^.]+)\.enabled$/.exec(path);
  if (toggle && toggle[1] !== "VRMC_materials_mtoon" && isExtensionName(toggle[1])) {
    return typeof value === "boolean" ? extensionToggle(properties, toggle[1], value) : undefined;
  }
  const field = fieldAt(path);
  if (!field) return undefined;
  const current = readPath(properties, field.path);
  let next: unknown;
  if (field.kind === "scalar") {
    if (!(value === null || typeof value === "boolean" || typeof value === "string" || finiteNumber(value))) return undefined;
    next = value;
  } else if (field.kind === "vector") {
    next = vectorValue(current ?? field.default, field.tail, value);
    if (next === undefined) return undefined;
  } else {
    next = textureValue(current, field.tail, value, field.textureExtra);
    if (next === undefined) return undefined;
  }
  const patch = nestedPatch(field.path, next) as MaterialAssetPatch;
  if (field.path[0] === "extensions" && field.path[1] !== "VRMC_materials_mtoon") {
    patch.extensions = { KHR_materials_unlit: null, ...patch.extensions };
    ensureExtensionDependencies(patch.extensions, field.path[1] as MaterialExtensionName);
  }
  return patch;
}

function isExtensionName(value: string): value is MaterialExtensionName {
  return Object.prototype.hasOwnProperty.call(MATERIAL_EXTENSION_DESCRIPTORS, value);
}

function ensureExtensionDependencies(patch: MaterialExtensionsPatch, name: MaterialExtensionName): void {
  for (const dependency of MATERIAL_EXTENSION_DESCRIPTORS[name].requires ?? []) {
    patch[dependency] ??= {};
    ensureExtensionDependencies(patch, dependency);
  }
}

function extensionToggle(properties: MaterialProperties, name: MaterialExtensionName, enabled: boolean): MaterialAssetPatch {
  const extensions: MaterialExtensionsPatch = { [name]: enabled ? {} : null };
  if (enabled) {
    if (name === "KHR_materials_unlit") {
      for (const other of MATERIAL_EXTENSION_NAMES) {
        if (other !== name && !MATERIAL_EXTENSION_DESCRIPTORS[other].compatibleWithUnlit) extensions[other] = null;
      }
    } else {
      extensions.KHR_materials_unlit = null;
      ensureExtensionDependencies(extensions, name);
    }
  } else {
    const disabled = new Set<MaterialExtensionName>([name]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const other of MATERIAL_EXTENSION_NAMES) {
        if (properties.extensions[other] && !disabled.has(other) && MATERIAL_EXTENSION_DESCRIPTORS[other].requires?.some(dependency => disabled.has(dependency))) {
          disabled.add(other); extensions[other] = null; changed = true;
        }
      }
    }
  }
  return { extensions };
}

function vectorValue(current: unknown, tail: string[], value: unknown): number[] | undefined {
  if (!Array.isArray(current)) return undefined;
  if (tail.length === 0) return Array.isArray(value) && value.length === current.length && value.every(finiteNumber) ? [...value] : undefined;
  const index = tail.length === 1 && /^(0|[1-9]\d*)$/.test(tail[0]) ? Number(tail[0]) : -1;
  if (index < 0 || index >= current.length || !finiteNumber(value)) return undefined;
  const result = [...current]; result[index] = value; return result;
}

function textureValue(current: unknown, tail: string[], value: unknown, extra?: "scale" | "strength"): unknown {
  if (tail.length === 0) {
    if (value === null || typeof value === "string") return value;
    return isRecord(value) && typeof value.textureAssetId === "string" ? structuredClone(value) : undefined;
  }
  if (tail.length === 1 && tail[0] === "textureAssetId") {
    if (value === null || value === "") return null;
    if (typeof value !== "string" || !value.trim()) return undefined;
    return { ...(isRecord(current) ? structuredClone(current) : { texCoord: 0 }), textureAssetId: value };
  }
  // Coordinates or strengths never invent a binding for an unassigned map.
  if (!isRecord(current) || typeof current.textureAssetId !== "string") return undefined;
  const result = structuredClone(current);
  if (tail.length === 1 && tail[0] === "texCoord") {
    if (!Number.isInteger(value) || Number(value) < 0) return undefined;
    result.texCoord = value; return result;
  }
  if (tail.length === 1 && tail[0] === extra && finiteNumber(value)) {
    result[extra] = value; return result;
  }
  if (tail[0] !== "transform") return undefined;
  if (tail.length === 1 && value === null) { result.transform = null; return result; }
  const transform = isRecord(result.transform) ? result.transform : {};
  if (tail[1] === "rotation" && tail.length === 2 && finiteNumber(value)) transform.rotation = value;
  else if (tail[1] === "offset" || tail[1] === "scale") {
    const updated = vectorValue(transform[tail[1]] ?? (tail[1] === "offset" ? [0, 0] : [1, 1]), tail.slice(2), value);
    if (!updated) return undefined;
    transform[tail[1]] = updated;
  } else return undefined;
  result.transform = transform; return result;
}

function readPath(value: unknown, path: string[]): unknown {
  for (const key of path) value = isRecord(value) ? value[key] : undefined;
  return value;
}
function nestedPatch(path: string[], value: unknown): Record<string, unknown> {
  return path.reduceRight<Record<string, unknown>>((nested, key, index) => ({ [key]: index === path.length - 1 ? value : nested }), {});
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function finiteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
