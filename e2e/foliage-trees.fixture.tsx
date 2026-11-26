import React, { Suspense } from "react";
import { advance, createRoot, extend } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { XRiftProvider } from "@xrift/world-components";
import * as THREE from "three";
import { XriftWorld } from "../packages/xrift-studio-runtime/src/react-three-fiber/index";

// The namespace also carries constants, which the catalogue type rejects.
extend(THREE as unknown as Parameters<typeof extend>[0]);
const directory = "/node_modules/.cache/xrift-studio/foliage-published/";
const SIZE = 320;

/** The generated World, and the Runtime JSON manifest read by the adapter the browser shell mounts. */
export type PublishedFoliageMode = "jsx" | "runtime";
type ShaderMesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
type Fixture = { bounds: { min: number[]; max: number[] }; runtimeManifest: string };

function plain(value: unknown): unknown {
  if (value instanceof THREE.Color) return value.toArray().map((entry) => Math.round(entry * 1e4) / 1e4);
  if (value instanceof THREE.Vector2 || value instanceof THREE.Vector3) return value.toArray().map((entry) => Math.round(entry * 1e4) / 1e4);
  return value;
}

/**
 * Draws the published tree the way one publication draws it, at two moments,
 * and reports what its two meshes wear.
 */
export async function renderPublishedFoliage(mode: PublishedFoliageMode) {
  const data = await fetch(`${directory}fixture.json`).then((response) => response.json()) as Fixture;
  const publicUrl = `${location.origin}${directory}public/`;
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(SIZE, SIZE);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE);
  const scene = new THREE.Scene();
  // Framed from the side, a little above the middle of the tree.
  const height = data.bounds.max[1]!;
  const reach = Math.max(data.bounds.max[0]! - data.bounds.min[0]!, data.bounds.max[2]! - data.bounds.min[2]!, height);
  // The Scene's own camera settings: the Runtime JSON adapter applies them,
  // so a camera that starts with them is the same camera on both paths.
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 2000);
  (camera as THREE.PerspectiveCamera & { manual?: boolean }).manual = true;
  camera.position.set(reach * 0.9, height * 0.75, reach * 1.25);
  camera.lookAt(0, height * 0.45, 0);
  camera.updateMatrixWorld();
  const root = createRoot(document.createElement("canvas"));

  const shaderMeshes = () => {
    const found: ShaderMesh[] = [];
    scene.traverse((object) => {
      const mesh = object as ShaderMesh;
      if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.uniforms?.uLeafMap) found.push(mesh);
    });
    return found;
  };
  const ready = (mesh: ShaderMesh) =>
    ["uLeafMap", "uBarkMap"].every((name) => (mesh.material.uniforms[name]?.value as THREE.Texture | null)?.image);

  try {
    await root.configure({ gl: renderer, scene, camera, frameloop: "never", size: { width: SIZE, height: SIZE, top: 0, left: 0 }, events: undefined });
    let content: React.ReactNode;
    if (mode === "jsx") {
      const generated = await import(/* @vite-ignore */ `${directory}src/World.tsx`);
      content = React.createElement(generated.World);
    } else {
      content = <Physics paused><XriftWorld manifest={`${location.origin}${directory}${data.runtimeManifest}`} physics="inherit" /></Physics>;
    }
    root.render(<Suspense fallback={null}><XRiftProvider baseUrl={publicUrl}>{content}</XRiftProvider></Suspense>);
    let meshes: ShaderMesh[] = [];
    for (let attempt = 0; attempt < 500; attempt += 1) {
      meshes = shaderMeshes();
      if (meshes.length === 2 && meshes.every(ready)) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (meshes.length !== 2 || !meshes.every(ready)) {
      throw new Error(`${mode}: the tree did not load (${meshes.length} foliage meshes)`);
    }

    const frame = (time: number) => {
      scene.background = new THREE.Color(0, 0, 0);
      scene.fog = null;
      renderer.setRenderTarget(target);
      advance(time);
      const bytes = new Uint8Array(SIZE * SIZE * 4);
      renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, bytes);
      return bytes;
    };
    const first = frame(0.5);
    const second = frame(2.25);

    const base64 = (bytes: Uint8Array) => {
      let text = "";
      for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      return btoa(text);
    };
    const canvas = document.createElement("canvas");
    canvas.width = SIZE; canvas.height = SIZE;
    const flipped = new Uint8ClampedArray(first.length);
    for (let row = 0; row < SIZE; row += 1) flipped.set(first.subarray((SIZE - 1 - row) * SIZE * 4, (SIZE - row) * SIZE * 4), row * SIZE * 4);
    canvas.getContext("2d")!.putImageData(new ImageData(flipped, SIZE, SIZE), 0, 0);

    const describe = (mesh: ShaderMesh) => ({
      name: mesh.name,
      defines: Object.keys(mesh.material.defines ?? {}).sort(),
      side: mesh.material.side,
      // Where the mesh stands in the world, to the millimetre.
      box: (() => {
        const box = new THREE.Box3().setFromObject(mesh);
        return [...box.min.toArray(), ...box.max.toArray()].map((value) => Math.round(value * 1000) / 1000);
      })(),
      attributes: Object.keys(mesh.geometry.attributes).sort(),
      uniforms: Object.fromEntries(
        ["uTime", "uWindDirection", "uWindSpeed", "uWindTurbulence", "uSunDirection", "uSunColor", "uSunIntensity", "uAmbientColor", "uAmbientIntensity", "uSway", "uFlutter"]
          .map((name) => [name, plain(mesh.material.uniforms[name]?.value)]),
      ),
      sampler: Object.fromEntries(["uLeafMap", "uBarkMap"].map((name) => {
        const texture = mesh.material.uniforms[name]!.value as THREE.Texture;
        return [name, { minFilter: texture.minFilter, magFilter: texture.magFilter, anisotropy: texture.anisotropy, mipmaps: texture.generateMipmaps, colorSpace: texture.colorSpace, flipY: texture.flipY }];
      })),
    });
    let drawn = 0, changed = 0;
    const sum = [0, 0, 0];
    for (let index = 0; index < first.length; index += 4) {
      const lit = first[index]! + first[index + 1]! + first[index + 2]! > 0;
      if (lit) {
        drawn += 1;
        sum[0]! += first[index]!; sum[1]! += first[index + 1]!; sum[2]! += first[index + 2]!;
      }
      if (first[index] !== second[index] || first[index + 1] !== second[index + 1] || first[index + 2] !== second[index + 2]) changed += 1;
    }
    return {
      mode,
      meshes: meshes.map(describe).sort((a, b) => a.name.localeCompare(b.name)),
      frames: { first: base64(first), second: base64(second) },
      drawn,
      changed,
      mean: sum.map((value) => Math.round(value / Math.max(drawn, 1))),
      glError: renderer.getContext().getError(),
      image: canvas.toDataURL(),
    };
  } finally {
    root.unmount();
    await new Promise((resolve) => setTimeout(resolve, 40));
    target.dispose();
    renderer.dispose();
  }
}
