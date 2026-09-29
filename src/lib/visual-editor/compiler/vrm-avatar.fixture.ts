import { VRMLoaderPlugin, type MToonMaterial, type VRM } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Mesh, Quaternion, SkinnedMesh, SphereGeometry, Vector3 } from "three";
import { normalizeModelImportSettings, type ModelAsset } from "../asset-manifest";
import { createPrototypeProject } from "../prototype-project";
import { compileVisualProject } from "./compile";
import { COMPILER_MTOON_PACKAGE_SPEC } from "./runtime-packages";
import { XriftThreeLoader, disposeXriftLoadResult } from "../../../../packages/xrift-studio-runtime/src/three/index";
import type { XriftRuntimeManifest } from "../../../../packages/xrift-studio-runtime/src/schema";

/** A real, self-contained VRM avatar with required human bones, skin and morph. */
export function createVrmAvatarFixtureBytes(version: "0" | "1", shape: "triangle" | "sphere" = "triangle"): Uint8Array {
  const sphere = shape === "sphere" ? new SphereGeometry(0.35, 16, 12).toNonIndexed() : undefined;
  const positions = sphere?.getAttribute("position").array as Float32Array | undefined ?? new Float32Array([-0.3, 0, 0, 0.3, 0, 0, 0, 0.6, 0]);
  const normals = sphere?.getAttribute("normal").array as Float32Array | undefined ?? new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uvs = sphere?.getAttribute("uv").array as Float32Array | undefined ?? new Float32Array([0, 0, 1, 0, 0.5, 1]);
  const vertexCount = positions.length / 3;
  const weights = new Float32Array(vertexCount * 4);
  for (let vertex = 0; vertex < vertexCount; vertex++) weights[vertex * 4] = 1;
  const morphs = new Float32Array(positions.length);
  for (let vertex = 0; vertex < vertexCount; vertex++) morphs[vertex * 3 + 1] = shape === "sphere" ? positions[vertex * 3 + 1]! * 0.1 : vertex === 2 ? 0.1 : 0;
  const blocks = [
    positions, normals, new Uint16Array(vertexCount * 4), weights,
    new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    morphs, uvs,
  ];
  let offset = 0;
  const bufferViews = blocks.map(block => {
    const view = { buffer: 0, byteOffset: offset, byteLength: block.byteLength };
    offset += block.byteLength;
    return view;
  });
  const binary = new Uint8Array(offset);
  blocks.forEach((block, index) => binary.set(new Uint8Array(block.buffer), bufferViews[index]!.byteOffset));
  const boneNames = ["hips", "spine", "head", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot", "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand"];
  const nodes = [
    { name: "hips", translation: [0, 1, 0], children: [1, 3, 6] },
    { name: "spine", translation: [0, 0.2, 0], children: [2, 9, 12] },
    { name: "head", translation: [0, 0.4, 0] },
    { name: "leftUpperLeg", translation: [-0.1, 0, 0], children: [4] },
    { name: "leftLowerLeg", translation: [0, -0.4, 0], children: [5] },
    { name: "leftFoot", translation: [0, -0.4, 0] },
    { name: "rightUpperLeg", translation: [0.1, 0, 0], children: [7] },
    { name: "rightLowerLeg", translation: [0, -0.4, 0], children: [8] },
    { name: "rightFoot", translation: [0, -0.4, 0] },
    { name: "leftUpperArm", translation: [-0.1, 0.2, 0], children: [10] },
    { name: "leftLowerArm", translation: [-0.3, 0, 0], children: [11] },
    { name: "leftHand", translation: [-0.25, 0, 0] },
    { name: "rightUpperArm", translation: [0.1, 0.2, 0], children: [13] },
    { name: "rightLowerArm", translation: [0.3, 0, 0], children: [14] },
    { name: "rightHand", translation: [0.25, 0, 0] },
    { name: "Body", mesh: 0, skin: 0 },
  ];
  const mtoon = {
    specVersion: "1.0", shadeColorFactor: [0.02, 0.06, 0.15], shadingShiftFactor: -0.2,
    shadingToonyFactor: 0.85, giEqualizationFactor: 0.75,
    outlineWidthMode: "worldCoordinates", outlineWidthFactor: 0.025,
    outlineColorFactor: [0.8, 0.03, 0.07], outlineLightingMixFactor: 0,
    uvAnimationScrollXSpeedFactor: 0.05,
  };
  const extension = version === "1" ? {
    VRMC_vrm: {
      specVersion: "1.0",
      meta: {
        name: "Fixture avatar", version: "1.0", authors: ["XRift fixture"],
        licenseUrl: "https://vrm.dev/licenses/1.0/", avatarPermission: "onlyAuthor",
        commercialUsage: "personalNonProfit", creditNotation: "required", modification: "prohibited",
      },
      humanoid: { humanBones: Object.fromEntries(boneNames.map((bone, node) => [bone, { node }])) },
    },
  } : {
    VRM: {
      specVersion: "0.0", exporterVersion: "XRift fixture",
      meta: { title: "Fixture avatar", version: "1.0", author: "XRift fixture", licenseName: "Redistribution_Prohibited", allowedUserName: "OnlyAuthor" },
      humanoid: { humanBones: boneNames.map((bone, node) => ({ bone, node, useDefaultValues: true })) },
      materialProperties: [{
        name: "Native toon", shader: "VRM/MToon", renderQueue: 2000,
        floatProperties: { _BlendMode: 0, _CullMode: 2, _ZWrite: 1, _ShadeShift: -0.2, _ShadeToony: 0.85, _IndirectLightIntensity: 0.25, _OutlineWidthMode: 1, _OutlineWidth: 2.5, _OutlineColorMode: 0, _UvAnimScrollX: 0.05 },
        vectorProperties: { _Color: [0.4, 0.6, 0.9, 1], _ShadeColor: [0.02, 0.06, 0.15, 1], _OutlineColor: [0.8, 0.03, 0.07, 1] },
        textureProperties: {}, keywordMap: {}, tagMap: {},
      }],
    },
  };
  const json = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ name: `FixtureVRM${version}`, nodes: [0, 15] }], nodes,
    extensionsUsed: version === "1" ? ["VRMC_vrm", "VRMC_materials_mtoon"] : ["VRM"], extensions: extension,
    buffers: [{ byteLength: binary.byteLength }], bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, count: vertexCount, type: "VEC3", min: shape === "sphere" ? [-0.35, -0.35, -0.35] : [-0.3, 0, 0], max: shape === "sphere" ? [0.35, 0.35, 0.35] : [0.3, 0.6, 0] },
      { bufferView: 1, componentType: 5126, count: vertexCount, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: vertexCount, type: "VEC4" },
      { bufferView: 3, componentType: 5126, count: vertexCount, type: "VEC4" },
      { bufferView: 4, componentType: 5126, count: 1, type: "MAT4" },
      { bufferView: 5, componentType: 5126, count: vertexCount, type: "VEC3", min: shape === "sphere" ? [0, -0.035, 0] : [0, 0, 0], max: [0, shape === "sphere" ? 0.035 : 0.1, 0] },
      { bufferView: 6, componentType: 5126, count: vertexCount, type: "VEC2" },
    ],
    skins: [{ inverseBindMatrices: 4, joints: [0], skeleton: 0 }],
    materials: [{ name: "Native toon", pbrMetallicRoughness: { baseColorFactor: [0.4, 0.6, 0.9, 1] }, ...(version === "1" ? { extensions: { VRMC_materials_mtoon: mtoon } } : {}) }],
    meshes: [{ weights: [0.25], extras: { targetNames: ["Smile"] }, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: 2, WEIGHTS_0: 3, TEXCOORD_0: 6, TEXCOORD_1: 6 }, material: 0, targets: [{ POSITION: 5 }] }] }],
  };
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(encoded.byteLength / 4) * 4;
  const binaryLength = Math.ceil(binary.byteLength / 4) * 4;
  const glb = new Uint8Array(12 + 8 + jsonLength + 8 + binaryLength);
  const header = new DataView(glb.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, glb.byteLength, true);
  header.setUint32(12, jsonLength, true);
  header.setUint32(16, 0x4e4f534a, true);
  glb.fill(0x20, 20, 20 + jsonLength);
  glb.set(encoded, 20);
  header.setUint32(20 + jsonLength, binaryLength, true);
  header.setUint32(24 + jsonLength, 0x004e4942, true);
  glb.set(binary, 28 + jsonLength);
  sphere?.dispose();
  return glb;
}

/** Native VRM 0.x/1.0 avatars keep MToon, orientation, skinning and morphs. */
export async function runVrmAvatarRuntimeFixtureAssertions(): Promise<void> {
  for (const version of ["0", "1"] as const) {
    const bytes = createVrmAvatarFixtureBytes(version);
    const nativeLoader = new GLTFLoader().register(parser => {
      const plugin = new VRMLoaderPlugin(parser);
      plugin.mtoonMaterialPlugin.v0CompatShade = Boolean(parser.json.extensions?.VRM);
      return plugin;
    });
    const native = await nativeLoader.parseAsync(bytes.buffer as ArrayBuffer, "");
    const vrm = native.userData.vrm as VRM | undefined;
    assert(vrm?.meta.metaVersion === version && vrm.humanoid.getRawBoneNode("head"), `VRM ${version} fixture must create a native humanoid avatar`);
    const nativeMaterial = vrm.materials?.find(material => !(material as MToonMaterial).isOutline) as MToonMaterial | undefined;
    assert(nativeMaterial?.isMToonMaterial && nativeMaterial.v0CompatShade === (version === "0"), `VRM ${version} fixture must use the native MToon shader`);

    const prototype = createPrototypeProject("world", `vrm-${version}-runtime`);
    const model: ModelAsset = {
      id: "native-vrm-avatar", name: "Native VRM avatar", kind: "model", status: "ready",
      source: { kind: "project", relativePath: `assets/avatar-${version}.vrm` },
      importSettings: normalizeModelImportSettings({}),
      materialSlots: [{ slot: "default", name: "Native toon", sourceMaterialIndex: 0 }],
    };
    prototype.assets.assets[model.id] = model;
    let modelKept = false;
    for (const entity of Object.values(prototype.scene.entities)) {
      entity.components = entity.components.filter(component => {
        if (component.type !== "mesh") return true;
        if (modelKept) return false;
        modelKept = true;
        component.geometry = { kind: "asset", assetId: model.id };
        component.materialBindings = [];
        return true;
      });
    }
    const input = { project: prototype.project, assets: prototype.assets, scenes: { [prototype.scene.sceneId]: prototype.scene }, prefabs: prototype.prefabs };
    const emitted = compileVisualProject(input);
    assert(emitted.canStage && emitted.stagingPlan.runtimePackageSpecs.includes(COMPILER_MTOON_PACKAGE_SPEC), `VRM ${version} native output must include its loader dependency even without authored MToon`);
    assert(emitted.overlayFiles.some(file => file.relativePath === "src/xrift-studio/mtoon-runtime.ts"), `VRM ${version} native output must include the shared outline shader`);
    const compiled = compileVisualProject(input, { outputMode: "classic-runtime" });
    assert(compiled.canStage && compiled.runtimeManifestFile, `VRM ${version} runtime manifest must compile`);
    const manifest: XriftRuntimeManifest = JSON.parse(compiled.runtimeManifestFile.content);
    const modelAsset = manifest.assets[model.id];
    assert(modelAsset.kind === "model" && modelAsset.sourceFormat === "vrm", `VRM ${version} source type must survive publication`);
    modelAsset.url = `data:model/gltf-binary;base64,${btoa(String.fromCharCode(...bytes))}`;
    const loaded = await new XriftThreeLoader({ assetBaseUrl: "https://fixture.invalid/" }).parse(manifest);
    try {
      assert(!loaded.diagnostics.some(item => item.severity === "error"), `VRM ${version} runtime failed: ${JSON.stringify(loaded.diagnostics)}`);
      const avatar = loaded.root.getObjectByName(`FixtureVRM${version}`);
      const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), version === "0" ? Math.PI : 0);
      assert(avatar && avatar.quaternion.angleTo(rotation) < 1e-8, `VRM ${version} runtime changed avatar orientation: ${avatar ? JSON.stringify(avatar.quaternion.toArray()) : "avatar root missing"}`);
      const surfaces: Mesh[] = [];
      loaded.root.traverse(object => { if (object instanceof Mesh && !object.userData.xriftMToonOutline) surfaces.push(object); });
      assert(surfaces.length === 1, `VRM ${version} runtime changed the imported surface mesh count`);
      const surface = surfaces[0]!;
      assert(surface instanceof SkinnedMesh && surface.skeleton.bones.length === 1, `VRM ${version} runtime lost avatar skinning`);
      assert(!Array.isArray(surface.material), `VRM ${version} runtime left a native outline in the editable material slots`);
      const material = surface.material as MToonMaterial;
      assert(material.isMToonMaterial && material.v0CompatShade === (version === "0"), `VRM ${version} runtime replaced its native toon shader`);
      assert(Math.abs(material.color.r - nativeMaterial.color.r) < 1e-8 && material.outlineWidthFactor === 0.025, `VRM ${version} runtime changed authored color or outline width`);
      assert(surface.geometry.groups.length === 1 && surface.geometry.groups[0]!.materialIndex === 0, `VRM ${version} runtime did not normalize native outline groups`);
      assert(material.userData.xriftSourceMaterialIndex === 0 && surface.userData.xriftSourceNodeIndex === 15, `VRM ${version} runtime lost source-slot or node targeting`);
      const outlines = surface.children.filter(child => child.userData.xriftMToonOutline);
      assert(outlines.length === 1 && outlines[0] instanceof SkinnedMesh, `VRM ${version} runtime must render exactly one skinned outline pass`);
      const outline = outlines[0] as SkinnedMesh;
      assert(outline.geometry === surface.geometry && outline.skeleton === surface.skeleton && outline.morphTargetInfluences === surface.morphTargetInfluences && surface.morphTargetInfluences?.[0] === 0.25, `VRM ${version} outline lost geometry, skeleton or morph parity`);
    } finally {
      disposeXriftLoadResult(loaded);
      native.scene.traverse(object => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
      });
    }
  }
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
