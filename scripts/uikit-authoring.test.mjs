import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { Mesh, MeshBasicMaterial, Raycaster, Vector3, DoubleSide } from "three";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.cache/vite-uikit-authoring-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
test.after(() => server.close());
const load = name => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
const { createTextPanelPlateGeometry } = await server.ssrLoadModule("/packages/xrift-studio-runtime/src/text-panel.ts");
const { createPrototypeProject } = await load("prototype-project");
const { createEmptyEntity, addEditorComponent } = await load("editor-session");
const { updateTextComponent } = await load("scene-document");
const { sceneDocumentCodec } = await load("serialization");
const { compileVisualProject } = await load("compiler/compile");
const { createScriptAsset } = await load("scripting/script-files");
const { createScriptComponent } = await load("scene-document");
const { getScriptTemplate, createScriptTemplateSource } = await load("scripting/script-templates");
const { runScriptTemplateFixtureAssertions } = await load("scripting/script-templates.fixture");
const { isAllowedScriptSpecifier } = await load("scripting/specifiers");
const { COMPILER_UIKIT_PACKAGE_SPECS } = await load("compiler/runtime-packages");
const { isAllowedCompilerRuntimePackage } = await server.ssrLoadModule("/src/lib/xrift-cli.ts");

test("rounded Text plates have real cut-out corners, stable UVs and a clamped physical radius", () => {
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const hit = (geometry, x, y) => {
    const mesh = new Mesh(geometry, material);
    mesh.scale.set(2, 1, 1); mesh.updateMatrixWorld();
    return new Raycaster(new Vector3(x, y, 1), new Vector3(0, 0, -1)).intersectObject(mesh).length > 0;
  };
  for (const radius of [0, 0.2, 100]) {
    const geometry = createTextPanelPlateGeometry(2, 1, radius);
    assert.equal(hit(geometry, 0, 0), true);
    assert.equal(hit(geometry, 0.99, 0.49), radius === 0);
    const uv = geometry.getAttribute("uv");
    for (let index = 0; index < uv.count; index++) for (const value of [uv.getX(index), uv.getY(index)]) assert.ok(value >= -0.0001 && value <= 1.0001);
    geometry.dispose();
  }
  material.dispose();
});

test("Border Radius survives Inspector-style patches, serialization and published source", () => {
  let bundle = createPrototypeProject("world", "rounded-isolated-fixture");
  const empty = createEmptyEntity(bundle.scene, null, "Rounded Text");
  const added = addEditorComponent(empty.scene, bundle.assets, empty.entityId, "core.text.panel", "world");
  const scene = updateTextComponent(added.scene, empty.entityId, { background: { borderRadius: 0.14 } });
  assert.equal(updateTextComponent(scene, empty.entityId, { background: { borderRadius: -1 } }), scene);
  assert.equal(updateTextComponent(scene, empty.entityId, { background: { borderRadius: Infinity } }), scene);
  const decoded = sceneDocumentCodec.parse(sceneDocumentCodec.serialize(scene));
  assert.equal(decoded.ok, true);
  assert.equal(decoded.document.entities[empty.entityId].components.find(component => component.type === "text").background.borderRadius, 0.14);
  const compiled = compileVisualProject({ project: bundle.project, scenes: { [scene.sceneId]: decoded.document }, assets: bundle.assets, prefabs: bundle.prefabs });
  assert.equal(compiled.canStage, true, JSON.stringify(compiled.diagnostics));
  assert.ok(compiled.overlayFiles.find(file => file.relativePath === "src/World.tsx").content.includes('"borderRadius":0.14'));
  assert.ok(compiled.overlayFiles.some(file => file.content.includes("createTextPanelPlateGeometry")));
});

test("UIKit is an allowed real Script module and publishes the template with matching dependencies", () => {
  runScriptTemplateFixtureAssertions();
  for (const name of ["@react-three/uikit", "@pmndrs/uikit"]) assert.equal(isAllowedScriptSpecifier(name), true);
  assert.equal(isAllowedScriptSpecifier("@react-three/uikit-other"), false);
  const bundle = createPrototypeProject("world", "uikit-isolated-fixture");
  const empty = createEmptyEntity(bundle.scene, null, "UIKit");
  const script = createScriptAsset("script-uikit", "UIKit Panel", "scripts/uikit-panel.tsx", null, "tsx");
  assert.ok(script);
  const component = createScriptComponent("component-uikit", script.id);
  const scene = { ...empty.scene, entities: { ...empty.scene.entities, [empty.entityId]: { ...empty.scene.entities[empty.entityId], components: [...empty.scene.entities[empty.entityId].components, component] } } };
  const source = createScriptTemplateSource("uikit-panel", "UIKit Panel");
  const documents = { project: bundle.project, scenes: { [scene.sceneId]: scene }, assets: { ...bundle.assets, assets: { ...bundle.assets.assets, [script.id]: script } }, prefabs: bundle.prefabs, scriptSources: { [script.id]: source } };
  const compiled = compileVisualProject(documents);
  assert.equal(compiled.canStage, true, JSON.stringify(compiled.diagnostics));
  for (const spec of COMPILER_UIKIT_PACKAGE_SPECS) {
    assert.ok(compiled.stagingPlan.runtimePackageSpecs.includes(spec));
    assert.ok(isAllowedCompilerRuntimePackage(spec));
  }
  assert.ok(compiled.overlayFiles.some(file => file.relativePath.startsWith("src/scripts/") && file.content.includes('from "@react-three/uikit"')));
  const unused = compileVisualProject({ ...documents, scenes: { [empty.scene.sceneId]: empty.scene } });
  assert.ok(COMPILER_UIKIT_PACKAGE_SPECS.every(spec => !unused.stagingPlan.runtimePackageSpecs.includes(spec)));
});
