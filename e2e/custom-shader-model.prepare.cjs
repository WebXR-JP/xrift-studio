// Emit the actual publications of a Model that wears a Custom Shader which
// reads the Scene's wind and key light, as foliage does, so the browser can
// draw the same Model through Edit, Play, the generated World, the Runtime
// JSON loader and the built shell.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { pathToFileURL } = require("node:url");
process.env.XRIFT_TYPESCRIPT_PATH = "typescript-test-api";
const fixtureHooks = fs.readFileSync("scripts/run-authoring-fixtures.cjs", "utf8");
eval(fixtureHooks.slice(0, fixtureHooks.indexOf("(async () => {")));

// The mesh named Leaves leans the way the wind blows, as far as the wind is
// fast, and swings back with the clock. Gusts push it along x.
const VERTEX = `uniform float uTime;
uniform vec2 uWindDirection;
uniform float uWindSpeed;
uniform float uWindTurbulence;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 moved = position;
#ifdef LEAVES
  moved.xy += uWindDirection * (uWindSpeed * 0.2 * sin(uTime));
  moved.x += uWindTurbulence * 0.4;
#endif
  gl_Position = projectionMatrix * modelViewMatrix * vec4(moved, 1.0);
}`;
// Four bands from the bottom, one value of the Scene each, so that a pixel in
// a band has one known colour. The Leaves variant swaps red and blue.
const FRAGMENT = `uniform vec2 uWindDirection;
uniform float uWindSpeed;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uAmbientColor;
uniform float uAmbientIntensity;
varying vec2 vUv;
void main() {
  float band = floor(vUv.y * 4.0);
  vec3 color;
  if (band < 1.0) color = uSunDirection * 0.5 + 0.5;
  else if (band < 2.0) color = uSunColor * uSunIntensity * 0.25;
  else if (band < 3.0) color = uAmbientColor * uAmbientIntensity;
  else color = vec3(uWindDirection * 0.5 + 0.5, uWindSpeed * 0.25);
#ifdef LEAVES
  color = color.bgr;
#endif
  gl_FragColor = vec4(color, 1.0);
}`;

/**
 * A GLB of two meshes that share one material: Trunk on the left and Leaves
 * on the right, each a 0.8 m square facing +Z whose v runs from the bottom.
 */
function foliageGlb() {
  const positions = new Float32Array([-0.4, -0.4, 0, 0.4, -0.4, 0, 0.4, 0.4, 0, -0.4, 0.4, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const parts = [positions, normals, uvs, indices].map((array) => Buffer.from(array.buffer));
  const offsets = [];
  let length = 0;
  for (const part of parts) {
    offsets.push(length);
    length += part.length;
  }
  const binary = Buffer.concat([...parts, Buffer.alloc((4 - (length % 4)) % 4)]);
  const primitive = { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 };
  const document = {
    asset: { version: "2.0", generator: "xrift-studio e2e" },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: "Trunk", mesh: 0, translation: [-0.5, 0, 0] },
      { name: "Leaves", mesh: 1, translation: [0.5, 0, 0] },
    ],
    meshes: [
      { name: "Trunk", primitives: [primitive] },
      { name: "Leaves", primitives: [primitive] },
    ],
    materials: [{ name: "Foliage", doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.4, 0.6, 0.3, 1] } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [-0.4, -0.4, 0], max: [0.4, 0.4, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 4, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 6, type: "SCALAR" },
    ],
    bufferViews: parts.map((part, index) => ({
      buffer: 0, byteOffset: offsets[index], byteLength: part.length, target: index === 3 ? 34963 : 34962,
    })),
    buffers: [{ byteLength: binary.length }],
  };
  const text = Buffer.from(JSON.stringify(document), "utf8");
  const json = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const chunk = (type, data) => {
    const header = Buffer.alloc(8);
    header.writeUInt32LE(data.length, 0);
    header.writeUInt32LE(type, 4);
    return Buffer.concat([header, data]);
  };
  const body = Buffer.concat([chunk(0x4e4f534a, json), chunk(0x004e4942, binary)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

(async () => {
  const load = (file) => import(pathToFileURL(path.resolve(file)).href);
  const { createPrototypeProject } = await load("src/lib/visual-editor/prototype-project.ts");
  const { normalizeMaterialProperties, normalizeModelImportSettings } = await load("src/lib/visual-editor/asset-manifest.ts");
  const { compileVisualProject } = await load("src/lib/visual-editor/compiler/compile.ts");

  const bytes = foliageGlb();
  const project = createPrototypeProject("world", "custom-shader-model-parity");
  const model = {
    id: "foliage-model", name: "Foliage model", kind: "model", status: "ready",
    source: { kind: "project", relativePath: "assets/models/foliage.glb" },
    sourceHash: createHash("sha256").update(bytes).digest("hex"),
    importSettings: normalizeModelImportSettings({}),
    materialSlots: [{ slot: "material-0", name: "Foliage", sourceMaterialIndex: 0 }],
    importMetadata: {
      sourceFormat: "glb", byteLength: bytes.byteLength, nodeCount: 2, meshCount: 2, primitiveCount: 2,
      bounds: { min: [-0.9, -0.4, 0], max: [0.9, 0.4, 0], center: [0, 0, 0], size: [1.8, 0.8, 0], boundingSphereRadius: 1 },
      animations: [], extensionsUsed: [], extensionsRequired: [],
    },
  };
  const material = {
    id: "foliage-shader", name: "Foliage shader", kind: "material", status: "ready", source: { kind: "document" },
    properties: normalizeMaterialProperties({}),
    shader: {
      kind: "classic-r3f", sourceModulePath: "e2e://custom-shader-model",
      vertexShader: VERTEX, fragmentShader: FRAGMENT,
      uniforms: {
        uTime: { kind: "number", value: 0 },
        // What an author left in the Material. None of it is the Scene's value,
        // so a path that draws these has not read the Scene.
        uWindDirection: { kind: "vector", value: [0, -1] },
        uWindSpeed: { kind: "number", value: 3 },
        uWindTurbulence: { kind: "number", value: 1 },
        uSunDirection: { kind: "vector", value: [1, 0, 0] },
        uSunColor: { kind: "vector", value: [0.1, 0.2, 0.3] },
        uSunIntensity: { kind: "number", value: 4 },
        uAmbientColor: { kind: "vector", value: [0.9, 0.1, 0.1] },
        uAmbientIntensity: { kind: "number", value: 1 },
      },
      // One Material for the whole Model: the mesh name picks the variant.
      variants: [
        { name: "leaves", meshNameIncludes: "leaves", defines: { LEAVES: "1" }, side: "double", transparent: false, depthWrite: true },
        { name: "default", defines: {}, side: "double", transparent: false, depthWrite: true },
      ],
      animatedTimeUniform: "uTime",
    },
  };
  Object.assign(project.assets.assets, { [model.id]: model, [material.id]: material });

  // The Model at the origin and the Scene's key light: nothing else to draw.
  const entity = project.scene.entities["entity-world-object"];
  const transform = entity.components.find((component) => component.type === "transform");
  Object.assign(transform, { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
  const mesh = entity.components.find((component) => component.type === "mesh");
  Object.assign(mesh, {
    geometryAssetId: model.id,
    geometry: { kind: "asset", assetId: model.id },
    materialBindings: [{ slot: "material-0", materialAssetId: material.id }],
    castShadow: false,
    receiveShadow: false,
  });
  entity.components = [transform, mesh];
  const sun = project.scene.entities["entity-world-light"];
  Object.assign(sun.components.find((component) => component.type === "transform"), { rotation: [-Math.PI / 6, Math.PI / 4, 0] });
  Object.assign(sun.components.find((component) => component.type === "light"), { color: "#ffcc88", intensity: 2, castShadow: false });
  project.scene.entities = { [entity.id]: entity, [sun.id]: sun };
  project.scene.rootEntityIds = [entity.id, sun.id];
  const settings = project.scene.settings;
  settings.skybox.enabled = false;
  settings.skybox.iblEnabled = false;
  settings.postprocessing.enabled = false;
  settings.postprocessing.hdr.enabled = false;
  settings.fog.enabled = false;
  // The Scene's wind and ambient. The gust is chosen so that no edge of the
  // leaning mesh falls on a pixel centre.
  settings.vegetation = { ...settings.vegetation, enabled: true, windSpeed: 1.75, gustStrength: 0.27, windDirectionDegrees: 120 };
  settings.ambient = { enabled: true, color: "#336699", intensity: 0.75 };

  const documents = { project: project.project, assets: project.assets, scenes: { [project.scene.sceneId]: project.scene }, prefabs: project.prefabs };
  const published = compileVisualProject(documents);
  const runtime = compileVisualProject(documents, { outputMode: "classic-runtime" });
  for (const output of [published, runtime]) {
    if (!output.canStage) throw new Error(JSON.stringify(output.diagnostics.filter((entry) => entry.severity === "blocking")));
  }

  const root = path.resolve("node_modules/.cache/xrift-studio/custom-shader-model-parity");
  fs.rmSync(root, { recursive: true, force: true });
  const write = (relativePath, content) => {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  for (const file of published.overlayFiles) {
    if (/\.(ts|tsx|js)$/.test(file.relativePath)) write(file.relativePath, file.content);
  }
  write(runtime.runtimeManifestFile.relativePath, runtime.runtimeManifestFile.content);
  // Each publication names the copied Model its own way; both get the bytes.
  const copies = [published, runtime].map((output) => {
    const copy = output.assetCopyPlan.find((entry) => entry.assetId === model.id);
    if (!copy?.supportedByCompiler) throw new Error("The Model is not part of the publication");
    write(copy.targetRelativePath, bytes);
    return path.basename(copy.targetRelativePath);
  });
  write("fixture.json", JSON.stringify({
    modelFile: copies[0], mesh, assets: project.assets, scene: project.scene,
    runtimeManifest: runtime.runtimeManifestFile.relativePath,
  }));
  console.log("Prepared the actual publications of a Model that wears a Custom Shader");
})().catch((error) => { console.error(error); process.exitCode = 1; });
