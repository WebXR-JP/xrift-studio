import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { PiEvent, PiUsage } from "./protocol.js";

/** Observe Pi's actual lifecycle; Studio does not infer turns or run a repair loop. */
export function observeSession(session: AgentSession, officialNames: Set<string>, emit: (event: PiEvent) => void) {
  const usage: PiUsage = { modelTurns: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 };
  let sentAt = 0;
  const assistant = (text: string, final = false) => {
    const now = Date.now();
    if (!final && now - sentAt < 150) return;
    sentAt = now;
    emit({ type: "assistant", text: text.slice(-32_000) });
  };
  const unsubscribe = session.subscribe(event => {
    if (event.type === "turn_start") emit({ type: "activity", phase: "thinking", message: "次の作業を考えています" });
    if (event.type === "message_start" && event.message.role === "assistant") { sentAt = 0; assistant(""); }
    if (event.type === "message_update" && event.message.role === "assistant" && event.assistantMessageEvent.type === "text_delta") {
      assistant(event.message.content.filter(block => block.type === "text").map(block => block.text).join("\n"));
    }
    if (event.type === "message_end" && event.message.role === "assistant") {
      assistant(event.message.content.filter(block => block.type === "text").map(block => block.text).join("\n"), true);
      usage.modelTurns++;
      usage.inputTokens += event.message.usage.input;
      usage.outputTokens += event.message.usage.output;
      usage.cacheReadTokens += event.message.usage.cacheRead;
      usage.cacheWriteTokens += event.message.usage.cacheWrite;
      usage.totalTokens += event.message.usage.totalTokens;
      emit({ type: "usage", usage: { ...usage } });
    }
    if (event.type === "tool_execution_start") {
      usage.toolCalls++;
      if (!officialNames.has(event.toolName)) emit({ type: "progress", operationId: event.toolCallId, readOnly: true, tool: event.toolName, message: event.toolName === "tool_search" ? "使える操作を確認しています" : "作業を進めています" });
    }
    if (event.type === "compaction_start") emit({ type: "activity", phase: "compacting", message: "会話を整理して作業を続けています" });
    if (event.type === "auto_retry_start") emit({ type: "activity", phase: "retrying", message: `接続を再試行しています（${event.attempt}回目）` });
    if (event.type === "auto_retry_end" && !event.success) emit({ type: "activity", phase: "retrying", message: "接続をやり直しましたが、応答を受け取れませんでした" });
  });
  return { usage, dispose: () => { unsubscribe(); emit({ type: "usage", usage: { ...usage } }); } };
}
