import { tauri } from "../tauri";
import { parseBlenderModelSpec, type BlenderModelBrief, type BlenderModelSpec } from "./chatgpt-modeling";

/** Workers may finish out of order. The caller remains the single Scene writer. */
export async function* streamChatgptModels(model: string, briefs: BlenderModelBrief[], generationId: string, reasoningEffort?: string) {
  const ready: { index: number; model: BlenderModelSpec }[] = [];
  const delivered = new Set<number>();
  let wake: (() => void) | undefined;
  let done = false;
  let failure: unknown;
  const receive = (result: { index: number; model: BlenderModelSpec }) => {
    if (done) return;
    if (!Number.isInteger(result.index) || !briefs[result.index] || delivered.has(result.index)) {
      failure = new Error("モデルの制作結果を照合できませんでした");
    } else {
      try {
        const spec = parseBlenderModelSpec(result.model);
        if (spec.name !== briefs[result.index].name) throw new Error("モデルの名前が制作対象と一致しません");
        delivered.add(result.index);
        ready.push({ index: result.index, model: spec });
      } catch (error) { failure = error; }
    }
    wake?.();
  };
  const pending = tauri.chatgptModelSpecs(model, briefs, generationId, reasoningEffort, receive).then(results => {
    // The command result also contains completed models, so a channel delivery
    // delayed behind the invoke reply cannot lose the last result.
    for (const result of results) if (!delivered.has(result.index)) receive(result);
  }).catch(error => { failure = error; }).finally(() => { done = true; wake?.(); });
  try {
    while (!done || ready.length) {
      // A late worker failure must not discard models already delivered.
      if (ready.length) { yield ready.shift()!; continue; }
      if (failure) throw failure;
      await new Promise<void>(resolve => { wake = resolve; });
      wake = undefined;
    }
    if (failure) throw failure;
    if (delivered.size !== briefs.length) throw new Error("一部のモデルの制作結果を受け取れませんでした。保存済みの結果から再試行してください");
  } finally {
    if (!done) {
      await tauri.chatgptCancelGeneration(generationId).catch(() => undefined);
      await pending;
    }
  }
}
