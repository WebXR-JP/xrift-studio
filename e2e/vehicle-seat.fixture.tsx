import { PlayInteractionHost } from "../src/components/visual-editor/PlayInteractionHost";
import { Suspense, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics, RigidBody } from "@react-three/rapier";
import { Vehicle, Seat, XRiftProvider } from "@xrift/world-components";
import { WorldPlayPlayer, useWorldPlayGrabStore, useWorldPlayTeleport, useWorldPlayUsers } from "../src/components/visual-editor/WorldPlayPlayer";
import { createWorldPlaySeatStore } from "../src/components/visual-editor/world-play-seat-store";

export function mountVehicleSeatFixture() {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  createRoot(host).render(<Fixture />);
}
function Fixture() {
  const [store] = useState(createWorldPlaySeatStore);
  const grabs = useWorldPlayGrabStore();
  const users = useWorldPlayUsers();
  const teleport = useWorldPlayTeleport();
  const [playing, setPlaying] = useState(true);
  const [aim, setAim] = useState(0);
  const [aimHit, setAimHit] = useState(false);
  const [distance, setDistance] = useState(0);
  const [ready, setReady] = useState(false);
  const occupant = useSyncExternalStore(store.contextValue.subscribeOccupancy, () => store.getEntry() ? "seated" : "none");
  function Ready() {
    useFrame(() => setReady(true));
    return null;
  }
  return <>
    <button onClick={() => setAim(value => value + 1)}>Aim at driver</button>
    <button onClick={() => store.contextValue.sit("passenger")}>Sit passenger</button>
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
                <Vehicle id="cart" onDrive={(input, delta, vehicle) => {
                  vehicle.translateZ(-input.forward * 3 * delta);
                  vehicle.rotateY(-input.right * delta);
                  setDistance(vehicle.position.z);
                }}>
                  <mesh position={[0, 0.2, 0]}><boxGeometry args={[1.6, 0.4, 2.4]} /><meshStandardMaterial color="gray" /></mesh>
                  <Seat id="driver" driver position={[-0.4, 0.65, 0]}><mesh><boxGeometry args={[0.6, 0.2, 0.6]} /><meshStandardMaterial color="blue" /></mesh></Seat>
                  <Seat id="passenger" position={[0.4, 0.65, 0]}><mesh><boxGeometry args={[0.6, 0.2, 0.6]} /><meshStandardMaterial color="gray" /></mesh></Seat>
                </Vehicle>
                <WorldPlayPlayer spawnPosition={[0, 0.8, 3]} spawnYaw={0} allowInfiniteJump={false} grabStore={grabs} seatStore={store} movementRef={users.movementRef} teleportMoverRef={teleport.moverRef} />
                <Ready />
                <AimDriver requested={aim} />
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
  useLayoutEffect(() => { if (requested) camera.lookAt(-0.4, 0.65, 0); }, [camera, requested]);
  return null;
}
