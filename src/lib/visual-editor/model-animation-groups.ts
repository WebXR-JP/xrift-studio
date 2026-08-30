import type { ModelAnimationMetadata } from "./asset-manifest";

/**
 * DCCツールから書き出したModelは、同じ動きのclipが個体数ぶん並ぶことがある。
 * Inspectorで数百行を素で並べると構造が読めなくなるので、名前の連番と
 * `Action.011` のようなツール由来のサフィックスを落として1グループへ寄せる。
 */

export type ModelAnimationGroup = {
  label: string;
  animations: ModelAnimationMetadata[];
  totalTrackCount: number;
};

export function groupModelAnimations(
  animations: readonly ModelAnimationMetadata[],
): ModelAnimationGroup[] {
  const grouped = new Map<string, ModelAnimationGroup>();
  for (const animation of animations) {
    const label = modelAnimationGroupLabel(animation.name);
    const group = grouped.get(label);
    if (group) {
      group.animations.push(animation);
      group.totalTrackCount += animation.trackCount;
    } else {
      grouped.set(label, {
        label,
        animations: [animation],
        totalTrackCount: animation.trackCount,
      });
    }
  }
  return [...grouped.values()];
}

export function modelAnimationGroupLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Animation";
  // Blenderの `...Action` / `...Action.011` を落とす。
  const withoutAction = trimmed.replace(/Action(?:\.\d+)?$/i, "");
  // 続けて `_00` / `-3` / `.12` のような個体番号を落とす。
  const withoutIndex = withoutAction.replace(/[._-]\d+$/, "");
  const label = withoutIndex.replace(/[._\s-]+$/, "");
  return label || trimmed;
}
