import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.vite-extrude-parity-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const load = file => server.ssrLoadModule(file);
const profileModule = await load("/packages/xrift-studio-runtime/src/extrude-profile.ts");
const { createXriftExtrudeGeometry } = await load("/packages/xrift-studio-runtime/src/extrude-geometry.ts");
const { createPrototypeProject } = await load("/src/lib/visual-editor/prototype-project.ts");
const sceneModule = await load("/src/lib/visual-editor/scene-document.ts");
const { normalizeMaterialProperties } = await load("/src/lib/visual-editor/asset-manifest.ts");
const { sceneDocumentCodec } = await load("/src/lib/visual-editor/serialization.ts");
const { compileVisualProject } = await load("/src/lib/visual-editor/compiler/compile.ts");
const { isXriftRuntimeManifest } = await load("/packages/xrift-studio-runtime/src/schema.ts");
const { XriftThreeLoader, disposeXriftLoadResult } = await load("/packages/xrift-studio-runtime/src/three/index.ts");
const { estimateWorldVram } = await load("/src/lib/visual-editor/vram-estimate.ts");
const profile = { points: [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], depth: 0.6 };

function specimen() {
  const bundle = createPrototypeProject("world", "Extrude parity");
  const materialId = "material-extrude-parity";
  const material = structuredClone(Object.values(bundle.assets.assets).find(asset => asset.kind === "material"));
  Object.assign(material, { id: materialId, name: "Extrude blue", properties: normalizeMaterialProperties({ color: "#3b82f6", extensions: { KHR_materials_unlit: {} } }) });
  bundle.assets.assets[materialId] = material;
  const mesh = sceneModule.createExtrudeMeshComponent("extrude-mesh", materialId, profile);
  bundle.scene.entities = { "extrude-specimen": { id: "extrude-specimen", name: "Concave extrusion", parentId: null, children: [], enabled: true, components: [sceneModule.createTransformComponent("extrude-transform", [-1, -1, 0]), mesh, sceneModule.createMeshColliderComponent("extrude-collider", { meshMode: "trimesh", bodyType: "fixed" })] } };
  bundle.scene.rootEntityIds = ["extrude-specimen"];
  // Let all three render paths use one fixed external camera and empty background.
  bundle.scene.settings.skybox.enabled = false;
  bundle.scene.settings.skybox.iblEnabled = false;
  bundle.scene.settings.postprocessing.enabled = false;
  bundle.scene.settings.postprocessing.hdr.enabled = false;
  bundle.scene.settings.postprocessing.exposure = 1;
  bundle.scene.settings.fog.enabled = false;
  return { bundle, mesh, material };
}
function compile(bundle, outputMode) {
  return compileVisualProject({ project: bundle.project, scenes: { [bundle.scene.sceneId]: bundle.scene }, assets: bundle.assets, prefabs: bundle.prefabs }, { outputMode });
}

test("one profile validator bounds triangulation and rejects intersecting, repeated or unsupported contours", () => {
  const valid = [profile, { ...profile, points: profile.points.toReversed() }, { points: [[0, 0], [1, 0], [2, 0], [2, 1], [0, 1]], depth: 1 }];
  for (const value of valid) assert.equal(profileModule.validateXriftExtrudeProfile(value), null);
  const invalid = [
    { ...profile, points: [[0, 0], [2, 2], [0, 2], [2, 0]] },
    { ...profile, points: [[0, 0], [2, 0], [1, 0], [1, 2], [0, 2]] },
    { ...profile, points: [...profile.points, profile.points[0]] },
    { ...profile, points: [[0, 0], [2, 0], [1, 0]] },
    { ...profile, points: [[0, 0], [2, 0], [1, Infinity]] },
    { ...profile, points: Array.from({ length: 129 }, (_, i) => [Math.cos(i), Math.sin(i)]) },
    { ...profile, points: [[0, 0], [1001, 0], [0, 1]] },
    ...[0, Infinity, -1, 1001].map(depth => ({ ...profile, depth })),
    { ...profile, bevelEnabled: true }, { ...profile, holes: [] }, { ...profile, steps: 1000 },
  ];
  for (const value of invalid) {
    assert.notEqual(profileModule.validateXriftExtrudeProfile(value), null, JSON.stringify(value));
    assert.throws(() => createXriftExtrudeGeometry(value), /Extrude/);
  }
});

test("concave extrusion has the authored bounds, UVs and volume and owns copied source points", () => {
  const geometry = createXriftExtrudeGeometry(profile);
  try {
    geometry.computeBoundingBox();
    assert.deepEqual(geometry.boundingBox.min.toArray(), [0, 0, 0]);
    assert(Math.abs(geometry.boundingBox.max.z - profile.depth) < 1e-6);
    assert.deepEqual(geometry.boundingBox.max.toArray().slice(0, 2), [2, 2]);
    const positions = geometry.getAttribute("position");
    assert.equal(positions.count, 60);
    assert.equal(geometry.getAttribute("uv").count, positions.count);
    assert.equal(geometry.getAttribute("normal").count, positions.count);
    let volume = 0;
    for (let i = 0; i < positions.count; i += 3) {
      const a = [positions.getX(i), positions.getY(i), positions.getZ(i)];
      const b = [positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1)];
      const c = [positions.getX(i + 2), positions.getY(i + 2), positions.getZ(i + 2)];
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    assert(Math.abs(volume - 1.8) < 1e-6, `volume=${volume}`);
    assert.equal(profileModule.estimateXriftExtrudeGeometryBytes(profile), positions.array.byteLength + geometry.getAttribute("normal").array.byteLength + geometry.getAttribute("uv").array.byteLength);
  } finally { geometry.dispose(); }
  const { bundle, mesh } = specimen();
  assert.notEqual(mesh.geometry.extrude.points, profile.points);
  assert.deepEqual(sceneModule.getColliderAutoFitBounds(mesh, bundle.assets), { center: [1, 1, 0.3], halfExtents: [1, 1, 0.3] });
  assert(estimateWorldVram(bundle).contributions.some(entry => entry.assetId.startsWith("extrude:") && entry.estimatedBytes > 0));
});

test("saved Scene, JSX publication and runtime publication reject the same invalid profile", () => {
  const { bundle, mesh } = specimen();
  const json = sceneDocumentCodec.serialize(bundle.scene);
  assert.equal(sceneDocumentCodec.parse(json).ok, true, JSON.stringify(sceneDocumentCodec.parse(json)));
  mesh.geometry.extrude.points[2] = [0, 0];
  const parsed = sceneDocumentCodec.parse(sceneDocumentCodec.serialize(bundle.scene));
  assert.equal(parsed.ok, false);
  assert(parsed.issues.some(issue => issue.message.includes("repeat")));
  for (const mode of ["classic-jsx", "classic-runtime"]) {
    const result = compile(bundle, mode);
    assert.equal(result.canStage, false);
    assert(result.diagnostics.some(issue => issue.severity === "blocking" && issue.code === "extrude-profile-invalid"));
  }
});

test("real compiler outputs preserve geometry, material and mesh collider and prepare GPU artifacts", async () => {
  const { bundle, mesh, material } = specimen();
  const jsx = compile(bundle, "classic-jsx");
  const runtime = compile(bundle, "classic-runtime");
  assert.equal(jsx.canStage, true, JSON.stringify(jsx.diagnostics));
  assert.equal(runtime.canStage, true, JSON.stringify(runtime.diagnostics));
  const manifest = JSON.parse(runtime.runtimeManifestFile.content);
  assert.equal(isXriftRuntimeManifest(manifest), true);
  const loaded = await new XriftThreeLoader().load(manifest);
  try {
    const meshes = [];
    loaded.root.traverse(object => { if (object.isMesh) meshes.push(object); });
    assert.equal(meshes.length, 1);
    assert.equal(meshes[0].material.type, "MeshBasicMaterial", "Runtime must preserve KHR_materials_unlit instead of requiring a light");
    assert.equal(meshes[0].material.color.getHexString(), "3b82f6", "Authored Extrude must use the same display colour as Edit and JSX, independently of Model linear factors");
    assert.equal(meshes[0].geometry.type, "ExtrudeGeometry");
  } finally { disposeXriftLoadResult(loaded); }
  const components = manifest.scenes[manifest.entryScene].entities["extrude-specimen"].components;
  assert.deepEqual(components.find(component => component.type === "mesh").geometry, { kind: "extrude", ...profile });
  assert.equal(components.find(component => component.type === "collider").meshMode, "trimesh");
  const worldFile = jsx.overlayFiles.find(file => file.relativePath === "src/World.tsx");
  assert(worldFile, JSON.stringify(jsx.overlayFiles.map(file => file.relativePath)));
  const worldSource = worldFile.content;
  assert(worldSource.includes("XriftExtrudeGeometry"));
  assert(worldSource.includes('type="trimesh"'));
  for (const name of ["primitive-geometry.tsx", "extrude-geometry.ts", "extrude-profile.ts"]) assert(jsx.overlayFiles.some(file => file.relativePath === `src/xrift-studio/${name}`));
  const invalidManifest = structuredClone(manifest);
  invalidManifest.scenes[manifest.entryScene].entities["extrude-specimen"].components.find(component => component.type === "mesh").geometry.points.push([0, 0]);
  assert.equal(isXriftRuntimeManifest(invalidManifest), false);
  const output = path.resolve("node_modules/.cache/xrift-studio/extrude-render-parity");
  for (const file of jsx.overlayFiles) {
    const target = path.resolve(output, file.relativePath);
    const relative = path.relative(output, target);
    assert(!path.isAbsolute(relative) && !relative.startsWith(".."), "Compiler output must remain in the owned fixture directory");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
  await writeFile(path.join(output, "fixture.json"), JSON.stringify({ manifest, mesh, material, assets: bundle.assets }), "utf8");
});
