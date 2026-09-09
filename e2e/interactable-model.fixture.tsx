import { StrictMode, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { XRiftProvider, useXRift } from "@xrift/world-components";
import { Box3, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OfficialXriftEntityWrappers } from "../src/components/visual-editor/OfficialXriftComponentRenderer";
import { PlayInteractionHost } from "../src/components/visual-editor/PlayInteractionHost";
import { createXriftComponent, XRIFT_COMPONENT_SCHEMA_IDS } from "../src/lib/visual-editor/component-registry";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let setModel: (model: Object3D | null) => void = () => {};
let setEnabled: (enabled: boolean) => void = () => {};
let state = { registered: 0, aimed: false, presses: 0, loaded: false };
const component = createXriftComponent(XRIFT_COMPONENT_SCHEMA_IDS.interactable, {
  properties: { id: "delayed-gimmick-button", interactionText: "押す" },
})!;

function Sample() {
  const { interactableObjects } = useXRift();
  const [model, updateModel] = useState<Object3D | null>(null);
  const [enabled, updateEnabled] = useState(true);
  useEffect(() => {
    setModel = updateModel;
    setEnabled = updateEnabled;
    const timer = window.setInterval(() => { state.registered = interactableObjects.size; }, 20);
    return () => window.clearInterval(timer);
  }, [interactableObjects]);
  return <>
    <ambientLight intensity={2} />
    <OfficialXriftEntityWrappers
      components={[{ ...component, properties: { ...component.properties, enabled } }]}
      onInteract={() => { state.presses++; }}
    >
      <group>{model ? <primitive object={model} /> : null}</group>
    </OfficialXriftEntityWrappers>
    <PlayInteractionHost active mode="crosshair" onAimChange={value => { state.aimed = value; }} />
  </>;
}

export function mount() {
  root?.unmount(); host?.remove();
  state = { registered: 0, aimed: false, presses: 0, loaded: false };
  document.getElementById("root")!.style.display = "none";
  host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;background:white";
  document.body.append(host);
  root = createRoot(host);
  root.render(<StrictMode><XRiftProvider baseUrl="/"><Canvas camera={{ position: [0, 0, 2] }}><Sample /></Canvas></XRiftProvider></StrictMode>);
}

export async function load() {
  const { scene } = await new GLTFLoader().loadAsync("/visual-editor/catalog-samples/catalog-knob.glb");
  const centre = new Box3().setFromObject(scene).getCenter(new Vector3());
  scene.position.sub(centre);
  setModel(scene);
  state.loaded = true;
}
export function disable() { setEnabled(false); }
export function enable() { setEnabled(true); }
export function remove() { setModel(null); }
export function read() { return { ...state }; }
