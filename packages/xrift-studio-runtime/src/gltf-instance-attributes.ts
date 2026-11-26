import {
  BufferGeometry,
  InstancedBufferAttribute,
  type BufferAttribute,
  type InstancedMesh,
  type InterleavedBufferAttribute,
  type Object3D,
} from "three";
import type {
  GLTFLoader,
  GLTFLoaderPlugin,
  GLTFParser,
} from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Per-instance attributes of `EXT_mesh_gpu_instancing`, delivered per instance.
 *
 * three.js builds an InstancedMesh from TRANSLATION / ROTATION / SCALE and turns
 * `_COLOR_0` into `instanceColor`, but it puts every other instance attribute
 * (an application's own, such as `_AOFFSET`) on the geometry as a plain
 * per-vertex BufferAttribute. A shader reading it then receives the values of
 * the first few instances as if they belonged to the first few vertices.
 *
 * This plugin gives the instanced Mesh InstancedBufferAttributes instead, one
 * value per instance. Which attribute belongs to which Mesh is read from the
 * glTF JSON through the parser's associations, never guessed from counts, so a
 * model that declares no such attribute is returned before any object is read.
 *
 * The Editor, the Runtime loader and the generated world all register it, so
 * one GLB draws the same way in Edit, Play and a published world. The GLB
 * bytes are never rewritten.
 */
export function registerGltfInstanceAttributes<T extends GLTFLoader>(loader: T): T {
  // GLTFLoader ignores a callback it already holds, so a loader shared by
  // several loads (React Three Fiber's useLoader) is registered only once.
  loader.register(createGltfInstanceAttributesPlugin);
  return loader;
}

const GPU_INSTANCING_EXTENSION = "EXT_mesh_gpu_instancing";

type SourceAttribute = BufferAttribute | InterleavedBufferAttribute;
type InstanceAccessorIndices = ReadonlyMap<string, number>;

function createGltfInstanceAttributesPlugin(parser: GLTFParser): GLTFLoaderPlugin {
  return {
    // The key three.js files this plugin under; it is not a glTF extension.
    name: "XRIFT_instance_attributes",
    afterRoot: () => {
      const declared = readDeclaredInstanceAttributes(parser.json);
      return declared.size > 0
        ? bindDeclaredInstanceAttributes(parser, declared)
        : null;
    },
  };
}

/**
 * The instance attributes the glTF JSON declares, by node index.
 *
 * Only application-specific semantics are taken, which glTF spells with a
 * leading underscore. `_COLOR_0` already became `instanceColor`, and the
 * transform semantics became the instance matrices.
 */
function readDeclaredInstanceAttributes(
  json: unknown,
): Map<number, InstanceAccessorIndices> {
  const declared = new Map<number, InstanceAccessorIndices>();
  const nodes = asRecord(json)?.nodes;
  if (!Array.isArray(nodes)) return declared;
  nodes.forEach((node: unknown, nodeIndex: number) => {
    const attributes = asRecord(
      asRecord(asRecord(asRecord(node)?.extensions)?.[GPU_INSTANCING_EXTENSION])
        ?.attributes,
    );
    if (!attributes) return;
    const accessors = new Map<string, number>();
    for (const [semantic, accessorIndex] of Object.entries(attributes)) {
      if (!semantic.startsWith("_") || semantic === "_COLOR_0") continue;
      if (typeof accessorIndex !== "number" || !Number.isInteger(accessorIndex)) continue;
      accessors.set(semantic, accessorIndex);
    }
    if (accessors.size > 0) declared.set(nodeIndex, accessors);
  });
  return declared;
}

async function bindDeclaredInstanceAttributes(
  parser: GLTFParser,
  declared: ReadonlyMap<number, InstanceAccessorIndices>,
): Promise<void> {
  const nodes: Array<{
    nodeIndex: number;
    meshes: InstancedMesh[];
    accessorIndices: InstanceAccessorIndices;
  }> = [];
  for (const [object, reference] of parser.associations) {
    const nodeIndex = (reference as { nodes?: number } | undefined)?.nodes;
    if (typeof nodeIndex !== "number" || !(object as Object3D).isObject3D) continue;
    const accessorIndices = declared.get(nodeIndex);
    if (!accessorIndices) continue;
    const meshes = collectNodeInstancedMeshes(parser, object as Object3D);
    if (meshes.length > 0) nodes.push({ nodeIndex, meshes, accessorIndices });
  }

  // Resolved while each node was built, so this only reads the parser's cache.
  const sources = new Map<number, SourceAttribute>();
  const semantics = new Set<string>();
  for (const { accessorIndices } of nodes) {
    for (const [semantic, accessorIndex] of accessorIndices) {
      semantics.add(semantic);
      if (sources.has(accessorIndex)) continue;
      sources.set(accessorIndex, await parser.getDependency("accessor", accessorIndex));
    }
  }
  const loaded = new Set(sources.values());

  const instancedBySource = new Map<SourceAttribute, InstancedBufferAttribute>();
  const geometriesBySource = new Map<BufferGeometry, Map<string, BufferGeometry>>();
  for (const { nodeIndex, meshes, accessorIndices } of nodes) {
    for (const mesh of meshes) {
      const usable = new Set<string>();
      for (const [semantic, accessorIndex] of accessorIndices) {
        const count = sources.get(accessorIndex)!.count;
        if (count >= mesh.count) {
          usable.add(semantic);
          continue;
        }
        // glTF requires one value per instance. A shorter accessor would make
        // the draw call read past its buffer, so it stays as three.js loads it.
        console.warn(
          `[XRift Studio] ${GPU_INSTANCING_EXTENSION}のノード${nodeIndex}は${mesh.count}個のインスタンスを描きますが、${semantic}の値は${count}個です。頂点ごとの属性のまま読み込みました。`,
        );
      }
      if (usable.size === 0) continue;
      const key = `${nodeIndex}:${[...usable].join(",")}`;
      let derived = geometriesBySource.get(mesh.geometry);
      if (!derived) geometriesBySource.set(mesh.geometry, (derived = new Map()));
      let geometry = derived.get(key);
      if (!geometry) {
        geometry = shareGeometry(mesh.geometry);
        // three.js wrote every node's instance accessors onto the one geometry
        // these nodes share. Only this node's own belong on its copy.
        for (const [name, attribute] of Object.entries(geometry.attributes)) {
          if (semantics.has(name) && loaded.has(attribute)) geometry.deleteAttribute(name);
        }
        for (const [semantic, accessorIndex] of accessorIndices) {
          const source = sources.get(accessorIndex)!;
          if (!usable.has(semantic)) {
            geometry.setAttribute(semantic, source);
            continue;
          }
          let attribute = instancedBySource.get(source);
          if (!attribute) {
            attribute = toInstancedAttribute(source);
            instancedBySource.set(source, attribute);
          }
          // three.js keeps the glTF spelling for instance attributes and
          // lower-cases custom vertex attributes (`_AMAT` becomes `_amat`).
          // A shader may read either spelling. A vertex attribute that already
          // owns the lower-cased name keeps it.
          geometry.setAttribute(semantic, attribute);
          const lowerCased = semantic.toLowerCase();
          if (lowerCased !== semantic && !geometry.hasAttribute(lowerCased)) {
            geometry.setAttribute(lowerCased, attribute);
          }
        }
        derived.set(key, geometry);
      }
      mesh.geometry = geometry;
    }
  }
}

/**
 * The InstancedMeshes three.js built for one glTF node: the node object itself,
 * or what it grouped for several primitives or for a camera or light on the
 * same node. Child glTF nodes own their instancing and are not entered.
 */
function collectNodeInstancedMeshes(
  parser: GLTFParser,
  node: Object3D,
): InstancedMesh[] {
  if ((node as InstancedMesh).isInstancedMesh) return [node as InstancedMesh];
  const meshes: InstancedMesh[] = [];
  for (const child of node.children) {
    const reference = parser.associations.get(child) as { nodes?: number } | undefined;
    if (typeof reference?.nodes === "number") continue;
    for (const candidate of [child, ...child.children]) {
      if ((candidate as InstancedMesh).isInstancedMesh) {
        meshes.push(candidate as InstancedMesh);
      }
    }
  }
  return meshes;
}

/**
 * A geometry of its own for the instanced Mesh, sharing every buffer.
 *
 * glTF lets several nodes use one mesh, and three.js gives them one geometry.
 * Writing instance attributes onto it would hand one node's values, and its
 * instance count, to every other node, so only the attribute table is copied.
 */
function shareGeometry(source: BufferGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.name = source.name;
  geometry.index = source.index;
  geometry.attributes = { ...source.attributes };
  geometry.morphAttributes = { ...source.morphAttributes };
  geometry.morphTargetsRelative = source.morphTargetsRelative;
  geometry.groups = source.groups.map((group) => ({ ...group }));
  geometry.drawRange = { ...source.drawRange };
  geometry.boundingBox = source.boundingBox?.clone() ?? null;
  geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
  geometry.userData = source.userData;
  return geometry;
}

/** Shares the accessor's array; an interleaved accessor is copied out once. */
function toInstancedAttribute(source: SourceAttribute): InstancedBufferAttribute {
  const interleaved = (source as InterleavedBufferAttribute).isInterleavedBufferAttribute
    ? (source as InterleavedBufferAttribute)
    : undefined;
  const attribute = new InstancedBufferAttribute(
    interleaved ? deinterleave(interleaved) : (source as BufferAttribute).array,
    source.itemSize,
    source.normalized,
  );
  attribute.name = source.name;
  if (!interleaved) attribute.gpuType = (source as BufferAttribute).gpuType;
  return attribute;
}

function deinterleave(source: InterleavedBufferAttribute): BufferAttribute["array"] {
  const { array, stride } = source.data;
  const values = new (array.constructor as new (length: number) => BufferAttribute["array"])(
    source.count * source.itemSize,
  );
  for (let index = 0; index < source.count; index += 1) {
    for (let component = 0; component < source.itemSize; component += 1) {
      values[index * source.itemSize + component] =
        array[index * stride + source.offset + component] ?? 0;
    }
  }
  return values;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
