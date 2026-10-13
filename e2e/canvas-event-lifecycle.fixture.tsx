import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, _roots, type RootState } from "@react-three/fiber";
import { WebGLRenderer } from "three";
import { createEditorCanvasEvents, createStaticEditorCanvasEvents } from "../src/lib/visual-editor/canvas-events";

/** Exercise CanvasImpl's real async configure/onCreated after its DOM unmount. */
export async function runCanvasEventTeardownRace(guarded: boolean, staticEvents = false) {
  const host = document.createElement("div");
  host.style.cssText = "width:160px;height:120px";
  document.body.append(host);
  const root = createRoot(host);
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const configuring = new Promise<void>(resolve => { started = resolve; });
  let renderer: WebGLRenderer | undefined;
  let createdState: RootState | undefined;
  let automaticContextLoss = false;
  const factory = guarded ? staticEvents ? createStaticEditorCanvasEvents : createEditorCanvasEvents : undefined;
  root.render(createElement(Canvas, {
    events: factory,
    frameloop: "never",
    gl: async props => {
      started();
      await pending;
      renderer = new WebGLRenderer(props);
      const loseContext = renderer.forceContextLoss.bind(renderer);
      renderer.forceContextLoss = () => { automaticContextLoss = true; loseContext(); };
      return renderer;
    },
    onCreated: state => { createdState = state; },
  }, createElement("mesh", {}, createElement("boxGeometry"), createElement("meshBasicMaterial"))));
  await configuring;
  root.unmount();
  host.remove();
  release();
  await new Promise(resolve => setTimeout(resolve, 650));
  const result = {
    rendererCreated: Boolean(renderer),
    detached: renderer?.domElement.isConnected === false,
    active: createdState?.internal.active ?? null,
    connected: Boolean(createdState?.events.connected),
    registeredRoot: renderer ? _roots.has(renderer.domElement) : false,
    automaticContextLoss,
  };
  renderer?.dispose();
  renderer?.forceContextLoss();
  return result;
}

let pointerCount = 0;
let closePointerFixture: (() => void) | undefined;
export async function mountCanvasPointerFixture() {
  const host = document.createElement("div");
  host.id = "canvas-pointer-fixture";
  host.style.cssText = "width:160px;height:120px";
  document.body.append(host);
  const root = createRoot(host);
  pointerCount = 0;
  let created!: () => void;
  const ready = new Promise<void>(resolve => { created = resolve; });
  root.render(createElement(Canvas, {
    events: createEditorCanvasEvents,
    frameloop: "demand",
    camera: { position: [0, 0, 3] },
    onCreated: () => created(),
  }, createElement("mesh", { onClick: () => { pointerCount++; } }, createElement("boxGeometry"), createElement("meshBasicMaterial"))));
  closePointerFixture = () => { root.unmount(); host.remove(); };
  await ready;
}
export function readCanvasPointerCount() { return pointerCount; }
export function unmountCanvasPointerFixture() { closePointerFixture?.(); closePointerFixture = undefined; }
