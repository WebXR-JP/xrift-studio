import contract from "./chatgpt-authoring-contract.json";
import { sha256Utf8 } from "./compiler/hash";
import { chatgptPlanningSnapshot } from "./chatgpt-plan-guards";
import { collectChatgptSceneContext, collectChatgptSceneResources } from "./chatgpt-scene-resources";
import { isR3fSceneAuthoring } from "./r3f-scene-source";
import type { ChatgptSceneContext } from "../tauri";
import type { PrototypeVisualProject } from "./prototype-project";
import type { ChatgptBuiltinCandidate, ChatgptResourceContext } from "./chatgpt-resources";

export type ChatgptHarnessContextOptions = {
  selectedEntityId?: string;
  conversation?: ChatgptSceneContext["conversation"];
  attachedEntityIds?: readonly string[];
  attachedMaterialIds?: readonly string[];
  builtinCandidates?: ChatgptBuiltinCandidate[];
  blenderAvailable?: boolean;
  modelSource?: ChatgptResourceContext["modelSource"];
};

export type ChatgptHarnessContext = {
  version: 1;
  contractVersion: number;
  scene: ChatgptSceneContext;
  resources: ChatgptResourceContext;
  /** Covers all authored Scene/Assets/Prefab values, including omitted Entities. */
  sceneFingerprint: string;
  /** Binds the exact request packet to that authored snapshot. */
  fingerprint: string;
  contextBytes: number;
  omittedEntities: { total: number; included: number; count: number };
  omittedSources: { total: number; included: number; count: number; bytes: number; entityBudget: number; sourceBudget: number };
};

/** Facts retained in the run journal; contains no generated code or images. */
export type ChatgptHarnessContextSummary = {
  fingerprint: string;
  sceneFingerprint: string;
  contextBytes: number;
  contractVersion: number;
  entityCount: number;
  includedEntityCount: number;
  omittedEntityCount: number;
  sourceHashes: { entityId: string; sha256: string; bytes: number }[];
  omittedSourceCount: number;
  omittedSourceBytes: number;
  resourceCounts: { components: number; projectAssets: number; builtinCandidates: number };
};

const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).filter(key => object[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

const contextKeys = ["version", "contractVersion", "scene", "resources", "production", "sceneFingerprint", "fingerprint", "contextBytes", "omittedEntities", "omittedSources"];
const resourceKeys = ["blenderAvailable", "modelSource", "authoredModels", "authoredScenes", "currentSettingsJson", "componentDefinitions", "projectAssets", "builtinCandidates", "components", "sceneSettings"];
const plain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const only = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const string = (value: unknown): value is string => typeof value === "string";
const strings = (value: unknown, maximum: number): value is string[] => Array.isArray(value) && value.length <= maximum && value.every(string);
const optional = (value: Record<string, unknown>, key: string, accepts: (value: unknown) => boolean) => value[key] === undefined || accepts(value[key]);
function invalidContext(): never { throw new Error("制作入力の保存記録を確認できませんでした。現在のSceneから依頼を送り直してください。"); }
function validJson(value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (value === undefined) return true;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => validJson(item, depth + 1));
  return plain(value) && Object.entries(value).every(([key, item]) => key !== "__proto__" && validJson(item, depth + 1));
}
function validScene(value: unknown): boolean {
  if (!plain(value) || !only(value, ["title", "goal", "selectedEntityId", "attachedEntityIds", "starterEntityIds", "entities", "conversation"]) || !string(value.title)
    || !optional(value, "goal", item => typeof item === "boolean") || !optional(value, "selectedEntityId", string)
    || !optional(value, "attachedEntityIds", item => strings(item, 100)) || !Array.isArray(value.entities) || value.entities.length > 100) return false;
  const vector = (item: unknown) => Array.isArray(item) && item.length === 3 && item.every(number => typeof number === "number" && Number.isFinite(number));
  if (!value.entities.every(entity => plain(entity) && only(entity, ["id", "name", "parentId", "components", "position", "scale", "rotation"])
    && string(entity.id) && string(entity.name) && optional(entity, "parentId", string) && strings(entity.components, 32)
    && vector(entity.position) && vector(entity.scale) && vector(entity.rotation))) return false;
  if (!optional(value, "starterEntityIds", ids => strings(ids, 2) && new Set(ids).size === ids.length
    && ids.every(id => (id === "starter-floor" || id === "starter-box")
      && (value.entities as Record<string, unknown>[]).some(entity => entity.id === id)
      && !(value.attachedEntityIds as string[] | undefined)?.includes(id)))) return false;
  return optional(value, "conversation", turns => Array.isArray(turns) && turns.length <= 6 && turns.every(turn => plain(turn)
    && only(turn, ["prompt", "result"]) && string(turn.prompt) && string(turn.result)));
}
function validResources(value: unknown): boolean {
  if (!plain(value) || !only(value, resourceKeys)
    || !optional(value, "blenderAvailable", item => typeof item === "boolean")
    || !optional(value, "modelSource", item => item === "auto" || item === "blender" || item === "store")
    || !optional(value, "currentSettingsJson", string)) return false;
  const entries = (key: string, maximum: number, allowed: string[], required: string[]) => Array.isArray(value[key])
    && (value[key] as unknown[]).length <= maximum && (value[key] as unknown[]).every(item => plain(item) && only(item, allowed) && required.every(name => string(item[name])));
  if (!entries("projectAssets", 1024, ["id", "kind", "name", "skyboxMaterial", "attached", "propertiesJson"], ["id", "kind", "name"])
    || !entries("builtinCandidates", 128, ["candidateId", "providerId", "name", "description", "actions"], ["candidateId", "providerId", "name", "description"])
    || !entries("components", 4096, ["entityId", "componentId", "type", "definitionId", "propertiesJson", "enabled", "modelAssetId", "audio"], ["entityId", "componentId", "type"])) return false;
  if (!optional(value, "authoredScenes", scenes => Array.isArray(scenes) && scenes.length <= 100 && scenes.every(scene => plain(scene)
    && only(scene, ["entityId", "name", "source"]) && string(scene.entityId) && string(scene.name) && string(scene.source)))) return false;
  if (!optional(value, "authoredModels", models => Array.isArray(models) && models.length <= 100 && models.every(model => plain(model)
    && only(model, ["entityId", "modelAssetId", "revision"]) && string(model.entityId) && string(model.modelAssetId) && count(model.revision)))) return false;
  if (!optional(value, "componentDefinitions", definitions => Array.isArray(definitions) && definitions.length <= 1024 && definitions.every(definition => plain(definition)
    && only(definition, ["id", "label", "description", "fields", "fieldsFrom"]) && string(definition.id) && string(definition.label) && string(definition.description)
    && Array.isArray(definition.fields) && optional(definition, "fieldsFrom", string)))) return false;
  return optional(value, "sceneSettings", settings => plain(settings) && only(settings, ["skybox"]) && plain(settings.skybox)
    && only(settings.skybox, ["enabled", "iblEnabled", "imageAssetId", "materialAssetId", "rotationDegrees", "exposure"]));
}

/** Bounded archive boundary. The hash covers the exact limited authoring packet,
 * not credentials, rendered pixels or the native provider's complete wire body. */
export function normalizeChatgptHarnessContext(value: unknown): ChatgptHarnessContext {
  if (!plain(value) || !only(value, contextKeys) || value.version !== 1 || !Number.isSafeInteger(value.contractVersion)
    || (value.contractVersion as number) < 1 || (value.contractVersion as number) > contract.version
    || !digest(value.fingerprint) || !digest(value.sceneFingerprint) || !count(value.contextBytes) || value.contextBytes > 1024 * 1024
    || !validScene(value.scene) || !validResources(value.resources)) invalidContext();
  for (const [key, allowed] of [["omittedEntities", ["total", "included", "count"]], ["omittedSources", ["total", "included", "count", "bytes", "entityBudget", "sourceBudget"]]] as const) {
    const facts = value[key];
    if (!plain(facts) || !only(facts, [...allowed]) || !allowed.every(name => count(facts[name])) || facts.total !== (facts.included as number) + (facts.count as number)) invalidContext();
  }
  const entityFacts = value.omittedEntities as ChatgptHarnessContext["omittedEntities"], sourceFacts = value.omittedSources as ChatgptHarnessContext["omittedSources"];
  if (entityFacts.included !== (value.scene as ChatgptSceneContext).entities.length
    || sourceFacts.included !== ((value.resources as ChatgptResourceContext).authoredScenes?.length ?? 0)
    || sourceFacts.count !== sourceFacts.entityBudget + sourceFacts.sourceBudget) invalidContext();
  if (!validJson(value)) invalidContext();
  const detached = JSON.parse(canonical(value)) as Record<string, unknown>;
  const { fingerprint, contextBytes, ...content } = detached;
  const serialized = canonical(content);
  if (bytes(serialized) !== contextBytes || sha256Utf8(serialized) !== fingerprint) invalidContext();
  
  
  return freeze(detached as ChatgptHarnessContext);
}

/** Deterministic bytes used by the immutable local artifact store. */
export function serializeChatgptHarnessContext(packet: ChatgptHarnessContext): string {
  return canonical(normalizeChatgptHarnessContext(packet));
}

/** Shared save/inspection identity; does not collect catalogs or conversation. */
export function chatgptHarnessSceneFingerprint(bundle: PrototypeVisualProject): string {
  return sha256Utf8(canonical(JSON.parse(chatgptPlanningSnapshot(bundle))));
}

/** One synchronous observation supplies planning and inspection context. Exact
 * R3F originals retain their separate collector budget and are never clipped. */
export function buildChatgptHarnessContext(bundle: PrototypeVisualProject, options: ChatgptHarnessContextOptions = {}): ChatgptHarnessContext {
  const conversation = [...(options.conversation ?? [])];
  // Conversation is supplementary. Drop whole oldest turns before displacing
  // current authoring values; never summarize or truncate a code original.
  while (conversation.length && (conversation.length > 6 || bytes(JSON.stringify(conversation)) > 24 * 1024)) conversation.shift();
  const scene = collectChatgptSceneContext(bundle, options.selectedEntityId, conversation, options.attachedEntityIds);
  const resources: ChatgptResourceContext = {
    ...collectChatgptSceneResources(bundle, scene.entities.map(entity => entity.id), options.builtinCandidates ?? [], options.attachedMaterialIds),
    ...(options.blenderAvailable !== undefined ? { blenderAvailable: options.blenderAvailable } : {}),
    ...(options.modelSource !== undefined ? { modelSource: options.modelSource } : {}),
  };
  const includedEntities = new Set(scene.entities.map(entity => entity.id));
  const includedSources = new Set(resources.authoredScenes?.map(source => source.entityId) ?? []);
  const omittedSources = { total: 0, included: includedSources.size, count: 0, bytes: 0, entityBudget: 0, sourceBudget: 0 };
  for (const entity of Object.values(bundle.scene.entities)) {
    if (!isR3fSceneAuthoring(entity.codeAuthoring)) continue;
    omittedSources.total++;
    if (includedSources.has(entity.id)) continue;
    omittedSources.count++;
    omittedSources.bytes += bytes(entity.codeAuthoring.source);
    if (includedEntities.has(entity.id)) omittedSources.sourceBudget++;
    else omittedSources.entityBudget++;
  }
  const totalEntities = Object.keys(bundle.scene.entities).length;
  if (includedEntities.size < totalEntities || omittedSources.count) {
    const coverage = { totalEntities, includedEntities: includedEntities.size, omittedEntities: totalEntities - includedEntities.size,
      includedSourceCount: includedSources.size, omittedSourceCount: omittedSources.count, omittedSourceBytes: omittedSources.bytes };
    const turns = [...(scene.conversation ?? []), { prompt: "Studioが記録したコンテキストの範囲", result: JSON.stringify(coverage) }];
    // Send omission facts through the existing validated Scene context boundary.
    // The provider can distinguish an absent original from a complete Scene.
    while (turns.length > 1 && (turns.length > 6 || bytes(JSON.stringify(turns)) > 24 * 1024)) turns.shift();
    scene.conversation = turns;
  }
  const content = {
    version: 1 as const,
    contractVersion: contract.version,
    scene,
    resources,
    sceneFingerprint: chatgptHarnessSceneFingerprint(bundle),
    omittedEntities: { total: totalEntities, included: includedEntities.size, count: totalEntities - includedEntities.size },
    omittedSources,
  };
  // Detach before freezing: catalogs, conversation and Material arrays may be
  // shared with the live Editor or the caller's next request.
  const detached = structuredClone(content);
  const serialized = canonical(detached);
  return freeze({ ...detached, fingerprint: sha256Utf8(serialized), contextBytes: bytes(serialized) });
}

export function chatgptHarnessContextSummary(packet: ChatgptHarnessContext): ChatgptHarnessContextSummary {
  return freeze({
    fingerprint: packet.fingerprint,
    sceneFingerprint: packet.sceneFingerprint,
    contextBytes: packet.contextBytes,
    contractVersion: packet.contractVersion,
    entityCount: packet.omittedEntities.total,
    includedEntityCount: packet.omittedEntities.included,
    omittedEntityCount: packet.omittedEntities.count,
    sourceHashes: (packet.resources.authoredScenes ?? []).map(source => ({ entityId: source.entityId, sha256: sha256Utf8(source.source), bytes: bytes(source.source) })),
    omittedSourceCount: packet.omittedSources.count,
    omittedSourceBytes: packet.omittedSources.bytes,
    resourceCounts: { components: packet.resources.components.length, projectAssets: packet.resources.projectAssets.length, builtinCandidates: packet.resources.builtinCandidates.length },
  });
}
