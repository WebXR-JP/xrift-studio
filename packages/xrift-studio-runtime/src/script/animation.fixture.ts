/**
 * Live Animation control, without a mixer.
 *
 * The bridge is the part a behavior graph talks to, and the ways it can go
 * wrong are invisible in a rendered preview: a pause that does not survive the
 * next resolve, a clip switch that silently keeps the old clip, or an override
 * that outlives the trigger that set it.
 */

import {
  createXriftAnimationRuntimeBridge,
  type XriftAnimationRuntimeController,
} from "./animation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Animation bridge fixture: ${message}`);
}

type ControllerLog = string[];

function stubController(log: ControllerLog): XriftAnimationRuntimeController & {
  state: { playing: boolean; time: number; clipIndex: number; speed: number };
} {
  const state = { playing: false, time: 0, clipIndex: 0, speed: 1 };
  return {
    state,
    select(clipIndex, loop) {
      state.clipIndex = clipIndex;
      log.push(`select:${clipIndex}:${loop}`);
    },
    play(fromSeconds) {
      state.playing = true;
      if (fromSeconds !== null) state.time = fromSeconds;
      log.push(`play:${fromSeconds ?? "-"}`);
    },
    pause() {
      state.playing = false;
      log.push("pause");
    },
    stop() {
      state.playing = false;
      state.time = 0;
      log.push("stop");
    },
    setSpeed(speed) {
      state.speed = speed;
      log.push(`speed:${speed}`);
    },
    seek(seconds) {
      state.time = seconds;
      log.push(`seek:${seconds}`);
    },
    sample() {
      return { playing: state.playing, time: state.time, duration: 4 };
    },
  };
}

export function runAnimationRuntimeBridgeFixtureAssertions(): void {
  const log: ControllerLog = [];
  const controller = stubController(log);
  const bridge = createXriftAnimationRuntimeBridge({
    componentId: "component-animation",
    clipNames: ["Idle", "Open", "Close"],
    clipIndex: 0,
    autoplay: false,
    speed: 1,
    loop: false,
  });
  bridge.connect(controller);
  const trigger = {};

  // Connecting must not start anything: the cue list owns autoplay, and a
  // second owner starting the same clip would fight over its start time.
  assert(
    !log.some((entry) => entry.startsWith("play")),
    "connecting the bridge started playback on its own",
  );

  bridge.command(trigger, 0, "trigger", { type: "play" });
  assert(controller.state.playing, "a play command did not reach the controller");
  bridge.sample();
  assert(bridge.read().playing, "the bridge did not report live playback");

  bridge.command(trigger, 0, "trigger", { type: "select", clipIndex: 2 });
  assert(
    controller.state.clipIndex === 2,
    "selecting a clip did not reach the controller",
  );
  assert(
    bridge.read().clipIndex === 2,
    "the bridge kept reporting the previous clip",
  );

  bridge.command(trigger, 0, "trigger", { type: "seek", time: 1.5 });
  assert(controller.state.time === 1.5, "a seek did not reach the controller");

  bridge.command(trigger, 0, "trigger", { type: "pause" });
  bridge.sample();
  assert(!bridge.read().playing, "a pause did not stop playback");

  // An override is owner-ordered; the later owner wins, and removing it puts
  // the authored speed back.
  bridge.setOwner(trigger, 0, "trigger", { speed: 2 });
  assert(bridge.read().speed === 2, "a speed override was not applied");
  const later = {};
  bridge.setOwner(later, 1, "script", { speed: 0.5 });
  assert(bridge.read().speed === 0.5, "the later owner did not win");
  bridge.removeOwner(later);
  assert(bridge.read().speed === 2, "removing an owner did not restore the earlier one");
  bridge.removeOwner(trigger);
  assert(bridge.read().speed === 1, "removing every owner did not restore the authored speed");

  // A clip index outside the Model's range lands on the last clip rather than
  // leaving the Entity animating nothing.
  bridge.command(trigger, 0, "trigger", { type: "select", clipIndex: 99 });
  assert(
    bridge.read().clipIndex === 2,
    "an out-of-range clip index was not clamped to the Model's clips",
  );

  // Re-authoring the Component keeps the commanded state: an author changing
  // the speed in the Inspector must not silently restart a paused clip.
  bridge.configure({
    clipNames: ["Idle", "Open", "Close"],
    clipIndex: 0,
    autoplay: false,
    speed: 3,
    loop: true,
  });
  assert(bridge.read().speed === 3, "re-authoring did not update the speed");
  assert(bridge.read().loop, "re-authoring did not update the loop flag");
  assert(
    bridge.read().clipIndex === 2,
    "re-authoring discarded the clip a graph had selected",
  );
}
