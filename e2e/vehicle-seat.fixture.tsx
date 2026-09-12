import { PlayInteractionHost } from "../src/components/visual-editor/PlayInteractionHost";
import { Suspense, useLayoutEffect, useState, useSyncExternalStore, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics, RigidBody } from "@react-three/rapier";
import { XRiftProvider } from "@xrift/world-components";
import { WorldPlayPlayer, useWorldPlayGrabStore, useWorldPlayTeleport, useWorldPlayUsers } from "../src/components/visual-editor/WorldPlayPlayer";
import { createWorldPlaySeatStore } from "../src/components/visual-editor/world-play-seat-store";

import { loadScriptModule } from "../src/lib/script-modules";
import { createScriptTemplateSource } from "../src/lib/visual-editor/scripting/script-templates";
type TemplateRender = ComponentType<{ ctx: { entity: { id: string }; props: Record<string, string | number> } }>;
export async function mountVehicleSeatFixture() {
  const loaded = await loadScriptModule(createScriptTemplateSource("vehicle", "Vehicle")!, "vehicle.tsx");
  if (!loaded.ok) throw new Error(loaded.message);
  const VehicleRender = loaded.module.Render as TemplateRender;
  const chair = await loadScriptModule(createScriptTemplateSource("seat", "Seat")!, "seat.tsx");
  if (!chair.ok) throw new Error(chair.message);
  const SeatRender = chair.module.Render as TemplateRender;
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  createRoot(host).render(<Fixture VehicleRender={VehicleRender} SeatRender={SeatRender} />);
}
function Fixture({ VehicleRender, SeatRender }: { VehicleRender: TemplateRender; SeatRender: TemplateRender }) {
  const [store] = useState(createWorldPlaySeatStore);
  const grabs = useWorldPlayGrabStore();
  const users = useWorldPlayUsers();
  const teleport = useWorldPlayTeleport();
  const [playing, setPlaying] = useState(true);
  const [aim, setAim] = useState(0);
  const [chairAim, setChairAim] = useState(0);
  const [aimHit, setAimHit] = useState(false);
  const [distance, setDistance] = useState(0);
  const [ready, setReady] = useState(false);
  const occupant = useSyncExternalStore(store.contextValue.subscribeOccupancy, () => store.getEntry() ? "seated" : "none");
  function Ready() {
    useFrame(() => { setReady(true); const entry = store.getEntry(); if (entry) setDistance(entry.getSeatSurface().position.z - 0.05); });
    return null;
  }
  return <>
    <button onClick={() => setAim(value => value + 1)}>Aim at driver</button>
    <button onClick={() => setChairAim(value => value + 1)}>Aim at chair</button>
    <button onClick={() => store.contextValue.sit("vehicle-fixture-cart-passenger")}>Sit passenger</button>
    <button onClick={() => setPlaying(false)}>Stop</button>
    <output data-testid="ready">{ready ? "ready" : "loading"}</output>
    <output data-testid="aim">{aimHit ? "hit" : "none"}</output>
    <output data-testid="occupied">{occupant}</output>
    <output data-testid="distance">{distance}</output>
    <div style={{ width: 800, height: 500 }}>
      <Canvas camera={{ position: [0, 1.44, 3] }}>
        <ambientLight intensity={2} />
        <Suspense fallback={null}>
          <Physics>
            <XRiftProvider baseUrl="" seatImplementation={store.contextValue} usersImplementation={users.implementation}>
              <PlayInteractionHost active={playing} mode="crosshair" onAimChange={setAimHit} />
              <RigidBody type="fixed"><mesh position={[0, -0.1, 0]}><boxGeometry args={[100, 0.2, 100]} /><meshStandardMaterial /></mesh></RigidBody>
              {playing && <>
                <VehicleRender ctx={{ entity: { id: "fixture" }, props: { instanceId: "cart", speed: 3, turnRate: 1.5 } }} />
                <group position={[2, 0, 1]}><SeatRender ctx={{ entity: { id: "chair-fixture" }, props: { instanceId: "seat", height: 0.5 } }} /></group>
                <WorldPlayPlayer spawnPosition={[0, 0.8, 3]} spawnYaw={0} allowInfiniteJump={false} grabStore={grabs} seatStore={store} movementRef={users.movementRef} teleportMoverRef={teleport.moverRef} />
                <Ready />
                <AimDriver requested={aim} />
                <AimChair requested={chairAim} />
              </>}
            </XRiftProvider>
          </Physics>
        </Suspense>
      </Canvas>
    </div>
  </>;
}

function AimDriver({ requested }: { requested: number }) {
  const camera = useThree(state => state.camera);
  useLayoutEffect(() => { if (requested) camera.lookAt(-0.4, 0.85, 0.05); }, [camera, requested]);
  return null;
}

function AimChair({ requested }: { requested: number }) {
  const camera = useThree(state => state.camera);
  useLayoutEffect(() => { if (requested) camera.lookAt(2, 0.5, 1); }, [camera, requested]);
  return null;
}

/** Visual review only: callbacks deliberately do not simulate successful writes. */
export async function mountVehicleCatalogFixture() {
  const storeUrl = "/src/components/visual-editor/OfficialXriftComponentStore.tsx";
  const { OfficialXriftComponentStore } = await import(storeUrl) as {
    OfficialXriftComponentStore: ComponentType<{ projectKind: "world"; onAdd: () => Promise<boolean>; onAddWorldAsset: () => Promise<boolean> }>;
  };
  await import("../src/components/visual-editor/external-asset-store.css");
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  createRoot(host).render(<div data-responsive-asset-modal style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
    <div className="external-catalog-content" data-pane="list">
      <OfficialXriftComponentStore projectKind="world" onAdd={async () => false} onAddWorldAsset={async () => false} />
    </div>
  </div>);
}
