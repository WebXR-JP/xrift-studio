import { normalizeMaterialProperties, normalizeTextureImportSettings, DEFAULT_MODEL_IMPORT_SETTINGS, type InteractivityAsset, type ModelAsset, type PrefabAsset, type ScriptAsset } from "./asset-manifest";
import { createHierarchyTransfer, getHierarchyClipboard, hierarchySelectionRoots, hierarchyTransferMetadata, HIERARCHY_TRANSFER_MANIFEST, planHierarchyImport, prepareHierarchyTransferFiles, readHierarchyTransferWarnings, setHierarchyClipboard, type PreparedHierarchyTransfer } from "./hierarchy-transfer";
import { applyHierarchyImportPlan } from "./hierarchy-transfer-commit";
import { hierarchyMatrixTransform, hierarchyTransformMatrix, hierarchyWorldMatrix, identityHierarchyMatrix, inverseHierarchyMatrix, multiplyHierarchyMatrices } from "./hierarchy-transform";
import { commitEditorHistory, createEditorHistory, redoEditorHistory, undoEditorHistory } from "./editor-history";
import type { PrototypeVisualProject } from "./prototype-project";
import type { SceneEntity, ScriptComponent, TransformComponent, Vec3 } from "./scene-document";

function entity(id: string, parentId: string | null = null, position: Vec3 = [0, 0, 0]): SceneEntity {
  return { id, name: id, parentId, children: [], enabled: true, components: [{ id: "transform", type: "transform", enabled: true, position, rotation: [0, 0, 0], scale: [1, 1, 1] }] };
}
function project(kind: "world" | "item" = "world"): PrototypeVisualProject {
  const root = entity("root", null, [10, 0, 0]);
  const child = entity("child", "root", [2, 0, 0]);
  root.children = [child.id];
  return {
    project: { schemaVersion: "0.1.0", projectId: `project-${kind}`, projectKind: kind, metadata: { name: "sample", title: "サンプル", description: "説明", createdAt: "2026-09-14T00:00:00.000Z", updatedAt: "2026-09-14T00:00:00.000Z" }, entrySceneId: "scene", scenePaths: { scene: "scenes/scene.scene.json" }, assetManifestPath: "assets/manifest.json", lastPublication: { uploadedAt: "2026-09-14T00:00:00.000Z", worldId: "do-not-transfer" } },
    scene: { schemaVersion: "0.1.0", sceneId: "scene", name: "Scene", rootEntityIds: [root.id], entities: { root, child } },
    assets: { schemaVersion: "0.1.0", assets: {} }, prefabs: {},
  };
}
function model(id = "model", relativePath = "assets/model.glb"): ModelAsset {
  return { id, name: id, kind: "model", status: "ready", source: { kind: "project", relativePath }, importSettings: { ...DEFAULT_MODEL_IMPORT_SETTINGS }, materialSlots: [] };
}
function attachMesh(source: PrototypeVisualProject, owner = "child", modelId = "model", materialId?: string): void {
  source.scene.entities[owner].components.push({ id: "mesh", type: "mesh", enabled: true, geometryAssetId: modelId, geometry: { kind: "asset", assetId: modelId }, materialBindings: materialId ? [{ slot: "default", materialAssetId: materialId }] : [], castShadow: true, receiveShadow: true });
}
function transform(value: SceneEntity): TransformComponent { return value.components.find((component): component is TransformComponent => component.type === "transform")!; }
const bytes = (value: string) => new TextEncoder().encode(value);
const noFiles = async (): Promise<Uint8Array> => { throw new Error("Unexpected file read"); };

/** Registered in cli/convert.fixture.mjs; all business logic runs without a renderer. */
export async function runHierarchyTransferFixtureAssertions(): Promise<{ cases: number; assertions: number }> {
  let assertions = 0;
  const assert = (condition: unknown, message: string): void => { assertions++; if (!condition) throw new Error(`Hierarchy transfer: ${message}`); };
  const equal = (left: unknown, right: unknown, message: string) => assert(JSON.stringify(left) === JSON.stringify(right), message);
  const near = (left: readonly number[], right: readonly number[], message: string) => assert(left.length === right.length && left.every((value, index) => Math.abs(value - right[index]) < 1e-6), message);
  const throws = (run: () => unknown, message: string) => { let caught = false; try { run(); } catch { caught = true; } assert(caught, message); };
  const rejects = async (run: () => Promise<unknown>, message: string) => { let caught = false; try { await run(); } catch { caught = true; } assert(caught, message); };
  const tests: [string, () => void | Promise<void>][] = [];
  const test = (name: string, run: () => void | Promise<void>) => tests.push([name, run]);

  test("selection and world coordinates", () => {
    const source = project(); const before = JSON.stringify(source);
    equal(hierarchySelectionRoots(source.scene, ["child", "root", "child"]), ["root"], "ancestor selected only once");
    const transfer = createHierarchyTransfer(source, ["child"]);
    equal(transfer.bundle.scene.rootEntityIds, ["child"], "subtree only");
    equal(transform(transfer.bundle.scene.entities.child).position, [12, 0, 0], "nested world position");
    assert(transfer.bundle.scene.entities.child.parentId === null, "fragment root detached");
    assert(!transfer.bundle.scene.entities.root, "unselected parent excluded");
    assert(!transfer.bundle.project.lastPublication && !transfer.bundle.scene.settings, "no publication or scene settings");
    assert(transfer.bundle.project.projectId !== source.project.projectId, "standalone project identity");
    equal(source, JSON.parse(before), "source unchanged");
  });
  test("local and origin modes", () => {
    const source = project();
    near(transform(createHierarchyTransfer(source, ["child"], "local").bundle.scene.entities.child).position, [2, 0, 0], "local position");
    near(transform(createHierarchyTransfer(source, ["child"], "origin").bundle.scene.entities.child).position, [0, 0, 0], "origin position");
    source.scene.entities.other = entity("other", null, [22, 3, 0]); source.scene.rootEntityIds.push("other");
    const result = createHierarchyTransfer(source, ["child", "other"], "origin");
    near(transform(result.bundle.scene.entities.other).position, [10, 3, 0], "relative positions retained");
  });
  test("matrix round trips and inversion", () => {
    for (let index = 0; index < 100; index++) {
      const t = { position: [index / 7, -index, 3] as Vec3, rotation: [index / 13, index / 17, index / 11] as Vec3, scale: [index % 2 ? -2 : 2, 3, 4] as Vec3 };
      const m = hierarchyTransformMatrix(t);
      near(multiplyHierarchyMatrices(inverseHierarchyMatrix(m), m), identityHierarchyMatrix(), "matrix inverse");
      near(hierarchyTransformMatrix(hierarchyMatrixTransform(m)), m, "TRS recomposition");
    }
  });
  test("shear and singular transforms fail without damage", () => {
    const source = project(); transform(source.scene.entities.root).scale = [2, 1, 1]; transform(source.scene.entities.child).rotation = [0, 0, Math.PI / 4];
    throws(() => createHierarchyTransfer(source, ["child"]), "shear rejected");
    assert(createHierarchyTransfer(source, ["child"], "local").bundle.scene.entities.child, "local fallback available");
    transform(source.scene.entities.root).scale = [0, 1, 1];
    throws(() => inverseHierarchyMatrix(hierarchyWorldMatrix(source.scene, "root")), "singular parent rejected");
  });
  test("invalid hierarchy is rejected", () => {
    const source = project();
    throws(() => createHierarchyTransfer(source, []), "empty selection");
    throws(() => createHierarchyTransfer(source, ["missing"]), "unknown entity");
    source.scene.entities.root.parentId = "child";
    throws(() => hierarchySelectionRoots(source.scene, ["root", "child"]), "cycle even when all selected");
    source.scene.entities.root.parentId = null; source.scene.entities.root.children.push("missing");
    throws(() => createHierarchyTransfer(source, ["root"]), "missing descendant");
  });
  test("asset dependency closure and immutable source", async () => {
    const source = project();
    source.assets.assets.model = model(); attachMesh(source, "child", "model", "material");
    source.assets.assets.material = { id: "material", name: "material", kind: "material", status: "ready", source: { kind: "document" }, properties: normalizeMaterialProperties({ baseColorTextureId: "texture" }), folderId: "nested" };
    source.assets.assets.texture = { id: "texture", name: "texture", kind: "texture", status: "ready", source: { kind: "project", relativePath: "assets/texture.png" }, importSettings: normalizeTextureImportSettings(), thumbnail: { status: "generated", derivedPath: "assets/missing-thumbnail.png", sourceHash: "old", rendererVersion: "old" } };
    source.assets.assets.unused = model("unused", "assets/unused.glb");
    source.assets.folders = { parent: { id: "parent", name: "素材", parentId: null, order: 0 }, nested: { id: "nested", name: "車", parentId: "parent", order: 0 } };
    const before = JSON.stringify(source);
    const prepared = await prepareHierarchyTransferFiles(createHierarchyTransfer(source, ["child"]), async (path) => bytes(path));
    equal(Object.keys(prepared.bundle.assets.assets).sort(), ["material", "model", "texture"], "transitive material texture closure");
    equal([...prepared.files.keys()].sort(), ["assets/model.glb", "assets/texture.png"], "exclude unused files and thumbnail caches");
    equal(Object.keys(prepared.bundle.assets.folders!).sort(), ["nested", "parent"], "folder ancestry retained");
    equal(source, JSON.parse(before), "asset collection leaves source unchanged");
    const target = project("item"); target.assets.assets.model = model("model", "assets/old.glb");
    const plan = planHierarchyImport(target, prepared);
    assert(plan.bundle.assets.assets.model === target.assets.assets.model, "ID collision does not overwrite target asset");
    assert(plan.assetIdMap.model !== "model", "fresh Asset IDs");
    const material = plan.bundle.assets.assets[plan.assetIdMap.material];
    assert(material.kind === "material", "material retained");
    if (material.kind === "material") equal(material.properties.pbrMetallicRoughness.baseColorTexture?.textureAssetId, plan.assetIdMap.texture, "nested texture remapped");
    assert([...plan.files.keys()].every((path) => path.startsWith("assets/imported/hierarchy-")), "fresh managed paths");
    const importedModel = plan.bundle.assets.assets[plan.assetIdMap.model];
    assert(importedModel.source.kind === "project" && plan.files.has(importedModel.source.relativePath), "asset files rebased");
  });
  test("missing assets fail before changing destination", async () => {
    const source = project(); attachMesh(source);
    throws(() => createHierarchyTransfer(source, ["child"]), "missing Asset");
    source.assets.assets.model = model(); source.assets.assets.model.status = "missing";
    throws(() => createHierarchyTransfer(source, ["child"]), "unready Asset");
    source.assets.assets.model.status = "ready";
    await rejects(() => prepareHierarchyTransferFiles(createHierarchyTransfer(source, ["child"]), noFiles), "missing bytes");
    await rejects(() => prepareHierarchyTransferFiles(createHierarchyTransfer(source, ["child"]), async () => new Uint8Array()), "empty bytes");
  });
  test("glTF and OBJ sidecars remain project relative", async () => {
    const source = project(); source.assets.assets.model = model("model", "assets/car/car.gltf"); attachMesh(source);
    const data = new Map([["assets/car/car.gltf", bytes(JSON.stringify({ buffers: [{ uri: "mesh.bin" }], images: [{ uri: "../paint.png" }, { uri: "data:image/png;base64,AA==" }] }))], ["assets/car/mesh.bin", bytes("mesh")], ["assets/paint.png", bytes("png")]]);
    const prepared = await prepareHierarchyTransferFiles(createHierarchyTransfer(source, ["child"]), async (path) => { const result = data.get(path); if (!result) throw Error(path); return result; });
    equal(prepared.files.size, 3, "glTF buffers and images included");
    const plan = planHierarchyImport(project("item"), prepared);
    const paths = [...plan.files.keys()];
    assert(paths.some((path) => path.endsWith("/assets/car/mesh.bin")) && paths.some((path) => path.endsWith("/assets/paint.png")), "relative structure preserved");
    source.assets.assets.model = model("model", "assets/car.obj");
    const obj = new Map([["assets/car.obj", bytes("mtllib car.mtl\nv 0 0 0")], ["assets/car.mtl", bytes("newmtl paint\nmap_Kd paint.png")], ["assets/paint.png", bytes("png")]]);
    const converted = await prepareHierarchyTransferFiles(createHierarchyTransfer(source, ["child"]), async (path) => obj.get(path)!);
    equal(converted.files.size, 3, "OBJ/MTL texture closure");
  });
  test("archive dependency traversal and remote sources rejected", async () => {
    const source = project(); source.assets.assets.model = model("model", "assets/car.gltf"); attachMesh(source);
    for (const uri of ["../../outside.bin", "https://example.invalid/image.png", "/private/image.png", "..%2F..%2Foutside.bin"]) {
      await rejects(() => prepareHierarchyTransferFiles(createHierarchyTransfer(source, ["child"]), async () => bytes(JSON.stringify({ images: [{ uri }] }))), `reject ${uri}`);
    }
  });
  test("world and item round trip with atomic history", async () => {
    const source = project(); const target = project("item"); const previousRoot = target.scene.entities.root;
    const prepared = await prepareHierarchyTransferFiles(createHierarchyTransfer(source, ["child"]), noFiles);
    const plan = planHierarchyImport(target, prepared, { parentId: "root", placement: "world" });
    const imported = plan.bundle.scene.entities[plan.rootEntityIds[0]];
    near(transform(imported).position, [2, 0, 0], "world to local under destination parent");
    near(hierarchyWorldMatrix(plan.bundle.scene, imported.id).slice(12, 15), [12, 0, 0], "world position retained at destination");
    assert(plan.bundle.project.projectKind === "item" && plan.bundle.project.projectId === target.project.projectId, "destination kind and identity retained");
    assert(plan.bundle.project.lastPublication === target.project.lastPublication, "destination publication retained");
    assert(plan.bundle.scene.entities.child === target.scene.entities.child, "untouched Entity identity retained");
    assert(plan.bundle.scene.entities.root !== previousRoot && previousRoot.children.length === 1, "parent updated immutably");
    const history = commitEditorHistory(createEditorHistory(target), plan.bundle);
    equal(history.past.length, 1, "one Undo entry");
    const undone = undoEditorHistory(history).history;
    assert(undone.present === target, "Undo restores scene and assets together");
    assert(redoEditorHistory(undone).history.present === plan.bundle, "Redo restores imported bundle");
    const returnTransfer = await prepareHierarchyTransferFiles(createHierarchyTransfer(plan.bundle, plan.rootEntityIds), noFiles);
    const worldAgain = planHierarchyImport(source, returnTransfer);
    assert(worldAgain.bundle.project.projectKind === "world", "item to world supported");
    assert(worldAgain.rootEntityIds[0] !== imported.id, "second import gets different IDs");
  });
  test("script refs, property ordering and literal text", async () => {
    const source = project(); const script: ScriptAsset = { id: "script", name: "Script", kind: "script", status: "ready", source: { kind: "project", relativePath: "assets/script.ts" }, contractVersion: "1.0.0", language: "ts" };
    source.assets.assets.script = script;
    const component: ScriptComponent = { id: "script-component", type: "script", enabled: true, scriptAssetId: "script", contractVersion: "1.0.0", entityReferences: ["child"], assetReferences: ["script"], properties: { destination: "child", targetEntityId: "child", codeAsset: "script", text: "child" }, runIn: "play-and-edit" };
    source.scene.entities.root.components.push(component);
    const prepared = await prepareHierarchyTransferFiles(createHierarchyTransfer(source, ["root"]), async () => bytes('const literal = "child";'));
    const plan = planHierarchyImport(project("item"), prepared);
    const result = plan.bundle.scene.entities[plan.entityIdMap.root].components.find((item): item is ScriptComponent => item.type === "script")!;
    equal(result.entityReferences, [plan.entityIdMap.child], "declared references remapped");
    equal(result.properties.destination, plan.entityIdMap.child, "arbitrary declared property remapped after array");
    equal(result.properties.targetEntityId, plan.entityIdMap.child, "typed nested references not cleared by second traversal");
    equal(result.properties.codeAsset, plan.assetIdMap.script, "declared asset property remapped");
    equal(result.properties.text, "child", "text not replaced");
    equal(result.runIn, "play", "Edit script cannot execute on import");
    equal(prepared.bundle.scene.entities.root.components.find((component) => component.type === "script")?.runIn, "play", "standalone exported project also disables Edit execution");
    equal(source.scene.entities.root.components.find((component) => component.type === "script")?.runIn, "play-and-edit", "source Script mode is unchanged");
    equal(new TextDecoder().decode([...plan.files.values()][0]), 'const literal = "child";', "raw code unchanged");
  });
  test("external references cannot accidentally attach to destination IDs", async () => {
    const source = project();
    source.scene.entities.child.components.push({ id: "trigger", type: "xrift-component", enabled: true, schemaId: "xrift.interactable", schemaVersion: "1.0.0", entityReferences: ["root"], assetReferences: [], properties: { target: "root" } });
    const prepared = await prepareHierarchyTransferFiles(createHierarchyTransfer(source, ["child"]), noFiles);
    assert(prepared.warnings.length > 0, "warning returned");
    const plan = planHierarchyImport(project("item"), prepared);
    const component = plan.bundle.scene.entities[plan.rootEntityIds[0]].components.find((entry) => entry.type === "xrift-component")!;
    assert(!component.enabled, "component disabled when referenced Entity omitted");
    if (component.type === "xrift-component") { equal(component.entityReferences, [], "dangling ID removed"); equal(component.properties.target, "", "dangling property removed"); }
  });
  test("graph refs scope Component IDs by target Entity", async () => {
    const source = project();
    const graph: InteractivityAsset = { id: "graph", name: "Graph", kind: "interactivity", status: "ready", source: { kind: "document" }, extensionName: "KHR_interactivity", specStatus: "release-candidate-2026-07-16", extension: { graphs: [{ declarations: [{ op: "event/onStart" }], nodes: [{ declaration: 0, configuration: { entity: { value: ["child"] }, component: { value: ["transform"] }, text: { value: ["child"] } } }, { declaration: 0, configuration: { entity: { value: ["__xrift_scene__"] } } }] }] } };
    source.assets.assets.graph = graph;
    source.scene.entities.root.components.push({ id: "trigger", type: "interaction-trigger", enabled: true, interactivityAssetId: "graph", entityReferences: ["child"], assetReferences: [] });
    const prepared = await prepareHierarchyTransferFiles(createHierarchyTransfer(source, ["root"]), noFiles);
    const plan = planHierarchyImport(project("item"), prepared);
    const result = plan.bundle.assets.assets[plan.assetIdMap.graph] as InteractivityAsset;
    const configs = result.extension.graphs[0].nodes!.map((node) => node.configuration!);
    equal(configs[0].entity.value, [plan.entityIdMap.child], "graph target remapped");
    equal(configs[0].component.value, [transform(plan.bundle.scene.entities[plan.entityIdMap.child]).id], "Component ID belongs to child, not parent with same original ID");
    equal(configs[0].text.value, ["child"], "graph text unchanged");
    equal(configs[1].entity.value, ["__xrift_scene__"], "scene sentinel preserved");
  });
  test("metadata and legacy package compatibility", () => {
    const transfer = createHierarchyTransfer(project(), ["root"]); transfer.warnings.push("注意");
    equal(readHierarchyTransferWarnings(new Map()), [], "legacy package has no marker");
    equal(readHierarchyTransferWarnings(new Map([[HIERARCHY_TRANSFER_MANIFEST, hierarchyTransferMetadata(transfer)]])), ["注意"], "warnings round trip");
    throws(() => readHierarchyTransferWarnings(new Map([[HIERARCHY_TRANSFER_MANIFEST, bytes('{"format":"xrift-studio-hierarchy","formatVersion":999,"warnings":[]}')]])), "future format rejected");
  });
  test("clipboard survives project replacement without source paths", async () => {
    const before = getHierarchyClipboard();
    try {
      const prepared = await prepareHierarchyTransferFiles(createHierarchyTransfer(project(), ["child"]), noFiles);
      setHierarchyClipboard(prepared);
      const target = project("item");
      assert(getHierarchyClipboard() === prepared, "module-scoped snapshot retained");
      assert(planHierarchyImport(target, getHierarchyClipboard()!).rootEntityIds.length === 1, "paste into another project");
    } finally { setHierarchyClipboard(before); }
  });
  test("Prefab snapshots include resolved children", () => {
    const source = project();
    const prefabRoot = entity("prefab-root"); const nested = entity("prefab-child", "prefab-root"); prefabRoot.children = [nested.id];
    const prefab: PrefabAsset = { id: "prefab", name: "Prefab", kind: "template", status: "ready", source: { kind: "project", relativePath: "prefabs/sample.prefab.json" }, templateType: "prefab", templatePath: "prefabs/sample.prefab.json", prefabPath: "prefabs/sample.prefab.json" };
    source.assets.assets.prefab = prefab;
    source.prefabs.sample = { schemaVersion: "0.1.0", prefabId: "sample", name: "Sample", source: { sceneId: "old-scene", rootEntityIds: [prefabRoot.id] }, rootEntityIds: [prefabRoot.id], entities: { [prefabRoot.id]: prefabRoot, [nested.id]: nested } };
    source.scene.entities.child.components.push({ id: "instance", type: "prefab-instance", enabled: true, prefabAssetId: "prefab", sourceEntityId: "prefab-root" });
    const result = createHierarchyTransfer(source, ["child"]);
    assert(Object.keys(result.bundle.scene.entities).length > 1, "expanded child retained");
    assert(!Object.values(result.bundle.scene.entities).some((entry) => entry.components.some((component) => component.type === "prefab-instance")), "source dependency detached");
    assert(result.warnings.some((message) => message.includes("Prefab")), "snapshot semantics disclosed");
    source.scene.entities.child.enabled = false;
    throws(() => createHierarchyTransfer(source, ["child"]), "disabled Prefab is never silently lost");
  });
  test("world-only components retained disabled in item", async () => {
    const source = project(); source.scene.entities.child.components.push({ id: "world-only", type: "xrift-component", enabled: true, schemaId: "xrift.spawn-point", schemaVersion: "1.0.0", properties: {}, entityReferences: [], assetReferences: [] });
    source.scene.entities.child.components.push({ id: "spawn", type: "spawn-point", enabled: true, target: "player" });
    const prepared = await prepareHierarchyTransferFiles(createHierarchyTransfer(source, ["child"]), noFiles);
    const plan = planHierarchyImport(project("item"), prepared);
    const components = plan.bundle.scene.entities[plan.rootEntityIds[0]].components;
    assert(components.some((entry) => entry.type === "xrift-component" && !entry.enabled), "unsupported world component disabled");
    assert(components.some((entry) => entry.type === "spawn-point" && entry.target === "item-preview"), "editor Spawn Point converted");
  });
  test("file transaction failure and stale revision cannot commit documents", async () => {
    const source = project(); source.assets.assets.model = model(); attachMesh(source);
    const prepared = await prepareHierarchyTransferFiles(createHierarchyTransfer(source, ["child"]), async () => bytes("model"));
    const plan = planHierarchyImport(project("item"), prepared);
    let commits = 0; let writes = 0; let current = true;
    await rejects(() => applyHierarchyImportPlan(plan, { isCurrent: () => true, writeFiles: async () => { writes++; throw Error("disk full"); }, commitDocuments: () => { commits++; } }), "failed write rejected");
    equal([commits, writes], [0, 1], "no partial scene after IO failure");
    await rejects(() => applyHierarchyImportPlan(plan, { isCurrent: () => false, writeFiles: async () => { writes++; }, commitDocuments: () => { commits++; } }), "already-stale import rejected");
    equal(writes, 1, "no IO when already stale");
    await rejects(() => applyHierarchyImportPlan(plan, { isCurrent: () => current, writeFiles: async () => { current = false; }, commitDocuments: () => { commits++; } }), "mid-write project switch rejected");
    equal(commits, 0, "old project never commits into new one");
    await applyHierarchyImportPlan(plan, { isCurrent: () => true, writeFiles: async (files) => { assert(files.size === 1, "one batch"); }, commitDocuments: () => { commits++; } });
    equal(commits, 1, "single document commit after successful batch");
  });
  test("managed-path validation precedes write", async () => {
    const prepared: PreparedHierarchyTransfer = { ...createHierarchyTransfer(project(), ["child"]), files: new Map() };
    const plan = planHierarchyImport(project("item"), prepared);
    plan.files.set("../../outside", bytes("no"));
    let writes = 0;
    await rejects(() => applyHierarchyImportPlan(plan, { isCurrent: () => true, writeFiles: async () => { writes++; }, commitDocuments: () => { throw Error("unreachable"); } }), "unsafe destination rejected");
    equal(writes, 0, "no IO for unsafe path");
  });
  test("deep ordinary hierarchies do not use recursive prefab traversal", () => {
    const source = project(); source.scene.entities = {}; source.scene.rootEntityIds = ["e0"];
    for (let index = 0; index < 1500; index++) { const item = entity(`e${index}`, index ? `e${index - 1}` : null); if (index < 1499) item.children = [`e${index + 1}`]; source.scene.entities[item.id] = item; }
    const result = createHierarchyTransfer(source, Object.keys(source.scene.entities));
    equal(Object.keys(result.bundle.scene.entities).length, 1500, "deep hierarchy transferred without duplicate roots");
    equal(result.bundle.scene.rootEntityIds, ["e0"], "one true root");
  });

  for (const [name, run] of tests) {
    try { await run(); }
    catch (error) { throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return { cases: tests.length, assertions };
}
