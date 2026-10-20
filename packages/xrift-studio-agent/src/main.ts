import { createInterface } from "node:readline";
import { runAgent, type AgentInput, type StudioResult } from "./runtime.js";

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
const controller = new AbortController();
const pending = new Map<string, { resolve: (value: StudioResult) => void; reject: (reason: Error) => void }>();
const send = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");
let running = false;
let serial = 0;
lines.on("line", line => {
  let message: Record<string, unknown>;
  try { message = JSON.parse(line); } catch { controller.abort(); return; }
  if (message.type === "result" && typeof message.id === "string") {
    pending.get(message.id)?.resolve(message.response as StudioResult); pending.delete(message.id); return;
  }
  if (message.type === "cancel") { controller.abort(); return; }
  if (message.type !== "start" || running) return;
  running = true;
  const input = message.input as AgentInput;
  const token = input.accessToken;
  void runAgent(input, (tool, args, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted || controller.signal.aborted) { reject(new Error("停止しました")); return; }
    const id = String(++serial);
    pending.set(id, { resolve, reject });
    send({ type: "tool", id, tool, arguments: args });
  }), send, controller.signal).then(
    result => send({ type: "done", ...result }),
    error => send({ type: "failed", message: String(error instanceof Error ? error.message : error).replaceAll(token, "[削除]") }),
  ).finally(() => { lines.close(); process.stdin.destroy(); });
});
lines.on("close", () => {
  controller.abort();
  for (const item of pending.values()) item.reject(new Error("Studioとの接続を終了しました"));
  pending.clear();
});
