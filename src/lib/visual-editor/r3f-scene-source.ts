import { sha256Utf8 } from "./compiler/hash";

/** Persisted authoring data; generated TSX is parsed, never executed. */
export type R3fSceneAuthoring = {
  version: 1;
  source: string;
  originalPrompt: string;
  revision: number;
  nodes: Record<string, { entityId: string; baseline: string; identityKey?: string }>;
  materials: Record<string, string>;
};

export const R3F_SOURCE_MAX_BYTES = 48_000;
export const R3F_SCENE_MAX_NODES = 1024;
export const r3fManagedEntityId = (rootId: string, key: string) => `${rootId}-r3f-${sha256Utf8(key).slice(0, 20)}`;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
// Prefab cloning namespaces normal document IDs with '/entity/' and
// '/component/'. These are document references, never filesystem paths.
const validId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_./:-]{1,1024}$/u.test(value);
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
function jsonRecord(value: unknown, max: number): boolean {
  if (typeof value !== "string" || value.length > max) return false;
  try { return record(JSON.parse(value)); } catch { return false; }
}

export function isR3fSceneAuthoring(value: unknown): value is R3fSceneAuthoring {
  if (!record(value) || Object.keys(value).some(key => !["version", "source", "originalPrompt", "revision", "nodes", "materials"].includes(key))
    || value.version !== 1 || typeof value.source !== "string" || !value.source.trim() || bytes(value.source) > R3F_SOURCE_MAX_BYTES
    || typeof value.originalPrompt !== "string" || [...value.originalPrompt].length > 2000
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 || !record(value.nodes) || !record(value.materials)
    || Object.keys(value.nodes).length > R3F_SCENE_MAX_NODES || Object.keys(value.materials).length > R3F_SCENE_MAX_NODES) return false;
  const ids = new Set<string>(), identities = new Set<string>();
  for (const [key, node] of Object.entries(value.nodes)) {
    if (!key || key.length > 2048 || /[\u0000-\u001f\u007f]/u.test(key) || !record(node)
      || Object.keys(node).some(key => !["entityId", "baseline", "identityKey"].includes(key)) || !validId(node.entityId) || ids.has(node.entityId)
      || node.identityKey !== undefined && (typeof node.identityKey !== "string" || !node.identityKey || node.identityKey.length > 2048
        || /[\u0000-\u001f\u007f]/u.test(node.identityKey) || node.identityKey === "$xrift-geometry" || identities.has(node.identityKey))
      || !jsonRecord(node.baseline, 80_000)) return false;
    const baseline = JSON.parse(node.baseline as string) as Record<string, unknown>;
    if (baseline.id !== node.entityId || !Array.isArray(baseline.components) || !Array.isArray(baseline.children) || "codeAuthoring" in baseline) return false;
    ids.add(node.entityId);
    if (typeof node.identityKey === "string") identities.add(node.identityKey);
  }
  return Object.entries(value.materials).every(([id, baseline]) => validId(id) && jsonRecord(baseline, 80_000)) && bytes(JSON.stringify(value)) <= 2_000_000;
}

/** Remap a copied original along with its generated nodes. References to a
 * deliberately deleted generated node stay absent in the copied Scene too. */
export function remapR3fSceneAuthoring(value: R3fSceneAuthoring, rootId: string,
  entityIds: ReadonlyMap<string, string>, componentIds: ReadonlyMap<string, string>,
  materialIds: ReadonlyMap<string, string> = new Map(),
  assets?: Record<string, { folderId?: string | null; source: unknown }>): R3fSceneAuthoring {
  const replacements = new Map([...entityIds, ...materialIds]);
  for (const [key, node] of Object.entries(value.nodes)) replacements.set(node.entityId, r3fManagedEntityId(rootId, key));
  const rewrite = (input: unknown): unknown => typeof input === "string" ? replacements.get(input) ?? input : Array.isArray(input)
    ? input.map(rewrite) : record(input) ? Object.fromEntries(Object.entries(input).map(([key, item]) => [key, rewrite(item)])) : input;
  const nodes: R3fSceneAuthoring["nodes"] = {};
  for (const [key, node] of Object.entries(value.nodes)) {
    const baseline = JSON.parse(node.baseline) as { id: string; components: { id: string; type: string }[] };
    const mapped = rewrite(baseline) as typeof baseline;
    const counts = new Map<string, number>();
    mapped.components = mapped.components.map((component, index) => {
      const ordinal = counts.get(component.type) ?? 0; counts.set(component.type, ordinal + 1);
      return { ...component, id: componentIds.get(`${node.entityId}/${baseline.components[index].id}`) ?? `${mapped.id}-${component.type}-${ordinal}` };
    });
    nodes[key] = { ...node, entityId: mapped.id, baseline: JSON.stringify(mapped) };
  }
  const materials: Record<string, string> = {};
  for (const [id, json] of Object.entries(value.materials)) {
    const mappedId = materialIds.get(id) ?? id;
    const baseline = rewrite(JSON.parse(json)) as Record<string, unknown>;
    if (assets?.[mappedId]) { baseline.folderId = assets[mappedId].folderId; baseline.source = assets[mappedId].source; }
    materials[mappedId] = JSON.stringify({ ...baseline, id: mappedId });
  }
  return { ...value, nodes, materials };
}
