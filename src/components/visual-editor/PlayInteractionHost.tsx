import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useXRift } from "@xrift/world-components";
import { Raycaster, Vector2, type Object3D } from "three";

/**
 * The player's half of the official interaction contract, for Play.
 *
 * `Interactable` only registers itself and parks `onInteract` in userData; the
 * XRift player is what raycasts and calls it. Studio Play had no such host, so
 * an authored button could not be pressed until the world was published, which
 * is exactly the drift the Play preview exists to prevent.
 *
 * It stays deliberately literal about the contract: a hit has to reach a
 * registered Interactable through the scene's own depth order, so a wall in
 * front still blocks it, and an Interactable with `enabled: false` is silent.
 */
export function PlayInteractionHost({ active }: { active: boolean }) {
  const { interactableObjects } = useXRift();
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const domElement = useThree((state) => state.gl.domElement);
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());

  useEffect(() => {
    if (!active) return;

    const findInteractable = (event: PointerEvent): Object3D | null => {
      if (interactableObjects.size === 0) return null;
      const rect = domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      pointerRef.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = raycasterRef.current;
      raycaster.setFromCamera(pointerRef.current, camera);
      // The whole scene, not just the registered objects: an Interactable
      // behind a wall must not answer a click that the wall received.
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        let current: Object3D | null = hit.object;
        while (current) {
          if (interactableObjects.has(current)) {
            return current.userData.enabled === false ? null : current;
          }
          current = current.parent;
        }
        return null;
      }
      return null;
    };

    // A click that ends an orbit drag is a camera move, not an interaction.
    let pressedAt: { x: number; y: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      pressedAt =
        event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
    };
    const onPointerUp = (event: PointerEvent) => {
      const origin = pressedAt;
      pressedAt = null;
      if (!origin || event.button !== 0) return;
      if (
        Math.abs(event.clientX - origin.x) > 4 ||
        Math.abs(event.clientY - origin.y) > 4
      ) {
        return;
      }
      const target = findInteractable(event);
      if (!target) return;
      const { id, onInteract } = target.userData as {
        id?: unknown;
        onInteract?: unknown;
      };
      if (typeof onInteract === "function") {
        (onInteract as (id: string) => void)(typeof id === "string" ? id : "");
      }
    };

    let lastMove = 0;
    const onPointerMove = (event: PointerEvent) => {
      if (pressedAt) return;
      const now = event.timeStamp;
      if (now - lastMove < 60) return;
      lastMove = now;
      domElement.style.cursor = findInteractable(event) ? "pointer" : "";
    };

    domElement.addEventListener("pointerdown", onPointerDown);
    domElement.addEventListener("pointerup", onPointerUp);
    domElement.addEventListener("pointermove", onPointerMove);
    return () => {
      domElement.removeEventListener("pointerdown", onPointerDown);
      domElement.removeEventListener("pointerup", onPointerUp);
      domElement.removeEventListener("pointermove", onPointerMove);
      domElement.style.cursor = "";
    };
  }, [active, camera, domElement, interactableObjects, scene]);

  return null;
}
