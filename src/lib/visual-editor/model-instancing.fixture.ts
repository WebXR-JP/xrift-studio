import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Raycaster, Vector3 } from "three";
import { createModelInstancing } from "../../../packages/xrift-studio-runtime/src/model-instancing";
import { createPrototypeProject } from "./prototype-project";
import { collectModelInstancingEntities, countRepeatedModelMeshes } from "./model-instancing";
import { type ModelAsset, updateModelAsset } from "./asset-manifest";
import { createTransformComponent, createScriptComponent, createRigidBodyComponent, type MeshComponent } from "./scene-document";
import { compileVisualProject } from "./compiler/compile";
import { applyAssetOptimizations } from "./asset-optimization";

export async function runModelInstancingFixtureAssertions(): Promise<void> {
  const root = new Group();
  root.position.set(10, 0, 0);
  const geometry = new BoxGeometry();
  const material = new MeshStandardMaterial({ color: "red" });
  const sources: Mesh[] = [];
  for (let index = 0; index < 6; index++) {
    const owner = new Group(); owner.userData.xriftEntityId = `entity-${index}`;
    owner.position.x = index;
    const mesh = new Mesh(geometry, material.clone());
    owner.add(mesh); root.add(owner); sources.push(mesh);
  }
  sources[2].material = new MeshStandardMaterial({ color: "blue" });
  sources[3].material = new MeshStandardMaterial({ transparent: true });
  sources[4].scale.x = -1;
  sources[5].visible = false;
  const manager = createModelInstancing(root, sources.map((_, i) => `entity-${i}`), "xriftEntityId");
  manager.update();
  assert(manager.batchCount === 1 && manager.instanceCount === 2, "Only equal opaque, non-mirrored visible meshes may combine");
  const batch = root.children.find((object) => object instanceof InstancedMesh)!;
  manager.update();
  assert(root.children.includes(batch), "Unchanged update rebuilt GPU resources");
  assert(sources.every((mesh) => mesh.parent !== null), "Authoring/collider objects were detached");
  root.updateMatrixWorld(true);
  const hits = new Raycaster(new Vector3(10, 0, 5), new Vector3(0, 0, -1)).intersectObject(batch);
  assert(hits[0]?.object === sources[0], "Raycast lost source entity identity");
  sources[1].parent!.position.x = 130;
  manager.update();
  assert(manager.batchCount === 0 && sources[0].visible && sources[1].visible, "Distant meshes kept an invalid shared culling bound");
  sources[1].parent!.position.x = 1;
  manager.update();
  let geometryDisposed = false;
  geometry.addEventListener("dispose", () => { geometryDisposed = true; });
  manager.dispose();
  assert(sources[0].visible && sources[1].visible && !sources[5].visible && !geometryDisposed, "Cleanup changed source visibility or disposed shared geometry");

  const bundle = createPrototypeProject("world");
  const model: ModelAsset = {
    id: "instance-model", name: "Repeated model", kind: "model", status: "ready",
    source: { kind: "project", relativePath: "assets/model.glb" }, materialSlots: [],
    importSettings: { scale: 1, generateColliders: true, optimizeMeshes: false, importAnimations: false, instanceMeshes: true },
    importMetadata: { sourceFormat: "glb", byteLength: 100, nodeCount: 6, meshCount: 2, primitiveCount: 2,
      bounds: { min: [0, 0, 0], max: [1, 1, 1], center: [0.5, 0.5, 0.5], size: [1, 1, 1], boundingSphereRadius: 1 },
      animations: [], extensionsUsed: [], extensionsRequired: [], nodes: Array.from({ length: 6 }, (_, i) => ({
        sourceNodeIndex: i, name: `node-${i}`, meshIndex: i < 5 ? 0 : 1, childSourceNodeIndices: [],
        position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], sourceMaterialIndices: [],
      })) },
  };
  bundle.assets.assets[model.id] = model;
  for (let i = 0; i < 6; i++) {
    const id = `instance-entity-${i}`;
    const mesh: MeshComponent = { id: `${id}-mesh`, type: "mesh", enabled: true, geometryAssetId: model.id,
      geometry: { kind: "asset", assetId: model.id, sourceNodeIndex: i }, materialBindings: [], castShadow: true, receiveShadow: true };
    bundle.scene.entities[id] = { id, name: id, enabled: true, parentId: null, children: [], components: [createTransformComponent(`${id}-transform`), mesh] };
    bundle.scene.rootEntityIds.push(id);
  }
  assert(countRepeatedModelMeshes(model, bundle.scene) === 5, "Different source geometry was counted as repetition");
  const eligible = collectModelInstancingEntities(bundle.scene, bundle.assets);
  assert(eligible.length === 6, "Static node entities missing");
  const first = bundle.scene.entities[eligible[0]];
  first.components.push(createRigidBodyComponent("dynamic"));
  assert(!collectModelInstancingEntities(bundle.scene, bundle.assets).includes(first.id), "Dynamic entity was instanced");
  first.components.pop();
  first.components.push(createScriptComponent("script", "script-asset")!);
  assert(collectModelInstancingEntities(bundle.scene, bundle.assets).length === 0, "Script could lose arbitrary entity rendering behavior");
  first.components.pop();
  const docs = { project: bundle.project, assets: bundle.assets, scenes: { [bundle.scene.sceneId]: bundle.scene }, prefabs: bundle.prefabs };
  const jsx = compileVisualProject(docs);
  assert(jsx.overlayFiles.some((f) => f.content.includes("<XriftModelInstancing entityIds={modelInstancingEntities}")), "Classic JSX omitted instancing");
  const runtime = compileVisualProject(docs, { outputMode: "classic-runtime" });
  assert(runtime.overlayFiles.some((f) => f.content.includes('"modelInstancingEntityIds"') && f.content.includes(eligible[0])), "Runtime manifest omitted instancing");
  const changed = updateModelAsset(bundle.assets, model.id, { importSettings: { instanceMeshes: false } });
  assert(collectModelInstancingEntities(bundle.scene, changed).length === 0, "Model setting could not be disabled");
  const result = await applyAssetOptimizations("fixture-no-file-access", { ...bundle, assets: changed }, [{
    id: "instances:instance-model", assetId: model.id, operation: "instance-model", severity: "recommended", title: "instances", detail: "", impact: "render",
  }], ["instances:instance-model"]);
  assert(result.optimizedAssetCount === 1 && result.beforeBytes === 0 && collectModelInstancingEntities(bundle.scene, result.bundle.assets).length === 6, "Recommendation failed to apply without file conversion");
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
