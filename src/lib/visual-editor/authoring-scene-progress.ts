import { chatgptPlanningSnapshot } from "./chatgpt-plan-guards";
import { sha256Utf8 } from "./compiler/hash";
import type { PrototypeVisualProject } from "./prototype-project";
import { isR3fSceneAuthoring } from "./r3f-scene-source";

/** Progress ignores validated R3F reconciliation bookkeeping only. Completion,
 * conflict checks and saved evidence retain their full authored fingerprint. */
export function authoringSceneProgressFingerprint(bundle: PrototypeVisualProject): string {
  const snapshot = JSON.parse(chatgptPlanningSnapshot(bundle)) as {
    scene: PrototypeVisualProject["scene"]; prefabs: PrototypeVisualProject["prefabs"];
  };
  for (const document of [snapshot.scene, ...Object.values(snapshot.prefabs)]) {
    for (const entity of Object.values(document.entities)) {
      if (isR3fSceneAuthoring(entity.codeAuthoring)) {
        // The source and the resulting Scene/Assets remain in the digest. A
        // revision, prompt or reconciliation baseline cannot disguise a stall.
        Object.assign(entity, { codeAuthoring: { version: entity.codeAuthoring.version, source: entity.codeAuthoring.source } });
      }
    }
  }
  return sha256Utf8(JSON.stringify(snapshot, (_key, item) =>
    typeof item === "number" && Number.isFinite(item) ? Number(item.toPrecision(12)) :
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item));
}
