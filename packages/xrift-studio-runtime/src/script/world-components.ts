/** Shared Script imports for Studio Play and published worlds. */
export * from "@xrift/world-components";
// Federation rewrites imports, but not export-star forwarding. Import Vehicle
// explicitly so it shares the host SDK's private VehicleSlotContext with Seat.
import { Vehicle as SharedVehicle } from "@xrift/world-components";
export { SharedVehicle as Vehicle };
export { XriftSeat as Seat } from "./seat.js";
export { XriftInteractable as Interactable } from "./interactable.js";
