import React, { Suspense, useState } from "react";
import { Clone } from "@react-three/drei";
import { createRoot, extend } from "@react-three/fiber";
import { XRiftProvider } from "@xrift/world-components";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ProjectModelVisual } from "../src/components/visual-editor/ProjectModelVisual";
import { tauri } from "../src/lib/tauri";
import type { AssetManifest, MaterialAsset, ModelAsset } from "../src/lib/visual-editor/asset-manifest";
import { XriftThreeLoader, disposeXriftLoadResult } from "../packages/xrift-studio-runtime/src/three/index";
import type { XriftRuntimeManifest } from "../packages/xrift-studio-runtime/src/schema";
import {
  GPU_INSTANCING_FIXTURE,
  GPU_INSTANCING_FIXTURE_FRAGMENT_SHADER,
  GPU_INSTANCING_FIXTURE_VERTEX_SHADER,
} from "../packages/xrift-studio-runtime/src/gltf-instance-attributes.fixture";

// The namespace also carries constants, which the catalogue type rejects.
extend(THREE as unknown as Parameters<typeof extend>[0]);
const directory = "/node_modules/.cache/xrift-studio/instance-attributes-parity/";
const SIZE = 300;
/** Orthographic half extent: 100 px per metre, so the 0.2 m quad covers 20 px. */
const EXTENT = 1.5;

/**
 * `edit`, `play`, `jsx` and `three` draw the Model as Studio draws it. The two
 * controls draw what Studio drew before: `stock-loader` is three.js's loader
 * alone, and `drei-clone` is the copy the generated world used to make.
 */
export type InstanceAttributeMode = "edit" | "play" | "jsx" | "three" | "stock-loader" | "drei-clone";
type Fixture = {
  manifest: XriftRuntimeManifest;
  modelFile: string;
  model: ModelAsset;
  material: MaterialAsset;
  assets: AssetManifest;
};
const NODE_NAMES = [...Object.keys(GPU_INSTANCING_FIXTURE.nodes), GPU_INSTANCING_FIXTURE.plainNodeName];

function fixtureShader(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: GPU_INSTANCING_FIXTURE_VERTEX_SHADER,
    fragmentShader: GPU_INSTANCING_FIXTURE_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
  });
}

export async function renderInstanceAttributes(mode: InstanceAttributeMode) {
  const data = await fetch(`${directory}fixture.json`).then((response) => response.json()) as Fixture;
  const publicBase = `${location.origin}${directory}public/`;
  const modelBytes = await fetch(`${publicBase}${data.modelFile}`).then((response) => response.arrayBuffer());
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(SIZE, SIZE);
  const scene = new THREE.Scene();
  const camera = Object.assign(new THREE.OrthographicCamera(-EXTENT, EXTENT, EXTENT, -EXTENT, 0.1, 10), { manual: true });
  camera.position.set(0, 0, 3); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE);
  const root = createRoot(document.createElement("canvas"));
  const originalRead = tauri.readProjectFileDataUrl;
  const owned: THREE.Material[] = [];
  let loaded: Awaited<ReturnType<XriftThreeLoader["load"]>> | undefined;
  const drawnMeshes = () => {
    const meshes = new Map<string, THREE.Mesh>();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !NODE_NAMES.includes(mesh.name) || meshes.has(mesh.name)) return;
      const material = mesh.material as THREE.ShaderMaterial;
      if (material.isShaderMaterial && material.vertexShader === GPU_INSTANCING_FIXTURE_VERTEX_SHADER) meshes.set(mesh.name, mesh);
    });
    return meshes;
  };
  try {
    await root.configure({ gl: renderer, scene, camera, frameloop: "never", size: { width: SIZE, height: SIZE, top: 0, left: 0 }, events: undefined });
    // Called on every render of the host, as a parent of the Model renders it.
    let content: () => React.ReactNode;
    if (mode === "edit" || mode === "play") {
      // The Editor reads a Model through IPC; only that read is replaced.
      const bytes = new Uint8Array(modelBytes);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      tauri.readProjectFileDataUrl = async () => `data:model/gltf-binary;base64,${btoa(binary)}`;
      const source = data.model.source;
      if (source.kind !== "project") throw new Error("The fixture Model must be a project file");
      // The Scene View keeps this list stable while the bindings are unchanged.
      const assignedMaterials = data.model.materialSlots.map((slot) => ({ slot: slot.slot, sourceMaterialIndex: slot.sourceMaterialIndex!, material: data.material }));
      content = () => <ProjectModelVisual projectPath="isolated-instance-attributes-fixture" sourceRelativePath={source.relativePath}
        sourceHash={data.model.sourceHash} importScale={data.model.importSettings.scale} castShadow={false} receiveShadow={false}
        selected={false} assets={data.assets} playing={mode === "play"} assignedMaterials={assignedMaterials} />;
    } else if (mode === "jsx") {
      const generated = await import(/* @vite-ignore */ `${directory}src/World.tsx`);
      content = () => React.createElement(generated.World);
    } else if (mode === "three") {
      loaded = await new XriftThreeLoader({ assetBaseUrl: publicBase }).load(data.manifest);
      const runtimeRoot = loaded.root;
      content = () => <primitive object={runtimeRoot} />;
    } else {
      // What three.js's loader alone returns, under the same Custom Shader.
      const gltf = await new GLTFLoader().parseAsync(modelBytes.slice(0), "");
      if (mode === "stock-loader") {
        gltf.scene.traverse((object) => {
          if (!(object as THREE.Mesh).isMesh) return;
          const material = fixtureShader();
          owned.push(material);
          (object as THREE.Mesh).material = material;
        });
        content = () => <primitive object={gltf.scene} />;
      } else {
        const inject = (object: THREE.Object3D) => (object as THREE.Mesh).isMesh
          ? <shaderMaterial attach="material" vertexShader={GPU_INSTANCING_FIXTURE_VERTEX_SHADER} fragmentShader={GPU_INSTANCING_FIXTURE_FRAGMENT_SHADER} side={THREE.DoubleSide} />
          : null;
        content = () => <Clone object={gltf.scene} inject={inject} />;
      }
    }
    let renderAgain = () => {};
    const Host = () => {
      const [, setRenders] = useState(0);
      renderAgain = () => setRenders((renders) => renders + 1);
      return <>{content()}</>;
    };
    root.render(<Suspense fallback={null}><XRiftProvider baseUrl={publicBase}><Host /></XRiftProvider></Suspense>);
    for (let attempt = 0; attempt < 300 && drawnMeshes().size < NODE_NAMES.length; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const meshes = drawnMeshes();
    if (meshes.size < NODE_NAMES.length) {
      const objects: unknown[] = [];
      scene.traverse((object) => objects.push({ name: object.name, type: object.type, material: ((object as THREE.Mesh).material as THREE.Material | undefined)?.type }));
      throw new Error(`${mode} did not draw every fixture node with the Custom Shader: ${JSON.stringify(objects)}`);
    }
    scene.background = new THREE.Color("#000000"); scene.fog = null;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 1;
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    const bytes = new Uint8Array(SIZE * SIZE * 4);
    renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, bytes);
    const error = renderer.getContext().getError();
    // A parent that renders again must find the same Meshes still drawn.
    renderAgain();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const afterRender = drawnMeshes();
    const rebuilt = [...meshes].filter(([name, mesh]) => afterRender.get(name) !== mesh).map(([name]) => name);

    const nodes = Object.fromEntries([...meshes].map(([name, mesh]) => {
      const instanced = mesh as THREE.InstancedMesh;
      const offset = mesh.geometry.getAttribute("_aoffset") as THREE.BufferAttribute | undefined;
      const tint = mesh.geometry.getAttribute("_atint") as THREE.BufferAttribute | undefined;
      const translations: number[] = [];
      if (instanced.isInstancedMesh) {
        const matrix = new THREE.Matrix4();
        for (let index = 0; index < instanced.count; index++) {
          instanced.getMatrixAt(index, matrix);
          translations.push(...new THREE.Vector3().setFromMatrixPosition(matrix).toArray());
        }
      }
      return [name, {
        instances: instanced.isInstancedMesh ? instanced.count : null,
        translations: translations.map((value) => Math.round(value * 1e6) / 1e6),
        offsetPerInstance: offset instanceof THREE.InstancedBufferAttribute,
        offsets: offset ? Array.from(offset.array).map((value) => Math.round(value * 1e6) / 1e6) : null,
        tintPerInstance: tint instanceof THREE.InstancedBufferAttribute,
        tints: tint ? Array.from(tint.array) : null,
        vertices: mesh.geometry.getAttribute("position").count,
      }];
    }));
    // Where each instance's quad must appear: its translation plus its own offset.
    const lit = (x: number, y: number) => {
      const column = Math.round((x + EXTENT) / (2 * EXTENT) * SIZE);
      const row = Math.round((y + EXTENT) / (2 * EXTENT) * SIZE);
      const index = (row * SIZE + column) * 4;
      return bytes[index]! + bytes[index + 1]! + bytes[index + 2]! > 60;
    };
    const quads = Object.entries(GPU_INSTANCING_FIXTURE.nodes).flatMap(([name, node]) =>
      Array.from({ length: node.translations.length / 3 }, (_, index) => ({
        name, index,
        x: node.translations[index * 3]! + node.offsets[index * 3]!,
        y: node.translations[index * 3 + 1]! + node.offsets[index * 3 + 1]!,
        restY: node.translations[index * 3 + 1]!,
      })));
    const canvas = document.createElement("canvas"); canvas.width = SIZE; canvas.height = SIZE;
    const flipped = new Uint8ClampedArray(bytes.length);
    for (let row = 0; row < SIZE; row++) flipped.set(bytes.subarray((SIZE - 1 - row) * SIZE * 4, (SIZE - row) * SIZE * 4), row * SIZE * 4);
    canvas.getContext("2d")!.putImageData(new ImageData(flipped, SIZE, SIZE), 0, 0);
    return {
      mode, error, nodes, rebuilt, pixels: [...bytes], image: canvas.toDataURL(),
      colored: bytes.filter((value, index) => index % 4 === 0 && value > 20).length,
      // The far edge of the lifted quad, which the unlifted quad does not reach.
      lifted: quads.map((quad) => ({ name: quad.name, index: quad.index, lit: lit(quad.x, quad.y + Math.sign(quad.y - quad.restY) * 0.07) })),
      // The far edge of the unlifted quad, which the lifted quad has left.
      rest: quads.map((quad) => ({ name: quad.name, index: quad.index, lit: lit(quad.x, quad.restY - Math.sign(quad.y - quad.restY) * 0.07) })),
      plain: lit(0, -1.2),
    };
  } finally {
    tauri.readProjectFileDataUrl = originalRead;
    root.unmount();
    await new Promise((resolve) => setTimeout(resolve, 40));
    if (loaded) disposeXriftLoadResult(loaded);
    owned.forEach((material) => material.dispose());
    target.dispose(); renderer.dispose();
  }
}
