import { createRoot, type Root } from "react-dom/client";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BUILTIN_RECIPE_MODELS } from "../src/lib/visual-editor/builtin-recipe-models";
import { SCENE_RECIPES } from "../src/lib/visual-editor/scene-recipe-catalog";
import { SceneRecipeCatalogPreview } from "../src/components/visual-editor/SceneRecipeCatalogPreview";
import { disposeCatalogModel } from "../src/components/visual-editor/dispose-catalog-model";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
const tracked = new Set<THREE.BufferGeometry>();
const disposed = new Set<THREE.BufferGeometry>();
const toonMaterials: Array<{ legacy: boolean; outline: boolean; width: number; sharesGeometry: boolean }> = [];
const toonLights = new Map<boolean, Array<{ type: string; intensity: number; position: number[] }>>();
const originalBeforeRender = THREE.Mesh.prototype.onBeforeRender;
THREE.Mesh.prototype.onBeforeRender = function (renderer, scene, camera, geometry, inputMaterial, group) {
  const material = inputMaterial as THREE.Material & { isMToonMaterial?: boolean; isOutline?: boolean; v0CompatShade?: boolean };
  if (material.isMToonMaterial && !material.isOutline) {
    const lights: Array<{ type: string; intensity: number; position: number[] }> = [];
    scene.traverse(object => {
      if (object instanceof THREE.Light) lights.push({ type: object.type, intensity: object.intensity, position: object.position.toArray() });
    });
    toonLights.set(material.v0CompatShade === true, lights);
  }
  return originalBeforeRender.call(this, renderer, scene, camera, geometry, inputMaterial, group);
};
const originalLoad = GLTFLoader.prototype.load;
GLTFLoader.prototype.load = function (url, onLoad, onProgress, onError) {
  return originalLoad.call(this, url, gltf => {
    gltf.scene.traverse(object => {
      const geometry = (object as THREE.Mesh).geometry;
      if (!geometry || tracked.has(geometry)) return;
      tracked.add(geometry);
      geometry.addEventListener("dispose", () => disposed.add(geometry));
    });
    onLoad(gltf);
    gltf.scene.traverse(object => {
      const mesh=object as THREE.Mesh;
      if(!mesh.isMesh) return;
      for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
        const toon=material as THREE.Material & {isMToonMaterial?:boolean;v0CompatShade?:boolean;isOutline?:boolean;outlineWidthFactor?:number};
        if(!toon.isMToonMaterial) continue;
        toonMaterials.push({legacy:toon.v0CompatShade===true,outline:toon.isOutline===true,width:toon.outlineWidthFactor??0,
          sharesGeometry:!toon.isOutline||mesh.geometry===(mesh.parent as THREE.Mesh).geometry});
      }
    });
  }, onProgress, onError);
};
export function resourceCounts() { return { loaded: tracked.size, disposed: disposed.size }; }
export function mtoonPreviewMaterials() { return toonMaterials; }
export function mtoonPreviewLights() { return [...toonLights.entries()]; }
export function unmount() { root?.unmount(); host?.remove(); }
export function mount(ids: string[], live = false) {
  unmount();
  document.getElementById("root")!.style.display = "none";
  host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;gap:16px;padding:24px;background:white";
  document.body.append(host);
  root = createRoot(host);
  root.render(<>{ids.map(id => {
    const recipe = SCENE_RECIPES.find(entry => entry.id === `scene-recipe.${id}`)!;
    return <section key={id} style={{ width: 380 }} aria-label={recipe.name}>
      <h2>{recipe.name}</h2><div style={{ height: 300 }}>
        <SceneRecipeCatalogPreview recipe={recipe} live={live} />
      </div>
    </section>;
  })}</>);
}

export async function renderModels() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(160, 120, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.01, 1000);
  let rendered = 0;
  try {
    for (const definition of BUILTIN_RECIPE_MODELS) {
      const gltf = await new GLTFLoader().loadAsync(definition.publicPath);
      const scene = new THREE.Scene();
      scene.add(gltf.scene, new THREE.HemisphereLight(0xffffff, 0x555555, 2));
      const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(5, 8, 6); scene.add(light);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length();
      if (!Number.isFinite(size) || size <= 0) throw new Error(`${definition.modelId}: invalid bounds`);
      camera.position.copy(center).add(new THREE.Vector3(0.8, 0.55, 1).multiplyScalar(size));
      camera.lookAt(center);
      try {
        renderer.render(scene, camera);
        const gl = renderer.getContext();
        const pixels = new Uint8Array(160 * 120 * 4);
        gl.readPixels(0, 0, 160, 120, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        if (!pixels.some((value, index) => index % 4 !== 3 && value > 10)) throw new Error(`${definition.modelId}: empty image`);
        rendered++;
      } finally { disposeCatalogModel(gltf.scene); renderer.renderLists.dispose(); }
    }
  } finally { renderer.dispose(); renderer.forceContextLoss(); }
  return { rendered, expected: BUILTIN_RECIPE_MODELS.length, ...resourceCounts() };
}
