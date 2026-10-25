/** Shared Script imports for Studio Play and published worlds. */
export * from "@xrift/world-components";
// Federation rewrites imports, but not export-star forwarding. Import these
// explicitly so Vehicle shares the host SDK's private VehicleSlotContext and
// storage and screen sharing consume the host's authenticated world services.
import {
  Vehicle as SharedVehicle,
  ScreenShareDisplay as SharedScreenShareDisplay,
  useScreenShareContext as sharedUseScreenShareContext,
  useWorldStorage as sharedUseWorldStorage,
} from "@xrift/world-components";
export {
  SharedVehicle as Vehicle,
  SharedScreenShareDisplay as ScreenShareDisplay,
  sharedUseScreenShareContext as useScreenShareContext,
  sharedUseWorldStorage as useWorldStorage,
};
export { XriftSeat as Seat } from "./seat.js";
export { XriftInteractable as Interactable } from "./interactable.js";
