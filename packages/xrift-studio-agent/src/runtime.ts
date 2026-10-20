import { createAgentSession, createExtensionRuntime, defineTool, ModelRuntime, SessionManager, SettingsManager, type ResourceLoader, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { Type } from "typebox";

export type StudioTool = { name: string; description: string; inputSchema: Record<string, unknown> };
export type AgentInput = {
  model: string; accessToken: string; thinkingLevel: "low" | "medium" | "high" | "xhigh" | "max";
  prompt: string; projectId: string; sceneId: string; sessionDir: string; cwd: string;
  mode: "build" | "plan"; tools: StudioTool[]; instructions: string;
};
export type StudioResult = { ok: boolean; result?: Record<string, unknown>; error?: unknown };
export type Bridge = (tool: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<StudioResult>;
const asText = (value: unknown) => ({ type: "text" as const, text: JSON.stringify(value) });
export function toolContent(response: StudioResult) {
  const { image, ...rest } = response.result ?? {};
  const content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[] = [asText(response.ok ? rest : response)];
  if (response.ok && image && typeof image === "object" && "data" in image && "mimeType" in image
    && typeof image.data === "string" && typeof image.mimeType === "string") {
    content.push({ type: "image", data: image.data, mimeType: image.mimeType });
  }
  return content;
}

/** Tracks evidence for the actual revision, never the number of tool attempts. */
export class ReviewGate {
  revision: number | undefined;
  reviewedRevision: number | undefined;
  views = new Set<string>();
  healthy = false;
  saved = false;
  complete = false;
  observe(tool: string, args: Record<string, unknown>, response: StudioResult) {
    if (!response.ok) return;
    const result = response.result ?? {};
    const revision = typeof result.revisionAfter === "number" ? result.revisionAfter : result.revision;
    if (typeof revision === "number" && revision !== this.revision) {
      this.revision = revision; this.views.clear(); this.healthy = false; this.saved = false; this.complete = false;
    }
    if (tool === "save_project" && result.saved === true) this.saved = true;
    if (tool === "get_project_health") {
      this.healthy = !!result.health && typeof result.health === "object" && "status" in result.health && result.health.status !== "error";
    }
    if (tool === "capture_scene_view" && result.image && ["spawn", "iso"].includes(String(args.authoringView))) {
      this.views.add(String(args.authoringView));
      this.reviewedRevision = this.revision;
    }
  }
  assertReady() {
    if (!this.saved || !this.healthy || this.reviewedRevision !== this.revision || !this.views.has("spawn") || !this.views.has("iso")) {
      throw new Error("最新のSceneを保存し、get_project_healthの問題を直し、spawnとisoの実画像を確認してから完了してください。");
    }
  }
}

export function createStudioTools(input: AgentInput, bridge: Bridge, gate: ReviewGate, onComplete: (summary: string) => void): ToolDefinition[] {
  const catalog = new Map(input.tools.map(tool => [tool.name, tool]));
  let calls = 0;
  const execute = async (tool: string, args: Record<string, unknown>, signal?: AbortSignal) => {
    if (++calls > 256) throw new Error("操作回数の上限に達しました。保存済みの変更から再開してください。");
    if (!catalog.has(tool)) throw new Error("利用できないStudio toolです。studio_search_toolsで確認してください。");
    for (const [key, expected] of [["projectId", input.projectId], ["sceneId", input.sceneId]]) {
      if (args[key] !== undefined && args[key] !== expected) throw new Error("制作対象と異なるSceneには操作できません。");
    }
    const response = await bridge(tool, args, signal);
    gate.observe(tool, args, response);
    return { content: toolContent(response), details: undefined, isError: !response.ok };
  };
  return [
    defineTool({
      name: "studio_search_tools", label: "Studioの操作を探す",
      description: "Find official Studio tools and their exact argument schemas. Empty query lists names; search by English tool name or words in the description. Read the schema before execution.",
      parameters: Type.Object({ query: Type.String() }),
      async execute(_id, args) {
        const terms = args.query.toLowerCase().split(/\s+/).filter(Boolean);
        const tools = input.tools.filter(tool => terms.every(term => (tool.name + " " + tool.description).toLowerCase().includes(term)));
        return { content: [asText(terms.length ? tools.slice(0, 12) : input.tools.map(tool => ({ name: tool.name, description: tool.description.slice(0, 150) })))], details: undefined };
      },
    }),
    defineTool({
      name: "studio_execute", label: "Studioを操作",
      executionMode: "sequential",
      description: "Execute one official Studio tool using its schema from studio_search_tools. Get current scope/revision before writes. Errors are observations: fix the cause or reread current state; never count attempts as progress. Capture results contain actual images.",
      parameters: Type.Object({ tool: Type.String(), arguments: Type.Record(Type.String(), Type.Unknown()) }),
      execute: (_id, args, signal) => execute(args.tool, args.arguments, signal),
    }),
    defineTool({
      name: "studio_complete", label: "完成条件を確認",
      executionMode: "sequential",
      description: "Finish only after reviewing the latest saved Scene, healthy documents, and actual spawn/iso images. Each requested criterion needs concrete evidence. If anything remains, keep working or report failure; do not mark it passed.",
      parameters: Type.Object({ summary: Type.String({ minLength: 1, maxLength: 2000 }), criteria: Type.Array(Type.Object({
        criterion: Type.String({ minLength: 1 }), evidence: Type.String({ minLength: 1 }), passed: Type.Boolean(),
      }), { minItems: 1, maxItems: 16 }) }),
      async execute(_id, args, signal) {
        if (input.mode === "plan") throw new Error("計画モードでは制作完了にできません。計画を文章で返してください。");
        // Invalidate evidence if the user edited while the model was reviewing.
        await execute("get_editor_context", {}, signal);
        gate.assertReady();
        if (args.criteria.some(item => !item.passed)) throw new Error("未達成の完成条件があります。続きを制作してください。");
        gate.complete = true;
        onComplete(args.summary);
        return { content: [asText({ completed: true, summary: args.summary, criteria: args.criteria })], details: undefined, terminate: true };
      },
    }),
  ];
}

export async function runAgent(input: AgentInput, bridge: Bridge, emit: (event: Record<string, unknown>) => void, signal: AbortSignal,
  configureRuntime?: (runtime: ModelRuntime) => void) {
  const credentials = new InMemoryCredentialStore();
  // Only the short-lived token crosses stdin. Renewable credentials remain in Studio's OS vault.
  await credentials.modify("openai", async () => ({ type: "api_key", key: input.accessToken }));
  input.accessToken = "";
  const modelRuntime = await ModelRuntime.create({ credentials, modelsPath: null, refreshOnCreate: false });
  configureRuntime?.(modelRuntime);
  const model = modelRuntime.getModel("openai", input.model);
  if (!model) throw new Error("選択したモデルは同梱Pi SDKで利用できません。");
  const gate = new ReviewGate();
  let summary = "";
  const customTools = createStudioTools(input, bridge, gate, value => { summary = value; });
  const resourceLoader: ResourceLoader = {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }), getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }), getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => input.instructions + "\nYou are XRift Studio's internal production agent. Use only official Studio tools. No shell, filesystem edits, outside project instructions, or publication. First read get_editor_context and list_entities; load only the relevant guide and tool schemas. Make coherent design choices and implement the user's actual request. After writes, save_project, check get_project_health, and inspect actual capture_scene_view images with authoringView spawn and iso. Judge every original requirement and correct the composition before studio_complete. A successful tool call, saved operation count, or empty plan is not evidence that the task is done. If blocked, explain what remains. In plan mode, only inspect and return a concrete plan without writes.",
    getSystemPromptSource: () => undefined, getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [],
    extendResources: () => {}, reload: async () => {},
  };
  const { session } = await createAgentSession({
    cwd: input.cwd, agentDir: input.sessionDir, modelRuntime, model, thinkingLevel: input.thinkingLevel,
    tools: customTools.map(tool => tool.name), customTools, resourceLoader,
    sessionManager: SessionManager.continueRecent(input.cwd, input.sessionDir),
    settingsManager: SettingsManager.inMemory({ retry: { enabled: true, maxRetries: 2 }, compaction: { enabled: true } }),
  });
  const abort = () => { void session.abort(); };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  let turns = 0;
  session.subscribe(event => {
    if (event.type === "turn_start" && ++turns > 64) abort();
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      emit({ type: "text", text: event.assistantMessageEvent.delta });
    }
  });
  try {
    await session.prompt(input.prompt);
    if (signal.aborted) throw new Error("制作を停止しました。保存済みの変更は保持されています。");
    if (input.mode === "plan") return { summary: session.getLastAssistantText() ?? "", completed: false };
    // A plain assistant answer must not become a false success.
    if (!gate.complete) throw new Error("完成条件の検証が終わっていません。保存済みのSceneから続きを依頼してください。");
    return { summary, completed: true };
  } finally {
    signal.removeEventListener("abort", abort);
    session.dispose();
    await credentials.delete("openai");
  }
}
