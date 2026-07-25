import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Audio as ThreeAudio,
  AudioListener,
  AudioLoader,
  PositionalAudio,
  type Camera,
} from "three";

export const XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY =
  "xriftAudioSourceRuntime" as const;

export type XriftAudioSourceRuntimeStatus =
  | "disabled"
  | "missing"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "stopped"
  | "autoplay-blocked"
  | "unavailable";

export type XriftAudioSourceRuntimeOverrides = {
  volume?: number;
  loop?: boolean;
};

export type XriftAudioSourceRuntimeCommand =
  | { type: "play"; revision: number }
  | { type: "pause"; revision: number }
  | { type: "stop"; revision: number }
  | { type: "seek"; time: number; revision: number };

export type XriftAudioSourceRuntimeState = {
  readonly revision: number;
  readonly componentId: string;
  readonly audioAssetId: string;
  readonly spatial: boolean;
  readonly enabled: boolean;
  readonly status: XriftAudioSourceRuntimeStatus;
  readonly playing: boolean;
  readonly currentTime: number;
  readonly duration: number;
  readonly volume: number;
  readonly loop: boolean;
  readonly playback: "play" | "pause" | "stop";
  readonly playbackRevision: number;
  readonly seekTime?: number;
  readonly seekRevision: number;
};

type XriftAudioSourceRuntimeOwner = {
  order: number;
  key: string;
  overrides: XriftAudioSourceRuntimeOverrides;
  playback?: "play" | "pause" | "stop";
  seekTime?: number;
};

type XriftAudioSourceRuntimeAuthoredState = {
  enabled: boolean;
  sourceStatus: XriftAudioSourceSourceStatus;
  volume: number;
  loop: boolean;
  autoplay: boolean;
};

export type XriftAudioSourcePlayResult =
  | "playing"
  | "autoplay-blocked"
  | "unavailable";

export type XriftAudioSourceRuntimeController = {
  setVolume(value: number): void;
  setLoop(value: boolean): void;
  play(): Promise<XriftAudioSourcePlayResult>;
  pause(): boolean;
  stop(): boolean;
  seek(time: number): boolean;
};

export type XriftAudioSourceRuntimeBridge = {
  setOwner(
    owner: object,
    order: number,
    key: string,
    overrides: XriftAudioSourceRuntimeOverrides,
  ): void;
  removeOwner(owner: object): void;
  /**
   * Commands are owner ordered like scalar overrides. The promise always
   * resolves; a browser autoplay refusal becomes false + autoplay-blocked.
   */
  command(
    owner: object,
    order: number,
    key: string,
    command: XriftAudioSourceRuntimeCommand,
  ): Promise<boolean>;
  read(): Readonly<XriftAudioSourceRuntimeState>;
  /** Runtime component hook; Script hosts do not call these lifecycle methods. */
  configure(authored: XriftAudioSourceRuntimeAuthoredState): void;
  connect(controller: XriftAudioSourceRuntimeController): () => void;
  refresh(): Promise<boolean>;
  observe(
    observation: Partial<
      Pick<
        XriftAudioSourceRuntimeState,
        "status" | "playing" | "currentTime" | "duration"
      >
    >,
  ): void;
};

export type XriftAudioSourceSourceStatus =
  | "available"
  | "loading"
  | "missing"
  | "unavailable";

export type CreateXriftAudioSourceRuntimeBridgeOptions = {
  componentId: string;
  audioAssetId?: string;
  spatial: boolean;
  enabled: boolean;
  sourceStatus: XriftAudioSourceSourceStatus;
  volume: number;
  loop: boolean;
  autoplay: boolean;
};

/**
 * DOM-free owner composition used by both Studio Play and generated output.
 * The React component merely connects a Three.js player to this state machine.
 */
export function createXriftAudioSourceRuntimeBridge(
  options: CreateXriftAudioSourceRuntimeBridgeOptions,
): XriftAudioSourceRuntimeBridge {
  const owners = new Map<object, XriftAudioSourceRuntimeOwner>();
  let authored: XriftAudioSourceRuntimeAuthoredState = {
    enabled: options.enabled,
    sourceStatus: options.sourceStatus,
    volume: clampUnit(options.volume),
    loop: options.loop,
    autoplay: options.autoplay,
  };
  let controller: XriftAudioSourceRuntimeController | null = null;
  let playbackRevision = 0;
  let seekRevision = 0;
  let state: XriftAudioSourceRuntimeState = {
    revision: 0,
    componentId: options.componentId,
    audioAssetId: options.audioAssetId?.trim() ?? "",
    spatial: options.spatial,
    enabled: authored.enabled,
    status: initialStatus(authored),
    playing: false,
    currentTime: 0,
    duration: 0,
    volume: authored.volume,
    loop: authored.loop,
    playback: authored.autoplay ? "play" : "pause",
    playbackRevision,
    seekTime: 0,
    seekRevision,
  };
  let appliedPlaybackRevision = -1;
  let appliedSeekRevision = -1;

  const orderedOwners = () =>
    [...owners.values()].sort(
      (left, right) =>
        left.order - right.order || left.key.localeCompare(right.key),
    );

  const recompute = (
    commandChanged = false,
    seekChanged = false,
  ): XriftAudioSourceRuntimeState => {
    let volume = authored.volume;
    let loop = authored.loop;
    let playback: XriftAudioSourceRuntimeState["playback"] =
      authored.autoplay ? "play" : "pause";
    let seekTime = 0;
    for (const owner of orderedOwners()) {
      if (owner.overrides.volume !== undefined) {
        volume = clampUnit(owner.overrides.volume);
      }
      if (owner.overrides.loop !== undefined) loop = owner.overrides.loop;
      if (owner.playback !== undefined) playback = owner.playback;
      if (owner.seekTime !== undefined) seekTime = owner.seekTime;
    }
    if (commandChanged) playbackRevision += 1;
    if (seekChanged) seekRevision += 1;
    state = {
      ...state,
      revision: state.revision + 1,
      enabled: authored.enabled,
      volume,
      loop,
      playback,
      playbackRevision,
      seekTime,
      seekRevision,
      ...forcedAvailabilityState(authored),
    };
    return state;
  };

  const apply = async (force = false): Promise<boolean> => {
    const target = controller;
    const unavailable = forcedAvailabilityState(authored);
    if (unavailable.status) {
      if (target) target.stop();
      state = { ...state, ...unavailable };
      return false;
    }
    if (!target) {
      state = {
        ...state,
        status: "unavailable",
        playing: false,
      };
      return false;
    }

    target.setVolume(state.volume);
    target.setLoop(state.loop);
    if (
      state.seekTime !== undefined &&
      (force || appliedSeekRevision !== state.seekRevision)
    ) {
      target.seek(state.seekTime);
      appliedSeekRevision = state.seekRevision;
    }
    if (!force && appliedPlaybackRevision === state.playbackRevision) {
      return state.playing;
    }
    appliedPlaybackRevision = state.playbackRevision;
    if (state.playback === "pause") {
      const paused = target.pause();
      state = {
        ...state,
        status: paused ? "paused" : "unavailable",
        playing: false,
      };
      return paused;
    }
    if (state.playback === "stop") {
      const stopped = target.stop();
      state = {
        ...state,
        status: stopped ? "stopped" : "unavailable",
        playing: false,
        currentTime: 0,
      };
      return stopped;
    }
    const requestedController = target;
    const requestedRevision = state.playbackRevision;
    try {
      const result = await target.play();
      if (
        controller !== requestedController ||
        state.playbackRevision !== requestedRevision ||
        state.playback !== "play" ||
        forcedAvailabilityState(authored).status
      ) {
        // Loading and AudioContext.resume are asynchronous. A newer Stop,
        // Pause, reset, or unmount always wins over this stale completion.
        await apply(true);
        return false;
      }
      state = {
        ...state,
        status: result,
        playing: result === "playing",
      };
      return result === "playing";
    } catch {
      if (
        controller !== requestedController ||
        state.playbackRevision !== requestedRevision ||
        state.playback !== "play" ||
        forcedAvailabilityState(authored).status
      ) {
        await apply(true);
        return false;
      }
      state = {
        ...state,
        status: "unavailable",
        playing: false,
      };
      return false;
    }
  };

  return {
    setOwner(owner, order, key, overrides) {
      owners.set(owner, {
        ...(owners.get(owner) ?? { order, key }),
        order,
        key,
        overrides: normalizeOverrides(overrides),
      });
      recompute();
      void apply();
    },
    removeOwner(owner) {
      const previous = owners.get(owner);
      if (!previous || !owners.delete(owner)) return;
      recompute(
        previous.playback !== undefined,
        previous.seekTime !== undefined,
      );
      void apply();
    },
    async command(owner, order, key, command) {
      const previous = owners.get(owner);
      const next: XriftAudioSourceRuntimeOwner = {
        order,
        key,
        overrides: previous?.overrides ?? {},
        ...(previous?.playback !== undefined
          ? { playback: previous.playback }
          : {}),
        ...(previous?.seekTime !== undefined
          ? { seekTime: previous.seekTime }
          : {}),
      };
      if (command.type === "seek") {
        next.seekTime = clampTime(command.time);
        owners.set(owner, next);
        recompute(false, true);
      } else {
        next.playback = command.type;
        owners.set(owner, next);
        recompute(true, false);
      }
      const applied = await apply();
      return command.type === "play" && state.playback !== "play"
        ? false
        : applied;
    },
    read: () => state,
    configure(next) {
      const normalized: XriftAudioSourceRuntimeAuthoredState = {
        enabled: next.enabled,
        sourceStatus: next.sourceStatus,
        volume: clampUnit(next.volume),
        loop: next.loop,
        autoplay: next.autoplay,
      };
      const playbackChanged =
        authored.autoplay !== normalized.autoplay ||
        authored.enabled !== normalized.enabled ||
        authored.sourceStatus !== normalized.sourceStatus;
      authored = normalized;
      recompute(playbackChanged);
      void apply();
    },
    connect(nextController) {
      controller = nextController;
      appliedPlaybackRevision = -1;
      appliedSeekRevision = -1;
      nextController.setVolume(state.volume);
      nextController.setLoop(state.loop);
      return () => {
        if (controller !== nextController) return;
        nextController.stop();
        controller = null;
        appliedPlaybackRevision = -1;
        appliedSeekRevision = -1;
      };
    },
    refresh: () => apply(true),
    observe(observation) {
      const forced = forcedAvailabilityState(authored);
      state = {
        ...state,
        ...observation,
        ...(forced.status ? forced : {}),
      };
    },
  };
}

export type XriftAudioSourceProps = {
  componentId: string;
  audioAssetId?: string;
  assetUrl?: string | null;
  sourceStatus?: XriftAudioSourceSourceStatus;
  enabled: boolean;
  volume: number;
  loop: boolean;
  autoplay: boolean;
  spatial: boolean;
  refDistance: number;
  rolloffFactor: number;
  maxDistance: number;
};

/**
 * Shared Audio Source renderer. Edit mode decides whether to mount it; when
 * mounted it behaves identically in Studio Play and generated classic JSX.
 */
export function XriftAudioSource({
  componentId,
  audioAssetId,
  assetUrl,
  sourceStatus = assetUrl ? "available" : "missing",
  enabled,
  volume,
  loop,
  autoplay,
  spatial,
  refDistance,
  rolloffFactor,
  maxDistance,
}: XriftAudioSourceProps) {
  const camera = useThree((fiberState) => fiberState.camera);
  const listener = useMemo(() => listenerForCamera(camera), [camera]);
  const sound = useMemo(
    () =>
      spatial
        ? new PositionalAudio(listener)
        : new ThreeAudio(listener),
    [assetUrl, audioAssetId, listener, spatial],
  );
  const bridge = useMemo(
    () =>
      createXriftAudioSourceRuntimeBridge({
        componentId,
        audioAssetId,
        spatial,
        enabled,
        sourceStatus,
        volume,
        loop,
        autoplay,
      }),
    [audioAssetId, componentId, spatial],
  );
  const loadingRef = useRef<Promise<boolean>>(Promise.resolve(false));

  useLayoutEffect(
    () => retainListener(camera, listener),
    [camera, listener],
  );

  useEffect(() => {
    bridge.configure({
      enabled,
      sourceStatus,
      volume,
      loop,
      autoplay,
    });
  }, [autoplay, bridge, enabled, loop, sourceStatus, volume]);

  useLayoutEffect(() => {
    const previous = sound.userData[XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY];
    sound.userData[XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY] = bridge;
    return () => {
      if (
        sound.userData[XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY] === bridge
      ) {
        if (previous === undefined) {
          delete sound.userData[XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY];
        } else {
          sound.userData[XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY] = previous;
        }
      }
    };
  }, [bridge, sound]);

  useLayoutEffect(() => {
    let active = true;
    if (
      !enabled ||
      sourceStatus !== "available" ||
      !assetUrl?.trim()
    ) {
      loadingRef.current = Promise.resolve(false);
      return () => {
        active = false;
      };
    }
    bridge.observe({
      status: "loading",
      playing: false,
      currentTime: 0,
      duration: 0,
    });
    const loading = new AudioLoader()
      .loadAsync(assetUrl)
      .then((buffer) => {
        if (!active) return false;
        sound.setBuffer(buffer);
        bridge.observe({
          status: "ready",
          playing: false,
          currentTime: 0,
          duration: buffer.duration,
        });
        return true;
      })
      .catch(() => {
        if (active) {
          bridge.observe({
            status: "unavailable",
            playing: false,
            currentTime: 0,
            duration: 0,
          });
        }
        return false;
      });
    loadingRef.current = loading;
    void loading.then((loaded) => {
      if (active && loaded) void bridge.refresh();
    });
    return () => {
      active = false;
    };
  }, [assetUrl, bridge, enabled, sound, sourceStatus]);

  useLayoutEffect(() => {
    const controller = createThreeAudioController(
      sound,
      listener,
      () => loadingRef.current,
    );
    const disconnect = bridge.connect(controller);
    void bridge.refresh();
    return () => {
      disconnect();
      try {
        sound.disconnect();
      } catch {
        // A source that never started was never connected.
      }
      try {
        sound.gain.disconnect();
      } catch {
        // Web Audio nodes may already be disconnected during renderer teardown.
      }
    };
  }, [bridge, listener, sound]);

  useEffect(() => {
    if (!(sound instanceof PositionalAudio)) return;
    sound.setRefDistance(clampNonNegative(refDistance));
    sound.setRolloffFactor(clampNonNegative(rolloffFactor));
    sound.setMaxDistance(clampNonNegative(maxDistance));
  }, [maxDistance, refDistance, rolloffFactor, sound]);

  useFrame(() => {
    bridge.observe(readThreeAudioObservation(sound, bridge.read().status));
  });

  return <primitive object={sound} />;
}

type ListenerEntry = {
  listener: AudioListener;
  users: number;
};

const listenersByCamera = new WeakMap<Camera, ListenerEntry>();

function listenerForCamera(camera: Camera): AudioListener {
  const existing = listenersByCamera.get(camera);
  if (existing) return existing.listener;
  const listener = new AudioListener();
  listenersByCamera.set(camera, { listener, users: 0 });
  return listener;
}

function retainListener(camera: Camera, listener: AudioListener): () => void {
  const entry = listenersByCamera.get(camera);
  if (!entry || entry.listener !== listener) return () => {};
  entry.users += 1;
  if (listener.parent !== camera) camera.add(listener);
  return () => {
    entry.users = Math.max(0, entry.users - 1);
    if (entry.users > 0) return;
    if (listener.parent === camera) camera.remove(listener);
    listenersByCamera.delete(camera);
  };
}

type RuntimeThreeAudio = ThreeAudio<AudioNode>;

type ObservableThreeAudio = RuntimeThreeAudio & {
  _progress?: number;
  _startedAt?: number;
};

function createThreeAudioController(
  sound: RuntimeThreeAudio,
  listener: AudioListener,
  loading: () => Promise<boolean>,
): XriftAudioSourceRuntimeController {
  return {
    setVolume(value) {
      sound.setVolume(clampUnit(value));
    },
    setLoop(value) {
      sound.setLoop(value);
    },
    async play() {
      if (!(await loading()) || !sound.buffer) return "unavailable";
      try {
        if (listener.context.state === "suspended") {
          await listener.context.resume();
        }
        if (listener.context.state !== "running") {
          return "autoplay-blocked";
        }
        if (!sound.isPlaying) sound.play();
        return sound.isPlaying ? "playing" : "autoplay-blocked";
      } catch {
        return "autoplay-blocked";
      }
    },
    pause() {
      if (!sound.buffer) return false;
      try {
        sound.pause();
        return true;
      } catch {
        return false;
      }
    },
    stop() {
      try {
        sound.stop();
        sound.offset = 0;
        return true;
      } catch {
        return false;
      }
    },
    seek(time) {
      if (!sound.buffer) return false;
      const wasPlaying = sound.isPlaying;
      try {
        sound.stop();
        sound.offset = clampToDuration(time, sound.buffer.duration);
        if (wasPlaying) sound.play();
        return true;
      } catch {
        return false;
      }
    },
  };
}

function readThreeAudioObservation(
  sound: RuntimeThreeAudio,
  previousStatus: XriftAudioSourceRuntimeStatus,
): Partial<
  Pick<
    XriftAudioSourceRuntimeState,
    "status" | "playing" | "currentTime" | "duration"
  >
> {
  const duration = sound.buffer?.duration ?? 0;
  if (!sound.buffer) {
    return { playing: false, currentTime: 0, duration };
  }
  const internal = sound as ObservableThreeAudio;
  const elapsed = sound.isPlaying
    ? Math.max(sound.context.currentTime - (internal._startedAt ?? 0), 0) *
      sound.playbackRate
    : 0;
  let currentTime =
    (internal._progress ?? 0) + sound.offset + elapsed;
  if (sound.loop && duration > 0) currentTime %= duration;
  else currentTime = clampToDuration(currentTime, duration);
  const status = sound.isPlaying
    ? "playing"
    : previousStatus === "playing"
      ? "stopped"
      : previousStatus;
  return {
    status,
    playing: sound.isPlaying,
    currentTime,
    duration,
  };
}

function normalizeOverrides(
  overrides: XriftAudioSourceRuntimeOverrides,
): XriftAudioSourceRuntimeOverrides {
  return {
    ...(overrides.volume !== undefined
      ? { volume: clampUnit(overrides.volume) }
      : {}),
    ...(overrides.loop !== undefined ? { loop: overrides.loop } : {}),
  };
}

function initialStatus(
  authored: XriftAudioSourceRuntimeAuthoredState,
): XriftAudioSourceRuntimeStatus {
  if (!authored.enabled) return "disabled";
  if (authored.sourceStatus === "missing") return "missing";
  if (authored.sourceStatus === "unavailable") return "unavailable";
  return authored.sourceStatus === "loading" ? "loading" : "ready";
}

function forcedAvailabilityState(
  authored: XriftAudioSourceRuntimeAuthoredState,
): Partial<
  Pick<XriftAudioSourceRuntimeState, "status" | "playing" | "currentTime">
> {
  if (!authored.enabled) {
    return { status: "disabled", playing: false, currentTime: 0 };
  }
  if (authored.sourceStatus === "missing") {
    return { status: "missing", playing: false, currentTime: 0 };
  }
  if (authored.sourceStatus === "loading") {
    return { status: "loading", playing: false };
  }
  if (authored.sourceStatus === "unavailable") {
    return { status: "unavailable", playing: false, currentTime: 0 };
  }
  return {};
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clampTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clampToDuration(value: number, duration: number): number {
  return Math.min(clampTime(value), Math.max(0, duration));
}
