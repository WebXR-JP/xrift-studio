import React from "react";
import { createRoot, extend, type RootState } from "@react-three/fiber";
import * as THREE from "three";
import { ParticleEmitterVisual } from "../src/components/visual-editor/ParticleEmitterVisual";
import { tauri } from "../src/lib/tauri";
import { createPrototypeProject } from "../src/lib/visual-editor/prototype-project";
import { addDefaultParticleAsset, getParticleAuthoringPreset, normalizeParticleProperties } from "../src/lib/visual-editor/particle-system";
import { getParticlePresetTexture, prepareParticlePresetTexture } from "../src/lib/visual-editor/particle-preset-textures";
import { instantiateSceneAsset } from "../src/lib/visual-editor/asset-placement";
import { assetManifestCodec } from "../src/lib/visual-editor/serialization";
import { compilePrototypeVisualProject } from "../src/lib/visual-editor/compiler/compile";
import type { ParticleAsset, TextureAsset } from "../src/lib/visual-editor/asset-manifest";

export async function prepareTexturedParticle(presetId: string, isolate = false) {
  const bundle = createPrototypeProject("world", "particle-texture-parity");
  bundle.scene = { ...bundle.scene, rootEntityIds: [], entities: {} };
  const base = getParticleAuthoringPreset(presetId)!;
  const preset = isolate ? { ...base, properties: normalizeParticleProperties({
    maxParticles: 1, duration: 3, prewarm: true, looping: true,
    startSpeed: { min: 0, max: 0 }, startLifetime: { min: 3, max: 3 }, startSize: { min: 1, max: 1 },
    shape: { type: "point" }, gravity: [0, 0, 0], emission: { rateOverTime: 1, bursts: [] },
    colorOverLifetime: { start: [1, 1, 1, 1], end: [1, 1, 1, 1] }, sizeOverLifetime: { min: 1, max: 1 },
    renderer: { blending: "normal" },
  }) } : base;
  const files: Record<string, string> = {};
  const prepared = await prepareParticlePresetTexture(bundle.assets, preset, {
    textureId: `parity-texture-${presetId}`,
    writeFile: async (path, dataUrl) => { files[path] = dataUrl; },
  });
  const added = addDefaultParticleAsset(prepared.assets, { id: "parity-particle", name: preset.name, properties: prepared.preset.properties });
  const parsed = assetManifestCodec.parse(assetManifestCodec.serialize(added.manifest));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  bundle.assets = parsed.document;
  const placement = instantiateSceneAsset(bundle.scene, bundle.assets, {}, added.assetId);
  if (!placement.placed) throw new Error("Particle placement failed");
  bundle.scene = placement.scene;
  const output = compilePrototypeVisualProject(bundle);
  if (!output.canStage) throw new Error(JSON.stringify(output.diagnostics));
  const particle = bundle.assets.assets[added.assetId] as ParticleAsset;
  const texture = bundle.assets.assets[particle.properties.renderer.textureAssetId!] as TextureAsset;
  const reused = await prepareParticlePresetTexture(bundle.assets, preset, {
    textureId: "should-not-be-created", writeFile: async () => { throw new Error("Duplicate texture write"); },
  });
  return { particle, texture, files, output, definition: getParticlePresetTexture(presetId)!,
    reusedId: reused.preset.properties.renderer?.textureAssetId };
}

/** Render the actual editor loader and the actual emitted publication Component. */
export async function compareParticlePixels(published: React.FC, particle: ParticleAsset, texture: TextureAsset, files: Record<string, string>) {
  extend(THREE);
  const readImage = tauri.readImageDataUrl;
  tauri.readImageDataUrl = async (_project, relativePath) => {
    const data = files[relativePath];
    if (!data) throw new Error(`Missing isolated texture: ${relativePath}`);
    return data;
  };
  async function render(element: React.ReactNode) {
    const renderer = new THREE.WebGLRenderer(); renderer.setSize(128, 128);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    const target = new THREE.WebGLRenderTarget(128, 128);
    const camera = new THREE.PerspectiveCamera(40, 1, .1, 10); camera.position.z = 2; camera.manual = true;
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#182030");
    const root = createRoot(renderer.domElement);
    let state: RootState | undefined;
    await root.configure({ gl: renderer, scene, camera, frameloop: "never", flat: true, linear: true,
      size: { width: 128, height: 128, top: 0, left: 0 }, events: undefined, onCreated: value => { state = value; } });
    root.render(element);
    let points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20));
      scene.traverse(object => { if (object instanceof THREE.Points && object.material instanceof THREE.PointsMaterial && object.material.map) points = object; });
      if (points && state) break;
    }
    if (!points || !state) throw new Error("Textured Particle did not finish loading");
    for (let frame = 0; frame <= 12; frame++) state.advance(frame * .05, false);
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    const pixels = new Uint8Array(128 * 128 * 4); renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
    root.unmount(); target.dispose(); renderer.dispose();
    return Array.from(pixels);
  }
  try {
    const editor = await render(<ParticleEmitterVisual asset={particle} textureAsset={texture} projectPath="isolated-particle-test" />);
    const output = await render(React.createElement(published));
    return { same: JSON.stringify(editor) === JSON.stringify(output), visible: editor.filter((value, index) => index % 4 === 0 && value > 100).length };
  } finally { tauri.readImageDataUrl = readImage; }
}
