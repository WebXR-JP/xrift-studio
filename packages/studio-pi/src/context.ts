import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import type { PiContext } from "./protocol.js";

/** Pi owns compaction. Its context hook keeps the current user request next to
 * the restored summary, without another model, planner or persisted summary. */
export function studioContextExtension(request: string | (() => string), context: PiContext): ExtensionFactory {
  const { legacyConversation: _legacyConversation, ...conditions } = context;
  const current = () => `\n\n現在の利用者の依頼（過去の要約より現在の依頼・回答を優先）：\n${typeof request === "function" ? request() : request}\n\n現在の作業条件・承認・回答：\n${JSON.stringify(conditions)}\n現在のSceneと正式ツールの実行結果を正本とし、要約だけで変更・保存・完成を断定しないでください。`;
  return pi => {
    pi.on("context", event => {
      let lastSummary = -1;
      for (let index = 0; index < event.messages.length; index++) if (event.messages[index].role === "compactionSummary") lastSummary = index;
      if (lastSummary < 0) return;
      return { messages: event.messages.map((message, index) => index === lastSummary && message.role === "compactionSummary"
        ? { ...message, summary: message.summary + current() } : message) };
    });
  };
}
