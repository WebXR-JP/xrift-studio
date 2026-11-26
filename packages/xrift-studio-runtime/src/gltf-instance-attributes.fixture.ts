import {
  InstancedBufferAttribute,
  type BufferAttribute,
  type BufferGeometry,
  type InstancedMesh,
  type Mesh,
  type Object3D,
} from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { registerGltfInstanceAttributes } from "./gltf-instance-attributes.js";
import {
  XRIFT_STUDIO_RUNTIME_FORMAT,
  XRIFT_STUDIO_RUNTIME_SCHEMA_VERSION,
  isXriftRuntimeManifest,
} from "./schema.js";
import { XriftThreeLoader, disposeXriftLoadResult } from "./three/index.js";

/**
 * What the instancing fixture GLB holds, for every suite that loads it.
 *
 * One quad mesh is used by four nodes: three instanced ones, each with its own
 * `_AOFFSET` accessor, and one ordinary node. `Four` draws as many instances as
 * the quad has vertices, the case a count comparison cannot tell apart.
 */
export const GPU_INSTANCING_FIXTURE = {
  vertexCount: 4,
  /** Per-vertex custom attribute of the quad; three.js names it `_amat`. */
  vertexMaterial: [0.25, 0.5, 0.75, 1],
  nodes: {
    Tufts: {
      translations: [-1, 0, 0, -0.5, 0, 0, 0, 0, 0, 0.5, 0, 0, 1, 0, 0],
      offsets: [0, 0.1, 0, 0, 0.2, 0, 0, 0.3, 0, 0, 0.4, 0, 0, 0.5, 0],
      /** Normalized unsigned bytes, RGBA per instance. */
      tints: [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255, 0, 255, 255, 255],
    },
    Pair: {
      translations: [-0.25, -0.6, 0, 0.25, -0.6, 0],
      offsets: [0, -0.1, 0, 0, -0.2, 0],
    },
    Four: {
      translations: [-0.75, 0.9, 0, -0.25, 0.9, 0, 0.25, 0.9, 0, 0.75, 0.9, 0],
      offsets: [0, 0.05, 0, 0, 0.1, 0, 0, 0.15, 0, 0, 0.2, 0],
    },
  },
  /** The ordinary node that shares the quad. */
  plainNodeName: "Single",
} as const;

/**
 * A Custom Shader for the fixture, written the way an author writes one.
 *
 * `_aoffset` lifts each instance by its own amount and `_amat` shades the quad
 * from its per-vertex values, so a picture shows at once whether a value
 * arrived per instance, per vertex or not at all. The ordinary node declares no
 * instance attribute, so it reads none.
 */
export const GPU_INSTANCING_FIXTURE_VERTEX_SHADER = `attribute float _amat;
#ifdef USE_INSTANCING
attribute vec3 _aoffset;
#endif
varying float vShade;

void main() {
  vShade = _amat;
  vec4 local = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    local.xyz += _aoffset;
    local = instanceMatrix * local;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * local;
}`;

export const GPU_INSTANCING_FIXTURE_FRAGMENT_SHADER = `varying float vShade;

void main() {
  gl_FragColor = vec4(vShade, 0.5 * vShade, 1.0 - vShade, 1.0);
}`;

type AccessorType = "SCALAR" | "VEC2" | "VEC3" | "VEC4";
type GlbTypedArray = Float32Array | Uint8Array | Uint16Array;
const COMPONENT_TYPES = new Map<unknown, number>([
  [Float32Array, 5126],
  [Uint8Array, 5121],
  [Uint16Array, 5123],
]);
const COMPONENT_COUNTS: Record<AccessorType, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** Collects accessors into one binary chunk and writes a self-contained GLB. */
class GlbBuilder {
  readonly accessors: Record<string, unknown>[] = [];
  private readonly bufferViews: Record<string, unknown>[] = [];
  private readonly chunks: Uint8Array[] = [];
  private byteLength = 0;

  accessor(
    data: GlbTypedArray,
    type: AccessorType,
    extra: Record<string, unknown> = {},
  ): number {
    const bufferView = this.bufferView(data);
    this.accessors.push({
      bufferView,
      componentType: COMPONENT_TYPES.get(data.constructor),
      count: data.length / COMPONENT_COUNTS[type],
      type,
      ...extra,
    });
    return this.accessors.length - 1;
  }

  /** Two VEC3 float accessors stored side by side in one strided buffer view. */
  interleavedVec3Pair(first: readonly number[], second: readonly number[]): [number, number] {
    const count = first.length / 3;
    const data = new Float32Array(count * 6);
    for (let index = 0; index < count; index += 1) {
      data.set(first.slice(index * 3, index * 3 + 3), index * 6);
      data.set(second.slice(index * 3, index * 3 + 3), index * 6 + 3);
    }
    const bufferView = this.bufferView(data, 24);
    this.accessors.push(
      { bufferView, byteOffset: 0, componentType: 5126, count, type: "VEC3" },
      { bufferView, byteOffset: 12, componentType: 5126, count, type: "VEC3" },
    );
    return [this.accessors.length - 2, this.accessors.length - 1];
  }

  build(json: Record<string, unknown>): Uint8Array {
    const binary = new Uint8Array(this.byteLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      binary.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const encoded = new TextEncoder().encode(
      JSON.stringify({
        asset: { version: "2.0", generator: "xrift-studio instancing fixture" },
        ...json,
        accessors: this.accessors,
        bufferViews: this.bufferViews,
        buffers: [{ byteLength: binary.byteLength }],
      }),
    );
    const jsonLength = Math.ceil(encoded.byteLength / 4) * 4;
    const glb = new Uint8Array(28 + jsonLength + binary.byteLength);
    const header = new DataView(glb.buffer);
    header.setUint32(0, 0x46546c67, true);
    header.setUint32(4, 2, true);
    header.setUint32(8, glb.byteLength, true);
    header.setUint32(12, jsonLength, true);
    header.setUint32(16, 0x4e4f534a, true);
    glb.fill(0x20, 20, 20 + jsonLength);
    glb.set(encoded, 20);
    header.setUint32(20 + jsonLength, binary.byteLength, true);
    header.setUint32(24 + jsonLength, 0x004e4942, true);
    glb.set(binary, 28 + jsonLength);
    return glb;
  }

  private bufferView(data: GlbTypedArray, byteStride?: number): number {
    const bytes = new Uint8Array(Math.ceil(data.byteLength / 4) * 4);
    bytes.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    this.bufferViews.push({
      buffer: 0,
      byteOffset: this.byteLength,
      byteLength: data.byteLength,
      ...(byteStride === undefined ? {} : { byteStride }),
    });
    this.chunks.push(bytes);
    this.byteLength += bytes.byteLength;
    return this.bufferViews.length - 1;
  }
}

/** A 0.2 m quad in the XY plane with a per-vertex `_AMAT`. */
function quadPrimitive(builder: GlbBuilder, material: number | undefined, extraAttributes: Record<string, number> = {}) {
  const position = builder.accessor(
    new Float32Array([-0.1, -0.1, 0, 0.1, -0.1, 0, 0.1, 0.1, 0, -0.1, 0.1, 0]),
    "VEC3",
    { min: [-0.1, -0.1, 0], max: [0.1, 0.1, 0] },
  );
  const vertexMaterial = builder.accessor(
    new Float32Array(GPU_INSTANCING_FIXTURE.vertexMaterial),
    "SCALAR",
  );
  const indices = builder.accessor(new Uint16Array([0, 1, 2, 0, 2, 3]), "SCALAR");
  return {
    attributes: { POSITION: position, _AMAT: vertexMaterial, ...extraAttributes },
    indices,
    ...(material === undefined ? {} : { material }),
  };
}

/** The GLB described by `GPU_INSTANCING_FIXTURE`. */
export function createGpuInstancingFixtureGlb(): Uint8Array {
  const builder = new GlbBuilder();
  const { Tufts, Pair, Four } = GPU_INSTANCING_FIXTURE.nodes;
  const primitive = quadPrimitive(builder, 0);
  const instanced = (
    name: string,
    node: { translations: readonly number[]; offsets: readonly number[]; tints?: readonly number[] },
  ) => ({
    name,
    mesh: 0,
    extensions: {
      EXT_mesh_gpu_instancing: {
        attributes: {
          TRANSLATION: builder.accessor(new Float32Array(node.translations), "VEC3"),
          _AOFFSET: builder.accessor(new Float32Array(node.offsets), "VEC3"),
          ...(node.tints
            ? { _ATINT: builder.accessor(new Uint8Array(node.tints), "VEC4", { normalized: true }) }
            : {}),
        },
      },
    },
  });
  return builder.build({
    extensionsUsed: ["EXT_mesh_gpu_instancing"],
    scene: 0,
    scenes: [{ nodes: [0, 1, 2, 3] }],
    nodes: [
      instanced("Tufts", Tufts),
      { name: GPU_INSTANCING_FIXTURE.plainNodeName, mesh: 0, translation: [0, -1.2, 0] },
      instanced("Pair", Pair),
      instanced("Four", Four),
    ],
    meshes: [{ name: "Quad", primitives: [primitive] }],
    materials: [{ name: "Tuft", doubleSided: true }],
  });
}

/** The same quad with no instancing at all: an ordinary model. */
export function createOrdinaryFixtureGlb(): Uint8Array {
  const builder = new GlbBuilder();
  return builder.build({
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "Quad", mesh: 0 }],
    meshes: [{ name: "Quad", primitives: [quadPrimitive(builder, 0)] }],
    materials: [{ name: "Tuft" }],
  });
}

type InstancingVariant =
  | "transforms-only"
  | "two-primitives"
  | "interleaved"
  | "short-accessor"
  | "vertex-name-taken";

function createInstancingVariantGlb(variant: InstancingVariant): Uint8Array {
  const builder = new GlbBuilder();
  const translations = [0, 0, 0, 1, 0, 0, 2, 0, 0];
  const offsets = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  let attributes: Record<string, number>;
  let primitives = [quadPrimitive(builder, 0)];
  if (variant === "interleaved") {
    const [translation, offset] = builder.interleavedVec3Pair(translations, offsets);
    attributes = { TRANSLATION: translation, _AOFFSET: offset };
  } else {
    attributes = { TRANSLATION: builder.accessor(new Float32Array(translations), "VEC3") };
    if (variant === "transforms-only") {
      attributes._COLOR_0 = builder.accessor(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), "VEC3");
    } else if (variant === "short-accessor") {
      attributes._AOFFSET = builder.accessor(new Float32Array(offsets.slice(0, 6)), "VEC3");
    } else {
      attributes._AOFFSET = builder.accessor(new Float32Array(offsets), "VEC3");
    }
  }
  if (variant === "two-primitives") primitives = [...primitives, quadPrimitive(builder, 1)];
  if (variant === "vertex-name-taken") {
    primitives = [
      quadPrimitive(builder, 0, {
        _AOFFSET: builder.accessor(new Float32Array(12).fill(0.5), "VEC3"),
      }),
    ];
  }
  return builder.build({
    extensionsUsed: ["EXT_mesh_gpu_instancing"],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "Instances", mesh: 0, extensions: { EXT_mesh_gpu_instancing: { attributes } } }],
    meshes: [{ name: "Quad", primitives }],
    materials: [{ name: "First" }, { name: "Second" }],
  });
}

/** `data:` URL of a GLB, for loaders that fetch their model. */
export function gpuInstancingFixtureDataUrl(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:model/gltf-binary;base64,${btoa(binary)}`;
}

/**
 * Asserts that `root` holds the fixture GLB with every custom instance
 * attribute delivered per instance. Shared by each path that loads a Model:
 * the helper itself, the Runtime loader and the Editor's loader.
 */
export function assertGpuInstancingFixtureLoaded(root: Object3D, label: string): void {
  const meshes = new Map<string, Mesh>();
  root.traverse((object) => {
    if ((object as Mesh).isMesh && !meshes.has(object.name)) meshes.set(object.name, object as Mesh);
  });
  const plain = meshes.get(GPU_INSTANCING_FIXTURE.plainNodeName);
  assert(plain && !(plain as InstancedMesh).isInstancedMesh, `${label}: the ordinary node is missing`);
  const geometries = new Set<BufferGeometry>();
  for (const [name, expected] of Object.entries(GPU_INSTANCING_FIXTURE.nodes)) {
    const mesh = meshes.get(name) as InstancedMesh | undefined;
    const count = expected.translations.length / 3;
    assert(mesh?.isInstancedMesh && mesh.count === count, `${label}: ${name} must stay an InstancedMesh of ${count}`);
    const geometry = mesh.geometry;
    const offset = geometry.getAttribute("_aoffset");
    assert(
      offset instanceof InstancedBufferAttribute && offset.meshPerAttribute === 1,
      `${label}: ${name} must read _aoffset once per instance, got ${offset?.constructor.name}`,
    );
    assert(
      offset.count === count && offset.itemSize === 3 && sameNumbers(offset.array, expected.offsets),
      `${label}: ${name} _aoffset must hold its own ${count} values, got ${Array.from(offset.array).join(",")}`,
    );
    assert(
      geometry.getAttribute("_AOFFSET") === offset,
      `${label}: ${name} must expose one attribute under the glTF and the lower-cased name`,
    );
    const tint = geometry.getAttribute("_atint");
    if ("tints" in expected) {
      assert(
        tint instanceof InstancedBufferAttribute && tint.normalized && tint.itemSize === 4 &&
          tint.array instanceof Uint8Array && sameNumbers(tint.array, expected.tints),
        `${label}: ${name} must keep its normalized byte attribute per instance`,
      );
    } else {
      // three.js alone leaves the last loaded node's accessor on every user.
      assert(
        !tint && !geometry.hasAttribute("_ATINT"),
        `${label}: ${name} received another node's _ATINT`,
      );
    }
    // The quad itself stays per vertex and is shared, not copied.
    const position = geometry.getAttribute("position");
    const vertexMaterial = geometry.getAttribute("_amat");
    assert(
      !(position instanceof InstancedBufferAttribute) && position.count === GPU_INSTANCING_FIXTURE.vertexCount &&
        !(vertexMaterial instanceof InstancedBufferAttribute) &&
        sameNumbers(vertexMaterial.array, GPU_INSTANCING_FIXTURE.vertexMaterial),
      `${label}: ${name} lost its per-vertex attributes`,
    );
    assert(
      position === plain.geometry.getAttribute("position") && geometry.index === plain.geometry.index,
      `${label}: ${name} must share the quad's vertex and index buffers`,
    );
    geometries.add(geometry);
  }
  assert(geometries.size === 3, `${label}: nodes with different accessors must not share instance attributes`);
  assert(!geometries.has(plain.geometry), `${label}: the ordinary node must keep the geometry three.js gave it`);
  assert(
    !plain.geometry.hasAttribute("_aoffset") &&
      !(plain.geometry.getAttribute("_AOFFSET") instanceof InstancedBufferAttribute),
    `${label}: the ordinary node's geometry was changed`,
  );
}

/** Loads through the shared helper exactly as every Model path registers it. */
function parseWithHelper(bytes: Uint8Array): Promise<GLTF> {
  return registerGltfInstanceAttributes(new GLTFLoader()).parseAsync(toArrayBuffer(bytes), "");
}

export async function runGltfInstanceAttributesFixtureAssertions(): Promise<void> {
  const bytes = createGpuInstancingFixtureGlb();
  const before = bytes.slice();

  // three.js alone: the defect this helper exists for.
  const stock = await new GLTFLoader().parseAsync(toArrayBuffer(bytes), "");
  const stockTufts = stock.scene.getObjectByName("Tufts") as InstancedMesh;
  const stockOffset = stockTufts.geometry.getAttribute("_AOFFSET");
  assert(
    stockTufts.isInstancedMesh && stockOffset && !(stockOffset instanceof InstancedBufferAttribute) &&
      !stockTufts.geometry.hasAttribute("_aoffset"),
    "three.js no longer loads custom instance attributes per vertex; revisit the helper",
  );

  const gltf = await parseWithHelper(bytes);
  assertGpuInstancingFixtureLoaded(gltf.scene, "shared helper");
  assert(sameNumbers(bytes, before), "loading must not rewrite the source GLB bytes");
  const tufts = gltf.scene.getObjectByName("Tufts") as InstancedMesh;
  const accessorIndex = (gltf.parser.json as {
    nodes: Array<{ extensions?: { EXT_mesh_gpu_instancing?: { attributes: Record<string, number> } } }>;
  }).nodes[0]!.extensions!.EXT_mesh_gpu_instancing!.attributes._AOFFSET!;
  const accessor = (await gltf.parser.getDependency("accessor", accessorIndex)) as BufferAttribute;
  assert(
    tufts.geometry.getAttribute("_aoffset").array === accessor.array,
    "a plain accessor must be shared with the instanced attribute, not copied",
  );

  // Clones made by Edit, Play and the Runtime keep the per-instance data.
  const drawn = cloneSkeleton(gltf.scene).getObjectByName("Tufts") as InstancedMesh;
  assert(
    drawn.isInstancedMesh && drawn.count === 5 && drawn.geometry === tufts.geometry,
    "a cloned Scene must keep the InstancedMesh and its geometry",
  );
  const copied = tufts.geometry.clone().getAttribute("_aoffset");
  assert(
    copied instanceof InstancedBufferAttribute && copied.meshPerAttribute === 1 &&
      sameNumbers(copied.array, GPU_INSTANCING_FIXTURE.nodes.Tufts.offsets),
    "a cloned geometry must keep the attribute per instance",
  );

  // A loader shared by several loads registers the plugin once.
  const shared = new GLTFLoader();
  registerGltfInstanceAttributes(registerGltfInstanceAttributes(shared));
  const registered = (shared as unknown as { pluginCallbacks: unknown[] }).pluginCallbacks.length;
  assert(
    registered === (new GLTFLoader() as unknown as { pluginCallbacks: unknown[] }).pluginCallbacks.length + 1,
    "registering twice must add the plugin once",
  );
  for (let load = 0; load < 2; load += 1) {
    assertGpuInstancingFixtureLoaded(
      (await shared.parseAsync(toArrayBuffer(bytes), "")).scene,
      `shared loader, load ${load + 1}`,
    );
  }

  await assertOrdinaryModelsStayUntouched();
  await assertInstancingVariants();
  await assertRuntimeLoaderDeliversInstanceAttributes(bytes);
}

async function assertOrdinaryModelsStayUntouched(): Promise<void> {
  const describe = (gltf: GLTF) => {
    const meshes: string[] = [];
    gltf.scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      meshes.push(
        `${mesh.name}:${(mesh as InstancedMesh).isInstancedMesh ? (mesh as InstancedMesh).count : "mesh"}:` +
          Object.entries(mesh.geometry.attributes)
            .map(([name, attribute]) =>
              `${name}=${attribute.constructor.name}/${attribute.count}/${Array.from((attribute as BufferAttribute).array).join(" ")}`)
            .sort()
            .join(";"),
      );
    });
    return meshes.join("\n");
  };
  for (const [label, bytes] of [
    ["an ordinary model", createOrdinaryFixtureGlb()],
    ["instancing without custom attributes", createInstancingVariantGlb("transforms-only")],
  ] as const) {
    const stock = await new GLTFLoader().parseAsync(toArrayBuffer(bytes), "");
    const helped = await parseWithHelper(bytes);
    assert(describe(helped) === describe(stock), `${label} must load exactly as three.js loads it`);
    helped.scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      for (const attribute of Object.values(mesh.geometry.attributes)) {
        assert(!(attribute instanceof InstancedBufferAttribute), `${label} gained an instanced attribute`);
      }
    });
  }
  const colored = (await parseWithHelper(createInstancingVariantGlb("transforms-only")))
    .scene.getObjectByName("Instances") as InstancedMesh;
  assert(
    colored.isInstancedMesh && colored.instanceColor?.count === 3,
    "_COLOR_0 must stay three.js's instanceColor",
  );
}

async function assertInstancingVariants(): Promise<void> {
  const offsets = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const group = (await parseWithHelper(createInstancingVariantGlb("two-primitives")))
    .scene.getObjectByName("Instances")!;
  const primitives = group.children as InstancedMesh[];
  assert(
    primitives.length === 2 && primitives.every((mesh) => mesh.isInstancedMesh && mesh.count === 3),
    "a mesh with two primitives must load as two InstancedMeshes",
  );
  const [first, second] = primitives.map((mesh) => mesh.geometry.getAttribute("_aoffset"));
  assert(
    first instanceof InstancedBufferAttribute && first === second && sameNumbers(first.array, offsets) &&
      primitives[0]!.geometry !== primitives[1]!.geometry,
    "both primitives must read the node's one instance attribute",
  );

  const interleaved = (await parseWithHelper(createInstancingVariantGlb("interleaved")))
    .scene.getObjectByName("Instances") as InstancedMesh;
  const deinterleaved = interleaved.geometry.getAttribute("_aoffset");
  assert(
    deinterleaved instanceof InstancedBufferAttribute && deinterleaved.count === 3 &&
      sameNumbers(deinterleaved.array, offsets),
    `an interleaved accessor must arrive as its own values, got ${Array.from(deinterleaved?.array ?? []).join(",")}`,
  );

  const taken = (await parseWithHelper(createInstancingVariantGlb("vertex-name-taken")))
    .scene.getObjectByName("Instances") as InstancedMesh;
  const vertexOwned = taken.geometry.getAttribute("_aoffset");
  const instanceOwned = taken.geometry.getAttribute("_AOFFSET");
  assert(
    !(vertexOwned instanceof InstancedBufferAttribute) && vertexOwned.count === GPU_INSTANCING_FIXTURE.vertexCount &&
      instanceOwned instanceof InstancedBufferAttribute && sameNumbers(instanceOwned.array, offsets),
    "a vertex attribute that already owns the lower-cased name must keep it",
  );

  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...values: unknown[]) => { warnings.push(values.join(" ")); };
  let short: InstancedMesh;
  try {
    short = (await parseWithHelper(createInstancingVariantGlb("short-accessor")))
      .scene.getObjectByName("Instances") as InstancedMesh;
  } finally {
    console.warn = warn;
  }
  assert(
    short.count === 3 && !short.geometry.hasAttribute("_aoffset") &&
      !(short.geometry.getAttribute("_AOFFSET") instanceof InstancedBufferAttribute),
    "an accessor shorter than the instance count must be left as three.js loaded it",
  );
  assert(
    warnings.length === 1 && warnings[0]!.includes("_AOFFSET") && warnings[0]!.includes("ノード0"),
    `a too-short instance accessor must be reported once, got ${JSON.stringify(warnings)}`,
  );
}

/** The Runtime package loader: what a world published from the browser runs. */
async function assertRuntimeLoaderDeliversInstanceAttributes(bytes: Uint8Array): Promise<void> {
  const manifest = {
    format: XRIFT_STUDIO_RUNTIME_FORMAT,
    schemaVersion: XRIFT_STUDIO_RUNTIME_SCHEMA_VERSION,
    generator: "xrift-studio",
    compilerVersion: "fixture",
    projectId: "instancing-fixture",
    projectKind: "world",
    entryScene: "scene-main",
    scenes: {
      "scene-main": {
        id: "scene-main",
        name: "Instancing fixture",
        rootEntityIds: ["grass", "second-grass"],
        entities: Object.fromEntries(["grass", "second-grass"].map((id) => [id, {
          id,
          name: id,
          parentId: null,
          children: [],
          enabled: true,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          components: [{
            id: `mesh-${id}`,
            type: "mesh",
            enabled: true,
            geometry: { kind: "model", assetId: "model-grass" },
            materialBindings: [],
            castShadow: false,
            receiveShadow: false,
          }],
        }])),
      },
    },
    assets: {
      "model-grass": {
        id: "model-grass",
        kind: "model",
        name: "Grass",
        url: gpuInstancingFixtureDataUrl(bytes),
        sourceFormat: "glb",
        scale: 1,
        materialSlots: [{ slot: "material-0", name: "Tuft", sourceMaterialIndex: 0 }],
      },
    },
  };
  assert(isXriftRuntimeManifest(manifest), "the instancing fixture manifest is not a Runtime manifest");
  const loaded = await new XriftThreeLoader({ assetBaseUrl: "https://fixture.invalid/" }).parse(manifest);
  try {
    assert(
      !loaded.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
      `Runtime loader failed: ${JSON.stringify(loaded.diagnostics)}`,
    );
    const entities = ["grass", "second-grass"].map((id) => loaded.entities.get(id)!);
    for (const entity of entities) assertGpuInstancingFixtureLoaded(entity, `Runtime loader, ${entity.name}`);
    const [first, second] = entities.map((entity) => entity.getObjectByName("Tufts") as InstancedMesh);
    assert(
      first !== second && first!.geometry === second!.geometry,
      "two Entities of one Model must share the instanced geometry",
    );
  } finally {
    disposeXriftLoadResult(loaded);
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function sameNumbers(actual: ArrayLike<number>, expected: ArrayLike<number>): boolean {
  if (actual.length !== expected.length) return false;
  for (let index = 0; index < actual.length; index += 1) {
    if (Math.abs(actual[index]! - expected[index]!) > 1e-6) return false;
  }
  return true;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`glTF instance attribute fixture failed: ${message}`);
}
