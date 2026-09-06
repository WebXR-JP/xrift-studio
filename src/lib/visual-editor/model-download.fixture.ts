import { Document, WebIO } from "@gltf-transform/core";
import { BufferGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { XriftThreeLoader } from "../../../packages/xrift-studio-runtime/src/three/index";
import { compactPublishedGlb, optimizePublishedModel } from "./model-download";
import { collectPublishedAssetIds, planModelDownload } from "./compiler/download-plan";
import { compileVisualProject } from "./compiler/compile";
import { createPrototypeProject } from "./prototype-project";
import { normalizeMaterialProperties, type ModelAsset } from "./asset-manifest";
import { createScriptComponent, createTransformComponent, type MeshComponent } from "./scene-document";
import { assembleWebUploadFiles, parseShellManifest, SHELL_ENTRY_PATH } from "./web-upload";

export async function runModelDownloadFixtureAssertions(): Promise<void> {
  const { bytes, json } = glbFixture();
  const original = bytes.slice();
  const plan = { replacedMaterials: [{ index: 0, name: "Paint" }] };
  const result = compactPublishedGlb(bytes, plan);
  assert(!result.skipped && result.removedImages === 2 && result.bytes.byteLength < bytes.byteLength, "Replaced and unused images were not removed");
  assert(equal(bytes, original), "Publication mutated the authoring GLB");
  const output = readJson(result.bytes);
  assert(!output.images && !output.textures && !output.samplers, "Dead texture declarations survived");
  for (const key of ["nodes", "meshes", "accessors", "animations", "skins"]) {
    assert(JSON.stringify(output[key]) === JSON.stringify(json[key]), `${key} indices changed`);
  }
  const document = await new WebIO().readBinary(result.bytes);
  assert(document.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute("POSITION")!.getArray()!.join() === "0,0,0,1,0,0,0,1,0", "Vertex bytes changed");
  assert(document.getRoot().listTextures().length === 0, "Reader still loads removed images");

  const kept = compactPublishedGlb(bytes, { replacedMaterials: [] });
  assert(kept.removedImages === 1 && readJson(kept.bytes).materials[0].pbrMetallicRoughness.baseColorTexture.index === 0, "A source material lost its texture");
  const unusedMaterial = glbFixture((value) => {
    value.textures.push({ source: 1 });
    value.materials.push({ name: "Unused", emissiveTexture: { index: 1 } });
  });
  const unusedResult = compactPublishedGlb(unusedMaterial.bytes, { replacedMaterials: [] });
  assert(unusedResult.removedImages === 1 && readJson(unusedResult.bytes).materials.length === 2, "Unused material images survived or material indices changed");
  const shared = glbFixture((value) => {
    value.materials.push({ name: "Keep", emissiveTexture: { index: 0 } });
    value.meshes[0].primitives.push({ attributes: { POSITION: 0 }, material: 1 });
  });
  const sharedResult = compactPublishedGlb(shared.bytes, plan);
  assert(sharedResult.removedImages === 1 && readJson(sharedResult.bytes).images.length === 1, "An image still used by another material was removed");
  const remapped = glbFixture((value) => {
    value.materials[0].pbrMetallicRoughness.baseColorTexture.index = 1;
    value.textures.push({ source: 1, sampler: 0 });
  });
  const remappedResult = compactPublishedGlb(remapped.bytes, { replacedMaterials: [] });
  const remappedJson = readJson(remappedResult.bytes);
  assert(remappedJson.textures[0].source === 0 && remappedJson.images[0].bufferView === 1, "Surviving image references were not remapped");
  const compressed = glbFixture((value) => {
    value.extensionsUsed = ["KHR_draco_mesh_compression"];
    value.meshes[0].primitives[0].extensions = { KHR_draco_mesh_compression: { bufferView: 0, attributes: { POSITION: 0 } } };
  });
  const compressedResult = compactPublishedGlb(compressed.bytes, plan);
  assert(JSON.stringify(readJson(compressedResult.bytes).meshes) === JSON.stringify(compressed.json.meshes), "Draco references changed");
  for (const extension of ["VRMC_vrm", "EXT_meshopt_compression", "KHR_animation_pointer", "CUSTOM_payload"]) {
    const unsupported = glbFixture((value) => { value.extensionsUsed = [extension]; });
    const kept = compactPublishedGlb(unsupported.bytes, plan);
    assert(!!kept.skipped && equal(kept.bytes, unsupported.bytes), `${extension} was silently rewritten`);
  }
  assert(!!compactPublishedGlb(bytes, { replacedMaterials: [{ index: 0, name: "Stale" }] }).skipped, "Stale import metadata was accepted");
  assert(!!compactPublishedGlb(bytes.subarray(0, bytes.length - 1), plan).skipped, "Truncated GLB was accepted");
  const cached = await optimizePublishedModel(bytes, plan);
  const reused = await optimizePublishedModel(bytes, plan);
  assert(reused.reused && equal(cached.bytes, reused.bytes), "Unchanged publish did not reuse output");
  const changedPlan = await optimizePublishedModel(bytes, { replacedMaterials: [] });
  assert(readJson(changedPlan.bytes).images.length === 1, "Cache ignored material usage changes");
  const changedSource = glbFixture((value) => { value.nodes[0].name = "Changed source"; });
  assert(readJson((await optimizePublishedModel(changedSource.bytes, plan)).bytes).nodes[0].name === "Changed source", "Cache ignored source content changes");

  await assertPublicationPaths(bytes);
  await assertAnimationAndSkin();
  let oldShellRejected = false;
  try { parseShellManifest({ version: "test", runtimeContract: "2026-08-31-flat-published-files-v1", entry: SHELL_ENTRY_PATH, files: [SHELL_ENTRY_PATH] }); } catch { oldShellRejected = true; }
  assert(oldShellRejected, "A runtime shell with the old material lookup was accepted");
}

async function assertAnimationAndSkin(): Promise<void> {
  const document = new Document();
  const buffer = document.createBuffer();
  const accessor = (type: "VEC3" | "VEC4" | "SCALAR" | "MAT4", data: Float32Array | Uint16Array) => document.createAccessor().setType(type).setArray(data).setBuffer(buffer);
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="), (value) => value.charCodeAt(0));
  const material = document.createMaterial("Animated paint").setBaseColorTexture(document.createTexture().setMimeType("image/png").setImage(png));
  const primitive = document.createPrimitive().setMaterial(material)
    .setAttribute("POSITION", accessor("VEC3", new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])))
    .setAttribute("JOINTS_0", accessor("VEC4", new Uint16Array(12)))
    .setAttribute("WEIGHTS_0", accessor("VEC4", new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])));
  const joint = document.createNode("Joint");
  const skin = document.createSkin().addJoint(joint).setInverseBindMatrices(accessor("MAT4", new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])));
  const node = document.createNode("Skinned").setMesh(document.createMesh().addPrimitive(primitive)).setSkin(skin);
  document.createScene().addChild(joint).addChild(node);
  const sampler = document.createAnimationSampler().setInput(accessor("SCALAR", new Float32Array([0, 1]))).setOutput(accessor("VEC3", new Float32Array([0, 0, 0, 0, 1, 0])));
  document.createAnimation("Move").addSampler(sampler).addChannel(document.createAnimationChannel().setTargetNode(joint).setTargetPath("translation").setSampler(sampler));
  const io = new WebIO();
  const source = await io.writeBinary(document);
  const result = compactPublishedGlb(source, { replacedMaterials: [{ index: 0, name: "Animated paint" }] });
  assert(!result.skipped && result.removedImages === 1, "Animated/skinned model was not compacted");
  const before = await io.readBinary(source);
  const after = await io.readBinary(result.bytes);
  const originalAccessors = before.getRoot().listAccessors();
  const outputAccessors = after.getRoot().listAccessors();
  assert(originalAccessors.length === outputAccessors.length && originalAccessors.every((value, index) => value.getArray()!.join() === outputAccessors[index].getArray()!.join()), "Animation, joint or skin accessor values changed");
  const originalJson = readJson(source);
  const outputJson = readJson(result.bytes);
  for (const key of ["nodes", "meshes", "skins", "animations"]) assert(JSON.stringify(originalJson[key]) === JSON.stringify(outputJson[key]), `Animated ${key} references changed`);
}

async function assertPublicationPaths(bytes: Uint8Array): Promise<void> {
  const bundle = createPrototypeProject("world");
  const model: ModelAsset = {
    id: "download-model", kind: "model", name: "Download model", status: "ready",
    source: { kind: "project", relativePath: "assets/model.glb" },
    importSettings: { scale: 1, generateColliders: false, optimizeMeshes: false, importAnimations: true },
    materialSlots: [{ slot: "paint", name: "Paint", sourceMaterialIndex: 0, defaultMaterialAssetId: "download-material" }],
    importMetadata: { sourceFormat: "glb", byteLength: bytes.byteLength, nodeCount: 1, meshCount: 1, primitiveCount: 1, animations: [], extensionsUsed: [], extensionsRequired: [], bounds: { min: [0, 0, 0], max: [1, 1, 0], center: [0.5, 0.5, 0], size: [1, 1, 0], boundingSphereRadius: 1 } },
  };
  bundle.assets.assets[model.id] = model;
  bundle.assets.assets["unused-model"] = { ...model, id: "unused-model", materialSlots: [] };
  bundle.assets.assets["download-material"] = { id: "download-material", kind: "material", name: "Paint", status: "ready", source: { kind: "builtin", key: "test" }, properties: normalizeMaterialProperties({ color: "#ff0000" }), importedFromModel: { modelAssetId: "unused-model", sourceMaterialIndex: 0, sourceMaterialName: "Paint", sourceSlotId: "paint", sourceHash: "a".repeat(64), isUserOverridden: false } };
  const mesh: MeshComponent = { id: "mesh", type: "mesh", enabled: true, geometryAssetId: model.id, geometry: { kind: "asset", assetId: model.id }, materialBindings: [], castShadow: true, receiveShadow: true };
  bundle.scene.entities = { entity: { id: "entity", name: "Model", enabled: true, parentId: null, children: [], components: [createTransformComponent("transform"), mesh] } };
  bundle.scene.rootEntityIds = ["entity"];
  const ids = collectPublishedAssetIds(bundle.scene, bundle.assets);
  assert(ids.has(model.id) && ids.has("download-material") && !ids.has("unused-model"), "Authoring provenance pulled unused models into the download");
  assert(planModelDownload(model, bundle.scene, bundle.assets)?.replacedMaterials.length === 1, "Default material was not recognized");
  const documents = { project: bundle.project, assets: bundle.assets, scenes: { [bundle.scene.sceneId]: bundle.scene }, prefabs: {} };
  for (const outputMode of ["classic-jsx", "classic-runtime"] as const) {
    const compilation = compileVisualProject(documents, { outputMode });
    assert(compilation.canStage, `Fixture cannot be published: ${JSON.stringify(compilation.diagnostics)}`);
    assert(compilation.assetCopyPlan.length === 1 && compilation.assetCopyPlan[0].modelDownload?.replacedMaterials.length === 1, "Copy plan did not exclude unused assets or plan image removal");
    if (compilation.runtimeManifestFile) {
      const runtime = JSON.parse(compilation.runtimeManifestFile.content);
      const component = runtime.scenes[bundle.scene.sceneId].entities.entity.components.find((entry: any) => entry.type === "mesh");
      assert(component.materialBindings[0].materialAssetId === "download-material", "Runtime output would lose the default replacement");
      // Material 1 is the first (local index 0) material on this Mesh. The
      // original global index must win over the unrelated slot 0 fallback.
      runtime.assets[model.id].materialSlots = [
        { slot: "source", name: "Other", sourceMaterialIndex: 0 },
        { slot: "paint", name: "Paint", sourceMaterialIndex: 1 },
      ];
      const sourceMaterial = new MeshStandardMaterial({ color: "#0000ff" });
      sourceMaterial.name = "Paint";
      sourceMaterial.userData.xriftSourceMaterialIndex = 1;
      const loader = new XriftThreeLoader({ assetBaseUrl: "https://fixture.invalid/" });
      Object.assign(loader, { loadModel: async () => ({ root: new Group().add(new Mesh(new BufferGeometry(), sourceMaterial)), animations: [], interactionAnimationCues: [], sourceMaterials: new Map([[1, sourceMaterial]]) }) });
      const loaded = await loader.load(runtime);
      let correctMaterial = false;
      loaded.entities.get("entity")!.traverse((object) => {
        if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) correctMaterial = object.material.color.getHexString() === "ff0000";
      });
      assert(correctMaterial, "Runtime confused a global glTF material index with a local mesh index");
    }
  }
  const reads: string[] = [];
  const uploaded = await assembleWebUploadFiles({ documents, signal: new AbortController().signal, shellFiles: [{ path: SHELL_ENTRY_PATH, data: new Uint8Array([0]) }], readAssetBytes: async (path) => { reads.push(path); return bytes; } });
  const modelFile = uploaded.find((file) => file.remotePath.endsWith(".glb"));
  assert(reads.length === 1 && !!modelFile && modelFile.size < bytes.byteLength, "Upload still contains the original model or unused assets");
  assert(!readJson(modelFile!.data as Uint8Array).images, "Upload contains source images");
  // Disabled components are retained because scripts can make them visible.
  mesh.enabled = false;
  assert(collectPublishedAssetIds(bundle.scene, bundle.assets).has(model.id), "Disabled runtime dependency was removed");
  model.materialSlots[0].defaultMaterialAssetId = undefined;
  assert(planModelDownload(model, bundle.scene, bundle.assets)?.replacedMaterials.length === 0, "An unreplaced model material was stripped");
  mesh.materialBindings = [{ slot: "paint", materialAssetId: "download-material" }];
  const otherUse = { ...mesh, id: "other-mesh", materialBindings: [] };
  bundle.scene.entities.entity.components.push(otherUse);
  assert(planModelDownload(model, bundle.scene, bundle.assets)?.replacedMaterials.length === 0, "A shared model lost a material needed by its other instance");
  const script = createScriptComponent("script", "script-asset")!;
  script.assetReferences = ["unused-model"];
  bundle.scene.entities.entity.components.push(script);
  assert(collectPublishedAssetIds(bundle.scene, bundle.assets).has("unused-model"), "Script-declared runtime asset was removed");
  script.assetReferences = [model.id];
  assert(planModelDownload(model, bundle.scene, bundle.assets) === undefined, "A model loaded directly by a script was stripped");
}

function glbFixture(change?: (json: any) => void): { bytes: Uint8Array; json: any } {
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="), (value) => value.charCodeAt(0));
  const padded = Math.ceil(png.length / 4) * 4;
  const binary = new Uint8Array(36 + padded * 2);
  binary.set(new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer));
  binary.set(png, 36); binary.set(png, 36 + padded);
  const json: any = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: "Triangle" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
    materials: [{ name: "Paint", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0, sampler: 0 }], samplers: [{}],
    images: [{ bufferView: 1, mimeType: "image/png" }, { bufferView: 2, mimeType: "image/png" }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: png.length }, { buffer: 0, byteOffset: 36 + padded, byteLength: png.length }],
    buffers: [{ byteLength: binary.length }],
  };
  change?.(json);
  const text = new TextEncoder().encode(JSON.stringify(json));
  const textLength = Math.ceil(text.length / 4) * 4;
  const bytes = new Uint8Array(28 + textLength + binary.length);
  const view = new DataView(bytes.buffer);
  [0x46546c67, 2, bytes.length, textLength, 0x4e4f534a].forEach((n, i) => view.setUint32(i * 4, n, true));
  bytes.fill(32, 20, 20 + textLength); bytes.set(text, 20);
  view.setUint32(20 + textLength, binary.length, true); view.setUint32(24 + textLength, 0x004e4942, true);
  bytes.set(binary, 28 + textLength);
  return { bytes, json };
}
function readJson(bytes: Uint8Array): any { return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true)))); }
function equal(left: Uint8Array, right: Uint8Array): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
function assert(value: boolean, message: string): void { if (!value) throw new Error(message); }

