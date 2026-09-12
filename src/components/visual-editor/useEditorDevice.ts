import { useSyncExternalStore } from "react";

export type EditorDevice = {
  tablet: boolean;
  touch: boolean;
  viewportHeight: number | undefined;
};

/** Screen dimensions identify tablets even in Split View; mouse attachment
 * must not turn off the iPad layout. No authoring data depends on this choice. */
function readEditorDevice(): EditorDevice {
  if (typeof window === "undefined") {
    return { tablet: false, touch: false, viewportHeight: undefined };
  }
  const iPad = /iPad/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const touch = iPad || window.matchMedia("(any-pointer: coarse)").matches;
  const primaryTouch = window.matchMedia("(pointer: coarse) and (hover: none)").matches;
  const tablet = iPad || (primaryTouch && Math.min(screen.width, screen.height) >= 600);
  const viewport = window.visualViewport;
  return {
    tablet,
    touch,
    // Safari's keyboard resizes the visual viewport, not always 100dvh.
    // Pinch zoom should magnify the UI rather than cause a layout reflow.
    viewportHeight: viewport && viewport.scale === 1 ? viewport.height : window.innerHeight,
  };
}

const serverDevice: EditorDevice = { tablet: false, touch: false, viewportHeight: undefined };
let snapshot: EditorDevice | undefined;
const listeners = new Set<() => void>();
let stopListening: (() => void) | undefined;

function getSnapshot(): EditorDevice {
  return snapshot ??= readEditorDevice();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!stopListening) {
    const pointer = window.matchMedia("(any-pointer: coarse)");
    const primaryPointer = window.matchMedia("(pointer: coarse) and (hover: none)");
    const viewport = window.visualViewport;
    const update = () => {
      if (viewport && viewport.scale !== 1) return;
      const next = readEditorDevice();
      const current = getSnapshot();
      if (current.tablet === next.tablet && current.touch === next.touch && current.viewportHeight === next.viewportHeight) return;
      snapshot = next;
      for (const notify of listeners) notify();
    };
    pointer.addEventListener("change", update);
    primaryPointer.addEventListener("change", update);
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    stopListening = () => {
      pointer.removeEventListener("change", update);
      primaryPointer.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
    };
    update();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stopListening?.();
      stopListening = undefined;
      snapshot = undefined;
    }
  };
}

/** All panels share one viewport subscription instead of one per input. */
export function useEditorDevice(): EditorDevice {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverDevice);
}

/** Numeric fields do not need to render again whenever the keyboard resizes. */
export function useEditorTouch(): boolean {
  return useSyncExternalStore(subscribe, () => getSnapshot().touch, () => false);
}
