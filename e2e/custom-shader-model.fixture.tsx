import React, { Suspense, useMemo, useState } from "react";
import { advance, createRoot, extend } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { XRiftProvider } from "@xrift/world-components";
import * as THREE from "three";
import { MeshVisual, SceneDrivenUniformsScope } from "../src/components/visual-editor/SceneViewport";
import { tauri } from "../src/lib/tauri";
import { XriftWorld } from "../packages/xrift-studio-runtime/src/react-three-fiber/index";
import type { AssetManifest } from "../src/lib/visual-editor/asset-manifest";
import type { MeshComponent, SceneDocument } from "../src/lib/visual-editor/scene-document";
import { resolveSceneSettings } from "../src/lib/visual-editor/scene-settings";
import { loadBuiltShellWorld } from "./vrm-mtoon-render.fixture";

// The namespace also carries constants, which the catalogue type rejects.
extend(THREE as unknown as Parameters<typeof extend>[0]);
const directory = "/node_modules/.cache/xrift-studio/custom-shader-model-parity/";
const SIZE = 300;
/** Orthographic half extent: 100 px per metre. */
const EXTENT = 1.5;
const MESH_NAMES = ["Trunk", "Leaves"] as const;
const NO_CUES: readonly never[] = [];

/**
 * Edit and Play draw the Model as the Scene View draws it. `jsx` is the
 * generated World, `runtime` the Runtime JSON adapter from source and `shell`
 * the built shell that browser publication uploads.
 */
export type CustomShaderModelMode = "edit" | "play" | "jsx" | "runtime" | "shell";
type Fixture = {
  /** The Model file as the generated World names it. */
  modelFile: string;
  mesh: MeshComponent;
  assets: AssetManifest;
  scene: SceneDocument;
  runtimeManifest: string;
};
type FoliageMesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

function base64(bytes: Uint8Array) {
  let text = "";
  for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(text);
}

/** The Scene after its author changed the wind, the key light and the ambient. */
function changedScene(scene: SceneDocument): SceneDocument {
  const next = structuredClone(scene);
  const settings = resolveSceneSettings(next.settings);
  next.settings = {
    ...settings,
    vegetation: { ...settings.vegetation, windSpeed: 0.5, gustStrength: 0.75, windDirectionDegrees: 0 },
    ambient: { enabled: true, color: "#ff8000", intensity: 0.5 },
  };
  for (const entity of Object.values(next.entities)) {
    for (const component of entity.components) {
      if (component.type === "transform" && entity.components.some((entry) => entry.type === "light")) {
        component.rotation = [-Math.PI / 2, 0, 0];
      }
      if (component.type === "light") Object.assign(component, { color: "#ffffff", intensity: 1 });
    }
  }
  return next;
}

/**
 * Draws the fixture Model the way one path draws it and returns the frames,
 * with the wind and light values each path left on the Model's Materials.
 */
export async function renderCustomShaderModel(mode: CustomShaderModelMode) {
  const data = await fetch(`${directory}fixture.json`).then((response) => response.json()) as Fixture;
  const publicUrl = `${location.origin}${directory}public/`;
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(SIZE, SIZE);
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE);
  const scene = new THREE.Scene();
  const camera = Object.assign(new THREE.OrthographicCamera(-EXTENT, EXTENT, EXTENT, -EXTENT, 0.1, 10), { manual: true });
  camera.position.set(0, 0, 3);
  const root = createRoot(document.createElement("canvas"));
  const originalRead = tauri.readProjectFileDataUrl;

  /** The two meshes of the Model, once both wear the Custom Shader. */
  const foliage = () => {
    const found = new Map<string, FoliageMesh>();
    scene.traverse((object) => {
      const mesh = object as FoliageMesh;
      if (!mesh.isMesh || Array.isArray(mesh.material) || found.has(mesh.name)) return;
      if ((MESH_NAMES as readonly string[]).includes(mesh.name) && mesh.material.uniforms?.uSunDirection) found.set(mesh.name, mesh);
    });
    return found.size === MESH_NAMES.length ? found : undefined;
  };
  async function waitFor<T>(read: () => T | undefined | false, what: string): Promise<T> {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const value = read();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const objects: unknown[] = [];
    scene.traverse((object) => objects.push({ name: object.name, type: object.type, material: ((object as THREE.Mesh).material as THREE.Material | undefined)?.type }));
    throw new Error(`${mode}: ${what}: ${JSON.stringify(objects)}`);
  }
  /** What a Material holds for the uniforms the Scene drives. */
  const values = (material: THREE.ShaderMaterial) => ({
    windDirection: (material.uniforms.uWindDirection!.value as THREE.Vector2).toArray(),
    windSpeed: material.uniforms.uWindSpeed!.value as number,
    windTurbulence: material.uniforms.uWindTurbulence!.value as number,
    sunDirection: (material.uniforms.uSunDirection!.value as THREE.Vector3).toArray(),
    sunColor: (material.uniforms.uSunColor!.value as THREE.Vector3).toArray(),
    sunIntensity: material.uniforms.uSunIntensity!.value as number,
    ambientColor: (material.uniforms.uAmbientColor!.value as THREE.Vector3).toArray(),
    ambientIntensity: material.uniforms.uAmbientIntensity!.value as number,
  });
  const read = (meshes: ReadonlyMap<string, FoliageMesh>) => Object.fromEntries(MESH_NAMES.map((name) => [name, values(meshes.get(name)!.material)]));
  /** One frame of this path's own loop: its clock, then its draw. */
  const frame = (time: number, meshes: ReadonlyMap<string, FoliageMesh>) => {
    const drawn = new Set<THREE.Object3D>(meshes.values());
    scene.traverse((object) => {
      const drawable = object as THREE.Mesh & THREE.Line & THREE.Points & THREE.Sprite;
      if (drawable.isMesh || drawable.isLine || drawable.isPoints || drawable.isSprite) object.visible = drawn.has(object);
    });
    scene.background = new THREE.Color(0, 0, 0);
    scene.fog = null;
    renderer.setRenderTarget(target);
    advance(time);
    const bytes = new Uint8Array(SIZE * SIZE * 4);
    renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, bytes);
    return base64(bytes);
  };

  try {
    await root.configure({ gl: renderer, scene, camera, frameloop: "never", size: { width: SIZE, height: SIZE, top: 0, left: 0 }, events: undefined });
    const wrap = (content: React.ReactNode) => (
      <Suspense fallback={null}><XRiftProvider baseUrl={publicUrl}>{content}</XRiftProvider></Suspense>
    );
    /** Set by the editor host: replaces the Scene the Scene View draws from. */
    const editor: { applyScene?: (scene: SceneDocument) => void } = {};
    if (mode === "edit" || mode === "play") {
      // The Editor reads a Model through IPC; only that read is replaced.
      const file = await fetch(`${publicUrl}${data.modelFile}`).then((response) => response.arrayBuffer());
      const dataUrl = `data:model/gltf-binary;base64,${base64(new Uint8Array(file))}`;
      tauri.readProjectFileDataUrl = async () => dataUrl;
      // What the Scene View mounts for a Mesh Renderer, under the scope that
      // supplies the Scene's wind and key light to everything it draws.
      const Host = () => {
        const [sceneDocument, setSceneDocument] = useState(data.scene);
        editor.applyScene = setSceneDocument;
        const settings = useMemo(() => resolveSceneSettings(sceneDocument.settings), [sceneDocument.settings]);
        return (
          <SceneDrivenUniformsScope scene={sceneDocument} sceneSettings={settings}>
            <MeshVisual component={data.mesh} graphAnimationCues={NO_CUES} playing={mode === "play"} assets={data.assets}
              selected={false} materialDropHighlighted={false} viewportMaterialStyle="scene" projectPath="isolated-custom-shader-model-fixture" />
          </SceneDrivenUniformsScope>
        );
      };
      root.render(wrap(<Host />));
    } else if (mode === "jsx") {
      const generated = await import(/* @vite-ignore */ `${directory}src/World.tsx`);
      root.render(wrap(React.createElement(generated.World)));
    } else if (mode === "runtime") {
      // What the browser publication shell mounts, here from source.
      root.render(wrap(<Physics paused><XriftWorld manifest={`${location.origin}${directory}${data.runtimeManifest}`} physics="inherit" /></Physics>));
    } else {
      // The shell as it is published from the browser: the build in public/,
      // reading its manifest and files from its own folder.
      const World = await loadBuiltShellWorld(`${location.origin}/xrift-runtime-shell/remoteEntry.js`);
      root.render(wrap(<Physics paused>{React.createElement(World)}</Physics>));
    }
    const meshes = await waitFor(foliage, "the Model did not load with its Custom Shader");

    // The clock swings the leaves out and back; the wind says how far.
    const swayOut = frame(Math.PI / 2, meshes);
    const swayBack = frame(Math.PI * 1.5, meshes);
    const report = {
      mode,
      frames: { swayOut, swayBack },
      values: read(meshes),
      /** Whether each mesh wears the variant its name picks. */
      leaves: Object.fromEntries(MESH_NAMES.map((name) => [name, "LEAVES" in (meshes.get(name)!.material.defines ?? {})])),
      materials: new Set(MESH_NAMES.map((name) => meshes.get(name)!.material)).size,
      glError: renderer.getContext().getError(),
      /** After the Scene changed: the same Materials, the new values and the frame they draw. */
      changed: undefined as { values: ReturnType<typeof read>; frame: string; rebuilt: string[] } | undefined,
    };

    if (editor.applyScene) {
      // The author changes the Scene's wind, key light and ambient.
      editor.applyScene(changedScene(data.scene));
      // Long enough for the Scene View to pass the change on. What the
      // Materials hold by then is reported, whether or not they followed.
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (foliage()?.get("Trunk")!.material.uniforms.uWindSpeed!.value === 0.5) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const moved = await waitFor(foliage, "the Model was lost when the Scene changed");
      report.changed = {
        frame: frame(Math.PI / 2, moved),
        values: read(moved),
        // The Model is not rebuilt for a change of the Scene: its Materials take the values.
        rebuilt: MESH_NAMES.filter((name) => moved.get(name) !== meshes.get(name) || moved.get(name)!.material !== meshes.get(name)!.material),
      };
    }
    return report;
  } finally {
    tauri.readProjectFileDataUrl = originalRead;
    root.unmount();
    await new Promise((resolve) => setTimeout(resolve, 40));
    target.dispose();
    renderer.dispose();
  }
}
