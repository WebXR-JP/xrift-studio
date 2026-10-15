export type ChatgptEntityReference = { id: string; name: string; parentId?: string | null };
export const CHATGPT_MAX_MATERIAL_ATTACHMENTS = 16;

/** Roots first, then all descendants, once each, even with overlapping roots. */
export function chatgptAttachmentEntityIds(entities: readonly ChatgptEntityReference[], roots: readonly string[]): string[] {
  if (!roots.length) return [];
  const existing = new Set(entities.map(entity => entity.id));
  const children = new Map<string, string[]>();
  for (const entity of entities) if (entity.parentId) {
    const list = children.get(entity.parentId) ?? [];
    list.push(entity.id); children.set(entity.parentId, list);
  }
  const result = [...new Set(roots.filter(id => existing.has(id)))], seen = new Set(result);
  for (let index = 0; index < result.length; index++) for (const id of children.get(result[index]) ?? []) {
    if (!seen.has(id)) { seen.add(id); result.push(id); }
  }
  return result;
}
