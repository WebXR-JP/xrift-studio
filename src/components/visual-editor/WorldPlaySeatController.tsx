import { useFrame, useThree } from "@react-three/fiber";
import { useRapier, type RapierRigidBody } from "@react-three/rapier";
import { Quaternion, Vector3 } from "three";
import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import type { PlayerMovement, SeatEntry } from "@xrift/world-components";
import { CAMERA_Y_OFFSET } from "@xrift/world-components/dist/components/DevEnvironment/constants";
import { resolveWorldPlayCapsuleSpawn } from "./world-play-spawn";
import type { WorldPlaySeatStore } from "./world-play-seat-store";

/** Keeps the official walking controller, suspending its capsule while seated. */
export function WorldPlaySeatController({ store, movementRef }: {
  store: WorldPlaySeatStore;
  movementRef: RefObject<PlayerMovement>;
}) {
  const { world } = useRapier();
  const { camera, gl } = useThree();
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const seatRef = useRef<SeatEntry | null>(null);
  const keys = useRef(new Set<string>());
  const pose = useMemo(() => ({ previous: new Quaternion(), current: new Quaternion(), change: new Quaternion(), eye: new Vector3() }), []);
  useLayoutEffect(() => {
    const unbind = store.bindPlayer((entry) => {
      if (!entry) {
        const body = bodyRef.current;
        if (body?.isValid()) {
          const exit = seatRef.current?.getExitPosition();
          if (exit) {
            const [x, y, z] = resolveWorldPlayCapsuleSpawn([exit.x, exit.y, exit.z]);
            body.setTranslation({ x, y, z }, true);
            camera.position.set(x, y + CAMERA_Y_OFFSET, z);
          }
          body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          body.setEnabled(true);
          camera.rotation.order = "YXZ";
          camera.rotation.z = 0;
        }
        bodyRef.current = null;
        seatRef.current = null;
        keys.current.clear();
        return true;
      }
      let nearest: RapierRigidBody | null = null;
      let distance = 0.05;
      world.forEachRigidBody((body) => {
        if (!body.isDynamic() || !body.isEnabled()) return;
        const p = body.translation();
        const d = Math.hypot(p.x - camera.position.x, p.y - camera.position.y + CAMERA_Y_OFFSET, p.z - camera.position.z);
        if (d < distance) { nearest = body; distance = d; }
      });
      const body = nearest as RapierRigidBody | null;
      if (!body) return false;
      body.setEnabled(false);
      bodyRef.current = body;
      seatRef.current = entry;
      const q = entry.getSeatSurface().quaternion;
      pose.previous.set(q.x, q.y, q.z, q.w);
      camera.quaternion.copy(pose.previous);
      return true;
    });
    const down = (event: KeyboardEvent) => {
      if (!seatRef.current || event.metaKey || event.ctrlKey || event.isComposing) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (!["KeyW", "KeyS", "KeyA", "KeyD", "Space"].includes(event.code)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === "Space") { store.leave(); return; }
      keys.current.add(event.code);
    };
    const up = (event: KeyboardEvent) => { keys.current.delete(event.code); };
    const clear = () => keys.current.clear();
    const lock = () => { if (document.pointerLockElement !== gl.domElement) clear(); };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", clear);
    document.addEventListener("focusin", clear);
    document.addEventListener("pointerlockchange", lock);
    return () => {
      unbind();
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", clear);
      document.removeEventListener("focusin", clear);
      document.removeEventListener("pointerlockchange", lock);
    };
  }, [camera, gl, pose, store, world]);
  // Mounted after PhysicsPlayer: restore the seated camera after its walking update.
  useFrame((_, delta) => {
    const entry = seatRef.current;
    const body = bodyRef.current;
    if (!entry || !body?.isValid()) return;
    const pressed = (code: string) => Number(keys.current.has(code));
    entry.onControlInput?.({ forward: pressed("KeyW") - pressed("KeyS"), right: pressed("KeyD") - pressed("KeyA") }, Math.min(delta, 0.1));
    const { position, quaternion } = entry.getSeatSurface();
    pose.current.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    pose.change.copy(pose.previous).invert().premultiply(pose.current);
    camera.quaternion.premultiply(pose.change);
    pose.previous.copy(pose.current);
    pose.eye.set(0, CAMERA_Y_OFFSET, 0).applyQuaternion(pose.current);
    camera.position.set(position.x, position.y, position.z).add(pose.eye);
    body.setTranslation({ x: camera.position.x, y: camera.position.y - CAMERA_Y_OFFSET, z: camera.position.z }, false);
    body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    movementRef.current = {
      ...movementRef.current,
      position: { x: position.x, y: position.y, z: position.z },
      horizontalSpeed: 0, verticalSpeed: 0, isGrounded: true, isJumping: false,
    };
  });
  return null;
}
