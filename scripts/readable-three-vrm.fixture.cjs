#!/usr/bin/env node
/** Compare the emitted vendor's actual public materials and VRM loaders with the pinned npm package. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

process.env.XRIFT_TYPESCRIPT_PATH ||= "typescript-test-api";
eval(fs.readFileSync(path.join(__dirname, "run-authoring-fixtures.cjs"), "utf8")
  .split("const suites =")[0].replace(/^#![^\n]*\n/, ""));

globalThis.ProgressEvent ||= class extends Event {
  constructor(type, options = {}) { super(type); Object.assign(this, options); }
};

function uniformValue(value) {
  if (value?.isTexture) return { texture: value.name, channel: value.channel, matrix: value.matrix.toArray() };
  if (value?.toArray) return value.toArray();
  if (Array.isArray(value)) return value.map(uniformValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, uniformValue(item)]));
  return value;
}

function materialSnapshot(material) {
  return {
    type: material.type, name: material.name, constructor: material.constructor.name,
    vertexShader: material.vertexShader, fragmentShader: material.fragmentShader,
    defines: material.defines, uniforms: uniformValue(material.uniforms),
    side: material.side, blending: material.blending, transparent: material.transparent,
    depthWrite: material.depthWrite, alphaTest: material.alphaTest,
    v0CompatShade: material.v0CompatShade, isOutline: material.isOutline,
  };
}

(async () => {
  const official = await import("@pixiv/three-vrm");
  const readable = await import(pathToFileURL(path.resolve(__dirname, "../packages/xrift-studio-runtime/src/vendor/three-vrm-readable.js")).href);
  const { Color, Texture } = await import("three");
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const { createVrmAvatarFixtureBytes } = await import(pathToFileURL(path.resolve(__dirname, "../src/lib/visual-editor/compiler/vrm-avatar.fixture.ts")).href);
  assert.deepEqual(Object.keys(readable).sort(), Object.keys(official).sort());
  for (const [name, value] of Object.entries(official)) {
    if (typeof value === "function") {
      assert.equal(readable[name].name, value.name, `${name}: public constructor/function name`);
      assert.deepEqual(Object.getOwnPropertyDescriptor(readable[name], "name"), Object.getOwnPropertyDescriptor(value, "name"), `${name}: name descriptor`);
      assert.deepEqual(Reflect.ownKeys(readable[name]).map(String), Reflect.ownKeys(value).map(String), `${name}: public static keys and symbols`);
    }
  }

  const texture = new Texture(); texture.name = "Fixture texture"; texture.channel = 1;
  texture.offset.set(0.3, 0.2); texture.repeat.set(2, 0.7); texture.rotation = 0.4; texture.updateMatrix();
  let materialsChecked = 0;
  for (const v0CompatShade of [false, true]) {
    const options = {
      color: new Color(0.2, 0.6, 0.8), map: texture, opacity: 0.65, transparent: true,
      shadeColorFactor: new Color(0.05, 0.15, 0.2), shadeMultiplyTexture: texture,
      normalMap: texture, emissive: new Color(0.02, 0.04, 0.01), emissiveMap: texture,
      shadingShiftFactor: -0.2, shadingToonyFactor: 0.7, giEqualizationFactor: 0.8,
      shadingShiftTexture: texture, shadingShiftTextureScale: -0.4,
      matcapFactor: new Color(0.4, 0.5, 0.6), matcapTexture: texture,
      parametricRimColorFactor: new Color(0.1, 0.4, 0.9), rimMultiplyTexture: texture,
      rimLightingMixFactor: 0.3, parametricRimFresnelPowerFactor: 4, parametricRimLiftFactor: 0.2,
      outlineWidthMode: "worldCoordinates", outlineWidthFactor: 0.01,
      outlineWidthMultiplyTexture: texture, outlineColorFactor: new Color(0.8, 0.05, 0.1), outlineLightingMixFactor: 0.25,
      uvAnimationMaskTexture: texture, uvAnimationScrollXSpeedFactor: 0.13,
      uvAnimationScrollYSpeedFactor: -0.07, uvAnimationRotationSpeedFactor: 0.3, v0CompatShade,
    };
    const original = new official.MToonMaterial(options);
    const vendor = new readable.MToonMaterial(options);
    original.update(0.75); vendor.update(0.75);
    assert.deepEqual(materialSnapshot(vendor), materialSnapshot(original), `MToon ${v0CompatShade ? "0.x" : "1.0"}: settings, shaders, uniforms, animation`);
    const outlines = [original.clone(), vendor.clone()];
    for (const outline of outlines) { outline.isOutline = true; outline.update(0.25); }
    assert.deepEqual(materialSnapshot(outlines[1]), materialSnapshot(outlines[0]), "outline clone settings and shaders");
    for (const material of [original, vendor, ...outlines]) material.dispose();
    materialsChecked += 2;
  }
  texture.dispose();

  for (const version of ["0", "1"]) {
    const bytes = createVrmAvatarFixtureBytes(version);
    const load = async api => {
      const loader = new GLTFLoader();
      loader.register(parser => new api.VRMLoaderPlugin(parser, { mtoonMaterialPlugin: new api.MToonMaterialLoaderPlugin(parser, { v0CompatShade: version === "0" }) }));
      return loader.parseAsync(bytes.slice().buffer, "");
    };
    const original = await load(official); const vendor = await load(readable);
    const snapshot = gltf => {
      const vrm = gltf.userData.vrm;
      assert.ok(vrm?.humanoid.getRawBoneNode("hips"), `VRM ${version}: avatar humanoid`);
      const meshes = [];
      gltf.scene.traverse(object => {
        if (!object.isMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        meshes.push({
          name: object.name, groups: object.geometry.groups,
          positions: Array.from(object.geometry.getAttribute("position").array),
          skin: object.isSkinnedMesh ? object.skeleton.bones.map(bone => bone.name) : undefined,
          morph: object.morphTargetInfluences, morphNames: object.morphTargetDictionary,
          materials: materials.map(material => { material.update?.(0.5); return materialSnapshot(material); }),
        });
      });
      assert.ok(meshes.some(mesh => mesh.skin?.includes("hips") && mesh.morphNames?.Smile === 0), `VRM ${version}: real skin and morph`);
      return { meta: vrm.meta, meshes };
    };
    assert.deepEqual(snapshot(vendor), snapshot(original), `VRM ${version}: public loader, conversion, skin, morph and native outline`);
    for (const gltf of [original, vendor]) {
      gltf.scene.traverse(object => {
        if (!object.isMesh) return;
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      });
    }
  }
  console.log(JSON.stringify({ status: "passed", materialsChecked, vrmVersions: ["0", "1"], publicExports: Object.keys(official).length }));
})().catch(error => { console.error(error); process.exitCode = 1; });
