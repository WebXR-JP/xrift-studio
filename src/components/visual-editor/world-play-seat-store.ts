import type { SeatContextValue, SeatEntry } from "@xrift/world-components";

/** Local Play only. Published worlds use XRift's SeatContext and networking. */
export function createWorldPlaySeatStore() {
  const seats = new Map<string, SeatEntry>();
  const listeners = new Set<() => void>();
  let occupied: string | null = null;
  let player: ((entry: SeatEntry | null) => boolean) | null = null;
  const notify = () => listeners.forEach((listener) => listener());
  const leave = () => {
    if (occupied === null) return;
    player?.(null);
    occupied = null;
    notify();
  };
  const contextValue: SeatContextValue = {
    registerSeat(id, entry) {
      if (occupied === id && seats.get(id) !== entry) leave();
      seats.set(id, entry);
    },
    unregisterSeat(id, entry) {
      if (seats.get(id) !== entry) return;
      if (occupied === id) leave();
      seats.delete(id);
    },
    sit(id) {
      const entry = seats.get(id);
      if (!entry || occupied === id || !player) return;
      if (occupied !== null) leave();
      if (!player(entry)) return;
      occupied = id;
      notify();
    },
    getOccupantId: (id) => occupied === id ? "studio-play-local-user" : null,
    subscribeOccupancy(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getLocalUserId: () => "studio-play-local-user",
    registerVehicle() {},
    unregisterVehicle() {},
    getRemoteVehiclePose: () => null,
  };
  return {
    contextValue,
    leave,
    getEntry: () => occupied === null ? null : seats.get(occupied) ?? null,
    bindPlayer(handler: (entry: SeatEntry | null) => boolean) {
      player = handler;
      return () => { leave(); player = null; };
    },
  };
}
export type WorldPlaySeatStore = ReturnType<typeof createWorldPlaySeatStore>;
