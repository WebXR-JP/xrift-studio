import React from 'react';
import { Clone } from '@react-three/drei';
import { createRoot, extend } from '@react-three/fiber';
import * as T from 'three';
import { tauri } from '../src/lib/tauri';
import { applyAssignedMaterialPreviews, cloneSourceModelNode, loadProjectModelData } from '../src/components/visual-editor/ProjectModelVisual';
import { normalizeMaterialProperties } from '../src/lib/visual-editor/asset-manifest';
import { runOpenBrushFixtureAssertions } from '../src/lib/visual-editor/open-brush.fixture';
import { createSceneRenderTarget } from '../packages/xrift-studio-runtime/src/scene/postprocessing';
import { normalizeOpenBrushGlslSource } from '../packages/xrift-studio-runtime/src/open-brush/material-extension';
export { runOpenBrushFixtureAssertions };

function document(brush = 'DiamondHull') {
  const binary = new Float32Array([-.28, -.4, 0, .28, -.4, 0, 0, .4, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0, .5, 1]);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(binary.buffer)));
  return {
    asset: { version: '2.0', generator: 'Open Brush UnityGLTF Exporter' }, scene: 0, scenes: [{ nodes: [0, 1, 2] }],
    nodes: [0, 1, 0].map((mesh, i) => ({ mesh, translation: [(i - 1) * .8, 0, 0] })),
    meshes: [0, 1].map(material => ({ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2, TEXCOORD_0: 3 }, material }] })),
    materials: [{ name: `${brush} (Instance)` }, { name: `${brush} (Instance)` }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-.28, -.4, 0], max: [.28, .4, 0] }, { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' }, { bufferView: 2, componentType: 5126, count: 3, type: 'VEC4' }, { bufferView: 3, componentType: 5126, count: 3, type: 'VEC2' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 }, { buffer: 0, byteOffset: 72, byteLength: 48 }, { buffer: 0, byteOffset: 120, byteLength: 24 }],
    buffers: [{ byteLength: binary.byteLength, uri: `data:application/octet-stream;base64,${base64}` }]
  };
}

/** Actual pinned cutout shader, texture and emitted loader, with identical lighting. */
export async function renderBrushAntialiasing() {
  const generatedUrl = '/node_modules/.cache/xrift-studio/openbrush-material-overrides/src/World.tsx';
  const generated = await import(/* @vite-ignore */ generatedUrl);
  const source = JSON.stringify(document('ThickPaint'));
  const originalRead = tauri.readProjectFileDataUrl;
  let editor;
  try {
    tauri.readProjectFileDataUrl = async () => `data:application/json;base64,${btoa(source)}`;
    editor = cloneSourceModelNode((await loadProjectModelData('isolated-openbrush-aa-test', 'thickpaint.gltf', 'cutout-thickpaint')).object);
  } finally { tauri.readProjectFileDataUrl = originalRead; }
  const published = cloneSourceModelNode((await new generated.CompiledOpenBrushGLTFLoader().parseAsync(source, '')).scene) as T.Group;
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setSize(384, 256); renderer.outputColorSpace = T.LinearSRGBColorSpace; renderer.toneMapping = T.NoToneMapping;
  const camera = new T.OrthographicCamera(-1.3, 1.3, .8, -.8, .1, 10); camera.position.z = 3;
  const scene = new T.Scene();
  for (const group of [editor, published]) group.traverse(object => {
    if (!(object as T.Mesh).isMesh) return;
    const material = (object as T.Mesh<T.BufferGeometry, T.RawShaderMaterial>).material;
    material.uniforms.u_ambient_light_color!.value = new T.Vector4(1, 1, 1, 1);
    for (const index of [0, 1]) material.uniforms[`u_SceneLight_${index}_color`]!.value = new T.Vector4(0, 0, 0, 0);
  });
  const target = createSceneRenderTarget(renderer, 384, 256, T.UnsignedByteType);
  const capture = (object: T.Object3D) => {
    scene.add(object); renderer.setRenderTarget(target); renderer.render(scene, camera);
    const bytes = new Uint8Array(384 * 256 * 4); renderer.readRenderTargetPixels(target, 0, 0, 384, 256, bytes); scene.remove(object);
    return bytes;
  };
  const current = capture(editor);
  const output = capture(published);
  const legacy = editor.clone();
  const legacyMaterials: T.Material[] = [];
  const mesh = editor.children[0] as T.Mesh<T.BufferGeometry, T.RawShaderMaterial>;
  const fragmentPath = mesh.material.userData.xriftOpenBrushResourcePaths[1] as string;
  const fragmentUrl = new URL(fragmentPath, new URL('/visual-editor/openbrush/brushes/', location.href));
  const fragment = normalizeOpenBrushGlslSource(await (await fetch(fragmentUrl)).text());
  legacy.traverse(object => {
    if (!(object as T.Mesh).isMesh) return;
    const node = object as T.Mesh<T.BufferGeometry, T.RawShaderMaterial>;
    node.material = node.material.clone(); node.material.fragmentShader = fragment; node.material.alphaToCoverage = false;
    legacyMaterials.push(node.material);
  });
  const before = capture(legacy);
  const summarize = (bytes: Uint8Array) => ({
    partial: bytes.filter((value, index) => index % 4 === 0 && value > 0 && value < 255).length,
    interior: bytes.filter((value, index) => index % 4 === 0 && value === 255).length,
    coverage: bytes.reduce((sum, value, index) => sum + (index % 4 === 0 ? value / 255 : 0), 0),
  });
  const diagonal = new T.Mesh(new T.PlaneGeometry(1.1, .7), new T.MeshBasicMaterial({ color: 0xffffff }));
  diagonal.rotation.z = .37; scene.add(diagonal);
  const compositor = [T.UnsignedByteType, T.HalfFloatType].map(type => {
    const frames = [false, true].map(antialias => {
      const rt = createSceneRenderTarget(renderer, 64, 64, type);
      if (!antialias) rt.samples = 0;
      renderer.setRenderTarget(rt); renderer.render(scene, camera);
      const copy = new T.Mesh(new T.PlaneGeometry(2, 2), new T.MeshBasicMaterial({ map: rt.texture }));
      const copyScene = new T.Scene(); copyScene.add(copy);
      const output = new T.WebGLRenderTarget(64, 64);
      const ortho = new T.OrthographicCamera(-1, 1, 1, -1, .1, 10); ortho.position.z = 1;
      renderer.setRenderTarget(output); renderer.render(copyScene, ortho);
      const bytes = new Uint8Array(64 * 64 * 4); renderer.readRenderTargetPixels(output, 0, 0, 64, 64, bytes);
      const result = { samples: rt.samples, ...summarize(bytes) };
      output.dispose(); copy.geometry.dispose(); copy.material.dispose(); rt.dispose(); return result;
    });
    return { before: frames[0]!, after: frames[1]! };
  });
  const png = (bytes: Uint8Array) => {
    const canvas = globalThis.document.createElement('canvas'); canvas.width = 384; canvas.height = 256;
    const flipped = new Uint8ClampedArray(bytes.length);
    for (let y = 0; y < 256; y++)flipped.set(bytes.subarray((255 - y) * 384 * 4, (256 - y) * 384 * 4), y * 384 * 4);
    canvas.getContext('2d')!.putImageData(new ImageData(flipped, 384, 256), 0, 0); return canvas.toDataURL();
  };
  diagonal.geometry.dispose(); diagonal.material.dispose();
  renderer.setRenderTarget(null); target.dispose(); legacyMaterials.forEach(material => material.dispose()); renderer.dispose();
  return { before: summarize(before), after: summarize(current), compositor, changed: current.filter((value, index) => value !== output[index]).length, beforeImage: png(before), afterImage: png(current) };
}

export async function renderBrushOverrides() {
  const generatedUrl = '/node_modules/.cache/xrift-studio/openbrush-material-overrides/src/World.tsx';
  const generated = await import(/* @vite-ignore */ generatedUrl);
  const source = JSON.stringify(document());
  const originalRead = tauri.readProjectFileDataUrl;
  let editorData;
  try {
    tauri.readProjectFileDataUrl = async () => `data:application/json;base64,${btoa(source)}`;
    editorData = await loadProjectModelData('isolated-openbrush-test', 'brush.gltf', 'repeated-diamondhull');
  } finally { tauri.readProjectFileDataUrl = originalRead; }
  const published = await new generated.CompiledOpenBrushGLTFLoader().parseAsync(source, '');
  const editorIndices: number[] = [];
  editorData.object.traverse(object => { if ((object as T.Mesh).isMesh) editorIndices.push((object as T.Mesh<T.BufferGeometry, T.Material>).material.userData.xriftSourceMaterialIndex); });
  const publishedIndices: number[] = [];
  published.scene.traverse((object: T.Object3D) => {
    const node = published.parser.associations.get(object)?.nodes;
    if (node !== undefined) object.userData.xriftSourceNodeIndex = node;
    if ((object as T.Mesh).isMesh) publishedIndices.push(published.parser.associations.get((object as T.Mesh<T.BufferGeometry, T.Material>).material)?.materials);
  });
  const renderer = new T.WebGLRenderer(); renderer.setSize(156, 96); renderer.outputColorSpace = T.LinearSRGBColorSpace; renderer.toneMapping = T.NoToneMapping;
  const camera = Object.assign(new T.OrthographicCamera(-1.3, 1.3, .8, -.8, .1, 10), { manual: true }); camera.position.z = 3;
  const target = new T.WebGLRenderTarget(156, 96);
  const scene = new T.Scene(); scene.add(new T.AmbientLight(0xffffff, Math.PI));
  const sample = () => {
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    const bytes = new Uint8Array(156 * 96 * 4); renderer.readRenderTargetPixels(target, 0, 0, 156, 96, bytes);
    return [30, 78, 126].map(x => [...bytes.slice((45 * 156 + x) * 4, (45 * 156 + x) * 4 + 3)]);
  };
  const normalFrames = (object: T.Object3D) => {
    scene.add(object);
    const frames = [0, 10].map(dy => {
      object.position.y = dy; camera.position.set(0, dy, 3); camera.lookAt(0, dy, 0); camera.updateMatrixWorld();
      renderer.setRenderTarget(target); renderer.render(scene, camera);
      const pixels = new Uint8Array(156 * 96 * 4); renderer.readRenderTargetPixels(target, 0, 0, 156, 96, pixels);
      return pixels;
    });
    scene.remove(object); camera.position.set(0, 0, 3); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    return {
      changed: frames[0]!.filter((value, index) => Math.abs(value - frames[1]![index]!) > 1).length,
      lit: frames[0]!.filter((value, index) => index % 4 !== 3 && value > 10).length
    };
  };
  const editorNormals = normalFrames(cloneSourceModelNode(editorData.object));
  const publishedNormals = normalFrames(cloneSourceModelNode(published.scene));
  const baseline = cloneSourceModelNode(editorData.object); scene.add(baseline); const before = sample(); scene.remove(baseline);
  const editor = cloneSourceModelNode(editorData.object);
  const owned = applyAssignedMaterialPreviews(editor, [{ sourceMaterialIndex: 0, sourceNodeIndex: 0, material: generated.toonAsset }]);
  scene.add(editor); const toon = sample(); scene.remove(editor);
  const red = { ...generated.toonAsset, id: 'red-pbr', properties: normalizeMaterialProperties({ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] }, emissiveFactor: [1, 0, 0] }) };
  const pbr = cloneSourceModelNode(editorData.object);
  owned.push(...applyAssignedMaterialPreviews(pbr, [{ sourceMaterialIndex: 0, sourceNodeIndex: 0, material: red }]));
  scene.add(pbr); const standard = sample(); scene.remove(pbr);
  extend({ Mesh: T.Mesh, Group: T.Group });
  const root = createRoot(renderer.domElement);
  await root.configure({ gl: renderer, scene, camera, frameloop: 'never', flat: true, linear: true, size: { width: 156, height: 96, top: 0, left: 0 }, events: undefined });
  root.render(React.createElement(Clone, { object: published.scene, inject: generated.injectPublishedMaterials(published.parser.associations) }));
  for (let attempt = 0; attempt < 100; attempt++) {
    let ready = false; scene.traverse(object => { if ((object as T.Mesh).isMesh && ((object as T.Mesh<T.BufferGeometry, T.Material>).material as T.Material & { isMToonMaterial?: boolean }).isMToonMaterial === true) ready = true; });
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const output = sample();
  const types: string[] = []; scene.traverse(object => { if ((object as T.Mesh).isMesh) types.push(((object as T.Mesh<T.BufferGeometry, T.Material>).material as T.Material & { isMToonMaterial?: boolean }).isMToonMaterial === true ? "MToonMaterial" : (object as T.Mesh<T.BufferGeometry, T.Material>).material.type); });
  root.unmount(); owned.forEach(material => material.dispose()); target.dispose(); renderer.dispose();
  return { editorIndices, publishedIndices, before, toon, standard, output, types, editorNormals, publishedNormals };
}
