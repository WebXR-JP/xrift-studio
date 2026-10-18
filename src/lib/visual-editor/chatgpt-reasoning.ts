import type { ChatgptConnection, ChatgptModel } from "../tauri";

/** An explicit selection, including the empty API-default choice, wins. */
export function preferredChatgptReasoningEffort(model?: ChatgptModel): string {
  const supported = model?.supportedReasoningEfforts ?? [];
  if (supported.includes("low")) return "low";
  return model?.defaultReasoningEffort && supported.includes(model.defaultReasoningEffort) ? model.defaultReasoningEffort : "";
}

/** Advisory metadata only: native inference still validates account access and
 * current model capabilities. Never add a catalog round trip just for defaults. */
export function createChatgptReasoningPreferences(now: () => number = Date.now) {
  let models: ChatgptModel[] = [];
  let refreshedAt = -Infinity;
  let account: string | null = null;
  const clear = () => { models = []; refreshedAt = -Infinity; };
  return {
    clear,
    observeConnection(connection: ChatgptConnection) {
      const next = connection.signedIn && connection.planUsageEnabled && !connection.connecting && !connection.restoring
        ? connection.accountId ?? connection.email ?? "active" : null;
      if (!next || account !== next) clear();
      account = next;
    },
    remember(catalog: ChatgptModel[]) { models = structuredClone(catalog); refreshedAt = now(); },
    forModel(slug: string): string | undefined {
      if (now() - refreshedAt >= 60_000) return undefined;
      return preferredChatgptReasoningEffort(models.find(model => model.slug === slug)) || undefined;
    },
  };
}
