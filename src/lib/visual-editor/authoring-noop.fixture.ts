import { describeSkippedAuthoringChanges } from "./authoring-noop";

export function runAuthoringNoopFixtureAssertions() {
  let assertions = 0;
  const assert = (condition: unknown, name: string) => { assertions++; if (!condition) throw new Error(`Authoring noop: ${name}`); };
  assert(describeSkippedAuthoringChanges([]) === undefined, "no skipped steps stay silent");
  assert(describeSkippedAuthoringChanges(["Ambient Lightの色"]) === "変更がなかった1件は保存せず省略しました（Ambient Lightの色）", "one skipped step is summarized once");
  const many = describeSkippedAuthoringChanges(["a", "b", "c", "d", "e"]);
  assert(many === "変更がなかった5件は保存せず省略しました（a、b、c、ほか2件）", "many skipped steps collapse into one summary");
  assert(!many!.includes("保存しました"), "summary never claims a save happened");
  return { assertions };
}
