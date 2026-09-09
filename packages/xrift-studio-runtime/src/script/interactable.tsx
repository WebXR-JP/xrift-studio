import { useEffect, useRef } from "react";
import { Interactable, LAYERS, type InteractableProps } from "@xrift/world-components";
import type { Group } from "three";
import { trackInteractionLayer } from "./interaction-layer.js";

/** Preserve official registration, metadata and callbacks, including enabled. */
export function XriftInteractable({ children, ...props }: InteractableProps) {
  const content = useRef<Group>(null);
  useEffect(() => {
    if (content.current) return trackInteractionLayer(content.current, LAYERS.INTERACTABLE);
  }, []);
  return <Interactable {...props}><group ref={content}>{children}</group></Interactable>;
}
