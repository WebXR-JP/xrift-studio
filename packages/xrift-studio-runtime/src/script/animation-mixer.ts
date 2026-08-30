/**
 * The mixer half of live Animation control.
 *
 * Studio's Play preview and a published world each own an `AnimationMixer` and
 * would otherwise each grow their own idea of what "play from 2 seconds" means.
 * One controller, used by both, is what keeps a graph behaving the same way
 * before and after publishing.
 */

import {
  LoopOnce,
  LoopRepeat,
  type AnimationAction,
  type AnimationClip,
  type AnimationMixer,
} from "three";

import type { XriftAnimationRuntimeController } from "./animation.js";

export type XriftAnimationMixerControllerOptions = {
  mixer: AnimationMixer;
  clips: readonly AnimationClip[];
  clipIndex: number;
  loop: boolean;
  speed: number;
  /**
   * Called when playback starts or stops.
   *
   * The frame loop only advances the mixer while something is running, so it
   * has to be told; polling `isRunning` every frame would keep an idle Scene
   * re-rendering forever.
   */
  onActiveChange?: (active: boolean) => void;
};

export type XriftAnimationMixerController = XriftAnimationRuntimeController & {
  dispose(): void;
};

export function createXriftAnimationMixerController(
  options: XriftAnimationMixerControllerOptions,
): XriftAnimationMixerController {
  const { mixer, clips, onActiveChange } = options;
  let clipIndex = options.clipIndex;
  let loop = options.loop;
  let speed = options.speed;
  let action: AnimationAction | null = null;
  let active = false;

  const setActive = (next: boolean): void => {
    if (active === next) return;
    active = next;
    onActiveChange?.(next);
  };

  const shape = (target: AnimationAction): AnimationAction => {
    target.clampWhenFinished = !loop;
    target.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
    target.timeScale = speed;
    return target;
  };

  /**
   * The action for the current clip, without changing it.
   *
   * Reading has to be side-effect free: the surface that owns the mixer may have
   * started this clip itself, and shaping it here would quietly overwrite the
   * loop and speed that start chose.
   */
  const peek = (): AnimationAction | null => {
    if (action) return action;
    const clip = clips[clipIndex];
    return clip ? mixer.clipAction(clip) : null;
  };

  const ensure = (): AnimationAction | null => {
    if (action) return shape(action);
    const clip = clips[clipIndex];
    if (!clip) return null;
    action = shape(mixer.clipAction(clip));
    return action;
  };

  /**
   * Clips a graph started, kept apart from the Component's single action.
   *
   * `mixer.clipAction` returns one action per clip, so the two paths cannot
   * share: the Component owning `action` shapes it from its own loop and speed,
   * and a graph shaping the same object would silently change the Component's
   * clip. Keeping the graph's clips in their own map is what lets both run.
   */
  const started = new Map<number, AnimationAction>();

  const boundedIndex = (value: number): number =>
    clips.length === 0
      ? -1
      : Math.min(Math.max(Math.trunc(value), 0), clips.length - 1);

  return {
    playClip(nextIndex, options) {
      const index = boundedIndex(nextIndex);
      const clip = clips[index];
      if (!clip) return;
      const target = started.get(index) ?? mixer.clipAction(clip);
      started.set(index, target);
      target.clampWhenFinished = !options.loop;
      target.setLoop(
        options.loop ? LoopRepeat : LoopOnce,
        options.loop ? Infinity : 1,
      );
      target.timeScale = options.speed;
      target.paused = false;
      const from = options.fromSeconds;
      if (from !== null || !target.isRunning()) {
        target.reset();
        target.time =
          from !== null && Number.isFinite(from)
            ? Math.min(Math.max(from, 0), clip.duration)
            : 0;
      }
      target.play();
      setActive(true);
    },
    stopClip(nextIndex) {
      const index = boundedIndex(nextIndex);
      const target = started.get(index);
      if (!target) return;
      target.stop();
      started.delete(index);
      if (started.size === 0 && !(action && action.isRunning())) setActive(false);
    },
    stopStartedClips() {
      for (const target of started.values()) target.stop();
      started.clear();
      if (!(action && action.isRunning())) setActive(false);
    },
    select(nextIndex, nextLoop) {
      loop = nextLoop;
      const bounded =
        clips.length === 0
          ? 0
          : Math.min(Math.max(Math.trunc(nextIndex), 0), clips.length - 1);
      if (bounded === clipIndex) {
        if (action) shape(action);
        return;
      }
      // Switching clips keeps whatever the old one was doing: an author who
      // swaps a clip mid-playback means "play that one instead", not "stop".
      const wasPlaying = Boolean(action && action.isRunning() && !action.paused);
      action?.stop();
      action = null;
      clipIndex = bounded;
      const next = ensure();
      if (!next) {
        setActive(false);
        return;
      }
      if (wasPlaying) {
        next.reset();
        next.play();
        setActive(true);
      }
    },
    play(fromSeconds) {
      const target = ensure();
      if (!target) return;
      target.paused = false;
      if (fromSeconds !== null || !target.isRunning()) {
        target.reset();
        const clip = clips[clipIndex];
        const start = fromSeconds ?? 0;
        target.time =
          clip && Number.isFinite(start)
            ? Math.min(Math.max(start, 0), clip.duration)
            : 0;
      }
      target.play();
      setActive(true);
    },
    pause() {
      if (action) action.paused = true;
      setActive(false);
    },
    stop() {
      action?.stop();
      setActive(false);
    },
    setSpeed(nextSpeed) {
      speed = nextSpeed;
      if (action) action.timeScale = nextSpeed;
    },
    seek(seconds) {
      const target = ensure();
      const clip = clips[clipIndex];
      if (!target || !clip) return;
      target.time = Math.min(Math.max(seconds, 0), clip.duration);
      // A seek on a stopped clip should show that frame, which needs one mixer
      // step; without it the pose stays wherever the clip last left it.
      if (!target.isRunning()) {
        target.play();
        target.paused = true;
      }
      mixer.update(0);
    },
    sample() {
      const clip = clips[clipIndex];
      const live = peek();
      return {
        playing: Boolean(live && live.isRunning() && !live.paused),
        time: live?.time ?? 0,
        duration: clip?.duration ?? 0,
      };
    },
    dispose() {
      for (const target of started.values()) target.stop();
      started.clear();
      action?.stop();
      action = null;
      setActive(false);
    },
  };
}
