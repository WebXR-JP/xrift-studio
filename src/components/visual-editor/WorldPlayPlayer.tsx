import { PointerLockControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useRapier, type RapierRigidBody } from "@react-three/rapier";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { Euler } from "three";
import type {
  PlayerMovement,
  TeleportContextValue,
  TeleportDestination,
  UsersContextValue,
} from "@xrift/world-components";

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
  CAMERA_Y_OFFSET,
  MOVE_SPEED,
  RESPAWN_Y_THRESHOLD,
} from "@xrift/world-components/dist/components/DevEnvironment/constants";

import type { Vec3 } from "../../lib/visual-editor/scene-document";
import { resolveWorldPlayCapsuleSpawn } from "./world-play-spawn";

/** The aim reticle a player sees in a published world. */
export const WorldPlayCrosshair = Crosshair;

/**
 * Attribute the Scene View marks its viewport with while a World is playing.
 *
 * Play scopes everything global it does - the pointer lock, the crosshair - to
 * this element, because in an editor the rest of the window is still the
 * Hierarchy and the Inspector.
 */
export const WORLD_PLAY_LOCK_SURFACE_ATTRIBUTE = "data-world-play-lock-surface";

/**
 * Deliberately matches nothing.
 *
 * drei's `PointerLockControls` installs its own click handler that calls
 * `lock()` on every click, with no catch. Chromium refuses a re-lock for about
 * a second after the user presses Escape, so a player who pressed Escape and
 * clicked straight back in got a rejected promise, a console error, and no
 * pointer lock - and, since Play's aiming follows the lock, a world that had
 * simply stopped responding. Play owns the lock request instead, so the
 * failure can be caught and explained.
 */
const NO_AUTO_LOCK_SELECTOR = "[data-world-play-auto-lock-disabled]";

/**
 * Why the mouse could not be captured.
 *
 * `retry` is the browser's own cooldown - it refuses a re-lock for about a
 * second after Escape - and clears itself. `unsupported` is a browser that
 * turned Play down more than once in a row, which on macOS WebViews is the
 * normal answer rather than a temporary one; Play stops promising the lock and
 * points at drag-to-look instead.
 */
export type WorldPlayLockFailure = "retry" | "unsupported";

/**
 * Refusals in a row before Play stops calling the lock temporary.
 *
 * Two, because the first one is usually the Escape cooldown and telling
 * somebody their environment cannot do this at all - when the next click would
 * have worked - is worse than asking them to click again.
 */
const LOCK_UNSUPPORTED_AFTER_FAILURES = 2;

/**
 * Radians per pixel dragged, matching `PointerLockControls`.
 *
 * Duplicated because three-stdlib keeps the constant private. It is the number
 * a published world turns by, so a drag here covers the same ground a locked
 * mouse does.
 */
const LOOK_SENSITIVITY = 0.002;

const HALF_PI = Math.PI / 2;

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

/** Moves the running player. Returns false when there is no player to move. */
export type WorldPlayTeleportMover = (
  destination: TeleportDestination,
) => boolean;

export type WorldPlayTeleport = {
  implementation: TeleportContextValue;
  moverRef: RefObject<WorldPlayTeleportMover | null>;
};

/**
 * A real `useTeleport()`, instead of the package's `console.log` placeholder.
 *
 * The implementation is created above the player because `XRiftProvider` sits
 * above it, and filled in by the player while it runs. Outside Play there is
 * nobody to move, and a teleport that quietly does nothing is the honest
 * answer: Edit has no player standing anywhere.
 *
 * **Teleport moves the player, and leaves the SpawnPoint alone.** Falling out
 * of the world still returns to the Scene's SpawnPoint rather than to wherever
 * the last teleport put someone, so a teleport into a pit is recoverable
 * instead of a loop.
 */
export function useWorldPlayTeleport(): WorldPlayTeleport {
  const moverRef = useRef<WorldPlayTeleportMover | null>(null);
  const implementation = useMemo<TeleportContextValue>(
    () => ({
      teleport: (destination) => {
        moverRef.current?.(destination);
      },
    }),
    [],
  );
  return { implementation, moverRef };
}

/**
 * Finds the running player's RigidBody and teleports it.
 *
 * `PhysicsPlayer` keeps its body to itself, so the player is identified the
 * way it identifies itself every frame: the camera it drives sits exactly
 * `CAMERA_Y_OFFSET` above the capsule's centre. That is a property of the
 * component being used, not a guess about the Scene, and the alignment check
 * fails the build if the constant moves.
 *
 * The alternative - routing teleport through `setSpawnPoint`, which the player
 * does watch - was rejected because it would also move where a fall respawns.
 */
function WorldPlayTeleportBinding({
  moverRef,
}: {
  moverRef: RefObject<WorldPlayTeleportMover | null>;
}) {
  const { world } = useRapier();
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    const findPlayerBody = (): RapierRigidBody | null => {
      const x = camera.position.x;
      const y = camera.position.y - CAMERA_Y_OFFSET;
      const z = camera.position.z;
      let nearest: RapierRigidBody | null = null;
      // Tight enough that no other body can be mistaken for the capsule the
      // camera is riding, loose enough to survive a frame of physics drift.
      let nearestDistance = 0.05;
      world.forEachRigidBody((body) => {
        if (!body.isDynamic()) return;
        const translation = body.translation();
        const distance = Math.hypot(
          translation.x - x,
          translation.y - y,
          translation.z - z,
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = body;
        }
      });
      return nearest as RapierRigidBody | null;
    };

    moverRef.current = (destination) => {
      const body = findPlayerBody();
      if (!body) return false;
      // The destination names the floor, the way a SpawnPoint does, so it is
      // lifted onto the capsule's centre by the same rule.
      const [cx, cy, cz] = resolveWorldPlayCapsuleSpawn(destination.position);
      body.setTranslation({ x: cx, y: cy, z: cz }, true);
      // Carrying the fall speed through would drop the player straight out of
      // the place they were just put.
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      if (typeof destination.yaw === "number") {
        camera.rotation.set(0, (destination.yaw * Math.PI) / 180, 0, "YXZ");
      }
      return true;
    };
    return () => {
      moverRef.current = null;
    };
  }, [camera, moverRef, world]);

  return null;
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
  teleportMoverRef,
  onLockRefused,
}: {
  /** Capsule centre, already lifted off the floor the SpawnPoint marks. */
  spawnPosition: Vec3;
  /** SpawnPoint heading in radians. */
  spawnYaw: number;
  allowInfiniteJump: boolean;
  grabStore: DevGrabStore;
  movementRef: RefObject<PlayerMovement>;
  teleportMoverRef: RefObject<WorldPlayTeleportMover | null>;
  /** Called when the browser turns the pointer lock down, so Play can say so. */
  onLockRefused?: (reason: WorldPlayLockFailure) => void;
}) {
  const camera = useThree((state) => state.camera);
  const surface = useThree((state) => state.gl.domElement);
  const aimedRef = useRef(false);
  const onLockRefusedRef = useRef(onLockRefused);
  onLockRefusedRef.current = onLockRefused;

  // Play's own press-to-lock, replacing the one drei installs. Locking the
  // canvas explicitly - the same element `PointerLockControls` is told to use -
  // keeps `isLocked` and the mouse-look in step with what actually holds the
  // pointer.
  //
  // The request rides `pointerdown` rather than `click`: WebKit grants pointer
  // lock from the press that starts a gesture and is far stricter about the
  // click that ends one, which is why macOS saw refusals where Windows did not.
  // Asking on the press also means a press that turns into a drag still locks.
  useEffect(() => {
    // A lock we asked for and have not heard back about. `pointerlockerror` is
    // a document event, so without this Play would also blame itself for a
    // refusal nothing in Play requested.
    let pendingRequest = false;
    let consecutiveFailures = 0;

    const reportFailure = () => {
      // Chromium rejects the promise *and* fires the event for one refusal.
      if (!pendingRequest) return;
      pendingRequest = false;
      consecutiveFailures += 1;
      onLockRefusedRef.current?.(
        consecutiveFailures >= LOCK_UNSUPPORTED_AFTER_FAILURES
          ? "unsupported"
          : "retry",
      );
    };

    const requestLock = () => {
      if (document.pointerLockElement) return;
      pendingRequest = true;
      let request: unknown;
      try {
        request = surface.requestPointerLock();
      } catch {
        reportFailure();
        return;
      }
      // Safari's `requestPointerLock` returns nothing; Chromium returns a
      // promise. Both report a refusal through `pointerlockerror` as well, and
      // `reportFailure` collapses the two into one.
      if (request instanceof Promise) request.catch(reportFailure);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType !== "mouse") return;
      requestLock();
    };
    const onError = () => reportFailure();
    const onChange = () => {
      if (document.pointerLockElement !== surface) return;
      // The environment does grant the lock, so an earlier refusal was the
      // Escape cooldown rather than a browser that cannot do this at all.
      pendingRequest = false;
      consecutiveFailures = 0;
    };

    surface.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerlockerror", onError);
    document.addEventListener("pointerlockchange", onChange);
    return () => {
      surface.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerlockerror", onError);
      document.removeEventListener("pointerlockchange", onChange);
    };
  }, [surface]);

  // Drag-to-look, for every moment the pointer is not locked.
  //
  // `PointerLockControls` only turns the mouse while it holds the pointer, so
  // until now a refused lock left Play with a player who could walk but not
  // turn - and on a macOS WebView that refuses the lock outright, that was the
  // whole session. Dragging turns the same camera by the same numbers the
  // locked look uses, so a world checked this way is aimed the way it will be
  // after upload.
  useEffect(() => {
    const euler = new Euler(0, 0, 0, "YXZ");
    let draggingPointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || document.pointerLockElement) return;
      draggingPointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
    };
    // On `window`, not the canvas, and without pointer capture: capturing the
    // pointer on the element Play is also asking to lock makes the two fight
    // over the same press.
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== draggingPointerId) return;
      if (document.pointerLockElement) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      if (dx === 0 && dy === 0) return;
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= dx * LOOK_SENSITIVITY;
      euler.x -= dy * LOOK_SENSITIVITY;
      euler.x = Math.max(-HALF_PI, Math.min(HALF_PI, euler.x));
      camera.quaternion.setFromEuler(euler);
    };
    const endDrag = (event: PointerEvent) => {
      if (event.pointerId !== draggingPointerId) return;
      draggingPointerId = null;
    };
    // The press that starts a drag is also the press that asks for the lock.
    // When the lock lands, the drag is over: the locked look owns the mouse
    // from here, and leaving the drag open would turn the camera twice.
    const onLockChange = () => {
      if (document.pointerLockElement) draggingPointerId = null;
    };

    surface.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      surface.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, [camera, surface]);

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
      <PointerLockControls
        domElement={surface}
        selector={NO_AUTO_LOCK_SELECTOR}
      />
      <PhysicsPlayer
        moveSpeed={MOVE_SPEED}
        spawnPosition={spawnPosition}
        respawnThreshold={RESPAWN_Y_THRESHOLD}
        allowInfiniteJump={allowInfiniteJump}
        movementRef={movementRef}
      />
      <GrabSystem store={grabStore} />
      <WorldPlayTeleportBinding moverRef={teleportMoverRef} />
    </>
  );
}
