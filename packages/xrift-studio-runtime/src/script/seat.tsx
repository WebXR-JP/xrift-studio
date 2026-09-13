import { useEffect, useRef } from "react";
import { Seat, LAYERS, type SeatProps } from "@xrift/world-components";
import type { Group } from "three";
import { trackInteractionLayer } from "./interaction-layer.js";

/** Keep asynchronously loaded seat models reachable by the platform raycaster.
 * The official Seat retains ownership of registration, occupancy and Vehicle input.
 */
export function XriftSeat({ children, ...props }: SeatProps) {
  const content = useRef<Group>(null);
  useEffect(() => {
    if (content.current) return trackInteractionLayer(content.current, LAYERS.INTERACTABLE);
  }, []);
  return <Seat {...props}><group ref={content}>{children}</group></Seat>;
}
