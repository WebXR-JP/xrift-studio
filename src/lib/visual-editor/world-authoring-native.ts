import { authoringFingerprint, beginAuthoringWrite, finishAuthoringWrite, readAuthoringState, type WorldAuthoringState } from "./world-authoring";
import { authoringSceneProgressFingerprint } from "./authoring-scene-progress";
import type { PrototypeVisualProject } from "./prototype-project";

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function progressFingerprint(bundle: unknown, exact: string): string {
  return object(bundle) && object(bundle.project) && object(bundle.scene) && object(bundle.scene.entities)
    && object(bundle.assets) && object(bundle.assets.assets) && object(bundle.prefabs)
    ? authoringSceneProgressFingerprint(bundle as PrototypeVisualProject) : exact;
}

export type AuthoringJournalPort = {
  read: (projectPath: string, sceneId: string) => Promise<unknown>;
  write: (projectPath: string, sceneId: string, expectedSequence: number, state: WorldAuthoringState) => Promise<unknown>;
};

/** Project-surface tools use the same single-writer admission as Editor tools.
 * Acquiring a slot happens before files are produced, never after an effect. */
export async function acquireAuthoringProjectWrite(options: {
  projectPath: string; sceneId: string; requestId: string; tool: string; arguments?: Record<string, unknown>; bundle: unknown; journal: AuthoringJournalPort; checkCurrent: () => void;
}) {
  const state = readAuthoringState(await options.journal.read(options.projectPath, options.sceneId));
  options.checkCurrent();
  if (!state?.run || state.run.terminalReason === "completed") return null;
  const fingerprint = await authoringFingerprint(options.bundle);
  options.checkCurrent();
  const next = beginAuthoringWrite(state, options.tool, options.requestId, fingerprint, options.arguments, progressFingerprint(options.bundle, fingerprint));
  await options.journal.write(options.projectPath, options.sceneId, state.sequence, next);
  const runId = next.run!.id;
  let settled = false;
  return {
    async finish(bundle: unknown, ok: boolean, reason?: string) {
      if (settled) return;
      const current = readAuthoringState(await options.journal.read(options.projectPath, options.sceneId));
      if (!current?.run || current.run.id !== runId) { settled = true; return; }
      const fingerprint = await authoringFingerprint(bundle);
      const result = finishAuthoringWrite(current, options.tool, options.requestId, fingerprint, ok, reason, progressFingerprint(bundle, fingerprint));
      if (result !== current) await options.journal.write(options.projectPath, options.sceneId, current.sequence, result);
      settled = true;
    },
  };
}
