import contract from "./chatgpt-authoring-contract.json";

/** Check before sending any Scene metadata or starting inference. Do not silently
 * drop official Components/settings to make a stale executable accept a request. */
export async function assertChatgptNativeContract(invoke: (command: string) => Promise<unknown>) {
  let supported: unknown;
  try { supported = await invoke("chatgpt_authoring_contract"); }
  catch { throw new Error("画面とアプリ本体の更新が揃っていません。作品を保存してXRift Studioを再起動し、送信待ちの「再試行」を押してください。"); }
  if (!supported || typeof supported !== "object" || !("version" in supported) || supported.version !== contract.version) {
    throw new Error("この画面に対応するXRift Studio本体が必要です。アプリを更新・再起動してから「再試行」を押してください。");
  }
}
