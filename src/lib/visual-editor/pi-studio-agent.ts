import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import { Type } from "typebox";

export const STUDIO_PI_TOOLS = ["studio_context", "studio_author", "studio_inspect", "studio_finish"] as const;
export type StudioPiTool = typeof STUDIO_PI_TOOLS[number];
export type StudioPiToolResult = { observation: unknown; terminal?: boolean };
export type StudioPiAgentOptions = {
  model: string; prompt: string;
  decide: (transcript: string, signal?: AbortSignal) => Promise<string>;
  execute: (tool: StudioPiTool, signal?: AbortSignal) => Promise<StudioPiToolResult>;
  check: () => void;
  onEvent?: (event: AgentEvent) => void;
  maxTurns?: number;
};
const descriptions: Record<StudioPiTool, string> = {
  studio_context: "Read the current Studio Scene and available resources. Read again after a conflict.",
  studio_author: "Plan, validate, edit and save one bounded pass for the original request through Studio's Editor. Repair failures using the latest context.",
  studio_inspect: "Capture actual current Scene views and review them against the original request. Every edit invalidates old evidence.",
  studio_finish: "Complete only with real saved changes and approved visual evidence for the current revision. No-op operation counts are not evidence.",
};

/** Pi owns the iterative tool loop. The native structured-output adapter selects
 * one fixed Studio tool per turn; no provider keys, file tools or shell are loaded. */
export async function runStudioPiAgent(options: StudioPiAgentOptions): Promise<void> {
  // This descriptor routes only to our streamFn. It never configures a provider.
  const model: Model<"openai-responses"> = { id: options.model, name: options.model, api: "openai-responses", provider: "openai",
    baseUrl: "", reasoning: false, input: ["text"], contextWindow: 131072, maxTokens: 512,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  let turns = 0, terminal = false;
  let fatal: unknown;
  const tools = STUDIO_PI_TOOLS.map(name => ({ name, label: name, description: descriptions[name], parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_id: string, _params: unknown, signal?: AbortSignal) {
      options.check();
      let result: StudioPiToolResult;
      try { result = await options.execute(name, signal); }
      catch (error) { fatal = error; throw new Error("Studioの制作操作に失敗しました。保存済みの変更は残っています"); }
      options.check();
      terminal = result.terminal === true;
      return { content: [{ type: "text" as const, text: JSON.stringify(result.observation) }], details: {}, terminate: terminal };
    },
  }));
  const agent = new Agent({ initialState: { model, tools, systemPrompt: "Use only the Studio tools to fulfill the original request. Inspect the latest saved result before completing." },
    toolExecution: "sequential",
    streamFn: (_model, context, streamOptions) => {
      const stream = new AssistantMessageEventStream();
      const message: AssistantMessage = { role: "assistant", api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(),
        content: [], stopReason: "toolUse", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      void (async () => {
        try {
          if (fatal) throw fatal;
          options.check();
          if (++turns > (options.maxTurns ?? 32)) throw new Error("制作の反復回数の上限に達しました。保存済みのSceneから再開してください");
          // Serialize only the bounded in-memory transcript. Tool results contain
          // summaries, not source files, capture bytes, native errors or credentials.
          const transcript = JSON.stringify(context.messages);
          if (new TextEncoder().encode(transcript).length > 262144) throw new Error("制作の会話が上限に達しました");
          const action = await options.decide(transcript, streamOptions?.signal);
          options.check();
          if (!STUDIO_PI_TOOLS.includes(action as StudioPiTool)) throw new Error("許可されていない制作操作です");
          message.content = [{ type: "toolCall", id: `studio-${turns}`, name: action, arguments: {} }];
          stream.push({ type: "start", partial: message });
          stream.push({ type: "done", reason: "toolUse", message });
        } catch (error) {
          fatal = error;
          message.stopReason = streamOptions?.signal?.aborted ? "aborted" : "error";
          message.errorMessage = "Studioの制作処理を継続できませんでした";
          stream.push({ type: "error", reason: message.stopReason, error: message });
        }
      })();
      return stream;
    },
  });
  if (options.onEvent) agent.subscribe(options.onEvent);
  await agent.prompt(options.prompt);
  if (fatal) throw fatal;
  options.check();
  if (!terminal) throw new Error("制作が完了条件に達しませんでした。保存済みのSceneを確認してください");
}
