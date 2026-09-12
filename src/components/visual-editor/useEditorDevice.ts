import { useEffect, useState } from "react";

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

export function useEditorDevice(): EditorDevice {
  const [device, setDevice] = useState(readEditorDevice);
  useEffect(() => {
    const pointer = window.matchMedia("(any-pointer: coarse)");
    const primaryPointer = window.matchMedia("(pointer: coarse) and (hover: none)");
    const update = () => {
      if (window.visualViewport && window.visualViewport.scale !== 1) return;
      const next = readEditorDevice();
      setDevice((current) => current.tablet === next.tablet &&
        current.touch === next.touch && current.viewportHeight === next.viewportHeight
        ? current : next);
    };
    update();
    pointer.addEventListener("change", update);
    primaryPointer.addEventListener("change", update);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      pointer.removeEventListener("change", update);
      primaryPointer.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  return device;
}
