import { VRMLoaderPlugin, type MToonMaterial, type VRM, type VRMSpringBoneManager } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { Box3, Group, Mesh, Quaternion, SkinnedMesh, SphereGeometry, Vector3, type Object3D } from "three";
import { normalizeModelImportSettings, type ModelAsset } from "../asset-manifest";
import { createPrototypeProject } from "../prototype-project";
import { compileVisualProject } from "./compile";
import { COMPILER_MTOON_PACKAGE_SPEC } from "./runtime-packages";
import { XriftThreeLoader, disposeXriftLoadResult } from "../../../../packages/xrift-studio-runtime/src/three/index";
import { bindVrmSpringBones, prepareVrmSpringBones } from "../../../../packages/xrift-studio-runtime/src/vrm-spring-bone";
import type { XriftRuntimeManifest } from "../../../../packages/xrift-studio-runtime/src/schema";

/**
 * A real, self-contained VRM avatar with required human bones, skin and morph.
 * `springBones` adds a hair strand on the head that gravity swings across a
 * head collider, the way exported avatars carry hair and clothes.
 */
export function createVrmAvatarFixtureBytes(
  version: "0" | "1",
  shape: "triangle" | "sphere" = "triangle",
  options: { springBones?: boolean } = {},
): Uint8Array {
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
    { name: "head", translation: [0, 0.4, 0], ...(options.springBones ? { children: [16] } : {}) },
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
    // The tip leans forward slightly so gravity has a side to pull it to.
    ...(options.springBones
      ? [{ name: "hair", translation: [0, 0.1, 0], children: [17] }, { name: "hairTip", translation: [0, 0.15, 0.02] }]
      : []),
  ];
  // Soft, heavy hair, so a couple of seconds of gravity visibly swing it. The
  // head collider sits on the strand's arc, 0.15 m in front of the root.
  const springSettings = { stiffness: 0.2, gravityPower: 2, dragForce: 0.4, hitRadius: 0.01 };
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
    ...(options.springBones ? {
      VRMC_springBone: {
        specVersion: "1.0",
        colliders: [{ node: 2, shape: { sphere: { offset: [0, 0.1, 0.15], radius: 0.04 } } }],
        colliderGroups: [{ name: "Head", colliders: [0] }],
        // A center node makes three-vrm keep an inverse cache in its userData.
        springs: [{ name: "Hair", center: 0, colliderGroups: [0], joints: [{ node: 16, ...springSettings, gravityDir: [0, -1, 0] }, { node: 17 }] }],
      },
    } : {}),
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
      ...(options.springBones ? {
        secondaryAnimation: {
          // VRM 0.x stores collider z mirrored.
          colliderGroups: [{ node: 2, colliders: [{ offset: { x: 0, y: 0.1, z: -0.15 }, radius: 0.04 }] }],
          boneGroups: [{
            comment: "Hair", bones: [16], colliderGroups: [0], gravityDir: { x: 0, y: -1, z: 0 },
            stiffiness: springSettings.stiffness, gravityPower: springSettings.gravityPower,
            dragForce: springSettings.dragForce, hitRadius: springSettings.hitRadius,
          }],
        },
      } : {}),
    },
  };
  const json = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ name: `FixtureVRM${version}`, nodes: [0, 15] }], nodes,
    extensionsUsed: version === "1"
      ? ["VRMC_vrm", "VRMC_materials_mtoon", ...(options.springBones ? ["VRMC_springBone"] : [])]
      : ["VRM"],
    extensions: extension,
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

    const { input, model } = createVrmAvatarProjectInput(version);
    const emitted = compileVisualProject(input);
    assert(emitted.canStage && emitted.stagingPlan.runtimePackageSpecs.includes(COMPILER_MTOON_PACKAGE_SPEC), `VRM ${version} native output must include its loader dependency even without authored MToon`);
    assert(emitted.overlayFiles.some(file => file.relativePath === "src/xrift-studio/mtoon-runtime.ts"), `VRM ${version} native output must include the shared outline shader`);
    const compiled = compileVisualProject(input, { outputMode: "classic-runtime" });
    assert(compiled.canStage && compiled.runtimeManifestFile, `VRM ${version} runtime manifest must compile`);
    const manifest: XriftRuntimeManifest = JSON.parse(compiled.runtimeManifestFile.content);
    const modelAsset = manifest.assets[model.id];
    assert(modelAsset.kind === "model" && modelAsset.sourceFormat === "vrm", `VRM ${version} source type must survive publication`);
    modelAsset.url = vrmDataUrl(bytes);
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

/**
 * Spring bones swing on the clones Edit, Play and output draw. Those clones
 * also stay measurable: Box3 used to throw from a cloned collider and take
 * the editor's Canvas down with it.
 */
export async function runVrmSpringBoneFixtureAssertions(): Promise<void> {
  for (const version of ["0", "1"] as const) {
    const bytes = createVrmAvatarFixtureBytes(version, "triangle", { springBones: true });
    const native = await new GLTFLoader().register(parser => new VRMLoaderPlugin(parser)).parseAsync(bytes.buffer as ArrayBuffer, "");
    const loadedSprings = native.userData.vrmSpringBoneManager as VRMSpringBoneManager | null | undefined;
    assert(loadedSprings && loadedSprings.joints.size > 0 && loadedSprings.colliders.length === 1, `VRM ${version} fixture must carry spring joints and a head collider`);
    prepareVrmSpringBones(native.scene, loadedSprings);
    const sourceHair = native.scene.getObjectByName("hair");
    assert(sourceHair, `VRM ${version} fixture lost its hair node`);
    const sourceRest = sourceHair.quaternion.clone();

    const drawn = cloneSkeleton(native.scene);
    new Box3().setFromObject(drawn);
    new Box3().setFromObject(cloneSkeleton(drawn));
    const entity = new Group();
    entity.add(drawn);
    const springBones = bindVrmSpringBones(native.scene, drawn);
    assert(springBones && springBones.manager.joints.size === loadedSprings.joints.size, `VRM ${version} drawn clone must receive every spring joint`);
    const collider = springBones.manager.colliders[0];
    assert(springBones.manager.colliders.length === 1 && collider && isInside(collider, entity), `VRM ${version} joints must collide with the drawn clone's own collider`);
    const hair = drawn.getObjectByName("hair");
    const tip = drawn.getObjectByName("hairTip");
    assert(hair && tip, `VRM ${version} clone lost its hair nodes`);
    const rest = hair.quaternion.clone();
    let nearest = Infinity;
    for (let frame = 0; frame < 120; frame++) {
      springBones.update(1 / 60);
      entity.updateMatrixWorld(true);
      const center = new Vector3().setFromMatrixPosition(collider.colliderMatrix);
      nearest = Math.min(nearest, tip.getWorldPosition(new Vector3()).distanceTo(center));
    }
    assert(hair.quaternion.angleTo(rest) > 0.3, `VRM ${version} hair did not swing under gravity`);
    // Ignoring the collider, the tip would pass through its center.
    assert(nearest > 0.03, `VRM ${version} hair passed through the head collider (${nearest.toFixed(3)} m)`);
    assert(sourceHair.quaternion.equals(sourceRest), `VRM ${version} spring bones moved the shared loaded avatar`);

    // Selection bounds copy a drawn clone again. The copy carries three-vrm's
    // center cache as plain JSON, and must still bind and run.
    const copied = bindVrmSpringBones(native.scene, cloneSkeleton(drawn));
    assert(copied, `VRM ${version} copy of a drawn clone lost its spring bones`);
    copied.update(1 / 60);
    copied.update(1 / 60);
    copied.dispose();

    springBones.reset();
    assert(hair.quaternion.angleTo(rest) < 1e-6, `VRM ${version} reset did not restore the bound pose`);
    springBones.update(1 / 60);
    springBones.update(1 / 60);
    springBones.dispose();
    assert(hair.quaternion.angleTo(rest) < 1e-6 && hair.matrixAutoUpdate && sourceHair.matrixAutoUpdate, `VRM ${version} stopping did not hand the hair back at rest`);
  }

  for (const version of ["0", "1"] as const) {
    const bytes = createVrmAvatarFixtureBytes(version, "triangle", { springBones: true });
    const { input, model } = createVrmAvatarProjectInput(version);
    const world = compileVisualProject(input).overlayFiles.find(file => file.relativePath === "src/World.tsx")?.content ?? "";
    assert(
      world.includes("prepareVrmSpringBones(scene, vrmUserData.vrmSpringBoneManager)") &&
        world.includes("bindVrmSpringBones(scene, root)") &&
        world.includes("vrmSpringBones.current?.update(delta)"),
      `VRM ${version} output must bind spring bones to the drawn avatar and step them every frame`,
    );
    const compiled = compileVisualProject(input, { outputMode: "classic-runtime" });
    assert(compiled.canStage && compiled.runtimeManifestFile, `VRM ${version} runtime manifest must compile`);
    const manifest: XriftRuntimeManifest = JSON.parse(compiled.runtimeManifestFile.content);
    const modelAsset = manifest.assets[model.id];
    assert(modelAsset?.kind === "model", `VRM ${version} runtime manifest lost the avatar`);
    modelAsset.url = vrmDataUrl(bytes);
    const loaded = await new XriftThreeLoader({ assetBaseUrl: "https://fixture.invalid/" }).parse(manifest);
    try {
      assert(loaded.springBones.length === 1, `VRM ${version} runtime must bind the placed avatar's spring bones`);
      new Box3().setFromObject(loaded.root);
      const hair = loaded.root.getObjectByName("hair");
      assert(hair, `VRM ${version} runtime lost the hair node`);
      const rest = hair.quaternion.clone();
      for (let frame = 0; frame < 120; frame++) loaded.springBones[0]!.update(1 / 60);
      assert(hair.quaternion.angleTo(rest) > 0.3, `VRM ${version} runtime hair did not swing under gravity`);
    } finally {
      disposeXriftLoadResult(loaded);
    }
  }
}

/** The fixture avatar's World, as the publish build receives it. */
export function compileVrmAvatarWorld(version: "0" | "1") {
  return compileVisualProject(createVrmAvatarProjectInput(version).input);
}

/** A prototype World whose only Model is the fixture avatar. */
function createVrmAvatarProjectInput(version: "0" | "1") {
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
  return { input, model };
}

function vrmDataUrl(bytes: Uint8Array): string {
  return `data:model/gltf-binary;base64,${btoa(String.fromCharCode(...bytes))}`;
}

function isInside(object: Object3D, ancestor: Object3D): boolean {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
