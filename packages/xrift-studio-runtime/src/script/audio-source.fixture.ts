import {
  createXriftAudioSourceRuntimeBridge,
  type XriftAudioSourcePlayResult,
  type XriftAudioSourceRuntimeController,
} from "./audio-source.js";

/**
 * DOM-free contract checks for the shared Studio / published Audio Source
 * bridge. Three.js and browser autoplay behavior are represented by a small
 * controller so owner ordering and failure containment stay deterministic.
 */
export async function runAudioSourceRuntimeFixtureAssertions(): Promise<void> {
  const bridge = createXriftAudioSourceRuntimeBridge({
    componentId: "audio-source-1",
    audioAssetId: "audio-ambient",
    spatial: true,
    enabled: true,
    sourceStatus: "available",
    volume: 0.4,
    loop: false,
    autoplay: false,
  });
  const controller = new FixtureAudioController();
  const disconnect = bridge.connect(controller);
  await bridge.refresh();
  assert(
    bridge.read().status === "paused" &&
      controller.volume === 0.4 &&
      !controller.loop,
    "authored Audio Source defaults were not applied",
  );

  const firstOwner = {};
  const laterOwner = {};
  bridge.setOwner(firstOwner, 1, "script-a", { volume: 0.2, loop: true });
  bridge.setOwner(laterOwner, 2, "script-b", { volume: 0.8 });
  assert(
    bridge.read().volume === 0.8 &&
      bridge.read().loop &&
      Number(controller.volume) === 0.8 &&
      controller.loop,
    "Audio Source overrides did not compose in Script order",
  );

  const started = await bridge.command(firstOwner, 1, "script-a", {
    type: "play",
    revision: 1,
  });
  assert(
    started &&
      bridge.read().status === "playing" &&
      bridge.read().playing,
    "play did not resolve the actual successful start",
  );
  const sought = await bridge.command(firstOwner, 1, "script-a", {
    type: "seek",
    time: 3.5,
    revision: 2,
  });
  assert(
    sought &&
      bridge.read().seekTime === 3.5 &&
      controller.currentTime === 3.5,
    "seek did not reach the connected player",
  );
  const stopped = await bridge.command(firstOwner, 1, "script-a", {
    type: "stop",
    revision: 3,
  });
  assert(
    stopped &&
      bridge.read().status === "stopped" &&
      bridge.read().currentTime === 0,
    "stop did not expose a rewound stopped state",
  );

  controller.playResult = "autoplay-blocked";
  const blocked = await bridge.command(firstOwner, 1, "script-a", {
    type: "play",
    revision: 4,
  });
  assert(
    !blocked &&
      bridge.read().status === "autoplay-blocked" &&
      !bridge.read().playing,
    "autoplay refusal escaped instead of becoming a safe bridge state",
  );
  controller.rejectPlay = true;
  const rejected = await bridge.command(firstOwner, 1, "script-a", {
    type: "play",
    revision: 5,
  });
  assert(
    !rejected && bridge.read().status === "unavailable",
    "a rejected player promise escaped the bridge",
  );

  controller.rejectPlay = false;
  controller.playResult = "playing";
  bridge.removeOwner(laterOwner);
  bridge.removeOwner(firstOwner);
  assert(
    bridge.read().volume === 0.4 &&
      !bridge.read().loop &&
      bridge.read().seekTime === 0 &&
      Number(controller.currentTime) === 0,
    "owner cleanup did not restore authored settings and seek baseline",
  );
  bridge.configure({
    enabled: false,
    sourceStatus: "available",
    volume: 0.6,
    loop: true,
    autoplay: true,
  });
  const disabled = await bridge.command(firstOwner, 1, "script-a", {
    type: "play",
    revision: 6,
  });
  assert(
    !disabled && bridge.read().status === "disabled",
    "a disabled Audio Source reported a successful start",
  );
  disconnect();

  let releaseLoading = () => {};
  const loadingGate = new Promise<void>((resolve) => {
    releaseLoading = resolve;
  });
  const deferredBridge = createXriftAudioSourceRuntimeBridge({
    componentId: "audio-source-deferred",
    audioAssetId: "audio-deferred",
    spatial: false,
    enabled: true,
    sourceStatus: "available",
    volume: 1,
    loop: false,
    autoplay: false,
  });
  const deferredController = new FixtureAudioController();
  deferredController.playGate = loadingGate;
  deferredBridge.connect(deferredController);
  await deferredBridge.refresh();
  const deferredOwner = {};
  const pendingPlay = deferredBridge.command(
    deferredOwner,
    1,
    "script-deferred",
    { type: "play", revision: 1 },
  );
  await Promise.resolve();
  await deferredBridge.command(deferredOwner, 1, "script-deferred", {
    type: "stop",
    revision: 2,
  });
  releaseLoading();
  assert(
    !(await pendingPlay) &&
      !deferredController.playing &&
      deferredBridge.read().status === "stopped",
    "a stale loading play overrode a newer stop command",
  );
}

class FixtureAudioController implements XriftAudioSourceRuntimeController {
  volume = 1;
  loop = false;
  currentTime = 0;
  playResult: XriftAudioSourcePlayResult = "playing";
  rejectPlay = false;
  playGate: Promise<void> | undefined;
  playing = false;

  setVolume(value: number): void {
    this.volume = value;
  }

  setLoop(value: boolean): void {
    this.loop = value;
  }

  async play(): Promise<XriftAudioSourcePlayResult> {
    await this.playGate;
    if (this.rejectPlay) throw new Error("autoplay refused");
    this.playing = this.playResult === "playing";
    return this.playResult;
  }

  pause(): boolean {
    this.playing = false;
    return true;
  }

  stop(): boolean {
    this.playing = false;
    this.currentTime = 0;
    return true;
  }

  seek(time: number): boolean {
    this.currentTime = time;
    return true;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Audio Source runtime fixture: ${message}`);
}
