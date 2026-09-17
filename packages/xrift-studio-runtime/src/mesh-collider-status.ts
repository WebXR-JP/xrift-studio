/** Lifecycle of one model or generated collider set, not just its download. */
export type XriftColliderLoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export type XriftColliderLoadRegistration = {
  update(state: XriftColliderLoadState): void;
  dispose(): void;
};

export type XriftColliderLoadTracker = {
  register(): XriftColliderLoadRegistration;
};
