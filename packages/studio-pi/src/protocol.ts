/** JSON-only contract shared by the Pi runner and Studio. No SDK or Node imports. */
export type PiMode = "build" | "plan" | "goal";
export type PiLiveMessage = { id: string; prompt: string; delivery: "steer" | "follow_up"; attachedEntityIds?: string[]; attachedMaterialIds?: string[] };
export type PiLiveRequest = PiLiveMessage & { generationId: string; projectId: string; sceneId: string; sessionId: string };
export type PiQuestion = { question: string; choices: string[]; choiceCandidateIds?: (string | null)[] };
export type PiPlan = { title: string; description: string; questions?: PiQuestion[] };
export type PiAnswer = { question: string; answer: string; candidateId?: string };
export type PiContinuation = { kind: "approved_plan"; plan: PiPlan } | { kind: "answers"; answers: PiAnswer[] };
export type PiContext = {
  options?: { models?: boolean; materials?: boolean; audio?: boolean; modelSource?: string };
  target?: "current" | "new";
  selectedEntityId?: string | null;
  attachedEntityIds?: string[];
  attachedMaterialIds?: string[];
  continuation?: PiContinuation;
  /** Imported once when moving an existing Studio conversation to Pi. */
  legacyConversation?: { prompt: string; result: string }[];
};
export type PiHistory = { sessionId: string; leafId: string | null; nodes: { id: string; parentId: string | null; label: string; canBranch: boolean }[] };
export type PiUsage = { modelTurns: number; toolCalls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; totalTokens: number };
export type PiModelPreview = { source: "blender"; operationId: string; name: string; sequence: number; completed: number; total: number; capturedAt: number; image: { mimeType: "image/png"; data: string } };
export type PiEvent =
  | { type: "preview"; preview: PiModelPreview }
  | { type: "input"; message: PiLiveMessage; state: "queued" | "applied" | "unapplied" }
  | { type: "progress"; message: string; tool?: string; operationId?: string; readOnly?: boolean; changed?: boolean; saved?: boolean; mutationBeforeFingerprint?: string }
  | { type: "activity"; phase: "thinking" | "compacting" | "retrying"; message: string }
  | { type: "assistant"; text: string }
  | { type: "usage"; usage: PiUsage }
  | { type: "history"; history: PiHistory };
export type PiResult = { text: string; completionVerified?: boolean; history?: PiHistory; usage?: PiUsage; plan?: PiPlan };
