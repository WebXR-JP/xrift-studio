/**
 * Several clips on one Entity, running at once.
 *
 * The Animation Component plays one clip, and until a graph could start clips
 * of its own that was the only reading of「再生中」. A Model whose motion is
 * spread over dozens of clips needs the other one, and the ways it goes wrong
 * are invisible in a preview: a graph clip that steals the Component's action
 * and takes its loop with it, a stop that stops everything, or a clip that
 * silently runs once when the graph asked for a loop.
 */

import {
  AnimationClip,
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  Object3D,
  VectorKeyframeTrack,
} from "three";

import { createXriftAnimationMixerController } from "./animation-mixer.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Animation mixer fixture: ${message}`);
}

function clip(name: string, duration: number): AnimationClip {
  return new AnimationClip(name, duration, [
    new VectorKeyframeTrack(
      ".position",
      [0, duration],
      [0, 0, 0, 0, 1, 0],
    ),
  ]);
}

export function runAnimationMixerControllerFixtureAssertions(): void {
  const root = new Object3D();
  const mixer = new AnimationMixer(root);
  const clips = [clip("Idle", 2), clip("Gulls", 3), clip("Waves", 4)];
  const controller = createXriftAnimationMixerController({
    mixer,
    clips,
    clipIndex: 0,
    loop: false,
    speed: 1,
  });

  const action = (index: number) => mixer.clipAction(clips[index]!);

  // The Component plays its own clip, once, as it always has.
  controller.play(null);
  assert(action(0).isRunning(), "the Component's clip did not start");

  // Two graph-started clips run beside it rather than replacing it.
  controller.playClip?.(1, { loop: true, speed: 1, fromSeconds: null });
  controller.playClip?.(2, { loop: true, speed: 2, fromSeconds: null });
  assert(action(0).isRunning(), "starting a graph clip stopped the Component's");
  assert(action(1).isRunning(), "the first graph clip did not start");
  assert(action(2).isRunning(), "the second graph clip did not start");

  // Looping is per clip: the Component asked for one pass and must keep it
  // while the graph's clips repeat.
  assert(action(0).loop === LoopOnce, "the Component's clip lost its single pass");
  assert(action(1).loop === LoopRepeat, "a graph clip did not loop");
  assert(action(2).timeScale === 2, "a graph clip did not take its own speed");
  assert(action(0).timeScale === 1, "a graph clip changed the Component's speed");

  // Running the mixer past the Component clip's duration leaves the looping
  // graph clips going, which is the whole point of an idle that never ends.
  mixer.update(5);
  assert(action(1).isRunning(), "a looping graph clip stopped at its duration");
  assert(action(2).isRunning(), "a looping graph clip stopped at its duration");

  // A stop names one clip.
  controller.stopClip?.(1);
  assert(!action(1).isRunning(), "stopping a graph clip left it running");
  assert(action(2).isRunning(), "stopping one graph clip stopped the others");

  // An index outside the Model's clips lands on the last one instead of
  // starting nothing at all.
  controller.playClip?.(99, { loop: false, speed: 1, fromSeconds: null });
  assert(action(2).isRunning(), "an out-of-range clip index started nothing");

  // A start offset is clip-local and clamped to the clip.
  controller.playClip?.(1, { loop: false, speed: 1, fromSeconds: 99 });
  assert(
    Math.abs(action(1).time - clips[1]!.duration) < 1e-6,
    "a start offset past the clip was not clamped",
  );

  // The Component's own clip ran out during the update above; restarting it is
  // what makes the next assertion about stopStartedClips mean anything.
  controller.play(null);
  controller.stopStartedClips?.();
  assert(!action(1).isRunning(), "stopStartedClips left a graph clip running");
  assert(!action(2).isRunning(), "stopStartedClips left a graph clip running");
  assert(
    action(0).isRunning(),
    "stopStartedClips stopped the Component's own clip",
  );

  controller.dispose();
  assert(!action(0).isRunning(), "dispose left the Component's clip running");
}
