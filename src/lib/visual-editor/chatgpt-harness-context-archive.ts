import { normalizeChatgptHarnessContext, serializeChatgptHarnessContext, type ChatgptHarnessContext } from "./chatgpt-harness-context";
import { CHATGPT_HARNESS_CONTEXT_ARCHIVE_LIMIT, chatgptHarnessContextPath, normalizeChatgptHarnessContextRef, type ChatgptHarnessContextRef } from "./chatgpt-harness-context-ref";

export type { ChatgptHarnessContextRef } from "./chatgpt-harness-context-ref";
export type ChatgptHarnessContextStore = {
  /** null means absent; access and decoding errors must reject. */
  read: (relativePath: string) => Promise<string | null>;
  write: (relativePath: string, content: string) => Promise<void>;
};
export type PreparedChatgptHarnessContext = {
  readonly packet: ChatgptHarnessContext;
  readonly ref: ChatgptHarnessContextRef;
  /** Every admitted inference consumes this seal, including failed admission. */
  dispatch<T>(work: (verifiedPacket: ChatgptHarnessContext) => Promise<T>, checkCurrent?: () => void | Promise<void>): Promise<T>;
};
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
const archiveError = () => new Error("保存した制作入力が見つからないか、内容が変わっています。現在のSceneから依頼を送り直してください。");
function decode(content: string, ref: ChatgptHarnessContextRef): ChatgptHarnessContext {
  if (bytes(content) !== ref.byteLength || bytes(content) > CHATGPT_HARNESS_CONTEXT_ARCHIVE_LIMIT) throw archiveError();
  let value: unknown;
  try { value = JSON.parse(content); } catch { throw archiveError(); }
  const packet = normalizeChatgptHarnessContext(value);
  // The locator binds canonical bytes as well as the inner packet digest. No
  // alternate JSON spellings, trailing data or silent source normalization.
  if (serializeChatgptHarnessContext(packet) !== content || packet.fingerprint !== ref.fingerprint
    || packet.sceneFingerprint !== ref.sceneFingerprint || packet.contextBytes !== ref.contextBytes) throw archiveError();
  return packet;
}

/** Every recovery read verifies bytes and content identity before returning data.
 * Recovery never restores execution authority or replays a previous inference. */
export async function restoreChatgptHarnessContext(reference: unknown, store: Pick<ChatgptHarnessContextStore, "read">): Promise<ChatgptHarnessContext> {
  const ref = normalizeChatgptHarnessContextRef(reference);
  const content = await store.read(ref.relativePath);
  if (content === null) throw archiveError();
  return decode(content, ref);
}

/** Persist first, verify by reading it back, then publish the small reference.
 * Existing damaged artifacts fail closed and are never overwritten. Contents
 * stay in the project's excluded .cache directory, outside public exports. */
export async function prepareChatgptHarnessContext(packet: ChatgptHarnessContext, store: ChatgptHarnessContextStore): Promise<PreparedChatgptHarnessContext> {
  const content = serializeChatgptHarnessContext(packet);
  const sealed = normalizeChatgptHarnessContext(JSON.parse(content));
  const ref = normalizeChatgptHarnessContextRef({ version: 1, kind: "authoring-context", fingerprint: sealed.fingerprint,
    sceneFingerprint: sealed.sceneFingerprint, relativePath: chatgptHarnessContextPath(sealed.fingerprint), byteLength: bytes(content), contextBytes: sealed.contextBytes });
  const previous = await store.read(ref.relativePath);
  if (previous === null) await store.write(ref.relativePath, content);
  else decode(previous, ref);
  const verified = await restoreChatgptHarnessContext(ref, store);
  let consumed = false;
  return Object.freeze({ packet: verified, ref,
    async dispatch<T>(work: (verifiedPacket: ChatgptHarnessContext) => Promise<T>, checkCurrent?: () => void | Promise<void>): Promise<T> {
      if (consumed) throw new Error("この制作入力はすでに使われています。最新のSceneから入力を作り直してください。");
      consumed = true;
      const current = await restoreChatgptHarnessContext(ref, store);
      const checked = checkCurrent?.();
      if (checked) await checked;
      return work(current);
    },
  });
}
