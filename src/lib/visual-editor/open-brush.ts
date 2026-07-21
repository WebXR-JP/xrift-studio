import { Euler, Matrix4, Quaternion, Vector3 } from "three";

export const OPEN_BRUSH_EXTENSION_NAMES = [
  "GOOGLE_tilt_brush_material",
  "GOOGLE_tilt_brush_techniques",
] as const;

export const OPEN_BRUSH_BRUSH_BASE_URL =
  "https://icosa-foundation.github.io/three-icosa-template/brushes/";

export const OPEN_BRUSH_RUNTIME_PACKAGE = "three-icosa@0.4.2-alpha.18";
export const OPEN_BRUSH_RENDERER = "three-icosa@0.4.2-alpha.18";

const OPEN_BRUSH_PLACEHOLDER_IMAGE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

type JsonRecord = Record<string, unknown>;

export type OpenBrushModelMetadata = {
  renderer: "three-icosa";
  rendererVersion: string;
  extensionNames: string[];
  exporter?: string;
  brushNames: string[];
  /** glTF nodes retained for non-destructive Hierarchy/Prefab expansion. */
  nodes?: OpenBrushNodeMetadata[];
};

export type OpenBrushNodeMetadata = {
  sourceNodeIndex: number;
  name: string;
  parentSourceNodeIndex?: number;
  childSourceNodeIndices: number[];
  meshIndex?: number;
  sourceMaterialIndices: number[];
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

export type OpenBrushMaterialSlot = {
  slot: string;
  name: string;
  sourceMaterialIndex: number;
};

/**
 * Authoring reference to one three-icosa brush preset. The GLSL and texture
 * files stay owned by the pinned brush library; the Material Asset records the
 * stable preset identity instead of flattening it into a Standard/PBR shader.
 */
export type OpenBrushMaterialShader = {
  kind: "openbrush";
  renderer: "three-icosa";
  rendererVersion: string;
  brushName: string;
  brushGuid?: string;
  brushBaseUrl: string;
  sourceMaterialIndex: number;
};

export function detectOpenBrushGltfDocument(
  value: unknown,
): OpenBrushModelMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const extensions = new Set<string>();
  collectExtensionNames(value.extensionsUsed, extensions);
  collectExtensionNames(value.extensionsRequired, extensions);
  collectRecordKeys(value.extensions, extensions);

  const asset = isRecord(value.asset) ? value.asset : undefined;
  const exporter = typeof asset?.generator === "string"
    ? asset.generator.trim()
    : undefined;
  const materials = Array.isArray(value.materials) ? value.materials : [];
  const brushNames: string[] = [];
  let hasOpenBrushMaterialName = false;

  materials.forEach((candidate, index) => {
    if (!isRecord(candidate)) return;
    collectRecordKeys(candidate.extensions, extensions);
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (/^ob-/i.test(name)) hasOpenBrushMaterialName = true;
    brushNames.push(normalizeBrushName(name, index));
  });

  const extensionNames = OPEN_BRUSH_EXTENSION_NAMES.filter((name) =>
    extensions.has(name),
  );
  const exporterMatches =
    typeof exporter === "string" && /(?:open|tilt)\s*brush/i.test(exporter);
  if (extensionNames.length === 0 && !exporterMatches && !hasOpenBrushMaterialName) {
    return undefined;
  }

  return {
    renderer: "three-icosa",
    rendererVersion: OPEN_BRUSH_RENDERER,
    extensionNames,
    ...(exporter ? { exporter } : {}),
    brushNames: [...new Set(brushNames)],
    nodes: extractOpenBrushNodeHierarchy(value),
  };
}

export function isOpenBrushModelMetadata(
  value: unknown,
): value is OpenBrushModelMetadata {
  if (!isRecord(value)) return false;
  return (
    value.renderer === "three-icosa" &&
    typeof value.rendererVersion === "string" &&
    Array.isArray(value.extensionNames) &&
    value.extensionNames.every((entry) => typeof entry === "string") &&
    Array.isArray(value.brushNames) &&
    value.brushNames.every((entry) => typeof entry === "string") &&
    (value.nodes === undefined ||
      (Array.isArray(value.nodes) && value.nodes.every(isOpenBrushNodeMetadata)))
  );
}

export function extractOpenBrushNodeHierarchy(
  value: unknown,
): OpenBrushNodeMetadata[] {
  if (!isRecord(value) || !Array.isArray(value.nodes)) return [];
  const nodes = value.nodes;
  const meshes = Array.isArray(value.meshes) ? value.meshes : [];
  const parentByNodeIndex = new Map<number, number>();

  nodes.forEach((candidate, parentIndex) => {
    if (!isRecord(candidate) || !Array.isArray(candidate.children)) return;
    candidate.children.forEach((childIndex) => {
      if (
        typeof childIndex === "number" &&
        Number.isInteger(childIndex) &&
        childIndex >= 0 &&
        childIndex < nodes.length &&
        !parentByNodeIndex.has(childIndex)
      ) {
        parentByNodeIndex.set(childIndex, parentIndex);
      }
    });
  });

  return nodes.map((candidate, sourceNodeIndex) => {
    const node = isRecord(candidate) ? candidate : {};
    const meshIndex = integerIndex(node.mesh, meshes.length);
    const mesh = meshIndex === undefined ? undefined : meshes[meshIndex];
    const sourceMaterialIndices = isRecord(mesh) && Array.isArray(mesh.primitives)
      ? [
          ...new Set(
            mesh.primitives.flatMap((primitive) => {
              if (!isRecord(primitive)) return [];
              const materialIndex = integerIndex(primitive.material);
              return materialIndex === undefined ? [] : [materialIndex];
            }),
          ),
        ]
      : [];
    const childSourceNodeIndices = Array.isArray(node.children)
      ? [
          ...new Set(
            node.children.flatMap((childIndex) => {
              const index = integerIndex(childIndex, nodes.length);
              return index === undefined ? [] : [index];
            }),
          ),
        ]
      : [];
    const transform = openBrushNodeTransform(node);
    return {
      sourceNodeIndex,
      name: openBrushNodeName(node.name, sourceNodeIndex),
      ...(parentByNodeIndex.has(sourceNodeIndex)
        ? { parentSourceNodeIndex: parentByNodeIndex.get(sourceNodeIndex) }
        : {}),
      childSourceNodeIndices,
      ...(meshIndex === undefined ? {} : { meshIndex }),
      sourceMaterialIndices,
      ...transform,
    };
  });
}

export function extractOpenBrushMaterialSlots(
  value: unknown,
): OpenBrushMaterialSlot[] {
  if (!isRecord(value) || !Array.isArray(value.meshes)) return [];
  const materialNames = Array.isArray(value.materials) ? value.materials : [];
  const usedIndices = new Set<number>();
  value.meshes.forEach((candidate) => {
    if (!isRecord(candidate) || !Array.isArray(candidate.primitives)) return;
    candidate.primitives.forEach((primitive) => {
      if (!isRecord(primitive)) return;
      const index = primitive.material;
      if (typeof index === "number" && Number.isInteger(index) && index >= 0) {
        usedIndices.add(index);
      }
    });
  });
  return [...usedIndices].sort((left, right) => left - right).map((index) => {
    const material = materialNames[index];
    const declaredName = isRecord(material) && typeof material.name === "string"
      ? material.name.trim()
      : "";
    return {
      slot: `material-${index}`,
      name: declaredName || `OpenBrush Brush ${index + 1}`,
      sourceMaterialIndex: index,
    };
  });
}

export function extractOpenBrushMaterialShader(
  value: unknown,
  sourceMaterialIndex: number,
): OpenBrushMaterialShader | undefined {
  if (!isRecord(value) || !Array.isArray(value.materials)) return undefined;
  const candidate = value.materials[sourceMaterialIndex];
  if (!isRecord(candidate)) return undefined;
  const sourceName =
    typeof candidate.name === "string" ? candidate.name.trim() : "";
  const extensions = isRecord(candidate.extensions)
    ? candidate.extensions
    : undefined;
  const extension = OPEN_BRUSH_EXTENSION_NAMES.map((name) =>
    isRecord(extensions?.[name]) ? extensions[name] : undefined,
  ).find((entry) => entry !== undefined);
  const brushGuid =
    typeof extension?.guid === "string" && extension.guid.trim()
      ? extension.guid.trim()
      : undefined;
  if (!sourceName && !brushGuid) return undefined;
  return {
    kind: "openbrush",
    renderer: "three-icosa",
    rendererVersion: OPEN_BRUSH_RENDERER,
    brushName: normalizeBrushName(sourceName, sourceMaterialIndex),
    ...(brushGuid ? { brushGuid } : {}),
    brushBaseUrl: OPEN_BRUSH_BRUSH_BASE_URL,
    sourceMaterialIndex,
  };
}

export function isOpenBrushMaterialShader(
  value: unknown,
): value is OpenBrushMaterialShader {
  if (!isRecord(value)) return false;
  return (
    value.kind === "openbrush" &&
    value.renderer === "three-icosa" &&
    typeof value.rendererVersion === "string" &&
    Boolean(value.rendererVersion.trim()) &&
    typeof value.brushName === "string" &&
    Boolean(value.brushName.trim()) &&
    (value.brushGuid === undefined ||
      (typeof value.brushGuid === "string" && Boolean(value.brushGuid.trim()))) &&
    typeof value.brushBaseUrl === "string" &&
    /^https:\/\//.test(value.brushBaseUrl) &&
    integerIndex(value.sourceMaterialIndex) !== undefined
  );
}

/**
 * OpenBrush exports may retain obsolete remote image URLs. three-icosa replaces
 * them before runtime loading; the importer uses embedded pixels only while it
 * measures geometry and creates a thumbnail.
 */
export function prepareOpenBrushGltfSource(
  bytes: Uint8Array,
  format: "glb" | "gltf" | "vrm",
): string | ArrayBuffer {
  const document = parseGltfDocument(bytes, format);
  if (!detectOpenBrushGltfDocument(document)) {
    return format === "gltf"
      ? new TextDecoder().decode(bytes)
      : toOwnedArrayBuffer(bytes);
  }
  const sanitized = structuredClone(document);
  if (Array.isArray(sanitized.images)) {
    sanitized.images.forEach((candidate) => {
      if (!isRecord(candidate) || typeof candidate.uri !== "string") return;
      if (!isExternalUri(candidate.uri)) return;
      candidate.uri = OPEN_BRUSH_PLACEHOLDER_IMAGE_DATA_URL;
    });
  }
  if (format === "gltf") return JSON.stringify(sanitized);
  return rebuildGlbJsonChunk(bytes, JSON.stringify(sanitized));
}

export function isExternalGltfUri(value: unknown): value is string {
  return typeof value === "string" && isExternalUri(value);
}

function parseGltfDocument(
  bytes: Uint8Array,
  format: "glb" | "gltf" | "vrm",
): JsonRecord {
  const text = format === "gltf"
    ? new TextDecoder().decode(bytes)
    : readGlbJsonChunk(bytes);
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) throw new Error("glTF JSON root is invalid");
  return parsed;
}

function rebuildGlbJsonChunk(bytes: Uint8Array, json: string): ArrayBuffer {
  const view = validateGlb(bytes);
  const oldJsonLength = view.getUint32(12, true);
  const oldJsonEnd = 20 + oldJsonLength;
  const encodedJson = new TextEncoder().encode(json);
  const paddedJsonLength = Math.ceil(encodedJson.byteLength / 4) * 4;
  const remainingLength = bytes.byteLength - oldJsonEnd;
  const rebuilt = new Uint8Array(20 + paddedJsonLength + remainingLength);
  const rebuiltView = new DataView(rebuilt.buffer);
  rebuiltView.setUint32(0, 0x46546c67, true);
  rebuiltView.setUint32(4, 2, true);
  rebuiltView.setUint32(8, rebuilt.byteLength, true);
  rebuiltView.setUint32(12, paddedJsonLength, true);
  rebuiltView.setUint32(16, 0x4e4f534a, true);
  rebuilt.set(encodedJson, 20);
  rebuilt.fill(0x20, 20 + encodedJson.byteLength, 20 + paddedJsonLength);
  rebuilt.set(bytes.subarray(oldJsonEnd), 20 + paddedJsonLength);
  return rebuilt.buffer;
}

function readGlbJsonChunk(bytes: Uint8Array): string {
  const view = validateGlb(bytes);
  const chunkLength = view.getUint32(12, true);
  return new TextDecoder()
    .decode(bytes.subarray(20, 20 + chunkLength))
    .replace(/[\u0000\u0020]+$/g, "");
}

function validateGlb(bytes: Uint8Array): DataView {
  if (bytes.byteLength < 20) throw new Error("GLB header is incomplete");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("GLB magic is invalid");
  if (view.getUint32(4, true) !== 2) throw new Error("Only glTF 2.0 GLB is supported");
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error("GLB length is invalid");
  const chunkLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || 20 + chunkLength > bytes.byteLength) {
    throw new Error("GLB JSON chunk is missing");
  }
  return view;
}

function collectExtensionNames(value: unknown, target: Set<string>): void {
  if (!Array.isArray(value)) return;
  value.forEach((entry) => {
    if (typeof entry === "string") target.add(entry);
  });
}

function collectRecordKeys(value: unknown, target: Set<string>): void {
  if (!isRecord(value)) return;
  Object.keys(value).forEach((name) => target.add(name));
}

function normalizeBrushName(name: string, index: number): string {
  const normalized = name.replace(/^(?:ob-|brush_|material_)/i, "").trim();
  return normalized || `Brush ${index + 1}`;
}

function openBrushNodeName(value: unknown, index: number): string {
  if (typeof value !== "string" || !value.trim()) return `OpenBrush Node ${index + 1}`;
  const source = value.trim();
  const brush = source
    .replace(/^brush_/i, "")
    .replace(/_g\d+_b\d+$/i, "")
    .trim();
  return brush || source;
}

function openBrushNodeTransform(node: JsonRecord): Pick<
  OpenBrushNodeMetadata,
  "position" | "rotation" | "scale"
> {
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3(1, 1, 1);
  const matrix = finiteNumberArray(node.matrix, 16);
  if (matrix) {
    new Matrix4().fromArray(matrix).decompose(position, quaternion, scale);
  } else {
    const translation = finiteNumberArray(node.translation, 3);
    const sourceRotation = finiteNumberArray(node.rotation, 4);
    const sourceScale = finiteNumberArray(node.scale, 3);
    if (translation) position.fromArray(translation);
    if (sourceRotation) quaternion.fromArray(sourceRotation).normalize();
    if (sourceScale) scale.fromArray(sourceScale);
  }
  const euler = new Euler().setFromQuaternion(quaternion, "XYZ");
  return {
    position: [position.x, position.y, position.z],
    rotation: [euler.x, euler.y, euler.z],
    scale: [scale.x, scale.y, scale.z],
  };
}

function isOpenBrushNodeMetadata(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    integerIndex(value.sourceNodeIndex) !== undefined &&
    typeof value.name === "string" &&
    (value.parentSourceNodeIndex === undefined ||
      integerIndex(value.parentSourceNodeIndex) !== undefined) &&
    isIntegerArray(value.childSourceNodeIndices) &&
    (value.meshIndex === undefined || integerIndex(value.meshIndex) !== undefined) &&
    isIntegerArray(value.sourceMaterialIndices) &&
    finiteNumberArray(value.position, 3) !== undefined &&
    finiteNumberArray(value.rotation, 3) !== undefined &&
    finiteNumberArray(value.scale, 3) !== undefined
  );
}

function integerIndex(value: unknown, upperBound?: number): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return undefined;
  }
  return upperBound !== undefined && value >= upperBound ? undefined : value;
}

function isIntegerArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => integerIndex(entry) !== undefined);
}

function finiteNumberArray(value: unknown, length: number): number[] | undefined {
  return Array.isArray(value) &&
    value.length === length &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
    ? value
    : undefined;
}

function isExternalUri(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && !normalized.startsWith("data:");
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copied = new Uint8Array(bytes.byteLength);
  copied.set(bytes);
  return copied.buffer;
}
