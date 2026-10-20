import type { PiMode as ChatgptGenerationMode } from "./pi-authoring";

export function parseChatgptComposerRequest(value: string): { prompt: string; mode: ChatgptGenerationMode } {
  const prompt = value.trim();
  const command = /^\/goal(?:\s+|$)/iu.exec(prompt);
  return command ? { prompt: prompt.slice(command[0].length).trim(), mode: "goal" } : { prompt, mode: "build" };
}
