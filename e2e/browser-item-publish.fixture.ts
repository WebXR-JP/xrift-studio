import { createBrowserProject, saveBrowserVisualProject, writeBrowserTextFile } from "../src/lib/browser-project-storage";
import { createPrototypeProject, BUILTIN_ASSET_IDS } from "../src/lib/visual-editor/prototype-project";
import { serializeVisualProjectDocuments } from "../src/lib/visual-editor/persistence";
import { createDefaultCustomShader } from "../src/lib/visual-editor/custom-shader-contract";
import { createScriptComponent } from "../src/lib/visual-editor/scene-document";
import { SCRIPT_ASSET_CONTRACT_VERSION } from "../src/lib/visual-editor/asset-manifest";
import * as rendering from "./vrm-mtoon-render.fixture";

/** Independent IndexedDB project using the same persistence codec as the editor. */
export async function seedBrowserItem(mode: "shader" | "script") {
  const bundle = createPrototypeProject("item", `Item ${mode}公開検証`);
  if (mode === "shader") {
    const material = bundle.assets.assets[BUILTIN_ASSET_IDS.material.violet];
    if (material?.kind !== "material") throw new Error("Item fixture Material missing");
    material.shader = { ...createDefaultCustomShader(), animatedTimeUniform: undefined,
      fragmentShader: "void main() { gl_FragColor = vec4(0.9, 0.12, 0.03, 1.0); }", uniforms: {} };
  } else {
    const assetId = "asset-item-script-fixture";
    bundle.assets.assets[assetId] = { id: assetId, name: "Item Script", kind: "script", status: "ready",
      contractVersion: SCRIPT_ASSET_CONTRACT_VERSION, language: "ts", source: { kind: "project", relativePath: "scripts/item.ts" } };
    bundle.scene.entities["entity-item-object"]!.components.push(createScriptComponent("component-item-script-fixture", assetId)!);
  }
  const projectPath = await createBrowserProject();
  await saveBrowserVisualProject(projectPath, serializeVisualProjectDocuments({ project: bundle.project,
    scenes: { [bundle.scene.sceneId]: bundle.scene }, assets: bundle.assets, prefabs: bundle.prefabs }));
  if (mode === "script") await writeBrowserTextFile(projectPath, "scripts/item.ts",
    'import { defineScript } from "xrift:script"; export default defineScript({ name: "Item Script", start() {} });');
  return bundle.project.metadata.name;
}

/** Render the actual uploaded ./Item federation module and compare its pixels to the shared loader. */
export async function renderPublishedItem(base: string) {
  const m = rendering;
  const T = m.THREE;
  m.extend({ Mesh: T.Mesh, Group: T.Group, AmbientLight: T.AmbientLight, DirectionalLight: T.DirectionalLight });
  const manifest = await fetch(`${base}xrift-runtime.json`).then(response => response.json());
  const Item = await m.loadBuiltShellWorld(`${base}remoteEntry.js`, "./Item");
  const renderer = new T.WebGLRenderer(); renderer.setSize(96, 96);
  const target = new T.WebGLRenderTarget(96, 96);
  const scene = new T.Scene(); scene.background = new T.Color(0, 0, 0);
  const camera = new T.OrthographicCamera(-0.7, 0.7, 0.7, -0.7, 0.1, 10);
  Object.assign(camera, { manual: true });
  camera.position.set(0, 0.75, 3); camera.lookAt(0, 0.75, 0); camera.updateMatrixWorld(true);
  const root = m.createRoot(document.createElement("canvas"));
  await root.configure({ gl: renderer, scene, camera, frameloop: "never", flat: true, linear: true,
    size: { width: 96, height: 96, top: 0, left: 0 }, events: undefined });
  root.render(m.React.createElement(m.XRiftProvider, { baseUrl: base, children: m.React.createElement(Item) }));
  let surface: import("three").Mesh | undefined;
  for (let attempt = 0; attempt < 120; attempt++) {
    scene.traverse(object => {
      const mesh = object as import("three").Mesh;
      if (mesh.isMesh && (mesh.material as import("three").ShaderMaterial)?.isShaderMaterial) surface = mesh;
    });
    if (surface) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (!surface) throw new Error("Built Item shell did not render the authored ShaderMaterial");
  const source = await new m.XriftThreeLoader({ assetBaseUrl: base }).parse(manifest);
  const control = new T.Scene(); control.add(source.root);
  for (const sample of [scene, control]) {
    sample.traverse(object => { if (object.name === "xrift-scene-skybox") object.visible = false; });
    sample.background = new T.Color(0, 0, 0); sample.updateMatrixWorld(true);
  }
  renderer.outputColorSpace = T.LinearSRGBColorSpace; renderer.toneMapping = T.NoToneMapping; renderer.setRenderTarget(target);
  const pixels = (sample: import("three").Scene) => {
    renderer.render(sample, camera); const values = new Uint8Array(96 * 96 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 96, 96, values); return [...values];
  };
  const report = { actual: pixels(scene), expected: pixels(control), shader: (surface.material as import("three").ShaderMaterial).fragmentShader,
    position: surface.getWorldPosition(new T.Vector3()).toArray() };
  root.unmount(); m.disposeXriftLoadResult(source); target.dispose(); renderer.dispose();
  return report;
}
