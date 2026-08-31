import { PointerLockControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import type { PlayerMovement, UsersContextValue } from "@xrift/world-components";

/*
 * World Play runs the same player `@xrift/world-components` gives a world
 * author on `npm run dev`.
 *
 * `DevEnvironment` is the component that assembles it, but it opens its own
 * full-window `<Canvas>`, its own `<Physics>` and its own providers, and Studio
 * already has all three around the Scene View. Mounting it here would nest a
 * second renderer inside the editor. So Play mounts the parts `DevEnvironment`
 * itself composes, in Studio's Canvas, under Studio's Physics and XRiftProvider.
 *
 * Those parts are not on the package's public entry point, so they are reached
 * by path. That is deliberate and load-bearing: reimplementing a character
 * controller here would mean Studio's Play walks, jumps, falls and grabs by
 * numbers no world ever runs against, which is exactly the drift Play exists to
 * catch. `scripts/check-world-components-alignment.mjs` fails the build if any
 * of these paths stops resolving, so a package upgrade that moves them is a
 * build error rather than a silent behaviour change.
 */
import { Crosshair } from "@xrift/world-components/dist/components/DevEnvironment/components/Crosshair";
import { GrabSystem } from "@xrift/world-components/dist/components/DevEnvironment/components/GrabSystem";
import {
  createDevGrabStore,
  type DevGrabStore,
} from "@xrift/world-components/dist/components/DevEnvironment/components/GrabSystem/store";
import { PhysicsPlayer } from "@xrift/world-components/dist/components/DevEnvironment/components/PhysicsPlayer";
import {
  MOVE_SPEED,
  RESPAWN_Y_THRESHOLD,
} from "@xrift/world-components/dist/components/DevEnvironment/constants";

import type { Vec3 } from "../../lib/visual-editor/scene-document";

/** The aim reticle a player sees in a published world. */
export const WorldPlayCrosshair = Crosshair;

/**
 * Attribute the Scene View marks its canvas with so Play can lock the pointer.
 *
 * drei's `PointerLockControls` locks on a click anywhere in `document` unless
 * it is given a selector. In a full-window world that is right; in an editor it
 * would mean clicking the Hierarchy or the Inspector swallows the mouse.
 */
export const WORLD_PLAY_LOCK_SURFACE_ATTRIBUTE = "data-world-play-lock-surface";
export const WORLD_PLAY_LOCK_SURFACE_SELECTOR = `[${WORLD_PLAY_LOCK_SURFACE_ATTRIBUTE}] canvas`;

const IDLE_MOVEMENT: PlayerMovement = {
  position: { x: 0, y: 0, z: 0 },
  direction: { x: 0, z: 0 },
  horizontalSpeed: 0,
  verticalSpeed: 0,
  rotation: { yaw: 0, pitch: 0 },
  isGrounded: true,
  isJumping: false,
};

/**
 * The local user Play reports through `useUsers()`.
 *
 * A published world always has one. Without this, `localUser` is `null` in Play
 * and `null` nowhere else, so a world that greets the player by name looks
 * broken in the editor and correct after upload.
 */
const PLAY_LOCAL_USER = {
  id: "studio-play-local-user",
  displayName: "Studio Play",
  avatarUrl: null,
  isGuest: true,
} as const;

/** Matches the capsule the official `PhysicsPlayer` walks around in. */
const PLAY_LOCAL_AVATAR_HEIGHT = { height: 1.5, eyeHeight: 1.44 };

function subscribePointerLock(listener: () => void): () => void {
  document.addEventListener("pointerlockchange", listener);
  return () => document.removeEventListener("pointerlockchange", listener);
}

function getPointerLockSnapshot(): boolean {
  return document.pointerLockElement !== null;
}

/** Whether the mouse is currently captured by the Play view. */
export function useWorldPlayPointerLocked(): boolean {
  return useSyncExternalStore(
    subscribePointerLock,
    getPointerLockSnapshot,
    () => false,
  );
}

export type { DevGrabStore as WorldPlayGrabStore };

/**
 * The store `<Grabbable>` registers into and `GrabSystem` picks up from.
 *
 * It is created once for the viewport rather than per Play session: the default
 * `GrabbableProvider` implementation accepts registrations and never grabs, so
 * a Grabbable authored in Edit would silently be a no-op in Play if the store
 * only existed while the player is mounted.
 */
export function useWorldPlayGrabStore(): DevGrabStore {
  const [store] = useState(createDevGrabStore);
  return store;
}

export type WorldPlayUsers = {
  implementation: UsersContextValue;
  movementRef: RefObject<PlayerMovement>;
};

/** Local movement, written every frame by `PhysicsPlayer` and read by worlds. */
export function useWorldPlayUsers(): WorldPlayUsers {
  const movementRef = useRef<PlayerMovement>({
    ...IDLE_MOVEMENT,
    position: { ...IDLE_MOVEMENT.position },
    direction: { ...IDLE_MOVEMENT.direction },
    rotation: { ...IDLE_MOVEMENT.rotation },
  });
  const implementation = useMemo<UsersContextValue>(
    () => ({
      localUser: PLAY_LOCAL_USER,
      remoteUsers: [],
      getMovement: () => undefined,
      getLocalMovement: () => movementRef.current,
      getAvatarHeight: () => undefined,
      getLocalAvatarHeight: () => PLAY_LOCAL_AVATAR_HEIGHT,
    }),
    [],
  );
  return { implementation, movementRef };
}

/**
 * The Play player: pointer-lock look, the official physics character, grabbing.
 *
 * Mounted only while a World project is playing, inside Studio's `<Physics>`
 * and `XRiftProvider`, so the capsule collides with the same Colliders the
 * published world builds and `useSpawnPoint()` sees the same SpawnPoint.
 */
export function WorldPlayPlayer({
  spawnPosition,
  spawnYaw,
  allowInfiniteJump,
  grabStore,
  movementRef,
}: {
  /** Capsule centre, already lifted off the floor the SpawnPoint marks. */
  spawnPosition: Vec3;
  /** SpawnPoint heading in radians. */
  spawnYaw: number;
  allowInfiniteJump: boolean;
  grabStore: DevGrabStore;
  movementRef: RefObject<PlayerMovement>;
}) {
  const camera = useThree((state) => state.camera);
  const aimedRef = useRef(false);

  // Once, on entering Play. `PhysicsPlayer` sets the heading itself when an
  // official SpawnPoint registers, but a Scene whose spawn comes from the
  // Studio SpawnPoint Component has nothing to register, and every Scene starts
  // Play with the camera still holding the Edit view's rotation.
  useLayoutEffect(() => {
    if (aimedRef.current) return;
    aimedRef.current = true;
    camera.rotation.set(0, spawnYaw, 0, "YXZ");
    camera.updateProjectionMatrix();
  }, [camera, spawnYaw]);

  // Stop must hand the mouse back. Leaving the lock on after the player is gone
  // would leave the editor unclickable with nothing left on screen to explain
  // why.
  useLayoutEffect(
    () => () => {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    [],
  );

  return (
    <>
      <PointerLockControls selector={WORLD_PLAY_LOCK_SURFACE_SELECTOR} />
      <PhysicsPlayer
        moveSpeed={MOVE_SPEED}
        spawnPosition={spawnPosition}
        respawnThreshold={RESPAWN_Y_THRESHOLD}
        allowInfiniteJump={allowInfiniteJump}
        movementRef={movementRef}
      />
      <GrabSystem store={grabStore} />
    </>
  );
}
