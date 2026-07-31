import { Object3D } from "three";

import {
  createXriftAudioSourceRuntimeBridge,
  type XriftAudioSourceRuntimeBridge,
  type XriftAudioSourceRuntimeController,
} from "./audio-source.js";
import { createScriptResources } from "./host.js";

/**
 * Exercises the Script host's authored Audio Source discovery and ownership
 * without mounting React, React Three Fiber, or a browser AudioContext.
 */
export async function runScriptAudioSourceHostFixtureAssertions(): Promise<void> {
  const root = entityObject("entity-root");
  const first = audioSourceObject({
    componentId: "audio-first",
    audioAssetId: "asset-music",
    volume: 0.5,
  });
  const second = audioSourceObject({
    componentId: "audio-second",
    audioAssetId: "asset-music",
    volume: 0.4,
  });
  const missing = audioSourceObject({
    componentId: "audio-missing",
    audioAssetId: "asset-missing",
    sourceStatus: "missing",
    volume: 0.7,
  });
  root.add(first.object, second.object, missing.object);

  const childEntity = entityObject("entity-child");
  const childSource = audioSourceObject({
    componentId: "audio-child",
    audioAssetId: "asset-music",
    volume: 0.9,
  });
  childEntity.add(childSource.object);
  root.add(childEntity);

  const firstController = controlledAudioSource("playing");
  const secondController = controlledAudioSource("unavailable");
  const disconnectFirst = first.bridge.connect(firstController.controller);
  const disconnectSecond = second.bridge.connect(secondController.controller);

  const earlier = createScriptResources({
    object3d: root,
    entityId: "entity-root",
    componentId: "script-earlier",
    order: 10,
    resolveAsset: () => null,
  });
  const later = createScriptResources({
    object3d: root,
    entityId: "entity-root",
    componentId: "script-later",
    order: 20,
    resolveAsset: () => null,
  });

  assert(
    earlier.audioSources.list().length === 3,
    "child Entity Audio Sources leaked into the owning Entity scope",
  );
  assert(
    earlier.audioSources
      .select({ audioAssetId: "asset-music" })
      .count() === 2,
    "the live audioAssetId selector did not match both owned sources",
  );
  assert(
    earlier.audioSources
      .select({ componentId: "audio-first" })
      .count() === 1,
    "the componentId selector did not isolate one source",
  );
  assert(
    earlier.audioSources.list().find(
      (entry) => entry.componentId === "audio-missing",
    )?.status === "missing",
    "a missing authored source did not expose a stable status",
  );

  earlier.audioSources.setVolume(0.2);
  later.audioSources.setVolume(0.8);
  earlier.audioSources.setVolume(0.3);
  assert(
    first.bridge.read().volume === 0.8 &&
      second.bridge.read().volume === 0.8,
    "a lower-order Script overrode a later Script owner",
  );

  later.audioSources.reset();
  assert(
    first.bridge.read().volume === 0.3,
    "removing one owner did not reveal the remaining Script override",
  );
  const firstOnly = earlier.audioSources.select({
    componentId: "audio-first",
  });
  firstOnly.setVolume(0.6);
  assert(
    first.bridge.read().volume === 0.6 &&
      second.bridge.read().volume === 0.3,
    "a selected runtime override affected an unmatched source",
  );
  earlier.audioSources.setVolume(0.45);
  assert(
    first.bridge.read().volume === 0.45 &&
      second.bridge.read().volume === 0.45,
    "latest writes within one Script were not composed per field",
  );
  firstOnly.setLoop(true);
  assert(
    first.bridge.read().loop && !second.bridge.read().loop,
    "the selected loop override affected an unmatched source",
  );

  earlier.audioSources.pause();
  await flushCommands();
  await firstOnly.play();
  assert(
    first.bridge.read().playback === "play" &&
      second.bridge.read().playback === "pause",
    "a specific command changed an unmatched Audio Source",
  );
  firstOnly.reset();
  await flushCommands();
  assert(
    first.bridge.read().playback === "pause" &&
      second.bridge.read().playback === "pause",
    "resetting a selected handle did not reveal the remaining root command",
  );

  const music = earlier.audioSources.select({
    audioAssetId: "asset-music",
  });
  const started = await music.play();
  assert(
    started === 1,
    "play() did not return the number of sources that actually started",
  );
  const firstPlaybackRevision = first.bridge.read().playbackRevision;
  const acceptedPauseCount = music.pause();
  await flushCommands();
  assert(
    acceptedPauseCount === 2 &&
      first.bridge.read().playbackRevision > firstPlaybackRevision,
    "a subsequent command did not receive a distinct bridge revision",
  );
  assert(
    music.seek(3.5) === 2,
    "seek() did not report the matched source count",
  );
  await flushCommands();
  assert(
    firstController.seekTimes[firstController.seekTimes.length - 1] === 3.5,
    "seek() did not reach the connected runtime controller",
  );

  await later.audioSources
    .select({ componentId: "audio-first" })
    .play();
  const laterOwnerRevision = first.bridge.read().playbackRevision;
  earlier.audioSources
    .select({ componentId: "audio-first" })
    .stop();
  await flushCommands();
  assert(
    first.bridge.read().playback === "play" &&
      first.bridge.read().playbackRevision > laterOwnerRevision,
    "equal local command counters collided or bypassed owner ordering",
  );

  later.dispose();
  await flushCommands();
  assert(
    first.bridge.read().volume === 0.45,
    "hot-reload cleanup removed another Script owner's override",
  );
  earlier.dispose();
  await flushCommands();
  assert(
    first.bridge.read().volume === 0.5 &&
      first.bridge.read().loop === false &&
      first.bridge.read().playback === "pause",
    "Play Stop did not restore the authored Audio Source state",
  );

  disconnectFirst();
  disconnectSecond();
}

function entityObject(entityId: string): Object3D {
  const object = new Object3D();
  object.userData.renderedEntityId = entityId;
  return object;
}

function audioSourceObject({
  componentId,
  audioAssetId,
  volume,
  sourceStatus = "available",
}: {
  componentId: string;
  audioAssetId: string;
  volume: number;
  sourceStatus?: "available" | "missing";
}): {
  object: Object3D;
  bridge: XriftAudioSourceRuntimeBridge;
} {
  const bridge = createXriftAudioSourceRuntimeBridge({
    componentId,
    audioAssetId,
    spatial: true,
    enabled: true,
    sourceStatus,
    volume,
    loop: false,
    autoplay: false,
  });
  const object = new Object3D();
  object.userData.xriftAudioSourceRuntime = bridge;
  return { object, bridge };
}

function controlledAudioSource(
  playResult: "playing" | "unavailable",
): {
  controller: XriftAudioSourceRuntimeController;
  seekTimes: number[];
} {
  const seekTimes: number[] = [];
  const controller: XriftAudioSourceRuntimeController = {
    setVolume: () => {},
    setLoop: () => {},
    play: async () => playResult,
    pause: () => true,
    stop: () => true,
    seek: (time) => {
      seekTimes.push(time);
      return true;
    },
  };
  return { controller, seekTimes };
}

async function flushCommands(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Script Audio Source host fixture failed: ${message}`);
  }
}
