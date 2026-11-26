import { _roots, Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { XRiftProvider } from "@xrift/world-components";
import { Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Box3,
  OrthographicCamera,
  Vector3,
  WebGLRenderTarget,
  type Material,
  type Mesh,
  type Object3D,
  type ShaderMaterial,
  type WebGLRenderer,
} from "three";

import { emitXriftSceneEvent } from "../packages/xrift-studio-runtime/src/script/scene-runtime";
import { tauri } from "../src/lib/tauri";
import { compileVisualProject } from "../src/lib/visual-editor/compiler/compile";
import { listScriptAssets } from "../src/lib/visual-editor/scripting/script-files";
import {
  assetManifestCodec,
  prefabDocumentCodec,
  sceneDocumentCodec,
  visualProjectDocumentCodec,
  type VisualDocumentCodec,
} from "../src/lib/visual-editor/serialization";

export type UniformSurface = "editor" | "published";

export type UniformProbe = {
  /** What the Script left on its Entity for the test to read. */
  report: unknown;
  materials: Array<{
    uuid: string;
    type: string;
    /** Raised by three.js whenever a Material asks for its program again. */
    version: number;
    /** Each uniform as the renderer would upload it. */
    uniforms: Record<string, unknown>;
    /** The Mesh drawn alone with this Material by the surface's own renderer. */
    pixel: [number, number, number];
  }>;
};

const PUBLISHED_HOST_ID = "published-shader-uniforms";
let publishedRoot: Root | null = null;
let publishedEvents: typeof emitXriftSceneEvent | null = null;

function surfaceScenes(surface: UniformSurface) {
  const host = document.getElementById(PUBLISHED_HOST_ID);
  return [..._roots.entries()]
    .filter(
      ([canvas]) =>
        Boolean(host && canvas instanceof HTMLCanvasElement && host.contains(canvas)) ===
        (surface === "published"),
    )
    .map(([, root]) => root.store.getState());
}

function entityMarker(object: Object3D): string | undefined {
  const data = object.userData as {
    renderedEntityId?: unknown;
    xriftEntityId?: unknown;
  };
  const marker = data.renderedEntityId ?? data.xriftEntityId;
  return typeof marker === "string" ? marker : undefined;
}

function findEntity(surface: UniformSurface, entityId: string) {
  for (const state of surfaceScenes(surface)) {
    let found: Object3D | null = null;
    state.scene.traverse((object) => {
      if (!found && entityMarker(object) === entityId) found = object;
    });
    if (found) return { state, object: found as Object3D };
  }
  return null;
}

function jsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number(value.toFixed(4));
  if (typeof value !== "object") return String(value);
  if ((value as { isTexture?: boolean }).isTexture) return "texture";
  const math = value as { elements?: number[]; toArray?: () => number[] };
  const list = math.elements ?? (typeof math.toArray === "function" ? math.toArray() : Array.from(value as ArrayLike<number>));
  return list.map((entry) => Number(entry.toFixed(4)));
}

/**
 * Draws one Mesh alone, from straight above, into a small offscreen target
 * with the renderer and the Material object the surface itself uses. This is
 * the value the GPU received, not what the uniform table claims.
 */
function drawPixel(gl: WebGLRenderer, mesh: Mesh): [number, number, number] {
  const center = new Box3().setFromObject(mesh).getCenter(new Vector3());
  const camera = new OrthographicCamera(-0.05, 0.05, 0.05, -0.05, 0.01, 100);
  camera.position.copy(center).add(new Vector3(0, 20, 0));
  camera.up.set(0, 0, -1);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const target = new WebGLRenderTarget(4, 4);
  const previous = gl.getRenderTarget();
  const pixel = new Uint8Array(4);
  try {
    gl.setRenderTarget(target);
    gl.clear();
    gl.render(mesh, camera);
    gl.readRenderTargetPixels(target, 2, 2, 1, 1, pixel);
  } finally {
    gl.setRenderTarget(previous);
    target.dispose();
  }
  return [pixel[0]!, pixel[1]!, pixel[2]!];
}

export function probeEntity(surface: UniformSurface, entityId: string): UniformProbe | null {
  const entity = findEntity(surface, entityId);
  if (!entity) return null;
  const materials: UniformProbe["materials"] = [];
  const visit = (object: Object3D) => {
    if (object !== entity.object && entityMarker(object) && entityMarker(object) !== entityId) return;
    const mesh = object as Mesh;
    if (mesh.isMesh) {
      const drawn = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material | undefined;
      const uniforms = (drawn as ShaderMaterial | undefined)?.uniforms;
      if (drawn && uniforms) {
        materials.push({
          uuid: drawn.uuid,
          type: drawn.type,
          version: drawn.version,
          uniforms: Object.fromEntries(
            Object.entries(uniforms)
              .filter(([name]) => name.startsWith("u"))
              .map(([name, uniform]) => [name, jsonValue(uniform.value)]),
          ),
          pixel: drawPixel(entity.state.gl, mesh),
        });
      }
    }
    for (const child of object.children) visit(child);
  };
  visit(entity.object);
  // `ctx.object3d` is the Entity's group, which a surface may nest inside or
  // around the object that carries the Entity id.
  let report: unknown;
  const readReport = (object: Object3D) => {
    report ??= (object.userData as { uniformTest?: unknown }).uniformTest;
  };
  const visitReport = (object: Object3D) => {
    if (object !== entity.object && entityMarker(object) && entityMarker(object) !== entityId) return;
    readReport(object);
    for (const child of object.children) visitReport(child);
  };
  visitReport(entity.object);
  for (let parent = entity.object.parent; parent && !entityMarker(parent); parent = parent.parent) {
    readReport(parent);
  }
  return { report: report === undefined ? null : JSON.parse(JSON.stringify(report)), materials };
}

/** Sends the named notification a Script receives through `ctx.graph.on`. */
export function sendSceneEvent(surface: UniformSurface, name: string): void {
  const emit = surface === "published" ? publishedEvents : emitXriftSceneEvent;
  if (!emit) throw new Error("The published World is not mounted");
  for (const state of surfaceScenes(surface)) emit(name, new Map(), state.scene);
}

function parseDocument<Document>(codec: VisualDocumentCodec<Document>, content: string, label: string): Document {
  const parsed = codec.parse(content);
  if (!parsed.ok) throw new Error(`${label}: ${JSON.stringify(parsed.issues)}`);
  return parsed.document;
}

/**
 * Compiles the project the Editor saved, with the compiler the publish flow
 * calls and the same documents it hands over. Nothing is uploaded.
 */
export async function compileSavedProject(projectName: string) {
  const project = window.__XRIFT_RELEASE_E2E__?.projects.find((candidate) => candidate.name === projectName);
  if (!project) throw new Error(`Project not found: ${projectName}`);
  const files = await tauri.readVisualProject(project.path);
  const assets = parseDocument(assetManifestCodec, files.assetManifestJson, "assets");
  const scenes = files.sceneDocuments.map((file) => parseDocument(sceneDocumentCodec, file.content, file.relativePath));
  const prefabs = files.prefabDocuments.map((file) => parseDocument(prefabDocumentCodec, file.content, file.relativePath));
  const scriptSources: Record<string, string> = {};
  for (const asset of listScriptAssets(assets)) {
    scriptSources[asset.id] = await tauri.readTextFile(project.path, asset.source.relativePath);
  }
  const compiled = compileVisualProject({
    project: parseDocument(visualProjectDocumentCodec, files.projectJson, "project"),
    scenes: Object.fromEntries(scenes.map((scene) => [scene.sceneId, scene])),
    assets,
    prefabs: Object.fromEntries(prefabs.map((prefab) => [prefab.prefabId, prefab])),
    scriptSources,
  });
  return {
    canStage: compiled.canStage,
    diagnostics: compiled.diagnostics,
    overlayFiles: compiled.overlayFiles.map((file) => ({ relativePath: file.relativePath, content: file.content })),
  };
}

/** Mounts the generated World beside the Editor, in its own Canvas. */
export async function mountPublishedWorld(baseUrl: string): Promise<void> {
  const { World } = await import(/* @vite-ignore */ `${baseUrl}/src/World.tsx`);
  publishedEvents = (await import(/* @vite-ignore */ `${baseUrl}/src/xrift-studio/scene-runtime.tsx`)).emitXriftSceneEvent;
  const host = document.createElement("div");
  host.id = PUBLISHED_HOST_ID;
  Object.assign(host.style, { position: "fixed", right: "0", bottom: "0", width: "480px", height: "320px", zIndex: "9999" });
  document.body.append(host);
  publishedRoot = createRoot(host);
  publishedRoot.render(
    <XRiftProvider baseUrl={new URL(`${baseUrl}/public/`, location.href).href}>
      <Canvas dpr={1} camera={{ position: [0.5, 3, 5], fov: 50 }} onCreated={({ camera }) => camera.lookAt(0, 0.3, 0)}>
        <color attach="background" args={["#18181b"]} />
        <Suspense fallback={null}>
          <Physics>
            <World />
          </Physics>
        </Suspense>
      </Canvas>
    </XRiftProvider>,
  );
}

export function unmountPublishedWorld(): void {
  publishedRoot?.unmount();
  publishedRoot = null;
  publishedEvents = null;
  document.getElementById(PUBLISHED_HOST_ID)?.remove();
}
