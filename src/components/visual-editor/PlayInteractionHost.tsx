import { useCallback, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { LAYERS, useXRift } from "@xrift/world-components";
import { Raycaster, Vector2, type Object3D } from "three";

/**
 * How far a player can reach an Interactable, in metres.
 *
 * The same reach `DevEnvironment`'s CenterRaycaster gives a world author. Play
 * used to press a button from across the map, so an authored control that is
 * plainly out of reach in a published world answered here.
 */
export const PLAY_CROSSHAIR_REACH = 3.5;

const NDC_CENTRE = new Vector2(0, 0);

export type PlayInteractionMode =
  /** Item Play: the pointer is free, so the click position is the aim. */
  | "pointer"
  /** World Play: the pointer is locked, so the screen centre is the aim. */
  | "crosshair";

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
export function PlayInteractionHost({
  active,
  mode = "pointer",
  onAimChange,
}: {
  active: boolean;
  mode?: PlayInteractionMode;
  /** Reports whether the crosshair is currently on a reachable Interactable. */
  onAimChange?: (hit: boolean) => void;
}) {
  const { interactableObjects } = useXRift();
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const domElement = useThree((state) => state.gl.domElement);
  const pointerRaycasterRef = useRef(new Raycaster());
  const crosshairRaycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());
  const aimedRef = useRef<Object3D | null>(null);
  const aimHitRef = useRef(false);
  const onAimChangeRef = useRef(onAimChange);
  onAimChangeRef.current = onAimChange;

  // The whole scene, not just the registered objects: an Interactable behind a
  // wall must not answer a click that the wall received.
  const resolveInteractable = useCallback(
    (raycaster: Raycaster): Object3D | null => {
      if (interactableObjects.size === 0) return null;
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
    },
    [interactableObjects, scene],
  );

  const interact = useCallback((target: Object3D) => {
    const { id, onInteract } = target.userData as {
      id?: unknown;
      onInteract?: unknown;
    };
    if (typeof onInteract !== "function") return;
    (onInteract as (id: string) => void)(typeof id === "string" ? id : "");
  }, []);

  // World Play aims from the screen centre because the pointer is locked, and
  // it only considers the INTERACTABLE layer at the player's reach - the same
  // two limits the official CenterRaycaster applies.
  useFrame(() => {
    if (!active || mode !== "crosshair") return;
    const raycaster = crosshairRaycasterRef.current;
    raycaster.far = PLAY_CROSSHAIR_REACH;
    raycaster.layers.set(LAYERS.INTERACTABLE);
    raycaster.setFromCamera(NDC_CENTRE, camera);
    const target = resolveInteractable(raycaster);
    aimedRef.current = target;
    const hit = target !== null;
    if (hit === aimHitRef.current) return;
    aimHitRef.current = hit;
    onAimChangeRef.current?.(hit);
  });

  useEffect(() => {
    if (active && mode === "crosshair") return;
    // Leaving Play, or leaving the pointer lock, must not leave the crosshair
    // lit on a target the player can no longer see.
    aimedRef.current = null;
    if (!aimHitRef.current) return;
    aimHitRef.current = false;
    onAimChangeRef.current?.(false);
  }, [active, mode]);

  // On `window`, not the canvas: while the pointer is locked the browser
  // retargets every mouse event at the locked element, so a listener on a
  // child of that element never sees the press and the crosshair would light
  // up on a button that cannot be pressed.
  //
  // Unlocked, `window` is too wide - the Hierarchy and the Inspector are still
  // there - so the press has to have landed on the rendered view. Play stays
  // playable either way: the browser refuses a re-lock for about a second
  // after Escape, and tying interaction to the lock made that second look like
  // a broken world.
  useEffect(() => {
    if (!active || mode !== "crosshair") return;
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (!document.pointerLockElement && event.target !== domElement) return;
      const target = aimedRef.current;
      if (target) interact(target);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [active, domElement, interact, mode]);

  useEffect(() => {
    if (!active || mode !== "pointer") return;

    const findInteractable = (event: PointerEvent): Object3D | null => {
      const rect = domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      pointerRef.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = pointerRaycasterRef.current;
      raycaster.setFromCamera(pointerRef.current, camera);
      return resolveInteractable(raycaster);
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
      if (target) interact(target);
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
  }, [active, camera, domElement, interact, mode, resolveInteractable]);

  return null;
}
