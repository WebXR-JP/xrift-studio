import type { ExternalStoreAsset } from "../tauri";
import type { ChatgptQuestion, ChatgptChoicePreview } from "./chatgpt-questions";
import type { ChatgptResourceContext } from "./chatgpt-resources";
import { resolveChatgptCandidate } from "./chatgpt-resources";
import { SKY_SHADER_CATALOG } from "./sky-shader-catalog";

export function chatgptCandidatePreview(id: string | undefined, resources: ChatgptResourceContext, external: readonly ExternalStoreAsset[] = []): ChatgptChoicePreview | undefined {
  if (!id) return undefined;
  const candidate = resolveChatgptCandidate(id, resources, external);
  if (!candidate) return undefined;
  if (candidate.source === "builtin") {
    if (candidate.asset.providerId === "xrift-sky-shaders") {
      const catalogId = id.slice("builtin:xrift-sky-shaders:".length);
      if (SKY_SHADER_CATALOG.some(entry => entry.id === catalogId)) return { kind: "sky", name: candidate.asset.name, catalogId };
    } else return { kind: "builtin", name: candidate.asset.name, candidateId: id };
  } else if (candidate.source === "project") return { kind: "project", name: candidate.asset.name, assetId: candidate.asset.id };
  else if (candidate.source === "external") {
    try { const url = new URL(candidate.asset.thumbnailUrl); if (url.protocol === "https:" && !url.username && !url.password) return { kind: "remote", name: candidate.asset.name, thumbnailUrl: url.href }; } catch { /* Missing preview stays an explicit fallback. */ }
  }
  return undefined;
}

export function chatgptChoicePreviews(questions: readonly ChatgptQuestion[], resources: ChatgptResourceContext, external: readonly ExternalStoreAsset[] = []): Record<string, ChatgptChoicePreview> {
  const result: Record<string, ChatgptChoicePreview> = {};
  for (const id of new Set(questions.flatMap(question => question.choiceCandidateIds ?? []).filter((id): id is string => id !== null))) {
    const preview = chatgptCandidatePreview(id, resources, external);
    if (preview) result[id] = preview;
  }
  return result;
}
