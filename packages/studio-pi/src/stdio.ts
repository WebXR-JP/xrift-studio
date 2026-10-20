import { createInterface } from "node:readline";
import { runStudioAgent, type PiInput } from "./agent.js";
import type { PiLiveMessage } from "./protocol.js";
// Extension console output must never corrupt the JSONL transport.
for (const method of ["log", "info", "debug", "warn"] as const) console[method] = (...values: unknown[]) => { process.stderr.write(values.map(value => String(value)).join(" ") + "\n"); };
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
let sequence = 0;
const pending = new Map<number, { resolve: (result: Record<string, unknown>) => void; reject: (error: Error) => void }>();
const send = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");
let started = false;
let acceptInput: ((message: PiLiveMessage) => Promise<void>) | undefined;
lines.on("line", line => {
  try {
    const message = JSON.parse(line);
    if (message.type === "start" && !started) {
      started = true;
      void runStudioAgent(message.input as PiInput, (tool, args) => new Promise((resolve, reject) => {
        const id = ++sequence; pending.set(id, { resolve, reject }); send({ type: "tool", id, tool, arguments: args });
      }), send, undefined, undefined, { attach: handler => { acceptInput = handler; return () => { acceptInput = undefined; }; } }).then(result => send({ type: "result", result })).catch(error => send({ type: "error", message: String(error instanceof Error ? error.message : error).replaceAll(message.input.token, "[redacted]").slice(0, 2000) })).finally(() => { lines.close(); process.stdin.destroy(); });
    } else if (message.type === "input") {
      const handler = acceptInput;
      void (handler ? handler(message.message) : Promise.reject(new Error("制作の準備中か応答が終了しています。入力を残したまま、もう一度送信してください")))
        .then(() => send({ type: "input_ack", id: message.id, ok: true }))
        .catch(error => send({ type: "input_ack", id: message.id, ok: false, message: error instanceof Error ? error.message : "追加指示を送信できませんでした" }));
    } else if (message.type === "tool_result") {
      const task = pending.get(message.id); pending.delete(message.id);
      if (message.ok) task?.resolve(message.result ?? {});
      else task?.reject(new Error(`${message.error?.code ?? "EDITOR_ERROR"}: ${message.error?.message ?? "Studio tool failed"}`));
    }
  } catch { send({ type: "error", message: "制作の通信内容を読み取れませんでした" }); lines.close(); process.stdin.destroy(); }
});
