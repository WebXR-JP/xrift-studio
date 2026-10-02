import {
  detectOpenBrushGltfDocument,
  extractOpenBrushMaterialShader,
  extractOpenBrushMaterialSlots,
  isOpenBrushMaterialShader,
  prepareOpenBrushGltfSource,
} from "./open-brush";
import { OPEN_BRUSH_CATALOG } from "./open-brush-catalog";
import { applyOpenBrushCatalogInstall } from "./external-store";
import type { AssetManifest } from "./asset-manifest";
import { BufferAttribute, BufferGeometry, Group, LoadingManager, Mesh, MeshStandardMaterial, RawShaderMaterial, type Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createOpenBrushMaterialExtension, readOpenBrushPbrFallback, type OpenBrushMaterialExtension } from "../../../packages/xrift-studio-runtime/src/open-brush/material-extension";

export async function runOpenBrushFixtureAssertions(): Promise<void> {
  await assertOpenBrushLoaderAcceptsOptionalGltfMaterials();
  await assertUnityExportBrushMaterials();
  const document = {
    asset: { version: "2.0", generator: "Open Brush 2.8" },
    extensionsUsed: ["GOOGLE_tilt_brush_material"],
    images: [{ uri: "https://example.invalid/legacy-brush.png" }],
    materials: [
      {
        name: "brush_Light",
        extensions: { GOOGLE_tilt_brush_material: { guid: "fixture" } },
      },
    ],
    meshes: [{ primitives: [{ material: 0 }] }],
    nodes: [
      { name: "brush_Light_g0_b0", mesh: 0, children: [1] },
      { name: "node_SceneLight_0_i1", translation: [1, 2, 3] },
    ],
  };
  const metadata = detectOpenBrushGltfDocument(document);
  assert(metadata?.renderer === "three-icosa", "OpenBrush renderer was not detected");
  assert(metadata.brushNames[0] === "Light", "Brush name was not normalized");
  assert(metadata.nodes?.length === 2, "OpenBrush node hierarchy was not extracted");
  assert(metadata.nodes?.[0]?.name === "Light",
    "OpenBrush brush Entity name was not normalized");
  assert(metadata.nodes?.[0]?.sourceMaterialIndices[0] === 0,
    "OpenBrush node material index was not retained");
  assert(metadata.nodes?.[1]?.parentSourceNodeIndex === 0,
    "OpenBrush parent-child relationship was not retained");
  assert(metadata.nodes?.[1]?.position[1] === 2,
    "OpenBrush node Transform was not retained");
  const slots = extractOpenBrushMaterialSlots(document);
  assert(slots.length === 1 && slots[0].sourceMaterialIndex === 0,
    "OpenBrush material slot was not extracted");
  const shader = extractOpenBrushMaterialShader(document, 0);
  assert(shader?.brushName === "Light" && shader.brushGuid === "fixture",
    "OpenBrush custom Material preset was not extracted");
  assert(isOpenBrushMaterialShader(shader),
    "OpenBrush custom Material preset is not serializable");
  assert(
    isOpenBrushMaterialShader({
      ...shader,
      sourceOverrides: { vertexShader: "void main() {}" },
      attributeBindings: {
        a_position: { sourceAttribute: "position" },
        a_color: { defaultValue: [1, 1, 1, 1] },
      },
    }),
    "An editable custom shader copy or attribute mapping is not serializable",
  );

  const gltfBytes = new TextEncoder().encode(JSON.stringify(document));
  const preparedGltf = prepareOpenBrushGltfSource(gltfBytes, "gltf");
  assert(typeof preparedGltf === "string", "glTF importer source must stay JSON text");
  assert(!preparedGltf.includes("example.invalid"),
    "Legacy brush image URL must not be fetched during import parsing");
  assert(preparedGltf.includes("data:image/png;base64"),
    "Import parser placeholder image is missing");

  const glb = createFixtureGlb(document);
  const preparedGlb = prepareOpenBrushGltfSource(glb, "glb");
  assert(preparedGlb instanceof ArrayBuffer, "GLB importer source must stay binary");
  const preparedBytes = new Uint8Array(preparedGlb);
  const view = new DataView(preparedGlb);
  assert(view.getUint32(8, true) === preparedBytes.byteLength,
    "Sanitized GLB length header is stale");
  const jsonLength = view.getUint32(12, true);
  const json = new TextDecoder().decode(preparedBytes.subarray(20, 20 + jsonLength));
  assert(!json.includes("example.invalid"),
    "Sanitized GLB still contains the legacy image URL");

  const emptyManifest: AssetManifest = {
    schemaVersion: "0.1.0",
    assets: {},
  };
  const catalogEntry = OPEN_BRUSH_CATALOG[0];
  assert(catalogEntry !== undefined, "OpenBrush catalog is empty");
  const installed = applyOpenBrushCatalogInstall(emptyManifest, catalogEntry);
  const material = installed.manifest.assets[installed.primaryAssetId];
  assert(material?.kind === "material",
    "OpenBrush catalog did not create a Material Asset");
  assert(material.shader?.kind === "openbrush",
    "OpenBrush catalog did not retain its custom shader descriptor");
  assert(material.shader.brushGuid === catalogEntry.brushGuid,
    "OpenBrush catalog did not retain the brush GUID");
  assert(material.attribution?.providerId === "open-brush",
    "OpenBrush catalog attribution is missing");
  const duplicate = applyOpenBrushCatalogInstall(
    installed.manifest,
    catalogEntry,
  );
  assert(duplicate.alreadyInstalled,
    "OpenBrush catalog did not deduplicate the same brush GUID");
  assert(Object.keys(duplicate.manifest.assets).length === 1,
    "OpenBrush catalog duplicated an installed Material");
}

async function assertUnityExportBrushMaterials(): Promise<void> {
  const document = {
    asset: { version: "2.0", generator: "Open Brush UnityGLTF Exporter" },
    materials: [{ name: "OilPaint (Instance)" }, { name: "Disco (Instance)" }],
    meshes: [{ primitives: [{ material: 0 }, { material: 1 }] }],
    // Texture indices intentionally differ from image indices.
    textures: [{ source: 1 }],
    images: [{ bufferView: 0 }, { uri: "https://example.invalid/old.png" }],
  };
  const metadata = detectOpenBrushGltfDocument(document);
  assert(metadata?.brushNames.join(",") === "OilPaint,Disco", "Unity instance names must identify the brush presets");
  assert(extractOpenBrushMaterialShader(document, 0)?.brushName === "OilPaint", "Imported Material Assets must use the same preset name as the model loader");
  const oil = { ...document.materials[0], pbrMetallicRoughness: { baseColorTexture: { index: 0 } } };
  const json = { ...document, materials: [oil, document.materials[1]] };
  const associations = new Map<object, { meshes: number; primitives: number }>();
  const parser = { json, options: { manager: new LoadingManager() }, associations };
  const extension = createOpenBrushMaterialExtension(parser, "https://example.invalid/brushes/");
  const internal = extension as unknown as OpenBrushMaterialExtension;
  await extension.beforeRoot();
  assert(json.images[0].bufferView === 0 && !("uri" in json.images[0]), "The loader must preserve embedded images");
  assert(json.images[1].uri?.includes("OilPaint-"), "Legacy image remapping must resolve textures[].source");

  const root = new Group();
  const meshes = [new Mesh(), new Mesh()];
  meshes.forEach((mesh, index) => {
    root.add(mesh);
    associations.set(mesh, { meshes: 0, primitives: index });
  });
  const replacements: string[] = [];
  const replace = internal.replaceMaterial;
  internal.replaceMaterial = (mesh, name) => {
    replacements.push(`${meshes.indexOf(mesh as Mesh)}:${name}`);
  };
  await extension.afterRoot({ scenes: [root, root] } as never);
  assert(replacements.join(",") === "0:OilPaint,1:Disco", "Each primitive must receive only its own brush, once across shared scenes");
  internal.replaceMaterial = replace;

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0]), 3));
  geometry.setAttribute("normal", new BufferAttribute(new Float32Array([0, 1, 0]), 3));
  const color = new BufferAttribute(new Float32Array([0.5, 0.2, 0.1, 0.5]), 4);
  geometry.setAttribute("color", color);
  const uv = new BufferAttribute(new Float32Array([0.25, 0.75]), 2);
  const uv1 = new BufferAttribute(new Float32Array([0.1, 0.2]), 2);
  geometry.setAttribute("uv", uv);
  geometry.setAttribute("uv1", uv1);
  const mesh = new Mesh<BufferGeometry, Material>(geometry, new MeshStandardMaterial());
  const shader = new RawShaderMaterial();
  internal.tiltShaderLoader.loadedMaterials.Dots = shader;
  await internal.replaceMaterial(mesh, "Dots");
  assert(mesh.material === shader && !readOpenBrushPbrFallback(mesh.material), "Float32 vertex colors must load without a global THREE namespace");
  assert(geometry.getAttribute("color") === color && color.getX(0) === 0.5, "The linear glTF vertex colors must stay untouched");
  const brushColor = geometry.getAttribute("a_color");
  assert(brushColor.normalized && brushColor.array[0] === 188 && brushColor.array[3] === 128, "Brush RGB must use the library's sRGB encoding while alpha stays linear");
  assert(geometry.getAttribute("a_texcoord1") === uv1, "Modern GLTFLoader uv1 must reach particle brushes");
  const legacyUv = new BufferAttribute(new Float32Array([0.25, 0.75, 2, 3]), 4);
  geometry.setAttribute("_tb_unity_texcoord_0", legacyUv);
  await internal.replaceMaterial(mesh, "Dots");
  assert(geometry.getAttribute("a_texcoord0") === legacyUv, "Legacy four-component brush UVs must take priority over truncated standard UVs");
}

async function assertOpenBrushLoaderAcceptsOptionalGltfMaterials(): Promise<void> {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const document = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
    buffers: [{ byteLength: positions.byteLength }],
  };
  const loader = new GLTFLoader();
  // This also exercises legacy generated worlds where useLoader reused one
  // GLTFLoader after registering the brush plugin for an earlier model.
  loader.register((parser) => createOpenBrushMaterialExtension(parser, "https://example.invalid/brushes/"));
  for (const [label, candidate] of [
    ["ordinary material-less glTF", document],
    ["Open Brush material-less glTF", { ...document, extensionsUsed: ["GOOGLE_tilt_brush_material"] }],
    ["ordinary unnamed material", {
      ...document,
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
      materials: [{}],
    }],
  ] as const) {
    const bytes = createFixtureGlb(candidate, new Uint8Array(positions.buffer));
    const gltf = await loader.parseAsync(bytes.buffer as ArrayBuffer, "");
    const mesh = gltf.scene.children[0];
    assert(mesh instanceof Mesh, `${label} must load its mesh`);
    assert(mesh.material instanceof MeshStandardMaterial, `${label} must retain the standard glTF material`);
    assert(mesh.geometry.getAttribute("position").count === 3, `${label} must retain all vertices`);
  }

  // Extension GUIDs are sufficient to identify a brush; a name is optional in
  // glTF. Keep the real library's hooks active without fetching shader resources.
  const brushDocument = {
    asset: { version: "2.0" },
    extensionsUsed: ["GOOGLE_tilt_brush_material"],
    materials: [{ extensions: { GOOGLE_tilt_brush_material: { guid: "Light" } } }],
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
  };
  const source = JSON.stringify(brushDocument);
  const brush = await loader.parseAsync(source, "");
  assert(brush.parser.json.materials[0].name === "", "Brush hooks must accept an unnamed extension material");
  assert(JSON.stringify(brushDocument) === source, "Loading must not change the source glTF document");
}

function createFixtureGlb(document: unknown, binary?: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(json.byteLength / 4) * 4;
  const binaryLength = binary ? Math.ceil(binary.byteLength / 4) * 4 : 0;
  const bytes = new Uint8Array(20 + jsonLength + (binary ? 8 + binaryLength : 0));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(json, 20);
  bytes.fill(0x20, 20 + json.byteLength, 20 + jsonLength);
  if (binary) {
    view.setUint32(20 + jsonLength, binaryLength, true);
    view.setUint32(24 + jsonLength, 0x004e4942, true);
    bytes.set(binary, 28 + jsonLength);
  }
  return bytes;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
