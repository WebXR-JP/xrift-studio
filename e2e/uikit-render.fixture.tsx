import { _roots, Canvas } from "@react-three/fiber";
import { createRoot } from "react-dom/client";
import { XRiftProvider } from "@xrift/world-components";
import { Vector3, Quaternion } from "three";

export function uikitCamera() {
  const state = [..._roots.values()][0]!.store.getState();
  return { position: state.camera.getWorldPosition(new Vector3()).toArray() as [number, number, number], quaternion: state.camera.getWorldQuaternion(new Quaternion()).toArray(), fov: (state.camera as unknown as { fov: number }).fov, width: state.size.width, height: state.size.height, toneMapping: state.gl.toneMapping, exposure: state.gl.toneMappingExposure };
}

export function publishedRoundedTextReady(): boolean {
  const root = [..._roots.values()].at(-1);
  let ready = false;
  root?.store.getState().scene.traverse(object => {
    const text = (object as unknown as { text?: { text: string; visible: boolean; textRenderInfo?: { blockBounds?: unknown } } }).text;
    if (text?.text !== "角丸の案内") return;
    ready ||= text.visible && Boolean(text.textRenderInfo?.blockBounds);
  });
  return ready;
}

export async function mountPublishedUikit(moduleUrl: string, camera: ReturnType<typeof uikitCamera>) {
  const { World } = await import(/* @vite-ignore */ moduleUrl);
  const host = document.createElement("div");
  host.id = "published-uikit-fixture";
  Object.assign(host.style, { position: "fixed", left: "0", top: "0", width: `${camera.width}px`, height: `${camera.height}px`, zIndex: "9999" });
  document.body.append(host);
  const baseUrl = new URL("../public/", new URL(moduleUrl, location.href)).href;
  createRoot(host).render(<XRiftProvider baseUrl={baseUrl}><Canvas dpr={1} camera={{ position: camera.position, fov: camera.fov, quaternion: camera.quaternion as [number, number, number, number] }}
    onCreated={({ gl, camera: createdCamera }) => { gl.toneMapping = camera.toneMapping; gl.toneMappingExposure = camera.exposure; createdCamera.quaternion.fromArray(camera.quaternion); createdCamera.updateMatrixWorld(); }}>
    <color attach="background" args={["#18181b"]} /><World />
  </Canvas></XRiftProvider>);
}

/** Inspect the actual library's rendered geometry, not a DOM substitute. */
export function uikitGlyphCount(): number {
  let count = 0;
  for (const root of _roots.values()) root.store.getState().scene.traverse(object => {
    if (object.constructor.name !== "InstancedGlyphMesh") return;
    count += (object as unknown as { count: number }).count;
  });
  return count;
}

/** Overflowing a font atlas can produce bars while Script diagnostics stay clean. */
export function uikitInvalidGlyphUvCount(): number {
  let invalid = 0;
  for (const root of _roots.values()) root.store.getState().scene.traverse(object => {
    if (object.constructor.name !== "InstancedGlyphMesh") return;
    const mesh = object as unknown as { count: number; instanceUV: { array: ArrayLike<number> } };
    const data = mesh.instanceUV.array;
    for (let index = 0; index < mesh.count; index++) {
      const [x, y, width, height] = Array.from({ length: 4 }, (_, axis) => data[index * 4 + axis]!);
      if (![x!, y!, x! + width!, y! + height!].every(value => Number.isFinite(value) && value >= -0.0001 && value <= 1.0001)) invalid++;
    }
  });
  return invalid;
}
