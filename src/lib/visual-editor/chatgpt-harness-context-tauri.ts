import { tauri } from "../tauri";
import type { ChatgptHarnessContextStore } from "./chatgpt-harness-context-archive";

/** Keep the storage authority on the native, project-scoped cache boundary. */
export function createChatgptHarnessContextStore(projectPath: string): ChatgptHarnessContextStore {
  const digest = (relativePath: string) => {
    const match = /^\.cache\/xrift-studio-harness\/contexts\/([a-f0-9]{64})\.json$/.exec(relativePath);
    if (!match) throw new Error("制作入力の保存先が不正です");
    return match[1]!;
  };
  return {
    read: relativePath => tauri.readChatgptHarnessContext(projectPath, digest(relativePath)),
    write: (relativePath, content) => tauri.writeChatgptHarnessContext(projectPath, digest(relativePath), content),
  };
}
