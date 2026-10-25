/** Shared Script imports for Studio Play and published worlds. */
export * from "@xrift/world-components";
// Federation rewrites imports, but not export-star forwarding. Import these
// explicitly so Vehicle shares the host SDK's private VehicleSlotContext and
// useWorldStorage reads the host's authenticated, persistent player storage.
import {
  Vehicle as SharedVehicle,
  useWorldStorage as sharedUseWorldStorage,
} from "@xrift/world-components";
export { SharedVehicle as Vehicle, sharedUseWorldStorage as useWorldStorage };
export { XriftSeat as Seat } from "./seat.js";
export { XriftInteractable as Interactable } from "./interactable.js";
