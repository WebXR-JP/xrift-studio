import { XriftScriptParticleEmitter } from "../packages/xrift-studio-runtime/src/script/particle";
import { getParticleAuthoringPreset, normalizeParticleProperties } from "../src/lib/visual-editor/particle-system";
import type { Points } from "three";
import { VEHICLE_WHEEL_POSITIONS, VEHICLE_WHEEL_SOURCE, VEHICLE_SMOKE_SOURCE } from "../src/lib/visual-editor/scripting/vehicle-effects-scripts";
import { Clone, useGLTF } from "@react-three/drei";
import { XriftScriptHost, XriftScriptRoot } from "../packages/xrift-studio-runtime/src/script/host";
import type { CompiledScript, ScriptRenderProps } from "../packages/xrift-studio-runtime/src/script/api";
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
let wheelModule: TemplateModule;
let smokeModule: TemplateModule;
const smokeConfig = normalizeParticleProperties({ ...getParticleAuthoringPreset("smoke")!.properties, prewarm: false, maxParticles: 32, emission: { rateOverTime: 0, bursts: [] } });
type TemplateModule = { default: CompiledScript; Render: ComponentType<ScriptRenderProps> };
export async function mountVehicleSeatFixture() {
  const loaded = await loadScriptModule(createScriptTemplateSource("vehicle", "Vehicle")!, "vehicle.tsx");
  if (!loaded.ok) throw new Error(loaded.message);
  const wheel = await loadScriptModule(VEHICLE_WHEEL_SOURCE, "wheel.ts");
  if (!wheel.ok) throw new Error(wheel.message);
  wheelModule = wheel.module as unknown as TemplateModule;
  const smoke = await loadScriptModule(VEHICLE_SMOKE_SOURCE, "smoke.ts");
  if (!smoke.ok) throw new Error(smoke.message);
  smokeModule = smoke.module as unknown as TemplateModule;
  const vehicle = loaded.module as unknown as TemplateModule;
  const chair = await loadScriptModule(createScriptTemplateSource("seat", "Seat")!, "seat.tsx");
  if (!chair.ok) throw new Error(chair.message);
  const seat = chair.module as unknown as TemplateModule;
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  createRoot(host).render(<Fixture vehicle={vehicle} seat={seat} />);
}
function Fixture({ vehicle, seat }: { vehicle: TemplateModule; seat: TemplateModule }) {
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
    const scene = useThree(state => state.scene);
    useFrame(() => {
      const wheel = scene.getObjectByName("wheel-0");
      const wheelOutput = document.querySelector('[data-testid="wheel-rotation"]');
      if (wheelOutput && wheel) wheelOutput.textContent = String(wheel.rotation.x);
      let visible = false;
      scene.getObjectByName("exhaust")?.traverse(object => {
        const points = object as Points;
        if (points.isPoints) {
          const position = points.geometry.getAttribute("position");
          for (let i = 0; i < position.count; i++) if (position.getY(i) > -100) visible = true;
        }
      });
      const smokeOutput = document.querySelector('[data-testid="smoke-visible"]');
      if (smokeOutput) smokeOutput.textContent = String(visible);
      setReady(true); const entry = store.getEntry(); if (entry) setDistance(entry.getSeatSurface().position.z - 0.05); });
    return null;
  }
  return <>
    <button onClick={() => setAim(value => value + 1)}>Aim at driver</button>
    <button onClick={() => setChairAim(value => value + 1)}>Aim at chair</button>
    <button onClick={() => store.contextValue.sit("seat-passenger-seat")}>Sit passenger</button>
    <button onClick={() => setPlaying(false)}>Stop</button>
    <output data-testid="wheel-rotation">0</output><output data-testid="smoke-visible">false</output>
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
                <XriftScriptRoot>
                  <group name="Vehicle">
                    <XriftScriptHost script={vehicle.default} render={vehicle.Render} entityId="fixture" entityName="Vehicle" componentId="vehicle-script" order={0} properties={{ instanceId: "cart", speed: 3, turnRate: 1.5, followGround: true, maxSlope: 45 }}>
                      {VEHICLE_WHEEL_POSITIONS.map((position, index) => <group key={index} name={`wheel-${index}`} position={[...position]}><XriftScriptHost script={wheelModule.default} properties={{}} entityId={`wheel-${index}`} entityName="Wheel" componentId={`wheel-script-${index}`} order={index}><Model kind="wheel" /></XriftScriptHost></group>)}
                      <group name="exhaust" position={[0, 0.4, 1.45]}><XriftScriptHost script={smokeModule.default} properties={{}} entityId="exhaust" entityName="Smoke" componentId="smoke-script" order={0}><XriftScriptParticleEmitter config={smokeConfig} color="white" opacity={1} /></XriftScriptHost></group>
                      <group name="車体"><Model kind="vehicle" /></group>
                      <group name="運転席" position={[-0.4, 0.85, 0.05]}>
                        <XriftScriptHost script={seat.default} render={seat.Render} entityId="driver" entityName="運転席" componentId="driver-script" order={1} properties={{ instanceId: "seat", driver: true }}><Model kind="seat" /></XriftScriptHost>
                      </group>
                      <group name="同乗席" position={[0.4, 0.85, 0.05]}>
                        <XriftScriptHost script={seat.default} render={seat.Render} entityId="passenger" entityName="同乗席" componentId="passenger-script" order={2} properties={{ instanceId: "seat", driver: false }}><Model kind="seat" /></XriftScriptHost>
                      </group>
                    </XriftScriptHost>
                  </group>
                  <group position={[2, 0.5, 1]}><XriftScriptHost script={seat.default} render={seat.Render} entityId="chair-fixture" entityName="Seat" componentId="chair-script" order={3} properties={{ instanceId: "seat", driver: false }}><Model kind="seat" /></XriftScriptHost></group>
                </XriftScriptRoot>
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
  const { SceneRecipeStore } = await import("../src/components/visual-editor/SceneRecipeStore");
  await import("../src/components/visual-editor/external-asset-store.css");
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  createRoot(host).render(<div data-responsive-asset-modal style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
    <div className="external-catalog-body flex min-h-0 flex-1"><div className="external-catalog-content" data-pane="list">
      <SceneRecipeStore projectKind="world" shelf="gimmicks" onAdd={async () => { throw new Error("Preview only"); }} />
    </div></div>
  </div>);
}

function Model({ kind }: { kind: "vehicle" | "seat" | "wheel" }) {
  const { scene } = useGLTF(`/visual-editor/world-assets/${kind}.glb`);
  return <Clone object={scene} />;
}
