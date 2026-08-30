/**
 * Live control over one Entity's Animation playback.
 *
 * Studio's Play preview and a published world each own an `AnimationMixer`, and
 * until now each built a fixed list of actions once and never touched it again:
 * a clip could be started, but nothing could pause it, seek it, switch it, or
 * change its speed while the world was running. A behavior graph that says
 * "play for three seconds, then stop" needs exactly that.
 *
 * The bridge is the seam. It holds the resolved intent — which clip, playing or
 * not, how fast — and a controller supplied by whichever surface owns the mixer
 * applies it. Being DOM-free and renderer-free is what lets composition and
 * cleanup be fixture-tested without a canvas.
 */

export const XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY =
  "xriftAnimationRuntime" as const;

export type XriftAnimationRuntimeOverrides = {
  speed?: number;
  loop?: boolean;
};

export type XriftAnimationRuntimeCommand =
  | { type: "play"; clipIndex?: number; time?: number }
  | { type: "pause" }
  | { type: "stop" }
  | { type: "seek"; time: number }
  | { type: "select"; clipIndex: number }
  // Graph-driven playback. Unlike "play", these name a clip and leave the
  // Component's own clip and its「再生中」state alone, so a Model's sixty-four
  // clips can run together without any of them being the Component's.
  | {
      type: "play-clip";
      clipIndex: number;
      loop: boolean;
      speed: number;
      time: number | null;
    }
  | { type: "stop-clip"; clipIndex: number }
  | { type: "stop-started-clips" };

export type XriftAnimationRuntimeState = {
  readonly revision: number;
  readonly componentId: string;
  readonly clipNames: readonly string[];
  readonly clipIndex: number;
  readonly playing: boolean;
  readonly speed: number;
  readonly loop: boolean;
  /** Clip-local seconds, as last reported by the controller. */
  readonly time: number;
  readonly duration: number;
};

/** The mixer side, supplied by whichever surface renders the Model. */
export type XriftAnimationRuntimeController = {
  select(clipIndex: number, loop: boolean): void;
  play(fromSeconds: number | null): void;
  pause(): void;
  stop(): void;
  setSpeed(speed: number): void;
  seek(seconds: number): void;
  sample(): { playing: boolean; time: number; duration: number };
  /**
   * Graph-driven playback, running beside the Component's own clip.
   *
   * The Animation Component plays one clip, which is what a single「再生中」
   * checkbox can mean. A Model can carry sixty-four: gulls, insects, a boat's
   * wake, all of them meant to run at once. These start and stop clips
   * independently, so a graph can hold as many as the Model has, and the
   * Component keeps behaving exactly as it did.
   */
  playClip?(
    clipIndex: number,
    options: { loop: boolean; speed: number; fromSeconds: number | null },
  ): void;
  stopClip?(clipIndex: number): void;
  /** Every clip this graph started; the Component's own clip is left alone. */
  stopStartedClips?(): void;
};

export type XriftAnimationRuntimeBridge = {
  setOwner(
    owner: object,
    order: number,
    key: string,
    overrides: XriftAnimationRuntimeOverrides,
  ): void;
  removeOwner(owner: object): void;
  command(
    owner: object,
    order: number,
    key: string,
    command: XriftAnimationRuntimeCommand,
  ): void;
  read(): Readonly<XriftAnimationRuntimeState>;
  /** Runtime component hook; Script and trigger hosts do not call this. */
  configure(authored: XriftAnimationRuntimeAuthoredState): void;
  connect(controller: XriftAnimationRuntimeController): () => void;
  /** Refreshes the live time from the controller. Called once per frame. */
  sample(): void;
};

export type XriftAnimationRuntimeAuthoredState = {
  clipNames: readonly string[];
  clipIndex: number;
  autoplay: boolean;
  speed: number;
  loop: boolean;
};

export type CreateXriftAnimationRuntimeBridgeOptions =
  XriftAnimationRuntimeAuthoredState & {
    componentId: string;
  };

function clampSpeed(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(10, Math.max(0.01, value));
}

function clampIndex(value: number, length: number): number {
  if (!Number.isInteger(value) || value < 0) return 0;
  return length === 0 ? 0 : Math.min(value, length - 1);
}

export function createXriftAnimationRuntimeBridge(
  options: CreateXriftAnimationRuntimeBridgeOptions,
): XriftAnimationRuntimeBridge {
  const owners = new Map<
    object,
    { order: number; key: string; overrides: XriftAnimationRuntimeOverrides }
  >();
  let authored: XriftAnimationRuntimeAuthoredState = {
    clipNames: [...options.clipNames],
    clipIndex: clampIndex(options.clipIndex, options.clipNames.length),
    autoplay: options.autoplay,
    speed: clampSpeed(options.speed),
    loop: options.loop,
  };
  let controller: XriftAnimationRuntimeController | null = null;
  // Commanded intent, separate from the authored one so removing a trigger's
  // overrides does not also undo a play it performed.
  let commandedClip: number | null = null;
  let commandedPlaying: boolean | null = null;
  let state: XriftAnimationRuntimeState = {
    revision: 0,
    componentId: options.componentId,
    clipNames: authored.clipNames,
    clipIndex: authored.clipIndex,
    playing: authored.autoplay,
    speed: authored.speed,
    loop: authored.loop,
    time: 0,
    duration: 0,
  };

  const orderedOwners = () =>
    [...owners.values()].sort(
      (left, right) =>
        left.order - right.order || left.key.localeCompare(right.key),
    );

  const resolve = (): XriftAnimationRuntimeState => {
    let speed = authored.speed;
    let loop = authored.loop;
    for (const owner of orderedOwners()) {
      if (owner.overrides.speed !== undefined) {
        speed = clampSpeed(owner.overrides.speed);
      }
      if (owner.overrides.loop !== undefined) loop = owner.overrides.loop;
    }
    state = {
      ...state,
      revision: state.revision + 1,
      clipNames: authored.clipNames,
      clipIndex: clampIndex(
        commandedClip ?? authored.clipIndex,
        authored.clipNames.length,
      ),
      playing: commandedPlaying ?? authored.autoplay,
      speed,
      loop,
    };
    return state;
  };

  const push = (seekTo: number | null, restart: boolean): void => {
    const next = resolve();
    if (!controller) return;
    controller.select(next.clipIndex, next.loop);
    controller.setSpeed(next.speed);
    if (!next.playing) {
      if (seekTo !== null) controller.seek(seekTo);
      return;
    }
    if (restart || seekTo !== null) controller.play(seekTo);
  };

  return {
    setOwner(owner, order, key, overrides) {
      owners.set(owner, { order, key, overrides });
      push(null, false);
    },
    removeOwner(owner) {
      if (!owners.delete(owner)) return;
      push(null, false);
    },
    command(owner, order, key, command) {
      owners.set(owner, {
        order,
        key,
        overrides: owners.get(owner)?.overrides ?? {},
      });
      switch (command.type) {
        case "play":
          if (command.clipIndex !== undefined) commandedClip = command.clipIndex;
          commandedPlaying = true;
          push(command.time ?? null, true);
          return;
        case "pause":
          commandedPlaying = false;
          push(null, false);
          controller?.pause();
          return;
        case "stop":
          commandedPlaying = false;
          push(null, false);
          controller?.stop();
          return;
        case "seek":
          push(command.time, false);
          controller?.seek(command.time);
          return;
        case "select":
          commandedClip = command.clipIndex;
          push(null, state.playing);
          return;
        case "play-clip":
          controller?.playClip?.(command.clipIndex, {
            loop: command.loop,
            speed: command.speed,
            fromSeconds: command.time,
          });
          return;
        case "stop-clip":
          controller?.stopClip?.(command.clipIndex);
          return;
        case "stop-started-clips":
          controller?.stopStartedClips?.();
          return;
      }
    },
    read() {
      return state;
    },
    configure(next) {
      authored = {
        clipNames: [...next.clipNames],
        clipIndex: clampIndex(next.clipIndex, next.clipNames.length),
        autoplay: next.autoplay,
        speed: clampSpeed(next.speed),
        loop: next.loop,
      };
      push(null, false);
    },
    connect(next) {
      controller = next;
      push(null, state.playing);
      return () => {
        if (controller === next) controller = null;
      };
    },
    sample() {
      if (!controller) return;
      const live = controller.sample();
      state = {
        ...state,
        playing: live.playing,
        time: live.time,
        duration: live.duration,
      };
    },
  };
}

export function isXriftAnimationRuntimeBridge(
  value: unknown,
): value is XriftAnimationRuntimeBridge {
  const candidate = value as XriftAnimationRuntimeBridge | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.setOwner === "function" &&
    typeof candidate.command === "function" &&
    typeof candidate.read === "function" &&
    typeof candidate.connect === "function"
  );
}
