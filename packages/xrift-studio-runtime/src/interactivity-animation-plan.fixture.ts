/**
 * The rules three surfaces have to agree on when they play a graph's clips.
 *
 * Studio's Scene View, Studio's Play preview and the code the compiler writes
 * all turn the same cues into the same playback, and every one of the readings
 * below was a separate copy at some point. The one that matters most is「終了
 * 時刻が無ければループ」: a surface that got it wrong played the clip once and
 * stopped, which looks like the graph being broken rather than a rule being
 * applied differently in one place.
 */

import { planInteractivityAnimationCues } from "./interactivity-adapter.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Animation plan fixture: ${message}`);
}

export function runInteractivityAnimationPlanFixtureAssertions(): void {
  // No end time means nothing stops it, which on a mixer is a loop.
  const [looping] = planInteractivityAnimationCues([
    { animationIndex: 3, delaySeconds: 0 },
  ]);
  assert(looping?.loop === true, "an unbounded start did not loop");
  assert(looping?.index === 3, "the plan lost the clip index");
  assert(looping?.speed === 1, "a cue with no speed did not default to 1");
  assert(looping?.startTime === 0, "a cue with no offset did not start at 0");

  // A named end time is one pass, and so is a stop the same graph performs.
  assert(
    planInteractivityAnimationCues([
      { animationIndex: 0, delaySeconds: 0, endTime: 2 },
    ])[0]?.loop === false,
    "a clip with an end time looped",
  );
  assert(
    planInteractivityAnimationCues([
      { animationIndex: 0, delaySeconds: 0, stopSeconds: 4 },
    ])[0]?.loop === false,
    "a clip the graph stops later looped",
  );
  // `endTime: null` is the spec's "play to the end", which is unbounded.
  assert(
    planInteractivityAnimationCues([
      { animationIndex: 0, delaySeconds: 0, endTime: null },
    ])[0]?.loop === true,
    "an explicit null end time did not loop",
  );

  // The earliest start wins: a mixer has one action per clip, so a later cue
  // has no second playback to be given.
  const [earliest] = planInteractivityAnimationCues([
    { animationIndex: 1, delaySeconds: 2, speed: 4 },
    { animationIndex: 1, delaySeconds: 0, speed: 3 },
    { animationIndex: 1, delaySeconds: 5 },
  ]);
  assert(
    earliest?.delaySeconds === 0 && earliest.speed === 3,
    "a later cue overwrote the one that starts first",
  );
  assert(
    planInteractivityAnimationCues([
      { animationIndex: 1, delaySeconds: 2 },
      { animationIndex: 1, delaySeconds: 5 },
    ]).length === 1,
    "one clip produced more than one plan",
  );

  // Values that cannot be applied fall back rather than reaching the mixer: a
  // zero timeScale is a frozen clip, and NaN poisons the action's time.
  const [guarded] = planInteractivityAnimationCues([
    { animationIndex: 0, delaySeconds: 0, speed: 0, startTime: Number.NaN },
  ]);
  assert(guarded?.speed === 1, "a zero speed was passed through to the mixer");
  assert(guarded?.startTime === 0, "a non-finite start offset was passed through");
  assert(
    planInteractivityAnimationCues([
      { animationIndex: 0, delaySeconds: 0, startTime: -3 },
    ])[0]?.startTime === 0,
    "a negative start offset was passed through",
  );

  // Plans come back in clip order, so what a surface starts does not depend on
  // the order the graph happened to reach the nodes.
  assert(
    planInteractivityAnimationCues([
      { animationIndex: 2, delaySeconds: 0 },
      { animationIndex: 0, delaySeconds: 0 },
      { animationIndex: 1, delaySeconds: 0 },
    ])
      .map((plan) => plan.index)
      .join(",") === "0,1,2",
    "plans are not returned in clip order",
  );
  assert(
    planInteractivityAnimationCues([]).length === 0,
    "an empty cue list produced a plan",
  );
}
