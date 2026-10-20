import type { ChatgptAssetOptions } from "../tauri";
import type { PiMode, PiHistory, PiPlan, PiUsage } from "../../../packages/studio-pi/src/protocol";
export type { PiMode, PiHistory, PiPlan, PiQuestion, PiAnswer, PiContinuation, PiContext, PiUsage, PiEvent as PiAuthoringEvent, PiResult as PiAuthoringResult } from "../../../packages/studio-pi/src/protocol";
export type PiAuthoringRequest = {
  generationId: string; projectId: string; sceneId: string; model: string; prompt: string;
  mode: PiMode; reasoningEffort?: string; context: string;
  sessionId?: string; historySessionId?: string; historyLeafId?: string;
};
export type PiRunControl = { stop: (reason?: string) => Promise<void> };
export type PiStoredPlan = { plan: PiPlan; snapshot: string; target: "current" | "new" };

export type PiRunPhase = "planning" | "planned" | "preparing" | "importing" | "placing" | "saving" | "completed" | "failed" | "cancelled" | "thinking" | "compacting" | "retrying";
export const PI_ALL_ASSETS: ChatgptAssetOptions = { models: true, materials: true, audio: true };
export type PiRunEvent = {
  sequence: number;
  phase: PiRunPhase;
  message: string;
  entityId?: string;
  name?: string;
  saved?: boolean;
};

export type PiAuthoringRun = {
  generationId: string;
  completionVerified?: boolean;
  liveMessages?: (import("../../../packages/studio-pi/src/protocol").PiLiveMessage & { state: "queued" | "applied" | "unapplied" })[];
  assistantText?: string;
  usage?: PiUsage;
  piHistory?: PiHistory;
  harness?: import("./chatgpt-legacy-history").ChatgptHarnessSnapshot;
  contextRefs?: import("./chatgpt-harness-context-ref").ChatgptHarnessContextRef[];
  status: "running" | "planned" | "completed" | "failed" | "cancelled";
  mode?: PiMode;
  goal?: { iteration: number; noProgressPasses: number };
  production?: import("./chatgpt-production").ChatgptProduction;
  productionPass?: number;
  productionNoProgressPasses?: number;
  /** Read-only metadata retained for requests saved before Pi. */
  productionVisualReview?: boolean;
  cancelling?: boolean;
  model: string;
  reasoningEffort?: string;
  sessionId?: string;
  createdAt?: string;
  revertedAt?: string;
  revertAvailable?: boolean;
  prompt: string;
  attachedEntities?: { id: string; name: string }[];
  attachedMaterials?: { id: string; name: string }[];
  questionPreviews?: Record<string, import("./chatgpt-questions").ChatgptChoicePreview>;
  clarifications?: { question: string; answer: string; candidateId?: string }[];
  options: ChatgptAssetOptions;
  sourceProjectId: string;
  sourceSceneId?: string;
  projectId?: string;
  /** Scene that receives the edits; may differ from the source for a new world. */
  sceneId?: string;
  path?: string;
  name?: string;
  plan?: PiPlan & { hasMore?: boolean; remainingWork?: string; objects?: { name: string; shape: string; preview?: import("./chatgpt-questions").ChatgptChoicePreview; detail?: string; saved?: boolean; entityId?: string; materialAssetId?: string; sceneSettingsSections?: ("skybox" | "fog")[]; settings?: import("./chatgpt-change-description").ChatgptSettingDisplay[] }[] };
  progress: { phase: PiRunPhase; message: string; completed: number; total: number; recentEvents: PiRunEvent[]; projectId?: string };
  error?: string;
  nextActions?: string[];
};
