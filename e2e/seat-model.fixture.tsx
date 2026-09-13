import { StrictMode, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import { XRiftProvider, useXRift, Seat as OriginalSeat, Vehicle, createDefaultSeatImplementation } from "@xrift/world-components";
import { Seat } from "../packages/xrift-studio-runtime/src/script/world-components";
import { Box3, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PlayInteractionHost } from "../src/components/visual-editor/PlayInteractionHost";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let setModel: (model: Object3D | null) => void = () => {};
let setEnabled: (enabled: boolean) => void = () => {};
let state = { registered: 0, aimed: false, presses: 0, driverRegistered: false };
const original = new URLSearchParams(location.search).get("originalSeat") === "true";
const TestedSeat = original ? OriginalSeat : Seat;

function Sample() {
  const { interactableObjects } = useXRift();
  const [model, updateModel] = useState<Object3D | null>(null);
  const [enabled, updateEnabled] = useState(true);
  useEffect(() => {
    setModel = updateModel; setEnabled = updateEnabled;
    const timer = window.setInterval(() => { state.registered = interactableObjects.size; }, 20);
    return () => window.clearInterval(timer);
  }, [interactableObjects]);
  return <>
    <ambientLight intensity={2} />
    <Vehicle id="test-vehicle" onDrive={() => {}}>
      <TestedSeat id="test-seat" driver enabled={enabled}>
        <group>{model ? <primitive object={model} /> : null}</group>
      </TestedSeat>
    </Vehicle>
    <PlayInteractionHost active mode="crosshair" onAimChange={value => { state.aimed = value; }} />
  </>;
}

export function mount() {
  root?.unmount(); host?.remove();
  state = { registered: 0, aimed: false, presses: 0, driverRegistered: false };
  document.getElementById("root")!.style.display = "none";
  host = document.createElement("div"); host.style.cssText = "position:fixed;inset:0;background:white";
  document.body.append(host);
  const seats = createDefaultSeatImplementation();
  const implementation = { ...seats,
    registerSeat: (id: string, entry: Parameters<typeof seats.registerSeat>[1]) => {
      seats.registerSeat(id, entry);
      state.driverRegistered = entry.drivesVehicleId === "test-vehicle" && Boolean(entry.onControlInput);
    },
    sit: () => { state.presses++; },
  };
  root = createRoot(host);
  root.render(<StrictMode><XRiftProvider baseUrl="/" seatImplementation={implementation}>
    <Canvas camera={{ position: [0, 0, 2] }}><Sample /></Canvas>
  </XRiftProvider></StrictMode>);
}
export async function load() {
  const { scene } = await new GLTFLoader().loadAsync("/visual-editor/world-assets/seat.glb");
  const centre = new Box3().setFromObject(scene).getCenter(new Vector3());
  scene.position.sub(centre); setModel(scene);
}
export function disable() { setEnabled(false); }
export function enable() { setEnabled(true); }
export function remove() { setModel(null); }
export function read() { return { ...state }; }
