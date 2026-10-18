import React, { Suspense, useEffect } from "react";
import { createRoot, extend } from "@react-three/fiber";
import { Physics, useRapier } from "@react-three/rapier";
import { XRiftProvider } from "@xrift/world-components";
import * as THREE from "three";
import { PrimitiveMeshVisual, RuntimePhysicsEntity } from "../src/components/visual-editor/SceneViewport";
import { XriftThreeLoader, disposeXriftLoadResult } from "../packages/xrift-studio-runtime/src/three/index";
import { loadBuiltShellWorld } from "./vrm-mtoon-render.fixture";
import type { AssetManifest, MaterialAsset } from "../src/lib/visual-editor/asset-manifest";
import type { MeshComponent, SceneEntity } from "../src/lib/visual-editor/scene-document";
import type { XriftRuntimeManifest } from "../packages/xrift-studio-runtime/src/schema";

extend(THREE);
const directory = "/node_modules/.cache/xrift-studio/extrude-render-parity/";
type Mode = "edit" | "play" | "jsx" | "three" | "shell";
type Fixture = { manifest: XriftRuntimeManifest; mesh: MeshComponent; material: MaterialAsset; assets: AssetManifest };

export async function renderExtrudeParity(mode: Mode) {
  const data = await fetch(`${directory}fixture.json`).then(response => response.json()) as Fixture;
  const entity: SceneEntity = { id: "extrude-specimen", name: "Concave extrusion", parentId: null, children: [], enabled: true,
    components: [{ id: "transform", type: "transform", enabled: true, position: [-1, -1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      { id: "collider", type: "collider", enabled: true, shape: "mesh", meshMode: "trimesh", fitMode: "auto", isTrigger: false, friction: 0.5, restitution: 0, bodyType: "fixed" }] };
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(160, 160);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(2.6, 2, 5.2); camera.lookAt(0, 0, 0.2); camera.updateMatrixWorld();
  const target = new THREE.WebGLRenderTarget(160, 160);
  const root = createRoot(document.createElement("canvas"));
  let physics: ReturnType<typeof useRapier> | undefined;
  function Probe() { const value = useRapier(); useEffect(() => { physics = value; }, [value]); return null; }
  const collectMeshes = () => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object.geometry.type !== "ExtrudeGeometry") return;
      if (!(Array.isArray(object.material) ? object.material.some(material => material.visible) : object.material.visible)) return;
      for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (!parent.visible) return;
      meshes.push(object);
    });
    return meshes;
  };
  let loaded: Awaited<ReturnType<XriftThreeLoader["load"]>> | undefined;
  try {
    await root.configure({ gl: renderer, scene, camera, frameloop: "never", size: { width: 160, height: 160, top: 0, left: 0 }, events: undefined });
    let content: React.ReactNode;
    if (mode === "edit" || mode === "play") {
      if (data.mesh.geometry?.kind !== "extrude") throw new Error("Extrude source is missing");
      const actualEditorMesh = <PrimitiveMeshVisual component={data.mesh} extrude={data.mesh.geometry.extrude} material={data.material}
        assets={data.assets} selected={false} materialDropHighlighted={false} viewportMaterialStyle="scene" />;
      content = <group position={[-1, -1, 0]}>{mode === "play" ? <RuntimePhysicsEntity entity={entity}>{actualEditorMesh}</RuntimePhysicsEntity> : actualEditorMesh}</group>;
    } else if (mode === "jsx") {
      const generated = await import(/* @vite-ignore */ `${directory}src/World.tsx`);
      content = React.createElement(generated.World);
    } else if (mode === "shell") {
      const World = await loadBuiltShellWorld(`${location.origin}/xrift-runtime-shell/remoteEntry.js`);
      content = React.createElement(World);
    } else {
      loaded = await new XriftThreeLoader().load(data.manifest);
      content = <primitive object={loaded.root} />;
    }
    const hasPhysics = mode === "play" || mode === "jsx" || mode === "shell";
    root.render(<Suspense fallback={null}><XRiftProvider baseUrl={`${location.origin}/xrift-runtime-shell/`}>
      {hasPhysics ? <Physics paused>{content}<Probe /></Physics> : content}
    </XRiftProvider></Suspense>);
    for (let attempt = 0; attempt < 200; attempt++) {
      if (collectMeshes().length === 1 && (!hasPhysics || physics && physics.world.colliders.len() === 1)) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const meshes = collectMeshes();
    if (meshes.length !== 1) {
      const objects: unknown[] = [];
      scene.traverse(object => objects.push({ name: object.name, type: object.type, mesh: (object as THREE.Mesh).isMesh, instance: object instanceof THREE.Mesh, geometry: (object as THREE.Mesh).geometry?.type }));
      throw new Error(`${mode} did not create the authored Extrude mesh: ${JSON.stringify(objects)}`);
    }
    if (hasPhysics && (!physics || physics.world.colliders.len() !== 1)) throw new Error(`${mode} did not register its actual Rapier collider`);
    scene.background = new THREE.Color("#000000"); scene.fog = null;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 1;
    camera.fov = 40; camera.aspect = 1; camera.near = 0.1; camera.far = 100; camera.updateProjectionMatrix();
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    const bytes = new Uint8Array(160 * 160 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 160, 160, bytes);
    const mesh = meshes[0]!;
    const bounds = new THREE.Box3().setFromObject(mesh);
    const material = mesh.material as THREE.MeshBasicMaterial;
    const collision: { inside: boolean; notch: boolean }[] = [];
    if (physics) {
      const activePhysics = physics;
      activePhysics.world.forEachCollider(collider => collision.push({
        inside: collider.castRay(new activePhysics.rapier.Ray({ x: -0.5, y: 0.5, z: 3 }, { x: 0, y: 0, z: -1 }), 100, true) >= 0,
        notch: collider.castRay(new activePhysics.rapier.Ray({ x: 0.5, y: 0.5, z: 3 }, { x: 0, y: 0, z: -1 }), 100, true) >= 0,
      }));
    }
    return { mode, pixels: [...bytes], collision, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      vertices: Array.from(mesh.geometry.getAttribute("position").array), normals: Array.from(mesh.geometry.getAttribute("normal").array),
      uvs: Array.from(mesh.geometry.getAttribute("uv").array), material: { type: material.type, color: material.color.toArray(), opacity: material.opacity, side: material.side },
      colored: [...bytes].filter((value, i) => i % 4 !== 3 && value > 20).length, error: renderer.getContext().getError() };
  } finally {
    root.unmount();
    await new Promise(resolve => setTimeout(resolve, 40));
    if (loaded) disposeXriftLoadResult(loaded);
    target.dispose(); renderer.dispose();
  }
}
