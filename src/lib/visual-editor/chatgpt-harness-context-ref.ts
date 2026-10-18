/** A small locator for a limited Scene/resources packet, never a provider request. */
export type ChatgptHarnessContextRef = {
  version: 1;
  kind: "authoring-context";
  fingerprint: string;
  sceneFingerprint: string;
  relativePath: string;
  byteLength: number;
  contextBytes: number;
};

export const CHATGPT_HARNESS_CONTEXT_REF_LIMIT = 8;
export const CHATGPT_HARNESS_CONTEXT_ARCHIVE_LIMIT = 1024 * 1024 + 512;
const prefix = ".cache/xrift-studio-harness/contexts/";
export const chatgptHarnessContextPath = (fingerprint: string) => `${prefix}${fingerprint}.json`;

/** Reject malformed and future references without rewriting or dropping them. */
export function normalizeChatgptHarnessContextRef(value: unknown): ChatgptHarnessContextRef {
  const invalid = () => new Error("制作入力の参照記録を読み込めません。保存した会話履歴を確認してください。");
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const entry = value as Record<string, unknown>;
  if (Object.keys(entry).some(key => !["version", "kind", "fingerprint", "sceneFingerprint", "relativePath", "byteLength", "contextBytes"].includes(key))
    || entry.version !== 1 || entry.kind !== "authoring-context"
    || typeof entry.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(entry.fingerprint)
    || typeof entry.sceneFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(entry.sceneFingerprint)
    || entry.relativePath !== chatgptHarnessContextPath(entry.fingerprint)
    || typeof entry.contextBytes !== "number" || !Number.isSafeInteger(entry.contextBytes) || entry.contextBytes < 1 || entry.contextBytes > 1024 * 1024
    || typeof entry.byteLength !== "number" || !Number.isSafeInteger(entry.byteLength) || entry.byteLength > CHATGPT_HARNESS_CONTEXT_ARCHIVE_LIMIT
    || entry.byteLength !== entry.contextBytes + JSON.stringify({ contextBytes: entry.contextBytes, fingerprint: entry.fingerprint }).length - 1) throw invalid();
  return Object.freeze({ version: 1, kind: "authoring-context", fingerprint: entry.fingerprint, sceneFingerprint: entry.sceneFingerprint,
    relativePath: entry.relativePath, byteLength: entry.byteLength, contextBytes: entry.contextBytes });
}
