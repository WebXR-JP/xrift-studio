/** One summary for steps that recompute to the current Scene, instead of a
 * saved confirmation per step. Labels keep the first few items recognizable. */
export function describeSkippedAuthoringChanges(labels: readonly string[]): string | undefined {
  if (!labels.length) return undefined;
  const shown = labels.slice(0, 3).join("、");
  const rest = labels.length > 3 ? `、ほか${labels.length - 3}件` : "";
  return `変更がなかった${labels.length}件は保存せず省略しました（${shown}${rest}）`;
}
