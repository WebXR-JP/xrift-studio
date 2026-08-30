import type { ModelAnimationMetadata } from "./asset-manifest";
import {
  groupModelAnimations,
  modelAnimationGroupLabel,
} from "./model-animation-groups";

/** Inspectorのclip一覧が、連番clipを1行へまとめられることを確かめる。 */
export function runModelAnimationGroupFixtureAssertions(): void {
  assertLabels();
  assertGrouping();
}

function assertLabels(): void {
  assert(
    modelAnimationGroupLabel("Isopod_00Action.011") === "Isopod",
    "A Blender action suffix and instance index were not removed",
  );
  // 左右の羽 (`_-1` / `_1`) は同じ動きの対なので、同じグループへ寄せる。
  assert(
    modelAnimationGroupLabel("Gull_0_Wing_-1Action.003") === "Gull_0_Wing" &&
      modelAnimationGroupLabel("Gull_0_Wing_1Action.003") === "Gull_0_Wing",
    "Mirrored clips of one node did not land in the same group",
  );
  assert(
    modelAnimationGroupLabel("Boat_WakeAction.002") === "Boat_Wake",
    "A clip without an instance index lost more than its action suffix",
  );
  assert(
    modelAnimationGroupLabel("Idle") === "Idle",
    "A plain clip name was rewritten",
  );
  assert(
    modelAnimationGroupLabel("   ") === "Animation",
    "A blank clip name produced a blank group label",
  );
  assert(
    modelAnimationGroupLabel("003") === "003",
    "A clip named only by its index collapsed to an empty label",
  );
}

function assertGrouping(): void {
  const groups = groupModelAnimations([
    clip("Isopod_00Action.011", 10, 2),
    clip("Isopod_01Action.010", 10, 2),
    clip("Isopod_02Action.010", 10, 2),
    clip("Boat_WakeAction.002", 250, 2),
    clip("Gull_0Action.003", 7.5, 2),
    clip("Gull_1Action.003", 7.5, 2),
  ]);
  assert(groups.length === 3, "Sibling clips were not collapsed into one group");
  const isopod = groups.find((group) => group.label === "Isopod");
  assert(
    isopod?.animations.length === 3 && isopod.totalTrackCount === 6,
    "The instance group did not keep every clip and its track total",
  );
  assert(
    groups[0].label === "Isopod" && groups[1].label === "Boat_Wake",
    "Group order did not follow the source clip order",
  );
  assert(
    groupModelAnimations([]).length === 0,
    "An empty clip list produced a group",
  );
}

function clip(
  name: string,
  duration: number,
  trackCount: number,
): ModelAnimationMetadata {
  return { name, duration, trackCount };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
